import { parseRemoteJob } from './domain';
import { canonicalJobUrl } from './jobSearch';
import type { Job, WorkspaceState } from './types';

export type JobSource = 'wanted' | 'saramin' | 'jumpit' | 'zighang';
export type SearchSource = JobSource | 'all';
export interface SourceResult { id: JobSource; name: string; count: number; status: 'ok' | 'error'; message?: string; exhausted?: boolean; scannedPages?: number }
export interface SearchResult { jobs: Job[]; nextPage: number | null; checkedAt: string; warnings: string[]; cached: boolean; total?: number; sourceResults: SourceResult[]; nextCursor?: string | null }
export interface SourceOption { id: JobSource; name: string; enabled: boolean; note: string }
const providers: JobSource[] = ['wanted', 'saramin', 'jumpit', 'zighang'];
const api = `${import.meta.env.BASE_URL}api`;

async function request(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    const signals = [AbortSignal.timeout(30000), ...(signal ? [signal] : [])];
    response = await fetch(`${api}${path}`, { signal: AbortSignal.any(signals), headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('공고 조회 서버에 연결하지 못했어요. 서버 실행 상태와 인터넷 연결을 확인해주세요.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('공고 API가 없는 정적 미리보기예요. npm start 또는 npm run dev로 실행해주세요.');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object') throw new Error('서버 응답을 읽을 수 없어요.');
  const value = body as Record<string, unknown>;
  if (!response.ok) {
    const error = value.error as { message?: unknown } | undefined;
    throw new Error(typeof error?.message === 'string' ? error.message : '공고를 가져오지 못했어요.');
  }
  return value;
}

export async function fetchSources(signal?: AbortSignal): Promise<SourceOption[]> {
  const data = await request('/sources', signal);
  if (!Array.isArray(data.sources)) throw new Error('출처 정보를 읽을 수 없어요.');
  return data.sources.filter((s): s is SourceOption => s && providers.includes(s.id) && typeof s.enabled === 'boolean' && typeof s.name === 'string' && typeof s.note === 'string');
}
export async function searchRemoteJobs(source: SearchSource, query: string, location: string, page: number, signal?: AbortSignal, refresh = false, category = 'all', experience = 'all', cursor?: string): Promise<SearchResult> {
  const params = new URLSearchParams({ source, q: query, location, category, experience, page: String(page), refresh: refresh ? '1' : '0' });
  if (cursor !== undefined) params.set('cursor', cursor);
  const data = await request(`/jobs?${params}`, signal);
  if (data.nextCursor !== undefined && data.nextCursor !== null && (typeof data.nextCursor !== 'string' || data.nextCursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(data.nextCursor))) throw new Error('이어보기 응답 형식이 올바르지 않아요.');
  if (!Array.isArray(data.jobs) || data.jobs.length > 200 || typeof data.checkedAt !== 'string' || !Number.isFinite(Date.parse(data.checkedAt))) throw new Error('공고 목록 형식이 올바르지 않아요.');
  const jobs = data.jobs.map(parseRemoteJob);
  if (jobs.some(job => job.isDemo || job.verification !== 'source')) throw new Error('실제 출처가 확인되지 않은 결과는 표시하지 않아요.');
  const sourceResults: SourceResult[] = Array.isArray(data.sourceResults) ? data.sourceResults.filter((item): item is SourceResult => item && providers.includes(item.id) && typeof item.name === 'string' && Number.isInteger(item.count) && item.count >= 0 && ['ok', 'error'].includes(item.status) && (item.message === undefined || typeof item.message === 'string')) : [];
  return { jobs, checkedAt: data.checkedAt, nextPage: Number.isInteger(data.nextPage) && Number(data.nextPage) > page && Number(data.nextPage) <= 9999 ? Number(data.nextPage) : null,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((v): v is string => typeof v === 'string') : [], cached: data.cached === true,
    total: Number.isSafeInteger(data.total) && Number(data.total) >= 0 ? Number(data.total) : undefined, sourceResults, nextCursor: data.nextCursor as string | null | undefined };
}
export function sourceIdentity(job: Pick<Job, 'sourceUrl'>): { source: JobSource; id: string } | null {
  try {
    const url = new URL(job.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const wanted = /^\/wd\/(\d{1,12})\/?$/.exec(url.pathname);
    if (url.hostname === 'www.wanted.co.kr' && wanted) return { source: 'wanted', id: wanted[1] };
    const jumpit = /^\/position\/(\d{1,12})\/?$/.exec(url.pathname);
    if (url.hostname === 'jumpit.saramin.co.kr' && jumpit) return { source: 'jumpit', id: jumpit[1] };
    const zighang = /^\/recruitment\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i.exec(url.pathname);
    if (url.hostname === 'zighang.com' && zighang) return { source: 'zighang', id: zighang[1] };
    const id = url.searchParams.get('rec_idx');
    if (['www.saramin.co.kr', 'm.saramin.co.kr'].includes(url.hostname) && id && /^\d{1,12}$/.test(id)) return { source: 'saramin', id };
  } catch { /* Other sources can still be imported manually. */ }
  return null;
}
export async function refreshRemoteJob(job: Pick<Job, 'sourceUrl'>, signal?: AbortSignal, refresh = true): Promise<Job> {
  const identity = sourceIdentity(job);
  if (!identity) throw new Error('이 출처는 자동 조회를 지원하지 않아요. 원문을 확인해 수동 기록해주세요.');
  const data = await request(`/jobs/${identity.source}/${identity.id}?refresh=${refresh ? '1' : '0'}`, signal);
  const record = parseRemoteJob(data.job);
  if (record.isDemo || record.verification !== 'source') throw new Error('공고 출처를 확인하지 못했어요.');
  const returned = sourceIdentity(record);
  if (returned?.source !== identity.source || returned.id !== identity.id) throw new Error('요청한 공고와 다른 응답을 받았어요.');
  return record;
}

/** Update only the current saved listing; never modify application snapshots. */
export function upsertRemoteJob(state: WorkspaceState, incoming: Job): { state: WorkspaceState; job: Job } {
  const key = canonicalJobUrl(incoming.sourceUrl);
  if (!key || incoming.isDemo || incoming.verification !== 'source') throw new Error('출처가 있는 실제 공고만 보관할 수 있어요.');
  const previous = state.jobs.find(job => job.id === incoming.id || canonicalJobUrl(job.sourceUrl) === key);
  if (!previous && state.jobs.length >= 500) throw new Error('공고 보관 한도 500개에 도달했어요. 백업 후 불필요한 기록을 정리해주세요.');
  const job = { ...incoming, id: previous?.id ?? incoming.id, saved: true };
  return { job, state: { ...state, jobs: previous ? state.jobs.map(item => item.id === previous.id ? job : item) : [job, ...state.jobs] } };
}
