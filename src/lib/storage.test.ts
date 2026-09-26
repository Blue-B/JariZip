import { describe, expect, it } from 'vitest';
import {
  META_KEY,
  QUARANTINE_KEY,
  REVISION_KEY,
  RECOVERY_KEY_PREFIX,
  WORKSPACE_KEY,
  advanceSavedRevision,
  createLivePageId,
  decideCommit,
  isRecoveryDraft,
  normalizeRevision,
  recoveryDraftKey,
  recoveryDraftNotice,
} from './storage';

/**
 * These guard the cross-tab lost-update fix at the decision level. The real
 * atomicity guarantee (single IndexedDB readwrite transaction) is exercised in
 * tests/e2e/storage-concurrency.spec.ts against the built app.
 */
describe('storage keys stay backward compatible', () => {
  it('keeps the original raw workspace key and shape', () => {
    // Old backups, the e2e seed fixture and validateBackup all depend on this.
    expect(WORKSPACE_KEY).toBe('jarizip:workspace:v1');
    expect(META_KEY).toBe('jarizip:meta:v1');
    expect(QUARANTINE_KEY).toBe('jarizip:quarantine:v1');
  });

  it('stores the revision in a separate key so the workspace payload is raw', () => {
    expect(REVISION_KEY).not.toBe(WORKSPACE_KEY);
    expect(REVISION_KEY).toMatch(/revision/);
  });
});

describe('normalizeRevision', () => {
  it('accepts finite non-negative numbers', () => {
    expect(normalizeRevision(0)).toBe(0);
    expect(normalizeRevision(7)).toBe(7);
    expect(normalizeRevision(3.9)).toBe(3);
  });

  it('treats missing or invalid revisions as 0 so old records still load', () => {
    expect(normalizeRevision(undefined)).toBe(0);
    expect(normalizeRevision(null)).toBe(0);
    expect(normalizeRevision(-1)).toBe(0);
    expect(normalizeRevision(Number.NaN)).toBe(0);
    expect(normalizeRevision(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeRevision('4')).toBe(0);
  });
});

describe('advanceSavedRevision', () => {
  it('only credits the snapshot revision captured before the await', () => {
    // A commit captured revision 3; a later edit made revision 4 while the
    // transaction was in flight must NOT be reported as saved.
    expect(advanceSavedRevision(0, 3)).toBe(3);
    expect(advanceSavedRevision(3, 4)).toBe(4);
  });

  it('never moves backwards when an older snapshot commits later', () => {
    expect(advanceSavedRevision(9, 4)).toBe(9);
    expect(advanceSavedRevision(5, 5)).toBe(5);
  });

  it('treats invalid input as zero', () => {
    expect(advanceSavedRevision(Number.NaN, 2)).toBe(2);
    expect(advanceSavedRevision(2, undefined as unknown as number)).toBe(2);
  });
});

describe('decideCommit', () => {
  it('writes and bumps the revision when the base revision is current', () => {
    expect(decideCommit(0, undefined)).toEqual({ type: 'write', revision: 1 });
    expect(decideCommit(0, 0)).toEqual({ type: 'write', revision: 1 });
    expect(decideCommit(4, 4)).toEqual({ type: 'write', revision: 5 });
  });

  it('rejects a stale write instead of overwriting a newer revision', () => {
    expect(decideCommit(3, 4)).toEqual({ type: 'conflict', revision: 4 });
    expect(decideCommit(0, 9)).toEqual({ type: 'conflict', revision: 9 });
  });

  it('never reports a write for a conflict, so no lost update is possible', () => {
    const stale = decideCommit(2, 5);
    expect(stale.type).toBe('conflict');
  });
});

describe('recoveryDraftNotice', () => {
  it('says the draft was kept only when it actually persisted', () => {
    expect(recoveryDraftNotice(true)).toMatch(/초안으로 보관/);
    expect(recoveryDraftNotice(true)).not.toMatch(/보관하지 못했/);
  });

  it('tells the user to export when the draft write failed', () => {
    const message = recoveryDraftNotice(false);
    expect(message).toMatch(/보관하지 못했/);
    expect(message).toMatch(/백업/);
    expect(message).not.toMatch(/초안으로 보관했어요/);
  });
});

describe('live page identity', () => {
  it('creates unpredictable ids that must not be reused as a copied tab id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createLivePageId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.length).toBeGreaterThan(8);
  });

  it('scopes draft keys to the live page id', () => {
    expect(recoveryDraftKey('page-a')).toBe(`${RECOVERY_KEY_PREFIX}page-a`);
    expect(recoveryDraftKey('page-a')).not.toBe(recoveryDraftKey('page-b'));
  });
});

describe('recovery draft validation', () => {
  it('recognizes only well-formed drafts', () => {
    expect(isRecoveryDraft({ savedAt: 'now', state: { schemaVersion: 1 } })).toBe(true);
    expect(isRecoveryDraft({ savedAt: 'now' })).toBe(false);
    expect(isRecoveryDraft({ state: {} })).toBe(false);
    expect(isRecoveryDraft(null)).toBe(false);
    expect(isRecoveryDraft('draft')).toBe(false);
  });
});
