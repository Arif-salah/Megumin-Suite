// ────────────────────────────────────────────────────────────────────────────
// The live token counter in the settings footer.
//
// Sits above the profile layer rather than inside it: counting tokens means
// building the whole prompt, so this depends on the dict builder. profile.js
// asks for a redraw through the TOKEN_COUNT hook instead of calling it.
// ────────────────────────────────────────────────────────────────────────────

import { getContext } from "../st.js";
import { localProfile } from "./state.js";
import { registerRefreshHook, REFRESH } from "./refreshHooks.js";
import { buildBaseDict } from "../engine/buildBaseDict.js";

// NEW: Function to calculate and update the token UI with a Hover Breakdown
export function updateLiveTokenCount() {
    const counterBadge = $("#ps_live_token_count");
    if (!counterBadge.length) return;

    const dict = buildBaseDict(true);

    let engineStr = "";
    let cotStr = "";
    let styleStr = "";
    let addonsStr = "";

    // Array of dynamic systems we do NOT want to count
    const excludeKeys = [
        "[[long-Memory]]", "[[Short-memory]]", 
        "[[npc list]]", "[[npc_dossier]]", "[[npc_dossier2]]",
        "[[img1]]", "[[img2]]",
        "[[storyplan]]", "[[storytracker]]", "[[storytracker2]]",
        "[[banlist]]",
        // Both injection paths are built on every pass and only one of them ever
        // reaches the model, so counting both would roughly double the blocks.
        // The envelope is assembled FROM the per-block tags, which are counted
        // above, so skipping it here estimates the same payload either way.
        "[[blocks]]",
        // Plan 018: the V11 preset's split copies of the same parts.
        "[[block_rules]]", "[[this_turn]]", "[[dice_rules]]", "[[img_rules]]",
        "[[storyplan_rules]]", "[[storyplan_now]]", "[[npc_rules]]", "[[addon_rules]]",
        // The style again, as written: [[aiprompt]] already counts it.
        "[[style]]"
    ];

    Object.entries(dict).forEach(([key, value]) => {
        if (!value) return;
        // Skip the single-bracket aliases to prevent double counting
        if (key.match(/^\[prompt[1-6]\]$/)) return;

        // Skip highly variable dynamic blocks
        if (excludeKeys.includes(key)) return;

        // Categorize the text using exact matches to prevent overlap
        if (key === "[[aiprompt]]" || key === "[[config]]" || key === "[[Language]]" || key === "[[pronouns]]" || key === "[[count]]" || key === "[[DNRATIO]]" || key === "[[onomato]]") {
            styleStr += value + " ";
        } else if (key === "[[COT]]" || key === "[[prefill]]" || key === "[[THINK]]") {
            cotStr += value + " ";
        } else if (key.match(/^\[\[prompt[1-6]\]\]$/) || key === "[[main]]" || key === "[[AI1]]" || key === "[[AI2]]") {
            engineStr += value + " ";
        } else {
            addonsStr += value + " ";
        }
    });

    // Estimate tokens (Adjusted to 4.8 chars per token to match modern, highly-efficient tokenizers)
    const estEngine = Math.ceil(engineStr.replace(/\s+/g, ' ').length / 4.8);
    const estCot = Math.ceil(cotStr.replace(/\s+/g, ' ').length / 4.8);
    const estStyle = Math.ceil(styleStr.replace(/\s+/g, ' ').length / 4.8);
    const estAddons = Math.ceil(addonsStr.replace(/\s+/g, ' ').length / 4.8);

    const total = estEngine + estCot + estStyle + estAddons;

    // Update the UI text
    counterBadge.html(`<i class="fa-solid fa-microchip"></i> ~${total}`);

    // Build the Hover Breakdown HTML
    const breakdownHTML = `
        <div style="text-align:left; min-width: 160px; font-family: 'Inter', sans-serif;">
            <div style="border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 6px; margin-bottom: 6px; color: var(--gold); font-size: 0.8rem;"><b>Payload Breakdown</b></div>
            <div style="display:flex; justify-content:space-between; font-size: 0.75rem; margin-bottom: 4px;"><span>Engine Core:</span> <span style="color:#10b981; font-weight:bold;">~${estEngine}</span></div>
            <div style="display:flex; justify-content:space-between; font-size: 0.75rem; margin-bottom: 4px;"><span>CoT / Logic:</span> <span style="color:#3b82f6; font-weight:bold;">~${estCot}</span></div>
            <div style="display:flex; justify-content:space-between; font-size: 0.75rem; margin-bottom: 4px;"><span>Style &amp; Config:</span> <span style="color:#a855f7; font-weight:bold;">~${estStyle}</span></div>
            <div style="display:flex; justify-content:space-between; font-size: 0.75rem;"><span>Add-ons/Blocks:</span> <span style="color:#ef4444; font-weight:bold;">~${estAddons}</span></div>
        </div>
    `;

    // Attach it to the badge
    counterBadge.attr("data-breakdown", breakdownHTML);
    counterBadge.css("cursor", "help");

    // Flash green to show it updated
    counterBadge.css("color", "#10b981");
    setTimeout(() => {
        counterBadge.css("color", "var(--text-muted)");
    }, 400);
}

registerRefreshHook(REFRESH.TOKEN_COUNT, () => updateLiveTokenCount());
