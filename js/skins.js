/* Cosmetic skins: catalogue, ownership and the equipped skin per unit.
 *
 *   Skins.forChar('naruto_2115')         -> [skin, ...] listed for that unit
 *   Skins.equip('naruto_2115', skinId)   -> equip (null = Default)
 *   Skins.equippedId('naruto_2115')      -> skin id or null
 *   Skins.folderFor('naruto_2115')       -> sprite folder of the equipped skin, or null
 *   Skins.probe(skin)                    -> Promise<bool>: its art is on the server
 *
 * A skin folder holds the body sheets listed in `own` (same format as the
 * unit's own folder, see js/sprite-player.js) plus thumb.webp, a square crop
 * for cards and buttons. Every other sheet (effect layers, extra jutsu
 * parts...) is read from the unit's base folder: each skin is registered with
 * SpritePlayer.registerShared(folder, baseFolder, own).
 *
 * Adding a skin: drop its folder under assets/sprites/skins/<id>/ and add an
 * entry to CATALOGUE. All charIds of one skin should share one base folder.
 *
 * Storage (localStorage, saved by js/player-save-system.js):
 *   blazing_skins_equipped_v1  { charId: skinId }
 *   blazing_skins_owned_v1     [skinId, ...]   (purchases, once the store sells)
 * Fires window 'skins:change' { detail: { charId, skinId } } on equip / grant.
 */
(function () {
  "use strict";

  // Purchasing isn't live yet: every skin counts as owned while this is true.
  // Set it to false once the store sells skins (ownership then comes from
  // blazing_skins_owned_v1, filled by Skins.grant()).
  const ALL_SKINS_UNLOCKED = true;

  const EQUIP_KEY = 'blazing_skins_equipped_v1';
  const OWNED_KEY = 'blazing_skins_owned_v1';
  const BODY = ['idle', 'run', 'attack', 'hit', 'ko', 'jutsu', 'ultimate'];

  // price: Ninja Pearls (a single summon is 5, a multi 30).
  const CATALOGUE = [
    { id: 'naruto_2115_hokage', charIds: ['naruto_2115'], unit: 'Naruto Uzumaki', name: 'Seventh Hokage',
      folder: 'assets/sprites/skins/naruto_2115_hokage', own: BODY, thumb: 'assets/sprites/skins/naruto_2115_hokage/thumb.webp', price: 60 },
    { id: 'sasuke_2117_akatsuki', charIds: ['sasuke_2117', 'sasuke_2116'], unit: 'Sasuke Uchiha', name: 'Akatsuki Cloak',
      folder: 'assets/sprites/skins/sasuke_2117_akatsuki', own: [...BODY, 'secret'], thumb: 'assets/sprites/skins/sasuke_2117_akatsuki/thumb.webp', price: 50 },
    { id: 'itachi_2031_anbu', charIds: ['itachi_2031', 'itachi_2032'], unit: 'Itachi Uchiha', name: 'ANBU Black Ops',
      folder: 'assets/sprites/skins/itachi_2031_anbu', own: BODY, thumb: 'assets/sprites/skins/itachi_2031_anbu/thumb.webp', price: 45 },
    { id: 'itachi_2096_online', charIds: ['itachi_2096', 'itachi_2094'], unit: 'Itachi Uchiha', name: 'Akatsuki (Online)',
      folder: 'assets/sprites/online/itachi', own: BODY, thumb: 'assets/sprites/online/itachi/thumb.webp', price: 50 },
    { id: 'minato_2101_online', charIds: ['minato_2101'], unit: 'Minato Namikaze', name: 'Hokage Cloak',
      folder: 'assets/sprites/skins/minato_2101_online', own: BODY, thumb: 'assets/sprites/skins/minato_2101_online/thumb.webp', price: 50 },
  ];
  const BYID = new Map(CATALOGUE.map(s => [s.id, s]));

  function read(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : fallback; }
    catch (_) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('[Skins] save failed', e); }
  }
  const emit = detail => { try { window.dispatchEvent(new CustomEvent('skins:change', { detail })); } catch (_) { /* old browser */ } };

  function get(id) { return BYID.get(id) || null; }
  function forChar(charId) { return CATALOGUE.filter(s => s.charIds.includes(charId)); }
  function hasSkins(charId) { return CATALOGUE.some(s => s.charIds.includes(charId)); }

  function isOwned(id) {
    if (!BYID.has(id)) return false;
    return ALL_SKINS_UNLOCKED || read(OWNED_KEY, []).includes(id);
  }
  /** Record a skin as owned (for the store's purchase flow). */
  function grant(id) {
    if (!BYID.has(id)) return false;
    const owned = read(OWNED_KEY, []);
    if (!Array.isArray(owned)) return false;
    if (!owned.includes(id)) { owned.push(id); write(OWNED_KEY, owned); }
    emit({ skinId: id, granted: true });
    return true;
  }

  /* ---- Art availability: the art is produced separately, so a listed skin
   * may not have its folder yet. probe() checks thumb.webp + idle.json once;
   * until it answers the skin is treated as present (a missing sheet still
   * falls back to the base folder inside SpritePlayer). */
  const probes = new Map();   // id -> Promise<bool>
  const missing = new Set();  // ids known to have no art
  function probe(skin) {
    skin = typeof skin === 'string' ? get(skin) : skin;
    if (!skin) return Promise.resolve(false);
    if (!probes.has(skin.id)) {
      const thumb = new Promise(res => {
        const img = new Image();
        img.onload = () => res(img.naturalWidth > 0);
        img.onerror = () => res(false);
        img.src = skin.thumb;
      });
      const idle = fetch(`${skin.folder}/idle.json`, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
      probes.set(skin.id, Promise.all([thumb, idle]).then(([a, b]) => {
        const ok = a && b;
        if (!ok) missing.add(skin.id);
        return ok;
      }));
    }
    return probes.get(skin.id);
  }
  const isMissing = id => missing.has(id);

  /* ---- Equipped skin per charId ---- */
  function equippedId(charId) {
    const id = read(EQUIP_KEY, {})[charId];
    const s = id && get(id);
    return s && s.charIds.includes(charId) && isOwned(id) ? id : null;
  }
  function equip(charId, skinId) {
    if (skinId && !(get(skinId)?.charIds.includes(charId) && isOwned(skinId))) return false;
    const map = read(EQUIP_KEY, {});
    if (skinId) map[charId] = skinId; else delete map[charId];
    write(EQUIP_KEY, map);
    emit({ charId, skinId: skinId || null });
    return true;
  }
  /** Sprite folder for the unit's equipped skin, or null (use the base folder). */
  function folderFor(charId) {
    const id = equippedId(charId);
    return id && !missing.has(id) ? get(id).folder : null;
  }

  function attach(SP) {
    if (!SP?.registerShared) return;
    for (const s of CATALOGUE) {
      const from = SP.basePathFor?.(s.charIds[0]);
      if (from) SP.registerShared(s.folder, from, s.own);
    }
  }
  attach(window.SpritePlayer);
  // Check the equipped skins' art early, so a skin whose art hasn't landed
  // falls back to the base folder before battle asks for its sheets.
  for (const id of new Set(Object.values(read(EQUIP_KEY, {})))) if (BYID.has(id)) probe(id);

  // Another tab equipped / bought something: let open screens refresh.
  window.addEventListener('storage', e => { if (e.key === EQUIP_KEY || e.key === OWNED_KEY) emit({ external: true }); });

  window.Skins = {
    ALL_SKINS_UNLOCKED, EQUIP_KEY, OWNED_KEY,
    all: () => CATALOGUE.slice(),
    get, forChar, hasSkins,
    isOwned, grant,
    probe, isMissing,
    equippedId, equip, folderFor,
    attach,
  };
})();
