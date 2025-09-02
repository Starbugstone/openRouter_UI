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
    }
  }

  // Export singleton instance
  window.ChatManager = new ChatManager();

})();
