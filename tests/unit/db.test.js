import Dexie from 'dexie';
import { expect, it, vi } from 'vitest';
import { useDb } from '../../src/composables/useDb';

it('deletes the old database without opening its records, then persists only new history', async () => {
  const old = new Dexie('openrouter_ui');
  old.version(2).stores({ chats: 'id, updatedAt' });
  await old.table('chats').put({ id: 'discard-me', messages: [{ content: 'old development history' }] });
  old.close();
  const open = vi.spyOn(indexedDB, 'open');
  const remove = vi.spyOn(indexedDB, 'deleteDatabase');
  const store = useDb();
  expect(await store.listChats()).toEqual([]);
  expect(store.db.name).toBe('ai_playground'); expect(store.db.verno).toBe(1);
  expect(remove).toHaveBeenCalledWith('openrouter_ui');
  expect(open.mock.calls.some(([name]) => name === 'openrouter_ui')).toBe(false);
  expect(await Dexie.exists('openrouter_ui')).toBe(false);
  await store.saveChat({ id: 'new-chat', branches: [{ id: 'main', messages: [{ role: 'user', content: 'new history' }] }] });
  store.db.close();
  await store.db.open();
  expect((await store.listChats()).map(chat => chat.id)).toEqual(['new-chat']);
  expect((await store.getChat('new-chat')).branches[0].messages[0].content).toBe('new history');
  await store.db.delete();
});
