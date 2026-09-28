/**
 * Desktop (Electron) preload contract.
 *
 * The desktop shell exposes a narrow bridge on `window.jarizipDesktop`. This
 * module centralizes the shape check and normalizes the small differences
 * between the documented contract and the shipped preload, so the UI only ever
 * sees plain booleans and `{ ok, message? }` result objects.
 *
 * API keys are never handled here: they only live in memory while the user
 * pastes them, and the shell stores them. Nothing in this module reads or
 * writes a key, and the one persisted marker is a non-secret boolean.
 *
 * A provider may need one field (Saramin, Work24, Jooble, JOB-ALIO) or several
 * (Wanted OpenAPI needs a client-id and a client-secret). The bridge accepts
 * either a single string or a `{ field: value }` map and forwards it verbatim.
 */

export type ApiProvider = 'saramin' | 'work24' | 'jooble' | 'wanted' | 'jobalio';
export type ApiFieldValues = Record<string, string>;

export type ApiKeyStatus = Record<ApiProvider, boolean>;

export interface ApiKeyWriteResult {
  ok: boolean;
  message?: string;
}

export interface DesktopInfo {
  platform: string;
  version: string;
}

export const PROVIDERS: ApiProvider[] = ['saramin', 'work24', 'jooble', 'wanted', 'jobalio'];

/**
 * The documented renderer contract. `getInfo` is the documented name; the
 * shipped preload calls it `getPlatform`, so either is accepted.
 */
interface RawBridge {
  getInfo?: () => Promise<unknown>;
  getPlatform?: () => Promise<unknown>;
  getApiKeyStatus: () => Promise<unknown>;
  setApiKey: (provider: ApiProvider, values: string | ApiFieldValues) => Promise<unknown>;
  clearApiKey: (provider: ApiProvider) => Promise<unknown>;
  openExternal: (url: string) => Promise<unknown>;
}

/** What the wizard consumes: a normalized, minimal facade. */
export interface JarizipDesktopBridge {
  getInfo(): Promise<DesktopInfo>;
  getApiKeyStatus(): Promise<ApiKeyStatus>;
  setApiKey(provider: ApiProvider, values: string | ApiFieldValues): Promise<ApiKeyWriteResult>;
  clearApiKey(provider: ApiProvider): Promise<ApiKeyWriteResult>;
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window {
    /** Untrusted runtime input. Always go through `getDesktopBridge()` first. */
    jarizipDesktop?: unknown;
  }
}

/** Accepts either a flat boolean status or the shipped `{ providers: [...] }` list. */
export function normalizeApiKeyStatus(raw: unknown): ApiKeyStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const empty = () => Object.fromEntries(PROVIDERS.map(provider => [provider, false])) as ApiKeyStatus;
  if (PROVIDERS.every(provider => typeof value[provider] === 'boolean')) {
    return Object.fromEntries(PROVIDERS.map(provider => [provider, value[provider]])) as ApiKeyStatus;
  }
  if (Array.isArray(value.providers)) {
    const status = empty();
    let known = false;
    for (const entry of value.providers) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as { provider?: unknown; configured?: unknown };
      if (PROVIDERS.includes(item.provider as ApiProvider) && typeof item.configured === 'boolean') {
        status[item.provider as ApiProvider] = item.configured;
        known = true;
      }
    }
    if (known) return status;
  }
  return null;
}

/** `{ ok: false }` is a failure; a resolved write is otherwise a success. */
function toWriteResult(raw: unknown): ApiKeyWriteResult {
  if (raw && typeof raw === 'object' && (raw as { ok?: unknown }).ok === false) {
    const message = (raw as { message?: unknown; error?: { message?: unknown } }).message
      ?? (raw as { error?: { message?: unknown } }).error?.message;
    return { ok: false, message: typeof message === 'string' ? message : undefined };
  }
  return { ok: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

/**
 * Returns a normalized bridge only when every contract method is present. A
 * partial or missing bridge (normal browser / local-server mode) reads as
 * `null`, so the wizard never appears and the existing `.env.local` guidance
 * stays in charge.
 */
export function getDesktopBridge(): JarizipDesktopBridge | null {
  const candidate = (globalThis as { jarizipDesktop?: unknown }).jarizipDesktop;
  if (!isRecord(candidate)) return null;
  const bridge = candidate as unknown as RawBridge;
  if (typeof bridge.getApiKeyStatus !== 'function') return null;
  if (typeof bridge.setApiKey !== 'function') return null;
  if (typeof bridge.clearApiKey !== 'function') return null;
  if (typeof bridge.openExternal !== 'function') return null;
  if (typeof bridge.getInfo !== 'function' && typeof bridge.getPlatform !== 'function') return null;

  return {
    async getInfo(): Promise<DesktopInfo> {
      const raw = await (bridge.getInfo ?? bridge.getPlatform)!.call(bridge);
      if (isRecord(raw) && typeof raw.platform === 'string' && typeof raw.version === 'string') {
        return { platform: raw.platform, version: raw.version };
      }
      return { platform: '', version: '' };
    },
    async getApiKeyStatus(): Promise<ApiKeyStatus> {
      const status = normalizeApiKeyStatus(await bridge.getApiKeyStatus.call(bridge));
      if (!status) throw new Error('API 키 상태를 읽을 수 없어요.');
      return status;
    },
    async setApiKey(provider, values): Promise<ApiKeyWriteResult> {
      try {
        return toWriteResult(await bridge.setApiKey.call(bridge, provider, values));
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : undefined };
      }
    },
    async clearApiKey(provider): Promise<ApiKeyWriteResult> {
      try {
        return toWriteResult(await bridge.clearApiKey.call(bridge, provider));
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : undefined };
      }
    },
    async openExternal(url): Promise<void> {
      await bridge.openExternal.call(bridge, url);
    },
  };
}

/** Local, non-secret marker that the first-run wizard was already shown once. */
export const API_SETUP_SEEN_KEY = 'jarizip:api-setup-wizard-seen';

export function hasSeenApiSetupWizard(): boolean {
  try {
    return globalThis.localStorage?.getItem(API_SETUP_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markApiSetupWizardSeen(): void {
  try {
    globalThis.localStorage?.setItem(API_SETUP_SEEN_KEY, '1');
  } catch {
    // Storage can be blocked; the wizard simply may appear again next launch.
  }
}

/**
 * The wizard auto-opens only for a genuine first run: the callers already know
 * the bridge exists, the key status is known, no approved source is
 * connected, and the user has not skipped/closed it before.
 */
export function shouldAutoOpenApiWizard(status: ApiKeyStatus | null, seen: boolean): boolean {
  if (!status) return false;
  return PROVIDERS.every(provider => !status[provider]) && !seen;
}

/** Connected providers in a stable, human-meaningful order. */
export function connectedProviders(status: ApiKeyStatus | null): ApiProvider[] {
  if (!status) return [];
  return PROVIDERS.filter(provider => status[provider]);
}
