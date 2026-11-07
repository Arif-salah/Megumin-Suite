// ────────────────────────────────────────────────────────────────────────────
// Custom blocks parser (plan 023). The blocks are the user's, so the list is
// handed in. Fields read like the Character Sheet ("Label: value | …"), free
// text like Inner Chatter (the last copy, as written).
// Pure: runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

import { parseFields, parseLatest } from "../stats/parse.js";
import { customBlockTags } from "./model.js";

// Chomusuke's custom blocks are kept in one entry with the reply's own (the
// store has one entry per reply and swipe): the reply, this mark, the answer.
export const CUSTOM_READ_MARK = "<!--custom-read-->";

/** The reply's text and Chomusuke's blocks, as one entry's raw text. */
export function joinCustomRead(replyText, answerBlocks) {
    return `${String(replyText || "")}\n${CUSTOM_READ_MARK}\n${String(answerBlocks || "").trim()}`;
}

/** Chomusuke's part of a joined raw text ("" when there is none). */
export function customReadPart(raw) {
    const s = String(raw || "");
    const at = s.indexOf(CUSTOM_READ_MARK);
    return at < 0 ? "" : s.slice(at + CUSTOM_READ_MARK.length).trim();
}

/**
 * @param {string} text   a reply, or Chomusuke's answer
 * @param {object[]} blocks  normalized custom blocks
 * @returns {null | { kind: "delta", blocks: Record<string, { kind: "fields", fields: object[] } | { kind: "text", text: string }> }}
 */
export function parseCustomBlocks(text, blocks) {
    const out = {};
    for (const b of blocks || []) {
        for (const tag of customBlockTags(b)) {
            const p = b.kind === "fields" ? parseFields(text, tag) : parseLatest(text, tag);
            if (!p) continue;
            out[b.id] = b.kind === "fields" ? { kind: "fields", fields: p.fields } : { kind: "text", text: p.text };
            break;   // the current tag first, then old ones
        }
    }
    return Object.keys(out).length ? { kind: "delta", blocks: out } : null;
}
