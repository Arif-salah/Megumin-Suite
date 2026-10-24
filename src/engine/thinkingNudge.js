// ────────────────────────────────────────────────────────────────────────────
// The Thinking Cap's last word. Models that over-think (Kimi, DeepSeek) follow
// a rule that is the last thing they read far better than one at the top of a
// long prompt, so while V11's Thinking Cap is picked its rules are repeated as
// the last user-side message: after the chat, before any assistant prefill.
//
// Pure: no imports from SillyTavern.
// ────────────────────────────────────────────────────────────────────────────

import { V11_CAP_NUDGE } from "../../data/cot/v11.js";

// A line only the Thinking Cap's text carries: the nudge goes out only when
// the cap itself did (a preset that brings its own thinking never sends it).
const CAP_MARK = "A mental draft is a draft.";

/** The nudge for this thinking choice, or "" when it has none. */
export function thinkingNudgeFor(model) {
    return String(model || "").startsWith("cot-v11-cap-") ? V11_CAP_NUDGE : "";
}

/**
 * Adds the nudge as a user message after the last non-assistant message, so a
 * trailing assistant prefill stays last. Only when the cap's text is in the
 * prompt. Returns true when it was added.
 * @param {{role: string, content: any}[]} messages
 */
export function addThinkingNudge(messages, model) {
    const nudge = thinkingNudgeFor(model);
    if (!nudge || !Array.isArray(messages)) return false;
    const sent = messages.some(m => typeof m.content === "string" && m.content.includes(CAP_MARK));
    if (!sent) return false;
    let at = messages.length;
    while (at > 0 && messages[at - 1].role === "assistant") at--;
    messages.splice(at, 0, { role: "user", content: nudge });
    return true;
}
