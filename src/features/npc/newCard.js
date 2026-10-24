// ────────────────────────────────────────────────────────────────────────────
// The New NPC tab inside the chat card: an "Open in NPC Bank" button on top of
// the dossier card (the card itself is drawn by blocks/treatments.js).
//
// Opens the settings window on the NPC Bank with that character in view, through
// the side panel's bridge (window.LukaSuite.openNpcBook), which already knows how
// to open the window from the chat. No button when the character isn't banked.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../core/state.js";

const norm = s => String(s || "").replace(/\*\*/g, "").trim().toLowerCase();

export function npcDecorateNewPane(paneEl) {
    if (!paneEl || paneEl.querySelector(".meg-npc-tools")) return;
    const card = paneEl.querySelector(".meg-npc-card");
    if (!card) return;
    const name = card.getAttribute("data-npc-name") || "";
    const npcs = (localProfile && localProfile.npcBank && localProfile.npcBank.npcs) || [];
    const idx = npcs.findIndex(n => norm(n.name) === norm(name));
    const open = window.LukaSuite && typeof window.LukaSuite.openNpcBook === "function" ? window.LukaSuite.openNpcBook : null;

    const tools = document.createElement("div");
    tools.className = "meg-bonds-tools meg-npc-tools";
    if (idx >= 0 && open) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "menu_button";
        btn.title = `Open ${name}'s record in the NPC Bank`;
        btn.innerHTML = `<i class="fa-solid fa-address-book"></i> Open in NPC Bank`;
        btn.addEventListener("click", e => { e.stopPropagation(); open(idx); });
        tools.appendChild(btn);
    } else {
        const note = document.createElement("span");
        note.className = "meg-npc-unbanked";
        note.textContent = "Not in the NPC Bank yet.";
        tools.appendChild(note);
    }
    paneEl.prepend(tools);
}
