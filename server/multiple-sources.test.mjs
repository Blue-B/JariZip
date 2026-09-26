import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createJobService, normalizeJumpit, normalizeZighang, SourceError } from './job-sources.mjs';
import { createAppServer } from './http.mjs';
import { JOB_LOCATIONS, JOB_CATEGORIES } from './job-catalog.mjs';

const checkedAt = '2026-01-01T00:00:00.000Z';
const uuid = '11111111-2222-3333-4444-555555555555';
const jumpit = { id: 202, companyName: '자동시험 가상기업', title: 'Python 개발자', jobCategory: '서버/백엔드 개발자', techStacks: ['Python'], newcomer: true, minCareer: 0, maxCareer: 3, locations: ['서울'], alwaysOpen: false, closedAt: '2099-10-01T23:59:59' };
const zighang = { id: uuid, company: { name: '자동시험 가상기업' }, title: '마케팅 담당자', regions: ['부산'], depthOnes: ['마케팅_광고_홍보'], employeeTypes: ['정규직'], careerMin: 0, careerMax: 100, deadlineType: '마감일', endDate: '2099-10-01', createdAt: '2026-01-01T09:00:00' };

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

test('the shipped service exposes no unapproved source and refuses them before network', async () => {
  let calls = 0; const service = createJobService({ env: {}, fetcher: async () => { calls++; throw new Error('must not fetch'); } });
  assert.deepEqual(service.sources().map(source => [source.id, source.enabled]), [['saramin', false], ['wanted', false], ['jumpit', false], ['zighang', false]]);
  await assert.rejects(service.search({ provider: 'jumpit' }), error => error.code === 'SOURCE_NOT_PERMITTED');
  await assert.rejects(service.search({ provider: 'zighang' }), error => error.code === 'SOURCE_NOT_PERMITTED');
  await assert.rejects(service.detail('jumpit', '202'), error => error.code === 'SOURCE_NOT_PERMITTED');
  await assert.rejects(service.detail('zighang', uuid), error => error.code === 'SOURCE_NOT_PERMITTED');
  assert.equal(calls, 0);
});

test('nationwide and non-IT filters remain catalog-complete for the official provider path', async () => {
  assert.equal(JOB_LOCATIONS.length, 18); assert.ok(JOB_CATEGORIES.some(category => category.id === 'medical'));
});

test('invalid providers, filters and foreign IDs fail before contacting any source', async () => {
  let calls = 0;
  const service = createJobService({ env: { SARAMIN_ACCESS_KEY: 'test-only-key-value' }, fetcher: async () => { calls++; throw new Error('Must not fetch'); } });
  for (const filters of [{ provider: 'constructor' }, { location: 'not-a-region' }, { category: '__proto__' }, { experience: '-1' }, { page: 10000 }]) await assert.rejects(service.search(filters), SourceError);
  await assert.rejects(service.detail('saramin', uuid), error => error.code === 'BAD_ID');
  await assert.rejects(service.detail('saramin', 'https://untrusted.invalid'), error => error.code === 'BAD_ID');
  assert.equal(calls, 0);
});

test('HTTP forwards all filters to the approved provider and rejects unapproved detail routes', async () => {
  const calls = [];
  const service = { sources: () => [], search: async filters => { calls.push(filters); return { jobs: [] }; }, detail: async (provider, id) => ({ provider, id }) };
  const server = createAppServer({ service }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/jobs?source=saramin&location=busan&category=marketing&experience=new`)).status, 200);
    assert.deepEqual({ provider: calls[0].provider, location: calls[0].location, category: calls[0].category, experience: calls[0].experience }, { provider: 'saramin', location: 'busan', category: 'marketing', experience: 'new' });
    assert.deepEqual(await (await fetch(`${base}/api/jobs/saramin/202`)).json(), { provider: 'saramin', id: '202' });
    assert.equal((await fetch(`${base}/api/jobs/zighang/${uuid}`)).status, 403);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
