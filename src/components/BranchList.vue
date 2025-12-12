<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  branches: { type: Array, default: () => [] },
  activeBranchId: { type: String, default: '' }
});

const emit = defineEmits(['select', 'clone', 'rename']);

const flattened = computed(() => {
  const sortByCreatedAt = (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0);

  const out = [];
  const walk = (node, depth, ancestorLines, isLast) => {
    const children = Array.isArray(node.children) ? node.children.slice().sort(sortByCreatedAt) : [];
    out.push({
      ...node,
      depth,
      ancestorLines, // array of booleans per ancestor depth: draw vertical line in that column
      isLast: !!isLast,
      hasChildren: children.length > 0
    });

    children.forEach((child, idx) => {
      const childIsLast = idx === children.length - 1;
      walk(child, depth + 1, [...ancestorLines, !isLast], childIsLast);
    });
  };

  const roots = props.branches.slice().sort(sortByCreatedAt);
  roots.forEach((root, idx) => {
    const isLastRoot = idx === roots.length - 1;
    walk(root, 0, [], isLastRoot);
  });

  return out;
});

const editingId = ref(null);
const draftTitle = ref('');

const startRename = (branch) => {
  editingId.value = branch.id;
  draftTitle.value = branch.title || '';
};

const cancelRename = () => {
  editingId.value = null;
  draftTitle.value = '';
};

const commitRename = (branch) => {
  const title = (draftTitle.value || '').trim();
  if (title) {
    emit('rename', branch.id, title);
  }
  cancelRename();
};
</script>

<template>
  <div class="branch-panel">
    <div class="branch-header">
      <h3>Branches</h3>
      <button class="btn secondary btn-compact" @click="emit('clone')">Clone branch</button>
    </div>
    <div v-if="!flattened.length" class="muted small">No branches yet.</div>
    <div v-else class="branch-tree">
      <div
        v-for="branch in flattened"
        :key="branch.id"
        class="branch-tree-row"
        :class="{ active: branch.id === activeBranchId }"
        @click="emit('select', branch.id)"
      >
        <div class="branch-tree-gutter" aria-hidden="true">
          <span v-for="(draw, i) in branch.ancestorLines" :key="i" class="tree-col">
            <span class="tree-vline" :class="{ draw }"></span>
          </span>
          <span class="tree-col tree-self" :class="{ root: branch.depth === 0 }">
            <span class="tree-connector-up" v-if="branch.depth > 0"></span>
            <span class="tree-connector-down" v-if="branch.hasChildren || !branch.isLast"></span>
            <span class="tree-elbow" v-if="branch.depth > 0"></span>
            <span class="tree-dot"></span>
          </span>
        </div>

        <div class="branch-node">
          <div class="branch-meta">
            <div class="branch-title">
              <template v-if="editingId === branch.id">
                <input
                  class="branch-rename-input"
                  type="text"
                  v-model="draftTitle"
                  @click.stop
                  @keydown.enter.prevent="commitRename(branch)"
                  @keydown.esc.prevent="cancelRename"
                  @blur="commitRename(branch)"
                />
              </template>
              <template v-else>
                {{ branch.title }}
              </template>
            </div>
            <div class="branch-info muted small">
              Forked {{ branch.forkFromMessageIndex !== null ? `from message #${branch.forkFromMessageIndex + 1}` : 'at root' }} ·
              Updated {{ new Date(branch.updatedAt).toLocaleString() }}
            </div>
          </div>
          <div class="branch-actions" @click.stop>
            <button
              v-if="editingId !== branch.id"
              class="btn secondary btn-compact"
              title="Rename branch"
              @click="startRename(branch)"
            >
              Rename
            </button>
            <button class="btn secondary btn-compact" @click="emit('select', branch.id)">
              {{ branch.id === activeBranchId ? 'Active' : 'Select' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

