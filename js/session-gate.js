(function () {
  const LOGIN_KEY = 'blazing-login-complete';
  const USERNAME_KEY = 'blazing-login-username';
  const redirectUrl = 'index.html';

  const safeGet = (key) => {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) return value;
    } catch (error) {
      // Fall back to sessionStorage when localStorage is blocked.
    }

    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  };

  const hasLogin = () => safeGet(LOGIN_KEY) === 'true';

  if (!hasLogin()) {
    window.location.replace(redirectUrl);
    return;
  }

  // Apply stored username to the HUD when available.
  const username = safeGet(USERNAME_KEY);
  const applyUsername = () => {
    if (!username) return;
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) {
      usernameDisplay.textContent = username;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyUsername);
  } else {
    applyUsername();
  }
})();
