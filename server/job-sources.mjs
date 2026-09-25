// Read-only, bounded adapters. No login, cookie, CAPTCHA bypass or arbitrary URL proxy.
export class SourceError extends Error {
  constructor(message, status = 502, code = 'SOURCE_ERROR') { super(message); this.status = status; this.code = code; }
}
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value, max = 30000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const list = value => Array.isArray(value) ? value : [];
const iso = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
const timestamp = value => Number(value) > 0 && Number.isFinite(Number(value)) ? new Date(Number(value) * 1000).toISOString() : '';
const label = value => text(object(value).name, 200);
const checkedStatus = (status, deadline) => deadline && Date.parse(deadline) < Date.now() ? 'closed' : status;

export function normalizeWanted(value, checkedAt) {
  const raw = object(value), company = object(raw.company), detail = object(raw.detail), address = object(raw.address);
  if (!Number.isSafeInteger(raw.id) || !text(company.name) || !text(raw.position)) throw new SourceError('공고 응답 형식이 바뀌었어요. 원본에서 확인해주세요.', 502, 'SOURCE_FORMAT');
  const from = Number.isFinite(raw.annual_from) ? raw.annual_from : null;
  const to = Number.isFinite(raw.annual_to) ? raw.annual_to : null;
  const experience = from === null ? '경력 미기재' : from === 0 && to === 0 ? '신입' : from === 0 ? `신입·경력${to && to < 100 ? ` ${to}년 이하` : ''}` : `경력 ${from}년${to && to < 100 && to !== from ? `~${to}년` : ' 이상'}`;
  const deadline = iso(raw.due_time);
  return {
    id: `wanted-${raw.id}`, company: text(company.name, 200), title: text(raw.position, 200),
    role: '미분류', location: text([address.location, address.district].filter(Boolean).join(' '), 200) || '지역 미기재',
    experience, employment: '미기재', salary: '미기재',
    skills: [...new Set(list(raw.skill_tags).map(tag => text(object(tag).title, 80)).filter(Boolean))].slice(0, 40),
    // Wanted's public response does not provide a posting date. Never substitute fetch time.
    publishedAt: '', deadline,
    status: checkedStatus(raw.hidden || ['closed', 'inactive', 'expired'].includes(raw.status) ? 'closed' : raw.status === 'active' ? 'open' : 'unknown', deadline),
    verification: 'source', verifiedAt: checkedAt, source: '원티드', sourceUrl: `https://www.wanted.co.kr/wd/${raw.id}`,
    description: [text(detail.intro), text(detail.main_tasks)].filter(Boolean).join('\n\n'),
    requirements: [text(detail.requirements), detail.preferred_points ? `우대사항\n${text(detail.preferred_points)}` : ''].filter(Boolean).join('\n\n'),
    benefits: text(detail.benefits), companyInfo: '', saved: false, isDemo: false, color: 'ink',
  };
}

export function normalizeSaramin(value, checkedAt) {
  const raw = object(value), position = object(raw.position), company = object(object(raw.company).detail);
  if (!/^\d+$/.test(String(raw.id)) || !text(company.name) || !text(position.title)) throw new SourceError('사람인 공고 응답을 읽을 수 없어요.', 502, 'SOURCE_FORMAT');
  const closeType = String(object(raw['close-type']).code ?? raw['close-type'] ?? '');
  const deadline = ['2', '3', '4'].includes(closeType) ? '' : timestamp(raw['expiration-timestamp']);
  const requirements = [`경력: ${label(position['experience-level']) || '미기재'}`, `학력: ${label(position['required-education-level']) || '미기재'}`].join('\n');
  return {
    id: `saramin-${raw.id}`, company: text(company.name, 200), title: text(position.title, 200), role: label(position['job-mid-code']) || '미분류',
    location: label(position.location) || '지역 미기재', experience: label(position['experience-level']) || '경력 미기재',
    employment: label(position['job-type']) || '미기재', salary: label(raw.salary) || '미기재', skills: [],
    publishedAt: timestamp(raw['posting-timestamp']), deadline,
    status: checkedStatus(Number(raw.active) === 1 ? 'open' : Number(raw.active) === 0 ? 'closed' : 'unknown', deadline),
    verification: 'source', verifiedAt: checkedAt, source: '사람인', sourceUrl: `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${raw.id}`,
    description: `${text(position.title)}\n\n사람인 공식 API 제공 요약입니다. 상세 담당 업무는 원본 링크에서 확인한 뒤 필요한 내용을 보완해주세요.`,
    requirements, benefits: '', companyInfo: '', saved: false, isDemo: false, color: 'ink',
  };
}

export function sourceConfiguration(env = process.env) {
  return [
    { id: 'wanted', name: '원티드', enabled: true, note: '키 없이 공개 공고 조회 · 공식 제휴 API 아님' },
    { id: 'saramin', name: '사람인', enabled: Boolean(env.SARAMIN_ACCESS_KEY), note: env.SARAMIN_ACCESS_KEY ? '공식 API 연결 설정됨' : '서버의 SARAMIN_ACCESS_KEY 설정 필요' },
  ];
}

async function readJson(url, fetcher) {
  let response;
  try { response = await fetcher(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  catch { throw new SourceError('채용 서비스에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', 502, 'SOURCE_UNAVAILABLE'); }
  if (!response.ok) {
    const status = response.status;
    if (status === 404 || status === 410) throw new SourceError('원본에서 공고를 찾을 수 없어요. 마감되거나 삭제됐을 수 있어요.', 404, 'NOT_FOUND');
    if ([401, 403, 429].includes(status)) throw new SourceError('출처에서 조회를 제한했어요. 우회하지 않으며 원본 사이트에서 확인할 수 있어요.', 503, 'SOURCE_RESTRICTED');
    throw new SourceError('채용 서비스가 정상 응답하지 않았어요.', 502, 'SOURCE_UNAVAILABLE');
  }
  if (!response.headers.get('content-type')?.includes('json')) throw new SourceError('채용 서비스의 응답 형식이 바뀌었어요.', 502, 'SOURCE_FORMAT');
  const reader = response.body?.getReader();
  if (!reader) throw new SourceError('비어 있는 응답을 받았어요.');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw new SourceError('공고 응답이 처리 가능한 크기를 넘었어요.', 502, 'SOURCE_SIZE'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { if (error instanceof SourceError) throw error; throw new SourceError('공고 응답을 읽지 못했어요.', 502, 'SOURCE_FORMAT'); }
}

export function createJobService({ fetcher = fetch, env = process.env, now = () => new Date() } = {}) {
  const cache = new Map(); const inflight = new Map();
  async function obtain(key, load, refresh = false) {
    const old = cache.get(key);
    if (!refresh && old && Date.now() - old.at < 60000) return { ...old.value, cached: true };
    if (inflight.has(key)) return inflight.get(key);
    if (inflight.size >= 6) throw new SourceError('조회가 진행 중이에요. 잠시 후 다시 시도해주세요.', 429, 'BUSY');
    const pending = load().then(value => {
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), value }); return { ...value, cached: false };
    }).finally(() => inflight.delete(key));
    inflight.set(key, pending); return pending;
  }
  const sources = () => sourceConfiguration(env);
  function requireSource(provider) {
    if (!['wanted', 'saramin'].includes(provider)) throw new SourceError('지원하지 않는 공고 출처예요.', 400, 'BAD_SOURCE');
    if (provider === 'saramin' && !env.SARAMIN_ACCESS_KEY) throw new SourceError('사람인은 서버에 발급받은 API 키를 설정해야 해요.', 503, 'KEY_REQUIRED');
  }
  async function search({ provider = 'wanted', query = '', page = 0, location = 'all', refresh = false } = {}) {
    requireSource(provider);
    if (typeof query !== 'string' || query.length > 120 || !Number.isInteger(page) || page < 0 || page > 49 || !['all', 'seoul', 'gyeonggi'].includes(location)) throw new SourceError('검색 조건을 확인해주세요.', 400, 'BAD_QUERY');
    const key = JSON.stringify([provider, query.trim(), page, location]);
    return obtain(key, async () => {
      const checkedAt = now().toISOString(); const warnings = []; let raw, values, nextPage;
      if (provider === 'wanted') {
        const url = new URL(`https://www.wanted.co.kr/api/v4/${query.trim() ? 'search' : 'jobs'}`);
        Object.entries({ country: 'kr', job_sort: 'job.latest_order', limit: '20', offset: String(page * 20), years: '-1', locations: location }).forEach(([k, v]) => url.searchParams.set(k, v));
        if (query.trim()) { url.searchParams.set('query', query.trim()); url.searchParams.set('result_items', 'jobs'); }
        raw = await readJson(url, fetcher);
        values = query.trim() ? object(raw.data).jobs : raw.data;
        if (!Array.isArray(values)) throw new SourceError('공고 목록 응답 형식이 바뀌었어요.', 502, 'SOURCE_FORMAT');
        nextPage = object(raw.links).next && page < 49 ? page + 1 : null;
        warnings.push('원티드가 제공하는 최신 등록순입니다. 게시일은 응답에 없어 임의로 표시하지 않아요.');
      } else {
        const url = new URL('https://oapi.saramin.co.kr/job-search');
        Object.entries({ 'access-key': env.SARAMIN_ACCESS_KEY, keywords: query.trim(), count: '20', start: String(page), sort: 'pd', fields: 'posting-date,expiration-date' }).forEach(([k, v]) => url.searchParams.set(k, v));
        if (location !== 'all') url.searchParams.set('loc_mcd', location === 'seoul' ? '101000' : '102000');
        raw = await readJson(url, fetcher);
        if (raw.code || !raw.jobs) throw new SourceError('사람인 API 키, 권한 또는 사용 한도를 확인해주세요.', 503, 'SOURCE_RESTRICTED');
        values = list(raw.jobs.job); nextPage = (page + 1) * 20 < Number(raw.jobs.total) && page < 49 ? page + 1 : null;
        warnings.push('공식 API 제공 요약입니다. 전체 본문은 원본 사이트에서 확인해주세요.');
      }
      const normalize = provider === 'wanted' ? normalizeWanted : normalizeSaramin;
      let invalid = 0;
      const jobs = values.flatMap(value => { try { const job = normalize(value, checkedAt); return job.status === 'open' ? [job] : []; } catch { invalid++; return []; } });
      if (invalid && invalid === values.length) throw new SourceError('공고 형식을 읽을 수 없어 결과를 표시하지 않았어요.', 502, 'SOURCE_FORMAT');
      if (invalid) warnings.push(`형식을 읽지 못한 공고 ${invalid}건은 제외했어요.`);
      return { provider, jobs, nextPage, checkedAt, warnings };
    }, refresh);
  }
  async function detail(provider, sourceId, refresh = false) {
    requireSource(provider);
    if (!/^\d{1,12}$/.test(String(sourceId))) throw new SourceError('공고 번호가 올바르지 않아요.', 400, 'BAD_ID');
    return obtain(`${provider}:${sourceId}`, async () => {
      const checkedAt = now().toISOString(); let raw;
      if (provider === 'wanted') {
        raw = await readJson(`https://www.wanted.co.kr/api/v4/jobs/${sourceId}`, fetcher);
        return { job: normalizeWanted(raw.job, checkedAt), checkedAt };
      }
      const url = new URL('https://oapi.saramin.co.kr/job-search');
      url.searchParams.set('access-key', env.SARAMIN_ACCESS_KEY); url.searchParams.set('id', String(sourceId));
      raw = await readJson(url, fetcher);
      if (raw.code) throw new SourceError('사람인 API 키 또는 사용 한도를 확인해주세요.', 503, 'SOURCE_RESTRICTED');
      const value = list(object(raw.jobs).job)[0];
      if (!value) throw new SourceError('원본에서 공고를 찾을 수 없어요.', 404, 'NOT_FOUND');
      return { job: normalizeSaramin(value, checkedAt), checkedAt };
    }, refresh);
  }
  return { search, detail, sources };
}
