import { test, expect } from '@playwright/test';

test('landing links to real workspaces instead of displaying fabricated job results', async ({ page }) => {
  await page.goto('/#/', { waitUntil: 'networkidle' });
  await expect(page.locator('.lz-dash-stats, .lz-results, .lz-board')).toHaveCount(0);
  await expect(page.locator('.lz-hero-actions a').first()).toHaveAttribute('href', '#/app/discover');
  const spaces = page.getByRole('navigation', { name: '제품 화면 바로 가기' });
  await expect(spaces.locator('a')).toHaveCount(4);
  await spaces.locator('a[href="#/app/documents"]').click();
  await expect(page.locator('h1')).toHaveText('내 이야기가 쌓이는 서랍');
  await expect(page.locator('.document-card')).toHaveCount(0);
  await page.goto('/#/');
  await page.locator('#flow a[href="#/app/applications"]').click();
  await expect(page.locator('h1')).toHaveText('모든 지원에, 나만의 흐름');
});
