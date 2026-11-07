// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 — looks: the scan prompts, reading their answers, and deciding
// what a scan may change. Pure: no SillyTavern, testable under node.
//
// A look is a character's PERMANENT appearance (hair, eyes, body, permanent
// features). Never clothing: the outfit comes from World State.
// ────────────────────────────────────────────────────────────────────────────

import { stripCountTags, dedupeTags, splitTags } from "./resolve.js";
import { IMAGE_V2_PROMPTS } from "../../../prompts/imageGenV2.js";
import { parseRegionLines, joinRegions, LOOK_REGIONS, OUTFIT_REGIONS } from "./regions.js";
import { whoIs } from "../../../state/names.js";

// Plan 027: where each part of a look shows on the body. Shared by the scan
// and by the one-time sorting of looks saved before.
export const LOOK_REGION_GUIDE = [
    "Core: their sex (male or female) and apparent age (young adult, mature female…), skin, overall build, and marks that cover the whole body (tan lines, full-body tattoos).",
    "Head: hair (colour, length, style), eye colour, and permanent features of the head and face (freckles, a scar, horns, animal ears, a mole under the eye).",
    "Upper: chest, shoulders, arms and hands (breast size, muscular arms, a tattoo on the shoulder, wings).",
    "Lower: waist, hips and legs (wide hips, thick thighs, a tail, a scar on the knee).",
    "Feet: anything permanent on the feet (hooves, an ankle tattoo). Most characters have nothing here."
];

// A filled example: with "tag, tag" placeholders models wrote one or two tags
// per line and left Head empty.
const LOOK_SHAPE = [
    "<Character_Visual name=\"Name\">",
    "Core: female, young adult, pale skin, slender",
    "Head: long hair, wavy hair, auburn hair, green eyes, freckles, mole under eye",
    "Upper: medium breasts",
    "Lower: long legs",
    "Feet:",
    "</Character_Visual>"
];

// The scan's must-haves, as the one-list prompt had them before plan 027.
const LOOK_ALWAYS = "- Core always has their sex, an age tag, skin and build. Head always has hair (colour, length, style) and eye colour. Upper and Lower are often one or two tags; Feet is usually empty.";

// ── Prompts (background task calls; they describe their own job, never an extension) ──

export const LOOK_SCAN_SYSTEM =
    "You read story text and write each character's permanent physical appearance as booru tags for an image model.";

/**
 * @param {{ source: string, sourceLabel?: string, names?: string[], lore?: string, sheets?: string }} args
 *   names  — only these characters; empty = everyone described in the source
 *   lore   — lorebook entries about them, read before the source
 *   sheets — the card's character and persona sheets, read before the story;
 *            a character who has one looks the way it says
 */
export function renderLookScanPrompt({ source, sourceLabel = "Source", names = [], lore = "", sheets = "", detail = false }) {
    const who = names.length
        ? `these characters: ${names.join(", ")}. Skip anyone the text does not describe.`
        : "every character the text describes.";
    const loreText = String(lore || "").trim();
    const sheetText = String(sheets || "").trim();
    return [
        ...(loreText ? ["<Lore>", loreText, "</Lore>", ""] : []),
        ...(sheetText ? ["<Character_Sheets>", sheetText, "</Character_Sheets>", ""] : []),
        ...(String(source || "").trim() ? [`<${sourceLabel}>`, String(source).trim(), `</${sourceLabel}>`, ""] : []),
        `Write the permanent appearance of ${who}`,
        ...(sheetText ? [SHEET_FIRST] : []),
        "Write 8 to 12 booru tags per character, only the ones you would recognise them by, sorted by where they show on the body:",
        ...LOOK_REGION_GUIDE,
        LOOK_ALWAYS,
        ...(detail ? [`- ${IMAGE_V2_PROMPTS.lookDetail}`] : []),
        "- Each tag goes on one line only, the line where it shows most. Leave a line empty when nothing belongs on it.",
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
        "Output one block per character and nothing else, in this shape (an example for a made-up character):",
        ...LOOK_SHAPE
    ].join("\n");
}

export const SORT_LOOKS_SYSTEM = "You sort booru appearance tags by where they show on the body.";

/**
 * The one-time sorting of looks saved before plan 027 (one tag list each).
 * @param {Array<{ name: string, tags: string }>} looks
 */
export function renderSortLooksPrompt(looks) {
    return [
        "Sort each character's tags by where they show on the body:",
        ...LOOK_REGION_GUIDE,
        "- Use every tag once, on the line where it shows most, written exactly as given. Add no tags. Leave a line empty when nothing belongs on it.",
        "",
        ...looks.map(l => `${l.name}: ${l.tags}`),
        "",
        "Output one block per character and nothing else, in this shape (an example for a made-up character; use only the tags given above):",
        ...LOOK_SHAPE
    ].join("\n");
}

// A character on the card looks the way the card says, even when the story so
// far is only a greeting that says little about them.
export const SHEET_FIRST = "A character who has a sheet in <Character_Sheets> looks the way the sheet says. Use the story only for what the sheet leaves out.";

/** The names on the sheets (`<character_sheet name="…">`, `<persona_sheet name="…">`). */
export function sheetNames(sheets) {
    const out = [];
    const re = /<(?:character|persona)_sheet name="([^"]+)"/g;
    let m;
    while ((m = re.exec(String(sheets || "")))) if (m[1].trim()) out.push(m[1].trim());
    return out;
}

/**
 * Where an automatic look came from: "sheet" when the character is on the card
 * (same name, or one starts the other in whole words: "Resha" and "Resha
 * Helios"), else "chat".
 */
export function lookSourceFor(name, aliases, cardNames) {
    const low = s => String(s || "").trim().toLowerCase();
    const mine = [name, ...(aliases || [])].map(low).filter(Boolean);
    const fits = (a, b) => a === b || a.startsWith(b + " ") || b.startsWith(a + " ");
    return (cardNames || []).map(low).filter(Boolean).some(c => mine.some(n => fits(n, c))) ? "sheet" : "chat";
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
        const regions = parseRegionLines(b.body, LOOK_REGIONS);
        const tags = regions ? joinRegions(regions, LOOK_REGIONS) : dedupeTags(stripCountTags(
            splitTags(b.body.replace(/\s*\n\s*/g, ", ").replace(/^["'\s]+|["'\s]+$/g, "")).join(", ")
        ));
        if (!tags) continue;
        seen.add(key);
        out.push(regions ? { name, aliases, tags, regions } : { name, aliases, tags });
    }
    return out;
}

// ── Qwen Image (plan 026): looks and outfits as detailed phrases ───────────

// A character's tags as part lines ("Core: …"), or one line when not sorted.
const partLines = (name, text, regions, order) => regions
    ? [`${name}:`, ...order.map(r => `${r.charAt(0).toUpperCase()}${r.slice(1)}: ${regions[r] || ""}`.trimEnd())]
    : [`${name}: ${text}`];

const ONLY_BLOCKS = "Output one block per character and nothing else:";
const EACH_BLOCK = "One block per character, in this shape:";

/** @param {Array<{ name: string, tags: string, regions?: object|null }>} looks */
export function renderQwenLookPrompt(looks, { outLine = ONLY_BLOCKS } = {}) {
    return [
        IMAGE_V2_PROMPTS.qwenLook.task,
        IMAGE_V2_PROMPTS.descriptionsInEnglish,
        "",
        ...looks.flatMap(l => partLines(l.name, l.tags, l.regions || (l.tags ? { core: l.tags } : null), LOOK_REGIONS)),
        "",
        outLine,
        "<Character_Qwen name=\"Name\">",
        "Core: a …",
        "Head: …",
        "Upper: …",
        "Lower: …",
        "Feet:",
        "</Character_Qwen>"
    ].join("\n");
}

const phrase = s => s.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");

/** @returns {Array<{ name: string, qwen: string, parts?: object }>} parts by body part when written in lines */
export function parseQwenLookBlocks(text) {
    return blocks(text, "Character_Qwen")
        .map(b => {
            const name = splitName(b.rawName).name;
            const parts = parseRegionLines(b.body, LOOK_REGIONS, { phrases: true });
            return parts ? { name, qwen: joinRegions(parts, LOOK_REGIONS), parts } : { name, qwen: phrase(b.body) };
        })
        .filter(x => x.name && x.qwen);
}

/** @param {Array<{ name: string, outfit: string, regions?: object|null }>} items */
export function renderQwenOutfitPrompt(items, { outLine = ONLY_BLOCKS, english = true } = {}) {
    return [
        IMAGE_V2_PROMPTS.qwenOutfit.task,
        ...(english ? [IMAGE_V2_PROMPTS.descriptionsInEnglish] : []),
        "",
        ...items.flatMap(i => partLines(i.name, i.outfit, i.regions || null, OUTFIT_REGIONS)),
        "",
        outLine,
        "<Outfit_Qwen name=\"Name\">",
        "Head:",
        "Upper: a …, … and …",
        "Lower: …",
        "Feet: …",
        "</Outfit_Qwen>"
    ].join("\n");
}

/**
 * Looks and outfits in ONE call: each task with its own list and shape, the
 * looks first. With only one of them, that task's own prompt.
 */
export function renderQwenDescriptionsPrompt(looks = [], outfits = []) {
    if (!outfits.length) return renderQwenLookPrompt(looks);
    if (!looks.length) return renderQwenOutfitPrompt(outfits);
    return [
        "Two tasks: the looks, then the outfits. Output the look blocks, then the outfit blocks, and nothing else.",
        "",
        "## Looks",
        renderQwenLookPrompt(looks, { outLine: EACH_BLOCK }),
        "",
        "## Outfits",
        renderQwenOutfitPrompt(outfits, { outLine: EACH_BLOCK, english: false })
    ].join("\n");
}

/** The opening for that call: one task's opening, or both. */
export const qwenDescriptionsSystem = (looks = [], outfits = []) => [
    looks.length ? IMAGE_V2_PROMPTS.qwenLook.system : "",
    outfits.length ? IMAGE_V2_PROMPTS.qwenOutfit.system : ""
].filter(Boolean).join(" ");

const outfitPhrase = s => phrase(s).replace(/^wearing\s+/i, "").replace(/\.$/, "");

/** @returns {Array<{ name: string, outfit: string, parts?: object }>} */
export function parseQwenOutfitBlocks(text) {
    return blocks(text, "Outfit_Qwen")
        .map(b => {
            const name = splitName(b.rawName).name;
            const parts = parseRegionLines(b.body, OUTFIT_REGIONS, { phrases: true });
            if (parts) {
                for (const r of OUTFIT_REGIONS) parts[r] = outfitPhrase(parts[r]);
                return { name, outfit: joinRegions(parts, OUTFIT_REGIONS), parts };
            }
            return { name, outfit: outfitPhrase(b.body) };
        })
        .filter(x => x.name && x.outfit);
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
        // Exact name or nickname first; then the one character the name
        // starts or is started by ("Koromi Hazami" asked for as "Koromi").
        const people = Object.fromEntries(targets.map((t, i) => [i, t]));
        const loose = [s.name, ...(s.aliases || [])].map(n => whoIs(people, n)).find(i => i !== null);
        const t = targets.find(t => [t.name, ...(t.aliases || [])].map(k).some(n => said.includes(n)))
            || (loose != null ? targets[loose] : undefined);
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
        if (s.regions) item.regions = s.regions;
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
    // Tags made before plan 027 have no parts: made again, by part.
    if (!cached.regions) return null;
    return cached.from === outfitHash(outfitText) ? cached.tags : null;
}

// Raised when the Qwen look or outfit texts change, so descriptions made with
// the old texts are made again (2: no "and nothing else" in outfits).
const QWEN_TEXTS_VERSION = 3;   // 3: described part by part (plan 027)

/** What a Qwen description was made from: the source text and the texts' version. */
export const qwenFrom = source => `q${QWEN_TEXTS_VERSION}:${outfitHash(source)}`;

/** A Qwen description ({ from, text }) still made from this source text, or null. */
export function freshQwenText(cached, source) {
    const e = freshQwenEntry(cached, source);
    return e ? e.text : null;
}

/** The same, with its parts: { text, parts } or null. */
export function freshQwenEntry(cached, source) {
    if (!cached || !String(cached.text || "").trim()) return null;
    if (cached.from !== qwenFrom(source)) return null;
    return { text: cached.text, parts: cached.parts || null };
}

export const OUTFIT_SYSTEM = "You turn clothing descriptions into booru tags for an image model.";

// Plan 027: where each garment is worn.
export const OUTFIT_REGION_GUIDE = [
    "Head: hats, glasses, earrings, masks, hair accessories.",
    "Upper: tops, jackets, dresses, bras, anything on the arms or hands, and badges or necklaces on the chest.",
    "Lower: skirts, shorts, trousers, underwear, belts, tights and stockings.",
    "Feet: socks, shoes, anklets."
];

const OUTFIT_SHAPE = [
    "<Outfit_Tags name=\"Name\">",
    "Head:",
    "Upper: tag, tag",
    "Lower: tag",
    "Feet: tag",
    "</Outfit_Tags>"
];

/** @param {Array<{ name: string, outfit: string }>} items */
export function renderOutfitTagsPrompt(items) {
    return [
        "Turn each outfit into booru clothing tags, sorted by where they are worn:",
        ...OUTFIT_REGION_GUIDE,
        "- A garment that covers several of these goes on the highest one: a dress or a long coat goes on Upper.",
        "- Main garments only, 3 to 6 tags in all: one tag per garment, with its colour or material when the text gives one (\"grey hoodie, black joggers, white socks\"), plus one standout accessory if there is one. \"oversized pink sweater\" is one tag, never \"pink sweater, cable knit sweater, oversized sweater\".",
        "- Plain over detailed: \"white bra\", not \"lace-trimmed bra, front bow, white trim, drawstring\". Name a print only when it is simple, and put it in the garment's own tag: \"white cat print bra\", not \"white bra, cat print bra\".",
        "- Keep the state of dress when the text says it, on the line it belongs to: \"Upper: open jacket, sleeves rolled up\", \"Upper: topless\", \"Feet: barefoot\".",
        "- Leave a line empty when the text says nothing about it.",
        "- Only clothing and accessories: no hair, body, expression, pose, count tags or quality tags. Add nothing the text does not say.",
        `- ${IMAGE_V2_PROMPTS.tagsInEnglish}`,
        "",
        ...items.map(i => `${i.name}: ${i.outfit}`),
        "",
        "Output one block per character and nothing else:",
        ...OUTFIT_SHAPE
    ].join("\n");
}

/** @returns {Array<{ name: string, tags: string }>} */
export function parseOutfitBlocks(text) {
    return blocks(text, "Outfit_Tags")
        .map(b => {
            const name = splitName(b.rawName).name;
            const regions = parseRegionLines(b.body, OUTFIT_REGIONS);
            if (regions) return { name, tags: joinRegions(regions, OUTFIT_REGIONS), regions };
            return { name, tags: dedupeTags(stripCountTags(splitTags(b.body.replace(/\s*\n\s*/g, ", ").replace(/^["'\s]+|["'\s]+$/g, "")).join(", "))) };
        })
        .filter(x => x.name && x.tags);
}
