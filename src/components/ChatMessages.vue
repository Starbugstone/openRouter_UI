<script setup>
const props = defineProps({
  messages: { type: Array, default: () => [] }
});
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
        />      </div>
      <div v-if="msg.timestamp" class="message-time">
        {{ new Date(msg.timestamp).toLocaleTimeString() }}
      </div>    </div>
  </div>
</template>
