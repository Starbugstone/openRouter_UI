<script setup>
import { money } from '../utils/pricing';
defineProps({ auth: { type: Object, required: true } });
</script>

<template>
  <section class="auth-panel" aria-label="OpenRouter account" aria-live="polite">
    <h2>OpenRouter account</h2>
    <template v-if="auth.isConnected.value">
      <p><strong>Connected</strong><span v-if="auth.keyStatus.value"> · {{ auth.keyStatus.value.label }}</span></p>
      <p class="spend-state">{{ auth.spendState.value }}</p>
      <dl v-if="auth.keyStatus.value" class="account-details">
        <dt>Usage</dt><dd>{{ money(auth.keyStatus.value.usage) }}</dd>
        <dt>Daily / weekly / monthly</dt><dd>{{ money(auth.keyStatus.value.usage_daily) }} / {{ money(auth.keyStatus.value.usage_weekly) }} / {{ money(auth.keyStatus.value.usage_monthly) }}</dd>
        <dt>Remaining</dt><dd>{{ auth.keyStatus.value.limit_remaining === null ? 'No per-key limit' : money(auth.keyStatus.value.limit_remaining) }}</dd>
        <dt>Limit reset</dt><dd>{{ auth.keyStatus.value.limit_reset || 'None' }}</dd>
        <dt>Free tier</dt><dd>{{ auth.keyStatus.value.is_free_tier === true ? 'Yes' : auth.keyStatus.value.is_free_tier === false ? 'No' : 'Unknown' }}</dd>
        <dt>Expiry</dt><dd>{{ auth.keyStatus.value.expires_at || 'None' }}</dd>
      </dl>
      <div class="account-actions">
        <button class="btn secondary" :disabled="auth.statusLoading.value" @click="auth.checkStatus">{{ auth.statusLoading.value ? 'Refreshing…' : 'Refresh status' }}</button>
        <button class="btn secondary" @click="auth.disconnect">Disconnect</button>
      </div>
      <p class="account-links"><a :href="auth.manageUrl.value" target="_blank" rel="noopener noreferrer">Manage OpenRouter key</a> · <a :href="auth.usageUrl.value" target="_blank" rel="noopener noreferrer">View OpenRouter usage</a></p>
    </template>
    <template v-else>
      <p class="muted small">Authorize on OpenRouter to connect your account.</p>
      <button class="btn" :disabled="auth.isInitializing.value || auth.isAuthorizing.value" @click="auth.connect">{{ auth.isInitializing.value ? 'Loading connection…' : auth.isAuthorizing.value ? 'Connecting…' : 'Connect with OpenRouter' }}</button>
    </template>
    <p v-if="auth.authError.value" class="error" role="alert">{{ auth.authError.value }}</p>
    <p v-if="auth.statusError.value" class="error" role="alert">{{ auth.statusError.value }}</p>
    <p v-if="auth.billingError.value" class="error" role="alert">{{ auth.billingError.value }} <a :href="auth.manageUrl.value" target="_blank" rel="noopener noreferrer">Manage key on OpenRouter</a> · <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener noreferrer">Add credits</a></p>
    <p class="muted small">Your connection is saved in this browser. Page scripts can access the stored key. Disconnect removes it here; revoke it on OpenRouter to disable it everywhere.</p>
  </section>
</template>
