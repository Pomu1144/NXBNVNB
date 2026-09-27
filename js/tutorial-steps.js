/* js/tutorial-steps.js
 * ---------------------------------------------------------------------------
 * Content of the first-time tutorial (engine: js/tutorial.js). Edit steps
 * here; the engine needs no change.
 *
 * Steps run in order and can span pages. Each step:
 *   id        unique name (progress is saved by id, so keep ids stable)
 *   page      page it shows on: 'village.html', or with a required query
 *             value: 'teams.html?mode=prebattle'
 *   title     short heading in gold
 *   text      what the sensei says (<b>…</b> for gold emphasis)
 *   target    CSS selector(s) to spotlight (comma list = first visible
 *             match). Leave out for a centred message.
 *   arrow     false hides the pointing kunai
 *   pad       extra spotlight padding in px (default 8)
 *   interactive  true lets taps through the spotlight to the real button
 *   next      Next button label ('Next' by default)
 *   goto      page to open when Next is pressed (moves to the next step)
 *   await     true: Next only closes the overlay; the tutorial continues
 *             when the player reaches the next step's page by themselves
 *   resume    step id the "Continue lesson" tab restarts from when the
 *             player wanders off this step's page (default: this step)
 *   jumpIn    on the first step of a page's run: show this run whenever the
 *             player lands on its page while the tutorial is active and the
 *             run isn't finished (battle basics on the first battle)
 *   waitUntil optional () => boolean; the step waits until it is true
 *   waitMax   give up waiting on waitUntil after this many ms
 *
 * To add a step: copy one of the objects below, give it a new id and put it
 * where it should play. Steps on a new page also need js/tutorial-steps.js,
 * js/tutorial.js and css/tutorial.css included on that page.
 * ------------------------------------------------------------------------- */
window.TUTORIAL = {
  storageKey: 'blazing_tutorial_v1',

  sensei: {
    name: 'Kakashi Sensei',
    sheet: 'assets/sprites/kakashi_705/idle',  // .webp + .json (battle sprite)
  },

  // While any of these is visible the tutorial waits (login bonus,
  // reward reveal, modal dialogs, battle resume prompt…).
  blockers: ['#reward-reveal', '#modal-overlay', '.bresume', '#summon-anim-overlay', '#summon-modal', '#char-preview-modal'],

  steps: [
    /* ── Village menu ─────────────────────────────────────────── */
    {
      id: 'welcome', page: 'village.html',
      waitUntil: () => document.body.dataset.loginBonus === 'done', waitMax: 6000,
      title: 'Welcome, Genin!',
      text: 'I\'m Kakashi, and I\'ll be your sensei. Let me show you around the <b>Hidden Leaf</b> — it won\'t take long.',
    },
    {
      id: 'menu', page: 'village.html', target: '.right-banner-panel', pad: 6,
      title: 'The Village Menu',
      text: 'Everything a shinobi needs is here: <b>Missions</b>, <b>Characters</b>, <b>Summon</b>, <b>Fusion</b>, <b>Shop</b> and the <b>Arena</b>.',
    },
    {
      id: 'menu-missions', page: 'village.html', target: '.right-banner-panel .banner-button.missions',
      title: 'Missions',
      text: 'Story and event missions. Clear them for Ryo, EXP and materials.',
    },
    {
      id: 'menu-shinobi', page: 'village.html', target: '.right-banner-panel .banner-button.characters',
      title: 'Characters',
      text: 'Your shinobi roster. Level them up, awaken them and change their <b>skins</b> here.',
    },
    {
      id: 'menu-summon', page: 'village.html', target: '.right-banner-panel .banner-button.summon',
      title: 'Summon',
      text: 'Spend <b>Ninja Pearls</b> to call new shinobi to your side.',
    },
    {
      id: 'menu-fusion', page: 'village.html', target: '.right-banner-panel .banner-button.fusion',
      title: 'Fusion',
      text: 'Combine materials to power up and evolve your shinobi.',
    },
    {
      id: 'menu-shop', page: 'village.html', target: '.right-banner-panel .banner-button.shop',
      title: 'Shop',
      text: 'Pearls, items, limit-break goods and <b>skins</b>.',
    },
    {
      id: 'menu-arena', page: 'village.html', target: '.right-banner-panel .banner-button.arena',
      title: 'Arena',
      text: 'Test your team against other shinobi once you are ready.',
    },
    {
      id: 'presents', page: 'village.html', target: '.bottom-icon[data-action="presents"]',
      title: 'A Welcome Gift',
      text: 'Your starter <b>Ninja Pearls</b> are waiting in the <b>Present Box</b>. Claim them — you\'ll want them for your first summon.',
    },
    {
      id: 'to-summon', page: 'village.html', target: '.right-banner-panel .banner-button.summon',
      title: 'First Summon',
      text: 'Now, let\'s find you some comrades. To the <b>Summon</b> hall!',
      next: 'Go to Summon', goto: 'summon.html',
    },

    /* ── Summoning ─────────────────────────────────────────────── */
    {
      id: 'summon-banner', page: 'summon.html', target: '#featured-stage', pad: 4,
      title: 'Summon Banners',
      text: 'This is the featured banner. Use the arrows to browse others — each has its own <b>featured shinobi</b> and time limit.',
    },
    {
      id: 'summon-buttons', page: 'summon.html', target: '.summon-buttons',
      title: 'Summon!',
      text: 'Tap <b>×1</b> to call one shinobi, or <b>×10</b> for ten in one go — cheaper per pull. <b>Rates</b> shows the odds.',
    },
    {
      id: 'to-teams', page: 'summon.html', target: '#btn-teams',
      title: 'Build a Team',
      text: 'New shinobi are no use sitting at home. Let\'s put a <b>team</b> together.',
      next: 'Go to Teams', goto: 'teams.html',
    },

    /* ── Building a team ───────────────────────────────────────── */
    {
      id: 'team-slots', page: 'teams.html', target: '.team-formation .slot-row',
      title: 'Your Formation',
      text: 'The <b>front row</b> fights. The <b>back row</b> are backups who can swap in during battle. Tap a slot to fill it.',
    },
    {
      id: 'team-roster', page: 'teams.html', target: '#char-selection',
      title: 'Pick Your Shinobi',
      text: 'Choose a ninja from your roster to put them in the selected slot. Keep an eye on <b>Total Cost</b>.',
    },
    {
      id: 'team-save', page: 'teams.html', target: '#btn-save-team',
      title: 'Save the Team',
      text: 'Happy with it? <b>Save Team</b>, and we\'re ready for a mission.',
      next: 'Go to Missions', goto: 'missions.html',
    },

    /* ── Starting a mission ────────────────────────────────────── */
    {
      id: 'mission-pick', page: 'missions.html',
      target: '.mission-card:not(.mission-locked) .start-btn, .mission-card:not(.mission-locked)',
      interactive: true,
      title: 'Start a Mission',
      text: 'Pick a mission and a difficulty, then tap <b>Start</b>. Go on — I\'ll meet you there.',
      next: 'Got it', await: true,
    },
    {
      id: 'mission-confirm', page: 'teams.html?mode=prebattle', target: '#btn-start-battle',
      interactive: true,
      title: 'Ready?',
      text: 'Check your team one last time, then press <b>Start Mission</b>.',
      next: 'Got it', await: true, resume: 'mission-pick',
    },

    /* ── Battle basics (first battle) ──────────────────────────── */
    {
      id: 'battle-intro', page: 'battle.html', jumpIn: true,
      waitUntil: () => !!(window.BattleManager && window.BattleManager.isPlayerTurn && document.querySelector('.battle-unit.player')),
      title: 'Your First Battle',
      text: 'Battles are fought in turns. Watch closely — I\'ll only say this once. Well… maybe twice.',
    },
    {
      id: 'battle-drag', page: 'battle.html', target: '.battle-unit.player',
      title: 'Move & Attack',
      text: '<b>Drag</b> your ninja across the field and <b>drop them on an enemy</b> to attack. Where you finish your move matters.',
    },
    {
      id: 'battle-jutsu', page: 'battle.html', target: '#team-holder .unit-card.is-acting, #team-holder .unit-card',
      title: 'Jutsu & Ultimates',
      text: 'Tap a portrait <b>once</b> to ready a <b>Jutsu</b>, <b>twice</b> for the <b>Ultimate</b> — then drag to an enemy to unleash it.',
    },
    {
      id: 'battle-chakra', page: 'battle.html', target: '#team-holder .unit-card.is-acting .uc-strip, #team-holder .uc-strip',
      title: 'Chakra',
      text: 'This bar is <b>chakra</b>. Normal attacks fill it; jutsu and ultimates spend it. The <b>JUTSU</b> and <b>ULT</b> tags light up when you can afford them.',
    },
    {
      id: 'battle-turns', page: 'battle.html', target: '#turn-icons, #speed-gauge-track',
      title: 'Turn Order',
      text: 'The turn bar shows <b>who moves next</b>. Faster shinobi act first — and more often.',
    },
    {
      id: 'battle-go', page: 'battle.html',
      title: 'Your Move',
      text: 'That\'s the basics. Win this one, then come back to the <b>village</b> — there\'s one last thing to show you.',
      next: 'Fight!', await: true, resume: 'settings',
    },

    /* ── Settings & skins (back in the village) ────────────────── */
    {
      id: 'settings', page: 'village.html', target: '.bottom-icon[data-action="settings"]',
      title: 'Settings',
      text: 'Sound, display, your account and <b>save data</b> live in <b>Settings</b>. You can replay this tutorial from its <b>Account</b> tab.',
    },
    {
      id: 'skins', page: 'village.html', target: '.right-banner-panel .banner-button.shop',
      title: 'Skins',
      text: 'Buy <b>skins</b> in the Shop\'s Skins tab, then equip them from a ninja\'s info screen in <b>Characters</b>. Looks only — stats never change.',
    },
    {
      id: 'finish', page: 'village.html',
      title: 'Graduation',
      text: 'That\'s everything. The rest you\'ll learn on missions. Now go — and don\'t make me come looking for you.',
      next: 'Finish',
    },
  ],
};
