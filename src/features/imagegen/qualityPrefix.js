// ────────────────────────────────────────────────────────────────────────────
// Quality prefix presets. Choosing a tag style (V2 "Tags", Classic
// "Illustrious/Anima") shows the quality tags in the Positive Prefix field;
// choosing a natural-language style (V2 "Natural", Classic "Z Image") takes
// them out. The field stays the user's: what they add after the tags is kept.
// Pure: no SillyTavern imports, so it is unit-tested.
// ────────────────────────────────────────────────────────────────────────────

export const QUALITY_TAGS = "masterpiece, best quality, score_9, score_8, newest";

const norm = s => String(s || "").replace(/\s+/g, " ").trim();

// The prefix with the preset taken off the front (and its joining comma).
function withoutPreset(prefix) {
    const p = norm(prefix);
    if (!p.toLowerCase().startsWith(QUALITY_TAGS.toLowerCase())) return null;
    return p.slice(QUALITY_TAGS.length).replace(/^\s*,\s*/, "").trim();
}

// The prefix for a newly chosen style: "tags" or "natural".
export function prefixForStyle(style, current) {
    const rest = withoutPreset(current);
    if (style === "tags") {
        if (rest !== null) return String(current || "");
        return QUALITY_TAGS;
    }
    if (rest !== null) return rest;
    return String(current || "");
}

// Classic templates are "illus_*" (tags) or "sdxl_*" (Z Image, natural).
export function styleOfTemplate(template) {
    return String(template || "").startsWith("illus") ? "tags" : "natural";
}
