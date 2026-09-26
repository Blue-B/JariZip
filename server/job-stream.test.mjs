import test from 'node:test';
import assert from 'node:assert/strict';
import { streamJobs, fingerprint, MAX_PAGE } from './job-stream.mjs';
import { SourceError, normalizeWanted, normalizeJumpit, normalizeZighang } from './job-sources.mjs';

// These tests exercise the isolated continuation helper with synthetic in-memory search
// functions. They never build a production job service, so no unapproved endpoint can run.
const checkedAt = '2026-01-01T00:00:00.000Z';
const now = () => new Date(checkedAt);
const twoSources = () => [{ id: 'a', name: '가상출처A', enabled: true }, { id: 'b', name: '가상출처B', enabled: true }];
const oneSource = () => [{ id: 'a', name: '가상출처A', enabled: true }];
const records = (prefix, page, count = 20) => Array.from({ length: count }, (_, i) => ({
  id: `${prefix}-${page * 20 + i + 1}`, sourceUrl: `https://fixture.invalid/${prefix}/${page * 20 + i + 1}`,
  source: prefix, status: 'open', verification: 'source',
}));
const batch = (provider, jobs, nextPage, page) => ({ provider, jobs, nextPage, checkedAt, cached: false, warnings: [], pageFingerprint: fingerprint([provider, page, jobs.length]) });
const decode = cursor => JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

test('continuation stops exhausted sources and keeps loading the remaining source', async () => {
  let aCalls = 0, bCalls = 0;
  const search = async ({ provider, page }) => {
    if (provider === 'a') { aCalls++; return batch('a', records('a', 0), null, page); }
    bCalls++; return batch('b', records('b', page), page < 2 ? page + 1 : null, page);
  };
  const options = { provider: 'all', query: '', page: 0, location: 'all', category: 'all', experience: 'all' };
  const first = await streamJobs(options, 'start', { sources: twoSources, search, SourceError, now });
  assert.equal(first.jobs.length, 40);
  const second = await streamJobs({ ...options, page: 1 }, first.nextCursor, { sources: twoSources, search, SourceError, now });
  assert.equal(second.jobs.length, 20); assert.ok(second.jobs.every(job => job.source === 'b'));
  assert.equal(aCalls, 1); assert.equal(bCalls, 2);
  assert.equal(second.sourceResults.find(source => source.id === 'a').exhausted, true);
  const third = await streamJobs({ ...options, page: 2 }, second.nextCursor, { sources: twoSources, search, SourceError, now });
  assert.equal(third.nextCursor, null); assert.equal(third.jobs.length, 20);
});

test('failed source retries its original page instead of skipping it with the global page', async () => {
  const aPages = []; let fail = true;
  const search = async ({ provider, page }) => {
    if (provider === 'a') {
      aPages.push(page);
      if (fail) throw new SourceError('시험용 일시 장애', 503);
      return batch('a', records('a', 0, 1), null, page);
    }
    return batch('b', records('b', 0), null, page);
  };
  const options = { provider: 'all', query: '', page: 0, location: 'all', category: 'all', experience: 'all' };
  const first = await streamJobs(options, 'start', { sources: twoSources, search, SourceError, now });
  assert.equal(first.sourceResults[0].status, 'error'); assert.equal(decode(first.nextCursor).pages.a, 0);
  fail = false;
  const second = await streamJobs({ ...options, page: 1 }, first.nextCursor, { sources: twoSources, search, SourceError, now });
  assert.deepEqual(aPages, [0, 0]); assert.ok(second.jobs.some(job => job.id === 'a-1'));
});

test('sparse pages are refilled at most three times and the fourth position is remembered', async () => {
  let calls = 0;
  const search = async ({ page }) => { calls++; return batch('a', records('a', page, 1), page < 3 ? page + 1 : null, page); };
  const options = { provider: 'a', query: '', page: 0, location: 'all', category: 'all', experience: 'all' };
  const first = await streamJobs(options, 'start', { sources: oneSource, search, SourceError, now });
  assert.equal(calls, 3); assert.equal(first.jobs.length, 3); assert.equal(decode(first.nextCursor).pages.a, 3);
  const second = await streamJobs({ ...options, page: 1 }, first.nextCursor, { sources: oneSource, search, SourceError, now });
  assert.equal(second.jobs.length, 1); assert.equal(second.nextCursor, null);
});

test('repeated upstream pages stop instead of generating an infinite duplicate feed', async () => {
  let calls = 0;
  const search = async ({ page }) => { calls++; return { ...batch('a', records('a', 0, 1), page + 1, 0) }; };
  const result = await streamJobs({ provider: 'a', query: '', page: 0, location: 'all', category: 'all', experience: 'all' }, 'start', { sources: oneSource, search, SourceError, now });
  assert.equal(result.jobs.length, 1); assert.equal(calls, 2); assert.equal(result.nextCursor, null);
  assert.ok(result.warnings.some(warning => warning.includes('반복')));
});

test('changed filters and hostile cursors are rejected before an upstream call', async () => {
  let calls = 0;
  const search = async ({ page }) => { calls++; return batch('a', records('a', page), page + 1, page); };
  const options = { provider: 'a', query: '', page: 0, location: 'all', category: 'all', experience: 'all' };
  const first = await streamJobs(options, 'start', { sources: oneSource, search, SourceError, now });
  const before = calls;
  for (const cursor of ['not-json', 'x'.repeat(5000), Buffer.from(JSON.stringify({ ...decode(first.nextCursor), pages: { a: -1 } })).toString('base64url')]) {
    await assert.rejects(streamJobs(options, cursor, { sources: oneSource, search, SourceError, now }), error => error.code === 'BAD_CURSOR');
  }
  await assert.rejects(streamJobs({ ...options, query: 'changed' }, first.nextCursor, { sources: oneSource, search, SourceError, now }), error => error.code === 'BAD_CURSOR');
  assert.equal(calls, before);
});

test('continuation can go past the former 50-page ceiling', async () => {
  const search = async ({ page }) => batch('a', records('a', page), page + 1, page);
  const options = { provider: 'a', query: '', page: 0, location: 'all', category: 'all', experience: 'all' };
  let cursor = 'start', result;
  for (let i = 0; i < 52; i++) { result = await streamJobs({ ...options, page: i }, cursor, { sources: oneSource, search, SourceError, now }); cursor = result.nextCursor; }
  assert.equal(decode(cursor).pages.a, 52);
  assert.equal(result.jobs[0].id, 'a-1021');
  assert.ok(MAX_PAGE > 52);
});

test('deadlines preserve source types and pure normalizers stay available for fixtures', () => {
  const at = '2099-01-01T00:00:00.000Z';
  const w = normalizeWanted({ id: 1, position: '시험용', company: { name: '가상기업' }, status: 'active', due_time: '2099-10-25' }, at);
  assert.equal(w.deadline, '2099-10-25T14:59:59.000Z'); assert.equal(w.deadlineType, 'date');
  assert.equal(normalizeWanted({ id: 1, position: '시험용', company: { name: '가상기업' }, status: 'active' }, at).deadlineType, 'unknown');
  assert.equal(normalizeJumpit({ id: 1, companyName: '가상기업', title: '시험용', alwaysOpen: true }, at).deadlineType, 'rolling');
  assert.equal(normalizeZighang({ id: '12345678-1234-1234-1234-123456789abc', title: '시험용', company: { name: '가상기업' }, deadlineType: '채용시마감' }, at).deadlineType, 'until-filled');
});
