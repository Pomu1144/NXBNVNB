// js/story-dialogue.js — story scenes for story missions (Shinobi Chronicles).
//
// A dimmed stage, character art on the left / right, a speech box with the
// speaker's name plate, typed-out text. Tap / click / Space / Enter: the first
// press finishes the line, the next one advances. Skip (or Esc) ends the scene.
//
//   StoryDialogue.play(lines, { bg, cast, onDone })  -> Promise<{ skipped }>
//     line: { who?, speaker?, charId?, portrait?, side: 'left'|'right'|'none', text, bg? }
//       who      key into the cast table (data/story-dialogue.json "cast")
//       speaker  display name (overrides the cast name)
//       charId   character id; art from mission cast or assets/characters/<id>/
//       portrait explicit image path
//       side     'none' (or no speaker) = narration, both actors dimmed
//   StoryDialogue.playFor(mission, part, { force, bg })  -> Promise<{ played, skipped }>
//     part: 'before' | 'boss' | 'after'. Plays the mission's script (or a
//     generic one built from its name / enemies) once; seen ids are kept in
//     localStorage 'blazing_story_seen_v1'. force: true replays.
//   StoryDialogue.isStory(mission), .hasScript(mission, part), .load()
(() => {
  'use strict';
  if (window.StoryDialogue) return;

  const DATA_URL = 'data/story-dialogue.json';
  const SEEN_KEY = 'blazing_story_seen_v1';
  const SILHOUETTE = 'assets/characters/common/silhouette.png';
  const TYPE_MS = 24;              // per character
  const TIERS = ['3S', '4S', '5S', '2S', '1S', '6S', '6SB', '7S'];

  const reduced = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  };

  /* ------------------------------ data ------------------------------ */
  let dataPromise = null;
  function load() {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
        .then(d => d || { cast: {}, missions: {} });
    }
    return dataPromise;
  }

  const isStory = (m) => !!m && /^Shinobi Chronicles/i.test(String(m.category || ''));

  /* ------------------------------ seen ------------------------------ */
  function seenSet() {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
  }
  const seenId = (missionId, part) => `${missionId}:${part}`;
  function isSeen(missionId, part) { return seenSet().has(seenId(missionId, part)); }
  function markSeen(missionId, part) {
    try {
      const s = seenSet(); s.add(seenId(missionId, part));
      localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
    } catch { /* storage blocked */ }
  }

  /* ---------------------------- scripts ----------------------------- */
  function firstStageMap(mission, rank) {
    const d = mission && mission.difficulties;
    if (!d) return null;
    const stages = d[rank] || d[Object.keys(d)[0]] || [];
    return (stages[0] && stages[0].map) || null;
  }
  function lastStageMap(mission, rank) {
    const d = mission && mission.difficulties;
    if (!d) return null;
    const stages = d[rank] || d[Object.keys(d)[0]] || [];
    const s = stages[stages.length - 1];
    return (s && s.map) || firstStageMap(mission, rank);
  }

  // A plain scene for story missions without an authored script, built from
  // the mission's own name, description and featured / boss enemy.
  function genericScript(mission, part) {
    const cast = mission.cast || {};
    const d = mission.difficulties || {};
    const stages = d[Object.keys(d)[0]] || [];
    const bossId = mission.feature || (stages[stages.length - 1] || {}).boss || Object.keys(cast)[0];
    const boss = bossId && cast[bossId] ? { speaker: cast[bossId].name, charId: bossId } : null;
    const hero = { speaker: 'Naruto', charId: 'naruto_001' };
    if (part === 'before') {
      const lines = [];
      if (mission.description) lines.push({ side: 'none', text: mission.description });
      else lines.push({ side: 'none', text: mission.name || 'A new mission begins.' });
      if (boss) lines.push({ ...boss, side: 'right', text: 'So you came. Let\'s see if you can back it up.' });
      lines.push({ ...hero, side: 'left', text: 'Stand aside. I\'m not losing here!' });
      return lines;
    }
    if (part === 'boss') {
      if (!boss) return [];
      return [
        { ...boss, side: 'right', text: 'Enough games. I\'ll deal with you myself.' },
        { ...hero, side: 'left', text: 'Bring it on!' }
      ];
    }
    if (part === 'after') {
      return [{ ...hero, side: 'left', text: `${mission.name || 'The mission'}: done. On to the next one!` }];
    }
    return [];
  }

  async function scriptFor(mission, part) {
    if (!mission) return [];
    const data = await load();
    const own = data.missions && data.missions[mission.id];
    if (own) return Array.isArray(own[part]) ? own[part] : [];
    return isStory(mission) ? genericScript(mission, part) : [];
  }
  async function hasScript(mission, part) {
    return (await scriptFor(mission, part)).length > 0;
  }

  /* ----------------------------- actors ----------------------------- */
  // Resolve a line to { name, srcs[] } — image candidates tried in order.
  function resolveActor(line, cast, missionCast) {
    const c = (line.who && cast && cast[line.who]) || null;
    const name = line.speaker || (c && c.name) || '';
    const srcs = [];
    const add = (s) => { if (s && !srcs.includes(s)) srcs.push(s); };
    // Cut-out art (assets/story/<id>_<tier>.webp, card scenery removed)
    // comes first; the card art is the fallback.
    const push = (s) => {
      const m = s && /assets\/characters\/([^/]+)\/(?:full|portrait)_([0-9A-Z]+)\.(?:png|webp)$/.exec(s);
      if (m) add(`assets/story/${m[1]}_${m[2]}.webp`);
      add(s);
    };
    push(line.portrait);
    if (c) { push(c.full); push(c.portrait); }
    const id = line.charId || (c && c.id);
    if (id) {
      const mc = missionCast && missionCast[id];
      if (mc && mc.portrait) { push(mc.portrait.replace('/portrait_', '/full_')); push(mc.portrait); }
      if (!c && !mc) TIERS.forEach(t => push(`assets/characters/${id}/full_${t}.webp`));
    }
    push(SILHOUETTE);
    const key = (c && (c.id || line.who)) || id || line.portrait || name;
    return { name, srcs, key };
  }

  function setActorImage(img, srcs) {
    let i = 0;
    img.onerror = () => {
      i += 1;
      if (i < srcs.length) img.src = srcs[i];
      else { img.onerror = null; img.removeAttribute('src'); img.closest('.sd-actor')?.classList.add('is-empty'); }
    };
    img.closest('.sd-actor')?.classList.remove('is-empty');
    img.src = srcs[0];
  }

  /* ------------------------------ play ------------------------------ */
  let active = null;

  function play(lines, opts = {}) {
    const list = (Array.isArray(lines) ? lines : []).filter(l => l && l.text);
    if (!list.length) {
      const res = { skipped: false, played: false };
      try { opts.onDone && opts.onDone(res); } catch (e) { console.error(e); }
      return Promise.resolve(res);
    }
    if (active) active.finish(true);

    return new Promise((resolve) => {
      const rm = reduced();
      const root = document.createElement('div');
      root.className = 'sd-root' + (rm ? ' sd-reduced' : '');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', opts.title || 'Story');
      root.innerHTML = `
        <div class="sd-bg"></div>
        <div class="sd-shade"></div>
        <figure class="sd-actor is-left is-empty" aria-hidden="true"><img alt="" draggable="false"></figure>
        <figure class="sd-actor is-right is-empty" aria-hidden="true"><img alt="" draggable="false"></figure>
        <button type="button" class="sd-skip">Skip<span aria-hidden="true">&#9656;&#9656;</span></button>
        <div class="sd-box">
          <div class="sd-name" hidden><span></span></div>
          <p class="sd-text" aria-live="polite"></p>
          <i class="sd-next" aria-hidden="true">&#9660;</i>
        </div>`;
      document.body.appendChild(root);

      const $ = (s) => root.querySelector(s);
      const bgEl = $('.sd-bg'), box = $('.sd-box'), nameEl = $('.sd-name'), nameTxt = $('.sd-name span');
      const textEl = $('.sd-text');
      const actors = { left: $('.sd-actor.is-left'), right: $('.sd-actor.is-right') };
      const onStage = { left: null, right: null };

      let bgNow = null;
      const setBg = (src) => {
        if (!src || src === bgNow) return;
        bgNow = src;
        bgEl.style.backgroundImage = `url("${String(src).replace(/"/g, '%22')}")`;
      };
      setBg(opts.bg);

      let idx = -1, typing = false, timer = 0, full = '', shown = 0, done = false;

      const stopType = () => { clearTimeout(timer); timer = 0; typing = false; };
      const typeStep = () => {
        shown = Math.min(full.length, shown + 1);
        textEl.textContent = full.slice(0, shown);
        if (shown >= full.length) { stopType(); box.classList.add('is-ready'); return; }
        const ch = full[shown - 1];
        const pause = /[.!?…]/.test(ch) ? TYPE_MS * 6 : /[,;:—]/.test(ch) ? TYPE_MS * 3 : TYPE_MS;
        timer = setTimeout(typeStep, pause);
      };

      function show(i) {
        idx = i;
        const line = list[i];
        if (line.bg) setBg(line.bg);
        const narr = line.side === 'none' || (!line.who && !line.speaker && !line.charId && !line.portrait);
        const side = line.side === 'right' ? 'right' : 'left';

        if (!narr) {
          const a = resolveActor(line, opts.cast, opts.missionCast);
          const fig = actors[side];
          if (onStage[side] !== a.key) {
            onStage[side] = a.key;
            fig.classList.remove('is-in');
            void fig.offsetWidth;            // restart the entry animation
            setActorImage(fig.querySelector('img'), a.srcs);
            fig.classList.add('is-in');
          }
          nameTxt.textContent = a.name;
          nameEl.hidden = !a.name;
        } else {
          nameEl.hidden = true;
        }
        actors.left.classList.toggle('is-speaking', !narr && side === 'left');
        actors.right.classList.toggle('is-speaking', !narr && side === 'right');
        root.classList.toggle('is-narration', narr);
        box.classList.toggle('is-right', !narr && side === 'right');
        box.classList.toggle('is-narration', narr);
        box.classList.remove('is-ready');

        full = String(line.text);
        stopType();
        if (rm) { shown = full.length; textEl.textContent = full; box.classList.add('is-ready'); return; }
        shown = 0; textEl.textContent = ''; typing = true;
        timer = setTimeout(typeStep, 60);
      }

      function advance() {
        if (done) return;
        if (typing) { stopType(); shown = full.length; textEl.textContent = full; box.classList.add('is-ready'); return; }
        if (idx + 1 < list.length) show(idx + 1);
        else finish(false);
      }

      function finish(skipped) {
        if (done) return;
        done = true;
        stopType();
        document.removeEventListener('keydown', onKey, true);
        if (active && active.root === root) active = null;
        const res = { skipped: !!skipped, played: true };
        const out = () => {
          root.remove();
          try { opts.onDone && opts.onDone(res); } catch (e) { console.error(e); }
          resolve(res);
        };
        if (rm) out();
        else { root.classList.add('is-leaving'); setTimeout(out, 220); }
      }

      function onKey(e) {
        if (done) return;
        const k = e.key;
        if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
          if (e.target && e.target.closest && e.target.closest('.sd-skip') && k === 'Enter') return; // native click
          e.preventDefault(); e.stopPropagation(); advance();
        } else if (k === 'Escape') {
          e.preventDefault(); e.stopPropagation(); finish(true);
        } else {
          e.stopPropagation();
        }
      }

      $('.sd-skip').addEventListener('click', (e) => { e.stopPropagation(); finish(true); });
      root.addEventListener('click', (e) => {
        if (e.target.closest('.sd-skip')) return;
        advance();
      });
      // Keep touches from reaching the page underneath (scroll routers etc.)
      ['touchstart', 'touchmove', 'wheel'].forEach(t => root.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
      document.addEventListener('keydown', onKey, true);

      active = { root, finish };
      requestAnimationFrame(() => root.classList.add('is-open'));
      show(0);
    });
  }

  async function playFor(mission, part, opts = {}) {
    if (!mission) return { played: false, skipped: false };
    if (!opts.force && isSeen(mission.id, part)) return { played: false, skipped: false };
    const [data, lines] = await Promise.all([load(), scriptFor(mission, part)]);
    if (!lines.length) return { played: false, skipped: false };
    const bg = opts.bg || (part === 'before' ? firstStageMap(mission, opts.rank) : lastStageMap(mission, opts.rank));
    const res = await play(lines, { bg, cast: data.cast, missionCast: mission.cast, title: mission.name });
    if (!opts.force) markSeen(mission.id, part);
    return res;
  }

  // Replay a mission's whole story (before, boss, after) back to back.
  async function replay(mission, opts = {}) {
    for (const part of ['before', 'boss', 'after']) {
      const r = await playFor(mission, part, { ...opts, force: true });
      if (r.skipped) break;
    }
  }

  window.StoryDialogue = { play, playFor, replay, load, isStory, hasScript, isSeen, markSeen, SEEN_KEY };
})();
