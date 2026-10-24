// ────────────────────────────────────────────────────────────────────────────
// Everything a reply needs from Chomusuke in ONE call (Chomusuke tab →
// Combine calls). Plan 009 widened it from "World State + image" to any of:
//   • the World State read (World State route on),
//   • the blocks Chomusuke writes (Blocks route on: Bonds, Sheet, Chatter, CYOA),
//   • the notebook read (Notebook route on, plan 010),
//   • the automatic image, on replies that get one (Image Generation route on).
// When a reply needs two or more of them, one call does them all; a reply that
// needs only one keeps its own call. So every reply costs at most one call.
//
// After the answer, in order:
//   1. the World Update is filed under the reply's swipe (or, when missing,
//      a separate read runs if the fallback is on, else "no update" is noted);
//   2. the blocks are filed the same way;
//   3. the notebook lines are filed with the reply's own;
//   4. V2: outfit tags and new looks are saved against the NEW outfits;
//   5. the image prompt goes to ComfyUI (V2 fills in @Name from the updated
//      World State; Classic sends it as written).
// ────────────────────────────────────────────────────────────────────────────

import { getContext, generateQuietPrompt, substituteParams } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { setActiveImageGenRequest } from "../../core/activeRequests.js";
import { runWithChomusuke } from "../../engine/tasks.js";
import { warnChomusuke, answerKind } from "../../engine/chomusukeNotice.js";
import { meguminCleanChatHistoryText } from "../../engine/chatText.js";
import {
    worldEnabled, worldUpdateMode, worldBeginExternalRead, worldReadInputs,
    worldFinishExternalRead, worldRecordMissing, worldExtractMessage,
    routedBlockIds, blocksBeginRead, blocksReadNotes, blocksFinishRead,
    notebookViaChomusuke, notebookBeginRead, notebookReadNotes, notebookFinishRead, notebookRecordMissing,
    notebookReadKind
} from "../../state/index.js";
import { notebookReadForReply, notebookSheetText } from "../notebook/worker.js";
import { renderNotebookClerkTask, renderNotebookSetupTask } from "../../state/modules/notebook/worker.js";
import { blocksTasksFor, blocksReadForReply, exchangeText } from "../blocks/worker.js";
import { meguminScheduleBlocksRefresh } from "../blocks/chat.js";
import { statsModuleParses } from "../../state/index.js";
import { renderWorldClerkTask, renderClerkNotes } from "../../state/modules/world/render.js";
import { worldModule } from "../../state/modules/world/index.js";
import { igGenerateWithComfy } from "./comfy.js";
import { imageViaChomusuke, dueNow, NOT_A_REPLY, insertPlaceholder, removePlaceholder, unwrapImgTag } from "./auto.js";
import { classicImageParts, classicImageRulesBlock } from "./classic/prompt.js";
import { v2Settings, currentImageCast, cleanModelPrompt, getLastImagePrompt } from "./v2/index.js";
import { renderCastList, renderV2Rules, renderCombinedPrompt, splitCombinedAnswer } from "./v2/prompt.js";
import { storeOutfitTags, storeNewLooks, takeLookAttempts, releaseLookAttempts, warnLooklessInScene, warnLooksNotMade, sheetSourceFor } from "./v2/looks.js";
import { inImage, needsLook } from "./v2/cast.js";
import { imageGenEngine } from "./index.js";

const sub = t => { try { return substituteParams(t); } catch (e) { return t; } };

/**
 * The Chomusuke "Combine calls" settings. One switch (plan 009); a profile from
 * before it carries its old "World State and image" switch over.
 */
export function combineSettings() {
    const c = (localProfile && localProfile.chomusuke && localProfile.chomusuke.combine) || {};
    const all = c.all !== undefined ? c.all === true : c.worldImage === true;
    return { all, worldFallback: c.worldFallback === true };
}

/**
 * What this reply needs from Chomusuke, when it is worth one combined call:
 * { world, image, blocks, notebook } with two or more of them true. Null otherwise (the
 * reply's jobs, if any, run on their own).
 */
export function combinedTurnWanted(messageId, type) {
    if (!combineSettings().all || NOT_A_REPLY.has(type)) return null;
    const chat = getContext().chat || [];
    const index = typeof messageId === "number" ? messageId : chat.length - 1;
    const msg = chat[index];
    if (!msg || msg.is_user || msg.is_system) return null;
    const text = String(msg.mes || "");
    const ig = localProfile && localProfile.imageGen;
    // A reply that wrote its own World block is filed from it: no read to combine.
    const world = worldEnabled() && worldUpdateMode() === "sidemodel" && !worldModule.parse(text);
    const image = Boolean(ig && ig.enabled && imageViaChomusuke() && dueNow(ig, chat));
    const blocks = routedBlockIds().some(id => !statsModuleParses(id, text));
    // Live truths to read against, or (plan 018) the setup the reply didn't write.
    const notebook = Boolean(notebookReadKind(index));
    const plan = { world, image, blocks, notebook };
    return (world + image + blocks + notebook) >= 2 ? plan : null;
}

// The messages before the latest exchange (the exchange = the user turn(s)
// just before the reply, plus the reply), for context.
function earlierStory(index, count = 4) {
    const chat = getContext().chat || [];
    let start = index;
    while (start - 1 >= 0 && chat[start - 1] && (chat[start - 1].is_user || chat[start - 1].is_system)) start--;
    return chat.slice(0, start).filter(m => m && !m.is_system).slice(-count)
        .map(m => `${m.name}: ${meguminCleanChatHistoryText(m.mes)}`).join("\n\n");
}

/**
 * Runs the combined call for one reply. Resolves when everything is filed and
 * the image (if any) has been sent to ComfyUI. Never throws.
 * @param {{ world: boolean, image: boolean, blocks: boolean, notebook?: boolean }} plan  from combinedTurnWanted
 */
export async function runCombinedTurn(messageId, type, plan) {
    const ig = localProfile.imageGen;
    const chat = getContext().chat || [];
    const index = typeof messageId === "number" ? messageId : chat.length - 1;
    const message = chat[index];
    const token = plan.world ? worldBeginExternalRead(index) : null;
    const bToken = plan.blocks ? blocksBeginRead(index, { force: type === "continue" }) : null;
    const nToken = plan.notebook ? notebookBeginRead(index, { force: type === "continue" }) : null;
    const wantImage = plan.image;
    if (!token && !bToken && !nToken && !wantImage) return false;
    if (bToken || nToken) meguminScheduleBlocksRefresh();

    const inline = wantImage && (ig.injectMode || "new_msg") === "inline";
    const id = `kazuma-img-${Date.now()}-auto`;
    if (inline) await insertPlaceholder(index, message, id, ig.autoPlacement);

    const engine = imageGenEngine();
    const cfg = v2Settings();
    let built = null;
    let staleBefore = [];
    let missingLooks = [];
    let raw = "";
    let failure = null;
    const parts = [token && "worldState", bToken && "blocks", nToken && "notebook", wantImage && "imageGen"].filter(Boolean);
    try {
        raw = await runWithChomusuke(wantImage ? "imageGen" : token ? "worldState" : bToken ? "blocks" : "notebook", async () => {
            // Built when this job has the worker, so it sees whatever landed before it.
            const w = token ? worldReadInputs(token) : null;
            const exchange = w ? w.exchange : exchangeText(index, String((bToken && bToken.text) || (nToken && nToken.text) || message.mes || ""));
            const common = {
                notes: w ? renderClerkNotes(w.notes) : "",
                earlier: earlierStory(index),
                exchange,
                world: w ? renderWorldClerkTask(w.mode, { noSecret: w.noSecret }) : null,
                image: wantImage,
                onlyIfPhoto: (ig.triggerMode || "always") === "conditional",
                blocks: bToken ? { notes: blocksReadNotes(bToken, exchange), tasks: blocksTasksFor(bToken.ids) } : null,
                notebook: !nToken ? null
                    : nToken.kind === "setup"
                        ? { notes: `<Character_Sheet>\n${notebookSheetText()}\n</Character_Sheet>`, task: renderNotebookSetupTask(), setup: true }
                        : { notes: notebookReadNotes(nToken), task: renderNotebookClerkTask() }
            };
            if (!wantImage) {
                built = renderCombinedPrompt(common);
            } else if (engine === "v2") {
                const cast = currentImageCast();
                const detailed = cfg.outfitTags && cfg.style === "tags";
                staleBefore = detailed ? cast.filter(m => m.outfitStale && inImage(m, cfg.shot)) : [];
                missingLooks = cfg.autoLooks === false ? [] : takeLookAttempts(getContext()?.chatId, cast.filter(m => needsLook(m, cfg.shot)));
                warnLooklessInScene(getContext()?.chatId, cast, cfg.shot, missingLooks);
                built = renderCombinedPrompt({
                    ...common,
                    engine: "v2",
                    castList: renderCastList(cast, { shot: cfg.shot, method: cfg.method, lookPending: missingLooks.map(m => m.name) }),
                    sheets: missingLooks.length ? await sheetSourceFor(missingLooks) : "",
                    imageRules: renderV2Rules({ style: cfg.style, shot: cfg.shot, extra: cfg.extra, method: cfg.method, focus: cfg.focus }),
                    previous: cfg.method === "reference" ? getLastImagePrompt() : null,
                    extras: {
                        outfits: staleBefore.map(m => ({ name: m.name, outfit: m.outfitText })),
                        looks: missingLooks.map(m => m.name),
                        followUpdate: detailed
                    }
                });
            } else {
                const parts = classicImageParts();
                built = renderCombinedPrompt({
                    ...common,
                    engine: "classic",
                    sheets: String(parts.characterSheets || "").replace(/^Use these sheets for what each character looks like:\s*/, ""),
                    imageRules: classicImageRulesBlock(parts)
                });
            }
            setActiveImageGenRequest({ v2: { system: sub(built.system), user: sub(built.user), prefill: built.prefill, job: "combined" } });
            try {
                return await generateQuietPrompt({ prompt: "___PS_IMAGE_GEN___" });
            } finally {
                setActiveImageGenRequest(null);
            }
        }, { jobs: parts });
    } catch (e) {
        console.error("[Megumin-Suite] Combined Chomusuke call failed", e);
        failure = e;
    }
    // null without an error: the worker failed and has said so already.
    const alreadyTold = raw === null && !failure;
    raw = String(raw || "");
    // The parts that came back unusable and are not read again on their own:
    // one warning names them all (a read that falls back warns for itself).
    const missing = [];
    const tell = () => {
        if (alreadyTold || !missing.length) return;
        if (failure) warnChomusuke("failed", missing, { error: failure });
        else warnChomusuke(answerKind(raw), missing);
    };
    if (!raw.trim() && missingLooks.length) releaseLookAttempts(getContext()?.chatId, missingLooks);
    // With a World prefill the answer starts inside the World block.
    const full = built && built.prefill && !/<World_(State|Update)\b/i.test(raw) ? built.prefill + raw : raw;

    // 1. World State.
    let dropped = false;
    if (token) {
        const world = worldFinishExternalRead(token, raw, built ? built.prefill : "<World_Update>\n");
        if (!world.ok && !world.dropped) {
            if (combineSettings().worldFallback) worldExtractMessage(index, { force: true });
            else { worldRecordMissing(token); missing.push("worldState"); }
        }
        dropped = world.dropped;
    }

    // 2. The blocks.
    if (bToken) {
        const res = blocksFinishRead(bToken, full);
        if (!res.ok && !res.dropped) {
            if (combineSettings().worldFallback) blocksReadForReply(index, { force: true });
            else missing.push("blocks");
        }
        dropped = dropped || res.dropped;
        meguminScheduleBlocksRefresh();
    }

    // 3. The notebook.
    if (nToken) {
        const res = notebookFinishRead(nToken, full);
        if (!res.ok && !res.dropped) {
            notebookRecordMissing(nToken);
            if (combineSettings().worldFallback) notebookReadForReply(index, { force: true });
            else missing.push("notebook");
        }
        dropped = dropped || res.dropped;
        meguminScheduleBlocksRefresh();
    }

    if (!wantImage) { tell(); return true; }
    const anyToken = token || bToken || nToken;
    if (dropped || getContext()?.chatId !== (anyToken ? anyToken.chatId : getContext()?.chatId)) {
        if (inline) await removePlaceholder(id);
        return false;
    }

    // 4. V2: outfit tags and new looks, against the outfits AFTER the update.
    const { prompt: rawPrompt, rest } = splitCombinedAnswer(full);
    if (engine === "v2" && rest) {
        const staleNow = currentImageCast().filter(m => m.outfitStale && inImage(m, cfg.shot));
        if (staleNow.length) storeOutfitTags(staleNow, rest);
    }
    if (engine === "v2" && missingLooks.length && raw.trim()) {
        const added = rest ? storeNewLooks(missingLooks.map(m => ({ name: m.name, aliases: m.aliases || [] })), rest) : [];
        if (added.length) toastr.info(`New look${added.length === 1 ? "" : "s"} for ${added.join(", ")}.`, "Megumin Suite", { timeOut: 3500 });
        warnLooksNotMade(missingLooks, added);
    }

    // 5. The image.
    const prompt = unwrapImgTag(engine === "v2" ? cleanModelPrompt(rawPrompt) : rawPrompt);
    if (!prompt || /^none\.?$/i.test(prompt)) {
        if (inline) await removePlaceholder(id);
        // NONE is an answer; no image prompt at all is not.
        if (!prompt) missing.push("imageGen");
        tell();
        return true;
    }
    tell();
    toastr.info("Sending to ComfyUI...", "Megumin Suite");
    igGenerateWithComfy(prompt, { message, index, mode: inline ? "inline" : "new_msg", isInlineAuto: true, placeholderId: id });
    return true;
}
