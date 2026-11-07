// ────────────────────────────────────────────────────────────────────────────
// Custom blocks: what the story model reads in Current Info (plan 023).
// In-story wording only. Pure.
// ────────────────────────────────────────────────────────────────────────────

import { renderSheetNotes } from "../stats/render.js";
import { CUSTOM_LAST_NOTE } from "../../../prompts/customBlocks.js";
import { editable } from "../../../prompts/edits.js";

/**
 * What each field means, as the user wrote it: "- Trust: how much she…".
 * One line each (the template's rules are one bracketed paragraph, so line
 * breaks and square brackets in a description would end it early).
 * @param {object[]} fields  the block's fields ({ label, desc })
 * @returns {string[]}
 */
export function customFieldNotes(fields) {
    return (fields || [])
        .filter(f => f && String(f.label || "").trim() && String(f.desc || "").trim())
        .map(f => `- ${String(f.label).trim()}: ${String(f.desc).replace(/\s+/g, " ").replace(/\[/g, "(").replace(/\]/g, ")").trim()}`);
}

/**
 * The user's rules for the whole block, one line each as written. The block's
 * rules sit inside [ ], so their own brackets become round ones.
 */
export function customBlockRules(b) {
    return String((b && b.rules) || "").split(/\r?\n/)
        .map(l => l.replace(/\[/g, "(").replace(/\]/g, ")").trim())
        .filter(Boolean);
}

/** The tag a block's kept values or last copy go under in <Current_Info>. */
export function customInfoTag(b) {
    return b.kind === "fields" ? `${b.tag}_Now` : `Last_${b.tag}`;
}

/** One block's kept values or last copy, as text ("" when there is none). */
export function customNotes(state, b) {
    const s = state && state.blocks && state.blocks[b.id];
    if (!s || s.kind !== b.kind) return "";
    return b.kind === "fields" ? renderSheetNotes(s) : String(s.text || "").trim();
}

/**
 * The <Current_Info> sections for blocks on "Last one in Current Info", in the
 * order given.
 */
export function customInfoSections(state, blocks) {
    return (blocks || [])
        .filter(b => b.memory === "info")
        .map(b => {
            const notes = customNotes(state, b);
            if (!notes) return "";
            const tag = customInfoTag(b);
            return b.kind === "fields"
                ? `<${tag}>\n${notes}\n</${tag}>`
                : `<${tag}>\n${editable("customLastNote", CUSTOM_LAST_NOTE)}\n${notes}\n</${tag}>`;
        })
        .filter(Boolean);
}
