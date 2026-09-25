import type { Job } from './types';

export type JobSort = 'source' | 'deadline' | 'newest';

function dateValue(value: string, endOfDay = false): number | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? '23:59:59' : '00:00:00'}+09:00` : value;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Sort only retrieved records. Never substitute retrieval time for a missing date.
 * Source order is a deterministic tie-breaker and the caller's array is not mutated.
 */
export function sortJobs(jobs: readonly Job[], sort: JobSort, now = Date.now()): Job[] {
  if (sort === 'source') return [...jobs];
  return jobs.map((job, index) => ({ job, index })).sort((a, b) => {
    if (sort === 'newest') {
      const first = dateValue(a.job.publishedAt), second = dateValue(b.job.publishedAt);
      if (first === null || second === null) return first === second ? a.index - b.index : first === null ? 1 : -1;
      return second - first || a.index - b.index;
    }
    const first = dateValue(a.job.deadline, true), second = dateValue(b.job.deadline, true);
    const rank = (job: Job, deadline: number | null) => job.status === 'closed' || (deadline !== null && deadline < now) ? 2 : deadline === null ? 1 : 0;
    const rankDiff = rank(a.job, first) - rank(b.job, second);
    if (rankDiff) return rankDiff;
    if (first === null || second === null) return first === second ? a.index - b.index : first === null ? 1 : -1;
    return first - second || a.index - b.index;
  }).map(entry => entry.job);
}
