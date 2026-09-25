import { test, expect, type Page } from './fixtures';

async function open(page: Page, path: string) {
  await page.goto(`/#${path}`, { waitUntil: 'networkidle' });
  await expect(page.locator('.save-status')).toHaveText('저장됨');
}

const company = '수정검증용 가상기업';
const original = '이 내용은 테스트 전용 공고 원문입니다. Python API 개발과 데이터 처리 업무를 맡습니다.';
const edited = '변경된 테스트 전용 공고입니다. Go 서비스와 새로운 저장 구조를 운영합니다.';

async function fillImport(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="company"]').fill(company);
  await dialog.locator('[name="title"]').fill('테스트용 백엔드 개발자');
  await dialog.locator('[name="url"]').fill('https://example.com/jobs/edit-safety');
  await dialog.locator('[name="description"]').fill(original);
  await dialog.locator('[name="skills"]').fill('Python, Python, API');
}

test('editing a saved posting preserves the application snapshot and survives reload', async ({ page }) => {
  await open(page, '/app/jobs?new=1');
  await fillImport(page);
  await page.getByRole('button', { name: '공고 보관하기', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.getByRole('button', { name: '지원 준비하기', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  const applicationURL = page.url();
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await open(page, '/app/jobs');
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill(company);
  await page.getByRole('button', { name: '공고 수정', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '보관한 공고 수정' });
  await expect(editor.locator('[name="description"]')).toHaveValue(original);
  await expect(editor.locator('[name="skills"]')).toHaveValue('Python, API');
  await editor.locator('[name="description"]').fill(edited);
  await editor.locator('[name="publishedAt"]').fill('2026-10-03');
  await editor.locator('[name="deadline"]').fill('2026-10-02');
  await editor.getByRole('button', { name: '수정 내용 저장', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('마감일이 게시일보다 빠를 수 없어요');
  await editor.locator('[name="deadline"]').fill('2026-10-30');
  await editor.getByRole('button', { name: '수정 내용 저장', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await expect(page.locator('.job-detail')).toContainText(edited);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill(company);
  await expect(page.locator('.job-detail')).toContainText(edited);
  await page.goto(applicationURL, { waitUntil: 'networkidle' });
  await page.getByRole('dialog').getByRole('tab', { name: '공고 원문', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(original);
  await expect(page.getByRole('dialog')).not.toContainText(edited);
});

test('document drafts are protected on Escape and can be resumed or deliberately discarded', async ({ page }) => {
  await open(page, '/app/documents?new=1');
  const editor = page.getByRole('dialog', { name: '새 서류 작성' });
  await editor.getByRole('textbox', { name: '제목', exact: true }).fill('보호할 테스트 초안');
  await editor.getByRole('textbox', { name: '문서 본문', exact: true }).fill('아직 저장하지 않은 테스트 문장입니다. 닫기를 눌러도 바로 사라지지 않아야 합니다.');
  await page.keyboard.press('Escape');
  const confirmation = page.getByRole('dialog', { name: '변경 내용을 버릴까요?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: '제목', exact: true })).toHaveValue('보호할 테스트 초안');
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  await confirmation.getByRole('button', { name: '저장하지 않고 닫기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.locator('.documents-page')).not.toContainText('보호할 테스트 초안');
});

test('new posting drafts and whitespace-only names cannot disappear or be saved accidentally', async ({ page }) => {
  await open(page, '/app/jobs?new=1');
  await fillImport(page);
  const editor = page.getByRole('dialog', { name: '좋은 공고, 여기 모아두기' });
  await editor.locator('[name="company"]').fill('   ');
  await editor.getByRole('button', { name: '공고 보관하기', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('공백만 입력할 수는 없어요');
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '변경 내용을 버릴까요?' });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(editor.locator('[name="description"]')).toHaveValue(original);
  await editor.locator('[name="company"]').fill(company);
  await editor.getByRole('button', { name: '공고 보관하기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
});

test('small phones and tablet breakpoints retain visible actions without horizontal page overflow', async ({ page }) => {
  for (const width of [360, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/app', '/app/jobs', '/app/documents']) {
      await page.goto(`/#${route}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const outside = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 12).map(el => ({ class: el.className, right: Math.round(el.getBoundingClientRect().right) })));
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `${width}px ${route}: ${JSON.stringify(outside)}` }).toBe(true);
    }
  }
});
