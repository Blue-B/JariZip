import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createJobService, normalizeJooble, SourceError, JOOBLE_SEARCH_URL, JOOBLE_PAGE_SIZE, JOOBLE_CACHE_TTL_MS } from './job-sources.mjs';
import { createAppServer } from './http.mjs';

// All payloads and keys here are synthetic. No real Jooble key is requested, stored or used.
const checkedAt = '2026-01-01T00:00:00.000Z';
const keyEnv = { JOOBLE_API_KEY: 'test-only-jooble-key' };
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const rawJob = (overrides = {}) => ({
  id: 123456789,
  title: '조블 시험용 개발자',
  company: '자동시험용 가상기업',
  location: '서울 강남구',
  snippet: '가상 업무 내용입니다.',
  salary: '연봉 4,000만원',
  type: '정규직',
  link: 'https://example.com/jobs/123456789',
  updated: '2026-01-01T09:00:00Z',
  source: 'example.com',
  ...overrides,
});

test('the Jooble normalizer maps the documented fields and keeps the outbound link', () => {
  const job = normalizeJooble(rawJob(), checkedAt);
  assert.equal(job.id, 'jooble-123456789');
  assert.equal(job.company, '자동시험용 가상기업');
  assert.equal(job.title, '조블 시험용 개발자');
  assert.equal(job.location, '서울 강남구');
  assert.equal(job.employment, '정규직');
  assert.equal(job.salary, '연봉 4,000만원');
  assert.equal(job.sourceUrl, 'https://example.com/jobs/123456789');
  assert.equal(job.source, '조블');
  assert.equal(job.verification, 'source');
  assert.equal(job.status, 'open');
  assert.equal(job.description, '가상 업무 내용입니다.');
  assert.match(job.companyInfo, /example\.com/);
  assert.equal(job.publishedAt, '2026-01-01T09:00:00.000Z');
});

test('the Jooble normalizer never invents missing fields and rejects malformed rows', () => {
  const sparse = normalizeJooble({ id: 'abc', title: 't', company: 'c', link: 'https://example.com/x' }, checkedAt);
  assert.equal(sparse.salary, '미기재');
  assert.equal(sparse.employment, '미기재');
  assert.equal(sparse.location, '지역 미기재');
  assert.equal(sparse.publishedAt, '');
  assert.equal(sparse.companyInfo, '');
  for (const bad of [
    null, {}, { id: 'x', title: 't', company: 'c' },
    { id: 'x', title: 't', company: 'c', link: 'http://insecure.example/x' },
    { id: '../secret', title: 't', company: 'c', link: 'https://example.com/x' },
    { id: 'x', title: '', company: 'c', link: 'https://example.com/x' },
  ]) assert.throws(() => normalizeJooble(bad, checkedAt), SourceError);
});

test('Jooble search posts the key path, keywords, 1-based page and ResultOnPage', async () => {
  let requested, init;
  const service = createJobService({ env: keyEnv, fetcher: async (url, options) => { requested = new URL(url); init = options; return json({ totalCount: 1, jobs: [rawJob()] }); } });
  const result = await service.search({ provider: 'jooble', query: '개발자', page: 2, location: 'busan' });
  assert.equal(requested.origin + requested.pathname, `${JOOBLE_SEARCH_URL}test-only-jooble-key`);
  assert.equal(init.method, 'POST');
  assert.match(init.headers['Content-Type'], /application\/json/);
  assert.deepEqual(JSON.parse(init.body), { keywords: '개발자', location: '부산', page: 3, ResultOnPage: JOOBLE_PAGE_SIZE });
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].source, '조블');
  assert.equal(result.nextPage, null);
});

test('Jooble pagination continues from totalCount with an internal 0-based page', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async () => json({ totalCount: 100, jobs: [rawJob()] }) });
  const first = await service.search({ provider: 'jooble', page: 0 });
  assert.equal(first.nextPage, 1);
  const empty = createJobService({ env: keyEnv, fetcher: async () => json({ totalCount: 100, jobs: [] }) });
  assert.equal((await empty.search({ provider: 'jooble', page: 0 })).nextPage, null);
});

test('Jooble pages are cached for 12 hours and an explicit refresh bypasses the cache', async () => {
  assert.equal(JOOBLE_CACHE_TTL_MS, 12 * 60 * 60 * 1000);
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    let count = 0;
    const service = createJobService({ env: keyEnv, fetcher: async () => { count++; return json({ totalCount: 1, jobs: [rawJob()] }); } });
    const first = await service.search({ provider: 'jooble' });
    assert.equal(first.cached, false);
    clock += 11 * 60 * 60 * 1000;
    assert.equal((await service.search({ provider: 'jooble' })).cached, true);
    assert.equal(count, 1);
    clock += 2 * 60 * 60 * 1000;
    assert.equal((await service.search({ provider: 'jooble' })).cached, false);
    assert.equal(count, 2);
    await service.search({ provider: 'jooble', refresh: true });
    assert.equal(count, 3);
  } finally {
    Date.now = realNow;
  }
});

test('Jooble is list-only: a detail request never reaches the network', async () => {
  let calls = 0;
  const service = createJobService({ env: keyEnv, fetcher: async () => { calls++; return json({}); } });
  await assert.rejects(service.detail('jooble', '123456789'), error => error.code === 'SOURCE_NOT_SUPPORTED' && error.status === 400);
  assert.equal(calls, 0);
});

test('a missing Jooble key refuses before any network call', async () => {
  let calls = 0;
  const service = createJobService({ env: {}, fetcher: async () => { calls++; throw new Error('must not fetch'); } });
  await assert.rejects(service.search({ provider: 'jooble' }), error => error.code === 'KEY_REQUIRED');
  await assert.rejects(service.detail('jooble', '1'), error => error.code === 'KEY_REQUIRED');
  assert.equal(calls, 0);
});

test('Jooble upstream restrictions and malformed bodies fail explicitly', async () => {
  for (const upstream of [new Response('', { status: 403 }), json({ error: 'restricted' }), json({ unexpected: true }), new Response('<html>blocked</html>', { headers: { 'Content-Type': 'text/html' } })]) {
    const service = createJobService({ env: keyEnv, fetcher: async () => upstream });
    await assert.rejects(service.search({ provider: 'jooble' }), SourceError);
  }
  const allInvalid = createJobService({ env: keyEnv, fetcher: async () => json({ totalCount: 1, jobs: [{ bad: true }] }) });
  await assert.rejects(allInvalid.search({ provider: 'jooble' }), error => error.code === 'SOURCE_FORMAT');
});

test('the HTTP API exposes Jooble as an approved, key-enabled, detail-blocked source', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async () => json({ totalCount: 1, jobs: [rawJob()] }) });
  const server = createAppServer({ service }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const info = await (await fetch(`${base}/api/sources`)).json();
    assert.equal(info.sources.find(source => source.id === 'jooble').enabled, true);
    const list = await (await fetch(`${base}/api/jobs?source=jooble`)).json();
    assert.equal(list.jobs[0].id, 'jooble-123456789');
    assert.equal(list.jobs[0].source, '조블');
    const detail = await fetch(`${base}/api/jobs/jooble/123456789`);
    assert.equal(detail.status, 400);
    assert.equal((await detail.json()).error.code, 'SOURCE_NOT_SUPPORTED');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
