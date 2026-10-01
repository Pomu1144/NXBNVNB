// js/ui-theme.js — Interface style switch (Settings › Display).
//   classic  the original ink / washi-ticket look (default)
//   glass    frosted-glass panels, pill buttons, line icons (css/ui-glass.css)
// Loaded in <head> before the page paints, so the chosen style shows from the
// first frame. Every css/ui-glass.css rule is scoped to html[data-ui="glass"];
// Classic is untouched.
(function (global) {
  'use strict';

  const KEY = 'blazing_ui_theme_v1';
  const STYLES = ['classic', 'glass'];
  const root = document.documentElement;

  function read() {
    try {
      const v = localStorage.getItem(KEY);
      return STYLES.includes(v) ? v : 'classic';
    } catch (e) {
      return 'classic';
    }
  }

  function apply(v) {
    root.setAttribute('data-ui', v);
  }

  apply(read());

  global.UITheme = {
    STYLES,
    get: () => root.getAttribute('data-ui') || 'classic',
    set(v) {
      if (!STYLES.includes(v)) return;
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
