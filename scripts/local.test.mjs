import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { LOCAL_PORT, LOCAL_URL, parseFlags, portAvailable, supportedNode } from './local.mjs';

test('local launcher accepts supported Node versions and rejects old or invalid versions', () => {
  for (const version of ['22.12.0', 'v22.22.2', '24.0.0', '26.1.0']) assert.equal(supportedNode(version), true);
  for (const version of ['20.19.0', '22.11.9', '', 'banana']) assert.equal(supportedNode(version), false);
});
test('local launcher pins a stable origin and supports inspection without installing or launching a browser', () => {
  assert.equal(LOCAL_PORT, 4178);
  assert.equal(LOCAL_URL, 'http://localhost:4178/');
  assert.deepEqual(parseFlags(['--check', '--no-browser']), { check: true, prepare: false, browser: false });
  assert.throws(() => parseFlags(['--public']), /옵션/);
  assert.throws(() => parseFlags(['--check', '--prepare']), /함께/);
  const result = spawnSync(process.execPath, ['scripts/local.mjs', '--check', '--no-browser'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /localhost:4178/);
});
test('port probe never kills or replaces an existing listener', async () => {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  try {
    assert.equal(await portAvailable(port), false);
    assert.equal(listener.listening, true);
  } finally { await new Promise(resolveClose => listener.close(resolveClose)); }
  assert.equal(await portAvailable(port), true);
});
