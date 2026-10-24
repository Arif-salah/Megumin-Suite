// ────────────────────────────────────────────────────────────────────────────
// Author's Notebook read by Chomusuke (plan 010, phase 5). Pure.
//
// With the route on, the story model only writes new truths (Truth+); after
// the reply Chomusuke reads it against the notebook as it stood before, and
// writes what the reply did to the live truths: Clue, Learned, Truth-.
//
// The reply's own notebook lines and Chomusuke's are kept as ONE entry under
// the reply, so Revert, swipes and edits treat them together. The entry's text
// is the reply followed by Chomusuke's lines (rebuilt from what was understood,
// so a truth Chomusuke tried to write never gets in), which also keeps the
// story text the clue check reads.
//
// Framing rule: in-story wording only. The reader keeps the author's notebook.
// ────────────────────────────────────────────────────────────────────────────

import { parseNotebook, storyProse } from "./parse.js";
import { NOTEBOOK_TRUTH_FORM } from "./render.js";

export const NOTEBOOK_WORKER_SYSTEM =
    "You keep the author's notebook of an ongoing story: the truths it is hiding, the clues it plants, and who finds what out. " +
    "You never continue the story and never explain. You note only what the exchange shows on the page.";

/**
 * The task, for the separate read and for the combined call.
 * @returns {{ rules: string, template: string, tag: string }}
 */
export function renderNotebookClerkTask() {
    const rules = [
        "<Notebook_Update_Rules>",
        "<Author_Notebook> holds the truths the story is hiding, as they stood before the latest exchange. Read the latest exchange and write a <Notebook_Update> block with what it did to them. Most exchanges do nothing to them; then the block holds the single line No changes.",
        "",
        "Clue T1: <the clue the latest exchange showed>",
        "Learned T1: <who on its Hidden from list found it out in the latest exchange>",
        "Truth-: T1      it came out in the latest exchange, to everyone it was hidden from",
        "",
        "A clue counts only when the exchange shows it on the page. Use the truths' own ids. A truth never changes once written: you don't write new truths or rewrite them.",
        "</Notebook_Update_Rules>"
    ].join("\n");
    return { rules, template: "<Notebook_Update>\n[change lines, or No changes]\n</Notebook_Update>", tag: "Notebook_Update" };
}

/**
 * The separate read.
 * @param {{ notes: string, earlier?: string, exchange: string }} a  notes: <Author_Notebook> before the reply
 * @returns {{ system: string, user: string }}
 */
export function renderNotebookWorkerPrompt(a) {
    const task = renderNotebookClerkTask();
    const user = [
        String(a.notes || "").trim(),
        String(a.earlier || "").trim() ? `<Earlier_Story>\n${String(a.earlier).trim()}\n</Earlier_Story>` : "",
        `<Latest_Exchange>\n${String(a.exchange || "").trim()}\n</Latest_Exchange>`,
        `# Task\n${task.rules}`,
        `# Answer with this block and nothing else\n${task.template}`
    ].filter(s => String(s || "").trim()).join("\n\n");
    return { system: NOTEBOOK_WORKER_SYSTEM, user };
}

// ── The setup, when the reply wrote none (plan 018) ──
// The story model is still asked for the setup as usual. When the Notebook
// route is on and the reply came back without a <Notebook>, Chomusuke writes
// the two or three truths after it, filed under the reply like a read.

// The read's opening without "You note only what the exchange shows": here
// it has to come up with the truths.
export const NOTEBOOK_SETUP_SYSTEM =
    "You keep the author's notebook of an ongoing story: the truths it is hiding, the clues it plants, and who finds what out. " +
    "You never continue the story and never explain.";

/** The setup task, for the separate call and the combined one. */
export function renderNotebookSetupTask() {
    const rules = [
        "<Notebook_Setup_Rules>",
        "The story keeps a notebook of the truths it holds back about the world, its past, or the people in it. It is empty, so write it now: a <Notebook> block with two or three truths, built from the character sheet, the setting, and the story so far.",
        "",
        "A good truth comes from the setting and the sheet, and once it comes out it changes how earlier scenes read. A truth is about the world and the other characters. {{user}}'s own past and the reasons behind what they do belong to the reader. Nothing in the story so far has given it away.",
        "",
        "Write each one in this form:",
        "",
        ...NOTEBOOK_TRUTH_FORM,
        "</Notebook_Setup_Rules>"
    ].join("\n");
    return { rules, template: "<Notebook>\n[two or three truths, each in the form above]\n</Notebook>", tag: "Notebook" };
}

/**
 * The separate setup call.
 * @param {{ sheet?: string, earlier?: string, exchange: string }} a  sheet: the character card
 * @returns {{ system: string, user: string }}
 */
export function renderNotebookSetupWorkerPrompt(a) {
    const task = renderNotebookSetupTask();
    const user = [
        String(a.sheet || "").trim() ? `<Character_Sheet>\n${String(a.sheet).trim()}\n</Character_Sheet>` : "",
        String(a.earlier || "").trim() ? `<Earlier_Story>\n${String(a.earlier).trim()}\n</Earlier_Story>` : "",
        `<Latest_Exchange>\n${String(a.exchange || "").trim()}\n</Latest_Exchange>`,
        `# Task\n${task.rules}`,
        `# Answer with this block and nothing else\n${task.template}`
    ].filter(s => String(s || "").trim()).join("\n\n");
    return { system: NOTEBOOK_SETUP_SYSTEM, user };
}

/** Did the reply write truths of its own (a <Notebook>)? Then there is no setup to write. */
export function replyWroteTruths(replyText) {
    const parsed = parseNotebook(replyText);
    return Boolean(parsed && parsed.ops.some(o => o.op === "entry"));
}

/**
 * Chomusuke's setup answer as the block to keep: its <Notebook>, when it holds
 * at least one truth. Null otherwise.
 * @returns {null | { block: string, count: number }}
 */
export function notebookSetupAnswerBlock(raw) {
    const text = String(raw || "")
        .replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "")
        .replace(/```[a-z]*\n?|```/gi, "")
        .replace(/<(Notebook_Setup_Rules|Author_Notebook)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, "");
    const m = text.match(/<Notebook>[\s\S]*?(?:<\/Notebook\s*>|$)/i);
    if (!m) return null;
    const body = m[0].replace(/^<Notebook>/i, "").replace(/<\/Notebook\s*>$/i, "").trim();
    const block = `<Notebook>\n${body}\n</Notebook>`;
    const parsed = parseNotebook(block, { prose: "" });
    const count = parsed ? parsed.ops.filter(o => o.op === "entry").length : 0;
    return count ? { block, count } : null;
}

const READ_OPS = new Set(["clue", "learned", "out"]);

/** Did the reply write clue, learned or came-out lines itself? Then there is nothing to read. */
export function replyWroteNotebookChanges(replyText) {
    const parsed = parseNotebook(replyText);
    return Boolean(parsed && parsed.ops.some(o => READ_OPS.has(o.op)));
}

/**
 * Chomusuke's answer as the block to keep: only Clue, Learned and Truth- lines,
 * as understood. Null when the answer has no <Notebook_Update> block at all.
 * @returns {null | { block: string, count: number }}
 */
export function notebookAnswerBlock(raw) {
    const text = String(raw || "")
        .replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "")
        .replace(/```[a-z]*\n?|```/gi, "");
    if (!/<Notebook_Update\b/i.test(text)) return null;
    const m = text.match(/<Notebook_Update\b[^>]*>[\s\S]*?(?:<\/Notebook_Update\s*>|$)/i);
    const parsed = parseNotebook(m ? m[0] : "", { prose: "" });
    const lines = (parsed ? parsed.ops : []).filter(o => READ_OPS.has(o.op)).map(o =>
        o.op === "clue" ? `Clue ${o.id}: ${o.text}`
            : o.op === "learned" ? `Learned ${o.id}: ${o.names.join(", ")}`
                : `Truth-: ${o.id}`);
    return { block: `<Notebook_Update>\n${lines.join("\n") || "No changes"}\n</Notebook_Update>`, count: lines.length };
}

const MARK = "<!--notebook-read-->";

/** The entry's text: the reply, then Chomusuke's block. */
export function joinNotebookRead(replyText, block) {
    return `${String(replyText || "")}\n\n${MARK}\n${block}`;
}

/** Chomusuke's block back out of an entry's text, or "" when it has none. */
export function notebookReadPart(raw) {
    const s = String(raw || "");
    const i = s.lastIndexOf(MARK);
    return i < 0 ? "" : s.slice(i + MARK.length).trim();
}

/** The parsed entry for a reply plus Chomusuke's block (clues checked against the reply's story). */
export function parseNotebookRead(replyText, block) {
    return parseNotebook(joinNotebookRead(replyText, block), { prose: storyProse(replyText) });
}
