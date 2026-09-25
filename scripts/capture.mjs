import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.JARIZIP_BASE_URL || 'http://127.0.0.1:4178';
const output = resolve(process.env.JARIZIP_CAPTURE_DIR || '.local/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, locale: 'ko-KR', reducedMotion: 'reduce', timezoneId: 'Asia/Seoul' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const [name, route] of [['landing', ''], ['dashboard', '/app'], ['jobs', '/app/jobs'], ['applications', '/app/applications'], ['documents', '/app/documents'], ['interview', '/app/interview'], ['companies', '/app/companies'], ['templates', '/app/templates'], ['settings', '/app/settings']]) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (route.startsWith('/app')) await page.waitForFunction(() => document.querySelector('.save-status')?.textContent === '저장됨');
    if (name === 'landing') await page.screenshot({ path: `${output}/landing-hero.png`, animations: 'disabled' });
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: name === 'landing', animations: 'disabled' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(`${name}: ${overflow ? 'OVERFLOW' : 'within viewport'} ${output}/${name}.png`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, route] of [['landing-mobile', ''], ['dashboard-mobile', '/app'], ['jobs-mobile', '/app/jobs'], ['interview-mobile', '/app/interview']]) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor();
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(`${name}: ${overflow ? 'OVERFLOW' : 'within viewport'} ${output}/${name}.png`);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
} finally { await context.close(); await browser.close(); }
