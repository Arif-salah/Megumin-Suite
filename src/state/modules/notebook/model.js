// ────────────────────────────────────────────────────────────────────────────
// Author's Notebook model (plan 010).
//
//   { truths: { T1: Truth, … }, next: 1, freeIds: [4] }
//   Truth: { id, truth, hiddenFrom: string[], when, changes, clueIdeas,
//            clues: [{ text, seq, found }], createdSeq,
//            revealedSeq: number|null, revealedHow: "out"|"learned"|"user"|null }
//
// The rules live here, not only in the prompt:
//   - ids are ours: a new truth gets the next free id whatever the model wrote.
//     An id deleted from the tab is used again by the next new truth (plan
//     020: delete T4, the next one is T4 again). Only deletions that say so
//     (`reuse: true`, every deletion from now on) free their id: a chat's
//     older deletions replay as before, so later truths keep the ids the
//     model was shown;
//   - at most ctx.liveCap truths are live (the user's setting, LIVE_CAP by
//     default); a new one past that is ignored;
//   - a truth written again word for word is the same truth, not a new one;
//   - first wins: one clue, one Learned and one Truth- per truth per reply;
//   - the model can't edit a truth. Only the user's ops (edit, forget, reveal,
//     restore) change one, and those come from the tab as user entries.
// A truth is revealed by Truth-, or when Learned empties its Hidden from list.
//
// Pure: runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

import { statKey } from "../stats/parse.js";

export const LIVE_CAP = 3;
// The user picks how many truths can be live (plan 020): 1 to MAX_LIVE_CAP.
export const MAX_LIVE_CAP = 10;
export const clampLiveCap = n => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) && v >= 1 ? Math.min(v, MAX_LIVE_CAP) : LIVE_CAP;
};

export const emptyNotebook = () => ({ truths: {}, next: 1, freeIds: [] });

/** The id the next new truth gets: the lowest freed one, else the next number. */
export function peekNextId(state) {
    const free = (state && Array.isArray(state.freeIds) ? state.freeIds : []).filter(n => !(state.truths || {})[`T${n}`]);
    return free.length ? `T${Math.min(...free)}` : `T${(state && state.next) || 1}`;
}

function takeNextId(state) {
    const id = peekNextId(state);
    const n = Number(id.slice(1));
    if (state.freeIds.includes(n)) state.freeIds = state.freeIds.filter(x => x !== n);
    else state.next = n + 1;
    return id;
}

export const isLive = t => Boolean(t) && t.revealedSeq == null && !t.revealedHow;
export const liveTruths = state => Object.values(state?.truths || {}).filter(isLive);
// A truth the user added and hasn't written yet (plan 020: "Add a truth") is
// live in the tab but not in the story: not sent, not counted, no setup skipped.
export const isFilled = t => Boolean(t) && String(t.truth || "").trim() !== "";
export const filledLiveTruths = state => liveTruths(state).filter(isFilled);
export const pastTruths = state => Object.values(state?.truths || {}).filter(t => !isLive(t));

const READER = new Set(["reader", "the reader"]);

/** The Hidden from name this one means: exact, "the reader", then a unique first name. */
export function findHiddenName(list, name) {
    const k = statKey(name);
    if (!k) return -1;
    const keys = list.map(statKey);
    let i = keys.indexOf(k);
    if (i >= 0) return i;
    if (READER.has(k)) return keys.findIndex(x => READER.has(x));
    const first = k.split(" ")[0];
    const hits = keys.map((x, j) => (x.split(" ")[0] === first ? j : -1)).filter(j => j >= 0);
    return hits.length === 1 && first.length > 2 ? hits[0] : -1;
}

function reveal(t, seq, how) {
    t.revealedSeq = typeof seq === "number" ? seq : 0;
    t.revealedHow = how;
}

const EDITABLE = ["truth", "hiddenFrom", "when", "changes", "clueIdeas", "clues"];

/**
 * @param {object} prev
 * @param {{ ops: object[] }} parsed
 * @param {{ seq?: number, liveCap?: number }} [ctx]
 * @returns {{ state: object, applied: object[], notes: string[] }}
 */
export function applyNotebook(prev, parsed, ctx = {}) {
    const cap = ctx.liveCap === undefined ? LIVE_CAP : clampLiveCap(ctx.liveCap);
    const state = structuredClone(prev || emptyNotebook());
    state.truths = state.truths || {};
    state.next = state.next || 1;
    state.freeIds = Array.isArray(state.freeIds) ? state.freeIds : [];
    const applied = [];
    const notes = [];
    if (!parsed || !Array.isArray(parsed.ops)) return { state, applied, notes };
    const seq = typeof ctx.seq === "number" ? ctx.seq : 0;
    const idMap = {};     // the id the model wrote for a new truth → the one it got
    const done = new Set();

    for (const op of parsed.ops) {
        if (!op) continue;

        if (op.op === "entry") {
            const same = Object.values(state.truths).find(t => statKey(t.truth) === statKey(op.truth));
            if (same) { if (op.id) idMap[op.id] = same.id; continue; }
            if (filledLiveTruths(state).length >= cap) { notes.push(`New truth left out: ${cap} are already live.`); continue; }
            const hiddenFrom = (op.hiddenFrom || []).filter(Boolean);
            if (!hiddenFrom.length) { notes.push("New truth left out: it is hidden from no one."); continue; }
            const id = takeNextId(state);
            if (op.id) idMap[op.id] = id;
            state.truths[id] = {
                id, truth: op.truth, hiddenFrom,
                when: op.when || "", changes: op.changes || "", clueIdeas: op.clueIdeas || "",
                clues: [], createdSeq: seq, revealedSeq: null, revealedHow: null
            };
            applied.push({ op: "entry", id, text: op.truth });
            continue;
        }

        // The user's "Add a truth": an empty one to fill in the tab.
        if (op.op === "add") {
            const id = takeNextId(state);
            state.truths[id] = {
                id, truth: "", hiddenFrom: ["the reader"],
                when: "", changes: "", clueIdeas: "",
                clues: [], createdSeq: seq, revealedSeq: null, revealedHow: null
            };
            applied.push({ op: "add", id, text: "" });
            continue;
        }

        const id = idMap[op.id] || op.id;
        const t = state.truths[id];
        if (!t) { notes.push(`${op.id || "?"} is not in the notebook.`); continue; }

        // The user's ops, from the tab.
        if (op.op === "forget") {
            delete state.truths[id];
            const n = Number(String(id).replace(/^T/, ""));
            if (op.reuse && Number.isInteger(n) && n > 0 && !state.freeIds.includes(n)) state.freeIds.push(n);
            applied.push({ op: "forget", id, text: t.truth });
            continue;
        }
        if (op.op === "edit") {
            for (const k of EDITABLE) if (op.fields && op.fields[k] !== undefined) t[k] = structuredClone(op.fields[k]);
            if (isLive(t) && !t.hiddenFrom.length) reveal(t, seq, "user");
            applied.push({ op: "edit", id, text: t.truth });
            continue;
        }
        if (op.op === "reveal") {
            if (isLive(t)) { reveal(t, seq, "user"); applied.push({ op: "out", id, text: t.truth }); }
            continue;
        }
        if (op.op === "restore") {
            if (!isLive(t)) {
                if (filledLiveTruths(state).length >= cap) { notes.push(`${id} stays in the past: ${cap} are already live.`); continue; }
                t.revealedSeq = null; t.revealedHow = null;
                applied.push({ op: "restore", id, text: t.truth });
            }
            continue;
        }

        // The model's ops: first wins, and only on a live truth.
        const key = `${op.op}|${id}`;
        if (done.has(key)) continue;
        done.add(key);
        if (!isLive(t)) { notes.push(`${id} has already come out.`); continue; }

        if (op.op === "clue") {
            const clue = { text: op.text, seq, found: op.found !== false };
            t.clues.push(clue);
            applied.push({ op: "clue", id, text: op.text, found: clue.found });
        } else if (op.op === "learned") {
            const who = [];
            for (const name of op.names || []) {
                const i = findHiddenName(t.hiddenFrom, name);
                if (i < 0) continue;
                who.push(t.hiddenFrom[i]);
                t.hiddenFrom.splice(i, 1);
            }
            if (!who.length) { notes.push(`${id}: ${(op.names || []).join(", ") || "no one"} was not on its Hidden from list.`); continue; }
            applied.push({ op: "learned", id, text: who.join(", ") });
            if (!t.hiddenFrom.length) {
                reveal(t, seq, "learned");
                applied.push({ op: "out", id, text: t.truth });
            }
        } else if (op.op === "out") {
            reveal(t, seq, "out");
            applied.push({ op: "out", id, text: t.truth });
        }
    }
    return { state, applied, notes };
}
