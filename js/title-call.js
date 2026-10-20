// js/title-call.js — the original game's title call on the title screen.
//
// One of the original voice lines (assets/audio/original/voice/
// voice_ui_titlecall_*, from the game's sound bank) plays on the first tap or
// key press on the title page, as the original did when the title screen was
// tapped. Browsers only start audio inside a gesture, so it can't play on load.
// Uses the sound-effect volume and mute (AudioManager.playVoice).
(function () {
  'use strict';

  const DIR = 'assets/audio/original/voice/';
  // voice_ui_titlecall_01__1 (0.8 s) is a fragment of take 01__2, so it's left out
  const CLIPS = ['01__2', '02', '03', '04', '05', '06', '07', '08', '09', '10',
    '11', '12', '13', '14', '15', '16', '17', '18'].map(n => `${DIR}voice_ui_titlecall_${n}.mp3`);
  const EVENTS = ['pointerdown', 'keydown'];

  function play() {
    EVENTS.forEach(ev => document.removeEventListener(ev, play, true));
    const AM = window.AudioManager;
    if (!AM || !AM.playVoice) return;
    AM.playVoice(CLIPS[Math.floor(Math.random() * CLIPS.length)]);
  }

  EVENTS.forEach(ev => document.addEventListener(ev, play, { capture: true, passive: true }));
  window.TitleCall = { CLIPS, play };
})();
