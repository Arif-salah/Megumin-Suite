// ────────────────────────────────────────────────────────────────────────────
// The "Chomusuke is working" indicator on the blocks bar (plan 019, phase 3).
//
// Every chat card carries the indicator (blocks/render.js); CSS shows it on
// the last message's card while body.meg-chomu-busy is set. This keeps the
// class and the text up to date, and wires Stop.
// ────────────────────────────────────────────────────────────────────────────

import { onChomusukeStatus, chomusukeStatusText, setChomusukeStopHandler } from "../../engine/chomusukeStatus.js";
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
