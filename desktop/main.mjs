// JariZip desktop shell (Electron main process).
//
// Responsibilities:
//   1. Own a single app instance.
//   2. Encrypt API credentials with safeStorage into app.getPath('userData').
//   3. Start the existing `createAppServer` bound to 127.0.0.1 on a stable local port.
//   4. Load that origin into one hardened BrowserWindow.
//
// Hardening: contextIsolation on, nodeIntegration off, no renderer navigation away from the
// loopback origin, new windows denied, external links opened through the OS browser, and a
// five-method preload bridge. Decrypted keys stay in this process and are mirrored only into
// process.env for the already-created job service.
import { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell } from 'electron';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '../server/http.mjs';
import { applyCredentialsToEnv, clearProviderKey, isAllowedOrigin, resolveAppDirectory, setProviderKey, WINDOW_BOUNDS, webPreferences } from './config.mjs';
import { createCredentialStore } from './credentials.mjs';
import { CHANNELS, toErrorResult, validateExternalUrl, validatePlatformInfo, validateStatus } from './ipc.mjs';
import { startDesktopServer } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const isSmokeTest = process.argv.includes('--smoke-test') || process.env.JARIZIP_DESKTOP_SMOKE === '1';

const ok = value => ({ ok: true, value });
const fail = error => toErrorResult(error);

function registerIpcHandlers(context) {
  ipcMain.handle(CHANNELS.platform, () => ok(validatePlatformInfo({ platform: process.platform, version: app.getVersion() })));

  ipcMain.handle(CHANNELS.getApiKeyStatus, () => ok(validateStatus({
    providers: context.store.providers(),
    encryptionAvailable: context.store.encryptionAvailable(),
  })));

  ipcMain.handle(CHANNELS.setApiKey, (_event, payload) => {
    try { return ok(setProviderKey(context, payload?.provider, payload?.key)); }
    catch (error) { return fail(error); }
  });

  ipcMain.handle(CHANNELS.clearApiKey, (_event, payload) => {
    try { return ok(clearProviderKey(context, payload?.provider)); }
    catch (error) { return fail(error); }
  });

  ipcMain.handle(CHANNELS.openExternal, async (_event, payload) => {
    try {
      const href = validateExternalUrl(payload?.url);
      if (!href) throw Object.assign(new Error('https 주소만 열 수 있어요.'), { code: 'BAD_URL' });
      await shell.openExternal(href);
      return ok({ opened: true });
    } catch (error) { return fail(error); }
  });
}

function hardenWindow(window, serverUrl) {
  const contents = window.webContents;
  // The app never opens child windows; links go to the user's browser instead.
  contents.setWindowOpenHandler(({ url }) => {
    const href = validateExternalUrl(url);
    if (href) void shell.openExternal(href);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isAllowedOrigin(url, serverUrl)) return;
    event.preventDefault();
    const href = validateExternalUrl(url);
    if (href) void shell.openExternal(href);
  });
  contents.on('will-attach-webview', event => event.preventDefault());
}

async function createMainWindow(serverUrl) {
  const window = new BrowserWindow({ ...WINDOW_BOUNDS, webPreferences: webPreferences(join(here, 'preload.mjs')) });
  hardenWindow(window, serverUrl);
  window.once('ready-to-show', () => window.show());
  await window.loadURL(serverUrl);
  return window;
}

/**
 * Smoke test used by `npm run desktop:smoke`: prove the shell loads and that the credential
 * path works end to end. It calls only the preload bridge, so it exercises the same surface
 * the renderer has. A synthetic key is used and removed again; real keys are never involved.
 */
async function runSmokeTest(window, store, env) {
  const result = await window.webContents.executeJavaScript(`(async () => {
    const api = window.jarizipDesktop;
    if (!api) return { bridge: typeof api };
    const before = await api.getApiKeyStatus();
    const synthetic = 'smoke-test-key-not-real';
    let setError = null;
    try { await api.setApiKey('work24', synthetic); } catch (error) { setError = error.message; }
    const during = await api.getApiKeyStatus();
    await api.clearApiKey('work24');
    const after = await api.getApiKeyStatus();
    let badUrl = null;
    try { await api.openExternal('http://example.com/'); } catch (error) { badUrl = error.message; }
    // Give the first-run wizard a moment to auto-open, then confirm the page it renders.
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && !document.querySelector('[data-testid="api-setup-wizard"]')) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return {
      title: document.title,
      hasRoot: Boolean(document.getElementById('root')),
      bridge: typeof api,
      methods: Object.keys(api).sort(),
      platform: await api.getPlatform(),
      encryptionAvailable: before.encryptionAvailable,
      wizardVisible: Boolean(document.querySelector('[data-testid="api-setup-wizard"]')),
      wizardText: document.querySelector('[data-testid="api-setup-wizard"]')?.innerText?.slice(0, 120) ?? '',
      browserStorage: JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
      before, during, after, setError, badUrl,
    };
  })()`);
  // The synthetic key must exist nowhere: not in the store, not in the environment, not in stdout.
  const envVariables = ['WORK24_AUTH_KEY', 'SARAMIN_ACCESS_KEY'];
  const leakedEnv = envVariables.filter(name => String(env[name] ?? '').includes('smoke-test-key'));
  const stillStored = store.get('work24') !== null;
  const { status, ...reportable } = result;
  console.log(JSON.stringify({ smoke: 'ok', ...reportable, encryptionAvailable: result.encryptionAvailable, leakedEnv, stillStored }, null, 2));
  if (result.bridge !== 'object' || result.hasRoot !== true) return false;
  // The renderer must never persist the key in localStorage/sessionStorage.
  if (String(result.browserStorage ?? '').includes('smoke-test-key')) {
    console.error('[desktop] 스모크 검사: 브라우저 저장소에 키가 남았습니다.');
    return false;
  }
  if (!result.wizardVisible) {
    console.error('[desktop] 스모크 검사: 첫 설정 안내가 데스크톱 앱에서 열리지 않았습니다.');
    return false;
  }
  if (leakedEnv.length || stillStored) {
    console.error('[desktop] 스모크 검사가 임시 키를 정리하지 못했습니다.');
    return false;
  }
  return true;
}

async function main() {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  // The smoke test must not read or write a real user's credential file or localStorage,
  // so it runs against a throwaway userData directory for one launch only.
  if (isSmokeTest) app.setPath('userData', mkdtempSync(join(tmpdir(), 'jarizip-desktop-smoke-')));
  let window = null;
  let started;
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && started) void createMainWindow(started.url).then(created => { window = created; }); });

  await app.whenReady();
  if (process.platform === 'win32') app.setAppUserModelId('com.jarizip.desktop');
  if (app.isPackaged) Menu.setApplicationMenu(null);

  const store = createCredentialStore({ directory: app.getPath('userData'), safeStorage });
  const context = { store, env: process.env };
  applyCredentialsToEnv(store);
  registerIpcHandlers(context);

  try {
    started = await startDesktopServer({
      preferredPort: DEFAULT_PORT,
      directory: resolveAppDirectory({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, root }),
    });
  } catch (error) {
    const message = error?.code === 'EADDRINUSE'
      ? error.message
      : '로컬 조회 서버를 열지 못했어요. 앱을 다시 실행해주세요.';
    dialog.showErrorBox('JariZip을 시작하지 못했어요', message);
    console.error(`[desktop] 서버 시작 실패: ${error instanceof Error ? error.message : String(error)}`);
    app.exit(1);
    return;
  }
  // Only the loopback origin and never a key value is printed.
  console.log(`[desktop] ${started.url}${started.fallback ? ' (기본 포트 사용 중, 임시 포트로 시작)' : ''}`);

  app.on('before-quit', () => { void started.close(); });
  try {
    window = await createMainWindow(started.url);
  } catch (error) {
    console.error(`[desktop] 창을 열지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    app.exit(1);
    return;
  }
  if (isSmokeTest) {
    let passed = false;
    try { passed = await runSmokeTest(window, store, context.env); }
    catch (error) { console.error(`[desktop] 스모크 검사 실패: ${error instanceof Error ? error.message : String(error)}`); }
    await started.close();
    app.exit(passed ? 0 : 1);
  }
}

main().catch(error => {
  console.error(`[desktop] 시작 오류: ${error instanceof Error ? error.message : String(error)}`);
  app.exit(1);
});
