// js/username.js
// Username Management System
// Handles username storage, editing, and display

(function (global) {
  "use strict";

  const STORAGE_KEY = "blazing_username_v1";
  const DEFAULT_USERNAME = "Player";

  let _username = DEFAULT_USERNAME;

  // ---------- Persistence ----------
  function loadUsername() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored.trim()) {
        _username = stored.trim();
      } else {
        _username = DEFAULT_USERNAME;
      }
    } catch (err) {
      console.warn("[Username] Failed to load, using default");
      _username = DEFAULT_USERNAME;
    }
  }

  function saveUsername() {
    try {
      localStorage.setItem(STORAGE_KEY, _username);
    } catch (err) {
      console.error("[Username] Failed to save:", err);
    }
  }

  // ---------- API ----------
  function getUsername() {
    return _username;
  }

  function setUsername(newName) {
    if (!newName || typeof newName !== 'string') {
      console.warn("[Username] Invalid username provided");
      return false;
    }

    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      console.warn("[Username] Username cannot be empty");
      return false;
    }

    if (trimmed.length > 20) {
      console.warn("[Username] Username too long (max 20 characters)");
      return false;
    }

    _username = trimmed;
    saveUsername();
    updateDisplay();
    console.log(`[Username] Set to: ${_username}`);
    return true;
  }

  function resetUsername() {
    _username = DEFAULT_USERNAME;
    saveUsername();
    updateDisplay();
  }

  // ---------- Display Update ----------
  function updateDisplay() {
    const usernameElement = document.getElementById('player-username');
    if (usernameElement) {
      usernameElement.textContent = _username;
    }
  }

  // ---------- Make Username Holder Clickable ----------
  function makeHolderClickable() {
    const holder = document.querySelector('.username-holder');
    if (holder) {
      holder.style.cursor = 'pointer';
      holder.addEventListener('click', openEditor);
    }
  }

  // ---------- Editor Dialog ----------
  function openEditor() {
    if (window.ModalManager) {
      window.ModalManager.showPrompt(
        `Enter your username (max 20 characters):\n\nCurrent: ${_username}`,
        _username,
        (newName) => {
          if (setUsername(newName)) {
            window.ModalManager.showSuccess(`Username updated to: ${getUsername()}`);
          } else {
            window.ModalManager.showError('Invalid username. Please try again.\n\n- Must be 1-20 characters\n- Cannot be empty');
          }
        },
        null
      );
    }
  }

  // ---------- Initialization ----------
  function init() {
    loadUsername();

    // Update display when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        updateDisplay();
        makeHolderClickable();
      });
    } else {
      updateDisplay();
      makeHolderClickable();
    }
  }

  // Initialize on load
  init();

  // Public API
  global.Username = {
    get: getUsername,
    set: setUsername,
    reset: resetUsername,
    openEditor,
    updateDisplay
  };

})(window);
