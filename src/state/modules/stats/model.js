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

/** Finds the record for a name: exact, then a unique first-name match ("Matt" ↔ "Matt Reyes"). */
export function findPersonKey(people, name) {
    const k = statKey(name);
    if (people[k]) return k;
    const first = k.split(" ")[0];
    const hits = Object.keys(people).filter(p => p.split(" ")[0] === first);
    return hits.length === 1 && first.length > 2 ? hits[0] : null;
}

export function applyBonds(prev, parsed, ctx = {}) {
    const state = structuredClone(prev || emptyBonds());
    const applied = [];
    if (!parsed) return { state, applied, notes: [] };
    // The editor's "Forget": the character's bonds go entirely.
    for (const name of parsed.forget || []) {
        const k = findPersonKey(state.people, name);
        if (!k) continue;
        applied.push({ label: state.people[k].name, before: "on file", after: "forgotten" });
        delete state.people[k];
    }
    if (!Array.isArray(parsed.people)) return { state, applied, notes: [] };
    for (const p of parsed.people) {
        const key = findPersonKey(state.people, p.name) || statKey(p.name);
        const rec = state.people[key] || (state.people[key] = { name: p.name, fields: {} });
        // A longer name ("Matt Reyes" after "Matt") is the better one to show.
        if (p.name.length > rec.name.length && statKey(p.name).startsWith(statKey(rec.name))) rec.name = p.name;
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
    for (const n of present) add(findPersonKey(people, n));
    for (const n of latestNames) add(findPersonKey(people, n));
    const text = ` ${statKey(recentText).replace(/[^\p{L}\p{N} ]+/gu, " ")} `;
    for (const [k, rec] of Object.entries(people)) {
        const names = [k, statKey(rec.name).split(" ")[0]].filter(n => n.length > 2);
        if (names.some(n => text.includes(` ${n} `))) add(k);
    }
    return out;
}
