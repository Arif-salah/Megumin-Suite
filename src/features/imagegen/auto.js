// ────────────────────────────────────────────────────────────────────────────
// Automatic images written by Chomusuke.
//
// When Chomusuke's Image Generation route is on, the story model is not asked
// for an <img prompt> tag at all (its reply stays pure story). After the reply
// lands, Chomusuke writes the image prompt, the same way the manual button does,
// and the image goes into that reply (or a new message, per "where images go").
// The trigger settings still decide WHEN: every reply, every N replies, or only
// when someone takes or shares a picture (Chomusuke answers NONE otherwise).
// ────────────────────────────────────────────────────────────────────────────

import { getContext, saveChat, updateMessageBlock } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { setActiveImageGenRequest } from "../../core/activeRequests.js";
import { runWithChomusuke } from "../../engine/tasks.js";
import { warnChomusuke, answerKind } from "../../engine/chomusukeNotice.js";
import { meguminScheduleBlocksRefresh } from "../blocks/chat.js";
import { igGenerateWithComfy } from "./comfy.js";
import { insertAtSlot } from "./slot.js";

/** Chomusuke writes the automatic image prompts (Chomusuke tab: Image Generation on). */
export function imageViaChomusuke() {
    const c = localProfile && localProfile.chomusuke;
    return Boolean(c && c.enabled && c.profileId && (!c.features || c.features.imageGen !== false));
}

export const NOT_A_REPLY = new Set(["first_message", "command", "impersonate", "quiet"]);

/** Is an automatic image due for the reply that just arrived? */
export function dueNow(ig, chat) {
    const mode = ig.triggerMode || "always";
    if (mode === "manual") return false;
    if (mode === "frequency") {
        const aiCount = chat.filter(m => !m.is_user && !m.is_system).length;
        const freq = parseInt(ig.autoGenFreq) || 1;
        return aiCount % freq === 0;
    }
    return true; // always, conditional (Chomusuke decides)
}

export const ONLY_IF_PHOTO = "Only if someone in the latest reply takes, sends or shares a picture should there be an image. If nobody does, output exactly: NONE";

export const placeholderHtml = id =>
    `<div id="${id}" class="kazuma-img-placeholder" style="color:var(--gold); font-style: italic; margin: 10px 0;">[Generating Image...]</div>`;

export function redraw(index, message) {
    if (typeof updateMessageBlock === "function") {
        updateMessageBlock(index, message);
        meguminScheduleBlocksRefresh();
    }
}

/** Takes a "[Generating Image...]" placeholder back out of whichever message holds it. */
export async function removePlaceholder(id) {
    const now = getContext().chat || [];
    const at = now.findIndex(m => typeof m?.mes === "string" && m.mes.includes(`id="${id}"`));
    if (at < 0) return;
    now[at].mes = now[at].mes.replace(new RegExp(`\\s*<div id="${id}"[^>]*>[\\s\\S]*?<\\/div>\\s*`), "\n\n").trim();
    await saveChat();
    redraw(at, now[at]);
}

/** Puts a placeholder where the image will go (Inline mode). */
export async function insertPlaceholder(index, message, id, placement) {
    message.mes = insertAtSlot(message.mes, placeholderHtml(id), placement === "random" ? "random" : "end");
    await saveChat();
    redraw(index, message);
}

/** The prompt out of an answer that may still carry an <img prompt="..."> wrapper. */
export function unwrapImgTag(prompt) {
    const tag = String(prompt || "").match(/<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/i);
    return (tag ? tag[2] : String(prompt || "")).trim();
}

/**
 * Called on MESSAGE_RECEIVED. Does nothing unless images are on, Chomusuke
 * writes them, the reply is a real reply, and an image is due.
 * @param {number} messageId
 * @param {string} type  ST's MESSAGE_RECEIVED type
 * @param {() => Promise<string>|((opts: object) => Promise<string>)} writePrompt  the engine's prompt writer
 * @param {() => Promise<void>} [prepare]  work needing its own Chomusuke call, run BEFORE the writer's job
 */
export async function igAutoImageForReply(messageId, type, writePrompt, prepare = null) {
    const ig = localProfile && localProfile.imageGen;
    if (!ig || !ig.enabled || !imageViaChomusuke() || NOT_A_REPLY.has(type)) return;
    const chat = getContext().chat || [];
    const index = typeof messageId === "number" ? messageId : chat.length - 1;
    const message = chat[index];
    if (!message || message.is_user || message.is_system) return;
    if (!dueNow(ig, chat)) return;

    const inline = (ig.injectMode || "new_msg") === "inline";
    const id = `kazuma-img-${Date.now()}-auto`;

    // Show where the image will be while Chomusuke writes its prompt.
    if (inline) {
        message.mes = insertAtSlot(message.mes, placeholderHtml(id), ig.autoPlacement === "random" ? "random" : "end");
        await saveChat();
        redraw(index, message);
    }

    // Let a World State read started for this same reply queue first, so the
    // image is resolved against the outfits that read produces.
    await new Promise(r => setTimeout(r, 0));

    let prompt = "";
    let raw = null;
    let failure = null;
    try {
        const conditional = (ig.triggerMode || "always") === "conditional";
        if (prepare) await prepare();
        raw = await runWithChomusuke("imageGen", () => writePrompt({ extraInstruction: conditional ? ONLY_IF_PHOTO : "" }));
        prompt = String(raw || "");
        const tag = prompt.match(/<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/i);
        if (tag) prompt = tag[2];
        prompt = prompt.trim();
    } catch (e) {
        console.error("[Megumin-Suite] Automatic image prompt failed", e);
        failure = e;
    } finally {
        setActiveImageGenRequest(null);
    }

    // Nothing to draw (NONE, an empty answer, or a failure): take the placeholder out.
    if (!prompt || /^none\.?$/i.test(prompt)) {
        if (inline) await removePlaceholder(id);
        // NONE is an answer. null without an error: the worker said so already.
        if (failure) warnChomusuke("failed", ["imageGen"], { error: failure });
        else if (!prompt && raw !== null) warnChomusuke(answerKind(raw), ["imageGen"]);
        return;
    }

    toastr.info("Sending to ComfyUI...", "Megumin Suite");
    igGenerateWithComfy(prompt, {
        message,
        index,
        mode: inline ? "inline" : "new_msg",
        isInlineAuto: true,
        placeholderId: id
    });
}
