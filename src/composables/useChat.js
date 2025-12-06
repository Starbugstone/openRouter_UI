import { ref, computed } from 'vue';
import { useDb } from './useDb';
import { buildMessagesFromHistory, extractImagesFromMessage, extractTextFromMessage, readSSE, sendChatCompletion } from './useApi';

export function useChat(modelsStore) {
  const { saveChat, listChats, getChat, deleteChat: deleteChatFromDb } = useDb();

  const chats = ref([]);
  const activeChatId = ref(null);
  const messages = ref([]);
  const regenerations = ref({
    history: [],
    currentIndex: -1,
    lastUserMessage: null
  });

  const apiKey = ref('');
  const rememberKey = ref(false);
  const mode = ref('text');
  const stream = ref(true);
  const timeoutSec = ref(30);
  const imgCount = ref(1);
  const streaming = ref(false);
  const chatWarning = ref('');

  const activeChat = computed(() => chats.value.find(c => c.id === activeChatId.value) || null);

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
    const chat = toPlainChat({
      id: `chat-${Date.now()}`,
      title: 'New chat',
      messages: [],
      model: modelsStore.selectedModel.value
        ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
        : null,
      mode: mode.value,
      regenerations: {
        history: [],
        currentIndex: -1,
        lastUserMessage: null
      },
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
    messages.value = chat.messages || [];
    mode.value = chat.mode || 'text';
    regenerations.value = normalizeRegenerations(chat.regenerations);
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
      messages: messages.value,
      model: modelsStore.selectedModel.value
        ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
        : null,
      mode: mode.value,
      regenerations: regenerations.value,
      updatedAt: new Date().toISOString()
    });
    await saveChat(chat);
    chats.value = await listChats();
  };

  const addUserMessage = async (content, images = []) => {
    messages.value.push({
      role: 'user',
      content,
      images,
      timestamp: new Date().toISOString()
    });
    regenerations.value.lastUserMessage = { content, images };
    regenerations.value.history = [];
    regenerations.value.currentIndex = -1;
    await persist();
  };

  const addAssistantMessage = async (content, images = []) => {
    messages.value.push({
      role: 'assistant',
      content,
      images,
      timestamp: new Date().toISOString()
    });
    regenerations.value.history.push({ content, images, timestamp: new Date().toISOString() });
    regenerations.value.currentIndex = regenerations.value.history.length - 1;
    await persist();
  };

  const updateLastAssistantMessage = (content, images = []) => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'assistant') {
        messages.value[i].content = content;
        messages.value[i].images = images;
        return;
      }
    }
  };

  const regenerateFromBranch = async (index) => {
    if (index < 0 || index >= regenerations.value.history.length) return;
    regenerations.value.currentIndex = index;
    const response = regenerations.value.history[index];
    updateLastAssistantMessage(response.content, response.images);
    await persist();
  };

  const sendMessage = async ({ prompt, images, onStreamChunk, onDone, apiKeyValue }) => {
    if (streaming.value) return; // or throw an error
    const model = modelsStore.selectedModel.value;
    if (!model) throw new Error('Select a model');
    await addUserMessage(prompt, images);

    const payloadMessages = buildMessagesFromHistory(messages.value);
    streaming.value = true;

    try {
      if (mode.value === 'image') {
        await sendImageFlow({ apiKeyValue, modelId: model.id, messages: payloadMessages, onStreamChunk, onDone });
      } else {
        await sendTextFlow({ apiKeyValue, modelId: model.id, messages: payloadMessages, onStreamChunk, onDone });
      }
    } finally {
      streaming.value = false;
    }
  };
  const regenerate = async ({ apiKeyValue, onStreamChunk, onDone }) => {
    const model = modelsStore.selectedModel.value;
    if (!model) throw new Error('Select a model');
    const lastUser = regenerations.value.lastUserMessage;
    if (!lastUser) throw new Error('No user message to regenerate');

    // Remove last assistant message if present to replace with a new branch
    if (messages.value.length && messages.value[messages.value.length - 1].role === 'assistant') {
      messages.value.pop();
    }

    const payloadMessages = buildMessagesFromHistory(messages.value);
    streaming.value = true;

    try {
      if (mode.value === 'image') {
        await sendImageFlow({ apiKeyValue, modelId: model.id, messages: payloadMessages, onStreamChunk, onDone });
      } else {
        await sendTextFlow({ apiKeyValue, modelId: model.id, messages: payloadMessages, onStreamChunk, onDone });
      }
    } finally {
      streaming.value = false;
    }
  };

  const sendTextFlow = async ({ apiKeyValue, modelId, messages: payloadMessages, onStreamChunk, onDone }) => {
    const response = await sendChatCompletion({
      apiKey: apiKeyValue,
      model: modelId,
      messages: payloadMessages,
      stream: stream.value
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
    // Always create a placeholder message up front for visibility
    messages.value.push({
      role: 'assistant',
      content: '…',
      images: [],
      timestamp: new Date().toISOString()
    });
    const finalize = async () => {
      const finalContent = assistantContent.trim() || '[Empty response]';
      updateLastAssistantMessage(finalContent, assistantImages);
      regenerations.value.history.push({
        content: finalContent,
        images: assistantImages,
        timestamp: new Date().toISOString()
      });
      regenerations.value.currentIndex = regenerations.value.history.length - 1;
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
      // Remove or mark the placeholder message as failed
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
      options
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
      timestamp: new Date().toISOString()
    });
    const finalize = async () => {
      const finalContent = assistantContent.trim() || `Generated ${assistantImages.length} image(s):`;
      updateLastAssistantMessage(finalContent, assistantImages);
      regenerations.value.history.push({ content: finalContent, images: assistantImages, timestamp: new Date().toISOString() });
      regenerations.value.currentIndex = regenerations.value.history.length - 1;
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

  const buildTitle = (history) => {
    const firstUser = (history || []).find(m => m.role === 'user' && m.content);
    if (firstUser && typeof firstUser.content === 'string') {
      const trimmed = firstUser.content.trim();
      if (trimmed.length > 0) {
        return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
      }
    }
    return 'New chat';
  };

  return {
    chats,
    activeChatId,
    activeChat,
    messages,
    regenerations,
    apiKey,
    rememberKey,
    mode,
    stream,
    timeoutSec,
    imgCount,
    streaming,
    chatWarning,
    init,
    createChat,
    selectChat,
    deleteChat,
    persist,
    addUserMessage,
    addAssistantMessage,
    updateLastAssistantMessage,
    regenerateFromBranch,
    sendMessage,
    regenerate
  };
}

function normalizeRegenerations(reg) {
  if (!reg) {
    return {
      history: [],
      currentIndex: -1,
      lastUserMessage: null
    };
  }
  return {
    history: Array.isArray(reg.history) ? reg.history : [],
    currentIndex: typeof reg.currentIndex === 'number' ? reg.currentIndex : -1,
    lastUserMessage: reg.lastUserMessage || null
  };
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

function toPlainMessages(msgs = []) {
  return msgs.map(m => ({
    role: m.role,
    content: m.content,
    images: toPlainImages(m.images || []),
    timestamp: m.timestamp
  }));
}

function toPlainRegenerations(reg) {
  return {
    history: (reg?.history || []).map(r => ({
      content: r.content,
      images: toPlainImages(r.images || []),
      timestamp: r.timestamp
    })),
    currentIndex: typeof reg?.currentIndex === 'number' ? reg.currentIndex : -1,
    lastUserMessage: reg?.lastUserMessage
      ? { content: reg.lastUserMessage.content, images: toPlainImages(reg.lastUserMessage.images || []) }
      : null
  };
}

function toPlainChat(chat) {
  return {
    id: chat.id,
    title: chat.title,
    messages: toPlainMessages(chat.messages || []),
    model: chat.model ? { id: chat.model.id, name: chat.model.name } : null,
    mode: chat.mode || 'text',
    regenerations: toPlainRegenerations(chat.regenerations),
    updatedAt: chat.updatedAt || new Date().toISOString()
  };
}
