// Batch Add All Characters - Developer Helper
// Usage: Call window.addAllCharacters() from console or button

window.addAllCharacters = async function() {
  console.log('🎮 Starting batch character addition...');

  if (!window.InventoryChar) {
    alert('❌ Inventory system not loaded. Please reload the page.');
    return;
  }

  // All characters with evolved and unevolved forms
  const charactersToAdd = [
    { id: 'naruto_01', tier: '3S', name: 'Naruto (3★)' },
    { id: 'naruto_01', tier: '5S', name: 'Naruto (5★)' },
    { id: 'sasuke_01', tier: '3S', name: 'Sasuke (3★)' },
    { id: 'sasuke_01', tier: '5S', name: 'Sasuke (5★)' },
    { id: 'sakura_01', tier: '3S', name: 'Sakura (3★)' },
    { id: 'sakura_01', tier: '4S', name: 'Sakura (4★)' },
    { id: 'madara_06sb', tier: '6S', name: 'Madara (6★)' },
    { id: 'madara_06sb', tier: '6SB', name: 'Madara (6★ Blazing)' },
    { id: 'naruto_044', tier: '5S', name: 'Naruto 044 (5★)' },
    { id: 'naruto_044', tier: '6S', name: 'Naruto 044 (6★)' },
    { id: 'naruto_162', tier: '5S', name: 'Naruto 162 (5★)' },
    { id: 'naruto_162', tier: '6S', name: 'Naruto 162 (6★)' },
    { id: 'naruto_163', tier: '5S', name: 'Naruto 163 (5★)' },
    { id: 'naruto_163', tier: '6S', name: 'Naruto 163 (6★)' },
    { id: 'naruto_260', tier: '5S', name: 'Naruto 260 (5★)' },
    { id: 'naruto_260', tier: '6S', name: 'Naruto 260 (6★)' },
    { id: 'sasuke_05', tier: '3S', name: 'Sasuke 05 (3★)' },
    { id: 'sasuke_05', tier: '4S', name: 'Sasuke 05 (4★)' },
    { id: 'takimitsuha_1190', tier: '7S', name: 'Taki & Mitsuha (7★)' }
  ];

  let added = 0;
  let failed = 0;

  for (const char of charactersToAdd) {
    try {
      window.InventoryChar.addCopy(char.id, 1, char.tier);
      console.log(`✅ Added: ${char.name}`);
      added++;
    } catch (error) {
      console.error(`❌ Failed to add ${char.name}:`, error);
      failed++;
    }
  }

  console.log(`\n🎉 Batch addition complete!`);
  console.log(`✅ Added: ${added} characters`);
  console.log(`❌ Failed: ${failed} characters`);

  alert(`✅ Successfully added ${added} characters!\n\nGo to the Characters page to see them all!`);

  // Refresh character grid if available
  if (typeof window.refreshCharacterGrid === 'function') {
    window.refreshCharacterGrid();
  }
};

console.log('✅ Batch character addition script loaded!');
console.log('📝 Run: window.addAllCharacters()');
