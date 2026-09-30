/* Normal attacks for units with an animated sprite.
 *
 * Wraps BattleCombat.performAttack (tap / AI / input-manager attacks) and
 * BattleCombat.performMultiAttack (drag attacks). For a sprite unit whose
 * folder has an 'attack' sheet: dash next to the (first) target, play the
 * sheet, run the ORIGINAL attack at the sheet's hit frame (so damage, the
 * damage number, knockback, chakra, buffs and the target's hit reaction all
 * happen exactly as before, just timed to the strike), then dash back and
 * idle. A normal attack deals one hit, so the sheets mark one hit frame.
 * Units without a sprite or without an 'attack' sheet keep the old path
 * unchanged. Must load after battle-combat.js and battle-hp-fix.js.
 */
(() => {
  "use strict";

  const C = window.BattleCombat;
  if (!C || C.performAttack?._spriteAttack) return;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const alive = u => !!(u && u.stats && u.stats.hp > 0);

  function canAnimate(attacker) {
    return !!(attacker?._sprite && attacker.charId && window.SpritePlayer?.has(attacker.charId) && alive(attacker));
  }

  /**
   * Play the attack sheet around `strike` (which runs the original attack
   * and receives a done-callback). Resolves `onDone` once both the original
   * attack has finished and the sprite is back home.
   */
  function animated(attacker, target, core, onDone, strike) {
    const sprite = attacker._sprite;
    const unitEl = core.dom?.scene?.querySelector(`.battle-unit[data-unit-id="${attacker.id}"]`);
    let waiting = 2; // original attack's onDone + our animation
    const finishOne = () => { if (--waiting === 0) onDone?.(); };
    const prevBusy = attacker._actionBusy;
    attacker._actionBusy = true; // turn watchdogs wait meanwhile

    let struck = false;
    const doStrike = () => {
      if (struck) return; struck = true;
      try { strike(finishOne); } catch (e) { console.error('[SpriteAttack] attack failed', e); finishOne(); }
    };

    (async () => {
      let meta = null;
      try { meta = await sprite.meta('attack'); } catch (e) { meta = null; }
      // Let the caller finish its synchronous work first (a sprite drop
      // settles the unit and may start a short hop with runTo()).
      await wait(0);
      if (!meta || !unitEl || attacker._sprite !== sprite || !alive(attacker) || !alive(target)) {
        doStrike();
        attacker._actionBusy = prevBusy || false;
        finishOne();
        return;
      }
      const U = core.units;
      U?.stopRun?.(attacker); // cancel a drop hop; we move the unit ourselves
      const home = { x: attacker.pos.x, y: attacker.pos.y };
      const prevZ = unitEl.style.zIndex, prevTransition = unitEl.style.transition;
      unitEl.style.zIndex = '70'; unitEl.style.transition = 'none';
      try {
        await C.dashUnitTo(attacker, unitEl, C.getStrikePosition(attacker, target, unitEl, core, meta), core);
        const curX = parseFloat(unitEl.style.left);
        U?.setSpriteFacing?.(attacker, target.pos.x < curX);
        const firstHit = Array.isArray(meta.hits) && meta.hits.length ? meta.hits[0] : Math.floor(meta.frames / 2);
        await new Promise(resolve => {
          let done = false;
          const end = () => { if (done) return; done = true; clearTimeout(guard); doStrike(); resolve(); };
          const guard = setTimeout(end, (meta.frames / meta.fps) * 1000 + 1200);
          sprite.play('attack', {
            onFrame: i => { if (i >= firstHit) doStrike(); },
            onEnd: end,
          }).then(() => { if (sprite.current !== 'attack') end(); }); // superseded
        });
        await wait(80);
        if (alive(attacker)) {
          await C.dashUnitTo(attacker, unitEl, home, core);
          unitEl.style.left = `${attacker.pos.x}%`;
          unitEl.style.top = `${attacker.pos.y}%`;
        }
      } catch (e) {
        console.warn('[SpriteAttack] animation error, attack resolved without it', e);
        doStrike();
      } finally {
        unitEl.style.zIndex = prevZ || ''; unitEl.style.transition = prevTransition || '';
        if (alive(attacker) && attacker._sprite === sprite) U?.settleSprite?.(attacker);
        attacker._actionBusy = prevBusy || false;
        finishOne();
      }
    })();
  }

  const origAttack = C.performAttack;
  C.performAttack = function (attacker, target, core, onDone, ...rest) {
    if (!canAnimate(attacker) || !alive(target) || !core?.dom) {
      return origAttack.call(this, attacker, target, core, onDone, ...rest);
    }
    animated(attacker, target, core, onDone, cb => origAttack.call(this, attacker, target, core, cb, ...rest));
  };
  C.performAttack._spriteAttack = true;

  /* A normal attack that reaches several enemies plays the whole attack
   * sheet on each of them in turn (dash, strike, back), instead of one
   * animation with every enemy taking damage at once. The first strike runs
   * the original multi-attack (chakra, Last Stand count, ...), the others
   * only deal their hit. */
  function strikeOnly(attacker, target, core, done) {
    try {
      const { damage, isCritical, breakdown, dodged } = C.calculateDamage(attacker, target, 1.0);
      target.stats.hp = Math.max(0, target.stats.hp - damage);
      if (!dodged) window.BattleBuffs?.onNormalHit?.(core, attacker, target, damage);
      window.BattlePhysics?.applyKnockback(target, attacker, 35, core);
      if (!dodged) window.BattleAnimations?.showDamage(target, damage, isCritical, core.dom, false, breakdown);
      if (core.units) core.units.updateUnitDisplay(target, core); else core.updateUnitDisplay?.(target);
      core.updateTeamHP?.();
    } catch (e) {
      console.warn('[SpriteAttack] follow-up strike failed', e);
    }
    setTimeout(() => { core.checkBattleEnd?.(); done?.(); }, 350);
  }

  const origMulti = C.performMultiAttack;
  if (typeof origMulti === 'function') {
    C.performMultiAttack = function (attacker, targets, core, onDone, ...rest) {
      const list = (targets || []).filter(alive);
      if (!canAnimate(attacker) || !list.length || !core?.dom) {
        return origMulti.call(this, attacker, targets, core, onDone, ...rest);
      }
      const self = this;
      (async () => {
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          if (!alive(attacker) || !alive(t)) continue;
          await new Promise(resolve => animated(attacker, t, core, resolve, cb => {
            if (i === 0) {
              const one = [t]; one.fromRange = true;
              origMulti.call(self, attacker, one, core, cb, ...rest);
            } else {
              strikeOnly(attacker, t, core, cb);
            }
          }));
        }
        onDone?.();
      })();
    };
    C.performMultiAttack._spriteAttack = true;
  }

  console.log('[SpriteAttack] normal-attack sheets hooked');
})();
