// ────────────────────────────────────────────────────────────────────────────
// Settings pages — the small building blocks they share: a card, big choice
// tiles, a segmented row, an on/off row, a labelled field, a page header, a
// note, and the popups (plan 020: one way to ask, never the browser's own
// confirm() / prompt() boxes).
// ────────────────────────────────────────────────────────────────────────────

import { Popup, POPUP_TYPE } from "../st.js";

export const esc = v => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A page card with an optional heading and one line under it. */
export function card(title, sub) {
    return $(`<div class="igx-card">
        ${title ? `<div class="igx-card-title">${title}</div>` : ""}
        ${sub ? `<div class="igx-card-sub">${sub}</div>` : ""}
    </div>`);
}

/** Big one-of-many buttons. options: [{ id, label, desc }]. */
export function tiles(options, current, onPick) {
    const $t = $(`<div class="igx-tiles"></div>`);
    options.forEach(o => {
        const $b = $(`<button type="button" class="igx-tile ${String(o.id) === String(current) ? "on" : ""}">
            <b>${esc(o.label)}</b>${o.desc ? `<span>${esc(o.desc)}</span>` : ""}
        </button>`);
        $b.on("click", () => {
            $t.children().removeClass("on");
            $b.addClass("on");
            onPick(o.id);
        });
        $t.append($b);
    });
    return $t;
}

/** A compact one-of-many row (numbers, short words). */
export function segmented(options, current, onPick) {
    const $s = $(`<div class="igx-seg"></div>`);
    options.forEach(o => {
        const $b = $(`<button type="button" class="${String(o.id) === String(current) ? "on" : ""}">${esc(o.label)}</button>`);
        $b.on("click", () => {
            $s.children().removeClass("on");
            $b.addClass("on");
            onPick(o.id);
        });
        $s.append($b);
    });
    return $s;
}

/** An on/off row in the extension's usual switch style. */
export function switchRow({ label, desc, on, onChange, disabled }) {
    const $r = $(`<div class="mtab-toggle-row igx-switch ${on ? "active" : ""} ${disabled ? "is-disabled" : ""}">
        <div class="toggle-info">
            <div class="toggle-label">${label}</div>
            ${desc ? `<div class="toggle-desc">${desc}</div>` : ""}
        </div>
        <div class="ps-switch"></div>
    </div>`);
    $r.on("click", () => {
        if (disabled) return;
        const next = !$r.hasClass("active");
        $r.toggleClass("active", next);
        onChange(next);
    });
    return $r;
}

/** A label above a control, with an optional grey line. */
export function field(label, small, $control) {
    const $f = $(`<div class="igx-field"><div class="igx-field-label">${label}${small ? ` <small>${small}</small>` : ""}</div></div>`);
    $f.append($control);
    return $f;
}

/** A button that shows a spinner while its job runs, then calls done(). */
export function busy($btn, job, done) {
    $btn.on("click", async () => {
        if ($btn.prop("disabled")) return;
        const html = $btn.html();
        $btn.prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Working…`);
        try { await job(); } catch (e) { console.error(e); toastr.error("That did not work. See the console for details.", "Megumin Suite"); }
        finally { $btn.prop("disabled", false).html(html); if (done) done(); }
    });
}

/** A page header: title, one line under it, and an optional on/off switch on the right. */
export function header({ title, sub = "", icon = "", on, onChange, onLabel, offLabel }) {
    const $h = $(`<div class="mtab-header">
        <div class="mtab-header-left">
            ${icon ? `<div class="mtab-header-icon"><i class="fa-solid ${icon}"></i></div>` : ""}
            <div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>
        </div>
    </div>`);
    if (typeof onChange === "function") {
        const label = v => (v ? onLabel || `${title} on` : offLabel || `${title} off`);
        const $on = $(`<div class="mtab-toggle-row igx-switch igx-master ${on ? "active" : ""}">
            <div class="toggle-info"><div class="toggle-label">${label(on)}</div></div>
            <div class="ps-switch"></div>
        </div>`);
        $on.on("click", () => {
            const next = !$on.hasClass("active");
            $on.toggleClass("active", next).find(".toggle-label").text(label(next));
            onChange(next);
        });
        $h.append($on);
    }
    return $h;
}

/** One line of help or warning. tone: "" (info) | "warn" | "red" | "ok". */
export function note(tone, html) {
    const icon = { warn: "fa-triangle-exclamation", red: "fa-circle-xmark", ok: "fa-circle-check" }[tone] || "fa-circle-info";
    return $(`<div class="igx-note meg-note ${tone ? `meg-note-${tone}` : ""}"><i class="fa-solid ${icon}"></i> <span>${html}</span></div>`);
}

const popupBody = (title, html) => $(`<div style="text-align:left;">${title ? `<h3 style="margin-top:0;">${title}</h3>` : ""}${html ? (/^\s*</.test(html) ? html : `<p>${html}</p>`) : ""}</div>`);

/**
 * Asks before doing something. Resolves true on the OK button.
 * @param {string} title  "Delete Aqua?"
 * @param {string} html   what happens, in the user's words
 * @param {{ ok?: string, cancel?: string }} [o]
 */
export async function confirmPopup(title, html, { ok = "OK", cancel = "Cancel" } = {}) {
    const r = await new Popup(popupBody(title, html), POPUP_TYPE.CONFIRM, "", { okButton: ok, cancelButton: cancel }).show();
    return Boolean(r);
}

/**
 * Asks for a name. Resolves the trimmed text, or null when cancelled or empty.
 * @param {string} title
 * @param {{ value?: string, ok?: string, html?: string }} [o]
 */
export async function askName(title, { value = "", ok = "OK", html = "" } = {}) {
    const r = await new Popup(popupBody(title, html), POPUP_TYPE.INPUT, value, { okButton: ok, cancelButton: "Cancel" }).show();
    const name = typeof r === "string" ? r.trim() : "";
    return name || null;
}

/**
 * One of several answers (more than yes / no). Resolves the chosen value, or
 * null on Cancel.
 * @param {string} title
 * @param {string} html
 * @param {{ label: string, value: any }[]} choices  the first is the main button
 */
export async function choosePopup(title, html, choices) {
    const [first, ...rest] = choices;
    const r = await new Popup(popupBody(title, html), POPUP_TYPE.CONFIRM, "", {
        okButton: first.label,
        cancelButton: "Cancel",
        customButtons: rest.map(c => c.label)
    }).show();
    if (r === 1 || r === true) return first.value;
    if (typeof r === "number" && r >= 2 && rest[r - 2]) return rest[r - 2].value;
    return null;
}

/**
 * Runs a redraw of the page on screen and puts the scroll back where it was
 * (plan 020): a tab that redraws itself after an edit used to jump to the top.
 */
export function keepScroll(draw) {
    const box = document.getElementById("ps_stage_content");
    const top = box ? box.scrollTop : 0;
    const out = draw();
    if (box) box.scrollTop = top;
    return out;
}
