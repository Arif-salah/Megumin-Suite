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

/**
 * @param {string} text   one chat message as the model would read it
 * @param {string[]} tags every block tag (Bonds, World_State, Dice, …)
 * @returns {string}
 */
export function stripBlocksForModel(text, tags = []) {
    if (!text || typeof text !== "string") return text;
    let out = text;
    // The envelope whole, then each block on its own (one can arrive outside a
    // broken envelope), then any opener left unclosed by a cut-off reply.
    out = out.replace(/<Blocks\b[^>]*>[\s\S]*?<\/Blocks\s*>/gi, "");
    for (const tag of tags) {
        out = out.replace(new RegExp(`<${esc(tag)}\\b[^>]*>[\\s\\S]*?<\\/${esc(tag)}\\s*>`, "gi"), "");
    }
    out = out.replace(/<Blocks\b[^>]*>[\s\S]*$/i, "");
    for (const tag of tags) {
        out = out.replace(new RegExp(`<${esc(tag)}\\b[^>]*>[\\s\\S]*$`, "i"), "");
    }
    // The old <details> cards (before the envelope), recognised by their headers.
    out = out.replace(/<details[^>]*>\s*<summary[^>]*>[\s\S]*?(?:NPC Inner Chatter|World State|New NPC:|Bonds|Character Sheet|Story Tracker)[\s\S]*?<\/summary\s*>[\s\S]*?<\/details\s*>/gi, "");
    return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Strips blocks from every assistant message in a chat-completion array, in place. Returns how many changed. */
export function hideBlocksInMessages(messages, tags) {
    let n = 0;
    for (const m of messages || []) {
        if (!m || m.role !== "assistant" || typeof m.content !== "string") continue;
        const next = stripBlocksForModel(m.content, tags);
        if (next !== m.content) { m.content = next; n++; }
    }
    return n;
}
