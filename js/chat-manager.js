/**
 * Chat Manager Module
 * Handles chat messages, UI updates, and conversation management
 * Following Single Responsibility Principle
 */
(function() {
  'use strict';

  /**
   * Chat Manager Class
   * Encapsulates all chat-related functionality
   */
  class ChatManager {
    constructor() {
      this.messageHistory = [];
      this.currentTypingIndicator = null;
      this.isStreaming = false;
      
      // DOM elements (will be injected)
      this.elements = {};
      
      // Event callbacks
      this.onMessageAdded = null;
      this.onChatCleared = null;
    }

    /**
     * Initialize the chat manager with DOM elements
     * @param {Object} elements - DOM elements object
     */
    initialize(elements) {
      this.elements = elements;
      this.setupEventListeners();
    }

    /**
     * Setup event listeners for chat functionality
     */
    setupEventListeners() {
      const { prompt, sendBtn, clearChatBtn, stopBtn } = this.elements;

      // Auto-resize textarea
      if (prompt) {
        DOMUtils.addEventListener(prompt, 'input', () => {
          this.autoResizeTextarea(prompt);
        });

        // Send message on Enter (but allow Shift+Enter for new lines)
        DOMUtils.addEventListener(prompt, 'keydown', (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
          }
        });
      }

      // Send button
      if (sendBtn) {
        DOMUtils.addEventListener(sendBtn, 'click', () => {
          this.sendMessage();
        });
      }

      // Clear chat button
      if (clearChatBtn) {
        DOMUtils.addEventListener(clearChatBtn, 'click', () => {
          this.clearChat();
        });
      }

      // Stop button
      if (stopBtn) {
        DOMUtils.addEventListener(stopBtn, 'click', () => {
          this.stopGeneration();
        });
      }

      // Handle page unload
      DOMUtils.addEventListener(window, 'beforeunload', () => {
        this.stopGeneration();
      });
    }

    /**
     * Auto-resize textarea based on content
     * @param {HTMLElement} textarea - Textarea element
     */
    autoResizeTextarea(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    /**
     * Send message (delegates to callback)
     */
    sendMessage() {
      if (this.onMessageAdded) {
        this.onMessageAdded();
      }
    }

    /**
     * Stop generation (delegates to callback)
     */
    stopGeneration() {
      if (this.onStopGeneration) {
        this.onStopGeneration();
      }
    }

    /**
     * Add message to chat UI
     * @param {string} role - Message role ('user' or 'assistant')
     * @param {string} content - Message content
     * @param {Array} images - Array of image data
     * @param {boolean} isUploaded - Whether images are uploaded
     * @returns {HTMLElement} Message element
     */
    addMessageToChat(role, content, images = [], isUploaded = false) {
      const { chatMessages } = this.elements;
      
      if (!chatMessages) return null;

      const messageDiv = DOMUtils.createElement('div', {
        className: `message ${role}`
      });
      
      const contentDiv = DOMUtils.createElement('div', {
        className: 'message-content',
        textContent: content
      });
      
      const timeDiv = DOMUtils.createElement('div', {
        className: 'message-time',
        textContent: new Date().toLocaleTimeString()
      });
      
      messageDiv.appendChild(contentDiv);
      
      // Add images if provided
      if (images && images.length > 0) {
        const imagesDiv = this.createImagesDiv(images, isUploaded);
        messageDiv.appendChild(imagesDiv);
      }
      
      messageDiv.appendChild(timeDiv);
      
      // Add edit button for user messages (only for the last user message)
      if (role === 'user') {
        // Hide edit buttons on all previous user messages
        this.hidePreviousEditButtons();
        
        const editBtn = this.createEditButton();
        messageDiv.appendChild(editBtn);
      }
      
      // Add regeneration controls for assistant messages
      if (role === 'assistant') {
        // Hide regeneration controls on all previous assistant messages
        this.hidePreviousRegenerationControls();
        
        const regenerationControls = this.createRegenerationControls();
        messageDiv.appendChild(regenerationControls);
        
        // Notify regeneration manager about the new controls
        if (window.RegenerationManager) {
          RegenerationManager.setCurrentRegenerationControls(regenerationControls);
        }
      }
      
      chatMessages.appendChild(messageDiv);
      
      // Scroll to bottom
      DOMUtils.scrollToBottom(chatMessages);
      
      // Store in message history
      this.messageHistory.push({
        role: role,
        content: content,
        images: images || [],
        timestamp: new Date()
      });
      
      return messageDiv;
    }

    /**
     * Create images container div
     * @param {Array} images - Array of image data
     * @param {boolean} isUploaded - Whether images are uploaded
     * @returns {HTMLElement} Images container
     */
    createImagesDiv(images, isUploaded) {
      const imagesDiv = DOMUtils.createElement('div', {
        className: 'message-images'
      });
      
      images.forEach(imgData => {
        const img = DOMUtils.createElement('img');
        // Handle both uploaded images (base64 data) and generated images (URLs)
        img.src = typeof imgData === 'string' ? imgData : imgData.data;
        img.alt = isUploaded ? 'Uploaded image' : 'Generated image';
        
        DOMUtils.addEventListener(img, 'click', () => {
          if (window.ModalManager) {
            ModalManager.showImageModal(img.src, isUploaded ? 'Uploaded image' : 'Generated image');
          }
        });
        
        imagesDiv.appendChild(img);
      });
      
      return imagesDiv;
    }



    /**
     * Hide regeneration controls on all previous assistant messages
     */
    hidePreviousRegenerationControls() {
      const { chatMessages } = this.elements;
      if (!chatMessages) return;
      
      const allRegenerationControls = chatMessages.querySelectorAll('.regeneration-controls');
      allRegenerationControls.forEach(controls => {
        DOMUtils.hideElement(controls);
      });
    }

    /**
     * Hide edit buttons on all previous user messages
     */
    hidePreviousEditButtons() {
      const { chatMessages } = this.elements;
      if (!chatMessages) return;
      
      const allEditButtons = chatMessages.querySelectorAll('.edit-message-btn');
      allEditButtons.forEach(btn => {
        DOMUtils.hideElement(btn);
      });
    }

    /**
     * Create edit button for user messages
     * @returns {HTMLElement} Edit button element
     */
    createEditButton() {
      const editBtn = DOMUtils.createElement('button', {
        className: 'edit-message-btn',
        title: 'Edit message',
        innerHTML: '✏️'
      });
      
      DOMUtils.addEventListener(editBtn, 'click', (event) => {
        event.stopPropagation();
        this.startEditMode(editBtn.parentElement);
      });
      
      return editBtn;
    }

    /**
     * Start edit mode for a user message
     * @param {HTMLElement} messageElement - Message element to edit
     */
    startEditMode(messageElement) {
      if (!messageElement || !messageElement.classList.contains('user')) return;
      
      const contentDiv = messageElement.querySelector('.message-content');
      if (!contentDiv) return;
      
      const originalContent = contentDiv.textContent;
      
      // Add editing class
      messageElement.classList.add('editing');
      
      // Make the content div editable
      contentDiv.contentEditable = true;
      contentDiv.focus();
      
      // Select all text for easy editing
      const range = document.createRange();
      range.selectNodeContents(contentDiv);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Create edit controls
      const editControls = this.createEditControls(messageElement, originalContent, contentDiv);
      messageElement.appendChild(editControls);
      
      // Handle keyboard shortcuts
      const handleKeydown = (event) => {
        if (event.key === 'Enter' && event.ctrlKey) {
          event.preventDefault();
          this.saveEdit(messageElement, contentDiv);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.cancelEdit(messageElement, originalContent);
        }
      };
      
      DOMUtils.addEventListener(contentDiv, 'keydown', handleKeydown);
      
      // Store the handler for cleanup
      contentDiv._keydownHandler = handleKeydown;
    }

    /**
     * Create edit controls (save/cancel buttons)
     * @param {HTMLElement} messageElement - Message element
     * @param {string} originalContent - Original content for cancel
     * @param {HTMLElement} contentDiv - ContentEditable div element
     * @returns {HTMLElement} Edit controls container
     */
    createEditControls(messageElement, originalContent, contentDiv) {
      const controlsDiv = DOMUtils.createElement('div', {
        className: 'edit-controls'
      });
      
      const saveBtn = DOMUtils.createElement('button', {
        className: 'edit-save-btn',
        textContent: 'Save'
      });
      
      const cancelBtn = DOMUtils.createElement('button', {
        className: 'edit-cancel-btn',
        textContent: 'Cancel'
      });
      
      DOMUtils.addEventListener(saveBtn, 'click', () => {
        this.saveEdit(messageElement, contentDiv);
      });
      
      DOMUtils.addEventListener(cancelBtn, 'click', () => {
        this.cancelEdit(messageElement, originalContent);
      });
      
      controlsDiv.appendChild(saveBtn);
      controlsDiv.appendChild(cancelBtn);
      
      return controlsDiv;
    }

    /**
     * Save edit and trigger regeneration
     * @param {HTMLElement} messageElement - Message element
     * @param {HTMLElement} contentDiv - ContentEditable div element
     */
    saveEdit(messageElement, contentDiv) {
      const newContent = contentDiv.textContent.trim();
      if (!newContent) return;
      
      // Make content non-editable
      contentDiv.contentEditable = false;
      
      // Remove editing state
      messageElement.classList.remove('editing');
      
      // Remove edit controls
      const editControls = messageElement.querySelector('.edit-controls');
      if (editControls) {
        editControls.remove();
      }
      
      // Update message history
      this.updateMessageInHistory(messageElement, newContent);
      
      // Trigger edit callback
      if (this.onMessageEdited) {
        this.onMessageEdited(newContent);
      }
    }

    /**
     * Cancel edit and restore original content
     * @param {HTMLElement} messageElement - Message element
     * @param {string} originalContent - Original content
     */
    cancelEdit(messageElement, originalContent) {
      const contentDiv = messageElement.querySelector('.message-content');
      if (!contentDiv) return;
      
      // Restore original content
      contentDiv.textContent = originalContent;
      
      // Make content non-editable
      contentDiv.contentEditable = false;
      
      // Remove editing state
      messageElement.classList.remove('editing');
      
      // Remove edit controls
      const editControls = messageElement.querySelector('.edit-controls');
      if (editControls) {
        editControls.remove();
      }
    }

    /**
     * Update message in history
     * @param {HTMLElement} messageElement - Message element
     * @param {string} newContent - New content
     */
    updateMessageInHistory(messageElement, newContent) {
      // Find the message in history and update it
      const messageIndex = this.findMessageIndex(messageElement);
      if (messageIndex >= 0) {
        this.messageHistory[messageIndex].content = newContent;
      }
    }

    /**
     * Find message index in history
     * @param {HTMLElement} messageElement - Message element
     * @returns {number} Message index or -1 if not found
     */
    findMessageIndex(messageElement) {
      const { chatMessages } = this.elements;
      if (!chatMessages) return -1;
      
      const allMessages = chatMessages.querySelectorAll('.message');
      let index = -1;
      
      for (let i = 0; i < allMessages.length; i++) {
        if (allMessages[i] === messageElement) {
          index = i;
          break;
        }
      }
      
      return index;
    }

    /**
     * Create regeneration controls
     * @returns {HTMLElement} Regeneration controls container
     */
    createRegenerationControls() {
      const controlsDiv = DOMUtils.createElement('div', {
        className: 'regeneration-controls'
      });
      controlsDiv.style.display = 'none'; // Initially hidden
      
      const prevBtn = DOMUtils.createElement('button', {
        className: 'btn secondary',
        title: 'Previous response',
        innerHTML: '‹'
      });
      
      const counterSpan = DOMUtils.createElement('span', {
        className: 'response-counter',
        textContent: '1/1'
      });
      
      const nextBtn = DOMUtils.createElement('button', {
        className: 'btn secondary',
        title: 'Next response',
        innerHTML: '›'
      });
      
      const regenerateBtn = DOMUtils.createElement('button', {
        className: 'btn secondary',
        title: 'Generate new response',
        innerHTML: '🔄'
      });
      
      // Add event listeners (will be handled by regeneration manager)
      DOMUtils.addEventListener(prevBtn, 'click', () => {
        if (window.RegenerationManager) {
          RegenerationManager.showPreviousResponse();
        }
      });
      
      DOMUtils.addEventListener(nextBtn, 'click', () => {
        if (window.RegenerationManager) {
          RegenerationManager.showNextResponse();
        }
      });
      
      DOMUtils.addEventListener(regenerateBtn, 'click', () => {
        if (window.RegenerationManager) {
          RegenerationManager.regenerateLastResponse();
        }
      });
      
      controlsDiv.appendChild(prevBtn);
      controlsDiv.appendChild(counterSpan);
      controlsDiv.appendChild(nextBtn);
      controlsDiv.appendChild(regenerateBtn);
      
      return controlsDiv;
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
      this.hideTypingIndicator();
      
      const { chatMessages } = this.elements;
      if (!chatMessages) return;
      
      const typingDiv = DOMUtils.createElement('div', {
        className: 'message assistant typing-indicator',
        innerHTML: 
          '<div class="message-content">' +
            '<div class="typing-dots">' +
              '<span></span><span></span><span></span>' +
            '</div>' +
            'Assistant is typing...' +
          '</div>'
      });
      
      chatMessages.appendChild(typingDiv);
      this.currentTypingIndicator = typingDiv;
      DOMUtils.scrollToBottom(chatMessages);
    }

    /**
     * Hide typing indicator
     */
    hideTypingIndicator() {
      if (this.currentTypingIndicator) {
        this.currentTypingIndicator.remove();
        this.currentTypingIndicator = null;
      }
    }

    /**
     * Update message content
     * @param {HTMLElement} messageElement - Message element to update
     * @param {string} content - New content
     * @param {Array} images - New images
     */
    updateMessageContent(messageElement, content, images = []) {
      if (!messageElement) return;
      
      const contentDiv = messageElement.querySelector('.message-content');
      if (contentDiv) {
        DOMUtils.setTextContent(contentDiv, content);
      }
      
      // Update images
      const imagesDiv = messageElement.querySelector('.message-images');
      if (imagesDiv) {
        imagesDiv.remove();
      }
      
      if (images && images.length > 0) {
        const newImagesDiv = this.createImagesDiv(images, false);
        messageElement.appendChild(newImagesDiv);
      }
    }

    /**
     * Update last assistant message
     * @param {string} content - New content
     * @param {Array} images - New images
     */
    updateLastAssistantMessage(content, images = []) {
      const { chatMessages } = this.elements;
      if (!chatMessages) return;
      
      const assistantMessages = chatMessages.querySelectorAll('.message.assistant');
      if (assistantMessages.length > 0) {
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        this.updateMessageContent(lastMessage, content, images);
      }
    }

    /**
     * Clear chat
     */
    clearChat() {
      const { chatMessages } = this.elements;
      
      if (chatMessages) {
        DOMUtils.setInnerHTML(chatMessages, '');
      }
      
      this.messageHistory = [];
      this.hideTypingIndicator();
      
      if (this.onChatCleared) {
        this.onChatCleared();
      }
    }

    /**
     * Set streaming state
     * @param {boolean} streaming - Whether currently streaming
     */
    setStreamingState(streaming) {
      this.isStreaming = streaming;
      
      const { sendBtn, prompt, stopBtn } = this.elements;
      
      if (sendBtn) {
        if (streaming) {
          DOMUtils.disableElement(sendBtn);
        } else {
          DOMUtils.enableElement(sendBtn);
        }
      }
      
      if (prompt) {
        if (streaming) {
          DOMUtils.disableElement(prompt);
        } else {
          DOMUtils.enableElement(prompt);
        }
      }
      
      if (stopBtn) {
        if (streaming) {
          DOMUtils.showElement(stopBtn, 'inline-block');
        } else {
          DOMUtils.hideElement(stopBtn);
        }
      }
    }

    /**
     * Get message history
     * @returns {Array} Array of message objects
     */
    getMessageHistory() {
      return this.messageHistory;
    }

    /**
     * Set message history
     * @param {Array} history - Message history array
     */
    setMessageHistory(history) {
      this.messageHistory = history || [];
    }

    /**
     * Get last user message
     * @returns {Object|null} Last user message or null
     */
    getLastUserMessage() {
      for (let i = this.messageHistory.length - 1; i >= 0; i--) {
        if (this.messageHistory[i].role === 'user') {
          return this.messageHistory[i];
        }
      }
      return null;
    }

    /**
     * Set event callbacks
     * @param {Object} callbacks - Callback functions
     */
    setCallbacks(callbacks) {
      this.onMessageAdded = callbacks.onMessageAdded;
      this.onChatCleared = callbacks.onChatCleared;
      this.onStopGeneration = callbacks.onStopGeneration;
      this.onPreviousResponse = callbacks.onPreviousResponse;
      this.onNextResponse = callbacks.onNextResponse;
      this.onRegenerateResponse = callbacks.onRegenerateResponse;
      this.onMessageEdited = callbacks.onMessageEdited;
    }
  }

  // Export singleton instance
  window.ChatManager = new ChatManager();

})();
