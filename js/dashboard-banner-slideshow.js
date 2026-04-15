// js/dashboard-banner-slideshow.js - Main Banner Slideshow for Index Page

class DashboardBannerSlideshow {
  constructor() {
    this.currentIndex = 0;
    this.banners = [];
    this.autoAdvanceInterval = null;
    this.autoAdvanceDelay = 5000; // 5 seconds per slide
    this.isTransitioning = false;
    this.container = null;
  }

  async init(containerId = 'dashboard-banner-slideshow') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.warn('Dashboard banner slideshow container not found');
      return;
    }

    await this.loadBanners();
    this.createSlides();
    this.createNavigation();
    this.attachEventListeners();
    this.startAutoAdvance();

    console.log('✅ Dashboard Banner slideshow initialized with', this.banners.length, 'banners');
  }

  async loadBanners() {
    try {
      const response = await fetch('data/summon.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();

      // Load all banners from summon.json
      this.banners = (data.banners || []).map(banner => ({
        id: banner.id,
        image: banner.image,
        title: banner.name,
        subtitle: banner.description,
        type: banner.type
      }));

    } catch (error) {
      console.error('Failed to load banners:', error);
      this.banners = [];
    }
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
    progressBar.id = 'dashboard-banner-progress';
    this.container.appendChild(progressBar);
  }

  createNavigation() {
    // Create arrow controls
    const leftArrow = document.createElement('button');
    leftArrow.className = 'banner-arrow left';
    leftArrow.innerHTML = '◀';
    leftArrow.id = 'dashboard-banner-arrow-left';
    this.container.appendChild(leftArrow);

    const rightArrow = document.createElement('button');
    rightArrow.className = 'banner-arrow right';
    rightArrow.innerHTML = '▶';
    rightArrow.id = 'dashboard-banner-arrow-right';
    this.container.appendChild(rightArrow);

    // Create dots
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'banner-nav-dots';
    dotsContainer.id = 'dashboard-banner-dots';

    this.banners.forEach((_, index) => {
      const dot = document.createElement('div');
      dot.className = `banner-dot${index === 0 ? ' active' : ''}`;
      dot.dataset.index = index;
      dotsContainer.appendChild(dot);
    });

    this.container.appendChild(dotsContainer);
  }

  attachEventListeners() {
    // ===== INTERACTIVE CONTROLS DISABLED - Visual only mode =====
    // Arrow controls - DISABLED
    // const leftArrow = document.getElementById('dashboard-banner-arrow-left');
    // const rightArrow = document.getElementById('dashboard-banner-arrow-right');

    // if (leftArrow) {
    //   leftArrow.addEventListener('click', () => this.previous());
    // }

    // if (rightArrow) {
    //   rightArrow.addEventListener('click', () => this.next());
    // }

    // Dot navigation - DISABLED
    // const dots = this.container.querySelectorAll('.banner-dot');
    // dots.forEach(dot => {
    //   dot.addEventListener('click', () => {
    //     const index = parseInt(dot.dataset.index);
    //     this.goToSlide(index);
    //   });
    // });

    // Pause on hover - DISABLED (auto-advance continues regardless of mouse)
    // this.container.addEventListener('mouseenter', () => this.pauseAutoAdvance());
    // this.container.addEventListener('mouseleave', () => this.resumeAutoAdvance());
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
    const dots = this.container.querySelectorAll('.banner-dot');
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
  }

  startAutoAdvance() {
    if (this.banners.length <= 1) return;

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
    const progressBar = document.getElementById('dashboard-banner-progress');
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
    const progressBar = document.getElementById('dashboard-banner-progress');
    if (!progressBar) return;

    progressBar.classList.remove('active');
    void progressBar.offsetWidth; // Force reflow
    progressBar.classList.add('active');
  }

  resetProgressBar() {
    const progressBar = document.getElementById('dashboard-banner-progress');
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
window.DashboardBannerSlideshow = new DashboardBannerSlideshow();

console.log('✅ Dashboard Banner Slideshow module loaded');
