// ────────────────────────────────────────────────────────────────────────────
// Bonds overview (plan 008): an "All characters" button on the Bonds tab of the
// chat card, opening a popup with every character's bonds kept for this chat —
// including characters who left the story long ago. The ones the story is being
// handed right now (Current Info) are marked and listed first.
// ────────────────────────────────────────────────────────────────────────────

import { Popup, POPUP_TYPE, getContext } from "../../st.js";
import { bondsOverview } from "../../state/index.js";
import { meguminCleanChatHistoryText } from "../../engine/chatText.js";
import { openStatsEditor } from "./editor.js";

const esc = v => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function recentStoryText(count = 3) {
    const chat = (getContext() && getContext().chat) || [];
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < count; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        out.push(meguminCleanChatHistoryText(String(m.mes || "")));
    }
    return out.join("\n");
}

function fieldRow(f) {
    if (f.max !== undefined && typeof f.value === "number") {
        const pct = Math.max(0, Math.min(100, (f.value / (f.max || 100)) * 100));
        return `<div class="meg-bonds-field">
            <span class="meg-bonds-label" title="${esc(f.label)}">${esc(f.label)}</span>
            <span class="meg-bonds-bar"><span style="width:${pct.toFixed(0)}%"></span></span>
            <span class="meg-bonds-val">${esc(f.text)}</span>
        </div>`;
    }
    return `<div class="meg-bonds-field is-text">
        <span class="meg-bonds-label" title="${esc(f.label)}">${esc(f.label)}</span>
        <span class="meg-bonds-val">${esc(f.text)}</span>
    </div>`;
}

function personCard(p) {
    return `<div class="meg-bonds-person ${p.inPlay ? "in-play" : ""}" data-name="${esc(p.name.toLowerCase())}">
        <div class="meg-bonds-name">
            <span>${esc(p.name)}</span>
            ${p.inPlay ? `<span class="meg-bonds-now" title="The story model is given these values right now">In the story now</span>` : ""}
        </div>
        ${p.fields.map(fieldRow).join("")}
    </div>`;
}

export async function openBondsOverview() {
    const people = bondsOverview({ recentText: recentStoryText() });
    const $root = $(`
        <div class="meg-bonds-pop">
            <div class="meg-bonds-pop-head">
                <h3><i class="fa-solid fa-heart" style="color:#f43f5e;"></i> Bonds <span class="meg-bonds-pop-hint">${people.length} character${people.length === 1 ? "" : "s"}</span></h3>
                ${people.length > 6 ? `<input type="search" class="ps-modern-input meg-bonds-search" placeholder="Search a name…"/>` : ""}
                <button type="button" class="meg-bonds-all meg-bonds-edit" title="Edit values, add or forget characters"><i class="fa-solid fa-pen"></i> Edit</button>
            </div>
            <div class="meg-bonds-pop-hint">Everyone's bonds kept for this chat. Marked ones are handed to the story right now; the rest come back when they return.</div>
            ${people.length
                ? `<div class="meg-bonds-grid">${people.map(personCard).join("")}</div>`
                : `<div class="meg-bonds-empty">No bonds on file for this chat yet.</div>`}
        </div>
    `);
    $root.find(".meg-bonds-edit").on("click", () => { openStatsEditor({ view: "bonds" }); });
    $root.find(".meg-bonds-search").on("input", function () {
        const q = String($(this).val() || "").toLowerCase().trim();
        $root.find(".meg-bonds-person").each(function () {
            $(this).toggle(!q || String($(this).attr("data-name")).includes(q));
        });
    });
    await new Popup($root, POPUP_TYPE.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "Close" }).show();
}

function toolButton(html, title, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "meg-bonds-all";
    b.title = title;
    b.innerHTML = html;
    b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return b;
}

/** "All characters" and "Edit" at the top of one message's Bonds pane. */
export function bondsDecoratePane(paneEl) {
    if (!paneEl || paneEl.querySelector(".meg-bonds-tools")) return;
    const tools = document.createElement("div");
    tools.className = "meg-bonds-tools";
    tools.append(
        toolButton(`<i class="fa-solid fa-users"></i> All characters`, "Every character's bonds kept for this chat", () => openBondsOverview()),
        toolButton(`<i class="fa-solid fa-pen"></i> Edit`, "Edit bonds, add or forget characters", () => openStatsEditor({ view: "bonds" }))
    );
    paneEl.prepend(tools);
}

/** "Edit sheet" at the top of one message's Character Sheet pane. */
export function sheetDecoratePane(paneEl) {
    if (!paneEl || paneEl.querySelector(".meg-bonds-tools")) return;
    const tools = document.createElement("div");
    tools.className = "meg-bonds-tools";
    tools.append(toolButton(`<i class="fa-solid fa-pen"></i> Edit sheet`, "Edit the sheet's values", () => openStatsEditor({ view: "sheet" })));
    paneEl.prepend(tools);
}
