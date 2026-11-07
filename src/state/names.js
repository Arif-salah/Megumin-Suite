// ────────────────────────────────────────────────────────────────────────────
// One name finder for every module (plan 022): World State's cast, Bonds and
// Image V2's cast all find a character the same way.
//
//   people: { key: { name, aliases? } }   (any record with a name)
//
// whoIs, in this order, stopping at the first step that finds anyone:
//   1. the name, a nickname, or a name in brackets ("Dominic" for
//      "Dom (Dominic Morin)"), possessives dropped ("Chloe's")
//   2. the one character whose name starts this one or is started by it, in
//      whole words ("Matt" ↔ "Matt Reyes", "Resha Helios" ↔ "Resha")
//   3. only with { nickname: true }: the one first name this starts ("Cat"
//      for Cathleen), for names we know are in the scene
// Two characters at one step → nobody: a name is never guessed between two.
// A surname alone never picks anyone here ("Emma" is not "Uncle Emma"); it
// only counts in namedIn, where it brings someone's details into the prompt.
// Pure: runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

/** Lowercase words, possessives dropped, every other mark a space. */
export function nameWords(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/[’‘`´]/g, "'")
        .replace(/(\p{L})'s\b/gu, "$1")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

// Every full spelling of a character: name, nicknames, the name with and
// without its brackets, and the name in brackets.
function formsOf(rec, { aliases = true } = {}) {
    const out = new Set();
    for (const raw of [rec && rec.name, ...((aliases && rec && rec.aliases) || [])]) {
        const s = String(raw || "");
        for (const f of [s, s.replace(/\([^)]*\)/g, " "), ...(s.match(/\(([^)]+)\)/g) || []).map(x => x.slice(1, -1))]) {
            const w = nameWords(f);
            if (w) out.add(w);
        }
    }
    return [...out];
}

// "resha" starts "resha helios" in whole words (either way round).
function prefixOf(a, b) {
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    return short.length > 2 && short !== long && long.startsWith(short + " ");
}

// The last word of a name with two or more words, brackets left out.
function surnameOf(name) {
    const w = nameWords(String(name || "").replace(/\([^)]*\)/g, " ")).split(" ").filter(Boolean);
    const last = w.length >= 2 ? w[w.length - 1] : "";
    return last.length > 2 ? last : "";
}

function only(hits) {
    const u = [...new Set(hits)];
    return u.length === 1 ? u[0] : u.length ? undefined : null;
}

/**
 * The key of the character a name refers to, or null.
 * @param {Record<string, {name: string, aliases?: string[]}>} people
 * @param {string} name
 * @param {{ nickname?: boolean, exactOnly?: boolean }} [opts]
 * @returns {string|null}
 */
export function whoIs(people, name, opts = {}) {
    const n = nameWords(name);
    if (!n || !people) return null;
    const entries = Object.entries(people).filter(([, r]) => r && r.name);
    const forms = entries.map(([k, r]) => [k, formsOf(r), formsOf(r, { aliases: false })]);
    const steps = [
        () => forms.filter(([, f]) => f.includes(n)).map(([k]) => k),
        // A shorter name finds a longer one ("Matt" → Matt Reyes, by name or
        // nickname). A longer name only finds the character whose OWN name
        // starts it ("Resha Helios" → Resha): a nickname "Matt" never makes
        // "Matt Cole" the same person as Matt Reyes.
        () => forms.filter(([, f, own]) => f.some(x => prefixOf(x, n) && (n.length < x.length || own.includes(x)))).map(([k]) => k),
        () => !opts.nickname || n.length < 3 || n.includes(" ") ? [] : entries.filter(([, r]) => {
            const first = nameWords(r.name).split(" ")[0];
            return first !== n && first.startsWith(n);
        }).map(([k]) => k)
    ];
    for (const step of opts.exactOnly ? steps.slice(0, 1) : steps) {
        const hit = only(step());
        if (hit === undefined) return null;   // two people fit: don't guess
        if (hit) return hit;
    }
    return null;
}

/**
 * The characters a text names: a full spelling or a first name, and a surname
 * when only one character has it ("Cairns" could be Duncan or Cathleen).
 * @param {string} text
 * @param {Record<string, {name: string, aliases?: string[]}>} people
 * @returns {string[]} keys, in the order of `people`
 */
export function namedIn(text, people) {
    const t = ` ${nameWords(text)} `;
    if (t.length <= 2) return [];
    const entries = Object.entries(people || {}).filter(([, r]) => r && r.name);
    const surnames = {};
    for (const [k, r] of entries) {
        const sn = surnameOf(r.name);
        if (sn) (surnames[sn] = surnames[sn] || []).push(k);
    }
    const out = [];
    for (const [k, r] of entries) {
        // A whole name counts from two letters ("Jo"); part of one from three.
        const names = new Set();
        for (const f of formsOf(r)) {
            if (f.length > 1) names.add(f);
            const first = f.split(" ")[0];
            if (first.length > 2) names.add(first);
        }
        const sn = surnameOf(r.name);
        if (sn && surnames[sn].length === 1) names.add(sn);
        if ([...names].some(x => t.includes(` ${x} `))) out.push(k);
    }
    return out;
}

// Something an older reply saved as a character that is no name: a
// possessive with more after it ("Celeste's couriered four-page grievance"),
// or more than four words. Kept on file, never handed to the story as a name.
function looksLikeName(name) {
    const s = String(name || "").replace(/\([^)]*\)/g, " ").trim();
    if (/\p{L}['’]s\s+\S/u.test(s)) return false;
    return s.split(/\s+/).filter(Boolean).length <= 4;
}

/**
 * The names for <Known_Names> (plan 022): every character on file, once,
 * joined across modules by whoIs, written the simplest way that finds only
 * them. Those in the scene first, then the most recently seen.
 * @param {Array<{ name: string, aliases?: string[], seen?: number }>} sources  World State's cast first, then Bonds
 * @param {{ first?: string[], cap?: number }} [opts]  first: names in the scene
 * @returns {string[]}
 */
export function knownNameList(sources, { first = [], cap = 30 } = {}) {
    const people = {};
    let n = 0;
    for (const s of sources || []) {
        if (!s || !String(s.name || "").trim() || !looksLikeName(s.name)) continue;
        const k = whoIs(people, s.name) || [s.name, ...(s.aliases || [])].map(a => whoIs(people, a, { exactOnly: true })).find(Boolean);
        if (k) {
            const rec = people[k];
            rec.seen = Math.max(rec.seen, s.seen || 0);
            for (const a of [s.name, ...(s.aliases || [])]) if (!formsOf(rec).includes(nameWords(a))) rec.aliases.push(a);
            continue;
        }
        people[`p${n++}`] = { name: s.name, aliases: [...(s.aliases || [])], seen: s.seen || 0 };
    }
    const inScene = new Set(first.map(f => whoIs(people, f, { nickname: true })).filter(Boolean));
    return Object.keys(people)
        .sort((a, b) => (inScene.has(b) - inScene.has(a)) || (people[b].seen - people[a].seen))
        .slice(0, cap)
        .map(k => shortName(people, k));
}

/**
 * The simplest way to write a character that finds them and nobody else:
 * their first name, else their full name, else a nickname. "Lona", but
 * "Matt Reyes" when there is also a Matt Cole.
 * @returns {string} as written in their name or nickname
 */
export function shortName(people, key) {
    const rec = people && people[key];
    if (!rec || !rec.name) return "";
    const plain = s => String(s || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const full = plain(rec.name);
    const tries = [full.split(" ")[0], full, ...(rec.aliases || []).map(plain), rec.name];
    // Not a name that also starts someone else's: with a Matt Cole around,
    // Matt Reyes is "Matt Reyes" even when "Matt" is his nickname.
    const clash = x => Object.entries(people).some(([k, r]) => k !== key && formsOf(r).some(f => f === nameWords(x) || f.startsWith(nameWords(x) + " ")));
    return tries.find(x => x && x.length > 2 && whoIs(people, x) === key && !clash(x)) || rec.name;
}
