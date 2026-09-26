import { test, expect, type Page } from '@playwright/test';
import { normalizeWork24 } from '../../server/job-sources.mjs';
import { parseXml, childOf } from '../../server/xml.mjs';

// Synthetic Work24 XML only. These tests never use a real 인증키, and no external network is touched.
const checkedAt = '2026-09-26T00:00:00.000Z';
const listXml = (rows: string[]) => `<?xml version='1.0' encoding='UTF-8'?><wantedRoot><total>${rows.length}</total>${rows.join('')}</wantedRoot>`;
const row = (id: string, overrides: Record<string, string> = {}) => {
  const value = {
    wantedAuthNo: id, company: `고용24 가상기업 ${id}`, busno: '0000000000', indTpNm: '시험용 소프트웨어', title: `고용24 시험용 공고 ${id}`,
    salTpNm: '월급', sal: '300만원', region: '서울', holidayTpNm: '주 5일 근무', minEdubg: '학력무관', maxEdubg: '학력무관',
    career: 'N', regDt: '2026-09-01', closeDt: '2099-10-01', infoSvc: 'VALIDATION', basicAddr: '서울 가상구 가상로 1', detailAddr: '3층',
    empTpCd: '10', jobsCd: '024', ...overrides,
  };
  return `<wanted>${Object.entries(value).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</wanted>`;
};
const record = (id: string) => normalizeWork24(childOf(parseXml(listXml([row(id)])), 'wanted'), checkedAt);
const sources = [
  { id: 'saramin', name: '사람인', enabled: false, note: 'API 키 필요' },
  { id: 'work24', name: '고용24', enabled: true, note: '공식 Open API 인증키 설정됨' },
  { id: 'wanted', name: '원티드', enabled: false, note: '제공사 사전 승인 없음' },
];
const records = [record('KJAS002609110001'), record('KJAS002609110002')];

async function mock(page: Page, options: { fail?: boolean } = {}) {
  const { fail = false } = options;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources } }));
  await page.route('**/api/jobs**', route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/jobs') {
      const id = decodeURIComponent(url.pathname.split('/').pop()!);
      return route.fulfill({ json: { job: records.find(job => job.id.endsWith(id)) ?? records[0], checkedAt } });
    }
    if (fail) return route.fulfill({ json: { jobs: [], nextPage: null, checkedAt, warnings: [], cached: false, sourceResults: [{ id: 'work24', name: '고용24', count: 0, status: 'error', message: '시험용 고용24 제한' }] } });
    return route.fulfill({ json: { jobs: records, nextPage: null, checkedAt, warnings: ['고용24 공식 Open API 제공 정보입니다. 전체 본문은 원문 사이트에서 확인해주세요.'], cached: false, sourceResults: [{ id: 'work24', name: '고용24', count: records.length, status: 'ok', exhausted: true }] } });
  });
}

test('the settings screen offers the official 고용24 source and its original site', async ({ page }) => {
  await page.route('**/api/sources', route => route.fulfill({ json: { sources } }));
  await page.goto('/#/app/settings');
  const row = page.locator('.connection-row').filter({ hasText: '고용24' });
  await expect(row).toContainText('공식 Open API');
  await expect(row.getByRole('link', { name: '고용24 원문 사이트 열기', exact: true })).toHaveAttribute('href', 'https://www.work24.go.kr/');
  await expect(page.locator('.connection-footnote')).toContainText('WORK24_AUTH_KEY');
  await expect(page.locator('.connection-footnote')).toContainText('원문 링크와 출처 표시');
});

test('a 고용24 listing shows its source label and opens the official original-site link', async ({ page }) => {
  await mock(page);
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(2);
  await expect(page.locator('.discover-source-label').first()).toHaveText('고용24');
  await page.locator('.discover-job').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('고용24 가상기업 KJAS002609110001');
  await expect(dialog.getByRole('link', { name: '원본 공고', exact: true })).toHaveAttribute('href', /work24\.go\.kr\/.*wantedAuthNo=KJAS002609110001/);
  await expect(dialog.locator('.discover-manual-note')).toHaveCount(0);
  await expect(dialog).toContainText('시험용 공고');
});

test('a failed 고용24 source check is disclosed without fabricating postings', async ({ page }) => {
  await mock(page, { fail: true });
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(0);
  await page.locator('.discover-source-warning summary').click();
  await expect(page.locator('.discover-source-warning')).toContainText('고용24');
  await expect(page.locator('.discover-source-warning')).toContainText('시험용 고용24 제한');
  await expect(page.locator('.discover-error')).toHaveCount(0);
});

test('the 고용24 detail endpoint is re-queried on open so edited content comes from the source', async ({ page }) => {
  await mock(page);
  let detailCalls = 0;
  await page.route('**/api/jobs/work24/**', route => { detailCalls++; return route.fulfill({ json: { job: { ...records[0], description: '출처에서 다시 받은 상세 본문', title: '고용24 상세 최신' }, checkedAt } }); });
  await page.goto('/#/app/discover');
  await page.locator('.discover-job').first().click();
  await expect(page.getByRole('dialog')).toContainText('출처에서 다시 받은 상세 본문');
  expect(detailCalls).toBeGreaterThanOrEqual(1);
});
