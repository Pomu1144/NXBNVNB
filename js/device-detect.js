/* js/device-detect.js
 * ---------------------------------------------------------------------------
 * Loaded synchronously at the top of <head> on every page, before any CSS
 * paints. Tags <html> so css/mobile.css can apply phone/tablet-only rules:
 *
 *   html.is-mobile        touch phone / tablet (never a desktop or laptop)
 *   html.is-landscape     viewport wider than tall   (mobile only)
 *   html.is-portrait      viewport taller than wide  (mobile only)
 *   html.is-compact       landscape + viewport <= 540px tall (phones)
 *   html.is-ios           iPhone / iPad (incl. iPadOS "Macintosh" UA)
 *   html.is-standalone    launched as installed PWA
 *
 * Also exposes --app-vh / --app-vw (real innerHeight/innerWidth in px; fixes
 * the iOS 100vh-behind-toolbar problem) and window.BlazingDevice.
 *
 * Desktop/laptop with a mouse or trackpad never gets .is-mobile, even when the
 * window is resized small (touch-screen laptops report a fine primary pointer
 * and a desktop UA). Overrides for testing:
 *   ?layout=mobile | ?layout=desktop   (persisted in localStorage)
 *   ?layout=auto                       (clears the override)
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';
  var doc = document.documentElement;
  var nav = window.navigator || {};
  var ua = nav.userAgent || '';
  var OVERRIDE_KEY = 'blazing-layout-override';

  function mq(q) {
    try { return window.matchMedia && window.matchMedia(q).matches; } catch (e) { return false; }
  }

  function readOverride() {
    var v = null;
    try {
      var m = /[?&]layout=(mobile|desktop|auto)\b/.exec(window.location.search);
      if (m) {
        if (m[1] === 'auto') localStorage.removeItem(OVERRIDE_KEY);
        else localStorage.setItem(OVERRIDE_KEY, m[1]);
      }
      v = localStorage.getItem(OVERRIDE_KEY);
    } catch (e) { /* storage blocked */ }
    return v === 'mobile' || v === 'desktop' ? v : null;
  }

  var touchPoints = nav.maxTouchPoints || nav.msMaxTouchPoints || 0;
  var uaMobileHint = !!(nav.userAgentData && nav.userAgentData.mobile);
  var uaPhoneTablet = /Android|iPhone|iPod|iPad|Mobile|Silk|Kindle|KFAPWI|BlackBerry|BB10|Opera Mini|IEMobile|webOS/i.test(ua);
  var isIPadOS = /Macintosh/i.test(ua) && touchPoints > 1;       // iPadOS 13+ desktop-class UA
  var isIOS = /iPhone|iPod|iPad/i.test(ua) || isIPadOS;
  var coarsePrimary = mq('(pointer: coarse)');
  var noHover = mq('(hover: none)');
  var shortSide = Math.min(window.screen ? screen.width : 0, window.screen ? screen.height : 0) || Math.min(window.innerWidth, window.innerHeight);

  // A device is "mobile" when it identifies as a phone/tablet (UA / client hints /
  // iPadOS) OR it is a touch-first device (coarse primary pointer, no hover),
  // AND its smaller screen side is tablet-sized or less.
  var detected = (uaMobileHint || uaPhoneTablet || isIPadOS || (coarsePrimary && noHover && touchPoints > 0)) &&
                 shortSide > 0 && shortSide <= 1024;

  var override = readOverride();
  var isMobile = override ? override === 'mobile' : detected;

  var standalone = mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || nav.standalone === true;

  function setClass(name, on) {
    if (doc.classList) doc.classList.toggle(name, !!on);
  }

  // Late detection: a touch-only device can start reporting coarse/no-hover
  // after load (e.g. Chrome DevTools device mode switched on without a reload,
  // which otherwise shows the desktop layout on an "iPhone"). Desktops and
  // laptops keep a fine primary pointer, so they never match this.
  function lateDetect(w, h) {
    if (isMobile || override) return;
    if (!(mq('(pointer: coarse)') && mq('(hover: none)'))) return;
    if (Math.min(w, h) > 1024) return;
    isMobile = true;
    setClass('is-mobile', true);
    setClass('is-desktop', false);
    setClass('is-ios', isIOS);
    setClass('is-android', /Android/i.test(ua));
    if (window.BlazingDevice) window.BlazingDevice.isMobile = true;
    if (document.readyState !== 'loading') injectOverlay();
    else document.addEventListener('DOMContentLoaded', injectOverlay);
  }

  function update() {
    var w = window.innerWidth, h = window.innerHeight;
    doc.style.setProperty('--app-vh', h + 'px');
    doc.style.setProperty('--app-vw', w + 'px');
    lateDetect(w, h);
    if (!isMobile) return;
    var landscape = w >= h;
    setClass('is-landscape', landscape);
    setClass('is-portrait', !landscape);
    // phones in landscape (short viewport) get the compact game UI;
    // tablets keep the regular layout
    setClass('is-compact', landscape && h <= 540);
  }

  setClass('is-mobile', isMobile);
  setClass('is-desktop', !isMobile);
  if (isMobile) {
    setClass('is-ios', isIOS);
    setClass('is-android', /Android/i.test(ua));
    setClass('is-standalone', standalone);
  }
  update();

  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('orientationchange', function () { update(); setTimeout(update, 250); }, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', update, { passive: true });

  /* ---- Landscape lock (only honoured by browsers in fullscreen / installed PWA) ---- */
  function tryLock() {
    if (!isMobile) return;
    var so = window.screen && screen.orientation;
    if (!so || typeof so.lock !== 'function') return;
    var inFull = !!(document.fullscreenElement || document.webkitFullscreenElement) || standalone;
    if (!inFull) return;
    try {
      var p = so.lock('landscape');
      if (p && typeof p.catch === 'function') p.catch(function () { /* not allowed here */ });
    } catch (e) { /* unsupported */ }
  }

  /* ---- Rotate-your-device overlay (mobile only; shown by css/mobile.css in portrait) ---- */
  function injectOverlay() {
    if (!isMobile || document.getElementById('rotate-device-overlay')) return;
    var el = document.createElement('div');
    el.id = 'rotate-device-overlay';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="rdo-card">' +
        '<div class="rdo-phone" aria-hidden="true"><span class="rdo-screen"></span><span class="rdo-arrow"></span></div>' +
        '<div class="rdo-title">Rotate your device</div>' +
        '<div class="rdo-text">Blazing is played in landscape.<br>Turn your phone sideways to continue.</div>' +
      '</div>';
    document.body.appendChild(el);
  }

  if (isMobile) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectOverlay);
    } else {
      injectOverlay();
    }
    tryLock();
    document.addEventListener('fullscreenchange', tryLock);
    document.addEventListener('webkitfullscreenchange', tryLock);
    // Some browsers only allow lock after a user gesture.
    var onFirstTouch = function () {
      tryLock();
      window.removeEventListener('touchend', onFirstTouch, true);
    };
    window.addEventListener('touchend', onFirstTouch, true);
  }

  window.BlazingDevice = {
    isMobile: isMobile,
    detected: detected,
    isIOS: isIOS,
    isStandalone: standalone,
    isLandscape: function () { return window.innerWidth >= window.innerHeight; },
    lockLandscape: tryLock,
    refresh: update
  };
})();
