<script setup>
import { computed } from 'vue';

const props = defineProps({
  branches: { type: Array, default: () => [] },
  activeBranchId: { type: String, default: '' }
});

const emit = defineEmits(['select', 'clone']);

const flattened = computed(() => {
  const buildList = (nodes, depth = 0) => {
    return nodes.flatMap(node => {
      const self = { ...node, depth };
      const children = node.children ? buildList(node.children, depth + 1) : [];
      return [self, ...children];
    });
  };
  return buildList(props.branches);
});
</script>

<template>
  <div class="branch-panel">
    <div class="branch-header">
      <h3>Branches</h3>
      <button class="btn secondary btn-compact" @click="emit('clone')">Clone branch</button>
    </div>
    <div v-if="!flattened.length" class="muted small">No branches yet.</div>
    <div v-else class="branch-list">
      <div
        v-for="branch in flattened"
        :key="branch.id"
        class="branch-row"
        :class="{ active: branch.id === activeBranchId }"
        :style="{ marginLeft: `${branch.depth * 16}px` }"
      >
        <div class="branch-meta">
          <div class="branch-title">{{ branch.title }}</div>
          <div class="branch-info muted small">
            Forked {{ branch.forkFromMessageIndex !== null ? `from message #${branch.forkFromMessageIndex + 1}` : 'at root' }} ·
            Updated {{ new Date(branch.updatedAt).toLocaleString() }}
          </div>
        </div>
        <button class="btn secondary btn-compact" @click="emit('select', branch.id)">
          {{ branch.id === activeBranchId ? 'Active' : 'Select' }}
        </button>
      </div>
    </div>
  </div>
</template>
