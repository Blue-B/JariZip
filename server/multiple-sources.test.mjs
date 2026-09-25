import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createJobService, normalizeJumpit, normalizeZighang, SourceError } from './job-sources.mjs';
import { createAppServer } from './http.mjs';
import { JOB_LOCATIONS, JOB_CATEGORIES } from './job-catalog.mjs';

const checkedAt = '2026-01-01T00:00:00.000Z';
const uuid = '11111111-2222-3333-4444-555555555555';
const wanted = { id: 101, company: { name: '자동시험 가상기업' }, position: 'Python 개발자', annual_from: 0, annual_to: 3, status: 'active', hidden: false, address: { location: '서울' } };
const jumpit = { id: 202, companyName: '자동시험 가상기업', title: 'Python 개발자', jobCategory: '서버/백엔드 개발자', techStacks: ['Python'], newcomer: true, minCareer: 0, maxCareer: 3, locations: ['서울'], alwaysOpen: false, closedAt: '2099-10-01T23:59:59' };
const zighang = { id: uuid, company: { name: '자동시험 가상기업' }, title: '마케팅 담당자', regions: ['부산'], depthOnes: ['마케팅_광고_홍보'], employeeTypes: ['정규직'], careerMin: 0, careerMax: 100, deadlineType: '마감일', endDate: '2099-10-01', createdAt: '2026-01-01T09:00:00' };
const response = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function fetcher(input) {
  const url = new URL(input);
  if (url.hostname === 'www.wanted.co.kr') return Promise.resolve(response({ data: [wanted], links: { next: '/next' } }));
  if (url.hostname === 'jumpit-api.saramin.co.kr') return Promise.resolve(response({ result: { positions: [jumpit], totalCount: 17, page: 1 } }));
  if (url.hostname === 'api.zighang.com') return Promise.resolve(response({ success: true, data: { content: [zighang], page: 0, last: false } }));
  throw new Error('Unexpected destination');
}

test('Jumpit derives status from actual deadline and flags, never HTTP success alone', () => {
  assert.equal(normalizeJumpit(jumpit, checkedAt).status, 'open');
  assert.equal(normalizeJumpit({ ...jumpit, closedAt: null }, checkedAt).status, 'unknown');
  assert.equal(normalizeJumpit({ ...jumpit, closedAt: null, alwaysOpen: true }, checkedAt).status, 'open');
  assert.equal(normalizeJumpit({ ...jumpit, closedAt: '2000-01-01' }, checkedAt).status, 'closed');
  for (const flag of [{ invisible: true }, { hiddenPosition: true }, { positionStatus: 'HOLD' }]) assert.equal(normalizeJumpit({ ...jumpit, ...flag }, checkedAt).status, 'closed');
  const job = normalizeJumpit(jumpit, checkedAt);
  assert.equal(job.deadline, '2099-10-01T14:59:59.000Z');
  assert.equal(job.publishedAt, ''); assert.equal(job.salary, '미기재');
});

test('Jumpit detail preserves text, location and the richer skill representation', () => {
  const job = normalizeJumpit({ ...jumpit, locations: undefined, location: '서울 가상로', techStacks: [{ stack: 'Python' }], serviceInfo: '<p>가상 기업 소개</p>', responsibility: '가상 업무', qualifications: '가상 자격', welfares: '가상 복지' }, checkedAt);
  assert.deepEqual(job.skills, ['Python']); assert.equal(job.location, '서울 가상로');
  assert.match(job.description, /가상 기업 소개\n\n가상 업무/); assert.equal(job.requirements, '가상 자격');
});

test('Zighang rich text is inert and dated listings preserve their actual dates', () => {
  const job = normalizeZighang({ ...zighang, status: 'ACTIVE', summary: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '가상 본문' }] }, { type: 'paragraph', content: [{ type: 'text', text: '추가 내용' }] }] } }, checkedAt);
  assert.equal(job.description, '가상 본문\n추가 내용');
  assert.equal(job.publishedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(job.deadline, '2099-10-01T14:59:59.000Z');
  assert.equal(normalizeZighang({ ...zighang, status: 'CLOSED' }, checkedAt).status, 'closed');
  assert.equal(normalizeZighang({ ...zighang, endDate: null, deadlineType: null }, checkedAt).status, 'unknown');
  assert.equal(normalizeZighang({ ...zighang, endDate: null, deadlineType: '상시채용' }, checkedAt).status, 'open');
  assert.throws(() => normalizeZighang({ ...zighang, id: '../secret' }, checkedAt), SourceError);
});

test('aggregate search returns independent sources and excludes an unconfigured keyed provider', async () => {
  const service = createJobService({ env: {}, fetcher });
  const result = await service.search({ provider: 'all' });
  assert.deepEqual(result.jobs.map(job => job.source), ['원티드', '점핏', '직행']);
  assert.equal(result.nextPage, 1); assert.equal(result.sourceResults.length, 3);
  assert.ok(result.sourceResults.every(source => source.status === 'ok'));
});

test('one failed source is reported without hiding other results or inventing listings', async () => {
  const service = createJobService({ env: {}, fetcher: input => new URL(input).hostname === 'jumpit-api.saramin.co.kr' ? Promise.resolve(new Response('', { status: 403 })) : fetcher(input) });
  const result = await service.search({ provider: 'all' });
  assert.equal(result.jobs.length, 2);
  const failed = result.sourceResults.find(source => source.id === 'jumpit');
  assert.equal(failed.status, 'error'); assert.equal(failed.count, 0); assert.match(failed.message, /조회를 제한/);
});

test('aggregate reports complete failure rather than an empty successful result', async () => {
  const service = createJobService({ env: {}, fetcher: async () => new Response('', { status: 503 }) });
  await assert.rejects(service.search({ provider: 'all' }), error => error.code === 'ALL_SOURCES_FAILED');
});

test('nationwide and non-IT filters are sent with the correct source parameters', async () => {
  assert.equal(JOB_LOCATIONS.length, 18); assert.ok(JOB_CATEGORIES.some(category => category.id === 'medical'));
  const calls = [];
  const service = createJobService({ env: {}, fetcher: input => { calls.push(new URL(input)); return fetcher(input); } });
  await service.search({ provider: 'zighang', location: 'busan', category: 'marketing', experience: '3', page: 2 });
  const url = calls[0];
  assert.equal(url.searchParams.get('regions'), '부산');
  assert.deepEqual(url.searchParams.getAll('depthOnes'), ['마케팅_광고_홍보']);
  assert.equal(url.searchParams.get('careerMin'), '3'); assert.equal(url.searchParams.get('careerMax'), '3');
  assert.equal(url.searchParams.get('page'), '2'); assert.equal(url.searchParams.get('size'), '20');
  await service.search({ provider: 'wanted', location: 'chungnam' });
  assert.equal(calls[1].searchParams.get('locations'), 's-chungcheong');
});

test('Jumpit pagination uses its actual 16-record page and native location/career filters', async () => {
  const calls = [];
  const service = createJobService({ env: {}, fetcher: input => { calls.push(new URL(input)); return fetcher(input); } });
  const result = await service.search({ provider: 'jumpit', location: 'seoul', category: 'development', experience: 'new' });
  assert.equal(result.nextPage, 1); // 17 records require a second 16-record page.
  assert.equal(calls[0].searchParams.get('page'), '1');
  assert.equal(calls[0].searchParams.get('locationTag'), '101000');
  assert.equal(calls[0].searchParams.get('career'), '0');
  assert.ok(calls[0].searchParams.getAll('jobCategory').length > 0);
  await service.search({ provider: 'jumpit', page: 1 }); assert.equal(calls[1].searchParams.get('page'), '2');
});

test('filters are part of the cache key and refreshed source timestamps remain accurate', async () => {
  let calls = 0;
  const service = createJobService({ env: {}, fetcher: input => { calls++; return fetcher(input); } });
  const first = await service.search({ provider: 'zighang', category: 'marketing' });
  const second = await service.search({ provider: 'zighang', category: 'marketing' });
  assert.equal(second.cached, true); assert.equal(second.checkedAt, first.checkedAt); assert.equal(calls, 1);
  await service.search({ provider: 'zighang', category: 'sales' }); assert.equal(calls, 2);
  await service.search({ provider: 'zighang', category: 'marketing', refresh: true }); assert.equal(calls, 3);
});

test('invalid providers, filters and foreign IDs fail before contacting any source', async () => {
  let calls = 0;
  const service = createJobService({ env: {}, fetcher: async () => { calls++; throw new Error('Must not fetch'); } });
  for (const filters of [{ provider: 'constructor' }, { location: 'not-a-region' }, { category: '__proto__' }, { experience: '-1' }, { page: 10000 }]) await assert.rejects(service.search(filters), SourceError);
  await assert.rejects(service.detail('zighang', '202'), error => error.code === 'BAD_ID');
  await assert.rejects(service.detail('jumpit', uuid), error => error.code === 'BAD_ID');
  await assert.rejects(service.detail('wanted', 'https://untrusted.invalid'), error => error.code === 'BAD_ID');
  assert.equal(calls, 0);
});

test('detail routes verify the requested identity and use fixed source hosts', async () => {
  const calls = [];
  const service = createJobService({ env: {}, fetcher: async input => { const url = new URL(input); calls.push(url); return response(url.hostname === 'api.zighang.com' ? { success: true, data: { ...zighang, status: 'ACTIVE' } } : { result: jumpit }); } });
  assert.equal((await service.detail('jumpit', '202')).job.source, '점핏');
  assert.equal((await service.detail('zighang', uuid)).job.source, '직행');
  assert.equal(calls[0].pathname, '/api/position/202'); assert.equal(calls[1].pathname, `/api/recruitments/${uuid}`);
  await assert.rejects(service.detail('jumpit', '999'), error => error.code === 'SOURCE_FORMAT');
});

test('HTTP forwards all filters and accepts validated UUID detail routes', async () => {
  const calls = [];
  const service = { sources: () => [], search: async filters => { calls.push(filters); return { jobs: [] }; }, detail: async (provider, id) => ({ provider, id }) };
  const server = createAppServer({ service }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/jobs?source=all&location=busan&category=marketing&experience=new`)).status, 200);
    assert.deepEqual({ provider: calls[0].provider, location: calls[0].location, category: calls[0].category, experience: calls[0].experience }, { provider: 'all', location: 'busan', category: 'marketing', experience: 'new' });
    assert.deepEqual(await (await fetch(`${base}/api/jobs/zighang/${uuid}`)).json(), { provider: 'zighang', id: uuid });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
