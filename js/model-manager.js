/**
 * Model Manager Module
 * Handles model selection, filtering, and management
 * Following Single Responsibility Principle
 */
(function() {
  'use strict';

  /**
   * Model Manager Class
   * Encapsulates all model-related functionality
   */
  class ModelManager {
    constructor() {
      this.allModels = [];
      this.freeModels = [];
      this.selectedModel = null;
      this.currentFilter = 'all';
      this.isLoading = false;
      
      // DOM elements (will be injected)
      this.elements = {};
      
      // Event callbacks
      this.onModelSelected = null;
      this.onModelsLoaded = null;
    }

    /**
     * Initialize the model manager with DOM elements
     * @param {Object} elements - DOM elements object
     */
    initialize(elements) {
      this.elements = elements;
      this.setupEventListeners();
      this.loadModels();
    }

    /**
     * Setup event listeners for model management
     */
    setupEventListeners() {
      const { modelSelectorBtn, modelModalClose, modelSelectorModal, modelSearchPopup, filterButtons, refreshModelsBtn } = this.elements;

      // Model selector modal
      if (modelSelectorBtn) {
        DOMUtils.addEventListener(modelSelectorBtn, 'click', () => {
          DOMUtils.showElement(modelSelectorModal);
        });
      }

      if (modelModalClose) {
        DOMUtils.addEventListener(modelModalClose, 'click', () => {
          DOMUtils.hideElement(modelSelectorModal);
        });
      }

      // Close modal when clicking outside
      if (modelSelectorModal) {
        DOMUtils.addEventListener(modelSelectorModal, 'click', (event) => {
          if (event.target === modelSelectorModal) {
            DOMUtils.hideElement(modelSelectorModal);
          }
        });
      }

      // Search functionality
      if (modelSearchPopup) {
        DOMUtils.addEventListener(modelSearchPopup, 'input', () => {
          this.filterModels();
        });
      }

      // Filter buttons
      if (filterButtons && filterButtons.length > 0) {
        filterButtons.forEach(btn => {
          DOMUtils.addEventListener(btn, 'click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            // Update current filter
            this.currentFilter = btn.dataset.filter;
            // Re-filter models
            this.filterModels();
          });
        });
      }

      // Refresh button
      if (refreshModelsBtn) {
        DOMUtils.addEventListener(refreshModelsBtn, 'click', () => {
          this.refreshModels();
        });
      }

      // Escape key to close modal
      DOMUtils.addEventListener(document, 'keydown', (event) => {
        if (event.key === 'Escape' && modelSelectorModal && modelSelectorModal.style.display === 'block') {
          DOMUtils.hideElement(modelSelectorModal);
        }
      });
    }

    /**
     * Load models from API
     */
    async loadModels() {
      if (this.isLoading) return;
      
      this.isLoading = true;
      this.updateLoadingState(true);

      try {
        const models = await APIService.fetchModels();
        this.allModels = models;
        
        // Filter for free models (both prompt and completion pricing are "0")
        this.freeModels = models.filter(model => {
          const pricing = model.pricing || {};
          return pricing.prompt === '0' && pricing.completion === '0';
        });
        
        // Sort models by name for better UX
        this.freeModels.sort((a, b) => a.name.localeCompare(b.name));
        
        this.populateModelSelector();
        this.updateModelCount();
        
        if (this.onModelsLoaded) {
          this.onModelsLoaded(this.freeModels);
        }
        
        console.log(`Loaded ${this.freeModels.length} free models`);
      } catch (error) {
        console.error('Error fetching models:', error);
        this.updateModelCount('Error');
      } finally {
        this.isLoading = false;
        this.updateLoadingState(false);
      }
    }

    /**
     * Refresh models
     */
    async refreshModels() {
      const { modelCountEl, modelsGrid } = this.elements;
      
      if (modelCountEl) {
        DOMUtils.setTextContent(modelCountEl, 'Loading...');
      }
      
      if (modelsGrid) {
        DOMUtils.setInnerHTML(modelsGrid, '<div style="text-align: center; color: #9aa0aa; padding: 20px;">Loading models...</div>');
      }
      
      await this.loadModels();
    }

    /**
     * Update loading state
     * @param {boolean} loading - Whether currently loading
     */
    updateLoadingState(loading) {
      const { refreshModelsBtn } = this.elements;
      
      if (refreshModelsBtn) {
        if (loading) {
          DOMUtils.disableElement(refreshModelsBtn);
          DOMUtils.setTextContent(refreshModelsBtn, 'Loading...');
        } else {
          DOMUtils.enableElement(refreshModelsBtn);
          DOMUtils.setTextContent(refreshModelsBtn, 'Refresh');
        }
      }
    }

    /**
     * Update model count display
     * @param {string|number} count - Model count or error message
     */
    updateModelCount(count) {
      const { modelCountEl } = this.elements;
      
      if (modelCountEl) {
        DOMUtils.setTextContent(modelCountEl, count !== undefined ? count : this.freeModels.length);
      }
    }

    /**
     * Populate model selector with model cards
     */
    populateModelSelector() {
      const { modelsGrid } = this.elements;
      
      if (!modelsGrid) return;
      
      DOMUtils.setInnerHTML(modelsGrid, '');
      
      this.freeModels.forEach(model => {
        const card = this.createModelCard(model);
        modelsGrid.appendChild(card);
      });
    }

    /**
     * Create model card element
     * @param {Object} model - Model object
     * @returns {HTMLElement} Model card element
     */
    createModelCard(model) {
      const card = DOMUtils.createElement('div', {
        className: 'model-card',
        'data-model-id': model.id
      });
      
      // Determine model capabilities
      const capabilities = this.getModelCapabilities(model);
      const capabilityTags = capabilities.map(cap => {
        return `<span class="capability-tag ${cap}">${cap.charAt(0).toUpperCase() + cap.slice(1)}</span>`;
      }).join('');
      
      // Get provider name
      const provider = model.id.split('/')[0] || 'Unknown';
      
      // Format pricing info
      const pricing = model.pricing || {};
      const pricingText = (pricing.prompt !== '0' || pricing.completion !== '0') ? 'Paid' : 'Free';
      
      // Get context length
      const contextLength = model.context_length || 'Unknown';
      
      card.innerHTML = 
        `<div class="model-provider">${provider}</div>` +
        `<div class="model-name">${model.name}</div>` +
        `<div class="model-id">${model.id}</div>` +
        `<div class="model-description">${model.description || 'No description available'}</div>` +
        `<div class="model-capabilities">${capabilityTags}</div>` +
        `<div class="model-pricing">${pricingText}</div>` +
        `<div class="model-context">Context: ${contextLength} tokens</div>`;
      
      // Add click handler
      DOMUtils.addEventListener(card, 'click', () => {
        this.selectModel(model);
      });
      
      return card;
    }

    /**
     * Get model capabilities
     * @param {Object} model - Model object
     * @returns {Array} Array of capability strings
     */
    getModelCapabilities(model) {
      const capabilities = ['text']; // All models support text
      
      // Check for image generation capabilities
      if (model.id.toLowerCase().includes('image') || 
          model.id.toLowerCase().includes('dall-e') ||
          model.id.toLowerCase().includes('midjourney') ||
          model.id.toLowerCase().includes('stable-diffusion') ||
          (model.id.toLowerCase().includes('gemini') && model.id.toLowerCase().includes('image'))) {
        capabilities.push('image');
      }
      
      // Check for multimodal capabilities
      if (model.id.toLowerCase().includes('vision') ||
          model.id.toLowerCase().includes('multimodal') ||
          model.id.toLowerCase().includes('gpt-4') ||
          model.id.toLowerCase().includes('gemini') ||
          model.id.toLowerCase().includes('claude')) {
        capabilities.push('multimodal');
      }
      
      return capabilities;
    }

    /**
     * Select a model
     * @param {Object} model - Model to select
     */
    selectModel(model) {
      this.selectedModel = model;
      
      const { selectedModelText, modelSelectorModal } = this.elements;
      
      if (selectedModelText) {
        DOMUtils.setTextContent(selectedModelText, model.name);
      }
      
      if (modelSelectorModal) {
        DOMUtils.hideElement(modelSelectorModal);
      }
      
      // Remove previous selection
      const previousSelected = document.querySelector('.model-card.selected');
      if (previousSelected) {
        previousSelected.classList.remove('selected');
      }
      
      // Add selection to current card
      const currentCard = document.querySelector(`[data-model-id="${model.id}"]`);
      if (currentCard) {
        currentCard.classList.add('selected');
      }
      
      if (this.onModelSelected) {
        this.onModelSelected(model);
      }
    }

    /**
     * Filter models based on search term and current filter
     */
    filterModels() {
      const { modelSearchPopup } = this.elements;
      
      if (!modelSearchPopup) return;
      
      const searchTerm = DOMUtils.getValue(modelSearchPopup).toLowerCase();
      const cards = document.querySelectorAll('.model-card');
      
      cards.forEach(card => {
        const modelId = card.dataset.modelId;
        const model = this.freeModels.find(m => m.id === modelId);
        if (!model) return;
        
        const matchesSearch = searchTerm === '' || 
          model.name.toLowerCase().includes(searchTerm) ||
          model.id.toLowerCase().includes(searchTerm) ||
          (model.description && model.description.toLowerCase().includes(searchTerm)) ||
          model.id.split('/')[0].toLowerCase().includes(searchTerm);
        
        const matchesFilter = this.currentFilter === 'all' || 
          this.getModelCapabilities(model).includes(this.currentFilter);
        
        if (matchesSearch && matchesFilter) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    }

    /**
     * Get currently selected model
     * @returns {Object|null} Selected model or null
     */
    getSelectedModel() {
      return this.selectedModel;
    }

    /**
     * Get all free models
     * @returns {Array} Array of free models
     */
    getFreeModels() {
      return this.freeModels;
    }

    /**
     * Get all models
     * @returns {Array} Array of all models
     */
    getAllModels() {
      return this.allModels;
    }

    /**
     * Set model selection callback
     * @param {Function} callback - Callback function
     */
    setOnModelSelected(callback) {
      this.onModelSelected = callback;
    }

    /**
     * Set models loaded callback
     * @param {Function} callback - Callback function
     */
    setOnModelsLoaded(callback) {
      this.onModelsLoaded = callback;
    }
  }

  // Export singleton instance
  window.ModelManager = new ModelManager();

})();
