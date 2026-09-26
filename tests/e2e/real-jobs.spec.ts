import { test, expect } from '@playwright/test';
import { normalizeSaramin } from '../../server/job-sources.mjs';

const raw = {
  id: '900001', position: { title: '시험용 Python 개발자', 'experience-level': { code: 1, min: 0, max: 0, name: '신입' }, 'required-education-level': { name: '학력무관' }, location: { name: '서울' } },
  company: { detail: { name: 'API 시험용 가상기업' } }, 'close-type': { code: '1' },
  'posting-timestamp': '1780000000', 'expiration-timestamp': '1890000000', active: 1,
};

test('a new workspace contains no fabricated jobs, submissions or documents', async ({ page }) => {
  await page.goto('/#/app/jobs', { waitUntil: 'networkidle' });
  await expect(page.locator('.job-list-card')).toHaveCount(0);
  await page.goto('/#/app/documents'); await expect(page.locator('.document-card')).toHaveCount(0);
  await page.goto('/#/app/applications'); await expect(page.locator('.application-card')).toHaveCount(0);
  await page.goto('/#/app'); await expect(page.locator('.dashboard')).toContainText('실제 공고');
  await expect(page.locator('.demo-banner')).toHaveCount(0);
});

test('with no approved source the homepage shows an honest optional-source panel and zero job network', async ({ page }) => {
  let jobRequests = 0;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [
    { id: 'saramin', name: '사람인', enabled: false, note: '키 필요' },
    { id: 'wanted', name: '원티드', enabled: false, note: '승인 없음' },
  ] } }));
  await page.route('**/api/jobs**', route => { jobRequests++; return route.fulfill({ json: { jobs: [], checkedAt: new Date().toISOString(), warnings: [], nextPage: null, cached: false, sourceResults: [] } }); });
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-optional')).toContainText('지금 자동으로 불러오는 공식 출처가 없어요');
  await expect(page.locator('.discover-optional-list a', { hasText: '원티드' })).toHaveAttribute('target', '_blank');
  await expect(page.locator('.discover-error')).toHaveCount(0);
  await expect(page.locator('.discover-job')).toHaveCount(0);
  expect(jobRequests).toBe(0);
});

test('source-backed preparation persists and later source edits do not change submitted snapshots', async ({ page }) => {
  let current = normalizeSaramin(raw, new Date().toISOString());
  let detailCalls = 0;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [{ id: 'saramin', name: '사람인', enabled: true, note: '시험용 공식 연결' }] } }));
  await page.route('**/api/jobs**', route => {
    if (new URL(route.request().url()).pathname === '/api/jobs') return route.fulfill({ json: { jobs: [current], checkedAt: current.verifiedAt, warnings: [], nextPage: null, cached: false } });
    detailCalls++; return route.fulfill({ json: { job: current, checkedAt: current.verifiedAt } });
  });
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(1);
  await page.locator('.discover-job').click();
  await expect(page.getByRole('dialog')).toContainText('사람인 공식 API 제공 요약');
  await page.getByRole('button', { name: '지원 준비하기', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/applications\?application=/);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  const applicationURL = page.url();
  expect(detailCalls).toBeGreaterThanOrEqual(2);
  await page.reload(); await page.getByRole('dialog').getByRole('tab', { name: '공고 원문', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('사람인 공식 API 제공 요약');
  current = { ...current, status: 'closed', description: '나중에 바뀐 시험용 원문', verifiedAt: new Date().toISOString() };
  await page.goto('/#/app/jobs');
  await page.getByRole('button', { name: '출처 다시 조회', exact: true }).click();
  await expect(page.locator('.job-detail')).toContainText(current.description);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.goto(applicationURL); await page.getByRole('dialog').getByRole('tab', { name: '공고 원문', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('사람인 공식 API 제공 요약');
  await expect(page.getByRole('dialog')).not.toContainText(current.description);
});
