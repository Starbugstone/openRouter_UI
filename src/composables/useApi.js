import { APP_NAME } from '../config/app';
import { API_BASE_URL } from '../config/openrouter';

const MODELS_ENDPOINT = `${API_BASE_URL}/models`;
const CHAT_ENDPOINT = `${API_BASE_URL}/chat/completions`;
const KEY_STATUS_ENDPOINT = `${API_BASE_URL}/key`;
export const AUTH_EXCHANGE_ENDPOINT = `${API_BASE_URL}/auth/keys`;

function buildHeaders(apiKey, { stream = false } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream' : 'application/json',
    'X-Title': APP_NAME
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    headers['HTTP-Referer'] = window.location.origin;
  }

  return headers;
}

export async function fetchModels() {
  const res = await fetch(MODELS_ENDPOINT);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function checkApiKeyStatus(apiKey) {
  const res = await fetch(KEY_STATUS_ENDPOINT, {
    method: 'GET',
    headers: buildHeaders(apiKey)
  });
  if (!res.ok) throw await buildError(res);
  return res.json();
}

export async function sendChatCompletion({ apiKey, model, messages, stream = false, options = {}, signal }) {
  const body = {
    model,
    messages,
    stream,
    ...options
  };

  const headers = buildHeaders(apiKey, { stream });

  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  });

  if (!stream) {
    if (!res.ok) throw await buildError(res);
    const data = await res.json();
    if (data.error) throw apiError(data.error.code);
    return data;
  }

  if (!res.ok) throw await buildError(res);
  return res;
}

export async function readSSE(response, onChunk, onDone) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (line) => {
    if (!line.trim().startsWith('data:')) return false;
    const data = line.trim().slice(5).trim();
    if (data === '[DONE]') return true;
    let chunk;
    try { chunk = JSON.parse(data); } catch { return false; }
    if (chunk.error) throw apiError(chunk.error.code);
    onChunk(chunk);
    return false;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (consume(line)) {
          await onDone?.();
          return;
        }
      }
      if (done) {
        if (buffer) consume(buffer);
        await onDone?.();
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function exchangeAuthorizationCode({ code, codeVerifier }) {
  const res = await fetch(AUTH_EXCHANGE_ENDPOINT, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ code, code_verifier: codeVerifier, code_challenge_method: 'S256' })
  });
  if (!res.ok) throw await buildError(res);
  const data = await res.json();
  if (typeof data.key !== 'string' || !data.key.trim()) throw new Error('Invalid authorization response.');
  return data.key;
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

// Never surface provider response bodies: they can echo credentials or prompts.
export function apiError(status) {
  status = Number(status) || 0;
  const kind = status === 401 ? 'auth' : status === 402 ? 'billing' : status === 429 ? 'rate' : 'api';
  const message = kind === 'auth' ? 'Your OpenRouter connection is no longer valid. Reconnect to continue.'
    : kind === 'billing' ? 'OpenRouter credits or the key spend allowance are exhausted. Manage your key or add credits.'
    : kind === 'rate' ? 'OpenRouter rate limit reached. Try again later.'
    : `OpenRouter request failed (HTTP ${status || 'unknown'}). Check the selected model and try again.`;
  return Object.assign(new Error(message), { status, kind });
}

async function buildError(res) {
  return apiError(res.status);
}
