import { test, expect, type Page } from './fixtures';
import type { Locator } from '@playwright/test';

/**
 * Cross-tab lost-update regression.
 *
 * Two Playwright pages in one isolated browser context are two real tabs: they
 * share the same IndexedDB origin, so this reproduces two windows of the app
 * reading one workspace record. The old implementation wrote
 * `set(WORKSPACE_KEY, snapshot)` unconditionally, so whichever tab saved last
 * silently overwrote the other. The fix reads the record revision and
 * conditionally writes it in a single IndexedDB transaction; a stale tab is
 * rejected without writing and keeps its draft for export/recovery.
 *
 * All records below are synthetic test-only values.
 */

const COMPANY_A = '동시성검증 가상기업 A';
const COMPANY_B = '동시성검증 가상기업 B';
const DESC_A = '테스트 전용 공고 원문입니다. A 탭에서 먼저 저장한 변경을 확인합니다.';
const DESC_B = '테스트 전용 공고 원문입니다. B 탭의 늦은 저장이 A를 덮어쓰면 안 됩니다.';

interface RawWorkspace {
  workspace: { jobs?: { company: string }[] } | undefined;
  revision: number | undefined;
  recoveryDrafts: { key: string; state: { jobs?: { company: string }[] } }[];
}

/** Reads the real IndexedDB records another tab would see. */
async function readRawWorkspace(page: Page): Promise<RawWorkspace> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('keyval-store', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const store = database.transaction('keyval', 'readonly').objectStore('keyval');
    const get = <T,>(key: string) =>
      new Promise<T | undefined>((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      });
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const revisionKey = keys.map(String).find(key => key.startsWith('jarizip:revision')) ?? 'jarizip:revision:v1';
    const draftKeys = keys.map(String).filter(key => key.startsWith('jarizip:recovery-draft:v1:'));
    const result = {
      workspace: await get<RawWorkspace['workspace']>('jarizip:workspace:v1'),
      revision: await get<number>(revisionKey),
      recoveryDrafts: await Promise.all(
        draftKeys.map(async key => {
          const stored = await get<{ state: { jobs?: { company: string }[] } }>(key);
          return { key, state: stored?.state as { jobs?: { company: string }[] } };
        }),
      ),
    };
    database.close();
    return result;
  });
}

async function openApp(page: Page, path = '/app') {
  await page.goto(`/#${path}`, { waitUntil: 'networkidle' });
  await expect(page.locator('h1').first()).toBeVisible();
}

async function fillJob(page: Page, company: string, description: string) {
  await page.goto('/#/app/jobs?new=1', { waitUntil: 'networkidle' });
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="company"]').fill(company);
  await dialog.locator('[name="title"]').fill('테스트 전용 백엔드 개발자');
  await dialog.locator('[name="url"]').fill(`https://example.com/jobs/${encodeURIComponent(company)}`);
  await dialog.locator('[name="description"]').fill(description);
  return dialog;
}

async function submitJob(page: Page, dialog: Locator) {
  await dialog.getByRole('button', { name: '공고 보관하기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** Saves from the tab that owns the newest revision; must commit. */
async function saveFromWinner(page: Page, company: string, description: string) {
  const dialog = await fillJob(page, company, description);
  await submitJob(page, dialog);
  await expect(page.getByTestId('storage-conflict')).toHaveCount(0);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
}

/** Saves from a stale tab; must be rejected, never report success. */
async function saveFromStale(page: Page, company: string, description: string) {
  const dialog = await fillJob(page, company, description);
  await submitJob(page, dialog);
  const banner = page.getByTestId('storage-conflict');
  await expect(banner).toBeVisible();
  await expect(page.locator('.save-status')).not.toHaveText('저장됨');
  return banner;
}

function companies(raw: RawWorkspace): string[] {
  return (raw.workspace?.jobs ?? []).map(job => job.company);
}

function draftCompanies(raw: RawWorkspace): string[] {
  return raw.recoveryDrafts.flatMap(draft => (draft.state.jobs ?? []).map(job => job.company));
}

async function expectCard(page: Page, company: string) {
  const card = page.locator('.job-list-card', { hasText: company });
  await expect(card.first()).toBeVisible({ timeout: 10000 });
}

test('failed recovery draft storage never claims the draft is durable', async ({ page, context }) => {
  await openApp(page);
  const second = await context.newPage();
  await openApp(second);
  await saveFromWinner(page, COMPANY_A, DESC_A);
  await second.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
      if (String(key).startsWith('jarizip:recovery-draft:')) throw new DOMException('Synthetic draft quota failure', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  const notice = await saveFromStale(second, COMPANY_B, DESC_B);
  await expect(notice).not.toContainText('초안으로 남겨 두었어요');
  await expect(notice).toContainText('이 화면에 유지');
  await expect(second.locator('.toast')).toContainText('못');
  const raw = await readRawWorkspace(second);
  expect(companies(raw)).toContain(COMPANY_A);
  expect(companies(raw)).not.toContain(COMPANY_B);
  expect(raw.recoveryDrafts).toHaveLength(0);
  await second.close();
});

test('failed draft deletion preserves the conflict and never claims it was discarded', async ({ page, context }) => {
  await openApp(page);
  const second = await context.newPage();
  await openApp(second);
  await saveFromWinner(page, COMPANY_A, DESC_A);
  const notice = await saveFromStale(second, COMPANY_B, DESC_B);
  await expect.poll(async () => (await readRawWorkspace(second)).recoveryDrafts.length).toBe(1);
  await second.evaluate(() => {
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function(key: IDBValidKey | IDBKeyRange) {
      if (String(key).startsWith('jarizip:recovery-draft:')) throw new DOMException('Synthetic deletion failure', 'UnknownError');
      return remove.call(this, key);
    };
  });
  await notice.getByRole('button', { name: '초안 버리고 최신 내용 불러오기', exact: true }).click();
  await notice.getByRole('button', { name: '초안 버리고 불러오기', exact: true }).click();
  await expect(second.locator('.toast')).toContainText('초안을 정리하지 못했어요');
  await expect(notice).toBeVisible();
  await expect(second.locator('.save-status')).not.toHaveText('저장됨');
  const raw = await readRawWorkspace(second);
  expect(companies(raw)).toContain(COMPANY_A);
  expect(draftCompanies(raw)).toContain(COMPANY_B);
  await second.close();
});

test('a stale second tab is rejected instead of overwriting the first tab and keeps its draft', async ({ page, context }) => {
  await openApp(page);
  await expect(page.locator('.save-status')).toHaveText('저장됨');

  // Second tab loads the same record before the first tab writes anything.
  const second = await context.newPage();
  await openApp(second);
  await expect(second.locator('.save-status')).toHaveText('저장됨');
  expect((await readRawWorkspace(second)).workspace).toBeDefined();

  // Tab A saves first: this is the change that must never be lost.
  await saveFromWinner(page, COMPANY_A, DESC_A);
  const afterA = await readRawWorkspace(page);
  expect(companies(afterA)).toContain(COMPANY_A);
  const revisionAfterA = afterA.revision;

  // Tab B still has the old revision and now tries to save.
  const banner = await saveFromStale(second, COMPANY_B, DESC_B);
  await expect(banner).toContainText('다른 탭에서 먼저 저장');
  await expect(banner).toContainText('백업');
  await expect(second.locator('.toast')).toContainText('다른 탭에서 먼저 저장');

  // The first tab's committed change is untouched: no lost update.
  const afterB = await readRawWorkspace(second);
  expect(companies(afterB)).toContain(COMPANY_A);
  expect(companies(afterB)).not.toContain(COMPANY_B);
  expect(afterB.revision).toBe(revisionAfterA);

  // The losing tab's unsaved changes are preserved in the recovery draft.
  expect(afterB.recoveryDrafts.length).toBeGreaterThan(0);
  expect(draftCompanies(afterB)).toContain(COMPANY_B);

  // The losing tab does not auto-retry its stale snapshot.
  await second.waitForTimeout(600);
  const later = await readRawWorkspace(second);
  expect(companies(later)).not.toContain(COMPANY_B);
  expect(later.revision).toBe(revisionAfterA);

  await second.close();
});

test('the recovery draft survives a reload of the losing tab and exporting leaves the stored data untouched', async ({ page, context }) => {
  await openApp(page);
  const second = await context.newPage();
  await openApp(second);

  await saveFromWinner(page, COMPANY_A, DESC_A);
  await saveFromStale(second, COMPANY_B, DESC_B);

  // The losing tab truthfully reports that its change was not saved.
  await expect(second.locator('.save-status')).toHaveText('저장되지 않음');
  const afterConflict = await readRawWorkspace(second);
  const draftKeyCount = afterConflict.recoveryDrafts.length;
  expect(draftKeyCount).toBe(1);

  // Reloading the losing tab must recover its draft instead of silently losing it.
  await second.reload({ waitUntil: 'networkidle' });
  await expect(second.getByTestId('storage-conflict')).toBeVisible();
  const recovered = await readRawWorkspace(second);
  expect(draftCompanies(recovered)).toContain(COMPANY_B);
  // Adoption moved the draft instead of accumulating old keys forever.
  expect(recovered.recoveryDrafts.length).toBe(draftKeyCount);
  // The stored workspace still belongs to tab A.
  expect(companies(recovered)).toContain(COMPANY_A);
  expect(companies(recovered)).not.toContain(COMPANY_B);

  // The exported draft contains the losing change and the stored record is not
  // overwritten by the export.
  const downloadPromise = second.waitForEvent('download');
  await second.getByTestId('storage-conflict').getByRole('button', { name: '초안 백업으로 내려받기' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^jarizip-conflict-/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const exportedCompanies = (exported.state.jobs ?? []).map((job: { company: string }) => job.company);
  expect(exportedCompanies).toContain(COMPANY_B);
  const afterExport = await readRawWorkspace(second);
  expect(companies(afterExport)).toContain(COMPANY_A);
  expect(companies(afterExport)).not.toContain(COMPANY_B);
  // Exporting must not consume the persisted draft.
  await second.reload({ waitUntil: 'networkidle' });
  await expect(second.getByTestId('storage-conflict')).toBeVisible();

  // Discarding requires an explicit second confirmation.
  const notice = second.getByTestId('storage-conflict');
  await notice.getByRole('button', { name: '초안 버리고 최신 내용 불러오기', exact: true }).click();
  await expect(second.getByTestId('storage-conflict')).toBeVisible();
  await notice.getByRole('button', { name: '초안 버리고 불러오기', exact: true }).click();
  await expect(second.getByTestId('storage-conflict')).toHaveCount(0);
  await expect(second.locator('.save-status')).toHaveText('저장됨');
  await second.goto('/#/app/jobs', { waitUntil: 'networkidle' });
  await expectCard(second, COMPANY_A);
  const discarded = await readRawWorkspace(second);
  expect(draftCompanies(discarded)).not.toContain(COMPANY_B);
  expect(discarded.recoveryDrafts).toHaveLength(0);

  await second.close();
});

test('reloading the stale tab re-hydrates the latest revision so the next edit succeeds', async ({ page, context }) => {
  await openApp(page);
  const second = await context.newPage();
  await openApp(second);

  await saveFromWinner(page, COMPANY_A, DESC_A);
  // Instead of editing stale, the second tab reloads first.
  await second.reload({ waitUntil: 'networkidle' });
  await expect(second.locator('.save-status')).toHaveText('저장됨');

  // After re-hydration the edit should commit normally (a fresh revision).
  await saveFromWinner(second, COMPANY_B, DESC_B);

  const raw = await readRawWorkspace(second);
  expect(companies(raw)).toContain(COMPANY_A);
  expect(companies(raw)).toContain(COMPANY_B);

  // Real persistence: both changes survive a reload.
  await second.reload({ waitUntil: 'networkidle' });
  await second.goto('/#/app/jobs', { waitUntil: 'networkidle' });
  await expectCard(second, COMPANY_A);
  await expectCard(second, COMPANY_B);

  await second.close();
});

test('simultaneous initial hydration does not create a spurious conflict or overwrite', async ({ page, context }) => {
  // Load two tabs at the same time against the same already-seeded record.
  const second = await context.newPage();
  await Promise.all([
    page.goto('/#/app', { waitUntil: 'networkidle' }),
    second.goto('/#/app', { waitUntil: 'networkidle' }),
  ]);
  await expect(page.locator('.save-status')).toHaveText('저장됨');
  await expect(second.locator('.save-status')).toHaveText('저장됨');

  // Merely hydrating concurrently must not be treated as a lost update.
  await expect(page.getByTestId('storage-conflict')).toHaveCount(0);
  await expect(second.getByTestId('storage-conflict')).toHaveCount(0);

  // A single edit from one tab still commits, and the other tab keeps reading
  // the same durable record.
  await saveFromWinner(page, COMPANY_A, DESC_A);
  const hydrated = await readRawWorkspace(second);
  expect(companies(hydrated)).toContain(COMPANY_A);

  await second.close();
});

test('near-simultaneous edits from two tabs keep one winner and preserve the loser instead of losing it', async ({ page, context }) => {
  await openApp(page);
  const second = await context.newPage();
  await openApp(second);

  // Both tabs have the same starting revision and submit an edit together.
  const [dialogA, dialogB] = await Promise.all([
    fillJob(page, COMPANY_A, DESC_A),
    fillJob(second, COMPANY_B, DESC_B),
  ]);
  await Promise.all([submitJob(page, dialogA), submitJob(second, dialogB)]);

  // Exactly one tab commits; the other is rejected with an actionable banner.
  await expect(page.locator('.save-status, [data-testid="storage-conflict"]').first()).toBeVisible();
  await page.waitForTimeout(800);
  const raw = await readRawWorkspace(page);
  const stored = companies(raw);
  const preserved = draftCompanies(raw);
  const winnerInStore = stored.includes(COMPANY_A) !== stored.includes(COMPANY_B);
  expect(winnerInStore).toBe(true);
  const storedWinner = stored.includes(COMPANY_A) ? COMPANY_A : COMPANY_B;
  const storedLoser = storedWinner === COMPANY_A ? COMPANY_B : COMPANY_A;
  expect(preserved).toContain(storedLoser);

  // The losing tab never reports success.
  const losingPage = storedWinner === COMPANY_A ? second : page;
  await expect(losingPage.getByTestId('storage-conflict')).toBeVisible();
  await expect(losingPage.locator('.save-status')).not.toHaveText('저장됨');

  await second.close();
});

test('the losing tab cannot silently keep-and-overwrite another tab and offers no one-click overwrite', async ({ page, context }) => {
  await openApp(page);
  const second = await context.newPage();
  await openApp(second);

  await saveFromWinner(page, COMPANY_A, DESC_A);
  const comment = await saveFromStale(second, COMPANY_B, DESC_B);

  // There is no unconfirmed overwrite button; resolution is export or explicit discard.
  await expect(comment.getByRole('button', { name: /유지하고 다시 저장|덮어쓰/ })).toHaveCount(0);
  await expect(comment.getByRole('button', { name: '초안 백업으로 내려받기' })).toBeVisible();
  await expect(comment.getByRole('button', { name: '초안 버리고 최신 내용 불러오기', exact: true })).toBeVisible();

  // The stored record still belongs to the winner after the losing attempt.
  const raw = await readRawWorkspace(second);
  expect(companies(raw)).toContain(COMPANY_A);
  expect(companies(raw)).not.toContain(COMPANY_B);

  // A stale tab's own future edits must not be silently persisted either.
  await second.goto('/#/app/settings', { waitUntil: 'networkidle' });
  await second.locator('input').first().fill('초안 편집 시도');
  await second.waitForTimeout(400);
  const afterEdit = await readRawWorkspace(second);
  expect(companies(afterEdit)).not.toContain(COMPANY_B);
  await expect(second.getByTestId('storage-conflict')).toBeVisible();

  await second.close();
});

test('a duplicated tab copying the draft hint cannot duplicate or clobber the draft', async ({ page, context }) => {
  await openApp(page);
  const second = await context.newPage();
  await openApp(second);

  await saveFromWinner(page, COMPANY_A, DESC_A);
  await saveFromStale(second, COMPANY_B, DESC_B);

  const raw = await readRawWorkspace(second);
  expect(raw.recoveryDrafts).toHaveLength(1);
  const slot = raw.recoveryDrafts[0].key.replace('jarizip:recovery-draft:v1:', '');

  // A duplicated tab copies sessionStorage, so point the second page at the
  // same hint and reload it as a fresh page load would.
  await second.evaluate(value => sessionStorage.setItem('jarizip:draft-slot', value), slot);
  await second.reload({ waitUntil: 'networkidle' });
  await expect(second.getByTestId('storage-conflict')).toBeVisible();

  const adopted = await readRawWorkspace(second);
  // The draft was moved, not copied: still exactly one record.
  expect(adopted.recoveryDrafts).toHaveLength(1);
  expect(draftCompanies(adopted)).toContain(COMPANY_B);
  // The original key is gone, so it can never be resurrected or double-adopted.
  expect(adopted.recoveryDrafts.map(draft => draft.key)).not.toContain(`jarizip:recovery-draft:v1:${slot}`);

  await second.close();
});

test('the conflict notice is accessible, clears the mobile nav and leaves modals usable', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const second = await context.newPage();
  await second.setViewportSize({ width: 390, height: 844 });
  await openApp(second);

  await saveFromWinner(page, COMPANY_A, DESC_A);
  const notice = await saveFromStale(second, COMPANY_B, DESC_B);

  await expect(notice).toHaveAttribute('role', 'alert');
  // No internal revision jargon in the visible UI.
  await expect(notice).not.toContainText(/revision|rev\b/i);
  await expect(second.locator('.save-status')).toHaveText('저장되지 않음');

  // The notice must not overlap the fixed bottom navigation.
  const nav = second.locator('.mobile-bottom-nav');
  await expect(nav).toBeVisible();
  const noticeBox = await notice.boundingBox();
  const navBox = await nav.boundingBox();
  expect(noticeBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(navBox!.y + 1);

  // Actions are reachable by keyboard.
  const exportButton = notice.getByRole('button', { name: '초안 백업으로 내려받기' });
  await exportButton.focus();
  await expect(exportButton).toBeFocused();

  // A modal opened from the app stays usable above the notice.
  await second.keyboard.press('Control+k');
  const dialog = second.getByRole('dialog', { name: '내 자료 빠르게 찾기' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('내 자료 검색').fill('테스트');
  await second.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(notice).toBeVisible();

  await second.close();
});
