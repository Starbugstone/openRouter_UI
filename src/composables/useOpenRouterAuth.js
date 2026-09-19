import { computed, onScopeDispose, ref } from 'vue';
import { APP_NAME } from '../config/app';
import { AUTH_STORAGE, AUTH_URL } from '../config/openrouter';
import { checkApiKeyStatus, exchangeAuthorizationCode } from './useApi';
import { createChallenge, keyDigest, randomSecret } from '../utils/pkce';
import { isZeroCostModel, money, pricingSummary, spendSummary } from '../utils/pricing';

export function useOpenRouterAuth() {
  // Keep the raw credential private to this store and the transport boundary.
  const credential = ref('');
  const isInitializing = ref(true);
  const isAuthorizing = ref(false);
  const statusLoading = ref(false);
  const authError = ref('');
  const statusError = ref('');
  const billingError = ref('');
  const keyStatus = ref(null);
  const keyHash = ref('');
  const confirmedModels = new Set();
  let revision = 0;
  let statusRequest = 0;
  let initialization;

  const isConnected = computed(() => Boolean(credential.value));
  const spendState = computed(() => spendSummary(keyStatus.value));
  const spendAllowed = computed(() => {
    const data = keyStatus.value;
    return Boolean(data && data.limit !== 0 &&
      !(Number.isFinite(data.limit_remaining) && data.limit_remaining <= 0) &&
      (data.limit === null || (Number.isFinite(data.limit) && data.limit > 0 && Number.isFinite(data.limit_remaining))));
  });
  const manageUrl = computed(() => keyHash.value ? `https://openrouter.ai/keys/${keyHash.value}` : 'https://openrouter.ai/settings/keys');
  const usageUrl = computed(() => keyHash.value ? `https://openrouter.ai/logs?api_key_hash=${keyHash.value}` : 'https://openrouter.ai/activity');

  function clearPending() {
    try {
      sessionStorage.removeItem(AUTH_STORAGE.verifier);
      sessionStorage.removeItem(AUTH_STORAGE.state);
    } catch { /* Storage may have been disabled during authorization. */ }
  }

  function cleanCallbackUrl() {
    const url = new URL(window.location.href);
    for (const param of ['code', 'state', 'error', 'error_description', 'error_uri']) url.searchParams.delete(param);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function adoptCredential(value) {
    const current = ++revision;
    credential.value = value || '';
    keyStatus.value = null;
    keyHash.value = '';
    statusError.value = '';
    billingError.value = '';
    authError.value = '';
    confirmedModels.clear();
    statusLoading.value = false;
    if (value) {
      // Hashing is only needed for management links; it must not prevent validation.
      const hashing = keyDigest(value).then(hash => {
        if (current === revision) keyHash.value = hash;
      }).catch(() => {});
      await Promise.all([hashing, checkStatus()]);
    }
  }

  function disconnect() {
    revision++;
    credential.value = '';
    keyStatus.value = null;
    keyHash.value = '';
    confirmedModels.clear();
    billingError.value = '';
    statusError.value = '';
    authError.value = '';
    isAuthorizing.value = false;
    statusLoading.value = false;
    try { localStorage.removeItem(AUTH_STORAGE.credential); }
    catch { authError.value = 'Could not remove the saved connection. Clear this site’s browser data to finish disconnecting.'; }
    clearPending();
  }

  async function checkStatus() {
    if (!credential.value) return;
    const current = revision;
    const request = ++statusRequest;
    statusLoading.value = true;
    statusError.value = '';
    try {
      const { data } = await checkApiKeyStatus(credential.value);
      if (current !== revision || request !== statusRequest) return;
      if (!data || typeof data !== 'object') throw new Error('Invalid status response');
      if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) {
        disconnect();
        authError.value = 'Your OpenRouter key has expired. Connect again to continue.';
        return;
      }
      // Allowlist metadata, and never render a provider label containing the raw key.
      const status = {};
      for (const name of ['limit', 'limit_remaining', 'limit_reset', 'usage', 'usage_daily', 'usage_weekly', 'usage_monthly', 'is_free_tier', 'expires_at']) {
        status[name] = typeof data[name] === 'string' ? data[name].replaceAll(credential.value, '[hidden]') : data[name];
      }
      status.label = typeof data.label === 'string' ? data.label.replaceAll(credential.value, '[hidden]') : APP_NAME;
      keyStatus.value = status;
      return true;
    } catch (error) {
      if (current !== revision || request !== statusRequest) return;
      keyStatus.value = null;
      if (error.kind === 'auth') {
        disconnect();
        authError.value = 'Your OpenRouter key is invalid or revoked. Connect again to continue.';
      } else {
        statusError.value = 'Could not refresh OpenRouter key status. Check your connection and refresh status before paid use.';
      }
    } finally {
      if (current === revision && request === statusRequest) statusLoading.value = false;
    }
  }

  async function connect() {
    if (isAuthorizing.value || isInitializing.value) return;
    isAuthorizing.value = true;
    authError.value = '';
    const current = revision;
    try {
      clearPending();
      const verifier = randomSecret();
      const state = randomSecret();
      const challenge = await createChallenge(verifier);
      if (current !== revision) return;
      sessionStorage.setItem(AUTH_STORAGE.verifier, verifier);
      sessionStorage.setItem(AUTH_STORAGE.state, state);
      // OpenRouter documents callback_url, but no echoed OAuth state parameter.
      // Bind our nonce into that callback URL and validate it before exchanging.
      const callback = new URL(window.location.origin + window.location.pathname);
      callback.searchParams.set('state', state);
      const url = new URL(AUTH_URL);
      url.search = new URLSearchParams({ callback_url: callback.href, code_challenge: challenge, code_challenge_method: 'S256', key_label: APP_NAME });
      window.location.assign(url.href);
    } catch {
      clearPending();
      isAuthorizing.value = false;
      authError.value = 'Could not start authorization. Enable browser storage and use HTTPS or localhost, then connect again.';
    }
  }

  async function handleOAuthCallback(params) {
    const current = revision;
    isAuthorizing.value = true;
    try {
      const state = sessionStorage.getItem(AUTH_STORAGE.state);
      const verifier = sessionStorage.getItem(AUTH_STORAGE.verifier);
      if (params.has('error') || !params.get('code')) throw new Error('cancelled');
      if (!verifier || !state || params.getAll('state').length !== 1 || params.get('state') !== state || params.getAll('code').length !== 1) throw new Error('invalid callback');
      // Consume the transaction before awaiting any network operation: no code retries.
      clearPending();
      cleanCallbackUrl();
      const key = await exchangeAuthorizationCode({ code: params.get('code'), codeVerifier: verifier });
      if (current !== revision) return;
      localStorage.setItem(AUTH_STORAGE.credential, key);
      await adoptCredential(key);
    } catch {
      if (current === revision) authError.value = 'Authorization was cancelled, expired, or could not be verified. Connect with OpenRouter again to start a new authorization.';
    } finally {
      clearPending();
      cleanCallbackUrl();
      isAuthorizing.value = false;
    }
  }

  function initialize() {
    if (initialization) return initialization;
    initialization = (async () => {
      try {
        localStorage.removeItem('or_api_key');
        localStorage.removeItem('or_remember_key');
        const params = new URLSearchParams(window.location.search);
        if (['code', 'state', 'error'].some(name => params.has(name)) || sessionStorage.getItem(AUTH_STORAGE.state) || sessionStorage.getItem(AUTH_STORAGE.verifier)) {
          await handleOAuthCallback(params);
        } else {
          await adoptCredential(localStorage.getItem(AUTH_STORAGE.credential));
        }
      } catch {
        authError.value = 'Browser storage is unavailable. Enable local storage and connect again.';
        cleanCallbackUrl();
      } finally {
        isInitializing.value = false;
      }
    })();
    return initialization;
  }

  function requireCredential() {
    if (isInitializing.value || isAuthorizing.value || !credential.value) {
      throw Object.assign(new Error('Connect with OpenRouter to send messages.'), { kind: 'auth' });
    }
    return credential.value;
  }

  async function beforeRequest(model, { signal } = {}) {
    requireCredential();
    if (signal?.aborted) return false;
    billingError.value = '';
    if (isZeroCostModel(model)) return true;
    const current = revision;
    const refreshed = await checkStatus();
    requireCredential();
    if (current !== revision || signal?.aborted) return false;
    if (!refreshed || !spendAllowed.value) {
      billingError.value = `${spendState.value} Manage your key on OpenRouter to enable paid usage.`;
      return false;
    }
    const signature = JSON.stringify([model.id, model.pricing, keyStatus.value.limit]);
    if (!confirmedModels.has(signature)) {
      const accepted = window.confirm(`Use paid model ${model.name || model.id}?\n\nOpenRouter will charge your credits.\n${pricingSummary(model)}\n\n${spendState.value}\nRemaining allowance: ${money(keyStatus.value.limit_remaining)}\nAccount credits and workspace controls also apply.\n\nSend this paid request?`);
      if (!accepted) return false;
      confirmedModels.add(signature);
    }
    return true;
  }

  async function handleRequestError(error, requestCredential) {
    if (requestCredential !== credential.value) return;
    if (error.kind === 'auth') {
      disconnect();
      authError.value = 'Your OpenRouter connection is no longer valid. Connect again to continue.';
    } else if (error.kind === 'billing') {
      billingError.value = error.message;
      await checkStatus();
    }
  }

  const onStorage = async () => {
    try {
      isAuthorizing.value = false;
      clearPending();
      await adoptCredential(localStorage.getItem(AUTH_STORAGE.credential));
    } catch { statusError.value = 'Could not synchronize the OpenRouter connection.'; }
  };
  const storageListener = event => {
    if (event.storageArea === window.localStorage && (event.key === AUTH_STORAGE.credential || event.key === null)) onStorage();
  };
  // Returning with the browser Back button can restore the redirecting page from bfcache.
  const pageListener = event => {
    if (event.persisted && isAuthorizing.value) {
      clearPending();
      isAuthorizing.value = false;
      authError.value = 'Authorization was cancelled. Connect again when ready.';
    }
  };
  window.addEventListener('storage', storageListener);
  window.addEventListener('pageshow', pageListener);
  onScopeDispose(() => {
    revision++;
    window.removeEventListener('storage', storageListener);
    window.removeEventListener('pageshow', pageListener);
  });

  return { isConnected, isInitializing, isAuthorizing, statusLoading, authError, statusError, billingError,
    keyStatus, keyHash, spendState, spendAllowed, manageUrl, usageUrl,
    initialize, connect, disconnect, checkStatus, requireCredential, beforeRequest, handleRequestError };
}
