/* Skill preview for the character screen (Ninjutsu tab ▶ buttons).
 *
 *   SkillPreview.open({ charId, kind, name, art: { full, portrait }, base })
 *     kind: jutsu | ultimate | secret
 *
 * Opens a full-screen stage and plays, in order:
 *   1. the battle cut-in (BattleCutin, forced on regardless of the battle toggle)
 *   2. the unit's attack spritesheet for that skill (SpritePlayer), if it has one,
 *      else the skill's video (jutsuAnimation / ultimateAnimation / secretAnimation),
 *      else just the full art.
 * Replay runs it again; Close, Esc or a backdrop tap dismisses it.
 * Styles: css/skill-preview.css
 */
(() => {
  "use strict";

  const KICKER = { jutsu: 'Jutsu', ultimate: 'Ultimate', secret: 'Secret Technique' };
  // Sprite sheets to try per skill, first one that exists wins.
  const SHEETS = { jutsu: ['jutsu'], ultimate: ['ultimate'], secret: ['secret', 'ultimate'] };
  const VIDEO_KEYS = { jutsu: ['jutsuAnimation'], ultimate: ['ultimateAnimation'], secret: ['secretAnimation', 'ultimateAnimation'] };
  const SILHOUETTE = 'assets/characters/_common/silhouette.png';

  let overlay = null;
  let run = 0;          // bumps on every play/close so stale async steps bail out
  let sprite = null;
  let ctx = null;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function build() {
    const el = document.createElement('div');
    el.className = 'sp-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <div class="sp-backdrop"></div>
      <div class="sp-stage">
        <img class="sp-art" alt="" draggable="false">
        <div class="sp-actor"></div>
        <video class="sp-video" playsinline muted preload="auto"></video>
        <div class="sp-ground"></div>
      </div>
      <header class="sp-head">
        <span class="sp-chip"></span>
        <h3 class="sp-name"></h3>
      </header>
      <div class="sp-controls">
        <button type="button" class="sp-btn sp-replay"><span class="sp-btn-ico" aria-hidden="true"></span>Replay</button>
        <button type="button" class="sp-btn sp-close">Close</button>
      </div>
      <div class="sp-cutin-host"></div>`;
    el.querySelector('.sp-backdrop').addEventListener('click', close);
    el.querySelector('.sp-close').addEventListener('click', close);
    el.querySelector('.sp-replay').addEventListener('click', () => play());
    document.body.appendChild(el);
    return el;
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function videoFor(base, kind) {
    for (const k of VIDEO_KEYS[kind] || []) {
      const v = base?.[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    const skill = base?.skills?.[kind];
    const v = skill?.animation || skill?.animationGif || skill?.video;
    return typeof v === 'string' && /\.(mp4|webm)$/i.test(v) ? v : '';
  }

  function resetStage() {
    if (sprite) { sprite.destroy(); sprite = null; }
    const v = overlay.querySelector('.sp-video');
    v.pause();
    v.removeAttribute('src');
    v.load();
    overlay.classList.remove('is-sprite', 'is-video', 'is-art', 'is-done');
    overlay.querySelector('.sp-cutin-host').innerHTML = '';
    window.BattleCutin?.cancel?.();
  }

  // Resolves true once the sheet has played, false if the unit has no such sheet.
  async function playSprite(my) {
    const SP = window.SpritePlayer;
    if (!SP || !ctx.charId || !SP.has(ctx.charId)) return false;
    const base = SP.pathFor(ctx.charId);
    for (const name of SHEETS[ctx.kind] || []) {
      try { await SP.preload(base, name); } catch { continue; }
      if (my !== run) return true;
      const actor = overlay.querySelector('.sp-actor');
      const h = Math.round(Math.min(window.innerHeight * 0.5, 320));
      sprite = SP.create(actor, base, { height: h });
      overlay.classList.add('is-sprite');
      await sprite.play(name);
      if (my !== run) return true;
      // settle on idle when the unit has one
      try { await SP.preload(base, 'idle'); if (my === run) sprite.play('idle'); } catch { /* no idle sheet */ }
      return true;
    }
    return false;
  }

  function playVideo(my) {
    const src = videoFor(ctx.base, ctx.kind);
    if (!src) return Promise.resolve(false);
    const v = overlay.querySelector('.sp-video');
    return new Promise(resolve => {
      const done = ok => { v.onended = v.onerror = null; resolve(ok); };
      v.onended = () => done(true);
      v.onerror = () => { overlay.classList.remove('is-video'); done(false); };
      v.src = src;
      overlay.classList.add('is-video');
      v.play().catch(() => { if (my === run) { overlay.classList.remove('is-video'); done(false); } });
    });
  }

  async function play() {
    if (!overlay || !ctx) return;
    const my = ++run;
    resetStage();

    const unit = { isPlayer: true, full: ctx.art.full, portrait: ctx.art.portrait };
    if (window.BattleCutin) {
      try {
        await window.BattleCutin.play(unit, ctx.kind, ctx.name, { force: true, host: overlay.querySelector('.sp-cutin-host') });
      } catch (e) { console.warn('[SkillPreview] cut-in failed', e); }
    }
    if (my !== run) return;

    let shown = await playSprite(my);
    if (my !== run) return;
    if (!shown) shown = await playVideo(my);
    if (my !== run) return;
    if (!shown) overlay.classList.add('is-art');
    overlay.classList.add('is-done');
  }

  function open({ charId, kind, name, art, base }) {
    if (!KICKER[kind]) return;
    ctx = {
      charId, kind, base,
      name: String(name || KICKER[kind]),
      art: { full: art?.full || art?.portrait || SILHOUETTE, portrait: art?.portrait || art?.full || SILHOUETTE },
    };
    overlay = overlay || build();
    overlay.className = `sp-overlay sp-${kind}`;
    const pic = overlay.querySelector('.sp-art');
    pic.onerror = () => { pic.onerror = null; pic.src = ctx.art.portrait; };
    pic.src = ctx.art.full;
    overlay.querySelector('.sp-chip').textContent = KICKER[kind];
    overlay.querySelector('.sp-name').innerHTML = esc(ctx.name);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    play();
  }

  function close() {
    if (!overlay) return;
    run++;
    resetStage();
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    ctx = null;
  }

  window.SkillPreview = { open, close };
})();
