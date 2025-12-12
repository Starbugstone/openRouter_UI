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

  const siblingBranches = computed(() => {
    const branch = activeBranch.value;
    if (!branch) return [];
    return branches.value
      .filter(b => (b.parentId || null) === (branch.parentId || null))
      .slice()
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  });

  const siblingBranchIndex = computed(() => {
    const idx = siblingBranches.value.findIndex(b => b.id === activeBranchId.value);
    return idx < 0 ? 0 : idx;
  });

  const canSelectPrevSibling = computed(() => siblingBranches.value.length > 1 && siblingBranchIndex.value > 0);
  const canSelectNextSibling = computed(() => siblingBranches.value.length > 1 && siblingBranchIndex.value < siblingBranches.value.length - 1);

  const canRegenerate = computed(() => {
    const branch = activeBranch.value;
    if (!branch) return false;
    for (let i = branch.messages.length - 1; i >= 0; i--) {
      if (branch.messages[i]?.role === 'user') return true;
    }
    return false;
  });

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

  let uiPersistTimer = null;
  const scheduleUiPersist = () => {
    if (uiPersistTimer) clearTimeout(uiPersistTimer);
    uiPersistTimer = setTimeout(() => {
      uiPersistTimer = null;
      persist();
    }, 250);
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

  const selectPrevSiblingBranch = async () => {
    if (!canSelectPrevSibling.value) return;
    const target = siblingBranches.value[siblingBranchIndex.value - 1];
    if (!target) return;
    await setActiveBranch(target.id);
  };

  const selectNextSiblingBranch = async () => {
    if (!canSelectNextSibling.value) return;
    const target = siblingBranches.value[siblingBranchIndex.value + 1];
    if (!target) return;
    await setActiveBranch(target.id);
  };

  const renameBranch = async (branchId, title) => {
    const branch = branches.value.find(b => b.id === branchId);
    if (!branch) return;
    const clean = (title || '').trim();
    if (!clean) return;
    branch.title = clean;
    branch.updatedAt = new Date().toISOString();
    await persist();
  };

  const deleteBranchCascade = async (branchId) => {
    if (streaming.value) return;
    const target = branches.value.find(b => b.id === branchId);
    if (!target) return;

    const childrenByParent = new Map();
    branches.value.forEach((br) => {
      const parent = br.parentId || null;
      const list = childrenByParent.get(parent) || [];
      list.push(br.id);
      childrenByParent.set(parent, list);
    });

    const toDelete = new Set();
    const stack = [branchId];
    toDelete.add(branchId);
    while (stack.length) {
      const id = stack.pop();
      const kids = childrenByParent.get(id) || [];
      for (const kidId of kids) {
        if (toDelete.has(kidId)) continue;
        toDelete.add(kidId);
        stack.push(kidId);
      }
    }

    let remaining = branches.value.filter(b => !toDelete.has(b.id));

    if (!remaining.length) {
      const baseBranch = createBranch({
        title: 'Main',
        parentId: null,
        messages: [],
        forkFromMessageIndex: null
      });
      remaining = [baseBranch];
    }

    let nextActiveId = activeBranchId.value;
    if (!nextActiveId || toDelete.has(nextActiveId)) {
      const parentId = target.parentId || null;
      const parentExists = parentId && remaining.some(b => b.id === parentId);
      if (parentExists) {
        nextActiveId = parentId;
      } else {
        const sorted = remaining.slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        nextActiveId = sorted[0]?.id || remaining[0].id;
      }
    }

    branches.value = remaining;
    activeBranchId.value = nextActiveId;
    const active = branches.value.find(b => b.id === activeBranchId.value) || branches.value[0] || null;
    if (active) {
      activeBranchId.value = active.id;
      messages.value = active.messages;
    } else {
      messages.value = [];
    }

    await persist();
  };

  const setBranchUiOffset = (branchId, dx, dy) => {
    const branch = branches.value.find(b => b.id === branchId);
    if (!branch) return;
    if (!branch.ui || typeof branch.ui !== 'object') branch.ui = { dx: 0, dy: 0 };
    branch.ui.dx = Number.isFinite(dx) ? dx : 0;
    branch.ui.dy = Number.isFinite(dy) ? dy : 0;
    scheduleUiPersist();
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

  const updateAssistantMessage = ({ branchId, assistantIndex, content, images = [] }) => {
    const branch = branches.value.find(b => b.id === branchId);
    if (!branch) return;

    const idx = typeof assistantIndex === 'number' ? assistantIndex : -1;
    if (idx < 0 || idx >= branch.messages.length || branch.messages[idx]?.role !== 'assistant') {
      // Fallback: best-effort update of the last assistant message in the pinned branch.
      for (let i = branch.messages.length - 1; i >= 0; i--) {
        if (branch.messages[i]?.role === 'assistant') {
          branch.messages[i].content = content;
          branch.messages[i].images = images;
          branch.messages[i].model = modelsStore.selectedModel.value
            ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
            : branch.messages[i].model || null;
          branch.updatedAt = new Date().toISOString();
          if (activeBranchId.value === branchId) messages.value = branch.messages;
          return;
        }
      }
      return;
    }

    branch.messages[idx].content = content;
    branch.messages[idx].images = images;
    branch.messages[idx].model = modelsStore.selectedModel.value
      ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
      : branch.messages[idx].model || null;
    branch.updatedAt = new Date().toISOString();

    if (activeBranchId.value === branchId) {
      messages.value = branch.messages;
    }
  };

  const sendMessage = async ({ prompt, images, onStreamChunk, onDone, apiKeyValue }) => {
    if (streaming.value) return;
    const model = modelsStore.selectedModel.value;
    if (!model) throw new Error('Select a model');

    // Pin streaming to the initiating branch so branch switches mid-stream don't redirect updates.
    const streamBranchId = activeBranchId.value;
    await addUserMessage(prompt, images);

    const streamBranch = branches.value.find(b => b.id === streamBranchId);
    const payloadMessages = buildMessagesFromHistory(streamBranch?.messages || []);
    streaming.value = true;
    abortController.value = new AbortController();

    try {
      if (mode.value === 'image') {
        await sendImageFlow({ branchId: streamBranchId, apiKeyValue, modelId: model.id, messages: payloadMessages, onStreamChunk, onDone });
      } else {
        await sendTextFlow({ branchId: streamBranchId, apiKeyValue, modelId: model.id, messages: payloadMessages, onStreamChunk, onDone });
      }
    } finally {
      streaming.value = false;
      abortController.value = null;
    }
  };

  const sendFromCurrentHistory = async ({ apiKeyValue, onStreamChunk, onDone }) => {
    if (streaming.value) return;
    const model = modelsStore.selectedModel.value;
    if (!model) throw new Error('Select a model');

    const streamBranchId = activeBranchId.value;
    const streamBranch = branches.value.find(b => b.id === streamBranchId);
    const payloadMessages = buildMessagesFromHistory(streamBranch?.messages || []);
    streaming.value = true;
    abortController.value = new AbortController();

    try {
      if (mode.value === 'image') {
        await sendImageFlow({ branchId: streamBranchId, apiKeyValue, modelId: model.id, messages: payloadMessages, onStreamChunk, onDone });
      } else {
        await sendTextFlow({ branchId: streamBranchId, apiKeyValue, modelId: model.id, messages: payloadMessages, onStreamChunk, onDone });
      }
    } finally {
      streaming.value = false;
      abortController.value = null;
    }
  };

  const regenerateLastAssistantReply = async ({ apiKeyValue, onStreamChunk, onDone }) => {
    const branch = activeBranch.value;
    if (!branch) return;

    let lastUserIndex = -1;
    for (let i = branch.messages.length - 1; i >= 0; i--) {
      if (branch.messages[i]?.role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex < 0) return;

    // Split this branch at the last user message, then regenerate as a new sub-branch.
    const baseMessages = branch.messages.slice(0, lastUserIndex + 1).map(m => ({ ...m }));

    const baseBranch = await ensureBranchSplitAt({ branchId: branch.id, forkIndex: lastUserIndex });
    if (!baseBranch) return;
    const siblingCount = branches.value.filter(b => (b.parentId || null) === (baseBranch.id || null)).length;
    const newBranch = createBranch({
      title: `${branch.title} (Alt ${siblingCount + 1})`,
      parentId: baseBranch.id,
      messages: baseMessages,
      forkFromMessageIndex: lastUserIndex
    });

    branches.value.push(newBranch);
    activeBranchId.value = newBranch.id;
    messages.value = newBranch.messages;
    await persist();

    await sendFromCurrentHistory({ apiKeyValue, onStreamChunk, onDone });
  };

  const stopStreaming = async () => {
    if (abortController.value) {
      abortController.value.abort();
    }
    streaming.value = false;
  };

  const sendTextFlow = async ({ branchId, apiKeyValue, modelId, messages: payloadMessages, onStreamChunk, onDone }) => {
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
      const target = branches.value.find(b => b.id === branchId);
      if (!target) return;
      target.messages.push({
        role: 'assistant',
        content,
        images: imgs,
        timestamp: new Date().toISOString(),
        model: modelsStore.selectedModel.value
          ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
          : null
      });
      target.updatedAt = new Date().toISOString();
      if (activeBranchId.value === branchId) messages.value = target.messages;
      await persist();
      if (onDone) onDone();
      return;
    }

    let assistantContent = '';
    let assistantImages = [];
    const target = branches.value.find(b => b.id === branchId);
    if (!target) return;
    target.messages.push({
      role: 'assistant',
      content: '…',
      images: [],
      timestamp: new Date().toISOString(),
      model: modelsStore.selectedModel.value
        ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
        : null
    });
    target.updatedAt = new Date().toISOString();
    if (activeBranchId.value === branchId) messages.value = target.messages;
    const assistantIndex = target.messages.length - 1;
    const finalize = async () => {
      const finalContent = assistantContent.trim() || '[Empty response]';
      updateAssistantMessage({ branchId, assistantIndex, content: finalContent, images: assistantImages });
      await persist();
      if (onDone) onDone();
    };

    try {
      await readSSE(response, (chunk) => {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (typeof delta?.content === 'string') {
          assistantContent += delta.content;
          updateAssistantMessage({ branchId, assistantIndex, content: assistantContent || '…', images: assistantImages });
        } else if (Array.isArray(delta?.content)) {
          for (const part of delta.content) {
            if (part?.type === 'output_text' && part.text) {
              assistantContent += part.text;
            }
            if (part?.type === 'output_image' && part.image_url?.url) {
              assistantImages.push(part.image_url.url);
            }
          }
          updateAssistantMessage({ branchId, assistantIndex, content: assistantContent || '…', images: assistantImages });
        }
        if (onStreamChunk) onStreamChunk({ content: assistantContent, images: assistantImages });
      }, finalize);
    } catch (err) {
      updateAssistantMessage({ branchId, assistantIndex, content: '[Error: Stream failed]', images: [] });
      await persist();
      throw err;
    }
  };

  const sendImageFlow = async ({ branchId, apiKeyValue, modelId, messages: payloadMessages, onStreamChunk, onDone }) => {
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
      const target = branches.value.find(b => b.id === branchId);
      if (!target) return;
      target.messages.push({
        role: 'assistant',
        content,
        images: imgs,
        timestamp: new Date().toISOString(),
        model: modelsStore.selectedModel.value
          ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
          : null
      });
      target.updatedAt = new Date().toISOString();
      if (activeBranchId.value === branchId) messages.value = target.messages;
      await persist();
      if (onDone) onDone();
      return;
    }

    let assistantContent = '';
    let assistantImages = [];
    const target = branches.value.find(b => b.id === branchId);
    if (!target) return;
    target.messages.push({
      role: 'assistant',
      content: '…',
      images: [],
      timestamp: new Date().toISOString(),
      model: modelsStore.selectedModel.value
        ? { id: modelsStore.selectedModel.value.id, name: modelsStore.selectedModel.value.name }
        : null
    });
    target.updatedAt = new Date().toISOString();
    if (activeBranchId.value === branchId) messages.value = target.messages;
    const assistantIndex = target.messages.length - 1;
    const finalize = async () => {
      const finalContent = assistantContent.trim() || `Generated ${assistantImages.length} image(s):`;
      updateAssistantMessage({ branchId, assistantIndex, content: finalContent, images: assistantImages });
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
      updateAssistantMessage({
        branchId,
        assistantIndex,
        content: assistantContent || `Generated ${assistantImages.length} image(s):`,
        images: assistantImages
      });
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

  const ensureBranchSplitAt = async ({ branchId, forkIndex }) => {
    const branch = branches.value.find(b => b.id === branchId);
    if (!branch) return null;
    if (!Number.isInteger(forkIndex) || forkIndex <= 0 || forkIndex >= branch.messages.length) return branch;

    const hasPreservedChild = branches.value.some((child) => (
      child &&
      child.id !== branch.id &&
      child.parentId === branch.id &&
      child.forkFromMessageIndex === forkIndex
    ));

    // If already split at this index (explicit flag + preserved child), don't split again.
    if (branch.splitAtMessageIndex === forkIndex && hasPreservedChild) return branch;

    // If there's no continuation beyond forkIndex, splitting is a no-op.
    if (branch.messages.length === forkIndex + 1) return branch;

    const now = new Date().toISOString();
    const originalFullMessages = branch.messages.map(m => ({ ...m }));
    const baseMessages = branch.messages.slice(0, forkIndex + 1).map(m => ({ ...m }));

    // Create a child branch that preserves the current full continuation.
    const preserved = createBranch({
      title: `${branch.title} (Original)`,
      parentId: branch.id,
      messages: originalFullMessages,
      forkFromMessageIndex: forkIndex
    });

    // Re-parent existing children that fork after the new truncation point.
    branches.value.forEach((child) => {
      if (child.parentId !== branch.id) return;
      const childFork = typeof child.forkFromMessageIndex === 'number' ? child.forkFromMessageIndex : null;
      if (childFork !== null && childFork <= forkIndex) return;
      child.parentId = preserved.id;
    });

    // Truncate the current branch in-place into the fork base.
    branch.messages = baseMessages;
    branch.splitAtMessageIndex = forkIndex;
    branch.updatedAt = now;

    branches.value.push(preserved);
    return branch;
  };

  const branchFromMessage = async (messageIndex, editedContent = null, options = {}) => {
    if (streaming.value) return;
    const branch = activeBranch.value;
    if (!branch) return;
    if (messageIndex <= 0 || messageIndex >= branch.messages.length) return;
    const baseMessages = branch.messages.slice(0, messageIndex + 1).map((msg, idx) => {
      if (idx === messageIndex && editedContent && msg.role === 'user') {
        return { ...msg, content: editedContent };
      }
      return { ...msg };
    });

    const baseBranch = await ensureBranchSplitAt({ branchId: branch.id, forkIndex: messageIndex });
    if (!baseBranch) return;
    const newBranch = createBranch({
      title: `Branch ${branches.value.length + 1}`,
      parentId: baseBranch.id,
      messages: baseMessages,
      forkFromMessageIndex: messageIndex
    });
    branches.value.push(newBranch);
    activeBranchId.value = newBranch.id;
    messages.value = newBranch.messages;
    await persist();

    if (options?.generate) {
      const key = options.apiKeyValue || apiKey.value;
      if (!key) return newBranch;
      await sendFromCurrentHistory({
        apiKeyValue: key,
        onStreamChunk: options.onStreamChunk,
        onDone: options.onDone
      });
    }

    return newBranch;
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
    siblingBranches,
    siblingBranchIndex,
    canSelectPrevSibling,
    canSelectNextSibling,
    canRegenerate,
    init,
    createChat,
    selectChat,
    deleteChat,
    persist,
    setActiveBranch,
    selectPrevSiblingBranch,
    selectNextSiblingBranch,
    renameBranch,
    deleteBranchCascade,
    setBranchUiOffset,
    addUserMessage,
    addAssistantMessage,
    updateLastAssistantMessage,
    sendMessage,
    regenerateLastAssistantReply,
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
    splitAtMessageIndex: null,
    ui: { dx: 0, dy: 0 },
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
  const rawUi = branch.ui && typeof branch.ui === 'object' ? branch.ui : null;
  return {
    id: branch.id,
    title: branch.title || 'Branch',
    parentId: branch.parentId || null,
    forkFromMessageIndex: typeof branch.forkFromMessageIndex === 'number' ? branch.forkFromMessageIndex : null,
    splitAtMessageIndex: typeof branch.splitAtMessageIndex === 'number' ? branch.splitAtMessageIndex : null,
    ui: {
      dx: Number.isFinite(rawUi?.dx) ? rawUi.dx : 0,
      dy: Number.isFinite(rawUi?.dy) ? rawUi.dy : 0
    },
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
      splitAtMessageIndex: typeof branch.splitAtMessageIndex === 'number' ? branch.splitAtMessageIndex : null,
      ui: branch.ui && typeof branch.ui === 'object'
        ? { dx: Number(branch.ui.dx) || 0, dy: Number(branch.ui.dy) || 0 }
        : { dx: 0, dy: 0 },
      messages: toPlainMessages(branch.messages || []),
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt
    })),
    activeBranchId: chat.activeBranchId,
    updatedAt: chat.updatedAt || new Date().toISOString()
  };
}
