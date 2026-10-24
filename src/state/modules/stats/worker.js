// ────────────────────────────────────────────────────────────────────────────
// Blocks written by Chomusuke (plan 009): the worker's prompt. Pure.
//
// The worker reads the reply and writes the blocks the story model is no longer
// asked for (Bonds, Character Sheet, NPC Inner Chatter, CYOA). It gets the same
// templates the story model would have, and the values as they stood BEFORE the
// reply, inside <Current_Info> — so the templates' own wording ("start from
// <Bonds_Now> in <Current_Info>") holds unchanged.
//
// Framing rule: in-story wording only. The worker keeps the story's notes; it is
// never told about an extension.
// ────────────────────────────────────────────────────────────────────────────

export const BLOCKS_WORKER_SYSTEM =
    "You keep the running notes of an ongoing story: how each character feels about {{user}}, " +
    "{{user}}'s condition and belongings, what the characters privately think, and the choices open to {{user}} next. " +
    "You never continue the story and never explain. Numbers and facts come only from what the exchange states or clearly shows.";

/**
 * The notes as they stood before the reply, wrapped as the story model sees them.
 * @param {{ bonds?: string, sheet?: string }} notes
 */
export function renderWorkerNotes({ bonds = "", sheet = "" } = {}) {
    const parts = [];
    if (String(bonds).trim()) parts.push(`<Bonds_Now>\n${String(bonds).trim()}\n</Bonds_Now>`);
    if (String(sheet).trim()) parts.push(`<Character_Sheet_Now>\n${String(sheet).trim()}\n</Character_Sheet_Now>`);
    return parts.length ? `<Current_Info>\n${parts.join("\n\n")}\n</Current_Info>` : "";
}

/**
 * The blocks tasks, for the separate read or for the combined call.
 * @param {Array<{ tag: string, body: string }>} tasks  each block's template, in order
 * @returns {{ tasks: string, shape: string[] }}  the task text, and the answer-shape lines
 */
export function renderBlocksTasks(tasks) {
    const list = (tasks || []).filter(t => t && t.tag && String(t.body || "").trim());
    const text = list.map(t => `<${t.tag}>\n${String(t.body).trim()}\n</${t.tag}>`).join("\n\n");
    return {
        tasks: list.length
            ? `Write these blocks for the moment the latest exchange ends on, following the instructions inside each one:\n\n${text}`
            : "",
        shape: list.map(t => `<${t.tag}>…</${t.tag}>`)
    };
}

/**
 * The separate read: notes, story, the tasks, the answer shape.
 * @param {{ notes?: string, earlier?: string, exchange: string, tasks: Array<{ tag: string, body: string }> }} a
 * @returns {{ system: string, user: string }}
 */
export function renderBlocksWorkerPrompt(a) {
    const t = renderBlocksTasks(a.tasks);
    const user = [
        String(a.notes || "").trim(),
        String(a.earlier || "").trim() ? `<Earlier_Story>\n${String(a.earlier).trim()}\n</Earlier_Story>` : "",
        `<Latest_Exchange>\n${String(a.exchange || "").trim()}\n</Latest_Exchange>`,
        `# Task\n${t.tasks}`,
        `# Answer with these blocks, in this order, and nothing else\n${t.shape.join("\n")}`
    ].filter(s => String(s || "").trim()).join("\n\n");
    return { system: BLOCKS_WORKER_SYSTEM, user };
}

/** The worker's answer, cleaned: no thinking, no code fences. */
export function cleanWorkerAnswer(raw) {
    return String(raw || "")
        .replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "")
        .replace(/```[a-z]*\n?|```/gi, "")
        .trim();
}

/** The text of one block in an answer, or "" (for drawing that block's card). */
export function blockTextIn(raw, tag) {
    const m = String(raw || "").match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?(?:<\\/${tag}\\s*>|$)`, "i"));
    return m ? m[0] : "";
}
