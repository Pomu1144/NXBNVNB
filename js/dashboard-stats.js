// js/dashboard-stats.js - Dashboard Statistics System

class DashboardStats {
  constructor() {
    this.totalCharacters = 0;
    this.ownedCharacters = 0;
    this.collectionPercentage = 0;
  }

  async init() {
    await this.calculateStats();
    console.log('✅ Dashboard Stats initialized - Collection:', this.collectionPercentage.toFixed(1) + '%');
  }

  async calculateStats() {
    try {
      // Load all available characters
      const response = await fetch('data/characters.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      this.totalCharacters = data.characters ? data.characters.length : 0;

      // Load owned characters from inventory
      const inventory = JSON.parse(localStorage.getItem('characterInventory') || '[]');
      this.ownedCharacters = inventory.length;

      // Calculate collection percentage
      if (this.totalCharacters > 0) {
        this.collectionPercentage = (this.ownedCharacters / this.totalCharacters) * 100;
      } else {
        this.collectionPercentage = 0;
      }

    } catch (error) {
      console.error('Failed to calculate stats:', error);
      this.totalCharacters = 0;
      this.ownedCharacters = 0;
      this.collectionPercentage = 0;
    }
  }

  getCollectionPercentage() {
    return this.collectionPercentage;
  }

  getOwnedCharacters() {
    return this.ownedCharacters;
  }

  getTotalCharacters() {
    return this.totalCharacters;
  }

  async refresh() {
    await this.calculateStats();
  }
}

// Global instance
window.DashboardStats = new DashboardStats();

console.log('✅ Dashboard Stats module loaded');
