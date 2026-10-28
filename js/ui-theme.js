// js/ui-theme.js — Interface style switch (Settings › Display).
//   ink      the default and, for now, the only style offered: a skin on
//            top of Glass: charcoal ink, cream paper and gold, serif type,
//            thin square frames, left nav rail and a layered hero on the
//            village (css/ui-ink.css)
//   classic  the original ink / washi-ticket look (disabled)
//   glass    frosted-glass panels, pill buttons, line icons (css/ui-glass.css,
//            disabled as a style of its own; Ink still builds on it)
// A saved Classic / Glass choice loads as Ink. Add a style back to ENABLED
// (and its button in settings.html) to offer it again. The specs keep the
// Classic layout guards running through window.__BLAZING_UI_STYLE.
// Loaded in <head> before the page paints, so the chosen style shows from the
// first frame. Ink keeps html[data-ui="glass"] (so every Glass page rule
// applies) and adds html[data-skin="ink"]; html[data-style] holds the choice.
// Classic is untouched.
(function (global) {
  'use strict';

  const KEY = 'blazing_ui_theme_v1';
  const STYLES = ['classic', 'glass', 'ink'];
  const ENABLED = ['ink'];
  const DEFAULT = 'ink';
  const root = document.documentElement;

  function read() {
    // Tests pin a disabled style to keep its layout guards running
    if (STYLES.includes(global.__BLAZING_UI_STYLE)) return global.__BLAZING_UI_STYLE;
    try {
      const v = localStorage.getItem(KEY);
      return ENABLED.includes(v) ? v : DEFAULT;
    } catch (e) {
      return DEFAULT;
    }
  }

  function apply(v) {
    root.setAttribute('data-style', v);
    root.setAttribute('data-ui', v === 'ink' ? 'glass' : v);
    if (v === 'ink') root.setAttribute('data-skin', 'ink');
    else root.removeAttribute('data-skin');
  }

  apply(read());

  global.UITheme = {
    STYLES, ENABLED,
    get: () => root.getAttribute('data-style') || DEFAULT,
    set(v) {
      if (!ENABLED.includes(v)) return;
      try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: this page only */ }
      apply(v);
      global.dispatchEvent(new CustomEvent('uitheme:change', { detail: { style: v } }));
    }
  };

  // Settings › Display: buttons with data-ui-style pick the style
  function wire() {
    const btns = document.querySelectorAll('[data-ui-style]');
    const paint = () => btns.forEach((b) => {
      const on = b.dataset.uiStyle === global.UITheme.get();
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    btns.forEach((b) => b.addEventListener('click', () => { global.UITheme.set(b.dataset.uiStyle); paint(); }));
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  // Another tab switched styles
  global.addEventListener('storage', (e) => {
    if (e.key === KEY) apply(read());
  });
})(window);
