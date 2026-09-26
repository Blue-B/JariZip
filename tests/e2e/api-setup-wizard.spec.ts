import { test, expect, type Page } from '@playwright/test';

/* First-run desktop API connection wizard.
 *
 * The Electron preload contract is injected as a fake bridge before any app
 * code runs. Job APIs are mocked at the network layer. No real key is ever
 * used and no external site is contacted.
 */

interface FakeBridgeOptions {
  work24?: boolean;
  saramin?: boolean;
  /** Fail the first setApiKey call with this message (once). */
  failSaveOnce?: string;
}

async function injectBridge(page: Page, options: FakeBridgeOptions = {}) {
  const { work24 = false, saramin = false, failSaveOnce } = options;
  await page.addInitScript(({ initial, failSave }) => {
    const status = { work24: initial.work24, saramin: initial.saramin };
    const calls: Array<{ method: string; provider?: string; url?: string; keyLength?: number }> = [];
    const keyValues: string[] = [];
    let failed = false;
    (window as unknown as { __jarizipBridgeCalls: typeof calls }).__jarizipBridgeCalls = calls;
    (window as unknown as { __jarizipKeyValuesSeen: string[] }).__jarizipKeyValuesSeen = keyValues;
    (window as unknown as { jarizipDesktop: unknown }).jarizipDesktop = {
      getInfo: async () => { calls.push({ method: 'getInfo' }); return { platform: 'win32', version: '0.1.0-test' }; },
      getApiKeyStatus: async () => { calls.push({ method: 'getApiKeyStatus' }); return { work24: status.work24, saramin: status.saramin }; },
      setApiKey: async (provider: 'work24' | 'saramin', key: string) => {
        calls.push({ method: 'setApiKey', provider, keyLength: key.length });
        keyValues.push(key);
        if (failSave && !failed) { failed = true; return { ok: false, message: failSave }; }
        status[provider] = true;
        return { ok: true };
      },
      clearApiKey: async (provider: 'work24' | 'saramin') => {
        calls.push({ method: 'clearApiKey', provider });
        status[provider] = false;
        return { ok: true };
      },
      openExternal: async (url: string) => { calls.push({ method: 'openExternal', url }); },
      __readStatus: () => ({ ...status }),
    };
  }, { initial: { work24, saramin }, failSave: failSaveOnce ?? null });
}

async function mockJobApi(page: Page, options: { failProbe?: string } = {}) {
  const { failProbe } = options;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [
    { id: 'work24', name: '고용24', enabled: true, note: '고용24 공식 Open API 인증키 설정됨' },
    { id: 'saramin', name: '사람인', enabled: true, note: '공식 API 연결 설정됨' },
    { id: 'wanted', name: '원티드', enabled: false, note: '제공사 사전 승인 없음' },
  ] } }));
  await page.route('**/api/jobs?**', route => {
    const url = new URL(route.request().url());
    if (failProbe && url.searchParams.get('refresh') === '1') {
      const id = url.searchParams.get('source') === 'saramin' ? 'saramin' : 'work24';
      return route.fulfill({ json: { jobs: [], nextPage: null, checkedAt: new Date().toISOString(), warnings: [], cached: false, sourceResults: [{ id, name: id, count: 0, status: 'error', message: failProbe }] } });
    }
    return route.fulfill({ json: { jobs: [], nextPage: null, checkedAt: new Date().toISOString(), warnings: [], cached: false, sourceResults: [] } });
  });
}

/** Stable root regardless of the stage-dependent dialog accessible name. */
const wizard = (page: Page) => page.getByTestId('api-setup-wizard');
const confirm = (page: Page) => page.getByRole('dialog', { name: /연결을 해제할까요/ });

test('first run with no configured source auto-opens the Korean wizard and explains on-device storage', async ({ page }) => {
  await injectBridge(page);
  await mockJobApi(page);
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  const panel = wizard(page);
  await expect(panel).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-labelledby', /.+/);
  await expect(panel).toContainText('입력한 키와 내 자료는 이 기기에만 저장돼요');
  await expect(panel).toContainText('서류·메모·녹음은 채용 사이트로 보내지 않아요');
  await expect(panel.getByRole('heading', { name: /고용24/ })).toBeVisible();
  await expect(panel.getByRole('heading', { name: /사람인/ })).toBeVisible();
  await expect(panel.locator('.api-setup-choice.is-recommended')).toContainText('고용24');
  await expect(panel.locator('.api-setup-choice.is-recommended')).toContainText('추천');
  await expect(panel.getByRole('button', { name: '나중에 하기', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '공고 직접 추가하기', exact: true })).toBeVisible();
});

test('no wizard without the desktop bridge, and SourceConnections keeps .env.local guidance', async ({ page }) => {
  await mockJobApi(page);
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '연결 설정', exact: true })).toHaveCount(0);
  await expect(page.locator('.connection-intro').first()).toContainText('.env.local');
  await expect(page.locator('.connection-footnote')).toContainText('SARAMIN_ACCESS_KEY');
});

test('wizard stays closed when an approved source is already configured', async ({ page }) => {
  await injectBridge(page, { work24: true });
  await mockJobApi(page);
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('wizard stays closed on a later run after Skip was chosen once', async ({ page }) => {
  await injectBridge(page);
  await mockJobApi(page);
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  await wizard(page).getByRole('button', { name: '나중에 하기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('key issuance buttons open only the official https pages through the bridge', async ({ page }) => {
  await injectBridge(page);
  await mockJobApi(page);
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  const panel = wizard(page);
  await panel.getByRole('button', { name: /고용24 연결하기/ }).click();
  await panel.getByRole('button', { name: '고용24 Open API 안내 열기', exact: true }).click();
  const opened = await page.evaluate(() => (window as unknown as { __jarizipBridgeCalls: Array<{ method: string; url?: string }> }).__jarizipBridgeCalls.filter(call => call.method === 'openExternal').map(call => call.url));
  expect(opened).toEqual(['https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do']);
  expect(opened.every(url => url?.startsWith('https://'))).toBe(true);
  await panel.getByRole('button', { name: '← 출처 다시 고르기' }).click();
  await panel.getByRole('button', { name: /사람인 연결하기/ }).click();
  await panel.getByRole('button', { name: '사람인 API 안내 열기', exact: true }).click();
  const after = await page.evaluate(() => (window as unknown as { __jarizipBridgeCalls: Array<{ method: string; url?: string }> }).__jarizipBridgeCalls.filter(call => call.method === 'openExternal').map(call => call.url));
  expect(after).toEqual(['https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do', 'https://oapi.saramin.co.kr/guide/info']);
});

test('key input is password-style with an optional show toggle and never reaches browser storage', async ({ page }) => {
  await injectBridge(page);
  let sourcesCalls = 0;
  let probeCalls = 0;
  await page.route('**/api/sources', route => { sourcesCalls++; return route.fulfill({ json: { sources: [
    { id: 'work24', name: '고용24', enabled: true, note: '고용24 공식 Open API 인증키 설정됨' },
    { id: 'saramin', name: '사람인', enabled: false, note: 'API 키 필요' },
  ] } }); });
  await page.route('**/api/jobs?**', route => {
    probeCalls++;
    const url = new URL(route.request().url());
    if (url.searchParams.get('refresh') === '1') {
      expect(url.searchParams.get('source')).toBe('work24');
    }
    return route.fulfill({ json: { jobs: [], nextPage: null, checkedAt: new Date().toISOString(), warnings: [], cached: false, sourceResults: [] } });
  });
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  const panel = wizard(page);
  await panel.getByRole('button', { name: /고용24 연결하기/ }).click();
  const input = panel.getByLabel('고용24 API 키', { exact: true });
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill('test-only-work24-auth-key-0001');
  await panel.getByRole('button', { name: '키 보기', exact: true }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await panel.getByRole('button', { name: '키 가리기', exact: true }).click();
  await expect(input).toHaveAttribute('type', 'password');
  await panel.getByRole('button', { name: '저장하고 연결 확인', exact: true }).click();
  await expect(panel).toContainText('연결을 확인했어요');
  expect(sourcesCalls).toBeGreaterThanOrEqual(1);
  expect(probeCalls).toBeGreaterThanOrEqual(1);
  const seen = await page.evaluate(() => ({
    keyValues: (window as unknown as { __jarizipKeyValuesSeen: string[] }).__jarizipKeyValuesSeen,
    saves: (window as unknown as { __jarizipBridgeCalls: Array<{ method: string }> }).__jarizipBridgeCalls.filter(call => call.method === 'setApiKey').length,
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(seen.keyValues).toEqual(['test-only-work24-auth-key-0001']);
  expect(seen.saves).toBe(1);
  expect(JSON.stringify(seen.local)).not.toContain('test-only-work24-auth-key-0001');
  expect(JSON.stringify(seen.session)).not.toContain('test-only-work24-auth-key-0001');
  await expect(page.locator('input[value="test-only-work24-auth-key-0001"]')).toHaveCount(0);
});

test('saving a key then performs a real fetchSources + probeSource check and reports the live result', async ({ page }) => {
  await injectBridge(page);
  let probes = 0;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [
    { id: 'work24', name: '고용24', enabled: true, note: '고용24 공식 Open API 인증키 설정됨' },
    { id: 'saramin', name: '사람인', enabled: false, note: 'API 키 필요' },
  ] } }));
  await page.route('**/api/jobs?**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('refresh') === '1') {
      probes++;
      expect(url.searchParams.get('source')).toBe('work24');
    }
    return route.fulfill({ json: { jobs: [], nextPage: null, checkedAt: new Date().toISOString(), warnings: [], cached: false, sourceResults: [{ id: 'work24', name: '고용24', count: 0, status: 'ok', exhausted: true }] } });
  });
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  const panel = wizard(page);
  await panel.getByRole('button', { name: /고용24 연결하기/ }).click();
  await panel.getByLabel('고용24 API 키', { exact: true }).fill('probe-test-key');
  await panel.getByRole('button', { name: '저장하고 연결 확인', exact: true }).click();
  await expect(panel).toContainText('연결을 확인했어요');
  await expect(panel).toContainText('접수 중 공고 0건');
  expect(probes).toBe(1);
});

test('a failed connection check is disclosed honestly instead of claiming success', async ({ page }) => {
  await injectBridge(page);
  await mockJobApi(page, { failProbe: '시험용 고용24 조회 제한' });
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  const panel = wizard(page);
  await panel.getByRole('button', { name: /고용24 연결하기/ }).click();
  await panel.getByLabel('고용24 API 키', { exact: true }).fill('bad-test-key');
  await panel.getByRole('button', { name: '저장하고 연결 확인', exact: true }).click();
  await expect(panel.locator('.api-setup-error')).toContainText('시험용 고용24 조회 제한');
  await expect(panel).not.toContainText('연결을 확인했어요');
  // The key was saved, so the retry does not ask the user to paste it again.
  await expect(panel.locator('.api-setup-saved-note')).toBeVisible();
  await expect(panel.getByRole('button', { name: '연결 다시 확인', exact: true })).toBeVisible();
});

test('a failed bridge save never claims the key was stored', async ({ page }) => {
  await injectBridge(page, { failSaveOnce: '디스크 암호화를 사용할 수 없어요.' });
  await mockJobApi(page);
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  const panel = wizard(page);
  await panel.getByRole('button', { name: /사람인 연결하기/ }).click();
  await panel.getByLabel('사람인 API 키', { exact: true }).fill('save-fail-key');
  await panel.getByRole('button', { name: '저장하고 연결 확인', exact: true }).click();
  await expect(panel.locator('.api-setup-error')).toContainText('디스크 암호화를 사용할 수 없어요.');
  await expect(panel).not.toContainText('연결을 확인했어요');
});

test('Skip allows manual job entry while keeping a 연결 설정 entry in Settings', async ({ page }) => {
  await injectBridge(page);
  await mockJobApi(page);
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  await wizard(page).getByRole('button', { name: '공고 직접 추가하기', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/jobs\?new=1/);
  await expect(page.getByRole('dialog', { name: '좋은 공고, 여기 모아두기' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  const entry = page.locator('.connection-desktop-entry');
  await expect(entry).toContainText('연결 설정');
  await entry.getByRole('button', { name: '연결 설정', exact: true }).click();
  await expect(wizard(page)).toBeVisible();
  // Nothing is connected yet, so the reopened wizard offers the two providers.
  await expect(wizard(page)).toContainText('고용24');
  await expect(wizard(page)).toContainText('사람인');
});

test('reopened Settings wizard can connect and later disconnect a stored key', async ({ page }) => {
  await injectBridge(page, { work24: true });
  await mockJobApi(page);
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  await page.locator('.connection-desktop-entry').getByRole('button', { name: '연결 설정', exact: true }).click();
  const panel = wizard(page);
  await expect(panel.locator('.api-setup-status')).toContainText('고용24');
  await expect(panel.locator('.api-setup-status')).toContainText('연결됨');
  await panel.getByRole('button', { name: '연결 해제', exact: true }).click();
  await confirm(page).getByRole('button', { name: '연결 해제', exact: true }).click();
  await expect(panel.locator('.api-setup-status')).toContainText('미연결');
  const status = await page.evaluate(() => (window as unknown as { jarizipDesktop: { __readStatus(): { work24: boolean } } }).jarizipDesktop.__readStatus());
  expect(status.work24).toBe(false);
});

test('the wizard is keyboard-operable and closes on Escape', async ({ page }) => {
  await injectBridge(page);
  await mockJobApi(page);
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  const panel = wizard(page);
  await panel.getByRole('button', { name: /고용24 연결하기/ }).focus();
  await page.keyboard.press('Enter');
  const input = panel.getByLabel('고용24 API 키', { exact: true });
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('wizard panel fits a narrow mobile screen without horizontal overflow', async ({ page }) => {
  await injectBridge(page);
  await mockJobApi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/app/discover', { waitUntil: 'networkidle' });
  await expect(wizard(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await wizard(page).getByRole('button', { name: /고용24 연결하기/ }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
