import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createEnvCredentialStore, ENV_FILE, MAX_KEY_LENGTH, normalizeKey, patchEnvText, PROVIDER_ENV } from './credentials.mjs';
import { createAppServer } from './http.mjs';

// Every key here is synthetic. No real Work24/Saramin credential is used, and no
// request leaves the loopback listener.
const WORK24_KEY = 'test-only-work24-key-0001';
const SARAMIN_KEY = 'test-only-saramin-key-0002';

async function withTemp(run) {
  const directory = await mkdtemp(join(tmpdir(), 'jarizip-env-keys-'));
  try { await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

async function start(directory, options = {}) {
  const env = {};
  const credentials = createEnvCredentialStore({ file: join(directory, ENV_FILE), env, logger: { warn() {} } });
  // One env object is shared by the credential store and the default job service exactly
  // as in `server/index.mjs`, so a saved key enables the source without a restart.
  const server = createAppServer({ directory, env, credentials, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, env, credentials, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

const put = (base, provider, key, headers = {}) => fetch(`${base}/api/credentials/${provider}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ key }),
});
const del = (base, provider, headers = {}) => fetch(`${base}/api/credentials/${provider}`, { method: 'DELETE', headers });
const status = base => fetch(`${base}/api/credentials`);
const sources = base => fetch(`${base}/api/sources`);

test('normalizeKey trims and accepts a safe printable key, rejecting unsafe input', () => {
  assert.equal(normalizeKey(`  ${WORK24_KEY}  `), WORK24_KEY);
  assert.equal(normalizeKey('ab+cd/ef=='), 'ab+cd/ef==');
  assert.equal(normalizeKey('has space # kept'), 'has space # kept');
  for (const bad of ['', '   ', 42, null, undefined, 'a\nb', `oops'quote`]) assert.throws(() => normalizeKey(bad), error => error.code === 'BAD_KEY');
  assert.throws(() => normalizeKey('x'.repeat(MAX_KEY_LENGTH + 1)), error => error.code === 'BAD_KEY');
});

test('patchEnvText preserves unrelated lines, comments and other variables', () => {
  const original = '# keep this comment\nWORK24_AUTH_KEY=old-value\nOTHER_VAR=untouched\n# another\n';
  const patched = patchEnvText(original, 'SARAMIN_ACCESS_KEY', SARAMIN_KEY);
  assert.match(patched, /# keep this comment/);
  assert.match(patched, /# another/);
  assert.match(patched, /OTHER_VAR=untouched/);
  assert.match(patched, new RegExp(`WORK24_AUTH_KEY=old-value`));
  assert.match(patched, new RegExp(`${PROVIDER_ENV.saramin}='${SARAMIN_KEY}'`));
  // Replacing an existing line keeps its position and does not duplicate it.
  const replaced = patchEnvText(patched, 'WORK24_AUTH_KEY', WORK24_KEY);
  assert.equal((replaced.match(/WORK24_AUTH_KEY=/g) || []).length, 1);
  assert.match(replaced, new RegExp(`${PROVIDER_ENV.work24}='${WORK24_KEY}'`));
  // Clearing writes an empty assignment and keeps the line.
  const cleared = patchEnvText(replaced, 'WORK24_AUTH_KEY', null);
  assert.equal((cleared.match(/WORK24_AUTH_KEY=/g) || []).length, 1);
  assert.match(cleared, /WORK24_AUTH_KEY=\n/);
  assert.match(cleared, /OTHER_VAR=untouched/);
});

test('a key saved to a temp dir persists, updates the live env, and clears again', async () => {
  await withTemp(async directory => {
    const env = {};
    const credentials = createEnvCredentialStore({ file: join(directory, ENV_FILE), env, logger: { warn() {} } });
    assert.deepEqual(credentials.providers(), [{ provider: 'work24', configured: false }, { provider: 'saramin', configured: false }]);

    credentials.set('work24', WORK24_KEY);
    // Written to disk and to the exact env object the job service reads.
    assert.equal(env.WORK24_AUTH_KEY, WORK24_KEY);
    const body = await readFile(join(directory, ENV_FILE), 'utf8');
    assert.match(body, new RegExp(`WORK24_AUTH_KEY='${WORK24_KEY}'`));

    // Re-parsing the same file body yields the value typed at save time (round-trip).
    const parsed = parseEnv(body);
    assert.equal(parsed.WORK24_AUTH_KEY, WORK24_KEY);
    assert.equal(credentials.configured('work24'), true);

    // `process.loadEnvFile` is what `server/index.mjs` uses on the next start, so the
    // written syntax must round-trip through it exactly for tricky-but-realistic keys.
    const tricky = 'ab+cd/ef== gh#ij$kl"mn';
    credentials.set('saramin', tricky);
    const before = process.env.SARAMIN_ACCESS_KEY;
    process.loadEnvFile(join(directory, ENV_FILE));
    assert.equal(process.env.SARAMIN_ACCESS_KEY, tricky);
    if (before === undefined) delete process.env.SARAMIN_ACCESS_KEY; else process.env.SARAMIN_ACCESS_KEY = before;
    credentials.clear('saramin');

    const cleared = credentials.clear('work24');
    assert.equal(cleared.removed, true);
    assert.equal(env.WORK24_AUTH_KEY, undefined);
    assert.equal(credentials.configured('work24'), false);
    assert.equal(credentials.clear('work24').removed, false);
  });
});

test('credential writes are atomic and restrictive on POSIX', { skip: process.platform === 'win32' }, async () => {
  await withTemp(async directory => {
    const credentials = createEnvCredentialStore({ file: join(directory, ENV_FILE), env: {}, logger: { warn() {} } });
    credentials.set('work24', WORK24_KEY);
    const mode = (await stat(join(directory, ENV_FILE))).mode & 0o777;
    assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
    assert.deepEqual((await readdir(directory)).filter(name => name.endsWith('.tmp')), []);
  });
});

test('only work24 and saramin are accepted and bad providers, keys or bodies are refused', async () => {
  await withTemp(async directory => {
    const { base, close } = await start(directory);
    try {
      assert.equal((await put(base, 'wanted', 'x')).status, 400);
      assert.equal((await put(base, 'work24', '')).status, 400);
      assert.equal((await fetch(`${base}/api/credentials/work24`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: 'not json' })).status, 400);
      assert.equal((await fetch(`${base}/api/credentials/work24`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ key: WORK24_KEY }) })).status, 415);
      assert.equal((await fetch(`${base}/api/credentials/work24`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 7 }) })).status, 400);
      assert.equal((await fetch(`${base}/api/credentials/work24`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' } })).status, 405);
      assert.equal((await fetch(`${base}/api/credentials`, { method: 'PUT', headers: { 'Content-Type': 'application/json' } })).status, 405);
      assert.equal((await status(base)).status, 200);
    } finally { await close(); }
  });
});

test('an oversized or cross-site credential request is rejected before touching disk', async () => {
  await withTemp(async directory => {
    const { base, close } = await start(directory);
    try {
      const big = await fetch(`${base}/api/credentials/work24`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'x'.repeat(5000) }) });
      assert.equal(big.status, 413);
      const crossSite = await fetch(`${base}/api/credentials/work24`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid' }, body: JSON.stringify({ key: WORK24_KEY }) });
      assert.equal(crossSite.status, 403);
      assert.equal((await crossSite.json()).error.code, 'FORBIDDEN');
      const secFetch = await fetch(`${base}/api/credentials`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
      assert.equal(secFetch.status, 403);
      assert.equal((await fetch(`${base}/api/credentials`, { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
      await assert.rejects(readFile(join(directory, ENV_FILE)), error => error.code === 'ENOENT');
    } finally { await close(); }
  });
});

test('responses never contain the secret value', async () => {
  await withTemp(async directory => {
    const { base, close } = await start(directory);
    try {
      const saved = await put(base, 'work24', WORK24_KEY);
      const savedText = await saved.text();
      assert.doesNotMatch(savedText, new RegExp(WORK24_KEY));
      assert.deepEqual(JSON.parse(savedText).providers, [{ provider: 'work24', configured: true }, { provider: 'saramin', configured: false }]);
      const listed = await (await status(base)).text();
      assert.doesNotMatch(listed, new RegExp(WORK24_KEY));
      const cleared = await (await del(base, 'work24')).text();
      assert.doesNotMatch(cleared, new RegExp(WORK24_KEY));
      // Nor in the sources payload or an error message.
      await put(base, 'work24', WORK24_KEY);
      assert.doesNotMatch(await (await sources(base)).text(), new RegExp(WORK24_KEY));
    } finally { await close(); }
  });
});

test('saving a Work24 key through HTTP enables the already-created source without a restart', async () => {
  await withTemp(async directory => {
    const { base, env, close } = await start(directory);
    try {
      const readSources = async () => Object.fromEntries((await (await sources(base)).json()).sources.map(source => [source.id, source.enabled]));
      assert.equal((await readSources()).work24, false);
      const saved = await put(base, 'work24', WORK24_KEY);
      assert.equal(saved.status, 200);
      assert.equal(env.WORK24_AUTH_KEY, WORK24_KEY);
      assert.equal((await readSources()).work24, true);
      assert.equal((await readSources()).saramin, false);

      await put(base, 'saramin', SARAMIN_KEY);
      assert.equal((await readSources()).saramin, true);

      await del(base, 'work24');
      assert.equal(env.WORK24_AUTH_KEY, undefined);
      const afterClear = await readSources();
      assert.equal(afterClear.work24, false);
      assert.equal(afterClear.saramin, true);
    } finally { await close(); }
  });
});

test('an existing .env.local keeps its comments and other variables across a save', async () => {
  await withTemp(async directory => {
    const original = '# 사용자가 직접 적은 설명\nWORK24_AUTH_KEY=placeholder\nJARIZIP_ALLOWED_HOSTS=localhost\n# trailing comment\n';
    await writeFile(join(directory, ENV_FILE), original);
    const { base, env, close } = await start(directory);
    try {
      await put(base, 'work24', WORK24_KEY);
      await put(base, 'saramin', SARAMIN_KEY);
      const body = await readFile(join(directory, ENV_FILE), 'utf8');
      assert.match(body, /# 사용자가 직접 적은 설명/);
      assert.match(body, /# trailing comment/);
      assert.match(body, /JARIZIP_ALLOWED_HOSTS=localhost/);
      assert.match(body, new RegExp(`WORK24_AUTH_KEY='${WORK24_KEY}'`));
      assert.match(body, new RegExp(`SARAMIN_ACCESS_KEY='${SARAMIN_KEY}'`));
      assert.equal(env.SARAMIN_ACCESS_KEY, SARAMIN_KEY);
      await del(base, 'work24');
      const cleared = await readFile(join(directory, ENV_FILE), 'utf8');
      assert.match(cleared, /# 사용자가 직접 적은 설명/);
      assert.match(cleared, /JARIZIP_ALLOWED_HOSTS=localhost/);
      assert.match(cleared, /WORK24_AUTH_KEY=\n/);
    } finally { await close(); }
  });
});

test('the desktop app server creates no credential endpoint at all', async () => {
  await withTemp(async directory => {
    // Exactly how the Electron host builds its server: no credential store.
    const server = createAppServer({ directory, env: {} });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      assert.equal((await status(base)).status, 404);
      assert.equal((await put(base, 'work24', WORK24_KEY)).status, 404);
      assert.equal((await del(base, 'work24')).status, 404);
      assert.equal(await (await status(base)).json().then(body => body.error.code), 'NOT_FOUND');
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  });
});

test('the public static route for the env file is still not served', async () => {
  await withTemp(async directory => {
    await writeFile(join(directory, ENV_FILE), `WORK24_AUTH_KEY='${WORK24_KEY}'\n`);
    const { base, close } = await start(directory);
    try {
      assert.equal((await fetch(`${base}/.env.local`)).status, 404);
      assert.equal((await fetch(`${base}/.env`)).status, 404);
    } finally { await close(); }
  });
});
