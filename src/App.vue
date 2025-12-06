<script setup>
import { ref, computed, onMounted } from 'vue';
import { useModels } from './composables/useModels';
import { useChat } from './composables/useChat';
import { useImages } from './composables/useImages';
import { checkApiKeyStatus, getModelUrl, getChatUrl } from './composables/useApi';

import ApiKeyPanel from './components/ApiKeyPanel.vue';
import ModeSettings from './components/ModeSettings.vue';
import ModelSelectorModal from './components/ModelSelectorModal.vue';
import ChatSidebar from './components/ChatSidebar.vue';
import ChatMessages from './components/ChatMessages.vue';
import ChatInput from './components/ChatInput.vue';
import BranchList from './components/BranchList.vue';

const modelsStore = useModels();
const chatStore = useChat(modelsStore);
const imagesStore = useImages();

const prompt = ref('');
const showModelModal = ref(false);
const apiKeyStatus = ref('');
const apiKeyStatusLoading = ref(false);
const fileInput = ref(null);

const selectedModelName = computed(() => modelsStore.selectedModel.value?.name || 'Select a model...');

const regenHistory = computed(() => chatStore.regenerations.value?.history || []);
const regenIndex = computed(() => chatStore.regenerations.value?.currentIndex ?? -1);

const selectedModelLinks = computed(() => {
  const model = modelsStore.selectedModel.value;
  if (!model) return null;
  return {
    name: model.name,
    modelUrl: getModelUrl(model.id),
    chatUrl: getChatUrl(model.id)
  };
});

onMounted(async () => {
  const savedKey = localStorage.getItem('or_api_key');
  const remember = localStorage.getItem('or_remember_key') === 'true';
  if (savedKey && remember) {
    chatStore.apiKey.value = savedKey;
    chatStore.rememberKey.value = true;
  }
  await modelsStore.load();
  await chatStore.init();
});

const handleSend = async () => {
  if (!chatStore.apiKey.value) {
    alert('Please paste your OpenRouter API key.');
    return;
  }
  if (!prompt.value.trim() && imagesStore.uploadedImages.value.length === 0) {
    alert('Please write a message or upload an image.');
    return;
  }
  await chatStore.sendMessage({
    prompt: prompt.value.trim(),
    images: imagesStore.uploadedImages.value,
    apiKeyValue: chatStore.apiKey.value
  });
  prompt.value = '';
  imagesStore.clearImages();
};

const handleRegenerate = async () => {
  if (!chatStore.apiKey.value) {
    alert('Please paste your OpenRouter API key.');
    return;
  }
  await chatStore.regenerate({
    apiKeyValue: chatStore.apiKey.value
  });
};

const handleBranchSelect = async (index) => {
  await chatStore.regenerateFromBranch(index);
};

const handleModelCardClick = (model) => {
  modelsStore.select(model);
  showModelModal.value = false;
  chatStore.chatWarning.value = '';
  chatStore.persist();
};

const handleIncludePaidChange = (event) => {
  modelsStore.includePaid.value = event.target.checked;
};

const handleRememberKeyChange = () => {
  localStorage.setItem('or_remember_key', chatStore.rememberKey.value ? 'true' : 'false');
  if (!chatStore.rememberKey.value) {
    localStorage.removeItem('or_api_key');
  } else if (chatStore.apiKey.value) {
    localStorage.setItem('or_api_key', chatStore.apiKey.value);
  }
};

const handleApiKeyInput = () => {
  if (chatStore.rememberKey.value) {
    localStorage.setItem('or_api_key', chatStore.apiKey.value || '');
  }
};

const checkKeyStatus = async () => {
  if (!chatStore.apiKey.value) {
    alert('Please enter your OpenRouter API key first.');
    return;
  }
  apiKeyStatusLoading.value = true;
  apiKeyStatus.value = 'Checking API key status...';
  try {
    const data = await checkApiKeyStatus(chatStore.apiKey.value);
    const keyData = data.data || {};
    apiKeyStatus.value = `Label: ${keyData.label || 'Unnamed'} · Spend: $${(keyData.usage || 0).toFixed(2)} / ${keyData.limit === null ? '∞' : `$${keyData.limit.toFixed(2)}`} · Remaining: ${keyData.limit_remaining !== null ? `$${keyData.limit_remaining.toFixed(2)}` : 'n/a'}`;
  } catch (e) {
    apiKeyStatus.value = `Error: ${e.message}`;
  } finally {
    apiKeyStatusLoading.value = false;
  }
};

const newChat = async () => {
  const chat = await chatStore.createChat();
  await chatStore.selectChat(chat.id);
};
</script>

<template>
  <div class="wrap">
    <h1>OpenRouter Mini Playground</h1>

    <div class="card">
      <div class="row">
        <div style="flex:1 1 320px;">
          <ApiKeyPanel
            :api-key="chatStore.apiKey.value"
            :remember-key="chatStore.rememberKey.value"
            :status="apiKeyStatus"
            :loading="apiKeyStatusLoading"
            @update:apiKey="value => { chatStore.apiKey.value = value; handleApiKeyInput(); }"
            @update:rememberKey="value => { chatStore.rememberKey.value = value; handleRememberKeyChange(); }"
            @check="checkKeyStatus"
          />
        </div>
        <div style="flex:1 1 240px;">
          <ModeSettings
            :mode="chatStore.mode.value"
            :stream="chatStore.stream.value"
            :timeout-sec="chatStore.timeoutSec.value"
            :img-count="chatStore.imgCount.value"
            @update:mode="val => { chatStore.mode.value = val; chatStore.persist(); }"
            @update:stream="val => { chatStore.stream.value = val; chatStore.persist(); }"
            @update:timeoutSec="val => { chatStore.timeoutSec.value = val; chatStore.persist(); }"
            @update:imgCount="val => { chatStore.imgCount.value = val; chatStore.persist(); }"
          />
        </div>
      </div>

      <div class="row" style="margin-top:12px">
        <div style="flex: 1 1 300px;">
          <label>Model Selection</label>
          <div style="position: relative;">
            <button class="btn secondary" style="width: 100%; text-align: left; justify-content: space-between; display: flex; align-items: center;" @click="showModelModal = true">
              <span>{{ selectedModelName }}</span>
              <span style="font-size: 12px;">▼</span>
            </button>
          </div>
          <div class="muted small" style="margin-top:6px">
            <strong>Models:</strong> {{ modelsStore.filteredModels.value.length }} available models.
            <button type="button" class="btn secondary" style="padding: 4px 8px; font-size: 11px; margin-left: 8px;" @click="modelsStore.load">
              {{ modelsStore.loading.value ? 'Loading...' : 'Refresh' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card chat-container">
      <div class="chat-layout">
        <ChatSidebar
          :chats="chatStore.chats.value"
          :active-chat-id="chatStore.activeChatId.value"
          @select="chatStore.selectChat"
          @new="newChat"
          @delete="chatStore.deleteChat"
        />

        <div class="chat-main">
          <div class="chat-header">
            <label>Chat</label>
            <div class="chat-actions">
              <button class="btn secondary" :disabled="chatStore.streaming.value" @click="handleRegenerate">Regenerate</button>
            </div>
          </div>

          <div v-if="chatStore.chatWarning.value" class="chat-warning">{{ chatStore.chatWarning.value }}</div>

          <ChatMessages :messages="chatStore.messages.value" />

          <ChatInput
            :prompt="prompt"
            :images="imagesStore.uploadedImages.value"
            :disabled="chatStore.streaming.value"
            @update:prompt="val => (prompt.value = val)"
            @add-images="files => imagesStore.handleFiles(files)"
            @remove-image="dataUrl => imagesStore.removeImage(dataUrl)"
            @send="handleSend"
          />

          <BranchList
            :history="regenHistory"
            :current-index="regenIndex"
            @select="handleBranchSelect"
          />
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 8px;">
      <div v-if="selectedModelLinks" class="muted small model-links">
        Selected model: <strong>{{ selectedModelLinks.name }}</strong> ·
        <a :href="selectedModelLinks.modelUrl" target="_blank" rel="noopener">Model page</a> ·
        <a :href="selectedModelLinks.chatUrl" target="_blank" rel="noopener">Open chat</a>
      </div>
      <div class="muted small">
        Docs:
        <a href="https://openrouter.ai/docs/quickstart" target="_blank" rel="noopener">Quickstart</a> ·
        <a href="https://openrouter.ai/docs/features/multimodal/image-generation" target="_blank" rel="noopener">Image Gen via chat</a> ·
        <a href="https://openrouter.ai/models" target="_blank" rel="noopener">Models</a>
      </div>
    </div>

    <ModelSelectorModal
      :show="showModelModal"
      :models="modelsStore.filteredModels.value.map(m => ({
        ...m,
        capabilities: modelsStore.getCapabilities(m),
        isFree: modelsStore.isFreeModel(m),
        modelUrl: getModelUrl(m.id),
        chatUrl: getChatUrl(m.id)
      }))"
      :include-paid="modelsStore.includePaid.value"
      :sort="modelsStore.sort.value"
      :filter="modelsStore.filter.value"
      :search="modelsStore.search.value"
      :loading="modelsStore.loading.value"
      :selected-model-id="modelsStore.selectedModel.value?.id || ''"
      @close="showModelModal = false"
      @select="handleModelCardClick"
      @update:includePaid="val => { modelsStore.includePaid.value = val; }"
      @update:sort="val => { modelsStore.sort.value = val; }"
      @update:filter="val => { modelsStore.filter.value = val; }"
      @update:search="val => { modelsStore.search.value = val; }"
    />
  </div>
</template>
