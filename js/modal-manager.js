// js/modal-manager.js
// Custom Modal System - Replaces browser alert/prompt/confirm with in-game modals

(function(global) {
  'use strict';

  const ModalManager = {
    overlay: null,
    currentModal: null,
    isOpen: false,

    /**
     * Initialize the modal system
     */
    init() {
      this.createOverlay();
      console.log('Modal system initialized');
    },

    /**
     * Create the modal overlay container
     */
    createOverlay() {
      if (document.getElementById('modal-overlay')) {
        this.overlay = document.getElementById('modal-overlay');
        return;
      }

      this.overlay = document.createElement('div');
      this.overlay.id = 'modal-overlay';
      this.overlay.className = 'modal-overlay';
      this.overlay.style.display = 'none';
      document.body.appendChild(this.overlay);

      // Close on overlay click
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.close();
        }
      });
    },

    /**
     * Show a success message modal
     * @param {string} message - Message to display
     * @param {Function} onClose - Optional callback when modal closes
     */
    showSuccess(message, onClose) {
      const modal = this.createModal('success');
      modal.innerHTML = `
        <div class="modal-header modal-success">
          <h3 class="modal-title">Success</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-primary" id="modal-confirm-btn">OK</button>
        </div>
      `;

      this.show(modal, () => {
        if (onClose) onClose();
      });
    },

    /**
     * Show an error message modal
     * @param {string} message - Error message to display
     * @param {Function} onClose - Optional callback when modal closes
     */
    showError(message, onClose) {
      const modal = this.createModal('error');
      modal.innerHTML = `
        <div class="modal-header modal-error">
          <h3 class="modal-title">Error</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-primary" id="modal-confirm-btn">OK</button>
        </div>
      `;

      this.show(modal, () => {
        if (onClose) onClose();
      });
    },

    /**
     * Show an info message modal
     * @param {string} message - Info message to display
     * @param {Function} onClose - Optional callback when modal closes
     */
    showInfo(message, onClose) {
      const modal = this.createModal('info');
      modal.innerHTML = `
        <div class="modal-header modal-info">
          <h3 class="modal-title">Information</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-primary" id="modal-confirm-btn">OK</button>
        </div>
      `;

      this.show(modal, () => {
        if (onClose) onClose();
      });
    },

    /**
     * Show a confirmation dialog
     * @param {string} message - Question to ask
     * @param {Function} onConfirm - Callback when confirmed
     * @param {Function} onCancel - Callback when cancelled
     */
    showConfirm(message, onConfirm, onCancel) {
      const modal = this.createModal('confirm');
      modal.innerHTML = `
        <div class="modal-header modal-confirm">
          <h3 class="modal-title">Confirm</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-secondary" id="modal-cancel-btn">Cancel</button>
          <button class="modal-btn modal-btn-primary" id="modal-confirm-btn">Confirm</button>
        </div>
      `;

      this.show(modal, null, { onConfirm, onCancel });
    },

    /**
     * Show a text input prompt
     * @param {string} message - Prompt message
     * @param {string} defaultValue - Default input value
     * @param {Function} onSubmit - Callback with input value
     * @param {Function} onCancel - Callback when cancelled
     */
    showPrompt(message, defaultValue = '', onSubmit, onCancel) {
      const modal = this.createModal('prompt');
      modal.innerHTML = `
        <div class="modal-header modal-prompt">
          <h3 class="modal-title">Input Required</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
          <input type="text" class="modal-input" id="modal-input-field" value="${this.escapeHtml(defaultValue)}" maxlength="100">
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-secondary" id="modal-cancel-btn">Cancel</button>
          <button class="modal-btn modal-btn-primary" id="modal-confirm-btn">Submit</button>
        </div>
      `;

      this.show(modal, null, { onSubmit, onCancel });

      // Focus input and select text
      setTimeout(() => {
        const input = modal.querySelector('#modal-input-field');
        if (input) {
          input.focus();
          input.select();

          // Submit on Enter key
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              const confirmBtn = modal.querySelector('#modal-confirm-btn');
              if (confirmBtn) confirmBtn.click();
            }
          });
        }
      }, 100);
    },

    /**
     * Show a selection list modal
     * @param {string} title - Modal title
     * @param {Array} options - Array of {id, name, description} objects
     * @param {Function} onSelect - Callback with selected option
     * @param {Function} onCancel - Callback when cancelled
     */
    showSelection(title, options, onSelect, onCancel) {
      const modal = this.createModal('selection');

      const optionsHtml = options.map((opt, index) => `
        <div class="modal-selection-item" data-index="${index}">
          <div class="modal-selection-name">${this.escapeHtml(opt.name || opt.toString())}</div>
          ${opt.description ? `<div class="modal-selection-desc">${this.escapeHtml(opt.description)}</div>` : ''}
        </div>
      `).join('');

      modal.innerHTML = `
        <div class="modal-header modal-selection">
          <h3 class="modal-title">${this.escapeHtml(title)}</h3>
        </div>
        <div class="modal-body modal-selection-body">
          ${optionsHtml}
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-secondary" id="modal-cancel-btn">Cancel</button>
        </div>
      `;

      this.show(modal, null, { onSelect, onCancel, options });

      // Add click handlers to selection items
      modal.querySelectorAll('.modal-selection-item').forEach(item => {
        item.addEventListener('click', () => {
          const index = parseInt(item.dataset.index);
          this.close();
          if (onSelect) onSelect(options[index]);
        });
      });
    },

    /**
     * Create a modal element
     * @param {string} type - Modal type (success, error, confirm, etc.)
     * @returns {HTMLElement} Modal element
     */
    createModal(type) {
      const modal = document.createElement('div');
      modal.className = `modal-container modal-${type}`;
      return modal;
    },

    /**
     * Show the modal
     * @param {HTMLElement} modal - Modal element to show
     * @param {Function} onClose - Callback when modal closes
     * @param {Object} callbacks - Object with onConfirm, onCancel, onSubmit, onSelect callbacks
     */
    show(modal, onClose, callbacks = {}) {
      if (this.isOpen) {
        this.close();
      }

      this.currentModal = modal;
      this.isOpen = true;
      this.overlay.innerHTML = '';
      this.overlay.appendChild(modal);
      this.overlay.style.display = 'flex';

      // Animate in
      setTimeout(() => {
        this.overlay.classList.add('modal-open');
        modal.classList.add('modal-show');
      }, 10);

      // Set up button handlers
      const confirmBtn = modal.querySelector('#modal-confirm-btn');
      const cancelBtn = modal.querySelector('#modal-cancel-btn');

      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          if (callbacks.onConfirm) {
            this.close();
            callbacks.onConfirm();
          } else if (callbacks.onSubmit) {
            const input = modal.querySelector('#modal-input-field');
            const value = input ? input.value : '';
            this.close();
            callbacks.onSubmit(value);
          } else {
            this.close();
            if (onClose) onClose();
          }
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          this.close();
          if (callbacks.onCancel) callbacks.onCancel();
        });
      }

      // ESC key to close
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          this.close();
          if (callbacks.onCancel) callbacks.onCancel();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    },

    /**
     * Close the current modal
     */
    close() {
      if (!this.isOpen) return;

      this.overlay.classList.remove('modal-open');
      if (this.currentModal) {
        this.currentModal.classList.remove('modal-show');
      }

      setTimeout(() => {
        this.overlay.style.display = 'none';
        this.overlay.innerHTML = '';
        this.currentModal = null;
        this.isOpen = false;
      }, 300);
    },

    /**
     * Escape HTML to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ModalManager.init());
  } else {
    ModalManager.init();
  }

  // Expose globally
  global.ModalManager = ModalManager;

})(window);
