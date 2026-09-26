import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeWanted } from '../../server/job-sources.mjs';
import { canProbeSource, canRefreshJob, fetchSources, probeSource, refreshRemoteJob, searchRemoteJobs, sourceIdentity, SOURCE_SITES } from './remoteJobs';

const checkedAt = '2026-09-26T00:00:00.000Z';
const makeJob = (id = 900001) => normalizeWanted({ id, company: { name: '시험용 가상기업' }, position: '시험용 공고', status: 'active', hidden: false, annual_from: 0, annual_to: 3, address: { location: '부산' } }, checkedAt);
afterEach(() => vi.unstubAllGlobals());

describe('multiple source identity', () => {
  it('recognizes canonical Korean sources without mixing IDs', () => {
    expect(sourceIdentity({ sourceUrl: 'https://www.wanted.co.kr/wd/123' })).toEqual({ source: 'wanted', id: '123' });
    expect(sourceIdentity({ sourceUrl: 'https://jumpit.saramin.co.kr/position/456?utm_source=test' })).toEqual({ source: 'jumpit', id: '456' });
    expect(sourceIdentity({ sourceUrl: 'https://zighang.com/recruitment/12345678-1234-1234-1234-123456789abc' })).toEqual({ source: 'zighang', id: '12345678-1234-1234-1234-123456789abc' });
    expect(sourceIdentity({ sourceUrl: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=789' })).toEqual({ source: 'saramin', id: '789' });
  });
  it('rejects credentials, forged hosts, unexpected ports and invalid source IDs', () => {
    for (const sourceUrl of ['http://jumpit.saramin.co.kr/position/123', 'https://jumpit.saramin.co.kr.evil.example/position/123', 'https://user:secret@jumpit.saramin.co.kr/position/123', 'https://jumpit.saramin.co.kr:8443/position/123', 'https://jumpit.saramin.co.kr/position/not-an-id', 'https://zighang.com/recruitment/../../private']) expect(sourceIdentity({ sourceUrl })).toBeNull();
  });
});

describe('unapproved source runtime block', () => {
  it('never issues a search request for an unapproved source, even when a stale list marks it enabled', async () => {
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    for (const source of ['wanted', 'jumpit', 'zighang'] as const) {
      await expect(searchRemoteJobs(source, '', 'all', 0)).rejects.toThrow('제공사의 사전 승인 없이');
      await expect(probeSource(source)).rejects.toThrow('제공사의 사전 승인 없이');
    }
    expect(mock).not.toHaveBeenCalled();
  });
  it('reports which saved postings may be re-queried and blocks the rest before network', async () => {
    expect(canRefreshJob({ sourceUrl: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=789' })).toBe(true);
    expect(canRefreshJob({ sourceUrl: 'https://www.wanted.co.kr/wd/123' })).toBe(false);
    expect(canProbeSource('saramin')).toBe(true); expect(canProbeSource('wanted')).toBe(false);
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    await expect(refreshRemoteJob({ sourceUrl: 'https://www.wanted.co.kr/wd/123' })).rejects.toThrow('자동 조회를 지원하지 않아요');
    await expect(refreshRemoteJob({ sourceUrl: 'https://jumpit.saramin.co.kr/position/900002' })).rejects.toThrow('자동 조회를 지원하지 않아요');
    await expect(refreshRemoteJob({ sourceUrl: 'https://zighang.com/recruitment/12345678-1234-1234-1234-123456789abc' })).rejects.toThrow('자동 조회를 지원하지 않아요');
    expect(mock).not.toHaveBeenCalled();
  });
  it('exposes working official site links for normal outbound navigation only', () => {
    for (const site of Object.values(SOURCE_SITES)) expect(new URL(site.url).protocol).toBe('https:');
  });
});

describe('multi-source client boundary', () => {
  it('passes all applied filters and accepts a bounded combined page larger than 20', async () => {
    const mock = vi.fn(async (_input: RequestInfo | URL) => Response.json({ jobs: Array.from({ length: 60 }, (_, index) => makeJob(900001 + index)), checkedAt, nextPage: 1, warnings: ['시험용 안내'], sourceResults: [{ id: 'wanted', name: '원티드', status: 'ok', count: 60 }, { id: 'jumpit', name: '점핏', status: 'error', count: 0, message: '시험용 제한' }] }));
    vi.stubGlobal('fetch', mock);
    const result = await searchRemoteJobs('all', 'Python', 'busan', 0, undefined, false, 'development', '1');
    const url = new URL(String(mock.mock.calls[0]?.[0]), 'http://localhost');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ source: 'all', q: 'Python', location: 'busan', category: 'development', experience: '1', page: '0' });
    expect(result.jobs).toHaveLength(60);
    expect(result.nextPage).toBe(1);
    expect(result.sourceResults[1]).toMatchObject({ status: 'error', message: '시험용 제한' });
  });
  it('keeps configured and unconfigured sources distinct for display', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ sources: [{ id: 'jumpit', name: '점핏', enabled: false, note: '승인 없음' }, { id: 'zighang', name: '직행', enabled: false, note: '승인 없음' }, { id: 'saramin', name: '사람인', enabled: false, note: '키 필요' }, { id: 'not-a-source', name: '잘못된 출처', enabled: true, note: '' }] })));
    expect((await fetchSources()).map(source => [source.id, source.enabled])).toEqual([['jumpit', false], ['zighang', false], ['saramin', false]]);
  });
  it('rejects a detail response for another posting before it can replace saved data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ job: makeJob(900002) })));
    await expect(refreshRemoteJob({ sourceUrl: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=900001' })).rejects.toThrow('요청한 공고와 다른 응답');
  });
  it('rejects oversized or fabricated aggregate responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ jobs: Array.from({ length: 201 }, () => makeJob()), checkedAt })));
    await expect(searchRemoteJobs('all', '', 'all', 0)).rejects.toThrow('목록 형식');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ jobs: [{ ...makeJob(), isDemo: true }], checkedAt })));
    await expect(searchRemoteJobs('all', '', 'all', 0)).rejects.toThrow();
  });
});
