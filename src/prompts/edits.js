// ────────────────────────────────────────────────────────────────────────────
// Prompt texts edited in Dev Mode that are built by pure modules (World State,
// Bonds, Character Sheet rules). The edits live in the shared fragments
// (core/sharedFragments.js), which pure code can't import, so index.js hands
// over a reader at startup, the same way data/slots.js gets the engine clones.
//
// An edited text can hold {{tokens}} that are filled in when it is sent, so a
// setting (a World State limit, a field's starting value) still reaches it.
// Pure: runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

let read = () => "";

/** @param {(key: string) => string} fn */
export function setPromptEditReader(fn) {
    read = typeof fn === "function" ? fn : () => "";
}

/** The edited text for a key, or "" when it is not edited. */
export function promptEdit(key) {
    let v = "";
    try { v = read(key) || ""; } catch { v = ""; }
    return String(v).trim() ? String(v) : "";
}

/**
 * The text to send: the edit with its tokens filled, or the built-in text.
 * @param {string} key
 * @param {string} builtin  the built-in text, already filled
 * @param {object} [tokens] what each {{token}} in an edit stands for
 */
export function editable(key, builtin, tokens) {
    const t = promptEdit(key);
    return traced(key, t ? fillPromptTokens(t, tokens || {}) : builtin);
}

// ── Tracing, for Dev Mode's full prompt preview (plan 025) ───────────────────
// While the preview builds the prompt, each editable text is wrapped in
// private-use marks with its key, so the preview can colour it and open its
// box. Only ever on for that one synchronous build; a real prompt never has them.
export const TRACE = { open: "", mid: "", close: "" };
let tracing = false;

export function setPromptTrace(on) { tracing = Boolean(on); }

/** The text, marked with its key while the preview is building. */
export function traced(key, text) {
    return tracing && text ? `${TRACE.open}${key}${TRACE.mid}${text}${TRACE.close}` : text;
}

/**
 * An object of prompt texts whose every string (or list of lines) can be
 * edited under `${prefix}.${path}`. A list of lines is edited as one text,
 * one line each.
 */
export function editableTree(tree, prefix) {
    return new Proxy(tree, {
        get(target, prop) {
            const v = target[prop];
            if (typeof prop !== "string") return v;
            const key = `${prefix}.${prop}`;
            if (typeof v === "string") return editable(key, v);
            if (Array.isArray(v)) {
                const t = promptEdit(key);
                return t ? t.replace(/\r\n/g, "\n").split("\n") : v;
            }
            if (v && typeof v === "object") return editableTree(v, key);
            return v;
        }
    });
}

/** Fills {{name}} for the names given; any other {{…}} ({{user}}) is left alone. */
export function fillPromptTokens(text, values) {
    return String(text || "").replace(/\{\{(\w+)\}\}/g, (m, name) =>
        Object.prototype.hasOwnProperty.call(values || {}, name) ? String(values[name]) : m);
}
