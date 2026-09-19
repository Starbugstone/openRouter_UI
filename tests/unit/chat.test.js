import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useChat } from '../../src/composables/useChat';
import { useDb } from '../../src/composables/useDb';
import { apiError, readSSE } from '../../src/composables/useApi';

const free = { id: 'test/free', name: 'Free', pricing: { prompt: '0', completion: '0' } };
const paid = { id: 'test/paid', name: 'Paid', pricing: { prompt: '1', completion: '1' } };
const credential = 'test-secret-chat';
let chat, auth, models;
function response(content = 'Hello') { return new Response(JSON.stringify({ choices: [{ message: { content } }] })); }
function sse(lines) { return new Response(lines.map(line => `data: ${typeof line === 'string' ? line : JSON.stringify(line)}\r\n\r\n`).join('')); }
beforeEach(async () => {
  await useDb().db.chats.clear();
  models = { selectedModel: ref(free), allModels: ref([free, paid]), select(model) { this.selectedModel.value = model; } };
  auth = { beforeRequest: vi.fn().mockResolvedValue(true), requireCredential: vi.fn(() => credential), isConnected: ref(true), checkStatus: vi.fn(), handleRequestError: vi.fn() };
  chat = useChat(models, auth); await chat.init(); chat.stream.value = false;
});
afterEach(() => vi.restoreAllMocks());

describe('chat regression coverage', () => {
  it('sends text and image attachments, persists chat without credentials', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());
    expect(await chat.sendMessage({ prompt: 'Question', images: ['data:image/png;base64,AA=='] })).toBe(true);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.model).toBe(free.id);
    expect(body.messages[0].content).toEqual([{ type: 'text', text: 'Question' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }]);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${credential}`);
    expect(chat.messages.value.at(-1).content).toBe('Hello');
    expect(JSON.stringify(await useDb().listChats())).not.toContain(credential);
    expect(chat.apiKey).toBeUndefined(); expect(chat.rememberKey).toBeUndefined();
  });
  it('streams text, awaits persistence and pins updates to the original branch', async () => {
    chat.stream.value = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sse([{ choices: [{ delta: { content: 'Hel' } }] }, { choices: [{ delta: { content: 'lo' } }] }, '[DONE]']));
    const onDone = vi.fn();
    await chat.sendMessage({ prompt: 'Question', images: [], onDone });
    expect(chat.messages.value.at(-1).content).toBe('Hello'); expect(onDone).toHaveBeenCalledTimes(1);
    const saved = await useDb().getChat(chat.activeChatId.value);
    expect(saved.branches[0].messages.at(-1).content).toBe('Hello');
  });
  it.each([false, true])('generates images with streaming=%s', async stream => {
    chat.mode.value = 'image'; chat.stream.value = stream;
    const img = { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(stream
      ? sse([{ choices: [{ delta: { images: [img] } }] }, '[DONE]'])
      : new Response(JSON.stringify({ choices: [{ message: { images: [img] } }] })));
    await chat.sendMessage({ prompt: 'Draw', images: [] });
    expect(JSON.parse(fetch.mock.calls[0][1].body).modalities).toEqual(['image', 'text']);
    expect(chat.messages.value.at(-1).images).toEqual([img.image_url.url]);
  });
  it('preserves histories when regenerating, cloning and branching from edited messages', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
    await chat.sendMessage({ prompt: 'First', images: [] });
    await chat.sendMessage({ prompt: 'Second', images: [] });
    const originalId = chat.activeBranchId.value;
    await chat.regenerateLastAssistantReply();
    expect(chat.activeBranchId.value).not.toBe(originalId);
    expect(chat.messages.value.map(m => m.content)).toEqual(['First', 'Hello', 'Second', 'Hello']);
    await chat.cloneActiveBranch(); expect(fetch).toHaveBeenCalledTimes(3);
    await chat.branchFromMessage(2, 'Edited', { generate: true });
    expect(chat.messages.value.map(m => m.content)).toEqual(['First', 'Hello', 'Edited', 'Hello']);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(auth.beforeRequest).toHaveBeenCalledTimes(4);
    expect(chat.branches.value.some(b => b.messages.some(m => m.content === 'Second'))).toBe(true);
  });
  it('does not mutate history or call inference when a paid request is declined', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
    await chat.sendMessage({ prompt: 'First', images: [] });
    await chat.sendMessage({ prompt: 'Second', images: [] });
    auth.beforeRequest.mockResolvedValue(false);
    const before = JSON.stringify(chat.branches.value);
    expect(await chat.sendMessage({ prompt: 'Blocked', images: [] })).toBe(false);
    await chat.regenerateLastAssistantReply(); await chat.branchFromMessage(2, 'Blocked edit', { generate: true });
    expect(JSON.stringify(chat.branches.value)).toBe(before); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('refreshes spend metadata after paid requests and does not automatically retry billing errors', async () => {
    models.select(paid);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('do not display this raw response', { status: 402 }));
    await expect(chat.sendMessage({ prompt: 'Question', images: [] })).rejects.toMatchObject({ kind: 'billing' });
    expect(auth.handleRequestError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'billing' }), credential);
    expect(auth.checkStatus).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
    expect(models.selectedModel.value.id).toBe(paid.id); expect(chat.streaming.value).toBe(false);
  });
  it('handles errors inside a successful streaming HTTP response', async () => {
    chat.stream.value = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sse([{ error: { code: 401, message: credential } }]));
    await expect(chat.sendMessage({ prompt: 'Question', images: [] })).rejects.toMatchObject({ kind: 'auth' });
    expect(auth.handleRequestError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'auth' }), credential);
    expect(JSON.stringify(await useDb().listChats())).not.toContain(credential);
  });
  it('stops a request without retries and releases the send lock only after it settles', async () => {
    let started;
    const pending = new Promise(resolve => { started = resolve; });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      started();
    }));
    const send = chat.sendMessage({ prompt: 'Question', images: [] }); await pending;
    await chat.stopStreaming(); await send;
    expect(chat.streaming.value).toBe(false); expect(fetch).toHaveBeenCalledTimes(1); expect(auth.handleRequestError).not.toHaveBeenCalled();
  });
  it('does not replace an unavailable saved model with a previously selected paid model', async () => {
    models.select(paid);
    await useDb().saveChat({ id: 'unavailable', model: { id: 'retired/free', name: 'Retired' }, messages: [] });
    await chat.selectChat('unavailable');
    expect(models.selectedModel.value).toBeNull();
    expect(chat.chatWarning.value).toContain('unavailable');
    await expect(chat.sendMessage({ prompt: 'Question', images: [] })).rejects.toMatchObject({ kind: 'model' });
  });
  it('keeps a stream pinned to its original branch and model after selection changes', async () => {
    chat.stream.value = true;
    await chat.cloneActiveBranch();
    const original = chat.activeBranchId.value;
    const other = chat.branches.value.find(branch => branch.id !== original).id;
    let streamController;
    const body = new ReadableStream({ start(controller) { streamController = controller; } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
    const pending = chat.sendMessage({ prompt: 'Question', images: [] });
    await vi.waitFor(() => expect(chat.messages.value.at(-1)?.role).toBe('assistant'));
    await chat.setActiveBranch(other); models.select(paid);
    streamController.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Pinned"}}]}\n\ndata: [DONE]\n\n'));
    streamController.close(); await pending;
    const reply = chat.branches.value.find(branch => branch.id === original).messages.at(-1);
    expect(reply.content).toBe('Pinned'); expect(reply.model.id).toBe(free.id);
    expect(chat.messages.value).toHaveLength(0);
  });
  it('does not use a new connection to send a request authorized for the old one', async () => {
    auth.requireCredential.mockReturnValueOnce(credential).mockReturnValue('different-account');
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(chat.sendMessage({ prompt: 'Question', images: [] })).rejects.toMatchObject({
      kind: 'connection', message: 'Connection changed. Send again to authorize this request.'
    });
    expect(auth.handleRequestError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'connection' }), credential);
    expect(auth.isConnected.value).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('honors Stop during authorization before changing history or sending inference', async () => {
    let resolve; auth.beforeRequest.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const fetch = vi.spyOn(globalThis, 'fetch');
    const pending = chat.sendMessage({ prompt: 'Do not send', images: [] });
    await chat.stopStreaming(); resolve(true);
    expect(await pending).toBe(false);
    expect(fetch).not.toHaveBeenCalled(); expect(chat.messages.value).toHaveLength(0);
  });
  it('prevents overlapping sends while authorization is pending', async () => {
    let resolve; auth.beforeRequest.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());
    const first = chat.sendMessage({ prompt: 'One', images: [] });
    expect(await chat.sendMessage({ prompt: 'Two', images: [] })).toBe(false);
    resolve(true); await first; expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('transport errors', () => {
  it('never includes provider bodies in errors and distinguishes rate/billing/auth', () => {
    expect(apiError(401).kind).toBe('auth'); expect(apiError(402).kind).toBe('billing'); expect(apiError(429).kind).toBe('rate'); expect(apiError(403).kind).toBe('api');
  });
  it('does not swallow errors thrown by stream consumers', async () => {
    await expect(readSSE(sse([{ choices: [] }]), () => { throw new Error('consumer failed'); })).rejects.toThrow('consumer failed');
  });
});
