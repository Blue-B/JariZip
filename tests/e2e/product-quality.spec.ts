import { test, expect, type Page } from './fixtures';

async function open(page: Page, path = '/app') {
  await page.goto(`/#${path}`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1').first()).toBeVisible();
  if (path.startsWith('/app')) await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.evaluate(() => document.fonts.ready);
}

async function fillJob(page: Page, url: string) {
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="company"]').fill('제품검증용 가상회사');
  await dialog.locator('[name="title"]').fill('테스트 전용 API 개발자');
  await dialog.locator('[name="url"]').fill(url);
  await dialog.locator('[name="location"]').fill('서울');
  await dialog.locator('[name="employment"]').selectOption('정규직');
  await dialog.locator('[name="skills"]').fill('Python, FastAPI');
  await dialog.locator('[name="description"]').fill('실제 채용이 아닌 테스트 자료입니다. API 개발 및 데이터 처리 경험을 검증합니다.');
}

test('local character artwork decodes and every screen remains readable at desktop and mobile sizes', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [name, route] of [
    ['landing', '/'], ['dashboard', '/app'], ['jobs', '/app/jobs'],
    ['applications', '/app/applications'], ['documents', '/app/documents'],
    ['interview', '/app/interview'], ['companies', '/app/companies'],
    ['templates', '/app/templates'], ['settings', '/app/settings'],
  ]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page, route);
    const art = page.locator('img.jippi-art').first();
    await expect(art).toBeVisible();
    await expect.poll(() => art.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    expect(await art.evaluate((el: HTMLImageElement) => new URL(el.currentSrc).origin === location.origin)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (name === 'jobs') {
      expect(await page.locator('.job-list-card').evaluateAll(cards => cards.every(card => card.scrollHeight <= card.clientHeight + 1))).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`${name}-desktop.png`), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${name}-mobile.png`), animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});

test('dashboard shortcuts open real editors and the weekly schedule can be navigated', async ({ page }) => {
  await open(page);
  const week = page.locator('.week-grid');
  const initial = await week.getByRole('button').first().getAttribute('aria-label');
  await page.getByRole('button', { name: '다음 주', exact: true }).click();
  await expect(week.getByRole('button').first()).not.toHaveAttribute('aria-label', initial!);
  await page.getByRole('button', { name: '이전 주', exact: true }).click();
  await expect(week.getByRole('button').first()).toHaveAttribute('aria-label', initial!);
  await week.getByRole('button').first().click();
  await expect(week.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '이번 주', exact: true }).click();
  await expect(page.locator('.week-day.is-today')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.quick-action-grid').getByRole('link', { name: '공고 추가', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('[name="company"]')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
  await expect(page).not.toHaveURL(/new=1/);
  await open(page);
  await page.locator('.quick-action-grid').getByRole('link', { name: '서류 작성', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('textbox', { name: '문서 본문', exact: true })).toBeVisible();
});

test('jobs combine query terms and prevent duplicate imports with tracking links', async ({ page }) => {
  await open(page, '/app/jobs?new=1');
  await fillJob(page, 'https://example.com/jobs?id=product-quality&utm_source=mail');
  await page.getByRole('dialog').getByRole('button', { name: '공고 보관하기', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill('제품검증용 python 서울 정규직');
  await expect(page.locator('.job-list-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: '고용 형태', exact: true }).selectOption('정규직');
  await expect(page.locator('.job-list-card')).toHaveCount(1);
  await page.getByRole('button', { name: '공고 직접 추가', exact: true }).click();
  await fillJob(page, 'https://example.com/jobs?id=product-quality&utm_source=other#apply');
  await page.getByRole('dialog').getByRole('button', { name: '공고 보관하기', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('이미 보관');
  await expect(page.locator('.job-list-card')).toHaveCount(1);
});

test('failed database writes never display a successful save confirmation', async ({ page }) => {
  await open(page, '/app/jobs?new=1');
  const initialCount = await page.locator('.job-list-card').count();
  await fillJob(page, 'https://example.com/jobs?id=quota-failure-test');
  await page.evaluate(() => {
    const captured: string[] = [];
    (window as unknown as { capturedToasts: string[] }).capturedToasts = captured;
    new MutationObserver(() => {
      const text = document.querySelector('.toast')?.textContent?.trim();
      if (text && captured.at(-1) !== text) captured.push(text);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
    IDBObjectStore.prototype.put = function () { throw new DOMException('Test quota exhausted', 'QuotaExceededError'); };
  });
  await page.getByRole('dialog').getByRole('button', { name: '공고 보관하기', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('저장 오류');
  await expect(page.locator('.toast')).toContainText('저장하지 못했습니다');
  const messages = await page.evaluate(() => (window as unknown as { capturedToasts: string[] }).capturedToasts);
  expect(messages.some(text => /공고 원문을 보관했어요|저장했어요/.test(text))).toBe(false);
  await expect(page.locator('.job-list-card')).toHaveCount(initialCount + 1);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await expect(page.locator('.job-list-card')).toHaveCount(initialCount);
});

test('mobile navigation and the skip link keep the current route intact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
  await page.locator('.mobile-bottom-nav').getByRole('link', { name: '면접 연습', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/interview$/);
  await page.getByRole('button', { name: '전체 메뉴 열기', exact: true }).click();
  await expect(page.locator('.workspace-body')).toHaveAttribute('inert', '');
  await expect(page.locator('.sidebar')).not.toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
  await expect(page.locator('.workspace-body')).not.toHaveAttribute('inert', '');
  const url = page.url();
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(url);
  await expect(page.locator('#main-content')).toBeFocused();
});
