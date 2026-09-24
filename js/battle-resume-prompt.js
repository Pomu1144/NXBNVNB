// js/battle-resume-prompt.js - "Resume battle?" card on the village / missions pages.
// Shown when a battle was left mid-fight (navigated away rather than
// refreshed). Resume goes back into it; Abandon counts as a retreat and
// deletes the saved battle. Needs js/battle/battle-save.js loaded first.
(() => {
  "use strict";

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function injectStyle() {
    if (document.getElementById("bresume-style")) return;
    const st = document.createElement("style");
    st.id = "bresume-style";
    st.textContent = `
      .bresume{position:fixed;left:16px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:9000;
        transform:translateY(12px);opacity:0;transition:opacity .25s ease,transform .25s ease;
        width:min(420px,calc(100vw - 32px));box-sizing:border-box;padding:12px 14px;
        background:linear-gradient(180deg,var(--jjk-ink-2,#0c2229),var(--jjk-ink,#071418));
        border:1px solid var(--jjk-gold,#c9a24e);border-radius:6px;
        box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 0 3px rgba(45,107,115,.55),0 12px 30px rgba(0,0,0,.6);
        color:var(--jjk-text,#ece6d6);font-family:var(--jjk-font,'Kaisei Tokumin',serif);}
      .bresume.is-in{opacity:1;transform:none;}
      .bresume-title{color:var(--jjk-gold-hi,#f1d98a);font-weight:700;letter-spacing:.08em;font-size:.95rem;}
      .bresume-sub{color:var(--jjk-muted,#93a3a3);font-size:.78rem;margin-top:2px;overflow-wrap:anywhere;}
      .bresume-actions{display:flex;gap:8px;margin-top:10px;}
      .bresume-actions button{flex:1;min-height:36px;cursor:pointer;font:inherit;font-size:.85rem;letter-spacing:.05em;
        border-radius:4px;border:1px solid var(--jjk-gold,#c9a24e);}
      .bresume-go{background:linear-gradient(180deg,var(--jjk-gold-hi,#f1d98a),var(--jjk-gold,#c9a24e));color:#1b1406;font-weight:700;}
      .bresume-drop{background:transparent;color:var(--jjk-text,#ece6d6);border-color:var(--jjk-teal,#2d6b73)!important;}
      .bresume-drop.is-armed{border-color:#b04a3a!important;color:#ffb4a6;}
    `;
    document.head.appendChild(st);
  }

  function show() {
    const BS = window.BattleSave;
    if (!BS) return;
    const snap = BS.peek();
    if (!snap) return;

    injectStyle();
    const el = document.createElement("div");
    el.className = "bresume";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Resume battle");
    const where = snap.isArena ? "Arena battle" : (snap.missionName || "Mission");
    const rank = snap.isArena ? "" : ` · ${esc(snap.difficulty)}-Rank`;
    el.innerHTML = `
      <div class="bresume-title">Resume battle?</div>
      <div class="bresume-sub">${esc(where)}${rank} · Stage ${Number(snap.stageIndex) + 1} · Wave ${Number(snap.waveIndex) + 1}</div>
      <div class="bresume-actions">
        <button type="button" class="bresume-go">Resume</button>
        <button type="button" class="bresume-drop">Abandon</button>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-in"));

    el.querySelector(".bresume-go").addEventListener("click", () => {
      try {
        if (!snap.isArena && snap.missionId) {
          localStorage.setItem("currentMissionId", String(snap.missionId));
          localStorage.setItem("currentDifficulty", String(snap.difficulty));
          if (snap.missionName) localStorage.setItem("currentMissionName", snap.missionName);
        }
        localStorage.setItem(BS.INTENT_KEY, snap.battleId);
      } catch (e) { /* storage blocked: battle page will start fresh */ }
      window.location.href = "battle.html";
    });

    const drop = el.querySelector(".bresume-drop");
    drop.addEventListener("click", () => {
      if (!drop.classList.contains("is-armed")) {
        drop.classList.add("is-armed");
        drop.textContent = "Tap again to abandon";
        return;
      }
      BS.clearSaved("abandoned");
      el.classList.remove("is-in");
      setTimeout(() => el.remove(), 300);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
})();
