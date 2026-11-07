// ────────────────────────────────────────────────────────────────────────────
// Stat blocks model (plan 008).
//
//   Bonds:  { people: { key: { name, fields: { key: Field }, seq } } }
//   Sheet:  { fields: { key: Field }, seq }
//   Latest: { text, seq }
//   Field:  { label, text, value?, max? }
//
// A value as written wins; a bare change ("+5") moves the value on file. Nobody
// is ever dropped: a character who leaves keeps their bonds for when they return.
// Pure: runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

import { statKey } from "./parse.js";
import { whoIs, namedIn, nameWords } from "../../names.js";

export { nameWords };

export const emptyBonds = () => ({ people: {} });
export const emptySheet = () => ({ fields: {}, seq: 0 });
export const emptyLatest = () => ({ text: "", seq: 0 });

function fieldText(f) {
    return f.max !== undefined ? `${f.value}/${f.max}` : f.value !== undefined ? String(f.value) : f.text;
}

// One field's new value on top of the old one. Returns the change for the card, or null.
// { remove: true } (an editor field cleared) takes the field off.
function applyField(target, f) {
    const before = target[f.key];
    if (f.remove) {
        if (!before) return null;
        delete target[f.key];
        return { label: before.label, before: before.text, after: "" };
    }
    let next;
    if (f.value !== undefined) {
        next = { label: f.label, value: f.value, ...(f.max !== undefined ? { max: f.max } : before && before.max !== undefined ? { max: before.max } : {}) };
    } else if (f.delta !== undefined) {
        if (!before || before.value === undefined) return null;   // nothing to move
        let v = before.value + f.delta;
        if (before.max !== undefined) v = Math.max(0, Math.min(before.max, v));
        next = { label: before.label || f.label, value: v, ...(before.max !== undefined ? { max: before.max } : {}) };
    } else {
        next = { label: f.label, text: f.text };
    }
    next.text = fieldText(next);
    target[f.key] = next;
    const b = before ? before.text : "";
    return b === next.text ? null : { label: next.label, before: b, after: next.text };
}

/** Finds the record for a name (state/names.js: exact, then the one character it fits). */
export function findPersonKey(people, name, opts) {
    const k = statKey(name);
    if (people[k]) return k;
    return whoIs(people, name, opts);
}

/**
 * Names in a Bonds block that World State knows under another spelling
 * (plan 022): "Duncan" is Duncan Cairns, 'Matthew "Matt"' is Matthew. Each
 * goes to the bonds already on file for that character, or starts theirs
 * under World State's name. Saved with the reply as `facts.same`.
 * @param {{ people: object }} state  the bonds before the reply
 * @param {{ people?: Array<{ name: string }> }} parsed  the reply's Bonds block
 * @param {object} cast  World State's cast
 * @returns {Record<string, string>} name as written → name to use
 */
export function bondNamesFromCast(state, parsed, cast) {
    const people = (state && state.people) || {};
    const out = {};
    for (const p of (parsed && parsed.people) || []) {
        if (findPersonKey(people, p.name)) continue;
        const ck = whoIs(cast || {}, p.name);
        if (!ck) continue;
        const c = cast[ck];
        const k = [c.name, ...(c.aliases || [])].map(n => findPersonKey(people, n)).find(Boolean);
        const name = k ? people[k].name : c.name;
        if (name !== p.name) out[p.name] = name;
    }
    return out;
}

const bondName = (p, facts) => (facts && facts.same && facts.same[p.name]) || p.name;

/**
 * The characters on file that a reply wrote bonds for without having been
 * handed theirs (someone coming back before the story named them again).
 * Saved with the reply as `facts.unsent`, so a reload decides the same way.
 * @param {{ people: object }} state  the bonds before the reply
 * @param {{ people?: Array<{ name: string }> }} parsed  the reply's Bonds block
 * @param {string[]} handed  record keys the story model was handed
 * @returns {string[]} record keys
 */
export function unsentBondKeys(state, parsed, handed = [], facts) {
    const people = (state && state.people) || {};
    const out = [];
    for (const p of (parsed && parsed.people) || []) {
        const k = findPersonKey(people, bondName(p, facts));
        if (k && !handed.includes(k) && !out.includes(k)) out.push(k);
    }
    return out;
}

/**
 * The names in a Bonds block that keep their bonds handed over next turn: lines
 * that changed something on file, and lines skipped because the story could
 * not see that character. A line copied back unchanged keeps nobody in, so a
 * model that repeats everything it was handed can't hold the list open.
 * @param {{ people: object }} prev  the bonds before that reply
 * @param {{ people?: object[] }} parsed  that reply's Bonds block
 * @param {{ unsent?: string[] }} [facts]  saved with the reply
 * @returns {string[]} names as written
 */
export function movedBondNames(prev, parsed, facts) {
    const unsent = new Set((facts && facts.unsent) || []);
    const people = (prev && prev.people) || {};
    const out = [];
    const same = { same: (facts && facts.same) || {} };
    for (const p of (parsed && parsed.people) || []) {
        const name = bondName(p, facts);
        const k = findPersonKey(people, name);
        if ((k && unsent.has(k)) || applyBonds(prev, { people: [p] }, { facts: same }).applied.length) out.push(name);
    }
    return out;
}

export function applyBonds(prev, parsed, ctx = {}) {
    const state = structuredClone(prev || emptyBonds());
    // A character the story model could not see is skipped: it would have made
    // up fresh numbers over the real ones. The line still names them, so their
    // bonds are handed over next turn and the story adjusts from there.
    const unsent = new Set((ctx.facts && ctx.facts.unsent) || []);
    const applied = [];
    if (!parsed) return { state, applied, notes: [] };
    // The editor's "Forget": the character's bonds go entirely.
    for (const name of parsed.forget || []) {
        const k = findPersonKey(state.people, name);
        if (!k) continue;
        applied.push({ label: state.people[k].name, before: "on file", after: "forgotten" });
        delete state.people[k];
    }
    // "Same person as" on the World State card: the newcomer's bonds join the
    // known character's, the fresher value of each field kept.
    for (const m of parsed.merge || []) {
        const from = findPersonKey(state.people, m.who);
        const to = findPersonKey(state.people, m.into);
        if (!from || from === to) continue;
        const src = state.people[from];
        delete state.people[from];
        if (!to) {
            state.people[statKey(m.into)] = { ...src, name: m.into };
            applied.push({ label: m.into, before: src.name, after: "same person" });
            continue;
        }
        const dst = state.people[to];
        const newer = (src.seq || 0) > (dst.seq || 0);
        for (const [fk, fv] of Object.entries(src.fields || {})) if (!dst.fields[fk] || newer) dst.fields[fk] = fv;
        dst.seq = Math.max(src.seq || 0, dst.seq || 0);
        applied.push({ label: dst.name, before: src.name, after: "same person" });
    }
    if (!Array.isArray(parsed.people)) return { state, applied, notes: [] };
    for (const p of parsed.people) {
        const name = bondName(p, ctx.facts);
        const known = findPersonKey(state.people, name);
        if (known && unsent.has(known)) continue;
        const key = known || statKey(name);
        const rec = state.people[key] || (state.people[key] = { name, fields: {} });
        // A longer name ("Matt Reyes" after "Matt") is the better one to show;
        // a bracket added after it ("Dom (Bartender)") is not.
        if (name.length > rec.name.length && statKey(name).startsWith(statKey(rec.name)) && !/[(\[]/.test(name.slice(rec.name.length))) rec.name = name;
        rec.seq = typeof ctx.seq === "number" ? ctx.seq : rec.seq || 0;
        for (const f of p.fields) {
            const ch = applyField(rec.fields, f);
            if (ch) applied.push({ ...ch, label: `${rec.name}: ${ch.label}` });
        }
    }
    return { state, applied, notes: [] };
}

export function applySheet(prev, parsed, ctx = {}) {
    const state = structuredClone(prev || emptySheet());
    const applied = [];
    if (!parsed || !Array.isArray(parsed.fields)) return { state, applied, notes: [] };
    for (const f of parsed.fields) {
        const ch = applyField(state.fields, f);
        if (ch) applied.push(ch);
    }
    state.seq = typeof ctx.seq === "number" ? ctx.seq : state.seq;
    return { state, applied, notes: [] };
}

export function applyLatest(prev, parsed, ctx = {}) {
    const state = structuredClone(prev || emptyLatest());
    if (!parsed || typeof parsed.text !== "string" || !parsed.text) return { state, applied: [], notes: [] };
    const changed = state.text !== parsed.text;
    state.text = parsed.text;
    state.seq = typeof ctx.seq === "number" ? ctx.seq : state.seq;
    return { state, applied: changed ? [{ label: "text", before: "", after: parsed.text }] : [], notes: [] };
}

/**
 * Who the story needs bonds for right now: everyone in the scene, anyone named
 * in the recent text, and anyone in the latest Bonds block. Everyone else stays
 * on file. Order: the scene first, then as they appear on file.
 * @param {{ people: object }} state
 * @param {{ present?: string[], recentText?: string, latestNames?: string[] }} opts
 * @returns {string[]} record keys
 */
export function pickBondsFor(state, { present = [], recentText = "", latestNames = [] } = {}) {
    const people = (state && state.people) || {};
    const out = [];
    const add = k => { if (k && people[k] && !out.includes(k)) out.push(k); };
    for (const n of present) add(findPersonKey(people, n, { nickname: true }));
    for (const n of latestNames) add(findPersonKey(people, n));
    for (const k of namedIn(recentText, people)) add(k);
    return out;
}
