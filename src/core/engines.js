// ─────────────────────────────────────────────────────────────────────────────
// Which generation an engine belongs to, and what that means.
//
// These four tests used to be written out by hand in buildBaseDict, personality,
// globalAndBlocks and storyconfig — the same expression, four times. That is how
// V10 came to announce itself as V9 in two different places: V10 was flagged
// `isV9` so it would inherit V9's behaviour, and every site that turned the flag
// back into the WORD "V9" was suddenly lying. Fixing one did not fix the others.
//
// So: one spelling, and behaviour asked for by name rather than by generation.
// A screen that wants to know what to CALL the engine reads `engine.label`; it
// never reconstructs the name from a flag.
// ─────────────────────────────────────────────────────────────────────────────

// Pure predicates over an engine object. No imports on purpose — every caller
// already has the engine in hand, and keeping this dependency-free means any
// layer can use it.
export const isV7Engine = m => !!m && (String(m.id || "").startsWith("v7") || m.isV7 === true);
export const isV8Engine = m => !!m && (String(m.id || "").startsWith("v8") || m.isV8 === true);
export const isV9Engine = m => !!m && (String(m.id || "").startsWith("v9") || m.isV9 === true);
export const isV10Engine = m => !!m && (String(m.id || "").startsWith("v10") || m.isV10 === true);
export const isV11Engine = m => !!m && (String(m.id || "").startsWith("v11") || m.isV11 === true);

// The Co-writer variants, which author {{user}} as well as the world. Flag first
// so a clone of one keeps answering true, id suffix second so an engine built
// before the flag existed still reads correctly.
export const isCoWriterEngine = m => !!m && (m.isCoWriter === true || String(m.id || "").endsWith("-cw"));

// ── Behaviour, named for what it does ────────────────────────────────────────
//
// V10 inherits everything V9 does EXCEPT the Lean/Full render limits, which it
// has no use for. Asking `isModernEngine()` rather than `isV8 || isV9 || isV10`
// means the next generation is one line here instead of a hunt through the UI.

/** Carries its own persona and narrative toggles, so [[main]], [[OOC]],
 *  [[control]] and the acknowledgements are all blanked and the Persona tab
 *  shows its locked state. */
export const isModernEngine = m => isV8Engine(m) || isV9Engine(m) || isV10Engine(m) || isV11Engine(m);

/** Requires a narrative style directive, so "No Style (Off)" is refused. */
export const engineLocksStyle = m => isV7Engine(m) || isModernEngine(m);

/** The Lean/Full word-count split. V9 ONLY — this is the one thing V10 does not
 *  take from V9, and the reason it stopped borrowing the isV9 flag. */
export const engineUsesRenderLimits = m => isV9Engine(m) && !isV10Engine(m);

/** Keeps an Author's Notebook (plan 010): picking it turns the notebook on. */
export const engineKeepsNotebook = m => !!m && m.notebook === true;

/** The built-in style an engine drops you on when you switch to it. */
export function lockedStyleIdFor(m) {
    if (!m) return null;
    if (m.id === "v7-core") return "dir_v7_core";
    if (m.id === "v7-gentle") return "dir_v7_gentle";
    if (m.id === "v7.5") return "dir_v7.5";
    if (isV8Engine(m)) return "dir_v8";
    if (isV11Engine(m)) return "dir_v11";
    // Shura before the general V10 test: "v10-shura-cw" is both, and the more
    // specific answer is the right one.
    if (String(m.id || "").startsWith("v10-shura")) return "dir_v10_shura";
    if (isV10Engine(m)) return "dir_v10_ukiyo";
    if (isV9Engine(m)) return "dir_v9";
    if (isV7Engine(m)) return "dir_v7";
    return null;
}

// The built-in styles a generation offers. V11 has two: Default and Inside.
const STYLE_FAMILY = { dir_v11: ["dir_v11", "dir_v11_inside"] };

/**
 * The style to switch to after picking engine `m`, or null to keep the one in
 * use: your own style, or a built-in one of the same generation (moving
 * between the V11 engines keeps V11 Inside). Another generation's built-in
 * style, or none, becomes the engine's own.
 * @param {boolean} isBuiltIn  activeStyleId is one of the built-in styles
 */
export function styleAfterPicking(m, activeStyleId, isBuiltIn) {
    const locked = lockedStyleIdFor(m);
    if (!locked) return null;
    if (activeStyleId && !isBuiltIn) return null;
    return (STYLE_FAMILY[locked] || [locked]).includes(activeStyleId) ? null : locked;
}
