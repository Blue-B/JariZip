import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createJobService, normalizeWantedOpenApi, SourceError, WANTED_LIST_URL, WANTED_DETAIL_URL, WANTED_PAGE_SIZE } from './job-sources.mjs';
import { createAppServer } from './http.mjs';

// All payloads and keys here are synthetic. No real Wanted credential is requested or used.
// The V2 `/jobs` list is the recommended listing endpoint; `/v1/jobs/{id}` is the documented
// per-job detail endpoint, so the fixtures below mirror each schema separately.
const checkedAt = '2026-01-01T00:00:00.000Z';
const keyEnv = { WANTED_CLIENT_ID: 'test-only-wanted-client-id', WANTED_CLIENT_SECRET: 'test-only-wanted-client-secret' };
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

/** V2 list item: `name`, category `title`, `employment_type`; no annual/skill fields. */
const listItem = (overrides = {}) => ({
  id: 24090,
  status: 'active',
  due_time: '2099-05-01',
  name: '시험용 백엔드 개발자',
  company: { id: 79, name: '자동시험용 가상기업', description: '가상 회사 소개', company_tags: [{ tag_type_id: 1, text: '스타트업' }] },
  category_tags: { parent_tag: { id: 530, title: '개발' }, child_tags: [{ id: 768, title: '백엔드' }] },
  address: { country: '한국', location: '서울', full_location: '서울시 강남구 테헤란로 1' },
  employment_type: 'regular',
  // The live V2 example appends the client id; the normalizer must not persist it.
  url: 'https://www.wanted.co.kr/wd/24090?client_id=test-client-tracking',
  ...overrides,
});

/** V1 detail record: `detail.*`, category/skill `text`, annual range. */
const detailRecord = (overrides = {}) => ({
  id: 24090,
  status: 'active',
  due_time: '2099-05-01',
  company: { id: 79, name: '자동시험용 가상기업', description: '가상 회사 소개', company_tags: [{ tag_type_id: 1, text: '스타트업' }] },
  category_tags: { parent_tag: { id: 530, text: '개발' }, child_tags: [{ id: 768, text: '백엔드' }] },
  skill_tags: [{ id: 1630, text: 'Python' }, { id: 1631, text: 'SQL' }],
  address: { country: '한국', location: '서울', full_location: '서울시 강남구 테헤란로 1' },
  annual_from: 1,
  annual_to: 7,
  url: 'https://www.wanted.co.kr/wd/24090',
  detail: {
    name: '시험용 백엔드 개발자',
    intro: '가상 회사와 포지션 소개',
    main_tasks: '가상 백엔드 개발 업무',
    requirements: '가상 자격 요건',
    preferred_points: '가상 우대 사항',
    benefits: '가상 복지',
  },
  ...overrides,
});

test('the Wanted normalizer maps V2 list fields and V1 detail fields without inventing salary or dates', () => {
  const list = normalizeWantedOpenApi(listItem(), checkedAt);
  assert.equal(list.id, 'wanted-24090');
  assert.equal(list.company, '자동시험용 가상기업');
  assert.equal(list.title, '시험용 백엔드 개발자');
  assert.equal(list.role, '개발 · 백엔드');
  assert.equal(list.location, '서울 서울시 강남구 테헤란로 1');
  assert.equal(list.experience, '경력 미기재');
  assert.equal(list.salary, '미기재');
  assert.equal(list.employment, 'regular');
  assert.deepEqual(list.skills, []);
  assert.equal(list.deadline, '2099-05-01T14:59:59.000Z');
  assert.equal(list.status, 'open');
  assert.equal(list.source, '원티드');
  assert.equal(list.sourceUrl, 'https://www.wanted.co.kr/wd/24090');
  assert.doesNotMatch(list.sourceUrl, /client_id/);
  assert.match(list.description, /목록 정보/);

  const detail = normalizeWantedOpenApi(detailRecord(), checkedAt);
  assert.equal(detail.title, '시험용 백엔드 개발자');
  assert.equal(detail.role, '개발 · 백엔드');
  assert.deepEqual(detail.skills, ['Python', 'SQL']);
  assert.equal(detail.employment, '미기재');
  assert.equal(detail.experience, '경력 1년~7년');
  assert.equal(detail.description, '가상 회사와 포지션 소개\n\n가상 백엔드 개발 업무');
  assert.match(detail.requirements, /가상 자격 요건/);
  assert.match(detail.requirements, /우대사항\n가상 우대 사항/);
  assert.equal(detail.benefits, '가상 복지');
  assert.match(detail.companyInfo, /가상 회사 소개/);
  assert.match(detail.companyInfo, /원티드 기업 태그: 스타트업/);
});

test('the Wanted normalizer keeps unknown statuses unknown and rejects malformed rows', () => {
  assert.equal(normalizeWantedOpenApi(listItem({ status: 'draft' }), checkedAt).status, 'unknown');
  assert.equal(normalizeWantedOpenApi(listItem({ status: 'close' }), checkedAt).status, 'closed');
  assert.equal(normalizeWantedOpenApi(listItem({ due_time: null, status: 'active' }), checkedAt).status, 'open');
  for (const bad of [null, {}, { id: 'x', company: { name: 'c' }, name: 't' }, { id: 1, company: {}, name: 't' }, { id: 1, company: { name: 'c' }, name: '' }]) {
    assert.throws(() => normalizeWantedOpenApi(bad, checkedAt), SourceError);
  }
});

test('Wanted search uses the V2 list with both documented headers and zero-based offset/limit', async () => {
  let requested, init;
  const service = createJobService({ env: keyEnv, fetcher: async (url, options) => { requested = new URL(url); init = options; return json({ data: [listItem()], links: { next: '/v2/jobs?offset=20&limit=20' } }); } });
  const result = await service.search({ provider: 'wanted', query: '개발자', page: 1 });
  assert.equal(requested.origin + requested.pathname, WANTED_LIST_URL);
  assert.match(requested.pathname, /\/v2\/jobs$/);
  assert.equal(requested.searchParams.get('offset'), String(WANTED_PAGE_SIZE));
  assert.equal(requested.searchParams.get('limit'), String(WANTED_PAGE_SIZE));
  assert.equal(requested.searchParams.get('sort'), 'job.latest_order');
  assert.equal(init.headers['wanted-client-id'], keyEnv.WANTED_CLIENT_ID);
  assert.equal(init.headers['wanted-client-secret'], keyEnv.WANTED_CLIENT_SECRET);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].source, '원티드');
  assert.equal(result.nextPage, 2);
});

test('Wanted sends location and years to the V2 list and omits them for 전국/경력 무관', async () => {
  let requested;
  const service = createJobService({ env: keyEnv, fetcher: async url => { requested = new URL(url); return json({ data: [listItem()], links: {} }); } });
  await service.search({ provider: 'wanted', location: 'busan', experience: '3' });
  assert.equal(requested.searchParams.get('locations'), '부산');
  assert.equal(requested.searchParams.get('years'), '3');
  await service.search({ provider: 'wanted', refresh: true, location: 'seoul', experience: 'new' });
  assert.equal(requested.searchParams.get('locations'), '서울');
  assert.equal(requested.searchParams.get('years'), '0');
  await service.search({ provider: 'wanted', refresh: true, location: 'all', experience: 'all' });
  assert.equal(requested.searchParams.has('locations'), false);
  assert.equal(requested.searchParams.has('years'), false);
});

test('Wanted list stops when links.next is absent and detail re-queries the V1 endpoint', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async () => json({ data: [listItem()], links: {} }) });
  assert.equal((await service.search({ provider: 'wanted' })).nextPage, null);
  let requested;
  const detailService = createJobService({ env: keyEnv, fetcher: async (url, options) => { requested = new URL(url); assert.equal(options.headers['wanted-client-id'], keyEnv.WANTED_CLIENT_ID); return json(detailRecord()); } });
  const { job } = await detailService.detail('wanted', '24090');
  assert.equal(requested.origin + requested.pathname, `${WANTED_DETAIL_URL}/24090`);
  assert.match(requested.pathname, /\/v1\/jobs\/24090$/);
  assert.equal(job.title, '시험용 백엔드 개발자');
  const other = createJobService({ env: keyEnv, fetcher: async () => json(detailRecord({ id: 999 })) });
  await assert.rejects(other.detail('wanted', '24090'), error => error.code === 'SOURCE_FORMAT');
  await assert.rejects(detailService.detail('wanted', '../private'), error => error.code === 'BAD_ID');
});

test('a missing Wanted field refuses before any network call', async () => {
  let calls = 0;
  const partial = createJobService({ env: { WANTED_CLIENT_ID: 'only-id' }, fetcher: async () => { calls++; throw new Error('must not fetch'); } });
  await assert.rejects(partial.search({ provider: 'wanted' }), error => error.code === 'KEY_REQUIRED');
  await assert.rejects(createJobService({ env: {}, fetcher: async () => { calls++; throw new Error('must not fetch'); } }).detail('wanted', '24090'), error => error.code === 'KEY_REQUIRED');
  assert.equal(calls, 0);
});

test('Wanted upstream restrictions and malformed bodies fail explicitly', async () => {
  for (const upstream of [new Response('', { status: 403 }), json({ error_code: 'Unauthorized', message: 'bad key' }), json({ unexpected: true }), new Response('<html>blocked</html>', { headers: { 'Content-Type': 'text/html' } })]) {
    const service = createJobService({ env: keyEnv, fetcher: async () => upstream });
    await assert.rejects(service.search({ provider: 'wanted' }), SourceError);
  }
  const allInvalid = createJobService({ env: keyEnv, fetcher: async () => json({ data: [{ bad: true }] }) });
  await assert.rejects(allInvalid.search({ provider: 'wanted' }), error => error.code === 'SOURCE_FORMAT');
});

test('the HTTP API exposes Wanted as an approved, two-field, detail-enabled source', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async url => json(new URL(url).pathname.endsWith('/24090') ? detailRecord() : { data: [listItem()], links: {} }) });
  const server = createAppServer({ service }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const info = await (await fetch(`${base}/api/sources`)).json();
    assert.equal(info.sources.find(source => source.id === 'wanted').enabled, true);
    const list = await (await fetch(`${base}/api/jobs?source=wanted`)).json();
    assert.equal(list.jobs[0].id, 'wanted-24090');
    assert.equal(list.jobs[0].source, '원티드');
    const detail = await fetch(`${base}/api/jobs/wanted/24090`);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).job.id, 'wanted-24090');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
