/* "?" help buttons: short how-it-works notes kept out of the layout.
 *
 *   <button type="button" class="help-tip" data-help-title="Fusion"
 *           data-help="Pick a recipe, then fill both slots.">?</button>
 *
 * Tapping one opens a small popover next to it; tapping anywhere else,
 * scrolling or Escape closes it. Buttons added later (rendered by page
 * scripts) work too: the listener is delegated. HelpTip.button(title, text)
 * returns the markup for scripts that build HTML strings. */
(function (global) {
  'use strict';

  let pop = null;
  let owner = null;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function close() {
    if (pop) pop.remove();
    if (owner) owner.setAttribute('aria-expanded', 'false');
    pop = null;
    owner = null;
  }

  function open(btn) {
    close();
    owner = btn;
    btn.setAttribute('aria-expanded', 'true');
    pop = document.createElement('div');
    pop.className = 'help-pop';
    pop.setAttribute('role', 'tooltip');
    const title = btn.dataset.helpTitle;
    pop.innerHTML = (title ? `<b class="help-pop-title">${esc(title)}</b>` : '') +
      String(btn.dataset.help || '').split(/\n+/).map(l => `<p>${esc(l)}</p>`).join('');
    document.body.appendChild(pop);

    // Below the button when there is room, else above; kept on screen.
    const r = btn.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - pr.width / 2), vw - pr.width - 8);
    let top = r.bottom + 8;
    if (top + pr.height > vh - 8) top = Math.max(8, r.top - pr.height - 8);
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.help-tip');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      if (owner === btn) close(); else open(btn);
      return;
    }
    if (pop && !pop.contains(e.target)) close();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);

  global.HelpTip = {
    close,
    button(title, text, extraClass = '') {
      return `<button type="button" class="help-tip ${extraClass}" aria-label="How this works" aria-expanded="false"` +
        ` data-help-title="${esc(title)}" data-help="${esc(text)}">?</button>`;
    },
  };
})(window);
