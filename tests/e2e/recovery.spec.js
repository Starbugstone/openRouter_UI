import { expect, test } from '@playwright/test';
import { connected, mockApi, selectModel } from './fixtures';

test('model refresh recovers the saved model after startup failure without reopening the chat', async ({ page, context }) => {
  const calls = await mockApi(context);
  await connected(page);
  await selectModel(page, 'Free model');
  await page.getByPlaceholder('Type your message here...').fill('Saved conversation');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Browser reply', { exact: true })).toBeVisible();

  let attempts = 0;
  await context.route('https://openrouter.ai/api/v1/models', route => {
    if (++attempts <= 2) return route.fulfill({ status: 503, json: { error: 'Temporary model-list outage' } });
    return route.fallback();
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Could not load models');
  await expect(page.locator('.chat-warning')).toContainText('Model test/free is unavailable');
  await expect(page.getByText('Browser reply', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Type your message here...').fill('Unsent draft');

  // A failed refresh must not clear the unavailable-model warning.
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole('alert')).toContainText('Could not load models');
  await expect(page.locator('.chat-warning')).toContainText('Model test/free is unavailable');

  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Free model', exact: false })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.chat-warning')).toHaveCount(0);
  await expect(page.getByText('Browser reply', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Type your message here...')).toHaveValue('Unsent draft');
  expect(calls.completions).toHaveLength(1);
});
