// js/summon/summon-banner-slideshow.js - Full-Width Banner Slideshow

class BannerSlideshow {
  constructor() {
    this.currentIndex = 0;
    this.banners = [];
    this.autoAdvanceInterval = null;
    this.autoAdvanceDelay = 5000; // 5 seconds per slide
    this.isTransitioning = false;
  }

  init(containerId = 'banner-slideshow') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.warn('Banner slideshow container not found');
      return;
    }

    this.loadBanners();
    this.createSlides();
    this.createNavigation();
    this.attachEventListeners();
    this.startAutoAdvance();
    this.initializePreviewSync();

    console.log('✅ Banner slideshow initialized with', this.banners.length, 'banners');
  }

  /**
   * Initialize preview sync - set first preview as active
   */
  initializePreviewSync() {
    const previewItems = document.querySelectorAll('.preview-item');
    if (previewItems.length > 0) {
      previewItems[0].classList.add('active');
    }
  }

  loadBanners() {
    // Define 13 banners - you can replace these with actual banner data
    this.banners = [
      {
        id: 1,
        image: 'assets/summon/banners/banner_1.png',
        title: 'Legendary Summon',
        subtitle: 'Increased rates for 6★ units'
      },
      {
        id: 2,
        image: 'assets/summon/banners/banner_2.png',
        title: 'Blazing Festival',
        subtitle: 'Exclusive Blazing Fest characters'
      },
      {
        id: 3,
        image: 'assets/summon/banners/banner_3.png',
        title: 'New Year Special',
        subtitle: 'Limited-time celebration banner'
      },
      {
        id: 4,
        image: 'assets/summon/banners/banner_4.png',
        title: 'Anniversary Banner',
        subtitle: 'Guaranteed 6★ on final step'
      },
      {
        id: 5,
        image: 'assets/summon/banners/banner_5.png',
        title: 'Clan Legends',
        subtitle: 'Featured: Uchiha & Senju'
      },
      {
        id: 6,
        image: 'assets/summon/banners/banner_6.png',
        title: 'Hokage Collection',
        subtitle: 'All Hokage units available'
      },
      {
        id: 7,
        image: 'assets/summon/banners/banner_7.png',
        title: 'Akatsuki Rising',
        subtitle: 'Exclusive villain summon'
      },
      {
        id: 8,
        image: 'assets/summon/banners/banner_8.png',
        title: 'Team 7 Reunion',
        subtitle: 'Classic characters return'
      },
      {
        id: 9,
        image: 'assets/summon/banners/banner_9.png',
        title: 'Sage Mode Masters',
        subtitle: 'Special ability boost'
      },
      {
        id: 10,
        image: 'assets/summon/banners/banner_10.png',
        title: 'Bijuu Unleashed',
        subtitle: 'Tailed Beast transformations'
      },
      {
        id: 11,
        image: 'assets/summon/banners/banner_11.png',
        title: 'War Arc Heroes',
        subtitle: 'Final battle units'
      },
      {
        id: 12,
        image: 'assets/summon/banners/banner_12.png',
        title: 'Next Generation',
        subtitle: 'Boruto series characters'
      },
      {
        id: 13,
        image: 'assets/summon/banners/banner_13.png',
        title: 'Ultimate Legends',
        subtitle: 'All-star collection'
      }
    ];
  }

  createSlides() {
    this.container.innerHTML = '';

    this.banners.forEach((banner, index) => {
      const slide = document.createElement('div');
      slide.className = `banner-slide${index === 0 ? ' active' : ''}`;
      slide.dataset.index = index;

      slide.innerHTML = `
        <img src="${banner.image}"
             alt="${banner.title}"
             onerror="this.src='assets/Main Background/summon_bg.png'">
        <div class="banner-info-overlay">
          <div class="banner-info-title">${banner.title}</div>
          <div class="banner-info-subtitle">${banner.subtitle}</div>
        </div>
      `;

      this.container.appendChild(slide);
    });

    // Add progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'banner-progress';
    progressBar.id = 'banner-progress';
    this.container.appendChild(progressBar);
  }

  createNavigation() {
    // Create arrow controls
    const leftArrow = document.createElement('button');
    leftArrow.className = 'banner-arrow left';
    leftArrow.innerHTML = '◀';
    leftArrow.id = 'banner-arrow-left';
    this.container.appendChild(leftArrow);

    const rightArrow = document.createElement('button');
    rightArrow.className = 'banner-arrow right';
    rightArrow.innerHTML = '▶';
    rightArrow.id = 'banner-arrow-right';
    this.container.appendChild(rightArrow);

    // Create dots
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'banner-nav-dots';
    dotsContainer.id = 'banner-dots';

    this.banners.forEach((_, index) => {
      const dot = document.createElement('div');
      dot.className = `banner-dot${index === 0 ? ' active' : ''}`;
      dot.dataset.index = index;
      dotsContainer.appendChild(dot);
    });

    this.container.appendChild(dotsContainer);
  }

  attachEventListeners() {
    // Arrow controls
    const leftArrow = document.getElementById('banner-arrow-left');
    const rightArrow = document.getElementById('banner-arrow-right');

    if (leftArrow) {
      leftArrow.addEventListener('click', () => this.previous());
    }

    if (rightArrow) {
      rightArrow.addEventListener('click', () => this.next());
    }

    // Dot navigation
    const dots = document.querySelectorAll('.banner-dot');
    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const index = parseInt(dot.dataset.index);
        this.goToSlide(index);
      });
    });

    // Preview sync - clicking preview updates main slideshow
    const previewItems = document.querySelectorAll('.preview-item');
    previewItems.forEach((item, index) => {
      item.addEventListener('click', () => {
        // Map preview index to slideshow index
        if (index < this.banners.length) {
          this.goToSlide(index);
        }
      });
    });

    // Pause on hover
    this.container.addEventListener('mouseenter', () => this.pauseAutoAdvance());
    this.container.addEventListener('mouseleave', () => this.resumeAutoAdvance());
  }

  next() {
    if (this.isTransitioning) return;
    this.goToSlide((this.currentIndex + 1) % this.banners.length);
  }

  previous() {
    if (this.isTransitioning) return;
    this.goToSlide((this.currentIndex - 1 + this.banners.length) % this.banners.length);
  }

  goToSlide(index) {
    if (index === this.currentIndex || this.isTransitioning) return;

    this.isTransitioning = true;

    const slides = this.container.querySelectorAll('.banner-slide');
    const dots = document.querySelectorAll('.banner-dot');
    const currentSlide = slides[this.currentIndex];
    const nextSlide = slides[index];

    // Add blur-out animation to current slide
    currentSlide.classList.add('transitioning-out');
    currentSlide.classList.remove('active');

    // Add blur-in animation to next slide
    nextSlide.classList.add('transitioning-in', 'active');

    // Update dots
    dots[this.currentIndex].classList.remove('active');
    dots[index].classList.add('active');

    // Reset progress bar
    this.resetProgressBar();

    setTimeout(() => {
      currentSlide.classList.remove('transitioning-out');
      nextSlide.classList.remove('transitioning-in');
      this.isTransitioning = false;
    }, 800);

    this.currentIndex = index;

    // Sync with preview - update preview active state
    this.syncPreview(index);

    // ✨ CRITICAL FIX: Actually switch the summon banner!
    // This connects the visual banner to the actual summon system
    if (window.SummonSystem && typeof window.SummonSystem.loadBanner === 'function') {
      window.SummonSystem.loadBanner(index);
      console.log(`🎯 Banner switched to index ${index}`);
    }
  }

  /**
   * Sync preview items with current slideshow index
   */
  syncPreview(index) {
    const previewItems = document.querySelectorAll('.preview-item');
    previewItems.forEach((item, i) => {
      if (i === index) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  startAutoAdvance() {
    this.autoAdvanceInterval = setInterval(() => {
      this.next();
    }, this.autoAdvanceDelay);

    // Start progress bar
    this.animateProgressBar();
  }

  pauseAutoAdvance() {
    if (this.autoAdvanceInterval) {
      clearInterval(this.autoAdvanceInterval);
      this.autoAdvanceInterval = null;
    }

    // Pause progress bar
    const progressBar = document.getElementById('banner-progress');
    if (progressBar) {
      progressBar.style.animationPlayState = 'paused';
    }
  }

  resumeAutoAdvance() {
    if (!this.autoAdvanceInterval) {
      this.startAutoAdvance();
    }
  }

  animateProgressBar() {
    const progressBar = document.getElementById('banner-progress');
    if (!progressBar) return;

    progressBar.classList.remove('active');
    void progressBar.offsetWidth; // Force reflow
    progressBar.classList.add('active');
  }

  resetProgressBar() {
    const progressBar = document.getElementById('banner-progress');
    if (progressBar) {
      progressBar.classList.remove('active');
      void progressBar.offsetWidth; // Force reflow
      progressBar.classList.add('active');
    }
  }

  destroy() {
    if (this.autoAdvanceInterval) {
      clearInterval(this.autoAdvanceInterval);
    }
  }
}

// Global instance
window.BannerSlideshow = new BannerSlideshow();

console.log('✅ Banner Slideshow module loaded');
