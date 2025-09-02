/**
 * DOM Utilities Module
 * Handles DOM element selection and basic manipulation
 * Following Single Responsibility Principle
 */
(function() {
  'use strict';

  // DOM element cache to avoid repeated queries
  const elementCache = new Map();

  /**
   * Get DOM element by ID with caching
   * @param {string} id - Element ID
   * @returns {HTMLElement|null} DOM element or null if not found
   */
  function getElementById(id) {
    if (elementCache.has(id)) {
      return elementCache.get(id);
    }
    
    const element = document.getElementById(id);
    if (element) {
      elementCache.set(id, element);
    }
    return element;
  }

  /**
   * Get multiple elements by selector
   * @param {string} selector - CSS selector
   * @returns {NodeList} List of matching elements
   */
  function querySelectorAll(selector) {
    return document.querySelectorAll(selector);
  }

  /**
   * Get single element by selector
   * @param {string} selector - CSS selector
   * @returns {HTMLElement|null} First matching element or null
   */
  function querySelector(selector) {
    return document.querySelector(selector);
  }

  /**
   * Create a new DOM element
   * @param {string} tagName - HTML tag name
   * @param {Object} options - Element options (className, textContent, etc.)
   * @returns {HTMLElement} Created element
   */
  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    
    Object.keys(options).forEach(key => {
      if (key === 'className') {
        element.className = options[key];
      } else if (key === 'textContent') {
        element.textContent = options[key];
      } else if (key === 'innerHTML') {
        element.innerHTML = options[key];
      } else {
        element.setAttribute(key, options[key]);
      }
    });
    
    return element;
  }

  /**
   * Add event listener to element
   * @param {HTMLElement} element - Target element
   * @param {string} event - Event type
   * @param {Function} handler - Event handler
   * @param {Object} options - Event options
   */
  function addEventListener(element, event, handler, options = {}) {
    if (element && typeof handler === 'function') {
      element.addEventListener(event, handler, options);
    }
  }

  /**
   * Remove event listener from element
   * @param {HTMLElement} element - Target element
   * @param {string} event - Event type
   * @param {Function} handler - Event handler
   */
  function removeEventListener(element, event, handler) {
    if (element && typeof handler === 'function') {
      element.removeEventListener(event, handler);
    }
  }

  /**
   * Show element by setting display style
   * @param {HTMLElement} element - Target element
   * @param {string} display - Display value (default: 'block')
   */
  function showElement(element, display = 'block') {
    if (element) {
      element.style.display = display;
    }
  }

  /**
   * Hide element by setting display to none
   * @param {HTMLElement} element - Target element
   */
  function hideElement(element) {
    if (element) {
      element.style.display = 'none';
    }
  }

  /**
   * Toggle element visibility
   * @param {HTMLElement} element - Target element
   * @param {string} display - Display value when showing (default: 'block')
   */
  function toggleElement(element, display = 'block') {
    if (element) {
      element.style.display = element.style.display === 'none' ? display : 'none';
    }
  }

  /**
   * Set element text content safely
   * @param {HTMLElement} element - Target element
   * @param {string} text - Text content
   */
  function setTextContent(element, text) {
    if (element) {
      element.textContent = text || '';
    }
  }

  /**
   * Set element inner HTML safely
   * @param {HTMLElement} element - Target element
   * @param {string} html - HTML content
   */
  function setInnerHTML(element, html) {
    if (element) {
      element.innerHTML = html || '';
    }
  }

  /**
   * Get element value safely
   * @param {HTMLElement} element - Target element
   * @returns {string} Element value or empty string
   */
  function getValue(element) {
    return element ? (element.value || '') : '';
  }

  /**
   * Set element value safely
   * @param {HTMLElement} element - Target element
   * @param {string} value - Value to set
   */
  function setValue(element, value) {
    if (element) {
      element.value = value || '';
    }
  }

  /**
   * Check if element is checked (for checkboxes/radio buttons)
   * @param {HTMLElement} element - Target element
   * @returns {boolean} Checked state
   */
  function isChecked(element) {
    return element ? element.checked : false;
  }

  /**
   * Set element checked state
   * @param {HTMLElement} element - Target element
   * @param {boolean} checked - Checked state
   */
  function setChecked(element, checked) {
    if (element) {
      element.checked = !!checked;
    }
  }

  /**
   * Disable element
   * @param {HTMLElement} element - Target element
   */
  function disableElement(element) {
    if (element) {
      element.disabled = true;
    }
  }

  /**
   * Enable element
   * @param {HTMLElement} element - Target element
   */
  function enableElement(element) {
    if (element) {
      element.disabled = false;
    }
  }

  /**
   * Scroll element to bottom
   * @param {HTMLElement} element - Target element
   */
  function scrollToBottom(element) {
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }

  /**
   * Clear element cache (useful for testing or dynamic content)
   */
  function clearCache() {
    elementCache.clear();
  }

  // Export public API
  window.DOMUtils = {
    getElementById,
    querySelectorAll,
    querySelector,
    createElement,
    addEventListener,
    removeEventListener,
    showElement,
    hideElement,
    toggleElement,
    setTextContent,
    setInnerHTML,
    getValue,
    setValue,
    isChecked,
    setChecked,
    disableElement,
    enableElement,
    scrollToBottom,
    clearCache
  };

})();
