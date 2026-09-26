import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createJobService, normalizeWanted, SourceError } from './job-sources.mjs';
import { createAppServer } from './http.mjs';

// Official Saramin only. The unofficial Wanted/Jumpit/Zighang endpoints are blocked centrally
// and are exercised only through the pure normalizers, never through a live service request.
const rawSaramin = (overrides = {}) => ({
  id: '101',
  position: { title: '테스트용 개발자', 'experience-level': { code: 1, min: 0, max: 0, name: '신입' }, 'required-education-level': { name: '학력무관' }, location: { name: '서울' } },
  company: { detail: { name: '자동시험용 가상기업' } },
  'close-type': { code: '1' }, 'posting-timestamp': '1780000000', 'expiration-timestamp': '1890000000', active: 1,
  ...overrides,
});
const saraminBody = jobs => ({ jobs: { job: jobs, total: jobs.length } });
const response = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const keyEnv = { SARAMIN_ACCESS_KEY: 'test-only-key-value' };

test('normalization never invents a posting date, salary or contract', () => {
  const job = normalizeWanted({ id: 101, company: { name: '자동시험용 가상기업' }, position: '테스트용 개발자', status: 'active', hidden: false, annual_from: 0, annual_to: 2, address: { location: '서울', district: '강남구' } }, new Date().toISOString());
  assert.equal(job.publishedAt, ''); assert.equal(job.salary, '미기재'); assert.equal(job.employment, '미기재');
  assert.equal(job.verification, 'source'); assert.equal(job.isDemo, false); assert.equal(job.sourceUrl, 'https://www.wanted.co.kr/wd/101');
});
test('the shipped source configuration disables unapproved sources and states why', () => {
  const service = createJobService({ env: {}, fetcher: async () => { throw new Error('must not fetch'); } });
  const byId = Object.fromEntries(service.sources().map(source => [source.id, source]));
  assert.equal(byId.wanted.enabled, false); assert.equal(byId.jumpit.enabled, false); assert.equal(byId.zighang.enabled, false);
  assert.match(byId.wanted.note, /승인/); assert.match(byId.jumpit.note, /승인/); assert.match(byId.zighang.note, /승인/);
  assert.equal(byId.saramin.enabled, false); assert.match(byId.saramin.note, /SARAMIN_ACCESS_KEY/);
  const configured = createJobService({ env: keyEnv, fetcher: async () => { throw new Error('must not fetch'); } });
  assert.equal(configured.sources().find(source => source.id === 'saramin').enabled, true);
});
test('aggregate search with no enabled source refuses before any external request', async () => {
  let calls = 0;
  const service = createJobService({ env: {}, fetcher: async () => { calls++; throw new Error('must not fetch'); } });
  await assert.rejects(service.search({ provider: 'all' }), error => error.code === 'NO_ENABLED_SOURCE');
  assert.equal(calls, 0);
});
test('official Saramin search returns only open, source-verified records', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async () => response(saraminBody([rawSaramin(), rawSaramin({ id: '102', active: 0 })])) });
  const result = await service.search({ provider: 'saramin' });
  assert.equal(result.jobs.length, 1); assert.equal(result.jobs[0].source, '사람인'); assert.equal(result.jobs[0].verification, 'source');
});
test('query text cannot turn the official adapter into an arbitrary URL proxy', async () => {
  let requested;
  const service = createJobService({ env: keyEnv, fetcher: async url => { requested = new URL(url); return response(saraminBody([rawSaramin()])); } });
  await service.search({ provider: 'saramin', query: 'https://127.0.0.1/private?q=x&next=y' });
  assert.equal(requested.hostname, 'oapi.saramin.co.kr'); assert.equal(requested.pathname, '/job-search');
  assert.equal(requested.searchParams.get('keywords'), 'https://127.0.0.1/private?q=x&next=y');
  assert.equal(requested.searchParams.get('access-key'), 'test-only-key-value');
});
test('cached records keep their original check time and explicit refresh makes another request', async () => {
  let count = 0; const service = createJobService({ env: keyEnv, fetcher: async () => { count++; return response(saraminBody([rawSaramin()])); } });
  const first = await service.search({ provider: 'saramin' }); const second = await service.search({ provider: 'saramin' });
  assert.equal(count, 1); assert.equal(second.cached, true); assert.equal(first.checkedAt, second.checkedAt);
  await service.search({ provider: 'saramin', refresh: true }); assert.equal(count, 2);
});
test('restrictions and invalid upstream content fail explicitly without fabricated jobs', async () => {
  for (const upstream of [new Response('', { status: 403 }), new Response('<html>blocked</html>', { headers: { 'Content-Type': 'text/html' } }), response({ changed: true })]) {
    const service = createJobService({ env: keyEnv, fetcher: async () => upstream });
    await assert.rejects(service.search({ provider: 'saramin' }), SourceError);
  }
});
test('invalid parameters, missing keys and unapproved providers do not call an upstream', async () => {
  let calls = 0; const service = createJobService({ env: {}, fetcher: async () => { calls++; throw new Error('should not run'); } });
  await assert.rejects(service.search({ query: 'x'.repeat(121) }));
  await assert.rejects(service.search({ page: -1 })); await assert.rejects(service.detail('saramin', '../private'));
  await assert.rejects(service.search({ provider: 'saramin' }), error => error.code === 'KEY_REQUIRED');
  assert.equal(calls, 0);
});
test('unapproved source names are rejected before any network access', async () => {
  let calls = 0; const service = createJobService({ env: keyEnv, fetcher: async () => { calls++; throw new Error('must not fetch'); } });
  for (const provider of ['wanted', 'jumpit', 'zighang']) {
    await assert.rejects(service.search({ provider }), error => error.code === 'SOURCE_NOT_PERMITTED' && error.status === 403);
    await assert.rejects(service.detail(provider, '101'), error => error.code === 'SOURCE_NOT_PERMITTED');
  }
  await assert.rejects(service.search({ provider: 'not-a-source' }), error => error.code === 'BAD_SOURCE');
  assert.equal(calls, 0);
});
test('refresh and check entry points cannot bypass the block', async () => {
  let calls = 0; const service = createJobService({ env: keyEnv, fetcher: async () => { calls++; throw new Error('must not fetch'); } });
  for (const provider of ['wanted', 'jumpit', 'zighang']) {
    await assert.rejects(service.search({ provider, refresh: true }), error => error.code === 'SOURCE_NOT_PERMITTED');
    await assert.rejects(service.search({ provider, cursor: 'start' }), error => error.code === 'SOURCE_NOT_PERMITTED');
    await assert.rejects(service.detail(provider, '101', true), error => error.code === 'SOURCE_NOT_PERMITTED');
  }
  // Even an aggregate request naming an explicit deep link is blocked by the API handler.
  const server = createAppServer({ service }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/api/jobs?source=wanted&refresh=1', '/api/jobs?source=jumpit&cursor=start', '/api/jobs/zighang/11111111-2222-3333-4444-555555555555?refresh=1']) {
      const response = await fetch(`${base}${path}`); assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'SOURCE_NOT_PERMITTED');
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  assert.equal(calls, 0);
});
test('official detail returns real upstream text and rejects a mismatched identity', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async () => response(saraminBody([rawSaramin()])) });
  const { job } = await service.detail('saramin', '101');
  assert.match(job.description, /사람인 공식 API 제공 요약/); assert.equal(job.source, '사람인');
  const other = createJobService({ env: keyEnv, fetcher: async () => response(saraminBody([rawSaramin({ id: '999' })])) });
  await assert.rejects(other.detail('saramin', '101'), error => error.code === 'SOURCE_FORMAT');
});
test('HTTP API rejects cross-site calls, writes, unknown proxy routes and unapproved sources', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async () => response(saraminBody([rawSaramin()])) });
  const server = createAppServer({ service }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await fetch(`${base}/api/jobs?source=saramin`); assert.equal(result.status, 200); assert.equal((await result.json()).jobs.length, 1);
    assert.equal((await fetch(`${base}/api/jobs`)).status, 200, 'default aggregate returns an empty approved-source result');
    assert.equal((await fetch(`${base}/api/jobs?source=wanted`)).status, 403);
    const blocked = await (await fetch(`${base}/api/jobs?source=jumpit`)).json(); assert.equal(blocked.error.code, 'SOURCE_NOT_PERMITTED');
    assert.equal((await fetch(`${base}/api/jobs/wanted/101`)).status, 403);
    assert.equal((await fetch(`${base}/api/jobs`, { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
    assert.equal((await fetch(`${base}/api/jobs`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/api/proxy?url=http://localhost`)).status, 404);
    assert.equal((await fetch(`${base}/api/jobs?page=1x`)).status, 400);
    const info = await (await fetch(`${base}/api/sources`)).json(); assert.equal(info.personalDocumentsSent, false);
    assert.equal((await fetch(`${base}/.env.local`)).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
