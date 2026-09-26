import { test as base, expect } from '@playwright/test';
import { createDemoState } from '../../src/lib/seed';
export { expect };
export type { Page, Download } from '@playwright/test';

// Test-only synthetic records. The production application always starts empty.
export const test = base.extend<{ seededWorkspace: void }>({
  seededWorkspace: [async ({ page }, use) => {
    const data = createDemoState();
    data.demo = false;
    data.jobs = data.jobs.map(job => ({ ...job, isDemo: false }));
    data.documents = data.documents.map(doc => ({ ...doc, isDemo: false }));
    data.applications = data.applications.map(application => ({
      ...application, isDemo: false,
      jobSnapshot: { ...application.jobSnapshot, isDemo: false },
    }));
    // Seed on the optional guide, before the workspace mounts or searches.
    // The default home search must not contact unapproved sources, so only the official
    // provider is exposed and it returns no jobs in this seeded baseline.
    await page.route('**/api/sources', route => route.fulfill({ json: { sources: [{ id: 'saramin', name: '사람인', enabled: true, note: '공식 API 시험용 연결' }] } }));
    await page.route('**/api/jobs?**', route => route.fulfill({ json: {
      jobs: [], checkedAt: '2026-09-26T00:00:00.000Z', nextCursor: null,
      nextPage: null, warnings: [], sourceResults: [],
    } }));
    await page.goto('/#/about', { waitUntil: 'networkidle' });
    await page.evaluate(async state => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('keyval-store', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('keyval')) request.result.createObjectStore('keyval');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('keyval', 'readwrite');
          const store = transaction.objectStore('keyval');
          store.put(state, 'jarizip:workspace:v1');
          store.put({ version: 1, initializedAt: new Date().toISOString(), demoSeeded: false }, 'jarizip:meta:v1');
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => { db.close(); reject(transaction.error); };
          transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Test seed aborted')); };
        };
      });
    }, data);
    await use();
  }, { auto: true }],
});
