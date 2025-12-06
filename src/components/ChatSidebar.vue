<script setup>
const props = defineProps({
  chats: { type: Array, default: () => [] },
  activeChatId: { type: String, default: '' }
});

const emit = defineEmits(['select', 'new', 'delete']);
</script>

<template>
  <aside class="chat-sidebar">
    <div class="chat-sidebar-header">
      <span>Past Chats</span>
      <button class="btn secondary btn-compact" title="Start a new chat" @click="emit('new')">New</button>
    </div>
    <div class="chat-history-list">
      <div
        v-for="chat in chats"
        :key="chat.id"
        class="chat-history-item"
        :class="{ active: chat.id === activeChatId }"
        @click="emit('select', chat.id)"
      >
        <div class="chat-history-title">{{ chat.title }}</div>
        <div class="chat-history-meta">{{ new Date(chat.updatedAt).toLocaleString() }}</div>
        <button class="chat-history-delete" title="Delete chat" @click.stop="emit('delete', chat.id)">🗑️</button>
      </div>
    </div>
  </aside>
</template>
