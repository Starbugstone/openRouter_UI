import { ref, computed } from 'vue';
import { useDb } from './useDb';
import { buildMessagesFromHistory, extractImagesFromMessage, extractTextFromMessage, readSSE, sendChatCompletion } from './useApi';

export function useChat(modelsStore) {
  const { saveChat, listChats, getChat, deleteChat: deleteChatFromDb } = useDb();

  const chats = ref([]);
  const activeChatId = ref(null);
  const branches = ref([]);
  const activeBranchId = ref(null);
  const messages = ref([]);

  const apiKey = ref('');
  const rememberKey = ref(false);
  const mode = ref('text');
  const stream = ref(true);
  const timeoutSec = ref(30);
  const imgCount = ref(1);
  const streaming = ref(false);
  const chatWarning = ref('');
  const abortController = ref(null);

  const activeChat = computed(() => chats.value.find(c => c.id === activeChatId.value) || null);
  const activeBranch = computed(() => branches.value.find(b => b.id === activeBranchId.value) || null);

  const init = async () => {
    chats.value = await listChats();
    if (chats.value.length === 0) {
      const chat = await createChat();
      await selectChat(chat.id);
    } else {
      await selectChat(chats.value[0].id);
    }
  };

  const createChat = async () => {
    const baseBranch = createBranch({
      title: 'Main',
      parentId: null,
      messages: [],
      forkFromMessageIndex: null
    });
    const chat = toPlainChat({
      id: `chat-${Date.now()}`,
      title: 'New chat',
      model: modelsStore.selectedModel.value
        ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
        : null,
      mode: mode.value,
      branches: [baseBranch],
      activeBranchId: baseBranch.id,
      updatedAt: new Date().toISOString()
    });
    await saveChat(chat);
    chats.value = await listChats();
    activeChatId.value = chat.id;
    return chat;
  };

  const selectChat = async (chatId) => {
    activeChatId.value = chatId;
    const chat = await getChat(chatId);
    if (!chat) return;

    mode.value = chat.mode || 'text';
    const hydrated = hydrateBranches(chat);
    branches.value = hydrated.branches;
    activeBranchId.value = hydrated.activeBranchId;
    messages.value = hydrated.activeBranch.messages;

    const currentSelected = modelsStore.selectedModel.value;
    const chatModelId = chat.model?.id;
    const candidateModel = chatModelId
      ? modelsStore.allModels.value.find(m => m.id === chatModelId)
      : currentSelected
        ? modelsStore.allModels.value.find(m => m.id === currentSelected.id)
        : null;

    if (candidateModel) {
      modelsStore.select(candidateModel);
      chatWarning.value = '';
    } else if (chat.model) {
      chatWarning.value = `Model ${chat.model.id} is unavailable. Choose another model to continue.`;
    } else {
      chatWarning.value = 'Select a model to start chatting.';
    }
  };

  const deleteChat = async (chatId) => {
    await deleteChatFromDb(chatId);
    chats.value = await listChats();
    if (chats.value.length) {
      await selectChat(chats.value[0].id);
    } else {
      const chat = await createChat();
      await selectChat(chat.id);
    }
  };

  const persist = async () => {
    if (!activeChatId.value) return;
    const chat = toPlainChat({
      id: activeChatId.value,
      title: buildTitle(messages.value),
      model: modelsStore.selectedModel.value
        ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
        : null,
      mode: mode.value,
      branches: branches.value,
      activeBranchId: activeBranchId.value,
      updatedAt: new Date().toISOString()
    });
    await saveChat(chat);
    chats.value = await listChats();
  };

  const setActiveBranch = async (branchId) => {
    const target = branches.value.find(b => b.id === branchId);
    if (!target) return;
    activeBranchId.value = branchId;
    messages.value = target.messages;
    await persist();
  };

  const addUserMessage = async (content, images = []) => {
    const branch = activeBranch.value;
    if (!branch) return;
    branch.messages.push({
      role: 'user',
      content,
      images,
      timestamp: new Date().toISOString()
    });
    branch.updatedAt = new Date().toISOString();
    messages.value = branch.messages;
    await persist();
  };

  const addAssistantMessage = async (content, images = []) => {
    const branch = activeBranch.value;
    if (!branch) return;
    branch.messages.push({
      role: 'assistant',
      content,
      images,
      timestamp: new Date().toISOString(),
      model: modelsStore.selectedModel.value
        ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
        : null
    });
    branch.updatedAt = new Date().toISOString();
    messages.value = branch.messages;
    await persist();
  };

  const updateLastAssistantMessage = (content, images = []) => {
    const branch = activeBranch.value;
    if (!branch) return;
    for (let i = branch.messages.length - 1; i >= 0; i--) {
      if (branch.messages[i].role === 'assistant') {
        branch.messages[i].content = content;
        branch.messages[i].images = images;
        branch.messages[i].model = modelsStore.selectedModel.value
          ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
          : branch.messages[i].model || null;
        branch.updatedAt = new Date().toISOString();
        messages.value = branch.messages;
        return;
      }
    }
  };

  const sendMessage = async ({ prompt, images, onStreamChunk, onDone, apiKeyValue }) => {
    if (streaming.value) return;
    const model = modelsStore.selectedModel.value;
    if (!model) throw new Error('Select a model');
    await addUserMessage(prompt, images);

    const payloadMessages = buildMessagesFromHistory(messages.value);
    streaming.value = true;
    abortController.value = new AbortController();

    try {
      if (mode.value === 'image') {
        await sendImageFlow({ apiKeyValue, modelId: model.id, messages: payloadMessages, onStreamChunk, onDone });
      } else {
        await sendTextFlow({ apiKeyValue, modelId: model.id, messages: payloadMessages, onStreamChunk, onDone });
      }
    } finally {
      streaming.value = false;
      abortController.value = null;
    }
  };

  const stopStreaming = async () => {
    if (abortController.value) {
      abortController.value.abort();
    }
    streaming.value = false;
  };

  const sendTextFlow = async ({ apiKeyValue, modelId, messages: payloadMessages, onStreamChunk, onDone }) => {
    const response = await sendChatCompletion({
      apiKey: apiKeyValue,
      model: modelId,
      messages: payloadMessages,
      stream: stream.value,
      signal: abortController.value?.signal
    });

    if (!stream.value) {
      const content = extractTextFromMessage(response.choices?.[0]?.message) || '[Empty response]';
      const imgs = extractImagesFromMessage(response.choices?.[0]?.message);
      await addAssistantMessage(content, imgs);
      if (onDone) onDone();
      return;
    }

    let assistantContent = '';
    let assistantImages = [];
    messages.value.push({
      role: 'assistant',
      content: '…',
      images: [],
      timestamp: new Date().toISOString(),
      model: modelsStore.selectedModel.value
        ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
        : null
    });
    const finalize = async () => {
      const finalContent = assistantContent.trim() || '[Empty response]';
      updateLastAssistantMessage(finalContent, assistantImages);
      await persist();
      if (onDone) onDone();
    };

    try {
      await readSSE(response, (chunk) => {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (typeof delta?.content === 'string') {
          assistantContent += delta.content;
          updateLastAssistantMessage(assistantContent || '…', assistantImages);
        } else if (Array.isArray(delta?.content)) {
          for (const part of delta.content) {
            if (part?.type === 'output_text' && part.text) {
              assistantContent += part.text;
            }
            if (part?.type === 'output_image' && part.image_url?.url) {
              assistantImages.push(part.image_url.url);
            }
          }
          updateLastAssistantMessage(assistantContent || '…', assistantImages);
        }
        if (onStreamChunk) onStreamChunk({ content: assistantContent, images: assistantImages });
      }, finalize);
    } catch (err) {
      updateLastAssistantMessage('[Error: Stream failed]', []);
      await persist();
      throw err;
    }
  };

  const sendImageFlow = async ({ apiKeyValue, modelId, messages: payloadMessages, onStreamChunk, onDone }) => {
    const options = { modalities: ['image', 'text'], n: imgCount.value };
    const response = await sendChatCompletion({
      apiKey: apiKeyValue,
      model: modelId,
      messages: payloadMessages,
      stream: stream.value,
      options,
      signal: abortController.value?.signal
    });

    if (!stream.value) {
      const content = 'Generated image(s):';
      const imgs = (response.choices || []).flatMap(choice => extractImagesFromMessage(choice.message));
      await addAssistantMessage(content, imgs);
      if (onDone) onDone();
      return;
    }

    let assistantContent = '';
    let assistantImages = [];
    messages.value.push({
      role: 'assistant',
      content: '…',
      images: [],
      timestamp: new Date().toISOString(),
      model: modelsStore.selectedModel.value
        ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
        : null
    });
    const finalize = async () => {
      const finalContent = assistantContent.trim() || `Generated ${assistantImages.length} image(s):`;
      updateLastAssistantMessage(finalContent, assistantImages);
      await persist();
      if (onDone) onDone();
    };

    await readSSE(response, (chunk) => {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (typeof delta?.content === 'string') {
        assistantContent += delta.content;
      } else if (Array.isArray(delta?.content)) {
        for (const part of delta.content) {
          if (part?.type === 'output_text' && part.text) {
            assistantContent += part.text;
          }
          if (part?.type === 'output_image' && part.image_url?.url) {
            assistantImages.push(part.image_url.url);
          }
        }
      }
      updateLastAssistantMessage(assistantContent || `Generated ${assistantImages.length} image(s):`, assistantImages);
      if (onStreamChunk) onStreamChunk({ content: assistantContent, images: assistantImages });
    }, finalize);
  };

  const cloneActiveBranch = async () => {
    const branch = activeBranch.value;
    if (!branch) return;
    const cloned = createBranch({
      title: `${branch.title} (Copy)`,
      parentId: branch.parentId,
      messages: branch.messages.map(m => ({ ...m })),
      forkFromMessageIndex: branch.forkFromMessageIndex ?? null
    });
    branches.value.push(cloned);
    activeBranchId.value = cloned.id;
    messages.value = cloned.messages;
    await persist();
  };

  const branchFromMessage = async (messageIndex, editedContent = null) => {
    const branch = activeBranch.value;
    if (!branch) return;
    if (messageIndex <= 0 || messageIndex >= branch.messages.length) return;
    const baseMessages = branch.messages.slice(0, messageIndex + 1).map((msg, idx) => {
      if (idx === messageIndex && editedContent && msg.role === 'user') {
        return { ...msg, content: editedContent };
      }
      return { ...msg };
    });
    const newBranch = createBranch({
      title: `Branch ${branches.value.length + 1}`,
      parentId: branch.id,
      messages: baseMessages,
      forkFromMessageIndex: messageIndex
    });
    branches.value.push(newBranch);
    activeBranchId.value = newBranch.id;
    messages.value = newBranch.messages;
    await persist();
  };

  const branchTree = computed(() => {
    const map = new Map();
    branches.value.forEach(br => map.set(br.id, { ...br, children: [] }));
    const roots = [];
    map.forEach(node => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  });

  return {
    chats,
    activeChatId,
    activeChat,
    branches,
    activeBranchId,
    activeBranch,
    messages,
    apiKey,
    rememberKey,
    mode,
    stream,
    timeoutSec,
    imgCount,
    streaming,
    chatWarning,
    branchTree,
    init,
    createChat,
    selectChat,
    deleteChat,
    persist,
    setActiveBranch,
    addUserMessage,
    addAssistantMessage,
    updateLastAssistantMessage,
    sendMessage,
    stopStreaming,
    cloneActiveBranch,
    branchFromMessage
  };
}

function createBranch({ title, parentId, messages, forkFromMessageIndex }) {
  const now = new Date().toISOString();
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
  return {
    id: `branch-${uuid}`,
    title,
    parentId,
    messages: messages || [],
    forkFromMessageIndex: typeof forkFromMessageIndex === 'number' ? forkFromMessageIndex : null,
    createdAt: now,
    updatedAt: now
  };
}

function hydrateBranches(chat) {
  if (Array.isArray(chat.branches) && chat.branches.length) {
    const normalized = chat.branches.map(normalizeBranch);
    const activeId = chat.activeBranchId && normalized.find(b => b.id === chat.activeBranchId)
      ? chat.activeBranchId
      : normalized[0].id;
    return {
      branches: normalized,
      activeBranchId: activeId,
      activeBranch: normalized.find(b => b.id === activeId)
    };
  }
  const fallback = createBranch({
    title: 'Main',
    parentId: null,
    messages: chat.messages || [],
    forkFromMessageIndex: null
  });
  return { branches: [fallback], activeBranchId: fallback.id, activeBranch: fallback };
}

function normalizeBranch(branch) {
  return {
    id: branch.id,
    title: branch.title || 'Branch',
    parentId: branch.parentId || null,
    forkFromMessageIndex: typeof branch.forkFromMessageIndex === 'number' ? branch.forkFromMessageIndex : null,
    messages: Array.isArray(branch.messages) ? branch.messages : [],
    createdAt: branch.createdAt || new Date().toISOString(),
    updatedAt: branch.updatedAt || new Date().toISOString()
  };
}

function buildTitle(history) {
  const firstUser = (history || []).find(m => m.role === 'user' && m.content);
  if (firstUser && typeof firstUser.content === 'string') {
    const trimmed = firstUser.content.trim();
    if (trimmed.length > 0) {
      return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
    }
  }
  return 'New chat';
}

function toPlainMessages(msgs = []) {
  return msgs.map(m => ({
    role: m.role,
    content: m.content,
    images: toPlainImages(m.images || []),
    timestamp: m.timestamp,
    model: m.model ? { id: m.model.id, name: m.model.name } : null
  }));
}

function toPlainImages(images = []) {
  return images.map(img => {
    if (typeof img === 'string') return img;
    return {
      data: img.data,
      name: img.name,
      type: img.type
    };
  });
}

function toPlainChat(chat) {
  return {
    id: chat.id,
    title: chat.title,
    model: chat.model ? { id: chat.model.id, name: chat.model.name } : null,
    mode: chat.mode || 'text',
    branches: (chat.branches || []).map(branch => ({
      id: branch.id,
      title: branch.title,
      parentId: branch.parentId,
      forkFromMessageIndex: typeof branch.forkFromMessageIndex === 'number' ? branch.forkFromMessageIndex : null,
      messages: toPlainMessages(branch.messages || []),
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt
    })),
    activeBranchId: chat.activeBranchId,
    updatedAt: chat.updatedAt || new Date().toISOString()
  };
}

