import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { validateBackup, id } from './domain';
import { createEmptyState } from './seed';
import { prepareBackupBlob } from './files';
import {
  advanceSavedRevision,
  adoptRecoveryDraft,
  commitWorkspace,
  clearStoredWorkspaceRecords,
  clearRecoveryDraft,
  createLivePageId,
  readRecoveryDraft,
  readDraftSlot,
  readStoredWorkspace,
  quarantineWorkspace,
  recoveryDraftNotice,
  rememberDraftSlot,
  saveMeta,
  saveRecoveryDraft,
  type RecoveryDraft,
} from './storage';
import type { WorkspaceState } from './types';
import '../styles/storage.css';

/* -------------------------------------------------------------------------- */
/* Storage metadata                                                           */
/* -------------------------------------------------------------------------- */

interface StorageMeta {
  version: 1;
  initializedAt: string;
  demoSeeded: boolean;
}

export type StorageStatus = 'saved' | 'saving' | 'temporary' | 'error' | 'conflict';

export interface WorkspaceContextValue {
  state: WorkspaceState;
  update: (fn: (state: WorkspaceState) => WorkspaceState) => void;
  storageStatus: StorageStatus;
  notify: (message: string) => void;
  toast: string;
  /** Stored revision that rejected this tab, or -1 when there is no conflict. */
  conflictRevision: number;
  /** Downloads the current losing snapshot using the standard backup limits. */
  exportRecoveryDraft: () => Promise<void>;
  /** Explicit, confirmed discard of the losing draft; loads the newer stored state. */
  discardConflictChanges: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Turns a persistence failure into a readable Korean message.
 * A genuine quota failure (DOMException name `QuotaExceededError`, or a browser
 * message about storage/full/disk) must never be reported as success.
 */
export function describeStorageError(error: unknown): { quota: boolean; message: string } {
  const name = (error as { name?: unknown } | null)?.name;
  const detail = [typeof name === 'string' ? name : '', error instanceof Error ? error.message : String(error)]
    .filter(Boolean)
    .join(' ');
  const quota = /quota|quotaexceeded|storage|full|disk/i.test(detail);
  return {
    quota,
    message: quota
      ? '저장 공간이 부족해 최근 변경을 브라우저에 저장하지 못했습니다. 백업을 내려받아 주세요.'
      : '변경 내용을 브라우저에 저장하지 못했습니다. 백업을 내려받아 주세요.',
  };
}

const CONFLICT_EXPORT_FALLBACK = '초안 백업 다운로드를 시작했어요.';

function downloadBlob(blob: Blob, fileName: string): void {
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

export function conflictFileName(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `jarizip-conflict-${year}-${month}-${day}.json`;
}

/* -------------------------------------------------------------------------- */
/* Hydration                                                                  */
/* -------------------------------------------------------------------------- */

interface HydrationResult {
  state: WorkspaceState;
  /** Revision of the latest stored workspace (not the draft). */
  revision: number;
  meta: StorageMeta | null;
  unavailable: boolean;
  corrupt: boolean;
  needsSeed: boolean;
  draft: RecoveryDraft | null;
}

/**
 * Adopts a draft left by a previous page load of this tab. The hint comes from
 * sessionStorage, which a duplicated tab also copies, so the move is atomic:
 * exactly one page wins and the draft is never clobbered or duplicated.
 */
async function adoptPreviousDraft(livePageId: string): Promise<RecoveryDraft | null> {
  const slot = readDraftSlot();
  if (!slot) return null;
  if (slot === livePageId) return readRecoveryDraft(livePageId);
  try {
    const adopted = await adoptRecoveryDraft(slot, livePageId);
    if (adopted) rememberDraftSlot(livePageId);
    return adopted;
  } catch {
    return null; // A failed adoption must not mask the workspace itself.
  }
}

/**
 * Reads the raw workspace, its revision and meta, validates the payload and
 * preserves unreadable data in quarantine instead of overwriting it. A saved
 * recovery draft (a losing page's snapshot) is validated and returned, but it is
 * never auto-applied over the newer stored workspace.
 */
async function loadStoredState(livePageId: string): Promise<HydrationResult> {
  try {
    const { state: raw, revision, meta } = await readStoredWorkspace();
    let draft: RecoveryDraft | null = null;
    try {
      const candidate = await adoptPreviousDraft(livePageId);
      if (candidate) {
        // Only load a draft we can still validate; otherwise leave it alone.
        validateBackup(candidate.state);
        draft = candidate;
      }
    } catch {
      draft = null; // A draft read/validation failure must not mask the workspace.
    }
    const storedMeta = (meta as StorageMeta | undefined) ?? null;

    if (raw === undefined) {
      return {
        state: draft?.state ?? createEmptyState(),
        revision,
        meta: storedMeta,
        unavailable: false,
        corrupt: false,
        needsSeed: !storedMeta?.demoSeeded && draft === null,
        draft,
      };
    }

    try {
      const stored = validateBackup(raw);
      return {
        // A preserved draft is the losing tab's own unsaved snapshot. Showing it
        // lets the user actually recover their work after a reload; it is still
        // never written over the newer record without an explicit choice.
        state: draft?.state ?? stored,
        revision,
        meta: storedMeta,
        unavailable: false,
        corrupt: false,
        needsSeed: false,
        draft,
      };
    } catch (error) {
      // Preserve the unreadable payload instead of overwriting it silently.
      try {
        await quarantineWorkspace({
          quarantinedAt: new Date().toISOString(),
          reason: error instanceof Error ? error.message : String(error),
          payload: raw,
        });
      } catch {
        // Quarantine is best-effort; never block startup on it.
      }
      return {
        state: createEmptyState(),
        revision,
        meta: storedMeta,
        unavailable: false,
        corrupt: true,
        needsSeed: false,
        draft: null,
      };
    }
  } catch {
    // IndexedDB is unavailable (private mode, blocked storage, SSR/test env).
    // Never fill storage or network failures with invented records.
    return {
      state: createEmptyState(),
      revision: 0,
      meta: null,
      unavailable: true,
      corrupt: false,
      needsSeed: false,
      draft: null,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Conflict UI                                                                */
/* -------------------------------------------------------------------------- */

function ConflictNotice({
  onExport,
  onDiscard,
}: {
  onExport: () => void;
  onDiscard: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="storage-conflict" role="alert" data-testid="storage-conflict">
      <strong className="storage-conflict__title">다른 탭에서 먼저 저장했어요</strong>
      <p className="storage-conflict__body">
        이 화면의 변경은 아직 최신 저장본에 반영되지 않았어요. 다른 탭의 내용을 덮어쓰지 않고
        변경 사항을 이 화면에 유지하고 있어요. 먼저 초안 백업을 내려받아 보관해주세요.
      </p>
      {confirming ? (
        <div className="storage-conflict__confirm" role="group" aria-label="초안 버리기 확인">
          <p>
            초안을 버리면 이 화면에서 저장하지 못한 변경이 사라지고, 다른 탭에서 저장한 최신 내용으로 바뀝니다.
            되돌릴 수 없어요. 먼저 백업으로 내려받는 편이 안전해요.
          </p>
          <div className="storage-conflict__actions">
            <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
              취소
            </button>
            <button type="button" className="button danger" onClick={onDiscard}>
              초안 버리고 불러오기
            </button>
          </div>
        </div>
      ) : (
        <div className="storage-conflict__actions">
          <button type="button" className="button secondary" onClick={onExport}>
            초안 백업으로 내려받기
          </button>
          <button type="button" className="button secondary" onClick={() => setConfirming(true)}>
            초안 버리고 최신 내용 불러오기
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('temporary');
  const [toast, setToast] = useState('');
  const [conflictRevision, setConflictRevision] = useState(-1);

  const stateRef = useRef<WorkspaceState | null>(null);
  // A fresh per-page id. NOT reused across tabs and NOT trusted from
  // sessionStorage; it is the live identity used to key this page's draft.
  const pageIdRef = useRef<string>('');
  if (!pageIdRef.current) pageIdRef.current = createLivePageId();
  const readyRef = useRef(false);
  const unavailableRef = useRef(false);
  // Set when hydration found unreadable records: block automatic writes until
  // the user makes an explicit change, so a recovery state cannot silently
  // overwrite records we failed to read (they are quarantined meanwhile).
  const autoFlushBlockedRef = useRef(false);
  // The exact object produced by hydration/latest-load. Skipping the first
  // persistence effect for it avoids rewriting unchanged data, which would
  // create a spurious revision bump (and a false cross-tab conflict).
  const hydratedStateRef = useRef<WorkspaceState | null>(null);
  const writingRef = useRef(false);
  const queuedRef = useRef(false);
  const errorNotifiedRef = useRef(false);
  const pendingSaveRef = useRef(false);
  // In-memory mutation counter (used to know whether the newest state was saved).
  const revisionRef = useRef(0);
  // IndexedDB revision the in-memory state is based on.
  const baseRevisionRef = useRef(0);
  // In-memory mutation revision that the last successful write persisted.
  const savedRevisionRef = useRef(0);
  // Latest detected conflict, or -1. Gates flush so a conflicted tab does not
  // keep hammering IndexedDB with doomed writes.
  const conflictRef = useRef(-1);
  // Whether the losing snapshot is actually persisted, and when. Used to avoid
  // falsely claiming the draft was kept.
  const draftInfoRef = useRef<{ savedAt: string; persisted: boolean } | null>(null);
  // The losing snapshot, also persisted under a page-scoped key for reload recovery.
  const recoveryDraftRef = useRef<RecoveryDraft | null>(null);
  const pendingToastRef = useRef('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ----------------------------- notify ----------------------------- */

  const showToast = useCallback((message: string) => {
    const text = typeof message === 'string' ? message : String(message ?? '');
    if (!text) return;
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // Re-setting the same message still refreshes the visible toast timer.
    toastTimer.current = setTimeout(() => {
      toastTimer.current = null;
      setToast('');
    }, 4500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // Mutation confirmations are shown only after the IndexedDB transaction commits.
  const notify = useCallback((message: string) => {
    if (pendingSaveRef.current) {
      pendingToastRef.current = message;
      return;
    }
    showToast(message);
  }, [showToast]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      // Protect both an in-flight/queued save and an unresolved conflict whose
      // losing snapshot might not be durably stored yet.
      if (!pendingSaveRef.current && !writingRef.current && conflictRef.current < 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  /* --------------------- conflict draft persistence --------------------- */

  /** Persists the current in-memory snapshot as this page's recovery draft. */
  const persistRecoveryDraft = useCallback(async (): Promise<{ savedAt: string; persisted: boolean }> => {
    const snapshot = stateRef.current;
    const savedAt = new Date().toISOString();
    if (!snapshot) return { savedAt, persisted: false };
    try {
      const draft: RecoveryDraft = {
        savedAt,
        baseRevision: baseRevisionRef.current,
        detectedRevision: Math.max(conflictRef.current, 0),
        state: snapshot,
      };
      await saveRecoveryDraft(pageIdRef.current, draft);
      // Remember this page's id so a reload can adopt the draft again.
      rememberDraftSlot(pageIdRef.current);
      recoveryDraftRef.current = draft;
      draftInfoRef.current = { savedAt, persisted: true };
      return { savedAt, persisted: true };
    } catch {
      // Do not claim the draft was kept when IndexedDB rejected it.
      draftInfoRef.current = { savedAt, persisted: false };
      return { savedAt, persisted: false };
    }
  }, []);

  /* ----------------------------- saving ----------------------------- */

  const clearConflict = useCallback(() => {
    conflictRef.current = -1;
    setConflictRevision(-1);
  }, []);

  const handleConflict = useCallback((revision: number) => {
    conflictRef.current = revision;
    setConflictRevision(revision);
    pendingSaveRef.current = false;
    pendingToastRef.current = '';
    setStorageStatus('conflict');
    // Preserve the losing tab's unsaved state. The draft lives under a fresh
    // page id, and the notice below is truthful if persistence fails.
    void persistRecoveryDraft().then(info => {
      showToast(recoveryDraftNotice(info.persisted));
    });
  }, [persistRecoveryDraft, showToast]);

  const flush = useCallback(async () => {
    if (unavailableRef.current) {
      const attemptedSave = pendingSaveRef.current;
      pendingSaveRef.current = false;
      pendingToastRef.current = '';
      setStorageStatus('temporary');
      if (attemptedSave) showToast('현재 화면에만 반영됐어요. 저장소를 사용할 수 없어 새로고침하면 사라질 수 있으니 백업해주세요.');
      return;
    }
    if (autoFlushBlockedRef.current) return;
    // A stale snapshot must not be retried automatically.
    if (conflictRef.current >= 0) return;
    if (writingRef.current) {
      // A write is already in flight; let it pick up the newest state.
      queuedRef.current = true;
      return;
    }

    writingRef.current = true;
    setStorageStatus('saving');
    let failure: { quota: boolean; message: string } | null = null;
    let conflictRevisionDetected: number | null = null;
    try {
      do {
        queuedRef.current = false;
        const snapshot = stateRef.current;
        if (!snapshot) break;
        // Capture the in-memory mutation revision BEFORE the await. Later edits
        // made during the commit must not be reported as this transaction's
        // saved revision, otherwise a lost update could look successful.
        const snapshotRevision = revisionRef.current;
        // Atomic read/compare/write in one IndexedDB transaction. IndexedDB
        // serializes readwrite transactions on a store across tabs, so a stale
        // tab either commits against the latest revision or is rejected
        // without writing anything.
        const result = await commitWorkspace(snapshot, baseRevisionRef.current);
        if (result.status === 'conflict') {
          conflictRevisionDetected = result.revision;
          break;
        }
        baseRevisionRef.current = result.revision;
        savedRevisionRef.current = advanceSavedRevision(savedRevisionRef.current, snapshotRevision);
      } while (queuedRef.current);
    } catch (error) {
      failure = describeStorageError(error);
    } finally {
      writingRef.current = false;
    }

    if (failure) {
      pendingSaveRef.current = false;
      pendingToastRef.current = '';
      setStorageStatus('error');
      if (!errorNotifiedRef.current) {
        errorNotifiedRef.current = true;
        showToast(failure.message);
      }
    } else if (conflictRevisionDetected !== null) {
      handleConflict(conflictRevisionDetected);
    } else if (savedRevisionRef.current === revisionRef.current) {
      errorNotifiedRef.current = false;
      pendingSaveRef.current = false;
      setStorageStatus('saved');
      const confirmation = pendingToastRef.current;
      pendingToastRef.current = '';
      if (confirmation) showToast(confirmation);
    }
  }, [handleConflict, showToast]);

  /* ------------------------- conflict resolution ------------------------- */

  /**
   * Explicit, user-confirmed discard of the losing draft. This is the only path
   * that removes the draft and adopts the newer stored snapshot; it never runs
   * automatically and never claims the changed data was saved.
   */
  const discardConflictChanges = useCallback(async () => {
    const draftRevision = revisionRef.current;
    let next: WorkspaceState;
    let revision: number;
    try {
      const { state: raw, revision: storedRevision } = await readStoredWorkspace();
      next = raw === undefined ? createEmptyState() : validateBackup(raw);
      revision = storedRevision;
    } catch (error) {
      // Loading the newer snapshot failed: keep the draft and the conflict.
      showToast(describeStorageError(error).message);
      return;
    }
    // Do not discard new edits made after the user confirmed an older draft.
    if (draftRevision !== revisionRef.current) {
      showToast('처리 중 초안이 바뀌었어요. 새 변경을 유지했으니 다시 확인해주세요.');
      return;
    }
    try {
      await clearRecoveryDraft(pageIdRef.current);
    } catch {
      showToast('초안을 정리하지 못했어요. 현재 변경을 유지했으니 백업 후 다시 시도해주세요.');
      return;
    }
    if (draftRevision !== revisionRef.current) {
      await persistRecoveryDraft();
      showToast('처리 중 초안이 바뀌었어요. 새 변경을 유지했으니 다시 확인해주세요.');
      return;
    }
    recoveryDraftRef.current = null;
    draftInfoRef.current = null;
    stateRef.current = next;
    hydratedStateRef.current = next;
    baseRevisionRef.current = revision;
    errorNotifiedRef.current = false;
    pendingSaveRef.current = false;
    clearConflict();
    setState(next);
    setStorageStatus('saved');
    showToast('이 화면의 초안을 버리고 다른 탭의 최신 내용을 불러왔어요.');
  }, [clearConflict, persistRecoveryDraft, showToast]);

  const exportRecoveryDraft = useCallback(async () => {
    // Snapshot at the moment of the click; never a value captured before an await.
    const snapshot = stateRef.current;
    if (!snapshot) return;
    try {
      // Reuse the standard backup limits/validation so a conflict export can
      // actually be restored by the normal import path. This does NOT touch the
      // persisted draft, so reload recovery still works afterwards.
      const blob = prepareBackupBlob(snapshot);
      downloadBlob(blob, conflictFileName());
      const info = draftInfoRef.current;
      showToast(info?.persisted
        ? `${CONFLICT_EXPORT_FALLBACK} 초안은 브라우저에도 남아 있어요.`
        : `${CONFLICT_EXPORT_FALLBACK} 브라우저에는 보관하지 못했으니 이 파일을 꼭 보관해 주세요.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '백업을 만들지 못했어요.');
    }
  }, [showToast]);

  /* --------------------------- hydration --------------------------- */

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await loadStoredState(pageIdRef.current);
      if (cancelled) return;

      // A corrupt store is treated as read-only until the user makes an
      // explicit change (reset/import/edit). We never auto-write the empty
      // recovery state over records we could not read; the original payload is
      // preserved in quarantine.
      unavailableRef.current = result.unavailable;
      autoFlushBlockedRef.current = result.corrupt;
      baseRevisionRef.current = result.revision;
      recoveryDraftRef.current = result.draft;
      draftInfoRef.current = result.draft
        ? { savedAt: result.draft.savedAt, persisted: true }
        : null;
      stateRef.current = result.state;
      // Do not rewrite the state we just read: that needless revision bump
      // would reject a concurrently hydrating tab.
      hydratedStateRef.current = result.state;
      readyRef.current = true;
      setState(result.state);

      const hasDraft = !result.unavailable && !result.corrupt && result.draft !== null;
      if (hasDraft) {
        conflictRef.current = result.revision;
        setConflictRevision(result.revision);
      }

      if (result.unavailable) {
        setStorageStatus('temporary');
      } else if (result.corrupt) {
        setStorageStatus('temporary');
        notify(
          '저장된 데이터를 읽을 수 없어 원본을 따로 보관하고 빈 워크스페이스로 시작했습니다. 새 변경은 저장하지 않으니 백업을 내려받아 주세요.',
        );
      } else if (hasDraft) {
        // A previous page lost a conflict and left a draft. Never auto-apply it.
        setStorageStatus('conflict');
        notify(
          '저장하지 못한 초안이 남아 있어요. 최신 저장 내용을 불러오거나, 남은 초안을 백업으로 내려받을 수 있어요.',
        );
      } else {
        // Nothing was written, but the state itself is already durable in
        // IndexedDB (or the workspace is intentionally empty until first edit).
        setStorageStatus('saved');
      }

      // Record the first-open marker once. The workspace itself stays absent
      // until the first explicit edit, so simultaneous first opens cannot
      // overwrite each other with an identical empty seed.
      if (!result.unavailable && !result.corrupt && result.needsSeed) {
        const meta: StorageMeta = result.meta ?? {
          version: 1,
          initializedAt: new Date().toISOString(),
          demoSeeded: false,
        };
        try {
          await saveMeta({ ...meta, demoSeeded: false });
        } catch (error) {
          if (!cancelled) {
            const failure = describeStorageError(error);
            setStorageStatus(failure.quota ? 'error' : 'temporary');
            notify(failure.message);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notify]);

  /* --------------------------- persistence --------------------------- */

  // Runs after the hydration render; the hydration effect set readyRef first.
  useEffect(() => {
    if (!readyRef.current) return;
    stateRef.current = state;
    // The hydration/latest-load state is already durable: skip its effect pass.
    if (state !== null && state === hydratedStateRef.current) {
      hydratedStateRef.current = null;
      return;
    }
    // While recovery is blocked, keep the in-memory state but do not persist it.
    if (autoFlushBlockedRef.current) return;
    void flush();
  }, [state, flush]);

  /* ----------------------------- update ----------------------------- */

  const update = useCallback((fn: (s: WorkspaceState) => WorkspaceState) => {
    const base = stateRef.current;
    if (!base) return;
    let next: WorkspaceState;
    try {
      next = fn(base);
    } catch (error) {
      console.error('워크스페이스 업데이트 실패', error);
      return;
    }
    if (!next || typeof next !== 'object' || next === base) return;
    autoFlushBlockedRef.current = false;
    hydratedStateRef.current = null;
    stateRef.current = next;
    revisionRef.current += 1;
    pendingSaveRef.current = true;
    // A conflict stays visible until the user resolves it; do not fall back to
    // a misleading "saving" status for a snapshot we will not write.
    const conflicted = conflictRef.current >= 0;
    setStorageStatus(unavailableRef.current ? 'temporary' : conflicted ? 'conflict' : 'saving');
    setState(next);
    // Keep the persisted recovery draft in step with further typing so a reload
    // recovers the latest unsaved snapshot, not a stale one.
    if (conflicted && !unavailableRef.current) void persistRecoveryDraft().catch(() => undefined);
  }, [persistRecoveryDraft]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state: state ?? createEmptyState(),
      update,
      storageStatus,
      notify,
      toast,
      conflictRevision,
      exportRecoveryDraft,
      discardConflictChanges,
    }),
    [
      state,
      update,
      storageStatus,
      notify,
      toast,
      conflictRevision,
      exportRecoveryDraft,
      discardConflictChanges,
    ],
  );

  if (!state) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        워크스페이스를 준비하는 중…
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {conflictRevision >= 0 && (
        <ConflictNotice
          onExport={() => void exportRecoveryDraft()}
          onDiscard={() => void discardConflictChanges()}
        />
      )}
    </WorkspaceContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace는 WorkspaceProvider 안에서만 사용할 수 있습니다.');
  }
  return context;
}

/** Guards against accidental duplicate ids when building new records. */
export function nextId(prefix?: string): string {
  const raw = id();
  return prefix ? `${prefix}-${raw}` : raw;
}

// Pure board helpers live in domain.ts; re-exported here for convenience.
export { maxVersion, practiceFor, stageCounts } from './domain';

/** Clears the stored workspace. Used by explicit user actions only. */
export async function clearStoredWorkspace(): Promise<void> {
  // Include the draft slot this page remembers, so an explicit reset also
  // removes the page's own recovery draft. Other pages' drafts are untouched.
  const slot = readDraftSlot();
  await clearStoredWorkspaceRecords(slot ?? undefined);
}
