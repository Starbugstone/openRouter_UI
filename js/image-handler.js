/**
 * Image Handler Module
 * Handles image upload, preview, and management
 * Following Single Responsibility Principle
 */
(function() {
  'use strict';

  /**
   * Image Handler Class
   * Encapsulates all image-related functionality
   */
  class ImageHandler {
    constructor() {
      this.uploadedImages = [];
      this.maxFileSize = 10 * 1024 * 1024; // 10MB
      this.allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      
      // DOM elements (will be injected)
      this.elements = {};
      
      // Event callbacks
      this.onImagesChanged = null;
    }

    /**
     * Initialize the image handler with DOM elements
     * @param {Object} elements - DOM elements object
     */
    initialize(elements) {
      this.elements = elements;
      this.setupEventListeners();
    }

    /**
     * Setup event listeners for image handling
     */
    setupEventListeners() {
      const { imageUploadBtn, imageUpload } = this.elements;

      // Image upload button
      if (imageUploadBtn && imageUpload) {
        DOMUtils.addEventListener(imageUploadBtn, 'click', () => {
          imageUpload.click();
        });

        // Handle file selection
        DOMUtils.addEventListener(imageUpload, 'change', (event) => {
          this.handleFileSelection(event.target.files);
          // Clear the input so the same file can be selected again
          event.target.value = '';
        });
      }
    }

    /**
     * Handle file selection
     * @param {FileList} files - Selected files
     */
    handleFileSelection(files) {
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (this.validateFile(file)) {
          this.addImagePreview(file);
        }
      }
    }

    /**
     * Validate uploaded file
     * @param {File} file - File to validate
     * @returns {boolean} Whether file is valid
     */
    validateFile(file) {
      // Check file type
      if (!this.allowedTypes.includes(file.type)) {
        alert(`File type ${file.type} is not supported. Please use JPEG, PNG, GIF, or WebP images.`);
        return false;
      }

      // Check file size
      if (file.size > this.maxFileSize) {
        alert(`File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds the maximum allowed size of ${this.maxFileSize / 1024 / 1024}MB.`);
        return false;
      }

      return true;
    }

    /**
     * Add image preview
     * @param {File} file - Image file
     */
    addImagePreview(file) {
      const { imagePreview } = this.elements;
      if (!imagePreview) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const previewItem = this.createPreviewItem(e.target.result, file);
        imagePreview.appendChild(previewItem);
        
        // Store the image data
        this.uploadedImages.push({
          data: e.target.result,
          file: file
        });
        
        this.notifyImagesChanged();
      };
      reader.readAsDataURL(file);
    }

    /**
     * Create preview item element
     * @param {string} dataUrl - Image data URL
     * @param {File} file - Original file
     * @returns {HTMLElement} Preview item element
     */
    createPreviewItem(dataUrl, file) {
      const previewItem = DOMUtils.createElement('div', {
        className: 'image-preview-item'
      });
      
      const img = DOMUtils.createElement('img', {
        src: dataUrl,
        alt: 'Preview'
      });
      
      const removeBtn = DOMUtils.createElement('button', {
        className: 'remove-btn',
        innerHTML: '×'
      });
      
      DOMUtils.addEventListener(removeBtn, 'click', () => {
        this.removeImagePreview(previewItem, dataUrl);
      });
      
      previewItem.appendChild(img);
      previewItem.appendChild(removeBtn);
      
      return previewItem;
    }

    /**
     * Remove image preview
     * @param {HTMLElement} previewItem - Preview item to remove
     * @param {string} imageData - Image data URL
     */
    removeImagePreview(previewItem, imageData) {
      previewItem.remove();
      
      // Remove from uploadedImages array
      this.uploadedImages = this.uploadedImages.filter(img => img.data !== imageData);
      
      this.notifyImagesChanged();
    }

    /**
     * Clear all image previews
     */
    clearImagePreview() {
      const { imagePreview } = this.elements;
      
      if (imagePreview) {
        DOMUtils.setInnerHTML(imagePreview, '');
      }
      
      this.uploadedImages = [];
      this.notifyImagesChanged();
    }

    /**
     * Get uploaded images
     * @returns {Array} Array of uploaded image data
     */
    getUploadedImages() {
      return this.uploadedImages;
    }

    /**
     * Set uploaded images
     * @param {Array} images - Array of image data
     */
    setUploadedImages(images) {
      this.uploadedImages = images || [];
      this.notifyImagesChanged();
    }

    /**
     * Check if images are uploaded
     * @returns {boolean} Whether images are uploaded
     */
    hasImages() {
      return this.uploadedImages.length > 0;
    }

    /**
     * Get image count
     * @returns {number} Number of uploaded images
     */
    getImageCount() {
      return this.uploadedImages.length;
    }

    /**
     * Create image data for API
     * @returns {Array} Array of image data for API calls
     */
    createImageDataForAPI() {
      return this.uploadedImages.map(img => ({
        type: 'image_url',
        image_url: {
          url: img.data
        }
      }));
    }

    /**
     * Create multimodal content with text and images
     * @param {string} text - Text content
     * @returns {Array|string} Multimodal content or text
     */
    createMultimodalContent(text) {
      if (!this.hasImages()) {
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
      content.push(...this.createImageDataForAPI());
      
      return content;
    }

    /**
     * Notify that images have changed
     */
    notifyImagesChanged() {
      if (this.onImagesChanged) {
        this.onImagesChanged(this.uploadedImages);
      }
    }

    /**
     * Set images changed callback
     * @param {Function} callback - Callback function
     */
    setOnImagesChanged(callback) {
      this.onImagesChanged = callback;
    }

    /**
     * Set maximum file size
     * @param {number} sizeInBytes - Maximum file size in bytes
     */
    setMaxFileSize(sizeInBytes) {
      this.maxFileSize = sizeInBytes;
    }

    /**
     * Set allowed file types
     * @param {Array} types - Array of allowed MIME types
     */
    setAllowedTypes(types) {
      this.allowedTypes = types || [];
    }

    /**
     * Get file size in human readable format
     * @param {number} bytes - File size in bytes
     * @returns {string} Human readable file size
     */
    formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Validate and get file info
     * @param {File} file - File to validate
     * @returns {Object|null} File info or null if invalid
     */
    getFileInfo(file) {
      if (!this.validateFile(file)) {
        return null;
      }

      return {
        name: file.name,
        size: file.size,
        type: file.type,
        sizeFormatted: this.formatFileSize(file.size)
      };
    }
  }

  // Export singleton instance
  window.ImageHandler = new ImageHandler();

})();
