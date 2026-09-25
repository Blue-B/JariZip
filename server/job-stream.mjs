import { createHash } from 'node:crypto';

// A generous numeric safety bound, not the former 50-page product limit.
export const MAX_PAGE = 9999;
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);

/** Continue each source independently; never skip failed pages or refetch exhausted sources. */
export async function streamJobs(options, cursor, { sources, search, SourceError, now }) {
  const enabled = sources().filter(source => source.enabled && (options.provider === 'all' || source.id === options.provider));
  const key = fingerprint([options.provider, options.query.trim(), options.location, options.category, options.experience]);
  let state = { v: 1, key, pages: Object.fromEntries(enabled.map(source => [source.id, 0])), last: {} };
  if (cursor !== 'start') {
    try {
      if (typeof cursor !== 'string' || cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
      state = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (state.v !== 1 || state.key !== key || !state.pages || !state.last ||
          Object.keys(state.pages).length !== enabled.length ||
          enabled.some(source => !Object.hasOwn(state.pages, source.id) || (state.pages[source.id] !== null && (!Number.isInteger(state.pages[source.id]) || state.pages[source.id] < 0 || state.pages[source.id] > MAX_PAGE))) ||
          Object.entries(state.last).some(([id, value]) => !enabled.some(source => source.id === id) || typeof value !== 'string' || !/^[0-9a-f]{24}$/.test(value))) throw new Error();
    } catch { throw new SourceError('이어보기 정보가 올바르지 않아요. 검색을 다시 시작해주세요.', 400, 'BAD_CURSOR'); }
  }
  const results = await Promise.all(enabled.map(async source => {
    let next = state.pages[source.id], last = state.last[source.id], scannedPages = 0, checkedAt = now().toISOString(), cached = true;
    const jobs = [], seen = new Set(), warnings = [];
    let error;
    // Refill sparse filtered pages, bounded to three upstream requests per source.
    // A time budget prevents one source's sparse pages blocking all other results.
    const started = Date.now();
    for (let scan = 0; scan < 3 && next !== null && jobs.length < (source.id === 'jumpit' ? 16 : 20); scan++) {
      if (scan && Date.now() - started > 10000) break;
      try {
        const requestedPage = next;
        const result = await search({ ...options, provider: source.id, page: requestedPage });
        scannedPages++; checkedAt = result.checkedAt; cached = cached && result.cached; warnings.push(...result.warnings);
        const signature = result.pageFingerprint;
        if (signature && signature === last) {
          next = null;
          warnings.push(`${source.name}에서 같은 조회 구간을 반복해 반환하여 이어보기를 멈췄어요. 원본을 확인해주세요.`);
          break;
        }
        if (signature) last = signature;
        for (const job of result.jobs) if (!seen.has(job.sourceUrl)) { seen.add(job.sourceUrl); jobs.push(job); }
        if (result.nextPage !== null && result.nextPage <= requestedPage) throw new SourceError('출처의 다음 조회 위치를 확인하지 못했어요.', 502, 'SOURCE_FORMAT');
        next = result.nextPage;
      } catch (problem) {
        error = problem instanceof SourceError ? problem.message : '출처 응답을 읽지 못했어요.';
        break;
      }
    }
    return { source, jobs, next, last, checkedAt, cached, warnings, scannedPages, error };
  }));
  if (results.length && results.every(result => result.error && !result.jobs.length)) {
    throw new SourceError('모든 출처의 조회에 실패했어요. 기존 목록은 유지되며 같은 위치에서 다시 시도할 수 있어요.', 503, 'ALL_SOURCES_FAILED');
  }
  const jobs = [], seen = new Set();
  for (let i = 0; i < Math.max(0, ...results.map(result => result.jobs.length)); i++) for (const result of results) {
    const job = result.jobs[i];
    if (job && !seen.has(job.sourceUrl)) { seen.add(job.sourceUrl); jobs.push(job); }
  }
  const pages = Object.fromEntries(results.map(result => [result.source.id, result.next]));
  const last = Object.fromEntries(results.filter(result => result.last).map(result => [result.source.id, result.last]));
  const nextCursor = results.some(result => result.next !== null)
    ? Buffer.from(JSON.stringify({ v: 1, key, pages, last })).toString('base64url') : null;
  return {
    provider: options.provider, jobs, nextCursor, nextPage: nextCursor ? options.page + 1 : null,
    checkedAt: results.map(result => result.checkedAt).sort()[0] || now().toISOString(), cached: results.every(result => result.cached),
    warnings: [...new Set(results.flatMap(result => result.warnings))],
    sourceResults: results.map(result => ({ id: result.source.id, name: result.source.name, count: result.jobs.length,
      status: result.error ? 'error' : 'ok', exhausted: result.next === null, scannedPages: result.scannedPages,
      ...(result.error ? { message: result.error } : {}) })),
  };
}
