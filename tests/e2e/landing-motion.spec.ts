import { test, expect } from '@playwright/test';

test('character motion can be paused without disabling keyboard reactions', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/', { waitUntil: 'networkidle' });
  const hero = page.locator('.lz-hero');
  const mascot = hero.getByRole('button', { name: '마스코트 지피와 인사하기', exact: true });
  const pause = hero.getByRole('button', { name: '캐릭터 움직임 멈추기', exact: true });
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await expect(hero.locator('.lz-mascot-breathe')).toHaveCount(1);
  await pause.click();
  const resume = hero.getByRole('button', { name: '캐릭터 움직임 켜기', exact: true });
  await expect(resume).toHaveAttribute('aria-pressed', 'true');
  await expect(hero.locator('.lz-mascot-breathe, .lz-mascot-eyes')).toHaveCount(0);
  await mascot.focus();
  await page.keyboard.press('Enter');
  await expect(hero.getByRole('status')).toContainText('자료는 이 브라우저에 보관해요');
  await resume.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await expect(hero.locator('.lz-mascot-breathe')).toHaveCount(1);
  await expect(hero.getByText('파일은 내 브라우저에', { exact: true })).toBeVisible();
  await expect(hero.getByText('오프라인에서도 열림', { exact: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('landing-desktop.png'), animations: 'disabled' });
});

test('mobile respects system reduced motion and keeps the character usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/', { waitUntil: 'networkidle' });
  const hero = page.locator('.lz-hero');
  await expect(hero.getByText('기기의 움직임 최소화 설정 적용 중')).toBeVisible();
  await expect(hero.locator('.lz-motion-toggle, .lz-mascot-breathe, .lz-mascot-eyes')).toHaveCount(0);
  const mascot = hero.getByRole('button', { name: '마스코트 지피와 인사하기', exact: true });
  await mascot.focus();
  await page.keyboard.press('Enter');
  await expect(hero.getByRole('status')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('landing-mobile.png'), animations: 'disabled', fullPage: true });
});
