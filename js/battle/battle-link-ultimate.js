// js/battle/battle-link-ultimate.js - Link Ultimates (synergy partners act together)
(() => {
  "use strict";

  /**
   * BattleLinkUltimate
   *
   * When a unit fires its ultimate and a synergy partner on the same side is
   * also ready to fire theirs (on the field, alive, ultimate unlocked, not
   * sealed / on cooldown, enough chakra), the partner joins in right away:
   *
   *   leader ultimate → "LINK ULTIMATE" banner → partner ultimate → turn ends
   *
   * - Both ultimates deal LINK_BONUS extra damage.
   * - The partner pays its own chakra but keeps its normal turn.
   * - Works for both sides, so enemy pairs (Pain + Konan, …) can link too.
   * - Synergy groups live in js/synergy.js (window.Synergy), matched by
   *   character name, so every version of a character counts.
   * - Unit cards in the team holder get a chain badge naming the link; it
   *   lights up gold when the unit and an on-field partner can both fire.
   *
   * Wraps BattleCombat.performUltimate / calculateDamage; load after
   * js/synergy.js and battle-hp-fix.js (and any other performUltimate wrapper).
   */

  const LINK_BONUS = 1.2; // ×1.2 damage on both linked ultimates

  const BattleLinkUltimate = {
    LINK_BONUS,
    enabled: true,
    _linking: false,

    /** Name of the link between two units, or null when they have no synergy. */
    linkName(a, b) {
      return window.Synergy?.linkName(a?.name, b?.name) || null;
    },

    /** True if `unit` could fire its ultimate right now (outside its own turn). */
    isUltReady(unit, C) {
      if (!unit || unit.stats?.hp <= 0 || unit.isBench) return false;
      if (window.BattleBuffs?.cannotAct?.(unit)) return false;
      const ult = C.getUnitSkills?.(unit)?.ultimate;
      if (!ult) return false;
      if (C.isUltimateUnlocked && !C.isUltimateUnlocked(unit)) return false;
      if (C.isSkillSealed?.(unit, "ultimate")) return false;
      if ((unit.ultimateCooldown || 0) > 0) return false;
      return (unit.chakra || 0) >= C.getSkillChakraCost(unit, ult, 8);
    },

    /** First ready synergy partner of `leader` on its own side, with the link's name. */
    findPartner(leader, core, C) {
      const team = leader.isPlayer ? core.activeTeam : core.enemyTeam;
      for (const u of team || []) {
        if (!u || u === leader) continue;
        if (core.combatants && !core.combatants.includes(u)) continue;
        const name = this.linkName(leader, u);
        if (name && this.isUltReady(u, C)) return { partner: u, name };
      }
      return null;
    },

    /** "LINK ULTIMATE" banner with both names; resolves when it has played. */
    showBanner(leader, partner, name) {
      return new Promise(resolve => {
        const host = document.getElementById("battle-scene") || document.body;
        const el = document.createElement("div");
        el.className = `link-ult-banner ${leader.isPlayer ? "is-player" : "is-enemy"}`;
        if (host === document.body) el.style.position = "fixed";
        el.innerHTML = `
          <div class="link-ult-banner__kicker">Link Ultimate</div>
          <div class="link-ult-banner__names"></div>
          <div class="link-ult-banner__bond"></div>`;
        el.querySelector(".link-ult-banner__names").textContent = `${leader.name} × ${partner.name}`;
        el.querySelector(".link-ult-banner__bond").textContent = `${name} · +${Math.round((LINK_BONUS - 1) * 100)}% damage`;
        host.appendChild(el);
        setTimeout(() => { el.remove(); resolve(); }, 1300);
      });
    },

    /* ===== Team holder badges =====
       Each player card with an on-field synergy partner carries a chain
       badge (.uc-link) naming the link; .is-ready (gold pulse) when the unit
       and a partner can both fire their ultimates, i.e. using this unit's
       ultimate now would link. Cards are re-rendered by the team holder, so
       a light poll keeps badges in place and only touches the DOM on change. */

    CHAIN_SVG: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.6 9.4a2.4 2.4 0 0 0 3.4 0l2.6-2.6a2.4 2.4 0 0 0-3.4-3.4l-.9.9M9.4 6.6a2.4 2.4 0 0 0-3.4 0L3.4 9.2a2.4 2.4 0 0 0 3.4 3.4l.9-.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',

    /** On-field synergy partners of a player unit: [{ partner, name }]. */
    partnersOf(unit, core) {
      return (core.activeTeam || [])
        .filter(u => u && u !== unit && !u.isBench && u.stats?.hp > 0)
        .map(u => ({ partner: u, name: this.linkName(unit, u) }))
        .filter(l => l.name);
    },

    syncBadges(core) {
      const holder = document.getElementById("team-holder");
      const C = window.BattleCombat;
      if (!holder || !core || !C) return;
      const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

      holder.querySelectorAll(".unit-card[data-unit-id]").forEach(card => {
        const unit = (core.activeTeam || []).find(u => u && String(u.id) === card.dataset.unitId);
        const links = unit && unit.stats?.hp > 0 && this.enabled ? this.partnersOf(unit, core) : [];
        const ready = links.length > 0 && this.isUltReady(unit, C) && links.some(l => this.isUltReady(l.partner, C));
        const title = links.map(l => `${l.name}: ${l.partner.name}`).join(" · ");
        const key = links.length ? `${ready ? 1 : 0}|${title}` : "";

        let badge = card.querySelector(".uc-link");
        if (badge?.dataset.key === key) return;
        card.classList.toggle("link-ready", ready);
        if (!key) { badge?.remove(); return; }
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "uc-link";
          (card.querySelector(".uc-body") || card).appendChild(badge);
        }
        badge.dataset.key = key;
        badge.classList.toggle("is-ready", ready);
        badge.title = `Link Ultimate — ${title}${ready ? " (ready!)" : ""}`;
        badge.setAttribute("aria-label", badge.title);
        badge.innerHTML = `${this.CHAIN_SVG}<span class="uc-link__txt">${ready ? "LINK!" : esc(links[0].name)}</span>`;
      });
    },

    startBadgeSync() {
      if (this._badgeTimer) return;
      this._badgeTimer = setInterval(() => {
        try { this.syncBadges(window.BattleManager); } catch (e) { /* cosmetic */ }
      }, 250);
    },

    install() {
      const C = window.BattleCombat;
      if (!C?.performUltimate || !C?.calculateDamage) {
        console.warn("[LinkUltimate] BattleCombat not ready — link ultimates disabled");
        return;
      }
      const self = this;

      // Linked ultimates hit harder (ultimate damage only, while the link runs).
      const origCalc = C.calculateDamage;
      C.calculateDamage = function (attacker, defender, multiplier = 1, ctx = null, ...rest) {
        const boost = attacker?._linkBoost;
        if (boost && ctx?.kind === "ultimate") multiplier *= boost;
        return origCalc.call(this, attacker, defender, multiplier, ctx, ...rest);
      };

      const origUlt = C.performUltimate;
      C.performUltimate = function (attacker, targets, core, onDone, ...rest) {
        // The partner's own ultimate (or links turned off) never chains again.
        if (self._linking || !self.enabled || !attacker || !core) {
          return origUlt.call(this, attacker, targets, core, onDone, ...rest);
        }

        const link = self.findPartner(attacker, core, this);
        if (!link) return origUlt.call(this, attacker, targets, core, onDone, ...rest);

        const { partner, name } = link;
        const combat = this;
        attacker._linkBoost = LINK_BONUS;
        self._linking = true;

        const finish = () => {
          attacker._actionBusy = false;
          delete attacker._linkBoost;
          delete partner._linkBoost;
          self._linking = false;
          onDone?.();
        };

        const afterLeader = () => {
          delete attacker._linkBoost;
          // Leader's ultimate cleared the wave (or the battle is over): no follow-up.
          const foes = combat.getOpponents(partner, core);
          if (!foes.length || core.isPaused || partner.stats.hp <= 0 || !self.isUltReady(partner, combat)) {
            finish();
            return;
          }
          // Keep the leader's turn open while the partner acts (turn watchdogs wait).
          attacker._actionBusy = true;
          window.BattleNarrator?.narrate?.(`${attacker.name} and ${partner.name} link their ultimates!`, core);
          self.showBanner(attacker, partner, name).then(() => {
            partner._linkBoost = LINK_BONUS;
            let ok = false;
            try {
              ok = combat.performUltimate(partner, combat.getOpponents(partner, core), core, finish) !== false;
            } catch (e) {
              console.error("[LinkUltimate] Partner ultimate failed", e);
            }
            if (!ok) finish();
          });
        };

        const ok = origUlt.call(this, attacker, targets, core, afterLeader, ...rest);
        if (ok === false) {
          // Leader couldn't fire (sealed / locked / chakra): nothing to link.
          delete attacker._linkBoost;
          self._linking = false;
        } else {
          console.log(`[LinkUltimate] ${attacker.name} ↔ ${partner.name} (${name})`);
        }
        return ok;
      };

      this.startBadgeSync();
      console.log("[LinkUltimate] Installed ✅");
    }
  };

  window.BattleLinkUltimate = BattleLinkUltimate;
  BattleLinkUltimate.install();
})();
