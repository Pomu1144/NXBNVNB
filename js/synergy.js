// js/synergy.js - Synergy groups shared by the battle (Link Ultimates) and the Teams page
(() => {
  "use strict";

  /**
   * Any two members of the same group have synergy: in battle their
   * ultimates link (js/battle/battle-link-ultimate.js). Matched by character
   * name, so every version of a character counts. The first matching group
   * names the link.
   */
  const GROUPS = [
    { name: "Rival Bond", members: ["Naruto Uzumaki", "Sasuke Uchiha"] },
    { name: "The Strongest", members: ["Gojo Satoru", "Ryomen Sukuna"] },
    { name: "Team 7", members: ["Naruto Uzumaki", "Sasuke Uchiha", "Sakura Haruno", "Kakashi Hatake", "Sai", "Yamato"] },
    { name: "Uzumaki Family", members: ["Naruto Uzumaki", "Minato Namikaze", "Kushina Uzumaki"] },
    { name: "Team Minato", members: ["Minato Namikaze", "Kakashi Hatake", "Obito Uchiha", "Rin Nohara"] },
    { name: "Uchiha Brothers", members: ["Itachi Uchiha", "Sasuke Uchiha"] },
    { name: "Uchiha Brothers", members: ["Madara Uchiha", "Izuna Uchiha"] },
    { name: "Senju Brothers", members: ["Hashirama Senju", "Tobirama Senju"] },
    { name: "Founders of the Leaf", members: ["Hashirama Senju", "Madara Uchiha"] },
    { name: "Moon's Eye Plan", members: ["Madara Uchiha", "Obito Uchiha"] },
    { name: "Reincarnations", members: ["Indra", "Ashura"] },
    { name: "Legendary Sannin", members: ["Jiraiya", "Tsunade", "Orochimaru"] },
    { name: "Team Guy", members: ["Might Guy", "Rock Lee", "Neji Hyuga", "Tenten"] },
    { name: "Ino-Shika-Cho", members: ["Ino Yamanaka", "Shikamaru Nara", "Choji Akimichi", "Asuma Sarutobi"] },
    { name: "Team 8", members: ["Hinata Hyuga", "Kiba Inuzuka", "Shino Aburame", "Kurenai Yuhi"] },
    { name: "Sand Siblings", members: ["Gaara", "Temari", "Kankuro"] },
    { name: "Taka", members: ["Sasuke Uchiha", "Karin", "Suigetsu Hozuki", "Jugo"] },
    { name: "Demon of the Mist", members: ["Zabuza Momochi", "Haku"] },
    { name: "Sound Four", members: ["Tayuya", "Kidomaru", "Jirobo", "Sakon", "Kimimaro"] },
    { name: "Hidden Cloud", members: ["Killer Bee", "Darui"] },
    { name: "Akatsuki: Itachi & Kisame", members: ["Itachi Uchiha", "Kisame Hoshigaki"] },
    { name: "Akatsuki: Art Is…", members: ["Deidara", "Sasori"] },
    { name: "Akatsuki: Zombie Combo", members: ["Hidan", "Kakuzu"] },
    { name: "Akatsuki: Angel & God", members: ["Pain", "Konan", "Nagato"] },
  ];

  const norm = s => String(s || "").trim().toLowerCase();
  const GROUPS_N = GROUPS.map(g => ({ name: g.name, members: new Set(g.members.map(norm)) }));

  const Synergy = {
    GROUPS,

    /** Name of the link between two character names, or null (same character never links). */
    linkName(nameA, nameB) {
      const a = norm(nameA), b = norm(nameB);
      if (!a || !b || a === b) return null;
      const g = GROUPS_N.find(g => g.members.has(a) && g.members.has(b));
      return g ? g.name : null;
    },

    /**
     * Every synergy pair among `items` (anything with a `name`).
     * Returns [{ a, b, name }] with a / b the original items, each pair once.
     */
    pairs(items) {
      const list = (items || []).filter(x => x && x.name);
      const out = [];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const name = this.linkName(list[i].name, list[j].name);
          if (name) out.push({ a: list[i], b: list[j], name });
        }
      }
      return out;
    }
  };

  window.Synergy = Synergy;
})();
