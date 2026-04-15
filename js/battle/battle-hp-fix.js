// ========================================
// HP BAR ANIMATION FIX - ENHANCED
// Ensures HP bars update reliably after damage
// ========================================

/**
 * Forcefully update all HP bars on the battlefield
 * This function doesn't rely on unit IDs or DOM queries
 */
function forceUpdateAllHPBars() {
  if (!window.BattleManager || !window.BattleManager.combatants) return;

  const grid = document.getElementById('battlefield-grid');
  const teamHolder = document.getElementById('team-holder');

  if (!grid) return;

  // Update each combatant's HP bar
  window.BattleManager.combatants.forEach(unit => {
    const hpPercent = Math.max(0, Math.min(100, (unit.stats.hp / unit.stats.maxHP) * 100));

    // Update battlefield unit
    const battleUnit = grid.querySelector(`[data-unit-id="${unit.id}"]`);
    if (battleUnit) {
      const hpBar = battleUnit.querySelector('.unit-hp-fill');
      if (hpBar) {
        hpBar.style.width = `${hpPercent}%`;
        hpBar.style.transition = 'width 0.3s ease-out';
      }

      // Visual feedback for low HP
      if (hpPercent <= 0) {
        battleUnit.style.opacity = '0.4';
        battleUnit.style.filter = 'grayscale(100%)';
      } else if (hpPercent <= 30) {
        battleUnit.classList.add('low-hp');
      } else {
        battleUnit.classList.remove('low-hp');
        battleUnit.style.opacity = '';
        battleUnit.style.filter = '';
      }
    }

    // Update team holder unit (if player)
    if (unit.isPlayer && teamHolder) {
      const teamCard = teamHolder.querySelector(`[data-unit-id="${unit.id}"]`);
      if (teamCard) {
        const teamHpBar = teamCard.querySelector('.unit-hp-fill');
        if (teamHpBar) {
          teamHpBar.style.width = `${hpPercent}%`;
          teamHpBar.style.transition = 'width 0.3s ease-out';
        }
      }
    }
  });
}

// Patch BattleUnits.updateUnitDisplay if it exists
if (window.BattleUnits && window.BattleUnits.updateUnitDisplay) {
  const originalUpdate = window.BattleUnits.updateUnitDisplay;

  window.BattleUnits.updateUnitDisplay = function(unit, core) {
    // Call original implementation
    if (originalUpdate) {
      originalUpdate.call(this, unit, core);
    }

    // Force update all HP bars as backup
    requestAnimationFrame(() => {
      forceUpdateAllHPBars();
    });
  };

  console.log("[HP Fix] ✅ BattleUnits.updateUnitDisplay patched");
}

// Expose global function for manual updates
window.forceUpdateAllHPBars = forceUpdateAllHPBars;

// Option 2: Alternative standalone fix
// Use this if the patch doesn't work
function fixHPBarAnimation() {
  // Observe DOM changes for unit updates
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-unit-id') {
        const unitEl = mutation.target;
        updateUnitHPBar(unitEl);
      }
    });
  });

  // Start observing battlefield grid
  const grid = document.getElementById('battlefield-grid');
  if (grid) {
    observer.observe(grid, {
      attributes: true,
      subtree: true
    });
  }
}

function updateUnitHPBar(unitEl) {
  const unitId = unitEl.dataset.unitId;
  if (!unitId || !window.BattleManager) return;

  const unit = window.BattleManager.combatants.find(u => u.id === unitId);
  if (!unit) return;

  const hpPercent = (unit.stats.hp / unit.stats.maxHP) * 100;
  const hpBar = unitEl.querySelector(".unit-hp-fill");

  if (hpBar) {
    hpBar.style.width = `${hpPercent}%`;
  }

  // Update color state
  if (hpPercent > 60) {
    unitEl.setAttribute('data-hp-percent', 'high');
  } else if (hpPercent > 30) {
    unitEl.setAttribute('data-hp-percent', 'medium');
  } else {
    unitEl.setAttribute('data-hp-percent', 'low');
  }
}

// Auto-run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fixHPBarAnimation);
} else {
  fixHPBarAnimation();
}

// ========================================
// COMBAT HOOKS - Force HP Bar Updates
// ========================================

// Patch performAttack
if (window.BattleCombat && window.BattleCombat.performAttack) {
  const originalAttack = window.BattleCombat.performAttack;

  window.BattleCombat.performAttack = function(attacker, target, core) {
    const result = originalAttack.call(this, attacker, target, core);

    // Force HP bar update after attack
    requestAnimationFrame(() => {
      forceUpdateAllHPBars();
    });

    return result;
  };
  console.log("[HP Fix] ✅ performAttack patched");
}

// Patch performJutsu
if (window.BattleCombat && window.BattleCombat.performJutsu) {
  const originalJutsu = window.BattleCombat.performJutsu;

  window.BattleCombat.performJutsu = function(attacker, target, core) {
    const result = originalJutsu.call(this, attacker, target, core);

    // Force HP bar update after jutsu
    setTimeout(() => {
      forceUpdateAllHPBars();
    }, 100);

    setTimeout(() => {
      forceUpdateAllHPBars();
    }, 600);

    return result;
  };
  console.log("[HP Fix] ✅ performJutsu patched");
}

// Patch performUltimate
if (window.BattleCombat && window.BattleCombat.performUltimate) {
  const originalUltimate = window.BattleCombat.performUltimate;

  window.BattleCombat.performUltimate = function(attacker, targets, core) {
    const result = originalUltimate.call(this, attacker, targets, core);

    // Force HP bar updates at multiple intervals for multi-hit ultimate
    setTimeout(() => forceUpdateAllHPBars(), 200);
    setTimeout(() => forceUpdateAllHPBars(), 600);
    setTimeout(() => forceUpdateAllHPBars(), 1000);

    return result;
  };
  console.log("[HP Fix] ✅ performUltimate patched");
}

// Patch multi-attack functions
if (window.BattleCombat && window.BattleCombat.performMultiAttack) {
  const originalMulti = window.BattleCombat.performMultiAttack;

  window.BattleCombat.performMultiAttack = function(attacker, targets, core) {
    const result = originalMulti.call(this, attacker, targets, core);

    // Update after each hit
    setTimeout(() => forceUpdateAllHPBars(), 200);
    setTimeout(() => forceUpdateAllHPBars(), 400);
    setTimeout(() => forceUpdateAllHPBars(), 600);

    return result;
  };
  console.log("[HP Fix] ✅ performMultiAttack patched");
}

console.log("[HP Fix] 🎯 All combat hooks patched successfully!");

// ========================================
// PERIODIC HP BAR SYNC
// ========================================

/**
 * Periodic HP bar sync to catch any missed updates
 * Runs every 500ms during active battle
 */
let hpSyncInterval = null;

function startHPBarSync() {
  if (hpSyncInterval) return; // Already running

  hpSyncInterval = setInterval(() => {
    if (window.BattleManager && window.BattleManager.state === 'active') {
      forceUpdateAllHPBars();
    }
  }, 500); // Update every 500ms

  console.log("[HP Fix] 🔄 Periodic HP sync started");
}

function stopHPBarSync() {
  if (hpSyncInterval) {
    clearInterval(hpSyncInterval);
    hpSyncInterval = null;
    console.log("[HP Fix] ⏹️  Periodic HP sync stopped");
  }
}

// Start sync when battle becomes active
if (window.BattleManager) {
  const originalStart = window.BattleManager.startBattle;
  if (originalStart) {
    window.BattleManager.startBattle = function() {
      const result = originalStart.call(this);
      startHPBarSync();
      return result;
    };
  }
}

// Auto-start if battle is already active
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(startHPBarSync, 1000);
  });
} else {
  setTimeout(startHPBarSync, 1000);
}

// Expose control functions
window.startHPBarSync = startHPBarSync;
window.stopHPBarSync = stopHPBarSync;

console.log("[HP Fix] 💚 HP Bar Fix System fully initialized!");
