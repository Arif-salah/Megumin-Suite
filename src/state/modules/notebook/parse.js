// ────────────────────────────────────────────────────────────────────────────
// Author's Notebook parsing (plan 010).
//
// Two blocks, both written after the story:
//   <Notebook>         the setup: two or three full entries
//   <Notebook_Update>  one line per change:
//                        Clue T1: <the clue this turn's story showed>
//                        Learned T1: <who found it out>
//                        Truth-: T1           (it came out)
//                        Truth+: T3           (a new truth, its lines follow)
//
// Parsing only reads what was written. Ids, the cap, first-wins and name
// matching are the model's job (model.js). There is no edit line: the model
// can't change a truth, only the user can (from the tab).
//
// Each clue is checked against the reply's prose here, because only the parser
// sees the whole message: a clue that shares no real word with the story is
// kept, marked found: false, and flagged in the tab.
//
// Pure: runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

import { extractTagBodies } from "../stats/parse.js";

export const NOTEBOOK_TAGS = ["Notebook", "Notebook_Update"];

// Entry field labels → keys. Anything else in an entry ("Clues planted:", a
// copied "Live truths" line) is not the model's to write and is left out.
const FIELD_KEYS = [
    [/^truth$/, "truth"],
    [/^hidden\s*from$/, "hiddenFrom"],
    [/^comes?\s*out\s*when$/, "when"],
    [/^what\s*it\s*changes$/, "changes"],
    [/^clue\s*ideas?$/, "clueIdeas"]
];

/** "T1", "t 1", "#T1", "**T1**" → "T1"; anything else → null. */
export function truthId(raw) {
    const m = String(raw || "").replace(/[*_`#[\]()]/g, "").trim().match(/^t\s*(\d+)$/i);
    return m ? `T${Number(m[1])}` : null;
}

function cleanLine(raw) {
    return String(raw || "")
        .replace(/<!--[\s\S]*?(-->|$)/g, "")
        .replace(/<\/?[a-z][^>]*>/gi, " ")
        .replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "")
        .replace(/\*\*|__/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// The template's own lines ("[change lines]") are instructions, not values.
const isTemplateLine = l => /^\[[^\]]*\]$/.test(l) || /^no changes?\.?$/i.test(l);

function fieldOf(line) {
    const m = line.match(/^([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/);
    if (!m) return null;
    const label = m[1].toLowerCase().replace(/\s+/g, " ").trim();
    const hit = FIELD_KEYS.find(([re]) => re.test(label));
    return hit ? { key: hit[1], value: m[2].trim() } : null;
}

// A word that starts a reason, not a name: "the reader, because it hasn't been
// shown", "Mira, who suspects", "Tomas doesn't know". Everything from it on goes.
const REASON = /(?:^|\s)(?:because|becuase|becasue|becaus|becouse|bc|cuz|coz|cause|since|as|who|whom|which|until|unless|but|though|although|while|yet|so|has|have|had|is|are|was|were|does|did|knows?|cannot|never|not|(?:has|have|is|are|was|were|does|do|did|ca|wo)n['’]t)(?=\s|$).*$/i;
const MAX_NAME_WORDS = 6;

/** "Mira, Old Tomas and the reader" → ["Mira", "Old Tomas", "the reader"]. Reasons the model added are left out. */
export function splitNames(text) {
    const seen = new Set();
    return String(text || "")
        .replace(/\([^)]*\)?|\[[^\]]*\]?/g, " ")
        .split(/\s*(?:,|;|\/|\band\b|&)\s*/i)
        .map(s => s.replace(/[.*_"“”]/g, "").replace(/\s[—–-]\s.*$/, "").replace(REASON, "").replace(/\s+/g, " ").trim())
        .map(s => (/^(?:the\s+)?reader\b/i.test(s) ? "the reader" : s))
        .filter(s => s && !/^(no ?one|nobody|none|-)$/i.test(s) && s.split(" ").length <= MAX_NAME_WORDS)
        .filter(s => !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

function finishEntry(e) {
    if (!e || !e.truth) return null;
    return {
        op: "entry",
        id: e.id || null,
        truth: e.truth,
        hiddenFrom: splitNames(e.hiddenFrom),
        when: e.when || "",
        changes: e.changes || "",
        clueIdeas: e.clueIdeas || ""
    };
}

// Field lines into entries. An id line ("T2") starts a new entry, and so does a
// second Truth: line, for a model that drops the id lines.
function readEntries(lines, startId = null) {
    const out = [];
    let cur = { id: startId };
    for (const line of lines) {
        const id = truthId(line.replace(/[:.—–-]+$/, ""));
        if (id) {
            const done = finishEntry(cur);
            if (done) out.push(done);
            cur = { id };
            continue;
        }
        const f = fieldOf(line);
        if (!f) continue;
        if (f.key === "truth" && cur.truth) {
            const done = finishEntry(cur);
            if (done) out.push(done);
            cur = { id: null };
        }
        if (!cur[f.key]) cur[f.key] = f.value;
    }
    const done = finishEntry(cur);
    if (done) out.push(done);
    return out;
}

function bodyLines(body) {
    return String(body || "").split("\n").map(cleanLine).filter(l => l && !isTemplateLine(l));
}

// ── The prose check ──────────────────────────────────────────────────────

const STOP = new Set(("the a an and or but of to in on at by for with from into onto over under about after before " +
    "this that these those there their they them then than his her hers him she he its it's was were is are be been " +
    "being has have had not no never only just very some any all each every what when where which who whom why how " +
    "story turn clue page reply shows showed shown says said scene moment").split(" "));

const stem = w => (w.length > 5 ? w.slice(0, 5) : w);

/** The reply's story text: no thinking, no blocks, no tags. */
export function storyProse(text) {
    return String(text || "")
        .replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "")
        .replace(/<Blocks\b[^>]*>[\s\S]*?(<\/Blocks\s*>|$)/gi, "")
        .replace(/<(Notebook|Notebook_Update)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, "")
        .replace(/<details\b[^>]*>[\s\S]*?<\/details\s*>/gi, "")
        .replace(/<[^>]+>/g, " ");
}

// The words a clue line is about: lowercase, four letters or more, no small
// words, and no names (capitalised words), since a name alone says nothing
// about whether the clue itself is on the page.
function clueWords(clue) {
    const words = String(clue || "").match(/[\p{L}][\p{L}'’-]*/gu) || [];
    return words
        .filter(w => !/^\p{Lu}/u.test(w))
        .map(w => w.toLowerCase().replace(/['’]s$/, ""))
        .filter(w => w.length >= 4 && !STOP.has(w));
}

/** Does the prose share a real word with the clue? A clue with nothing to compare counts as found. */
export function clueInProse(clue, prose) {
    const want = clueWords(clue);
    if (!want.length) return true;
    const have = new Set((String(prose || "").toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) || []).map(w => stem(w.replace(/['’]s$/, ""))));
    return want.some(w => have.has(stem(w)));
}

// ── The blocks ───────────────────────────────────────────────────────────

// A change line, as opposed to a field of a Truth+ entry ("Clue ideas:" is a field).
const CHANGE_LINE = /^(?:(?:clue|learned)\s*:?\s*t\s*\d|truth\s*[+-])/i;

/**
 * Update lines (and any Truth+ entries) from one <Notebook_Update> body.
 * @param {string} body
 * @param {string} prose  the story text, for the clue check
 */
export function parseUpdateLines(body, prose) {
    const ops = [];
    const lines = bodyLines(body);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m;
        if ((m = line.match(/^truth\s*\+\s*:?\s*(.*)$/i))) {
            // Its lines run to the next change line.
            const own = [];
            let j = i + 1;
            while (j < lines.length && !CHANGE_LINE.test(lines[j])) own.push(lines[j++]);
            i = j - 1;
            const lead = m[1].trim();
            const id = truthId(lead.split(/\s+/)[0]);
            // "Truth+: T3 the ferryman is..." or "Truth+: the ferryman is..." put the truth on the same line.
            const rest = id ? lead.replace(/^\S+\s*[:—–-]?\s*/, "") : lead;
            const entries = readEntries(rest ? [`Truth: ${rest}`, ...own] : own, id);
            if (entries[0]) ops.push({ ...entries[0], op: "entry", id: entries[0].id || id });
            continue;
        }
        if ((m = line.match(/^truth\s*-\s*:?\s*(.*)$/i))) {
            const id = truthId(m[1].split(/[\s:—–-]+/)[0]);
            if (id) ops.push({ op: "out", id });
            continue;
        }
        if ((m = line.match(/^(clue|learned)\s*:?\s*(t\s*\d+)\s*[:—–-]?\s*(.*)$/i))) {
            const id = truthId(m[2]);
            const value = m[3].trim();
            if (!id || !value) continue;
            if (m[1].toLowerCase() === "clue") ops.push({ op: "clue", id, text: value, found: clueInProse(value, prose) });
            else ops.push({ op: "learned", id, names: splitNames(value) });
        }
    }
    return ops;
}

/**
 * Everything a reply wrote to the notebook.
 * @param {string} text  the whole message
 * @param {{ prose?: string }} [opts]  prose: the story text to check clues
 *   against when `text` is not the reply itself (a side model's answer)
 * @returns {null | { kind: "delta", ops: object[] }}
 */
export function parseNotebook(text, opts = {}) {
    const prose = opts.prose !== undefined ? opts.prose : storyProse(text);
    // A model that echoes its instructions or the notebook it was given has not
    // written anything: those sections never count.
    const src = String(text || "").replace(/<(Notebook_Setup_Rules|Notebook_Setup|Notebook_Update_Rules|Author_Notebook)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, "");
    const ops = [];
    for (const body of extractTagBodies(src, "Notebook")) ops.push(...readEntries(bodyLines(body)));
    for (const body of extractTagBodies(src, "Notebook_Update")) ops.push(...parseUpdateLines(body, prose));
    return ops.length ? { kind: "delta", ops } : null;
}
