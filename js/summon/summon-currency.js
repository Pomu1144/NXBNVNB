// js/summon/summon-currency.js
// Currency management for summon page

(function() {
  "use strict";

  /**
   * Add test currency for development
   * Call from console: addTestCurrency()
   */
  window.addTestCurrency = function() {
    if (window.Resources) {
      window.Resources.add('ninja_pearls', 100);
      window.Resources.add('shinobites', 50);
      window.Resources.add('ryo', 10000);
      console.log('✅ Added test currency:');
      console.log('  Ninja Pearls: +100');
      console.log('  Shinobites: +50');
      console.log('  Ryo: +10,000');
    } else {
      console.error('❌ Resources module not loaded');
    }
  };

  /**
   * Reset all currency to 0
   * Call from console: resetCurrency()
   */
  window.resetCurrency = function() {
    if (window.Resources) {
      window.Resources.set('ninja_pearls', 0);
      window.Resources.set('shinobites', 0);
      window.Resources.set('ryo', 0);
      console.log('✅ All currency reset to 0');
    } else {
      console.error('❌ Resources module not loaded');
    }
  };

  /**
   * Display current currency amounts
   * Call from console: showCurrency()
   */
  window.showCurrency = function() {
    if (window.Resources) {
      console.log('💰 Current Currency:');
      console.log('  Ninja Pearls:', window.Resources.get('ninja_pearls'));
      console.log('  Shinobites:', window.Resources.get('shinobites'));
      console.log('  Ryo:', window.Resources.get('ryo'));
    } else {
      console.error('❌ Resources module not loaded');
    }
  };

  console.log('[SummonCurrency] Helper functions loaded:');
  console.log('  - addTestCurrency() - Add test currency');
  console.log('  - resetCurrency() - Reset all currency to 0');
  console.log('  - showCurrency() - Display current amounts');

})();
