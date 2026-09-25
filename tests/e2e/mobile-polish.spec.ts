import { test, expect } from '@playwright/test';

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

test('mobile character greeting stays anchored to Jippi rather than the preview frame', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '마스코트 지피와 인사하기', exact: true }).click();
  const bubble = page.locator('.lz-mascot-bubble');
  await expect(bubble).toBeVisible();
  const bubbleBox = await bubble.boundingBox();
  const character = await page.locator('.lz-jippi-stand').boundingBox();
  expect(bubbleBox).not.toBeNull();
  expect(character).not.toBeNull();
  const gap = character!.y - (bubbleBox!.y + bubbleBox!.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(20);
  expect(bubbleBox!.x).toBeGreaterThanOrEqual(0);
  expect(bubbleBox!.x + bubbleBox!.width).toBeLessThanOrEqual(390);
});
