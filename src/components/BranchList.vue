<script setup>
const props = defineProps({
  history: { type: Array, default: () => [] },
  currentIndex: { type: Number, default: -1 }
});

const emit = defineEmits(['select']);
</script>

<template>
  <div class="muted small" style="margin-top: 8px;" v-if="history.length">
    Branches:
    <button
      v-for="(resp, i) in history"
      :key="i"
      class="btn secondary btn-compact"
      :class="{ active: i === currentIndex }"
      @click="emit('select', i)"
    >
      {{ i + 1 }}/{{ history.length }}
    </button>
  </div>
</template>
