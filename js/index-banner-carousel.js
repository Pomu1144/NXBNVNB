// js/index-banner-carousel.js - Summon Banner Carousel for Index Page
(() => {
  "use strict";

  class IndexBannerCarousel {
    constructor() {
      this.banners = [];
      this.currentIndex = 0;
      this.autoScrollInterval = null;
    }

    async init() {
      const container = document.querySelector('.summon-banner-carousel');
      if (!container) {
        console.log('[IndexBannerCarousel] Container not found');
        return;
      }

      try {
        // Load summon data
        const response = await fetch('data/summon.json');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const allBanners = data.pools || data.banners || [];

        // Take first 3 banners for preview
        this.banners = allBanners.slice(0, 3);

        if (this.banners.length === 0) {
          container.innerHTML = '<p style="color: white; text-align: center;">No summon banners available</p>';
          return;
        }

        // Render banners
        container.innerHTML = this.banners.map((banner, index) => `
          <div class="summon-banner-card" data-banner-index="${index}">
            <img src="${banner.image}"
                 alt="${banner.name}"
                 onerror="this.src='assets/Main Background/summon_bg.png'">
            <div class="banner-card-info">
              <h3>${banner.name}</h3>
              <p>${banner.description || ''}</p>
            </div>
          </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.summon-banner-card').forEach(card => {
          card.addEventListener('click', () => {
            const bannerIndex = parseInt(card.dataset.bannerIndex);
            this.navigateToSummon(bannerIndex);
          });
        });

        // Start auto-scroll
        this.startAutoScroll();

        console.log(`✅ IndexBannerCarousel initialized with ${this.banners.length} banners`);
      } catch (error) {
        console.error('[IndexBannerCarousel] Failed to load:', error);
        container.innerHTML = '<p style="color: white; text-align: center;">Failed to load summon banners</p>';
      }
    }

    navigateToSummon(bannerIndex = 0) {
      console.log(`[IndexBannerCarousel] Navigating to summon with banner ${bannerIndex}`);
      window.location.href = `summon.html?banner=${bannerIndex}`;
    }

    startAutoScroll() {
      const container = document.querySelector('.summon-banner-carousel');
      if (!container || this.banners.length <= 1) return;

      this.autoScrollInterval = setInterval(() => {
        this.currentIndex = (this.currentIndex + 1) % this.banners.length;

        // Smooth scroll to next banner
        const cards = container.querySelectorAll('.summon-banner-card');
        if (cards[this.currentIndex]) {
          cards[this.currentIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
      }, 4000); // Change every 4 seconds
    }

    destroy() {
      if (this.autoScrollInterval) {
        clearInterval(this.autoScrollInterval);
      }
    }
  }

  // Auto-initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.IndexBannerCarousel = new IndexBannerCarousel();
      window.IndexBannerCarousel.init();
    });
  } else {
    window.IndexBannerCarousel = new IndexBannerCarousel();
    window.IndexBannerCarousel.init();
  }

  console.log('[IndexBannerCarousel] Module loaded');
})();
