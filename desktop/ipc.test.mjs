import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BRIDGE_METHODS, CHANNELS, PRELOAD_BRIDGE_KEY, createDesktopBridge, isProvider, toErrorResult, unwrapIpcResult, validateExternalUrl, validatePlatformInfo, validateStatus } from './ipc.mjs';
import { WINDOW_SECURITY, applyCredentialsToEnv, clearProviderKey, isAllowedOrigin, resolveAppDirectory, setProviderKey, webPreferences } from './config.mjs';

test('the preload exposes exactly the five agreed methods and freezes them', async () => {
  const bridge = createDesktopBridge(async () => ({ ok: true, value: null }));
  assert.deepEqual(Object.keys(bridge).sort(), [...BRIDGE_METHODS].sort());
  assert.deepEqual([...BRIDGE_METHODS].sort(), ['clearApiKey', 'getApiKeyStatus', 'getPlatform', 'openExternal', 'setApiKey']);
  assert.equal(Object.isFrozen(bridge), true);
  // No escape hatches commonly reached for from the renderer.
  for (const name of ['require', 'ipcRenderer', 'process', 'send', 'on', 'invoke']) assert.equal(name in bridge, false);
});

test('the preload never imports ipcRenderer into the page and uses the agreed channels', async () => {
  const source = await readFile(new URL('./preload.mjs', import.meta.url), 'utf8');
  assert.match(source, /contextBridge\.exposeInMainWorld\(PRELOAD_BRIDGE_KEY/);
  assert.equal(/exposeInMainWorld\([^)]*ipcRenderer/.test(source), false);
  // The preload must not pull filesystem/http code into the renderer process.
  assert.equal(/node:fs|node:http|node:child_process|safeStorage/.test(source), false);
});

test('every module the preload imports stays free of Node filesystem and network access', async () => {
  const source = await readFile(new URL('./ipc.mjs', import.meta.url), 'utf8');
  const providers = await readFile(new URL('./providers.mjs', import.meta.url), 'utf8');
  for (const module of [source, providers]) assert.equal(/node:fs|node:http|electron/.test(module), false);
  assert.match(source, /from '\.\/providers\.mjs'/);
});

test('the bridge maps every call onto a known channel and forwards validated values', async () => {
  const seen = [];
  const bridge = createDesktopBridge(async (channel, payload) => { seen.push([channel, payload]); return { ok: true, value: { channel } }; });
  await bridge.getPlatform();
  await bridge.getApiKeyStatus();
  await bridge.setApiKey('work24', 'key-value');
  await bridge.clearApiKey('saramin');
  await bridge.openExternal('https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do');
  assert.deepEqual(seen.map(([channel]) => channel), [CHANNELS.platform, CHANNELS.getApiKeyStatus, CHANNELS.setApiKey, CHANNELS.clearApiKey, CHANNELS.openExternal]);
  assert.deepEqual(seen[2][1], { provider: 'work24', key: 'key-value' });
  assert.deepEqual(seen[3][1], { provider: 'saramin' });
  assert.deepEqual(seen[4][1], { url: 'https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do' });
});

test('the bridge refuses unknown providers and non-https URLs before any IPC call', async () => {
  let calls = 0;
  const bridge = createDesktopBridge(async () => { calls++; return { ok: true, value: null }; });
  for (const provider of ['wanted', 'jumpit', 'zighang', 'WORK24', '', null, undefined, 7]) {
    await assert.rejects(bridge.setApiKey(provider, 'x'), /지원하지 않는/);
    await assert.rejects(bridge.clearApiKey(provider), /지원하지 않는/);
  }
  await assert.rejects(bridge.setApiKey('work24', 123), /문자열/);
  for (const url of ['http://example.com/', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'https://user:pw@example.com/', 'not a url', '', null, undefined, 42]) {
    await assert.rejects(bridge.openExternal(url), /https/);
  }
  assert.equal(calls, 0);
});

test('main-process failures surface as plain errors without leaking the raw result object', async () => {
  const bridge = createDesktopBridge(async () => ({ ok: false, error: { code: 'KEY_REQUIRED', message: '키가 필요해요.' } }));
  await assert.rejects(bridge.setApiKey('work24', 'x'), error => error instanceof Error && error.message === '키가 필요해요.');
  // The result object is never returned as a value.
  const value = await createDesktopBridge(async () => ({ ok: true, value: { provider: 'work24', configured: true } })).setApiKey('work24', 'x');
  assert.deepEqual(value, { provider: 'work24', configured: true });
  assert.deepEqual(toErrorResult(Object.assign(new Error('bad'), { code: 'BAD_KEY' })), { ok: false, error: { code: 'BAD_KEY', message: 'bad' } });
  assert.deepEqual(toErrorResult(undefined), { ok: false, error: { code: 'DESKTOP_ERROR', message: '데스크톱 요청을 처리하지 못했어요.' } });
  assert.equal(unwrapIpcResult({ ok: true, value: 1 }), 1);
});

test('status validation accepts exactly two known providers and drops unknown fields', () => {
  const good = validateStatus({ providers: [{ provider: 'work24', configured: false }, { provider: 'saramin', configured: true }], encryptionAvailable: true, secret: 'ignored' });
  assert.deepEqual(good, { providers: [{ provider: 'work24', configured: false }, { provider: 'saramin', configured: true }], encryptionAvailable: true });
  assert.equal(JSON.stringify(good).includes('secret'), false);
  for (const bad of [
    null, 'x', [],
    { providers: [{ provider: 'wanted', configured: true }, { provider: 'saramin', configured: true }] },
    { providers: [{ provider: 'work24', configured: 'yes' }, { provider: 'saramin', configured: true }] },
    { providers: [{ provider: 'work24', configured: true }] },
    { providers: [{ provider: 'work24', configured: true }, { provider: 'work24', configured: true }] },
    { providers: [{ provider: 'work24', configured: true }, { provider: 'saramin', key: 'leak' }] },
  ]) assert.throws(() => validateStatus(bad));
  assert.equal(isProvider('work24'), true);
  assert.equal(isProvider('wanted'), false);
});

test('URL validation only allows https URLs without embedded credentials', () => {
  assert.equal(validateExternalUrl('https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=1'), 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=1');
  assert.equal(validateExternalUrl('HTTPS://Example.com/Path'), 'https://example.com/Path');
  for (const bad of ['http://example.com/', 'ftp://example.com/', '//example.com/', 'https://user:pass@example.com/', 'https://', `https://example.com/${'a'.repeat(4000)}`]) {
    assert.equal(validateExternalUrl(bad), null, String(bad));
  }
});

test('window security flags keep the renderer isolated from Node', () => {
  assert.equal(WINDOW_SECURITY.contextIsolation, true);
  assert.equal(WINDOW_SECURITY.nodeIntegration, false);
  assert.equal(WINDOW_SECURITY.nodeIntegrationInWorker, false);
  assert.equal(WINDOW_SECURITY.webviewTag, false);
  // `sandbox` is false only because Electron cannot load an ESM preload in a sandboxed
  // renderer; contextIsolation + nodeIntegration:false still block page Node access.
  assert.equal(WINDOW_SECURITY.sandbox, false);
  const prefs = webPreferences('/tmp/preload.mjs');
  assert.equal(prefs.preload, '/tmp/preload.mjs');
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
});

test('assets resolve to resources/dist when packaged and <root>/dist otherwise', () => {
  const exists = path => path.endsWith('dist/index.html');
  assert.equal(resolveAppDirectory({ isPackaged: true, resourcesPath: '/opt/app/resources', root: '/src', exists }), '/opt/app/resources/dist');
  assert.equal(resolveAppDirectory({ isPackaged: false, resourcesPath: '/opt/app/resources', root: '/src', exists }), '/src/dist');
  // A packaged app whose resources are incomplete still falls back instead of crashing.
  assert.equal(resolveAppDirectory({ isPackaged: true, resourcesPath: '/opt/app/resources', root: '/src', exists: () => false }), '/src/dist');
});

test('credentials are mirrored into process.env and removed again on clear', () => {
  const fakeStore = { get: provider => provider === 'work24' ? 'work24-test-key' : null };
  const env = {};
  applyCredentialsToEnv(fakeStore, env);
  assert.deepEqual(env, { WORK24_AUTH_KEY: 'work24-test-key' });
  applyCredentialsToEnv({ get: () => null }, env);
  assert.deepEqual(env, {});
});

test('setting and clearing a key updates both the store and the live process environment', () => {
  const writes = [];
  const store = {
    values: new Map(),
    set(provider, value) { writes.push(['set', provider, value]); this.values.set(provider, value); },
    clear(provider) { writes.push(['clear', provider]); return this.values.delete(provider); },
  };
  const env = { UNRELATED: 'keep' };
  const context = { store, env };

  assert.deepEqual(setProviderKey(context, 'work24', '  work24-test-key  '), { provider: 'work24', configured: true });
  assert.deepEqual(env, { UNRELATED: 'keep', WORK24_AUTH_KEY: 'work24-test-key' });
  assert.deepEqual(setProviderKey(context, 'saramin', 'saramin-test-key'), { provider: 'saramin', configured: true });
  assert.equal(env.SARAMIN_ACCESS_KEY, 'saramin-test-key');

  assert.deepEqual(clearProviderKey(context, 'work24'), { provider: 'work24', configured: false, removed: true });
  assert.equal('WORK24_AUTH_KEY' in env, false);
  assert.equal(env.SARAMIN_ACCESS_KEY, 'saramin-test-key');
  assert.deepEqual(clearProviderKey(context, 'work24'), { provider: 'work24', configured: false, removed: false });

  // A rejected key must never reach the store or the environment.
  assert.throws(() => setProviderKey(context, 'saramin', ''), error => error.code === 'BAD_KEY');
  assert.throws(() => setProviderKey(context, 'wanted', 'x'), error => error.code === 'BAD_PROVIDER');
  assert.throws(() => clearProviderKey(context, 'jumpit'), error => error.code === 'BAD_PROVIDER');
  assert.equal(env.SARAMIN_ACCESS_KEY, 'saramin-test-key');
  assert.deepEqual(writes.map(([action]) => action), ['set', 'set', 'clear', 'clear']);
});

test('only the loopback origin the window loaded is allowed to navigate', () => {
  const url = 'http://127.0.0.1:4178/';
  assert.equal(isAllowedOrigin('http://127.0.0.1:4178/app/discover', url), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:4179/', url), false);
  assert.equal(isAllowedOrigin('https://www.saramin.co.kr/', url), false);
  assert.equal(isAllowedOrigin('not a url', url), false);
});
