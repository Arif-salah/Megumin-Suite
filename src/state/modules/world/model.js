// ────────────────────────────────────────────────────────────────────────────
// World State model.
//
// The state itself and the one function that changes it. Pure: the store
// replays journal entries through `applyWorldChanges` to get the state at any
// message, so the same changes must always produce the same result.
//
// A character who leaves the scene is NOT deleted. `present` goes false and
// their fields stay, so when they come back 90 messages later their last
// outfit and agenda are still known.
// ────────────────────────────────────────────────────────────────────────────

import { PC, nameKey } from "./parse.js";
import { whoIs, namedIn as namesIn } from "../../names.js";
import { parseScene } from "../../scene.js";

const LISTS = ["threads", "seeds", "timers"];

export function emptyWorld() {
    return {
        scene: { time: "", location: "", weather: "" },
        pc: { name: "", fields: {} },
        cast: {},          // nameKey → { name, present, fields, offscreen, lastSeenSeq, lastSeenReply }
        threads: [],
        seeds: [],
        timers: [],
        arcPhase: "",
        scenePhase: ""
    };
}

const SCENE_LABEL = { time: "Time", location: "Loc", weather: "Wx" };
const PHASE_LABEL = { arcPhase: "Arc", scenePhase: "Scene" };
const LIST_LABEL = { threads: "Thread", seeds: "Seed", timers: "Timer" };

// How long each list may grow (plan 020). Past it, a reply's lists lose their
// oldest items, so a model that only ever adds can't bury the story in them.
export const LIST_LIMITS = { threads: 3, seeds: 3, timers: 2 };

// How many off-screen lines are kept. Past it, the oldest lines go; the
// character and their fields stay, so they come back as they were.
export const OFFSCREEN_LIMIT = 4;

// "Seed-: 2" / "#2" / "Seed 2": an item by its number in <Current_World_State>,
// which lists them as they stood before the reply.
const LIST_REF = /^(?:#|no\.?\s*|(?:thread|seed|timer)s?\s*#?)?(\d{1,2})\.?$/i;

function listRef(list, value) {
    const m = String(value || "").trim().match(LIST_REF);
    if (!m) return null;
    const n = Number(m[1]);
    return n >= 1 && n <= list.length ? list[n - 1] : null;
}

export function fieldLabel(field) {
    return String(field || "").replace(/\b\p{L}/gu, c => c.toUpperCase());
}

function normText(s) {
    return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

// "copied as written" is a hope, not a guarantee: a removal also matches when
// one text contains the other, as long as both are long enough to mean it.
function findListItem(list, value) {
    const v = normText(value);
    if (!v) return -1;
    let i = list.findIndex(x => normText(x) === v);
    if (i >= 0) return i;
    if (v.length < 12) return -1;
    const hits = list
        .map((x, idx) => ({ idx, n: normText(x) }))
        .filter(({ n }) => n.length >= 12 && (n.includes(v) || v.includes(n)));
    return hits.length === 1 ? hits[0].idx : -1;
}

// A timer is a subject plus a count, and the count is the part that changes:
// "Rent check due, 3 turns" and "Rent check due: 2 turns" are the same timer.
const COUNT_TAIL = /[\s,:;—–(\[-]*(?:in\s+|about\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a few|few)\s*(?:more\s+)?(?:turns?|repl(?:y|ies)|messages?|scenes?|days?|hours?|minutes?|rounds?)\b.*$/i;

export function timerSubject(text) {
    return normText(String(text || "").replace(COUNT_TAIL, ""));
}

// Timers match on their subject first (a countdown), then like any list item.
function findTimer(list, value) {
    const subj = timerSubject(value);
    if (subj.length >= 4) {
        const hits = list.map((x, idx) => ({ idx, s: timerSubject(x) })).filter(h => h.s === subj);
        if (hits.length === 1) return hits[0].idx;
    }
    return findListItem(list, value);
}

/**
 * @param {object} ctx { userNames?: string[] } — persona names that mean the PC
 */
function isPcName(state, who, ctx) {
    if (who === PC) return true;
    const k = nameKey(who);
    if (!k) return false;
    if (k === "{{user}}" || k === "user" || k === "pc" || k === "player") return true;
    if (state.pc.name && k === nameKey(state.pc.name)) return true;
    return (ctx.userNames || []).some(n => n && nameKey(n) === k);
}

/**
 * The cast key a name refers to, found the way every module finds a name
 * (state/names.js): the name or a nickname ('Matthew "Matt"' is found by
 * "Matt" too), then the one character it fits ("Resha" is "Resha Helios",
 * "Bathory" is Elizabeth Bathory, when no one else fits). Unknown names map
 * to their own key, so a new character is created under it.
 */
export function resolveCastKey(state, name) {
    const k = nameKey(name);
    if (!k || !state || !state.cast || state.cast[k]) return k;
    return whoIs(state.cast, name) || k;
}

// Gives a character their nicknames. If one of those nicknames already has a
// record of its own (the story said "Matt" before it ever said "Matthew"),
// that record IS this character: it is taken over rather than left as a twin.
function adoptAliases(state, entry, aliases) {
    if (!Array.isArray(aliases) || !aliases.length) return;
    entry.aliases = entry.aliases || [];
    const ownKey = nameKey(entry.name);
    for (const a of aliases) {
        const ak = nameKey(a);
        if (!ak || ak === ownKey) continue;
        if (!entry.aliases.some(x => nameKey(x) === ak)) entry.aliases.push(a);
        const twin = state.cast[ak];
        if (twin && twin !== entry) {
            entry.fields = { ...twin.fields, ...entry.fields };
            if (!entry.offscreen && twin.offscreen) {
                entry.offscreen = twin.offscreen;
                entry.offscreenAt = twin.offscreenAt;
            }
            if (twin.present) entry.present = true;
            entry.lastSeenSeq = Math.max(entry.lastSeenSeq || 0, twin.lastSeenSeq || 0);
            for (const x of twin.aliases || []) if (!entry.aliases.some(y => nameKey(y) === nameKey(x))) entry.aliases.push(x);
            delete state.cast[ak];
        }
    }
}

function castEntry(state, name, seq, createPresent, key) {
    const k = key || resolveCastKey(state, name);
    if (!state.cast[k]) {
        state.cast[k] = { name, present: createPresent, fields: {}, offscreen: "", lastSeenSeq: seq };
        return { entry: state.cast[k], created: true };
    }
    // Found under another spelling ("Resha" for "Resha Helios"): kept as a
    // nickname, so the notes show both and the model keeps to one person.
    const entry = state.cast[k];
    const nk = nameKey(name);
    if (nk && nk !== nameKey(entry.name) && !(entry.aliases || []).some(a => nameKey(a) === nk)) {
        entry.aliases = [...(entry.aliases || []), String(name).trim()];
    }
    return { entry, created: false };
}

// Longest known cast name that starts the text: "Wiz restocking her shop" → Wiz.
function matchCastPrefix(state, text) {
    const t = nameKey(text);
    let best = null;
    for (const c of Object.values(state.cast)) {
        const k = nameKey(c.name);
        if (k && (t === k || t.startsWith(k + " ")) && (!best || k.length > nameKey(best.name).length)) best = c;
    }
    return best;
}

// ── Out of the scene when the story stops naming them (plan 020) ───────────
//
// Models write "+ Name" when someone arrives but often forget "- Name" when
// they walk off, so people stayed "in the scene" for good. After each reply,
// anyone in the scene whose name (or nickname) hasn't been in the story for
// `staleAfter` replies is moved out of it. Their details are kept, so they
// come back as they were.
//
// Counted from the message text (ctx.text: the reply and the user's message
// before it, given by the store), so a swipe, a Revert or a rewind undoes it
// like any other change, and the card lists it under "Changed in this reply".
// Never the last one left: a scene with one other person names them "she".

export const STALE_AFTER_DEFAULT = 8;

/** The story text of a message: blocks, thinking and folded cards taken out. */
export function proseOf(text) {
    return String(text || "")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(think|thinking|details)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, " ")
        .replace(/<([A-Z][\w-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/g, " ")
        .replace(/<Blocks\b[\s\S]*$/, " ");
}

/** Whether the prose names this character (state/names.js namedIn). */
export function namedIn(prose, c) {
    return namesIn(prose, { c }).length > 0;
}

// `counted`: the reply wrote a scene list, so nobody is moved out by this
// guess; the counts still go on for a reply that writes none.
function staleStep(state, ctx, seq, note, counted = false) {
    if (typeof ctx.text !== "string") return;   // your own edits, deleted messages
    state.replies = (state.replies || 0) + 1;
    const named = new Set(namesIn(proseOf(ctx.text), state.cast));
    for (const [k, c] of Object.entries(state.cast)) {
        // Touched by this reply's update, named in it, or from before this rule.
        if (c.lastSeenSeq === seq || typeof c.lastSeenReply !== "number" || named.has(k)) c.lastSeenReply = state.replies;
    }
    const after = Number(ctx.staleAfter) || 0;
    if (after <= 0 || counted) return;
    const present = presentCast(state);
    const stale = present.filter(c => state.replies - c.lastSeenReply >= after);
    if (!stale.length) return;
    // Never empty the scene this way: the one named most lately stays.
    if (stale.length === present.length) {
        stale.sort((a, b) => b.lastSeenReply - a.lastSeenReply);
        stale.shift();
    }
    for (const c of stale) {
        c.present = false;
        note(`${c.name} left`, "present", `not named for ${after} replies`);
    }
}

// ── Who is in the scene, from the reply's <Scene> list (plan 022) ─────────
//
// The story model lists who is there at the end of every reply. With a list,
// presence comes from it alone: anyone not on it has left, without being
// moved off-screen (Off-screen is only for someone the story will come back
// to, and the model writes that itself). Remote people (on a call) are kept
// apart: not in the scene, not drawn, but the story is talking with them.
// `created`: characters this reply's lines brought in. Any of them the list
// doesn't mark as new ("+Mira") is asked about on the card ("Same person as"),
// unless nobody was known before the reply (\`knewAnyone\`): then there is no
// one they could be, and no names were handed to mark against.
function applyScene(state, scene, ctx, seq, note, unannounced, created, knewAnyone) {
    const here = new Set();
    const remote = new Set();
    const isNew = new Set();
    const place = (n, set) => {
        if (isPcName(state, n.name, ctx)) return;
        const key = whoIs(state.cast, n.name, { nickname: true }) || resolveCastKey(state, n.name);
        const had = Boolean(state.cast[key]);
        const { entry } = castEntry(state, n.name, seq, false, key);
        if (!had) created.add(entry);
        if (n.isNew) isNew.add(entry);
        entry.lastSeenSeq = seq;
        set.add(entry);
    };
    for (const n of scene.here) place(n, here);
    for (const n of scene.remote) place(n, remote);
    for (const c of Object.values(state.cast)) {
        const inHere = here.has(c);
        const onCall = !inHere && remote.has(c);
        if (inHere && !c.present) {
            c.present = true;
            c.offscreen = "";
            note(`${c.name} entered`, "", "present");
        } else if (!inHere && c.present) {
            c.present = false;
            note(`${c.name} left`, "present", onCall ? "on a call" : "gone");
        }
        if (onCall && !c.remote) {
            c.remote = true;
            note(`${c.name} · On a call`, "", "yes");
        } else if (!onCall && c.remote) {
            delete c.remote;
            note(`${c.name} · On a call`, "yes", "");
        }
    }
    if (knewAnyone) for (const c of created) if (!isNew.has(c) && state.cast[nameKey(c.name)] === c && !unannounced.includes(c.name)) unannounced.push(c.name);
}

/**
 * Applies one parsed reply to a state.
 * @param {object} prev     world state (not mutated)
 * @param {{kind: string, changes: object[]}} parsed
 * @param {{seq?: number, userNames?: string[], text?: string, staleAfter?: number, noLimits?: boolean}} [ctx]
 *   text: the message (and the user's message before it) this entry belongs
 *   to, for the "not named for N replies" step; absent for your own edits.
 * @returns {{ state: object, applied: Array<{label: string, before: string, after: string}>, notes: string[], unannounced: string[] }}
 *   unannounced: characters this reply created with no "+" line (the card
 *   asks whether one of them is someone already known)
 */
export function applyWorldChanges(prev, parsed, ctx = {}) {
    const state = structuredClone(prev || emptyWorld());
    const applied = [];
    const notes = [];
    const unannounced = [];
    const seq = typeof ctx.seq === "number" ? ctx.seq : 0;
    const note = (label, before, after) => {
        if (before !== after) applied.push({ label, before: before || "", after: after || "" });
    };
    // The reply's scene list, when it wrote one (plan 022). Not for your own edits.
    // The reply's own list first; Chomusuke writes one when the reply has none.
    const scene = parsed && parsed.byUser ? null
        : (typeof ctx.text === "string" ? parseScene(ctx.text) : null) || (parsed && parsed.scene) || null;
    const created = new Set();
    const knewAnyone = Object.keys(state.cast).length > 0;
    if (!parsed || !Array.isArray(parsed.changes)) {
        if (scene) applyScene(state, scene, ctx, seq, note, unannounced, created, knewAnyone);
        staleStep(state, ctx, seq, note, Boolean(scene));
        return { state, applied, notes, unannounced };
    }
    const startLists = Object.fromEntries(LISTS.map(k => [k, [...(state[k] || [])]]));

    // When an off-screen line was written, so the oldest go first when there
    // are too many. Lines written in the same reply keep the order they were written in.
    let tick = 0;
    const offscreenStamp = () => seq + (++tick) / 1e6;

    // A full snapshot describes who is present now: everyone else has left.
    // Who was there before, so the card lists only real comings and goings
    // (with "the whole scene every reply" a snapshot comes every reply).
    const snapshot = parsed.kind === "snapshot";
    const wasHere = new Set();
    if (snapshot && !scene) {
        for (const c of Object.values(state.cast)) {
            if (c.present) wasHere.add(c);
            c.present = false;
        }
    }
    const arrived = entry => !wasHere.has(entry);

    // Items listed under a section header replace that list as a whole.
    const listItems = {};
    const pendingAdds = [];

    const pcName = () => state.pc.name || "{{user}}";

    // Written twice in one update ("Matt.Position: …" then "Matt.Position: …"):
    // the FIRST one counts, the rest are noted and ignored. A full snapshot is
    // one description of the scene, so the same holds there.
    const written = new Set();
    const firstTime = key => {
        if (written.has(key)) return false;
        written.add(key);
        return true;
    };

    for (const ch of parsed.changes) {
        if (ch.type === "block") { written.clear(); continue; }
        if (ch.type === "scene" && !firstTime(`scene|${ch.key}`)) { notes.push(`${SCENE_LABEL[ch.key] || ch.key} was written twice; the first one was used.`); continue; }
        if (ch.type === "phase" && !firstTime(`phase|${ch.key}`)) { notes.push(`${PHASE_LABEL[ch.key] || ch.key} was written twice; the first one was used.`); continue; }
        if (ch.type === "field") {
            const pc = isPcName(state, ch.who, ctx);
            // Visible Condition belongs to the player; a Condition for anyone
            // else is not a field they have.
            if (!pc && ch.field === "condition") { notes.push(`${ch.who}.Condition was ignored: Condition is only noted for the player.`); continue; }
            const who = pc ? PC : resolveCastKey(state, ch.who);
            if (!firstTime(`field|${who}|${ch.field}`)) { notes.push(`${ch.who}.${fieldLabel(ch.field)} was written twice; the first one was used.`); continue; }
        }
        switch (ch.type) {
            case "scene": {
                const before = state.scene[ch.key] || "";
                state.scene[ch.key] = ch.value;
                note(SCENE_LABEL[ch.key] || ch.key, before, ch.value);
                break;
            }
            case "phase": {
                const before = state[ch.key] || "";
                state[ch.key] = ch.value;
                note(PHASE_LABEL[ch.key] || ch.key, before, ch.value);
                break;
            }
            case "pcname": {
                if (!state.pc.name && ch.name) state.pc.name = ch.name;
                break;
            }
            case "field": {
                if (isPcName(state, ch.who, ctx)) {
                    const before = state.pc.fields[ch.field] || "";
                    state.pc.fields[ch.field] = ch.value;
                    note(`${pcName()} · ${fieldLabel(ch.field)}`, before, ch.value);
                    break;
                }
                // `keepPresence` comes from the editor: fixing an away character's
                // outfit must not walk them back into the scene. A reply writing a
                // field for someone away DOES bring them back.
                // With a scene list, presence comes from the list alone.
                const { entry, created: isNewEntry } = castEntry(state, ch.who, seq, !ch.keepPresence && !scene);
                if (ch.keepPresence) {
                    // presence stays exactly as it was
                } else if (scene) {
                    if (isNewEntry) created.add(entry);
                } else if (isNewEntry) {
                    notes.push(`${entry.name} had no "+ ${entry.name}" line; treated as entering the scene.`);
                    unannounced.push(entry.name);
                    note(`${entry.name} entered`, "", "present");
                } else if (!entry.present) {
                    entry.present = true;
                    entry.offscreen = "";
                    if (arrived(entry)) note(`${entry.name} entered`, "", "present");
                }
                if (!ch.keepPresence) entry.lastSeenSeq = seq;
                const before = entry.fields[ch.field] || "";
                entry.fields[ch.field] = ch.value;
                note(`${entry.name} · ${fieldLabel(ch.field)}`, before, ch.value);
                break;
            }
            case "enter": {
                if (isPcName(state, ch.who, ctx)) break;
                const { entry } = castEntry(state, ch.who, seq, false);
                const wasPresent = entry.present;
                adoptAliases(state, entry, ch.aliases);
                if (wasPresent) entry.present = true;
                entry.lastSeenSeq = seq;
                if (scene) break;   // the list says who is there
                if (!entry.present) {
                    entry.present = true;
                    entry.offscreen = "";
                    if (arrived(entry)) note(`${entry.name} entered`, "", "present");
                }
                break;
            }
            case "leave": {
                if (isPcName(state, ch.who, ctx)) {
                    notes.push(`Ignored "- ${ch.who}": the player character cannot leave the scene.`);
                    break;
                }
                if (scene) break;   // the list says who is there
                const { entry } = castEntry(state, ch.who, seq, false);
                const wasPresent = entry.present;
                entry.present = false;
                entry.lastSeenSeq = seq;
                if (ch.where) {
                    entry.offscreen = ch.where;
                    entry.offscreenAt = offscreenStamp();
                }
                if (wasPresent) note(`${entry.name} left`, "present", ch.where || "gone");
                break;
            }
            case "forget": {
                // Editor only: a character removed outright, not just out of the scene.
                const k = resolveCastKey(state, ch.who);
                if (state.cast[k]) {
                    const gone = state.cast[k].name;
                    delete state.cast[k];
                    note(`${gone} removed`, "known", "");
                }
                break;
            }
            case "merge": {
                // Editor/card only: "Emma" is "Uncle Emma". The first becomes a
                // nickname of the second; for each detail the one seen last wins.
                const fromKey = resolveCastKey(state, ch.who);
                const toKey = resolveCastKey(state, ch.into);
                const from = state.cast[fromKey];
                const to = state.cast[toKey];
                if (!from || !to || from === to) break;
                const fromIsNewer = (from.lastSeenSeq || 0) >= (to.lastSeenSeq || 0);
                to.fields = fromIsNewer ? { ...to.fields, ...from.fields } : { ...from.fields, ...to.fields };
                if (fromIsNewer) {
                    to.present = from.present;
                    to.offscreen = from.offscreen || "";
                    to.offscreenAt = from.offscreenAt;
                }
                to.lastSeenSeq = Math.max(to.lastSeenSeq || 0, from.lastSeenSeq || 0);
                to.aliases = to.aliases || [];
                for (const n of [from.name, ...(from.aliases || [])]) {
                    const nk = nameKey(n);
                    if (nk && nk !== nameKey(to.name) && !to.aliases.some(a => nameKey(a) === nk)) to.aliases.push(n);
                }
                delete state.cast[fromKey];
                note(`${to.name} · Also called`, "", from.name);
                break;
            }
            case "offscreen": {
                let entry = null;
                let value = ch.value;
                // An update's Offscreen line can't bring in someone new: that is
                // how "Old man Cairns", only mentioned, became a character (plan
                // 022). A first World State and your own edits still can.
                if (!snapshot && !parsed.byUser) {
                    const who = ch.who || ch.value.split(/\s+/)[0];
                    if (!ch.who ? !matchCastPrefix(state, ch.value) && !state.cast[resolveCastKey(state, who)] : !state.cast[resolveCastKey(state, ch.who)]) {
                        notes.push(`Offscreen line for "${ch.who || ch.value}" was skipped: nobody by that name is in the story yet.`);
                        break;
                    }
                }
                if (ch.who) {
                    entry = castEntry(state, ch.who, seq, false).entry;
                } else {
                    const hit = matchCastPrefix(state, ch.value);
                    if (hit) {
                        entry = hit;
                        value = ch.value.slice(hit.name.length).replace(/^[\s:=—–-]+/, "").trim() || ch.value;
                    } else {
                        const first = ch.value.split(/\s+/)[0];
                        entry = castEntry(state, first, seq, false).entry;
                        value = ch.value.slice(first.length).trim() || ch.value;
                    }
                }
                if (isPcName(state, entry.name, ctx)) break;
                const before = entry.offscreen || "";
                if (entry.present) {
                    entry.present = false;
                    note(`${entry.name} left`, "present", value);
                }
                entry.offscreen = value;
                entry.offscreenAt = offscreenStamp();
                note(`${entry.name} · Off-screen`, before, value);
                break;
            }
            case "offscreenRemove": {
                // "Offscreen-: Wiz": her off-screen line goes, she and her fields stay.
                const entry = state.cast[resolveCastKey(state, ch.who)];
                if (!entry || !entry.offscreen) {
                    notes.push(`Could not find an off-screen line to remove for "${ch.who}"`);
                    break;
                }
                note(`${entry.name} · Off-screen`, entry.offscreen, "");
                entry.offscreen = "";
                break;
            }
            case "list": {
                if (!LISTS.includes(ch.list)) break;
                const list = state[ch.list];
                const label = LIST_LABEL[ch.list];
                const find = ch.list === "timers" ? findTimer : findListItem;
                // In a full snapshot, "Thread+: …" lines are the whole list.
                if (ch.op === "item" || (snapshot && ch.op === "add")) {
                    (listItems[ch.list] = listItems[ch.list] || []).push(ch.value);
                } else if (ch.op === "add") {
                    // Held back until every removal in this reply has run, so
                    // "Timer-: X: 2 turns" + "Timer+: X: 1 turn" ends with one
                    // timer whichever order the model wrote them in.
                    pendingAdds.push(ch);
                } else if (ch.op === "remove") {
                    const i = find(list, listRef(startLists[ch.list], ch.value) ?? ch.value);
                    if (i >= 0) {
                        const [gone] = list.splice(i, 1);
                        note(`${label} −`, gone, "");
                    } else {
                        notes.push(`Could not find ${label.toLowerCase()} to remove: "${ch.value}"`);
                    }
                }
                break;
            }
        }
    }

    if (scene) applyScene(state, scene, ctx, seq, note, unannounced, created, knewAnyone);

    // A snapshot that left someone out: they left.
    for (const c of wasHere) {
        if (!c.present && Object.values(state.cast).includes(c)) note(`${c.name} left`, "present", c.offscreen || "gone");
    }

    for (const ch of pendingAdds) {
        const list = state[ch.list];
        const label = LIST_LABEL[ch.list];
        if (ch.list === "timers") {
            // Writing a timer again is a countdown: it replaces the old count.
            const i = findTimer(list, ch.value);
            if (i >= 0) {
                const before = list[i];
                list[i] = ch.value;
                note(label, before, ch.value);
                continue;
            }
        } else if (findListItem(list, ch.value) >= 0) {
            continue;
        }
        list.push(ch.value);
        note(`${label} +`, "", ch.value);
    }

    for (const [key, items] of Object.entries(listItems)) {
        const deduped = [];
        for (const it of items) if (findListItem(deduped, it) < 0) deduped.push(it);
        const before = state[key].join(" · ");
        state[key] = deduped;
        note(`${LIST_LABEL[key]}s`, before, deduped.join(" · "));
    }

    // Over the limit, the oldest go. A list the reply wrote out whole (a first
    // World State) keeps the first ones it wrote. The user's own edits aren't
    // cut, and nothing is with "full update each time" (ctx.noLimits, plan 020).
    if (!parsed.byUser && !ctx.noLimits) {
        // The user's numbers (World State tab), else the built-in ones.
        const lim = { ...LIST_LIMITS, offscreen: OFFSCREEN_LIMIT, ...(ctx.limits || {}) };
        for (const key of LISTS) {
            const list = state[key] || (state[key] = []);
            while (list.length > lim[key]) {
                const gone = listItems[key] ? list.pop() : list.shift();
                note(`${LIST_LABEL[key]} − (list full)`, gone, "");
            }
        }
        const away = Object.values(state.cast).filter(c => !c.present && c.offscreen);
        if (away.length > lim.offscreen) {
            // A line from before the stamp counts from when they were last seen.
            const at = c => c.offscreenAt ?? c.lastSeenSeq ?? 0;
            away.sort((a, b) => at(a) - at(b));
            for (const c of away.slice(0, away.length - lim.offscreen)) {
                note(`${c.name} · Off-screen (list full)`, c.offscreen, "");
                c.offscreen = "";
            }
        }
    }

    if (!parsed.byUser) staleStep(state, ctx, seq, note, Boolean(scene));
    return { state, applied, notes, unannounced };
}

/** Everyone currently in the scene, in insertion order. */
export function presentCast(state) {
    return Object.values((state && state.cast) || {}).filter(c => c.present);
}

/** Everyone on a call with {{user}} (the scene list's Remote, plan 022). */
export function remoteCast(state) {
    return Object.values((state && state.cast) || {}).filter(c => !c.present && c.remote);
}

/** Looks a character up by any spelling of their name. */
export function findCast(state, name) {
    return (state && state.cast && state.cast[resolveCastKey(state, name)]) || null;
}

/** 'Matthew "Matt"' — the name the model and the card should see. */
export function castDisplayName(c) {
    const a = (c && c.aliases) || [];
    return a.length ? `${c.name} ${a.map(x => `"${x}"`).join(" ")}` : (c ? c.name : "");
}
