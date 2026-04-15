// js/awakening-animation.js
// Awakening Animation System - Kanji orbiting around character with blur transition

(function (global) {
  "use strict";

  // Japanese characters meaning "Awakening" / "Evolution" / "Power" / "Transform"
  const KANJI_CHARACTERS = ["覚", "醒", "進", "化", "力", "変", "身", "昇"];

  /**
   * Play the awakening animation
   * @param {string} oldCharacterName - Name of the base character
   * @param {string} newCharacterName - Name of the evolved character
   * @param {string} oldArtworkUrl - Old character artwork URL
   * @param {string} newArtworkUrl - New character artwork URL
   * @param {Function} onComplete - Callback when animation finishes
   * @param {string} theme - Color theme: 'gold' (default) or 'purple'
   */
  async function playAwakeningAnimation(oldCharacterName, newCharacterName, oldArtworkUrl, newArtworkUrl, onComplete, theme = 'gold') {
    console.log("[Awakening Animation] Starting animation...");
    console.log(`[Awakening Animation] ${oldCharacterName} → ${newCharacterName}`);
    console.log(`[Awakening Animation] Theme: ${theme}`);

    // Create overlay
    const overlay = document.createElement("div");
    overlay.className = "awakening-overlay";
    document.body.appendChild(overlay);

    // Create container
    const container = document.createElement("div");
    container.className = "awakening-container";
    overlay.appendChild(container);

    // Preload both images
    const oldImg = new Image();
    const newImg = new Image();

    await Promise.all([
      new Promise((resolve, reject) => {
        oldImg.onload = resolve;
        oldImg.onerror = reject;
        oldImg.src = oldArtworkUrl;
      }),
      new Promise((resolve, reject) => {
        newImg.onload = resolve;
        newImg.onerror = reject;
        newImg.src = newArtworkUrl;
      })
    ]);

    // Apply theme class
    const themeClass = theme === 'purple' ? 'purple' : '';

    // Add character image container (starts with old character)
    const characterContainer = document.createElement("div");
    characterContainer.className = `awakening-character ${themeClass}`.trim();
    const characterImg = document.createElement("img");
    characterImg.src = oldArtworkUrl;
    characterImg.alt = `${oldCharacterName} transforming`;
    characterContainer.appendChild(characterImg);
    container.appendChild(characterContainer);

    // Switch to new character image at the peak of blur (3.5s into animation)
    setTimeout(() => {
      characterImg.src = newArtworkUrl;
      characterImg.alt = `${newCharacterName} awakened form`;
      console.log("[Awakening Animation] Switched to new character image");
    }, 3500);

    // Add energy circle (gold or purple)
    const circle = document.createElement("div");
    circle.className = `awakening-circle ${themeClass}`.trim();
    container.appendChild(circle);

    // Create rotating ring for kanji characters
    const kanjiRing = document.createElement("div");
    kanjiRing.className = "awakening-kanji-ring";
    container.appendChild(kanjiRing);

    // Add Japanese characters in a ring around the character
    KANJI_CHARACTERS.forEach((kanji) => {
      const kanjiEl = document.createElement("div");
      kanjiEl.className = `awakening-kanji ${themeClass}`.trim();
      kanjiEl.textContent = kanji;
      kanjiRing.appendChild(kanjiEl);
    });

    // Add sparkle particles orbiting around
    for (let i = 0; i < 40; i++) {
      const particle = document.createElement("div");
      particle.className = `awakening-particle ${themeClass}`.trim();

      // Create circular orbit pattern
      const angle = (i / 40) * Math.PI * 2;
      const radius = 200 + Math.random() * 100;
      const tx = Math.cos(angle) * radius;
      const ty = Math.sin(angle) * radius;

      particle.style.setProperty('--tx', `${tx}px`);
      particle.style.setProperty('--ty', `${ty}px`);
      particle.style.left = '50%';
      particle.style.top = '50%';
      particle.style.animationDelay = `${Math.random() * 2}s`;

      container.appendChild(particle);
    }

    // Add energy ripples
    for (let i = 0; i < 3; i++) {
      const ripple = document.createElement("div");
      ripple.className = `awakening-ripple ${themeClass}`.trim();
      container.appendChild(ripple);
    }

    // Add flash effect
    const flash = document.createElement("div");
    flash.className = `awakening-flash ${themeClass}`.trim();
    container.appendChild(flash);

    // Add success text
    const successText = document.createElement("div");
    successText.className = `awakening-success ${themeClass}`.trim();
    const completeColor = theme === 'purple' ? '#8b4789' : '#996600';
    const completeText = theme === 'purple' ? 'LIMIT BREAK COMPLETE!' : 'AWAKENING COMPLETE!';
    successText.innerHTML = `
      <div style="font-size: 24px; margin-bottom: 10px;">${oldCharacterName}</div>
      <div style="font-size: 32px; margin: 10px 0;">↓</div>
      <div style="font-size: 28px; margin-bottom: 15px;">${newCharacterName}</div>
      <div style="font-size: 22px; color: ${completeColor}; text-shadow: 0 0 15px ${completeColor};">${completeText}</div>
    `;
    container.appendChild(successText);

    // Activate overlay
    setTimeout(() => {
      overlay.classList.add("active");
    }, 50);

    // Play sound effect if available
    if (global.AudioManager && typeof global.AudioManager.playSFX === 'function') {
      setTimeout(() => {
        try {
          global.AudioManager.playSFX('awakening');
        } catch (e) {
          console.log("[Awakening Animation] Audio not available");
        }
      }, 500);
    }

    // Auto-close after animation completes
    const closeDuration = 5500; // 5.5 seconds total
    const closeTimeout = setTimeout(() => {
      closeAnimation();
    }, closeDuration);

    // Function to close the animation
    function closeAnimation() {
      clearTimeout(closeTimeout);
      overlay.classList.remove("active");
      setTimeout(() => {
        overlay.remove();
        console.log("[Awakening Animation] Animation complete");
        if (onComplete) onComplete();
      }, 500);
    }

    // Allow click to skip
    overlay.addEventListener('click', () => {
      console.log("[Awakening Animation] Animation skipped by user");
      closeAnimation();
    });
  }

  // Export to global
  global.AwakeningAnimation = {
    play: playAwakeningAnimation
  };

  console.log("[Awakening Animation] ✅ Module loaded successfully");
  console.log("[Awakening Animation] Available at window.AwakeningAnimation.play");

  // Test that we can create elements (basic sanity check)
  try {
    const testDiv = document.createElement("div");
    console.log("[Awakening Animation] ✅ DOM manipulation working");
  } catch (e) {
    console.error("[Awakening Animation] ❌ DOM manipulation failed:", e);
  }

})(window);
