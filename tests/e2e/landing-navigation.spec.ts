import { test, expect } from './fixtures';

test('home, optional help and browser Back return to useful content', async ({ page }) => {
  await page.goto('/#/app/documents');
  await expect(page.locator('h1')).toHaveText('내 이야기가 쌓이는 서랍');
  const documentsBefore = await page.locator('.document-card').count();
  await page.getByRole('link', { name: '자리집 JariZip 홈', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/discover$/);
  // The root redirect replaces history rather than creating a Back-button trap.
  await page.goBack();
  await expect(page).toHaveURL(/#\/app\/documents$/);
  await expect(page.locator('.document-card')).toHaveCount(documentsBefore);
  await page.locator('.sidebar-help').click();
  await expect(page).toHaveURL(/#\/about$/);
  await expect(page.getByRole('heading', { name: '이용 안내', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '공고로 돌아가기', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/discover$/);
  await page.goto('/#/about');
  await page.locator('footer').getByRole('link', { name: '채용 공고 보기' }).click();
  await expect(page).toHaveURL(/#\/app\/discover$/);
});
