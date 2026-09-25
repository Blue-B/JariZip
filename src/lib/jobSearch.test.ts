import { describe, expect, it } from 'vitest';
import { canonicalJobUrl, matchesJobSearch } from './jobSearch';
import { createDemoState } from './seed';

describe('job source deduplication', () => {
  it('ignores campaign tags and non-routing anchors, keeping the original posting ID', () => {
    expect(canonicalJobUrl('https://jobs.example/view?rec_idx=123&utm_source=mail&fbclid=abc#apply'))
      .toBe(canonicalJobUrl('https://jobs.example/view?rec_idx=123'));
    expect(canonicalJobUrl('https://jobs.example/view?rec_idx=123'))
      .not.toBe(canonicalJobUrl('https://jobs.example/view?rec_idx=124'));
  });
  it('normalizes query order and preserves hash-routed job IDs', () => {
    expect(canonicalJobUrl('https://jobs.example/?b=2&a=1')).toBe(canonicalJobUrl('https://jobs.example/?a=1&b=2'));
    expect(canonicalJobUrl('https://jobs.example/#/jobs/123')).not.toBe(canonicalJobUrl('https://jobs.example/#/jobs/124'));
    expect(canonicalJobUrl('https://jobs.example/#!/jobs/123')).toContain('#!/jobs/123');
  });
  it('rejects unsafe, authenticated or malformed addresses', () => {
    for (const url of ['', 'not an address', 'javascript:alert(1)', 'https://person:password@example.com/']) {
      expect(canonicalJobUrl(url)).toBe('');
    }
  });
});

describe('job search', () => {
  const job = { ...createDemoState().jobs[0], company: '예시개발사', location: '서울 마포구', title: 'API 개발자',
    employment: '정규직', skills: ['Python', 'FastAPI'], description: '데이터 처리', requirements: 'SQL 경험' };
  it('combines words across title, location, stack, contract and requirements', () => {
    expect(matchesJobSearch(job, 'python 서울 정규직 SQL')).toBe(true);
    expect(matchesJobSearch(job, ' python   서울 ')).toBe(true);
    expect(matchesJobSearch(job, 'python 부산')).toBe(false);
  });
  it('supports full-width text and empty queries', () => {
    expect(matchesJobSearch(job, 'Ｐｙｔｈｏｎ')).toBe(true);
    expect(matchesJobSearch(job, '  ')).toBe(true);
  });
});
