// ────────────────────────────────────────────────────────────────────────────
// Chomusuke sending a job straight to its connection (plan 019).
//
// SillyTavern's ConnectionManagerRequestService.sendRequest sends messages to
// a connection profile without touching the story's connection. This module
// holds the choices around it, pure so they are tested under node: which way
// a job goes, what is sent, how long the answer may be, what comes back.
// The sending itself is in workerSend.js.
// ────────────────────────────────────────────────────────────────────────────

/**
 * How a Chomusuke job reaches its model.
 *   "current": a quiet prompt on the story's own connection
 *   "profile": sendRequest to the worker profile (the default)
 *   "switch":  the old way, switching SillyTavern's connection and back
 *              (the Settings fallback, or a SillyTavern without sendRequest)
 * @param {{ profileId: string, currentId: string, hasService: boolean, fallback: boolean }} o
 */
export function workerRoute({ profileId, currentId, hasService, fallback }) {
    if (!profileId || profileId === currentId) return "current";
    if (!hasService || fallback) return "switch";
    return "profile";
}

// The quiet prompts our jobs send: "___PS_WORLD_EXTRACT___" and so on. The
// prompt handler swaps each one for the job's own messages.
const MARKER = /^___PS_[A-Z_]+___$/;

/** Is this quiet prompt one of the jobs' markers? */
export function isJobMarker(text) {
    return MARKER.test(String(text || "").trim());
}

/** A plain prompt (Test's "Reply with the single word: OK") goes as one user message. */
export function plainMessages(text) {
    const t = String(text || "").trim();
    return t ? [{ role: "user", content: t }] : [];
}

/**
 * The longest answer to ask for: the worker preset's response length, else
 * the story's, else 1024.
 */
export function replyLength(presetLength, storyLength) {
    for (const n of [presetLength, storyLength]) {
        const v = Math.floor(Number(n));
        if (Number.isFinite(v) && v > 0) return v;
    }
    return 1024;
}

/** The text out of sendRequest's answer ({ content, reasoning }); the reasoning is dropped. */
export function answerOf(res) {
    if (typeof res === "string") return res;
    if (res && typeof res.content === "string") return res.content;
    return "";
}

/**
 * The API's own words for a failed request. sendRequest wraps every error in
 * "API request failed" and puts the real one in `cause`.
 */
export function requestError(e) {
    let err = e;
    for (let i = 0; i < 4 && err && err.cause; i++) err = err.cause;
    const msg = String((err && err.message) || err || "").trim();
    return msg || String((e && e.message) || e || "").trim();
}

/** Only Chat Completion profiles: we don't support Text Completion. */
export function isChatProfile(p) {
    return Boolean(p) && p.mode !== "tc";
}

// The jobs that read the reply just written. A message sent while one of them
// is still working waits for it, so the next prompt's Current Info has its
// result (the send guard in index.js).
const READS_THE_REPLY = new Set(["worldState", "blocks", "notebook"]);

/** Does a message you send wait for this job? `jobs` = what the call covers. */
export function storyWaitsFor(jobs) {
    return (jobs || []).some(j => READS_THE_REPLY.has(j));
}
