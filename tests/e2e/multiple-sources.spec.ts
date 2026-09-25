import { test, expect, type Page } from '@playwright/test';
import { normalizeWanted } from '../../server/job-sources.mjs';

const checkedAt = '2026-09-26T00:00:00.000Z';
const sources = [
  { id: 'wanted', name: '원티드', enabled: true, note: '시험용 공개 연결' },
  { id: 'jumpit', name: '점핏', enabled: true, note: '시험용 공개 연결' },
  { id: 'zighang', name: '직행', enabled: true, note: '시험용 공개 연결' },
  { id: 'saramin', name: '사람인', enabled: false, note: '시험용 키 미설정' },
];
const base = normalizeWanted({ id: 900001, company: { name: '자동시험용 가상기업' }, position: '가상 시험용 공고', status: 'active', hidden: false, annual_from: 0, annual_to: 3, address: { location: '부산' }, detail: { intro: '이 내용은 브라우저 자동시험 전용 가상 공고 원문입니다.' } }, checkedAt);
const records = [
  base,
  { ...base, id: 'jumpit-900002', source: '점핏', sourceUrl: 'https://jumpit.saramin.co.kr/position/900002' },
  { ...base, id: 'zighang-12345678-1234-1234-1234-123456789abc', source: '직행', sourceUrl: 'https://zighang.com/recruitment/12345678-1234-1234-1234-123456789abc' },
];

async function mockSources(page: Page, failJumpit = false) {
  await page.route('**/api/sources', route => route.fulfill({ json: { sources } }));
  await page.route('**/api/jobs**', route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/jobs') {
      const record = records.find(job => url.pathname.includes(job.id.replace('-', '/'))) ?? records.find(job => url.pathname.includes(job.source === '점핏' ? '/jumpit/' : job.source === '직행' ? '/zighang/' : '/wanted/'));
      return route.fulfill({ json: { job: record, checkedAt } });
    }
    const source = url.searchParams.get('source');
    const pageNumber = Number(url.searchParams.get('page'));
    const values = records.filter((job, index) => (!failJumpit || index !== 1) && (source === 'all' || sources[index].id === source));
    const statuses = sources.filter(item => item.enabled && (source === 'all' || source === item.id)).map(item => ({ id: item.id, name: item.name, count: failJumpit && item.id === 'jumpit' ? 0 : 1, status: failJumpit && item.id === 'jumpit' ? 'error' : 'ok', ...(failJumpit && item.id === 'jumpit' ? { message: '시험용 조회 제한' } : {}) }));
    return route.fulfill({ json: { jobs: values, nextPage: pageNumber === 0 ? 1 : null, checkedAt, warnings: [], sourceResults: statuses, cached: false } });
  });
}

test('default aggregate search exposes nationwide and occupation filters and preserves them on pagination', async ({ page }) => {
  await mockSources(page);
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(3);
  await expect(page.getByRole('combobox', { name: '공고 출처', exact: true })).toHaveValue('all');
  await expect(page.getByRole('combobox', { name: '공고 근무 지역' }).locator('option')).toHaveCount(18);
  await expect(page.getByRole('combobox', { name: '공고 출처', exact: true }).locator('option[value="saramin"]')).toHaveJSProperty('disabled', true);
  await page.getByRole('combobox', { name: '공고 근무 지역' }).selectOption('busan');
  await page.getByRole('combobox', { name: '직무 분야' }).selectOption('development');
  await page.getByRole('combobox', { name: '지원 경력' }).selectOption('1');
  await page.getByRole('textbox', { name: '실제 공고 검색어' }).fill('Python');
  const submitted = page.waitForRequest(request => request.url().includes('/api/jobs?') && request.url().includes('q=Python'));
  await page.getByRole('button', { name: '공고 찾기', exact: true }).click();
  const query = new URL((await submitted).url()).searchParams;
  expect(Object.fromEntries(query)).toMatchObject({ source: 'all', location: 'busan', category: 'development', experience: '1', page: '0' });
  await expect(page.locator('.discover-active-filters')).toContainText('부산');
  const next = page.waitForRequest(request => request.url().includes('/api/jobs?') && request.url().includes('page=1'));
  await page.getByRole('button', { name: '공고 더 보기', exact: true }).click();
  expect(Object.fromEntries(new URL((await next).url()).searchParams)).toMatchObject({ location: 'busan', category: 'development', experience: '1' });
  await expect(page.getByRole('button', { name: '공고 더 보기', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '조건 초기화', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '공고 근무 지역' })).toHaveValue('all');
  await expect(page.locator('.discover-active-filters')).toHaveCount(0);
});

test('a failed source is visible without hiding successful source results', async ({ page }) => {
  await mockSources(page, true);
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(2);
  await expect(page.locator('.discover-source-result.is-error')).toContainText('점핏');
  await expect(page.locator('.discover-source-result.is-error')).toContainText('시험용 조회 제한');
  await expect(page.locator('.discover-error')).toHaveCount(0);
});

for (const source of ['jumpit', 'zighang']) test(`${source} detail, save and immutable application snapshot use the correct source`, async ({ page }) => {
  await mockSources(page);
  await page.goto('/#/app/discover');
  const title = source === 'jumpit' ? '점핏' : '직행';
  await page.locator('.discover-job').filter({ has: page.locator('.discover-source-label', { hasText: title }) }).click();
  await expect(page.getByRole('dialog')).toContainText('브라우저 자동시험 전용');
  await page.getByRole('button', { name: '지원 준비하기', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/applications\?application=/);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.reload();
  await page.getByRole('dialog').getByRole('tab', { name: '공고 원문', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('브라우저 자동시험 전용');
});

test('expanded search filters remain usable on desktop and narrow phones', async ({ page }, testInfo) => {
  await mockSources(page);
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(3);
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole('button', { name: '공고 찾기', exact: true })).toBeVisible();
    for (const name of ['공고 출처', '공고 근무 지역', '직무 분야', '지원 경력']) await expect(page.getByRole('combobox', { name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`search-${width}.png`), fullPage: true });
  }
});
