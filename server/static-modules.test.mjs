import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createAppServer } from './http.mjs';

test('module worker .mjs assets have JavaScript MIME for GET and HEAD', async () => {
  // Serve a known repository module from an isolated fixture root; no live jobs,
  // private files or main preview process are touched by this test.
  const server = createAppServer({ directory: resolve('server') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/http.mjs`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^(?:application|text)\/javascript(?:;|$)/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const body = await response.text();
    assert.match(body, /createAppServer/);
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), response.headers.get('content-type'));
    assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(body)));
    assert.equal(await head.text(), '');
  } finally {
    server.closeAllConnections();
    await new Promise(resolveClose => server.close(resolveClose));
  }
});
