import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobService, normalizeWanted, normalizeJumpit, normalizeZighang } from './job-sources.mjs';

const json = value => Response.json(value);
const wanted = (id, position = '시험용 백엔드 개발자') => ({ id, position, company: { name: '자동시험 가상기업' }, status: 'active', hidden: false, annual_from: 0, annual_to: 100 });
const zighang = id => ({ id: `12345678-1234-1234-1234-${String(id).padStart(12, '0')}`, title: '시험용 공고', company: { name: '자동시험 가상기업' }, status: 'ACTIVE', deadlineType: '상시채용', regions: ['서울'], careerMin: 0, careerMax: 100 });
const pageOf = url => Number(url.searchParams.get('offset') || 0) / 20;
const decode = cursor => JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

function otherSources(url) {
  if (url.hostname.includes('jumpit')) return json({ result: { positions: [], totalCount: 0 } });
  const page = Number(url.searchParams.get('page'));
  return json({ success: true, data: { content: Array.from({ length: 20 }, (_, i) => zighang(page * 20 + i + 1)), last: page >= 2 } });
}

test('Wanted explicit null end envelope is empty, but malformed schemas are still errors', async () => {
  const service = createJobService({ env: {}, fetcher: async () => json({ data: null, links: { next: null } }) });
  const result = await service.search({ page: 1000 });
  assert.equal(result.jobs.length, 0); assert.equal(result.nextPage, null);
  for (const invalid of [{ changed: true }, { data: null }, { data: null, links: { next: '/next' } }]) {
    await assert.rejects(createJobService({ env: {}, fetcher: async () => json(invalid) }).search(), error => error.code === 'SOURCE_FORMAT');
  }
});

test('continuation stops exhausted sources and keeps loading the remaining source', async () => {
  let wantedCalls = 0, jumpitCalls = 0;
  const service = createJobService({ env: {}, fetcher: async input => {
    const url = new URL(input);
    if (url.hostname.includes('wanted')) { wantedCalls++; return json({ data: Array.from({ length: 20 }, (_, i) => wanted(i + 1)), links: { next: null } }); }
    if (url.hostname.includes('jumpit')) jumpitCalls++;
    return otherSources(url);
  } });
  const first = await service.search({ provider: 'all', cursor: 'start' });
  assert.equal(first.jobs.length, 40);
  const second = await service.search({ provider: 'all', cursor: first.nextCursor, page: 1 });
  assert.equal(second.jobs.length, 20); assert.ok(second.jobs.every(job => job.source === '직행'));
  assert.equal(wantedCalls, 1); assert.equal(jumpitCalls, 1);
  assert.equal(second.sourceResults.find(source => source.id === 'wanted').exhausted, true);
  const third = await service.search({ provider: 'all', cursor: second.nextCursor, page: 2 });
  assert.equal(third.nextCursor, null); assert.equal(third.jobs.length, 20);
});

test('failed source retries its original page instead of skipping it with the global page', async () => {
  const wantedPages = []; let fail = true;
  const service = createJobService({ env: {}, fetcher: async input => {
    const url = new URL(input);
    if (!url.hostname.includes('wanted')) return otherSources(url);
    wantedPages.push(pageOf(url));
    if (fail) return new Response('', { status: 503 });
    return json({ data: [wanted(77)], links: { next: null } });
  } });
  const first = await service.search({ provider: 'all', cursor: 'start' });
  assert.equal(first.sourceResults[0].status, 'error'); assert.equal(decode(first.nextCursor).pages.wanted, 0);
  fail = false;
  const second = await service.search({ provider: 'all', cursor: first.nextCursor, page: 1 });
  assert.deepEqual(wantedPages, [0, 0]); assert.ok(second.jobs.some(job => job.id === 'wanted-77'));
});

test('sparse filtering refills at most three source pages and remembers the fourth', async () => {
  let calls = 0;
  const service = createJobService({ env: {}, fetcher: async input => {
    const p = pageOf(new URL(input)); calls++;
    return json({ data: [wanted(p + 1, p < 3 ? '시험용 세일즈' : '시험용 백엔드 개발자')], links: { next: p < 3 ? '/next' : null } });
  } });
  const first = await service.search({ provider: 'wanted', category: 'development', cursor: 'start' });
  assert.equal(calls, 3); assert.equal(first.jobs.length, 0); assert.equal(decode(first.nextCursor).pages.wanted, 3);
  const second = await service.search({ provider: 'wanted', category: 'development', cursor: first.nextCursor, page: 1 });
  assert.equal(second.jobs.length, 1); assert.equal(second.nextCursor, null);
});

test('repeated upstream pages stop instead of generating an infinite duplicate feed', async () => {
  let calls = 0;
  const service = createJobService({ env: {}, fetcher: async () => { calls++; return json({ data: [wanted(1)], links: { next: '/next' } }); } });
  const result = await service.search({ provider: 'wanted', cursor: 'start' });
  assert.equal(result.jobs.length, 1); assert.equal(calls, 2); assert.equal(result.nextCursor, null);
  assert.ok(result.warnings.some(warning => warning.includes('반복')));
});

test('changed filters, malformed cursor and hostile page values are rejected before an upstream call', async () => {
  let calls = 0;
  const service = createJobService({ env: {}, fetcher: async input => { calls++; return json({ data: Array.from({ length: 20 }, (_, i) => wanted(pageOf(new URL(input)) * 20 + i + 1)), links: { next: '/next' } }); } });
  const first = await service.search({ provider: 'wanted', cursor: 'start' });
  const before = calls;
  for (const cursor of ['not-json', 'x'.repeat(5000), Buffer.from(JSON.stringify({ ...decode(first.nextCursor), pages: { wanted: -1 } })).toString('base64url')]) {
    await assert.rejects(service.search({ provider: 'wanted', cursor }), error => error.code === 'BAD_CURSOR');
  }
  await assert.rejects(service.search({ provider: 'wanted', query: 'changed', cursor: first.nextCursor }), error => error.code === 'BAD_CURSOR');
  assert.equal(calls, before);
});

test('search and continuation can go past the former 50-page ceiling', async () => {
  const service = createJobService({ env: {}, fetcher: async input => json({ data: Array.from({ length: 20 }, (_, i) => wanted(pageOf(new URL(input)) * 20 + i + 1)), links: { next: '/next' } }) });
  const legacy = await service.search({ page: 50 }); assert.equal(legacy.nextPage, 51);
  let cursor = 'start', result;
  for (let i = 0; i < 52; i++) { result = await service.search({ provider: 'wanted', cursor, page: i }); cursor = result.nextCursor; }
  assert.equal(decode(cursor).pages.wanted, 52);
  assert.equal(result.jobs[0].id, 'wanted-1021');
});

test('deadlines preserve source types and Wanted date-only expiry uses the end of the Korean day', () => {
  const at = '2099-01-01T00:00:00.000Z';
  const w = normalizeWanted({ ...wanted(1), due_time: '2099-10-25' }, at);
  assert.equal(w.deadline, '2099-10-25T14:59:59.000Z'); assert.equal(w.deadlineType, 'date');
  assert.equal(normalizeWanted(wanted(1), at).deadlineType, 'unknown');
  assert.equal(normalizeJumpit({ id: 1, companyName: '가상기업', title: '시험용', alwaysOpen: true }, at).deadlineType, 'rolling');
  assert.equal(normalizeZighang({ ...zighang(1), deadlineType: '채용시마감' }, at).deadlineType, 'until-filled');
});
