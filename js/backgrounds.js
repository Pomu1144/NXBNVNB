// js/backgrounds.js
// Village background catalog + the saved choice.
// The number is what the save stores ('blazing_background', mirrored to the
// legacy 'selected_background'); css/background.css maps it to .bg-N art.
// Settings (page + modal) write it, village.html reads it.
(function (global) {
  "use strict";

  const KEYS = ["blazing_background", "selected_background"];
  const DEFAULT_ID = 1;

  const LIST = [
    { id: 1,  name: "Hidden Leaf",       full: "assets/Main Background/Background.png", thumb: "assets/backgrounds/thumbs/hidden-leaf.webp" },
    { id: 2,  name: "Leaf at Sunset",    full: "assets/backgrounds/leaf-sunset.webp",     thumb: "assets/backgrounds/thumbs/leaf-sunset.webp" },
    { id: 3,  name: "Training Ground",   full: "assets/backgrounds/training-ground.webp", thumb: "assets/backgrounds/thumbs/training-ground.webp" },
    { id: 4,  name: "Valley of the End", full: "assets/backgrounds/valley-of-the-end.webp", thumb: "assets/backgrounds/thumbs/valley-of-the-end.webp" },
    { id: 5,  name: "Hidden Sand",       full: "assets/backgrounds/hidden-sand.webp",     thumb: "assets/backgrounds/thumbs/hidden-sand.webp" },
    { id: 6,  name: "Hidden Mist",       full: "assets/backgrounds/hidden-mist.webp",     thumb: "assets/backgrounds/thumbs/hidden-mist.webp" },
    { id: 7,  name: "Hidden Cloud",      full: "assets/backgrounds/hidden-cloud.webp",    thumb: "assets/backgrounds/thumbs/hidden-cloud.webp" },
    { id: 8,  name: "Akatsuki Hideout",  full: "assets/backgrounds/akatsuki-hideout.webp", thumb: "assets/backgrounds/thumbs/akatsuki-hideout.webp" },
    { id: 9,  name: "Uchiha Shrine",     full: "assets/backgrounds/uchiha-shrine.webp",   thumb: "assets/backgrounds/thumbs/uchiha-shrine.webp" },
    { id: 10, name: "War Battlefield",   full: "assets/backgrounds/war-battlefield.webp", thumb: "assets/backgrounds/thumbs/war-battlefield.webp" }
  ];

  function get(id) {
    return LIST.find((b) => b.id === Number(id)) || null;
  }

  // Saved id, or the default (Hidden Leaf). Old saves may hold "0" (the
  // retired "Ink" option) or junk: both fall back to the default.
  function savedId() {
    try {
      for (const k of KEYS) {
        const b = get(localStorage.getItem(k));
        if (b) return b.id;
      }
    } catch (e) {
      // storage blocked
    }
    return DEFAULT_ID;
  }

  function hasSaved() {
    try { return KEYS.some((k) => get(localStorage.getItem(k))); } catch (e) { return false; }
  }

  function save(id) {
    const b = get(id);
    if (!b) return false;
    try { KEYS.forEach((k) => localStorage.setItem(k, String(b.id))); } catch (e) { return false; }
    return true;
  }

  // Swap the .bg-N class on a #full-bg element
  function apply(el, id) {
    if (!el) return;
    const b = get(id) || get(DEFAULT_ID);
    LIST.forEach((x) => el.classList.remove(`bg-${x.id}`));
    el.classList.add(`bg-${b.id}`);
  }

  global.VillageBackgrounds = { LIST, DEFAULT_ID, get, savedId, hasSaved, save, apply };
})(window);
