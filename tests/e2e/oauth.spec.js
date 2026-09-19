import { expect, test } from '@playwright/test';
import { mockApi, connected, selectModel, storageKey, secret } from './fixtures';

test('real browser PKCE round trip, URL cleanup, persistence and cross-tab disconnect', async ({ page, context, browser }) => {
  const calls = await mockApi(context);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let authorization;
  await context.route('https://openrouter.ai/auth?**', async route => {
    authorization = new URL(route.request().url());
    await route.fulfill({ contentType: 'text/html', body: '<p>Mock OpenRouter authorization</p>' });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Connect with OpenRouter' })).toBeEnabled();
  await page.getByRole('button', { name: 'Connect with OpenRouter' }).click();
  await expect(page.getByText('Mock OpenRouter authorization')).toBeVisible();
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorization.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(authorization.searchParams.get('key_label')).toBe('AI Playground');
  const callback = new URL(authorization.searchParams.get('callback_url'));
  expect(callback.origin).toBe('http://127.0.0.1:4178');
  expect(callback.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  callback.searchParams.set('code', 'single-use-code');
  await page.goto(callback.href);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  expect(calls.exchange).toHaveLength(1);
  expect(calls.exchange[0].code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(page).toHaveURL('http://127.0.0.1:4178/');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(await page.locator('body').innerText()).not.toContain(secret);
  await page.reload(); await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  expect(calls.exchange).toHaveLength(1);
  // A fresh browser context restores only persistent state, with no PKCE session data.
  const restoredContext = await browser.newContext({ storageState: await context.storageState() });
  await mockApi(restoredContext);
  const restoredPage = await restoredContext.newPage();
  await restoredPage.goto('http://127.0.0.1:4178/');
  await expect(restoredPage.getByText('Connected', { exact: true })).toBeVisible();
  expect(await restoredPage.evaluate(() => sessionStorage.length)).toBe(0);
  await restoredContext.close();
  const second = await context.newPage(); await second.goto('/');
  await expect(second.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Connect with OpenRouter' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
  expect(errors).toEqual([]);
});

test('paid opt-in and first request confirmation happen before inference, declining preserves the prompt', async ({ page, context }) => {
  const calls = await mockApi(context, { status: { limit: null, limit_remaining: null } });
  await connected(page);
  await page.getByRole('button', { name: 'Select a model...' }).click();
  await expect(page.getByRole('button', { name: 'Select Paid model', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select Image charges', exact: true })).toHaveCount(0);
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('credits'); await dialog.dismiss(); });
  await page.getByText('Include paid models', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select Paid model', exact: true })).toHaveCount(0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByText('Include paid models', { exact: true }).click();
  await page.getByRole('button', { name: 'Select Paid model', exact: true }).click();
  const input = page.getByPlaceholder('Type your message here...'); await input.fill('Paid question');
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('no per-key spend limit');
    expect(dialog.message()).toContain('$0.01 / input token');
    expect(calls.completions).toHaveLength(0); await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(input).toHaveValue('Paid question');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Browser reply', { exact: true })).toBeVisible();
  expect(calls.completions).toHaveLength(1);
  await expect(input).toHaveValue('');
  expect(calls.status).toBeGreaterThanOrEqual(4);
});

for (const limit of [0, 10]) {
  test(`exhausted key with limit ${limit} blocks paid sends and allows free streaming`, async ({ page, context }) => {
    const calls = await mockApi(context, { status: { limit, limit_remaining: 0 } });
    await connected(page); await selectModel(page, 'Paid model', true);
    await page.getByPlaceholder('Type your message here...').fill('Question');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Manage your key');
    expect(calls.completions).toHaveLength(0);
    await page.getByRole('button', { name: 'Paid model' }).click();
    await page.getByRole('button', { name: 'Select Free model', exact: true }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Browser reply', { exact: true })).toBeVisible();
    expect(calls.completions).toHaveLength(1);
  });
}

for (const code of [401, 402]) {
  test(`completion ${code} has distinct authentication/billing recovery`, async ({ page, context }) => {
    const calls = await mockApi(context, { completionStatus: code });
    await connected(page); await selectModel(page, 'Free model');
    await page.getByPlaceholder('Type your message here...').fill('Question');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    if (code === 401) {
      await expect(page.getByRole('button', { name: 'Connect with OpenRouter' })).toBeVisible();
      expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
    } else {
      await expect(page.getByRole('alert')).toContainText('credits');
      await expect(page.getByText('Connected', { exact: true })).toBeVisible();
      expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(secret);
    }
    expect(calls.completions).toHaveLength(1);
    expect(await page.locator('body').innerText()).not.toContain('Sensitive provider response');
  });
}

test('mobile account panel fits and failed callbacks offer a fresh connection', async ({ page, context }) => {
  await mockApi(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?code=untrusted&state=missing');
  await expect(page.getByRole('alert')).toContainText('Connect with OpenRouter again');
  await expect(page).toHaveURL('http://127.0.0.1:4178/');
  await expect(page.getByRole('button', { name: 'Connect with OpenRouter' })).toBeEnabled();
  await connected(page);
  const sidebar = await page.getByRole('complementary').boundingBox();
  expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(390);
  const panel = await page.getByRole('region', { name: 'OpenRouter account' }).boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.x + panel.width).toBeLessThanOrEqual(390);
});
