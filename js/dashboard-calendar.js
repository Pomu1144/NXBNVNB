// js/dashboard-calendar.js - Calendar and Daily Streak System

class DashboardCalendar {
  constructor() {
    this.streak = 0;
    this.lastLogin = null;
    this.calendarData = {};
  }

  init() {
    this.loadStreakData();
    this.updateStreak();
    console.log('✅ Dashboard Calendar initialized - Current streak:', this.streak, 'days');
  }

  loadStreakData() {
    const saved = localStorage.getItem('dailyStreak');
    if (saved) {
      const data = JSON.parse(saved);
      this.streak = data.streak || 0;
      this.lastLogin = data.lastLogin ? new Date(data.lastLogin) : null;
      this.calendarData = data.calendarData || {};
    }
  }

  saveStreakData() {
    const data = {
      streak: this.streak,
      lastLogin: this.lastLogin ? this.lastLogin.toISOString() : null,
      calendarData: this.calendarData
    };
    localStorage.setItem('dailyStreak', JSON.stringify(data));
  }

  updateStreak() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!this.lastLogin) {
      // First time login
      this.streak = 1;
      this.lastLogin = today;
      this.markDay(today);
      this.saveStreakData();
      return;
    }

    const lastLoginDate = new Date(this.lastLogin);
    lastLoginDate.setHours(0, 0, 0, 0);

    const daysDifference = Math.floor((today - lastLoginDate) / (1000 * 60 * 60 * 24));

    if (daysDifference === 0) {
      // Same day - no change
      return;
    } else if (daysDifference === 1) {
      // Next day - increment streak
      this.streak++;
      this.lastLogin = today;
      this.markDay(today);
      this.saveStreakData();
    } else {
      // Streak broken - reset
      this.streak = 1;
      this.lastLogin = today;
      this.calendarData = {};
      this.markDay(today);
      this.saveStreakData();
    }
  }

  markDay(date) {
    const dateKey = this.getDateKey(date);
    this.calendarData[dateKey] = {
      loginDate: date.toISOString(),
      marked: true
    };
  }

  getDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  }

  getStreak() {
    return this.streak;
  }

  openCalendar() {
    this.showCalendarModal();
  }

  showCalendarModal() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const calendarHTML = this.generateCalendarHTML(currentYear, currentMonth);

    const modalHTML = `
      <div class="calendar-modal" id="calendar-modal">
        <div class="calendar-overlay" onclick="window.DashboardCalendar.closeCalendar()"></div>
        <div class="calendar-content">
          <div class="calendar-header">
            <h2 class="calendar-title">Daily Login Calendar</h2>
            <button class="calendar-close" onclick="window.DashboardCalendar.closeCalendar()">✕</button>
          </div>
          <div class="calendar-streak-display">
            <div class="streak-icon">🔥</div>
            <div class="streak-text">
              <div class="streak-label">Current Streak</div>
              <div class="streak-value">${this.streak} Day${this.streak !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <div class="calendar-grid-container">
            ${calendarHTML}
          </div>
          <div class="calendar-footer">
            <p>Keep logging in daily to maintain your streak!</p>
          </div>
        </div>
      </div>
    `;

    // Remove existing modal if present
    const existingModal = document.getElementById('calendar-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add CSS for calendar modal
    this.injectCalendarStyles();
  }

  generateCalendarHTML(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

    let html = `
      <div class="calendar-month-header">
        <h3>${monthNames[month]} ${year}</h3>
      </div>
      <div class="calendar-weekdays">
        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
      </div>
      <div class="calendar-days">
    `;

    // Empty cells before first day
    for (let i = 0; i < startingDayOfWeek; i++) {
      html += '<div class="calendar-day empty"></div>';
    }

    // Days of the month
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = this.getDateKey(date);
      const isMarked = this.calendarData[dateKey]?.marked || false;
      const isToday = date.getTime() === today.getTime();

      let dayClass = 'calendar-day';
      if (isMarked) dayClass += ' marked';
      if (isToday) dayClass += ' today';

      html += `
        <div class="${dayClass}">
          <span class="day-number">${day}</span>
          ${isMarked ? '<span class="day-check">✓</span>' : ''}
        </div>
      `;
    }

    html += '</div>';

    return html;
  }

  injectCalendarStyles() {
    if (document.getElementById('calendar-modal-styles')) return;

    const styles = `
      <style id="calendar-modal-styles">
        .calendar-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .calendar-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(5px);
        }

        .calendar-content {
          position: relative;
          background: linear-gradient(135deg, rgba(26, 31, 58, 0.98), rgba(15, 20, 35, 0.98));
          border: 3px solid #b8985f;
          border-radius: 16px;
          padding: 30px;
          max-width: 600px;
          width: 90%;
          box-shadow: 0 10px 50px rgba(0, 0, 0, 0.9);
          max-height: 90vh;
          overflow-y: auto;
        }

        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid rgba(184, 152, 95, 0.3);
        }

        .calendar-title {
          font-family: 'Times New Roman', Times, serif;
          font-size: 28px;
          font-weight: 700;
          color: #d4af37;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
          margin: 0;
        }

        .calendar-close {
          background: rgba(220, 53, 69, 0.2);
          border: 2px solid rgba(220, 53, 69, 0.5);
          color: #ff6b6b;
          font-size: 24px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .calendar-close:hover {
          background: rgba(220, 53, 69, 0.4);
          transform: scale(1.1);
        }

        .calendar-streak-display {
          display: flex;
          align-items: center;
          gap: 20px;
          background: rgba(212, 175, 55, 0.1);
          border: 2px solid rgba(212, 175, 55, 0.3);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 25px;
        }

        .streak-icon {
          font-size: 48px;
          filter: drop-shadow(0 2px 8px rgba(255, 100, 0, 0.8));
        }

        .streak-text {
          flex: 1;
        }

        .streak-label {
          font-family: 'Times New Roman', Times, serif;
          font-size: 14px;
          color: #b8985f;
          font-weight: 600;
          margin-bottom: 5px;
        }

        .streak-value {
          font-family: 'Times New Roman', Times, serif;
          font-size: 32px;
          font-weight: 700;
          color: #d4af37;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
        }

        .calendar-month-header h3 {
          font-family: 'Times New Roman', Times, serif;
          font-size: 22px;
          font-weight: 700;
          color: #d4af37;
          text-align: center;
          margin: 0 0 15px 0;
        }

        .calendar-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 5px;
          margin-bottom: 10px;
        }

        .calendar-weekdays div {
          font-family: 'Times New Roman', Times, serif;
          font-size: 14px;
          font-weight: 600;
          color: #b8985f;
          text-align: center;
          padding: 10px 0;
        }

        .calendar-days {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 5px;
        }

        .calendar-day {
          aspect-ratio: 1;
          background: rgba(20, 20, 30, 0.6);
          border: 1px solid rgba(139, 115, 85, 0.3);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          transition: all 0.3s ease;
        }

        .calendar-day.empty {
          background: transparent;
          border: none;
        }

        .calendar-day.today {
          border: 2px solid #d4af37;
          box-shadow: 0 0 15px rgba(212, 175, 55, 0.5);
        }

        .calendar-day.marked {
          background: rgba(40, 167, 69, 0.3);
          border-color: rgba(40, 167, 69, 0.6);
        }

        .day-number {
          font-size: 16px;
          font-weight: 600;
          color: #f0e6d1;
        }

        .day-check {
          position: absolute;
          bottom: 4px;
          right: 4px;
          font-size: 12px;
          color: #6bcf7f;
        }

        .calendar-footer {
          margin-top: 20px;
          padding-top: 15px;
          border-top: 2px solid rgba(184, 152, 95, 0.3);
          text-align: center;
        }

        .calendar-footer p {
          font-family: 'Times New Roman', Times, serif;
          font-size: 14px;
          color: #b8985f;
          margin: 0;
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }

  closeCalendar() {
    const modal = document.getElementById('calendar-modal');
    if (modal) {
      modal.remove();
    }
  }
}

// Global instance
window.DashboardCalendar = new DashboardCalendar();

console.log('✅ Dashboard Calendar module loaded');
