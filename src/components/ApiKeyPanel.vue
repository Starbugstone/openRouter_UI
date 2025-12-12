<script setup>
const props = defineProps({
  apiKey: { type: String, default: '' },
  rememberKey: { type: Boolean, default: false },
  status: { type: String, default: '' },
  loading: { type: Boolean, default: false }
});

const emit = defineEmits(['update:apiKey', 'update:rememberKey', 'check']);

const onApiKeyInput = (event) => {
  emit('update:apiKey', event.target.value);
};

const onRememberChange = (event) => {
  emit('update:rememberKey', event.target.checked);
};

const onCheck = () => emit('check');
</script>

<template>
  <div>
    <label for="api-key-input">OpenRouter API Key</label>
    <div style="display: flex; gap: 8px; align-items: flex-start;">
      <input
        id="api-key-input"
        :value="apiKey"
        type="password"
        placeholder="sk-or-v1-..."
        style="flex: 1;"
        @input="onApiKeyInput"
      />      <button
        class="btn secondary"
        style="padding: 10px 12px; white-space: nowrap;"
        :disabled="loading"
        @click="onCheck"
      >
        {{ loading ? 'Checking...' : 'Check Status' }}
      </button>
    </div>
    <div class="switch" style="margin-top:8px">
      <label class="pill">
        <input type="checkbox" :checked="rememberKey" @change="onRememberChange" />
        Remember key (localStorage) ⚠️
      </label>
      <div class="muted small" style="margin-top: 4px;">
        Warning: Storing API keys in localStorage may expose them to XSS attacks.
      </div>
    </div>    <div v-if="status" class="muted small" style="margin-top: 8px;" role="status" aria-live="polite">
      {{ status }}
    </div>  </div>
</template>


