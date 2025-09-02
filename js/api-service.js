/**
 * API Service Module
 * Handles all OpenRouter API interactions
 * Following Single Responsibility Principle and Dependency Inversion
 */
(function() {
  'use strict';

  const API_BASE_URL = 'https://openrouter.ai/api/v1';
  const MODELS_ENDPOINT = `${API_BASE_URL}/models`;
  const CHAT_ENDPOINT = `${API_BASE_URL}/chat/completions`;
  const KEY_STATUS_ENDPOINT = `${API_BASE_URL}/key`;

  /**
   * API Service Class
   * Encapsulates all API communication logic
   */
  class APIService {
    constructor() {
      this.currentController = null;
      this.streamingActive = false;
    }

    /**
     * Get HTTP header value safely
     * @param {Response} response - Fetch response
     * @param {string} name - Header name
     * @returns {string} Header value or empty string
     */
    getHeader(response, name) {
      try {
        return response.headers.get(name) || '';
      } catch (e) {
        return '';
      }
    }

    /**
     * Parse JSON response or throw error
     * @param {Response} response - Fetch response
     * @returns {Promise<Object>} Parsed JSON
     */
    parseJsonOrThrow(response) {
      return response.text().then(text => {
        const contentType = this.getHeader(response, 'content-type');
        if (contentType.indexOf('application/json') === -1) {
          throw new Error(`Expected JSON but got "${contentType}". Status ${response.status}. Body:\n${text.slice(0, 1000)}`);
        }
        try {
          return JSON.parse(text);
        } catch (e) {
          throw new Error(`Failed to parse JSON. Status ${response.status}. Body (truncated):\n${text.slice(0, 1000)}`);
        }
      });
    }

    /**
     * Read Server-Sent Events stream
     * @param {Response} response - Fetch response
     * @param {Function} onChunk - Chunk handler
     * @param {Function} onDone - Completion handler
     * @returns {Promise} Stream processing promise
     */
    readSSE(response, onChunk, onDone) {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`HTTP ${response.status} – ${text || ''}`);
        });
      }

      const contentType = this.getHeader(response, 'content-type');
      if (contentType.indexOf('text/event-stream') === -1) {
        // Not a stream, fall back to JSON
        return this.parseJsonOrThrow(response).then(json => {
          onChunk({ json: json, fallback: true });
          if (onDone) onDone();
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const pump = () => {
        return reader.read().then(step => {
          if (step.done) {
            if (onDone) onDone();
            return;
          }
          buffer += decoder.decode(step.value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const lines = chunk.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (line.indexOf('data:') !== 0) continue;
              const data = line.slice(5).trim();
              if (data === '[DONE]') {
                if (onDone) onDone();
                return;
              }
              try {
                const obj = JSON.parse(data);
                onChunk(obj);
              } catch (e) {
                // Ignore malformed JSON chunks
              }
            }
          }
          return pump();
        }).catch(err => {
          if (onDone) onDone(err);
        });
      };
      return pump();
    }

    /**
     * Begin streaming request
     * @param {number} timeoutSeconds - Timeout in seconds
     */
    beginStream(timeoutSeconds = 30) {
      this.abortActive();
      this.currentController = new AbortController();
      this.streamingActive = true;
      
      // Set timeout
      setTimeout(() => {
        this.abortActive('Timed out', true);
      }, timeoutSeconds * 1000);
    }

    /**
     * Abort active request
     * @param {string} reason - Abort reason
     * @param {boolean} throwError - Whether to throw an error (default: false)
     */
    abortActive(reason, throwError = false) {
      if (this.currentController) {
        try {
          this.currentController.abort();
        } catch (e) {
          // Ignore abort errors
        }
      }
      this.currentController = null;
      this.streamingActive = false;
      
      if (reason && throwError) {
        throw new Error(`Stream closed: ${reason}`);
      }
    }

    /**
     * Clean up streaming state
     */
    cleanupStreamState() {
      this.streamingActive = false;
      this.currentController = null;
    }

    /**
     * Fetch models from OpenRouter API
     * @returns {Promise<Array>} Array of available models
     */
    async fetchModels() {
      const response = await fetch(MODELS_ENDPOINT);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      
      const data = await response.json();
      return data.data || [];
    }

    /**
     * Check API key status
     * @param {string} apiKey - API key to check
     * @returns {Promise<Object>} API key status data
     */
    async checkApiKeyStatus(apiKey) {
      const response = await fetch(KEY_STATUS_ENDPOINT, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }

      return await response.json();
    }

    /**
     * Send chat completion request
     * @param {string} apiKey - API key
     * @param {string} model - Model ID
     * @param {Array} messages - Message array
     * @param {boolean} stream - Whether to stream response
     * @param {Object} options - Additional options
     * @returns {Promise} Request promise
     */
    async sendChatCompletion(apiKey, model, messages, stream = false, options = {}) {
      const body = {
        model: model,
        messages: messages,
        stream: stream,
        ...options
      };

      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': stream ? 'text/event-stream' : 'application/json',
        'X-Title': 'Local OpenRouter Playground'
      };

      const fetchOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      };

      if (stream && this.currentController) {
        fetchOptions.signal = this.currentController.signal;
      }

      const response = await fetch(CHAT_ENDPOINT, fetchOptions);

      if (!stream) {
        return await this.parseJsonOrThrow(response);
      }

      return response;
    }

    /**
     * Send image generation request
     * @param {string} apiKey - API key
     * @param {string} model - Model ID
     * @param {Array} messages - Message array
     * @param {number} n - Number of images to generate
     * @param {boolean} stream - Whether to stream response
     * @returns {Promise} Request promise
     */
    async sendImageGeneration(apiKey, model, messages, n = 1, stream = false) {
      const options = {
        modalities: ['image', 'text'],
        n: n
      };

      return await this.sendChatCompletion(apiKey, model, messages, stream, options);
    }

    /**
     * Extract text content from message
     * @param {Object} message - Message object
     * @returns {string} Extracted text content
     */
    extractTextFromMessage(message) {
      if (!message) return '';
      
      if (typeof message.content === 'string') {
        return message.content;
      }
      
      if (message.content && message.content.length) {
        const parts = [];
        for (let i = 0; i < message.content.length; i++) {
          const part = message.content[i];
          if (part && part.type === 'output_text' && part.text) {
            parts.push(part.text);
          }
        }
        return parts.join('');
      }
      
      return '';
    }

    /**
     * Extract images from message
     * @param {Object} message - Message object
     * @returns {Array} Array of image URLs
     */
    extractImagesFromMessage(message) {
      const images = [];
      if (!message) return images;

      // Check content array for images
      if (message.content && message.content.length) {
        for (let i = 0; i < message.content.length; i++) {
          const part = message.content[i];
          if (part && part.type === 'output_image' && part.image_url && part.image_url.url) {
            images.push(part.image_url.url);
          }
        }
      }

      // Check images array (for models that generate images in text mode)
      if (message.images && message.images.length) {
        for (let j = 0; j < message.images.length; j++) {
          const img = message.images[j];
          if (img && img.type === 'image_url' && img.image_url && img.image_url.url) {
            images.push(img.image_url.url);
          }
        }
      }

      return images;
    }

    /**
     * Build multimodal message content
     * @param {string} text - Text content
     * @param {Array} images - Array of image data
     * @returns {Array|string} Message content
     */
    buildMultimodalContent(text, images) {
      if (!images || images.length === 0) {
        return text;
      }

      const content = [];
      
      // Add text content if present
      if (text && text.trim()) {
        content.push({
          type: 'text',
          text: text
        });
      }
      
      // Add images
      images.forEach(imgData => {
        const imageUrl = typeof imgData === 'string' ? imgData : imgData.data;
        content.push({
          type: 'image_url',
          image_url: {
            url: imageUrl
          }
        });
      });
      
      return content;
    }

    /**
     * Build messages array from conversation history
     * @param {Array} messageHistory - Array of message objects
     * @returns {Array} Formatted messages array
     */
    buildMessagesFromHistory(messageHistory) {
      const messages = [];
      
      messageHistory.forEach(msg => {
        if (msg.images && msg.images.length > 0) {
          const content = this.buildMultimodalContent(msg.content, msg.images);
          messages.push({
            role: msg.role,
            content: content
          });
        } else {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      });
      
      return messages;
    }
  }

  // Export singleton instance
  window.APIService = new APIService();

})();
