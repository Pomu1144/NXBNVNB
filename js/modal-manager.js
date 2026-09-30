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
          const onDismiss = this._onDismiss;
          this.close();
          if (onDismiss) onDismiss();
        }
      });
    },

    /**
     * Show a success message modal
     * @param {string} message - Message to display
     * @param {Function} onClose - Optional callback when modal closes
     * @param {Object} [opts] - { title } to override the header text
     */
    showSuccess(message, onClose, opts = {}) {
      const modal = this.createModal('success');
      modal.innerHTML = `
        <div class="modal-header modal-success">
          <h3 class="modal-title">${this.escapeHtml((opts && opts.title) || 'Success')}</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-primary jjk-btn" id="modal-confirm-btn">OK</button>
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
     * @param {Object} [opts] - { title } to override the header text
     */
    showError(message, onClose, opts = {}) {
      const modal = this.createModal('error');
      modal.innerHTML = `
        <div class="modal-header modal-error">
          <h3 class="modal-title">${this.escapeHtml((opts && opts.title) || 'Error')}</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-primary jjk-btn" id="modal-confirm-btn">OK</button>
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
     * @param {Object} [opts] - { title } to override the header text
     */
    showInfo(message, onClose, opts = {}) {
      const modal = this.createModal('info');
      modal.innerHTML = `
        <div class="modal-header modal-info">
          <h3 class="modal-title">${this.escapeHtml((opts && opts.title) || 'Information')}</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-primary jjk-btn" id="modal-confirm-btn">OK</button>
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
     * @param {Object} [opts] - { title, confirmText, cancelText } to override the labels
     */
    showConfirm(message, onConfirm, onCancel, opts = {}) {
      const modal = this.createModal('confirm');
      modal.innerHTML = `
        <div class="modal-header modal-confirm">
          <h3 class="modal-title">${this.escapeHtml(opts.title || 'Confirm')}</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-secondary" id="modal-cancel-btn">${this.escapeHtml(opts.cancelText || 'Cancel')}</button>
          <button class="modal-btn modal-btn-primary jjk-btn" id="modal-confirm-btn">${this.escapeHtml(opts.confirmText || 'Confirm')}</button>
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
    showPrompt(message, defaultValue = '', onSubmit, onCancel, opts = {}) {
      const modal = this.createModal('prompt');
      modal.innerHTML = `
        <div class="modal-header modal-prompt">
          <h3 class="modal-title">${this.escapeHtml(opts.title || 'Enter')}</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
          <input type="text" class="modal-input" id="modal-input-field" value="${this.escapeHtml(defaultValue)}" maxlength="100">
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-secondary" id="modal-cancel-btn">Cancel</button>
          <button class="modal-btn modal-btn-primary jjk-btn" id="modal-confirm-btn">${this.escapeHtml(opts.confirmText || 'OK')}</button>
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
      if (!this.overlay) this.createOverlay();
      if (this.isOpen) {
        this.close();
      }
      // A dialog opened straight after another closes (Confirm -> Success)
      // must not be wiped by the previous close's delayed cleanup
      clearTimeout(this._closeTimer);
      this._onDismiss = callbacks.onCancel || null;

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
      this._escHandler = escHandler;
    },

    /**
     * Close the current modal
     */
    close() {
      if (!this.isOpen) return;
      this.isOpen = false;

      // Stop a closed dialog's ESC handler from firing its onCancel later
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
      this.overlay.classList.remove('modal-open');
      if (this.currentModal) {
        this.currentModal.classList.remove('modal-show');
      }

      this._closeTimer = setTimeout(() => {
        this.overlay.style.display = 'none';
        this.overlay.innerHTML = '';
        this.currentModal = null;
        this.isOpen = false;
      }, 300);
    },

    /**
     * In-game replacement for window.alert: picks the header from a leading
     * status mark and drops emoji so the text reads like game copy
     */
    /**
     * Buttons dialog as a promise: resolves the chosen button's value, or
     * null when dismissed (ESC / tap outside)
     * @param {string} message
     * @param {Array<{label:string,value:*,primary?:boolean}>} buttons
     * @param {Object} [opts] - { title }
     */
    pick(message, buttons, opts = {}) {
      return new Promise((resolve) => {
        const modal = this.createModal('confirm');
        modal.innerHTML = `
          <div class="modal-header modal-confirm">
            <h3 class="modal-title">${this.escapeHtml(opts.title || 'Confirm')}</h3>
          </div>
          <div class="modal-body">
            <p class="modal-message">${this.escapeHtml(message)}</p>
          </div>
          <div class="modal-footer">
            ${buttons.map((b, i) => `<button class="modal-btn ${b.primary ? 'modal-btn-primary jjk-btn' : 'modal-btn-secondary'}" data-i="${i}">${this.escapeHtml(b.label)}</button>`).join('')}
          </div>
        `;
        this.show(modal, null, { onCancel: () => resolve(null) });
        modal.querySelectorAll('[data-i]').forEach((btn) => btn.addEventListener('click', () => {
          this.close();
          resolve(buttons[Number(btn.dataset.i)].value);
        }));
      });
    },

    /** Yes/no as a promise (dismiss counts as no) */
    ask(message, opts = {}) {
      return this.pick(message, [
        { label: opts.cancelText || 'Cancel', value: false },
        { label: opts.confirmText || 'Confirm', value: true, primary: true }
      ], opts).then(v => v === true);
    },

    /** Text input as a promise: resolves the text, or null when cancelled */
    askText(message, defaultValue = '', opts = {}) {
      return new Promise((resolve) => {
        this.showPrompt(message, defaultValue, (v) => resolve(v), () => resolve(null), opts);
      });
    },

    notify(message) {
      const raw = String(message == null ? '' : message);
      const clean = raw.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/^[ \t]+/gm, '').trim();
      if (/^\s*❌/.test(raw)) this.showError(clean, null, { title: 'Error' });
      else if (/^\s*✅/.test(raw)) this.showSuccess(clean, null, { title: 'Success' });
      else this.showInfo(clean, null, { title: 'Notice' });
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

  // Popups use the game's own dialog, never the browser's "<site> says" box
  global.alert = (message) => ModalManager.notify(message);
  if (!document.querySelector('link[href*="modal-system.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/modal-system.css?v=3';
    document.head.appendChild(link);
  }

})(window);
