import Dexie from 'dexie';

const db = new Dexie('openrouter_ui');

db.version(2).stores({
  chats: 'id, updatedAt'
});

export function useDb() {
  const saveChat = async (chat) => {
    const record = {
      ...chat,
      updatedAt: chat.updatedAt || new Date().toISOString()
    };
    await db.chats.put(record);
    return record;
  };

  const getChat = async (id) => {
    if (!id) return null;
    return db.chats.get(id);
  };

  const listChats = async () => {
    return db.chats.orderBy('updatedAt').reverse().toArray();
  };

  const deleteChat = async (id) => {
    if (!id) return;
    await db.chats.delete(id);
  };

  return {
    db,
    saveChat,
    getChat,
    listChats,
    deleteChat
  };
}


