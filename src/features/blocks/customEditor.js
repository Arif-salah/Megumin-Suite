// ────────────────────────────────────────────────────────────────────────────
// Edit a custom block's values by hand (plan 023, phase 4).
//
// Opened from the Edit button on the block's tab in the chat card. Fields are
// edited one box at a time, like the Sheet; free text as a whole. An edit is
// kept as the user's own change, so swipes, rewinds and deletes never undo it.
// ────────────────────────────────────────────────────────────────────────────

import { Popup, POPUP_TYPE, getContext } from "../../st.js";
import { customBlocks, customBlockState, customEdit } from "../../state/index.js";
import { statKey } from "../../state/modules/stats/parse.js";
import { fieldChange } from "../bonds/editor.js";
import { meguminScheduleBlocksRefresh } from "./chat.js";

const esc = v => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MEMORY_NOTE = {
    fresh: "This block starts fresh, so the story doesn't see these values. They are kept for the card.",
    chat: "The story reads this block's old copies in the chat. Your edit changes what is kept, and what Chomusuke starts from if it writes this block.",
    info: "The story reads these values in Current Info before its next reply."
};

// The block's own fields first (in their order), then any the story added.
function fieldList(b, onFile) {
    const cfg = (b.fields || []).filter(f => f && f.label).map(f => ({ key: statKey(f.label), label: f.label, cfg: f }));
    const extra = Object.entries(onFile || {})
        .filter(([k]) => !cfg.some(c => c.key === k))
        .map(([k, f]) => ({ key: k, label: f.label, cfg: null }));
    return [...cfg, ...extra];
}

function hintFor(cfg) {
    if (!cfg) return "";
    if (cfg.type === "meter") return `0-${cfg.max || 100}`;
    if (cfg.type === "number") return "number";
    return cfg.hint || "";
}

/** @param {string} id  the custom block's id */
export async function openCustomBlockValues(id) {
    if (!getContext()?.chatId) {
        toastr.info("Open a chat first: a block's values belong to a chat.", "Megumin Suite");
        return;
    }
    const b = customBlocks().find(x => x.id === id);
    if (!b) return;
    const $root = $(`<div class="meg-wsed meg-sted"></div>`);

    function draw() {
        const s = customBlockState(id);
        const head = `
            <div class="meg-wsed-top">
                <div class="meg-wsed-hint">Your edits are kept: swipes, rewinds and deletes never undo them.${b.kind === "fields" ? " Clear a box to remove that value." : ""}</div>
                <div class="meg-wsed-hint">${esc(MEMORY_NOTE[b.memory] || "")}</div>
            </div>`;
        if (b.kind === "fields") {
            const onFile = s && s.kind === "fields" ? s.fields : {};
            const cells = fieldList(b, onFile).map(f => {
                const value = (onFile[f.key] && onFile[f.key].text) || "";
                return `<label class="meg-wsed-cell"><span>${esc(f.label)}</span>
                    <input type="text" class="ps-modern-input meg-wsed-input meg-cbed-input"
                        data-key="${esc(f.key)}" data-label="${esc(f.label)}"
                        data-type="${esc(f.cfg ? f.cfg.type : "")}" data-max="${esc(f.cfg && f.cfg.max ? f.cfg.max : "")}"
                        value="${esc(value)}" data-was="${esc(value)}" placeholder="${esc(hintFor(f.cfg))}" />
                </label>`;
            }).join("");
            $root.html(`${head}
                <div class="meg-wsed-section">
                    <div class="meg-wsed-title"><span>${esc(b.emoji || "📦")}</span> ${esc(b.label || b.tag)}</div>
                    <div class="meg-wsed-grid">${cells || `<div class="meg-wsed-empty">This block has no fields.</div>`}</div>
                </div>`);
        } else {
            const text = s && s.kind === "text" ? s.text : "";
            $root.html(`${head}
                <div class="meg-wsed-section">
                    <div class="meg-wsed-title"><span>${esc(b.emoji || "📦")}</span> ${esc(b.label || b.tag)}</div>
                    <textarea class="ps-modern-input meg-cbed-text" rows="10" style="width:100%; resize:vertical;">${esc(text)}</textarea>
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <button type="button" class="menu_button meg-cbed-save"><i class="fa-solid fa-check"></i> Save text</button>
                    </div>
                </div>`);
        }
        bind();
    }

    function bind() {
        $root.find(".meg-cbed-input").on("change", function () {
            const raw = String($(this).val() || "").trim();
            if (raw === String($(this).attr("data-was") || "")) return;
            const f = fieldChange(this.dataset, raw);
            if (!f) { toastr.warning("That value was not understood.", "Megumin Suite"); return; }
            customEdit(id, { kind: "fields", fields: [f] });
            meguminScheduleBlocksRefresh();
            draw();
        }).on("keydown", function (e) { if (e.key === "Enter") this.blur(); });

        $root.find(".meg-cbed-save").on("click", () => {
            const text = String($root.find(".meg-cbed-text").val() || "").trim();
            customEdit(id, text ? { kind: "text", text } : { kind: "text", clear: true });
            meguminScheduleBlocksRefresh();
            toastr.success("Saved.", "Megumin Suite");
            draw();
        });
    }

    draw();
    await new Popup($root, POPUP_TYPE.TEXT, "", { wide: true, allowVerticalScrolling: true, okButton: "Close" }).show();
    meguminScheduleBlocksRefresh();
}

/** "Edit" at the top of a custom block's tab in the chat card. */
export function customDecoratePane(paneEl, id) {
    if (!paneEl || paneEl.querySelector(".meg-cbed-open")) return;
    let tools = paneEl.querySelector(".meg-bonds-tools");
    if (!tools) {
        tools = document.createElement("div");
        tools.className = "meg-bonds-tools";
        paneEl.prepend(tools);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "meg-bonds-all meg-cbed-open";
    btn.title = "Change this block's values by hand";
    btn.innerHTML = `<i class="fa-solid fa-pen"></i> Edit`;
    btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openCustomBlockValues(id); });
    tools.prepend(btn);
}
