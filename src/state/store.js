// ────────────────────────────────────────────────────────────────────────────
// Megumin state store.
//
// Blocks are an app layer the extension owns, not text in the chat. The state
// lives in chat_metadata (one per chat, saved in the chat file), and every
// change the model asks for is kept as a journal entry tied to the message and
// swipe that produced it:
//
//   current state = checkpoint + active journal entries, in seq order
//
// An entry is active while its message exists and is showing that swipe, so
// swiping, regenerating, editing and rewinding undo exactly what they should,
// and swiping back brings it back. Hiding, summarizing or deleting OLD messages
// undoes nothing: the state belongs to the story, not to the text on screen.
//
// Pure apart from the adapter it is handed, so it runs under plain node:
//   adapter = { getChat(), getMeta(), saveMeta(), saveChat(), getUserNames() }
// ────────────────────────────────────────────────────────────────────────────

const ROOT_VERSION = 1;

function randomUid() {
    return "m_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function currentSwipe(msg) {
    return typeof msg?.swipe_id === "number" ? msg.swipe_id : 0;
}

function emptyRoot() {
    return {
        v: ROOT_VERSION,
        seqCounter: 1,
        entryCounter: 1,
        checkpoint: { seq: 0, modules: {} },
        journal: [],
        swipeOf: {},              // uid → swipe last seen on screen (decides which swipe of a deleted message survives)
        pendingFullRewrite: {},   // moduleId → true
        imported: {}              // moduleId → true
    };
}

/**
 * @param {{
 *   adapter: { getChat: () => any[], getMeta: () => object|null, saveMeta: () => void, saveChat?: () => void, getUserNames?: () => string[] },
 *   modules: Record<string, { empty: () => object, parse: (text: string) => object|null, apply: (state: object, parsed: object, ctx: object) => { state: object, applied: any[], notes: string[] } }>,
 *   journalDepth?: number | (() => number),
 *   rootKey?: string
 * }} opts
 */
export function createStateStore({ adapter, modules, journalDepth = 200, rootKey = "megumin_state" }) {
    let version = 0;
    const memo = new Map();   // moduleId → { key, timeline }

    function root() {
        const meta = adapter.getMeta();
        if (!meta) return null;
        const r = meta[rootKey];
        if (!r || typeof r !== "object" || r.v !== ROOT_VERSION) {
            meta[rootKey] = emptyRoot();
        } else {
            // Fill anything a partial write could have left missing.
            const d = emptyRoot();
            for (const k of Object.keys(d)) if (r[k] === undefined) r[k] = d[k];
            if (!Array.isArray(r.journal)) r.journal = [];
        }
        return meta[rootKey];
    }

    function changed({ chat = false } = {}) {
        version++;
        memo.clear();
        adapter.saveMeta();
        if (chat && adapter.saveChat) adapter.saveChat();
    }

    function chat() {
        return adapter.getChat() || [];
    }

    // ── Message identity ────────────────────────────────────────────────
    // ST keeps a separate `extra` per swipe and clones the current one into
    // each new swipe, so the stamp is written into every swipe: it has to be
    // the MESSAGE's id, not one swipe's.
    function stamp(msg) {
        const r = root();
        if (!msg || !r) return null;
        if (!msg.extra || typeof msg.extra !== "object") msg.extra = {};
        let dirty = false;
        let { megumin_uid: uid, megumin_seq: seq } = msg.extra;
        if (!uid || typeof seq !== "number") {
            uid = randomUid();
            seq = r.seqCounter++;
            dirty = true;
        }
        if (msg.extra.megumin_uid !== uid || msg.extra.megumin_seq !== seq) {
            msg.extra.megumin_uid = uid;
            msg.extra.megumin_seq = seq;
            dirty = true;
        }
        if (Array.isArray(msg.swipe_info)) {
            for (const info of msg.swipe_info) {
                if (!info || typeof info !== "object") continue;
                if (!info.extra || typeof info.extra !== "object") info.extra = {};
                if (info.extra.megumin_uid !== uid || info.extra.megumin_seq !== seq) {
                    info.extra.megumin_uid = uid;
                    info.extra.megumin_seq = seq;
                    dirty = true;
                }
            }
        }
        return { uid, seq, dirty };
    }

    /** Stamps every non-user message in chat order, so seq follows the story. */
    function stampAll() {
        let dirty = false;
        for (const msg of chat()) {
            if (!msg || msg.is_user) continue;
            const s = stamp(msg);
            if (s && s.dirty) dirty = true;
        }
        if (dirty) changed({ chat: true });
        return dirty;
    }

    function presentMessages() {
        const map = new Map();   // uid → { index, msg, seq, swipe }
        chat().forEach((msg, index) => {
            const uid = msg?.extra?.megumin_uid;
            if (uid) map.set(uid, { index, msg, seq: msg.extra.megumin_seq, swipe: currentSwipe(msg) });
        });
        return map;
    }

    // ── Journal ─────────────────────────────────────────────────────────
    function sortJournal(r) {
        r.journal.sort((a, b) => (a.seq - b.seq) || (a.n - b.n));
    }

    function activeEntries(moduleId) {
        const r = root();
        if (!r) return [];
        const present = presentMessages();
        return r.journal.filter(e => {
            if (moduleId && e.module !== moduleId) return false;
            if (e.disabled) return false;
            if (e.source === "user" || e.orphan) return true;
            const p = present.get(e.uid);
            return Boolean(p) && p.swipe === e.swipe;
        });
    }

    /**
     * Parses one message and stores what it changed, replacing whatever the same
     * message + swipe produced before (continue, edit, reparse).
     * @param {number} index
     * @param {{ source?: string, expect?: boolean|Record<string, boolean>, moduleIds?: string[], swipe?: number, parsed?: object|null }} [opts]
     *   expect — the model was asked for this module's block, so a missing one is recorded as `missing`.
     *   swipe  — file under this swipe instead of the one showing (a side-model
     *            result can land after the user has swiped elsewhere).
     *   parsed — use this result instead of parsing the message text (side model);
     *            null records a missing update.
     */
    function recordMessage(index, { source = "reply", expect = false, moduleIds, swipe: forSwipe, parsed: given, raw } = {}) {
        const r = root();
        const msg = chat()[index];
        if (!r || !msg || msg.is_user) return { recorded: [] };
        const s = stamp(msg);
        if (s.seq <= r.checkpoint.seq) return { recorded: [], folded: true };

        const swipe = typeof forSwipe === "number" ? forSwipe : currentSwipe(msg);
        if (swipe === currentSwipe(msg)) r.swipeOf[s.uid] = swipe;
        const recorded = [];
        for (const mid of moduleIds || Object.keys(modules)) {
            const mod = modules[mid];
            const parsed = given !== undefined ? given : mod.parse(String(msg.mes || ""));
            const wanted = typeof expect === "object" ? Boolean(expect[mid]) : Boolean(expect);
            const at = r.journal.findIndex(e => e.uid === s.uid && e.swipe === swipe && e.module === mid && e.source !== "user");
            if (!parsed && !wanted) {
                if (at >= 0) r.journal.splice(at, 1);
                continue;
            }
            const entry = {
                id: `e${r.entryCounter++}`,
                n: r.entryCounter,
                uid: s.uid,
                swipe,
                seq: s.seq,
                module: mid,
                source,
                parsed: parsed || { kind: "delta", changes: [], skipped: [], noChanges: false },
                // The text the entry was parsed from when it is not the message
                // itself (a side model's answer), so a better parser can redo it.
                ...(typeof raw === "string" ? { raw } : {}),
                missing: !parsed,
                orphan: false,
                disabled: false
            };
            if (at >= 0) {
                entry.disabled = r.journal[at].disabled;
                r.journal[at] = entry;
            } else {
                r.journal.push(entry);
            }
            recorded.push(entry);
            if (mid in r.pendingFullRewrite && parsed && parsed.kind === "snapshot") delete r.pendingFullRewrite[mid];
        }
        sortJournal(r);
        compact(r);
        changed({ chat: s.dirty });
        return { recorded };
    }

    /**
     * A swipe was shown. Squares the journal with it, and parses a swipe that was
     * never recorded (older than the store, or an alternate greeting).
     *
     * When ST swipes to generate a NEW reply it moves swipe_id to a slot that does
     * not exist yet and leaves `mes` holding the PREVIOUS swipe's text until the
     * new reply arrives — and builds the prompt in between. Reading `mes` here
     * would file the old reply's changes under the new swipe and feed them into
     * that very prompt. So only the swipe's own slot is ever read.
     */
    function onSwiped(index, { moduleIds } = {}) {
        reconcile();
        const r = root();
        const msg = chat()[index];
        if (!r || !msg || msg.is_user) return false;
        const swipe = currentSwipe(msg);
        const text = Array.isArray(msg.swipes) ? msg.swipes[swipe] : msg.mes;
        if (typeof text !== "string") return false;      // still generating
        const uid = msg.extra?.megumin_uid;
        let recorded = false;
        for (const mid of moduleIds || Object.keys(modules)) {
            const has = uid && r.journal.some(e => e.uid === uid && e.swipe === swipe && e.module === mid && e.source !== "user");
            if (has || !modules[mid].parse(text)) continue;
            recordMessage(index, { expect: false, moduleIds: [mid] });
            recorded = true;
        }
        return recorded;
    }

    /**
     * Entries keep their parsed changes, so a parser fix would never reach them.
     * When a module's parser version goes up, every entry is parsed again once,
     * from its message's swipe text (or the side model's stored answer). Manual
     * edits and entries whose text is gone are left as they are.
     * @returns {number} entries re-parsed
     */
    function reparseStale(moduleId) {
        const r = root();
        const mod = modules[moduleId];
        if (!r || !mod) return 0;
        const want = mod.version || 1;
        r.parserVersion = r.parserVersion || {};
        if ((r.parserVersion[moduleId] || 1) >= want) return 0;
        const byUid = new Map();
        for (const m of chat()) if (m?.extra?.megumin_uid) byUid.set(m.extra.megumin_uid, m);
        let n = 0;
        for (const e of r.journal) {
            if (e.module !== moduleId || e.source === "user") continue;
            let text = typeof e.raw === "string" ? e.raw : null;
            if (text == null) {
                const m = byUid.get(e.uid);
                if (!m) continue;
                if (Array.isArray(m.swipes) && typeof m.swipes[e.swipe] === "string") text = m.swipes[e.swipe];
                else if (currentSwipe(m) === e.swipe) text = String(m.mes || "");
            }
            if (text == null) continue;
            const p = mod.parse(text);
            if (!p) continue;
            e.parsed = p;
            e.missing = false;
            n++;
        }
        r.parserVersion[moduleId] = want;
        changed();
        return n;
    }

    /** A swipe was deleted: its entries go, and later swipes shift down one. */
    function onSwipeDeleted(messageIndex, swipeId) {
        const r = root();
        const msg = chat()[messageIndex];
        const uid = msg?.extra?.megumin_uid;
        if (!r || !uid) return false;
        const before = r.journal.length;
        r.journal = r.journal.filter(e => !(e.uid === uid && e.swipe === swipeId));
        let shifted = false;
        for (const e of r.journal) {
            if (e.uid === uid && e.swipe > swipeId) { e.swipe--; shifted = true; }
        }
        r.swipeOf[uid] = currentSwipe(msg);
        if (r.journal.length !== before || shifted) changed();
        return true;
    }

    /**
     * Squares the journal with the messages that exist right now. Run on load,
     * after deletes, after swipes. A missing message with a later message still
     * present was CLEANUP (old message deleted): its effects are kept as an
     * orphan. A missing message with nothing after it was a REWIND: undone.
     * @returns {{ orphaned: object[], dropped: object[] }}
     */
    function reconcile() {
        const r = root();
        if (!r) return { orphaned: [], dropped: [] };
        const present = presentMessages();
        let maxSeq = r.checkpoint.seq;
        let dirty = false;
        for (const [uid, p] of present) {
            if (typeof p.seq === "number" && p.seq > maxSeq) maxSeq = p.seq;
            if (r.swipeOf[uid] !== p.swipe) { r.swipeOf[uid] = p.swipe; dirty = true; }
        }

        const orphaned = [];
        const dropped = [];
        const keep = [];
        for (const e of r.journal) {
            if (e.source === "user" || e.orphan || present.has(e.uid)) { keep.push(e); continue; }
            const shownSwipe = r.swipeOf[e.uid];
            const wasShowing = shownSwipe === undefined || shownSwipe === e.swipe;
            if (e.seq < maxSeq && wasShowing) {
                e.orphan = true;
                orphaned.push(e);
                keep.push(e);
            } else {
                dropped.push(e);
            }
        }
        if (orphaned.length || dropped.length) {
            r.journal = keep;
            for (const e of [...orphaned, ...dropped]) delete r.swipeOf[e.uid];
            dirty = true;
        }
        if (dirty) changed();
        return { orphaned, dropped };
    }

    // ── Checkpointing ───────────────────────────────────────────────────
    function compact(r) {
        const seqs = [...new Set(r.journal.filter(e => e.source !== "user").map(e => e.seq))].sort((a, b) => a - b);
        const depth = Math.max(1, Number(typeof journalDepth === "function" ? journalDepth() : journalDepth) || 200);
        if (seqs.length <= depth) return false;
        const cutSeq = seqs[seqs.length - depth - 1];
        const present = presentMessages();
        const userNames = adapter.getUserNames ? adapter.getUserNames() : [];
        for (const mid of Object.keys(modules)) {
            let state = r.checkpoint.modules[mid] || modules[mid].empty();
            for (const e of r.journal) {
                if (e.module !== mid || e.seq > cutSeq || e.disabled) continue;
                const p = present.get(e.uid);
                const active = e.source === "user" || e.orphan || (p && p.swipe === e.swipe);
                if (!active) continue;
                state = modules[mid].apply(state, e.parsed, { seq: e.seq, userNames }).state;
            }
            r.checkpoint.modules[mid] = state;
        }
        r.journal = r.journal.filter(e => e.seq > cutSeq);
        r.checkpoint.seq = cutSeq;
        return true;
    }

    // ── Reading ─────────────────────────────────────────────────────────
    function swipeSignature() {
        let sig = "";
        for (const msg of chat()) {
            const uid = msg?.extra?.megumin_uid;
            if (uid) sig += uid + ":" + currentSwipe(msg) + ",";
        }
        return sig;
    }

    /**
     * Every active entry of one module, with the state after it.
     * @returns {{ base: object, baseSeq: number, steps: Array<{ seq: number, entry: object, state: object, applied: any[], notes: string[] }> }}
     */
    function timeline(moduleId) {
        const r = root();
        const mod = modules[moduleId];
        if (!r || !mod) return { base: mod ? mod.empty() : null, baseSeq: 0, steps: [] };
        const key = version + "|" + swipeSignature();
        const hit = memo.get(moduleId);
        if (hit && hit.key === key) return hit.timeline;

        const userNames = adapter.getUserNames ? adapter.getUserNames() : [];
        const base = r.checkpoint.modules[moduleId] || mod.empty();
        let state = base;
        const steps = [];
        for (const e of activeEntries(moduleId)) {
            const res = mod.apply(state, e.parsed, { seq: e.seq, userNames });
            state = res.state;
            steps.push({ seq: e.seq, entry: e, state, applied: res.applied, notes: res.notes, unannounced: res.unannounced || [] });
        }
        const tl = { base, baseSeq: r.checkpoint.seq, steps };
        memo.set(moduleId, { key, timeline: tl });
        return tl;
    }

    function getState(moduleId) {
        const tl = timeline(moduleId);
        return tl.steps.length ? tl.steps[tl.steps.length - 1].state : tl.base;
    }

    /** The state as it stood right after message `seq` (for that message's card). */
    function getStateAt(moduleId, seq) {
        const tl = timeline(moduleId);
        let state = tl.base;
        for (const s of tl.steps) {
            if (s.seq > seq) break;
            state = s.state;
        }
        return state;
    }

    /** What the active swipe of message `uid` changed, or null. */
    function getStep(moduleId, uid) {
        return timeline(moduleId).steps.find(s => s.entry.uid === uid && s.entry.source !== "user") || null;
    }

    /** The entry one message + swipe produced, whether it is on, off or orphaned. */
    function getEntryFor(moduleId, uid, swipe) {
        const r = root();
        if (!r || !uid) return null;
        return r.journal.find(e => e.module === moduleId && e.uid === uid && e.swipe === swipe && e.source !== "user") || null;
    }

    /**
     * Every entry of a module for the history view, oldest first, each marked
     * with whether it currently counts and where its message sits in the chat.
     */
    function listEntries(moduleId) {
        const r = root();
        if (!r) return [];
        const present = presentMessages();
        const activeIds = new Set(activeEntries(moduleId).map(e => e.id));
        return r.journal
            .filter(e => e.module === moduleId)
            .map(e => {
                const p = e.uid ? present.get(e.uid) : null;
                return {
                    entry: e,
                    active: activeIds.has(e.id),
                    index: p ? p.index : null,
                    shownSwipe: p ? p.swipe : null
                };
            });
    }

    function hasState(moduleId) {
        const r = root();
        if (!r) return false;
        if (r.checkpoint.modules[moduleId]) return true;
        return timeline(moduleId).steps.some(s => !s.entry.missing);
    }

    // ── Editing ─────────────────────────────────────────────────────────
    /** A manual edit from the UI. Never undone by chat events. */
    function addUserEntry(moduleId, parsed) {
        const r = root();
        if (!r || !modules[moduleId]) return null;
        const entry = {
            id: `e${r.entryCounter++}`,
            n: r.entryCounter,
            uid: null,
            swipe: 0,
            seq: r.seqCounter++,
            module: moduleId,
            source: "user",
            parsed,
            missing: false,
            orphan: false,
            disabled: false
        };
        r.journal.push(entry);
        sortJournal(r);
        changed();
        return entry;
    }

    function setDisabled(entryId, disabled) {
        const r = root();
        const e = r && r.journal.find(x => x.id === entryId);
        if (!e) return false;
        e.disabled = Boolean(disabled);
        changed();
        return true;
    }

    /** Removes a manual edit. Message-backed entries are disabled instead, never deleted. */
    function removeUserEntry(entryId) {
        const r = root();
        if (!r) return false;
        const i = r.journal.findIndex(x => x.id === entryId && x.source === "user");
        if (i < 0) return false;
        r.journal.splice(i, 1);
        changed();
        return true;
    }

    function reset(moduleId) {
        const r = root();
        if (!r) return;
        r.journal = r.journal.filter(e => e.module !== moduleId);
        delete r.checkpoint.modules[moduleId];
        delete r.pendingFullRewrite[moduleId];
        changed();
    }

    function setPendingFullRewrite(moduleId, on) {
        const r = root();
        if (!r) return;
        if (on) r.pendingFullRewrite[moduleId] = true;
        else delete r.pendingFullRewrite[moduleId];
        changed();
    }

    function isPendingFullRewrite(moduleId) {
        const r = root();
        return Boolean(r && r.pendingFullRewrite[moduleId]);
    }

    // ── Import ──────────────────────────────────────────────────────────
    /**
     * One-time pickup for chats started before the store existed: the last full
     * block found in the chat, then every update after it. Each is tied to its
     * message, so undo works for imported history as well.
     * @returns {number} entries recorded
     */
    function importFromChat(moduleId, { fromIndex = 0, toIndex = Infinity, force = false } = {}) {
        const r = root();
        const mod = modules[moduleId];
        if (!r || !mod) return 0;
        if (r.imported[moduleId] && !force) return 0;
        stampAll();

        const msgs = chat();
        const hi = Math.min(toIndex, msgs.length - 1);
        let start = fromIndex;
        if (!force) {
            for (let i = hi; i >= fromIndex; i--) {
                const m = msgs[i];
                if (!m || m.is_user) continue;
                const p = mod.parse(String(m.mes || ""));
                if (p && p.kind === "snapshot") { start = i; break; }
            }
        }
        let count = 0;
        for (let i = start; i <= hi; i++) {
            const m = msgs[i];
            if (!m || m.is_user) continue;
            if (!mod.parse(String(m.mes || ""))) continue;
            const { recorded } = recordMessage(i, { source: "import", moduleIds: [moduleId] });
            count += recorded.length;
        }
        r.imported[moduleId] = true;
        changed();
        return count;
    }

    return {
        root, stamp, stampAll, recordMessage, onSwiped, onSwipeDeleted, reconcile, reparseStale,
        timeline, getState, getStateAt, getStep, getEntryFor, listEntries, hasState, activeEntries,
        addUserEntry, setDisabled, removeUserEntry, reset,
        setPendingFullRewrite, isPendingFullRewrite, importFromChat,
        get version() { return version; }
    };
}
