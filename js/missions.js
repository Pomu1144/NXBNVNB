// js/missions.js — Missions screen: category tabs, banner cards, detail sheet.
//
// Everything comes from data/missions.json (one entry per mission):
//   { id, category, arc?, chapter?, name, description, banner, feature?, featureArt?,
//     sortOrder, requires?: { mission, rank }, rankGate?, rankNames?,
//     stamina: {rank: n}, power: {rank: n},
//     clearRewards: {rank: { firstTime, completion }},
//     difficulties: {rank: [ { stage, title, map, boss?, waves: [{ enemies: [...] }], rewards } ]},
//     cast: { charId: { name, portrait } },
//     giant?: bossId }  -> Boss Battles: the stage's wave is [{ "giant": bossId }] and
//                          js/battle/battle-boss.js fields that boss from data/bosses.json
// Tabs: one per distinct `category`, ordered by TAB_ORDER; any other
// category found in the data gets a tab after those, in data order.

document.addEventListener('DOMContentLoaded', () => {
  const tabsContainer = document.querySelector('.mission-tabs');
  const listContainer = document.querySelector('.mission-list');

  let allMissions = [];

  // Known tabs, left to right. A new category needs no entry here (it is
  // appended), but can be listed to control its position.
  const TAB_ORDER = [
    'Shinobi Chronicles Part 1',
    'Shinobi Chronicles Part 2',
    'Super Impact',
    'Boss Battles',
    'Impact Missions',
    'Limited Time Event',
    'Growth Missions'
  ];
  // Short line shown above each tab's list
  const TAB_BLURB = {
    'Shinobi Chronicles Part 1': 'The story from the Academy to the Valley of the End. Clear an arc on Normal to open the next.',
    'Shinobi Chronicles Part 2': 'Shippuden, from Naruto’s homecoming to the final battle. Opens after Part 1.',
    'Super Impact': 'A / S / SS boss fights. Clearing SS recruits a unit that can be Blazing Awakened.',
    'Boss Battles': 'One giant boss that stalks the whole field. Move out of the red zones, Guard against map-wide blasts.',
    'Impact Missions': 'Much tougher missions; the top rank recruits the featured unit.',
    'Limited Time Event': 'Raids: defeat the featured shinobi for a chance to recruit a new unit.',
    'Growth Missions': 'EXP ramen, ryo and Awakening Scroll missions for building your team.'
  };
  const RANK_ORDER = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
  const PROGRESS_KEY = 'blazing_mission_progress_v1';
  // Player EXP per clear (mirrors js/battle/battle-missions.js -> ExpRewards)
  const RANK_EXP = { D: 25, C: 25, B: 50, A: 100, S: 200, SS: 200 };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fmt = (n) => (Number(n) || 0).toLocaleString();

  /* ------------------------------------------------------------------
   * Scroll routing. The page itself never scrolls (header, panel and
   * dock are all position:fixed), so the ONLY scroller is
   * .mission-list-container. Natively that means a wheel / drag only
   * works while the pointer is inside that inner box — over the tabs,
   * the panel frame or the empty left half of the screen nothing moved.
   * Forward those gestures to the list so the missions always scroll.
   * ------------------------------------------------------------------ */
  const scroller = document.querySelector('.mission-list-container');
  const NO_ROUTE = '.mission-list-container, .bottom-bar, #rotate-device-overlay, [class*="modal"], dialog';
  const shouldRoute = (t) => scroller && !(t && t.closest && t.closest(NO_ROUTE));

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || !shouldRoute(e.target)) return;
    let dy = e.deltaY;
    if (!dy) return;
    if (e.deltaMode === 1) dy *= 40;                          // lines
    else if (e.deltaMode === 2) dy *= scroller.clientHeight;  // pages
    scroller.scrollBy({ top: dy, left: 0, behavior: 'auto' });
  }, { passive: true });

  // Touch: vertical drags that start outside the list (tab row, panel frame,
  // left side) scroll the list; horizontal drags on the tab row are left to
  // the browser (the row is touch-action: pan-x on mobile), taps still click.
  let tStart = null, tLastY = 0, tLastT = 0, tVel = 0, tMode = null, tRaf = 0;
  window.addEventListener('touchstart', (e) => {
    cancelAnimationFrame(tRaf);
    if (e.touches.length !== 1 || !shouldRoute(e.target)) { tStart = null; return; }
    const t = e.touches[0];
    tStart = { x: t.clientX, y: t.clientY };
    tLastY = t.clientY; tLastT = performance.now(); tVel = 0; tMode = null;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!tStart || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (!tMode) {
      const dx = Math.abs(t.clientX - tStart.x), dy = Math.abs(t.clientY - tStart.y);
      if (dx < 6 && dy < 6) return;
      tMode = dy > dx ? 'y' : 'x';
    }
    if (tMode !== 'y') return;
    const now = performance.now();
    const step = tLastY - t.clientY;
    scroller.scrollTop += step;
    const dt = Math.max(1, now - tLastT);
    tVel = 0.8 * (step / dt) + 0.2 * tVel;
    tLastY = t.clientY; tLastT = now;
  }, { passive: true });
  window.addEventListener('touchend', () => {
    if (!tStart || tMode !== 'y') { tStart = null; return; }
    tStart = null;
    let v = tVel * 16;                                        // px per frame
    const glide = () => {
      if (Math.abs(v) < 0.5) return;
      scroller.scrollTop += v; v *= 0.94;
      tRaf = requestAnimationFrame(glide);
    };
    if (performance.now() - tLastT < 80) glide();
  }, { passive: true });

  /* ------------------------------------------------------------------
   * Progress (shared with js/mission-progress.js, which isn't loaded here):
   * blazing_mission_progress_v1 = { missionId: { rank: { firstClear } } }
   * ------------------------------------------------------------------ */
  let progress = {};
  function loadProgress() {
    try { progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') || {}; }
    catch { progress = {}; }
  }
  const isCleared = (id, rank) => progress?.[id]?.[rank]?.firstClear === true;
  const ranksOf = (m) => Object.keys(m.difficulties || {})
    .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
  const rankLabel = (m, r) => (m && m.rankNames && m.rankNames[r]) || `${r} Rank`;
  const missionById = (id) => allMissions.find(x => x.id === id);

  // A mission may gate itself behind another mission's rank clear via a
  // `requires: { mission, rank }` field.
  function isRequirementMet(mission) {
    const req = mission && mission.requires;
    if (!req || !req.mission) return true;
    return isCleared(req.mission, req.rank || 'SS');
  }
  function requirementText(mission) {
    const req = mission.requires;
    const reqM = missionById(req.mission);
    return `Clear ${rankLabel(reqM, req.rank || 'SS')} of “${reqM ? reqM.name : req.mission}”`;
  }
  // `rankGate`: each rank opens once the rank before it is cleared
  function isRankOpen(mission, rank) {
    if (!isRequirementMet(mission)) return false;
    if (!mission.rankGate) return true;
    const ranks = ranksOf(mission);
    const i = ranks.indexOf(rank);
    return i <= 0 || isCleared(mission.id, ranks[i - 1]);
  }
  // First open rank the player hasn't cleared yet
  function defaultRank(m) {
    const ranks = ranksOf(m);
    const open = ranks.filter(r => isRankOpen(m, r));
    return open.find(r => !isCleared(m.id, r)) || open[open.length - 1] || ranks[0];
  }

  /* ---------------------------- rewards ---------------------------- */
  const RF = () => window.RewardFormat;
  function rewardTiles(map, extraClass = '') {
    const items = RF() ? RF().items(map) : Object.entries(map || {}).map(([k, v]) => ({ key: k, name: k, qty: v, icon: '' }));
    return items.map(it => `
      <span class="mr-tile ${extraClass} ${it.kind === 'character' ? 'is-unit' : ''}" title="${esc(it.name)}">
        <img src="${esc(it.icon)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${esc(it.fallback || '')}'">
        <b>${it.kind === 'character' ? esc(String(it.tier || '').replace('S', '★')) : '×' + esc(RF() ? RF().fmtQty(it.qty) : it.qty)}</b>
        <small>${esc(it.name)}</small>
      </span>`).join('');
  }
  const mergeMaps = (...maps) => (RF() ? RF().merge(...maps) : Object.assign({}, ...maps));

  /* ---------------------------- rank icons ---------------------------- */
  // The D–SSS lettering (assets/icons/pow_*.png). If an icon fails to load
  // the chip falls back to the plain letter (CSS: .rank-ic.is-text).
  function rankIcon(r) {
    return `<span class="rank-ic" data-rank="${esc(r)}"><img src="assets/icons/pow_${esc(String(r).toLowerCase())}.png" alt="${esc(r)}" draggable="false" onerror="this.parentNode.classList.add('is-text');this.remove()"></span>`;
  }

  /* ------------------------------ cards ----------------------------- */
  // Banner = the mission's own composited banner
  // (assets/missions/banners/{si,impact,event,story,growth}/<id>.webp). Its
  // lettering is baked in, so banner cards carry no HTML title (the button
  // gets an aria-label instead). Missions without one (Boss Battles) keep the
  // key art + featured unit + HTML title layout.
  const hasOwnBanner = (m) => /\/banners\/(si|impact|event|story|growth)\//.test(m.banner || '');

  function bannerArt(mission) {
    if (hasOwnBanner(mission)) {
      return `
      <div class="mc-art mc-art--banner">
        <img class="mission-banner" src="${esc(mission.banner)}" alt="" loading="lazy"
             onerror="this.classList.add('is-missing');this.removeAttribute('src')">
      </div>`;
    }
    const boss = mission.feature && mission.cast && mission.cast[mission.feature];
    let feat = '';
    if (mission.chapter && boss) {
      feat = `<img class="mc-medal" src="${esc(boss.portrait)}" alt="" loading="lazy" onerror="this.remove()">`;
    } else if (mission.featureArt) {
      feat = `<img class="mc-feature" src="${esc(mission.featureArt)}" alt="" loading="lazy" onerror="this.remove()">`;
    }
    return `
      <div class="mc-art">
        <img class="mission-banner" src="${esc(mission.banner)}" alt="" loading="lazy"
             onerror="this.classList.add('is-missing');this.removeAttribute('src')">
        ${feat}
        <div class="mc-shade"></div>
      </div>`;
  }

  // "Super Impact! Wings of Freedom" -> kicker "Super Impact!", title "Wings of Freedom" (same for "Boss Battle!")
  function cardTitle(m) {
    const hit = /^(Super Impact!|Impact!|Boss Battle!)\s+(.+)$/.exec(m.name || '');
    if (hit) return { kicker: hit[1], title: hit[2] };
    const kicker = m.arc
      ? (m.chapter ? `Chapter ${m.chapter} · ${m.arc}` : m.arc)
      : (m.category || '');
    return { kicker, title: m.name };
  }

  function renderMissionsForCategory(categoryName) {
    const missionsToRender = allMissions
      .filter(m => m.category === categoryName)
      .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));

    loadProgress();
    listContainer.innerHTML = '';
    listContainer.dataset.category = slug(categoryName);

    // Tab header: blurb + clear count
    const clearedCount = missionsToRender.filter(m => ranksOf(m).some(r => isCleared(m.id, r))).length;
    const head = document.createElement('div');
    head.className = 'mission-list-head';
    head.innerHTML = `
      <span class="mlh-blurb">${esc(TAB_BLURB[categoryName] || '')}</span>
      <span class="jjk-chip mlh-count">${clearedCount} / ${missionsToRender.length} cleared</span>`;
    listContainer.appendChild(head);

    missionsToRender.forEach(mission => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mission-card';
      card.dataset.missionId = mission.id;

      const isLocked = !isRequirementMet(mission);
      if (isLocked) card.classList.add('mission-locked');
      if (mission.giant) card.classList.add('mission-card--boss'); // Boss Battles (data/bosses.json)
      const ranks = ranksOf(mission);
      const allClear = ranks.length > 0 && ranks.every(r => isCleared(mission.id, r));
      if (allClear) card.classList.add('mission-complete');

      const { kicker, title } = cardTitle(mission);
      const own = hasOwnBanner(mission);
      const pips = ranks.map(r => {
        const clear = isCleared(mission.id, r), open = isRankOpen(mission, r);
        const state = clear ? 'Cleared' : open ? 'Open' : 'Locked';
        return `<i class="mc-pip ${clear ? 'is-clear' : ''} ${open ? '' : 'is-locked'}" title="${esc(rankLabel(mission, r))} · ${state}">${rankIcon(r)}</i>`;
      }).join('');
      const r0 = defaultRank(mission);
      const lockNote = isLocked ? `<span class="mc-lock"><img src="assets/ui/jjk/medal_locked.webp" alt=""><span class="mission-lock-note">${esc(requirementText(mission))}</span></span>` : '';

      if (own) {
        card.classList.add('mission-card--banner');
        card.setAttribute('aria-label', `${kicker ? kicker + ' ' : ''}${title}${isLocked ? ' (locked)' : allClear ? ' (cleared)' : ''}`);
      }
      card.innerHTML = `
        ${bannerArt(mission)}
        ${own ? '' : `<div class="mc-text">
          <span class="mc-kicker">${esc(kicker)}</span>
          <span class="mc-title">${esc(title)}</span>
        </div>`}
        <div class="mc-meta">
          <span class="mc-pips">${pips}</span>
          <span class="mc-stat" title="Stamina"><i class="ic-stamina"></i>${esc(mission.stamina?.[r0] ?? '-')}</span>
          <span class="mc-stat" title="Recommended power"><i class="ic-power"></i>${esc(((mission.power?.[r0] || 0) / 1000).toFixed(1))}k</span>
        </div>
        ${allClear ? '<img class="mc-stamp" src="assets/ui/jjk/stamp_claimed.webp" alt="Cleared">' : ''}
        ${isLocked && !own ? lockNote : ''}`;
      // banner cards: the lock reason sits in the bar, clear of the lettering
      if (isLocked && own) card.querySelector('.mc-pips').outerHTML = lockNote;
      card.addEventListener('click', () => openDetail(mission));
      listContainer.appendChild(card);
    });

    // Highlight selected category tab
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.name === categoryName);
    });
    revealActiveTab();
    try { sessionStorage.setItem('missions_tab', categoryName); } catch { /* ignore */ }
    // New category starts at the top of its list
    if (scroller) scroller.scrollTop = 0;
  }

  /* --------------------------- detail sheet -------------------------- */
  let modal = null;
  function onKey(e) { if (e.key === 'Escape') closeDetail(); }
  function closeDetail() {
    if (!modal) return;
    modal.remove(); modal = null;
    document.removeEventListener('keydown', onKey);
  }

  function openDetail(mission, rank) {
    loadProgress();
    closeDetail();
    const ranks = ranksOf(mission);
    let selected = rank && ranks.includes(rank) ? rank : defaultRank(mission);

    modal = document.createElement('div');
    modal.className = 'mission-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', mission.name);
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey);

    const cast = mission.cast || {};
    const who = (id) => cast[id] || { name: id, portrait: 'assets/characters/common/silhouette.png' };

    const paint = () => {
      const stages = mission.difficulties?.[selected] || [];
      const open = isRankOpen(mission, selected);
      const cleared = isCleared(mission.id, selected);
      const clear = mission.clearRewards?.[selected] || {};
      const repeat = mergeMaps(...stages.map(s => s.rewards || {}), clear.completion || {});
      const waves = stages.reduce((n, s) => n + (s.waves?.length || 0), 0);

      const rankBtns = ranks.map(r => {
        const rOpen = isRankOpen(mission, r), rClear = isCleared(mission.id, r);
        const state = rClear ? ', cleared' : rOpen ? '' : ', locked';
        return `
        <button type="button" class="difficulty-icon-btn md-rank ${r === selected ? 'active' : ''} ${rOpen ? '' : 'is-locked'} ${rClear ? 'is-clear' : ''}" data-difficulty="${esc(r)}" aria-pressed="${r === selected}" aria-label="${esc(rankLabel(mission, r))}${state}">
          <span class="md-rank-letter">${rankIcon(r)}</span>
          <span class="md-rank-name">${esc(mission.rankNames?.[r] || 'Rank')}</span>
        </button>`;
      }).join('');

      const stageRows = stages.map((s, i) => {
        // one chip per distinct enemy, boss last
        const seen = new Map();
        (s.waves || []).forEach(w => (w.enemies || []).forEach(e => {
          const id = typeof e === 'string' ? e : e.id;
          const boss = !!(e && e.boss);
          const k = id + (boss ? '*' : '');
          seen.set(k, { id, boss, n: (seen.get(k)?.n || 0) + 1 });
        }));
        const chips = [...seen.values()].sort((a, b) => a.boss - b.boss).map(e => `
          <span class="md-foe ${e.boss ? 'is-boss' : ''}" title="${esc(who(e.id).name)}${e.boss ? ' (Boss)' : ''}">
            <img src="${esc(who(e.id).portrait)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/characters/common/silhouette.png'">
            ${e.n > 1 ? `<b>×${e.n}</b>` : ''}
          </span>`).join('');
        const nW = (s.waves || []).length;
        return `
          <li class="md-stage ${s.boss ? 'is-boss-stage' : ''}">
            <span class="md-stage-no">${i + 1}</span>
            <span class="md-stage-body">
              <span class="md-stage-title">${esc(s.title || `Stage ${i + 1}`)}${s.boss && i === stages.length - 1 ? '<em>Boss</em>' : ''}</span>
              <span class="md-stage-sub">${nW} wave${nW === 1 ? '' : 's'}${s.boss ? ' · ' + esc(who(s.boss).name) : ''}</span>
            </span>
            <span class="md-foes">${chips}</span>
            <span class="md-drops">${rewardTiles(s.rewards, 'is-mini')}</span>
          </li>`;
      }).join('');

      let lockText = '';
      if (!isRequirementMet(mission)) {
        lockText = requirementText(mission) + ' first.';
      } else if (!open) {
        const prev = ranks[ranks.indexOf(selected) - 1];
        lockText = `Clear ${rankLabel(mission, prev)} to unlock ${rankLabel(mission, selected)}.`;
      }

      modal.innerHTML = `
        <div class="md-backdrop" data-close></div>
        <div class="md-sheet jjk-panel">
          <button type="button" class="jjk-icon-btn md-close" data-close aria-label="Close"><img src="assets/ui/jjk/back_arrow.webp" alt=""></button>
          <div class="md-side">
            <div class="md-hero${mission.giant ? ' mission-card--boss' : ''}${hasOwnBanner(mission) ? ' md-hero--banner' : ''}">
              ${bannerArt(mission)}
              ${hasOwnBanner(mission) ? '' : `<div class="mc-text">
                <span class="mc-kicker">${esc(cardTitle(mission).kicker)}</span>
                <span class="mc-title">${esc(cardTitle(mission).title)}</span>
              </div>`}
            </div>
            <p class="md-desc">${esc(mission.description || '')}</p>
            <div class="md-ranks difficulty-icons-container">${rankBtns}</div>
            <div class="md-facts">
              <span class="jjk-chip"><i class="ic-stamina"></i>Stamina ${esc(mission.stamina?.[selected] ?? '-')}</span>
              <span class="jjk-chip"><i class="ic-power"></i>Rec. Power ${fmt(mission.power?.[selected])}</span>
              <span class="jjk-chip">${stages.length} stage${stages.length === 1 ? '' : 's'} · ${waves} waves</span>
              <span class="jjk-chip">Player EXP +${RANK_EXP[selected] || 50}</span>
            </div>
            <div class="md-rewards">
              <div class="md-rw-block ${cleared ? 'is-claimed' : ''}">
                <span class="md-label">First Clear${cleared ? ' · Claimed' : ''}</span>
                <div class="md-tiles">${rewardTiles(clear.firstTime) || '<span class="md-none">—</span>'}</div>
              </div>
              <div class="md-rw-block">
                <span class="md-label">Every Clear</span>
                <div class="md-tiles">${rewardTiles(repeat) || '<span class="md-none">—</span>'}</div>
              </div>
            </div>
            <div class="md-go">
              ${lockText ? `<span class="mission-lock-note">${esc(lockText)}</span>` : ''}
              <button type="button" class="start-btn" ${open ? '' : 'disabled'}>${open ? 'Start Mission' : 'Locked'}</button>
            </div>
          </div>
          <div class="md-main">
            <span class="md-label">Stages · ${esc(rankLabel(mission, selected))}</span>
            <ol class="md-stages">${stageRows}</ol>
          </div>
        </div>`;

      modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeDetail));
      modal.querySelectorAll('.md-rank').forEach(btn => btn.addEventListener('click', () => {
        selected = btn.dataset.difficulty;
        paint();
      }));
      modal.querySelector('.start-btn').addEventListener('click', () => {
        if (!isRankOpen(mission, selected)) return;
        localStorage.setItem('currentMissionId', String(mission.id));
        localStorage.setItem('currentDifficulty', selected);
        localStorage.setItem('currentMissionName', mission.name || '');
        localStorage.setItem('currentMissionBanner', mission.banner || '');

        // Fade transition
        document.body.style.transition = 'opacity 0.25s linear';
        document.body.style.opacity = '0';
        setTimeout(() => {
          window.location.href = 'teams.html?mode=prebattle';
        }, 250);
      });
    };
    paint();
  }

  /* ------------------------------------------------------------------
   * Tab row (horizontally scrollable on phones): .fade-l / .fade-r tell
   * css/mobile.css to soft-fade that edge only while more tabs are hidden
   * past it, and the selected tab is slid clear of the fades.
   * ------------------------------------------------------------------ */
  let tabFadeRaf = 0;
  function updateTabFade() {
    tabFadeRaf = 0;
    const max = tabsContainer.scrollWidth - tabsContainer.clientWidth;
    const x = tabsContainer.scrollLeft;
    tabsContainer.classList.toggle('fade-l', max > 1 && x > 1);
    tabsContainer.classList.toggle('fade-r', max > 1 && x < max - 1);
  }
  function scheduleTabFade() {
    if (!tabFadeRaf) tabFadeRaf = requestAnimationFrame(updateTabFade);
  }
  let tabsPlaced = false;
  function revealActiveTab() {
    const tab = tabsContainer.querySelector('.tab-btn.active');
    const max = tabsContainer.scrollWidth - tabsContainer.clientWidth;
    if (!tab || max <= 1) return;
    const box = tabsContainer.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    // centre the tab in the row (clamped to the scroll range)
    const target = tabsContainer.scrollLeft + (r.left - box.left) - (box.width - r.width) / 2;
    tabsContainer.scrollTo({
      left: Math.max(0, Math.min(max, target)),
      behavior: tabsPlaced ? 'smooth' : 'auto'
    });
    tabsPlaced = true;
  }

  /**
   * Load mission data from JSON
   */
  fetch('data/missions.json')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(missions => {
      allMissions = Array.isArray(missions) ? missions : [];

      if (allMissions.length === 0) {
        listContainer.innerHTML = '<p class="error-message">No missions found.</p>';
        return;
      }

      // Tabs: TAB_ORDER first, then any other category in data order
      const inData = [...new Set(allMissions.map(m => m.category || 'Other'))];
      const categoryNames = [
        ...TAB_ORDER.filter(n => inData.includes(n)),
        ...inData.filter(n => !TAB_ORDER.includes(n))
      ];

      // Build tabs
      tabsContainer.innerHTML = '';
      categoryNames.forEach(name => {
        const tab = document.createElement('button');
        tab.className = 'tab-btn';
        tab.dataset.name = name;
        // slug used by CSS to tint each category (see .tab-btn[data-category])
        tab.dataset.category = slug(name);
        tab.innerHTML = `<span class="tab-label">${esc(name)}</span>`;
        tab.addEventListener('click', () => renderMissionsForCategory(name));
        tabsContainer.appendChild(tab);
      });

      // Edge fades follow the tab row's scroll position (mobile row scrolls)
      tabsContainer.addEventListener('scroll', scheduleTabFade, { passive: true });
      window.addEventListener('resize', scheduleTabFade);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleTabFade);

      // Reopen the last tab of this session (e.g. back from a battle)
      let first = categoryNames[0];
      try {
        const saved = sessionStorage.getItem('missions_tab');
        if (saved && categoryNames.includes(saved)) first = saved;
      } catch { /* ignore */ }
      renderMissionsForCategory(first);
      updateTabFade();
    })
    .catch(err => {
      console.error('Mission load failed:', err);
      listContainer.innerHTML = '<p class="error-message">Failed to load missions.</p>';
    });
});
