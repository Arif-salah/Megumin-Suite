// ────────────────────────────────────────────────────────────────────────────
// World State card: the "what changed" strip.
//
// The card treatment draws the scene board for a message (the state right
// after it). This adds, at the top of that pane, what THIS reply changed, the
// lines it wrote that were not understood, and a switch to turn the reply's
// changes off or back on. The board below is redrawn from the store, so turning
// a reply off is visible immediately.
// ────────────────────────────────────────────────────────────────────────────

import { worldCardInfo, worldSetEntryDisabled, worldSettings, worldSameCharacter } from "../../state/index.js";

const esc = v => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SHOW_AT_MOST = 12;

// Strips the reader opened, by journal entry id, so a card redraw (a swipe, a
// background update) does not fold one shut while it is being read.
const openStrips = new Set();

// "New character" answers, by journal entry id + name: not asked again this session.
const keptApart = new Set();

// A character the reply brought in with no "+" line may be someone already
// known under another name ("Emma" for "Uncle Emma"). Asked outside the fold,
// so it is seen without opening anything.
function newcomerRow(entryId, n, onChanged) {
    const row = document.createElement("div");
    row.className = "meg-wsnew";
    row.innerHTML = `
        <span class="meg-wsnew-text"><i class="fa-solid fa-user-plus"></i> <b>${esc(n.name)}</b> is new in this reply. Same person as</span>
        <select class="meg-wsnew-pick" title="Pick who ${esc(n.name)} is">
            <option value="">someone already in the story?</option>
            ${n.others.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}
        </select>
        <button type="button" class="meg-wsdiff-btn meg-wsnew-same" disabled title="${esc(n.name)} becomes another name for the character you picked, and their details are joined. Undo it in the editor's History.">
            <i class="fa-solid fa-link"></i> Same person</button>
        <button type="button" class="meg-wsdiff-btn meg-wsnew-apart" title="Keep ${esc(n.name)} as a separate character and stop asking">
            New character</button>`;
    const pick = row.querySelector(".meg-wsnew-pick");
    const same = row.querySelector(".meg-wsnew-same");
    pick.addEventListener("change", () => { same.disabled = !pick.value; });
    same.addEventListener("click", () => {
        if (!pick.value) return;
        if (worldSameCharacter(n.name, pick.value)) {
            toastr.success(`${n.name} is now ${pick.value}.`, "World State", { timeOut: 3000 });
            if (onChanged) onChanged();
        }
    });
    row.querySelector(".meg-wsnew-apart").addEventListener("click", () => {
        keptApart.add(entryId + "|" + n.name);
        row.remove();
    });
    row.addEventListener("click", e => e.stopPropagation());
    return row;
}

function changeRow(a) {
    const [who, field] = a.label.includes(" · ") ? a.label.split(" · ") : ["", a.label];
    const before = a.before && a.after ? `<span class="meg-wsdiff-before">${esc(a.before)}</span><i class="fa-solid fa-arrow-right meg-wsdiff-arrow"></i>` : "";
    const after = a.after
        ? `<span class="meg-wsdiff-after">${esc(a.after)}</span>`
        : `<span class="meg-wsdiff-before">${esc(a.before)}</span>`;
    return `
        <div class="meg-wsdiff-row">
            ${who ? `<b>${esc(who)}</b>` : ""}
            <span class="meg-wsdiff-field">${esc(field)}</span>
            ${before}${after}
        </div>`;
}

/**
 * @param {HTMLElement} paneEl  the World State pane of one message's card
 * @param {number} msgIndex
 * @param {{ onEdit?: () => void, onChanged?: () => void, onReread?: () => void }} [hooks]
 */
export function worldDecoratePane(paneEl, msgIndex, hooks = {}) {
    if (!paneEl || typeof msgIndex !== "number") return;
    paneEl.querySelector(".meg-wsdiff")?.remove();
    paneEl.querySelectorAll(".meg-wsnew").forEach(el => el.remove());
    if (!worldSettings().showChanges) return;

    const info = worldCardInfo(msgIndex);
    if (!info) return;

    const { applied, skipped, notes, missing, disabled, noChanges, pending, unread, sideModel } = info;
    let body = "";
    let title;
    if (pending) {
        title = `<i class="fa-solid fa-spinner fa-spin"></i> Reading this reply for World State changes…`;
    } else if (unread) {
        title = `<i class="fa-regular fa-eye-slash"></i> Not read for World State changes yet`;
    } else if (disabled) {
        title = `<i class="fa-solid fa-power-off"></i> This reply's World State changes are switched off`;
    } else if (missing) {
        title = sideModel
            ? `<i class="fa-regular fa-circle-question"></i> Chomusuke gave no update for this reply; the scene carried over unchanged`
            : `<i class="fa-regular fa-circle-question"></i> No World Update in this reply; the scene carried over unchanged`;
    } else if (!applied.length) {
        title = `<i class="fa-solid fa-equals"></i> ${noChanges ? "No changes in this reply" : "Nothing in this reply changed the scene"}`;
    } else {
        title = `<i class="fa-solid fa-code-compare"></i> Changed in this reply <span class="meg-wsdiff-count">${applied.length}</span> <i class="fa-solid fa-chevron-down meg-wsdiff-caret"></i>`;
        body = applied.slice(0, SHOW_AT_MOST).map(changeRow).join("");
        if (applied.length > SHOW_AT_MOST) {
            body += `<div class="meg-wsdiff-more">+${applied.length - SHOW_AT_MOST} more (see the editor's History)</div>`;
        }
    }

    const issues = [...skipped.map(t => ({ t, kind: "skip" })), ...notes.map(t => ({ t, kind: "note" }))];
    const warn = issues.length ? `
        <details class="meg-wsdiff-warn">
            <summary><i class="fa-solid fa-triangle-exclamation"></i> ${skipped.length ? `${skipped.length} line${skipped.length === 1 ? "" : "s"} not understood` : ""}${skipped.length && notes.length ? " · " : ""}${notes.length ? `${notes.length} note${notes.length === 1 ? "" : "s"}` : ""}</summary>
            ${issues.map(i => `<div class="meg-wsdiff-issue ${i.kind}">${i.kind === "skip" ? `<code>${esc(i.t)}</code>` : esc(i.t)}</div>`).join("")}
        </details>` : "";

    const canToggle = !pending && !unread && !missing && (disabled || applied.length > 0);
    // Side model: read a reply that was never read, or read one again (after an
    // edit, or when the first answer was poor).
    const canRead = sideModel && !pending && hooks.onReread && (unread || missing || info.entry?.source === "sidemodel");
    // Folded by default when there is something to unfold (the changes, or
    // lines not understood); a quiet one-liner otherwise.
    const foldable = Boolean(body || warn);
    const headTag = foldable ? "summary" : "div";
    const entryId = info.entry && info.entry.id;
    const strip = document.createElement(foldable ? "details" : "div");
    strip.className = `meg-wsdiff${disabled ? " is-off" : ""}${pending || unread || missing || (!applied.length && !disabled) ? " is-quiet" : ""}${foldable ? " is-foldable" : ""}`;
    if (foldable && entryId && openStrips.has(entryId)) strip.open = true;
    strip.innerHTML = `
        <${headTag} class="meg-wsdiff-head">
            <span class="meg-wsdiff-title">${title}</span>
            <span class="meg-wsdiff-actions">
                ${canToggle ? `<button type="button" class="meg-wsdiff-btn meg-wsdiff-toggle" title="${disabled ? "Count this reply's changes again" : "Stop counting this reply's changes; the scene goes back to how it was before it"}">
                    <i class="fa-solid ${disabled ? "fa-rotate-right" : "fa-rotate-left"}"></i> ${disabled ? "Restore" : "Revert"}</button>` : ""}
                ${canRead ? `<button type="button" class="meg-wsdiff-btn meg-wsdiff-read" title="Have Chomusuke read this reply for World State changes"><i class="fa-solid fa-book-open-reader"></i> ${unread ? "Read now" : "Read again"}</button>` : ""}
                ${hooks.onEdit ? `<button type="button" class="meg-wsdiff-btn meg-wsdiff-edit" title="Open the World State editor"><i class="fa-solid fa-pen"></i> Edit</button>` : ""}
            </span>
        </${headTag}>
        ${foldable ? `<div class="meg-wsdiff-body">${body}${warn}</div>` : ""}
    `;
    if (foldable && entryId) {
        strip.addEventListener("toggle", () => {
            if (strip.open) openStrips.add(entryId); else openStrips.delete(entryId);
        });
    }

    strip.querySelector(".meg-wsdiff-toggle")?.addEventListener("click", e => {
        e.preventDefault(); // in the summary: act, do not fold
        e.stopPropagation();
        if (worldSetEntryDisabled(info.entry.id, !disabled) && hooks.onChanged) hooks.onChanged();
    });
    strip.querySelector(".meg-wsdiff-read")?.addEventListener("click", e => {
        e.preventDefault(); // in the summary: act, do not fold
        e.stopPropagation();
        hooks.onReread();
    });
    strip.querySelector(".meg-wsdiff-edit")?.addEventListener("click", e => {
        e.preventDefault(); // in the summary: act, do not fold
        e.stopPropagation();
        hooks.onEdit();
    });
    // Clicks inside the strip must not fold the card it sits in.
    strip.addEventListener("click", e => e.stopPropagation());

    paneEl.prepend(strip);

    if (!disabled && entryId) {
        let after = strip;
        for (const n of info.newcomers || []) {
            if (keptApart.has(entryId + "|" + n.name)) continue;
            const row = newcomerRow(entryId, n, hooks.onChanged);
            after.after(row);
            after = row;
        }
    }
}
