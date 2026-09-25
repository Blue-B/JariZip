import { test, expect } from '@playwright/test';
import { normalizeWanted } from '../../server/job-sources.mjs';

const checkedAt = '2026-09-26T00:00:00.000Z';
const source = { id: 'wanted', name: '원티드', enabled: true, note: '자동시험용 연결' };
const record = (id: number) => normalizeWanted({ id, position: `정렬시험 공고 ${id}`, company: { name: '자동시험 가상기업', industry_name: '시험용 소프트웨어' }, status: 'active', annual_from: 0, annual_to: 100 }, checkedAt);

test('sort switches reset pagination without requerying, retain unknown dates and keep 30/50 browsing', async ({ page }) => {
  const jobs = Array.from({ length: 65 }, (_, index) => ({
    ...record(900001 + index),
    deadline: index === 64 ? '' : new Date(Date.now() + (70 - index) * 86400000).toISOString(),
    publishedAt: index === 64 ? '' : new Date(Date.parse(checkedAt) + index * 86400000).toISOString(),
  }));
  let requests = 0;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [source] } }));
  await page.route('**/api/jobs?**', route => {
    requests++;
    return route.fulfill({ json: { jobs, checkedAt, nextCursor: null, nextPage: null, warnings: [], sourceResults: [{ ...source, status: 'ok', count: jobs.length, exhausted: true }] } });
  });
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(30);
  await expect(page.getByRole('combobox', { name: '공고 정렬' })).toHaveValue('source');
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.locator('.discover-pagination')).toContainText('2 페이지');
  await page.getByRole('combobox', { name: '공고 정렬' }).selectOption('deadline');
  await expect(page.locator('.discover-pagination')).toContainText('1 페이지');
  await expect(page.locator('.discover-job').first()).toContainText('900064');
  await expect(page.locator('.discover-sort-note')).toContainText('불러온 공고 안에서');
  await page.getByRole('combobox', { name: '한 번에 볼 공고 수' }).selectOption('50');
  await expect(page.locator('.discover-job')).toHaveCount(50);
  await page.getByRole('combobox', { name: '공고 정렬' }).selectOption('newest');
  await expect(page.locator('.discover-job').first()).toContainText('900064');
  await page.getByRole('checkbox', { name: '스크롤할 때 자동으로 더 보기' }).check();
  await page.locator('.discover-load-more').scrollIntoViewIfNeeded();
  await expect(page.locator('.discover-job')).toHaveCount(65);
  await expect(page.locator('.discover-job').last()).toContainText('900065');
  await page.getByRole('combobox', { name: '공고 정렬' }).selectOption('source');
  await expect(page.locator('.discover-job').first()).toContainText('900001');
  await expect(page.locator('.discover-sort-note')).toHaveCount(0);
  expect(requests).toBe(1);
});

test('character tips, sorting controls and whitespace remain usable on desktop and narrow mobile', async ({ page }, testInfo) => {
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [source] } }));
  await page.route('**/api/jobs?**', route => route.fulfill({ json: {
    jobs: [record(900001), { ...record(900002), deadline: new Date(Date.now() + 3 * 86400000).toISOString() }],
    checkedAt, nextCursor: null, nextPage: null, warnings: [], sourceResults: [{ ...source, status: 'ok', count: 2, exhausted: true }],
  } }));
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/#/app/discover');
    await expect(page.locator('.discover-job')).toHaveCount(2);
    const guide = page.getByRole('button', { name: '탐색 도움말', exact: true });
    await guide.focus();
    await page.keyboard.press('Enter');
    await expect(guide).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.discover-tip')).toContainText('마감일순');
    const box = await page.locator('.discover-tip').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`workspace-tip-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: '탐색 팁 닫기', exact: true }).click();
    await expect(guide).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`workspace-${width}.png`), fullPage: true, animations: 'disabled' });
  }
});

test('optional guide stays compact, readable and keyboard-navigable', async ({ page }, testInfo) => {
  await page.goto('/#/about');
  await expect(page.locator('.lz-guide-spaces a').nth(1)).toHaveAttribute('href', '#/app/documents');
  for (const width of [1440, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`guide-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  await page.locator('.lz-guide-spaces a').nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/app\/documents$/);
});
