/**
 * Chat History Manager
 * Persists chat threads in localStorage and manages sidebar UI
 */
(function() {
  'use strict';

  class ChatHistoryManager {
    constructor() {
      this.storageKey = 'or_chat_history_v1';
      this.chats = [];
      this.activeChatId = null;
      this.elements = {};
      this.callbacks = {
        onChatSelected: null,
        onChatDeleted: null,
        onChatCreated: null
      };
    }

    /**
     * Initialize manager with DOM elements and load saved chats
     * @param {Object} elements
     * @returns {Object|null} Active chat
     */
    initialize(elements = {}) {
      this.elements = elements;
      this.loadFromStorage();
      this.attachEventHandlers();

      if (!this.activeChatId && this.chats.length > 0) {
        this.activeChatId = this.chats[0].id;
      }

      if (!this.activeChatId) {
        this.createChat({ title: 'New chat' });
      } else {
        this.renderList();
      }

      return this.getActiveChat();
    }

    /**
     * Attach sidebar event handlers
     */
    attachEventHandlers() {
      const { newChatBtn, listContainer } = this.elements;

      if (newChatBtn) {
        DOMUtils.addEventListener(newChatBtn, 'click', () => {
          this.createChat({ title: 'New chat' });
        });
      }

      if (listContainer) {
        DOMUtils.addEventListener(listContainer, 'click', (event) => {
          const deleteBtn = event.target.closest('[data-chat-delete]');
          const item = event.target.closest('.chat-history-item');

          if (deleteBtn && item) {
            event.stopPropagation();
            const chatId = item.dataset.chatId;
            this.deleteChat(chatId);
            return;
          }

          if (item) {
            const chatId = item.dataset.chatId;
            this.selectChat(chatId);
          }
        });
      }
    }

    /**
     * Create a new chat and make it active
     * @param {Object} chatData
     * @returns {Object} Created chat
     */
    createChat(chatData = {}) {
      const chat = {
        id: `chat-${Date.now()}`,
        title: chatData.title || 'New chat',
        messages: chatData.messages || [],
        model: chatData.model || null,
        mode: chatData.mode || 'text',
        updatedAt: chatData.updatedAt || new Date().toISOString()
      };

      this.chats.unshift(chat);
      this.activeChatId = chat.id;
      this.persist();
      this.renderList();
      this.notify('onChatCreated', chat);
      return chat;
    }

    /**
     * Update active chat with latest state
     * @param {Object} data
     */
    updateActiveChat(data = {}) {
      const chat = this.ensureActiveChat();
      if (!chat) return null;

      if (Array.isArray(data.messages)) {
        chat.messages = data.messages;
      }

      if (data.model !== undefined) {
        chat.model = data.model;
      }

      if (data.mode) {
        chat.mode = data.mode;
      }

      chat.title = this.buildTitle(chat);
      chat.updatedAt = new Date().toISOString();

      this.persist();
      this.renderList();
      return chat;
    }

    /**
     * Select a chat by id
     * @param {string} chatId
     */
    selectChat(chatId) {
      if (!chatId || chatId === this.activeChatId) return;
      const chat = this.chats.find(c => c.id === chatId);
      if (!chat) return;

      this.activeChatId = chatId;
      this.persist();
      this.renderList();
      this.notify('onChatSelected', chat);
    }

    /**
     * Delete a chat and select fallback
     * @param {string} chatId
     */
    deleteChat(chatId) {
      const index = this.chats.findIndex(c => c.id === chatId);
      if (index === -1) return;

      const wasActive = this.activeChatId === chatId;
      this.chats.splice(index, 1);

      if (this.chats.length === 0) {
        const newChat = this.createChat({ title: 'New chat' });
        this.notify('onChatDeleted', newChat);
        return;
      }

      if (wasActive) {
        this.activeChatId = this.chats[0].id;
      }

      this.persist();
      this.renderList();
      this.notify('onChatDeleted', this.getActiveChat());
    }

    /**
     * Get active chat
     * @returns {Object|null}
     */
    getActiveChat() {
      return this.chats.find(c => c.id === this.activeChatId) || null;
    }

    /**
     * Ensure an active chat exists
     * @returns {Object} Active chat
     */
    ensureActiveChat() {
      let chat = this.getActiveChat();
      if (!chat) {
        chat = this.createChat({ title: 'New chat' });
      }
      return chat;
    }

    /**
     * Set callbacks
     * @param {Object} callbacks
     */
    setCallbacks(callbacks = {}) {
      this.callbacks = {
        ...this.callbacks,
        ...callbacks
      };
    }

    /**
     * Persist chats to localStorage
     */
    persist() {
      try {
        const payload = {
          chats: this.chats,
          activeChatId: this.activeChatId
        };
        localStorage.setItem(this.storageKey, JSON.stringify(payload));
      } catch (e) {
        console.warn('Failed to persist chat history', e);
      }
    }

    /**
     * Load chats from localStorage
     */
    loadFromStorage() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) {
          this.chats = [];
          this.activeChatId = null;
          return;
        }

        const parsed = JSON.parse(raw);
        // Support legacy array-only shape
        if (Array.isArray(parsed)) {
          this.chats = parsed;
          this.activeChatId = parsed[0] ? parsed[0].id : null;
        } else {
          this.chats = Array.isArray(parsed.chats) ? parsed.chats : [];
          this.activeChatId = parsed.activeChatId || (this.chats[0] ? this.chats[0].id : null);
        }
      } catch (e) {
        console.warn('Failed to load chat history', e);
        this.chats = [];
        this.activeChatId = null;
      }
    }

    /**
     * Render chat list
     */
    renderList() {
      const { listContainer } = this.elements;
      if (!listContainer) return;

      DOMUtils.setInnerHTML(listContainer, '');

      if (this.chats.length === 0) {
        const empty = DOMUtils.createElement('div', {
          className: 'muted small',
          textContent: 'No chats yet'
        });
        listContainer.appendChild(empty);
        return;
      }

      this.chats.forEach(chat => {
        const item = DOMUtils.createElement('div', {
          className: `chat-history-item${chat.id === this.activeChatId ? ' active' : ''}`,
          'data-chat-id': chat.id
        });

        const title = DOMUtils.createElement('div', {
          className: 'chat-history-title',
          textContent: chat.title
        });

        const meta = DOMUtils.createElement('div', {
          className: 'chat-history-meta',
          textContent: this.formatUpdatedAt(chat.updatedAt)
        });

        const deleteBtn = DOMUtils.createElement('button', {
          className: 'chat-history-delete',
          innerHTML: '🗑️',
          title: 'Delete chat',
          'data-chat-delete': 'true'
        });

        item.appendChild(title);
        item.appendChild(meta);
        item.appendChild(deleteBtn);
        listContainer.appendChild(item);
      });
    }

    /**
     * Build a readable title
     * @param {Object} chat
     * @returns {string}
     */
    buildTitle(chat) {
      const firstUser = (chat.messages || []).find(msg => msg.role === 'user' && msg.content);
      if (firstUser && typeof firstUser.content === 'string') {
        const trimmed = firstUser.content.trim();
        if (trimmed.length > 0) {
          return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
        }
      }
      return chat.title || 'New chat';
    }

    /**
     * Format updated timestamp
     * @param {string} iso
     * @returns {string}
     */
    formatUpdatedAt(iso) {
      if (!iso) return '—';
      try {
        const date = new Date(iso);
        return `Updated ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
      } catch (e) {
        return 'Updated recently';
      }
    }

    /**
     * Notify listeners
     * @param {string} key
     * @param {Object} payload
     */
    notify(key, payload) {
      const handler = this.callbacks[key];
      if (typeof handler === 'function') {
        handler(payload);
      }
    }
  }

  window.ChatHistoryManager = new ChatHistoryManager();
})();
