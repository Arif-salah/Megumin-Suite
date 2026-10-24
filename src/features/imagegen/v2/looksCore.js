// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 — looks: the scan prompts, reading their answers, and deciding
// what a scan may change. Pure: no SillyTavern, testable under node.
//
// A look is a character's PERMANENT appearance (hair, eyes, body, permanent
// features). Never clothing: the outfit comes from World State.
// ────────────────────────────────────────────────────────────────────────────

import { stripCountTags, dedupeTags, splitTags } from "./resolve.js";
import { IMAGE_V2_PROMPTS } from "../../../prompts/imageGenV2.js";

// ── Prompts (background task calls; they describe their own job, never an extension) ──

export const LOOK_SCAN_SYSTEM =
    "You read story text and write each character's permanent physical appearance as booru tags for an image model.";

/**
 * @param {{ source: string, sourceLabel?: string, names?: string[], lore?: string }} args
 *   names — only these characters; empty = everyone described in the source
 *   lore  — lorebook entries about them, read before the source
 */
export function renderLookScanPrompt({ source, sourceLabel = "Source", names = [], lore = "" }) {
    const who = names.length
        ? `these characters: ${names.join(", ")}. Skip anyone the text does not describe.`
        : "every character the text describes.";
    const loreText = String(lore || "").trim();
    return [
        ...(loreText ? ["<Lore>", loreText, "</Lore>", ""] : []),
        ...(String(source || "").trim() ? [`<${sourceLabel}>`, String(source).trim(), `</${sourceLabel}>`, ""] : []),
        `Write the permanent appearance of ${who}`,
        "Write 8 to 12 booru tags per character, only the ones you would recognise them by. Always start with their sex (male or female) and apparent age (young adult, mature female…), then hair (colour, length, style), eye colour, skin, body type, and permanent features (scars, tattoos, horns, animal ears, tails, wings).",
        "- A man who looks feminine: add \"otoko no ko, flat chest\". A woman who looks masculine: add \"tomboy\". Without them the image model draws the wrong sex.",
        "- Age is one of these tags, never a number or a decade: young adult, adult, mature female, mature male, old woman, old man. \"late 20s\" is \"young adult\"; \"30s\" is \"adult\".",
        "- One tag per thing, the strongest one: \"long hair\", never \"long hair, medium hair\".",
        "- Only real booru tags, and say where a mark is: \"mole under eye\", not \"moles\"; \"sidelocks\", not \"side hair\".",
        "- Never two tags that fight: \"petite\" with \"tall\", or \"slender\" with \"curvy\". Pick the one that fits best.",
        "- Leave out small face details the image model draws on its own (nose, lips, eyelashes, face shape, smooth skin), unless one is what makes them recognisable.",
        "- Never include: clothing or accessories they can take off, expressions, poses, actions, the place, count tags (1girl, 1boy, solo) or quality tags.",
        "Only what the text states or clearly shows; do not invent features.",
        IMAGE_V2_PROMPTS.tagsInEnglish,
        "If a character has a nickname, write the name as: Name \"Nickname\".",
        "",
        "Output one block per character and nothing else:",
        "<Character_Visual name=\"Name\">tag, tag, tag</Character_Visual>"
    ].join("\n");
}

export const NATURAL_SYSTEM =
    "You turn booru appearance tags into short, plain descriptions for an image model that reads sentences.";

/** @param {Array<{ name: string, tags: string }>} looks */
export function renderNaturalPrompt(looks) {
    return [
        "For each character, turn the tags into ONE short descriptive phrase (15 to 35 words) that starts with \"a\" or \"an\".",
        "Describe only their permanent appearance. No clothing, no names, no actions.",
        "Example: <Character_Natural name=\"Mira\">a slender young woman with long wavy red hair, bright green eyes and freckled pale skin</Character_Natural>",
        "",
        ...looks.map(l => `${l.name}: ${l.tags}`),
        "",
        "Output one block per character and nothing else:",
        "<Character_Natural name=\"Name\">a …</Character_Natural>"
    ].join("\n");
}

// ── Reading answers ──────────────────────────────────────────────────────

const unescape = s => String(s || "").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/\\(["'])/g, "$1");

// 'Matthew "Matt"' → { name: "Matthew", aliases: ["Matt"] }
function splitName(raw) {
    const s = unescape(raw).trim();
    const m = s.match(/^(.+?)\s+["“‘']([^"”’']{1,32})["”’']\s*$/);
    if (m) return { name: m[1].trim(), aliases: [m[2].trim()] };
    const p = s.match(/^(.+?)\s*\(([^)]{1,32})\)\s*$/);
    if (p) return { name: p[1].trim(), aliases: [p[2].trim()] };
    return { name: s, aliases: [] };
}

function blocks(text, tag) {
    const clean = String(text || "")
        .replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "")
        .replace(/```[a-z]*|```/gi, "");
    const re = new RegExp(`<${tag}\\b[^>]*?name\\s*=\\s*(?:"((?:\\\\.|&quot;|[^"])*)"|'((?:\\\\.|[^'])*)')[^>]*>([\\s\\S]*?)(?:<\\/${tag}\\s*>|(?=<${tag}\\b)|$)`, "gi");
    const out = [];
    let m;
    while ((m = re.exec(clean)) !== null) out.push({ rawName: m[1] ?? m[2] ?? "", body: m[3] || "" });
    return out;
}

/**
 * @returns {Array<{ name: string, aliases: string[], tags: string }>} one per character, first wins
 */
export function parseLookBlocks(text) {
    const seen = new Set();
    const out = [];
    for (const b of blocks(text, "Character_Visual")) {
        const { name, aliases } = splitName(b.rawName);
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        const tags = dedupeTags(stripCountTags(
            splitTags(b.body.replace(/\s*\n\s*/g, ", ").replace(/^["'\s]+|["'\s]+$/g, "")).join(", ")
        ));
        if (!tags) continue;
        seen.add(key);
        out.push({ name, aliases, tags });
    }
    return out;
}

/** @returns {Array<{ name: string, natural: string }>} */
export function parseNaturalBlocks(text) {
    return blocks(text, "Character_Natural")
        .map(b => ({ name: splitName(b.rawName).name, natural: b.body.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "") }))
        .filter(x => x.name && x.natural);
}

/**
 * Keeps only the results for the characters asked for, filed under THEIR name:
 * asking for Matthew and getting a block named "Matt" is still Matthew (and
 * "Matt" is kept as a nickname).
 * @param {Array<{ name: string, aliases: string[], tags: string }>} scanned
 * @param {Array<{ name: string, aliases?: string[] }>} targets
 */
export function matchScanToTargets(scanned, targets) {
    if (!targets || !targets.length) return scanned;
    const k = s => String(s || "").toLowerCase().trim();
    const out = [];
    for (const s of scanned) {
        const said = [s.name, ...(s.aliases || [])].map(k);
        const t = targets.find(t => [t.name, ...(t.aliases || [])].map(k).some(n => said.includes(n)));
        if (!t || out.some(o => k(o.name) === k(t.name))) continue;
        const aliases = [...new Set([...(s.aliases || []), s.name].filter(a => k(a) !== k(t.name)))];
        out.push({ ...s, name: t.name, aliases });
    }
    return out;
}

// ── What a scan may change ───────────────────────────────────────────────

const key = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const sameTags = (a, b) => {
    const set = t => new Set(splitTags(t).map(key));
    const A = set(a), B = set(b);
    return A.size === B.size && [...A].every(x => B.has(x));
};

/** The stored look a scanned name refers to (by name or nickname), or null. */
export function findLookKey(looks, name, aliases = []) {
    const wanted = [name, ...aliases].map(key).filter(Boolean);
    for (const [k, v] of Object.entries(looks || {})) {
        if (!v) continue;
        const have = [k, ...(v.aliases || [])].map(key);
        if (wanted.some(w => have.includes(w))) return k;
    }
    return null;
}

/**
 * Sorts a scan's results against the stored looks.
 *   add     — no stored look (or an empty one): safe to add without asking
 *   change  — an established look would change: the user decides (popup)
 *   locked  — would change, but the look is locked: never touched
 *   same    — nothing new
 * @param {Record<string, {tags?: string, locked?: boolean, aliases?: string[]}>} looks
 * @param {Array<{ name: string, aliases: string[], tags: string }>} scanned
 */
export function planLookUpdates(looks, scanned) {
    const plan = { add: [], change: [], locked: [], same: [] };
    for (const s of scanned || []) {
        const k = findLookKey(looks, s.name, s.aliases);
        const cur = k ? looks[k] : null;
        // A stored look is its always part plus its body part.
        const old = cur ? [cur.tags, cur.body].map(t => String(t || "").trim()).filter(Boolean).join(", ") : "";
        const item = { key: k || s.name, name: s.name, aliases: s.aliases || [], tags: s.tags, old };
        if (!old) plan.add.push(item);
        else if (sameTags(old, s.tags)) plan.same.push(item);
        else if (cur.locked) plan.locked.push(item);
        else plan.change.push(item);
    }
    return plan;
}

// ── Detailed outfit tags (optional) ──────────────────────────────────────
// World State keeps outfits as short phrases. For tag-style image models they
// can be turned into precise booru tags ONCE per outfit, and reused for every
// image until World State says the outfit changed.

/** A short, stable fingerprint of an outfit text (what the tags were made from). */
export function outfitHash(text) {
    const t = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ":" + t.length;
}

/**
 * The tags to use for an outfit right now, or null when they must be (re)made.
 * @param {{ from?: string, tags?: string, locked?: boolean }|undefined} cached
 * @param {string} outfitText  the World State outfit
 */
export function freshOutfitTags(cached, outfitText) {
    if (!cached || !String(cached.tags || "").trim()) return null;
    if (cached.locked) return cached.tags;
    return cached.from === outfitHash(outfitText) ? cached.tags : null;
}

export const OUTFIT_SYSTEM = "You turn clothing descriptions into booru tags for an image model.";

/** @param {Array<{ name: string, outfit: string }>} items */
export function renderOutfitTagsPrompt(items) {
    return [
        "Turn each outfit into booru clothing tags.",
        "- Main garments only, 3 to 6 tags: one tag per garment, with its colour or material when the text gives one (\"grey hoodie, black joggers, white socks\"), plus one standout accessory if there is one. \"oversized pink sweater\" is one tag, never \"pink sweater, cable knit sweater, oversized sweater\".",
        "- Plain over detailed: \"white bra\", not \"lace-trimmed bra, front bow, white trim, drawstring\". Name a print only when it is simple, and put it in the garment's own tag: \"white cat print bra\", not \"white bra, cat print bra\".",
        "- Keep the state of dress when the text says it (open jacket, sleeves rolled up, barefoot, towel).",
        "- Only clothing and accessories: no hair, body, expression, pose, count tags or quality tags. Add nothing the text does not say.",
        `- ${IMAGE_V2_PROMPTS.tagsInEnglish}`,
        "",
        ...items.map(i => `${i.name}: ${i.outfit}`),
        "",
        "Output one block per character and nothing else:",
        "<Outfit_Tags name=\"Name\">tag, tag, tag</Outfit_Tags>"
    ].join("\n");
}

/** @returns {Array<{ name: string, tags: string }>} */
export function parseOutfitBlocks(text) {
    return blocks(text, "Outfit_Tags")
        .map(b => ({
            name: splitName(b.rawName).name,
            tags: dedupeTags(stripCountTags(splitTags(b.body.replace(/\s*\n\s*/g, ", ").replace(/^["'\s]+|["'\s]+$/g, "")).join(", ")))
        }))
        .filter(x => x.name && x.tags);
}
