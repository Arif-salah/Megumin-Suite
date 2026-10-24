// ────────────────────────────────────────────────────────────────────────────
// Images — which version is picked (Classic | Version 2) and the World State
// switch Version 2 depends on. Its own file so the tab's pages can import it
// without importing the whole image side (index.js imports the pages).
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../core/state.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { Popup, POPUP_TYPE } from "../../st.js";
import { worldEnabled } from "../../state/index.js";
import { meguminSyncLegacyBlockIds } from "../blocks/registry.js";
import { meguminScheduleBlocksRefresh } from "../blocks/chat.js";

/** The version the user picked: "classic" | "v2". */
export function imageGenSelectedEngine() {
    return localProfile?.imageGen?.engine === "v2" ? "v2" : "classic";
}

/**
 * The prompt side actually in use. V2 lives on World State (outfits, who is
 * present), so with World State off it is inactive and images are made the
 * Classic way until World State is back on.
 */
export function imageGenEngine() {
    return imageGenSelectedEngine() === "v2" && worldEnabled() ? "v2" : "classic";
}

/** Puts the World State block into the block stack, as the Blocks tab does. */
export function enableWorldState() {
    const stack = localProfile.blockStack;
    if (!stack || !Array.isArray(stack.order)) return false;
    if (!stack.order.includes("world")) stack.order.push("world");
    meguminSyncLegacyBlockIds();
    saveProfileToMemory();
    meguminScheduleBlocksRefresh();
    return worldEnabled();
}

export async function askToEnableWorldState() {
    const $msg = $(`
        <div style="text-align:left; display:flex; flex-direction:column; gap:8px;">
            <div><b>Version 2 needs World State.</b></div>
            <div>Version 2 takes each character's outfit, and who is in the scene, from World State, so outfits stay the same from image to image until the story changes them.</div>
            <div>Turn World State on now? Without it, Version 2 stays inactive and images are made the Classic way.</div>
        </div>
    `);
    const ok = await new Popup($msg, POPUP_TYPE.CONFIRM, "", { okButton: "Turn on World State", cancelButton: "Not now" }).show();
    return ok ? enableWorldState() : false;
}
