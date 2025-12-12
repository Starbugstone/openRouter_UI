const API_BASE_URL = 'https://openrouter.ai/api/v1';
const MODELS_ENDPOINT = `${API_BASE_URL}/models`;
const CHAT_ENDPOINT = `${API_BASE_URL}/chat/completions`;
const KEY_STATUS_ENDPOINT = `${API_BASE_URL}/key`;

export async function fetchModels() {
  const res = await fetch(MODELS_ENDPOINT);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function checkApiKeyStatus(apiKey) {
  const res = await fetch(KEY_STATUS_ENDPOINT, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
  return res.json();
}

export async function sendChatCompletion({ apiKey, model, messages, stream = false, options = {}, signal }) {
  const body = {
    model,
    messages,
    stream,
    ...options
  };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json',
    'X-Title': 'Local OpenRouter Playground'
  };

  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  });

  if (!stream) {
    if (!res.ok) throw await buildError(res);
    return res.json();
  }

  if (!res.ok) throw await buildError(res);
  return res;
}

export function readSSE(response, onChunk, onDone) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const pump = () => reader.read().then(({ done, value }) => {
    if (done) {
      if (onDone) onDone();
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = chunk.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          if (onDone) onDone();
          return;
        }
        try {
          const obj = JSON.parse(data);
          onChunk(obj);
        } catch {
          // ignore
        }
      }
    }
    return pump();
  });
  return pump();
}

export function buildMessagesFromHistory(history) {
  return (history || []).map(msg => {
    if (msg.images && msg.images.length) {
      return {
        role: msg.role,
        content: buildMultimodalContent(msg.content, msg.images)
      };
    }
    return { role: msg.role, content: msg.content };
  });
}

export function buildMultimodalContent(text, images) {
  if (!images || images.length === 0) return text;
  const content = [];
  if (text && text.trim()) {
    content.push({ type: 'text', text });
  }
  images.forEach(imgData => {
    const url = typeof imgData === 'string' ? imgData : imgData.data;
    content.push({
      type: 'image_url',
      image_url: { url }
    });
  });
  return content;
}

export function extractTextFromMessage(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter(p => p.type === 'output_text' && p.text)
      .map(p => p.text)
      .join('');
  }
  return '';
}

export function extractImagesFromMessage(message) {
  const images = [];
  if (!message) return images;
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part?.type === 'output_image' && part.image_url?.url) {
        images.push(part.image_url.url);
      }
    }
  }
  if (Array.isArray(message.images)) {
    for (const img of message.images) {
      if (img?.type === 'image_url' && img.image_url?.url) {
        images.push(img.image_url.url);
      }
    }
  }
  return images;
}

export function getModelUrl(modelId) {
  return `https://openrouter.ai/models/${modelId}`;
}

export function getChatUrl(modelId) {
  return `https://openrouter.ai/chat?model=${encodeURIComponent(modelId)}`;
}

async function buildError(res) {
  const text = await res.text();
  return new Error(`HTTP ${res.status} – ${text || res.statusText}`);
}

