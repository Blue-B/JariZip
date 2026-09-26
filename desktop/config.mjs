// Pure configuration helpers for the Electron main process.
//
// Kept separate from `main.mjs` so the security-relevant window options, the packaged
// asset directory resolution and the process.env credential mirror can be unit-tested
// without importing Electron.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeKey, PROVIDER_ENV } from './credentials.mjs';
import { isProvider } from './ipc.mjs';

/**
 * Window security preferences. contextIsolation is on and nodeIntegration is off, so the
 * page cannot reach Node/Electron except through the frozen preload bridge.
 *
 * `sandbox: false` is required, not a relaxation: Electron's sandboxed preload loader
 * cannot load an ESM preload (`preload.mjs`), which this shell needs to share `ipc.mjs`.
 * The preload imports only `electron` and leaf modules free of `node:fs`/`node:http`, and
 * the renderer never receives a Node global. `safeStorage` and the credential store live
 * only in the main process.
 */
export const WINDOW_SECURITY = Object.freeze({
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  webviewTag: false,
  sandbox: false,
  spellcheck: false,
});

export const WINDOW_BOUNDS = Object.freeze({ width: 1280, height: 860, minWidth: 960, minHeight: 640, show: false, backgroundColor: '#eef2f8', autoHideMenuBar: true, title: 'JariZip' });

/** Full webPreferences object for the single BrowserWindow. */
export function webPreferences(preloadPath) {
  return { ...WINDOW_SECURITY, preload: preloadPath };
}

/**
 * Built assets live in `resources/dist` in the packaged app and in `<root>/dist` in dev.
 * Falls back to the repo build when the packaged copy is missing so the shell still opens.
 */
export function resolveAppDirectory({ isPackaged, resourcesPath, root, exists = existsSync } = {}) {
  if (isPackaged && resourcesPath) {
    const packaged = join(resourcesPath, 'dist');
    if (exists(join(packaged, 'index.html'))) return packaged;
  }
  return join(root, 'dist');
}

/**
 * Copy stored credentials into process.env so the already-created job service sees them.
 * Decrypted values stay inside the main process; only the env variable named by each
 * provider adapter is set. Removing a key clears its variable.
 */
export function applyCredentialsToEnv(store, env = process.env) {
  for (const [provider, variable] of Object.entries(PROVIDER_ENV)) {
    const value = store.get(provider);
    if (value) env[variable] = value;
    else delete env[variable];
  }
  return env;
}

/** The only origins the window may navigate to: the loopback server it was given. */
export function isAllowedOrigin(url, serverUrl) {
  try { return new URL(url).origin === new URL(serverUrl).origin; } catch { return false; }
}

const badProvider = () => Object.assign(new Error('지원하지 않는 공고 출처예요.'), { code: 'BAD_PROVIDER' });

/**
 * Store a provider key and mirror it into the given env object so the already-created job
 * service picks it up without a restart. Throws for unknown providers or invalid keys.
 */
export function setProviderKey({ store, env = process.env }, provider, key) {
  if (!isProvider(provider)) throw badProvider();
  const value = normalizeKey(key);
  store.set(provider, value);
  env[PROVIDER_ENV[provider]] = value;
  return { provider, configured: true };
}

/** Remove a stored key and its env mirror. Returns whether ciphertext existed on disk. */
export function clearProviderKey({ store, env = process.env }, provider) {
  if (!isProvider(provider)) throw badProvider();
  const removed = store.clear(provider);
  delete env[PROVIDER_ENV[provider]];
  return { provider, configured: false, removed };
}
