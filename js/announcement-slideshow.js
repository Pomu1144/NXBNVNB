// js/announcement-slideshow.js - Top Right Announcement Slideshow

class AnnouncementSlideshow {
  constructor() {
    this.announcements = [];
    this.currentIndex = 0;
    this.autoRotateTimer = null;
    this.autoRotateInterval = 5000; // 5 seconds
    this.container = null;
    this.track = null;
  }

  async init() {
    this.container = document.querySelector('.announcement-slideshow');
    this.track = document.querySelector('.announcement-track');

    if (!this.container || !this.track) {
      console.warn('Announcement slideshow container not found');
      return;
    }

    await this.loadAnnouncements();
    this.filterActiveAnnouncements();
    this.render();
    this.startAutoRotate();

    console.log('✅ Announcement Slideshow initialized with', this.announcements.length, 'active announcements');
  }

  async loadAnnouncements() {
    try {
      const response = await fetch('data/announcements.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      this.announcements = data.announcements || [];
      this.autoRotateInterval = data.displaySettings?.autoRotateInterval || 5000;
    } catch (error) {
      console.error('Failed to load announcements:', error);
      this.announcements = [];
    }
  }

  filterActiveAnnouncements() {
    const now = new Date();

    // Filter announcements that are currently active
    this.announcements = this.announcements.filter(announcement => {
      if (!announcement.dateStart || !announcement.dateEnd) return true;

      const startDate = new Date(announcement.dateStart);
      const endDate = new Date(announcement.dateEnd);

      return now >= startDate && now <= endDate;
    });

    // Sort by priority (high > medium > low)
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    this.announcements.sort((a, b) => {
      const aPriority = priorityOrder[a.priority] || 0;
      const bPriority = priorityOrder[b.priority] || 0;
      return bPriority - aPriority;
    });

    // Limit to top 5 announcements
    this.announcements = this.announcements.slice(0, 5);
  }

  render() {
    if (this.announcements.length === 0) {
      this.container.style.display = 'none';
      return;
    }

    // Render slides
    this.track.innerHTML = this.announcements.map((announcement, index) => `
      <div class="announcement-slide" data-index="${index}">
        <h3>${announcement.icon || '📢'} ${announcement.title}</h3>
        <p>${this.truncateMessage(announcement.message, 80)}</p>
      </div>
    `).join('');

    // Render navigation dots
    const dotsContainer = document.querySelector('.announcement-nav-dots');
    if (dotsContainer && this.announcements.length > 1) {
      dotsContainer.innerHTML = this.announcements.map((_, index) => {
        const activeClass = index === this.currentIndex ? 'active' : '';
        return `<div class="announcement-dot ${activeClass}" data-index="${index}"></div>`;
      }).join('');

      // Add click handlers to dots
      dotsContainer.querySelectorAll('.announcement-dot').forEach((dot, index) => {
        dot.addEventListener('click', () => this.goToSlide(index));
      });
    }

    this.updateSlidePosition();
  }

  truncateMessage(message, maxLength) {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  }

  updateSlidePosition() {
    const offset = -this.currentIndex * 100;
    this.track.style.transform = `translateX(${offset}%)`;

    // Update active dot
    const dots = document.querySelectorAll('.announcement-dot');
    dots.forEach((dot, index) => {
      if (index === this.currentIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  goToSlide(index) {
    if (index < 0 || index >= this.announcements.length) return;
    this.currentIndex = index;
    this.updateSlidePosition();
    this.resetAutoRotate();
  }

  next() {
    if (this.announcements.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.announcements.length;
    this.updateSlidePosition();
  }

  previous() {
    if (this.announcements.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.announcements.length) % this.announcements.length;
    this.updateSlidePosition();
  }

  startAutoRotate() {
    if (this.announcements.length <= 1) return;

    this.autoRotateTimer = setInterval(() => {
      this.next();
    }, this.autoRotateInterval);
  }

  stopAutoRotate() {
    if (this.autoRotateTimer) {
      clearInterval(this.autoRotateTimer);
      this.autoRotateTimer = null;
    }
  }

  resetAutoRotate() {
    this.stopAutoRotate();
    this.startAutoRotate();
  }

  destroy() {
    this.stopAutoRotate();
  }
}

// Global instance
window.AnnouncementSlideshow = new AnnouncementSlideshow();

console.log('✅ Announcement Slideshow module loaded');
