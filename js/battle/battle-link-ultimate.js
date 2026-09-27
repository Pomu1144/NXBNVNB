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
   * - Synergy is by character name, so every version of a character counts.
   *
   * Wraps BattleCombat.performUltimate / calculateDamage; load after
   * battle-hp-fix.js (and any other performUltimate wrapper).
   */

  const LINK_BONUS = 1.2; // ×1.2 damage on both linked ultimates

  // Any two members of the same group can link. First matching group names the link.
  const GROUPS = [
    { name: "Rival Bond", members: ["Naruto Uzumaki", "Sasuke Uchiha"] },
    { name: "Team 7", members: ["Naruto Uzumaki", "Sasuke Uchiha", "Sakura Haruno", "Kakashi Hatake", "Sai", "Yamato"] },
    { name: "Uzumaki Family", members: ["Naruto Uzumaki", "Minato Namikaze", "Kushina Uzumaki"] },
    { name: "Team Minato", members: ["Minato Namikaze", "Kakashi Hatake", "Obito Uchiha", "Rin Nohara"] },
    { name: "Uchiha Brothers", members: ["Itachi Uchiha", "Sasuke Uchiha"] },
    { name: "Uchiha Brothers", members: ["Madara Uchiha", "Izuna Uchiha"] },
    { name: "Senju Brothers", members: ["Hashirama Senju", "Tobirama Senju"] },
    { name: "Founders of the Leaf", members: ["Hashirama Senju", "Madara Uchiha"] },
    { name: "Moon's Eye Plan", members: ["Madara Uchiha", "Obito Uchiha"] },
    { name: "Reincarnations", members: ["Indra", "Ashura"] },
    { name: "Legendary Sannin", members: ["Jiraiya", "Tsunade", "Orochimaru"] },
    { name: "Team Guy", members: ["Might Guy", "Rock Lee", "Neji Hyuga", "Tenten"] },
    { name: "Ino-Shika-Cho", members: ["Ino Yamanaka", "Shikamaru Nara", "Choji Akimichi", "Asuma Sarutobi"] },
    { name: "Team 8", members: ["Hinata Hyuga", "Kiba Inuzuka", "Shino Aburame", "Kurenai Yuhi"] },
    { name: "Sand Siblings", members: ["Gaara", "Temari", "Kankuro"] },
    { name: "Taka", members: ["Sasuke Uchiha", "Karin", "Suigetsu Hozuki", "Jugo"] },
    { name: "Demon of the Mist", members: ["Zabuza Momochi", "Haku"] },
    { name: "Sound Four", members: ["Tayuya", "Kidomaru", "Jirobo", "Sakon", "Kimimaro"] },
    { name: "Hidden Cloud", members: ["Killer Bee", "Darui"] },
    { name: "Akatsuki: Itachi & Kisame", members: ["Itachi Uchiha", "Kisame Hoshigaki"] },
    { name: "Akatsuki: Art Is…", members: ["Deidara", "Sasori"] },
    { name: "Akatsuki: Zombie Combo", members: ["Hidan", "Kakuzu"] },
    { name: "Akatsuki: Angel & God", members: ["Pain", "Konan", "Nagato"] },
  ];

  const norm = s => String(s || "").trim().toLowerCase();
  const GROUPS_N = GROUPS.map(g => ({ name: g.name, members: new Set(g.members.map(norm)) }));

  const BattleLinkUltimate = {
    LINK_BONUS,
    GROUPS,
    enabled: true,
    _linking: false,

    /** Name of the link between two units, or null when they have no synergy. */
    linkName(a, b) {
      const na = norm(a?.name), nb = norm(b?.name);
      if (!na || !nb || na === nb) return null;
      const g = GROUPS_N.find(g => g.members.has(na) && g.members.has(nb));
      return g ? g.name : null;
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

      console.log("[LinkUltimate] Installed ✅");
    }
  };

  window.BattleLinkUltimate = BattleLinkUltimate;
  BattleLinkUltimate.install();
})();
