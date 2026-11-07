// ────────────────────────────────────────────────────────────────────────────
// Custom blocks model (plan 023).
//
//   Block (the user's setup, in blockStack.custom):
//     { id, tag, tags: [old tags], kind: "text" | "fields", fields: [],
//       memory: "fresh" | "chat" | "info", writer: "story" | "chomusuke",
//       when: "every" | "changes" | "everyN", everyN,
//       rules: the user's rules for the whole block (field blocks) }
//   State: { blocks: { <block id>: { kind: "fields", fields: { key: Field }, seq }
//                                 | { kind: "text", text, seq } } }
//
// Every custom block is kept, whatever its memory choice: the card, the editor
// and "Read again" work from the store. What the story is handed is decided
// by the bridge from `memory`.
// Pure: runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

import { applySheet } from "../stats/model.js";

const MEMORY = ["fresh", "chat", "info"];
const WRITER = ["story", "chomusuke"];
const WHEN = ["every", "changes", "everyN"];

/** A block with every setting filled in. Blocks saved before plan 023 keep working as they did. */
export function normalizeCustomBlock(b) {
    const out = { ...(b || {}) };
    out.kind = out.kind === "fields" ? "fields" : "text";
    out.fields = Array.isArray(out.fields) ? out.fields : [];
    out.tags = Array.isArray(out.tags) ? out.tags.filter(t => t && t !== out.tag) : [];
    out.memory = MEMORY.includes(out.memory) ? out.memory : "fresh";
    out.writer = WRITER.includes(out.writer) ? out.writer : "story";
    out.when = WHEN.includes(out.when) ? out.when : "every";
    // "Only when it changes" needs the story to see what is there.
    if (out.when === "changes" && out.memory === "fresh") out.when = "every";
    const n = Math.round(Number(out.everyN));
    out.everyN = Number.isFinite(n) ? Math.max(2, Math.min(20, n)) : 3;
    return out;
}

/**
 * Adds blocks to the shared list every character picks from (in place, so the
 * list keeps its identity). A block already there (same id) is skipped. A
 * block whose tag another block already uses is added as "Name (2)" with tag
 * Name_2, keeping the old tag so its old copies still read as it.
 * @param {object[]} library  the shared list
 * @param {object[]} blocks   blocks from one character
 * @returns {number} blocks added
 */
export function mergeCustomLibrary(library, blocks) {
    let added = 0;
    const tagTaken = t => library.some(x => String(x.tag || "").toLowerCase() === String(t || "").toLowerCase());
    for (const b of blocks || []) {
        if (!b || !b.id || library.some(x => x.id === b.id)) continue;
        const copy = structuredClone(b);
        if (copy.tag && tagTaken(copy.tag)) {
            let n = 2;
            while (tagTaken(`${b.tag}_${n}`)) n++;
            copy.tags = [...(Array.isArray(copy.tags) ? copy.tags : []), b.tag];
            copy.tag = `${b.tag}_${n}`;
            copy.label = `${b.label || b.tag} (${n})`;
        }
        library.push(copy);
        added++;
    }
    return added;
}

/** The tag and every old tag (after a rename), so old replies still read as this block. */
export function customBlockTags(b) {
    return [b.tag, ...(b.tags || [])].filter(Boolean);
}

export const emptyCustom = () => ({ blocks: {} });

function applyText(prev, p, seq) {
    const before = prev && prev.kind === "text" ? prev.text : "";
    const text = p.clear ? "" : String(p.text || "");
    if (!p.clear && !text) return { state: prev, applied: [] };
    return {
        state: { kind: "text", text, seq },
        applied: before === text ? [] : [{ label: "text", before, after: text }]
    };
}

export function applyCustom(prev, parsed, ctx = {}) {
    const state = structuredClone(prev || emptyCustom());
    const applied = [];
    if (!parsed || !parsed.blocks || typeof parsed.blocks !== "object") return { state, applied, notes: [] };
    const seq = typeof ctx.seq === "number" ? ctx.seq : 0;
    for (const [id, p] of Object.entries(parsed.blocks)) {
        if (!p) continue;
        // A block switched from text to fields (or back) starts over.
        const old = state.blocks[id] && state.blocks[id].kind === p.kind ? state.blocks[id] : null;
        if (p.kind === "fields") {
            const res = applySheet(old ? { fields: old.fields, seq: old.seq } : null, { fields: p.fields || [] }, { seq });
            state.blocks[id] = { kind: "fields", fields: res.state.fields, seq: res.state.seq };
            for (const a of res.applied) applied.push({ block: id, ...a });
        } else if (p.kind === "text") {
            const res = applyText(old, p, seq);
            if (res.state) state.blocks[id] = res.state;
            for (const a of res.applied) applied.push({ block: id, ...a });
        }
    }
    return { state, applied, notes: [] };
}

/**
 * Is this block written this turn?
 * Before the reply (the story model): `repliesSince` counts the replies already
 * after its last copy, so the reply about to be written is one more. After the
 * reply (Chomusuke reading it): the new reply is already counted.
 * @param {object} b               a normalized block
 * @param {number|null} repliesSince  replies since its last copy on file, null when it has none
 * @param {{ afterReply?: boolean }} [opts]
 */
export function customBlockDue(b, repliesSince, { afterReply = false } = {}) {
    if (b.writer === "chomusuke" && !afterReply) return false;
    if (b.when !== "everyN") return true;
    if (repliesSince == null) return true;
    return repliesSince + (afterReply ? 0 : 1) >= b.everyN;
}

/**
 * The tags whose old copies are taken out of the replies the story reads. A
 * block's memory choice is its own: "Stays in the chat" keeps its copies even
 * while every other block is hidden, the others take theirs out even when
 * hiding is off.
 */
export function customTagsToHide(blocks) {
    return (blocks || []).filter(b => b.memory !== "chat").flatMap(customBlockTags);
}

/** The tags kept in the chat ("Stays in the chat"). */
export function customTagsToKeep(blocks) {
    return (blocks || []).filter(b => b.memory === "chat").flatMap(customBlockTags);
}
