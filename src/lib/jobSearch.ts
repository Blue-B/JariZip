import type { Job } from './types';

const TRACKING_PARAMETER = /^(utm_.+|fbclid|gclid|dclid|msclkid|yclid|mc_cid|mc_eid|_ga)$/i;

/** A comparison key only. Never rewrite the original saved source URL. */
export function canonicalJobUrl(value: string): string {
  if (!value.trim()) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    // Hash-routed postings can have distinct IDs. Ordinary page anchors cannot.
    if (!url.hash.startsWith('#/') && !url.hash.startsWith('#!/')) url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ko-KR');

/** Every term must occur, but terms can match different fields. */
export function matchesJobSearch(job: Job, query: string): boolean {
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = normalized([
    job.company, job.title, job.role, job.location, job.experience,
    job.employment, job.salary, ...job.skills, job.description, job.requirements,
  ].join(' '));
  return terms.every(term => text.includes(term));
}
