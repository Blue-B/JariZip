import { describe, expect, it } from 'vitest';
import {
  MAX_BACKUP_BYTES,
  MAX_DOCUMENT_BYTES,
  backupFileName,
  buildBackupJson,
  downloadDocument,
  exportBackup,
  readBackupFile,
  readDocumentFile,
} from './files';
import { safeUrl, validateBackup } from './domain';
import { createDemoState, createEmptyState } from './seed';
import type { DocumentRecord } from './types';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function makeFile(content: BlobPart | Uint8Array, name: string, type = ''): File {
  return new File([content as BlobPart], name, { type });
}

/** Builds a minimal, valid one-page PDF so extraction is exercised for real. */
function minimalPdf(text: string): Uint8Array {
  const stream = text ? `BT /F1 18 Tf 72 720 Td (${text}) Tj ET` : '';
  const objects: Record<number, string> = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    4: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    5: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  };

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let index = 1; index <= 5; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (let index = 1; index <= 5; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const encoded = Buffer.from(pdf, 'latin1');
  const bytes = new Uint8Array(encoded.length);
  bytes.set(encoded);
  return bytes;
}

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function makeZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, entry.data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);

    offset += local.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const joined = Buffer.concat([...localParts, ...centralParts, end]);
  const bytes = new Uint8Array(joined.length);
  bytes.set(joined);
  return bytes;
}

/** Builds a minimal, valid DOCX containing one text run. */
function minimalDocx(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const document_ =
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
  const contentTypes =
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;
  const relationships =
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  return makeZip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(relationships) },
    { name: 'word/document.xml', data: encoder.encode(document_) },
  ]);
}

/* -------------------------------------------------------------------------- */
/* readDocumentFile                                                           */
/* -------------------------------------------------------------------------- */

describe('readDocumentFile text formats', () => {
  it('reads a TXT file and keeps the exact original as a data URL', async () => {
    const content = '가상의 이력서 텍스트입니다. Python, SQL 경험.';
    const file = makeFile(content, 'sample.txt', 'text/plain');
    const record = await readDocumentFile(file, '이력서');

    expect(record.kind).toBe('이력서');
    expect(record.version).toBe(1);
    expect(record.isDemo).toBe(false);
    expect(record.title).toBe('sample');
    expect(record.text).toContain('가상의 이력서');
    expect(record.fileData?.startsWith('data:text/plain;base64,')).toBe(true);
    expect(record.fileName).toBe('sample.txt');
    // The base64 payload must round-trip back to the original bytes.
    const base64 = record.fileData!.split(',')[1];
    expect(Buffer.from(base64, 'base64').toString('utf-8')).toBe(content);
  });

  it('keeps a very long filename within the schema title limit', async () => {
    const record = await readDocumentFile(
      makeFile('x', `${'가'.repeat(400)}.txt`, 'text/plain'),
      '이력서',
    );
    expect(record.title.length).toBeLessThanOrEqual(200);
    expect(record.fileName!.length).toBeLessThanOrEqual(512);
  });

  it('reads a Markdown file', async () => {
    const record = await readDocumentFile(makeFile('# 제목\n본문', 'note.md'), '자기소개서');
    expect(record.text).toContain('# 제목');
    expect(record.kind).toBe('자기소개서');
  });

  it('never renders HTML, treating it as plain text', async () => {
    const html = '<script>alert(1)</script><b>본문</b>';
    const record = await readDocumentFile(makeFile(html, 'x.html', 'text/html'), '이력서');
    expect(record.text).toBe(html);
    expect(record.extractionNote).toMatch(/서식 없이/);
  });

  it('generates unique ids and groups', async () => {
    const first = await readDocumentFile(makeFile('a', 'a.txt'), '이력서');
    const second = await readDocumentFile(makeFile('b', 'b.txt'), '이력서');
    expect(first.id).not.toBe(second.id);
    expect(first.groupId).not.toBe(second.groupId);
  });
});

describe('readDocumentFile limits and failures', () => {
  it('rejects files larger than 6MB', async () => {
    const big = makeFile(new Uint8Array(MAX_DOCUMENT_BYTES + 1), 'big.txt', 'text/plain');
    await expect(readDocumentFile(big, '이력서')).rejects.toThrow(/6MB/);
  });

  it('rejects empty files', async () => {
    await expect(readDocumentFile(makeFile('', 'empty.txt'), '이력서')).rejects.toThrow(/빈 파일/);
  });

  it('rejects unsupported extensions with an honest message', async () => {
    await expect(
      readDocumentFile(makeFile('x', 'image.png', 'image/png'), '포트폴리오'),
    ).rejects.toThrow(/PDF, DOCX, TXT, MD/);
  });

  it('rejects legacy .doc files', async () => {
    await expect(readDocumentFile(makeFile('x', 'old.doc'), '이력서')).rejects.toThrow(/docx/);
  });

  it('extracts real text from a small valid PDF and keeps the original', async () => {
    const file = makeFile(minimalPdf('Hello JariZip sample resume'), 'ok.pdf', 'application/pdf');
    const record = await readDocumentFile(file, '이력서');
    expect(record.text).toContain('Hello JariZip sample resume');
    expect(record.fileData?.startsWith('data:application/pdf;base64,')).toBe(true);
  });

  it('marks a scanned/textless PDF honestly instead of inventing text', async () => {
    const file = makeFile(minimalPdf(''), 'scanned.pdf', 'application/pdf');
    const record = await readDocumentFile(file, '이력서');
    expect(record.text).toBe('');
    expect(record.extractionNote).toMatch(/스캔|추출/);
    expect(record.fileData?.startsWith('data:application/pdf;base64,')).toBe(true);
  });

  it('keeps the original and reports honestly when a PDF cannot be parsed', async () => {
    const file = makeFile('this is not a real pdf', 'broken.pdf', 'application/pdf');
    const record = await readDocumentFile(file, '이력서');

    expect(record.fileData?.startsWith('data:application/pdf;base64,')).toBe(true);
    if (!record.text) {
      expect(record.extractionNote).toBeTruthy();
      expect(record.extractionNote).toMatch(/원본 파일은 그대로 보관/);
    }
  });

  it('extracts real text from a valid DOCX and keeps the original', async () => {
    const file = makeFile(
      minimalDocx('안녕하세요 JariZip DOCX 텍스트입니다.'),
      'sample.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const record = await readDocumentFile(file, '자기소개서');
    expect(record.text).toContain('JariZip DOCX');
    expect(record.fileData?.startsWith('data:application/vnd')).toBe(true);
  });

  it('keeps the original and reports honestly when a DOCX cannot be parsed', async () => {
    const file = makeFile(
      'not a real docx',
      'broken.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const record = await readDocumentFile(file, '이력서');
    expect(record.fileData?.startsWith('data:application/vnd')).toBe(true);
    if (!record.text) {
      expect(record.extractionNote).toMatch(/원본 파일은 그대로 보관/);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* downloadDocument / exportBackup                                            */
/* -------------------------------------------------------------------------- */

describe('downloads', () => {
  it('does not throw for a document with or without an original', () => {
    const withOriginal: DocumentRecord = {
      id: 'd1',
      groupId: 'g1',
      title: '문서',
      kind: '이력서',
      version: 1,
      text: '내용',
      createdAt: new Date().toISOString(),
      isDemo: false,
      fileName: 'a.txt',
      fileData: 'data:text/plain;base64,7JWE',
      mime: 'text/plain',
    };
    const textOnly: DocumentRecord = { ...withOriginal, id: 'd2', fileData: undefined, fileName: undefined };
    expect(() => downloadDocument(withOriginal)).not.toThrow();
    expect(() => downloadDocument(textOnly)).not.toThrow();
  });

  it('does not throw when exporting a valid backup', () => {
    expect(() => exportBackup(createDemoState())).not.toThrow();
    expect(() => exportBackup(createEmptyState())).not.toThrow();
  });

  it('rejects exporting an invalid state instead of writing bad data', () => {
    const broken = { ...createEmptyState(), jobs: 'nope' } as unknown as ReturnType<typeof createEmptyState>;
    expect(() => exportBackup(broken)).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Backup format                                                              */
/* -------------------------------------------------------------------------- */

describe('backup serialization', () => {
  it('uses the jarizip-backup-YYYY-MM-DD.json name', () => {
    expect(backupFileName(new Date(2025, 2, 7))).toBe('jarizip-backup-2025-03-07.json');
  });

  it('includes document originals in the JSON payload', () => {
    const state = createEmptyState();
    state.documents = [
      {
        id: 'doc-original',
        groupId: 'group-original',
        title: '원본 보관 문서',
        kind: '이력서',
        version: 1,
        text: '텍스트',
        createdAt: new Date().toISOString(),
        isDemo: false,
        fileName: 'original.txt',
        fileData: 'data:text/plain;base64,b3JpZ2luYWw=',
        mime: 'text/plain',
      },
    ];
    const json = buildBackupJson(state);
    expect(json).toContain('"format": "jarizip-backup"');
    expect(json).toContain('data:text/plain;base64,b3JpZ2luYWw=');
    expect(json).toContain('original.txt');
  });

  it('round-trips a full backup without losing record counts', () => {
    const original = createDemoState();
    const json = buildBackupJson(original);
    const restored = validateBackup(JSON.parse(json));

    expect(restored.jobs).toHaveLength(original.jobs.length);
    expect(restored.documents).toHaveLength(original.documents.length);
    expect(restored.applications).toHaveLength(original.applications.length);
    expect(restored.practice).toHaveLength(original.practice.length);
    expect(restored.profile).toEqual(original.profile);
    expect(restored.companyNotes).toEqual(original.companyNotes);
    expect(restored).toEqual(original);
  });
});

/* -------------------------------------------------------------------------- */
/* readBackupFile                                                             */
/* -------------------------------------------------------------------------- */

describe('readBackupFile', () => {
  it('reads and validates a well-formed backup file', async () => {
    const original = createDemoState();
    const file = makeFile(buildBackupJson(original), 'jarizip-backup.json', 'application/json');
    const restored = await readBackupFile(file);
    expect(restored.jobs).toHaveLength(9);
    expect(restored.demo).toBe(true);
  });

  it('rejects files over the 40MB cap', async () => {
    const huge = makeFile(new Uint8Array(MAX_BACKUP_BYTES + 1), 'huge.json');
    await expect(readBackupFile(huge)).rejects.toThrow(/40MB/);
  });

  it('rejects empty, non-JSON, and malformed files', async () => {
    await expect(readBackupFile(makeFile('', 'empty.json'))).rejects.toThrow(/비어/);
    await expect(readBackupFile(makeFile('not json', 'x.json'))).rejects.toThrow(/JSON/);
    await expect(readBackupFile(makeFile('{"a":1}', 'x.json'))).rejects.toThrow(/형식이 올바르지 않습니다/);
  });

  it('rejects a malicious backup with prototype keys', async () => {
    const payload =
      '{"format":"jarizip-backup","state":{"schemaVersion":1,"jobs":[],"documents":[],"applications":[],"practice":[],"profile":{"name":"x","role":"","skills":[],"locations":[],"excludeKeywords":[],"weeklyGoal":3},"companyNotes":{},"demo":false,"__proto__":{"x":1}}}';
    const file = makeFile(payload, 'evil.json', 'application/json');
    await expect(readBackupFile(file)).rejects.toThrow(/허용되지 않는 키/);
  });

  it('rejects a backup whose job URL is unsafe', async () => {
    const state = createEmptyState();
    state.jobs = [
      {
        id: 'job-evil',
        company: '가상',
        title: '제목',
        role: '역할',
        location: '서울',
        experience: '무관',
        employment: '정규직',
        salary: '협의',
        skills: ['Python'],
        publishedAt: '2025-01-01',
        deadline: '2025-02-01',
        status: 'open',
        verification: 'unverified',
        verifiedAt: '',
        sourceUrl: 'javascript:alert(1)',
        source: '가상',
        description: '',
        requirements: '',
        benefits: '',
        companyInfo: '',
        saved: false,
        isDemo: false,
        color: 'blue',
      },
    ];
    const file = makeFile(buildBackupJson(state), 'unsafe.json', 'application/json');
    await expect(readBackupFile(file)).rejects.toThrow(/형식이 올바르지 않습니다/);
    expect(safeUrl('javascript:alert(1)')).toBeNull();
  });
});
