import type { Job } from './types';

const KST = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
/** Calendar-day countdown in Korea, while expiry itself respects the exact source time. */
export function jobDeadline(job: Pick<Job, 'deadline' | 'deadlineType' | 'status'>, now = Date.now()) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(job.deadline);
  const value = dateOnly ? `${job.deadline}T23:59:59+09:00` : job.deadline;
  const end = value ? Date.parse(value) : NaN;
  if (Number.isFinite(end)) {
    const date = new Date(end);
    const expired = end < now || job.status === 'closed';
    const days = Math.floor((end + KST) / DAY) - Math.floor((now + KST) / DAY);
    const countdown = expired ? '마감' : days === 0 ? '오늘 마감' : `D-${days}`;
    const shortDate = date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
    const fullDate = date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
    return { label: `${shortDate} · ${countdown}`, countdown, dateLabel: `${shortDate} 마감`, detail: `${fullDate} (한국 날짜 기준 · 정확한 접수 종료 시각은 원문 확인)`, urgent: !expired && days <= 7, expired };
  }
  const label = job.status === 'closed' ? '마감' : job.deadlineType === 'rolling' ? '상시채용' : job.deadlineType === 'until-filled' ? '채용 시 마감' : '마감일 미공개';
  return { label, countdown: label, dateLabel: '', detail: label === '마감일 미공개' ? '출처에서 날짜를 제공하지 않아요. 원문을 확인해주세요.' : label, urgent: false, expired: job.status === 'closed' };
}
