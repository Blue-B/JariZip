import { test, expect } from '@playwright/test';

const sources = [
  { id: 'wanted', name: '원티드', enabled: true, note: '공개 공고 조회' },
  { id: 'saramin', name: '사람인', enabled: false, note: '서버 API 키 설정 필요' },
];

test('settings separate source configuration from a real query and never seed examples', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources } }));
  await page.route('**/api/jobs?**', route => {
    requests++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get('source')).toBe('wanted');
    expect(url.searchParams.get('refresh')).toBe('1');
    expect(url.searchParams.get('q')).toBe('');
    return route.fulfill({ json: { jobs: [], nextPage: null, warnings: [], cached: false, checkedAt: new Date().toISOString() } });
  });
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: '가상 예시로 다시 보기', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '사람인 공고 조회 확인', exact: true })).toBeDisabled();
  await expect(page.locator('.connection-list')).toContainText('출처 응답은 아래 버튼으로 확인');
  expect(requests).toBe(0);
  await page.getByRole('button', { name: '원티드 공고 조회 확인', exact: true }).click();
  await expect(page.locator('.connection-result')).toContainText('조회 응답 확인');
  await expect(page.locator('.connection-result')).toContainText('공고 0건');
  expect(requests).toBe(1);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.connection-result')).toHaveCount(0);
  expect(requests).toBe(1);
  await page.goto('/#/app/jobs');
  await expect(page.locator('.job-list-card')).toHaveCount(0);
});

test('failed source checks show the upstream error instead of an available badge', async ({ page }) => {
  await page.route('**/api/sources', route => route.fulfill({ json: { sources } }));
  await page.route('**/api/jobs?**', route => route.fulfill({ status: 503, json: { error: { message: '시험용 출처 접근 제한' } } }));
  await page.goto('/#/app/settings');
  await page.getByRole('button', { name: '원티드 공고 조회 확인', exact: true }).click();
  await expect(page.locator('.connection-result[role="alert"]')).toHaveText('시험용 출처 접근 제한');
  await expect(page.locator('.result-ready')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '원티드 공고 조회 확인', exact: true })).toBeEnabled();
});

test('missing API is recoverable and connection controls fit a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  let available = false;
  await page.route('**/api/sources', route => available
    ? route.fulfill({ json: { sources } })
    : route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Static preview</html>' }));
  await page.goto('/#/app/settings');
  await expect(page.locator('.connection-error')).toContainText('정적 미리보기');
  available = true;
  await page.getByRole('button', { name: '서버 다시 확인', exact: true }).click();
  await expect(page.locator('.connection-row')).toHaveCount(2);
  await expect(page.locator('.connection-error')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
