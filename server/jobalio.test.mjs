import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createJobService, normalizeJobAlio, normalizeServiceKey, SourceError, JOBALIO_LIST_URL, JOBALIO_PAGE_SIZE, JOBALIO_CACHE_TTL_MS } from './job-sources.mjs';
import { createAppServer } from './http.mjs';

// Synthetic service keys and payloads only. No data.go.kr request leaves these tests.
const checkedAt = '2026-01-01T00:00:00.000Z';
const keyEnv = { JOBALIO_SERVICE_KEY: 'test-only-jobalio-service-key' };
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const item = (overrides = {}) => ({
  recrutPblntSn: 305307,
  instNm: '자동시험용 가상공사',
  recrutPbancTtl: '시험용 공공기관 채용공고',
  pbancBgngYmd: '20260101',
  pbancEndYmd: '20991231',
  ongoingYn: 'Y',
  workRgnNmLst: '서울,경기',
  ncsCdNmLst: '경영·회계·사무',
  hireTypeNmLst: '정규직',
  recrutSeNm: '신입',
  recrutNope: '2',
  aplyQlfcCn: '가상 신청 자격',
  scrnprcdrMthdExpln: '서류·면접',
  srcUrl: 'https://example.invalid/original',
  ...overrides,
});
const body = (items, total = items.length) => ({ result: items.map(value => ({ item: value })), resultCode: 0, resultMsg: 'NORMAL SERVICE.', totalCount: total });

test('the JOB-ALIO normalizer maps the official fields and keeps a canonical original link', () => {
  const job = normalizeJobAlio(item(), checkedAt);
  assert.equal(job.id, 'jobalio-305307');
  assert.equal(job.company, '자동시험용 가상공사');
  assert.equal(job.title, '시험용 공공기관 채용공고');
  assert.equal(job.role, '경영·회계·사무');
  assert.equal(job.location, '서울 · 경기');
  assert.equal(job.employment, '정규직');
  assert.equal(job.experience, '경력 미기재');
  assert.equal(job.salary, '미기재');
  assert.equal(job.source, '잡알리오');
  assert.equal(job.publishedAt, '2025-12-31T15:00:00.000Z');
  assert.equal(job.deadline, '2099-12-31T14:59:59.000Z');
  assert.equal(job.status, 'open');
  assert.equal(job.sourceUrl, 'https://job.alio.go.kr/recruitview.do?idx=305307');
  assert.match(job.companyInfo, /출처: 잡알리오/);
  assert.match(job.requirements, /신청자격: 가상 신청 자격/);
});

test('JOB-ALIO status and dates stay honest for missing or closed notices', () => {
  const closed = normalizeJobAlio(item({ pbancEndYmd: '20000101', ongoingYn: 'N' }), checkedAt);
  assert.equal(closed.status, 'closed');
  assert.equal(closed.deadlineType, 'date');
  const bare = normalizeJobAlio({ recrutPblntSn: 1, instNm: '가상기관', recrutPbancTtl: '공고' }, checkedAt);
  assert.equal(bare.publishedAt, ''); assert.equal(bare.deadline, ''); assert.equal(bare.deadlineType, 'unknown'); assert.equal(bare.status, 'unknown');
  assert.equal(bare.location, '지역 미기재'); assert.equal(bare.employment, '미기재');
  for (const bad of [null, {}, { recrutPblntSn: '../x', instNm: 'c', recrutPbancTtl: 't' }, { recrutPblntSn: 1, instNm: '', recrutPbancTtl: 't' }]) {
    assert.throws(() => normalizeJobAlio(bad, checkedAt), SourceError);
  }
});

test('normalizeServiceKey accepts the normal key and tolerates an already-encoded copy', () => {
  assert.equal(normalizeServiceKey('ab+cd/ef=='), 'ab+cd/ef==');
  assert.equal(normalizeServiceKey('ab%2Bcd%2Fef%3D%3D'), 'ab+cd/ef==');
  assert.equal(normalizeServiceKey('not%zz-encoded'), 'not%zz-encoded');
});

test('JOB-ALIO search calls the official data.go.kr list endpoint with the service key and page', async () => {
  let requested;
  const service = createJobService({ env: keyEnv, fetcher: async url => { requested = new URL(url); return json(body([item()], 120)); } });
  const result = await service.search({ provider: 'jobalio', query: '개발자', page: 1, location: 'busan', category: 'development' });
  assert.equal(requested.origin + requested.pathname, JOBALIO_LIST_URL);
  assert.equal(requested.searchParams.get('serviceKey'), keyEnv.JOBALIO_SERVICE_KEY);
  assert.equal(requested.searchParams.get('resultType'), 'json');
  assert.equal(requested.searchParams.get('pageNo'), '2');
  assert.equal(requested.searchParams.get('numOfRows'), String(JOBALIO_PAGE_SIZE));
  assert.equal(requested.searchParams.get('ongoingYn'), 'Y');
  assert.equal(requested.searchParams.get('recrutPbancTtl'), '개발자');
  assert.equal(result.jobs.length, 0, 'client-side location/category filters keep the page honest');
  assert.equal(result.nextPage, 2);
  assert.match(result.warnings.join(' '), /잡알리오/);
});

test('JOB-ALIO accepts both the documented result envelope and the legacy response.body envelope', async () => {
  const modern = createJobService({ env: keyEnv, fetcher: async () => json(body([item()], 1)) });
  assert.equal((await modern.search({ provider: 'jobalio' })).jobs.length, 1);
  const legacy = createJobService({ env: keyEnv, fetcher: async () => json({ response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { items: { item: [item()] }, totalCount: 1, pageNo: 1, numOfRows: 50 } } }) });
  assert.equal((await legacy.search({ provider: 'jobalio' })).jobs.length, 1);
  // The documented "데이터 없음"(03) code is an empty page, never fabricated rows and never an error.
  const empty = createJobService({ env: keyEnv, fetcher: async () => json({ response: { header: { resultCode: '03' }, body: { items: '', totalCount: 0 } } }) });
  const emptyResult = await empty.search({ provider: 'jobalio' });
  assert.equal(emptyResult.jobs.length, 0); assert.equal(emptyResult.nextPage, null);
});

test('JOB-ALIO pages are cached for six hours and an explicit refresh bypasses the cache', async () => {
  assert.equal(JOBALIO_CACHE_TTL_MS, 6 * 60 * 60 * 1000);
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    let count = 0;
    const service = createJobService({ env: keyEnv, fetcher: async () => { count++; return json(body([item()], 1)); } });
    assert.equal((await service.search({ provider: 'jobalio' })).cached, false);
    clock += 5 * 60 * 60 * 1000;
    assert.equal((await service.search({ provider: 'jobalio' })).cached, true);
    assert.equal(count, 1);
    clock += 2 * 60 * 60 * 1000;
    assert.equal((await service.search({ provider: 'jobalio' })).cached, false);
    assert.equal(count, 2);
    await service.search({ provider: 'jobalio', refresh: true });
    assert.equal(count, 3);
  } finally { Date.now = realNow; }
});

test('JOB-ALIO is list-only: a detail request never reaches the network', async () => {
  let calls = 0;
  const service = createJobService({ env: keyEnv, fetcher: async () => { calls++; return json({}); } });
  await assert.rejects(service.detail('jobalio', '305307'), error => error.code === 'SOURCE_NOT_SUPPORTED' && error.status === 400);
  assert.equal(calls, 0);
});

test('a missing JOB-ALIO key and restricted upstream codes refuse before fabricated rows', async () => {
  let calls = 0;
  await assert.rejects(createJobService({ env: {}, fetcher: async () => { calls++; throw new Error('must not fetch'); } }).search({ provider: 'jobalio' }), error => error.code === 'KEY_REQUIRED');
  assert.equal(calls, 0);
  for (const upstream of [new Response('', { status: 403 }), json({ resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED ERROR.' }), json({ resultCode: '10', resultMsg: 'INVALID REQUEST PARAMETER ERROR.' })]) {
    const service = createJobService({ env: keyEnv, fetcher: async () => upstream });
    await assert.rejects(service.search({ provider: 'jobalio' }), error => error.code === 'SOURCE_RESTRICTED');
  }
  const allInvalid = createJobService({ env: keyEnv, fetcher: async () => json(body([{ bad: true }], 1)) });
  await assert.rejects(allInvalid.search({ provider: 'jobalio' }), error => error.code === 'SOURCE_FORMAT');
});

test('the HTTP API exposes JOB-ALIO as an approved list-only source', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async () => json(body([item()], 1)) });
  const server = createAppServer({ service }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const info = await (await fetch(`${base}/api/sources`)).json();
    assert.equal(info.sources.find(source => source.id === 'jobalio').enabled, true);
    const list = await (await fetch(`${base}/api/jobs?source=jobalio`)).json();
    assert.equal(list.jobs[0].id, 'jobalio-305307');
    assert.equal(list.jobs[0].source, '잡알리오');
    const detail = await fetch(`${base}/api/jobs/jobalio/305307`);
    assert.equal(detail.status, 400);
    assert.equal((await detail.json()).error.code, 'SOURCE_NOT_SUPPORTED');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
