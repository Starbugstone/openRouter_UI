import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import App from '../../src/App.vue';
import ChatInput from '../../src/components/ChatInput.vue';
import { useDb } from '../../src/composables/useDb';

const auth = vi.hoisted(() => ({ store: null }));
vi.mock('../../src/composables/useOpenRouterAuth', () => ({ useOpenRouterAuth: () => auth.store }));

let wrapper;
beforeEach(async () => {
  await useDb().db.chats.clear();
  await useDb().saveChat({
    id: 'saved-chat', model: { id: 'test/free', name: 'Free model' }, mode: 'text',
    branches: [{ id: 'main', title: 'Main', messages: [] }], activeBranchId: 'main'
  });
  auth.store = {
    initialize: vi.fn(), isConnected: ref(true), isInitializing: ref(false), isAuthorizing: ref(false),
    authError: ref(''), beforeRequest: vi.fn().mockResolvedValue(true),
    requireCredential: vi.fn().mockReturnValueOnce('original-account').mockReturnValue('new-account'),
    handleRequestError: vi.fn(), checkStatus: vi.fn()
  };
});
afterEach(() => wrapper?.unmount());

it('shows the connection-change explanation and preserves the draft instead of a generic send error', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (!url.endsWith('/models')) throw new Error('Inference must not be called after the connection changes.');
    return new Response(JSON.stringify({ data: [{ id: 'test/free', name: 'Free model', pricing: { prompt: '0', completion: '0' } }] }));
  });
  wrapper = shallowMount(App);
  const input = wrapper.findComponent(ChatInput);
  await vi.waitFor(() => expect(input.props('disabled')).toBe(false));
  input.vm.$emit('update:prompt', 'Keep my draft');
  input.vm.$emit('send');
  await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toBe('Connection changed. Send again to authorize this request.'));
  expect(input.props('prompt')).toBe('Keep my draft');
  expect(auth.store.isConnected.value).toBe(true);
  expect(auth.store.authError.value).toBe('');
  expect(auth.store.handleRequestError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'connection' }), 'original-account');
  expect(fetch).toHaveBeenCalledTimes(1);
});
