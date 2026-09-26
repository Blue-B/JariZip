// Shared filter catalog for the official job-search API and the browser UI.
// Location codes below were verified against the source's public schema:
// Saramin loc_mcd via the official job-search API documentation.
// A location or category without a verified mapping is intentionally absent, and
// the server then falls back to bounded client-side filtering.

/** @typedef {{ id: string, name: string }} CatalogEntry */

/** @type {readonly CatalogEntry[]} */
export const JOB_LOCATIONS = Object.freeze([
  Object.freeze({ id: 'all', name: '전국' }),
  Object.freeze({ id: 'seoul', name: '서울' }),
  Object.freeze({ id: 'gyeonggi', name: '경기' }),
  Object.freeze({ id: 'incheon', name: '인천' }),
  Object.freeze({ id: 'busan', name: '부산' }),
  Object.freeze({ id: 'daegu', name: '대구' }),
  Object.freeze({ id: 'gwangju', name: '광주' }),
  Object.freeze({ id: 'daejeon', name: '대전' }),
  Object.freeze({ id: 'ulsan', name: '울산' }),
  Object.freeze({ id: 'sejong', name: '세종' }),
  Object.freeze({ id: 'gangwon', name: '강원' }),
  Object.freeze({ id: 'chungbuk', name: '충북' }),
  Object.freeze({ id: 'chungnam', name: '충남' }),
  Object.freeze({ id: 'jeonbuk', name: '전북' }),
  Object.freeze({ id: 'jeonnam', name: '전남' }),
  Object.freeze({ id: 'gyeongbuk', name: '경북' }),
  Object.freeze({ id: 'gyeongnam', name: '경남' }),
  Object.freeze({ id: 'jeju', name: '제주' }),
]);

/** @type {readonly CatalogEntry[]} */
export const JOB_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'all', name: '전체 분야' }),
  Object.freeze({ id: 'development', name: '개발·IT' }),
  Object.freeze({ id: 'data', name: '데이터·AI' }),
  Object.freeze({ id: 'design', name: '디자인' }),
  Object.freeze({ id: 'planning', name: '기획·경영' }),
  Object.freeze({ id: 'marketing', name: '마케팅·광고' }),
  Object.freeze({ id: 'sales', name: '영업·고객관리' }),
  Object.freeze({ id: 'hr', name: '인사·총무' }),
  Object.freeze({ id: 'finance', name: '재무·회계·금융' }),
  Object.freeze({ id: 'manufacturing', name: '생산·제조' }),
  Object.freeze({ id: 'logistics', name: '물류·무역' }),
  Object.freeze({ id: 'service', name: '서비스' }),
  Object.freeze({ id: 'education', name: '교육' }),
  Object.freeze({ id: 'medical', name: '의료·보건' }),
  Object.freeze({ id: 'construction', name: '건설·시설' }),
  Object.freeze({ id: 'research', name: '연구·개발' }),
  Object.freeze({ id: 'legal', name: '법률·법무' }),
]);

/** @type {readonly CatalogEntry[]} */
export const JOB_EXPERIENCES = Object.freeze([
  Object.freeze({ id: 'all', name: '경력 무관' }),
  Object.freeze({ id: 'new', name: '신입' }),
  Object.freeze({ id: '1', name: '경력 1년' }),
  Object.freeze({ id: '3', name: '경력 3년' }),
  Object.freeze({ id: '5', name: '경력 5년' }),
  Object.freeze({ id: '10', name: '경력 10년' }),
]);

/** Normalized career windows. `min` is the entry career year, `max: 100` means open-ended. */
export const EXPERIENCE_RANGE = Object.freeze({
  new: Object.freeze({ min: 0, max: 0 }),
  1: Object.freeze({ min: 1, max: 3 }),
  3: Object.freeze({ min: 3, max: 5 }),
  5: Object.freeze({ min: 5, max: 10 }),
  10: Object.freeze({ min: 10, max: 100 }),
});

/** Upper bound used when comparing `max` windows; a posting at `careerMax` is still eligible. */
export const EXPERIENCE_MAX_BOUND = 100;

/** Saramin loc_mcd codes from the official job-search API documentation. */
export const SARAMIN_LOCATIONS = Object.freeze({
  seoul: 101000, gyeonggi: 102000, incheon: 108000, busan: 106000, daegu: 104000,
  gwangju: 112000, daejeon: 105000, ulsan: 107000, sejong: 118000, gangwon: 109000,
  chungbuk: 114000, chungnam: 115000, jeonbuk: 113000, jeonnam: 112000,
  gyeongbuk: 111000, gyeongnam: 110000, jeju: 116000,
});

/**
 * Work24 (고용24) region codes from the official region-code workbook linked by the
 * 채용정보목록 documentation (openapi.work.go.kr). Only the top-level (1 depth) codes are
 * mapped; deeper district codes are intentionally absent and the UI filter is therefore a
 * province-level request. `region` accepts multiple codes separated by `|`.
 */
export const WORK24_REGIONS = Object.freeze({
  seoul: '11000', busan: '26000', daegu: '27000', incheon: '28000', daejeon: '30000',
  ulsan: '31000', sejong: '36110', gyeonggi: '41000', chungbuk: '43000', chungnam: '44000',
  gyeongbuk: '47000', gyeongnam: '48000', jeju: '50000', gangwon: '51000', jeonbuk: '52000',
  // Work24 groups Gwangju with Jeonnam in region code 12000. The combined code is used for
  // both UI filters because the source does not expose a separate Gwangju top-level code.
  gwangju: '12000', jeonnam: '12000',
});

/**
 * Work24 occupation codes. Each UI career category maps to one or more official 2-depth
 * occupation codes. A category with no verified mapping is omitted and then filtered client-side.
 */
export const WORK24_OCCUPATIONS = Object.freeze({
  development: Object.freeze(['022', '023', '024', '025', '026']),
  data: Object.freeze(['021', '026']),
  design: Object.freeze(['055', '056']),
  planning: Object.freeze(['015', '017']),
  marketing: Object.freeze(['015']),
  sales: Object.freeze(['072', '073', '074', '075', '076', '078']),
  hr: Object.freeze(['012', '017']),
  finance: Object.freeze(['011', '01C', '01D', '018']),
  manufacturing: Object.freeze(['091', '092', '093', '094', '095', '096', '097', '098', '099', '09A']),
  logistics: Object.freeze(['019', '07A', '07B', '07C']),
  service: Object.freeze(['061', '062', '063', '064', '065', '066', '067', '068', '069', '06A']),
  education: Object.freeze(['031', '032', '033', '034', '035']),
  medical: Object.freeze(['041', '042', '043', '044']),
  construction: Object.freeze(['081', '082', '083', '084', '085', '086']),
  research: Object.freeze(['021']),
  legal: Object.freeze(['036']),
});

/** Work24 `career` codes. `N` 신입, `E` 경력(개월 범위 필수), `Z` 관계없음. */
export const WORK24_CAREER = Object.freeze({
  new: Object.freeze({ career: 'N' }),
  1: Object.freeze({ career: 'E', minCareerM: 12, maxCareerM: 36 }),
  3: Object.freeze({ career: 'E', minCareerM: 36, maxCareerM: 60 }),
  5: Object.freeze({ career: 'E', minCareerM: 60, maxCareerM: 120 }),
  10: Object.freeze({ career: 'E', minCareerM: 120, maxCareerM: 1200 }),
});

const index = entries => new Map(entries.map(entry => [entry.id, entry.name]));

export const JOB_LOCATION_NAMES = index(JOB_LOCATIONS);
export const JOB_CATEGORY_NAMES = index(JOB_CATEGORIES);
export const JOB_EXPERIENCE_NAMES = index(JOB_EXPERIENCES);

export const isJobLocation = id => typeof id === 'string' && JOB_LOCATION_NAMES.has(id);
export const isJobCategory = id => typeof id === 'string' && JOB_CATEGORY_NAMES.has(id);
export const isJobExperience = id => typeof id === 'string' && JOB_EXPERIENCE_NAMES.has(id);

export function jobFilterCatalog() {
  return {
    locations: JOB_LOCATIONS.map(entry => ({ ...entry })),
    categories: JOB_CATEGORIES.map(entry => ({ ...entry })),
    experiences: JOB_EXPERIENCES.map(entry => ({ ...entry })),
  };
}
