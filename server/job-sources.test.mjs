import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createJobService, normalizeWanted, SourceError } from './job-sources.mjs';
import { createAppServer } from './http.mjs';

const rawJob = (overrides = {}) => ({ id: 101, company: { name: '자동시험용 가상기업' }, position: '테스트용 개발자', status: 'active', hidden: false, annual_from: 0, annual_to: 2, address: { location: '서울', district: '강남구' }, reward: { formatted_total: '100만원' }, ...overrides });
const response = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

test('normalization never invents a posting date, salary or contract', () => {
  const job = normalizeWanted(rawJob(), new Date().toISOString());
  assert.equal(job.publishedAt, ''); assert.equal(job.salary, '미기재'); assert.equal(job.employment, '미기재');
  assert.equal(job.verification, 'source'); assert.equal(job.isDemo, false); assert.equal(job.sourceUrl, 'https://www.wanted.co.kr/wd/101');
});
test('live lists exclude closed, hidden and unknown records and retain source pagination', async () => {
  const service = createJobService({ fetcher: async () => response({ data: [rawJob(), rawJob({ id: 102, status: 'closed' }), rawJob({ id: 103, hidden: true }), rawJob({ id: 104, status: null })], links: { next: 'https://untrusted.invalid' } }) });
  const result = await service.search(); assert.equal(result.jobs.length, 1); assert.equal(result.nextPage, 1);
});
test('query text cannot turn the source adapter into an arbitrary URL proxy', async () => {
  let requested;
  const service = createJobService({ fetcher: async url => { requested = new URL(url); return response({ data: { jobs: [rawJob()] }, links: {} }); } });
  await service.search({ query: 'https://127.0.0.1/private?q=x&next=y' });
  assert.equal(requested.hostname, 'www.wanted.co.kr'); assert.equal(requested.pathname, '/api/v4/search');
  assert.equal(requested.searchParams.get('query'), 'https://127.0.0.1/private?q=x&next=y');
});
test('cached records keep their original check time and explicit refresh makes another request', async () => {
  let count = 0; const service = createJobService({ fetcher: async () => { count++; return response({ data: [rawJob()], links: {} }); } });
  const first = await service.search(); const second = await service.search();
  assert.equal(count, 1); assert.equal(second.cached, true); assert.equal(first.checkedAt, second.checkedAt);
  await service.search({ refresh: true }); assert.equal(count, 2);
});
test('restrictions and invalid upstream content fail explicitly without fabricated jobs', async () => {
  for (const upstream of [new Response('', { status: 403 }), new Response('<html>blocked</html>', { headers: { 'Content-Type': 'text/html' } }), response({ changed: true })]) {
    const service = createJobService({ fetcher: async () => upstream });
    await assert.rejects(service.search(), SourceError);
  }
});
test('invalid parameters and missing optional keys do not call an upstream', async () => {
  let calls = 0; const service = createJobService({ env: {}, fetcher: async () => { calls++; throw new Error('should not run'); } });
  await assert.rejects(service.search({ query: 'x'.repeat(121) }));
  await assert.rejects(service.search({ page: -1 })); await assert.rejects(service.detail('wanted', '../private'));
  await assert.rejects(service.search({ provider: 'saramin' }), error => error.code === 'KEY_REQUIRED');
  assert.equal(calls, 0); assert.equal(service.sources()[1].enabled, false);
});
test('details contain real upstream text and do not treat a missing status as active', async () => {
  const service = createJobService({ fetcher: async () => response({ job: rawJob({ status: null, detail: { intro: '테스트 원문', main_tasks: '테스트 업무', requirements: '테스트 자격' } }) }) });
  const { job } = await service.detail('wanted', '101');
  assert.match(job.description, /테스트 원문/); assert.match(job.description, /테스트 업무/); assert.equal(job.status, 'unknown');
});
test('HTTP API rejects cross-site calls, writes and unknown proxy routes', async () => {
  const service = createJobService({ fetcher: async () => response({ data: [rawJob()], links: {} }) });
  const server = createAppServer({ service }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await fetch(`${base}/api/jobs`); assert.equal(result.status, 200); assert.equal((await result.json()).jobs.length, 1);
    assert.equal((await fetch(`${base}/api/jobs`, { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
    assert.equal((await fetch(`${base}/api/jobs`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/api/proxy?url=http://localhost`)).status, 404);
    assert.equal((await fetch(`${base}/api/jobs?page=1x`)).status, 400);
    const info = await (await fetch(`${base}/api/sources`)).json(); assert.equal(info.personalDocumentsSent, false);
    assert.equal((await fetch(`${base}/.env.local`)).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
