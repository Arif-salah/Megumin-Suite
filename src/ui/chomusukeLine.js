// ────────────────────────────────────────────────────────────────────────────
// One line, the same on the tabs whose job can run by itself (Memory, Story
// Director): who does this job right now (plan 020 phase 1). It replaces the
// "Background Worker: managed by the Chomusuke tab" rows. Banned Phrases has
// none: its scan only runs when you press the button.
//
// "On" is the same test runWithChomusuke makes: Chomusuke on, a connection
// picked, and this job not switched off.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../core/state.js";

/**
 * @param {string} key   the job's key in chomusuke.features (memory, storyPlan)
 * @param {string} what  the job in the user's words ("the memory summaries")
 * @returns {string} HTML
 */
export function chomusukeJobLine(key, what) {
    const c = localProfile && localProfile.chomusuke;
    const on = Boolean(c && c.enabled && c.profileId && (!c.features || c.features[key] !== false));
    const text = on
        ? `<b>Chomusuke</b> does ${what}.`
        : `Your story model does ${what}. Chomusuke can do it instead (Chomusuke tab).`;
    return `<div class="meg-chomu-line ${on ? "on" : ""}">
        <i class="fa-solid fa-cat"></i>
        <span>${text}</span>
    </div>`;
}
