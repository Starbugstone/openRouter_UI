import { expect } from '@playwright/test';

export const storageKey = 'ai_playground_openrouter_key';
export const secret = 'test-oauth-key-browser';
const models = [
  { id: 'test/free', name: 'Free model', pricing: { prompt: '0', completion: '0', image: '0' } },
  { id: 'test/paid', name: 'Paid model', pricing: { prompt: '0.01', completion: '0.02' } },
  { id: 'test/image', name: 'Image charges', pricing: { prompt: '0', completion: '0', image: '0.1' } }
];
const status = { label: 'Playground connection', limit: 10, limit_remaining: 8, usage: 2, usage_daily: 1, usage_weekly: 2, usage_monthly: 2, is_free_tier: false, expires_at: null, limit_reset: 'monthly' };

export async function mockApi(context, options = {}) {
  const calls = { exchange: [], completions: [], status: 0 };
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '' }));
  await context.route('https://openrouter.ai/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/models')) return route.fulfill({ json: { data: models } });
    if (path.endsWith('/auth/keys')) {
      calls.exchange.push(request.postDataJSON());
      return route.fulfill({ status: options.exchangeStatus || 200, json: { key: secret } });
    }
    if (path.endsWith('/key')) {
      calls.status++;
      return route.fulfill({ status: options.statusCode || 200, json: { data: { ...status, ...options.status } } });
    }
    if (path.endsWith('/chat/completions')) {
      const body = request.postDataJSON(); calls.completions.push(body);
      if (options.completionStatus) return route.fulfill({ status: options.completionStatus, json: { error: { message: 'Sensitive provider response' } } });
      if (body.stream) return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"Browser reply"}}]}\n\ndata: [DONE]\n\n' });
      return route.fulfill({ json: { choices: [{ message: { content: 'Browser reply' } }] } });
    }
    throw new Error(`Unexpected API endpoint: ${path}`);
  });
  return calls;
}
export async function connected(page) {
  await page.goto('/');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [storageKey, secret]);
  await page.reload();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
}
export async function selectModel(page, name, paid = false) {
  await page.getByRole('button', { name: 'Select a model...' }).click();
  if (paid) {
    page.once('dialog', dialog => dialog.accept());
    await page.getByText('Include paid models', { exact: true }).click();
  }
  await page.getByRole('button', { name: `Select ${name}`, exact: true }).click();
}
