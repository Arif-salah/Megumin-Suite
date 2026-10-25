// ────────────────────────────────────────────────────────────────────────────
// World State editor.
//
// Two views over the open chat's state store:
//   State   — the world as it stands now, every field editable. Each edit is
//             kept as the user's own journal entry: swipes, rewinds and deletes
//             never undo it, and it can be deleted from History.
//   History — every entry (replies, imports, edits), newest first, each one
//             switchable off and on.
// Edits commit on change (blur / Enter), not per keystroke, so one edit is one
// history row.
// ────────────────────────────────────────────────────────────────────────────

import { Popup, POPUP_TYPE, substituteParams } from "../../st.js";
import {
    getWorldState, worldEdit, worldHistory, worldSetEntryDisabled, worldRemoveUserEntry,
    worldImportRange, worldChatOpen, stateStore, notebookEnabled
} from "../../state/index.js";
import { presentCast, fieldLabel, LIST_LIMITS } from "../../state/modules/world/model.js";
import { PC_FIELDS, NPC_FIELDS } from "../../state/modules/world/render.js";
import { PC } from "../../state/modules/world/parse.js";
import { meguminScheduleBlocksRefresh } from "../blocks/chat.js";

const esc = v => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const sub = t => { try { return substituteParams(t); } catch (e) { return t; } };

const LISTS = [
    { key: "threads", title: "Unresolved threads", icon: "fa-fire", placeholder: "A major tension or open question" },
    { key: "seeds", title: "Planted seeds", icon: "fa-seedling", placeholder: "A foreshadowing detail and what it hints at" },
    { key: "timers", title: "Consequence timers", icon: "fa-hourglass-half", placeholder: "Consequence: turns left" }
];

function fieldKeys(fields, preferred) {
    const extra = Object.keys(fields || {}).filter(k => !preferred.includes(k));
    return [...preferred, ...extra];
}

function input(attrs, value, placeholder = "") {
    const a = Object.entries(attrs).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ");
    return `<input type="text" class="ps-modern-input meg-wsed-input" ${a} value="${esc(value)}" placeholder="${esc(placeholder)}" data-was="${esc(value)}" />`;
}

// ── State view ───────────────────────────────────────────────────────────

function renderStateView(state) {
    const s = state.scene || {};
    const pcName = state.pc?.name || sub("{{user}}");
    const cast = Object.values(state.cast || {});
    const present = presentCast(state);
    const away = cast.filter(c => !c.present);

    const fieldGrid = (who, fields, preferred) => `
        <div class="meg-wsed-grid">
            ${fieldKeys(fields, preferred).map(f => `
                <label class="meg-wsed-cell"><span>${esc(fieldLabel(f))}</span>
                    ${input({ kind: "field", who, field: f }, fields?.[f] || "")}
                </label>`).join("")}
        </div>`;

    const person = c => `
        <div class="meg-wsed-person ${c.present ? "" : "is-away"}" data-name="${esc(c.name)}">
            <div class="meg-wsed-person-head">
                <b>${esc(c.name)}</b>${(c.aliases || []).map(a => `<span class="meg-wsed-tag">"${esc(a)}"</span>`).join("")}
                <select class="ps-modern-input meg-wsed-status" data-who="${esc(c.name)}">
                    <option value="in" ${c.present ? "selected" : ""}>In the scene</option>
                    <option value="away" ${c.present ? "" : "selected"}>Away</option>
                </select>
                <button type="button" class="meg-wsed-mini meg-wsed-forget" data-who="${esc(c.name)}" title="Forget this character entirely"><i class="fa-solid fa-trash"></i></button>
            </div>
            ${c.present ? "" : `<label class="meg-wsed-cell meg-wsed-wide"><span>Where / doing what</span>
                ${input({ kind: "offscreen", who: c.name }, c.offscreen || "", "Off-screen whereabouts")}</label>`}
            ${fieldGrid(c.name, c.fields, NPC_FIELDS)}
        </div>`;

    const list = l => `
        <div class="meg-wsed-list">
            <div class="meg-wsed-sub"><i class="fa-solid ${l.icon}"></i> ${l.title}
                <span class="meg-wsed-tag" title="When a reply leaves more than ${LIST_LIMITS[l.key]}, the oldest one is removed.">at most ${LIST_LIMITS[l.key]}</span></div>
            ${(state[l.key] || []).map(item => `
                <div class="meg-wsed-listrow">
                    ${input({ kind: "listitem", list: l.key }, item)}
                    <button type="button" class="meg-wsed-mini meg-wsed-listdel" data-list="${l.key}" data-value="${esc(item)}" title="Remove"><i class="fa-solid fa-xmark"></i></button>
                </div>`).join("")}
            <div class="meg-wsed-listrow">
                <input type="text" class="ps-modern-input meg-wsed-listadd" data-list="${l.key}" placeholder="+ ${esc(l.placeholder)}" />
            </div>
        </div>`;

    return `
        <div class="meg-wsed-section">
            <div class="meg-wsed-title"><i class="fa-solid fa-map-location-dot"></i> Scene</div>
            <div class="meg-wsed-grid">
                <label class="meg-wsed-cell"><span>Time</span>${input({ kind: "scene", key: "time" }, s.time)}</label>
                <label class="meg-wsed-cell"><span>Location</span>${input({ kind: "scene", key: "location" }, s.location)}</label>
                <label class="meg-wsed-cell"><span>Weather</span>${input({ kind: "scene", key: "weather" }, s.weather)}</label>
                <label class="meg-wsed-cell"><span>Arc phase</span>${input({ kind: "phase", key: "arcPhase" }, state.arcPhase, "Setup / Escalation / …")}</label>
                <label class="meg-wsed-cell"><span>Scene phase</span>${input({ kind: "phase", key: "scenePhase" }, state.scenePhase, "Early Simmer / Building / …")}</label>
            </div>
        </div>

        <div class="meg-wsed-section">
            <div class="meg-wsed-title"><i class="fa-solid fa-person"></i> ${esc(pcName)} <span class="meg-wsed-tag">player</span></div>
            ${fieldGrid(PC, state.pc?.fields, PC_FIELDS)}
        </div>

        <div class="meg-wsed-section">
            <div class="meg-wsed-title"><i class="fa-solid fa-users"></i> In the scene <span class="meg-wsed-tag">${present.length}</span></div>
            ${present.map(person).join("") || `<div class="meg-wsed-empty">No one else is here.</div>`}
            <div class="meg-wsed-listrow">
                <input type="text" class="ps-modern-input meg-wsed-addchar" placeholder="+ Bring a character into the scene (name)" />
            </div>
        </div>

        ${away.length ? `
        <div class="meg-wsed-section">
            <div class="meg-wsed-title"><i class="fa-solid fa-person-walking-arrow-right"></i> Away <span class="meg-wsed-tag">${away.length}</span></div>
            <div class="meg-wsed-hint">Remembered with their last known details, so they come back as they left.</div>
            ${away.map(person).join("")}
        </div>` : ""}

        <div class="meg-wsed-section">
            <div class="meg-wsed-title"><i class="fa-solid fa-book-open"></i> Story threads</div>
            ${LISTS.filter(l => !(l.key === "seeds" && notebookEnabled())).map(list).join("")}
        </div>`;
}

// ── History view ─────────────────────────────────────────────────────────

function renderHistoryView(showAllSwipes) {
    const rows = worldHistory().filter(r => showAllSwipes || r.active || r.entry.disabled || r.entry.source === "user" || r.entry.orphan);
    const pending = stateStore.isPendingFullRewrite("world");

    const rowHtml = r => {
        const e = r.entry;
        let where;
        if (e.source === "user") where = `<i class="fa-solid fa-user-pen"></i> Your edit`;
        else if (e.orphan) where = `<i class="fa-solid fa-ghost"></i> Deleted message (changes kept)`;
        else if (r.index == null) where = `<i class="fa-regular fa-message"></i> Message not found`;
        else where = `<i class="fa-regular fa-message"></i> Message #${r.index}${r.shownSwipe !== e.swipe || e.swipe > 0 ? ` · swipe ${e.swipe + 1}` : ""}`;

        const badges = [];
        if (e.source === "import") badges.push(`<span class="meg-wsed-badge">imported</span>`);
        if (e.source === "sidemodel") badges.push(`<span class="meg-wsed-badge">chomusuke</span>`);
        if (e.parsed?.kind === "snapshot") badges.push(`<span class="meg-wsed-badge">full state</span>`);
        if (e.disabled) badges.push(`<span class="meg-wsed-badge off">off</span>`);
        else if (!r.active) badges.push(`<span class="meg-wsed-badge dim">not showing</span>`);
        if (e.missing) badges.push(`<span class="meg-wsed-badge warn">no update</span>`);
        if (e.parsed?.skipped?.length) badges.push(`<span class="meg-wsed-badge warn">${e.parsed.skipped.length} not understood</span>`);

        const lines = r.lines.length
            ? r.lines.slice(0, 5).map(l => `<div class="meg-wsed-line">${esc(l)}</div>`).join("") +
              (r.lines.length > 5 ? `<details class="meg-wsed-more"><summary>${r.lines.length - 5} more</summary>${r.lines.slice(5).map(l => `<div class="meg-wsed-line">${esc(l)}</div>`).join("")}</details>` : "")
            : `<div class="meg-wsed-line dim">${e.missing ? "The reply had no World Update block." : "No changes."}</div>`;

        let action = "";
        if (e.source === "user") action = `<button type="button" class="meg-wsed-mini meg-wsed-hdel" data-id="${esc(e.id)}" title="Delete this edit"><i class="fa-solid fa-trash"></i> Delete</button>`;
        else if (!e.missing) action = `<button type="button" class="meg-wsed-mini meg-wsed-htoggle" data-id="${esc(e.id)}" data-off="${e.disabled ? 1 : 0}">${e.disabled ? `<i class="fa-solid fa-rotate-right"></i> Turn on` : `<i class="fa-solid fa-rotate-left"></i> Turn off`}</button>`;

        return `
            <div class="meg-wsed-hrow ${r.active ? "" : "is-dim"}">
                <div class="meg-wsed-hhead"><span class="meg-wsed-where">${where}</span>${badges.join("")}<span class="meg-wsed-spacer"></span>${action}</div>
                ${lines}
            </div>`;
    };

    return `
        <div class="meg-wsed-section">
            <div class="meg-wsed-title"><i class="fa-solid fa-sliders"></i> This chat</div>
            <div class="meg-wsed-actions">
                <button type="button" class="menu_button meg-wsed-rewrite">${pending ? `<i class="fa-solid fa-check"></i> Full rewrite queued (click to cancel)` : `<i class="fa-solid fa-arrows-rotate"></i> Rewrite the full state next reply`}</button>
                <span class="meg-wsed-import">
                    Re-read messages
                    <input type="number" min="0" class="ps-modern-input meg-wsed-from" placeholder="from #" />
                    <input type="number" min="0" class="ps-modern-input meg-wsed-to" placeholder="to #" />
                    <button type="button" class="menu_button meg-wsed-doimport"><i class="fa-solid fa-file-import"></i> Read</button>
                </span>
                <button type="button" class="menu_button meg-wsed-reset" data-armed="0"><i class="fa-solid fa-eraser"></i> Reset World State</button>
            </div>
            <div class="meg-wsed-hint">Re-read picks up World blocks from those messages again (e.g. after the extension was switched off). Reset clears everything; the next reply describes the scene from scratch.</div>
        </div>
        <div class="meg-wsed-section">
            <div class="meg-wsed-title"><i class="fa-solid fa-clock-rotate-left"></i> History
                <label class="meg-wsed-check"><input type="checkbox" class="meg-wsed-allswipes" ${showAllSwipes ? "checked" : ""}/> show other swipes</label>
            </div>
            ${rows.map(rowHtml).join("") || `<div class="meg-wsed-empty">Nothing recorded yet.</div>`}
        </div>`;
}

// ── Popup ────────────────────────────────────────────────────────────────

/** Opens the editor for the chat that is open now. */
export async function openWorldEditor({ view = "state" } = {}) {
    if (!worldChatOpen()) {
        toastr.info("Open a chat first: World State belongs to a chat.", "Megumin Suite");
        return;
    }
    let current = view;
    let showAllSwipes = false;
    const $root = $(`<div class="meg-wsed"></div>`);

    const commit = changes => {
        if (!changes.length) return;
        worldEdit(changes);
        meguminScheduleBlocksRefresh();
        draw();
    };

    function draw() {
        const scrollBox = $root.closest(".popup-content")[0] || $root[0];
        const keepScroll = scrollBox ? scrollBox.scrollTop : 0;
        $root.html(`
            <div class="meg-wsed-top">
                <div class="meg-wsed-tabs">
                    <button type="button" class="meg-wsed-tab ${current === "state" ? "active" : ""}" data-view="state"><i class="fa-solid fa-thumbtack"></i> State</button>
                    <button type="button" class="meg-wsed-tab ${current === "history" ? "active" : ""}" data-view="history"><i class="fa-solid fa-clock-rotate-left"></i> History</button>
                </div>
                <div class="meg-wsed-hint">Your edits are kept as your own changes: swipes, rewinds and deletes never undo them. Delete one from History to take it back.</div>
            </div>
            ${current === "state" ? renderStateView(getWorldState()) : renderHistoryView(showAllSwipes)}
        `);
        bind();
        if (scrollBox) scrollBox.scrollTop = keepScroll;
    }

    function bind() {
        $root.find(".meg-wsed-tab").on("click", function () { current = $(this).data("view"); draw(); });

        // Text fields: commit when the value really changed.
        $root.find(".meg-wsed-input").on("change", function () {
            const $i = $(this);
            const value = String($i.val() || "").trim();
            const was = String($i.attr("data-was") || "");
            if (value === was) return;
            const d = this.dataset;
            if (d.kind === "scene") commit([{ type: "scene", key: d.key, value }]);
            else if (d.kind === "phase") commit([{ type: "phase", key: d.key, value }]);
            else if (d.kind === "field") commit([{ type: "field", who: d.who, field: d.field, value, keepPresence: true }]);
            else if (d.kind === "offscreen") commit([{ type: "offscreen", who: d.who, value }]);
            else if (d.kind === "listitem") {
                const ch = [{ type: "list", list: d.list, op: "remove", value: was }];
                if (value) ch.push({ type: "list", list: d.list, op: "add", value });
                commit(ch);
            }
        }).on("keydown", function (e) { if (e.key === "Enter") this.blur(); });

        $root.find(".meg-wsed-status").on("change", function () {
            const who = this.dataset.who;
            commit([$(this).val() === "in" ? { type: "enter", who } : { type: "leave", who, where: "" }]);
        });

        $root.find(".meg-wsed-forget").on("click", function () {
            const $b = $(this);
            if ($b.attr("data-armed") !== "1") {
                $b.attr("data-armed", "1").addClass("armed").html(`<i class="fa-solid fa-trash"></i> Forget?`);
                setTimeout(() => $b.attr("data-armed", "0").removeClass("armed").html(`<i class="fa-solid fa-trash"></i>`), 3000);
                return;
            }
            commit([{ type: "forget", who: this.dataset.who }]);
        });

        $root.find(".meg-wsed-addchar").on("keydown", function (e) {
            if (e.key !== "Enter") return;
            const who = String($(this).val() || "").trim();
            if (who) commit([{ type: "enter", who }]);
        });

        $root.find(".meg-wsed-listdel").on("click", function () {
            commit([{ type: "list", list: this.dataset.list, op: "remove", value: this.dataset.value }]);
        });
        $root.find(".meg-wsed-listadd").on("keydown", function (e) {
            if (e.key !== "Enter") return;
            const value = String($(this).val() || "").trim();
            if (value) commit([{ type: "list", list: this.dataset.list, op: "add", value }]);
        });

        // History
        $root.find(".meg-wsed-allswipes").on("change", function () { showAllSwipes = this.checked; draw(); });
        $root.find(".meg-wsed-htoggle").on("click", function () {
            worldSetEntryDisabled(this.dataset.id, this.dataset.off !== "1");
            meguminScheduleBlocksRefresh();
            draw();
        });
        $root.find(".meg-wsed-hdel").on("click", function () {
            worldRemoveUserEntry(this.dataset.id);
            meguminScheduleBlocksRefresh();
            draw();
        });
        $root.find(".meg-wsed-rewrite").on("click", () => {
            stateStore.setPendingFullRewrite("world", !stateStore.isPendingFullRewrite("world"));
            draw();
        });
        $root.find(".meg-wsed-doimport").on("click", () => {
            const from = parseInt($root.find(".meg-wsed-from").val(), 10);
            const to = parseInt($root.find(".meg-wsed-to").val(), 10);
            if (isNaN(from) || isNaN(to) || from < 0 || to < from) {
                toastr.warning("Give a message range, e.g. from 10 to 40.", "Megumin Suite");
                return;
            }
            const n = worldImportRange(from, to);
            toastr.info(n ? `Read ${n} World block${n === 1 ? "" : "s"} from messages #${from}–#${to}.` : `No World blocks found in messages #${from}–#${to}.`, "Megumin Suite");
            meguminScheduleBlocksRefresh();
            draw();
        });
        $root.find(".meg-wsed-reset").on("click", function () {
            const $b = $(this);
            if ($b.attr("data-armed") !== "1") {
                $b.attr("data-armed", "1").addClass("armed").html(`<i class="fa-solid fa-triangle-exclamation"></i> Click again to clear this chat's World State`);
                setTimeout(() => { if ($b.closest("body").length) draw(); }, 4000);
                return;
            }
            stateStore.reset("world");
            meguminScheduleBlocksRefresh();
            toastr.info("World State cleared for this chat.", "Megumin Suite");
            draw();
        });
    }

    draw();
    await new Popup($root, POPUP_TYPE.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "Close" }).show();
    meguminScheduleBlocksRefresh();
}
