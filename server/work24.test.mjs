import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createJobService, normalizeWork24, normalizeWork24ListItem, normalizeWork24Detail, SourceError, APPROVED_SOURCES, WORK24_LIST_URL, WORK24_DETAIL_URL } from './job-sources.mjs';
import { createAppServer } from './http.mjs';
import { parseXml, childOf } from './xml.mjs';
import { JOB_LOCATIONS, JOB_CATEGORIES, WORK24_REGIONS, WORK24_OCCUPATIONS, WORK24_CAREER } from './job-catalog.mjs';

// All XML here is synthetic. No real Work24 key is requested, stored or used by these tests.
const checkedAt = '2026-09-26T00:00:00.000Z';
const keyEnv = { WORK24_AUTH_KEY: 'test-only-work24-key' };
const VALIDATION = 'VALIDATION';

const listXml = (rows, total = rows.length) => `<?xml version='1.0' encoding='UTF-8'?>\n<wantedRoot><total>${total}</total><startPage>1</startPage><display>100</display>${rows.join('')}</wantedRoot>`;
const row = (overrides = {}) => {
  const value = {
    wantedAuthNo: 'KJAS002609110001', company: '자동시험용 가상기업', busino: '0000000000', indTpNm: '시험용 소프트웨어',
    title: '시험용 Python 개발자', salTpNm: '월급', sal: '300만원', minSal: '280', maxSal: '320', region: '서울',
    holidayTpNm: '주 5일 근무', minEdubg: '학력무관', maxEdubg: '학력무관', career: 'N', regDt: '2026-09-01',
    closeDt: '2099-10-01', infoSvc: VALIDATION, wantedInfoUrl: 'https://example.invalid/a', wantedMobileInfoUrl: 'https://example.invalid/m',
    zipCd: '00000', strtnmCd: '서울 가상로 1', basicAddr: '서울 가상구 가상로 1', detailAddr: '3층', empTpCd: '10', jobsCd: '024', smodifyDtm: '20260901090000',
    ...overrides,
  };
  return `<wanted>${Object.entries(value).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</wanted>`;
};
const detailXml = (overrides = {}) => {
  const corp = { corpNm: '자동시험용 가상기업', reperNm: '가상대표', totPsncnt: '42', capitalAmt: '100000', yrSalesAmt: '5000000', indTpCdNm: '시험용 소프트웨어', busiCont: '가상 소프트웨어 개발', corpAddr: '서울 가상구 가상로 1', homePg: 'https://example.invalid/', busiSize: '중소기업' };
  const info = {
    jobsNm: '소프트웨어 개발자', wantedTitle: '시험용 Python 개발자', relJobsNm: '백엔드', jobCont: '&lt;p&gt;가상 업무 소개&lt;/p&gt;&lt;script&gt;bad()&lt;/script&gt;', receiptCloseDt: '2099-10-01',
    empTpNm: '기간의 정함이 없는 근로계약', collectPsncnt: '2명', salTpNm: '월급', enterTpNm: '신입', eduNm: '학력무관', forLang: '', major: '', certificate: '정보처리기사',
    mltsvcExcHope: '', compAbl: '', pfCond: '인근거주자', etcPfCond: '운전가능자', selMthd: '서류·면접', rcptMthd: '온라인', submitDoc: '이력서', etcHopeCont: '문의 바랍니다',
    workRegion: '서울 가상구', indArea: '', nearLine: '', workdayWorkhrCont: '주 5일 09:00~18:00', fourIns: '가입', retirepay: '퇴직금 지급', etcWelfare: '중식 제공', disableCvntl: '',
    dtlRecrContUrl: '', jobsCd: '024', minEdubgIcd: '00', maxEdubgIcd: '00', regionCd: '11000', empTpCd: '10', enterTpCd: 'N', salTpCd: 'M',
    staAreaRegionCd: '', lineCd: '', staNmCd: '', exitNoCd: '', walkDistCd: '',
  };
  const charge = { empChargerDpt: '개발팀', contactTelno: '', empChargerHp: '', chargerFaxNo: '', chargerEmail: 'hr@example.invalid' };
  const value = { wantedAuthNo: 'KJAS002609110001', ...overrides };
  const block = (name, record) => `<${name}>${Object.entries(record).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</${name}>`;
  const keywords = '<keywordList><srchKeywordNm>Python</srchKeywordNm><srchKeywordNm>SQL</srchKeywordNm></keywordList>';
  const wantedInfo = `<wantedInfo>${Object.entries(info).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}${keywords}</wantedInfo>`;
  return `<?xml version='1.0' encoding='UTF-8'?><wantedDtl><wantedAuthNo>${value.wantedAuthNo}</wantedAuthNo>${block('corpInfo', corp)}${wantedInfo}${block('empchargeInfo', charge)}</wantedDtl>`;
};
const xmlResponse = body => new Response(body, { headers: { 'Content-Type': 'application/xml;charset=UTF-8' } });
const parseListRow = body => childOf(parseXml(body), 'wanted');
const parseDetail = body => parseXml(body);

test('the Work24 list normalizer maps official fields and never invents salary, dates or location', () => {
  const job = normalizeWork24ListItem(parseListRow(listXml([row()])), checkedAt);
  assert.equal(job.id, 'work24-KJAS002609110001');
  assert.equal(job.company, '자동시험용 가상기업'); assert.equal(job.title, '시험용 Python 개발자');
  assert.equal(job.source, '고용24'); assert.equal(job.verification, 'source'); assert.equal(job.isDemo, false);
  assert.equal(job.salary, '월급 300만원'); assert.equal(job.experience, '신입');
  assert.equal(job.location, '서울 가상구 가상로 1 3층');
  assert.equal(job.deadline, '2099-10-01T14:59:59.000Z'); assert.equal(job.deadlineType, 'date');
  assert.equal(job.publishedAt, '2026-08-31T15:00:00.000Z'); assert.equal(job.status, 'open');
  assert.match(job.sourceUrl, /^https:\/\/www\.work24\.go\.kr\/wk\/a\/b\/1500\/empDetailAuthView\.do\?wantedAuthNo=KJAS002609110001/);
  assert.match(job.sourceUrl, /infoTypeCd=VALIDATION/);
  assert.match(job.description, /고용24/);
  const bare = normalizeWork24ListItem(parseListRow(listXml([row({ sal: '', salTpNm: '', basicAddr: '', detailAddr: '', region: '', regDt: '', closeDt: '' })])), checkedAt);
  assert.equal(bare.salary, '미기재'); assert.equal(bare.location, '지역 미기재');
  assert.equal(bare.publishedAt, ''); assert.equal(bare.deadline, ''); assert.equal(bare.deadlineType, 'unknown');
});

test('a past close date is closed and an unknown career code stays unstated', () => {
  const closed = normalizeWork24ListItem(parseListRow(listXml([row({ closeDt: '2000-01-01' })])), checkedAt);
  assert.equal(closed.status, 'closed'); assert.equal(closed.deadlineType, 'date');
  assert.equal(normalizeWork24ListItem(parseListRow(listXml([row({ career: '' })])), checkedAt).experience, '경력 미기재');
  assert.throws(() => normalizeWork24ListItem(parseListRow(listXml([row({ wantedAuthNo: '' })])), checkedAt), SourceError);
  assert.throws(() => normalizeWork24ListItem(parseListRow(listXml([row({ company: '' })])), checkedAt), SourceError);
});

test('the Work24 detail normalizer converts upstream HTML to inert text and keeps source attribution', () => {
  const job = normalizeWork24Detail(parseDetail(detailXml()), checkedAt);
  assert.equal(job.id, 'work24-KJAS002609110001'); assert.equal(job.company, '자동시험용 가상기업');
  assert.equal(job.title, '시험용 Python 개발자');
  assert.equal(job.description, '가상 업무 소개'); assert.doesNotMatch(job.description, /<|script/);
  assert.deepEqual(job.skills, ['소프트웨어 개발자', 'Python', 'SQL']);
  assert.match(job.requirements, /자격면허: 정보처리기사/); assert.match(job.requirements, /우대조건: 인근거주자/);
  assert.equal(job.benefits, '중식 제공');
  assert.match(job.companyInfo, /회사규모: 중소기업/); assert.match(job.companyInfo, /출처에 등록된 홈페이지: https:\/\/example\.invalid\//);
  assert.match(job.companyInfo, /주요사업: 가상 소프트웨어 개발/);
  assert.throws(() => normalizeWork24Detail(parseXml('<wantedDtl><wantedAuthNo>X</wantedAuthNo></wantedDtl>'), checkedAt), SourceError);
});

test('the composed normalizer accepts list and detail nodes and rejects unrelated XML', () => {
  assert.equal(normalizeWork24(parseListRow(listXml([row()])), checkedAt).id, 'work24-KJAS002609110001');
  assert.equal(normalizeWork24(parseDetail(detailXml()), checkedAt).id, 'work24-KJAS002609110001');
  assert.throws(() => normalizeWork24(parseXml('<other><x>1</x></other>'), checkedAt), SourceError);
  assert.throws(() => normalizeWork24(null, checkedAt), SourceError);
});

test('Work24 is an approved source listed alongside Saramin and enabled only with a key', () => {
  assert.ok(APPROVED_SOURCES.includes('work24'));
  const off = createJobService({ env: {}, fetcher: async () => { throw new Error('must not fetch'); } });
  const byId = Object.fromEntries(off.sources().map(source => [source.id, source]));
  assert.equal(byId.work24.enabled, false); assert.match(byId.work24.note, /WORK24_AUTH_KEY/);
  assert.equal(byId.wanted.enabled, false); assert.equal(byId.jumpit.enabled, false); assert.equal(byId.zighang.enabled, false);
  assert.equal(createJobService({ env: keyEnv, fetcher: async () => { throw new Error('must not fetch'); } }).sources().find(source => source.id === 'work24').enabled, true);
});

test('the Work24 search uses the official list endpoint with bounded XML parameters', async () => {
  let requested;
  const service = createJobService({ env: keyEnv, fetcher: async url => { requested = new URL(url); return xmlResponse(listXml([row()], 250)); } });
  const result = await service.search({ provider: 'work24', query: '개발자', page: 1, location: 'busan', category: 'development', experience: '3' });
  assert.equal(requested.origin + requested.pathname, WORK24_LIST_URL);
  assert.equal(requested.searchParams.get('authKey'), 'test-only-work24-key');
  assert.equal(requested.searchParams.get('callTp'), 'L'); assert.equal(requested.searchParams.get('returnType'), 'XML');
  assert.equal(requested.searchParams.get('startPage'), '101'); assert.equal(requested.searchParams.get('display'), '100');
  assert.equal(requested.searchParams.get('keyword'), '개발자');
  assert.equal(requested.searchParams.get('region'), '26000');
  assert.match(requested.searchParams.get('occupation'), /022/);
  assert.equal(requested.searchParams.get('career'), 'E');
  assert.equal(requested.searchParams.get('minCareerM'), '36'); assert.equal(requested.searchParams.get('maxCareerM'), '60');
  assert.equal(result.jobs.length, 1); assert.equal(result.jobs[0].source, '고용24');
  assert.equal(result.nextPage, 2); // (1+1)*100 = 200 < 250
  assert.match(result.warnings.join(' '), /고용24/);
});

test('an out-of-range Work24 page stops continuation and the upstream error envelope is surfaced', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async () => xmlResponse(listXml([row()], 250)) });
  const last = await service.search({ provider: 'work24', page: 9 });
  assert.equal(last.nextPage, null);
  assert.match(last.warnings.join(' '), /조회 범위의 끝/);
  const beyond = await service.search({ provider: 'work24', page: 10 });
  assert.equal(beyond.jobs.length, 0); assert.equal(beyond.nextPage, null); assert.equal(beyond.sourceResults[0].exhausted, true);
  assert.match(beyond.warnings.join(' '), /조회 범위/);
  const limited = createJobService({ env: keyEnv, fetcher: async () => xmlResponse(`<?xml version='1.0'?><GO24><error>신청하신 OpenApi 서비스가 존재하지 않습니다</error></GO24>`) });
  await assert.rejects(limited.search({ provider: 'work24' }), error => error instanceof SourceError && error.code === 'SOURCE_RESTRICTED');
});

test('Work24 detail uses the official detail endpoint, infoSvc=VALIDATION and rejects a mismatched identity', async () => {
  let requested;
  const service = createJobService({ env: keyEnv, fetcher: async url => { requested = new URL(url); return xmlResponse(detailXml()); } });
  const { job } = await service.detail('work24', 'KJAS002609110001');
  assert.equal(requested.origin + requested.pathname, WORK24_DETAIL_URL);
  assert.equal(requested.searchParams.get('callTp'), 'D'); assert.equal(requested.searchParams.get('returnType'), 'XML');
  assert.equal(requested.searchParams.get('wantedAuthNo'), 'KJAS002609110001');
  assert.equal(requested.searchParams.get('infoSvc'), 'VALIDATION');
  assert.equal(job.id, 'work24-KJAS002609110001'); assert.equal(job.source, '고용24');
  const other = createJobService({ env: keyEnv, fetcher: async () => xmlResponse(detailXml({ wantedAuthNo: 'OTHER-1' })) });
  await assert.rejects(other.detail('work24', 'KJAS002609110001'), error => error.code === 'SOURCE_FORMAT');
  await assert.rejects(service.detail('work24', '../private'), error => error.code === 'BAD_ID');
  await assert.rejects(service.detail('work24', 'has spaces'), error => error.code === 'BAD_ID');
});

test('missing Work24 key, unapproved sources and malformed XML never reach the network', async () => {
  let calls = 0;
  const service = createJobService({ env: {}, fetcher: async () => { calls++; throw new Error('must not run'); } });
  await assert.rejects(service.search({ provider: 'work24' }), error => error.code === 'KEY_REQUIRED');
  await assert.rejects(service.detail('work24', 'KJAS002609110001'), error => error.code === 'KEY_REQUIRED');
  for (const provider of ['wanted', 'jumpit', 'zighang']) await assert.rejects(service.search({ provider }), error => error.code === 'SOURCE_NOT_PERMITTED');
  assert.equal(calls, 0);
  const bad = createJobService({ env: keyEnv, fetcher: async () => xmlResponse('<wantedRoot><wanted><title>only</title></wanted></wantedRoot>') });
  await assert.rejects(bad.search({ provider: 'work24' }), error => error.code === 'SOURCE_FORMAT');
  const notXml = createJobService({ env: keyEnv, fetcher: async () => new Response('<!DOCTYPE r [<!ENTITY x "y">]><wantedRoot><wanted><wantedAuthNo>a</wantedAuthNo></wanted></wantedRoot>', { headers: { 'Content-Type': 'application/xml' } }) });
  await assert.rejects(notXml.search({ provider: 'work24' }), error => error.code === 'SOURCE_FORMAT');
});

test('a well-formed but wrong-root Work24 response is rejected instead of read as a listing', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async () => xmlResponse(`<?xml version='1.0'?><html><body><wanted><wantedAuthNo>X</wantedAuthNo><company>C</company><title>T</title></wanted></body></html>`) });
  await assert.rejects(service.search({ provider: 'work24' }), error => error.code === 'SOURCE_FORMAT');
  const empty = createJobService({ env: keyEnv, fetcher: async () => xmlResponse(`<?xml version='1.0'?><wantedRoot><total>0</total></wantedRoot>`) });
  const result = await empty.search({ provider: 'work24' });
  assert.equal(result.jobs.length, 0); assert.equal(result.nextPage, null);
});

test('the aggregate HTTP path exposes both approved sources and forwards the Work24 detail route', async () => {
  const service = createJobService({ env: keyEnv, fetcher: async url => xmlResponse(new URL(url).pathname.includes('210D01') ? detailXml() : listXml([row()])) });
  const server = createAppServer({ service }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const info = await (await fetch(`${base}/api/sources`)).json();
    const ids = info.sources.map(source => source.id);
    assert.deepEqual(ids, ['saramin', 'work24', 'wanted', 'jumpit', 'zighang']);
    assert.equal(info.sources.find(source => source.id === 'work24').enabled, true);
    const result = await fetch(`${base}/api/jobs?source=work24`);
    assert.equal(result.status, 200); assert.equal((await result.json()).jobs.length, 1);
    const detailResponse = await fetch(`${base}/api/jobs/work24/KJAS002609110001`);
    assert.equal(detailResponse.status, 200); assert.equal((await detailResponse.json()).job.id, 'work24-KJAS002609110001');
    assert.notEqual((await fetch(`${base}/api/jobs/work24/..%2Fprivate`)).status, 200);
    assert.equal((await fetch(`${base}/api/jobs/work24/---`)).status, 400);
    assert.equal((await fetch(`${base}/api/jobs?source=wanted`)).status, 403);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('every UI region and category has a verified Work24 mapping so filters never silently drop', () => {
  for (const location of JOB_LOCATIONS) {
    if (location.id === 'all') continue;
    assert.match(WORK24_REGIONS[location.id] ?? '', /^\d{4,5}$/, `missing Work24 region for ${location.id}`);
  }
  for (const category of JOB_CATEGORIES) {
    if (category.id === 'all') continue;
    assert.ok(Array.isArray(WORK24_OCCUPATIONS[category.id]) && WORK24_OCCUPATIONS[category.id].length > 0, `missing Work24 occupation for ${category.id}`);
  }
  assert.ok(WORK24_REGIONS.gwangju === WORK24_REGIONS.jeonnam);
  assert.equal(WORK24_CAREER.new.career, 'N');
  for (const id of ['1', '3', '5', '10']) assert.ok(WORK24_CAREER[id].minCareerM < WORK24_CAREER[id].maxCareerM);
});

test('Saramin continues to work unchanged alongside the new Work24 adapter', async () => {
  const saraminBody = { jobs: { job: [{ id: '101', position: { title: '사람인 테스트', 'experience-level': { code: 1, min: 0, max: 0, name: '신입' }, 'required-education-level': { name: '학력무관' }, location: { name: '서울' } }, company: { detail: { name: '자동시험용 가상기업' } }, 'close-type': { code: '1' }, 'posting-timestamp': '1780000000', 'expiration-timestamp': '1890000000', active: 1 }], total: 1 } };
  const env = { SARAMIN_ACCESS_KEY: 'test-only-key-value', WORK24_AUTH_KEY: 'test-only-work24-key' };
  const service = createJobService({ env, fetcher: async url => new URL(url).pathname.includes('saramin') || String(url).includes('oapi.saramin') ? Response.json(saraminBody) : xmlResponse(listXml([row()])) });
  const saramin = await service.search({ provider: 'saramin' });
  assert.equal(saramin.jobs[0].source, '사람인');
  const work24 = await service.search({ provider: 'work24' });
  assert.equal(work24.jobs[0].source, '고용24');
  const aggregate = await service.search({ provider: 'all' });
  assert.deepEqual([...new Set(aggregate.jobs.map(job => job.source))].sort(), ['고용24', '사람인']);
});
