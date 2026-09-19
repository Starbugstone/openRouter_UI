import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures';

test('product metadata, manifest and icons are served correctly before and after app startup', async ({ page, context, request }) => {
  await mockApi(context);
  const html = await (await request.get('/')).text();
  expect(html).toContain('<title>AI Playground</title>');
  expect(html).toContain('name="application-name" content="AI Playground"');
  expect(html).toContain('property="og:title" content="AI Playground"');
  // This test server has no configured final production domain.
  expect(html).not.toContain('rel="canonical"'); expect(html).not.toContain('property="og:url"');
  await page.goto('/');
  await expect(page).toHaveTitle('AI Playground');
  await expect(page.getByRole('heading', { name: 'AI Playground', exact: true })).toBeVisible();
  await expect(page.getByText('AI Playground uses OpenRouter as its AI model/API provider.', { exact: false })).toBeVisible();
  await expect(page.getByText('OpenRouter documentation/resources:', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Quickstart', exact: true })).toHaveAttribute('href', 'https://openrouter.ai/docs/quickstart');
  await expect(page.getByRole('link', { name: 'Models', exact: true })).toHaveAttribute('href', 'https://openrouter.ai/models');
  const assets = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').evaluateAll(links => links.map(link => link.href));
  expect(assets).toHaveLength(6);
  for (const url of assets) {
    expect(new URL(url).pathname).not.toContain('/assets/');
    const response = await request.get(url); expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).not.toContain('text/html');
  }
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(manifestUrl)).json();
  expect(manifest.name).toBe('AI Playground'); expect(manifest.short_name).toBe('AI Playground');
  for (const icon of manifest.icons) {
    const response = await request.get(new URL(icon.src, new URL(manifestUrl, page.url())).href);
    expect(response.ok()).toBe(true); expect(response.headers()['content-type']).toContain('image/png');
  }
});

test('startup deletes development history and old manual credentials without importing them', async ({ page, context }) => {
  const calls = await mockApi(context);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Connect with OpenRouter' })).toBeEnabled();
  await page.evaluate(async () => {
    localStorage.setItem('or_api_key', 'do-not-use-manual-key');
    localStorage.setItem('or_remember_key', 'true');
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('openrouter_ui', 2);
      open.onupgradeneeded = () => open.result.createObjectStore('chats', { keyPath: 'id' });
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('chats', 'readwrite');
        tx.objectStore('chats').put({ id: 'legacy', title: 'Old history must disappear' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await expect(page.getByText('Select a model to start chatting.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect with OpenRouter' })).toBeEnabled();
  await expect(page.getByText('Old history must disappear')).toHaveCount(0);
  const state = await page.evaluate(async () => ({
    databases: (await indexedDB.databases()).map(db => db.name),
    manualKey: localStorage.getItem('or_api_key'), remember: localStorage.getItem('or_remember_key')
  }));
  expect(state.databases).toContain('ai_playground'); expect(state.databases).not.toContain('openrouter_ui');
  expect(state.manualKey).toBeNull(); expect(state.remember).toBeNull();
  expect(calls.status).toBe(0); expect(calls.exchange).toHaveLength(0);
});
