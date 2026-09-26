// Read-only, bounded adapters. No login, cookies, CAPTCHA bypass or arbitrary URL proxy.
// Official, permission-based sources only. The normalizers below are kept inert for fixture
// and schema tests but the unofficial Wanted/Jumpit/Zighang endpoints are never called here.
import { fingerprint, MAX_PAGE, streamJobs } from './job-stream.mjs';
import { isJobLocation, isJobCategory, isJobExperience, SARAMIN_LOCATIONS, WORK24_REGIONS, WORK24_OCCUPATIONS, WORK24_CAREER } from './job-catalog.mjs';
import { childOf, childrenOf, textOf, leafObjectOf, parseXml, XmlError } from './xml.mjs';

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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const koreaDate = (value, endOfDay = false) => {
  if (typeof value !== 'string' || !value) return '';
  let date = value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) date += endOfDay ? 'T23:59:59+09:00' : 'T00:00:00+09:00';
  else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(date)) date += '+09:00';
  return iso(date);
};
const careerLabel = (min, max, newcomer = false) => {
  if (!Number.isFinite(min)) return newcomer ? '신입' : '경력 미기재';
  if (min === 0 && max === 0) return '신입';
  if (min === 0) return max && max < 100 ? `신입·경력 ${max}년 이하` : '신입·경력';
  return `경력 ${min}년${Number.isFinite(max) && max < 100 && max > min ? `~${max}년` : ' 이상'}`;
};
// Convert public rich text into inert text. Never render upstream HTML or load its images.
function plain(value) {
  if (typeof value === 'string') return text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  let nodes = 0;
  const walk = (node, depth = 0) => {
    if (++nodes > 10000 || depth > 25 || !node || typeof node !== 'object') return '';
    if (typeof node.text === 'string') return text(node.text);
    return list(node.content).map(child => walk(child, depth + 1)).join(['paragraph', 'heading'].includes(node.type) ? '' : '\n');
  };
  return text(walk(value));
}

export function normalizeWanted(value, checkedAt) {
  const raw = object(value), company = object(raw.company), detail = object(raw.detail), address = object(raw.address);
  if (!Number.isSafeInteger(raw.id) || !text(company.name) || !text(raw.position)) throw new SourceError('공고 응답 형식이 바뀌었어요. 원본에서 확인해주세요.', 502, 'SOURCE_FORMAT');
  const from = Number.isFinite(raw.annual_from) ? raw.annual_from : null;
  const to = Number.isFinite(raw.annual_to) ? raw.annual_to : null;
  const experience = from === null ? '경력 미기재' : from === 0 && to === 0 ? '신입' : from === 0 ? `신입·경력${to && to < 100 ? ` ${to}년 이하` : ''}` : `경력 ${from}년${to && to < 100 && to !== from ? `~${to}년` : ' 이상'}`;
  const deadline = koreaDate(raw.due_time, true);
  return {
    id: `wanted-${raw.id}`, company: text(company.name, 200), title: text(raw.position, 200),
    role: '미분류', location: text([address.location, address.district].filter(Boolean).join(' '), 200) || '지역 미기재',
    experience, employment: '미기재', salary: '미기재',
    skills: [...new Set(list(raw.skill_tags).map(tag => text(object(tag).title, 80)).filter(Boolean))].slice(0, 40),
    publishedAt: '', deadline, deadlineType: deadline ? 'date' : 'unknown',
    status: checkedStatus(raw.hidden || ['closed', 'inactive', 'expired'].includes(raw.status) ? 'closed' : raw.status === 'active' ? 'open' : 'unknown', deadline),
    verification: 'source', verifiedAt: checkedAt, source: '원티드', sourceUrl: `https://www.wanted.co.kr/wd/${raw.id}`,
    description: [text(detail.intro), text(detail.main_tasks)].filter(Boolean).join('\n\n'),
    requirements: [text(detail.requirements), detail.preferred_points ? `우대사항\n${text(detail.preferred_points)}` : ''].filter(Boolean).join('\n\n'),
    benefits: text(detail.benefits), companyInfo: [text(company.industry_name, 200) ? `업종: ${text(company.industry_name, 200)}` : '', ...list(raw.company_tags).map(tag => text(object(tag).title, 80)).filter(tag => /^(?:[0-9,]+(?:[~～-][0-9,]+)?명(?:\s*이[상하])?|설립[0-9~～-]+년)$/.test(tag)).map(tag => `원티드 등록 정보: ${tag}`)].filter(Boolean).join('\n'), saved: false, isDemo: false, color: 'ink',
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
    publishedAt: timestamp(raw['posting-timestamp']), deadline, deadlineType: deadline ? 'date' : closeType === '2' ? 'until-filled' : closeType === '3' ? 'rolling' : 'unknown',
    status: checkedStatus(Number(raw.active) === 1 ? 'open' : Number(raw.active) === 0 ? 'closed' : 'unknown', deadline),
    verification: 'source', verifiedAt: checkedAt, source: '사람인', sourceUrl: `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${raw.id}`,
    description: `${text(position.title)}\n\n사람인 공식 API 제공 요약입니다. 상세 담당 업무는 원본 링크에서 확인한 뒤 필요한 내용을 보완해주세요.`,
    requirements, benefits: '', companyInfo: '', saved: false, isDemo: false, color: 'ink',
  };
}

export function normalizeJumpit(value, checkedAt) {
  const raw = object(value);
  if (!/^\d{1,12}$/.test(String(raw.id)) || !text(raw.companyName) || !text(raw.title)) throw new SourceError('점핏 공고 응답 형식이 바뀌었어요.', 502, 'SOURCE_FORMAT');
  const deadline = raw.alwaysOpen === true ? '' : koreaDate(raw.closedAt, true);
  const hidden = raw.invisible === true || raw.hiddenPosition === true || (typeof raw.positionStatus === 'string' && raw.positionStatus !== 'CHECKED');
  const status = hidden ? 'closed' : raw.alwaysOpen === true || deadline ? 'open' : 'unknown';
  const locations = list(raw.locations).filter(item => typeof item === 'string');
  const location = locations.length ? locations.join(' · ') : typeof raw.location === 'string' ? raw.location : text(object(raw.location).address);
  return {
    id: `jumpit-${raw.id}`, company: text(raw.companyName, 200), title: text(raw.title, 200),
    role: text(raw.jobCategory, 200) || text(list(raw.jobCategories).map(label).join(' · '), 200) || '개발·IT',
    location: text(location, 200) || '지역 미기재', experience: careerLabel(raw.minCareer, raw.maxCareer, raw.newcomer),
    employment: '미기재', salary: '미기재',
    skills: [...new Set(list(raw.techStacks).map(item => text(typeof item === 'string' ? item : object(item).stack, 80)).filter(Boolean))].slice(0, 40),
    publishedAt: koreaDate(raw.publishedAt), deadline, deadlineType: raw.alwaysOpen === true ? 'rolling' : deadline ? 'date' : 'unknown', status: checkedStatus(status, deadline),
    verification: 'source', verifiedAt: checkedAt, source: '점핏', sourceUrl: `https://jumpit.saramin.co.kr/position/${raw.id}`,
    description: text([plain(raw.serviceInfo), plain(raw.responsibility)].filter(Boolean).join('\n\n')),
    requirements: text([plain(raw.qualifications), raw.preferredRequirements ? `우대사항\n${plain(raw.preferredRequirements)}` : ''].filter(Boolean).join('\n\n')),
    benefits: plain(raw.welfares), companyInfo: text(raw.companyUrl, 500) ? `출처에 등록된 홈페이지: ${text(raw.companyUrl, 500)}` : '', saved: false, isDemo: false, color: 'ink',
  };
}

export function normalizeZighang(value, checkedAt) {
  const raw = object(value), company = object(raw.company);
  if (!UUID.test(raw.id) || !text(company.name) || !text(raw.title)) throw new SourceError('직행 공고 응답 형식이 바뀌었어요.', 502, 'SOURCE_FORMAT');
  const deadline = koreaDate(raw.endDate, true);
  const perpetual = ['상시채용', '채용시마감'].includes(raw.deadlineType);
  const status = typeof raw.status === 'string' ? raw.status === 'ACTIVE' ? 'open' : 'closed' : deadline || perpetual ? 'open' : 'unknown';
  const description = plain(raw.summary) || plain(raw.content);
  return {
    id: `zighang-${raw.id}`, company: text(company.name, 200), title: text(raw.title, 200),
    role: text(list(raw.depthOnes).filter(item => typeof item === 'string').join(' · ').replaceAll('_', '·'), 200) || '미분류',
    location: text(list(raw.regions).filter(item => typeof item === 'string').join(' · '), 200) || '지역 미기재',
    experience: careerLabel(raw.careerMin, raw.careerMax), employment: text(list(raw.employeeTypes).filter(item => typeof item === 'string').join(' · '), 200) || '미기재',
    salary: '미기재', skills: [], publishedAt: koreaDate(raw.createdAt), deadline, deadlineType: deadline ? 'date' : raw.deadlineType === '상시채용' ? 'rolling' : raw.deadlineType === '채용시마감' ? 'until-filled' : 'unknown',
    status: checkedStatus(status, deadline), verification: 'source', verifiedAt: checkedAt, source: '직행', sourceUrl: `https://zighang.com/recruitment/${raw.id}`,
    description: description || `${text(raw.title)}\n\n출처에서 텍스트 본문을 제공하지 않았어요. 원본 공고를 확인해주세요.`,
    requirements: list(raw.educations).length ? `학력: ${raw.educations.join(' · ')}` : '', benefits: '', companyInfo: '', saved: false, isDemo: false, color: 'ink',
  };
}

const WORK24_CAREER_LABELS = Object.freeze({ N: '신입', E: '경력', Z: '경력 무관' });

// Employment type codes from the official list-endpoint documentation; unmapped codes stay '미기재'.
const WORK24_EMPLOYMENT_TYPE = Object.freeze({
  10: '기간의 정함이 없는 근로계약', 11: '기간의 정함이 없는 근로계약(시간선택제)',
  20: '기간의 정함이 있는 근로계약', 21: '기간의 정함이 있는 근로계약(시간선택제)',
  4: '파견근로', 5: '대체인력채용',
});

/** A Work24 list row from the official 채용정보목록 XML (`<wanted>`). */
export function normalizeWork24ListItem(node, checkedAt) {
  const raw = leafObjectOf(node);
  const wantedAuthNo = text(raw.wantedAuthNo, 60);
  const company = text(raw.company, 200);
  const title = text(raw.title, 200);
  if (!wantedAuthNo || !company || !title) throw new SourceError('고용24 공고 응답을 읽을 수 없어요.', 502, 'SOURCE_FORMAT');
  const deadline = koreaDate(raw.closeDt, true);
  const infoSvc = text(raw.infoSvc, 40);
  const location = [text(raw.basicAddr, 200), text(raw.detailAddr, 200)].filter(Boolean).join(' ').trim();
  const employment = WORK24_EMPLOYMENT_TYPE[Number(raw.empTpCd)] || '미기재';
  const salary = [text(raw.salTpNm, 40), text(raw.sal, 80)].filter(Boolean).join(' ').trim() || '미기재';
  const minEdubg = text(raw.minEdubg, 60), maxEdubg = text(raw.maxEdubg, 60);
  const education = minEdubg && minEdubg === maxEdubg ? minEdubg : [minEdubg, maxEdubg].filter(Boolean).join('~');
  return {
    id: `work24-${wantedAuthNo}`, company, title, role: text(raw.indTpNm, 200) || '미분류',
    location: location || text(raw.region, 200) || '지역 미기재',
    experience: WORK24_CAREER_LABELS[text(raw.career, 1)] || '경력 미기재',
    employment, salary, skills: [],
    publishedAt: koreaDate(raw.regDt), deadline,
    deadlineType: deadline ? 'date' : 'unknown',
    status: deadline && Date.parse(deadline) < Date.now() ? 'closed' : 'open',
    verification: 'source', verifiedAt: checkedAt, source: '고용24', sourceUrl: work24ListUrl(wantedAuthNo),
    description: `${title}\n\n고용24(워크넷 인증) 공식 Open API가 제공한 목록 정보입니다. 상세 담당 업무·자격·전형 방법은 원본에서 확인한 뒤 필요한 내용을 보완해주세요.`,
    requirements: education ? `학력: ${education}` : '', benefits: '',
    companyInfo: [text(raw.indTpNm, 200) ? `업종: ${text(raw.indTpNm, 200)}` : '', location ? `근무지: ${location}` : '', infoSvc ? `정보제공처: ${infoSvc === 'VALIDATION' ? '워크넷 인증' : infoSvc}` : ''].filter(Boolean).join('\n'),
    saved: false, isDemo: false, color: 'ink',
  };
}

/** A Work24 detail document from the official 채용정보상세 XML (`<wantedDtl>`). */
export function normalizeWork24Detail(node, checkedAt) {
  const wantedAuthNo = textOf(node, 'wantedAuthNo');
  if (!wantedAuthNo) throw new SourceError('고용24 상세 응답을 읽을 수 없어요.', 502, 'SOURCE_FORMAT');
  const corp = childOf(node, 'corpInfo');
  const info = childOf(node, 'wantedInfo');
  if (!info) throw new SourceError('고용24 상세 응답을 읽을 수 없어요.', 502, 'SOURCE_FORMAT');
  const company = text(textOf(corp, 'corpNm'), 200);
  const title = text(textOf(info, 'wantedTitle'), 200);
  if (!company || !title) throw new SourceError('고용24 상세 응답을 읽을 수 없어요.', 502, 'SOURCE_FORMAT');
  const deadline = koreaDate(textOf(info, 'receiptCloseDt'), true);
  const keywordList = childOf(info, 'keywordList');
  const skills = [...new Set([textOf(info, 'jobsNm'), ...childrenOf(keywordList, 'srchKeywordNm').map(child => child.text.trim())].map(value => text(value, 80)).filter(Boolean))].slice(0, 40);
  const homepage = text(textOf(corp, 'homePg'), 500);
  const address = [text(textOf(corp, 'corpAddr'), 200), textOf(info, 'workRegion')].filter(Boolean).join(' · ');
  const salary = [text(textOf(info, 'salTpNm'), 40), textOf(info, 'salTpCd')].filter(Boolean).join(' ').trim() || '미기재';
  const facts = [
    ['회사규모', textOf(corp, 'busiSize')], ['근로자수', textOf(corp, 'totPsncnt')], ['주요사업', plain(textOf(corp, 'busiCont'))],
    ['학력', textOf(info, 'eduNm')], ['경력', textOf(info, 'enterTpNm')], ['모집인원', textOf(info, 'collectPsncnt')],
    ['전형방법', textOf(info, 'selMthd')], ['접수방법', textOf(info, 'rcptMthd')], ['제출서류', textOf(info, 'submitDoc')],
    ['근무시간', textOf(info, 'workdayWorkhrCont')], ['4대보험', textOf(info, 'fourIns')], ['퇴직금', textOf(info, 'retirepay')],
  ].filter(([, value]) => value);
  const requirements = [
    textOf(info, 'enterTpNm') ? `경력: ${textOf(info, 'enterTpNm')}` : '',
    textOf(info, 'eduNm') ? `학력: ${textOf(info, 'eduNm')}` : '',
    textOf(info, 'certificate') ? `자격면허: ${textOf(info, 'certificate')}` : '',
    textOf(info, 'major') ? `전공: ${textOf(info, 'major')}` : '',
    textOf(info, 'pfCond') ? `우대조건: ${textOf(info, 'pfCond')}` : '',
    textOf(info, 'etcPfCond') ? `기타 우대조건: ${textOf(info, 'etcPfCond')}` : '',
  ].filter(Boolean).join('\n');
  const companyInfo = [...facts.map(([name, value]) => `${name}: ${value}`), homepage ? `출처에 등록된 홈페이지: ${homepage}` : ''].filter(Boolean).join('\n');
  return {
    id: `work24-${wantedAuthNo}`, company, title,
    role: textOf(info, 'jobsNm') || '미분류',
    location: address || '지역 미기재',
    experience: textOf(info, 'enterTpNm') || '경력 미기재',
    employment: textOf(info, 'empTpNm') || '미기재',
    salary, skills, publishedAt: '', deadline, deadlineType: deadline ? 'date' : 'unknown',
    status: deadline && Date.parse(deadline) < Date.now() ? 'closed' : 'open',
    verification: 'source', verifiedAt: checkedAt, source: '고용24', sourceUrl: work24ListUrl(wantedAuthNo),
    description: plain(textOf(info, 'jobCont')) || `${title}\n\n고용24 공식 Open API 상세 응답입니다. 본문이 비어 있으면 원본에서 확인해주세요.`,
    requirements, benefits: plain(textOf(info, 'etcWelfare')), companyInfo,
    saved: false, isDemo: false, color: 'ink',
  };
}

/**
 * Composed normalizer used by the guarded service path. Accepts either a parsed
 * `<wanted>` list node or a `<wantedDtl>` detail node so tests can drive one entry point.
 */
export function normalizeWork24(value, checkedAt) {
  if (!value || typeof value !== 'object') throw new SourceError('고용24 공고 응답을 읽을 수 없어요.', 502, 'SOURCE_FORMAT');
  if (value.name === 'wantedDtl' || childOf(value, 'wantedInfo')) return normalizeWork24Detail(value, checkedAt);
  if (value.name === 'wanted' || textOf(value, 'wantedAuthNo')) return normalizeWork24ListItem(value, checkedAt);
  throw new SourceError('고용24 공고 응답 형식이 바뀌었어요.', 502, 'SOURCE_FORMAT');
}

/** Unofficial endpoints that require prior written permission. Never called automatically. */
export const UNAPPROVED_SOURCES = Object.freeze(['wanted', 'jumpit', 'zighang']);
/** Providers with an official, permission-based API wired into this server. */
export const APPROVED_SOURCES = Object.freeze(['saramin', 'work24']);

export function sourceConfiguration(env = process.env) {
  const saraminConfigured = Boolean(env.SARAMIN_ACCESS_KEY);
  const work24Configured = Boolean(env.WORK24_AUTH_KEY);
  return [
    { id: 'saramin', name: '사람인', enabled: saraminConfigured, note: saraminConfigured
      ? '공식 채용 정보 API · 서버에 개인 발급 키 설정됨. 제공사 승인 범위와 1일 500회 공식 한도 안에서만 사용하세요.'
      : '공식 채용 정보 API · 서버의 .env.local에 발급받은 SARAMIN_ACCESS_KEY를 설정해야 사용할 수 있어요. 키 발급·앱별 승인·사용 범위는 제공사 조건을 따릅니다.' },
    { id: 'work24', name: '고용24', enabled: work24Configured, note: work24Configured
      ? '고용24(한국고용정보원) 공식 Open API · 서버에 발급받은 WORK24_AUTH_KEY 설정됨. 결과는 원문 링크·출처 표시와 함께 제공해야 하며, 승인 범위 안에서만 사용하세요.'
      : '고용24 공식 Open API · 서버의 .env.local에 발급받은 WORK24_AUTH_KEY를 설정해야 사용할 수 있어요. 고용24 기업회원 로그인 후 서비스별 심사·승인·인증키 발급이 필요하며, 인증키는 타인에게 양도할 수 없습니다.' },
    { id: 'wanted', name: '원티드', enabled: false, note: '공식 제휴 API 아님 · 제공사 사전 승인 없이 자동 수집하지 않아요. 원문 사이트에서 직접 확인하고 보관해주세요.' },
    { id: 'jumpit', name: '점핏', enabled: false, note: '공식 제휴 API 아님 · 제공사 사전 승인 없이 자동 수집하지 않아요. 원문 사이트에서 직접 확인하고 보관해주세요.' },
    { id: 'zighang', name: '직행', enabled: false, note: '공식 제휴 API 아님 · 제공사 사전 승인 없이 자동 수집하지 않아요. 원문 사이트에서 직접 확인하고 보관해주세요.' },
  ];
}

async function readJson(url, fetcher) {
  let response;
  try { response = await fetcher(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  catch { throw new SourceError('채용 서비스에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', 502, 'SOURCE_UNAVAILABLE'); }
  if (!response.ok) {
    if ([404, 410].includes(response.status)) throw new SourceError('원본에서 공고를 찾을 수 없어요. 마감되거나 삭제됐을 수 있어요.', 404, 'NOT_FOUND');
    if ([401, 403, 429].includes(response.status)) throw new SourceError('출처에서 조회를 제한했어요. 우회하지 않으며 원본 사이트에서 확인할 수 있어요.', 503, 'SOURCE_RESTRICTED');
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

const categoryPatterns = {
  development: /개발|엔지니어|프로그래머|백엔드|프론트|서버|보안|시스템|소프트웨어|developer|engineer|software|devops|backend|frontend|python|java|\bIT\b/i,
  data: /데이터|인공지능|머신러닝|딥러닝|data|machine learning|\bAI\b/i,
  design: /디자인|디자이너|design|\bUX\b|\bUI\b/i, planning: /기획|경영|전략|프로덕트|product manager|\bPM\b/i,
  marketing: /마케팅|광고|홍보|콘텐츠|marketing/i, sales: /영업|고객관리|세일즈|sales/i,
  hr: /인사|총무|채용\s*(담당|매니저)|노무|recruiter|human resources|\bHR\b/i, finance: /재무|회계|금융|세무|증권|은행|finance|accounting/i,
  manufacturing: /생산|제조|조립|가공|공정|manufactur/i, logistics: /물류|무역|배송|유통|logistics/i,
  service: /서비스|식음료|매장|고객상담|상담원|호텔|레스토랑/i, education: /교육|강사|교사|교수|education/i,
  medical: /의료|보건|간호|의사|약사|병원|medical/i, construction: /건설|건축|시설|토목|안전관리|construction/i,
  research: /연구|연구원|research|\bR&D\b/i, legal: /법률|법무|변호사|컴플라이언스|legal/i,
};
function matchesLocalCategory(job, category) { return category === 'all' || categoryPatterns[category].test([job.title, job.role, ...job.skills].join(' ')); }
function matchesCareer(raw, experience) {
  if (experience === 'all') return true;
  const years = experience === 'new' ? 0 : Number(experience);
  const level = object(object(raw.position)['experience-level']);
  if (Number(level.code) === 0) return true;
  if (years === 0) return Number(level.code) === 1 || Number(level.code) === 3;
  const min = level.min, max = level.max;
  return Number.isFinite(min) && min <= years && (!Number.isFinite(max) || max >= years);
}
const normalizers = { wanted: normalizeWanted, saramin: normalizeSaramin, jumpit: normalizeJumpit, zighang: normalizeZighang, work24: normalizeWork24 };
// Work24 serves XML, not JSON. Bounded to a single page of at most 100 displayed rows or one detail.
export const WORK24_LIST_URL = 'https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do';
export const WORK24_DETAIL_URL = 'https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210D01.do';
export const WORK24_PAGE_SIZE = 100;
// `startPage` is 1-based and capped at 1000 by the official documentation, so the largest
// zero-based page index that keeps `startPage <= 1000` is 9 (10 pages of 100 rows).
export const WORK24_MAX_PAGE = 9;
const WORK24_INFO_SVC = 'VALIDATION';
// Public original-listing URLs. `infoSvc=VALIDATION` is required by the detail API and by this link.
const work24ListUrl = wantedAuthNo => `https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=${encodeURIComponent(wantedAuthNo)}&infoTypeCd=${WORK24_INFO_SVC}&infoTypeGroup=tb_workinfoworknet`;

/** Read a Work24 XML document, bounded and with the upstream error envelope surfaced explicitly. */
async function readXml(url, fetcher) {
  let response;
  try { response = await fetcher(url, { headers: { Accept: 'application/xml, text/xml' }, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  catch { throw new SourceError('채용 서비스에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', 502, 'SOURCE_UNAVAILABLE'); }
  if (!response.ok) {
    if ([404, 410].includes(response.status)) throw new SourceError('원본에서 공고를 찾을 수 없어요. 마감되거나 삭제됐을 수 있어요.', 404, 'NOT_FOUND');
    if ([401, 403, 429].includes(response.status)) throw new SourceError('출처에서 조회를 제한했어요. 우회하지 않으며 원본 사이트에서 확인할 수 있어요.', 503, 'SOURCE_RESTRICTED');
    throw new SourceError('채용 서비스가 정상 응답하지 않았어요.', 502, 'SOURCE_UNAVAILABLE');
  }
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
    const root = parseXml(Buffer.concat(chunks).toString('utf8'));
    const error = textOf(root, 'error');
    if (error) throw new SourceError('고용24 API 키, 권한 또는 사용 한도를 확인해주세요.', 503, 'SOURCE_RESTRICTED');
    return root;
  } catch (problem) {
    if (problem instanceof SourceError) throw problem;
    if (problem instanceof XmlError) throw new SourceError('공고 응답 형식이 바뀌었어요.', 502, 'SOURCE_FORMAT');
    throw new SourceError('공고 응답을 읽지 못했어요.', 502, 'SOURCE_FORMAT');
  }
}

export function createJobService({ fetcher = fetch, env = process.env, now = () => new Date() } = {}) {
  const cache = new Map(), inflight = new Map();
  async function obtain(key, load, refresh = false) {
    const old = cache.get(key);
    if (!refresh && old && Date.now() - old.at < 60000) return { ...old.value, cached: true };
    if (inflight.has(key)) return inflight.get(key);
    if (inflight.size >= 12) throw new SourceError('조회가 진행 중이에요. 잠시 후 다시 시도해주세요.', 429, 'BUSY');
    const pending = load().then(value => {
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), value }); return { ...value, cached: false };
    }).finally(() => inflight.delete(key));
    inflight.set(key, pending); return pending;
  }
  const sources = () => sourceConfiguration(env);
  function requireSource(provider) {
    if (!Object.hasOwn(normalizers, provider)) throw new SourceError('지원하지 않는 공고 출처예요.', 400, 'BAD_SOURCE');
    if (!APPROVED_SOURCES.includes(provider)) throw new SourceError('이 출처는 제공사의 사전 승인 없이 자동으로 조회하지 않아요. 원문 사이트에서 직접 확인해주세요.', 403, 'SOURCE_NOT_PERMITTED');
    if (provider === 'saramin' && !env.SARAMIN_ACCESS_KEY) throw new SourceError('사람인은 서버에 발급받은 API 키를 설정해야 해요.', 503, 'KEY_REQUIRED');
    if (provider === 'work24' && !env.WORK24_AUTH_KEY) throw new SourceError('고용24는 서버에 발급받은 인증키(WORK24_AUTH_KEY)를 설정해야 해요.', 503, 'KEY_REQUIRED');
  }
  async function loadSaramin({ query, page, location, category, experience }) {
    const checkedAt = now().toISOString(), warnings = [];
    const url = new URL('https://oapi.saramin.co.kr/job-search');
    Object.entries({ 'access-key': env.SARAMIN_ACCESS_KEY, keywords: query.trim(), count: '20', start: String(page), sort: 'pd', fields: 'posting-date,expiration-date' }).forEach(([k, v]) => url.searchParams.set(k, v));
    if (location !== 'all') url.searchParams.set('loc_mcd', String(SARAMIN_LOCATIONS[location]));
    const raw = await readJson(url, fetcher);
    if (raw.code || !raw.jobs) throw new SourceError('사람인 API 키, 권한 또는 사용 한도를 확인해주세요.', 503, 'SOURCE_RESTRICTED');
    const values = list(raw.jobs.job);
    let nextPage = (page + 1) * 20 < Number(raw.jobs.total) && page < MAX_PAGE ? page + 1 : null;
    warnings.push('사람인 공식 API 제공 요약입니다. 전체 본문은 원본 사이트에서 확인해주세요.');
    if (category !== 'all' || experience !== 'all') warnings.push('사람인 분야·경력은 현재 출처 페이지에서 조건을 적용합니다. 전체 검색 결과의 총건수와는 다릅니다.');
    if (!Array.isArray(values) || values.length > 20) throw new SourceError('공고 목록 응답 형식이 바뀌었어요.', 502, 'SOURCE_FORMAT');
    if (values.length === 0) nextPage = null;
    if (page === MAX_PAGE && values.length) warnings.push('안전한 조회 범위의 끝에 도달했어요. 조건을 좁혀 다시 검색해주세요.');
    let invalid = 0;
    const jobs = values.flatMap(value => {
      try {
        const job = normalizeSaramin(value, checkedAt);
        if (job.status !== 'open' || !matchesCareer(value, experience)) return [];
        if (!matchesLocalCategory(job, category)) return [];
        return [job];
      } catch { invalid++; return []; }
    });
    if (invalid && invalid === values.length) throw new SourceError('공고 형식을 읽을 수 없어 결과를 표시하지 않았어요.', 502, 'SOURCE_FORMAT');
    if (invalid) warnings.push(`형식을 읽지 못한 공고 ${invalid}건은 제외했어요.`);
    return { provider: 'saramin', jobs, nextPage, checkedAt, warnings, pageFingerprint: values.length ? fingerprint(values.map(value => value.id)) : undefined, sourceResults: [{ id: 'saramin', name: '사람인', count: jobs.length, status: 'ok', exhausted: nextPage === null }] };
  }
  // Work24 list is 1-based and caps display at 100. Filters map to official region/occupation/
  // career codes; an unmapped category stays client-side so results are narrowed, never invented.
  async function loadWork24({ query, page, location, category, experience }) {
    const checkedAt = now().toISOString(), warnings = [];
    // Work24 caps startPage at 1000. Beyond the documented page budget, stop the source
    // cleanly (empty, exhausted page) instead of surfacing an error to aggregate browsing.
    if (page > WORK24_MAX_PAGE) return { provider: 'work24', jobs: [], nextPage: null, checkedAt, warnings: ['고용24는 공식 조회 범위(최대 1000건)에 도달해 더 이상 이어보기를 제공하지 않아요. 조건을 좁혀 다시 검색해주세요.'], pageFingerprint: undefined, sourceResults: [{ id: 'work24', name: '고용24', count: 0, status: 'ok', exhausted: true }] };
    const url = new URL(WORK24_LIST_URL);
    Object.entries({ authKey: env.WORK24_AUTH_KEY, callTp: 'L', returnType: 'XML', startPage: String(page * WORK24_PAGE_SIZE + 1), display: String(WORK24_PAGE_SIZE) }).forEach(([k, v]) => url.searchParams.set(k, v));
    if (query.trim()) url.searchParams.set('keyword', query.trim());
    if (location !== 'all' && WORK24_REGIONS[location]) url.searchParams.set('region', WORK24_REGIONS[location]);
    const occupations = WORK24_OCCUPATIONS[category];
    if (occupations?.length) url.searchParams.set('occupation', occupations.join('|'));
    const career = WORK24_CAREER[experience];
    if (career) {
      url.searchParams.set('career', career.career);
      if (career.minCareerM) { url.searchParams.set('minCareerM', String(career.minCareerM)); url.searchParams.set('maxCareerM', String(career.maxCareerM)); }
    }
    const root = await readXml(url, fetcher);
    if (root.name !== 'wantedRoot') throw new SourceError('고용24 목록 응답 형식이 바뀌었어요.', 502, 'SOURCE_FORMAT');
    const values = childrenOf(root, 'wanted');
    const total = Number(textOf(root, 'total')) || 0;
    let nextPage = (page + 1) * WORK24_PAGE_SIZE < total && page < WORK24_MAX_PAGE ? page + 1 : null;
    warnings.push('고용24 공식 Open API 제공 정보입니다. 전체 본문과 정확한 접수 기간은 원문 사이트에서 확인해주세요.');
    if (category !== 'all' || experience !== 'all') warnings.push('고용24 분야·경력은 현재 출처 페이지에서 조건을 적용합니다. 전체 검색 결과의 총건수와는 다릅니다.');
    if (values.length === 0) nextPage = null;
    if (page >= WORK24_MAX_PAGE && values.length) warnings.push('안전한 조회 범위의 끝에 도달했어요. 조건을 좁혀 다시 검색해주세요.');
    let invalid = 0;
    const jobs = values.flatMap(value => {
      try {
        const job = normalizeWork24(value, checkedAt);
        if (job.status !== 'open') return [];
        // The occupation code already narrowed the source page; only unmapped categories are
        // re-checked locally so a verified mapping is not silently over-filtered.
        if (!occupations?.length && !matchesLocalCategory(job, category)) return [];
        return [job];
      } catch { invalid++; return []; }
    });
    if (invalid && invalid === values.length) throw new SourceError('공고 형식을 읽을 수 없어 결과를 표시하지 않았어요.', 502, 'SOURCE_FORMAT');
    if (invalid) warnings.push(`형식을 읽지 못한 공고 ${invalid}건은 제외했어요.`);
    return { provider: 'work24', jobs, nextPage, checkedAt, warnings, pageFingerprint: values.length ? fingerprint(values.map(value => textOf(value, 'wantedAuthNo'))) : undefined, sourceResults: [{ id: 'work24', name: '고용24', count: jobs.length, status: 'ok', exhausted: nextPage === null }] };
  }
  async function search({ provider = 'all', query = '', page = 0, location = 'all', category = 'all', experience = 'all', refresh = false, cursor } = {}) {
    if (provider !== 'all') requireSource(provider);
    if (typeof query !== 'string' || query.length > 120 || !Number.isInteger(page) || page < 0 || page > MAX_PAGE || !isJobLocation(location) || !isJobCategory(category) || !isJobExperience(experience)) throw new SourceError('검색 조건을 확인해주세요.', 400, 'BAD_QUERY');
    if (cursor !== undefined) return streamJobs({ provider, query, page, location, category, experience, refresh }, cursor, { sources, search, SourceError, now });
    const key = JSON.stringify([provider, query.trim(), page, location, category, experience]);
    // Do not cache aggregate failures for a minute: each successful provider has its own cache.
    if (provider === 'all') {
      const enabled = sources().filter(source => source.enabled);
      if (!enabled.length) throw new SourceError('사용하도록 설정된 공식 출처가 없어요. 원문 사이트에서 직접 확인해 저장하거나, 사람인·고용24 공식 API 키를 서버에 설정해주세요.', 409, 'NO_ENABLED_SOURCE');
      const results = await Promise.allSettled(enabled.map(source => search({ provider: source.id, query, page, location, category, experience, refresh })));
      const successful = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      if (!successful.length) throw new SourceError('연결한 모든 출처의 조회에 실패했어요. 출처별 조회 또는 설정에서 원인을 확인해주세요.', 503, 'ALL_SOURCES_FAILED');
      const jobs = []; const seen = new Set();
      for (let i = 0; i < 20; i++) for (const result of successful) {
        const job = result.jobs[i]; if (job && !seen.has(job.sourceUrl)) { seen.add(job.sourceUrl); jobs.push(job); }
      }
      return {
        provider, jobs, nextPage: successful.some(result => result.nextPage !== null) && page < MAX_PAGE ? page + 1 : null,
        checkedAt: successful.map(result => result.checkedAt).sort()[0], cached: successful.every(result => result.cached),
        warnings: [...new Set(successful.flatMap(result => result.warnings))],
        sourceResults: results.map((result, index) => ({ id: enabled[index].id, name: enabled[index].name, count: result.status === 'fulfilled' ? result.value.jobs.length : 0, status: result.status === 'fulfilled' ? 'ok' : 'error', ...(result.status === 'rejected' ? { message: result.reason instanceof SourceError ? result.reason.message : '출처 응답을 읽지 못했어요.' } : {}) })),
      };
    }
    return obtain(key, async () => provider === 'work24' ? loadWork24({ query, page, location, category, experience }) : loadSaramin({ query, page, location, category, experience }), refresh);
  }
  async function detail(provider, sourceId, refresh = false) {
    requireSource(provider);
    const idPattern = provider === 'work24' ? /^[0-9A-Za-z]{1,40}$/ : /^\d{1,12}$/;
    if (!idPattern.test(String(sourceId))) throw new SourceError('공고 번호가 올바르지 않아요.', 400, 'BAD_ID');
    return obtain(`${provider}:${sourceId}`, async () => {
      const checkedAt = now().toISOString();
      if (provider === 'work24') {
        const url = new URL(WORK24_DETAIL_URL);
        Object.entries({ authKey: env.WORK24_AUTH_KEY, callTp: 'D', returnType: 'XML', wantedAuthNo: String(sourceId), infoSvc: WORK24_INFO_SVC }).forEach(([k, v]) => url.searchParams.set(k, v));
        const root = await readXml(url, fetcher);
        const node = root.name === 'wantedDtl' ? root : childOf(root, 'wantedDtl');
        if (!node) throw new SourceError('원본에서 공고를 찾을 수 없어요.', 404, 'NOT_FOUND');
        const job = normalizeWork24(node, checkedAt);
        if (job.id !== `work24-${sourceId}`) throw new SourceError('요청한 공고와 다른 상세 응답을 받았어요.', 502, 'SOURCE_FORMAT');
        return { job, checkedAt };
      }
      const url = new URL('https://oapi.saramin.co.kr/job-search');
      url.searchParams.set('access-key', env.SARAMIN_ACCESS_KEY); url.searchParams.set('id', String(sourceId));
      const raw = await readJson(url, fetcher);
      if (raw.code) throw new SourceError('사람인 API 키 또는 사용 한도를 확인해주세요.', 503, 'SOURCE_RESTRICTED');
      const value = list(object(raw.jobs).job)[0];
      if (!value) throw new SourceError('원본에서 공고를 찾을 수 없어요.', 404, 'NOT_FOUND');
      const job = normalizeSaramin(value, checkedAt);
      if (job.id !== `saramin-${sourceId}`) throw new SourceError('요청한 공고와 다른 상세 응답을 받았어요.', 502, 'SOURCE_FORMAT');
      return { job, checkedAt };
    }, refresh);
  }
  return { search, detail, sources };
}
