// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 ↔ SillyTavern.
//
// Gathers what the pure parts need (stored looks, World State, NPC Bank, the
// persona, the recent chat) and hands out: the manual prompt, the inline
// instruction, and the @Name resolver every image goes through before ComfyUI.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, generateQuietPrompt, substituteParams, saveMetadataDebounced } from "../../../st.js";
import { localProfile } from "../../../core/state.js";
import { setActiveImageGenRequest } from "../../../core/activeRequests.js";
import { meguminCleanChatHistoryText } from "../../../engine/chatText.js";
import { getWorldState, worldHasState, worldReadsSettled } from "../../../state/index.js";
import { bgPreviewOpen } from "../../../engine/bgPrompts.js";
import { waitUnlessStuck } from "./waitFor.js";
import { buildImageCast, inImage, needsLook } from "./cast.js";
import { resolveImagePrompt } from "./resolve.js";
import { renderCastList, renderV2Rules, renderV2ManualPrompt, renderV2InlineInstruction, renderV2InlineSplit, renderV2Extras, splitCombinedAnswer } from "./prompt.js";
import { refreshOutfitTags, storeOutfitTags, storeNewLooks, takeLookAttempts, releaseLookAttempts, warnLooklessInScene, warnLooksNotMade, sheetSourceFor, looksSettled, looksBeingRead } from "./looks.js";

export const V2_DEFAULTS = {
    style: "tags", shot: "cinematic", extra: "", method: "placeholders",
    autoLooks: true,          // a character entering the scene gets a look read from the chat
    lookPriority: "v2",       // "v2" | "npc": which wins when the NPC Bank also has Image Tags
    outfitTags: false,        // Tags style: turn World State outfits into detailed tags (once per outfit)
    focus: "3"                // characters with a line of their own: "2" | "3" | "4" | "all"
};

// ── The previous image prompt (Reference method) ─────────────────────────
// Kept per chat, in the chat file: the last prompt sent to ComfyUI.
const LAST_PROMPT_KEY = "megumin_image_v2";

export function getLastImagePrompt() {
    const meta = getContext()?.chatMetadata;
    return (meta && meta[LAST_PROMPT_KEY] && meta[LAST_PROMPT_KEY].lastPrompt) || "";
}

function setLastImagePrompt(prompt) {
    const ctx = getContext();
    if (!ctx || !ctx.chatId || !ctx.chatMetadata || !String(prompt || "").trim()) return;
    ctx.chatMetadata[LAST_PROMPT_KEY] = { ...(ctx.chatMetadata[LAST_PROMPT_KEY] || {}), lastPrompt: String(prompt).trim(), at: Date.now() };
    saveMetadataDebounced();
}

export function v2Settings() {
    return { ...V2_DEFAULTS, ...((localProfile && localProfile.imageGen && localProfile.imageGen.v2) || {}) };
}

const sub = t => { try { return substituteParams(t); } catch (e) { return t; } };

/**
 * The stored looks (chat_metadata via task 003's characterTags), in V2 shape.
 * Entries written by tasks 003/004 ({ tags, locked, provisional, aliases })
 * are upgraded in place and keep their tags and nicknames.
 */
export function getLooks() {
    const ig = localProfile && localProfile.imageGen;
    if (!ig) return {};
    if (!ig.characterTags || typeof ig.characterTags !== "object") ig.characterTags = {};
    for (const entry of Object.values(ig.characterTags)) {
        if (!entry || typeof entry !== "object") continue;
        if (typeof entry.tags !== "string") entry.tags = String(entry.tags || "");
        if (typeof entry.natural !== "string") entry.natural = "";
        if (!Array.isArray(entry.aliases)) entry.aliases = [];
        if (typeof entry.locked !== "boolean") entry.locked = Boolean(entry.locked);
        if (!entry.source) entry.source = entry.provisional ? "chat" : "manual";
    }
    return ig.characterTags;
}

function recentMessages(count) {
    const chat = (getContext() && getContext().chat) || [];
    return chat.filter(m => m && !m.is_system).slice(-count);
}

/** Everyone who can be written as @Name right now. */
export function currentImageCast() {
    const recent = recentMessages(3).map(m => String(m.mes || "").replace(/<[^>]+>/g, " ")).join(" ");
    return buildImageCast({
        looks: getLooks(),
        world: worldHasState() ? getWorldState() : null,
        npcs: (localProfile && localProfile.npcBank && localProfile.npcBank.npcs) || [],
        userName: sub("{{user}}"),
        recentText: recent,
        npcFirst: v2Settings().lookPriority === "npc" && Boolean(localProfile && localProfile.npcBank && localProfile.npcBank.enabled),
        outfitTags: v2Settings().outfitTags && v2Settings().style === "tags"
    });
}

function sceneLine() {
    if (!worldHasState()) return "";
    const s = getWorldState().scene || {};
    return [s.time && `Time: ${s.time}`, s.location && `Loc: ${s.location}`, s.weather && `Wx: ${s.weather}`].filter(Boolean).join(" | ");
}

function rules(extraInstruction = "") {
    const cfg = v2Settings();
    const extra = [cfg.extra, extraInstruction].filter(s => String(s || "").trim()).join(" ");
    return sub(renderV2Rules({ style: cfg.style, shot: cfg.shot, extra, method: cfg.method, focus: cfg.focus }));
}

// ── The manual button ────────────────────────────────────────────────────

export async function v2GenerateImagePromptText({ extraInstruction = "" } = {}) {
    const cfg = v2Settings();
    // No Chomusuke calls in here: this runs INSIDE a Chomusuke job (the manual
    // button, the automatic image), and Chomusuke runs one job at a time, so a
    // call from here would wait for itself forever. Instead, what the image
    // needs besides its prompt (outfit tags that went stale, looks that are
    // missing) is asked for in this SAME call and saved from its answer.
    const chatAtStart = getContext()?.chatId;
    const castNow = currentImageCast();
    const staleOutfits = cfg.outfitTags && cfg.style === "tags" ? castNow.filter(m => m.outfitStale && inImage(m, cfg.shot)) : [];
    const missingLooks = cfg.autoLooks === false ? [] : takeLookAttempts(chatAtStart, castNow.filter(m => needsLook(m, cfg.shot)));
    warnLooklessInScene(chatAtStart, castNow, cfg.shot, missingLooks);
    const extras = renderV2Extras({
        outfits: staleOutfits.map(m => ({ name: m.name, outfit: m.outfitText })),
        looks: missingLooks.map(m => m.name)
    });
    // The image shows the moment the last message ends on; the ones before
    // it are context only, so the model does not draw what already ended.
    const story = recentMessages(6).map(m => `${m.name}: ${meguminCleanChatHistoryText(m.mes)}`);
    const last = story.pop() || "";
    const built = renderV2ManualPrompt({
        castList: sub(renderCastList(castNow, { shot: cfg.shot, method: cfg.method, lookPending: missingLooks.map(m => m.name) })),
        // The sheets the missing looks are read from go BEFORE the story.
        sheets: missingLooks.length ? await sheetSourceFor(missingLooks) : "",
        scene: sceneLine(),
        earlier: story.join("\n\n"),
        last,
        method: cfg.method,
        previous: getLastImagePrompt(),
        extras: sub(extras),
        rules: rules(extraInstruction)
    });
    setActiveImageGenRequest({ v2: { system: sub(built.system), user: built.user } });
    let raw;
    try {
        raw = await generateQuietPrompt({ prompt: "___PS_IMAGE_GEN___" });
    } catch (e) {
        releaseLookAttempts(chatAtStart, missingLooks);   // no answer: ask again next image
        throw e;
    }
    if (!String(raw || "").trim()) releaseLookAttempts(chatAtStart, missingLooks);
    if (!extras) return cleanModelPrompt(raw);
    const { prompt, rest } = splitCombinedAnswer(raw);
    if (String(raw || "").trim() && getContext()?.chatId === chatAtStart) {
        if (rest && staleOutfits.length) storeOutfitTags(staleOutfits, rest);
        if (missingLooks.length) {
            const added = rest ? storeNewLooks(missingLooks.map(m => ({ name: m.name, aliases: m.aliases || [] })), rest) : [];
            if (added.length) toastr.info(`New look${added.length === 1 ? "" : "s"} for ${added.join(", ")}.`, "Megumin Suite", { timeOut: 3500 });
            warnLooksNotMade(missingLooks, added);
        }
    }
    return cleanModelPrompt(prompt);
}

// Models wrap a one-line answer in all sorts of things.
export function cleanModelPrompt(raw) {
    return String(raw || "")
        .replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "")
        .replace(/```[a-z]*\n?|```/gi, "")
        .replace(/^\s*(image\s*)?prompt\s*:\s*/i, "")
        .trim()
        .replace(/^["“]|["”]$/g, "")
        .trim();
}

// ── The inline instruction ([[img1]]) ────────────────────────────────────

// Characters in the scene with no look yet, whose look is read after the reply,
// before the image goes out: the story model still writes them as @Name.
function inlineLookPending(cast, cfg) {
    return cfg.autoLooks === false ? [] : cast.filter(m => needsLook(m, cfg.shot)).map(m => m.name);
}

export function v2InlineInstruction({ conditionalText = "", imageCount = 1 } = {}) {
    const cfg = v2Settings();
    const cast = currentImageCast();
    return sub(renderV2InlineInstruction({
        conditionalText,
        imageCount,
        castList: renderCastList(cast, { shot: cfg.shot, method: cfg.method, lookPending: inlineLookPending(cast, cfg) }),
        rules: rules(),
        method: cfg.method,
        previous: getLastImagePrompt()
    }));
}

/** The V11 preset's split of the same instruction: rules up top, the cast in <turn_notes>. */
export function v2InlineSplit({ conditionalText = "" } = {}) {
    const cfg = v2Settings();
    const cast = currentImageCast();
    const out = renderV2InlineSplit({
        conditionalText,
        castList: renderCastList(cast, { shot: cfg.shot, method: cfg.method, lookPending: inlineLookPending(cast, cfg) }),
        rules: rules(),
        method: cfg.method,
        previous: getLastImagePrompt()
    });
    return { rules: sub(out.rules), turn: sub(out.turn) };
}

// ── Every image, just before ComfyUI ─────────────────────────────────────

let lastResolution = null;

/** What the last resolve did (for the preview and debugging). */
export function v2LastResolution() {
    return lastResolution;
}

/**
 * Work that needs its own Chomusuke call, done BEFORE the prompt writer's job
 * starts (never from inside it): bringing changed outfit tags up to date.
 */
export async function v2PrepareImagePrompt() {
    // Nothing now: the prompt writer's own call brings stale outfit tags and
    // missing looks (one background call per image). Kept as the place for any
    // future work that truly needs a call of its own.
}

// The story model wrote this image in its reply: Chomusuke may still be reading
// the reply's World State (outfits, who arrived), and the looks for new
// characters may still be read after it. The image waits for both.
async function waitForImageInputs() {
    const work = (async () => { await worldReadsSettled(); await looksSettled(); })();
    const quick = await waitUnlessStuck(work, { limitMs: 250, tickMs: 250 });
    if (quick === "done") return;
    const who = looksBeingRead();
    toastr.info(who.length
        ? `Waiting for ${[...new Set(who)].join(", ")}'s look before drawing…`
        : "Waiting for World State before drawing…", "Megumin Suite", { timeOut: 4000 });
    if (await waitUnlessStuck(work, { limitMs: 60000, isPaused: bgPreviewOpen }) === "gave-up") {
        console.warn("[Megumin-Suite] Image V2: still waiting for World State or a look after 60s; drawing without it.");
    }
}

export async function v2ResolveForComfy(prompt) {
    // Every image path ends here (manual, automatic, inline, retry): wait for
    // a World State read or a look still running, then bring any changed
    // outfit tags up to date. Each is a no-op when nothing is pending.
    await waitForImageInputs();
    await refreshOutfitTags();
    const r = resolveImagePrompt(prompt, { cast: currentImageCast(), style: v2Settings().style });
    lastResolution = { input: String(prompt || ""), ...r };
    // Reference method edits this next time. Kept on both methods, so switching
    // to Reference starts from the last real image.
    setLastImagePrompt(r.prompt);
    if (r.filled.length || r.unknown.length) {
        console.debug("[Megumin-Suite] Image V2 resolved:", { filled: r.filled, unknown: r.unknown, noLook: r.noLook });
    }
    if (r.unknown.length) {
        toastr.info(`No saved look for: ${[...new Set(r.unknown)].join(", ")}. Used the name as written.`, "Megumin Suite", { timeOut: 5000 });
    }
    return r.prompt;
}
