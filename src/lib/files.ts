import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, id, validateBackup } from './domain';
import type { DocumentKind, DocumentRecord, WorkspaceState } from './types';

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

export const MAX_DOCUMENT_BYTES = 6 * 1024 * 1024; // 6 MB
export const MAX_BACKUP_BYTES = 40 * 1024 * 1024; // 40 MB
const MAX_EXTRACTED_CHARS = 400_000;
const MAX_PDF_PAGES = 60;

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown']);
const SUPPORTED_HINT =
  'PDF, DOCX, TXT, MD 파일만 올릴 수 있습니다. (HTML, 이미지, 스캔 문서는 지원하지 않습니다.)';

/* -------------------------------------------------------------------------- */
/* Binary helpers                                                             */
/* -------------------------------------------------------------------------- */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  if (typeof btoa === 'function') return btoa(binary);
  // Node fallback (older runtimes without global btoa).
  return Buffer.from(bytes).toString('base64');
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  const safeMime = mime && /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : 'application/octet-stream';
  return `data:${safeMime};base64,${bytesToBase64(bytes)}`;
}

function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : '';
}

function titleFromFileName(fileName: string): string {
  const withoutPath = fileName.split(/[\\/]/).pop() ?? fileName;
  const withoutExtension = withoutPath.replace(/\.[A-Za-z0-9]+$/, '');
  const trimmed = withoutExtension.trim();
  // Keep the stored title within the schema limit even for very long names.
  return trimmed.slice(0, 200) || '제목 없는 문서';
}

function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_EXTRACTED_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_EXTRACTED_CHARS), truncated: true };
}

function failureNote(kind: 'pdf' | 'docx', error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const label = kind === 'pdf' ? 'PDF' : 'DOCX';
  return `${label} 텍스트를 추출하지 못했습니다. 원본 파일은 그대로 보관했습니다. (${detail.slice(0, 200)})`;
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                 */
/* -------------------------------------------------------------------------- */

async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  const isBrowser =
    typeof window !== 'undefined' && typeof document !== 'undefined';

  if (isBrowser) {
    const pdfjs = await import('pdfjs-dist');
    try {
      // Vite rewrites this to the emitted worker asset URL.
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')) as {
        default: string;
      };
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    } catch {
      // Without a worker pdf.js falls back to the main thread.
    }
    return pdfjs;
  }

  // Node (vitest/SSR): the legacy build runs extraction on the main thread.
  return import(/* @vite-ignore */ 'pdfjs-dist/legacy/build/pdf.mjs');
}

async function extractPdf(arrayBuffer: ArrayBuffer): Promise<{ text: string; note?: string }> {
  // Lazy load so the ~1MB pdf.js bundle never ships with the main chunk.
  const pdfjs = await loadPdfjs();

  const document = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pageCount = Math.min(document.numPages, MAX_PDF_PAGES);
  const parts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (pageText) parts.push(pageText);
  }

  const { text, truncated } = truncateText(parts.join('\n\n').trim());
  const notes: string[] = [];
  if (!text) {
    notes.push(
      '스캔 이미지 PDF로 보입니다. OCR을 지원하지 않아 텍스트를 추출하지 못했고, 원본만 보관했습니다.',
    );
  }
  if (document.numPages > MAX_PDF_PAGES) {
    notes.push(`앞 ${MAX_PDF_PAGES}쪽까지만 추출했습니다. (전체 ${document.numPages}쪽)`);
  }
  if (truncated) notes.push('추출한 텍스트가 너무 길어 일부만 저장했습니다.');

  return { text, note: notes.length > 0 ? notes.join(' ') : undefined };
}

async function extractDocx(arrayBuffer: ArrayBuffer): Promise<{ text: string; note?: string }> {
  const mammoth = await import('mammoth');
  // The browser build reads `arrayBuffer`; the Node build reads `buffer`.
  const input =
    typeof Buffer !== 'undefined'
      ? { buffer: Buffer.from(arrayBuffer) }
      : { arrayBuffer };
  const result = await mammoth.extractRawText(input);
  const { text, truncated } = truncateText(
    String(result?.value ?? '').replace(/\r\n/g, '\n').trim(),
  );
  const notes: string[] = [];
  if (!text) {
    notes.push('DOCX에서 텍스트를 찾지 못했습니다. 원본 파일은 그대로 보관했습니다.');
  }
  if (truncated) notes.push('추출한 텍스트가 너무 길어 일부만 저장했습니다.');
  return { text, note: notes.length > 0 ? notes.join(' ') : undefined };
}

/* -------------------------------------------------------------------------- */
/* readDocumentFile                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Reads a user-selected file into a DocumentRecord.
 * PDF/DOCX text is extracted lazily; TXT/MD is read directly. The exact
 * original bytes are always stored as a data URL so backups include originals.
 * HTML is never rendered and OCR is never attempted.
 */
export async function readDocumentFile(
  file: File,
  kind: DocumentKind,
): Promise<DocumentRecord> {
  if (!file) throw new Error('파일을 선택해 주세요.');
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('파일이 너무 큽니다. 6MB 이하 파일만 올릴 수 있습니다.');
  }
  if (file.size === 0) {
    throw new Error('빈 파일은 올릴 수 없습니다.');
  }

  const fileName = file.name || '업로드한 문서';
  const extension = extensionOf(fileName);
  const mime = file.type || '';
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const fileData = toDataUrl(bytes, mime);

  let text = '';
  let extractionNote: string | undefined;
  let storedMime = mime;

  if (extension === 'pdf' || mime === 'application/pdf') {
    storedMime = mime || 'application/pdf';
    try {
      const result = await extractPdf(arrayBuffer);
      text = result.text;
      extractionNote = result.note;
    } catch (error) {
      text = '';
      extractionNote = failureNote('pdf', error);
    }
  } else if (
    extension === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    storedMime =
      mime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    try {
      const result = await extractDocx(arrayBuffer);
      text = result.text;
      extractionNote = result.note;
    } catch (error) {
      text = '';
      extractionNote = failureNote('docx', error);
    }
  } else if (extension === 'doc') {
    throw new Error('예전 .doc 형식은 지원하지 않습니다. .docx로 저장한 뒤 올려 주세요.');
  } else if (TEXT_EXTENSIONS.has(extension) || mime.startsWith('text/')) {
    if (mime === 'text/html' || extension === 'html' || extension === 'htm') {
      // HTML is intentionally treated as plain text and never rendered.
      text = new TextDecoder('utf-8').decode(bytes);
      storedMime = mime || 'text/plain';
      extractionNote = 'HTML 파일은 서식 없이 텍스트로만 저장했습니다.';
    } else {
      text = new TextDecoder('utf-8').decode(bytes);
      storedMime = mime || 'text/plain';
    }
    const truncated = truncateText(text);
    text = truncated.text;
    if (truncated.truncated) {
      extractionNote = extractionNote
        ? `${extractionNote} 문서가 너무 길어 일부만 저장했습니다.`
        : '문서가 너무 길어 일부만 저장했습니다.';
    }
  } else {
    throw new Error(SUPPORTED_HINT);
  }

  return {
    id: id(),
    groupId: id(),
    title: titleFromFileName(fileName),
    kind,
    version: 1,
    text: text.trim(),
    createdAt: new Date().toISOString(),
    isDemo: false,
    fileName,
    fileData,
    mime: storedMime,
    ...(extractionNote ? { extractionNote } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Download                                                                   */
/* -------------------------------------------------------------------------- */

function triggerDownload(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return; // Non-browser environment (tests): nothing to download.
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFileName(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return cleaned.slice(0, 180) || 'document';
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]*);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  try {
    const mime = match[1] || 'application/octet-stream';
    const binary = typeof atob === 'function'
      ? atob(match[2])
      : Buffer.from(match[2], 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/** Downloads the stored original when available, otherwise the text version. */
export function downloadDocument(doc: DocumentRecord): void {
  if (doc.fileData) {
    const blob = dataUrlToBlob(doc.fileData);
    if (blob) {
      triggerDownload(blob, safeFileName(doc.fileName || `${doc.title}.bin`));
      return;
    }
  }
  const textBlob = new Blob([doc.text || ''], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(textBlob, safeFileName(doc.fileName || `${doc.title}.md`));
}

/* -------------------------------------------------------------------------- */
/* Backup                                                                     */
/* -------------------------------------------------------------------------- */

/** Serializes a workspace (including document originals) to a JSON string. */
export function buildBackupJson(state: WorkspaceState): string {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      state,
    },
    null,
    2,
  );
}

/** Returns `jarizip-backup-YYYY-MM-DD.json`. */
export function backupFileName(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `jarizip-backup-${year}-${month}-${day}.json`;
}

/** Validates and downloads a full backup, including document originals. */
export function exportBackup(state: WorkspaceState): void {
  const validated = validateBackup(state);
  const json = buildBackupJson(validated);
  triggerDownload(
    new Blob([json], { type: 'application/json;charset=utf-8' }),
    backupFileName(),
  );
}

function decodeTextFile(
  file: File,
  buffer: ArrayBuffer,
): string {
  if (typeof TextDecoder === 'function') {
    return new TextDecoder('utf-8').decode(buffer);
  }
  return String(buffer);
}

/**
 * Reads and validates a backup file (40MB cap). Throws a readable Korean Error
 * for oversized, unreadable, or invalid payloads.
 */
export async function readBackupFile(file: File): Promise<WorkspaceState> {
  if (!file) throw new Error('백업 파일을 선택해 주세요.');
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error('백업 파일이 너무 큽니다. 40MB 이하 파일만 가져올 수 있습니다.');
  }

  const buffer = await file.arrayBuffer();
  const text = decodeTextFile(file, buffer);
  if (!text.trim()) throw new Error('백업 파일이 비어 있습니다.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('백업 파일을 읽을 수 없습니다. JSON 형식이 올바르지 않습니다.');
  }

  return validateBackup(parsed);
}
