// ────────────────────────────────────────────────────────────────────────────
// The "Chomusuke is working" indicator on the blocks bar (plan 019, phase 3).
//
// Every chat card carries the indicator (blocks/render.js); CSS shows it on
// the last message's card while body.meg-chomu-busy is set. This keeps the
// class and the text up to date, and wires Stop.
//
// Plus the line under the input (plan 020) while a message you sent waits for
// Chomusuke to finish reading the last reply (the send guard in index.js).
// ────────────────────────────────────────────────────────────────────────────

import { onChomusukeStatus, chomusukeStatusText, setChomusukeStopHandler, stopFromIndicator } from "../../engine/chomusukeStatus.js";
import { stopChomusukeJobs } from "../../engine/tasks.js";

export function initChomusukeIndicator() {
    onChomusukeStatus(s => {
        const busy = Boolean(s.running || s.waiting);
        document.body.classList.toggle("meg-chomu-busy", busy);
        if (busy) $(".meg-chomu").attr("title", `Chomusuke: ${chomusukeStatusText(s)}`);
    });
    setChomusukeStopHandler(() => {
        const n = stopChomusukeJobs();
        if (n) toastr.info(n === 1 ? "Chomusuke stopped its job." : `Chomusuke stopped its ${n} jobs.`, "Chomusuke", { timeOut: 3000 });
    });
}

/** Shows the waiting line under the input. Returns false when there is no input to put it under. */
export function showWaitingLine() {
    hideWaitingLine();
    const $form = $("#send_form");
    if (!$form.length) return false;
    const $line = $(`<div id="meg_waiting_line" class="meg-waiting-line" role="status">
        <i class="fa-solid fa-cat"></i>
        <span>Waiting for Chomusuke to finish reading the last reply…</span>
        <button type="button" class="meg-waiting-stop" title="Stop Chomusuke's job and send now">Stop</button>
    </div>`);
    $line.find(".meg-waiting-stop").on("click", e => {
        e.preventDefault();
        stopFromIndicator();
    });
    $form.after($line);
    return true;
}

export function hideWaitingLine() {
    $("#meg_waiting_line").remove();
}
