(function () {
  const LOGIN_KEY = 'blazing-login-complete';
  const USERNAME_KEY = 'blazing-login-username';
  const PLAYER_ID_KEY = 'blazing-player-id';
  const ACCOUNT_STORE_KEY = 'blazing-account-store';
  const RESOURCES_STORAGE_KEY = 'blazing_resources_v1';
  const INVENTORY_KEY = 'blazing_inventory_v1';
  const TEAM_KEY = 'blazing_teams_v1';
  const ACCOUNT_SOURCE_PATH = 'data/user-accounts.json';

  const overlay = document.getElementById('login-overlay');
  const formWrapper = overlay?.querySelector('[data-login-form]');
  const form = formWrapper?.querySelector('form');
  const usernameInput = overlay?.querySelector('[data-login-username]');
  const passwordInput = overlay?.querySelector('[data-login-password]');
  const guestButton = overlay?.querySelector('[data-login-guest]');
  const fastEnterButton = overlay?.querySelector('[data-login-fast]');
  const createAccountButton = overlay?.querySelector('[data-login-create]');
  const feedback = overlay?.querySelector('[data-login-feedback]');
  const loadingBridge = document.getElementById('login-loading');
  const redirectUrl = overlay?.dataset.redirect;
  const usernameDisplay = document.getElementById('username-display');

  if (!overlay) return;

  const setupLoginMusic = () => {
    const track = new Audio('assets/music/general.mp3');
    track.loop = true;
    track.volume = 0.35;
    track.preload = 'auto';

    const tryPlay = () => {
      track.play().catch(() => {});
    };

    tryPlay();
    ['click', 'touchstart', 'keydown'].forEach((evt) => {
      overlay.addEventListener(
        evt,
        () => {
          tryPlay();
        },
        { once: true },
      );
    });

    return track;
  };

  setupLoginMusic();

  const safeGet = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  };

  const safeSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Ignore storage errors so we never block login flow.
    }
  };

  let accountStore = { nextId: 1001, accounts: [] };

  const sanitizeResources = (resources = {}) => {
    const base = { ryo: 0, ninja_pearls: 0, shinobites: 0, granny_coin: 0 };
    if (resources && typeof resources === 'object') {
      for (const [key, value] of Object.entries(resources)) {
        base[key] = Math.max(0, Number(value) || 0);
      }
    }
    return base;
  };

  const applyAccountResources = (account) => {
    if (!account?.resources) return;
    const resources = sanitizeResources(account.resources);
    try {
      localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(resources));
    } catch (error) {
      // Ignore storage issues; resources will be initialized on the next page load if needed.
    }
  };

  const mapToInventoryEntry = (ninja, index, ownerId = 'local') => {
    const characterId = String(ninja.characterId || ninja.id || '').trim();
    const uid = ninja.uid || `acct-${ownerId}-${index}-${characterId || 'ninja'}`;
    return {
      uid,
      charId: characterId,
      level: Number(ninja.level) || 1,
      tierCode: ninja.tierCode || null,
      dupeUnlocks: Number.isFinite(Number(ninja.dupeUnlocks))
        ? Number(ninja.dupeUnlocks)
        : 0,
    };
  };

  const applyAccountInventory = (account) => {
    if (!account?.ninjas) return;
    const inventory = normalizeNinjas(account.ninjas, account.id).map((ninja, idx) =>
      mapToInventoryEntry(ninja, idx, account.id),
    );
    try {
      localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
    } catch (error) {
      // Ignore failures; downstream pages will rely on in-memory inventory if present.
    }
  };

  const applyAccountTeams = (account) => {
    const teams = normalizeTeams(account?.teams);
    try {
      localStorage.setItem(TEAM_KEY, JSON.stringify(teams));
    } catch (error) {
      // Non-blocking: team data is a convenience for skipping setup.
    }
  };

  const normalizeNinjas = (ninjas = [], accountId = 'local') => {
    if (!Array.isArray(ninjas)) return [];
    return ninjas
      .filter((ninja) => ninja?.id || ninja?.characterId)
      .map((ninja, index) => {
        const characterId = String(ninja.id || ninja.characterId || '').trim();
        const stableUid = ninja.uid || `acct-${accountId}-${index}-${characterId || 'ninja'}`;
        return {
          uid: stableUid,
          id: characterId || String(index + 1),
          characterId: characterId || String(index + 1),
          name: ninja.name ? String(ninja.name) : undefined,
          version: ninja.version ? String(ninja.version) : undefined,
          level: Number(ninja.level) || 1,
          rank: String(ninja.rank || 'Genin'),
          tierCode: ninja.tierCode ? String(ninja.tierCode) : null,
          element: String(ninja.element || 'Neutral'),
          dupeUnlocks: Number.isFinite(Number(ninja.dupeUnlocks))
            ? Number(ninja.dupeUnlocks)
            : 0,
          unlockedPassives: Array.isArray(ninja.unlockedPassives)
            ? ninja.unlockedPassives
            : undefined,
        };
      });
  };

  const normalizeTeams = (teams = null) => {
    const base = { 1: {}, 2: {}, 3: {} };
    if (!teams || typeof teams !== 'object') return base;
    return {
      1: teams[1] || teams['1'] || {},
      2: teams[2] || teams['2'] || {},
      3: teams[3] || teams['3'] || {},
    };
  };

  const normalizeAccountStore = (store) => {
    const normalized = {
      nextId: Number(store?.nextId) || 1001,
      accounts: Array.isArray(store?.accounts)
        ? store.accounts
            .filter((account) => account?.username && account?.password)
            .map((account) => ({
              id: Number(account.id) || null,
              username: String(account.username),
              password: String(account.password),
              ninjas: normalizeNinjas(account.ninjas, account.id),
              resources: sanitizeResources(account.resources),
              teams: normalizeTeams(account.teams),
            }))
        : [],
    };

    if (!normalized.nextId && normalized.accounts.length) {
      const maxId = normalized.accounts.reduce(
        (max, account) => Math.max(max, Number(account.id) || 0),
        0,
      );
      normalized.nextId = Math.max(1001, maxId + 1);
    }

    return normalized;
  };

  const persistAccountStore = () => {
    try {
      safeSet(ACCOUNT_STORE_KEY, JSON.stringify(accountStore));
    } catch (error) {
      // Ignore persistence errors; session login still continues.
    }
  };

  const loadAccountStore = async () => {
    const cached = safeGet(ACCOUNT_STORE_KEY);
    if (cached) {
      try {
        accountStore = normalizeAccountStore(JSON.parse(cached));
        return accountStore;
      } catch (error) {
        // Fall through to fetch a clean copy.
      }
    }

    try {
      const response = await fetch(ACCOUNT_SOURCE_PATH);
      if (response.ok) {
        const remoteStore = await response.json();
        accountStore = normalizeAccountStore(remoteStore);
        persistAccountStore();
        return accountStore;
      }
    } catch (error) {
      // Fall back to an empty store.
    }

    accountStore = { nextId: 1001, accounts: [] };
    persistAccountStore();
    return accountStore;
  };

  const accountStoreReady = loadAccountStore();

  const hasLoggedIn = () => safeGet(LOGIN_KEY) === 'true';

  const attachMissingNinjas = (account) => {
    if (!account) return account;
    if (!Array.isArray(account.ninjas) || account.ninjas.length === 0) {
      const fallback = starterNinjas(account.id || nextPlayerId());
      account.ninjas = fallback;
      persistAccountStore();
    }
    if (!account.teams) {
      account.teams = normalizeTeams();
      persistAccountStore();
    }
    return account;
  };

  const showFeedback = (message, isError = false) => {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-error', Boolean(isError));
    feedback.classList.toggle('is-success', !isError);
    feedback.classList.add('is-visible');
  };

  const setUsername = (name) => {
    if (!name) return;
    safeSet(USERNAME_KEY, name);
    if (usernameDisplay) {
      usernameDisplay.textContent = name;
    }
  };

  const setPlayerId = (playerId) => {
    if (playerId) {
      safeSet(PLAYER_ID_KEY, String(playerId));
    }
  };

  const findAccount = (name) => {
    const target = name?.trim().toLowerCase();
    if (!target) return null;
    return accountStore.accounts.find(
      (account) => account.username?.toLowerCase() === target,
    );
  };

  const nextPlayerId = () => {
    const highestId = accountStore.accounts.reduce(
      (max, account) => Math.max(max, Number(account.id) || 0),
      0,
    );
    const startingId = Number(accountStore.nextId) || 1001;
    const newId = Math.max(startingId, highestId + 1);
    accountStore.nextId = newId + 1;
    return newId;
  };

  const finalizeLogin = (name, account = null) => {
    const resolvedName = name?.trim() || safeGet(USERNAME_KEY) || 'Ninja';
    setUsername(resolvedName);
    if (account?.id) {
      setPlayerId(account.id);
    }
    applyAccountResources(account);
    applyAccountInventory(account);
    applyAccountTeams(account);
    safeSet(LOGIN_KEY, 'true');
    overlay.classList.add('is-hidden');
    document.body.classList.remove('login-active');
    const removeOverlay = () => overlay.remove();
    overlay.addEventListener('transitionend', removeOverlay, { once: true });
    setTimeout(removeOverlay, 650);

    if (loadingBridge && redirectUrl) {
      loadingBridge.classList.remove('is-hidden');
      const loaderText = loadingBridge.querySelector('[data-loading-message]');
      if (loaderText) {
        loaderText.textContent = 'Entering the village plaza…';
      }

      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 550);
    }
  };

  if (hasLoggedIn()) {
    const storedName = safeGet(USERNAME_KEY);
    if (storedName) setUsername(storedName);

    if (loadingBridge && redirectUrl) {
      overlay.classList.add('is-hidden');
      document.body.classList.remove('login-active');
      loadingBridge.classList.remove('is-hidden');

      const loaderText = loadingBridge.querySelector('[data-loading-message]');
      if (loaderText) {
        loaderText.textContent = 'Resuming your village session…';
      }

      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 450);
      return;
    }

    overlay.remove();
    document.body.classList.remove('login-active');
    return;
  }

  document.body.classList.add('login-active');

  const storedName = safeGet(USERNAME_KEY);
  if (storedName && usernameInput) {
    usernameInput.value = storedName;
  }

  const starterNinjas = (playerId) => {
    const starters = [
      { id: 'naruto_001', name: 'Naruto Uzumaki', element: 'Wind' },
      { id: 'sasuke_004', name: 'Sasuke Uchiha', element: 'Lightning' },
      { id: 'sakura_006', name: 'Sakura Haruno', element: 'Earth' },
      { id: 'rock_148', name: 'Rock Lee', element: 'Taijutsu' },
      { id: 'shikamaru_010', name: 'Shikamaru Nara', element: 'Shadow' },
      { id: 'hinata_016', name: 'Hinata Hyuga', element: 'Water' },
    ];

    const offset = Number(playerId) % starters.length;
    const picks = [starters[offset], starters[(offset + 2) % starters.length]];

    return picks.map((ninja) => ({
      id: ninja.id,
      characterId: ninja.id,
      name: ninja.name,
      level: 1,
      rank: 'Genin',
      element: ninja.element,
    }));
  };

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = usernameInput?.value?.trim?.() || '';
    const password = passwordInput?.value || '';

    await accountStoreReady;

    if (!username || !password) {
      showFeedback('Enter a username and password to log in.', true);
      return;
    }

    const account = attachMissingNinjas(findAccount(username));
    if (!account) {
      showFeedback('No account found. Try creating one first.', true);
      return;
    }

    if (account.password !== password) {
      showFeedback('Incorrect password. Please try again.', true);
      return;
    }

    showFeedback('Welcome back! Taking you to the village…');
    finalizeLogin(account.username, account);
  });

  createAccountButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    const username = usernameInput?.value?.trim?.() || '';
    const password = passwordInput?.value || '';

    await accountStoreReady;

    if (!username || !password) {
      showFeedback('Choose a username and password to create your account.', true);
      return;
    }

    if (username.length < 3) {
      showFeedback('Usernames need at least 3 characters.', true);
      return;
    }

    if (password.length < 4) {
      showFeedback('Passwords need at least 4 characters.', true);
      return;
    }

    const existingAccount = findAccount(username);
    if (existingAccount) {
      showFeedback('That ninja already exists. Try logging in instead.', true);
      return;
    }

    const playerId = nextPlayerId();
    const newAccount = {
      id: playerId,
      username,
      password,
      ninjas: starterNinjas(playerId),
      teams: normalizeTeams(),
      resources: sanitizeResources(),
    };
    accountStore.accounts.push(newAccount);
    persistAccountStore();

    showFeedback(`Account created! Player ID #${playerId}. Signing you in…`);
    finalizeLogin(username, newAccount);
  });

  guestButton?.addEventListener('click', (event) => {
    event.preventDefault();
    showFeedback('Continuing as guest.');
    finalizeLogin(usernameInput?.value || storedName || '');
  });

  fastEnterButton?.addEventListener('click', (event) => {
    event.preventDefault();
    finalizeLogin(usernameInput?.value || storedName || '');
  });
})();
