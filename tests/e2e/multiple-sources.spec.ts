import { test, expect, type Page } from '@playwright/test';
import { normalizeSaramin } from '../../server/job-sources.mjs';

const checkedAt = '2026-09-26T00:00:00.000Z';
const source = { id: 'saramin', name: '사람인', enabled: true, note: '공식 API 시험용 연결' };
const offSources = [
  source,
  { id: 'wanted', name: '원티드', enabled: false, note: '제공사 사전 승인 없음' },
  { id: 'jumpit', name: '점핏', enabled: false, note: '제공사 사전 승인 없음' },
  { id: 'zighang', name: '직행', enabled: false, note: '제공사 사전 승인 없음' },
];
const record = (id: number) => normalizeSaramin({
  id: String(id),
  position: { title: `시험용 공고 ${id}`, 'experience-level': { code: 1, min: 0, max: 0, name: '신입' }, 'required-education-level': { name: '학력무관' }, location: { name: '부산' } },
  company: { detail: { name: `자동시험용 가상기업 ${id}` } }, 'close-type': { code: '1' },
  'posting-timestamp': '1780000000', 'expiration-timestamp': '1890000000', active: 1,
}, checkedAt);
const records = [record(900001), record(900002), record(900003)];

async function mockSources(page: Page, options: { failApproved?: boolean; log?: string[] } = {}) {
  const { failApproved = false, log } = options;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: offSources } }));
  await page.route('**/api/jobs**', route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/jobs') {
      const id = url.pathname.split('/').pop();
      return route.fulfill({ json: { job: records.find(job => job.sourceUrl.endsWith(id!)) ?? records[0], checkedAt } });
    }
    log?.push(url.searchParams.get('source') ?? '');
    if (url.searchParams.get('source') !== 'all' && url.searchParams.get('source') !== 'saramin') return route.fulfill({ status: 403, json: { error: { code: 'SOURCE_NOT_PERMITTED', message: '차단됨' } } });
    const statuses = [{ ...source, count: failApproved ? 0 : records.length, status: failApproved ? 'error' : 'ok', ...(failApproved ? { message: '시험용 조회 제한' } : {}) }];
    const values = failApproved ? [] : records;
    return route.fulfill({ json: { jobs: values, nextPage: null, checkedAt, warnings: [], sourceResults: statuses, cached: false } });
  });
}

test('default search exposes nationwide and occupation filters and preserves them on submission', async ({ page }) => {
  await mockSources(page);
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(3);
  await expect(page.getByRole('combobox', { name: '공고 출처', exact: true })).toHaveValue('all');
  await expect(page.getByRole('combobox', { name: '공고 근무 지역' }).locator('option')).toHaveCount(18);
  for (const id of ['wanted', 'jumpit', 'zighang']) await expect(page.getByRole('combobox', { name: '공고 출처', exact: true }).locator(`option[value="${id}"]`)).toHaveAttribute('disabled', '');
  await page.getByRole('combobox', { name: '공고 근무 지역' }).selectOption('busan');
  await page.getByRole('combobox', { name: '직무 분야' }).selectOption('development');
  await page.getByRole('combobox', { name: '지원 경력' }).selectOption('1');
  await page.getByRole('textbox', { name: '실제 공고 검색어' }).fill('Python');
  const submitted = page.waitForRequest(request => request.url().includes('/api/jobs?') && request.url().includes('q=Python'));
  await page.getByRole('button', { name: '공고 찾기', exact: true }).click();
  const query = new URL((await submitted).url()).searchParams;
  expect(Object.fromEntries(query)).toMatchObject({ source: 'all', location: 'busan', category: 'development', experience: '1', page: '0' });
  await expect(page.locator('.discover-active-filters')).toContainText('부산');
  await page.getByRole('button', { name: '조건 초기화', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '공고 근무 지역' })).toHaveValue('all');
  await expect(page.locator('.discover-active-filters')).toHaveCount(0);
});

test('selecting an unapproved source never issues a job request and shows the manual path', async ({ page }) => {
  const log: string[] = [];
  await mockSources(page, { log });
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(3);
  const before = log.length;
  // A disabled option cannot be selected through the UI, so force the deep value and confirm the guard.
  await page.evaluate(() => {
    const select = document.querySelector('select') as HTMLSelectElement;
    select.value = 'wanted';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByRole('button', { name: '공고 찾기', exact: true }).click();
  await expect(page.locator('.discover-optional')).toContainText('제공사의 사전 승인이 확인되지 않아');
  await expect(page.locator('.discover-optional-list a')).toHaveCount(4);
  expect(log.filter(value => value === 'wanted')).toHaveLength(0);
  expect(log.length).toBe(before);
});

test('a failed approved source is visible without hiding other results', async ({ page }) => {
  await mockSources(page, { failApproved: true });
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(0);
  await page.locator('.discover-source-warning summary').click();
  await expect(page.locator('.discover-source-warning')).toContainText('사람인');
  await expect(page.locator('.discover-source-warning')).toContainText('시험용 조회 제한');
  await expect(page.locator('.discover-error')).toHaveCount(0);
});

test('a manually added unapproved posting opens saved with no re-query and keeps its original link', async ({ page }) => {
  let jobRequests = 0;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: offSources } }));
  await page.route('**/api/jobs**', route => { jobRequests++; return route.fulfill({ status: 403, json: { error: { code: 'SOURCE_NOT_PERMITTED', message: '차단됨' } } }); });
  await page.goto('/#/app/jobs?new=1');
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="company"]').fill('수동보관 가상기업');
  await dialog.locator('[name="title"]').fill('수동 확인 개발자');
  await dialog.locator('[name="url"]').fill('https://www.wanted.co.kr/wd/900009');
  await dialog.locator('[name="description"]').fill('원문에서 직접 확인해 붙여넣은 시험용 공고 본문입니다. 자동 수집이 아닙니다.');
  await dialog.getByRole('button', { name: '공고 보관하기', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await expect(page.locator('.job-list-card')).toHaveCount(1);
  await expect(page.locator('.job-detail')).toContainText('미확인');
  await expect(page.getByRole('button', { name: '출처 다시 조회', exact: true })).toHaveCount(0);
  await expect(page.locator('.job-detail-actions').getByRole('link', { name: '원본 공고', exact: true })).toHaveAttribute('href', 'https://www.wanted.co.kr/wd/900009');
  expect(jobRequests).toBe(0);
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
