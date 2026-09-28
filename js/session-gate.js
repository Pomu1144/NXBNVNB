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

  // Only established players (tutorial finished or skipped) may open pages
  // directly. Until then only the village and the page(s) of the current
  // tutorial step open; anything else, e.g. a shared missions link, goes to
  // the village, where the tutorial (js/tutorial.js) starts or resumes.
  const TUTORIAL_KEY = 'blazing_tutorial_v1';
  const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (page !== 'village.html') {
    let tut = null;
    try { tut = JSON.parse(safeGet(TUTORIAL_KEY)); } catch (error) { tut = null; }
    const finished = tut && (tut.status === 'done' || tut.status === 'skipped');
    if (!finished) {
      const allowed = tut && tut.status === 'active' && Array.isArray(tut.pages)
        && tut.pages.some((p) => String(p).toLowerCase() === page);
      if (!allowed) {
        if (!tut) {
          try { localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ status: 'pending', updated: Date.now() })); } catch (error) { /* storage blocked */ }
        }
        window.location.replace('village.html');
        return;
      }
    }
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
