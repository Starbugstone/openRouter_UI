/**
 * Main Application Module
 * Orchestrates all components and handles application lifecycle
 * Following Dependency Inversion and Single Responsibility Principles
 */
(function() {
  'use strict';

  /**
   * Main Application Class
   * Coordinates all modules and handles the application flow
   */
  class OpenRouterApp {
    constructor() {
      this.isInitialized = false;
      this.elements = {};
      this.settings = {
        timeout: 30,
        streamEnabled: true,
        imageCount: 1
      };
    }

    /**
     * Initialize the application
     */
    async initialize() {
      if (this.isInitialized) return;

      try {
        this.collectDOMElements();
        this.initializeModules();
        this.setupEventListeners();
        this.loadSettings();
        
        // Load models asynchronously
        await this.loadModels();
        
        this.isInitialized = true;
        console.log('OpenRouter App initialized successfully');
      } catch (error) {
        console.error('Failed to initialize application:', error);
        throw error;
      }
    }

    /**
     * Collect all DOM elements
     */
    collectDOMElements() {
      this.elements = {
        // API Key elements
        apiKey: DOMUtils.getElementById('apiKey'),
        rememberKey: DOMUtils.getElementById('rememberKey'),
        checkApiKeyBtn: DOMUtils.getElementById('checkApiKeyBtn'),
        apiKeyStatus: DOMUtils.getElementById('apiKeyStatus'),
        
        // Mode and settings
        mode: DOMUtils.getElementById('mode'),
        stream: DOMUtils.getElementById('stream'),
        timeoutSec: DOMUtils.getElementById('timeoutSec'),
        imgCount: DOMUtils.getElementById('imgCount'),
        imageOptions: DOMUtils.getElementById('imageOptions'),
        
        // Chat elements
        prompt: DOMUtils.getElementById('prompt'),
        sendBtn: DOMUtils.getElementById('sendBtn'),
        stopBtn: DOMUtils.getElementById('stopBtn'),
        clearChatBtn: DOMUtils.getElementById('clearChatBtn'),
        chatMessages: DOMUtils.getElementById('chatMessages'),
        
        // Model selector elements
        modelSelectorBtn: DOMUtils.getElementById('modelSelectorBtn'),
        selectedModelText: DOMUtils.getElementById('selectedModelText'),
        modelSelectorModal: DOMUtils.getElementById('modelSelectorModal'),
        modelModalClose: DOMUtils.getElementById('modelModalClose'),
        modelSearchPopup: DOMUtils.getElementById('modelSearchPopup'),
        modelsGrid: DOMUtils.getElementById('modelsGrid'),
        filterButtons: DOMUtils.querySelectorAll('.filter-btn'),
        modelCountEl: DOMUtils.getElementById('modelCount'),
        refreshModels: DOMUtils.getElementById('refreshModels'),
        
        // Image elements
        imageUploadBtn: DOMUtils.getElementById('imageUploadBtn'),
        imageUpload: DOMUtils.getElementById('imageUpload'),
        imagePreview: DOMUtils.getElementById('imagePreview'),
        
        // Modal elements
        modal: DOMUtils.getElementById('imageModal'),
        modalImg: DOMUtils.getElementById('modalImage'),
        modalCaption: DOMUtils.getElementById('modalCaption')
      };
    }

    /**
     * Initialize all modules
     */
    initializeModules() {
      // Initialize Model Manager
      ModelManager.initialize({
        modelSelectorBtn: this.elements.modelSelectorBtn,
        modelModalClose: this.elements.modelModalClose,
        modelSelectorModal: this.elements.modelSelectorModal,
        modelSearchPopup: this.elements.modelSearchPopup,
        modelsGrid: this.elements.modelsGrid,
        filterButtons: this.elements.filterButtons,
        modelCountEl: this.elements.modelCountEl,
        refreshModels: this.elements.refreshModels,
        selectedModelText: this.elements.selectedModelText
      });

      // Initialize Chat Manager
      ChatManager.initialize({
        prompt: this.elements.prompt,
        sendBtn: this.elements.sendBtn,
        clearChatBtn: this.elements.clearChatBtn,
        stopBtn: this.elements.stopBtn,
        chatMessages: this.elements.chatMessages
      });

      // Initialize Image Handler
      ImageHandler.initialize({
        imageUploadBtn: this.elements.imageUploadBtn,
        imageUpload: this.elements.imageUpload,
        imagePreview: this.elements.imagePreview
      });

      // Initialize Modal Manager
      ModalManager.initialize({
        modal: this.elements.modal,
        modalImg: this.elements.modalImg,
        modalCaption: this.elements.modalCaption,
        modelSelectorModal: this.elements.modelSelectorModal
      });

      // Initialize Regeneration Manager
      RegenerationManager.initialize();
      this.setupRegenerationListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
      // API Key management
      this.setupApiKeyListeners();
      
      // Mode change
      this.setupModeListeners();
      
      // Model selection
      this.setupModelListeners();
      
      // Chat functionality
      this.setupChatListeners();
      
      // Image handling
      this.setupImageListeners();
      
      // API Key status check
      this.setupApiKeyStatusListeners();
      
      // Regeneration functionality
      this.setupRegenerationListeners();
    }

    /**
     * Setup API key event listeners
     */
    setupApiKeyListeners() {
      const { apiKey, rememberKey } = this.elements;

      if (rememberKey) {
        DOMUtils.addEventListener(rememberKey, 'change', () => {
          this.handleRememberKeyChange();
        });
      }

      if (apiKey) {
        DOMUtils.addEventListener(apiKey, 'input', () => {
          this.handleApiKeyInput();
        });
      }
    }

    /**
     * Setup mode change listeners
     */
    setupModeListeners() {
      const { mode, imageOptions } = this.elements;

      if (mode) {
        DOMUtils.addEventListener(mode, 'change', () => {
          const isImage = DOMUtils.getValue(mode) === 'image';
          if (imageOptions) {
            DOMUtils.showElement(imageOptions, isImage ? 'block' : 'none');
          }
          // Save mode to localStorage
          this.saveMode();
        });
      }
    }

    /**
     * Setup model selection listeners
     */
    setupModelListeners() {
      ModelManager.setOnModelSelected((model) => {
        console.log('Model selected:', model);
      });

      ModelManager.setOnModelsLoaded((models) => {
        console.log('Models loaded:', models.length);
      });
    }

    /**
     * Setup chat listeners
     */
    setupChatListeners() {
      ChatManager.setCallbacks({
        onMessageAdded: () => this.handleSendMessage(),
        onChatCleared: () => this.handleClearChat(),
        onStopGeneration: () => this.handleStopGeneration(),
        onPreviousResponse: () => this.handlePreviousResponse(),
        onNextResponse: () => this.handleNextResponse(),
        onRegenerateResponse: () => this.handleRegenerateResponse()
      });
    }

    /**
     * Setup image listeners
     */
    setupImageListeners() {
      ImageHandler.setOnImagesChanged((images) => {
        console.log('Images changed:', images.length);
      });
    }

    /**
     * Setup API key status listeners
     */
    setupApiKeyStatusListeners() {
      const { checkApiKeyBtn } = this.elements;

      if (checkApiKeyBtn) {
        DOMUtils.addEventListener(checkApiKeyBtn, 'click', () => {
          this.handleCheckApiKeyStatus();
        });
      }
    }

    /**
     * Setup regeneration listeners
     */
    setupRegenerationListeners() {
      RegenerationManager.setCallbacks({
        onRegenerateRequested: (userMessage) => {
          this.handleRegenerateResponse();
        },
        onResponseChanged: (response) => {
          ChatManager.updateLastAssistantMessage(response.content, response.images);
        }
      });
    }

    /**
     * Load models
     */
    async loadModels() {
      try {
        await ModelManager.loadModels();
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
      try {
        const saved = localStorage.getItem('or_api_key');
        if (saved && this.elements.apiKey && this.elements.rememberKey) {
          DOMUtils.setValue(this.elements.apiKey, saved);
          DOMUtils.setChecked(this.elements.rememberKey, true);
        }
        
        // Load saved mode
        this.loadMode();
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    }

    /**
     * Handle remember key change
     */
    handleRememberKeyChange() {
      const { apiKey, rememberKey } = this.elements;
      
      try {
        if (DOMUtils.isChecked(rememberKey)) {
          localStorage.setItem('or_api_key', DOMUtils.getValue(apiKey) || '');
        } else {
          localStorage.removeItem('or_api_key');
        }
      } catch (e) {
        console.warn('Failed to save API key:', e);
      }
    }

    /**
     * Handle API key input
     */
    handleApiKeyInput() {
      const { apiKey, rememberKey } = this.elements;
      
      try {
        if (DOMUtils.isChecked(rememberKey)) {
          localStorage.setItem('or_api_key', DOMUtils.getValue(apiKey) || '');
        }
      } catch (e) {
        console.warn('Failed to save API key:', e);
      }
    }

    /**
     * Handle send message
     */
    async handleSendMessage() {
      const { apiKey, prompt, mode } = this.elements;
      
      const key = DOMUtils.getValue(apiKey).trim();
      const promptText = DOMUtils.getValue(prompt).trim();
      const modeValue = DOMUtils.getValue(mode);
      
      if (!key) {
        alert('Please paste your OpenRouter API key.');
        return;
      }
      
      if (!promptText && !ImageHandler.hasImages()) {
        alert('Please write a message or upload an image.');
        return;
      }
      
      const selectedModel = ModelManager.getSelectedModel();
      if (!selectedModel) {
        alert('Please select a model from the model selector.');
        return;
      }

      // Store user message for regeneration (this will be used for the next assistant response)
      RegenerationManager.storeLastUserMessage({
        content: promptText,
        images: ImageHandler.getUploadedImages()
      });

      // Add user message to chat
      ChatManager.addMessageToChat('user', promptText, ImageHandler.getUploadedImages(), true);
      
      // Clear input and images
      DOMUtils.setValue(prompt, '');
      DOMUtils.setValue(prompt, ''); // Reset height
      ImageHandler.clearImagePreview();
      
      // Show typing indicator
      ChatManager.showTypingIndicator();
      
      try {
        if (modeValue === 'text') {
          await this.runTextChat(key, selectedModel.id, promptText);
        } else {
          await this.runImageChat(key, selectedModel.id, promptText);
        }
      } catch (error) {
        this.handleError(error);
      }
    }

    /**
     * Run text chat
     */
    async runTextChat(apiKey, model, prompt) {
      const messages = APIService.buildMessagesFromHistory(ChatManager.getMessageHistory());
      const stream = DOMUtils.isChecked(this.elements.stream);
      const timeout = parseInt(DOMUtils.getValue(this.elements.timeoutSec) || 30, 10);
      
      ChatManager.setStreamingState(true);
      
      try {
        if (stream) {
          await this.handleStreamingResponse(apiKey, model, messages, timeout);
        } else {
          await this.handleNonStreamingResponse(apiKey, model, messages);
        }
      } finally {
        ChatManager.setStreamingState(false);
        ChatManager.hideTypingIndicator();
      }
    }

    /**
     * Run image chat
     */
    async runImageChat(apiKey, model, prompt) {
      const messages = APIService.buildMessagesFromHistory(ChatManager.getMessageHistory());
      const stream = DOMUtils.isChecked(this.elements.stream);
      const timeout = parseInt(DOMUtils.getValue(this.elements.timeoutSec) || 30, 10);
      const imageCount = parseInt(DOMUtils.getValue(this.elements.imgCount) || 1, 10);
      
      ChatManager.setStreamingState(true);
      
      try {
        if (stream) {
          await this.handleStreamingImageResponse(apiKey, model, messages, imageCount, timeout);
        } else {
          await this.handleNonStreamingImageResponse(apiKey, model, messages, imageCount);
        }
      } finally {
        ChatManager.setStreamingState(false);
        ChatManager.hideTypingIndicator();
      }
    }

    /**
     * Handle streaming response
     */
    async handleStreamingResponse(apiKey, model, messages, timeout) {
      APIService.beginStream(timeout);
      
      const response = await APIService.sendChatCompletion(apiKey, model, messages, true);
      let assistantMessageDiv = null;
      let assistantContent = '';
      let assistantImages = [];
      
      await APIService.readSSE(response, (chunk) => {
        if (chunk && chunk.json && chunk.fallback) {
          const content = APIService.extractTextFromMessage(chunk.json.choices?.[0]?.message) || '';
          const images = APIService.extractImagesFromMessage(chunk.json.choices?.[0]?.message);
          ChatManager.addMessageToChat('assistant', content || '[Empty response]', images);
          return;
        }
        
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        
        if (delta && typeof delta.content === 'string') {
          assistantContent += delta.content;
          if (!assistantMessageDiv) {
            assistantMessageDiv = ChatManager.addMessageToChat('assistant', '');
          }
          ChatManager.updateLastAssistantMessage(assistantContent);
        }
        
        if (delta?.content?.length) {
          for (const part of delta.content) {
            if (part?.type === 'output_text' && part.text) {
              assistantContent += part.text;
              if (!assistantMessageDiv) {
                assistantMessageDiv = ChatManager.addMessageToChat('assistant', '');
              }
              ChatManager.updateLastAssistantMessage(assistantContent);
            }
            if (part?.type === 'output_image' && part.image_url?.url) {
              assistantImages.push(part.image_url.url);
            }
          }
        }
      }, () => {
        if (assistantImages.length > 0 && assistantMessageDiv) {
          ChatManager.updateLastAssistantMessage(assistantContent, assistantImages);
        }
        
        // Update message history
        const lastMessageIndex = ChatManager.getMessageHistory().length - 1;
        if (lastMessageIndex >= 0) {
          const history = ChatManager.getMessageHistory();
          history[lastMessageIndex].content = assistantContent;
          history[lastMessageIndex].images = assistantImages;
          ChatManager.setMessageHistory(history);
        }
        
        RegenerationManager.addResponseToHistory(assistantContent, assistantImages);
      });
    }

    /**
     * Handle non-streaming response
     */
    async handleNonStreamingResponse(apiKey, model, messages) {
      const json = await APIService.sendChatCompletion(apiKey, model, messages, false);
      const content = APIService.extractTextFromMessage(json.choices?.[0]?.message) || '';
      const images = APIService.extractImagesFromMessage(json.choices?.[0]?.message);
      
      ChatManager.addMessageToChat('assistant', content || '[Empty response]', images);
      RegenerationManager.addResponseToHistory(content || '[Empty response]', images);
    }

    /**
     * Handle streaming image response
     */
    async handleStreamingImageResponse(apiKey, model, messages, imageCount, timeout) {
      APIService.beginStream(timeout);
      
      const response = await APIService.sendImageGeneration(apiKey, model, messages, imageCount, true);
      let assistantMessageDiv = null;
      let assistantContent = '';
      let assistantImages = [];
      
      await APIService.readSSE(response, (chunk) => {
        if (chunk && chunk.json && chunk.fallback) {
          const totalImages = [];
          if (chunk.json.choices?.length > 0) {
            for (const choice of chunk.json.choices) {
              const imgs = APIService.extractImagesFromMessage(choice.message);
              totalImages.push(...imgs);
            }
          }
          const content = totalImages.length > 0 ? `Generated ${totalImages.length} image(s):` : 'No images found in response.';
          ChatManager.addMessageToChat('assistant', content, totalImages);
          return;
        }
        
        // Handle streaming image response
        if (chunk?.choices?.length > 0) {
          for (const choice of chunk.choices) {
            const delta = choice.delta;
            
            if (delta?.images?.length) {
              for (const img of delta.images) {
                if (img?.type === 'image_url' && img.image_url?.url) {
                  assistantImages.push(img.image_url.url);
                  if (!assistantMessageDiv) {
                    assistantMessageDiv = ChatManager.addMessageToChat('assistant', '');
                  }
                }
              }
            }
            
            if (delta?.content?.length) {
              for (const part of delta.content) {
                if (part?.type === 'output_text' && part.text) {
                  assistantContent += part.text;
                  if (!assistantMessageDiv) {
                    assistantMessageDiv = ChatManager.addMessageToChat('assistant', '');
                  }
                  ChatManager.updateLastAssistantMessage(assistantContent);
                }
                if (part?.type === 'output_image' && part.image_url?.url) {
                  assistantImages.push(part.image_url.url);
                }
              }
            }
          }
        }
      }, () => {
        if (assistantImages.length > 0 && assistantMessageDiv) {
          ChatManager.updateLastAssistantMessage(assistantContent || `Generated ${assistantImages.length} image(s):`, assistantImages);
        }
        
        RegenerationManager.addResponseToHistory(assistantContent || `Generated ${assistantImages.length} image(s):`, assistantImages);
      });
    }

    /**
     * Handle non-streaming image response
     */
    async handleNonStreamingImageResponse(apiKey, model, messages, imageCount) {
      const json = await APIService.sendImageGeneration(apiKey, model, messages, imageCount, false);
      const totalImages = [];
      
      if (json.choices?.length > 0) {
        for (const choice of json.choices) {
          const imgs = APIService.extractImagesFromMessage(choice.message);
          totalImages.push(...imgs);
        }
      }
      
      const content = totalImages.length > 0 ? `Generated ${totalImages.length} image(s):` : 'No images found in response.';
      ChatManager.addMessageToChat('assistant', content, totalImages);
      RegenerationManager.addResponseToHistory(content, totalImages);
    }

    /**
     * Handle clear chat
     */
    handleClearChat() {
      RegenerationManager.clearRegenerationHistory();
      ImageHandler.clearImagePreview();
    }

    /**
     * Handle stop generation
     */
    handleStopGeneration() {
      APIService.abortActive('Stopped by user');
      ChatManager.setStreamingState(false);
      ChatManager.hideTypingIndicator();
    }

    /**
     * Handle previous response
     */
    handlePreviousResponse() {
      RegenerationManager.showPreviousResponse();
    }

    /**
     * Handle next response
     */
    handleNextResponse() {
      RegenerationManager.showNextResponse();
    }

    /**
     * Handle regenerate response
     */
    async handleRegenerateResponse() {
      const lastUserMessage = RegenerationManager.getLastUserMessage();
      if (!lastUserMessage) return;
      
      const { apiKey, mode } = this.elements;
      const key = DOMUtils.getValue(apiKey).trim();
      const modeValue = DOMUtils.getValue(mode);
      const selectedModel = ModelManager.getSelectedModel();
      
      if (!key || !selectedModel) return;
      
      // Remove the last assistant message from chat history
      const messageHistory = ChatManager.getMessageHistory();
      if (messageHistory.length > 0 && messageHistory[messageHistory.length - 1].role === 'assistant') {
        messageHistory.pop();
        ChatManager.setMessageHistory(messageHistory);
        
        // Remove the last assistant message from the UI
        const { chatMessages } = this.elements;
        if (chatMessages) {
          const assistantMessages = chatMessages.querySelectorAll('.message.assistant');
          if (assistantMessages.length > 0) {
            const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
            lastAssistantMessage.remove();
          }
        }
      }
      
      ChatManager.showTypingIndicator();
      
      try {
        if (modeValue === 'text') {
          await this.runTextChat(key, selectedModel.id, lastUserMessage.content);
        } else {
          await this.runImageChat(key, selectedModel.id, lastUserMessage.content);
        }
      } catch (error) {
        this.handleError(error);
      }
    }

    /**
     * Handle check API key status
     */
    async handleCheckApiKeyStatus() {
      const { apiKey, checkApiKeyBtn, apiKeyStatus } = this.elements;
      
      const key = DOMUtils.getValue(apiKey).trim();
      if (!key) {
        alert('Please enter your OpenRouter API key first.');
        return;
      }
      
      DOMUtils.disableElement(checkApiKeyBtn);
      DOMUtils.setTextContent(checkApiKeyBtn, 'Checking...');
      DOMUtils.showElement(apiKeyStatus);
      DOMUtils.setInnerHTML(apiKeyStatus, '<div style="color: #9aa0aa; font-size: 12px;">Checking API key status...</div>');
      
      try {
        const data = await APIService.checkApiKeyStatus(key);
        this.displayApiKeyStatus(data);
      } catch (error) {
        DOMUtils.setInnerHTML(apiKeyStatus, `<div style="color: #ff4444; font-size: 12px;">Error: ${error.message}</div>`);
      } finally {
        DOMUtils.enableElement(checkApiKeyBtn);
        DOMUtils.setTextContent(checkApiKeyBtn, 'Check Status');
      }
    }

    /**
     * Display API key status
     */
    displayApiKeyStatus(data) {
      const { apiKeyStatus } = this.elements;
      if (!apiKeyStatus) return;
      
      const keyData = data.data || {};
      const usage = keyData.usage || 0;
      const limit = keyData.limit;
      const limitRemaining = keyData.limit_remaining;
      const isFreeTier = keyData.is_free_tier || false;
      const label = keyData.label || 'Unnamed Key';
      
      let statusHtml = '<div style="background: #0e1015; border: 1px solid #2a2e37; border-radius: 8px; padding: 12px; position: relative;">';
      statusHtml += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">';
      statusHtml += '<div style="color: #e8eaed; font-weight: 600;">API Key Status</div>';
      statusHtml += '<button id="closeApiKeyStatus" style="background: none; border: none; color: #9aa0aa; font-size: 18px; cursor: pointer; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 4px;" title="Close status">×</button>';
      statusHtml += '</div>';
      statusHtml += `<div style="color: #b6b9c3; font-size: 12px; margin-bottom: 4px;"><strong>Label:</strong> ${label}</div>`;
      
      // Spend limit information
      if (limit !== null) {
        if (limit === 0) {
          statusHtml += '<div style="color: #ff4444; font-size: 12px; margin-bottom: 4px;"><strong>Spend Limit:</strong> $0.00 (Disabled)</div>';
          statusHtml += '<div style="color: #9aa0aa; font-size: 11px; margin-bottom: 4px;">No spending allowed on this API key</div>';
        } else {
          const remaining = limitRemaining !== null ? limitRemaining : (limit - usage);
          const usagePercent = limit > 0 ? (usage / limit) * 100 : 0;
          const statusColor = usagePercent > 90 ? '#ff4444' : usagePercent > 75 ? '#ffaa44' : '#44ff44';
          
          statusHtml += `<div style="color: #b6b9c3; font-size: 12px; margin-bottom: 4px;"><strong>Spend Limit:</strong> $${limit.toFixed(2)}</div>`;
          statusHtml += `<div style="color: #b6b9c3; font-size: 12px; margin-bottom: 4px;"><strong>Spent:</strong> $${usage.toFixed(2)}</div>`;
          statusHtml += `<div style="color: #b6b9c3; font-size: 12px; margin-bottom: 4px;"><strong>Remaining:</strong> <span style="color: ${statusColor};">$${remaining.toFixed(2)}</span></div>`;
          
          // Progress bar
          statusHtml += '<div style="background: #21242c; border-radius: 4px; height: 6px; margin: 8px 0; overflow: hidden;">';
          statusHtml += `<div style="background: ${statusColor}; height: 100%; width: ${Math.min(usagePercent, 100)}%; transition: width 0.3s;"></div>`;
          statusHtml += '</div>';
        }
      } else {
        statusHtml += '<div style="color: #44ff44; font-size: 12px; margin-bottom: 4px;"><strong>Spend Limit:</strong> Unlimited</div>';
      }
      
      statusHtml += `<div style="color: #b6b9c3; font-size: 12px; margin-bottom: 4px;"><strong>Account Type:</strong> ${isFreeTier ? 'Free Tier' : 'Paid Account'}</div>`;
      
      // Rate limit information
      statusHtml += '<div style="color: #9aa0aa; font-size: 11px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #2a2e37;">';
      statusHtml += '<strong>Rate Limits:</strong><br>';
      statusHtml += '• Free models: 20 requests/minute<br>';
      if (isFreeTier) {
        statusHtml += `• Daily limit: ${usage < 10 ? '50' : '1000'} free model requests/day`;
      } else {
        statusHtml += '• Daily limit: 1000 free model requests/day';
      }
      statusHtml += '</div>';
      statusHtml += '</div>';
      
      DOMUtils.setInnerHTML(apiKeyStatus, statusHtml);
      
      // Add event listener for close button
      const closeBtn = DOMUtils.getElementById('closeApiKeyStatus');
      if (closeBtn) {
        DOMUtils.addEventListener(closeBtn, 'click', () => {
          DOMUtils.hideElement(apiKeyStatus);
        });
      }
    }

    /**
     * Handle errors
     */
    handleError(error) {
      console.error(error);
      ChatManager.hideTypingIndicator();
      const message = (error && error.message) ? error.message : String(error);
      ChatManager.addMessageToChat('assistant', `Error: ${message}`);
      
      // Add error response to regeneration history so regeneration still works
      RegenerationManager.addResponseToHistory(`Error: ${message}`, []);
      
      APIService.cleanupStreamState();
    }

    /**
     * Save mode to localStorage
     */
    saveMode() {
      try {
        const { mode } = this.elements;
        if (mode) {
          const modeValue = DOMUtils.getValue(mode);
          localStorage.setItem('or_mode', modeValue);
        }
      } catch (e) {
        console.warn('Failed to save mode:', e);
      }
    }

    /**
     * Load mode from localStorage
     */
    loadMode() {
      try {
        const saved = localStorage.getItem('or_mode');
        if (saved && this.elements.mode && this.elements.imageOptions) {
          DOMUtils.setValue(this.elements.mode, saved);
          
          // Update image options visibility based on saved mode
          const isImage = saved === 'image';
          DOMUtils.showElement(this.elements.imageOptions, isImage ? 'block' : 'none');
          
          console.log('Restored mode:', saved);
        }
      } catch (e) {
        console.warn('Failed to load mode:', e);
      }
    }
  }

  // Initialize application when DOM is ready
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const app = new OpenRouterApp();
      await app.initialize();
      window.OpenRouterApp = app; // Make available globally for debugging
    } catch (error) {
      console.error('Failed to initialize OpenRouter App:', error);
    }
  });

})();
