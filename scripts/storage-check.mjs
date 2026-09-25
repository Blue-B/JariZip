import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true });
const context = await browser.newContext();
const page = await context.newPage();
page.on('console', message => console.log('console:', message.type(), message.text()));
page.on('pageerror', error => console.log('pageerror:', error.message));
await page.addInitScript(() => {
  window.__storageDiagnostics = [];
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(...args) {
    try {
      const request = original.apply(this, args);
      request.addEventListener('error', () => window.__storageDiagnostics.push({ action: 'put', key: String(args[1]), error: String(request.error) }));
      return request;
    } catch (error) { window.__storageDiagnostics.push({ action: 'put-threw', key: String(args[1]), error: String(error) }); throw error; }
  };
});
try {
  await page.goto('http://127.0.0.1:4178/#/app', { waitUntil: 'networkidle' });
  await page.locator('h1').waitFor();
  console.log('storage-status:', await page.locator('.save-status').textContent());
  console.log('diagnostics:', await page.evaluate(() => window.__storageDiagnostics));
  console.log('IndexedDB:', await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const values = [];
    for (const entry of databases) {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open(entry.name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      for (const name of db.objectStoreNames) {
        const store = db.transaction(name).objectStore(name);
        const keys = await new Promise(resolve => { const r = store.getAllKeys(); r.onsuccess = () => resolve(r.result); });
        values.push({ database: entry.name, store: name, keys });
      }
      db.close();
    }
    return values;
  }));
} finally { await context.close(); await browser.close(); }
