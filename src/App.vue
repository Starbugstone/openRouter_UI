<script setup>
import { ref, computed, onMounted } from 'vue';
import { useModels } from './composables/useModels';
import { useChat } from './composables/useChat';
import { useImages } from './composables/useImages';
import { getModelUrl, getChatUrl } from './composables/useApi';

import AuthPanel from './components/AuthPanel.vue';
import { APP_NAME } from './config/app';
import { isZeroCostModel, pricingSummary } from './utils/pricing';
import { useOpenRouterAuth } from './composables/useOpenRouterAuth';
import ModeSettings from './components/ModeSettings.vue';
import ModelSelectorModal from './components/ModelSelectorModal.vue';
import ChatSidebar from './components/ChatSidebar.vue';
import ChatMessages from './components/ChatMessages.vue';
import ChatInput from './components/ChatInput.vue';
import BranchGraph from './components/BranchGraph.vue';

const authStore = useOpenRouterAuth();
const modelsStore = useModels();
const chatStore = useChat(modelsStore, authStore);
const imagesStore = useImages();

const prompt = ref('');
const showModelModal = ref(false);
const requestError = ref('');
const modelError = ref('');
const appReady = ref(false);

const selectedModelName = computed(() => modelsStore.selectedModel.value?.name || 'Select a model...');

const activeTab = ref('history');
const branchList = computed(() => chatStore.branchTree.value);

const selectedModelLinks = computed(() => {
  const model = modelsStore.selectedModel.value;
  if (!model) return null;
  return {
    name: model.name,
    modelUrl: getModelUrl(model.id),
    chatUrl: getChatUrl(model.id)
  };
});

const loadModels = async () => {
  modelError.value = '';
  try { await modelsStore.load(); }
  catch { modelError.value = 'Could not load models. Check your connection and refresh models.'; }
};

onMounted(async () => {
  document.title = APP_NAME;
  await authStore.initialize();
  await loadModels();
  try { await chatStore.init(); appReady.value = true; }
  catch { requestError.value = 'Could not open chat history. Check browser storage and reload.'; }
});

const runChatAction = async action => {
  requestError.value = '';
  try { return await action(); }
  catch (error) {
    if (!['auth', 'billing'].includes(error.kind)) requestError.value = error.kind ? error.message : 'Could not send the request. Check your connection and selected model. No automatic retry was made.';
    else if (error.kind === 'auth' && !authStore.authError.value) authStore.authError.value = 'Connect with OpenRouter to send messages.';
    return false;
  }
};

const handleSend = async () => {
  if (!prompt.value.trim() && !imagesStore.uploadedImages.value.length) return;
  const sent = await runChatAction(() => chatStore.sendMessage({ prompt: prompt.value.trim(), images: imagesStore.uploadedImages.value }));
  if (sent) {
    prompt.value = '';
    imagesStore.clearImages();
  }
};

const handleStop = async () => {
  await chatStore.stopStreaming();
};

const handleRegenerate = () => runChatAction(() => chatStore.regenerateLastAssistantReply());

const handleBranchSelect = async (branchId) => {
  await chatStore.setActiveBranch(branchId);
};

const handleCloneBranch = async () => {
  await chatStore.cloneActiveBranch();
};

const handleBranchDelete = async (branchId) => {
  if (!window.confirm('Are you sure you want to delete this branch and all its children? This action cannot be undone.')) {
    return;
  }
  await chatStore.deleteBranchCascade(branchId);
};
const handleBranchFromMessage = async (index) => {
  const edited = window.prompt('Edit the message content before branching (optional):');
  if (edited === null) return;
  await runChatAction(() => chatStore.branchFromMessage(index, edited || null, { generate: true }));
  activeTab.value = 'history';
};

const handleModelCardClick = (model) => {
  modelsStore.select(model);
  showModelModal.value = false;
  chatStore.chatWarning.value = '';
  chatStore.persist();
};

const newChat = async () => {
  const chat = await chatStore.createChat();
  await chatStore.selectChat(chat.id);
};

const handleDeleteChat = async (chatId) => {
  const chat = chatStore.chats.value.find(c => c.id === chatId) || null;
  const title = (chat?.title || 'this chat').trim();
  const ok = window.confirm(`Delete "${title}"? This cannot be undone.`);
  if (!ok) return;
  await chatStore.deleteChat(chatId);
};
</script>

<template>
  <div class="wrap">
    <h1>{{ APP_NAME }}</h1>

    <div class="card">
      <div class="row">
        <div style="flex:1 1 320px;">
          <AuthPanel :auth="authStore" />
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
          <p v-if="modelsStore.selectedModel.value && !isZeroCostModel(modelsStore.selectedModel.value)" class="muted small model-price-detail"><strong class="spend-state">Paid</strong> · {{ pricingSummary(modelsStore.selectedModel.value) }}</p>
          <div class="muted small" style="margin-top:6px">
            <strong>Models:</strong> {{ modelsStore.filteredModels.value.length }} available models.
            <button type="button" class="btn secondary" style="padding: 4px 8px; font-size: 11px; margin-left: 8px;" @click="loadModels">
              {{ modelsStore.loading.value ? 'Loading...' : 'Refresh' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="modelError" class="error" role="alert">{{ modelError }}</p>
    <p v-if="requestError" class="error" role="alert">{{ requestError }}</p>

    <div class="card chat-container">
      <div class="chat-layout">
        <ChatSidebar
          :chats="chatStore.chats.value"
          :active-chat-id="chatStore.activeChatId.value"
          @select="chatStore.selectChat"
          @new="newChat"
          @delete="handleDeleteChat"
        />

        <div class="chat-main">
          <div class="chat-header">
            <label>Chat</label>
            <div class="chat-actions">
              <button class="btn secondary" :disabled="!chatStore.streaming.value" @click="handleStop">Stop</button>
            </div>
          </div>

          <div class="chat-tabs">
            <button class="tab" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">Chat History</button>
            <button class="tab" :class="{ active: activeTab === 'branches' }" @click="activeTab = 'branches'">Branches</button>
          </div>

          <div v-if="chatStore.chatWarning.value" class="chat-warning">{{ chatStore.chatWarning.value }}</div>

          <div v-if="activeTab === 'history'" class="chat-tab-panel">
            <ChatMessages
              :messages="chatStore.messages.value"
              :fallback-model-name="selectedModelName"
              :streaming="chatStore.streaming.value"
              :can-regenerate="chatStore.canRegenerate.value && authStore.isConnected.value && !authStore.isInitializing.value"
              @branch="handleBranchFromMessage"
              @regenerate="handleRegenerate"
            />

            <div class="chat-branch-controls">
              <div class="chat-branch-controls-left">
                <span class="muted small">
                  Branch: <strong>{{ chatStore.activeBranch.value?.title || '—' }}</strong>
                  <span v-if="chatStore.siblingBranches.value.length > 1">
                    ({{ chatStore.siblingBranchIndex.value + 1 }}/{{ chatStore.siblingBranches.value.length }})
                  </span>
                </span>
              </div>
              <div class="chat-branch-controls-right">
                <button class="btn secondary btn-compact" :disabled="!chatStore.canSelectPrevSibling.value" @click="chatStore.selectPrevSiblingBranch">◀ Prev</button>
                <button class="btn secondary btn-compact" :disabled="!chatStore.canSelectNextSibling.value" @click="chatStore.selectNextSiblingBranch">Next ▶</button>
                <button class="btn secondary btn-compact" @click="activeTab = 'branches'">Tree…</button>
              </div>
            </div>

            <ChatInput
              v-model:prompt="prompt"
              :images="imagesStore.uploadedImages.value"
              :disabled="chatStore.streaming.value || !appReady || !authStore.isConnected.value || authStore.isInitializing.value || authStore.isAuthorizing.value"
              @add-images="files => imagesStore.handleFiles(files)"
              @remove-image="dataUrl => imagesStore.removeImage(dataUrl)"
              @send="handleSend"
            />
          </div>

          <div v-else class="chat-tab-panel">
            <BranchGraph
              :branches="branchList"
              :active-branch-id="chatStore.activeBranchId.value"
              @select="handleBranchSelect"
              @clone="handleCloneBranch"
              @rename="(id, title) => chatStore.renameBranch(id, title)"
              @delete="handleBranchDelete"
              @move="(id, dx, dy) => chatStore.setBranchUiOffset(id, dx, dy)"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 8px;">
      <div v-if="selectedModelLinks" class="muted small model-links">
        Selected model: <strong>{{ selectedModelLinks.name }}</strong> ·
        <a :href="selectedModelLinks.modelUrl" target="_blank" rel="noopener">OpenRouter model page</a> ·
        <a :href="selectedModelLinks.chatUrl" target="_blank" rel="noopener">Open in OpenRouter Chat</a>
      </div>
      <div class="muted small">
        <p>{{ APP_NAME }} uses OpenRouter as its AI model/API provider. The links below point to OpenRouter’s official documentation and model pages.</p>
        OpenRouter documentation/resources:
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
        isFree: modelsStore.isZeroCostModel(m),
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
