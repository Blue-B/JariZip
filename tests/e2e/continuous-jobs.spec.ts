import { test, expect, type Page } from '@playwright/test';
import { normalizeWanted } from '../../server/job-sources.mjs';

const checkedAt = '2026-09-26T00:00:00.000Z';
const source = { id: 'saramin', name: '사람인', enabled: true, note: '공식 API 시험용 연결' };
const record = (id: number) => normalizeWanted({ id, position: `시험용 공고 ${id}`, company: { name: '자동시험 가상기업', industry_name: '시험용 소프트웨어' }, status: 'active', hidden: false, annual_from: 0, annual_to: 100 }, checkedAt);
const ids = (start: number, count: number) => Array.from({ length: count }, (_, i) => 900000 + start + i);
const response = (values: number[], nextCursor: string | null, extra = {}) => ({ jobs: values.map(record), checkedAt, nextCursor, nextPage: nextCursor ? 1 : null, warnings: [], cached: false, sourceResults: [{ ...source, count: values.length, status: 'ok', exhausted: nextCursor === null }], ...extra });
async function setup(page: Page) { await page.route('**/api/sources', route => route.fulfill({ json: { sources: [source] } })); }

test('30/50-row pagination buffers unequal source batches without dropped or duplicated jobs and hides counters', async ({ page }) => {
  await setup(page);
  let requests = 0;
  await page.route('**/api/jobs?**', route => {
    requests++;
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    return route.fulfill({ json: cursor === 'start' ? response(ids(1, 37), 'second') : response(ids(37, 39), null) });
  });
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(30);
  await expect(page.getByRole('combobox', { name: '한 번에 볼 공고 수' })).toHaveValue('30');
  await expect(page.locator('.discover-job').first()).toContainText('900001');
  await expect(page.locator('.discover-source-results')).toHaveCount(0);
  await expect(page.locator('.discover-results-heading')).not.toContainText('누적');
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.locator('.discover-job')).toHaveCount(30);
  await expect(page.locator('.discover-job').first()).toContainText('900031');
  await expect(page.locator('.discover-job').last()).toContainText('900060');
  await page.getByRole('button', { name: '이전 페이지', exact: true }).click();
  await expect(page.locator('.discover-job').first()).toContainText('900001');
  await page.getByRole('combobox', { name: '한 번에 볼 공고 수' }).selectOption('50');
  await expect(page.locator('.discover-job')).toHaveCount(50);
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.locator('.discover-job')).toHaveCount(25);
  await expect(page.locator('.discover-job').first()).toContainText('900051');
  await expect(page.locator('.discover-job').last()).toContainText('900075');
  await expect(page.getByRole('button', { name: '다음 페이지', exact: true })).toBeDisabled();
  expect(requests).toBe(2);
});

for (const size of [30, 50]) test(`automatic browsing appends ${size} at a time without page navigation or replacing old cards`, async ({ page }) => {
  await setup(page);
  await page.route('**/api/jobs?**', route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    return route.fulfill({ json: cursor === 'start' ? response(ids(1, 56), 'next') : response(ids(57, 56), null) });
  });
  await page.goto('/#/app/discover');
  await page.getByRole('combobox', { name: '한 번에 볼 공고 수' }).selectOption(String(size));
  await expect(page.locator('.discover-job')).toHaveCount(size);
  await page.getByRole('checkbox', { name: '스크롤할 때 자동으로 더 보기' }).check();
  await expect(page.getByRole('navigation', { name: '공고 페이지' })).toHaveCount(0);
  await page.locator('.discover-load-more').scrollIntoViewIfNeeded();
  await expect(page.locator('.discover-job')).toHaveCount(size * 2);
  await expect(page.locator('.discover-job').first()).toContainText('900001');
  await expect(page.locator('.discover-job').last()).toContainText(String(900000 + size * 2));
});

test('failed next-page requests preserve the current page and retry the same cursor', async ({ page }) => {
  await setup(page); let attempts = 0;
  await page.route('**/api/jobs?**', route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (cursor === 'start') return route.fulfill({ json: response(ids(1, 30), 'retry_token') });
    expect(cursor).toBe('retry_token'); attempts++;
    return attempts === 1 ? route.fulfill({ status: 503, json: { error: { message: '시험용 일시 장애' } } }) : route.fulfill({ json: response(ids(31, 30), null) });
  });
  await page.goto('/#/app/discover');
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.locator('.discover-more-error')).toContainText('시험용 일시 장애');
  await expect(page.locator('.discover-job')).toHaveCount(30);
  await expect(page.locator('.discover-job').first()).toContainText('900001');
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.locator('.discover-job').first()).toContainText('900031'); expect(attempts).toBe(2);
});

test('automatic scrolling stops on empty source batches without an infinite request loop', async ({ page }) => {
  await setup(page); let calls = 0;
  await page.route('**/api/jobs?**', route => { calls++; return route.fulfill({ json: calls === 1 ? response(ids(1, 30), 'next') : response([], 'remaining') }); });
  await page.goto('/#/app/discover');
  await page.getByRole('checkbox', { name: '스크롤할 때 자동으로 더 보기' }).check();
  await page.locator('.discover-load-more').scrollIntoViewIfNeeded();
  await expect(page.locator('.discover-load-more')).toContainText('자동 조회를 잠시 멈췄어요');
  await page.waitForLoadState('networkidle'); expect(calls).toBe(2);
  await expect(page.locator('.discover-job')).toHaveCount(30);
});

test('changed searches cannot navigate with or append stale continuation results', async ({ page }) => {
  await setup(page); let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/jobs?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('q') === 'new search') return route.fulfill({ json: response([990010], null) });
    if (params.get('cursor') === 'start') return route.fulfill({ json: response(ids(1, 30), 'slow_token') });
    await gate; await route.fulfill({ json: response(ids(31, 30), null) }).catch(() => {});
  });
  await page.goto('/#/app/discover');
  const started = page.waitForRequest(request => request.url().includes('slow_token'));
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click(); await started;
  await page.getByRole('textbox', { name: '실제 공고 검색어' }).fill('new search');
  await page.getByRole('button', { name: '공고 찾기', exact: true }).click();
  await expect(page.locator('.discover-job')).toHaveCount(1);
  release(); await page.waitForLoadState('networkidle');
  await expect(page.locator('.discover-job')).toContainText('990010');
  await expect(page.locator('.discover-pagination')).toContainText('1 페이지');
});

test('deadlines have a prominent countdown and separate date, with attributed company facts and no invented data', async ({ page }, testInfo) => {
  await setup(page);
  const jobs = [
    { ...record(900001), deadline: new Date(Date.now() + 4 * 86400000).toISOString(), deadlineType: 'date' },
    { ...record(900002), deadlineType: 'rolling' },
    { ...record(900003), deadlineType: 'until-filled' },
    { ...record(900004), companyInfo: '' },
  ];
  await page.route('**/api/jobs?**', route => route.fulfill({ json: response([], null, { jobs }) }));
  await page.goto('/#/app/discover');
  const deadlines = page.locator('.discover-deadline');
  await expect(deadlines).toHaveCount(4);
  await expect(deadlines.nth(0).locator('strong')).toHaveText('D-4');
  await expect(deadlines.nth(0).locator('span')).toContainText('마감');
  await expect(deadlines.nth(1)).toHaveText('상시채용');
  await expect(deadlines.nth(2)).toHaveText('채용 시 마감');
  await expect(deadlines.nth(3)).toHaveText('마감일 미공개');
  await expect(page.locator('.discover-company-info').first()).toContainText('업종: 시험용 소프트웨어');
  await expect(page.locator('.discover-company-info').last()).toHaveText('기업 상세정보 미제공');
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`redesign-${width}.png`), fullPage: true });
  }
});
