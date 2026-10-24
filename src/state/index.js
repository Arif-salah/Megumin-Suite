// ────────────────────────────────────────────────────────────────────────────
// State store ↔ SillyTavern.
//
// The one place that knows both sides: builds the store over the open chat's
// metadata, answers the prompt builder and the card renderer, and turns ST's
// chat events into store calls. Everything it calls into is pure and tested
// under node (tests/).
// ────────────────────────────────────────────────────────────────────────────

import { getContext, saveMetadataDebounced, saveChatDebounced, substituteParams, name1, generateQuietPrompt, extension_settings } from "../st.js";
import { extensionName } from "../core/constants.js";
import { engineKeepsNotebook } from "../core/engines.js";
import { hardcodedLogic } from "../../data/database.js";
import { runWithChomusuke } from "../engine/tasks.js";
import { warnChomusuke, answerKind } from "../engine/chomusukeNotice.js";
import { setActiveWorldExtractRequest } from "../core/activeRequests.js";
import { localProfile } from "../core/state.js";
import { createStateStore } from "./store.js";
import { worldModule } from "./modules/world/index.js";
import { bondsModule, sheetModule, chatterModule, trackerModule, cyoaModule } from "./modules/stats/index.js";
import { renderWorkerNotes, cleanWorkerAnswer, blockTextIn } from "./modules/stats/worker.js";
import { pickBondsFor } from "./modules/stats/model.js";
import { renderBondsNotes, renderSheetNotes } from "./modules/stats/render.js";
import { presentCast, findCast } from "./modules/world/model.js";
import { notebookModule } from "./modules/notebook/index.js";
import {
    notebookPhase, renderNotebookSetup, renderNotebookForPrompt, renderNotebookUpdateRules, notebookTurnLabeler
} from "./modules/notebook/render.js";
import { liveTruths } from "./modules/notebook/model.js";
import { parseNotebook } from "./modules/notebook/parse.js";
import {
    replyWroteNotebookChanges, notebookAnswerBlock, joinNotebookRead, notebookReadPart, parseNotebookRead,
    replyWroteTruths, notebookSetupAnswerBlock
} from "./modules/notebook/worker.js";
import {
    renderWorldForPrompt, renderWorldInstructions, renderWorldCard, findReturning, isEmptyWorld, describeWorldChange,
    renderWorldExtractPrompt
} from "./modules/world/render.js";

// Settings only: the state itself lives in the chat file, never in settings.json.
export const WORLD_SETTINGS_DEFAULTS = {
    updateMode: "inline",        // "inline" (automatic) | "manual". Who writes the automatic updates is Chomusuke's call: see worldUpdateMode()
    injectionDetail: "full",     // full | scene
    showReturning: true,
    showChanges: true,
    journalDepth: 200
};

export function worldSettings() {
    return { ...WORLD_SETTINGS_DEFAULTS, ...((localProfile && localProfile.worldState) || {}) };
}

/**
 * How replies update the World State right now:
 *   "manual"    — they don't (Blocks tab: Updates → Manual)
 *   "sidemodel" — Chomusuke reads each reply (Chomusuke tab: World State route on)
 *   "inline"    — the story model writes the block in its reply (everything else)
 * The Chomusuke route is decided in the Chomusuke tab with every other routed
 * feature, so the Blocks tab only says whether updates happen at all.
 */
export function worldUpdateMode() {
    if (worldSettings().updateMode === "manual") return "manual";
    const c = localProfile && localProfile.chomusuke;
    if (c && c.enabled && c.profileId && c.features && c.features.worldState === true) return "sidemodel";
    return "inline";
}

/** The World State block is switched on in the block stack. */
export function worldEnabled() {
    return Boolean(localProfile && Array.isArray(localProfile.blocks) && localProfile.blocks.includes("info"));
}

function sub(text) {
    try { return typeof substituteParams === "function" ? substituteParams(text) : text; } catch (e) { return text; }
}

const adapter = {
    getChat: () => getContext()?.chat || [],
    getMeta: () => {
        const ctx = getContext();
        if (!ctx || !ctx.chatId) return null;   // no chat open: nowhere to keep state
        return ctx.chatMetadata || null;
    },
    saveMeta: () => saveMetadataDebounced(),
    saveChat: () => saveChatDebounced(),
    getUserNames: () => {
        const names = [];
        try { if (name1) names.push(name1); } catch (e) { /* not ready */ }
        const u = sub("{{user}}");
        if (u && u !== "{{user}}") names.push(u);
        return names;
    }
};

export const stateStore = createStateStore({
    adapter,
    modules: { world: worldModule, bonds: bondsModule, sheet: sheetModule, chatter: chatterModule, tracker: trackerModule, cyoa: cyoaModule, notebook: notebookModule },
    journalDepth: () => worldSettings().journalDepth
});

// ── Reading ──────────────────────────────────────────────────────────────

export function getWorldState() {
    return stateStore.getState("world");
}

export function worldHasState() {
    return worldEnabled() && stateStore.hasState("world");
}

function recentText() {
    const chat = adapter.getChat();
    const parts = [];
    for (let i = chat.length - 1; i >= 0 && parts.length < 3; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        parts.push(String(m.mes || "").replace(/<[^>]+>/g, " "));
    }
    return parts.join(" ");
}

/** [[infoblockcurrent]]: the continuity notes, or "" when there is nothing yet. */
export function worldPromptBlock() {
    if (!worldHasState()) return "";
    const cfg = worldSettings();
    const state = getWorldState();
    const returning = cfg.showReturning ? findReturning(state, recentText()) : [];
    return sub(renderWorldForPrompt(state, { detail: cfg.injectionDetail, returning, noSecret: notebookEnabled() }));
}

/**
 * What the <Blocks> envelope asks the model to write for World State, or null
 * when the main model is not asked (side-model or manual mode, or block off).
 * @returns {{ rules: string, template: string, mode: string } | null}
 */
export function worldBlockRequest() {
    if (!worldEnabled()) return null;
    if (worldUpdateMode() !== "inline") return null;
    const mode = !stateStore.hasState("world") || stateStore.isPendingFullRewrite("world") ? "bootstrap" : "update";
    const ins = renderWorldInstructions(mode, { noSecret: notebookEnabled() });
    return { rules: sub(ins.rules), template: sub(ins.template), mode };
}

/** The card body for one message: the world as it stood right after it. */
export function worldCardTextAt(msgIndex) {
    if (!worldEnabled()) return "";
    const msg = adapter.getChat()[msgIndex];
    const seq = msg?.extra?.megumin_seq;
    const state = typeof seq === "number" ? stateStore.getStateAt("world", seq) : getWorldState();
    if (isEmptyWorld(state)) return "";
    return sub(renderWorldCard(state, { pcName: sub("{{user}}"), noSecret: notebookEnabled() }));
}

/**
 * The old ledger's shape, for Image Gen and the NPC tag relevance until they
 * are rebuilt on the store (task 006). Only the PRESENT cast has outfits here.
 */
export function getWorldStateCurrent() {
    if (!worldHasState()) return null;
    const s = getWorldState();
    const npcOutfits = {};
    for (const c of presentCast(s)) if (c.fields.outfit) npcOutfits[c.name] = c.fields.outfit;
    return {
        dateTime: s.scene.time || "",
        location: s.scene.location || "",
        weather: s.scene.weather || "",
        pc: {
            name: s.pc.name || sub("{{user}}"),
            outfit: s.pc.fields.outfit || "",
            position: s.pc.fields.position || "",
            condition: s.pc.fields.condition || "",
            carrying: s.pc.fields.carrying || ""
        },
        npcOutfits
    };
}

// ── Card and editor ──────────────────────────────────────────────────────

/**
 * What one message's shown swipe did to the World State, for its card.
 * @returns {null | { entry: object, applied: any[], notes: string[], skipped: string[], missing: boolean, disabled: boolean, noChanges: boolean }}
 */
export function worldCardInfo(msgIndex) {
    if (!worldEnabled() || !adapter.getMeta()) return null;
    const msg = adapter.getChat()[msgIndex];
    const uid = msg?.extra?.megumin_uid;
    if (!msg || msg.is_user || !uid) return null;
    const swipe = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    const entry = stateStore.getEntryFor("world", uid, swipe);
    const sideModel = worldUpdateMode() === "sidemodel";
    const pending = pendingExtract.has(uid + ":" + swipe);
    if (!entry) {
        // Side model: a reply not read yet (or being read right now).
        return sideModel
            ? { entry: null, pending, unread: true, sideModel, applied: [], notes: [], skipped: [], newcomers: [], missing: false, disabled: false, noChanges: false }
            : null;
    }
    const step = entry.disabled ? null : stateStore.getStep("world", uid);
    return {
        entry,
        applied: (step?.applied || []).map(a => ({ ...a, label: sub(a.label) })),
        notes: step?.notes || [],
        skipped: entry.parsed?.skipped || [],
        newcomers: newcomersOf(step),
        missing: Boolean(entry.missing),
        disabled: Boolean(entry.disabled),
        noChanges: Boolean(entry.parsed?.noChanges),
        pending,
        sideModel,
        unread: false
    };
}

// Characters a reply brought in with no "+" line who are still on their own
// now, each with the other characters they might be ("Emma" → "Uncle Emma").
function newcomersOf(step) {
    if (!step || !step.unannounced || !step.unannounced.length) return [];
    const now = getWorldState();
    const cast = Object.values(now.cast || {});
    return step.unannounced
        .filter(name => findCast(now, name)?.name === name)
        .map(name => ({ name, others: cast.map(c => c.name).filter(n => n !== name) }))
        .filter(n => n.others.length);
}

/** The user says `name` is `into`: one character from now on. */
export function worldSameCharacter(name, into) {
    return worldEdit([{ type: "merge", who: name, into }]);
}

/** A manual edit from the editor. Returns the entry, or null with no chat open. */
export function worldEdit(changes) {
    if (!adapter.getMeta() || !Array.isArray(changes) || !changes.length) return null;
    return stateStore.addUserEntry("world", { kind: "delta", changes, skipped: [], noChanges: false });
}

export function worldSetEntryDisabled(entryId, disabled) {
    return stateStore.setDisabled(entryId, disabled);
}

export function worldRemoveUserEntry(entryId) {
    return stateStore.removeUserEntry(entryId);
}

/** History rows, newest first, with each change as a readable line. */
export function worldHistory() {
    const pcLabel = sub("{{user}}");
    return stateStore.listEntries("world").reverse().map(row => ({
        ...row,
        lines: (row.entry.parsed?.changes || []).map(ch => sub(describeWorldChange(ch, pcLabel))).filter(Boolean)
    }));
}

/** Re-reads World blocks from messages from..to (0-based, inclusive). */
export function worldImportRange(fromIndex, toIndex) {
    if (!adapter.getMeta()) return 0;
    return stateStore.importFromChat("world", { fromIndex, toIndex, force: true });
}

export function worldChatOpen() {
    return Boolean(adapter.getMeta());
}

// ── Side-model extraction ────────────────────────────────────────────────
// Mode "sidemodel" (Chomusuke tab: World State route on): the storytelling model
// is never asked for a block. After each reply Chomusuke's worker reads the
// latest exchange and writes
// the update, which is filed under that reply's swipe like any other entry.
// Runs one at a time; a result is dropped if the chat, or that swipe's text,
// changed while it was being written.

const pendingExtract = new Set();          // "uid:swipe" being read right now
let extractQueue = Promise.resolve();
let stateChangedHook = () => {};

/** Called whenever a background extraction starts or lands (cards redraw). */
export function setWorldStateChangedHook(fn) {
    stateChangedHook = typeof fn === "function" ? fn : () => {};
}

function hashText(t) {
    let h = 5381;
    const s = String(t || "");
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ":" + s.length;
}

function swipeText(msg, swipe) {
    if (Array.isArray(msg.swipes) && typeof msg.swipes[swipe] === "string") return msg.swipes[swipe];
    const cur = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    return cur === swipe ? String(msg.mes || "") : null;
}

function proseOnly(text) {
    return String(text || "")
        .replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "")
        .replace(/<Blocks\b[^>]*>[\s\S]*?(<\/Blocks\s*>|$)/gi, "")
        .replace(/<(World_State|World_Update)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, "")
        .replace(/<img\b[^>]*>/gi, "")
        .trim();
}

// The reply plus the user turn(s) that led to it: a player's own message is
// often where their clothes change. A first snapshot gets a little more.
function exchangeFor(index, text, mode) {
    const chat = adapter.getChat();
    const parts = [];
    let aiSeen = 0;
    for (let i = index - 1; i >= 0; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        if (!m.is_user && mode !== "bootstrap") break;
        if (!m.is_user && ++aiSeen > 2) break;
        parts.unshift(`${m.name || (m.is_user ? sub("{{user}}") : "Narrator")}: ${proseOnly(m.mes)}`);
    }
    parts.push(`${adapter.getChat()[index]?.name || "Narrator"}: ${proseOnly(text)}`);
    return parts.join("\n\n");
}

/**
 * Reads one reply with the side model and files the result under its swipe.
 * @param {number} index
 * @param {{ force?: boolean }} [opts] force: read again even if it has an entry
 * @returns {Promise<boolean>} true when an entry was filed
 */
export function worldExtractMessage(index, { force = false } = {}) {
    if (!worldEnabled() || worldUpdateMode() !== "sidemodel" || !adapter.getMeta()) return Promise.resolve(false);
    const msg = adapter.getChat()[index];
    if (!msg || msg.is_user || msg.is_system) return Promise.resolve(false);
    const st = stateStore.stamp(msg);
    if (!st) return Promise.resolve(false);
    // The stamp lives in the message; without a save it would not survive a reload.
    if (st.dirty) adapter.saveChat();
    const uid = st.uid;
    const swipe = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    const text = swipeText(msg, swipe);
    if (text == null) return Promise.resolve(false);            // still generating
    const key = uid + ":" + swipe;
    if (pendingExtract.has(key)) return Promise.resolve(false);
    if (!force && stateStore.getEntryFor("world", uid, swipe)) return Promise.resolve(false);

    const chatId = getContext()?.chatId;
    const hash = hashText(text);
    pendingExtract.add(key);
    stateChangedHook();

    const run = async () => {
        let out = null;
        let req = null;
        let failure = null;
        try {
            // Built when its turn comes, so a queued read sees the entries that
            // landed before it.
            const before = stateStore.getStateAt("world", st.seq - 0.5);
            const mode = isEmptyWorld(before) ? "bootstrap" : "update";
            const noSecret = notebookEnabled();
            const notes = mode === "bootstrap" ? "" : sub(renderWorldForPrompt(before, { detail: "full", noSecret }));
            const built = renderWorldExtractPrompt({ notes, exchange: exchangeFor(index, text, mode), mode, noSecret });
            req = { system: sub(built.system), user: sub(built.user), prefill: built.prefill, job: "world" };
            // The marker is set only once this job has the worker. Chomusuke runs
            // are queued; set while waiting, it would hijack whatever generation
            // is running ahead of it (an image prompt would get this prompt).
            const theReq = req;
            out = await runWithChomusuke("worldState", async () => {
                setActiveWorldExtractRequest(theReq);
                try {
                    return await generateQuietPrompt({ prompt: "___PS_WORLD_EXTRACT___", quietPrompt: "___PS_WORLD_EXTRACT___" });
                } finally {
                    setActiveWorldExtractRequest(null);
                }
            });
        } catch (e) {
            console.error("[Megumin-Suite] World State side-model read failed", e);
            failure = e;
        } finally {
            setActiveWorldExtractRequest(null);
            pendingExtract.delete(key);
        }

        // Same chat, same message, same text? Otherwise the answer is about
        // something that no longer exists.
        const chatNow = adapter.getChat();
        const at = chatNow.findIndex(m => m?.extra?.megumin_uid === uid);
        const textNow = at >= 0 ? swipeText(chatNow[at], swipe) : null;
        if (getContext()?.chatId !== chatId || at < 0 || textNow == null || hashText(textNow) !== hash) {
            console.debug("[Megumin-Suite] World State side-model result dropped: the reply changed or is gone.");
            stateChangedHook();
            return false;
        }

        let cleaned = String(out || "").replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "").trim();
        if (cleaned && req && !/<World_(State|Update)\b/i.test(cleaned)) cleaned = req.prefill + cleaned;
        const parsed = cleaned ? worldModule.parse(cleaned) : null;
        stateStore.recordMessage(at, { source: "sidemodel", expect: true, moduleIds: ["world"], swipe, parsed: parsed || null, raw: cleaned });
        if (!parsed) {
            // null without an error: the worker failed and has said so already.
            if (failure) warnChomusuke("failed", ["worldState"], { error: failure });
            else if (out !== null) warnChomusuke(answerKind(out), ["worldState"]);
        } else if (parsed.skipped.length) {
            console.debug(`[Megumin-Suite] World State (side model): lines not understood in message ${at}:`, parsed.skipped);
        }
        stateChangedHook();
        return true;
    };

    const p = extractQueue.then(run, run);
    extractQueue = p.catch(() => {});
    return p;
}

// ── A reply's read done by another job ───────────────────────────────────
// The combined World State + image call (Chomusuke "Combine calls") reads the
// reply itself. These let it do so with the same guarantees as
// worldExtractMessage: the card shows "Reading…", the notes and exchange are
// built when the job actually runs, and the answer is filed under the reply's
// swipe only if the chat and that swipe's text are unchanged.

/** Marks a reply as being read. Returns a token, or null when there is nothing to read. */
export function worldBeginExternalRead(index) {
    if (!worldEnabled() || worldUpdateMode() !== "sidemodel" || !adapter.getMeta()) return null;
    const msg = adapter.getChat()[index];
    if (!msg || msg.is_user || msg.is_system) return null;
    const st = stateStore.stamp(msg);
    if (!st) return null;
    if (st.dirty) adapter.saveChat();
    const swipe = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    const text = swipeText(msg, swipe);
    if (text == null) return null;
    const key = st.uid + ":" + swipe;
    if (pendingExtract.has(key)) return null;
    pendingExtract.add(key);
    stateChangedHook();
    return { index, uid: st.uid, swipe, seq: st.seq, text, hash: hashText(text), key, chatId: getContext()?.chatId };
}

/** The notes (state BEFORE the reply) and the exchange, built at run time. */
export function worldReadInputs(token) {
    const before = stateStore.getStateAt("world", token.seq - 0.5);
    const mode = isEmptyWorld(before) ? "bootstrap" : "update";
    const noSecret = notebookEnabled();
    const notes = mode === "bootstrap" ? "" : sub(renderWorldForPrompt(before, { detail: "full", noSecret }));
    return { mode, notes, noSecret, exchange: exchangeFor(token.index, token.text, mode) };
}

function findTokenMessage(token) {
    const chatNow = adapter.getChat();
    const at = chatNow.findIndex(m => m?.extra?.megumin_uid === token.uid);
    const textNow = at >= 0 ? swipeText(chatNow[at], token.swipe) : null;
    const same = getContext()?.chatId === token.chatId && at >= 0 && textNow != null && hashText(textNow) === token.hash;
    return same ? at : -1;
}

/**
 * Files the World block of an answer under the reply's swipe.
 * @returns {{ ok: boolean, dropped: boolean }} ok: a usable update was filed;
 *   dropped: the reply changed or is gone (nothing filed, no fallback needed)
 */
export function worldFinishExternalRead(token, raw, prefill = "<World_Update>\n") {
    pendingExtract.delete(token.key);
    const at = findTokenMessage(token);
    if (at < 0) {
        console.debug("[Megumin-Suite] Combined read dropped: the reply changed or is gone.");
        stateChangedHook();
        return { ok: false, dropped: true };
    }
    let cleaned = String(raw || "").replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "").trim();
    // With a prefill the answer starts inside the World block.
    if (cleaned && !/<World_(State|Update)\b/i.test(cleaned)) cleaned = prefill + cleaned;
    const parsed = cleaned ? worldModule.parse(cleaned) : null;
    if (!parsed) { stateChangedHook(); return { ok: false, dropped: false }; }
    stateStore.recordMessage(at, { source: "sidemodel", expect: true, moduleIds: ["world"], swipe: token.swipe, parsed, raw: cleaned });
    if (parsed.skipped.length) console.debug(`[Megumin-Suite] World State (combined): lines not understood in message ${at}:`, parsed.skipped);
    stateChangedHook();
    return { ok: true, dropped: false };
}

/** No usable update and no fallback: record it as missing (the card offers Read again). The caller tells the user. */
export function worldRecordMissing(token) {
    pendingExtract.delete(token.key);
    const at = findTokenMessage(token);
    if (at < 0) return;
    stateStore.recordMessage(at, { source: "sidemodel", expect: true, moduleIds: ["world"], swipe: token.swipe, parsed: null });
    stateChangedHook();
}

// ── ST events ────────────────────────────────────────────────────────────
// Each returns true when something changed, so the caller can redraw cards.
//
// A chat that has never used World State is left alone entirely: no stamps in
// its messages, no empty store in its metadata. Undo handling still runs for a
// chat that HAS a store even while the block is switched off, so turning it
// back on later finds the state consistent.

function hasRoot() {
    const meta = adapter.getMeta();
    return Boolean(meta && meta.megumin_state);
}

function inPlay() {
    return Boolean(adapter.getMeta()) && (worldEnabled() || hasRoot());
}

const NOT_A_REPLY = new Set(["first_message", "command", "impersonate", "quiet"]);

// ── Author's Notebook (plan 010) ─────────────────────────────────────────
// The hidden truths the story model keeps: it writes them after its reply
// (<Notebook> at setup, <Notebook_Update> after), the store keeps them per
// message and swipe, and they come back every turn in Current Info.
//
// On for an engine that keeps one (V11: `notebook: true`), or by the Blocks tab
// switch. Paused per chat: no setup, nothing in the prompt.

function activeEngine() {
    const custom = (extension_settings[extensionName] && extension_settings[extensionName].customModes) || [];
    return [...(hardcodedLogic.modes || []), ...custom].find(m => m.id === localProfile?.mode) || null;
}

/** The engine turns the notebook on by itself (the switch can't turn it off). */
export function notebookForcedByEngine() {
    return engineKeepsNotebook(activeEngine());
}

export function notebookEnabled() {
    if (!localProfile) return false;
    return notebookForcedByEngine() || Boolean(localProfile.notebook && localProfile.notebook.enabled);
}

// There is no per-chat pause any more (it was removed with the tab's "Pause in
// this chat"): V11's text always speaks of its notebook, so it must always have
// one. An old chat's `megumin_notebook.paused` flag is simply ignored.

export function notebookState() {
    return stateStore.getState("notebook");
}

/** "setup", "running" or "off" for the open chat. */
export function notebookCurrentPhase() {
    if (!adapter.getMeta()) return "off";
    return notebookPhase(notebookState(), { on: notebookEnabled() });
}

/** <Author_Notebook> for Current Info, or "". */
export function notebookPromptBlock() {
    if (notebookCurrentPhase() !== "running") return "";
    return sub(renderNotebookForPrompt(notebookState()));
}

/**
 * What the <Blocks> envelope asks for: the setup, or the update rules. null when off.
 * @returns {{ rules: string, template: string, phase: string } | null}
 */
export function notebookBlockRequest() {
    const phase = notebookCurrentPhase();
    if (phase === "setup") {
        return { phase, rules: sub(renderNotebookSetup()), template: "<Notebook>\n[two or three truths, each in the form above]\n</Notebook>" };
    }
    if (phase === "running") {
        // With the Chomusuke route on, the story model only writes new truths.
        const newOnly = notebookViaChomusuke();
        return {
            phase,
            rules: sub(renderNotebookUpdateRules({ newOnly })),
            template: newOnly
                ? "<Notebook_Update>\n[a new truth with its lines; leave this block out when there is none]\n</Notebook_Update>"
                : "<Notebook_Update>\n[change lines; leave this block out when nothing changed]\n</Notebook_Update>"
        };
    }
    return null;
}

/** Chomusuke reads each reply for clues, who learned what, and what came out (Chomusuke tab: Notebook route). */
export function notebookViaChomusuke() {
    const c = localProfile && localProfile.chomusuke;
    if (!c || !c.enabled || !c.profileId || !c.features || c.features.notebook !== true) return false;
    return notebookEnabled();
}

/**
 * What one message's shown swipe did to the notebook, for its card.
 * @returns {null | { entry: object, applied: object[], notes: string[], truths: object, disabled: boolean }}
 *   truths — the notebook right after the message, to draw the truths it wrote
 */
export function notebookCardInfo(msgIndex) {
    if (!adapter.getMeta()) return null;
    const msg = adapter.getChat()[msgIndex];
    const uid = msg?.extra?.megumin_uid;
    if (!msg || msg.is_user || !uid) return null;
    const swipe = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    const pending = pendingNotebook.has(uid + ":" + swipe);
    const entry = stateStore.getEntryFor("notebook", uid, swipe);
    if (!entry && !pending) return null;
    const step = !entry || entry.disabled ? null : stateStore.getStep("notebook", uid);
    return {
        entry,
        applied: step?.applied || [],
        notes: step?.notes || [],
        truths: (step?.state || (entry ? stateStore.getStateAt("notebook", entry.seq) : {})).truths || {},
        disabled: Boolean(entry && entry.disabled),
        // Chomusuke's read: running now, done, or answered with nothing usable.
        pending,
        read: Boolean(entry && entry.source === "sidemodel"),
        missing: Boolean(entry && entry.source === "sidemodel" && entry.missing),
        // A reply with live truths before it is read for them; one with none
        // gets the setup written, unless it wrote its own truths (plan 018).
        canRead: notebookViaChomusuke() && !pending && typeof msg.extra.megumin_seq === "number"
            && Boolean(readKindFor(msg.extra.megumin_seq, swipeText(msg, swipe)))
    };
}

/**
 * What the card draws for a reply whose text has no notebook block but that
 * Chomusuke read: "" when there is no tab to draw (nothing changed).
 */
export function notebookCardTextAt(msgIndex) {
    const info = notebookCardInfo(msgIndex);
    if (!info || !(info.pending || info.read)) return "";
    if (info.pending) return "*Reading this reply for the notebook…*";
    if (info.missing) return "*Nothing usable came back for this reply. Use Read again.*";
    return info.applied.length || info.notes.length || info.disabled ? "*Notebook*" : "";
}

/** Turns a stored turn number into what the reader sees: "#15", "your edit", "a deleted message". */
export function notebookTurnLabel() {
    const seqToIndex = new Map();
    adapter.getChat().forEach((m, i) => {
        if (m && !m.is_user && typeof m.extra?.megumin_seq === "number") seqToIndex.set(m.extra.megumin_seq, i);
    });
    const userSeqs = new Set((stateStore.listEntries("notebook") || []).filter(x => x.entry.source === "user").map(x => x.entry.seq));
    return notebookTurnLabeler({ seqToIndex, userSeqs });
}

/** Revert (or restore) what one reply did to the notebook. */
export function notebookSetEntryDisabled(entryId, disabled) {
    return stateStore.setDisabled(entryId, disabled);
}

/**
 * A change from The Notebook tab (edit, forget, reveal, restore), kept as the
 * user's own entry so swipes and rewinds never undo it.
 */
export function notebookEdit(op) {
    if (!adapter.getMeta() || !op) return null;
    return stateStore.addUserEntry("notebook", { ops: [op] });
}

function notebookInPlay() {
    return Boolean(adapter.getMeta()) && (notebookEnabled() || stateStore.hasState("notebook"));
}

// Most replies write nothing to the notebook, so a reply with no block is not
// "missing" anything: nothing is recorded for it.
// A reply Chomusuke already read keeps Chomusuke's lines when its text is
// recorded again (an edit, a continue): only the reply's own part is re-read.
function notebookRecord(index) {
    const msg = adapter.getChat()[index];
    if (!msg || msg.is_user || msg.is_system) return;
    const uid = msg.extra?.megumin_uid;
    const swipe = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    const e = uid ? stateStore.getEntryFor("notebook", uid, swipe) : null;
    const part = e && e.source === "sidemodel" ? notebookReadPart(e.raw) : "";
    if (part) { fileNotebookRead(index, swipe, String(msg.mes || ""), part); return; }
    stateStore.recordMessage(index, { moduleIds: ["notebook"] });
}

// ── The notebook read (plan 010, phase 5) ──
// Same shape as the blocks read: begin (claims the reply's swipe), notes
// (built when the worker is free), finish (files the answer, or drops it when
// the reply changed or is gone).

const pendingNotebook = new Set();

function fileNotebookRead(at, swipe, replyText, block) {
    const parsed = parseNotebookRead(replyText, block) || { kind: "delta", ops: [] };
    stateStore.recordMessage(at, { source: "sidemodel", moduleIds: ["notebook"], swipe, parsed, raw: joinNotebookRead(replyText, block) });
}

// What Chomusuke does for a reply: "read" it against the live truths, write
// the "setup" when there were none and the reply wrote none (plan 018), or
// nothing (null).
function readKindFor(seq, text) {
    if (text == null) return null;
    if (liveTruths(stateStore.getStateAt("notebook", seq - 0.5)).length) {
        return replyWroteNotebookChanges(text) ? null : "read";
    }
    return replyWroteTruths(text) ? null : "setup";
}

/** The same, for a reply by its index, before anything is claimed. */
export function notebookReadKind(index) {
    if (!notebookViaChomusuke() || !adapter.getMeta()) return null;
    const msg = adapter.getChat()[index];
    if (!msg || msg.is_user || msg.is_system) return null;
    const swipe = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    const text = swipeText(msg, swipe);
    // Not stamped yet: the reply is the newest thing in the chat, so the
    // notebook as it stands now is the notebook before it.
    const seq = typeof msg.extra?.megumin_seq === "number" ? msg.extra.megumin_seq : Infinity;
    return readKindFor(seq, text);
}

/**
 * Claims one reply for a notebook read. Null when there is nothing to do:
 * route off, or the reply wrote its own lines (clue lines, or at setup its own
 * truths). token.kind is "read" or "setup".
 */
export function notebookBeginRead(index, { force = false } = {}) {
    if (!notebookViaChomusuke() || !adapter.getMeta()) return null;
    const msg = adapter.getChat()[index];
    if (!msg || msg.is_user || msg.is_system) return null;
    const st = stateStore.stamp(msg);
    if (!st) return null;
    if (st.dirty) adapter.saveChat();
    const swipe = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    const text = swipeText(msg, swipe);
    const kind = readKindFor(st.seq, text);
    if (!kind) return null;
    const key = st.uid + ":" + swipe;
    if (pendingNotebook.has(key)) return null;
    const e = stateStore.getEntryFor("notebook", st.uid, swipe);
    if (!force && e && e.source === "sidemodel") return null;
    pendingNotebook.add(key);
    stateChangedHook();
    return { index, uid: st.uid, swipe, seq: st.seq, text, hash: hashText(text), key, chatId: getContext()?.chatId, kind };
}

/** <Author_Notebook> as it stood before the reply, for the worker. */
export function notebookReadNotes(token) {
    return sub(renderNotebookForPrompt(stateStore.getStateAt("notebook", token.seq - 0.5)));
}

/**
 * Files Chomusuke's answer with the reply's own notebook lines.
 * @returns {{ ok: boolean, dropped: boolean }}
 */
export function notebookFinishRead(token, raw) {
    pendingNotebook.delete(token.key);
    const at = findTokenMessage(token);
    if (at < 0) {
        console.debug("[Megumin-Suite] Notebook read dropped: the reply changed or is gone.");
        stateChangedHook();
        return { ok: false, dropped: true };
    }
    const ans = token.kind === "setup" ? notebookSetupAnswerBlock(raw) : notebookAnswerBlock(raw);
    if (!ans) { stateChangedHook(); return { ok: false, dropped: false }; }
    fileNotebookRead(at, token.swipe, token.text, ans.block);
    stateChangedHook();
    return { ok: true, dropped: false };
}

/** No usable answer: the reply's own lines stay, and the card offers Read again. */
export function notebookRecordMissing(token) {
    pendingNotebook.delete(token.key);
    const at = findTokenMessage(token);
    if (at < 0) { stateChangedHook(); return; }
    stateStore.recordMessage(at, { source: "sidemodel", expect: true, moduleIds: ["notebook"], swipe: token.swipe, parsed: parseNotebook(token.text) });
    stateChangedHook();
}

/** Gives up a claimed read without filing anything. */
export function notebookAbandonRead(token) {
    if (token) pendingNotebook.delete(token.key);
    stateChangedHook();
}

function notebookOnReceived(messageId) {
    if (!notebookEnabled() || !adapter.getMeta()) return;
    const chat = adapter.getChat();
    const index = typeof messageId === "number" ? messageId : chat.length - 1;
    stateStore.reconcile();
    notebookRecord(index);
}

// ── Bonds, Sheet, Inner Chatter, Story Tracker (plan 008) ────────────────
// Kept from the blocks in each reply, so the story model can be handed the
// true values ("Current Info") instead of reading its own old blocks.

export const STAT_MODULES = ["bonds", "sheet", "chatter", "tracker", "cyoa"];
const STAT_MODULE_DEFS = { bonds: bondsModule, sheet: sheetModule, chatter: chatterModule, tracker: trackerModule, cyoa: cyoaModule };

// ── Blocks written by Chomusuke (plan 009) ──
// The blocks Chomusuke can take off the story model, and their tags.
export const BLOCK_ROUTE_TAGS = { bonds: "Bonds", sheet: "Character_Sheet", chatter: "NPC_Inner_Chatter", cyoa: "CYOA" };

/** Chomusuke writes this block (Chomusuke on, Blocks route on, this block's switch on, block in the stack). */
export function blockViaChomusuke(id) {
    const c = localProfile && localProfile.chomusuke;
    if (!c || !c.enabled || !c.profileId || !c.features || c.features.blocks !== true) return false;
    if (!(id in BLOCK_ROUTE_TAGS)) return false;
    if (c.blockRoutes && c.blockRoutes[id] === false) return false;
    return statBlockOn(id);
}

/** Does this text carry the module's block (the reply wrote it itself)? */
export function statsModuleParses(id, text) {
    const m = STAT_MODULE_DEFS[id];
    return Boolean(m && m.parse(String(text || "")));
}

export function routedBlockIds() {
    return Object.keys(BLOCK_ROUTE_TAGS).filter(blockViaChomusuke);
}

/** The block is switched on (the Story Tracker follows the Story Plan). */
export function statBlockOn(id) {
    if (!localProfile) return false;
    if (id === "tracker") return Boolean(localProfile.storyPlan && localProfile.storyPlan.enabled);
    const order = (localProfile.blockStack && localProfile.blockStack.order) || [];
    return order.includes(id);
}

function statsInPlay() {
    return Boolean(adapter.getMeta()) && STAT_MODULES.some(statBlockOn);
}

// All four are recorded while any one is on: reading costs nothing, and a block
// switched on later then finds its history already kept.
// A block Chomusuke writes is recorded from the reply only when the reply wrote
// it anyway; otherwise recording "nothing" would wipe what Chomusuke wrote.
function statsRecord(index) {
    const msg = adapter.getChat()[index];
    if (!msg || msg.is_user || msg.is_system) return;
    const text = String(msg.mes || "");
    const ids = STAT_MODULES.filter(id => !blockViaChomusuke(id) || STAT_MODULE_DEFS[id].parse(text));
    if (ids.length) stateStore.recordMessage(index, { moduleIds: ids });
}

function statsOnReceived(messageId) {
    if (!statsInPlay()) return;
    const chat = adapter.getChat();
    const index = typeof messageId === "number" ? messageId : chat.length - 1;
    stateStore.reconcile();
    statsRecord(index);
}

function statsOnChatLoaded() {
    if (!statsInPlay()) return;
    const imported = [];
    for (const id of STAT_MODULES) {
        stateStore.reparseStale(id);
        if (!stateStore.root()?.imported?.[id]) {
            const n = stateStore.importFromChat(id);
            if (n > 0) imported.push(`${id} (${n})`);
        }
    }
    if (imported.length) console.log(`[Megumin-Suite] Picked up from this chat's existing messages: ${imported.join(", ")}.`);
}

// Whose bonds the story is handed right now (record keys).
function bondsInPlay(state, recentText) {
    const present = worldHasState()
        ? presentCast(getWorldState()).flatMap(c => [c.name, ...(c.aliases || [])])
        : [];
    const entries = stateStore.activeEntries("bonds").filter(e => !e.missing);
    const last = entries[entries.length - 1];
    const latestNames = (last && last.parsed && last.parsed.people || []).map(p => p.name);
    return pickBondsFor(state, { present, recentText, latestNames });
}

/**
 * Every character's bonds on file, for the overview popup: the ones the story
 * is handed right now first, then the most recently seen.
 * @param {{ recentText?: string }} opts
 * @returns {Array<{ name: string, fields: object[], inPlay: boolean }>}
 */
export function bondsOverview({ recentText = "" } = {}) {
    if (!adapter.getMeta() || !stateStore.hasState("bonds")) return [];
    const state = stateStore.getState("bonds");
    const now = new Set(bondsInPlay(state, recentText));
    return Object.entries(state.people || {})
        .map(([k, p]) => ({ name: p.name, fields: Object.values(p.fields || {}), inPlay: now.has(k), seq: p.seq || 0 }))
        .sort((a, b) => (b.inPlay - a.inPlay) || (b.seq - a.seq) || a.name.localeCompare(b.name));
}

// ── The blocks read (plan 009) ───────────────────────────────────────────
// Same shape as the World State side read: begin (claims the reply's swipe),
// inputs (built when the worker is free), finish (files the answer, or drops it
// when the reply changed or is gone).

const pendingBlocks = new Set();

/** Claims one reply for a blocks read. Null when there is nothing to read. */
export function blocksBeginRead(index, { force = false } = {}) {
    const ids = routedBlockIds();
    if (!ids.length || !adapter.getMeta()) return null;
    const msg = adapter.getChat()[index];
    if (!msg || msg.is_user || msg.is_system) return null;
    const st = stateStore.stamp(msg);
    if (!st) return null;
    if (st.dirty) adapter.saveChat();
    const swipe = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    const text = swipeText(msg, swipe);
    if (text == null) return null;
    // A reply that wrote every routed block itself needs no read.
    const needed = ids.filter(id => !STAT_MODULE_DEFS[id].parse(text));
    if (!needed.length) return null;
    const key = st.uid + ":" + swipe;
    if (pendingBlocks.has(key)) return null;
    if (!force && needed.every(id => stateStore.getEntryFor(id, st.uid, swipe))) return null;
    pendingBlocks.add(key);
    stateChangedHook();
    return { index, uid: st.uid, swipe, seq: st.seq, text, hash: hashText(text), key, chatId: getContext()?.chatId, ids: needed };
}

/** Is this reply's blocks read running now (for its card)? */
export function blocksReadPending(msgIndex) {
    const msg = adapter.getChat()[msgIndex];
    const uid = msg?.extra?.megumin_uid;
    if (!uid) return false;
    const swipe = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    return pendingBlocks.has(uid + ":" + swipe);
}

/**
 * The notes as they stood before this reply, for the worker.
 * @param {object} token
 * @param {string} exchangeText  the latest exchange, for whose bonds are needed
 */
export function blocksReadNotes(token, exchangeText = "") {
    const bonds = token.ids.includes("bonds") ? stateStore.getStateAt("bonds", token.seq - 0.5) : null;
    const sheet = token.ids.includes("sheet") ? stateStore.getStateAt("sheet", token.seq - 0.5) : null;
    let bondsText = "";
    if (bonds && Object.keys(bonds.people || {}).length) {
        const present = worldHasState() ? presentCast(getWorldState()).flatMap(c => [c.name, ...(c.aliases || [])]) : [];
        bondsText = renderBondsNotes(bonds, pickBondsFor(bonds, { present, recentText: exchangeText }));
    }
    const sheetText = sheet ? renderSheetNotes(sheet) : "";
    return sub(renderWorkerNotes({ bonds: bondsText, sheet: sheetText }));
}

/**
 * Files the worker's answer: each routed block under the reply's swipe, or a
 * "missing" note when the answer had none for it.
 * @returns {{ ok: boolean, dropped: boolean, found: string[] }}
 */
export function blocksFinishRead(token, raw) {
    pendingBlocks.delete(token.key);
    const at = findTokenMessage(token);
    if (at < 0) {
        console.debug("[Megumin-Suite] Blocks read dropped: the reply changed or is gone.");
        stateChangedHook();
        return { ok: false, dropped: true, found: [] };
    }
    const cleaned = cleanWorkerAnswer(raw);
    const found = [];
    for (const id of token.ids) {
        const block = blockTextIn(cleaned, BLOCK_ROUTE_TAGS[id]);
        const parsed = block ? STAT_MODULE_DEFS[id].parse(block) : null;
        if (parsed) found.push(id);
        stateStore.recordMessage(at, { source: "sidemodel", expect: true, moduleIds: [id], swipe: token.swipe, parsed: parsed || null, raw: block });
    }
    stateChangedHook();
    return { ok: found.length > 0, dropped: false, found };
}

/** Gives up a claimed read without filing anything. */
export function blocksAbandonRead(token) {
    if (token) pendingBlocks.delete(token.key);
    stateChangedHook();
}

/**
 * The blocks Chomusuke wrote (or is writing) for one message, for its card:
 * tag → { id, status: "ok" | "pending" | "missing", body }. Only blocks the reply
 * did not write itself, and only where Chomusuke was asked (an old message from
 * before the route gets nothing).
 */
export function blocksCardTextAt(msgIndex) {
    const out = {};
    if (!adapter.getMeta()) return out;
    const msg = adapter.getChat()[msgIndex];
    const uid = msg?.extra?.megumin_uid;
    if (!uid || msg.is_user || msg.is_system) return out;
    const swipe = typeof msg.swipe_id === "number" ? msg.swipe_id : 0;
    const text = String(msg.mes || "");
    const pending = pendingBlocks.has(uid + ":" + swipe);
    for (const [id, tag] of Object.entries(BLOCK_ROUTE_TAGS)) {
        if (STAT_MODULE_DEFS[id].parse(text)) continue;
        const e = stateStore.getEntryFor(id, uid, swipe);
        const body = e && typeof e.raw === "string"
            ? e.raw.replace(new RegExp(`^\\s*<${tag}\\b[^>]*>\\s*`, "i"), "").replace(new RegExp(`\\s*<\\/${tag}\\s*>\\s*$`, "i"), "").trim()
            : "";
        if (pending && blockViaChomusuke(id)) out[tag] = { id, status: "pending", body };
        else if (e && e.source === "sidemodel" && !e.missing && body) out[tag] = { id, status: "ok", body };
        else if (e && e.source === "sidemodel" && e.missing) out[tag] = { id, status: "missing", body: "" };
    }
    return out;
}

// ── Bonds / Sheet editor (plan 008) ──────────────────────────────────────

/** The state now ("bonds" | "sheet"), or its empty shape. */
export function statsState(moduleId) {
    if (!adapter.getMeta()) return null;
    return stateStore.getState(moduleId);
}

/** An edit from the editor: kept as the user's own change, never undone by swipes. */
export function statsEdit(moduleId, parsed) {
    if (!adapter.getMeta() || !STAT_MODULES.includes(moduleId) || !parsed) return null;
    return stateStore.addUserEntry(moduleId, parsed);
}


/**
 * What Current Info carries besides World State, for the blocks that are on:
 * bonds for the characters the story needs now, the player's sheet, and the
 * last Inner Chatter and Story Tracker. Empty strings when there is nothing.
 * @param {{ recentText?: string }} opts  the last few messages, blocks removed
 */
export function statsPromptParts({ recentText = "" } = {}) {
    const out = { bonds: "", sheet: "", chatter: "", tracker: "" };
    if (!adapter.getMeta()) return out;
    if (statBlockOn("bonds") && stateStore.hasState("bonds")) {
        const state = stateStore.getState("bonds");
        out.bonds = renderBondsNotes(state, bondsInPlay(state, recentText));
    }
    if (statBlockOn("sheet") && stateStore.hasState("sheet")) out.sheet = renderSheetNotes(stateStore.getState("sheet"));
    if (statBlockOn("chatter") && stateStore.hasState("chatter")) out.chatter = stateStore.getState("chatter").text || "";
    if (statBlockOn("tracker") && stateStore.hasState("tracker")) out.tracker = stateStore.getState("tracker").text || "";
    return out;
}

// Manual mode: the state is read, never written by replies.
function repliesUpdate() {
    return worldEnabled() && worldUpdateMode() !== "manual";
}

/**
 * @param {{ skipSideRead?: boolean }} [opts] skipSideRead: the combined World State +
 *   image call reads this reply instead of a separate Chomusuke read.
 */
export function stateOnMessageReceived(messageId, type, { skipSideRead = false } = {}) {
    statsOnReceived(messageId);
    notebookOnReceived(messageId);
    if (!repliesUpdate() || !adapter.getMeta()) return false;
    const chat = adapter.getChat();
    const index = typeof messageId === "number" ? messageId : chat.length - 1;
    const msg = chat[index];
    if (!msg || msg.is_user || msg.is_system) return false;
    stateStore.reconcile();
    const mode = worldUpdateMode();
    if (mode === "sidemodel") {
        // A reply that wrote its own block anyway is taken as it is; otherwise
        // the side model reads it (not awaited: the chat must not wait on it).
        if (worldModule.parse(String(msg.mes || ""))) {
            stateStore.recordMessage(index, { moduleIds: ["world"] });
            return true;
        }
        if (!NOT_A_REPLY.has(type) && !skipSideRead) worldExtractMessage(index, { force: type === "continue" });
        return false;
    }
    const expect = mode === "inline" && !NOT_A_REPLY.has(type);
    const { recorded } = stateStore.recordMessage(index, { expect, moduleIds: ["world"] });
    for (const e of recorded) {
        if (e.parsed.skipped.length) console.debug(`[Megumin-Suite] World State: lines not understood in message ${index}:`, e.parsed.skipped);
    }
    return recorded.length > 0;
}

// Swiping switches which swipe's changes count; a swipe that was never
// recorded (older than this feature, or an alternate greeting) is parsed now.
// A swipe being generated is left to MESSAGE_RECEIVED — see store.onSwiped for
// why its text must not be read here.
export function stateOnSwiped(messageId) {
    const chat = adapter.getChat();
    const index = typeof messageId === "number" ? messageId : chat.length - 1;
    if (statsInPlay()) stateStore.onSwiped(index, { moduleIds: STAT_MODULES });
    if (notebookInPlay()) stateStore.onSwiped(index, { moduleIds: ["notebook"] });
    if (!inPlay()) return false;
    if (!repliesUpdate()) {
        stateStore.reconcile();
        return true;
    }
    stateStore.onSwiped(index, { moduleIds: ["world"] });
    return true;
}

export function stateOnSwipeDeleted(data) {
    if (!inPlay() || !data) return false;
    stateStore.onSwipeDeleted(data.messageId, data.swipeId);
    stateStore.reconcile();
    return true;
}

export function stateOnEdited(messageId) {
    if (statsInPlay()) statsRecord(messageId);
    if (notebookInPlay()) notebookRecord(messageId);
    if (!repliesUpdate() || !adapter.getMeta()) return false;
    const msg = adapter.getChat()[messageId];
    if (!msg || msg.is_user) return false;
    const mode = worldUpdateMode();
    // Side model: an edit keeps the entry the side model wrote, unless the edit
    // itself put a World block in (then that is what the user meant). "Read
    // again" on the card re-reads the edited text.
    if (mode === "sidemodel" && !worldModule.parse(String(msg.mes || ""))) return false;
    const expect = mode === "inline";
    const { folded } = stateStore.recordMessage(messageId, { expect, moduleIds: ["world"] });
    if (folded) toastr.info("That message is older than the undo window, so editing it no longer changes the World State. Use the World State editor instead.", "Megumin Suite");
    return !folded;
}

export function stateOnDeleted() {
    if (!inPlay()) return false;
    const { orphaned, dropped } = stateStore.reconcile();
    const kept = orphaned.filter(e => e.module === "world" && !e.missing && e.parsed.changes.length).length;
    if (kept) {
        toastr.info(
            `World State changes from ${kept} deleted message${kept === 1 ? " were" : "s were"} kept. Old messages being removed doesn't undo the story.`,
            "Megumin Suite"
        );
    }
    return orphaned.length > 0 || dropped.length > 0;
}

/** Chat opened or reloaded: stamp, square with deletions made meanwhile, one-time import. */
export function stateOnChatLoaded() {
    statsOnChatLoaded();
    if (notebookInPlay()) stateStore.reparseStale("notebook");
    if (!inPlay()) return false;
    if (worldEnabled()) stateStore.stampAll();
    stateStore.reconcile();
    const redone = stateStore.reparseStale("world");
    if (redone) console.log(`[Megumin-Suite] World State: re-read ${redone} entr${redone === 1 ? "y" : "ies"} with the improved parser.`);
    if (worldEnabled() && !stateStore.root()?.imported?.world) {
        const n = stateStore.importFromChat("world");
        if (n > 0) {
            toastr.info(`Picked up the World State from this chat's existing messages (${n}).`, "Megumin Suite");
        }
    }
    return true;
}
