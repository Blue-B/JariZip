import { test, expect } from '@playwright/test';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`optional guide has no decorative motion and remains keyboard-usable with ${reducedMotion}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: reducedMotion === 'reduce' ? 360 : 1440, height: 900 });
    await page.goto('/#/about');
    await expect(page.locator('.lz-hero, .lz-mascot-breathe, .lz-orbit, .lz-motion-toggle')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
    const summary = page.locator('.lz-source-note summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.lz-source-note')).toHaveAttribute('open', '');
    await expect(page.locator('.lz-source-note')).toContainText('규칙으로 구성');
    await expect(page.locator('.lz-storage')).toContainText('자동 동기화가 없으므로');
    const route = page.url();
    await page.locator('.lz-skip').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#lz-main')).toBeFocused();
    await expect(page).toHaveURL(route);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`guide-${reducedMotion}.png`), fullPage: true, animations: 'disabled' });
  });
}
