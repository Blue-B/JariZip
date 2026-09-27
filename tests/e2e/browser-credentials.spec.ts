import { test, expect, type Page } from '@playwright/test';

/* Browser/local-server API key management.
 *
 * Every credential endpoint is mocked at the network layer and every key is
 * synthetic. No real key is typed, no `.env.local` is touched and no external
 * site is contacted. The desktop-bridge spec keeps its own coverage.
 *
 * In browser mode there is exactly one row per source. The work24/saramin row
 * carries its own inline key controls, so there is no separate key panel that
 * would duplicate the source list.
 */

const WORK24_KEY = 'test-only-work24-key-0001';

interface CredentialMock {
  status: { work24: boolean; saramin: boolean };
  puts: Array<{ provider: string; key: string }>;
  deletes: string[];
}

async function mockCredentials(page: Page, initial: { work24?: boolean; saramin?: boolean } = {}, options: { failPut?: string; failProbe?: string } = {}) {
  const state = { work24: Boolean(initial.work24), saramin: Boolean(initial.saramin) };
  const mock: CredentialMock = { status: state, puts: [], deletes: [] };
  await page.route('**/api/credentials**', async route => {
    const request = route.request();
    const provider = new URL(request.url()).pathname.split('/').pop() ?? '';
    if (request.method() === 'GET') {
      return route.fulfill({ json: { providers: [
        { provider: 'work24', configured: state.work24 },
        { provider: 'saramin', configured: state.saramin },
      ] } });
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { key?: string };
      mock.puts.push({ provider, key: String(body?.key ?? '') });
      if (options.failPut) return route.fulfill({ status: 400, json: { error: { code: 'BAD_KEY', message: options.failPut } } });
      state[provider as 'work24' | 'saramin'] = true;
      return route.fulfill({ json: { provider, configured: true, providers: [
        { provider: 'work24', configured: state.work24 },
        { provider: 'saramin', configured: state.saramin },
      ] } });
    }
    mock.deletes.push(provider);
    state[provider as 'work24' | 'saramin'] = false;
    return route.fulfill({ json: { provider, configured: false, providers: [
      { provider: 'work24', configured: state.work24 },
      { provider: 'saramin', configured: state.saramin },
    ] } });
  });
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [
    { id: 'work24', name: '고용24', enabled: state.work24, note: state.work24 ? '고용24 공식 Open API 인증키 설정됨' : '고용24 공식 Open API · 키 필요' },
    { id: 'saramin', name: '사람인', enabled: state.saramin, note: '공식 API · 키 필요' },
    { id: 'wanted', name: '원티드', enabled: false, note: '제공사 사전 승인 없음' },
  ] } }));
  await page.route('**/api/jobs?**', route => {
    const url = new URL(route.request().url());
    const source = url.searchParams.get('source') ?? 'work24';
    if (options.failProbe && url.searchParams.get('refresh') === '1') {
      return route.fulfill({ json: { jobs: [], nextPage: null, checkedAt: new Date().toISOString(), warnings: [], cached: false, sourceResults: [{ id: source, name: source, count: 0, status: 'error', message: options.failProbe }] } });
    }
    return route.fulfill({ json: { jobs: [], nextPage: null, checkedAt: new Date().toISOString(), warnings: [], cached: false, sourceResults: [{ id: source, name: source, count: 0, status: 'ok', exhausted: true }] } });
  });
  return mock;
}

const sourceRow = (page: Page, name: string) => page.locator('.connection-row').filter({ hasText: name });
const controls = (page: Page, name: string) => sourceRow(page, name).getByTestId('browser-key-controls');
const clearDialog = (page: Page) => page.getByRole('dialog', { name: /키를 삭제할까요/ });

test('browser mode renders exactly one row per source with no duplicate key panel', async ({ page }) => {
  await mockCredentials(page);
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  await expect(page.locator('.connection-row')).toHaveCount(3);
  await expect(page.getByTestId('browser-key-controls')).toHaveCount(2);
  // The old standalone key panel must be gone.
  await expect(page.getByTestId('browser-api-keys')).toHaveCount(0);
  await expect(page.locator('.browser-key-row')).toHaveCount(0);
  // Only one element per provider name in the connection list.
  await expect(sourceRow(page, '고용24')).toHaveCount(1);
  await expect(sourceRow(page, '사람인')).toHaveCount(1);
});

test('browser mode lets a user set a key inline without editing .env.local', async ({ page }) => {
  const mock = await mockCredentials(page);
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });

  const row = sourceRow(page, '고용24');
  await expect(row).toContainText('미설정');
  await expect(page.locator('.connection-footnote-storage')).toContainText('.env.local');
  await row.getByRole('button', { name: '키 설정', exact: true }).click();

  const input = row.getByLabel('고용24 API 키', { exact: true });
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill(WORK24_KEY);
  await row.getByRole('button', { name: '키 보기', exact: true }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await row.getByRole('button', { name: '키 가리기', exact: true }).click();
  await expect(input).toHaveAttribute('type', 'password');
  // Official guide link is a normal same-page https link, never an automated call.
  await expect(row.getByRole('link', { name: '고용24 API 안내 열기' })).toHaveAttribute('href', 'https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do');

  await row.getByRole('button', { name: '설정하고 조회 확인', exact: true }).click();
  await expect(row).toContainText('설정됨');
  await expect(row.locator('.connection-result')).toContainText('조회 응답 확인');
  expect(mock.puts).toEqual([{ provider: 'work24', key: WORK24_KEY }]);
  // The typed key is dropped from the form and never persisted to browser storage.
  await expect(page.locator(`input[value="${WORK24_KEY}"]`)).toHaveCount(0);
  const stored = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(JSON.stringify(stored)).not.toContain(WORK24_KEY);
});

test('a saved key immediately enables the same source row and performs a real probe, without a restart', async ({ page }) => {
  const mock = await mockCredentials(page);
  let probeSource: string | null = null;
  await page.route('**/api/jobs?**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('refresh') === '1') probeSource = url.searchParams.get('source');
    const source = url.searchParams.get('source') ?? 'work24';
    return route.fulfill({ json: { jobs: [], nextPage: null, checkedAt: new Date().toISOString(), warnings: [], cached: false, sourceResults: [{ id: source, name: source, count: 0, status: 'ok', exhausted: true }] } });
  });
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  const row = sourceRow(page, '고용24');
  await expect(row.getByRole('button', { name: '고용24 공고 조회 확인', exact: true })).toBeDisabled();

  await row.getByRole('button', { name: '키 설정', exact: true }).click();
  await row.getByLabel('고용24 API 키', { exact: true }).fill(WORK24_KEY);
  await row.getByRole('button', { name: '설정하고 조회 확인', exact: true }).click();
  await expect(row.locator('.connection-result')).toContainText('접수 중 공고 0건');
  expect(probeSource).toBe('work24');
  // The very same source row is now enabled and probeable.
  await expect(row.getByRole('button', { name: '고용24 공고 조회 확인', exact: true })).toBeEnabled();
  expect(mock.status.work24).toBe(true);
});

test('a configured key offers change and delete instead of set', async ({ page }) => {
  await mockCredentials(page, { work24: true });
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  const row = sourceRow(page, '고용24');
  await expect(row).toContainText('설정됨');
  await expect(row.getByRole('button', { name: '키 설정', exact: true })).toHaveCount(0);
  await expect(row.getByRole('button', { name: '키 변경', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: '키 삭제', exact: true })).toBeVisible();
});

test('clearing a key asks for confirmation and removes it', async ({ page }) => {
  const mock = await mockCredentials(page, { work24: true });
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  const row = sourceRow(page, '고용24');
  await expect(row).toContainText('설정됨');
  await row.getByRole('button', { name: '키 삭제', exact: true }).click();
  const dialog = clearDialog(page);
  await expect(dialog).toContainText('.env.local');
  await dialog.getByRole('button', { name: '키 삭제', exact: true }).click();
  await expect(row).toContainText('미설정');
  await expect(row.getByRole('button', { name: '키 삭제', exact: true })).toHaveCount(0);
  await expect(row.getByRole('button', { name: '키 설정', exact: true })).toBeVisible();
  expect(mock.deletes).toContain('work24');
  expect(mock.status.work24).toBe(false);
});

test('a failed server save is disclosed instead of claiming the key was stored', async ({ page }) => {
  await mockCredentials(page, {}, { failPut: 'API 키에 사용할 수 없는 문자가 있어요.' });
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  const row = sourceRow(page, '고용24');
  await row.getByRole('button', { name: '키 설정', exact: true }).click();
  await row.getByLabel('고용24 API 키', { exact: true }).fill(WORK24_KEY);
  await row.getByRole('button', { name: '설정하고 조회 확인', exact: true }).click();
  await expect(row.locator('.api-setup-error')).toContainText('사용할 수 없는 문자');
  await expect(row).toContainText('미설정');
});

test('a failed live probe after a successful save is reported honestly', async ({ page }) => {
  await mockCredentials(page, {}, { failProbe: '시험용 고용24 조회 제한' });
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  const row = sourceRow(page, '고용24');
  await row.getByRole('button', { name: '키 설정', exact: true }).click();
  await row.getByLabel('고용24 API 키', { exact: true }).fill(WORK24_KEY);
  await row.getByRole('button', { name: '설정하고 조회 확인', exact: true }).click();
  await expect(row).toContainText('설정됨');
  await expect(row.locator('.connection-result[role="alert"]')).toContainText('시험용 고용24 조회 제한');
});

test('unapproved sources are clearly badged and never offer a key input', async ({ page }) => {
  await mockCredentials(page);
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  const wanted = sourceRow(page, '원티드');
  await expect(wanted.locator('.tag')).toContainText('자동조회 미지원');
  await expect(wanted).toContainText('API 키가 필요 없는 출처라는 뜻이 아니에요');
  await expect(wanted.getByTestId('browser-key-controls')).toHaveCount(0);
  await expect(wanted.getByRole('button', { name: /키 설정|키 변경|키 삭제/ })).toHaveCount(0);
});

test('the browser key controls never appear when the desktop bridge is present', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { jarizipDesktop: unknown }).jarizipDesktop = {
      getInfo: async () => ({ platform: 'win32', version: '0.1.0-test' }),
      getApiKeyStatus: async () => ({ work24: true, saramin: false }),
      setApiKey: async () => ({ ok: true }),
      clearApiKey: async () => ({ ok: true }),
      openExternal: async () => undefined,
    };
  });
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [{ id: 'work24', name: '고용24', enabled: true, note: '설정됨' }] } }));
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('browser-key-controls')).toHaveCount(0);
  await expect(page.locator('.connection-desktop-entry')).toContainText('연결 설정');
});

test('the unified source list fits a narrow screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockCredentials(page);
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  await expect(controls(page, '고용24')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await sourceRow(page, '고용24').getByRole('button', { name: '키 설정', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
