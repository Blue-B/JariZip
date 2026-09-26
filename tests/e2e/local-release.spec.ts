import { test, expect } from '@playwright/test';

function samplePdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((value, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${value}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(value => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('a real PDF worker loads through the production server and extracts document text', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/app/documents');
  const workerResponse = page.waitForResponse(response => /pdf\.worker.*\.mjs(?:\?|$)/.test(response.url()));
  await page.getByLabel('서류 파일 선택').setInputFiles({
    name: 'release-test.pdf', mimeType: 'application/pdf', buffer: samplePdf('release_pdf_import_ok'),
  });
  const worker = await workerResponse;
  expect(worker.status()).toBe(200);
  expect(worker.headers()['content-type']).toMatch(/javascript/);
  await expect(page.locator('.document-card')).toHaveCount(1);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await page.locator('.document-card-preview').first().click();
  await expect(page.getByRole('dialog')).toContainText('release_pdf_import_ok');
  expect(errors).toEqual([]);
});

test('settings explain the actual backup limit and link to optional help', async ({ page }) => {
  await page.route('**/api/sources', route => route.fulfill({ json: { sources: [] } }));
  await page.goto('/#/app/settings');
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await expect(page.getByText('JSON 백업은 원본 서류와 음성을 포함해 전체 40MB까지', { exact: false })).toBeVisible();
  const help = page.getByRole('link', { name: /이용 안내 보기/ });
  await expect(help).toHaveAttribute('href', '#/about');
  await help.click();
  await expect(page).toHaveURL(/#\/about$/);
  await expect(page.getByRole('heading', { name: '이용 안내', exact: true })).toBeVisible();
});
