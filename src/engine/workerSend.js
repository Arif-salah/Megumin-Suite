// ────────────────────────────────────────────────────────────────────────────
// Sending one Chomusuke job straight to its connection profile (plan 019).
//
// The job parks its request and sends its marker quiet prompt as before
// (core/activeRequests.js). While it runs on the worker, the quiet prompt
// wrapper (st.js) comes here instead: the prompt handler builds the job's
// messages on an empty list, exactly as it does on SillyTavern's prompt, and
// sendRequest sends them to the profile. The story's connection never moves.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, extension_settings } from "../st.js";
import { handlePromptInjection } from "./injection.js";
import { isJobMarker, plainMessages, replyLength, answerOf } from "./workerRequest.js";

/** Can this SillyTavern send to a profile without switching? */
export function canSendToProfile() {
    try { return typeof getContext()?.ConnectionManagerRequestService?.sendRequest === "function"; }
    catch (e) { return false; }
}

// The worker preset's response length, else the story's.
function workerReplyLength(ctx, profileId) {
    const profiles = (extension_settings.connectionManager && extension_settings.connectionManager.profiles) || [];
    const profile = profiles.find(p => p.id === profileId);
    let presetLength;
    if (profile && profile.preset) {
        try { presetLength = ctx.getPresetManager("openai")?.getCompletionPresetByName(profile.preset)?.openai_max_tokens; }
        catch (e) { /* no preset manager: the story's length */ }
    }
    return replyLength(presetLength, ctx.chatCompletionSettings && ctx.chatCompletionSettings.openai_max_tokens);
}

/**
 * Sends one quiet prompt to the profile and returns the answer's text.
 * A prompt cancelled in the background prompt preview sends nothing and
 * comes back empty, as it did on the quiet prompt. Throws the API's error.
 * `signal`: the job's stop (phase 3); a stopped job sends nothing more.
 */
export async function sendToProfile(profileId, text, signal = null) {
    if (signal && signal.aborted) throw new DOMException("Chomusuke's job was stopped.", "AbortError");
    const ctx = getContext();
    let messages;
    if (isJobMarker(text)) {
        messages = [];
        await handlePromptInjection({ chat: messages, dryRun: false }, "quiet");
        if (!messages.length) return "";
    } else {
        messages = plainMessages(text);
    }
    const maxTokens = workerReplyLength(ctx, profileId);
    console.debug(`[Megumin-Suite] Chomusuke → profile ${profileId}: ${messages.length} messages, up to ${maxTokens} tokens.`, messages);
    let res = await ctx.ConnectionManagerRequestService.sendRequest(
        profileId, messages, maxTokens,
        { stream: false, extractData: true, includePreset: true, signal });
    // Streamed after all (a preset that forces it): read it to the end.
    if (typeof res === "function") {
        let last = null;
        for await (const chunk of res()) last = chunk;
        res = { content: last ? String(last.text || "") : "" };
    }
    const answer = answerOf(res);
    if (!answer.trim()) console.warn("[Megumin-Suite] Chomusuke's profile sent back no text. What came back:", res);
    return answer;
}
