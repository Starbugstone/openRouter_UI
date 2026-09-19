import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { useOpenRouterAuth } from '../../src/composables/useOpenRouterAuth';
import { AUTH_STORAGE as keys } from '../../src/config/openrouter';
import AuthPanel from '../../src/components/AuthPanel.vue';
import { createChallenge } from '../../src/utils/pkce';

const secret = 'test-oauth-credential-never-display';
const paid = { id: 'test/paid', name: 'Paid model', pricing: { prompt: '0.01', completion: '0.02' } };
const free = { id: 'test/free', pricing: { prompt: '0', completion: '0' } };
const status = { label: 'Test connection', limit: 10, limit_remaining: 8, usage: 2, usage_daily: 1, usage_weekly: 2, usage_monthly: 2, is_free_tier: false, limit_reset: 'monthly', expires_at: null };
let scope;
function store() { scope = effectScope(); return scope.run(useOpenRouterAuth); }
function mockStatus(data = status, code = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data }), { status: code }));
}
function callback(search = '?code=once&state=nonce&keep=yes#chat') {
  sessionStorage.setItem(keys.verifier, 'verifier');
  sessionStorage.setItem(keys.state, 'nonce');
  window.history.replaceState({}, '', search);
}
afterEach(() => { scope?.stop(); vi.unstubAllGlobals(); });

describe('OAuth lifecycle', () => {
  it.each(['http://localhost:61234/app/', 'https://future.example/playground/'])('derives an S256 callback from deployment %s', async href => {
    const location = new URL(href);
    location.assign = vi.fn();
    vi.stubGlobal('window', { location, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const auth = store(); await auth.initialize(); await auth.connect();
    const url = new URL(location.assign.mock.calls[0][0]);
    const callbackUrl = new URL(url.searchParams.get('callback_url'));
    expect(callbackUrl.origin + callbackUrl.pathname).toBe(href);
    expect(callbackUrl.searchParams.get('state')).toBe(sessionStorage.getItem(keys.state));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(await createChallenge(sessionStorage.getItem(keys.verifier)));
    expect(localStorage.length).toBe(0);
    expect(auth.isAuthorizing.value).toBe(true);
  });
  it('deletes legacy credentials without reading or using them', async () => {
    localStorage.setItem('or_api_key', 'legacy-secret');
    localStorage.setItem('or_remember_key', 'true');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const fetch = mockStatus();
    const auth = store(); await auth.initialize();
    expect(auth.isConnected.value).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(read.mock.calls.flat()).not.toContain('or_api_key');
    expect(localStorage.getItem('or_api_key')).toBeNull();
    expect(localStorage.getItem('or_remember_key')).toBeNull();
  });
  it('consumes a callback once, persists only the key, cleans the URL and loads status', async () => {
    callback();
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: secret })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: status })));
    const auth = store(); await Promise.all([auth.initialize(), auth.initialize()]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toMatch(/\/auth\/keys$/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ code: 'once', code_verifier: 'verifier', code_challenge_method: 'S256' });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${secret}`);
    expect(localStorage.getItem(keys.credential)).toBe(secret);
    expect(sessionStorage.length).toBe(0);
    expect(window.location.search).toBe('?keep=yes');
    expect(window.location.hash).toBe('#chat');
    expect(auth.isConnected.value).toBe(true);
    expect(auth.keyHash.value).toMatch(/^[a-f0-9]{64}$/);
    expect(auth.manageUrl.value).not.toContain(secret);
    const panel = mount(AuthPanel, { props: { auth } });
    expect(panel.text()).toContain('Connected');
    expect(panel.html()).not.toContain(secret);
    expect(panel.find('input').exists()).toBe(false);
    panel.unmount();
  });
  it.each(['?code=once&state=wrong', '?code=once', '?state=nonce', '?error=access_denied&state=nonce', '?code=one&code=two&state=nonce', '?code=one&state=nonce&state=nonce'])('rejects invalid or cancelled callback %s without exchanging', async search => {
    callback(search); const fetch = mockStatus(); const auth = store(); await auth.initialize();
    expect(fetch).not.toHaveBeenCalled(); expect(auth.isConnected.value).toBe(false);
    expect(auth.authError.value).toContain('Connect with OpenRouter again');
    expect(sessionStorage.length).toBe(0); expect(window.location.search).toBe('');
  });
  it('rejects missing verifier', async () => {
    callback(); sessionStorage.removeItem(keys.verifier);
    const fetch = mockStatus(); await store().initialize(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([400, 403, 500, 'network'])('does not retry failed exchange: %s', async code => {
    callback(); const fetch = vi.spyOn(globalThis, 'fetch');
    if (code === 'network') fetch.mockRejectedValue(new Error(secret));
    else fetch.mockResolvedValue(new Response(secret, { status: code }));
    const auth = store(); await auth.initialize();
    expect(fetch).toHaveBeenCalledTimes(1); expect(auth.authError.value).not.toContain(secret);
    expect(localStorage.getItem(keys.credential)).toBeNull(); expect(sessionStorage.length).toBe(0);
    expect(window.location.search).toBe('?keep=yes');
  });
  it('cannot resurrect a callback after disconnect while exchange is pending', async () => {
    callback(); let resolve;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const auth = store(); const pending = auth.initialize();
    auth.disconnect(); resolve(new Response(JSON.stringify({ key: secret })));
    await pending; expect(auth.isConnected.value).toBe(false);
    expect(localStorage.getItem(keys.credential)).toBeNull();
  });
  it('redacts a key echoed in account metadata', async () => {
    localStorage.setItem(keys.credential, secret); mockStatus({ ...status, label: secret, limit_reset: secret });
    const auth = store(); await auth.initialize();
    const panel = mount(AuthPanel, { props: { auth } });
    expect(panel.html()).not.toContain(secret); panel.unmount();
  });
  it('restores a persisted connection and disconnects locally', async () => {
    localStorage.setItem(keys.credential, secret); mockStatus();
    const auth = store(); await auth.initialize(); expect(auth.requireCredential()).toBe(secret);
    auth.disconnect(); expect(localStorage.getItem(keys.credential)).toBeNull();
    expect(auth.isConnected.value).toBe(false); expect(() => auth.requireCredential()).toThrow(/Connect/);
  });
  it.each([401, 'expired'])('removes revoked/expired keys: %s', async kind => {
    localStorage.setItem(keys.credential, secret);
    mockStatus({ ...status, expires_at: kind === 'expired' ? '2000-01-01' : null }, kind === 401 ? 401 : 200);
    const auth = store(); await auth.initialize();
    expect(auth.isConnected.value).toBe(false); expect(localStorage.getItem(keys.credential)).toBeNull();
  });
  it('keeps the connection on temporary status failures but blocks paid usage', async () => {
    localStorage.setItem(keys.credential, secret); mockStatus({}, 500);
    const auth = store(); await auth.initialize();
    expect(auth.isConnected.value).toBe(true); expect(auth.spendAllowed.value).toBe(false);
    expect(await auth.beforeRequest(free)).toBe(true);
  });
  it('synchronizes storage changes and ignores stale status responses after logout', async () => {
    mockStatus(); const auth = store(); await auth.initialize();
    localStorage.setItem(keys.credential, secret);
    window.dispatchEvent(new StorageEvent('storage', { key: keys.credential, storageArea: localStorage }));
    await flushPromises(); expect(auth.isConnected.value).toBe(true);
    let resolve;
    fetch.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const pending = auth.checkStatus();
    localStorage.removeItem(keys.credential);
    window.dispatchEvent(new StorageEvent('storage', { key: keys.credential, storageArea: localStorage }));
    resolve(new Response(JSON.stringify({ data: status }))); await pending;
    expect(auth.isConnected.value).toBe(false); expect(auth.keyStatus.value).toBeNull();
  });
});

describe('paid request safeguards', () => {
  it.each([{ limit: 0, limit_remaining: 0 }, { limit: 10, limit_remaining: 0 }, { limit: 10, limit_remaining: -1 }, {}])('blocks paid, permits free with status %j', async data => {
    localStorage.setItem(keys.credential, secret); mockStatus(data);
    const confirm = vi.spyOn(window, 'confirm'); const auth = store(); await auth.initialize();
    expect(await auth.beforeRequest(paid)).toBe(false); expect(confirm).not.toHaveBeenCalled();
    expect(await auth.beforeRequest(free)).toBe(true);
  });
  it('requires confirmation once per model/pricing/limit and shows uncapped warning', async () => {
    localStorage.setItem(keys.credential, secret); mockStatus({ ...status, limit: null, limit_remaining: null });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const auth = store(); await auth.initialize();
    expect(await auth.beforeRequest(paid)).toBe(false);
    expect(await auth.beforeRequest(paid)).toBe(true);
    expect(await auth.beforeRequest(paid)).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm.mock.calls[0][0]).toContain('no per-key spend limit');
    expect(confirm.mock.calls[0][0]).toContain('$0.01 / input token');
    await auth.beforeRequest({ ...paid, id: 'other' }); expect(confirm).toHaveBeenCalledTimes(3);
  });
  it('keeps valid keys on billing errors, but clears revoked keys on completion 401', async () => {
    localStorage.setItem(keys.credential, secret); const fetch = mockStatus(); const auth = store(); await auth.initialize();
    await auth.handleRequestError({ kind: 'billing', message: 'Credits exhausted' }, secret);
    expect(auth.billingError.value).toBe('Credits exhausted'); expect(auth.isConnected.value).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    await auth.handleRequestError({ kind: 'auth' }, 'old-key'); expect(auth.isConnected.value).toBe(true);
    await auth.handleRequestError({ kind: 'auth' }, secret); expect(auth.isConnected.value).toBe(false);
  });
});
