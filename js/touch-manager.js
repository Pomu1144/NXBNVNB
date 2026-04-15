// js/touch-manager.js - Touch Gesture System with Hammer.js
(() => {
  "use strict";

  /**
   * TouchManager - Centralized touch gesture handling
   * Uses Hammer.js for reliable cross-device touch gestures
   *
   * Features:
   * - Swipe gestures for navigation
   * - Long press for quick actions
   * - Pinch to zoom
   * - Double tap shortcuts
   */
  const TouchManager = {
    // Active hammer instances
    hammers: {},

    // State
    initialized: false,

    /**
     * Initialize touch system
     */
    init() {
      if (this.initialized) return;
      if (!window.Hammer) {
        console.warn('[TouchManager] Hammer.js not loaded, touch gestures disabled');
        return;
      }

      console.log('[TouchManager] Initializing touch gestures...');
      this.initialized = true;
      console.log('[TouchManager] ✅ Touch system ready');
    },

    /**
     * Add swipe gestures to an element
     * @param {HTMLElement|string} element - Element or selector
     * @param {Object} callbacks - { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown }
     */
    addSwipeGestures(element, callbacks) {
      if (!window.Hammer) return null;

      const el = typeof element === 'string' ? document.querySelector(element) : element;
      if (!el) return null;

      const hammer = new Hammer(el);
      hammer.get('swipe').set({ direction: Hammer.DIRECTION_ALL });

      if (callbacks.onSwipeLeft) {
        hammer.on('swipeleft', callbacks.onSwipeLeft);
      }
      if (callbacks.onSwipeRight) {
        hammer.on('swiperight', callbacks.onSwipeRight);
      }
      if (callbacks.onSwipeUp) {
        hammer.on('swipeup', callbacks.onSwipeUp);
      }
      if (callbacks.onSwipeDown) {
        hammer.on('swipedown', callbacks.onSwipeDown);
      }

      return hammer;
    },

    /**
     * Add long press gesture
     * @param {HTMLElement|string} element - Element or selector
     * @param {Function} callback - Callback function
     * @param {number} time - Press time in ms (default 500)
     */
    addLongPress(element, callback, time = 500) {
      if (!window.Hammer) return null;

      const el = typeof element === 'string' ? document.querySelector(element) : element;
      if (!el) return null;

      const hammer = new Hammer(el);
      hammer.get('press').set({ time });
      hammer.on('press', callback);

      return hammer;
    },

    /**
     * Add double tap gesture
     * @param {HTMLElement|string} element - Element or selector
     * @param {Function} callback - Callback function
     */
    addDoubleTap(element, callback) {
      if (!window.Hammer) return null;

      const el = typeof element === 'string' ? document.querySelector(element) : element;
      if (!el) return null;

      const hammer = new Hammer(el);
      hammer.on('doubletap', callback);

      return hammer;
    },

    /**
     * Add pinch to zoom gesture
     * @param {HTMLElement|string} element - Element or selector
     * @param {Function} callback - Callback function(scale)
     */
    addPinchZoom(element, callback) {
      if (!window.Hammer) return null;

      const el = typeof element === 'string' ? document.querySelector(element) : element;
      if (!el) return null;

      const hammer = new Hammer(el);
      hammer.get('pinch').set({ enable: true });
      hammer.on('pinch', (e) => callback(e.scale));

      return hammer;
    },

    /**
     * Remove all gestures from an element
     * @param {Hammer} hammer - Hammer instance to destroy
     */
    removeGestures(hammer) {
      if (hammer && hammer.destroy) {
        hammer.destroy();
      }
    }
  };

  // Export to window
  window.TouchManager = TouchManager;

  // Auto-initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TouchManager.init());
  } else {
    TouchManager.init();
  }

  console.log("[TouchManager] Module loaded ✅");
})();
