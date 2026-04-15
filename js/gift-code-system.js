// js/gift-code-system.js - Gift Code Redemption System

class GiftCodeSystem {
  constructor() {
    this.codes = [];
    this.redeemedCodes = [];
    this.STORAGE_KEY = 'blazing_redeemed_codes_v1';
  }

  async init() {
    await this.loadGiftCodes();
    this.loadRedeemedCodes();
    console.log('✅ Gift Code System initialized');
  }

  async loadGiftCodes() {
    try {
      const response = await fetch('data/gift-codes.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      this.codes = data.codes || [];
      console.log(`Loaded ${this.codes.length} gift codes`);
    } catch (error) {
      console.error('Failed to load gift codes:', error);
      this.codes = [];
    }
  }

  loadRedeemedCodes() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      this.redeemedCodes = saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Failed to load redeemed codes:', error);
      this.redeemedCodes = [];
    }
  }

  saveRedeemedCodes() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.redeemedCodes));
    } catch (error) {
      console.error('Failed to save redeemed codes:', error);
    }
  }

  isCodeRedeemed(code) {
    return this.redeemedCodes.some(c => c.code.toUpperCase() === code.toUpperCase());
  }

  findCode(codeString) {
    return this.codes.find(c => c.code.toUpperCase() === codeString.toUpperCase());
  }

  isCodeExpired(codeData) {
    if (!codeData.expiryDate) return false;
    const expiry = new Date(codeData.expiryDate);
    return expiry < new Date();
  }

  async redeemCode(codeString) {
    const code = codeString.trim().toUpperCase();

    if (!code) {
      return { success: false, message: 'Please enter a gift code.' };
    }

    // [DEV] Allow multiple redemptions for development/testing
    // Check if already redeemed
    // if (this.isCodeRedeemed(code)) {
    //   return { success: false, message: 'This code has already been redeemed.' };
    // }

    // Find code
    const codeData = this.findCode(code);
    if (!codeData) {
      return { success: false, message: 'Invalid gift code.' };
    }

    // Check expiry
    if (this.isCodeExpired(codeData)) {
      return { success: false, message: 'This code has expired.' };
    }

    // Redeem code - send rewards to mailbox
    await this.sendRewardsToMailbox(codeData);

    // Mark as redeemed (still track for analytics, but doesn't block redemption)
    this.redeemedCodes.push({
      code: code,
      redeemedAt: new Date().toISOString()
    });
    this.saveRedeemedCodes();

    return {
      success: true,
      message: codeData.rewards.message || 'Gift code redeemed successfully! Check your present box.'
    };
  }

  async sendRewardsToMailbox(codeData) {
    console.log('📬 [GiftCode] Attempting to send rewards to mailbox...');
    console.log('📬 [GiftCode] Code data:', codeData);

    if (!window.DashboardMailbox) {
      console.error('❌ [GiftCode] Mailbox system not available!');
      alert('❌ Mailbox system not loaded. Please go to the main menu first, then try redeeming the code again.');
      return;
    }

    console.log('✅ [GiftCode] Mailbox system found');

    const rewards = codeData.rewards;
    const message = {
      title: `Gift Code: ${codeData.code}`,
      message: codeData.description || 'You have received rewards from a gift code!',
      rewards: {
        characters: rewards.characters || [],
        resources: rewards.resources || []
      },
      rewardType: 'giftCode' // Special type for gift code rewards
    };

    console.log('📬 [GiftCode] Message to add:', message);
    window.DashboardMailbox.addMessage(message);
    console.log('✅ [GiftCode] Message added to mailbox');
    console.log('📊 [GiftCode] Current mailbox message count:', window.DashboardMailbox.messages.length);
    console.log('📊 [GiftCode] Unread count:', window.DashboardMailbox.getUnreadCount());
  }
}

// Global instance
window.GiftCodeSystem = new GiftCodeSystem();

console.log('✅ Gift Code System module loaded');
