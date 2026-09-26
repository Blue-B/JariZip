import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCredentialStore, CredentialError, MAX_KEY_LENGTH, PROVIDER_ENV, PROVIDERS, STORE_FILE, STORE_VERSION } from './credentials.mjs';

// A reversible fake standing in for Electron's OS-keychain-backed safeStorage. It is
// deliberately not encryption; the real DPAPI/keychain call is only reachable from the
// Electron main process and is exercised by the smoke test.
const fakeSafeStorage = (available = true, backend = 'basic_text') => ({
  isEncryptionAvailable: () => available,
  getSelectedStorageBackend: () => backend,
  encryptString: value => Buffer.from(`safe:${value}`),
  decryptString: buffer => buffer.toString('utf8').replace(/^safe:/, ''),
});

const silent = { warn: () => {}, error: () => {} };

async function withStore(run, { available = true, backend = 'basic_text' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'jarizip-credentials-'));
  try {
    const store = createCredentialStore({ directory, safeStorage: fakeSafeStorage(available, backend), logger: silent });
    await run(store, directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('only the two officially approved providers are accepted', async () => {
  assert.deepEqual([...PROVIDERS], ['work24', 'saramin']);
  assert.deepEqual(PROVIDER_ENV, { work24: 'WORK24_AUTH_KEY', saramin: 'SARAMIN_ACCESS_KEY' });
  await withStore(store => {
    assert.equal(store.get('work24'), null);
    for (const provider of ['wanted', 'jumpit', 'zighang', '', 'WORK24', null, 42, undefined]) {
      assert.throws(() => store.get(provider), error => error instanceof CredentialError && error.code === 'BAD_PROVIDER');
      assert.throws(() => store.set(provider, 'value'), error => error.code === 'BAD_PROVIDER');
      assert.throws(() => store.clear(provider), error => error.code === 'BAD_PROVIDER');
    }
  });
});

test('a stored key round-trips and its plaintext is never written to disk', async () => {
  await withStore(async (store, directory) => {
    const secret = 'work24-test-key-0001';
    assert.equal(store.set('work24', secret), true);
    assert.equal(store.get('work24'), secret);
    const body = await readFile(join(directory, STORE_FILE), 'utf8');
    assert.equal(body.includes(secret), false);
    const parsed = JSON.parse(body);
    assert.equal(parsed.version, STORE_VERSION);
    assert.equal(typeof parsed.providers.work24, 'string');
    assert.notEqual(parsed.providers.work24, secret);
  });
});

test('the credential file is owner-only where the platform supports POSIX modes', async () => {
  await withStore(async (store, directory) => {
    store.set('saramin', 'saramin-test-key-0001');
    const mode = (await stat(join(directory, STORE_FILE))).mode & 0o777;
    if (process.platform !== 'win32') assert.equal(mode, 0o600);
  });
});

test('clearing removes only the requested provider and is idempotent', async () => {
  await withStore(async (store, directory) => {
    store.set('work24', 'work24-test-key');
    store.set('saramin', 'saramin-test-key');
    assert.equal(store.clear('work24'), true);
    assert.equal(store.get('work24'), null);
    assert.equal(store.get('saramin'), 'saramin-test-key');
    assert.equal(store.clear('work24'), false);
    const parsed = JSON.parse(await readFile(join(directory, STORE_FILE), 'utf8'));
    assert.deepEqual(Object.keys(parsed.providers), ['saramin']);
  });
});

test('status exposes booleans only, never a key', async () => {
  await withStore(store => {
    store.set('saramin', 'saramin-test-key');
    const status = store.providers();
    assert.deepEqual(status, [{ provider: 'work24', configured: false }, { provider: 'saramin', configured: true }]);
    assert.equal(JSON.stringify(status).includes('saramin-test-key'), false);
  });
});

test('keys are trimmed, and empty, oversized or control-character keys are rejected', async () => {
  await withStore(store => {
    assert.equal(store.set('work24', '  padded-key  '), true);
    assert.equal(store.get('work24'), 'padded-key');
    for (const bad of ['', '   ', null, undefined, 42, {}, []]) {
      assert.throws(() => store.set('work24', bad), error => error.code === 'BAD_KEY');
    }
    assert.throws(() => store.set('work24', 'x'.repeat(MAX_KEY_LENGTH + 1)), error => error.code === 'BAD_KEY');
    assert.equal(store.set('work24', 'y'.repeat(MAX_KEY_LENGTH)), true);
    assert.throws(() => store.set('work24', 'bad\nkey'), error => error.code === 'BAD_KEY');
    assert.throws(() => store.set('work24', 'bad\u0000key'), error => error.code === 'BAD_KEY');
  });
});

test('a machine without OS encryption refuses to store rather than writing plaintext', async () => {
  await withStore(store => {
    assert.equal(store.encryptionAvailable(), false);
    assert.throws(() => store.set('work24', 'work24-test-key'), error => error.code === 'ENCRYPTION_UNAVAILABLE');
    assert.equal(store.get('work24'), null);
  }, { available: false });
});

test('unreadable or foreign credential files degrade to "not configured" without throwing', async () => {
  await withStore(async (store, directory) => {
    const file = join(directory, STORE_FILE);
    // A version bump from a future build must not be treated as valid ciphertext.
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, JSON.stringify({ version: 999, providers: { work24: 'AAAA' } }));
    assert.equal(store.get('work24'), null);
    await writeFile(file, '{ not json');
    assert.equal(store.get('work24'), null);
    // Writing again repairs the file for the current version.
    store.set('work24', 'recovered-key');
    assert.equal(store.get('work24'), 'recovered-key');
  });
});
