<script setup>
const props = defineProps({
  messages: { type: Array, default: () => [] },
  fallbackModelName: { type: String, default: 'Unknown model' },
  streaming: { type: Boolean, default: false },
  canRegenerate: { type: Boolean, default: false }
});

const emit = defineEmits(['branch', 'regenerate']);

const modelLabel = (message) => {
  if (message.model?.name) return message.model.name;
  return props.fallbackModelName;
};

const canBranchFrom = (index, message) => {
  if (!message || message.role !== 'user') return false;
  return index > 0;
};

const isLatestAssistant = (index, message) => {
  if (!message || message.role !== 'assistant') return false;
  return index === props.messages.length - 1;
};
</script>

<template>
  <div class="chat-messages">
    <div v-for="(msg, idx) in messages" :key="idx" class="message" :class="msg.role">
      <div class="message-content">{{ msg.content || '[Empty response]' }}</div>
      <div v-if="msg.images && msg.images.length" class="message-images">
        <img
          v-for="(img, i) in msg.images"
          :key="i"
          :src="typeof img === 'string' ? img : img.data"
          :alt="typeof img === 'string' ? 'Chat image' : (img.alt || 'Chat image')"
        />
      </div>
      <div class="message-meta">
        <div v-if="msg.timestamp" class="message-time">
          {{ new Date(msg.timestamp).toLocaleTimeString() }}
        </div>
        <div v-if="msg.role === 'assistant'" class="message-model muted small">{{ modelLabel(msg) }}</div>
        <button
          v-if="canBranchFrom(idx, msg)"
          class="btn secondary btn-compact branch-btn"
          @click="emit('branch', idx)"
        >
          Branch here
        </button>
      </div>

      <div v-if="isLatestAssistant(idx, msg)" class="message-actions">
        <button
          class="btn secondary btn-compact regen-btn"
          :disabled="streaming || !canRegenerate"
          @click="emit('regenerate')"
        >
          Regenerate
        </button>
      </div>
    </div>
  </div>
</template>

