import { test, expect } from './fixtures';

test('mobile search has a name and save notifications leave bottom navigation clickable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/app/jobs', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: '내 자료 검색', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '내 자료 검색', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '내 자료 빠르게 찾기' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.job-list-card').first().locator('.job-list-foot button').click();
  await expect(page.locator('.toast')).toBeVisible();
  const toast = await page.locator('.toast').boundingBox();
  const nav = await page.locator('.mobile-bottom-nav').boundingBox();
  expect(toast).not.toBeNull();
  expect(nav).not.toBeNull();
  expect(toast!.y + toast!.height).toBeLessThanOrEqual(nav!.y);
  await page.locator('.mobile-bottom-nav').getByRole('link', { name: '서류 보관함', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/documents$/);
});

test('small mobile help stays inside the viewport and restores focus when dismissed', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/#/');
  const help = page.getByRole('button', { name: '탐색 도움말', exact: true });
  await help.click();
  const bubble = page.locator('.discover-tip');
  await expect(bubble).toBeVisible();
  const box = await bubble.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: '탐색 팁 닫기' }).click();
  await expect(help).toBeFocused();
  await expect(bubble).toBeHidden();
  await help.click();
  await page.keyboard.press('Escape');
  await expect(bubble).toBeHidden();
  await expect(help).toBeFocused();
  await page.getByRole('textbox', { name: '실제 공고 검색어' }).click();
  await expect(page.getByRole('textbox', { name: '실제 공고 검색어' })).toBeFocused();
});
