// ────────────────────────────────────────────────────────────────────────────
// The full prompt preview in Dev Mode (plan 025): one preset message filled
// with the built values, as a tree that remembers where every piece came from.
//
//   { type: "text", text }                    the preset's own words, or plain text
//   { type: "tag", trigger, children }        what a [[tag]] was filled with
//   { type: "edit", key, children }           an editable text (traced while built)
//   { type: "empty", trigger }                a [[tag]] that sends nothing (off, or empty this turn)
//
// Fills like the injector: a tag with no value or an empty one goes, with the
// line it sits on; a value can hold more tags, filled in turn.
// Pure: runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

import { TRACE } from "../prompts/edits.js";

const TAG = /\[\[[^\]\n]+\]\]/g;
const MAX_DEPTH = 6;

/** Splits traced text into text and edit nodes (marks can nest). */
export function parseTraced(text) {
    const root = { children: [] };
    const stack = [root];
    let buf = "";
    const flush = () => { if (buf) { stack[stack.length - 1].children.push({ type: "text", text: buf }); buf = ""; } };
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === TRACE.open) {
            const mid = text.indexOf(TRACE.mid, i);
            if (mid < 0) continue;
            flush();
            const node = { type: "edit", key: text.slice(i + 1, mid), children: [] };
            stack[stack.length - 1].children.push(node);
            stack.push(node);
            i = mid;
        } else if (ch === TRACE.close) {
            flush();
            if (stack.length > 1) stack.pop();
        } else if (ch !== TRACE.mid) {
            buf += ch;
        }
    }
    flush();
    return root.children;
}

/**
 * One message's content filled from the dictionary.
 * @param {string} content  the preset message, with its [[tags]]
 * @param {Record<string, string>} dict
 * @returns {Array} nodes
 */
export function fillPreview(content, dict, depth = 0) {
    // A tag that fills with nothing takes its line with it. The tag itself
    // stays, so the preview can say it is off or empty.
    const lines = String(content || "").split("\n");
    let kept = "";
    lines.forEach((line, i) => {
        const tags = line.match(TAG);
        const dropped = tags && !line.replace(TAG, "").replace(/[-]/g, "").trim()
            && !tags.some(t => String(dict[t] ?? "").trim());
        kept += dropped ? tags.join("") : line + (i < lines.length - 1 ? "\n" : "");
    });
    // The marks first, so a tag inside an edited text stays inside it.
    const expand = nodes => nodes.flatMap(n => n.type === "edit"
        ? [{ ...n, children: expand(n.children) }]
        : fillTags(n.text, dict, depth));
    return expand(parseTraced(kept));
}

function fillTags(text, dict, depth) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(TAG)) {
        if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });
        const value = dict[m[0]];
        if (value != null && String(value).trim()) {
            const children = depth < MAX_DEPTH ? fillPreview(String(value), dict, depth + 1) : parseTraced(String(value));
            out.push({ type: "tag", trigger: m[0], children });
        } else {
            out.push({ type: "empty", trigger: m[0] });
        }
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ type: "text", text: text.slice(last) });
    return out;
}

/** The plain text of a node list (what is actually sent, marks taken out). */
export function previewText(nodes) {
    return (nodes || []).map(n => n.type === "text" ? n.text : previewText(n.children)).join("");
}
