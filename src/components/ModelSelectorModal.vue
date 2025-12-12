<script setup>
const props = defineProps({
  show: { type: Boolean, default: false },
  models: { type: Array, default: () => [] },
  includePaid: { type: Boolean, default: false },
  sort: { type: String, default: 'newest' },
  filter: { type: String, default: 'all' },
  search: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  selectedModelId: { type: String, default: '' }
});

const emit = defineEmits([
  'close',
  'select',
  'update:includePaid',
  'update:sort',
  'update:filter',
  'update:search'
]);

const onIncludePaidChange = (event) => emit('update:includePaid', event.target.checked);
const onSortChange = (event) => emit('update:sort', event.target.value);
const onFilterClick = (value) => emit('update:filter', value);
const onSearchInput = (event) => emit('update:search', event.target.value);
</script>

<template>
  <div v-if="show" class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" @click.self="emit('close')">
    <div class="modal-content model-selector-content">
      <div class="modal-header">
        <h2 id="modal-title">Select Model</h2>
        <button class="modal-close" aria-label="Close modal" @click="emit('close')">&times;</button>
      </div>      <div class="modal-body">
        <div class="search-section">
          <input :value="search" type="text" placeholder="Search models by name, provider, or capabilities..." @input="onSearchInput" />
          <div class="model-controls-section">
            <div class="model-toggle-section">
              <div class="toggle-container">
                <label class="toggle-label">
                  <input type="checkbox" class="toggle-input" :checked="includePaid" @change="onIncludePaidChange" />
                  <span class="toggle-slider"></span>
                  <span class="toggle-text">Include paid models</span>
                </label>
              </div>
            </div>
            <div class="sort-section">
              <label class="sort-label">Sort by:</label>
              <select :value="sort" class="sort-select" @change="onSortChange">
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="context-high">Context (Highest)</option>
                <option value="context-low">Context (Lowest)</option>
                <option value="name">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
              </select>
            </div>
          </div>
          <div class="filter-buttons">
            <button
              v-for="btn in ['all','text','image','multimodal']"
              :key="btn"
              class="filter-btn"
              :class="{ active: filter === btn }"
              @click="onFilterClick(btn)"
            >{{ btn === 'all' ? 'All' : btn.charAt(0).toUpperCase() + btn.slice(1) }}</button>
          </div>
        </div>
        <div class="models-grid">
          <div
            v-for="model in models"
            :key="model.id"
            class="model-card"
            :class="{ selected: selectedModelId === model.id }"
            tabindex="0"
            role="button"
            :aria-label="`Select ${model.name}`"
            @click="emit('select', model)"
            @keydown.enter="emit('select', model)"
            @keydown.space.prevent="emit('select', model)"
          >
            <div class="model-provider">{{ model.id.split('/')[0] }}</div>
            <div class="model-name">{{ model.name }}</div>
            <div class="model-id">{{ model.id }}</div>
            <div class="model-description">{{ model.description || 'No description available' }}</div>
            <div class="model-capabilities">
              <span
                v-for="cap in model.capabilities"
                :key="cap"
                class="capability-tag"
                :class="cap"
              >{{ cap.charAt(0).toUpperCase() + cap.slice(1) }}</span>
            </div>
            <div class="model-pricing">{{ model.isFree ? 'Free' : 'Paid' }}</div>
            <div class="model-context">Context: {{ model.context_length || 'Unknown' }} tokens</div>
            <div class="model-metrics">
              <span class="metric-item">Created: {{ model.created ? new Date(model.created * 1000).toLocaleDateString() : 'Unknown' }}</span>
            </div>
            <div class="model-actions">
              <a :href="model.modelUrl" target="_blank" rel="noopener" @click.stop>Model page</a>
              <a :href="model.chatUrl" target="_blank" rel="noopener" @click.stop>Open chat</a>
            </div>
          </div>
        </div>      </div>
    </div>
  </div>
</template>

