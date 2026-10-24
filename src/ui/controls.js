// ────────────────────────────────────────────────────────────────────────────
// Settings pages (Images, Preset & Thinking) — the small building blocks they share: a card, big choice
// tiles, a segmented row, an on/off row, a labelled field.
// ────────────────────────────────────────────────────────────────────────────

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
