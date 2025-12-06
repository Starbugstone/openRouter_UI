import { ref, computed } from 'vue';
import { fetchModels, getModelUrl, getChatUrl } from './useApi';

export function useModels() {
  const allModels = ref([]);
  const includePaid = ref(false);
  const sort = ref('newest');
  const filter = ref('all');
  const search = ref('');
  const selectedModel = ref(null);
  const loading = ref(false);

  const filteredModels = computed(() => {
    const source = includePaid.value ? allModels.value : allModels.value.filter(isFreeModel);
    const sorted = sortModels(source, sort.value);
    const term = search.value.toLowerCase().trim();
    return sorted.filter(m => {
      const matchesFilter = filter.value === 'all' || getCapabilities(m).includes(filter.value);
      const matchesSearch = !term ||
        m.name.toLowerCase().includes(term) ||
        m.id.toLowerCase().includes(term) ||
        (m.description || '').toLowerCase().includes(term) ||
        m.id.split('/')[0].toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });
  });

  const load = async () => {
    if (loading.value) return;
    loading.value = true;
    try {
      allModels.value = await fetchModels();
    } finally {
      loading.value = false;
    }
  };

  const select = (model) => {
    selectedModel.value = model;
  };

  return {
    allModels,
    filteredModels,
    includePaid,
    sort,
    filter,
    search,
    selectedModel,
    loading,
    load,
    select,
    isFreeModel,
    getCapabilities,
    getModelUrl,
    getChatUrl
  };
}

function isFreeModel(model) {
  const pricing = model.pricing || {};
  return pricing.prompt === '0' && pricing.completion === '0';
}

function sortModels(models, sortKey) {
  const arr = [...models];
  switch (sortKey) {
    case 'newest':
      return arr.sort((a, b) => (b.created || 0) - (a.created || 0));
    case 'oldest':
      return arr.sort((a, b) => (a.created || 0) - (b.created || 0));
    case 'context-high':
      return arr.sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
    case 'context-low':
      return arr.sort((a, b) => (a.context_length || 0) - (b.context_length || 0));
    case 'name':
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return arr.sort((a, b) => b.name.localeCompare(a.name));
    default:
      return arr.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function getCapabilities(model) {
  const caps = ['text'];
  const id = model.id.toLowerCase();
  if (id.includes('image') || id.includes('dall-e') || id.includes('midjourney') || id.includes('stable-diffusion')) {
    caps.push('image');
  }
  if (id.includes('vision') || id.includes('multimodal') || id.includes('gpt-4') || id.includes('gemini') || id.includes('claude')) {
    caps.push('multimodal');
  }
  return caps;
}
