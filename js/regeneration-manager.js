/**
 * Regeneration Manager Module
 * Handles response regeneration and history management
 * Following Single Responsibility Principle
 */
(function() {
  'use strict';

  /**
   * Regeneration Manager Class
   * Encapsulates all regeneration-related functionality
   */
  class RegenerationManager {
    constructor() {
      this.regenerationHistory = [];
      this.currentResponseIndex = -1;
      this.lastUserMessage = null;
      this.currentRegenerationControls = null;
      
      // Event callbacks
      this.onRegenerateRequested = null;
      this.onResponseChanged = null;
    }

    /**
     * Initialize the regeneration manager
     */
    initialize() {
      // Event callbacks will be set by the main application
    }

    /**
     * Store last user message for regeneration
     * @param {Object} userMessage - User message object
     */
    storeLastUserMessage(userMessage) {
      // Clear previous regeneration history when storing a new user message
      this.regenerationHistory = [];
      this.currentResponseIndex = -1;
      
      this.lastUserMessage = {
        content: userMessage.content,
        images: userMessage.images ? userMessage.images.slice() : [] // Create a copy
      };
      console.log('Stored lastUserMessage:', this.lastUserMessage);
    }

    /**
     * Add response to regeneration history
     * @param {string} content - Response content
     * @param {Array} images - Response images
     */
    addResponseToHistory(content, images = []) {
      const response = {
        content: content,
        images: images || [],
        timestamp: new Date()
      };
      
      this.regenerationHistory.push(response);
      this.currentResponseIndex = this.regenerationHistory.length - 1;
      
      console.log('Added response to history. Total responses:', this.regenerationHistory.length);
      this.updateRegenerationControls();
    }

    /**
     * Clear regeneration history
     */
    clearRegenerationHistory() {
      console.log('clearRegenerationHistory called - clearing lastUserMessage');
      this.regenerationHistory = [];
      this.currentResponseIndex = -1;
      this.lastUserMessage = null;
      
      if (this.currentRegenerationControls) {
        DOMUtils.hideElement(this.currentRegenerationControls);
      }
    }

    /**
     * Clear regeneration history but preserve user message
     */
    clearRegenerationHistoryOnly() {
      console.log('clearRegenerationHistoryOnly called - preserving lastUserMessage');
      this.regenerationHistory = [];
      this.currentResponseIndex = -1;
      
      if (this.currentRegenerationControls) {
        DOMUtils.hideElement(this.currentRegenerationControls);
      }
    }

    /**
     * Regenerate last response
     */
    regenerateLastResponse() {
      console.log('Regenerate button clicked. lastUserMessage:', this.lastUserMessage);
      
      if (!this.lastUserMessage) {
        console.warn('No user message to regenerate');
        return;
      }
      
      if (this.onRegenerateRequested) {
        this.onRegenerateRequested(this.lastUserMessage);
      }
    }

    /**
     * Show previous response
     */
    showPreviousResponse() {
      if (this.currentResponseIndex > 0) {
        this.currentResponseIndex--;
        this.displayCurrentResponse();
        this.updateRegenerationControls();
      }
    }

    /**
     * Show next response
     */
    showNextResponse() {
      if (this.currentResponseIndex < this.regenerationHistory.length - 1) {
        this.currentResponseIndex++;
        this.displayCurrentResponse();
        this.updateRegenerationControls();
      }
    }

    /**
     * Display current response
     */
    displayCurrentResponse() {
      if (this.currentResponseIndex >= 0 && this.currentResponseIndex < this.regenerationHistory.length) {
        const response = this.regenerationHistory[this.currentResponseIndex];
        
        if (this.onResponseChanged) {
          this.onResponseChanged(response);
        }
        
        // Update the chat history to match the displayed response
        this.updateChatHistoryWithCurrentResponse();
      }
    }

    /**
     * Update chat history to match the currently displayed response
     */
    updateChatHistoryWithCurrentResponse() {
      if (this.currentResponseIndex >= 0 && this.currentResponseIndex < this.regenerationHistory.length) {
        const response = this.regenerationHistory[this.currentResponseIndex];
        
        // Get current chat history
        const messageHistory = ChatManager.getMessageHistory();
        
        // Find the last assistant message and update it
        for (let i = messageHistory.length - 1; i >= 0; i--) {
          if (messageHistory[i].role === 'assistant') {
            messageHistory[i].content = response.content;
            messageHistory[i].images = response.images || [];
            break;
          }
        }
        
        // Update the chat history
        ChatManager.setMessageHistory(messageHistory);
      }
    }

    /**
     * Update regeneration controls UI
     */
    updateRegenerationControls() {
      console.log('Updating regeneration controls. History length:', this.regenerationHistory.length);
      
      if (this.currentRegenerationControls && this.regenerationHistory.length > 0) {
        DOMUtils.showElement(this.currentRegenerationControls, 'flex');
        
        const counterSpan = this.currentRegenerationControls.querySelector('.response-counter');
        const prevBtn = this.currentRegenerationControls.querySelector('button[title="Previous response"]');
        const nextBtn = this.currentRegenerationControls.querySelector('button[title="Next response"]');
        
        if (counterSpan) {
          DOMUtils.setTextContent(counterSpan, `${this.currentResponseIndex + 1}/${this.regenerationHistory.length}`);
        }
        
        if (prevBtn) {
          prevBtn.disabled = this.currentResponseIndex <= 0;
        }
        
        if (nextBtn) {
          nextBtn.disabled = this.currentResponseIndex >= this.regenerationHistory.length - 1;
        }
        
        console.log('Regeneration controls shown');
      } else if (this.currentRegenerationControls) {
        DOMUtils.hideElement(this.currentRegenerationControls);
        console.log('Regeneration controls hidden');
      }
    }

    /**
     * Set current regeneration controls element
     * @param {HTMLElement} controlsElement - Controls element
     */
    setCurrentRegenerationControls(controlsElement) {
      this.currentRegenerationControls = controlsElement;
    }

    /**
     * Get regeneration history
     * @returns {Array} Array of regeneration responses
     */
    getRegenerationHistory() {
      return this.regenerationHistory;
    }

    /**
     * Get current response index
     * @returns {number} Current response index
     */
    getCurrentResponseIndex() {
      return this.currentResponseIndex;
    }

    /**
     * Get last user message
     * @returns {Object|null} Last user message or null
     */
    getLastUserMessage() {
      return this.lastUserMessage;
    }

    /**
     * Check if regeneration is available
     * @returns {boolean} Whether regeneration is available
     */
    canRegenerate() {
      return this.lastUserMessage !== null;
    }

    /**
     * Check if there are multiple responses
     * @returns {boolean} Whether there are multiple responses
     */
    hasMultipleResponses() {
      return this.regenerationHistory.length > 1;
    }

    /**
     * Check if previous response is available
     * @returns {boolean} Whether previous response is available
     */
    canGoToPrevious() {
      return this.currentResponseIndex > 0;
    }

    /**
     * Check if next response is available
     * @returns {boolean} Whether next response is available
     */
    canGoToNext() {
      return this.currentResponseIndex < this.regenerationHistory.length - 1;
    }

    /**
     * Get current response
     * @returns {Object|null} Current response or null
     */
    getCurrentResponse() {
      if (this.currentResponseIndex >= 0 && this.currentResponseIndex < this.regenerationHistory.length) {
        return this.regenerationHistory[this.currentResponseIndex];
      }
      return null;
    }

    /**
     * Set event callbacks
     * @param {Object} callbacks - Callback functions
     */
    setCallbacks(callbacks) {
      this.onRegenerateRequested = callbacks.onRegenerateRequested;
      this.onResponseChanged = callbacks.onResponseChanged;
    }

    /**
     * Reset to initial state
     */
    reset() {
      this.clearRegenerationHistory();
      this.currentRegenerationControls = null;
    }

    /**
     * Get regeneration statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
      return {
        totalResponses: this.regenerationHistory.length,
        currentIndex: this.currentResponseIndex,
        hasUserMessage: this.lastUserMessage !== null,
        canRegenerate: this.canRegenerate(),
        hasMultipleResponses: this.hasMultipleResponses()
      };
    }
  }

  // Export singleton instance
  window.RegenerationManager = new RegenerationManager();

})();
