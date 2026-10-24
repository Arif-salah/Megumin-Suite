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
// Body tags (a member's `body`) go in only when the prompt frames the body
// (full body, wide shot, cowboy shot…): in a close-up they would pull the image
// toward a full figure.
//
// Pure: no SillyTavern, no DOM. The caller builds the cast.

import { framingShowsBody } from "./lookParts.js";
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
    const text = String(prompt || "");
    const index = nameIndex(cast);
    const showBody = framingShowsBody(text);
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

        // Optional possessive, then optional .look / .outfit
        let possessive = "";
        const pos = text.slice(end).match(POSSESSIVE);
        if (pos) { possessive = pos[0]; end += pos[0].length; }
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
                ? renderInLine(member, renderPart, style, noLook, showBody, /^\s*[A-Za-z]/.test(text.slice(end)))
                : renderMember(member, renderPart, style, noLook, showBody);
            filled.push({ name: member.name, part: renderPart });
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

/**
 * A character in the line layout: "Mira, <look>, wearing a <outfit>".
 * When a verb follows ("@Mira sits…") a closing comma keeps the sentence readable.
 */
function renderInLine(m, part, style, noLook, showBody, wordFollows) {
    const lookTags = stripCountTags([m.look, showBody ? m.body : ""].filter(s => String(s || "").trim()).join(", "));
    if (!lookTags && !m.body && !m.lookNatural && part !== "outfit" && !noLook.includes(m.name)) noLook.push(m.name);
    const look = style === "natural" ? (String(m.lookNatural || "").trim() || lookTags) : lookTags;
    const wearing = wearingPhrase(m.outfit);
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

function renderMember(m, part, style, noLook, showBody = false) {
    const lookTags = stripCountTags([m.look, showBody ? m.body : ""].filter(s => String(s || "").trim()).join(", "));
    const outfit = String(m.outfit || "").trim();
    if (!lookTags && !m.body && !m.lookNatural && part !== "outfit" && !noLook.includes(m.name)) noLook.push(m.name);

    if (style === "natural") {
        // "Aqua (a slender young woman…, wearing a blue dress) leans on the bar":
        // the description sits in parentheses so the sentence around @Name still
        // reads. Natural-language models give parentheses no weight meaning.
        const desc = String(m.lookNatural || "").trim() || lookTags;
        if (part === "outfit") return outfit ? `wearing ${outfit}` : "";
        const bits = [];
        if (desc) bits.push(desc);
        if (part === "all" && outfit) bits.push(`wearing ${outfit}`);
        return bits.length ? `${m.name} (${bits.join(", ")})` : m.name;
    }

    // Tags: the look and outfit ARE the tags; the name goes nowhere, since an
    // image model draws a character from tags, not from a name it never saw.
    if (part === "look") return lookTags || m.name;
    if (part === "outfit") return outfit;
    const bits = [lookTags, outfit].filter(Boolean);
    return bits.length ? bits.join(", ") : m.name;
}
