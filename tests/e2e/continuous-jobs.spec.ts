import { test, expect, type Page } from '@playwright/test';
import { normalizeWanted } from '../../server/job-sources.mjs';

const checkedAt = '2026-09-26T00:00:00.000Z';
const source = { id: 'wanted', name: '원티드', enabled: true, note: '자동시험용 연결' };
const record = (id: number) => normalizeWanted({ id, position: `시험용 공고 ${id}`, company: { name: '가상기업' }, status: 'active', hidden: false, annual_from: 0, annual_to: 100 }, checkedAt);
const response = (ids: number[], nextCursor: string | null, extra = {}) => ({ jobs: ids.map(record), checkedAt, nextCursor, nextPage: nextCursor ? 1 : null, warnings: [], cached: false, sourceResults: [{ ...source, count: ids.length, status: 'ok', exhausted: nextCursor === null }], ...extra });
async function setup(page: Page) { await page.route('**/api/sources', route => route.fulfill({ json: { sources: [source] } })); }

test('continuation preserves existing cards, deduplicates URLs and shows cumulative counts', async ({ page }) => {
  await setup(page);
  await page.route('**/api/jobs?**', route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    return route.fulfill({ json: cursor === 'start' ? response([900001, 900002], 'next_token') : response([900002, 900003], null) });
  });
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(2);
  const request = page.waitForRequest(req => req.url().includes('cursor=next_token'));
  await page.getByRole('button', { name: '공고 더 보기', exact: true }).click(); await request;
  await expect(page.locator('.discover-job')).toHaveCount(3);
  await expect(page.locator('.discover-job').first()).toContainText('900001');
  await expect(page.locator('.discover-source-result')).toContainText('누적 3건');
  await expect(page.locator('.discover-source-result')).toContainText('제공된 결과 끝');
  await expect(page.getByRole('button', { name: '공고 더 보기', exact: true })).toBeDisabled();
});

test('load-more failures leave the old list and retry the same cursor', async ({ page }) => {
  await setup(page); let attempts = 0;
  await page.route('**/api/jobs?**', route => {
    if (new URL(route.request().url()).searchParams.get('cursor') === 'start') return route.fulfill({ json: response([900001], 'retry_token') });
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 503, json: { error: { message: '시험용 일시 장애' } } }) : route.fulfill({ json: response([900002], null) });
  });
  await page.goto('/#/app/discover');
  await page.getByRole('button', { name: '공고 더 보기', exact: true }).click();
  await expect(page.locator('.discover-more-error')).toContainText('시험용 일시 장애');
  await expect(page.locator('.discover-job')).toHaveCount(1);
  await page.getByRole('button', { name: '공고 더 보기', exact: true }).click();
  await expect(page.locator('.discover-job')).toHaveCount(2); expect(attempts).toBe(2);
});

test('automatic scrolling appends another batch but pauses on an empty batch', async ({ page }) => {
  await setup(page); let calls = 0;
  await page.route('**/api/jobs?**', route => {
    calls++;
    return route.fulfill({ json: calls === 1 ? response([900001], 'next_token') : response([], 'remaining_token') });
  });
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(1);
  await page.getByRole('checkbox', { name: '스크롤할 때 자동으로 더 보기' }).check();
  await page.locator('.discover-load-more').scrollIntoViewIfNeeded();
  await expect(page.locator('.discover-load-more')).toContainText('자동 조회를 잠시 멈췄어요');
  await page.waitForLoadState('networkidle');
  expect(calls).toBe(2); await expect(page.locator('.discover-job')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '공고 더 보기', exact: true })).toBeEnabled();
});

test('a changed search aborts and cannot append stale in-flight continuation results', async ({ page }) => {
  await setup(page);
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/jobs?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('q') === 'new search') return route.fulfill({ json: response([900010], null) });
    if (params.get('cursor') === 'start') return route.fulfill({ json: response([900001], 'slow_token') });
    await gate;
    await route.fulfill({ json: response([900002], null) }).catch(() => {});
  });
  await page.goto('/#/app/discover');
  const started = page.waitForRequest(request => request.url().includes('slow_token'));
  await page.getByRole('button', { name: '공고 더 보기', exact: true }).click(); await started;
  await page.getByRole('textbox', { name: '실제 공고 검색어' }).fill('new search');
  await page.getByRole('button', { name: '공고 찾기', exact: true }).click();
  await expect(page.locator('.discover-job')).toHaveCount(1);
  await expect(page.locator('.discover-job')).toContainText('900010');
  release(); await page.waitForLoadState('networkidle');
  await expect(page.locator('.discover-job')).toHaveCount(1);
  await expect(page.locator('.discover-job')).toContainText('900010');
});

test('date, rolling, until-filled and unknown deadlines are readable on desktop and mobile', async ({ page }, testInfo) => {
  await setup(page);
  const jobs = [
    { ...record(900001), deadline: '2099-10-25T14:59:59.000Z', deadlineType: 'date' },
    { ...record(900002), deadlineType: 'rolling' },
    { ...record(900003), deadlineType: 'until-filled' },
    record(900004),
  ];
  await page.route('**/api/jobs?**', route => route.fulfill({ json: response([], null, { jobs }) }));
  await page.goto('/#/app/discover');
  const deadlines = page.locator('.discover-deadline');
  await expect(deadlines).toHaveCount(4);
  await expect(deadlines.nth(0)).toContainText('D-');
  await expect(deadlines.nth(1)).toHaveText('상시채용');
  await expect(deadlines.nth(2)).toHaveText('채용 시 마감');
  await expect(deadlines.nth(3)).toHaveText('마감일 미공개');
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`deadlines-${width}.png`), fullPage: true });
  }
});
