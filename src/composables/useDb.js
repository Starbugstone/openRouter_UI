import Dexie from 'dexie';
import { DATABASE_NAME } from '../config/app';

const db = new Dexie(DATABASE_NAME);

db.version(1).stores({
  chats: 'id, updatedAt'
});

let initialization;
function initializeDatabase() {
  if (!initialization) {
    initialization = (async () => {
      // Intentionally discard development history. Never open/read/copy old records.
      await Dexie.delete('openrouter_ui');
      await db.open();
    })().catch(error => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

export function useDb() {
  const saveChat = async (chat) => {
    await initializeDatabase();
    const record = {
      ...chat,
      updatedAt: chat.updatedAt || new Date().toISOString()
    };
    await db.chats.put(record);
    return record;
  };

  const getChat = async (id) => {
    if (!id) return null;
    await initializeDatabase();
    return db.chats.get(id);
  };

  const listChats = async () => {
    await initializeDatabase();
    return db.chats.orderBy('updatedAt').reverse().toArray();
  };

  const deleteChat = async (id) => {
    if (!id) return;
    await initializeDatabase();
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


