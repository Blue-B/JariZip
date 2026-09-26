// IPC contract shared by the Electron main process, the preload bridge and its tests.
//
// This module holds only channel names and pure validators so it can run in plain Node,
// in the sandboxed preload and in tests without importing Electron. The preload exposes a
// deliberately tiny surface; nothing else from Node/Electron reaches the renderer.
import { PROVIDERS } from './providers.mjs';

export const CHANNELS = Object.freeze({
  platform: 'jarizip:platform',
  getApiKeyStatus: 'jarizip:api-key:status',
  setApiKey: 'jarizip:api-key:set',
  clearApiKey: 'jarizip:api-key:clear',
  openExternal: 'jarizip:open-external',
});

export const PRELOAD_BRIDGE_KEY = 'jarizipDesktop';

/** The exact set of methods the preload exposes on `window.jarizipDesktop`. */
export const BRIDGE_METHODS = Object.freeze(['getPlatform', 'getApiKeyStatus', 'setApiKey', 'clearApiKey', 'openExternal']);

/** Status payload returned by getApiKeyStatus(): booleans only, never a key. */
export function validateStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('API 키 상태 형식이 올바르지 않아요.');
  const providers = value.providers;
  if (!Array.isArray(providers) || providers.length !== PROVIDERS.length) throw new Error('API 키 상태 형식이 올바르지 않아요.');
  const seen = [];
  const result = providers.map(entry => {
    if (!entry || typeof entry !== 'object' || typeof entry.provider !== 'string' || !PROVIDERS.includes(entry.provider) || typeof entry.configured !== 'boolean' || seen.includes(entry.provider)) {
      throw new Error('API 키 상태 형식이 올바르지 않아요.');
    }
    seen.push(entry.provider);
    return { provider: entry.provider, configured: entry.configured };
  });
  return { providers: result, encryptionAvailable: value.encryptionAvailable !== false };
}

/** Validate a provider argument on either side of the bridge. Returns null when unusable. */
export function isProvider(value) {
  return typeof value === 'string' && PROVIDERS.includes(value);
}

/**
 * Accept only absolute HTTPS URLs with no credentials and no fragment-based tricks.
 * Returns a normalized href string, or null when the URL must be refused.
 */
export function validateExternalUrl(value, maxLength = 2048) {
  if (typeof value !== 'string' || !value || value.length > maxLength) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url.href;
}

/** A minimal platform/version payload for the renderer. No paths, no hostnames. */
export function validatePlatformInfo(value) {
  if (!value || typeof value !== 'object' || typeof value.platform !== 'string' || typeof value.version !== 'string') throw new Error('데스크톱 정보 형식이 올바르지 않아요.');
  return { platform: value.platform, version: value.version };
}

/** Wrap an arbitrary thrown value into a serializable IPC error result. */
export function toErrorResult(error) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : 'DESKTOP_ERROR';
  const message = error instanceof Error && error.message ? error.message : '데스크톱 요청을 처리하지 못했어요.';
  return { ok: false, error: { code, message } };
}

/** Turn a raw main-process IPC result into a value or a plain Error. */
export function unwrapIpcResult(result) {
  if (result && typeof result === 'object' && result.ok === false) {
    const error = new Error(result.error?.message || '데스크톱 요청을 처리하지 못했어요.');
    error.code = result.error?.code || 'DESKTOP_ERROR';
    throw error;
  }
  return result && typeof result === 'object' && result.ok === true ? result.value : result;
}

/**
 * Build the renderer-facing bridge from an `invoke(channel, payload)` function.
 * Kept free of Electron imports so the exact exposed surface can be tested in plain Node.
 */
export function createDesktopBridge(invoke) {
  if (typeof invoke !== 'function') throw new Error('createDesktopBridge requires an invoke function');
  const call = async (channel, payload) => {
    try { return unwrapIpcResult(await invoke(channel, payload)); }
    catch (error) { throw new Error(error instanceof Error && error.message ? error.message : '데스크톱 요청을 처리하지 못했어요.'); }
  };
  const bridge = {
    /** 'win32' | 'darwin' | 'linux' and the app version. */
    getPlatform: () => call(CHANNELS.platform),
    /** { providers: [{ provider, configured }], encryptionAvailable } — booleans only. */
    getApiKeyStatus: () => call(CHANNELS.getApiKeyStatus),
    /** Encrypt and persist a provider key, then mirror it into process.env. */
    setApiKey: (provider, key) => {
      if (!isProvider(provider)) return Promise.reject(new Error('지원하지 않는 공고 출처예요.'));
      if (typeof key !== 'string') return Promise.reject(new Error('API 키는 문자열이어야 해요.'));
      return call(CHANNELS.setApiKey, { provider, key });
    },
    /** Remove a stored key and its process.env mirror. */
    clearApiKey: provider => {
      if (!isProvider(provider)) return Promise.reject(new Error('지원하지 않는 공고 출처예요.'));
      return call(CHANNELS.clearApiKey, { provider });
    },
    /** Open an https: URL in the user's default browser. Other schemes are refused. */
    openExternal: url => {
      const href = validateExternalUrl(url);
      if (!href) return Promise.reject(new Error('https 주소만 열 수 있어요.'));
      return call(CHANNELS.openExternal, { url: href });
    },
  };
  for (const name of BRIDGE_METHODS) Object.freeze(bridge[name]);
  return Object.freeze(bridge);
}
