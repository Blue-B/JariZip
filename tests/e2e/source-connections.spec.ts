import { test, expect } from '@playwright/test';

const sources = [
  { id: 'saramin', name: '사람인', enabled: true, note: '공식 API 연결 설정됨' },
  { id: 'wanted', name: '원티드', enabled: false, note: '제공사 사전 승인 없이 자동 수집하지 않아요' },
];

test('settings separate official-source configuration from a real query and never seed examples', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources } }));
  await page.route('**/api/jobs?**', route => {
    requests++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get('source')).toBe('saramin');
    expect(url.searchParams.get('refresh')).toBe('1');
    expect(url.searchParams.get('q')).toBe('');
    return route.fulfill({ json: { jobs: [], nextPage: null, warnings: [], cached: false, checkedAt: new Date().toISOString(), sourceResults: [] } });
  });
  await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: '가상 예시로 다시 보기', exact: true })).toHaveCount(0);
  // Unapproved sources are never offered a live check and disclose the manual path instead.
  const wantedProbe = page.getByRole('button', { name: '원티드 공고 조회 확인', exact: true });
  await expect(wantedProbe).toBeDisabled();
  await expect(wantedProbe).toHaveText('조회 대상 아님');
  await expect(page.locator('.connection-row').filter({ hasText: '원티드' })).toContainText('제공사 사전 승인이 없어');
  await expect(page.locator('.connection-footnote')).toContainText('1일 최대 500회');
  expect(requests).toBe(0);
  await page.getByRole('button', { name: '사람인 공고 조회 확인', exact: true }).click();
  await expect(page.locator('.connection-result')).toContainText('조회 응답 확인');
  await expect(page.locator('.connection-result')).toContainText('공고 0건');
  expect(requests).toBe(1);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.connection-result')).toHaveCount(0);
  expect(requests).toBe(1);
  await page.goto('/#/app/jobs');
  await expect(page.locator('.job-list-card')).toHaveCount(0);
});

test('each source exposes a working original-site link for normal outbound navigation', async ({ page }) => {
  await page.route('**/api/sources', route => route.fulfill({ json: { sources } }));
  await page.goto('/#/app/settings');
  const wantedLink = page.getByRole('link', { name: '원티드 원문 사이트 열기', exact: true });
  await expect(wantedLink).toHaveAttribute('href', 'https://www.wanted.co.kr/');
  await expect(wantedLink).toHaveAttribute('target', '_blank');
  await expect(wantedLink).toHaveAttribute('rel', /noopener/);
});

test('failed source checks show the upstream error instead of an available badge', async ({ page }) => {
  await page.route('**/api/sources', route => route.fulfill({ json: { sources } }));
  await page.route('**/api/jobs?**', route => route.fulfill({ status: 503, json: { error: { message: '시험용 출처 접근 제한' } } }));
  await page.goto('/#/app/settings');
  await page.getByRole('button', { name: '사람인 공고 조회 확인', exact: true }).click();
  await expect(page.locator('.connection-result[role="alert"]')).toHaveText('시험용 출처 접근 제한');
  await expect(page.locator('.result-ready')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '사람인 공고 조회 확인', exact: true })).toBeEnabled();
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
