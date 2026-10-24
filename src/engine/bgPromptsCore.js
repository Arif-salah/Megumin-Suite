// ────────────────────────────────────────────────────────────────────────────
// Background prompts (plan 013) — the pure part: the job list, the 10-entry
// log, and turning edited boxes back into messages. Unit-tested.
// ────────────────────────────────────────────────────────────────────────────

/** Every background job, in the order Settings lists them. */
export const BG_JOBS = [
    { id: "memory", label: "Memory" },
    { id: "npc", label: "NPC Bank" },
    { id: "world", label: "World State" },
    { id: "blocks", label: "Blocks" },
    { id: "notebook", label: "The Notebook" },
    { id: "combined", label: "Combined call" },
    { id: "images", label: "Images" },
    { id: "banlist", label: "Banned Phrases" },
    { id: "director", label: "Story Director" },
    { id: "style", label: "Writing Style" }
];

export const BG_LOG_MAX = 10;
// One prompt's text is capped in the log so ten of them stay small.
export const BG_LOG_TEXT_CAP = 120000;

export function bgJobLabel(id) {
    const j = BG_JOBS.find(x => x.id === id);
    return j ? j.label : id;
}

/** A job is shown unless its switch was turned off. */
export function bgJobWanted(jobs, id) {
    return !(jobs && jobs[id] === false);
}

/** The text of one message, images replaced by a note. */
export function messageText(m) {
    if (!m) return "";
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return m.content.map(c => (c && c.type === "text" ? c.text : "[image]")).join("\n");
    return "";
}

/** The editable text of one message: its text parts only (images stay as they are). */
export function editableText(m) {
    if (!m) return "";
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return m.content.filter(c => c && c.type === "text").map(c => c.text).join("\n");
    return "";
}

/**
 * Puts edited box texts back into the messages, in place. A message whose
 * content is a list (text + images) has its text parts replaced by the new
 * text and keeps its images. Returns true when anything changed.
 */
export function applyEditedTexts(messages, texts) {
    let changed = false;
    messages.forEach((m, i) => {
        if (typeof texts[i] !== "string" || texts[i] === editableText(m)) return;
        changed = true;
        if (Array.isArray(m.content)) {
            const images = m.content.filter(c => c && c.type !== "text");
            m.content = [{ type: "text", text: texts[i] }, ...images];
        } else {
            m.content = texts[i];
        }
    });
    return changed;
}

/** A log entry: plain text only, capped. */
export function makeLogEntry({ job, connection, messages, status, edited, at }) {
    let left = BG_LOG_TEXT_CAP;
    const msgs = messages.map(m => {
        let text = messageText(m);
        if (text.length > left) text = text.slice(0, Math.max(0, left)) + "\n[… cut here to keep the log small]";
        left -= text.length;
        return { role: m.role, text };
    });
    return { at: at || Date.now(), job, connection: connection || "", status, edited: Boolean(edited), messages: msgs };
}

/** The newest first, never more than BG_LOG_MAX. */
export function pushLog(list, entry) {
    return [entry, ...(Array.isArray(list) ? list : [])].slice(0, BG_LOG_MAX);
}
