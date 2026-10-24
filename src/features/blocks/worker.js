// ────────────────────────────────────────────────────────────────────────────
// Blocks written by Chomusuke (plan 009).
//
// When the Chomusuke tab routes a block (Bonds, Character Sheet, NPC Inner
// Chatter, CYOA) to the worker, the story model is no longer asked for it, and
// after each reply Chomusuke reads the reply and writes it. The answer is filed
// in the state store under the reply's swipe, so Current Info, the cards, the
// editor and swipes all work as they do for blocks the story model wrote.
//
// Queued one read at a time, like the World State read; a read whose reply
// changed or disappeared meanwhile is dropped.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, generateQuietPrompt, substituteParams } from "../../st.js";
import { runWithChomusuke } from "../../engine/tasks.js";
import { warnChomusuke, answerKind } from "../../engine/chomusukeNotice.js";
import { setActiveWorldExtractRequest } from "../../core/activeRequests.js";
import { meguminCleanChatHistoryText } from "../../engine/chatText.js";
import { buildBaseDict } from "../../engine/buildBaseDict.js";
import { blocksBeginRead, blocksReadNotes, blocksFinishRead, blocksAbandonRead, BLOCK_ROUTE_TAGS, routedBlockIds } from "../../state/index.js";
import { renderBlocksWorkerPrompt } from "../../state/modules/stats/worker.js";
import { meguminBlockById, meguminBlockTemplateBody } from "./registry.js";
import { meguminScheduleBlocksRefresh } from "./chat.js";

const sub = t => { try { return substituteParams(t); } catch (e) { return t; } };
export const NOT_A_REPLY = new Set(["first_message", "command", "impersonate", "quiet"]);

// The latest exchange: the user turn(s) just before the reply, then the reply.
export function exchangeText(index, replyText) {
    const chat = getContext().chat || [];
    let start = index;
    while (start - 1 >= 0 && chat[start - 1] && (chat[start - 1].is_user || chat[start - 1].is_system)) start--;
    const lines = chat.slice(start, index).filter(m => m && m.is_user)
        .map(m => `${m.name}: ${meguminCleanChatHistoryText(m.mes)}`);
    const reply = chat[index];
    lines.push(`${reply ? reply.name : ""}: ${meguminCleanChatHistoryText(replyText)}`);
    return lines.join("\n\n");
}

// The messages before the latest exchange, for context.
export function earlierText(index, count = 4) {
    const chat = getContext().chat || [];
    let start = index;
    while (start - 1 >= 0 && chat[start - 1] && (chat[start - 1].is_user || chat[start - 1].is_system)) start--;
    return chat.slice(0, start).filter(m => m && !m.is_system).slice(-count)
        .map(m => `${m.name}: ${meguminCleanChatHistoryText(m.mes)}`).join("\n\n");
}

/** Each routed block's template, as the story model would have been given it. */
export function blocksTasksFor(ids) {
    let dict = {};
    try { dict = buildBaseDict(true); } catch (e) { console.warn("[Megumin-Suite] Blocks read: templates unavailable.", e); }
    return ids.map(id => {
        const def = meguminBlockById(id);
        return { tag: BLOCK_ROUTE_TAGS[id], body: def ? sub(meguminBlockTemplateBody(def, dict)) : "" };
    }).filter(t => t.body);
}

let queue = Promise.resolve();

/**
 * Chomusuke reads one reply and writes its routed blocks.
 * @param {number} index
 * @param {{ force?: boolean }} [opts]  force: read again even if already read
 * @returns {Promise<boolean>}
 */
export function blocksReadForReply(index, { force = false } = {}) {
    if (!routedBlockIds().length) return Promise.resolve(false);
    const token = blocksBeginRead(index, { force });
    if (!token) return Promise.resolve(false);
    meguminScheduleBlocksRefresh();

    const run = async () => {
        let raw = "";
        try {
            raw = await runWithChomusuke("blocks", async () => {
                // Built when this job has the worker, so it sees whatever landed before it.
                const exchange = exchangeText(token.index, token.text);
                const built = renderBlocksWorkerPrompt({
                    notes: blocksReadNotes(token, exchange),
                    earlier: earlierText(token.index),
                    exchange,
                    tasks: blocksTasksFor(token.ids)
                });
                setActiveWorldExtractRequest({ system: sub(built.system), user: sub(built.user), job: "blocks" });
                try {
                    return await generateQuietPrompt({ prompt: "___PS_WORLD_EXTRACT___", quietPrompt: "___PS_WORLD_EXTRACT___" });
                } finally {
                    setActiveWorldExtractRequest(null);
                }
            });
        } catch (e) {
            console.error("[Megumin-Suite] Blocks read failed", e);
            warnChomusuke("failed", ["blocks"], { error: e });
            blocksAbandonRead(token);
            meguminScheduleBlocksRefresh();
            return false;
        }
        const res = blocksFinishRead(token, raw);
        // null: the worker failed and has said so already.
        if (!res.ok && !res.dropped && raw !== null) warnChomusuke(answerKind(raw), ["blocks"]);
        meguminScheduleBlocksRefresh();
        return res.ok;
    };
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
}
