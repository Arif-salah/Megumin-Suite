// ────────────────────────────────────────────────────────────────────────────
// The prompt interceptor — the last thing to touch the messages before they go.
//
// Reads the in-flight request markers to decide which prompt shape to emit: the
// roleplay one, or one of the background tasks (planner, ban list, image prompt,
// NPC scan, memory summary). Everything it needs is already a module.
// ────────────────────────────────────────────────────────────────────────────

import { extension_settings, substituteParams, Popup, POPUP_TYPE, getMaxPromptTokens, getTokenCountAsync, oai_settings } from "../st.js";
import { getContext } from "../st.js";
import { extensionName } from "../core/constants.js";
import { localProfile } from "../core/state.js";
import {
    activeStoryPlanRequest, activeBanListChat, activeImageGenRequest,
    activeNpcScanRequest, activeNpcPfpRequest, activeNpcUpdateRequest,
    activeMemorySummarizationRequest,
    activeGenerationOrder, isBackgroundGenerationActive,
    activeNpcImages, clearActiveNpcImages,
} from "../core/activeRequests.js";
import { DEFAULT_PROMPTS } from "../prompts/index.js";
import { sdGenreLabel } from "../features/storyplan/ui.js";
import { memEnsureSemanticQueryFresh } from "../features/memory/vectordb.js";
import { npcBuildDossierPrompt } from "../features/npc/fields.js";
import { escapeRegex } from "../utils/regex.js";
import { buildBaseDict } from "./buildBaseDict.js";
import { meguminAllSlotTriggers } from "../../data/slots.js";

// Throttles the prompt-preview popup so token counting and rapid ST background
// triggers can't stack popups. Read and written only by the injection handler.
export let lastPromptPreviewTime = 0;

// ── CONTEXT FIT ────────────────────────────────────────────────────────────
// SillyTavern budgets THIS prompt before this hook fires: it counts the system
// prompt with the [[...]] placeholders still collapsed (a few dozen tokens) and
// fills the chat with as many messages as fit the result. When the slots expand
// into the engine, blocks, memory and NPC content, the payload grows beyond the
// budget and nothing in ST re-measures it — so a chat that "fits" the configured
// context still 413s at the API.
//
// This closes the gap from the other side: after the expansion, it measures the
// payload that is actually about to be sent and, if it no longer fits, removes
// the oldest messages until it does — the same eviction ST would have performed
// on its own had it known the final size. The budget is read live on every
// generation (getMaxPromptTokens), so any context size works, and a budget the
// user raises later needs no change here.
//
// It never removes the last user message (the turn being answered) or any system
// message (the expanded preset lives in one), so the only case it cannot fix is
// a fixed prompt that alone exceeds the context — which it reports, since no
// message eviction can help.
let _lastFitToast = 0;

// Flat per-role overhead the chat-completion format adds around every message,
// and a fixed stand-in cost for image parts, which the text tokenizer cannot see.
// 12 covers the chat-template tokens per message on typical templates (Gemma's
// <start_of_turn>/<end_of_turn> framing is ~8-12 tokens per message).
const FIT_ROLE_OVERHEAD = 12;
const FIT_IMAGE_STANDIN_CHARS = 400;

function meguminFitContentToText(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        let text = "";
        for (const part of content) {
            if (part?.type === "text") text += part.text;
            else if (part?.type === "image_url") text += " ".repeat(FIT_IMAGE_STANDIN_CHARS);
        }
        return text;
    }
    return "";
}

// Self-hosted OpenAI-compatible servers (llama.cpp, vLLM) expose a /tokenize
// endpoint that counts with the model's REAL tokenizer. ST's own counter uses a
// different tokenizer (e.g. cl100k for a Gemma model), which is the ~9% gap this
// patch exists to close. The base URL is derived from the same fields ST's own
// backend uses to reach the provider, so this works no matter which source is
// active and is not bound to any single API.
const FIT_API_TIMEOUT_MS = 10_000;

function meguminApiBaseCandidates() {
    const settings = oai_settings;
    if (!settings) return [];
    const bases = new Set();
    for (const key of ["reverse_proxy", "custom_url", "azure_base_url"]) {
        const raw = settings[key];
        if (!raw) continue;
        let url = String(raw).trim().replace(/\/+$/, "");
        if (/\/v1$/.test(url)) url = url.replace(/\/v1$/, "");
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        if (url) bases.add(url);
    }
    return [...bases];
}

async function meguminApiTokenCount(text) {
    if (!text) return 0;
    for (const base of meguminApiBaseCandidates()) {
        for (const path of ["/tokenize", "/v1/tokenize"]) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), FIT_API_TIMEOUT_MS);
            try {
                const response = await fetch(base + path, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: text }),
                    signal: controller.signal,
                });
                if (!response.ok) continue;
                const data = await response.json();
                if (Array.isArray(data?.tokens)) return data.tokens.length;
            } catch {
                // Try the next candidate; a total failure falls back to the
                // client-side counter below.
            } finally {
                clearTimeout(timer);
            }
        }
    }
    return null;
}

export async function meguminFitToContext(messages, dryRun) {
    if (dryRun || !Array.isArray(messages) || messages.length === 0) return;

    let budget;
    try {
        budget = getMaxPromptTokens();
    } catch {
        return;
    }
    if (!Number.isFinite(budget) || budget <= 0) return;

    // Margin depends on which counter measures the payload. The API's own
    // /tokenize (when the active provider exposes one) is exact, so a small
    // cushion suffices. The client-side counter can be a different tokenizer
    // than the model's (e.g. a Gemma model counted with GPT's cl100k), so it
    // needs a wide margin — the observed gap is ~9%.
    const fallbackTarget = budget - Math.max(150, Math.round(budget * 0.09));
    if (fallbackTarget <= 0) return;

    // Count the whole payload with ONE call (either counter is a network
    // round-trip, so a per-message loop would stall generation). Eviction below
    // is then done with per-message costs CALIBRATED from that one real total,
    // so it costs no extra calls, and a final exact count confirms the result.
    // The total never crosses the real budget: a pass only stops short when it
    // cannot remove anything the rules allow.
    let texts = messages.map(m => meguminFitContentToText(m?.content));
    const joinedChars = () => texts.reduce((n, t) => n + t.length, 0);
    let exact = false;
    const countPayload = async () => {
        const apiTokens = await meguminApiTokenCount(texts.join("\n"));
        exact = apiTokens != null;
        if (exact) return apiTokens + FIT_ROLE_OVERHEAD * messages.length;
        return (await getTokenCountAsync(texts.join("\n"))) + FIT_ROLE_OVERHEAD * messages.length;
    };

    // Cheap gate before any counting: even at the worst possible rate of one
    // token per character (dense CJK), a payload this short is under budget.
    if (joinedChars() < fallbackTarget) return;

    let totalTokens = await countPayload();
    const target = exact ? budget - Math.max(250, Math.round(budget * 0.01)) : fallbackTarget;
    if (totalTokens <= target) return;

    const contentTokens = totalTokens - FIT_ROLE_OVERHEAD * messages.length;
    const chars = joinedChars();
    // Cost per character for the real tokenizer, nudged up so the estimate errs
    // toward removing a little more rather than landing over the line.
    const ratio = Math.max((contentTokens / Math.max(1, chars)), 0.25) * 1.15;

    const lastUserMsg = [...messages].reverse().find(m => m?.role === "user") ?? null;
    let removed = 0;
    let index = 0;

    for (let pass = 0; pass < 3 && totalTokens > target; pass++) {
        const before = removed;
        while (index < messages.length && totalTokens > target) {
            if (messages[index] === lastUserMsg) break;     // the turn being answered is untouchable
            if (messages[index]?.role === "system") { index++; continue; }  // the expanded preset rides in here
            totalTokens -= texts[index].length * ratio + FIT_ROLE_OVERHEAD;
            messages.splice(index, 1);
            texts.splice(index, 1);
            removed++;
        }
        // Land on it only if the calibrated pass claims to have; else re-sync with
        // one exact count and try again. Bounded, so a stubborn payload cannot loop.
        if (totalTokens > target) {
            if (removed === before || index >= messages.length) break;
            totalTokens = await countPayload();
        }
    }

    if (removed > 0) {
        console.info(`[Megumin Suite] Prompt exceeded the ${budget}-token context budget once expanded; removed ${removed} oldest message(s) so it fits.`);
        const now = Date.now();
        if (now - _lastFitToast > 5 * 60 * 1000) {
            _lastFitToast = now;
            toastr.info(`Fitting to context budget: removed ${removed} old message(s). Lower Memory Core limits if this happens every turn.`, "Megumin Suite");
        }
    } else if (totalTokens > target) {
        console.warn(`[Megumin Suite] Prompt is still over the ${target}-token budget with nothing left to remove — the fixed prompt (preset/engine/blocks) alone is larger than the context. Shrink the fixed prompt or raise the context size.`);
    }
}

export async function handlePromptInjection(data, type) {
    const messages = data?.messages || data?.chat || (Array.isArray(data) ? data : null);
    if (!messages || !Array.isArray(messages)) return;
    // Opt IN, not opt out. The prefill breaks utility generations on Claude and
    // several other APIs, and the people it breaks for are the least likely to go
    // looking for a switch, so the safe state is the default. `!== true` also means
    // an install that has never seen the setting is off rather than on.
    const disablePrefill = extension_settings[extensionName]?.globalSettings?.enableUtilityPrefill !== true;

    // --- INJECT STORY PLANNER PROMPT ---
    if (activeStoryPlanRequest) {
        messages.length = 0;

        // SillyTavern macro substitutions to get Lore and Persona
        const charLore = typeof substituteParams === 'function' ? substituteParams('{{description}}') : "No character description found.";
        const userPersona = typeof substituteParams === 'function' ? substituteParams('{{persona}}') : "No user persona found.";

        const sp = localProfile.storyPlan;
        const spCustom = sp.customPromptsEnabled ? sp.customPrompts : null;
        const sys = (spCustom && spCustom.systemPrompt) || DEFAULT_PROMPTS.storyPlan.systemPrompt;
        let userTask = (spCustom && spCustom.userPrompt) || DEFAULT_PROMPTS.storyPlan.userPrompt;
        const thinking = (spCustom && spCustom.thinkingPrompt) || DEFAULT_PROMPTS.storyPlan.thinkingPrompt;

        // Construct Director Settings
        let settingsStr = "DIRECTOR SETTINGS:\n";
        if (sp.contentRating !== "none") settingsStr += `- Content Rating: ${sp.contentRating.toUpperCase()}\n`;
        settingsStr += `- Pacing: ${sp.pacing.toUpperCase()}\n`;
        settingsStr += `- Primary Genre: ${sdGenreLabel(sp)}\n`;
        if (sp.flavorTags && sp.flavorTags.length > 0) settingsStr += `- Flavor Elements: ${sp.flavorTags.join(', ')}\n`;
        if (sp.directorsNote && sp.directorsNote.trim()) settingsStr += `- Director's Note: ${sp.directorsNote.trim()}\n`;
        
        if (sp.currentPlan && sp.currentPlan.trim()) {
            settingsStr += `\nPREVIOUS DIRECTIVE (Update/Evolve this):\n${sp.currentPlan.trim()}\n`;
        } else {
            settingsStr += `\nGenerate the first narrative directive for this story.\n`;
        }

        messages.push({
            "role": "system",
            "content": sys.replace('{{charLore}}', charLore).replace('{{userPersona}}', userPersona).replace('{{chatHistory}}', activeStoryPlanRequest)
        });
        messages.push({
            "role": "user",
            "content": userTask.replace('{{directorSettings}}', settingsStr)
        });
        messages.push({
            "role": "system",
            "content": thinking
        });
        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": "ok i will start thinking \n<think>\n"
            });
        }

        console.log(`[${extensionName}] 🎯 Injected Story Director array in memory.`);
        return;
    }

    // --- INJECT NPC SCAN PROMPT ---
    if (activeNpcScanRequest) {
        messages.length = 0;
        const nbPrompts = (localProfile.npcBank && localProfile.npcBank.customPromptsEnabled && localProfile.npcBank.customPrompts) ? localProfile.npcBank.customPrompts : DEFAULT_PROMPTS.npcBank;
        // Same instruction the roleplay prompt carries, so a scan writes dossiers
        // in the shape the parser and the card expect rather than in whatever the
        // rules text happened to describe before the fields were data.
        const formatTemplate = npcBuildDossierPrompt(nbPrompts.dossierRules || DEFAULT_PROMPTS.npcBank.dossierRules);

        messages.push({
            "role": "system",
            "content": "You are an expert narrative analyst and world-builder."
        });
        messages.push({
            "role": "user",
            "content": `Analyze the following story history. Identify any SIGNIFICANT NPCs (characters with names and dialogue/impact) that are NOT in this list of already known NPCs: [${activeNpcScanRequest.existingNames || "None"}].\n\nFor every new significant NPC you find, generate a dossier using EXACTLY this format:\n\n${formatTemplate}\n\nStory History:\n<chat>\n${activeNpcScanRequest.chatText}\n</chat>`
        });
        messages.push({
            "role": "system",
            "content": "Think deeply about who is missing from the known list, then output their dossiers sequentially."
        });
        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": "<think>\nScanning for missing significant NPCs...\n"
            });
        }
        console.log(`[${extensionName}] 🎯 Injected NPC Scan array in memory.`);
        return;
    }

    // --- INJECT FORCED NPC UPDATE PROMPT ---
    // The refresh button on an NPC card. Unlike the in-story update, this asks
    // about ONE named NPC and hands over their whole record, so the model is
    // comparing against what is actually on file rather than recalling it.
    if (activeNpcUpdateRequest) {
        messages.length = 0;
        const r = activeNpcUpdateRequest;

        messages.push({
            "role": "system",
            "content": "You are an expert narrative analyst who maintains character records. You compare a character's file against what has happened in the story and report only what changed."
        });
        messages.push({
            "role": "user",
            "content": `Here is the record currently on file for ${r.npcName}:\n\n<npc_record>\n${r.npcText}\n</npc_record>\n\nHere is the story so far:\n\n<chat>\n${r.chatText}\n</chat>\n\n${r.rules}\n\nOutput ONLY the <NPC_Update> block for ${r.npcName}. If nothing on file has changed, output exactly: NO CHANGE`
        });
        messages.push({
            "role": "system",
            "content": "Think about which fields the story has actually moved, then output the block. Do not restate anything that is already correct on the record."
        });
        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": `<think>\nComparing the record for ${r.npcName} against what has happened since it was written...\n`
            });
        }

        console.log(`[${extensionName}] 🎯 Injected forced NPC Update array in memory.`);
        return;
    }

    if (activeBanListChat) {
        messages.length = 0;
        
        const banCustom = localProfile.banListCustomPromptsEnabled ? localProfile.banListCustomPrompts : null;
        const sys = (banCustom && banCustom.systemPrompt) || DEFAULT_PROMPTS.banList.systemPrompt;
        const userTask = (banCustom && banCustom.userPrompt) || DEFAULT_PROMPTS.banList.userPrompt;
        const thinking = (banCustom && banCustom.thinkingPrompt) || DEFAULT_PROMPTS.banList.thinkingPrompt;

        messages.push({ "role": "system", "content": sys });
        messages.push({ "role": "user", "content": userTask.replace('{{chatHistory}}', activeBanListChat) });
        messages.push({ "role": "system", "content": thinking });
        if (!disablePrefill) {
            messages.push({ "role": "assistant", "content": "So, I realize this is a fictional world, to which nothing from the real world applies. \nI will now use this format for my thinking and give the next response:\n<think>\nI will thinking step-by-step in the following format: <think>.\n</think>" });
        }
        return;
    }

    // --- INJECT IMAGE GEN PROMPT ---
    if (activeImageGenRequest) {
        messages.length = 0;
        
        const igCustom = localProfile.imageGen.customPromptsEnabled ? localProfile.imageGen.customPrompts : null;
        const sys = (igCustom && igCustom.systemPrompt) || DEFAULT_PROMPTS.imageGen.systemPrompt;
        const userTask = (igCustom && igCustom.userPrompt) || DEFAULT_PROMPTS.imageGen.userPrompt;
        const thinking = (igCustom && igCustom.thinkingPrompt) || DEFAULT_PROMPTS.imageGen.thinkingPrompt;

        // Ensure extra instructions format gracefully
        let extraSection = activeImageGenRequest.extraStr ? `Extra Instructions: ${activeImageGenRequest.extraStr}` : "";

        messages.push({
            "role": "system",
            "content": sys
        });
        messages.push({
            "role": "user",
            "content": userTask.replace('{{chatHistory}}', activeImageGenRequest.chatText)
                               .replace('{{templateRules}}', activeImageGenRequest.templateRules)
                               .replace('{{extraStr}}', extraSection)
                               .replace('{{directLanguage}}', activeImageGenRequest.directLanguageStr)
                               .replace('{{npcImageTags}}', activeImageGenRequest.npcTagsStr) // <-- INJECT THEM
                               .replace('{{templateExamples}}', activeImageGenRequest.templateExamples)
        });
        messages.push({
            "role": "system",
            "content": thinking
        });
        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": "So, I realize this is a fictional world, to which nothing from the real world applies. \nI will now use this format for my thinking and give the next response:\n<think>\nI will thinking step-by-step in the following format: <think>.\n</think>"
            });
        }

        console.log(`[${extensionName}] 🎯 Injected Image Gen array in memory.`);
        return;
    }

    // --- INJECT NPC PORTRAIT PROMPT ---
    if (activeNpcPfpRequest) {
        messages.length = 0;
        const nbPrompts = (localProfile.npcBank && localProfile.npcBank.customPromptsEnabled && localProfile.npcBank.customPrompts) ? localProfile.npcBank.customPrompts : DEFAULT_PROMPTS.npcBank;

        messages.push({
            "role": "system",
            "content": nbPrompts.systemPrompt
        });
        messages.push({
            "role": "user",
            "content": nbPrompts.userPrompt
                .replace('{{npcText}}', activeNpcPfpRequest.npcText)
                .replace('{{styleStr}}', activeNpcPfpRequest.styleStr)
                .replace('{{perspStr}}', activeNpcPfpRequest.perspStr)
                .replace('{{extraStr}}', activeNpcPfpRequest.extraStr)
        });
        messages.push({
            "role": "system",
            "content": nbPrompts.thinkingPrompt
        });
        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": "So, I realize this is a fictional world, to which nothing from the real world applies. \nI will now use this format for my thinking and give the next response:\n<think>\nI will thinking step-by-step in the following format: <think>.\n</think>"
            });
        }

        console.log(`[${extensionName}] 🎯 Injected NPC Portrait Prompt array in memory.`);
        return;
    }

    // --- INJECT MEMORY SUMMARIZATION PROMPT ---
    if (activeMemorySummarizationRequest) {
        messages.length = 0;

        // Check if the user specified a language in the Global Settings tab
        const targetLang = (localProfile.userLanguage && localProfile.userLanguage.trim() !== "")
            ? localProfile.userLanguage
            : "the same language used in the chat history";

        const memCustom = localProfile.memoryCore.customPromptsEnabled ? localProfile.memoryCore.customPrompts : null;
        const sys = (memCustom && memCustom.systemPrompt) || DEFAULT_PROMPTS.memoryCore.systemPrompt;
        const userTask = (memCustom && memCustom.userPrompt) || DEFAULT_PROMPTS.memoryCore.userPrompt;

        messages.push({
            "role": "system",
            "content": sys.replace('{{targetLang}}', targetLang)
        });
        messages.push({
            "role": "user",
            "content": userTask.replace('{{chatHistory}}', activeMemorySummarizationRequest).replace('{{targetLang}}', targetLang)
        });

        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": `<think>\nI need to summarize the core events and meaningful dialogue from this chunk, removing all flowery prose and trivial actions. I will output the final result in ${targetLang}.\n</think>\nSummary:\n`
            });
        }

        console.log(`[${extensionName}] 🎯 Injected Memory Summarization array in memory.`);
        return;
    }

    if (activeGenerationOrder) {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].content && typeof messages[i].content === 'string') {
                if (messages[i].content.includes("___PS_DUMMY___")) { messages.splice(i, 1); continue; }
                if (messages[i].content.includes("[[order]]")) messages[i].content = messages[i].content.replace(/\[\[order\]\]/g, activeGenerationOrder);
            }
        }
    }

    if (!localProfile) return;

    // Semantic memory retrieval is a network call fired on a debounce, so without
    // waiting here the prompt can be assembled from the previous turn's matches.
    // No-ops unless the search text actually changed, so swipes and regenerations
    // do not pay for it. Only on the real generation path — the token counter and
    // the prompt preview call buildBaseDict(true) and never reach this line.
    try { await memEnsureSemanticQueryFresh(); } catch (e) {
        console.warn("[Megumin Suite] Semantic refresh before prompt build failed; using what is in hand.", e);
    }

    const dict = buildBaseDict();

    if (localProfile.devOverrides) {
        Object.keys(localProfile.devOverrides).forEach(key => { if (dict[key] !== undefined) dict[key] = localProfile.devOverrides[key]; });
    }

    // --- THE ENVELOPE IS THE ONLY WAY IN ---
    // [[blocks]] carries every tracker block now. The per-block anchors are
    // blanked unconditionally: leaving them populated would emit each block
    // twice, once loose and once wrapped. A preset that has not been given a
    // [[blocks]] anchor emits no blocks at all, which is the intended, visible
    // failure rather than a silent fallback to a format nothing renders.
    //
    // [[npc_dossier]] is deliberately NOT blanked: it is the dossier RULES, not
    // the block, and the envelope's slot line refers back to them.
    ["[[infoblock]]", "[[infoblock2]]", "[[npc_inner_chatter]]", "[[npc_inner_chatter2]]",
        "[[storytracker]]", "[[storytracker2]]", "[[npc_dossier2]]"].forEach(t => { dict[t] = ""; });

    let replacementsMade = 0;
    for (const msg of messages) {
        if (msg.content && typeof msg.content === 'string') {
            Object.entries(dict).forEach(([trigger, replacement]) => {
                if (msg.content.includes(trigger)) {
                    const processed = typeof substituteParams === 'function' ? substituteParams(replacement) : replacement;

                    // If the replacement is empty, remove the tag AND the empty line it sits on
                    if (processed.trim() === "") {
                        msg.content = msg.content.replace(new RegExp(`^[ \\t]*${escapeRegex(trigger)}[ \\t]*\\r?\\n?`, 'gm'), "");
                    }

                    // Standard replacement for everything else
                    msg.content = msg.content.replace(new RegExp(escapeRegex(trigger), 'g'), processed);
                    replacementsMade++;
                }
            });

            // Cleanup unused tags (removes the tag AND the line break it sits on).
            //
            // This was a 60-string array written out by hand, and it was the third
            // copy of the placeholder list. It is the one whose failure is worst:
            // a tag missing from here does not blank, it leaks a literal
            // "[[whatever]]" straight into the model's context. Derived from
            // MEGUMIN_SLOT_REGISTRY now, so a new slot cannot be forgotten here.
            meguminAllSlotTriggers().forEach(tr => {
                    if (msg.content.includes(tr)) {
                    msg.content = msg.content.replace(new RegExp(`^[ \\t]*${escapeRegex(tr)}[ \\t]*\\r?\\n?`, 'gm'), "");
                    msg.content = msg.content.replace(new RegExp(escapeRegex(tr), 'g'), ""); // Catch-all for inline tags
                }
            });

            // Cleanup Inline Image Artifacts so the AI doesn't see raw HTML
            msg.content = msg.content.replace(/<img[^>]*?alt=["']KazumaInline["'][^>]*?>/gi, "");
            msg.content = msg.content.replace(/<div[^>]*?title=["']KazumaFail\|[^>]*?>.*?<\/div>/gi, "");
            
            // Comprehensive Image Block Cleanup
            msg.content = msg.content.replace(/<img\s+[^>]*\/>|<div class="kazuma-img-placeholder"[^>]*>[\s\S]*?<\/div>|<!-- kazuma-inline-start:[^>]*-->[\s\S]*?<!-- kazuma-inline-end:[^>]*-->/gi, "");

            // Final Sweep: Collapse 3 or more blank lines into a standard double line break
            msg.content = msg.content.replace(/(?:\r?\n[ \t]*){3,}/g, '\n\n');
        }
    }

    // --- INJECT NPC PORTRAITS AS MULTIMODAL IMAGES ---
    if (activeNpcImages && activeNpcImages.length > 0) {
        // Find the message that contains the NPC list text and convert to multimodal
        for (const msg of messages) {
            if (msg.content && typeof msg.content === 'string' && msg.content.includes('[RELEVANT NPCs]')) {
                const parts = [{ type: "text", text: msg.content }];
                activeNpcImages.forEach(img => {
                    parts.push({ type: "text", text: `[Portrait of ${img.name}]` });
                    parts.push({ type: "image_url", image_url: { url: img.base64, detail: "low" } });
                });
                msg.content = parts;
                break;
            }
        }
        clearActiveNpcImages();
    }

    // ST budgeted this prompt with the placeholders collapsed; trim it back into
    // the live context budget now that they are expanded.
    await meguminFitToContext(messages, data?.dryRun === true);

    if (replacementsMade > 0 && !activeGenerationOrder) {
        console.log(`[${extensionName}] ✅ Executed ${replacementsMade} block replacements.`);
    }

    // --- PROMPT PREVIEW ---
    const isBackgroundGen = isBackgroundGenerationActive();

    // Prevent double-popups from Token Counting or rapid ST background triggers
    const now = Date.now();
    const isSpam = (now - lastPromptPreviewTime) < 2000;
    
    // FIX: ST executes "Dry Runs" whenever you change a chat or tweak a setting to recalculate token limits.
    // We must ignore these so the preview doesn't pop up randomly!
    const isSilentOrDry = type === "count" || type === "quiet" || type === "dry" || type === "dryRun" || data?.dryRun === true || data?.dry === true;

    if (extension_settings[extensionName]?.globalSettings?.promptPreview && !isBackgroundGen && !isSilentOrDry && !isSpam) {
        lastPromptPreviewTime = now; // Lock it immediately

        let promptString = "";
        messages.forEach(m => {
            let contentStr = "";
            if (typeof m.content === "string") contentStr = m.content;
            else if (Array.isArray(m.content)) {
                // Handle multimodal image data safely
                contentStr = m.content.map(c => c.type === "text" ? c.text : "[BASE64 IMAGE DATA]").join("\n");
            }
            promptString += `========== [ ${m.role.toUpperCase()} ] ==========\n${contentStr}\n\n`;
        });

        const $content = $(`
            <div style="display:flex; flex-direction:column; gap:10px; font-family: 'Inter', sans-serif;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">This is the exact payload being sent to the AI API.</div>
                <textarea class="ps-modern-input" readonly style="height: 450px; resize: vertical; font-family: monospace; font-size: 0.75rem; padding: 10px; white-space: pre-wrap; background: rgba(0,0,0,0.5);"></textarea>
            </div>
        `);
        $content.find("textarea").val(promptString);

        const { Popup, POPUP_TYPE } = typeof getContext === "function" ? getContext() : window;
        const popup = new Popup($content, POPUP_TYPE.CONFIRM, "Prompt Payload Preview", { okButton: "Send to AI", cancelButton: "Cancel", wide: true, large: true });

        const confirmed = await popup.show();

        if (!confirmed) {
            messages.length = 0; // Empty the payload
            toastr.info("Generation cancelled by user.");
            
            // FIX: Explicitly tell SillyTavern to abort to prevent Auto-Retry loops
            if (typeof window.stopGeneration === 'function') {
                window.stopGeneration();
            }
            // Fallback: visually click the stop buttons just in case
            setTimeout(() => {
                $("#mes_stop").trigger("click");
                $("#send_but_sheld").trigger("click");
            }, 10);
            
            return;
        }
    }
}
