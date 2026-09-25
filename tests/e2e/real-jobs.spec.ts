import { test, expect } from '@playwright/test';
import { normalizeWanted } from '../../server/job-sources.mjs';

const raw = { id: 900001, company: { name: 'API 시험용 가상기업' }, position: '시험용 Python 개발자', status: 'active', hidden: false, annual_from: 0, annual_to: 1, address: { location: '서울' }, detail: { intro: '이 문장은 자동시험을 위한 가상 원문이며 실제 공고가 아닙니다.', main_tasks: '시험용 Python API 구현', requirements: '시험용 SQL 활용' } };

test('a new workspace contains no fabricated jobs, submissions or documents', async ({ page }) => {
  await page.goto('/#/app/jobs', { waitUntil: 'networkidle' });
  await expect(page.locator('.job-list-card')).toHaveCount(0);
  await page.goto('/#/app/documents'); await expect(page.locator('.document-card')).toHaveCount(0);
  await page.goto('/#/app/applications'); await expect(page.locator('.application-card')).toHaveCount(0);
  await page.goto('/#/app'); await expect(page.locator('.dashboard')).toContainText('실제 공고');
  await expect(page.locator('.demo-banner')).toHaveCount(0);
});

test('source failures are shown without falling back to example listings', async ({ page }) => {
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [] } }));
  await page.route('**/api/jobs?**', route => route.fulfill({ status: 503, json: { error: { message: '시험용 출처 연결 오류' } } }));
  await page.goto('/#/app/discover');
  await expect(page.getByRole('alert')).toContainText('시험용 출처 연결 오류');
  await expect(page.locator('.discover-job')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('가상 공고로 대신 채우지 않아요');
});

test('source-backed preparation persists and later source edits do not change submitted snapshots', async ({ page }) => {
  let current = normalizeWanted(raw, new Date().toISOString());
  let detailCalls = 0;
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [{ id: 'wanted', name: '원티드', enabled: true, note: '시험용 연결' }] } }));
  await page.route('**/api/jobs**', route => {
    if (new URL(route.request().url()).pathname === '/api/jobs') return route.fulfill({ json: { jobs: [current], checkedAt: current.verifiedAt, warnings: [], nextPage: null, cached: false } });
    detailCalls++; return route.fulfill({ json: { job: current, checkedAt: current.verifiedAt } });
  });
  await page.goto('/#/app/discover');
  await expect(page.locator('.discover-job')).toHaveCount(1);
  await expect(page.locator('.discover-job')).toContainText('게시일 미공개');
  await page.locator('.discover-job').click();
  await expect(page.getByRole('dialog')).toContainText(raw.detail.intro);
  await page.getByRole('button', { name: '지원 준비하기', exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/applications\?application=/);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  const applicationURL = page.url();
  expect(detailCalls).toBeGreaterThanOrEqual(2);
  await page.reload(); await page.getByRole('dialog').getByRole('tab', { name: '공고 원문', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(raw.detail.intro);
  current = { ...current, status: 'closed', description: '나중에 바뀐 시험용 원문', verifiedAt: new Date().toISOString() };
  await page.goto('/#/app/jobs');
  await page.getByRole('button', { name: '출처 다시 조회', exact: true }).click();
  await expect(page.locator('.job-detail')).toContainText(current.description);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.goto(applicationURL); await page.getByRole('dialog').getByRole('tab', { name: '공고 원문', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(raw.detail.intro);
  await expect(page.getByRole('dialog')).not.toContainText(current.description);
});
