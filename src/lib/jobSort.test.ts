import { describe, expect, it } from 'vitest';
import { normalizeWanted } from '../../server/job-sources.mjs';
import { sortJobs } from './jobSort';
import type { Job } from './types';

const now = Date.parse('2026-09-26T12:00:00+09:00');
const job = (id: number, fields: Partial<Job> = {}): Job => ({
  ...normalizeWanted({ id, position: `시험용 공고 ${id}`, company: { name: '정렬시험 가상기업' }, status: 'active' }, new Date(now).toISOString()),
  ...fields,
});
const titles = (jobs: Job[]) => jobs.map(item => item.title);

describe('retrieved job sorting', () => {
  it('preserves source order and never mutates the caller array', () => {
    const jobs = Object.freeze([job(900003), job(900001), job(900002)]);
    expect(sortJobs(jobs, 'source')).toEqual(jobs);
    expect(sortJobs(jobs, 'source')).not.toBe(jobs);
    sortJobs(jobs, 'deadline', now);
    expect(titles([...jobs])).toEqual(['시험용 공고 900003', '시험용 공고 900001', '시험용 공고 900002']);
  });
  it('puts upcoming deadlines first, undated jobs next and closed jobs last', () => {
    const jobs = [
      job(900001, { deadline: '', deadlineType: 'rolling' }),
      job(900002, { deadline: '2026-09-28' }),
      job(900003, { deadline: '2026-09-26' }),
      job(900004, { deadline: '2026-09-25' }),
      job(900005, { deadline: '2026-10-01', status: 'closed' }),
      job(900006, { deadline: '', deadlineType: 'until-filled' }),
    ];
    expect(sortJobs(jobs, 'deadline', now)).toEqual([jobs[2], jobs[1], jobs[0], jobs[5], jobs[3], jobs[4]]);
  });
  it('uses Korean end of day for date-only deadlines but respects explicit times', () => {
    const jobs = [job(900001, { deadline: '2026-09-26T11:00:00+09:00' }), job(900002, { deadline: '2026-09-26' }), job(900003)];
    expect(sortJobs(jobs, 'deadline', now)).toEqual([jobs[1], jobs[2], jobs[0]]);
    expect(sortJobs(jobs, 'deadline', Date.parse('2026-09-27T00:00:00+09:00'))).toEqual([jobs[2], jobs[0], jobs[1]]);
  });
  it('keeps ties stable and gives closed jobs a consistent order even with missing dates', () => {
    const jobs = [job(900001, { status: 'closed' }), job(900002, { status: 'closed', deadline: '2026-09-28' }), job(900003, { status: 'closed', deadline: '2026-09-27' }), job(900004, { status: 'closed' })];
    expect(sortJobs(jobs, 'deadline', now)).toEqual([jobs[2], jobs[1], jobs[0], jobs[3]]);
    const tied = [job(900001, { deadline: '2026-09-28' }), job(900002, { deadline: '2026-09-28' })];
    expect(sortJobs(tied, 'deadline', now)).toEqual(tied);
  });
  it('sorts actual publication dates, not verification or retrieval timestamps', () => {
    const jobs = [job(900001, { publishedAt: '', verifiedAt: '2026-12-31T00:00:00Z' }), job(900002, { publishedAt: '2026-09-24' }), job(900003, { publishedAt: '2026-09-25' }), job(900004, { publishedAt: '2026-09-25' })];
    expect(sortJobs(jobs, 'newest', now)).toEqual([jobs[2], jobs[3], jobs[1], jobs[0]]);
  });
  it('treats invalid dates as missing without producing an unstable comparator', () => {
    const jobs = [job(900001, { deadline: 'not-a-date', publishedAt: 'not-a-date' }), job(900002, { deadline: '2026-09-28', publishedAt: '2026-09-24' }), job(900003)];
    expect(sortJobs(jobs, 'deadline', now)).toEqual([jobs[1], jobs[0], jobs[2]]);
    expect(sortJobs(jobs, 'newest', now)).toEqual([jobs[1], jobs[0], jobs[2]]);
  });
});
