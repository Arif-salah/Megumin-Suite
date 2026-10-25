// ────────────────────────────────────────────────────────────────────────────
// Image Gen — the Classic prompt, exactly as before task 001 (df9e9db): the
// model writes the whole image prompt, with the relevant NPC Bank image tags
// shown to it when "inject NPC tags" is on.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, generateQuietPrompt, substituteParams } from "../../../st.js";
import { localProfile } from "../../../core/state.js";
import { setActiveImageGenRequest } from "../../../core/activeRequests.js";
import { DEFAULT_PROMPTS } from "../../../prompts/index.js";
import { IMAGE_V2_PROMPTS } from "../../../prompts/imageGenV2.js";
import { meguminCleanChatHistoryText } from "../../../engine/chatText.js";
import { getRelevantNpcImageTags } from "../../npc/data.js";

export async function classicGenerateImagePromptText({ extraInstruction = "" } = {}) {
    setActiveImageGenRequest(classicImageParts({ extraInstruction }));
    let rawOutput = await generateQuietPrompt({ prompt: "___PS_IMAGE_GEN___" });
    return rawOutput.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/**
 * Classic's prompt pieces: the chat, the chosen template's rules and examples,
 * direct language, extra instructions, relevant NPC tags, and the character
 * and persona sheets. Used by the Classic image call and by the combined
 * World State + image call (Chomusuke "Combine calls").
 */
export function classicImageParts({ extraInstruction = "" } = {}) {
    const ig = localProfile.imageGen;
    const chat = getContext().chat;
    const recent = chat.filter(m => !m.is_user && !m.is_system).slice(-5).map(m => {
        return `${m.name}: ${meguminCleanChatHistoryText(m.mes)}`;
    });
    // The image shows the moment the last message ends on; the rest is context.
    const lastMessage = recent.pop() || "";
    const earlierMessages = recent.join("\n\n");

    const customIg = ig.customPromptsEnabled ? (ig.customPrompts || {}) : {};
    const defIg = DEFAULT_PROMPTS.imageGen;

    let rules = "", examples = "";
    const tmpl = ig.promptTemplate || "illus_cinematic";

    const map = {
        "illus_pov": ["rulesIllusPov", "examplesIllusPov"],
        "sdxl_pov": ["rulesSdxlPov", "examplesSdxlPov"],
        "illus_cinematic": ["rulesIllusCinematic", "examplesIllusCinematic"],
        "sdxl_cinematic": ["rulesSdxlCinematic", "examplesSdxlCinematic"],
        "illus_portrait": ["rulesIllusPortrait", "examplesIllusPortrait"],
        "sdxl_portrait": ["rulesSdxlPortrait", "examplesSdxlPortrait"]
    };

    const keys = map[tmpl];
    if (keys) {
        rules = customIg[keys[0]] || defIg[keys[0]];
        examples = customIg[keys[1]] || defIg[keys[1]];
    }

    if (!ig.includeExamples) examples = "";
    rules = [rules, IMAGE_V2_PROMPTS.inEnglish].filter(Boolean).join("\n");

    let directLangStr = ig.directLanguage ? "**DIRECT LANGUAGE:** Use exact Booru tags only. \"naked\" not \"wearing nothing.\" \"erection\" not \"visible arousal.\"\n\n**NSFW TAG REFERENCE (use when scene is explicit):**\nBody: naked, nude, topless, exposed nipples, small breasts, medium breasts, large breasts, spread legs, ass, erection, veins, veiny penis\nActions: hetero, sex, vaginal, anal, oral, fellatio, after fellatio, paizuri, straddling, riding, missionary, doggystyle, cowgirl position, moaning, open mouth, tongue out, ahegao, clenching teeth\nFluids: cum, cum on body, cum on breasts, cum on face, cum on hair, cum on tongue, cum in mouth, cum inside, ejaculation, facial, saliva, sweat\nState: flushed face, heavy breathing, trembling, crying with eyes open, half-closed eyes, solo focus" : "";
    let npcTagsStr = getRelevantNpcImageTags({ force: true }); // <-- GET THE TAGS (manual: whenever there are any)

    return {
        chatText: earlierMessages,
        lastMessage,
        templateRules: rules,
        templateExamples: examples,
        extraStr: [ig.promptExtra || "", extraInstruction].filter(Boolean).join("\n"),
        directLanguageStr: directLangStr,
        npcTagsStr: npcTagsStr, // <-- ADD TO REQUEST
        characterSheets: buildCharacterSheets()
    };
}

/** Classic's image rules as one block, for Task 2 of the combined call. */
export function classicImageRulesBlock(parts) {
    return [
        parts.npcTagsStr,
        parts.templateRules,
        parts.directLanguageStr,
        parts.extraStr ? `Extra Instructions: ${parts.extraStr}` : "",
        parts.templateExamples
    ].filter(s => String(s || "").trim()).join("\n\n");
}

/**
 * The card description(s) and the persona, so the image prompt knows what the
 * characters look like instead of guessing from the last few messages. In a
 * group chat, every member's description.
 */
/**
 * @param {{ personality?: boolean }} [opts]
 *   personality: add the card's Personality field (look reads: some cards keep
 *   the looks there). Off for the Classic manual prompt, which sends this every time.
 */
export function buildCharacterSheets({ personality = false } = {}) {
    const ctx = getContext();
    const sub = t => { try { return substituteParams(t); } catch (e) { return t; } };
    const clean = t => String(t || "").trim();
    const parts = [];
    const sheet = ch => {
        const desc = [clean(ch && ch.description), personality ? clean(ch && ch.personality) : ""].filter(Boolean).join("\n\n");
        if (desc) parts.push(`<character_sheet name="${ch.name}">\n${sub(desc)}\n</character_sheet>`);
    };
    if (ctx.groupId !== undefined && ctx.groupId !== null) {
        const group = (ctx.groups || []).find(g => g.id === ctx.groupId);
        for (const avatar of (group && group.members) || []) {
            sheet((ctx.characters || []).find(c => c.avatar === avatar));
        }
    } else {
        sheet((ctx.characters || [])[ctx.characterId]);
    }
    const persona = clean(sub("{{persona}}"));
    if (persona && persona !== "{{persona}}") {
        parts.push(`<persona_sheet name="${sub("{{user}}")}">\n${persona}\n</persona_sheet>`);
    }
    if (!parts.length) return "";
    return "Use these sheets for what each character looks like:\n\n" + parts.join("\n\n");
}

/** The NPC tag section for the inline [[img1]] instruction (Classic). */
export function classicInlineNpcTags() {
    return getRelevantNpcImageTags();
}
