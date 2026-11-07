// ────────────────────────────────────────────────────────────────────────────
// A setup checklist (plan 020, phase 4): numbered steps, each marked done or
// not, with the real control inside the step, so nobody has to hunt for it.
// Used at the top of the Chomusuke and Images tabs.
//
// Once every step is done the card shrinks to one line ("Ready · …") with a
// "Show the steps" button. Whether it is open is remembered per checklist
// while SillyTavern is open.
// ────────────────────────────────────────────────────────────────────────────

import { checklistState } from "./checklistCore.js";

const opened = new Map();   // id → true (open) / false (folded), set by the user

/**
 * @param {object} o
 * @param {string} o.id        remembers open/folded
 * @param {string} o.title     "Set up Chomusuke"
 * @param {{ title: string, done: boolean, body?: any, note?: string }[]} o.steps
 *        body: jQuery element or HTML, drawn inside the step
 * @param {string} o.ready     the one line once every step is done (HTML)
 * @returns {JQuery}
 */
export function checklist({ id, title, steps, ready }) {
    const state = checklistState(steps);
    let open = opened.has(id) ? opened.get(id) : !state.allDone;
    const $c = $(`<div class="igx-card meg-check ${state.allDone ? "is-ready" : ""}"></div>`);

    const $head = $(`<div class="meg-check-head">
        <span class="meg-check-title">${state.allDone
            ? `<i class="fa-solid fa-circle-check"></i> ${ready}`
            : `<i class="fa-solid fa-list-check"></i> ${title} <small>${state.done} of ${state.total} done</small>`}</span>
    </div>`);
    if (state.allDone) {
        const $t = $(`<button type="button" class="menu_button igx-btn meg-check-toggle">${open ? "Hide the steps" : "Show the steps"}</button>`);
        $t.on("click", () => {
            open = !open;
            opened.set(id, open);
            $body.toggle(open);
            $t.text(open ? "Hide the steps" : "Show the steps");
        });
        $head.append($t);
    }
    $c.append($head);

    const $body = $(`<ol class="meg-check-steps"></ol>`);
    steps.forEach((s, i) => {
        const current = i === state.next;
        const $li = $(`<li class="meg-check-step ${s.done ? "is-done" : ""} ${current ? "is-next" : ""}">
            <span class="meg-check-num">${s.done ? `<i class="fa-solid fa-check"></i>` : i + 1}</span>
            <div class="meg-check-main">
                <div class="meg-check-step-title">${s.title}</div>
                ${s.note ? `<div class="meg-check-note">${s.note}</div>` : ""}
                <div class="meg-check-body"></div>
            </div>
        </li>`);
        if (s.body) $li.find(".meg-check-body").append(s.body);
        $body.append($li);
    });
    $body.toggle(open);
    $c.append($body);
    return $c;
}
