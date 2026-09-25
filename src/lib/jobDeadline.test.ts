import { describe, expect, it } from 'vitest';
import { jobDeadline } from './jobDeadline';
import { parseRemoteJob } from './domain';
import { normalizeWanted } from '../../server/job-sources.mjs';

const at = Date.parse('2026-09-26T00:30:00+09:00');
describe('source deadline presentation', () => {
  it('counts Korean calendar days instead of rounding remaining hours', () => {
    expect(jobDeadline({ deadline: '2026-09-27T00:05:00+09:00', status: 'open' }, at).label).toContain('D-1');
    expect(jobDeadline({ deadline: '2026-09-26T23:59:59+09:00', status: 'open' }, at).label).toContain('오늘 마감');
    expect(jobDeadline({ deadline: '2026-09-26T00:15:00+09:00', status: 'open' }, at).expired).toBe(true);
  });
  it('keeps a date-only deadline open through the entire Korean day', () => {
    const job = { deadline: '2026-09-26', status: 'open' as const };
    expect(jobDeadline(job, Date.parse('2026-09-26T23:59:00+09:00')).expired).toBe(false);
    expect(jobDeadline(job, Date.parse('2026-09-27T00:00:00+09:00')).expired).toBe(true);
  });
  it('does not infer rolling recruitment from a missing date', () => {
    expect(jobDeadline({ deadline: '', status: 'open' }, at).label).toBe('마감일 미공개');
    expect(jobDeadline({ deadline: '', deadlineType: 'rolling', status: 'open' }, at).label).toBe('상시채용');
    expect(jobDeadline({ deadline: '', deadlineType: 'until-filled', status: 'open' }, at).label).toBe('채용 시 마감');
    expect(jobDeadline({ deadline: '', deadlineType: 'rolling', status: 'closed' }, at).label).toBe('마감');
  });
  it('accepts legacy records and preserves new deadline metadata on validated imports', () => {
    const current = normalizeWanted({ id: 900001, position: '시험용 공고', company: { name: '가상기업' }, status: 'active' }, new Date(at).toISOString());
    expect(parseRemoteJob({ ...current, deadlineType: 'rolling' }).deadlineType).toBe('rolling');
    const { deadlineType: _removed, ...legacy } = current;
    expect(parseRemoteJob(legacy).deadlineType).toBeUndefined();
    expect(() => parseRemoteJob({ ...current, deadlineType: 'invented' })).toThrow();
  });
});
