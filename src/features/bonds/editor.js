// ────────────────────────────────────────────────────────────────────────────
// Bonds / Sheet editor (plan 008).
//
//   Bonds   — every character's bonds, each value editable; add a character,
//             forget one.
//   Sheet   — the player's sheet, each value editable.
//
// An edit is kept as the user's own change, so swipes, rewinds and deletes
// never undo it. To change it again, just edit it again.
// ────────────────────────────────────────────────────────────────────────────

import { Popup, POPUP_TYPE, getContext, substituteParams } from "../../st.js";
import { statsState, statsEdit, statBlockOn } from "../../state/index.js";
import { parseStatValue, statKey } from "../../state/modules/stats/parse.js";
import { meguminStatFields } from "../blocks/registry.js";
import { meguminScheduleBlocksRefresh } from "../blocks/chat.js";

const esc = v => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sub = t => { try { return substituteParams(t); } catch (e) { return t; } };

// The configured fields first (in their order), then any the model added.
function fieldList(onFile, blockId) {
    const cfg = meguminStatFields(blockId).map(f => ({ key: statKey(f.label), label: f.label, cfg: f }));
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

function cell(who, f, onFile) {
    const value = (onFile && onFile[f.key] && onFile[f.key].text) || "";
    return `<label class="meg-wsed-cell"><span>${esc(f.label)}</span>
        <input type="text" class="ps-modern-input meg-wsed-input meg-sted-input"
            data-who="${esc(who)}" data-key="${esc(f.key)}" data-label="${esc(f.label)}"
            data-type="${esc(f.cfg ? f.cfg.type : "")}" data-max="${esc(f.cfg && f.cfg.max ? f.cfg.max : "")}"
            value="${esc(value)}" data-was="${esc(value)}" placeholder="${esc(hintFor(f.cfg))}" />
    </label>`;
}

// ── Bonds view ───────────────────────────────────────────────────────────

function renderBondsView() {
    const state = statsState("bonds") || { people: {} };
    const people = Object.values(state.people || {}).sort((a, b) => (b.seq || 0) - (a.seq || 0) || a.name.localeCompare(b.name));
    const off = statBlockOn("bonds") ? "" : `<div class="meg-wsed-hint">The Bonds block is off, so these are kept but not handed to the story.</div>`;
    const person = p => `
        <div class="meg-wsed-person meg-sted-person" data-name="${esc(p.name.toLowerCase())}">
            <div class="meg-wsed-person-head">
                <b>${esc(p.name)}</b>
                <button type="button" class="meg-wsed-mini meg-sted-forget" data-who="${esc(p.name)}" title="Forget this character's bonds entirely"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="meg-wsed-grid">${fieldList(p.fields, "bonds").map(f => cell(p.name, f, p.fields)).join("")}</div>
        </div>`;
    return `
        <div class="meg-wsed-section">
            <div class="meg-wsed-title"><i class="fa-solid fa-heart"></i> Bonds <span class="meg-wsed-tag">${people.length}</span>
                ${people.length > 6 ? `<input type="search" class="ps-modern-input meg-sted-search" placeholder="Search a name…"/>` : ""}
            </div>
            ${off}
            <div class="meg-wsed-listrow">
                <input type="text" class="ps-modern-input meg-sted-addchar" placeholder="+ Add a character (name, then Enter)" />
            </div>
            ${people.map(person).join("") || `<div class="meg-wsed-empty">No bonds on file for this chat yet.</div>`}
        </div>`;
}

// ── Sheet view ───────────────────────────────────────────────────────────

function renderSheetView() {
    const state = statsState("sheet") || { fields: {} };
    const off = statBlockOn("sheet") ? "" : `<div class="meg-wsed-hint">The Character Sheet block is off, so this is kept but not handed to the story.</div>`;
    return `
        <div class="meg-wsed-section">
            <div class="meg-wsed-title"><i class="fa-solid fa-shield-halved"></i> ${esc(sub("{{user}}"))} <span class="meg-wsed-tag">player</span></div>
            ${off}
            <div class="meg-wsed-grid">${fieldList(state.fields, "sheet").map(f => cell("", f, state.fields)).join("")}</div>
        </div>`;
}

// ── Popup ────────────────────────────────────────────────────────────────

/** One edited value as a field change; "" clears it. A meter keeps its max. */
function fieldChange(d, raw) {
    if (!raw) return { key: d.key, label: d.label, remove: true };
    const v = parseStatValue(raw);
    if (!v) return null;
    if (d.type === "meter" && v.value !== undefined && v.max === undefined && d.max) {
        v.max = Number(d.max);
        v.text = `${v.value}/${v.max}`;
    }
    return { key: d.key, label: d.label, ...v };
}

/** @param {{ view?: "bonds"|"sheet" }} [opts] */
export async function openStatsEditor({ view = "bonds" } = {}) {
    if (!getContext()?.chatId) {
        toastr.info("Open a chat first: bonds and the sheet belong to a chat.", "Megumin Suite");
        return;
    }
    let current = view === "sheet" ? "sheet" : "bonds";
    let search = "";
    const $root = $(`<div class="meg-wsed meg-sted"></div>`);

    const commit = (moduleId, parsed) => {
        statsEdit(moduleId, parsed);
        meguminScheduleBlocksRefresh();
        draw();
    };

    function draw() {
        const scrollBox = $root.closest(".popup-content")[0] || $root[0];
        const keepScroll = scrollBox ? scrollBox.scrollTop : 0;
        const tab = (id, icon, label) => `<button type="button" class="meg-wsed-tab ${current === id ? "active" : ""}" data-view="${id}"><i class="fa-solid ${icon}"></i> ${label}</button>`;
        $root.html(`
            <div class="meg-wsed-top">
                <div class="meg-wsed-tabs">
                    ${tab("bonds", "fa-heart", "Bonds")}${tab("sheet", "fa-shield-halved", "Sheet")}
                </div>
                <div class="meg-wsed-hint">Your edits are kept: swipes, rewinds and deletes never undo them. Clear a box to remove that value.</div>
            </div>
            ${current === "bonds" ? renderBondsView() : renderSheetView()}
        `);
        bind();
        if (search) $root.find(".meg-sted-search").val(search).trigger("input");
        if (scrollBox) scrollBox.scrollTop = keepScroll;
    }

    function bind() {
        $root.find(".meg-wsed-tab").on("click", function () { current = $(this).data("view"); draw(); });

        $root.find(".meg-sted-input").on("change", function () {
            const raw = String($(this).val() || "").trim();
            if (raw === String($(this).attr("data-was") || "")) return;
            const d = this.dataset;
            const f = fieldChange(d, raw);
            if (!f) { toastr.warning("That value was not understood.", "Megumin Suite"); return; }
            if (current === "sheet") commit("sheet", { kind: "delta", fields: [f] });
            else commit("bonds", { kind: "delta", people: [{ name: d.who, fields: [f] }] });
        }).on("keydown", function (e) { if (e.key === "Enter") this.blur(); });

        $root.find(".meg-sted-addchar").on("keydown", function (e) {
            if (e.key !== "Enter") return;
            const name = String($(this).val() || "").trim();
            if (!name) return;
            // Starts at the configured starting values.
            const fields = meguminStatFields("bonds")
                .filter(f => f.type === "meter" || f.type === "number")
                .map(f => {
                    const start = f.start !== undefined ? f.start : 0;
                    return f.type === "meter"
                        ? { key: statKey(f.label), label: f.label, text: `${start}/${f.max || 100}`, value: start, max: f.max || 100 }
                        : { key: statKey(f.label), label: f.label, text: String(start), value: start };
                });
            if (!fields.length) { toastr.warning("Bonds has no number fields to start from.", "Megumin Suite"); return; }
            commit("bonds", { kind: "delta", people: [{ name, fields }] });
        });

        $root.find(".meg-sted-forget").on("click", function () {
            const $b = $(this);
            if ($b.attr("data-armed") !== "1") {
                $b.attr("data-armed", "1").addClass("armed").html(`<i class="fa-solid fa-trash"></i> Forget?`);
                setTimeout(() => $b.attr("data-armed", "0").removeClass("armed").html(`<i class="fa-solid fa-trash"></i>`), 3000);
                return;
            }
            commit("bonds", { kind: "delta", people: [], forget: [this.dataset.who] });
        });

        $root.find(".meg-sted-search").on("input", function () {
            search = String($(this).val() || "");
            const q = search.toLowerCase().trim();
            $root.find(".meg-sted-person").each(function () {
                $(this).toggle(!q || String($(this).attr("data-name")).includes(q));
            });
        });

    }

    draw();
    await new Popup($root, POPUP_TYPE.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "Close" }).show();
    meguminScheduleBlocksRefresh();
}
