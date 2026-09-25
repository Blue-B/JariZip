import { test, expect } from '@playwright/test';

test('landing examples react to real input instead of only changing labels', async ({ page }) => {
  await page.goto('/#/', { waitUntil: 'networkidle' });
  await page.locator('.lz-hero').getByRole('button', { name: '관심 공고에서 빼기', exact: true }).click();
  await expect(page.locator('.lz-dash-stats b').first()).toHaveText('2');
  await page.locator('.lz-hero').getByRole('button', { name: '관심 공고로 저장', exact: true }).click();
  await expect(page.locator('.lz-dash-stats b').first()).toHaveText('3');
  const preview = page.locator('#preview');
  await preview.getByRole('tab', { name: '서류 보관함', exact: true }).click();
  const body = preview.locator('.lz-doc-body');
  await expect(body).toContainText('규칙을 먼저 합의');
  await preview.getByRole('button', { name: 'v1', exact: true }).click();
  await expect(body).toContainText('프론트엔드 개발자가 되고 싶습니다');
  await expect(body).not.toContainText('규칙을 먼저 합의');
  await preview.getByRole('button', { name: 'v2', exact: true }).click();
  await expect(body).toContainText('공통 컴포넌트');
  await preview.getByRole('button', { name: 'v3', exact: true }).click();
  await expect(body).toContainText('규칙을 먼저 합의');
  await preview.getByRole('tab', { name: '지원 보드', exact: true }).click();
  await preview.getByRole('button', { name: '프론트엔드 엔지니어 다음 단계로', exact: true }).click();
  await expect(preview.locator('.lz-col').nth(0).locator('.lz-card')).toHaveCount(0);
  await expect(preview.locator('.lz-col').nth(1).locator('.lz-card')).toHaveCount(2);
  await preview.getByRole('tab', { name: '공고 탐색', exact: true }).click();
  await preview.getByRole('button', { name: '정규직', exact: true }).click();
  await preview.getByRole('button', { name: '신입 가능', exact: true }).click();
  await expect(preview.locator('.lz-result')).toHaveCount(1);
  await expect(preview.locator('.lz-result')).toContainText('푸른결');
});
