if ('serviceWorker' in navigator) {
  // When an updated service worker takes control (new deploy), reload once so
  // the page isn't left running a previous deploy's HTML against new CSS/JS.
  // Skip the very first install, when there was no controller before.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => reg.update())
      .catch(() => {});
  });
}
