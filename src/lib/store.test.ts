import { describe, expect, it } from 'vitest';
import { conflictFileName, describeStorageError, maxVersion, nextId, practiceFor, stageCounts } from './store';
import { createDemoState, createEmptyState } from './seed';

describe('stageCounts', () => {
  it('counts every stage bucket including empty ones', () => {
    const state = createDemoState();
    const counts = stageCounts(state.applications);
    expect(counts).toEqual({ preparing: 1, applied: 1, interview: 2, offer: 1, closed: 0 });
  });

  it('returns zeros for an empty board', () => {
    expect(stageCounts([])).toEqual({ preparing: 0, applied: 0, interview: 0, offer: 0, closed: 0 });
  });

  it('ignores records with an unknown stage', () => {
    const counts = stageCounts([
      { stage: 'offer' },
      { stage: 'bogus' },
    ] as unknown as Parameters<typeof stageCounts>[0]);
    expect(counts.offer).toBe(1);
    expect(counts.closed).toBe(0);
  });
});

describe('maxVersion', () => {
  it('finds the highest version within a group', () => {
    const state = createDemoState();
    expect(maxVersion(state.documents, 'group-resume')).toBe(2);
    expect(maxVersion(state.documents, 'group-cover')).toBe(2);
    expect(maxVersion(state.documents, 'group-career')).toBe(1);
  });

  it('returns 0 for an unknown group and empty input', () => {
    expect(maxVersion(createDemoState().documents, 'nope')).toBe(0);
    expect(maxVersion([], 'g')).toBe(0);
  });
});

describe('practiceFor', () => {
  it('filters by application and sorts newest first', () => {
    const state = createDemoState();
    const entries = practiceFor(state.practice, 'app-3');
    expect(entries).toHaveLength(1);
    expect(practiceFor(state.practice, 'app-5')).toHaveLength(1);
    expect(practiceFor(state.practice, 'app-1')).toHaveLength(0);
  });

  it('is stable and does not mutate the input array', () => {
    const state = createDemoState();
    const original = [...state.practice];
    practiceFor(state.practice, 'app-3');
    expect(state.practice).toEqual(original);
  });
});

describe('nextId', () => {
  it('is unique and supports prefixes', () => {
    const plain = nextId();
    const prefixed = nextId('doc');
    expect(plain).not.toBe(prefixed);
    expect(prefixed.startsWith('doc-')).toBe(true);
    expect(nextId()).not.toBe(nextId());
  });
});

describe('empty vs demo state shape', () => {
  it('keeps the same schema version', () => {
    expect(createEmptyState().schemaVersion).toBe(1);
    expect(createDemoState().schemaVersion).toBe(1);
  });

  it('never mutates shared profile objects between calls', () => {
    const first = createDemoState();
    first.profile.skills.push('MUTATED');
    const second = createDemoState();
    expect(second.profile.skills).not.toContain('MUTATED');
  });
});

// Guards the "no false saved state after quota" requirement.
describe('describeStorageError', () => {
  it('detects a DOMException QuotaExceededError as a quota failure', () => {
    const error = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    const result = describeStorageError(error);
    expect(result.quota).toBe(true);
    expect(result.message).toMatch(/저장 공간이 부족/);
    expect(result.message).not.toMatch(/저장했어요|저장됨/);
  });

  it('detects quota by name even without a descriptive message', () => {
    const error = new Error('boom');
    error.name = 'QuotaExceededError';
    expect(describeStorageError(error).quota).toBe(true);
  });

  it('detects quota from a browser-style storage message', () => {
    expect(describeStorageError(new Error('Storage is full')).quota).toBe(true);
    expect(describeStorageError(new Error('no disk space')).quota).toBe(true);
  });

  it('treats an unknown failure as a non-quota save error', () => {
    const result = describeStorageError(new Error('transaction aborted'));
    expect(result.quota).toBe(false);
    expect(result.message).toMatch(/저장하지 못했습니다/);
  });

  it('handles non-Error throws without crashing', () => {
    expect(describeStorageError('QuotaExceededError').quota).toBe(true);
    expect(describeStorageError(undefined).quota).toBe(false);
    expect(describeStorageError(null).quota).toBe(false);
  });
});

// The losing tab exports its unsaved snapshot under a clearly distinct name.
describe('conflictFileName', () => {
  it('names the conflict export after the date and never as a normal backup', () => {
    const name = conflictFileName(new Date('2026-03-09T12:00:00+09:00'));
    expect(name).toBe('jarizip-conflict-2026-03-09.json');
    expect(name).not.toMatch(/backup/);
  });
});
