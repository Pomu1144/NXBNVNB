/* Link combos (Blazing style).
 *
 * When the player drops a unit to attack (normal attack, jutsu or ultimate),
 * every other ally standing close to the struck enemy joins in first: one
 * after another they dash in and land their normal attack on it, then the
 * dragged unit finishes with its own action.
 *
 *   ally A attack → ally B attack → dragged unit's attack / jutsu / ultimate
 *
 * - Linked allies don't spend their turn; their hits give chakra as usual.
 * - Each link adds LINK_STEP to the damage of every hit that follows it
 *   (the finisher gets the full bonus), shown by a "N LINK" counter.
 * - Allies who can't act (stunned, KO, benched) or are mid-action sit out.
 * - While dragging, allies that would link light up (.is-link-ready).
 *
 * BattleDrag.dropAt calls BattleLinkCombo.chain(); this file wraps
 * BattleCombat.calculateDamage for the bonus. Load after battle-sprite-attack.js.
 */
(() => {
  "use strict";

  const LINK_STEP = 0.1;       // +10% damage per ally already linked
  const MAX_LINKS = 4;         // at most this many allies join one attack
  const RADIUS_H = 0.42;       // link reach, as a share of the scene height
  const FAILSAFE_MS = 6000;    // per ally, in case an attack never calls back

  const alive = u => !!(u && u.stats && u.stats.hp > 0);

  const BattleLinkCombo = {
    enabled: true,
    LINK_STEP,

    /** On the field right now (in the turn order, not a backup). */
    onField(u, core) {
      return !u.isBench && (!core.combatants || core.combatants.includes(u));
    },

    /** Allies close enough to `target` to join `unit`'s attack, nearest first. */
    findLinks(unit, target, core) {
      if (!this.enabled || !unit?.isPlayer || !alive(target) || !target.pos) return [];
      const rect = core.dom?.scene?.getBoundingClientRect();
      if (!rect || !rect.width) return [];
      const reach = rect.height * RADIUS_H;
      const px = p => ({ x: (p.x / 100) * rect.width, y: (p.y / 100) * rect.height });
      const t = px(target.pos);
      return (core.activeTeam || [])
        .filter(u => u && u !== unit && alive(u) && u.pos && this.onField(u, core)
          && !u._actionBusy && !window.BattleBuffs?.cannotAct?.(u))
        .map(u => { const p = px(u.pos); return { u, d: Math.hypot(p.x - t.x, p.y - t.y) }; })
        .filter(e => e.d <= reach)
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_LINKS)
        .map(e => e.u);
    },

    /** Drag preview: ring the allies that would link on this drop. */
    markLinks(unit, pred, core) {
      const scene = core.dom?.scene;
      if (!scene) return;
      const want = new Set(pred?.action && pred.action !== "move" && pred.main?.length
        ? this.findLinks(unit, pred.main[0], core).map(u => String(u.id)) : []);
      scene.querySelectorAll(".battle-unit.is-link-ready").forEach(el => {
        if (!want.has(el.dataset.unitId)) el.classList.remove("is-link-ready");
      });
      want.forEach(id => scene.querySelector(`.battle-unit[data-unit-id="${id}"]`)?.classList.add("is-link-ready"));
    },

    clearMarks(core) {
      core?.dom?.scene?.querySelectorAll(".battle-unit.is-link-ready")
        .forEach(el => el.classList.remove("is-link-ready"));
    },

    /** "N LINK" counter over the target; pass the previous element back to update it. */
    showCounter(target, n, core, el) {
      const layer = core.dom?.damageLayer, scene = core.dom?.scene;
      const tEl = scene?.querySelector(`.battle-unit[data-unit-id="${target.id}"]`);
      if (!layer || !tEl) return el;
      if (!el) {
        el = document.createElement("div");
        el.className = "link-combo-counter";
        el.innerHTML = '<b></b><span>LINK</span>';
        layer.appendChild(el);
      }
      const r = tEl.getBoundingClientRect(), s = scene.getBoundingClientRect();
      el.style.left = `${r.left - s.left + r.width / 2}px`;
      el.style.top = `${r.top - s.top}px`;
      el.querySelector("b").textContent = n;
      el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
      return el;
    },

    /**
     * Run the link chain on `targets[0]`, then `finish()` (the dragged unit's
     * own action). Returns false when nobody links, so the caller just
     * fires its action as before.
     */
    chain(unit, targets, core, finish) {
      const C = window.BattleCombat;
      const primary = targets?.[0];
      const links = C?.performAttack ? this.findLinks(unit, primary, core) : [];
      if (!links.length) return false;
      this.clearMarks(core);

      const prevBusy = unit._actionBusy;
      unit._actionBusy = true; // turn watchdogs wait while allies attack
      let counter = null;

      (async () => {
        let n = 0;
        for (const ally of links) {
          // Keep hitting the primary; if it fell, move to another drop target.
          const target = alive(primary) ? primary : targets.find(alive);
          if (!target || !alive(ally) || window.BattleBuffs?.cannotAct?.(ally)) continue;
          ally._comboBoost = 1 + n * LINK_STEP;
          await new Promise(resolve => {
            const guard = setTimeout(resolve, FAILSAFE_MS);
            try {
              C.performAttack(ally, target, core, () => { clearTimeout(guard); resolve(); });
            } catch (e) {
              console.error("[LinkCombo] link attack failed", e);
              clearTimeout(guard); resolve();
            }
          });
          delete ally._comboBoost;
          n++;
          counter = this.showCounter(target, n, core, counter);
          if (!targets.some(alive)) break;
        }
        unit._actionBusy = prevBusy || false;
        setTimeout(() => counter?.remove(), 1400);
        if (!targets.some(alive)) { finish({ targetsDown: true }); return; }
        unit._comboBoost = 1 + n * LINK_STEP;
        finish({ links: n });
      })();
      return true;
    },

    install() {
      const C = window.BattleCombat;
      if (!C?.calculateDamage || C.calculateDamage._linkCombo) return;
      const orig = C.calculateDamage;
      C.calculateDamage = function (attacker, defender, multiplier = 1, ...rest) {
        const boost = attacker?._comboBoost;
        if (boost && boost !== 1) {
          const m = typeof multiplier === "string" ? parseFloat((multiplier.match(/[\d.]+/) || [1])[0]) : Number(multiplier) || 1;
          multiplier = m * boost;
        }
        return orig.call(this, attacker, defender, multiplier, ...rest);
      };
      C.calculateDamage._linkCombo = true;
    },
  };

  window.BattleLinkCombo = BattleLinkCombo;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => BattleLinkCombo.install());
  } else {
    BattleLinkCombo.install();
  }

  const style = document.createElement("style");
  style.textContent = `
    .battle-unit.is-link-ready .unit-sprite,
    .battle-unit.is-link-ready .sprite-player {
      filter: drop-shadow(0 0 6px rgba(240, 200, 110, .95)) drop-shadow(0 0 2px rgba(255, 236, 180, .9));
    }
    .link-combo-counter {
      position: absolute; z-index: 520; pointer-events: none;
      transform: translate(-50%, -115%);
      display: flex; align-items: baseline; gap: 4px;
      font-family: var(--jjk-font, "Kaisei Tokumin", serif);
      color: #f3d27a; text-shadow: 0 2px 4px rgba(0,0,0,.85), 0 0 8px rgba(0,0,0,.6);
      white-space: nowrap;
    }
    .link-combo-counter b { font-size: 1.7rem; line-height: 1; font-weight: 800; }
    .link-combo-counter span { font-size: .78rem; letter-spacing: .14em; font-weight: 700; }
    .link-combo-counter.pop { animation: linkComboPop .32s ease-out; }
    @keyframes linkComboPop { 0% { transform: translate(-50%, -115%) scale(1.45); } 100% { transform: translate(-50%, -115%) scale(1); } }
    @media (prefers-reduced-motion: reduce) { .link-combo-counter.pop { animation: none; } }
  `;
  document.head.appendChild(style);
})();
