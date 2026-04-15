// js/panel-missions.js - Panel Mission System

class PanelMissions {
  constructor() {
    this.missions = [];
  }

  async init() {
    await this.loadMissions();
    this.loadMissionProgress();
    console.log('✅ Panel Missions initialized');
  }

  async loadMissions() {
    try {
      const response = await fetch('data/panel.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      this.missions = data.missions || [];
      console.log(`Loaded ${this.missions.length} panel missions`);
    } catch (error) {
      console.error('Failed to load panel missions:', error);
      this.missions = [];
    }
  }

  loadMissionProgress() {
    try {
      const saved = localStorage.getItem('blazing_panel_mission_progress');
      if (saved) {
        const progress = JSON.parse(saved);
        this.missions.forEach(mission => {
          const savedMission = progress.find(m => m.id === mission.id);
          if (savedMission) {
            mission.completed = savedMission.completed || false;
          }
        });
      }
    } catch (error) {
      console.error('Failed to load mission progress:', error);
    }
  }

  saveMissionProgress() {
    try {
      const progress = this.missions.map(m => ({
        id: m.id,
        completed: m.completed
      }));
      localStorage.setItem('blazing_panel_mission_progress', JSON.stringify(progress));
    } catch (error) {
      console.error('Failed to save mission progress:', error);
    }
  }

  completeMission(missionId) {
    const mission = this.missions.find(m => m.id === missionId);
    if (!mission) {
      alert('Mission not found');
      return;
    }

    if (mission.completed) {
      alert('Mission already completed!');
      return;
    }

    // Mark as completed
    mission.completed = true;
    this.saveMissionProgress();

    // Give reward to player
    this.giveReward(mission.reward);

    // Show success message
    const rewardText = this.getRewardDisplayText(mission.reward);
    alert(`Mission Completed!\n\n${mission.title}\n\nReward: ${rewardText}`);

    // Refresh the modal
    this.openPanelModal();
  }

  giveReward(reward) {
    switch (reward.type) {
      case 'character':
        if (window.InventoryChar) {
          for (let i = 0; i < reward.quantity; i++) {
            window.InventoryChar.addCopy(reward.characterId, 1, reward.tierCode || '3S');
          }
          console.log(`Gave character: ${reward.characterId} x${reward.quantity}`);
        }
        break;

      case 'resource':
        if (window.ResourceManager) {
          const resourceKey = reward.resourceName.toLowerCase().replace(/\s+/g, '_');
          window.ResourceManager.addResource(resourceKey, reward.quantity);
          console.log(`Gave resource: ${reward.resourceName} x${reward.quantity}`);
        }
        break;

      case 'item':
        // TODO: Implement item system
        console.log(`Gave item: ${reward.itemId} x${reward.quantity}`);
        break;
    }
  }

  getRewardDisplayText(reward) {
    switch (reward.type) {
      case 'character':
        return `${reward.characterId} x${reward.quantity}`;
      case 'resource':
        return `${reward.quantity} ${reward.resourceName}`;
      case 'item':
        return `${reward.quantity}x ${reward.itemId}`;
      default:
        return 'Unknown reward';
    }
  }

  getRewardIcon(reward) {
    switch (reward.type) {
      case 'character':
        return '<div class="reward-icon-text">Character</div>';
      case 'resource':
        if (reward.resourceName.includes('Pearl')) {
          return '<img src="assets/icons/currency/ninjapearl.png" class="reward-icon-img" alt="Ninja Pearls">';
        }
        if (reward.resourceName.includes('Ryo')) {
          return '<img src="assets/icons/currency/ryo.png" class="reward-icon-img" alt="Ryo">';
        }
        if (reward.resourceName.includes('Shinobite')) {
          return '<img src="assets/icons/currency/shinobite.png" class="reward-icon-img" alt="Shinobites">';
        }
        return '<div class="reward-icon-text">Resource</div>';
      case 'item':
        return '<div class="reward-icon-text">Item</div>';
      default:
        return '<div class="reward-icon-text">Reward</div>';
    }
  }

  openPanelModal() {
    if (this.missions.length === 0) {
      alert('No panel missions available');
      return;
    }

    const missionsHTML = this.missions.map(mission => {
      const completedClass = mission.completed ? 'completed' : '';
      const rewardIcon = this.getRewardIcon(mission.reward);
      const rewardText = this.getRewardDisplayText(mission.reward);

      return `
        <div class="mission-item ${completedClass}">
          <div class="mission-info">
            <div class="mission-title">${mission.title}</div>
            <div class="mission-description">${mission.description}</div>
            <div class="mission-reward">
              <div class="mission-reward-icon">${rewardIcon}</div>
              <div class="mission-reward-text">${rewardText}</div>
            </div>
          </div>
          ${!mission.completed ?
            `<button class="btn-complete-mission" onclick="window.PanelMissions.completeMission('${mission.id}')">Claim</button>` :
            '<div class="mission-completed-badge">✓ Completed</div>'}
        </div>
      `;
    }).join('');

    const modalHTML = `
      <div class="panel-modal" id="panel-modal">
        <div class="panel-overlay" onclick="window.PanelMissions.closePanelModal()"></div>
        <div class="panel-content" style="background: url('assets/Main Background/mission-panel.png') center/cover no-repeat; background-color: rgba(0, 0, 0, 0.7); background-blend-mode: darken;">
          <div class="panel-header">
            <h2>Panel Missions</h2>
            <button class="panel-close" onclick="window.PanelMissions.closePanelModal()">✕</button>
          </div>
          <div class="mission-list">
            ${missionsHTML}
          </div>
        </div>
      </div>
    `;

    // Remove existing modal if present
    const existingModal = document.getElementById('panel-modal');
    if (existingModal) {
      existingModal.remove();
    }

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.injectPanelStyles();
  }

  closePanelModal() {
    const modal = document.getElementById('panel-modal');
    if (modal) {
      modal.remove();
    }
  }

  injectPanelStyles() {
    if (document.getElementById('panel-modal-styles')) return;

    const styles = `
      <style id="panel-modal-styles">
        .panel-modal {
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

        .panel-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
        }

        .panel-content {
          position: relative;
          border: 3px solid #d4af37;
          border-radius: 16px;
          padding: 30px;
          max-width: 800px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 10px 50px rgba(0, 0, 0, 0.9);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid rgba(184, 152, 95, 0.3);
        }

        .panel-header h2 {
          font-family: 'Times New Roman', Times, serif;
          font-size: 28px;
          font-weight: 700;
          color: #d4af37;
          margin: 0;
        }

        .panel-close {
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

        .panel-close:hover {
          background: rgba(220, 53, 69, 0.4);
          transform: scale(1.1);
        }

        .mission-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .mission-item {
          background: rgba(20, 20, 30, 0.8);
          border: 2px solid rgba(139, 115, 85, 0.4);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          transition: all 0.3s ease;
        }

        .mission-item:hover {
          border-color: rgba(212, 175, 55, 0.7);
          box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
        }

        .mission-item.completed {
          opacity: 0.7;
          border-color: rgba(107, 207, 127, 0.6);
          background: rgba(40, 167, 69, 0.1);
        }

        .mission-info {
          flex: 1;
        }

        .mission-title {
          font-family: 'Times New Roman', Times, serif;
          font-size: 18px;
          font-weight: 700;
          color: #d4af37;
          margin-bottom: 8px;
        }

        .mission-description {
          font-size: 14px;
          color: #f0e6d1;
          margin-bottom: 12px;
        }

        .mission-reward {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .mission-reward-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .reward-icon-img {
          width: 32px;
          height: 32px;
          object-fit: contain;
        }

        .reward-icon-text {
          font-size: 10px;
          color: #b8985f;
          text-align: center;
        }

        .mission-reward-text {
          font-size: 14px;
          color: #6bcf7f;
          font-weight: 600;
        }

        .btn-complete-mission {
          background: linear-gradient(135deg, #3d3020 0%, #5a4a2f 25%, #4a3a25 50%, #6b5a3f 75%, #4a3a25 100%);
          border: 2px solid #8b7355;
          color: #d4af37;
          font-family: 'Times New Roman', Times, serif;
          font-size: 16px;
          font-weight: 700;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
          box-shadow:
            0 4px 8px rgba(0, 0, 0, 0.6),
            inset 0 1px 0 rgba(255, 215, 0, 0.2),
            inset 0 -1px 0 rgba(0, 0, 0, 0.4);
          white-space: nowrap;
        }

        .btn-complete-mission:hover {
          background: linear-gradient(135deg, #4a3a25 0%, #6b5a3f 25%, #5a4a2f 50%, #7d6b4f 75%, #5a4a2f 100%);
          border-color: #a08968;
          color: #ffd700;
          transform: translateY(-2px);
          box-shadow:
            0 6px 16px rgba(139, 115, 85, 0.6),
            inset 0 1px 0 rgba(255, 215, 0, 0.3),
            inset 0 -1px 0 rgba(0, 0, 0, 0.5);
        }

        .btn-complete-mission:active {
          transform: translateY(0);
        }

        .mission-completed-badge {
          background: rgba(107, 207, 127, 0.2);
          border: 2px solid rgba(107, 207, 127, 0.6);
          color: #6bcf7f;
          font-size: 14px;
          font-weight: 700;
          padding: 12px 24px;
          border-radius: 8px;
          white-space: nowrap;
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }
}

// Global instance
window.PanelMissions = new PanelMissions();

console.log('✅ Panel Missions module loaded');
