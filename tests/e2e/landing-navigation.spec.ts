import { test, expect } from '@playwright/test';

test('footer opens the promised workspace and scrolls without replacing the app route', async ({ page }) => {
  await page.goto('/#/', { waitUntil: 'networkidle' });
  await page.locator('footer').getByRole('link', { name: '서류 보관함', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/documents$/);
  await expect(page.locator('h1')).toHaveText('내 이야기가 쌓이는 서랍');
  await page.goto('/#/', { waitUntil: 'networkidle' });
  await page.locator('footer').getByRole('link', { name: '지원 현황', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/applications$/);
  await expect(page.locator('h1')).toHaveText('모든 지원에, 나만의 흐름');
  await page.goto('/#/', { waitUntil: 'networkidle' });
  const landingURL = page.url();
  for (const [name, target] of [['이용 흐름', '#flow'], ['한계와 원칙', '#limits'], ['자주 묻는 질문', '#faq']]) {
    await page.locator('footer').getByRole('button', { name, exact: true }).click();
    await expect(page).toHaveURL(landingURL);
    await expect(page.locator(target)).toBeInViewport();
  }
});
