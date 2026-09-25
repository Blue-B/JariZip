// Explicit live smoke test. Public job requests only; isolated browser, no personal profile.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { createAppServer } from '../server/http.mjs';
const server = createAppServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const sourceChecks = [];
async function json(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(35000) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}
try {
  const { sources } = await json('/api/sources');
  const enabled = sources.filter(source => source.enabled);
  assert.ok(enabled.length >= 2, 'This check requires at least two real, enabled sources.');
  for (const source of enabled) {
    const result = await json(`/api/jobs?source=${source.id}`);
    assert.ok(result.jobs.length > 0, `${source.name} returned no live results; this is not a passed smoke test.`);
    assert.ok(result.jobs.every(job => !job.isDemo && job.status === 'open' && job.verification === 'source'));
    const selected = result.jobs[0];
    const id = selected.id.slice(source.id.length + 1);
    const detail = await json(`/api/jobs/${source.id}/${encodeURIComponent(id)}`);
    assert.equal(detail.job.sourceUrl, selected.sourceUrl);
    assert.equal(detail.job.status, 'open');
    sourceChecks.push({ source: source.id, resultsOnPage: result.jobs.length, nextPage: result.nextPage, detail: true });
  }
  const aggregate = await json('/api/jobs?source=all');
  assert.ok(new Set(aggregate.jobs.map(job => job.source)).size >= 2, 'Aggregate page must contain multiple real sources.');
  assert.ok(aggregate.sourceResults.every(source => source.status === 'ok'), JSON.stringify(aggregate.sourceResults));
  const continuation = [], seen = new Set(); let cursor = 'start';
  for (let page = 0; page < 4 && cursor; page++) {
    const batch = await json(`/api/jobs?source=all&page=${page}&cursor=${encodeURIComponent(cursor)}`);
    assert.ok(batch.sourceResults.every(source => source.status === 'ok'), JSON.stringify(batch.sourceResults));
    const before = seen.size;
    for (const job of batch.jobs) seen.add(job.sourceUrl);
    assert.ok(seen.size > before, 'Continuation must add new real jobs, not repeat the same page.');
    continuation.push({ batch: page + 1, received: batch.jobs.length, newUnique: seen.size - before, cumulativeUnique: seen.size });
    cursor = batch.nextCursor;
  }
  console.log(JSON.stringify({ continuation }, null, 2));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#/app/discover`);
  await page.locator('.discover-job').first().waitFor({ timeout: 35000 });
  for (const source of enabled) {
    await page.getByRole('combobox', { name: '공고 출처', exact: true }).selectOption(source.id);
    const search = page.waitForResponse(response => new URL(response.url()).pathname === '/api/jobs' && new URL(response.url()).searchParams.get('source') === source.id);
    await page.getByRole('button', { name: '공고 찾기', exact: true }).click(); await search;
    const card = page.locator('.discover-job').first(); await card.waitFor(); await card.click();
    const save = page.getByRole('button', { name: '내 보관함에 저장', exact: true });
    await save.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.includes('내 보관함에 저장') && !button.disabled), null, { timeout: 30000 });
    await save.click();
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 30000 });
    await page.locator('.save-status').filter({ hasText: '저장됨' }).waitFor();
  }
  await page.goto(`${base}/#/app/jobs`);
  await page.locator('.job-list-card').first().waitFor();
  assert.equal(await page.locator('.job-list-card').count(), enabled.length);
  assert.ok((await page.locator('.job-detail-content').innerText()).length > 80);
  await page.getByRole('button', { name: '지원 준비하기', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.locator('.save-status').filter({ hasText: '저장됨' }).waitFor();
  await page.reload(); await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('tab', { name: '공고 원문', exact: true }).click();
  assert.ok((await page.getByRole('dialog').innerText()).length > 80);
  await page.goto(`${base}/#/app/discover`); await page.locator('.discover-job').first().waitFor({ timeout: 35000 });
  assert.equal(await page.getByRole('combobox', { name: '공고 근무 지역' }).locator('option').count(), 18);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '.local/live-check/live-jobs-desktop.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1, null, { timeout: 5000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: '.local/live-check/live-jobs-mobile.png', fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(`${base}/#/`);
  await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: '.local/live-check/landing.png' });
  await page.goto(`${base}/#/app/settings`);
  for (const source of enabled) {
    const probe = page.getByRole('button', { name: `${source.name} 공고 조회 확인`, exact: true });
    await probe.waitFor(); await probe.click();
    await page.locator('.connection-row').filter({ has: page.getByRole('heading', { name: source.name, exact: true }) }).locator('.connection-result.result-ready').waitFor({ timeout: 30000 });
  }
  await page.locator('.source-connections').screenshot({ path: '.local/live-check/source-connections.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), sources: sourceChecks, aggregateResults: aggregate.jobs.length, verified: ['each real source search and detail', 'aggregate search', 'browser save per source', 'application snapshot', 'reload', 'nationwide options', 'mobile layout', 'settings source checks'], screenshots: '.local/live-check/' }, null, 2));
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
