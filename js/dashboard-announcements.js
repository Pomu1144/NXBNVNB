// js/dashboard-announcements.js - Announcement Banner System

class DashboardAnnouncements {
  constructor() {
    this.announcements = [];
    this.currentIndex = 0;
    this.autoRotateInterval = null;
    this.container = null;
  }

  async init(containerId = 'announcement-banner-container') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.warn('Announcement container not found');
      return;
    }

    await this.loadAnnouncements();
    this.filterActiveAnnouncements();
    this.render();
    this.startAutoRotate();

    console.log('✅ Dashboard Announcements initialized with', this.announcements.length, 'active announcements');
  }

  async loadAnnouncements() {
    try {
      const response = await fetch('data/announcements.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      this.announcements = data.announcements || [];
      this.autoRotateInterval = data.displaySettings?.autoRotateInterval || 8000;
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
  }

  render() {
    if (this.announcements.length === 0) {
      this.container.innerHTML = '<div style="display: none;"></div>';
      return;
    }

    const announcement = this.announcements[this.currentIndex];

    this.container.innerHTML = `
      <div class="announcement-banner" onclick="window.DashboardAnnouncements.showDetails(${this.currentIndex})">
        <div class="announcement-header">
          <span class="announcement-icon">${announcement.icon || '📢'}</span>
          <div class="announcement-title">${announcement.title}</div>
          <span class="announcement-priority ${announcement.priority}">${announcement.priority}</span>
        </div>
        <div class="announcement-message">${announcement.message}</div>
        ${this.renderDateRange(announcement)}
      </div>
      ${this.renderDots()}
    `;
  }

  renderDateRange(announcement) {
    if (!announcement.dateEnd) return '';

    const endDate = new Date(announcement.dateEnd);
    const now = new Date();
    const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining > 0) {
      return `<div class="announcement-date">Ends in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</div>`;
    }

    return '';
  }

  renderDots() {
    if (this.announcements.length <= 1) return '';

    const dots = this.announcements.map((_, index) => {
      const activeClass = index === this.currentIndex ? 'active' : '';
      return `<div class="announcement-dot ${activeClass}" onclick="window.DashboardAnnouncements.goToAnnouncement(${index})"></div>`;
    }).join('');

    return `<div class="announcement-dots">${dots}</div>`;
  }

  showDetails(index) {
    const announcement = this.announcements[index];
    if (!announcement) return;

    let detailsMessage = `${announcement.message}\n\n`;

    if (announcement.dateStart && announcement.dateEnd) {
      const startDate = new Date(announcement.dateStart).toLocaleDateString();
      const endDate = new Date(announcement.dateEnd).toLocaleDateString();
      detailsMessage += `Period: ${startDate} - ${endDate}\n`;
    }

    if (announcement.type === 'banner' && announcement.bannerId) {
      detailsMessage += `\nThis announcement is related to the "${announcement.title}" summon banner.`;
    }

    alert(`📢 ${announcement.title}\n\n${detailsMessage}`);
  }

  goToAnnouncement(index) {
    if (index < 0 || index >= this.announcements.length) return;

    this.currentIndex = index;
    this.render();
    this.resetAutoRotate();
  }

  next() {
    if (this.announcements.length === 0) return;

    this.currentIndex = (this.currentIndex + 1) % this.announcements.length;
    this.render();
  }

  previous() {
    if (this.announcements.length === 0) return;

    this.currentIndex = (this.currentIndex - 1 + this.announcements.length) % this.announcements.length;
    this.render();
  }

  startAutoRotate() {
    if (this.announcements.length <= 1) return;

    this.autoRotateInterval = setInterval(() => {
      this.next();
    }, this.autoRotateInterval);
  }

  stopAutoRotate() {
    if (this.autoRotateInterval) {
      clearInterval(this.autoRotateInterval);
      this.autoRotateInterval = null;
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
window.DashboardAnnouncements = new DashboardAnnouncements();

console.log('✅ Dashboard Announcements module loaded');
