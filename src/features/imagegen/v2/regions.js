// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 — looks and outfits sorted by where they sit on the body
// (plan 027). Pure.
//
//   look:   Core | Head | Upper | Lower | Feet
//   outfit:        Head | Upper | Lower | Feet
//
// A model answers with one "Label: tag, tag" line per part. An answer with no
// such lines (older prompts, a weak model) is read as before: one tag list.
// A sorted look also keeps its two old parts (tags = Core + Head, body =
// Upper + Lower + Feet), so everything that reads those keeps working.
// ────────────────────────────────────────────────────────────────────────────

import { splitTags, stripCountTags, dedupeTags } from "./resolve.js";

export const LOOK_REGIONS = ["core", "head", "upper", "lower", "feet"];
export const OUTFIT_REGIONS = ["head", "upper", "lower", "feet"];

const LABEL = /^\s*[-*•]?\s*\**\s*(core|head|upper|lower|feet)\s*\**\s*:\s*\**\s*(.*)$/i;

const clean = s => dedupeTags(stripCountTags(splitTags(String(s || "").replace(/^["'\s]+|["'\s]+$/g, "")).join(", ")));

/**
 * The "Label: tags" lines of an answer, or null when it has none.
 * Lines without a label follow the line above them; a label written twice
 * keeps its first line.
 * @returns {Record<string, string> | null}
 */
export function parseRegionLines(body, regions = LOOK_REGIONS, { phrases = false } = {}) {
    const lines = String(body || "").split(/\r?\n/);
    if (!lines.some(l => LABEL.test(l))) return null;
    const out = Object.fromEntries(regions.map(r => [r, ""]));
    const seen = new Set();
    let current = null;
    for (const line of lines) {
        const m = line.match(LABEL);
        if (m) {
            const r = m[1].toLowerCase();
            current = regions.includes(r) && !seen.has(r) ? r : null;
            if (current) { seen.add(current); out[current] = m[2]; }
            continue;
        }
        if (current && line.trim()) out[current] = [out[current], line].filter(s => s.trim()).join(phrases ? " " : ", ");
    }
    // Phrases (Qwen's descriptions): kept as written, spaces tidied.
    if (phrases) {
        for (const r of regions) out[r] = out[r].replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "").replace(/[.,;]\s*$/, "");
        return regions.some(r => out[r]) ? out : null;
    }
    for (const r of regions) out[r] = clean(out[r]);
    // A tag the model put on two lines stays on the first.
    const taken = new Set();
    for (const r of regions) {
        out[r] = splitTags(out[r]).filter(t => {
            const k = t.toLowerCase();
            if (taken.has(k)) return false;
            taken.add(k);
            return true;
        }).join(", ");
    }
    return regions.some(r => out[r]) ? out : null;
}

/** Every tag of a sorted look or outfit, in body order. */
export function joinRegions(regions, order = LOOK_REGIONS) {
    if (!regions) return "";
    return order.map(r => String(regions[r] || "").trim()).filter(Boolean).join(", ");
}

/** The old two parts of a sorted look: what shows in any shot, and the body. */
export function regionsToParts(regions) {
    return {
        always: joinRegions(regions, ["core", "head"]),
        body: joinRegions(regions, ["upper", "lower", "feet"])
    };
}

/** Does a stored look have its parts sorted? */
export const isSorted = entry => Boolean(entry && entry.regions && LOOK_REGIONS.some(r => String(entry.regions[r] || "").trim()));

/**
 * A model's sorting of an old look, held to the look's own tags: a tag it
 * made up is dropped, a tag it left out goes in Core. null = nothing usable.
 */
export function holdToOriginal(sorted, originalTags) {
    if (!sorted) return null;
    const original = splitTags(originalTags);
    const want = new Map(original.map(t => [t.toLowerCase(), t]));
    const used = new Set();
    const out = {};
    for (const r of LOOK_REGIONS) {
        out[r] = splitTags(sorted[r] || "").filter(t => {
            const k = t.toLowerCase();
            if (!want.has(k) || used.has(k)) return false;
            used.add(k);
            return true;
        }).map(t => want.get(t.toLowerCase())).join(", ");
    }
    const missed = original.filter(t => !used.has(t.toLowerCase()));
    if (missed.length) out.core = [out.core, ...missed].filter(Boolean).join(", ");
    return used.size ? out : null;
}

// ── Levels: how much of a character the frame shows (phase 2) ──────────────
// The image model writes @Name:face, :upper, :waist or :full, and :nude when
// they wear nothing at that moment. Each level hands in only the parts of the
// look and outfit the frame shows: no shoes in a close-up (they landed on the
// viewer's feet in POV), the top still in a close-up (or the image model
// invents one in another colour).

export const LEVELS = ["face", "upper", "waist", "full"];

const LEVEL_LOOK = {
    face: ["core", "head"],
    upper: ["core", "head", "upper"],
    waist: ["core", "head", "upper", "lower"],
    full: LOOK_REGIONS
};
const LEVEL_OUTFIT = {
    face: ["head", "upper"],
    upper: ["head", "upper"],
    waist: ["head", "upper", "lower"],
    full: OUTFIT_REGIONS
};

/** The look parts a level shows. */
export const lookPartsFor = level => LEVEL_LOOK[level] || LOOK_REGIONS;
/** The outfit parts a level shows. */
export const outfitPartsFor = level => LEVEL_OUTFIT[level] || OUTFIT_REGIONS;

/**
 * ":waist", ":full:nude", ":nude" right after a @Name.
 * @returns {{ level: string, nude: boolean, length: number }} level "" = not written
 */
export function readLevel(text) {
    const m = String(text || "").match(/^(?::(?:face|upper|waist|full|nude)\b)+/i);
    if (!m) return { level: "", nude: false, length: 0 };
    const words = m[0].toLowerCase().split(":").filter(Boolean);
    return { level: words.find(w => w !== "nude") || "", nude: words.includes("nude"), length: m[0].length };
}

// The framing words of a prompt, in the order the levels read them.
const FRAMING = [
    ["face", /\b(extreme close[- ]?up|close[- ]?up|portrait|headshot|face focus|head and shoulders)\b/i],
    ["upper", /\b(upper body|from the chest up|chest[- ]up|bust shot|waist[- ]up shot)\b/i],
    ["waist", /\b(cowboy shot|medium shot|mid[- ]shot|from the waist up|from the thighs up|thighs[- ]up|three[- ]quarter shot)\b/i],
    ["full", /\b(full[- ]body|full[- ]length|head to toe|wide shot|very wide shot|long shot|wide angle|whole body|establishing shot)\b/i]
];

/**
 * The level a plain @Name gets: the first framing named in the prompt's
 * opening (its first line or sentence; else the whole prompt), else full.
 */
export function framingLevel(opening, whole = "") {
    for (const text of [opening, whole]) {
        let best = null;
        for (const [level, re] of FRAMING) {
            const m = String(text || "").match(re);
            if (m && (best === null || m.index < best.at)) best = { level, at: m.index };
        }
        if (best) return best.level;
    }
    return "full";
}