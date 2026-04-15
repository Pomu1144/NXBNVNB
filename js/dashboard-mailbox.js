// js/dashboard-mailbox.js - Mailbox System

class DashboardMailbox {
  constructor() {
    this.messages = [];
    this.unreadCount = 0;
  }

  init() {
    this.loadMessages();
    this.updateUnreadCount();
    console.log('✅ Dashboard Mailbox initialized - Unread messages:', this.unreadCount);
  }

  loadMessages() {
    const saved = localStorage.getItem('mailboxMessages');
    if (saved) {
      this.messages = JSON.parse(saved);
    } else {
      // Initialize with welcome message
      this.messages = [
        {
          id: 'welcome_001',
          title: 'Welcome to Naruto Blazing!',
          message: 'Thank you for playing! Here are some starter rewards to help you begin your ninja journey.',
          date: new Date().toISOString(),
          read: false,
          rewards: {
            'Ninja Pearls': 50,
            'Ryo': 10000,
            'Shinobites': 5
          }
        }
      ];
      this.saveMessages();
    }
  }

  saveMessages() {
    localStorage.setItem('mailboxMessages', JSON.stringify(this.messages));
  }

  updateUnreadCount() {
    this.unreadCount = this.messages.filter(msg => !msg.read).length;
  }

  getUnreadCount() {
    return this.unreadCount;
  }

  addMessage(message) {
    const newMessage = {
      id: `msg_${Date.now()}`,
      title: message.title || 'New Message',
      message: message.message || '',
      date: new Date().toISOString(),
      read: false,
      rewards: message.rewards || null
    };

    this.messages.unshift(newMessage);
    this.saveMessages();
    this.updateUnreadCount();
  }

  markAsRead(messageId) {
    const message = this.messages.find(msg => msg.id === messageId);
    if (message && !message.read) {
      message.read = true;
      this.saveMessages();
      this.updateUnreadCount();
    }
  }

  openMailbox() {
    this.showMailboxModal();
  }

  showMailboxModal() {
    const messagesHTML = this.messages.map((msg, index) => {
      const date = new Date(msg.date).toLocaleDateString();
      const readClass = msg.read ? 'read' : 'unread';
      const hasRewards = msg.rewards && Object.keys(msg.rewards).length > 0;

      return `
        <div class="mail-item ${readClass}" onclick="window.DashboardMailbox.viewMessage(${index})">
          <div class="mail-header">
            ${!msg.read ? '<span class="mail-unread-dot"></span>' : ''}
            <div class="mail-title">${msg.title}</div>
            <div class="mail-date">${date}</div>
          </div>
          <div class="mail-preview">${msg.message.substring(0, 80)}${msg.message.length > 80 ? '...' : ''}</div>
          ${hasRewards ? '<div class="mail-has-rewards">📦 Contains Rewards</div>' : ''}
        </div>
      `;
    }).join('');

    const modalHTML = `
      <div class="mailbox-modal" id="mailbox-modal">
        <div class="mailbox-overlay" onclick="window.DashboardMailbox.closeMailbox()"></div>
        <div class="mailbox-content">
          <div class="mailbox-header">
            <h2 class="mailbox-title">🎁 Present Box</h2>
            <button class="mailbox-close" onclick="window.DashboardMailbox.closeMailbox()">✕</button>
          </div>
          <div class="mailbox-stats">
            <div class="mailbox-stat">
              <span class="stat-label">Total Messages:</span>
              <span class="stat-value">${this.messages.length}</span>
            </div>
            <div class="mailbox-stat">
              <span class="stat-label">Unread:</span>
              <span class="stat-value unread">${this.unreadCount}</span>
            </div>
          </div>
          <div class="mailbox-list">
            ${messagesHTML.length > 0 ? messagesHTML : '<div class="no-messages">No messages</div>'}
          </div>
        </div>
      </div>
    `;

    // Remove existing modal if present
    const existingModal = document.getElementById('mailbox-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add CSS for mailbox modal
    this.injectMailboxStyles();
  }

  viewMessage(index) {
    const message = this.messages[index];
    if (!message) return;

    // Mark as read
    this.markAsRead(message.id);

    let rewardsHTML = '';
    const hasCharacterRewards = message.rewards && message.rewards.characters && message.rewards.characters.length > 0;
    const hasResourceRewards = message.rewards && message.rewards.resources && message.rewards.resources.length > 0;
    const hasLegacyRewards = message.rewards && !hasCharacterRewards && !hasResourceRewards && Object.keys(message.rewards).length > 0;

    if (hasCharacterRewards || hasResourceRewards || hasLegacyRewards) {
      rewardsHTML = '<div class="message-rewards"><h4>Rewards:</h4><ul>';

      // Character rewards
      if (hasCharacterRewards) {
        message.rewards.characters.forEach(char => {
          const alreadyClaimed = message.claimed && message.claimed.includes(`char_${char.characterId}`);
          const claimStatus = alreadyClaimed ? ' (Claimed)' : '';
          rewardsHTML += `<li class="${alreadyClaimed ? 'reward-claimed' : ''}">Character: ${char.characterId} x${char.quantity}${claimStatus}</li>`;
        });
      }

      // Resource rewards
      if (hasResourceRewards) {
        message.rewards.resources.forEach(res => {
          rewardsHTML += `<li>${res.name}: ${res.quantity}</li>`;
        });
      }

      // Legacy rewards (backward compatibility)
      if (hasLegacyRewards) {
        for (const [item, amount] of Object.entries(message.rewards)) {
          if (item !== 'characters' && item !== 'resources') {
            rewardsHTML += `<li>${item}: ${amount}</li>`;
          }
        }
      }

      rewardsHTML += '</ul>';

      // Add claim button if there are unclaimed character rewards
      if (hasCharacterRewards && !message.allClaimed) {
        rewardsHTML += `<button class="btn-claim-rewards" onclick="window.DashboardMailbox.claimRewards(${index})">Claim Rewards</button>`;
      }

      rewardsHTML += '</div>';
    }

    const date = new Date(message.date).toLocaleString();

    const messageHTML = `
      <div class="message-view-modal" id="message-view-modal">
        <div class="message-overlay" onclick="window.DashboardMailbox.closeMessageView()"></div>
        <div class="message-content">
          <div class="message-header">
            <h3>${message.title}</h3>
            <button class="message-close" onclick="window.DashboardMailbox.closeMessageView()">✕</button>
          </div>
          <div class="message-date">${date}</div>
          <div class="message-body">${message.message}</div>
          ${rewardsHTML}
          <button class="btn-message-ok" onclick="window.DashboardMailbox.closeMessageView()">OK</button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', messageHTML);
    this.injectMessageViewStyles();

    // Update the mailbox view to reflect read status
    this.closeMailbox();
    setTimeout(() => this.openMailbox(), 300);
  }

  showCustomAlert(title, message, type = 'info') {
    const alertHTML = `
      <div class="custom-alert-modal" id="custom-alert-modal">
        <div class="custom-alert-overlay" onclick="document.getElementById('custom-alert-modal').remove()"></div>
        <div class="custom-alert-content ${type}">
          <div class="custom-alert-header">
            <h3>${title}</h3>
          </div>
          <div class="custom-alert-body">${message}</div>
          <button class="custom-alert-ok" onclick="document.getElementById('custom-alert-modal').remove()">OK</button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', alertHTML);
    this.injectCustomAlertStyles();
  }

  claimRewards(index) {
    const message = this.messages[index];
    if (!message || !message.rewards || !message.rewards.characters) {
      this.showCustomAlert('No Rewards', 'No rewards to claim!', 'error');
      return;
    }

    if (message.allClaimed) {
      this.showCustomAlert('Already Claimed', 'All rewards have already been claimed!', 'error');
      return;
    }

    // Check if InventoryChar is available
    if (typeof window.InventoryChar === 'undefined') {
      this.showCustomAlert('System Error', 'Character inventory system not available. Please return to home page and try again.', 'error');
      return;
    }

    // Add characters to inventory
    const charactersClaimed = [];
    const characterDetails = []; // Store character details for better display

    message.rewards.characters.forEach(charReward => {
      const alreadyClaimed = message.claimed && message.claimed.includes(`char_${charReward.characterId}`);
      if (!alreadyClaimed) {
        // Add multiple copies
        for (let i = 0; i < charReward.quantity; i++) {
          window.InventoryChar.addCopy(charReward.characterId, 1, charReward.tierCode || '3S');
        }

        // Get character data for proper display
        const charData = window.CharacterInventory ? window.CharacterInventory.getCharacterById(charReward.characterId) : null;
        if (charData) {
          const starCount = charReward.tierCode ? parseInt(charReward.tierCode.charAt(0)) : 3;
          const stars = '★'.repeat(starCount);
          const displayName = `${charData.name} [${charData.version || 'Standard'}] ${stars}`;
          characterDetails.push(displayName);
        } else {
          characterDetails.push(`${charReward.characterId} x${charReward.quantity}`);
        }

        charactersClaimed.push(`${charReward.characterId} x${charReward.quantity}`);

        // Mark as claimed
        if (!message.claimed) message.claimed = [];
        message.claimed.push(`char_${charReward.characterId}`);
      }
    });

    if (charactersClaimed.length === 0) {
      this.showCustomAlert('Already Claimed', 'All character rewards have already been claimed!', 'error');
      return;
    }

    // Mark as all claimed if all rewards are claimed
    const totalCharRewards = message.rewards.characters.length;
    const claimedCharRewards = (message.claimed || []).filter(c => c.startsWith('char_')).length;
    if (totalCharRewards === claimedCharRewards) {
      message.allClaimed = true;
    }

    // Save messages
    this.saveMessages();

    // Show success message
    const displayMessage = characterDetails.length > 0
      ? characterDetails.map(d => `• ${d}`).join('<br>')
      : charactersClaimed.map(c => `• ${c}`).join('<br>');
    this.showCustomAlert('Rewards Claimed! 🎉', `You received:<br><br>${displayMessage}<br><br>Check your Characters page!`, 'success');

    // Refresh the message view
    this.closeMessageView();
    setTimeout(() => this.viewMessage(index), 100);
  }

  closeMessageView() {
    const modal = document.getElementById('message-view-modal');
    if (modal) {
      modal.remove();
    }
  }

  closeMailbox() {
    const modal = document.getElementById('mailbox-modal');
    if (modal) {
      modal.remove();
    }
  }

  injectMailboxStyles() {
    if (document.getElementById('mailbox-modal-styles')) return;

    const styles = `
      <style id="mailbox-modal-styles">
        .mailbox-modal {
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

        .mailbox-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(5px);
        }

        .mailbox-content {
          position: relative;
          background: linear-gradient(135deg, rgba(26, 31, 58, 0.98), rgba(15, 20, 35, 0.98));
          border: 3px solid #b8985f;
          border-radius: 16px;
          padding: 30px;
          max-width: 700px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 10px 50px rgba(0, 0, 0, 0.9);
        }

        .mailbox-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid rgba(184, 152, 95, 0.3);
        }

        .mailbox-title {
          font-family: 'Times New Roman', Times, serif;
          font-size: 28px;
          font-weight: 700;
          color: #d4af37;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
          margin: 0;
        }

        .mailbox-close {
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

        .mailbox-close:hover {
          background: rgba(220, 53, 69, 0.4);
          transform: scale(1.1);
        }

        .mailbox-stats {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
        }

        .mailbox-stat {
          flex: 1;
          background: rgba(20, 20, 30, 0.6);
          border: 1px solid rgba(139, 115, 85, 0.4);
          border-radius: 8px;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stat-label {
          font-size: 14px;
          color: #b8985f;
          font-weight: 600;
        }

        .stat-value {
          font-size: 18px;
          color: #d4af37;
          font-weight: 700;
        }

        .stat-value.unread {
          color: #ff6b6b;
        }

        .mailbox-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .mail-item {
          background: rgba(20, 20, 30, 0.6);
          border: 2px solid rgba(139, 115, 85, 0.4);
          border-radius: 10px;
          padding: 15px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
        }

        .mail-item:hover {
          border-color: rgba(212, 175, 55, 0.7);
          background: rgba(30, 30, 40, 0.7);
          transform: translateX(5px);
        }

        .mail-item.unread {
          border-color: rgba(255, 193, 7, 0.6);
          background: rgba(255, 193, 7, 0.05);
        }

        .mail-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .mail-unread-dot {
          width: 10px;
          height: 10px;
          background: #ff6b6b;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .mail-title {
          font-family: 'Times New Roman', Times, serif;
          font-size: 16px;
          font-weight: 700;
          color: #d4af37;
          flex: 1;
        }

        .mail-date {
          font-size: 12px;
          color: #b8985f;
        }

        .mail-preview {
          font-size: 14px;
          color: #f0e6d1;
          line-height: 1.4;
        }

        .mail-has-rewards {
          margin-top: 8px;
          font-size: 12px;
          color: #6bcf7f;
          font-weight: 600;
        }

        .no-messages {
          text-align: center;
          padding: 40px;
          color: #b8985f;
          font-size: 16px;
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }

  injectMessageViewStyles() {
    if (document.getElementById('message-view-styles')) return;

    const styles = `
      <style id="message-view-styles">
        .message-view-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .message-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(5px);
        }

        .message-content {
          position: relative;
          background: linear-gradient(135deg, rgba(26, 31, 58, 0.98), rgba(15, 20, 35, 0.98));
          border: 3px solid #d4af37;
          border-radius: 16px;
          padding: 30px;
          max-width: 600px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 10px 50px rgba(0, 0, 0, 0.9);
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 15px;
          padding-bottom: 15px;
          border-bottom: 2px solid rgba(184, 152, 95, 0.3);
        }

        .message-header h3 {
          font-family: 'Times New Roman', Times, serif;
          font-size: 24px;
          font-weight: 700;
          color: #d4af37;
          margin: 0;
          flex: 1;
        }

        .message-close {
          background: rgba(220, 53, 69, 0.2);
          border: 2px solid rgba(220, 53, 69, 0.5);
          color: #ff6b6b;
          font-size: 24px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.3s ease;
          flex-shrink: 0;
        }

        .message-close:hover {
          background: rgba(220, 53, 69, 0.4);
          transform: scale(1.1);
        }

        .message-date {
          font-size: 12px;
          color: #b8985f;
          margin-bottom: 20px;
          font-style: italic;
        }

        .message-body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 16px;
          color: #f0e6d1;
          line-height: 1.6;
          margin-bottom: 20px;
        }

        .message-rewards {
          background: rgba(40, 167, 69, 0.1);
          border: 2px solid rgba(40, 167, 69, 0.4);
          border-radius: 10px;
          padding: 15px;
          margin-bottom: 20px;
        }

        .message-rewards h4 {
          font-family: 'Times New Roman', Times, serif;
          font-size: 18px;
          color: #6bcf7f;
          margin: 0 0 10px 0;
        }

        .message-rewards ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .message-rewards li {
          font-size: 14px;
          color: #f0e6d1;
          padding: 5px 0;
        }

        .message-rewards li.reward-claimed {
          opacity: 0.5;
          text-decoration: line-through;
        }

        .btn-claim-rewards {
          width: 100%;
          background: linear-gradient(135deg, #3d3020 0%, #5a4a2f 25%, #4a3a25 50%, #6b5a3f 75%, #4a3a25 100%);
          border: 2px solid #8b7355;
          color: #d4af37;
          font-family: 'Times New Roman', Times, serif;
          font-size: 16px;
          font-weight: 700;
          padding: 14px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
          box-shadow:
            0 4px 8px rgba(0, 0, 0, 0.6),
            inset 0 1px 0 rgba(255, 215, 0, 0.2),
            inset 0 -1px 0 rgba(0, 0, 0, 0.4);
          margin-top: 15px;
          position: relative;
          overflow: hidden;
        }

        .btn-claim-rewards::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.3), transparent);
          transition: left 0.5s ease;
        }

        .btn-claim-rewards:hover {
          background: linear-gradient(135deg, #4a3a25 0%, #6b5a3f 25%, #5a4a2f 50%, #7d6b4f 75%, #5a4a2f 100%);
          border-color: #a08968;
          color: #ffd700;
          transform: translateY(-2px);
          box-shadow:
            0 6px 16px rgba(139, 115, 85, 0.6),
            inset 0 1px 0 rgba(255, 215, 0, 0.3),
            inset 0 -1px 0 rgba(0, 0, 0, 0.5);
        }

        .btn-claim-rewards:hover::before {
          left: 100%;
        }

        .btn-claim-rewards:active {
          transform: translateY(0);
          box-shadow:
            0 2px 4px rgba(0, 0, 0, 0.4),
            inset 0 1px 3px rgba(0, 0, 0, 0.6);
        }

        .btn-message-ok {
          width: 100%;
          background: linear-gradient(135deg, #b8985f, #d4af37);
          border: 2px solid #d4af37;
          color: #1a1f3a;
          font-family: 'Times New Roman', Times, serif;
          font-size: 18px;
          font-weight: 700;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-message-ok:hover {
          background: linear-gradient(135deg, #d4af37, #f0e6d1);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(212, 175, 55, 0.5);
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }

  injectCustomAlertStyles() {
    if (document.getElementById('custom-alert-styles')) return;

    const styles = `
      <style id="custom-alert-styles">
        .custom-alert-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10001;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .custom-alert-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(5px);
        }

        .custom-alert-content {
          position: relative;
          background: linear-gradient(135deg, rgba(26, 31, 58, 0.98), rgba(15, 20, 35, 0.98));
          border: 3px solid #d4af37;
          border-radius: 16px;
          padding: 30px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 10px 50px rgba(0, 0, 0, 0.9);
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-50px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .custom-alert-content.error {
          border-color: #ff6b6b;
        }

        .custom-alert-content.success {
          border-color: #6bcf7f;
        }

        .custom-alert-header {
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid rgba(184, 152, 95, 0.3);
        }

        .custom-alert-header h3 {
          font-family: 'Times New Roman', Times, serif;
          font-size: 24px;
          font-weight: 700;
          color: #d4af37;
          margin: 0;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
        }

        .custom-alert-content.error .custom-alert-header h3 {
          color: #ff6b6b;
        }

        .custom-alert-content.success .custom-alert-header h3 {
          color: #6bcf7f;
        }

        .custom-alert-body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 16px;
          color: #f0e6d1;
          line-height: 1.6;
          margin-bottom: 25px;
          text-align: center;
        }

        .custom-alert-ok {
          width: 100%;
          background: linear-gradient(135deg, #b8985f, #d4af37);
          border: 2px solid #d4af37;
          color: #1a1f3a;
          font-family: 'Times New Roman', Times, serif;
          font-size: 18px;
          font-weight: 700;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .custom-alert-ok:hover {
          background: linear-gradient(135deg, #d4af37, #f0e6d1);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(212, 175, 55, 0.5);
        }

        .custom-alert-content.error .custom-alert-ok {
          background: linear-gradient(135deg, #aa4a4a, #ff6b6b);
          border-color: #ff6b6b;
          color: #fff;
        }

        .custom-alert-content.error .custom-alert-ok:hover {
          background: linear-gradient(135deg, #ff6b6b, #ff8787);
        }

        .custom-alert-content.success .custom-alert-ok {
          background: linear-gradient(135deg, #4a9959, #6bcf7f);
          border-color: #6bcf7f;
          color: #fff;
        }

        .custom-alert-content.success .custom-alert-ok:hover {
          background: linear-gradient(135deg, #6bcf7f, #7de092);
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }
}

// Global instance
window.DashboardMailbox = new DashboardMailbox();

console.log('✅ Dashboard Mailbox module loaded');
