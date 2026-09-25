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
import { del, get, set } from 'idb-keyval';
import { validateBackup, id } from './domain';
import { createDemoState, createEmptyState } from './seed';
import type { WorkspaceState } from './types';

/* -------------------------------------------------------------------------- */
/* Storage keys                                                               */
/* -------------------------------------------------------------------------- */

const WORKSPACE_KEY = 'jarizip:workspace:v1';
const META_KEY = 'jarizip:meta:v1';
const QUARANTINE_KEY = 'jarizip:quarantine:v1';

interface StorageMeta {
  version: 1;
  initializedAt: string;
  demoSeeded: boolean;
}

export type StorageStatus = 'saved' | 'saving' | 'temporary' | 'error';

export interface WorkspaceContextValue {
  state: WorkspaceState;
  update: (fn: (state: WorkspaceState) => WorkspaceState) => void;
  storageStatus: StorageStatus;
  notify: (message: string) => void;
  toast: string;
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

/* -------------------------------------------------------------------------- */
/* IndexedDB helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * idb-keyval uses IndexedDB. When it is unavailable (private browsing, blocked
 * storage, non-browser test environment) we fall back to in-memory only.
 */
async function loadStoredState(): Promise<{
  state: WorkspaceState;
  meta: StorageMeta | null;
  unavailable: boolean;
  corrupt: boolean;
  needsSeed: boolean;
}> {
  try {
    const [raw, metaRaw] = await Promise.all([get(WORKSPACE_KEY), get(META_KEY)]);
    const meta = (metaRaw as StorageMeta | undefined) ?? null;

    if (raw === undefined) {
      // Either a first visit, or storage was silently cleared.
      if (meta?.demoSeeded) {
        return { state: createEmptyState(), meta, unavailable: false, corrupt: false, needsSeed: false };
      }
      return { state: createDemoState(), meta, unavailable: false, corrupt: false, needsSeed: true };
    }

    try {
      return { state: validateBackup(raw), meta, unavailable: false, corrupt: false, needsSeed: false };
    } catch (error) {
      // Preserve the unreadable payload instead of overwriting it silently.
      try {
        await set(QUARANTINE_KEY, {
          quarantinedAt: new Date().toISOString(),
          reason: error instanceof Error ? error.message : String(error),
          payload: raw,
        });
      } catch {
        // Quarantine is best-effort; never block startup on it.
      }
      return { state: createEmptyState(), meta, unavailable: false, corrupt: true, needsSeed: false };
    }
  } catch {
    // IndexedDB is unavailable (private mode, blocked storage, SSR/test env).
    // Keep the demo so first-time visitors still see something, and report the
    // honest `temporary` storage status.
    return { state: createDemoState(), meta: null, unavailable: true, corrupt: false, needsSeed: false };
  }
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('temporary');
  const [toast, setToast] = useState('');

  const stateRef = useRef<WorkspaceState | null>(null);
  const readyRef = useRef(false);
  const unavailableRef = useRef(false);
  // Set when hydration found unreadable records: block automatic writes until
  // the user makes an explicit change, so a recovery state cannot silently
  // overwrite records we failed to read (they are quarantined meanwhile).
  const autoFlushBlockedRef = useRef(false);
  const writingRef = useRef(false);
  const queuedRef = useRef(false);
  const errorNotifiedRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const revisionRef = useRef(0);
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
      if (!pendingSaveRef.current && !writingRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  /* ----------------------------- saving ----------------------------- */

  const flush = useCallback(async () => {
    if (unavailableRef.current) {
      const attemptedSave = pendingSaveRef.current;
      pendingSaveRef.current = false;
      pendingToastRef.current = '';
      setStorageStatus('temporary');
      if (attemptedSave) showToast('현재 화면에만 반영됐어요. 저장소를 사용할 수 없어 새로고침하면 사라질 수 있으니 백업해주세요.');
      return;
    }
    if (writingRef.current) {
      // A write is already in flight; let it pick up the newest state.
      queuedRef.current = true;
      return;
    }

    writingRef.current = true;
    setStorageStatus('saving');
    let failure: { quota: boolean; message: string } | null = null;
    let savedRevision = revisionRef.current;
    try {
      do {
        queuedRef.current = false;
        const snapshot = stateRef.current;
        savedRevision = revisionRef.current;
        // idb-keyval resolves this promise on the IndexedDB transaction's
        // `complete` event and rejects on `abort`/`error` (including
        // QuotaExceededError). That commit acknowledgement is the save proof —
        // no separate read-back is needed, and adding one here previously
        // raced between the seed and this loop.
        if (snapshot) await set(WORKSPACE_KEY, snapshot);
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
    } else if (savedRevision === revisionRef.current) {
      errorNotifiedRef.current = false;
      pendingSaveRef.current = false;
      setStorageStatus('saved');
      const confirmation = pendingToastRef.current;
      pendingToastRef.current = '';
      if (confirmation) showToast(confirmation);
    }
  }, [showToast]);

  /* --------------------------- hydration --------------------------- */

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await loadStoredState();
      if (cancelled) return;

      // A corrupt store is treated as read-only until the user makes an
      // explicit change (reset/import/edit). We never auto-write the empty
      // recovery state over records we could not read; the original payload is
      // preserved in quarantine.
      unavailableRef.current = result.unavailable;
      autoFlushBlockedRef.current = result.corrupt;
      stateRef.current = result.state;
      readyRef.current = true;
      setState(result.state);

      if (result.unavailable) {
        setStorageStatus('temporary');
      } else if (result.corrupt) {
        setStorageStatus('temporary');
        notify(
          '저장된 데이터를 읽을 수 없어 원본을 따로 보관하고 빈 워크스페이스로 시작했습니다. 새 변경은 저장하지 않으니 백업을 내려받아 주세요.',
        );
      } else {
        // The persistence effect writes the hydrated state and reports the real
        // commit result, so do not claim `saved` before that write lands.
        setStorageStatus('saving');
      }

      // Record the first-open marker once. The workspace itself is persisted by
      // the normal write path, so seeding cannot race with it.
      if (!result.unavailable && !result.corrupt && result.needsSeed) {
        const meta: StorageMeta = result.meta ?? {
          version: 1,
          initializedAt: new Date().toISOString(),
          demoSeeded: false,
        };
        try {
          await set(META_KEY, { ...meta, demoSeeded: true });
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
    stateRef.current = next;
    revisionRef.current += 1;
    pendingSaveRef.current = true;
    setStorageStatus(unavailableRef.current ? 'temporary' : 'saving');
    setState(next);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ state: state ?? createEmptyState(), update, storageStatus, notify, toast }),
    [state, update, storageStatus, notify, toast],
  );

  if (!state) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        워크스페이스를 준비하는 중…
      </div>
    );
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
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
  await Promise.allSettled([del(WORKSPACE_KEY), del(META_KEY)]);
}
