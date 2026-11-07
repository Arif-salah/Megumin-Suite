// ────────────────────────────────────────────────────────────────────────────
// Hide blocks from the AI (plan 008).
//
// The story model used to read its own old blocks in the chat history to carry
// Bonds and the Sheet forward — a long chat sent it a hundred of them. The
// values now reach it once, in <Current_Info>, so the blocks are taken out of
// the history it reads. Only the blocks: the reply's own formatting (HTML,
// coloured sounds, images) stays, unlike the summariser's cleaner, which strips
// every tag.
//
// Pure: the block tags are handed in, so it runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const closedBlock = tag => new RegExp(`<${esc(tag)}\\b[^>]*>[\\s\\S]*?<\\/${esc(tag)}\\s*>`, "gi");

/**
 * @param {string} text   one chat message as the model would read it
 * @param {string[]} tags every block tag to take out (Bonds, World_State, Dice, …)
 * @param {{ keep?: string[], whole?: boolean }} [opts]
 *   keep:  tags of custom blocks on "Stays in the chat" (plan 023): their copies
 *          stay, at the end of the reply where the envelope was.
 *   whole: false when "Hide old blocks" is off, so only `tags` come out and the
 *          envelope and old cards are left (custom blocks decide for themselves).
 * @returns {string}
 */
export function stripBlocksForModel(text, tags = [], { keep = [], whole = true } = {}) {
    if (!text || typeof text !== "string") return text;
    let out = text;
    const keepSet = new Set(keep.map(t => t.toLowerCase()));
    const strip = tags.filter(t => !keepSet.has(String(t).toLowerCase()));
    // Kept blocks are taken out first, so the envelope can go whole.
    const kept = whole ? keep.flatMap(t => out.match(closedBlock(t)) || []) : [];
    // The envelope whole, then each block on its own (one can arrive outside a
    // broken envelope), then any opener left unclosed by a cut-off reply.
    if (whole) out = out.replace(/<Blocks\b[^>]*>[\s\S]*?<\/Blocks\s*>/gi, "");
    for (const tag of strip) out = out.replace(closedBlock(tag), "");
    if (whole) for (const k of kept) out = out.replace(k, "");
    if (whole) out = out.replace(/<Blocks\b[^>]*>[\s\S]*$/i, "");
    for (const tag of strip) {
        out = out.replace(new RegExp(`<${esc(tag)}\\b[^>]*>[\\s\\S]*$`, "i"), "");
    }
    // The old <details> cards (before the envelope), recognised by their headers.
    if (whole) out = out.replace(/<details[^>]*>\s*<summary[^>]*>[\s\S]*?(?:NPC Inner Chatter|World State|New NPC:|Bonds|Character Sheet|Story Tracker)[\s\S]*?<\/summary\s*>[\s\S]*?<\/details\s*>/gi, "");
    out = out.replace(/\n{3,}/g, "\n\n").trim();
    return kept.length ? `${out}\n\n${kept.join("\n")}`.trim() : out;
}

/** Strips blocks from every assistant message in a chat-completion array, in place. Returns how many changed. */
export function hideBlocksInMessages(messages, tags, opts) {
    let n = 0;
    for (const m of messages || []) {
        if (!m || m.role !== "assistant" || typeof m.content !== "string") continue;
        const next = stripBlocksForModel(m.content, tags, opts);
        if (next !== m.content) { m.content = next; n++; }
    }
    return n;
}
