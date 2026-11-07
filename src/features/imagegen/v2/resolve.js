// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 — @Name substitution.
//
// The model writes who is in the shot as @Name; this puts in each character's
// stored look and current outfit, word for word, every time. That is the whole
// point of V2: the ~70% of the prompt that describes the characters never
// passes through the model, so it cannot drift.
//
//   @Aqua          → look, then outfit. The only placeholder the model is given:
//                    the outfit always comes from World State, never from the
//                    model, so it cannot drift between images.
//   @Aqua.look / @Aqua.outfit, if a model writes them anyway, are read as plain
//   @Aqua (the suffix is swallowed so it never reaches ComfyUI).
//
// Line layout (plan 007): the model writes one line per character,
// "On the left is @Mira. She sits…". There @Mira becomes
// "Mira, <look>, wearing a <outfit>": the name anchors the character and
// "wearing a" marks where the look ends, so the image model keeps each
// character's tags with that character. An old flat tag line ("1girl, @Mira,
// laughing") still resolves the old way: tags only, deduplicated.
//
// Levels (plan 027): @Mira:face, :upper, :waist, :full (and :nude) hand in
// only the parts of the look and outfit the frame shows. A plain @Mira takes
// its level from the framing in the prompt's opening (else full). A look or
// outfit not sorted by body part goes in whole (the body tags only from
// :waist down).
//
// Pure: no SillyTavern, no DOM. The caller builds the cast.

import { readLevel, framingLevel, lookPartsFor, outfitPartsFor, joinRegions } from "./regions.js";
// ────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CastMember
 * @property {string}   name
 * @property {string[]} [aliases]   nicknames that also resolve (@Matt → Matthew)
 * @property {string}   [look]      appearance tags that show in any shot ("long blue hair, blue eyes")
 * @property {string}   [body]      build and proportions, full-body shots only ("wide hips, long legs")
 * @property {string}   [lookNatural] appearance as a phrase, for Natural style
 * @property {string}   [outfit]    current outfit (World State text, or outfit tags)
 */

// Count and focus tags belong to the model, which writes them once at the front.
// Inside a stored look they would repeat or land mid-prompt, so they come out.
const COUNT_TAG = /^(?:\d+\+?\s*(?:girls?|boys?|others?|males?|females?)|solo|solo focus|multiple (?:girls|boys|others)|(?:male|female|other) focus|no humans)$/i;

const PART_SYNONYMS = {
    look: "look", looks: "look", appearance: "look", body: "look", face: "look",
    outfit: "outfit", clothes: "outfit", clothing: "outfit", attire: "outfit", wearing: "outfit"
};

const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/** Splits a tag string on commas that are not inside ( ) or [ ] weights. */
export function splitTags(text) {
    const out = [];
    let depth = 0;
    let cur = "";
    for (const ch of String(text || "")) {
        if (ch === "(" || ch === "[" || ch === "{") depth++;
        else if ((ch === ")" || ch === "]" || ch === "}") && depth > 0) depth--;
        if (ch === "," && depth === 0) {
            if (cur.trim()) out.push(cur.trim());
            cur = "";
        } else {
            cur += ch;
        }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/** A stored look with the count/focus tags taken out. */
export function stripCountTags(look) {
    return splitTags(look).filter(t => !COUNT_TAG.test(t.replace(/^\(|\)$|:[\d.]+\)?$/g, "").trim())).join(", ");
}

/** Keeps the first of each tag (case-insensitive), in order. */
export function dedupeTags(text) {
    const seen = new Set();
    const out = [];
    for (const t of splitTags(text)) {
        const k = norm(t);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(t);
    }
    return out.join(", ");
}

// Every name and nickname, longest first, so "@Lady Darkness" beats "@Lady".
function nameIndex(cast) {
    const entries = [];
    for (const c of cast || []) {
        if (!c || !c.name) continue;
        for (const n of [c.name, ...(c.aliases || [])]) {
            const k = norm(n);
            if (k) entries.push({ key: k, len: k.length, member: c });
        }
    }
    return entries.sort((a, b) => b.len - a.len);
}

const isNameChar = ch => /[\p{L}\p{N}_'-]/u.test(ch || "");

// "@Matthew's hand": a possessive ends the name.
const POSSESSIVE = /^['’]s(?![\p{L}\p{N}])/u;
const endsName = (text, at) => !isNameChar(text[at]) || POSSESSIVE.test(text.slice(at));

// Index just past a "( … )" starting at `at`, or -1 when it is not closed.
function skipParens(text, at) {
    if (text[at] !== "(") return -1;
    let depth = 0;
    for (let j = at; j < text.length; j++) {
        if (text[j] === "(") depth++;
        else if (text[j] === ")" && --depth === 0) return j + 1;
    }
    return -1;
}

/**
 * Replaces every @Name in an image prompt.
 * @param {string} prompt
 * @param {{ cast: CastMember[], style?: "tags"|"natural" }} opts
 * @returns {{ prompt: string, filled: Array<{name: string, part: string}>, unknown: string[], noLook: string[] }}
 */
export function resolveImagePrompt(prompt, { cast = [], style = "tags" } = {}) {
    if (style === "qwen") return resolveQwenPrompt(prompt, cast);
    if (style === "krea") return resolveKreaPrompt(prompt, cast);
    const text = String(prompt || "");
    const index = nameIndex(cast);
    const defaultLevel = framingLevel(openingOf(text), text);
    const layout = style === "natural" || isLineLayout(text);
    const lower = text.toLowerCase();
    const filled = [];
    const unknown = [];
    const noLook = [];
    // Only a character's FIRST mention carries their look and outfit. A model
    // that writes @Name again ("@Kazuma holding @Matthew's hand") would
    // otherwise paste the whole tag set in two or three times.
    const seen = new Map();   // name → Set of parts already put in ("look", "outfit")
    let out = "";
    let i = 0;

    while (i < text.length) {
        const at = text.indexOf("@", i);
        if (at < 0) { out += text.slice(i); break; }
        out += text.slice(i, at);
        // An @ inside a word (an email address, "user@host") is not a placeholder.
        if (at > 0 && isNameChar(text[at - 1])) { out += "@"; i = at + 1; continue; }

        // The longest known name that starts here and ends on a word boundary.
        let hit = null;
        for (const e of index) {
            const cand = lower.slice(at + 1, at + 1 + e.len).replace(/\s+/g, " ");
            if (cand === e.key && endsName(text, at + 1 + e.len)) { hit = e; break; }
        }

        let end;
        let member = null;
        let displayName;
        if (hit) {
            member = hit.member;
            end = at + 1 + hit.len;
            displayName = member.name;
        } else {
            // Unknown: one word. It becomes the plain word, never a raw "@".
            let j = at + 1;
            while (j < text.length && isNameChar(text[j])) j++;
            if (j === at + 1) { out += "@"; i = at + 1; continue; }
            displayName = text.slice(at + 1, j);
            end = j;
            unknown.push(displayName);
        }

        // Optional level (":waist", ":full:nude"), possessive, then .look / .outfit
        let lv = readLevel(text.slice(end));
        end += lv.length;
        let possessive = "";
        const pos = text.slice(end).match(POSSESSIVE);
        if (pos) { possessive = pos[0]; end += pos[0].length; }
        if (!lv.length) { lv = readLevel(text.slice(end)); end += lv.length; }
        const frame = { level: lv.level || defaultLevel, nude: lv.nude };
        const part = "all";
        const suffix = text.slice(end).match(/^\.([A-Za-z]+)/);
        if (suffix && PART_SYNONYMS[suffix[1].toLowerCase()]) end += suffix[0].length;

        // Tags: clothing or looks stuck straight onto @Name(…) are the model
        // redescribing what @Name already carries; they go.
        if (style === "tags" && member) {
            const after = skipParens(text, end);
            if (after > 0) end = after;
        }

        if (!member) {
            out += displayName + (layout ? possessive : "");
        } else if (coveredAlready(seen, member.name, part)) {
            // A repeat: nothing in a flat tag line (a name means nothing to the
            // image model), the plain name in sentences so they still read.
            out += layout ? member.name + possessive : "";
        } else if (layout && possessive && !seen.has(member.name)) {
            // "@Theo's hand" as the first mention: keep the sentence; the
            // description waits for a plain mention (or is left out).
            out += member.name + possessive;
        } else {
            // Only the parts not put in yet: "@Aqua.look … @Aqua.outfit" keeps
            // both, "@Aqua … @Aqua" keeps one copy.
            const done = seen.get(member.name) || new Set();
            const want = part === "all" ? ["look", "outfit"] : [part];
            const missing = want.filter(x => !done.has(x));
            const renderPart = missing.length === 2 ? "all" : missing[0];
            missing.forEach(x => done.add(x));
            seen.set(member.name, done);
            out += layout
                ? renderInLine(member, renderPart, style, noLook, frame, /^\s*[A-Za-z]/.test(text.slice(end)))
                : renderMember(member, renderPart, style, noLook, frame);
            filled.push({ name: member.name, part: renderPart, level: frame.level, ...(frame.nude ? { nude: true } : {}) });
        }
        i = end;
    }

    let result = out;
    if (layout) {
        result = result.split("\n")
            .map(l => l.replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/,\s*\./g, ".").replace(/[ \t]{2,}/g, " ").trim())
            .join("\n").replace(/\n{3,}/g, "\n\n").trim();
    } else if (style === "tags") {
        result = dedupeTags(splitTags(result).map(t => t.replace(/\s{2,}/g, " ").trim()).join(", "));
    } else {
        result = result.replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/[ \t]{2,}/g, " ").trim();
    }
    return { prompt: result, filled, unknown, noLook };
}

// ── Qwen Image (plan 026) ────────────────────────────────────────────────
// One long paragraph. @Name becomes the character's description with no name
// (Qwen doesn't know names): "On the left sits @Mira." → "On the left sits a
// slender young woman with …, wearing …". The guide asks for @Name once, where
// the character stands; a model that also writes it in the opening sentence
// or later gets the short form there ("a young woman in her twenties", "the
// young woman's"), and the full description stays where they stand.

const SEX_NOUN = { female: "a woman", male: "a man" };

// The description's head: "a young woman in her early twenties" from
// "a young woman in her early twenties with fair skin, …".
function qwenShort(m) {
    const d = String(m.lookQwen || m.lookNatural || "").trim();
    const head = d.split(/\s+with\s+|,|\s+who\s+/i)[0].trim();
    return /^(a|an)\s/i.test(head) ? head : (SEX_NOUN[m.sex] || "a person");
}

// "the young woman": the head without what follows its noun.
const qwenThe = short => short.replace(/^(a|an)\s+/i, "the ").split(/\s+(?:in|of|from|at)\s+/i)[0];

function qwenFull(m, frame) {
    const parts = lookPartsFor(frame.level);
    const tags = lookAt(m, frame.level);
    // Described part by part: the parts the level shows. An older whole
    // description goes in whole.
    const desc = (m.lookQwenParts ? joinRegions(m.lookQwenParts, parts) : "")
        || String(m.lookQwen || m.lookNatural || "").trim()
        || (tags ? `${SEX_NOUN[m.sex] || "a person"} with ${tags}` : (SEX_NOUN[m.sex] || "a person"));
    return [desc, wearingPhrase(outfitAt(m, frame, m.outfitQwenParts || m.outfitRegions))].filter(Boolean).join(", ");
}

// Every @Name in a paragraph: where it sits, who it is, its level and possessive.
function findMentions(text, cast) {
    const index = nameIndex(cast);
    const lower = text.toLowerCase();
    const tokens = [];
    for (let i = text.indexOf("@"); i >= 0; i = text.indexOf("@", i + 1)) {
        if (i > 0 && isNameChar(text[i - 1])) continue;
        const hit = index.find(e => lower.slice(i + 1, i + 1 + e.len).replace(/\s+/g, " ") === e.key && endsName(text, i + 1 + e.len));
        let end;
        let member = null;
        let word = "";
        if (hit) { member = hit.member; end = i + 1 + hit.len; }
        else {
            let j = i + 1;
            while (j < text.length && isNameChar(text[j])) j++;
            if (j === i + 1) continue;
            word = text.slice(i + 1, j);
            end = j;
        }
        let lv = readLevel(text.slice(end));
        end += lv.length;
        const pos = text.slice(end).match(POSSESSIVE);
        const possessive = pos ? pos[0] : "";
        if (pos) end += pos[0].length;
        if (!lv.length) { lv = readLevel(text.slice(end)); end += lv.length; }
        const suffix = text.slice(end).match(/^\.([A-Za-z]+)/);
        if (suffix && PART_SYNONYMS[suffix[1].toLowerCase()]) end += suffix[0].length;
        tokens.push({ at: i, end, member, word, possessive, level: lv.level, nude: lv.nude });
        i = end - 1;
    }
    return tokens;
}

/** @returns {{ prompt: string, filled: Array<{name: string, part: string}>, unknown: string[], noLook: string[] }} */
export function resolveQwenPrompt(prompt, cast = []) {
    const text = String(prompt || "");
    const tokens = findMentions(text, cast);

    // The opening sentence ends at the first full stop outside a @Name ("@Dr. Patel").
    let masked = text;
    for (const t of tokens) masked = masked.slice(0, t.at) + "x".repeat(t.end - t.at) + masked.slice(t.end);
    const stop = masked.search(/[.!?](\s|$)/);
    const openEnd = stop < 0 ? text.length : stop + 1;
    const defaultLevel = framingLevel(text.slice(0, openEnd));

    // Each character's full description goes on their first plain mention
    // after the opening sentence, else on their first plain mention.
    const fullAt = new Map();
    for (const t of tokens) {
        if (!t.member || t.possessive || fullAt.has(t.member)) continue;
        if (t.at >= openEnd) fullAt.set(t.member, t);
    }
    for (const t of tokens) {
        if (t.member && !t.possessive && !fullAt.has(t.member)) fullAt.set(t.member, t);
    }

    const filled = [];
    const unknown = [];
    const noLook = [];
    let out = "";
    let i = 0;
    for (const t of tokens) {
        out += text.slice(i, t.at);
        let rep;
        if (!t.member) {
            unknown.push(t.word);
            rep = t.word + t.possessive;
        } else if (fullAt.get(t.member) === t) {
            const m = t.member;
            if (!String(m.look || m.body || m.lookQwen || m.lookNatural || "").trim() && !noLook.includes(m.name)) noLook.push(m.name);
            // The level written on any of their mentions, else the framing's.
            const own = tokens.find(x => x.member === m && x.level);
            const frame = { level: (t.level || (own && own.level)) || defaultLevel, nude: tokens.some(x => x.member === m && x.nude) };
            rep = qwenFull(m, frame);
            filled.push({ name: m.name, part: "all", level: frame.level, ...(frame.nude ? { nude: true } : {}) });
        } else {
            const full = fullAt.get(t.member);
            const short = qwenShort(t.member);
            rep = t.possessive ? `${qwenThe(short)}'s` : (full && full.at < t.at ? qwenThe(short) : short);
        }
        // A sentence that starts on the description starts with a capital.
        if (/(^|[.!?]\s+)$/.test(out)) rep = rep.charAt(0).toUpperCase() + rep.slice(1);
        out += rep;
        i = t.end;
    }
    out += text.slice(i);
    const result = out.replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/,\s*\./g, ".").replace(/[ \t]{2,}/g, " ").trim();
    return { prompt: result, filled, unknown, noLook };
}

// ── Krea 2 (plan 027) ────────────────────────────────────────────────────
// One short paragraph. The model writes each character as "On the left,
// Mira, laughing, @Mira:waist, sitting…": the name and the expression come
// before @Name (written after the look, Krea left the face blank). @Name
// becomes "a young woman (look tags), wearing …" with no name, since the name
// is already there. Only the first plain mention carries the look; later ones
// and possessives become the name.

/** "a young woman" from a character's sex and age tags. */
export function personNoun(m, tags = "") {
    const t = `, ${String(tags || "").toLowerCase()}, `;
    const sex = m.sex || (/[, ](female|woman|girl)[, ]/.test(t) ? "female" : /[, ](male|man|boy)[, ]/.test(t) ? "male" : "");
    const noun = sex === "female" ? "woman" : sex === "male" ? "man" : "person";
    if (/, (old woman|old man|elderly)[, ]/.test(t)) return `an old ${noun}`;
    if (/, (young adult|teenage|teen)[, ]/.test(t)) return `a young ${noun}`;
    return `a ${noun}`;
}

function kreaFull(m, frame) {
    const tags = lookAt(m, frame.level);
    const who = tags ? `${personNoun(m, tags)} (${tags})` : personNoun(m);
    return [who, wearingPhrase(outfitAt(m, frame))].filter(Boolean).join(", ");
}

/** @returns {{ prompt: string, filled: Array<{name: string, part: string}>, unknown: string[], noLook: string[] }} */
export function resolveKreaPrompt(prompt, cast = []) {
    const text = String(prompt || "");
    const tokens = findMentions(text, cast);
    const defaultLevel = framingLevel(openingOf(text), text);
    const fullAt = new Map();
    for (const t of tokens) if (t.member && !t.possessive && !fullAt.has(t.member)) fullAt.set(t.member, t);

    const filled = [];
    const unknown = [];
    const noLook = [];
    let out = "";
    let i = 0;
    for (const t of tokens) {
        out += text.slice(i, t.at);
        let rep;
        if (!t.member) {
            unknown.push(t.word);
            rep = t.word + t.possessive;
        } else if (fullAt.get(t.member) === t) {
            const m = t.member;
            if (!lookAt(m, "full") && !noLook.includes(m.name)) noLook.push(m.name);
            const own = tokens.find(x => x.member === m && x.level);
            const frame = { level: (t.level || (own && own.level)) || defaultLevel, nude: tokens.some(x => x.member === m && x.nude) };
            rep = kreaFull(m, frame);
            filled.push({ name: m.name, part: "all", level: frame.level, ...(frame.nude ? { nude: true } : {}) });
        } else {
            rep = t.member.name + t.possessive;
        }
        if (/(^|[.!?]\s+)$/.test(out)) rep = rep.charAt(0).toUpperCase() + rep.slice(1);
        out += rep;
        i = t.end;
    }
    out += text.slice(i);
    const result = out.replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/,\s*\./g, ".").replace(/[ \t]{2,}/g, " ").trim();
    return { prompt: result, filled, unknown, noLook };
}

/**
 * A prompt in the line layout: "… is @Name." lines, or several lines. A single
 * flat line of tags is the old layout.
 */
export function isLineLayout(text) {
    const s = String(text || "").trim();
    return /\bis\s+@/i.test(s) || /\n/.test(s);
}

/** "wearing a grey hoodie": the article from the first word; states of dress go as they are. */
export function wearingPhrase(outfit) {
    const o = String(outfit || "").trim().replace(/^wearing\s+/i, "");
    if (!o) return "";
    if (/^(naked|nude|topless|bottomless|barefoot|shirtless)\b/i.test(o)) return o;
    if (/^(a|an|the|his|her|their|nothing|no|only)\b/i.test(o)) return `wearing ${o}`;
    return `wearing ${/^[aeiou]/i.test(o) ? "an" : "a"} ${o}`;
}

// The prompt's opening: its first line, or its first sentence on one line.
function openingOf(text) {
    const first = String(text || "").trim().split("\n")[0];
    const stop = first.search(/[.!?](\s|$)/);
    return stop < 0 ? first : first.slice(0, stop + 1);
}

/** The look tags a level shows: the sorted parts, or the old two parts. */
function lookAt(m, level) {
    if (m.lookRegions) return stripCountTags(joinRegions(m.lookRegions, lookPartsFor(level)));
    const withBody = level === "waist" || level === "full";
    return stripCountTags([m.look, withBody ? m.body : ""].filter(s => String(s || "").trim()).join(", "));
}

/** The outfit a level shows; "nude" with :nude. Unsorted outfits go in whole. */
function outfitAt(m, frame, parts = m.outfitRegions) {
    if (frame.nude) return "nude";
    if (parts) return joinRegions(parts, outfitPartsFor(frame.level));
    return String(m.outfit || "").trim();
}

/**
 * A character in the line layout: "Mira, <look>, wearing a <outfit>".
 * When a verb follows ("@Mira sits…") a closing comma keeps the sentence readable.
 */
function renderInLine(m, part, style, noLook, frame, wordFollows) {
    const lookTags = lookAt(m, frame.level);
    if (!lookTags && !m.body && !m.lookNatural && part !== "outfit" && !noLook.includes(m.name)) noLook.push(m.name);
    const look = style === "natural" ? (String(m.lookNatural || "").trim() || lookTags) : lookTags;
    const wearing = wearingPhrase(outfitAt(m, frame));
    const bits = [m.name];
    if (part !== "outfit" && look) bits.push(look);
    if (part !== "look" && wearing) bits.push(wearing);
    const s = bits.join(", ");
    return bits.length > 1 && wordFollows ? `${s},` : s;
}

function coveredAlready(seen, name, part) {
    const done = seen.get(name);
    if (!done) return false;
    const want = part === "all" ? ["look", "outfit"] : [part];
    return want.every(x => done.has(x));
}

function renderMember(m, part, style, noLook, frame = { level: "full", nude: false }) {
    const lookTags = lookAt(m, frame.level);
    const outfit = outfitAt(m, frame);
    if (!lookTags && !m.body && !m.lookNatural && part !== "outfit" && !noLook.includes(m.name)) noLook.push(m.name);

    if (style === "natural") {
        // "Aqua (a slender young woman…, wearing a blue dress) leans on the bar":
        // the description sits in parentheses so the sentence around @Name still
        // reads. Natural-language models give parentheses no weight meaning.
        const desc = String(m.lookNatural || "").trim() || lookTags;
        if (part === "outfit") return outfit === "nude" ? outfit : outfit ? `wearing ${outfit}` : "";
        const bits = [];
        if (desc) bits.push(desc);
        if (part === "all" && outfit) bits.push(outfit === "nude" ? outfit : `wearing ${outfit}`);
        return bits.length ? `${m.name} (${bits.join(", ")})` : m.name;
    }

    // Tags: the look and outfit ARE the tags; the name goes nowhere, since an
    // image model draws a character from tags, not from a name it never saw.
    if (part === "look") return lookTags || m.name;
    if (part === "outfit") return outfit;
    const bits = [lookTags, outfit].filter(Boolean);
    return bits.length ? bits.join(", ") : m.name;
}
