import { test, expect, type Page, type Download } from '@playwright/test';

async function open(page: Page, path = '/app') {
  await page.goto(`/#${path}`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1').first()).toBeVisible();
  if (path.startsWith('/app')) await expect(page.locator('.save-status')).toHaveText('저장됨');
}
async function emptyWorkspace(page: Page) {
  await open(page, '/app/settings');
  await page.getByRole('button', { name: '비우고 내 자료로 시작', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '비우고 시작', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await expect(page.locator('.backup-summary')).toContainText('0');
}
async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The browser did not create a readable download.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('landing navigation, character reaction and keyboard search work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page, '');
  const mascot = page.getByRole('button', { name: '마스코트 지피와 인사하기', exact: true }).first();
  await expect(mascot).toBeVisible();
  await mascot.click();
  await expect(page.locator('.lz-mascot-bubble').first()).toBeVisible();
  await page.locator('a[href="#/app"]').first().click();
  await expect(page.locator('h1')).toHaveText('나의 다음 자리, 한눈에.');
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox', { name: '내 자료 검색' }).fill('존재하지않는자료987654');
  await expect(page.getByText('일치하는 자료가 없어요')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(errors).toEqual([]);
});

for (const [path, title] of [
  ['/app/jobs', '좋은 자리를 발견하는 곳'],
  ['/app/applications', '모든 지원에, 나만의 흐름'],
  ['/app/documents', '내 이야기가 쌓이는 서랍'],
  ['/app/interview', '내 이야기로, 흔들림 없이'],
  ['/app/companies', '지원할 회사를 더 알아가는 시간'],
  ['/app/templates', '빈 페이지가 막막할 때'],
  ['/app/settings', '내게 맞는 준비 공간'],
]) {
  test(`desktop and mobile route: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, path);
    await expect(page.locator('h1')).toHaveText(title);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: '메뉴 열기', exact: true })).toBeVisible();
    // Viewport media queries can settle after Playwright's resize acknowledgement.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
    await expect(page.locator('.sidebar')).toHaveClass(/is-open/);
    await page.locator('.sidebar').getByRole('button', { name: '메뉴 닫기', exact: true }).click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/is-open/);
    expect(errors).toEqual([]);
  });
}

test('job search, filters, bookmarking and truthful manual status', async ({ page }) => {
  await open(page, '/app/jobs');
  const initial = await page.locator('.job-list-card').count();
  expect(initial).toBeGreaterThan(0);
  await page.getByRole('textbox', { name: '공고 검색' }).fill('검색결과없음_QA');
  await expect(page.locator('.job-list-card')).toHaveCount(0);
  await page.getByRole('button', { name: '필터 초기화', exact: true }).click();
  await expect(page.locator('.job-list-card')).toHaveCount(initial);
  await page.getByRole('combobox', { name: '접수 상태', exact: true }).selectOption('unknown');
  const unknownCards = page.locator('.job-list-card');
  for (let i = 0; i < await unknownCards.count(); i++) await expect(unknownCards.nth(i)).toContainText('미확인');
  await page.getByRole('combobox', { name: '접수 상태', exact: true }).selectOption('all');
  await page.getByRole('button', { name: '공고 직접 추가', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="company"]').fill('검증테스트랩 (가상)');
  await dialog.locator('[name="title"]').fill('가상 Python 개발자');
  await dialog.locator('[name="url"]').fill('https://example.com/jobs/qa-only');
  await dialog.locator('[name="description"]').fill('테스트 전용 가상 공고입니다. Python으로 API를 개발하고 테스트합니다. 실제 채용이 아닙니다.');
  await dialog.getByRole('button', { name: '공고 보관하기', exact: true }).click();
  await expect(page.locator('.job-detail')).toContainText('검증테스트랩 (가상)');
  await expect(page.locator('.job-detail-status')).toContainText('미확인');
  await expect(page.locator('.job-information')).toContainText('게시일미확인');
  await page.locator('.verification-note').getByRole('button', { name: '기록하기', exact: true }).click();
  const verification = page.getByRole('dialog');
  await verification.locator('input[name="verified"][value="open"]').check();
  await verification.getByRole('checkbox').check();
  await verification.getByRole('button', { name: '확인 기록 저장', exact: true }).click();
  await expect(page.locator('.job-detail-status')).toContainText('접수 중 · 직접 확인');
  await page.getByRole('button', { name: '선택 공고 관심 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '선택 공고 관심 저장', exact: true })).not.toHaveClass(/bookmarked/);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: '공고 검색' }).fill('검증테스트랩');
  await expect(page.locator('.job-detail-status')).toContainText('직접 확인');
});

test('exact submitted v1 stays grounded after v2 edit, with answer and backup persistence', async ({ page }) => {
  await emptyWorkspace(page);
  await open(page, '/app/documents');
  await page.getByRole('button', { name: '새 서류 작성', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('제목', { exact: true }).fill('회귀테스트 이력서');
  await dialog.getByRole('textbox', { name: '문서 본문', exact: true }).fill('제출_v1_원본. 저는 가상 프로젝트에서 Python API를 구현했고 요청 처리 시간을 20% 개선했습니다.');
  await dialog.getByRole('button', { name: '내 서류에 저장', exact: true }).click();
  await expect(page.locator('.document-title')).toContainText('회귀테스트 이력서');
  await open(page, '/app/jobs');
  await page.getByRole('button', { name: '공고 직접 추가', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('[name="company"]').fill('제출버전테스트 (가상)');
  await dialog.locator('[name="title"]').fill('가상 백엔드 개발자');
  await dialog.locator('[name="skills"]').fill('Python, SQL');
  await dialog.locator('[name="description"]').fill('원문고정_QA. 가상 회사의 테스트용 채용 공고이며 Python 기반 API를 개발하는 역할입니다.');
  await dialog.getByRole('button', { name: '공고 보관하기', exact: true }).click();
  await page.getByRole('button', { name: '지원 준비하기', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const applicationUrl = page.url();
  await dialog.getByRole('tab', { name: '제출본 보관', exact: true }).click();
  await dialog.locator('.document-picker input[type="checkbox"]').check();
  await dialog.getByRole('checkbox', { name: '실제로 제출한 서류와 버전을 선택했어요.', exact: true }).check();
  await dialog.getByRole('button', { name: '이 버전으로 제출본 확정', exact: true }).click();
  await expect(dialog.locator('.submission-history')).toContainText('v1');
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await open(page, '/app/documents');
  await page.getByRole('button', { name: '회귀테스트 이력서 미리 보기', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '새 버전 편집', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '문서 본문', exact: true }).fill('미제출_v2_새내용. 이 변경 내용은 아직 어느 회사에도 제출하지 않았습니다.');
  await dialog.getByRole('button', { name: '새 버전으로 저장', exact: true }).click();
  await expect(page.locator('.document-title')).toContainText('v2');
  await page.goto(applicationUrl, { waitUntil: 'networkidle' });
  await page.getByRole('dialog').locator('.interview-cta').click();
  await expect(page.locator('.question-source')).toContainText('제출_v1_원본');
  await expect(page.locator('.question-source')).toContainText('v1');
  await expect(page.locator('.question-source')).not.toContainText('미제출_v2_새내용');
  await page.getByRole('textbox', { name: '면접 답변', exact: true }).fill('저는 API 요청이 지연되는 문제의 원인을 분석하고 SQL 쿼리를 개선했습니다. 결과적으로 테스트 처리 시간이 20% 줄었습니다.');
  await page.getByRole('button', { name: '답변 저장', exact: true }).click();
  await page.getByRole('button', { name: /연습 기록/ }).click();
  await expect(page.locator('.practice-history-entry')).toHaveCount(1);
  await expect(page.locator('.history-entry-body')).toContainText('20%');
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /연습 기록/ }).click();
  await expect(page.locator('.practice-history-entry')).toHaveCount(1);
  await open(page, '/app/companies');
  await page.getByRole('textbox', { name: '기업 조사 메모', exact: true }).fill('메모복원_QA. 면접에서 팀 구성을 확인하기.');
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('textbox', { name: '기업 조사 메모', exact: true })).toHaveValue('메모복원_QA. 면접에서 팀 구성을 확인하기.');
  await open(page, '/app/settings');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 백업 내려받기', exact: true }).click();
  const bytes = await downloadBytes(await downloading);
  expect(bytes.toString('utf8')).toContain('제출_v1_원본');
  expect(bytes.toString('utf8')).toContain('미제출_v2_새내용');
  await emptyWorkspace(page);
  await page.locator('input[aria-label="백업 파일 선택"]').setInputFiles({ name: 'qa-workspace.json', mimeType: 'application/json', buffer: bytes });
  await page.getByRole('dialog').getByRole('button', { name: '백업으로 교체', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await open(page, '/app/documents');
  await expect(page.locator('.document-title')).toContainText('v2');
  await open(page, '/app/interview');
  await expect(page.locator('.question-source')).toContainText('제출_v1_원본');
});

test('file originals, duplicate upload versions and malformed backups are safe', async ({ page }) => {
  await emptyWorkspace(page);
  await open(page, '/app/documents');
  const content = '원본파일_QA\n저는 테스트를 위한 가상 경험을 정리합니다. Python API를 개발했습니다.';
  const upload = page.locator('input[aria-label="서류 파일 선택"]');
  await upload.setInputFiles({ name: '원본 테스트.txt', mimeType: 'text/plain', buffer: Buffer.from(content, 'utf8') });
  await expect(page.locator('.document-title')).toContainText('v1');
  await upload.setInputFiles({ name: '원본 테스트.txt', mimeType: 'text/plain', buffer: Buffer.from(content + '\n두 번째 버전', 'utf8') });
  await expect(page.locator('.document-title')).toContainText('v2');
  await page.locator('.document-card-preview').first().click();
  let dialog = page.getByRole('dialog');
  const v1 = await dialog.getByRole('combobox', { name: '문서 버전 선택' }).locator('option').last().getAttribute('value');
  await dialog.getByRole('combobox', { name: '문서 버전 선택' }).selectOption(v1!);
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '원본 받기', exact: true }).click();
  expect((await downloadBytes(await downloading)).toString('utf8')).toBe(content);
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await open(page, '/app/settings');
  await page.locator('input[aria-label="백업 파일 선택"]').setInputFiles({ name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{"__proto__":{"polluted":true}}', 'utf8') });
  await expect(page.locator('.toast')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  expect(await page.evaluate(() => ({} as Record<string, unknown>).polluted)).toBeUndefined();
  await open(page, '/app/documents');
  await expect(page.locator('.document-title')).toContainText('v2');
});

test('nested delete confirmation releases scroll lock and keeps original documents', async ({ page }) => {
  await open(page, '/app/applications');
  const initialCards = await page.locator('.application-card').count();
  await page.locator('.app-card-main').first().click();
  await page.getByRole('dialog').getByRole('button', { name: '기록 삭제', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page.getByRole('dialog', { name: '이 지원 기록을 삭제할까요?' }).getByRole('button', { name: '지원 기록 삭제', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.application-card')).toHaveCount(initialCards - 1);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await open(page, '/app/documents');
  await expect(page.locator('.document-card')).toHaveCount(4);
});

test('synthetic microphone recording is explicit and stored only with answer', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await open(page, '/app/interview');
  const before = await page.getByRole('button', { name: /연습 기록/ }).textContent();
  await page.getByRole('button', { name: '음성으로 연습', exact: true }).click();
  await expect(page.getByRole('button', { name: '녹음 마치기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '녹음 마치기', exact: true }).click();
  await expect(page.locator('.audio-preview audio')).toBeVisible();
  await expect(page.getByRole('button', { name: /연습 기록/ })).toHaveText(before!);
  await page.getByRole('button', { name: '답변 저장', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.getByRole('button', { name: /연습 기록/ }).click();
  await expect(page.locator('.practice-history-entry').first().locator('audio')).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /연습 기록/ }).click();
  await expect(page.locator('.practice-history-entry').first().locator('audio')).toBeVisible();
});
