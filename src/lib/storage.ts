import { createStore, del, get, set } from 'idb-keyval';
import type { WorkspaceState } from './types';

/* -------------------------------------------------------------------------- */
/* Keys                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `WORKSPACE_KEY` intentionally still stores the *raw* `WorkspaceState` object.
 * The revision lives in a separate key so old backups, the e2e seed fixture and
 * the existing validation path stay byte-for-byte compatible. No migration and
 * no destructive reset is performed when the revision key is missing.
 */
export const WORKSPACE_KEY = 'jarizip:workspace:v1';
export const META_KEY = 'jarizip:meta:v1';
export const QUARANTINE_KEY = 'jarizip:quarantine:v1';
export const REVISION_KEY = 'jarizip:revision:v1';

/**
 * Recovery drafts are scoped to a single live page. The key uses a fresh
 * per-page-load id, never a value copied from another tab. `sessionStorage` is
 * only a hint that lets a *reload* of the same tab adopt its previous draft.
 * Because a duplicated tab copies sessionStorage, adoption is done as an atomic
 * move so exactly one page wins and a draft is never clobbered or duplicated.
 */
export const RECOVERY_KEY_PREFIX = 'jarizip:recovery-draft:v1:';
const DRAFT_SLOT_KEY = 'jarizip:draft-slot';

/** Same IndexedDB database/object store that idb-keyval uses by default. */
const store = createStore('keyval-store', 'keyval');

/* -------------------------------------------------------------------------- */
/* Revision helpers                                                           */
/* -------------------------------------------------------------------------- */

export interface StoredWorkspace {
  /** Raw workspace value, exactly as stored under `WORKSPACE_KEY`. */
  state: unknown;
  /** Missing/invalid revisions read as 0 so old records remain loadable. */
  revision: number;
  meta: unknown;
}

export function normalizeRevision(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

/**
 * Advances the record of which in-memory mutation revision was persisted. The
 * snapshot revision must be captured *before* awaiting the commit; a later edit
 * must never be credited to an earlier transaction.
 */
export function advanceSavedRevision(previousSaved: number, snapshotRevision: number): number {
  return Math.max(normalizeRevision(previousSaved), normalizeRevision(snapshotRevision));
}

/**
 * Truthful conflict-draft message. Never says the draft was kept when
 * IndexedDB rejected the write.
 */
export function recoveryDraftNotice(persisted: boolean): string {
  return persisted
    ? '다른 탭에서 먼저 저장해 이 화면의 변경을 저장하지 않았어요. 변경 사항은 이 브라우저에 초안으로 보관했어요.'
    : '다른 탭에서 먼저 저장해 이 화면의 변경을 저장하지 않았어요. 초안을 브라우저에도 보관하지 못했으니 지금 백업으로 내려받아 주세요.';
}

/**
 * Pure compare decision used by the atomic commit. A caller may only write when
 * the revision it hydrated from is still the revision in storage. Anything else
 * is a lost-update conflict and must not overwrite the newer record.
 */
export type CommitDecision =
  | { type: 'write'; revision: number }
  | { type: 'conflict'; revision: number };

export function decideCommit(
  expectedRevision: number,
  storedRevision: unknown,
): CommitDecision {
  const current = normalizeRevision(storedRevision);
  return expectedRevision === current
    ? { type: 'write', revision: current + 1 }
    : { type: 'conflict', revision: current };
}

/* -------------------------------------------------------------------------- */
/* Atomic read / compare / write                                              */
/* -------------------------------------------------------------------------- */

export type CommitResult =
  | { status: 'saved'; revision: number }
  | { status: 'conflict'; revision: number; storedState: unknown };

/**
 * Reads the workspace + revision and conditionally writes both in a single
 * readwrite IndexedDB transaction. IndexedDB serializes readwrite transactions
 * on an object store across tabs, so the read and the conditional put cannot be
 * interleaved by another tab: either this commit is based on the latest
 * revision (write) or the stored revision moved on (conflict, no write).
 *
 * This is deliberately not a broadcast or a non-atomic get-then-set. Nothing is
 * written on conflict, so a stale tab can never silently clobber another tab.
 */
export async function commitWorkspace(
  nextState: WorkspaceState,
  expectedRevision: number,
): Promise<CommitResult> {
  return store('readwrite', (objectStore) =>
    new Promise<CommitResult>((resolve, reject) => {
      let storedState: unknown;
      let storedRevision: unknown;
      let remaining = 2;
      let settled = false;

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const decide = () => {
        if (settled || remaining > 0) return;
        const decision = decideCommit(expectedRevision, storedRevision);
        if (decision.type === 'conflict') {
          settled = true;
          resolve({ status: 'conflict', revision: decision.revision, storedState });
          return;
        }
        try {
          objectStore.put(nextState, WORKSPACE_KEY);
          objectStore.put(decision.revision, REVISION_KEY);
        } catch (error) {
          fail(error);
          return;
        }
        const transaction = objectStore.transaction;
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve({ status: 'saved', revision: decision.revision });
        };
        transaction.onerror = () =>
          fail(transaction.error ?? new Error('IndexedDB 트랜잭션이 실패했습니다.'));
        transaction.onabort = () =>
          fail(transaction.error ?? new Error('IndexedDB 트랜잭션이 중단되었습니다.'));
      };

      const stateRequest = objectStore.get(WORKSPACE_KEY);
      stateRequest.onsuccess = () => {
        storedState = stateRequest.result;
        remaining -= 1;
        decide();
      };
      stateRequest.onerror = () => fail(stateRequest.error);

      const revisionRequest = objectStore.get(REVISION_KEY);
      revisionRequest.onsuccess = () => {
        storedRevision = revisionRequest.result;
        remaining -= 1;
        decide();
      };
      revisionRequest.onerror = () => fail(revisionRequest.error);
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Reads and best-effort side records                                         */
/* -------------------------------------------------------------------------- */

/** Reads the raw workspace, revision and meta in one readonly transaction. */
export async function readStoredWorkspace(): Promise<StoredWorkspace> {
  return store('readonly', (objectStore) =>
    new Promise<StoredWorkspace>((resolve, reject) => {
      const result: StoredWorkspace = { state: undefined, revision: 0, meta: undefined };
      let remaining = 3;
      const settle = () => {
        if (remaining === 0) resolve(result);
      };

      const stateRequest = objectStore.get(WORKSPACE_KEY);
      stateRequest.onsuccess = () => {
        result.state = stateRequest.result;
        remaining -= 1;
        settle();
      };
      stateRequest.onerror = () => reject(stateRequest.error);

      const revisionRequest = objectStore.get(REVISION_KEY);
      revisionRequest.onsuccess = () => {
        result.revision = normalizeRevision(revisionRequest.result);
        remaining -= 1;
        settle();
      };
      revisionRequest.onerror = () => reject(revisionRequest.error);

      const metaRequest = objectStore.get(META_KEY);
      metaRequest.onsuccess = () => {
        result.meta = metaRequest.result;
        remaining -= 1;
        settle();
      };
      metaRequest.onerror = () => reject(metaRequest.error);
    }),
  );
}

export async function saveMeta(meta: unknown): Promise<void> {
  await set(META_KEY, meta, store);
}

export async function quarantineWorkspace(payload: unknown): Promise<void> {
  await set(QUARANTINE_KEY, payload, store);
}

/* -------------------------------------------------------------------------- */
/* Conflict recovery draft                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A losing page's unsaved snapshot. Persisted under a per-page key so it
 * survives a reload and can be exported, without leaking into other pages. It is
 * never auto-applied or auto-merged.
 */
export interface RecoveryDraft {
  savedAt: string;
  baseRevision: number;
  detectedRevision: number;
  state: WorkspaceState;
}

/** A fresh, unpredictable id for this page load. Not copied between tabs. */
export function createLivePageId(): string {
  const cryptoRef = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The slot id this tab may have used before a reload. `sessionStorage` is
 * copied when a tab is duplicated, so this value is a hint, not a guarantee of
 * ownership; adoption below is race-safe.
 */
export function readDraftSlot(): string | null {
  try {
    return sessionStorage.getItem(DRAFT_SLOT_KEY);
  } catch {
    return null;
  }
}

export function rememberDraftSlot(slot: string): void {
  try {
    sessionStorage.setItem(DRAFT_SLOT_KEY, slot);
  } catch {
    // Storage can be blocked; the in-memory id still scopes this page's drafts.
  }
}

export function recoveryDraftKey(slot: string): string {
  return `${RECOVERY_KEY_PREFIX}${slot}`;
}

export function isRecoveryDraft(value: unknown): value is RecoveryDraft {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.savedAt === 'string' &&
    typeof candidate.state === 'object' &&
    candidate.state !== null
  );
}

export async function saveRecoveryDraft(slot: string, draft: RecoveryDraft): Promise<void> {
  await set(recoveryDraftKey(slot), draft, store);
}

export async function readRecoveryDraft(slot: string): Promise<RecoveryDraft | null> {
  const value = await get(recoveryDraftKey(slot), store);
  return isRecoveryDraft(value) ? value : null;
}

/**
 * Atomically moves a draft from a previous slot to this page's fresh slot.
 * A duplicated tab copies `sessionStorage`, so two pages may race here: the
 * read + delete + put in one IndexedDB transaction lets exactly one win, and
 * the draft is moved (not copied) so neither page can clobber the other.
 */
export async function adoptRecoveryDraft(
  previousSlot: string,
  livePageId: string,
): Promise<RecoveryDraft | null> {
  if (!previousSlot || previousSlot === livePageId) return readRecoveryDraft(livePageId);
  return store('readwrite', (objectStore) =>
    new Promise<RecoveryDraft | null>((resolve, reject) => {
      const fromKey = recoveryDraftKey(previousSlot);
      const toKey = recoveryDraftKey(livePageId);
      const request = objectStore.get(fromKey);
      request.onsuccess = () => {
        const value = request.result;
        if (!isRecoveryDraft(value)) {
          // Already adopted by a duplicate tab, or never existed. Never invent.
          resolve(null);
          return;
        }
        try {
          objectStore.put(value, toKey);
          objectStore.delete(fromKey);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        const transaction = objectStore.transaction;
        transaction.oncomplete = () => resolve(value);
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('IndexedDB 트랜잭션이 실패했습니다.'));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('IndexedDB 트랜잭션이 중단되었습니다.'));
      };
      request.onerror = () => reject(request.error);
    }),
  );
}

export async function clearRecoveryDraft(slot: string): Promise<void> {
  await del(recoveryDraftKey(slot), store);
}

/** Explicit user action only. Removes every key this workspace owns. */
export async function clearStoredWorkspaceRecords(slot?: string): Promise<void> {
  const removals = [
    del(WORKSPACE_KEY, store),
    del(META_KEY, store),
    del(REVISION_KEY, store),
  ];
  if (slot) removals.push(del(recoveryDraftKey(slot), store));
  await Promise.allSettled(removals);
}
