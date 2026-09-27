// js/dev-mode.js
// One switch for developer-only UI (Settings "Dev Tools" tab, the dev grants
// in the settings modal). Off for players.
//   Turn on:  open any page with ?dev=1  (remembered on this device)
//   Turn off: open any page with ?dev=0
// Sets window.DEV_MODE and <html class="dev-mode">; CSS hides .dev-only
// unless that class is present. Load this early (in <head>).
(function (global) {
  "use strict";

  const KEY = "blazing_dev_mode";
  let on = false;

  try {
    const q = new URLSearchParams(global.location.search).get("dev");
    if (q === "1") localStorage.setItem(KEY, "1");
    else if (q === "0") localStorage.removeItem(KEY);
    on = localStorage.getItem(KEY) === "1";
  } catch (e) {
    // storage blocked: stay off
  }

  global.DEV_MODE = on;
  document.documentElement.classList.toggle("dev-mode", on);
})(window);
