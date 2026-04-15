// js/battle-animations.js - Animation System for Battle (WITH MP4 SUPPORT)
(() => {
  "use strict";

  const BattleAnimations = {
    /**
     * Display damage number with floating animation
     * @param {Object} unit - The unit taking damage
     * @param {number} amount - Damage amount
     * @param {boolean} isCritical - Whether it's a critical hit
     * @param {Object} dom - DOM references from BattleManager
     * @param {boolean} isHeal - Whether this is healing (optional)
     * @param {Object} breakdown - Optional damage calculation breakdown
     */
    showDamage(unit, amount, isCritical = false, dom, isHeal = false, breakdown = null) {
      console.log(`[Animations] showDamage called:`, {
        unitId: unit?.id,
        unitName: unit?.name,
        amount,
        isCritical,
        isHeal,
        hasDamageLayer: !!dom.damageLayer,
        hasScene: !!dom.scene
      });

      const unitEl = dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) {
        console.warn(`[Animations] Unit element not found for ${unit?.name} (id: ${unit?.id})`);
        return;
      }
      if (!dom.damageLayer) {
        console.warn(`[Animations] Damage layer not found in DOM`);
        return;
      }

      const rect = unitEl.getBoundingClientRect();
      const sceneRect = dom.scene.getBoundingClientRect();

      // Determine damage type for color coding
      let damageType = 'normal';
      if (isHeal) {
        damageType = 'heal';
      } else if (isCritical) {
        damageType = 'crit';
      } else if (amount < 50) {
        damageType = 'weak';  // Low damage
      } else if (breakdown?.guard) {
        damageType = 'resist';  // Blocked/reduced damage
      }

      // Show impact flash effect using particle system
      if (!isHeal && window.BattleParticles) {
        window.BattleParticles.createImpactFlash(unit, damageType, dom.scene);
      }

      // Main damage number with enhanced styling
      const damageEl = document.createElement("div");
      damageEl.className = `damage-number damage-${damageType}`;
      damageEl.textContent = isHeal ? `+${amount}` : `-${amount}`;
      damageEl.style.position = 'absolute';
      damageEl.style.left = `${rect.left - sceneRect.left + rect.width / 2}px`;
      damageEl.style.top = `${rect.top - sceneRect.top}px`;
      damageEl.style.transform = 'translate(-50%, -100%)';
      damageEl.style.pointerEvents = 'none';
      damageEl.style.fontFamily = "'Cinzel', serif";
      damageEl.style.letterSpacing = '2px';
      damageEl.style.fontWeight = 'bold';
      damageEl.style.zIndex = '500';
      damageEl.style.opacity = '0';

      // Type-specific styling
      const styles = {
        heal: {
          color: '#5efc82',
          size: '3.5rem',
          shadow: '3px 3px 6px rgba(0,0,0,0.9), 0 0 15px rgba(94,252,130,0.8)',
          scale: 1.2
        },
        crit: {
          color: '#ffd700',
          size: '4.5rem',
          shadow: '3px 3px 6px rgba(0,0,0,0.9), 0 0 20px rgba(255,215,0,0.9)',
          scale: 1.5
        },
        normal: {
          color: '#ffffff',
          size: '3.5rem',
          shadow: '3px 3px 6px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.5)',
          scale: 1.0
        },
        weak: {
          color: '#999999',
          size: '2.8rem',
          shadow: '2px 2px 4px rgba(0,0,0,0.7)',
          scale: 0.8
        },
        resist: {
          color: '#4488ff',
          size: '3rem',
          shadow: '2px 2px 5px rgba(0,0,0,0.8), 0 0 10px rgba(68,136,255,0.6)',
          scale: 0.9
        }
      };

      const style = styles[damageType] || styles.normal;
      damageEl.style.fontSize = style.size;
      damageEl.style.color = style.color;
      damageEl.style.textShadow = style.shadow;

      dom.damageLayer.appendChild(damageEl);

      // Play sound effect
      if (window.AudioManager) {
        if (isCritical) {
          window.AudioManager.playSFX('critical');
        } else if (!isHeal) {
          window.AudioManager.playSFX('hit');
        }
      }

      // Animate with GSAP for smooth, controlled animation
      if (window.gsap) {
        const tl = window.gsap.timeline({
          onComplete: () => {
            damageEl.remove();
            console.log(`[Animations] Damage number removed after animation`);
          }
        });

        // Pop in with scale
        tl.fromTo(damageEl,
          {
            y: 0,
            scale: style.scale * 0.5,
            opacity: 0
          },
          {
            y: -20,
            scale: style.scale,
            opacity: 1,
            duration: 0.15,
            ease: "back.out(3)"
          }
        )
        // Float up
        .to(damageEl, {
          y: -80,
          opacity: 1,
          duration: 0.4,
          ease: "power1.out"
        })
        // Fade out
        .to(damageEl, {
          y: -120,
          opacity: 0,
          scale: style.scale * 0.8,
          duration: 0.3,
          ease: "power2.in"
        }, "-=0.1");
      } else {
        // Fallback to CSS animation
        damageEl.style.animation = 'damageFloat 1s ease-out forwards';
        damageEl.style.opacity = '1';
        setTimeout(() => {
          damageEl.remove();
          console.log(`[Animations] Damage number removed after 1s`);
        }, 1000);
      }

      // Add critical hit indicator
      if (isCritical) {
        const critText = document.createElement('div');
        critText.textContent = 'CRITICAL!';
        critText.style.position = 'absolute';
        critText.style.left = `${rect.left - sceneRect.left + rect.width / 2}px`;
        critText.style.top = `${rect.top - sceneRect.top - 40}px`;
        critText.style.transform = 'translate(-50%, -100%)';
        critText.style.fontSize = '1.3rem';
        critText.style.fontWeight = 'bold';
        critText.style.color = '#ffcc00';
        critText.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8), 0 0 15px rgba(255,204,0,0.7)';
        critText.style.zIndex = '501';
        critText.style.pointerEvents = 'none';
        critText.style.fontFamily = "'Cinzel', serif";
        critText.style.opacity = '0';
        dom.damageLayer.appendChild(critText);

        if (window.gsap) {
          window.gsap.timeline({
            onComplete: () => critText.remove()
          })
          .fromTo(critText,
            { scale: 0.3, opacity: 0, rotation: -15 },
            { scale: 1, opacity: 1, rotation: 0, duration: 0.2, ease: "back.out(4)" }
          )
          .to(critText, {
            y: -30,
            opacity: 1,
            duration: 0.5,
            ease: "power1.out"
          })
          .to(critText, {
            y: -50,
            opacity: 0,
            scale: 0.8,
            duration: 0.3,
            ease: "power2.in"
          });
        } else {
          critText.style.animation = 'damageFloat 1s ease-out forwards';
          critText.style.opacity = '1';
          setTimeout(() => critText.remove(), 1000);
        }
      }

      console.log(`[Animations] ✅ Enhanced damage number created`, {
        text: damageEl.textContent,
        type: damageType,
        color: style.color
      });
    },

    /**
     * Play skill animation (jutsu, ultimate, or secret)
     * SUPPORTS: GIF, MP4, WEBM, and other video formats
     * @param {Object} unit - The unit casting the skill
     * @param {string} skillType - "jutsu", "ultimate", or "secret"
     * @param {string} mediaPath - Path to animation GIF or video file
     * @param {Object} dom - DOM references from BattleManager
     */
    playSkillAnimation(unit, skillType, mediaPath, dom) {
      // Try to get animation from multiple sources
      if (!mediaPath) {
        const base = unit._ref?.base;
        if (skillType === "ultimate") {
          mediaPath = base?.ultimateAnimation ||
                      base?.skills?.ultimate?.animationGif ||
                      base?.skills?.ultimate?.video;
        } else if (skillType === "secret") {
          mediaPath = base?.secretAnimation ||
                      base?.skills?.secret?.animationGif ||
                      base?.skills?.secret?.video;
        } else {
          mediaPath = base?.jutsuAnimation ||
                      base?.skills?.jutsu?.animationGif;
        }
      }

      if (!mediaPath || !dom.effectsLayer) {
        console.log("[Animations] No animation path for", skillType);
        return;
      }

      // ✅ CHECK IF IT'S A VIDEO FILE
      const isVideo = /\.(mp4|webm|mov|avi|m4v)$/i.test(mediaPath);

      // ✅ FULLSCREEN MODE for ultimate/secret videos
      const isFullscreen = isVideo && (skillType === "ultimate" || skillType === "secret");

      const animEl = document.createElement("div");
      animEl.className = `skill-animation ${skillType} ${isFullscreen ? 'fullscreen' : ''}`;

      if (isFullscreen) {
        // FULLSCREEN CINEMATIC MODE
        animEl.style.position = "fixed";
        animEl.style.inset = "0";
        animEl.style.width = "100%";
        animEl.style.height = "100%";
        animEl.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
        animEl.style.display = "flex";
        animEl.style.alignItems = "center";
        animEl.style.justifyContent = "center";
        animEl.style.zIndex = "9999";
      } else {
        // NORMAL OVERLAY MODE (for jutsu or GIFs)
        const unitEl = dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
        if (!unitEl) return;

        const rect = unitEl.getBoundingClientRect();
        const sceneRect = dom.scene.getBoundingClientRect();

        animEl.style.position = "absolute";
        animEl.style.left = `${rect.left - sceneRect.left - 150}px`;
        animEl.style.top = `${rect.top - sceneRect.top - 150}px`;
        animEl.style.width = "400px";
        animEl.style.height = "400px";
        animEl.style.zIndex = "200";
      }

      animEl.style.pointerEvents = "none";

      if (isVideo) {
        console.log(`[Animations] 🎬 Playing ${isFullscreen ? 'FULLSCREEN' : ''} VIDEO animation: ${mediaPath}`);

        // Create video element with autoplay
        const video = document.createElement('video');
        video.src = mediaPath;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;

        if (isFullscreen) {
          video.style.maxWidth = '90%';
          video.style.maxHeight = '90%';
          video.style.objectFit = 'contain';
        } else {
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'contain';
        }

        // Remove animation when video ends
        video.onended = () => {
          console.log("[Animations] ✅ Video finished playing");
          animEl.remove();
        };

        // Error handling
        video.onerror = (e) => {
          console.error("[Animations] ❌ Video failed to load:", mediaPath, e);
          animEl.remove();
        };

        animEl.appendChild(video);
      } else {
        console.log(`[Animations] 🖼️ Playing GIF animation: ${mediaPath}`);

        // Create image/GIF element
        const img = document.createElement('img');
        img.src = mediaPath;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.alt = 'skill animation';

        // Error handling
        img.onerror = () => {
          console.error("[Animations] ❌ GIF failed to load:", mediaPath);
          img.style.display = 'none';
        };

        animEl.appendChild(img);
      }

      // ✅ Append to the right container
      if (isFullscreen) {
        document.body.appendChild(animEl);  // Fullscreen = body
      } else {
        dom.effectsLayer.appendChild(animEl);  // Normal = effects layer
      }

      // Auto-remove GIF animations after duration (videos remove themselves)
      if (!isVideo) {
        const duration = skillType === "ultimate" || skillType === "secret" ? 2500 : 1500;
        setTimeout(() => animEl.remove(), duration);
      }
    },

    /**
     * Show visual effect for unit guarding
     * @param {Object} unit - The unit guarding
     * @param {Object} dom - DOM references from BattleManager
     */
    showGuardEffect(unit, dom) {
      const unitEl = dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl || !dom.effectsLayer) return;

      const rect = unitEl.getBoundingClientRect();
      const sceneRect = dom.scene.getBoundingClientRect();

      const shieldEl = document.createElement("div");
      shieldEl.className = "guard-effect";
      shieldEl.style.position = "absolute";
      shieldEl.style.left = `${rect.left - sceneRect.left}px`;
      shieldEl.style.top = `${rect.top - sceneRect.top}px`;
      shieldEl.style.width = `${rect.width}px`;
      shieldEl.style.height = `${rect.height}px`;
      shieldEl.style.border = "3px solid #58b7ff";
      shieldEl.style.borderRadius = "50%";
      shieldEl.style.boxShadow = "0 0 20px #58b7ff";
      shieldEl.style.pointerEvents = "none";
      shieldEl.style.zIndex = "150";
      shieldEl.style.animation = "guardPulse 0.5s ease-out";

      dom.effectsLayer.appendChild(shieldEl);

      setTimeout(() => shieldEl.remove(), 500);
    },

    /**
     * Animate unit death/knockout
     * @param {Object} unit - The unit being knocked out
     * @param {Object} dom - DOM references from BattleManager
     */
    animateKnockout(unit, dom) {
      const unitEl = dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      unitEl.style.transition = "all 0.5s ease-out";
      unitEl.style.opacity = "0";
      unitEl.style.transform = "scale(0.8)";
      unitEl.style.filter = "grayscale(100%)";

      setTimeout(() => {
        unitEl.style.opacity = "0.35";
        unitEl.style.transform = "scale(1)";
        unitEl.style.pointerEvents = "none";
      }, 500);
    },

    /**
     * Show status effect icon on unit
     * @param {Object} unit - The unit with status effect
     * @param {string} statusType - Type of status (burn, poison, stun, etc.)
     * @param {Object} dom - DOM references from BattleManager
     */
    showStatusEffect(unit, statusType, dom) {
      const unitEl = dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      const statusContainer = unitEl.querySelector('.status-effects') || (() => {
        const container = document.createElement('div');
        container.className = 'status-effects';
        container.style.position = 'absolute';
        container.style.top = '-25px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.display = 'flex';
        container.style.gap = '3px';
        container.style.zIndex = '10';
        unitEl.appendChild(container);
        return container;
      })();

      const statusIcon = document.createElement('div');
      statusIcon.className = `status-icon ${statusType}`;
      statusIcon.style.width = '20px';
      statusIcon.style.height = '20px';
      statusIcon.style.borderRadius = '50%';
      statusIcon.style.display = 'flex';
      statusIcon.style.alignItems = 'center';
      statusIcon.style.justifyContent = 'center';
      statusIcon.style.fontSize = '12px';
      statusIcon.style.fontWeight = 'bold';
      statusIcon.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

      // Set icon appearance based on status type
      const statusStyles = {
        burn: { bg: '#ff6b6b', icon: '', text: 'Burn' },
        poison: { bg: '#a855f7', icon: '', text: 'Poison' },
        stun: { bg: '#ffd93d', icon: '', text: 'Stun' },
        freeze: { bg: '#6bcbff', icon: '', text: 'Freeze' },
        buff: { bg: '#2ecc71', icon: '', text: 'Buff' },
        debuff: { bg: '#e74c3c', icon: '', text: 'Debuff' }
      };

      const style = statusStyles[statusType] || statusStyles.debuff;
      statusIcon.style.backgroundColor = style.bg;
      statusIcon.textContent = style.icon;
      statusIcon.title = style.text;

      statusContainer.appendChild(statusIcon);
    },

    /**
     * Animate unit taking a turn (highlight pulse)
     * @param {Object} unit - The unit taking turn
     * @param {Object} dom - DOM references from BattleManager
     */
    animateTurnStart(unit, dom) {
      const unitEl = dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      unitEl.style.animation = 'turnPulse 0.5s ease-out';

      setTimeout(() => {
        unitEl.style.animation = '';
      }, 500);
    },

    /**
     * Show area of effect indicator
     * @param {number} x - X position in pixels
     * @param {number} y - Y position in pixels
     * @param {number} radius - Radius of effect
     * @param {string} color - Color of the indicator
     * @param {Object} dom - DOM references from BattleManager
     */
    showAOEIndicator(x, y, radius, color, dom) {
      if (!dom.effectsLayer) return;

      const aoeEl = document.createElement('div');
      aoeEl.className = 'aoe-indicator';
      aoeEl.style.position = 'absolute';
      aoeEl.style.left = `${x - radius}px`;
      aoeEl.style.top = `${y - radius}px`;
      aoeEl.style.width = `${radius * 2}px`;
      aoeEl.style.height = `${radius * 2}px`;
      aoeEl.style.border = `3px solid ${color}`;
      aoeEl.style.borderRadius = '50%';
      aoeEl.style.backgroundColor = `${color}22`;
      aoeEl.style.boxShadow = `0 0 30px ${color}`;
      aoeEl.style.pointerEvents = 'none';
      aoeEl.style.zIndex = '100';
      aoeEl.style.animation = 'aoePulse 0.8s ease-out';

      dom.effectsLayer.appendChild(aoeEl);

      setTimeout(() => aoeEl.remove(), 800);
    },

    /**
     * Create screen shake effect
     * @param {number} intensity - Shake intensity (1-10)
     * @param {number} duration - Duration in ms
     * @param {Object} dom - DOM references from BattleManager
     */
    screenShake(intensity = 5, duration = 300, dom) {
      if (!dom.scene) return;

      const originalTransform = dom.scene.style.transform;
      let startTime = Date.now();

      const shake = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed < duration) {
          const x = (Math.random() - 0.5) * intensity;
          const y = (Math.random() - 0.5) * intensity;
          dom.scene.style.transform = `translate(${x}px, ${y}px)`;
          requestAnimationFrame(shake);
        } else {
          dom.scene.style.transform = originalTransform;
        }
      };

      shake();
    },

    /**
     * Flash the screen with a color
     * @param {string} color - Color to flash
     * @param {number} duration - Duration in ms
     * @param {Object} dom - DOM references from BattleManager
     */
    screenFlash(color, duration = 200, dom) {
      if (!dom.scene) return;

      const flash = document.createElement('div');
      flash.style.position = 'absolute';
      flash.style.inset = '0';
      flash.style.backgroundColor = color;
      flash.style.opacity = '0.6';
      flash.style.pointerEvents = 'none';
      flash.style.zIndex = '1000';
      flash.style.animation = `flashFade ${duration}ms ease-out`;

      dom.scene.appendChild(flash);

      setTimeout(() => flash.remove(), duration);
    },

    /**
     * Animate chakra gain
     * @param {Object} unit - The unit gaining chakra
     * @param {number} amount - Amount of chakra gained
     * @param {Object} dom - DOM references from BattleManager
     */
    animateChakraGain(unit, amount, dom) {
      const unitEl = dom.scene?.querySelector(`[data-unit-id="${unit.id}"]`);
      if (!unitEl) return;

      const chakraContainer = unitEl.querySelector('.unit-chakra');
      if (!chakraContainer) return;

      chakraContainer.style.animation = 'chakraPulse 0.3s ease-out';

      setTimeout(() => {
        chakraContainer.style.animation = '';
      }, 300);
    }
  };

  // Export to window
  window.BattleAnimations = BattleAnimations;

  // Add CSS animations dynamically
  const style = document.createElement('style');
  style.textContent = `
    @keyframes damageFloat {
      0% {
        opacity: 1;
        transform: translate(-50%, -100%) scale(1);
      }
      50% {
        transform: translate(-50%, -150%) scale(1.2);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -200%) scale(0.8);
      }
    }

    @keyframes guardPulse {
      0% {
        opacity: 1;
        transform: scale(0.8);
      }
      100% {
        opacity: 0;
        transform: scale(1.3);
      }
    }

    @keyframes turnPulse {
      0%, 100% {
        filter: brightness(1);
      }
      50% {
        filter: brightness(1.4) drop-shadow(0 0 20px rgba(255,234,120,0.8));
      }
    }

    @keyframes aoePulse {
      0% {
        opacity: 1;
        transform: scale(0.5);
      }
      100% {
        opacity: 0;
        transform: scale(1.5);
      }
    }

    @keyframes flashFade {
      0% {
        opacity: 0.6;
      }
      100% {
        opacity: 0;
      }
    }

    @keyframes chakraPulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.1);
        filter: brightness(1.4);
      }
    }

    @keyframes fadeInOut {
      0% {
        opacity: 0;
        transform: translateY(10px);
      }
      20% {
        opacity: 1;
        transform: translateY(0);
      }
      80% {
        opacity: 1;
        transform: translateY(0);
      }
      100% {
        opacity: 0;
        transform: translateY(-10px);
      }
    }

    .damage-breakdown {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .damage-breakdown .breakdown-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 2px 0;
      border-bottom: 1px solid rgba(217, 179, 98, 0.2);
    }

    .damage-breakdown .breakdown-row.total {
      border-top: 2px solid rgba(217, 179, 98, 0.6);
      border-bottom: none;
      font-weight: bold;
      color: #ffd700;
      margin-top: 2px;
      padding-top: 4px;
    }

    .damage-breakdown .breakdown-row.critical {
      color: #ff4444;
      font-weight: bold;
    }

    .skill-animation {
      transition: opacity 0.3s ease-out;
    }

    .skill-animation.ultimate video,
    .skill-animation.ultimate img {
      filter: drop-shadow(0 0 15px rgba(255, 77, 77, 0.8));
    }

    .skill-animation.jutsu video,
    .skill-animation.jutsu img {
      filter: drop-shadow(0 0 15px rgba(88, 183, 255, 0.8));
    }

    .skill-animation.secret video,
    .skill-animation.secret img {
      filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.9));
    }
  `;
  document.head.appendChild(style);

  console.log("[BattleAnimations] Module loaded ✅ (GIF + MP4 support)");

})();
