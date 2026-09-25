import { test, expect } from '@playwright/test';
import { normalizeWanted } from '../../server/job-sources.mjs';

const checkedAt = '2026-09-26T00:00:00.000Z';

test('home opens the real search interface without a marketing gate', async ({ page }, testInfo) => {
  const source = { id: 'wanted', name: '원티드', enabled: true };
  const job = normalizeWanted({ id: 990001, position: '홈 진입 시험용 공고', company: { name: '자동시험 가상기업' }, status: 'active' }, checkedAt);
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [source] } }));
  await page.route('**/api/jobs?**', route => route.fulfill({ json: {
    jobs: [job], checkedAt, nextCursor: null, nextPage: null, warnings: [],
    sourceResults: [{ ...source, status: 'ok', count: 1, exhausted: true }],
  } }));
  for (const width of [1440, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page).toHaveURL(/#\/app\/discover$/);
    await expect(page.getByRole('heading', { name: '채용 공고', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '실제 공고 검색어' })).toBeInViewport();
    await expect(page.locator('.discover-job')).toHaveCount(1);
    await expect(page.locator('.discover-job').first()).toBeInViewport();
    await expect(page.locator('.lz-hero, .lz-guide, .lz-stage-word')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), animations: 'disabled' });
  }
});

test('optional guide opens real empty workspaces without fabricating records', async ({ page }) => {
  await page.goto('/#/about');
  const spaces = page.getByRole('navigation', { name: '작업 공간 안내' });
  await expect(spaces.locator('a')).toHaveCount(4);
  await spaces.locator('a[href="#/app/documents"]').click();
  await expect(page.locator('h1')).toHaveText('내 이야기가 쌓이는 서랍');
  await expect(page.locator('.document-card')).toHaveCount(0);
  await page.goto('/#/about');
  await page.locator('.lz-guide-spaces a[href="#/app/applications"]').click();
  await expect(page.locator('h1')).toHaveText('모든 지원에, 나만의 흐름');
});
