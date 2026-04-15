// js/battle/battle-field-controller.js
(() => {
  "use strict";

  /**
   * 🗺️ BattleFieldController
   * Manages battlefield visuals, domain switching, and restoration.
   *
   * Listens for:
   * - "skillActivated" → enters domain (if applicable)
   * - "skillEnd" → exits domain
   *
   * Requires: data/domains.json
   */
  const BattleFieldController = {
    dom: null,
    originalMap: null,
    currentMap: null,
    activeDomain: null,
    audio: null,
    registry: [],

    /** Initialize and preload registry */
    async init(sceneElement) {
      this.dom = sceneElement || document.querySelector("#battle-scene");
      if (!this.dom) {
        console.error("[BattleFieldController] ❌ Scene element not found.");
        return;
      }

      // Store the original map style for later restoration
      this.originalMap = this.dom.style.backgroundImage || "";
      this.currentMap = this.originalMap;

      // Load domain registry
      try {
        const res = await fetch("data/domains.json");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        this.registry = await res.json();
        console.log(`[BattleFieldController] 📘 Loaded ${this.registry.length} domain definitions.`);
      } catch (err) {
        console.error("[BattleFieldController] ⚠️ Failed to load domains.json:", err);
      }

      // Listen for domain-related events
      document.addEventListener("skillActivated", (e) => this.handleSkillActivated(e));
      document.addEventListener("skillEnd", () => this.exitDomain());

      console.log("[BattleFieldController] ✅ Initialized.");
    },

    /** Handle when a skill activates */
    handleSkillActivated(e) {
      const { characterId, skillType } = e.detail || {};
      if (!characterId || !skillType) return;

      const domain = this.registry.find(
        (d) => d.characterId === characterId && d.triggerSkill === skillType
      );

      if (domain) {
        console.log(`[BattleFieldController] 🌌 Domain triggered: ${domain.name}`);
        this.enterDomain(domain);
      }
    },

    /** Enter a new domain */
    async enterDomain(domain) {
      if (!this.dom) return;

      // Exit current domain if one is already active
      if (this.activeDomain) {
        console.log("[BattleFieldController] Exiting previous domain before entering new one.");
        this.exitDomain(true);
      }

      this.activeDomain = domain;
      this.dom.classList.add("domain-active");
      this.dom.style.transition = "background 0.8s ease-in-out, filter 0.5s ease";

      // Apply visual transition
      this.dom.style.backgroundImage = `url('${domain.background}')`;
      this.dom.style.backgroundSize = "cover";
      this.dom.style.backgroundPosition = "center";

      // Apply visual effects
      if (domain.effects?.blur) {
        this.dom.style.filter = `blur(${domain.effects.blur}rem)`;
      }
      if (domain.effects?.colorOverlay) {
        this.applyOverlay(domain.effects.colorOverlay);
      }
      if (domain.effects?.shake) {
        this.applyShake();
      }

      // Play domain music
      if (domain.music) {
        this.playDomainMusic(domain.music);
      }

      // Automatically revert after duration
      const duration = domain.durationMs || 8000;
      setTimeout(() => this.exitDomain(), duration);
    },

    /** Exit current domain and restore original map */
    exitDomain(immediate = false) {
      if (!this.activeDomain || !this.dom) return;

      const revertEffect = this.activeDomain.revertEffect || "fade";
      console.log(`[BattleFieldController] 🌄 Exiting domain: ${this.activeDomain.name}`);

      this.dom.classList.remove("domain-active");

      if (revertEffect === "fade" && !immediate) {
        this.dom.style.transition = "background 0.8s ease-in-out, filter 0.4s ease-out";
        this.dom.style.opacity = "0";
        setTimeout(() => {
          this.dom.style.backgroundImage = this.originalMap;
          this.dom.style.opacity = "1";
        }, 400);
      } else {
        this.dom.style.backgroundImage = this.originalMap;
      }

      // Reset filters and overlays
      this.dom.style.filter = "none";
      this.removeOverlay();
      this.stopDomainMusic();

      this.activeDomain = null;
    },

    /** Overlay effects */
    applyOverlay(color) {
      let overlay = document.querySelector(".domain-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "domain-overlay";
        Object.assign(overlay.style, {
          position: "absolute",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
          backgroundColor: color,
          pointerEvents: "none",
          zIndex: "50",
          transition: "background-color 0.5s ease",
        });
        this.dom.appendChild(overlay);
      } else {
        overlay.style.backgroundColor = color;
      }
    },

    removeOverlay() {
      const overlay = document.querySelector(".domain-overlay");
      if (overlay) overlay.remove();
    },

    /** Apply shake animation */
    applyShake() {
      this.dom.classList.add("shake-domain");
      setTimeout(() => this.dom.classList.remove("shake-domain"), 800);
    },

    /** Audio handling */
    playDomainMusic(src) {
      this.stopDomainMusic();
      try {
        // Use global AudioManager if available, otherwise fallback to manual audio
        if (typeof window.AudioManager !== "undefined") {
          this.audio = window.AudioManager.playBGM(src, { loop: true });
          console.log("[BattleFieldController] 🎵 Domain music via AudioManager");
        } else {
          this.audio = new Audio(src);
          this.audio.loop = true;
          this.audio.volume = 0.8; // Fallback volume if AudioManager not loaded
          this.audio.play();
          console.log("[BattleFieldController] 🎵 Domain music (fallback mode)");
        }
      } catch (err) {
        console.warn("[BattleFieldController] ⚠️ Failed to play domain music:", err);
      }
    },

    stopDomainMusic() {
      if (this.audio) {
        // Use AudioManager stop if available
        if (typeof window.AudioManager !== "undefined" && this.audio === window.AudioManager.currentBGM) {
          window.AudioManager.stopBGM();
        } else {
          this.audio.pause();
        }
        this.audio = null;
      }
    },
  };

  // Inject CSS for shake + overlay effects
  const style = document.createElement("style");
  style.textContent = `
    .shake-domain {
      animation: shake 0.5s;
      animation-iteration-count: 2;
    }
    @keyframes shake {
      0% { transform: translate(0px, 0px); }
      25% { transform: translate(2px, -2px); }
      50% { transform: translate(-2px, 2px); }
      75% { transform: translate(2px, 2px); }
      100% { transform: translate(0px, 0px); }
    }
    .domain-overlay {
      mix-blend-mode: overlay;
    }
  `;
  document.head.appendChild(style);

  window.BattleFieldController = BattleFieldController;
  console.log("[BattleFieldController] Module loaded ✅");
})();
