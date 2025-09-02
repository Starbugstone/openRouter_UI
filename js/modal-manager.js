/**
 * Modal Manager Module
 * Handles modal dialogs for images and model selector
 * Following Single Responsibility Principle
 */
(function() {
  'use strict';

  /**
   * Modal Manager Class
   * Encapsulates all modal-related functionality
   */
  class ModalManager {
    constructor() {
      this.activeModals = new Set();
      
      // DOM elements (will be injected)
      this.elements = {};
    }

    /**
     * Initialize the modal manager with DOM elements
     * @param {Object} elements - DOM elements object
     */
    initialize(elements) {
      this.elements = elements;
      this.setupEventListeners();
    }

    /**
     * Setup event listeners for modal functionality
     */
    setupEventListeners() {
      const { modal, modelSelectorModal } = this.elements;

      // Image modal close button
      const closeBtn = document.querySelector('.modal-close');
      if (closeBtn) {
        DOMUtils.addEventListener(closeBtn, 'click', () => {
          this.closeImageModal();
        });
      }

      // Close image modal when clicking outside
      if (modal) {
        DOMUtils.addEventListener(modal, 'click', (event) => {
          if (event.target === modal) {
            this.closeImageModal();
          }
        });
      }

      // Close model selector modal when clicking outside
      if (modelSelectorModal) {
        DOMUtils.addEventListener(modelSelectorModal, 'click', (event) => {
          if (event.target === modelSelectorModal) {
            this.closeModelSelectorModal();
          }
        });
      }

      // Close modals with Escape key
      DOMUtils.addEventListener(document, 'keydown', (event) => {
        if (event.key === 'Escape') {
          this.closeAllModals();
        }
      });
    }

    /**
     * Show image modal
     * @param {string} imageSrc - Image source URL
     * @param {string} caption - Image caption
     */
    showImageModal(imageSrc, caption) {
      const { modal, modalImg, modalCaption } = this.elements;
      
      if (!modal || !modalImg || !modalCaption) return;
      
      modalImg.src = imageSrc;
      DOMUtils.setTextContent(modalCaption, `${caption} - Click outside or press Escape to close`);
      DOMUtils.showElement(modal);
      
      this.activeModals.add('image');
    }

    /**
     * Close image modal
     */
    closeImageModal() {
      const { modal } = this.elements;
      
      if (modal) {
        DOMUtils.hideElement(modal);
        this.activeModals.delete('image');
      }
    }

    /**
     * Show model selector modal
     */
    showModelSelectorModal() {
      const { modelSelectorModal } = this.elements;
      
      if (modelSelectorModal) {
        DOMUtils.showElement(modelSelectorModal);
        this.activeModals.add('modelSelector');
      }
    }

    /**
     * Close model selector modal
     */
    closeModelSelectorModal() {
      const { modelSelectorModal } = this.elements;
      
      if (modelSelectorModal) {
        DOMUtils.hideElement(modelSelectorModal);
        this.activeModals.delete('modelSelector');
      }
    }

    /**
     * Close all active modals
     */
    closeAllModals() {
      this.closeImageModal();
      this.closeModelSelectorModal();
    }

    /**
     * Check if any modal is open
     * @returns {boolean} Whether any modal is open
     */
    hasActiveModals() {
      return this.activeModals.size > 0;
    }

    /**
     * Check if specific modal is open
     * @param {string} modalName - Modal name
     * @returns {boolean} Whether modal is open
     */
    isModalOpen(modalName) {
      return this.activeModals.has(modalName);
    }

    /**
     * Get active modals
     * @returns {Array} Array of active modal names
     */
    getActiveModals() {
      return Array.from(this.activeModals);
    }

    /**
     * Create and show custom modal
     * @param {Object} options - Modal options
     * @returns {HTMLElement} Modal element
     */
    createCustomModal(options = {}) {
      const {
        title = 'Modal',
        content = '',
        showCloseButton = true,
        closeOnOutsideClick = true,
        closeOnEscape = true,
        className = 'custom-modal'
      } = options;

      // Create modal overlay
      const overlay = DOMUtils.createElement('div', {
        className: `${className}-overlay`,
        style: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; align-items: center; justify-content: center;'
      });

      // Create modal content
      const modal = DOMUtils.createElement('div', {
        className: className,
        style: 'background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 20px; max-width: 90%; max-height: 90%; overflow: auto; position: relative;'
      });

      // Create header
      const header = DOMUtils.createElement('div', {
        className: `${className}-header`,
        style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;'
      });

      const titleEl = DOMUtils.createElement('h3', {
        className: `${className}-title`,
        textContent: title,
        style: 'margin: 0; color: #fff;'
      });

      header.appendChild(titleEl);

      // Add close button if requested
      if (showCloseButton) {
        const closeBtn = DOMUtils.createElement('button', {
          className: `${className}-close`,
          innerHTML: '×',
          style: 'background: none; border: none; color: #999; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;'
        });

        DOMUtils.addEventListener(closeBtn, 'click', () => {
          this.closeCustomModal(overlay);
        });

        header.appendChild(closeBtn);
      }

      // Create content area
      const contentEl = DOMUtils.createElement('div', {
        className: `${className}-content`,
        innerHTML: content,
        style: 'color: #ccc;'
      });

      modal.appendChild(header);
      modal.appendChild(contentEl);

      // Add event listeners
      if (closeOnOutsideClick) {
        DOMUtils.addEventListener(overlay, 'click', (event) => {
          if (event.target === overlay) {
            this.closeCustomModal(overlay);
          }
        });
      }

      if (closeOnEscape) {
        const escapeHandler = (event) => {
          if (event.key === 'Escape') {
            this.closeCustomModal(overlay);
            DOMUtils.removeEventListener(document, 'keydown', escapeHandler);
          }
        };
        DOMUtils.addEventListener(document, 'keydown', escapeHandler);
      }

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      return overlay;
    }

    /**
     * Close custom modal
     * @param {HTMLElement} modalElement - Modal element to close
     */
    closeCustomModal(modalElement) {
      if (modalElement && modalElement.parentNode) {
        modalElement.parentNode.removeChild(modalElement);
      }
    }

    /**
     * Show confirmation modal
     * @param {Object} options - Confirmation options
     * @returns {Promise<boolean>} Promise that resolves to user's choice
     */
    showConfirmationModal(options = {}) {
      const {
        title = 'Confirm',
        message = 'Are you sure?',
        confirmText = 'Yes',
        cancelText = 'No',
        confirmClass = 'btn primary',
        cancelClass = 'btn secondary'
      } = options;

      return new Promise((resolve) => {
        const content = `
          <div style="margin-bottom: 20px;">${message}</div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button class="${cancelClass}" data-action="cancel">${cancelText}</button>
            <button class="${confirmClass}" data-action="confirm">${confirmText}</button>
          </div>
        `;

        const modal = this.createCustomModal({
          title: title,
          content: content,
          closeOnOutsideClick: false,
          closeOnEscape: false
        });

        // Add event listeners to buttons
        const buttons = modal.querySelectorAll('button[data-action]');
        buttons.forEach(button => {
          DOMUtils.addEventListener(button, 'click', () => {
            const action = button.dataset.action;
            this.closeCustomModal(modal);
            resolve(action === 'confirm');
          });
        });
      });
    }

    /**
     * Show alert modal
     * @param {Object} options - Alert options
     * @returns {Promise} Promise that resolves when modal is closed
     */
    showAlertModal(options = {}) {
      const {
        title = 'Alert',
        message = '',
        buttonText = 'OK',
        buttonClass = 'btn primary'
      } = options;

      return new Promise((resolve) => {
        const content = `
          <div style="margin-bottom: 20px;">${message}</div>
          <div style="display: flex; justify-content: flex-end;">
            <button class="${buttonClass}" data-action="ok">${buttonText}</button>
          </div>
        `;

        const modal = this.createCustomModal({
          title: title,
          content: content,
          closeOnOutsideClick: false,
          closeOnEscape: false
        });

        // Add event listener to button
        const button = modal.querySelector('button[data-action="ok"]');
        DOMUtils.addEventListener(button, 'click', () => {
          this.closeCustomModal(modal);
          resolve();
        });
      });
    }
  }

  // Export singleton instance
  window.ModalManager = new ModalManager();

})();
