import { describe, expect, it } from 'vitest';
import { MAX_BACKUP_BYTES, buildBackupJson, exportBackup, prepareBackupBlob, readBackupFile } from './files';
import { createEmptyState } from './seed';

function documents(count: number, text: string) {
  const state = createEmptyState();
  state.documents = Array.from({ length: count }, (_, index) => ({
    id: `backup-test-${index}`, groupId: `backup-group-${index}`, title: '백업 용량 자동시험 문서',
    kind: '이력서' as const, version: 1, text, createdAt: '2026-01-01T00:00:00Z', isDemo: false,
  }));
  return state;
}

describe('backup export and import use the same byte limit', () => {
  it('does not create a download that this app cannot import, including multibyte Korean text', async () => {
    const state = documents(36, '가'.repeat(400_000));
    // These were individually valid documents whose combined export exceeded
    // the importer limit; JS character count alone misses this case.
    const json = buildBackupJson(state);
    const oldPayload = new File([json], 'oversized.json', { type: 'application/json' });
    expect(json.length).toBeLessThan(MAX_BACKUP_BYTES);
    expect(oldPayload.size).toBeGreaterThan(MAX_BACKUP_BYTES);
    await expect(readBackupFile(oldPayload)).rejects.toThrow(/40MB/);
    expect(() => prepareBackupBlob(state)).toThrow(/40MB/);
    expect(() => exportBackup(state)).toThrow(/저장된 자료는 그대로/);
    expect(state.documents).toHaveLength(36);
    expect(state.documents[0].text).toHaveLength(400_000);
  });

  it('restores an exported backup near the limit byte-for-byte in its document data', async () => {
    const state = documents(34, '가'.repeat(400_000));
    const blob = prepareBackupBlob(state);
    expect(blob.size).toBeGreaterThan(MAX_BACKUP_BYTES * 0.95);
    expect(blob.size).toBeLessThanOrEqual(MAX_BACKUP_BYTES);
    const restored = await readBackupFile(new File([blob], 'near-limit.json', { type: blob.type }));
    expect(restored).toEqual(state);
  });

  it('still exports originals and rejects malformed data before downloading', async () => {
    const state = documents(1, '원본 보관');
    Object.assign(state.documents[0], { fileData: 'data:text/plain;base64,aGVsbG8=', fileName: 'original.txt', mime: 'text/plain' });
    const blob = prepareBackupBlob(state);
    const restored = await readBackupFile(new File([blob], 'with-original.json'));
    expect(restored).toEqual(state);
    expect(() => prepareBackupBlob({ ...state, jobs: null } as never)).toThrow();
  });
});
