// js/summon/summon-animation.js - Summon Animation Controller
// Plays a full-screen cinematic summon video (assets/video/summon.mp4) before
// the results are revealed. Gracefully no-ops if the video can't play, so a
// summon never gets stuck waiting on the animation.

class SummonAnimationController {
  constructor() {
    this.isPlaying = false;
    this._timer = null;
  }

  init() {
    // Wire the skip button once; elements are otherwise looked up at play time
    // so this is safe to call before/after the DOM is ready.
    const skip = document.getElementById('summon-skip');
    if (skip && !skip._wired) {
      skip._wired = true;
      skip.addEventListener('click', () => this.skipAnimation());
    }

    // Warm the video buffer so the first summon plays instantly.
    const video = document.getElementById('summon-video');
    if (video) { try { video.load(); } catch (e) {} }

    console.log('✅ Summon Animation Controller initialized');
  }

  /**
   * Play the summon animation.
   * @param {string} type - 'single' or 'multi' (reserved for future variants)
   * @returns {Promise} Resolves when the animation finishes, is skipped, or fails.
   */
  playSummonAnimation(type = 'single') {
    return new Promise((resolve) => {
      const overlay = document.getElementById('summon-anim-overlay');
      const video = document.getElementById('summon-video');

      // No overlay/video available → skip straight to results.
      if (!overlay || !video) { resolve(); return; }

      this.isPlaying = true;
      this._resolve = resolve;

      const finish = () => this._finish(overlay, video);

      // Show the overlay full-screen.
      overlay.classList.remove('hidden');

      // Reset and play.
      try { video.currentTime = 0; } catch (e) {}
      video.onended = finish;
      video.onerror = finish;

      const playPromise = video.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(() => {
          // Autoplay blocked or source missing — don't trap the user.
          this._timer = setTimeout(finish, 300);
        });
      }

      // Hard fallback in case 'ended' never fires (bad encode, tab throttling).
      clearTimeout(this._timer);
      this._timer = setTimeout(finish, 9000);
    });
  }

  _finish(overlay, video) {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    clearTimeout(this._timer);
    this._timer = null;

    if (video) {
      video.onended = null;
      video.onerror = null;
      try { video.pause(); } catch (e) {}
    }
    if (overlay) overlay.classList.add('hidden');

    if (this._resolve) {
      const r = this._resolve;
      this._resolve = null;
      r();
    }
  }

  skipAnimation() {
    if (!this.isPlaying) return;
    this._finish(
      document.getElementById('summon-anim-overlay'),
      document.getElementById('summon-video')
    );
  }
}

// Global instance
window.SummonAnimator = new SummonAnimationController();

console.log('✅ Summon Animation Controller loaded');
