// ────────────────────────────────────────────────────────────────────────────
// Where an automatic image goes inside a reply. Pure.
//
// The prose is what sits after any <think> and before the blocks (the <Blocks>
// envelope, or a World State / <details> block written the old way). An image
// never lands inside either.
//   "end"    — at the end of the prose, just above the blocks
//   "random" — at a paragraph break inside the prose, a different one each time
// ────────────────────────────────────────────────────────────────────────────

const BLOCK_START = /<Blocks\b|<World_State\b|<World_Update\b|<details\b|<Story_Tracker\b|<NPC_Inner_Chatter\b|<New_NPC\b|<NPC_Update\b/i;

/**
 * @param {string} mes
 * @param {"end"|"random"} [placement]
 * @param {() => number} [rand]  0 ≤ x < 1, injectable for tests
 * @returns {number} the index to insert at
 */
export function findImageSlot(mes, placement = "end", rand = Math.random) {
    const text = String(mes || "");
    const thinkEnd = (() => {
        const i = text.toLowerCase().lastIndexOf("</think>");
        return i >= 0 ? i + "</think>".length : 0;
    })();
    const rest = text.slice(thinkEnd);
    const b = rest.search(BLOCK_START);
    let proseEnd = b >= 0 ? thinkEnd + b : text.length;
    // Back up over the whitespace before the blocks, so the image sits under the prose.
    while (proseEnd > thinkEnd && /\s/.test(text[proseEnd - 1])) proseEnd--;

    if (placement !== "random") return proseEnd;

    // Paragraph breaks strictly inside the prose (not before the first paragraph).
    const breaks = [];
    const re = /\n\s*\n/g;
    const prose = text.slice(thinkEnd, proseEnd);
    let m;
    while ((m = re.exec(prose)) !== null) {
        const at = thinkEnd + m.index;
        if (prose.slice(0, m.index).trim()) breaks.push(at);
    }
    // The end of the prose is one of the choices too.
    breaks.push(proseEnd);
    return breaks[Math.min(breaks.length - 1, Math.floor(rand() * breaks.length))];
}

/** Inserts `html` at the slot, on its own lines. */
export function insertAtSlot(mes, html, placement = "end", rand = Math.random) {
    const text = String(mes || "");
    const at = findImageSlot(text, placement, rand);
    // Only the whitespace at the seam is tidied; the rest of the reply is untouched.
    const before = text.slice(0, at).replace(/\s+$/, "");
    const after = text.slice(at).replace(/^\s+/, "");
    return [before, html, after].filter(Boolean).join("\n\n");
}
