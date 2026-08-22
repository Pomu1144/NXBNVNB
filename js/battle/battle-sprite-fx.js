// js/battle/battle-sprite-fx.js - Sprite animation layer for battle units
// Adds idle motion, attack lunges, hit reactions and a KO fall to each unit's
// existing portrait art (no new art assets required).
(() => {
  "use strict";

  const BattleSpriteFX = {
    /**
     * Restart a CSS animation class on an element (removes, forces reflow, re-adds)
     */
    _restart(el, className) {
      el.classList.remove(className);
      void el.offsetWidth; // force reflow so the animation restarts
      el.classList.add(className);
    },

    _getSprite(unit, dom) {
      // Look inside .unit-sprite directly: dom.scene also contains turn-order
      // "speed marker" elements carrying the same data-unit-id, so a plain
      // [data-unit-id] lookup on the scene can match the wrong node.
      const sprite = (dom?.grid || dom?.scene)?.querySelector(`[data-unit-id="${unit.id}"] .unit-sprite`);
      return sprite || null;
    },

    /**
     * Play the attacker's lunge-forward animation
     */
    playAttack(unit, dom) {
      const sprite = this._getSprite(unit, dom);
      if (!sprite) return;

      const className = unit.isPlayer ? "sprite-attack-player" : "sprite-attack-enemy";
      this._restart(sprite, className);
      sprite.addEventListener("animationend", () => sprite.classList.remove(className), { once: true });
    },

    /**
     * Play the target's hit-flinch reaction
     */
    playHit(unit, dom) {
      const sprite = this._getSprite(unit, dom);
      if (!sprite) return;

      this._restart(sprite, "sprite-hit");
      sprite.addEventListener("animationend", () => sprite.classList.remove("sprite-hit"), { once: true });
    },

    /**
     * Play the knockout fall on a defeated unit's sprite
     */
    playKO(unit, dom) {
      const sprite = this._getSprite(unit, dom);
      if (!sprite) return;

      sprite.classList.add("sprite-ko");
    }
  };

  window.BattleSpriteFX = BattleSpriteFX;

  const style = document.createElement("style");
  style.textContent = `
    /* Idle breathing motion */
    .unit-sprite.sprite-idle img {
      animation: spriteIdleBob 2.4s ease-in-out infinite;
    }
    @keyframes spriteIdleBob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2px); }
    }

    /* Attack lunge - player units lean right (toward enemy side), enemies lean left */
    .unit-sprite.sprite-attack-player {
      animation: spriteLungeRight 0.35s ease-out;
    }
    .unit-sprite.sprite-attack-enemy {
      animation: spriteLungeLeft 0.35s ease-out;
    }
    @keyframes spriteLungeRight {
      0% { transform: translateX(0) scale(1); }
      40% { transform: translateX(10px) scale(1.08); }
      100% { transform: translateX(0) scale(1); }
    }
    @keyframes spriteLungeLeft {
      0% { transform: translateX(0) scale(1); }
      40% { transform: translateX(-10px) scale(1.08); }
      100% { transform: translateX(0) scale(1); }
    }

    /* Hit flinch - white flash + shake */
    .unit-sprite.sprite-hit {
      animation: spriteHitFlinch 0.4s ease-out;
    }
    @keyframes spriteHitFlinch {
      0% { filter: brightness(1); transform: translateX(0) rotate(0); }
      15% { filter: brightness(2.4) saturate(0.3); transform: translateX(-4px) rotate(-3deg); }
      35% { filter: brightness(1.3); transform: translateX(4px) rotate(2deg); }
      60% { filter: brightness(1); transform: translateX(-2px) rotate(-1deg); }
      100% { filter: brightness(1); transform: translateX(0) rotate(0); }
    }

    /* Knockout - topple, desaturate, fade */
    .unit-sprite.sprite-ko img {
      animation: spriteKOFall 0.6s ease-in forwards;
    }
    @keyframes spriteKOFall {
      0% { transform: rotate(0deg) translateY(0); filter: grayscale(0); opacity: 1; }
      100% { transform: rotate(85deg) translateY(18px); filter: grayscale(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  console.log("[BattleSpriteFX] Module loaded ✅");
})();
