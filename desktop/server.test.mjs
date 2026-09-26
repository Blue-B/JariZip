import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PORT } from '../server/http.mjs';
import { clearProviderKey, setProviderKey } from './config.mjs';
import { startDesktopServer, isValidPort } from './server.mjs';

async function freePort() {
  const probe = createTcpServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise(resolveClose => probe.close(resolveClose));
  return port;
}

/** Fetch with a caller-chosen Host header; fetch() forbids overriding it. */
function fetchWithHost(port, pathname, hostHeader) {
  return new Promise((resolveRequest, rejectRequest) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: pathname, method: 'GET', headers: { Host: hostHeader } }, res => {
      res.resume();
      res.once('end', () => resolveRequest(res.statusCode));
    });
    req.once('error', rejectRequest);
    req.end();
  });
}

async function withDist(run) {
  const directory = await mkdtemp(join(tmpdir(), 'jarizip-desktop-dist-'));
  try {
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>자리집</title><div id="root"></div>');
    await run(directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('ports outside the documented range are rejected', () => {
  assert.equal(DEFAULT_PORT, 4178);
  assert.equal(isValidPort(1024), true);
  assert.equal(isValidPort(4178), true);
  assert.equal(isValidPort(65535), true);
  for (const bad of [0, 80, 1023, 65536, -1, 1.5, NaN, '4178', null, undefined]) assert.equal(isValidPort(bad), false);
});

test('the desktop server serves the built app and API on 127.0.0.1 only', async () => {
  await withDist(async directory => {
    const started = await startDesktopServer({ preferredPort: await freePort(), directory, env: {} });
    try {
      assert.match(started.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
      assert.equal(started.fallback, false);
      const page = await fetch(started.url);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<div id="root">/);
      // The renderer can only reach the API over loopback; the API also refuses unknown hosts.
      assert.equal(await fetchWithHost(started.port, '/api/sources', 'evil.example.com'), 403);
      assert.equal((await fetch(`${started.url}api/sources`)).status, 200);
    } finally { await started.close(); }
  });
});

test('a busy preferred port fails clearly instead of changing the IndexedDB origin', async () => {
  await withDist(async directory => {
    const blocker = createTcpServer();
    blocker.listen(0, '127.0.0.1');
    await once(blocker, 'listening');
    const taken = blocker.address().port;
    try {
      await assert.rejects(
        startDesktopServer({ preferredPort: taken, directory, env: {} }),
        error => error?.code === 'EADDRINUSE' && String(error.message).includes(String(taken)),
      );
      assert.equal(blocker.listening, true);
    } finally { await new Promise(resolveClose => blocker.close(resolveClose)); }
  });
});

test('a non-loopback host request is refused rather than exposing the app on the network', async () => {
  await withDist(async directory => {
    await assert.rejects(startDesktopServer({ preferredPort: await freePort(), directory, host: '0.0.0.0' }), /127\.0\.0\.1/);
    await assert.rejects(startDesktopServer({ preferredPort: 80, directory }), /Port must be/);
  });
});

test('the already-created job service sees a key set through the desktop shell without a restart', async () => {
  await withDist(async directory => {
    const env = {};
    const started = await startDesktopServer({ preferredPort: await freePort(), directory, env });
    try {
      const status = async () => {
        const payload = await (await fetch(`${started.url}api/sources`)).json();
        return Object.fromEntries(payload.sources.map(source => [source.id, source.enabled]));
      };
      assert.deepEqual(await status(), { saramin: false, work24: false, wanted: false, jumpit: false, zighang: false });

      // Exactly what the IPC setApiKey handler does: encrypt via the store, then mirror to env.
      const store = { set: () => true, clear: () => true };
      setProviderKey({ store, env }, 'work24', 'work24-test-key');
      const afterWork24 = await status();
      assert.equal(afterWork24.work24, true);
      assert.equal(afterWork24.saramin, false);

      setProviderKey({ store, env }, 'saramin', 'saramin-test-key');
      assert.equal((await status()).saramin, true);

      clearProviderKey({ store, env }, 'work24');
      const afterClear = await status();
      assert.equal(afterClear.work24, false);
      assert.equal(afterClear.saramin, true);
      // Only the two approved providers may ever become enabled, and no key value is echoed.
      assert.deepEqual(env, { SARAMIN_ACCESS_KEY: 'saramin-test-key' });
    } finally { await started.close(); }
  });
});
