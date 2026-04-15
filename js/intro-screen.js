(function () {
  console.log('🎬 Intro screen script starting...');
  
  const introScreen = document.getElementById('intro-screen');
  const tapTarget = introScreen?.querySelector('[data-tap-start]');
  
  console.log('🎬 Intro screen element:', introScreen);
  console.log('🎬 Tap target:', tapTarget);
  
  if (!introScreen) {
    console.warn('⚠️ No intro screen found - removing intro-active class');
    // If intro screen doesn't exist, make sure login is visible
    document.body.classList.remove('intro-active');
    return;
  }

  console.log('✅ Intro screen found, setting up...');

  const hideIntro = () => {
    console.log('👆 Intro clicked/tapped - hiding intro screen');
    
    if (introScreen.classList.contains('is-hidden')) {
      console.log('⚠️ Intro already hidden, ignoring');
      return;
    }
    
    // Hide the intro screen
    introScreen.classList.add('is-hidden');
    console.log('🎬 Added is-hidden class to intro');
    
    // CRITICAL: Remove intro-active class immediately so login becomes visible
    document.body.classList.remove('intro-active');
    console.log('🎬 Removed intro-active class from body');
    
    // Remove intro screen from DOM after animation
    setTimeout(() => {
      introScreen.remove();
      console.log('🎬 Intro screen removed from DOM');
    }, 650);
  };

  const handleKeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      hideIntro();
    }
  };

  // Set up event listeners
  introScreen.addEventListener('click', hideIntro);
  introScreen.addEventListener('keydown', handleKeydown);
  introScreen.setAttribute('tabindex', '0');
  
  // Add intro-active class to body
  document.body.classList.add('intro-active');
  console.log('🎬 Added intro-active class to body');
  
  tapTarget?.setAttribute('aria-label', 'Tap to start the game');
  introScreen.focus({ preventScroll: true });
  
  console.log('✅ Intro screen setup complete - waiting for user interaction');
})();