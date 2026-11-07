// ────────────────────────────────────────────────────────────────────────────
// Telling the user when Chomusuke's answer is missing or unusable (plan 016).
//
// Three different problems, three different fixes, so three messages:
//   failed: the request errored (connection, key, provider)
//   empty:  it answered with nothing, or only with its thinking
//   format: it answered, but not in a format the job can use
//
// Pure apart from the toast itself, so the wording is tested under node.
// ────────────────────────────────────────────────────────────────────────────

// What each job is called in a message (runWithChomusuke's feature keys and
// the parts of a combined call).
export const CHOMUSUKE_JOB_NAMES = {
    worldState: "World State",
    blocks: "Blocks",
    // Plan 023: a read of custom blocks only (its own job name, same thing to the user).
    customBlocks: "Blocks",
    notebook: "The Notebook",
    imageGen: "the image",
    memory: "the memory summary",
    storyPlan: "the Story Director",
    npc: "the NPC Bank",
    banList: "Banned Phrases",
    styleGen: "the writing style",
    test: "the test"
};

// Jobs whose result has a card with a Read again button.
const HAS_READ_AGAIN = new Set(["worldState", "blocks", "customBlocks", "notebook"]);

const nameOf = job => CHOMUSUKE_JOB_NAMES[job] || job;

/** "A", "A and B", "A, B and C" */
export function joinJobNames(jobs) {
    const names = jobs.map(nameOf);
    if (names.length <= 1) return names[0] || "";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Empty once the thinking is taken out? Then it said nothing. */
export function answerKind(raw) {
    const text = String(raw ?? "").replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "").trim();
    return text ? "format" : "empty";
}

// Why a request failed, in the user's words. SillyTavern hands back no status
// number, only words: the provider's status text ("Bad Gateway",
// "Unauthorized") or the connection's own error ("fetch failed", "terminated":
// SillyTavern answers 502 itself when it can't reach the provider at all).
// [test, what happened, what to do]; the error's own words go in brackets.
const FAILURE_REASONS = [
    [/unauthori[sz]ed|forbidden|invalid[^.]*key|api key|authenticat|\b40[13]\b/i,
        "The provider didn't accept the API key", "Check the key in Chomusuke's connection profile."],
    [/too many requests|rate.?limit|quota|insufficient|\b429\b/i,
        "The provider is limiting requests right now, or the credits are used up", "Wait a little, or check your plan with them."],
    [/context length|too long|maximum context|payload too large|\b413\b/i,
        "The request was too long for Chomusuke's model", "Pick a model that takes longer prompts."],
    [/model[^.]*(not found|not exist|unavailable)|no such model|\b404\b|not found/i,
        "The provider doesn't know the model set for Chomusuke", "Check the model in Chomusuke's connection profile."],
    [/bad gateway|service unavailable|gateway timeout|internal server error|overloaded|\b5\d\d\b/i,
        "The provider's server had a problem on their side", "This usually passes in a minute."],
    [/fetch failed|terminated|socket hang up|econnreset|etimedout|timed? ?out|connection refused|econnrefused|enotfound|eai_again|network|other side closed/i,
        "The provider couldn't be reached: the connection dropped or timed out", "This usually passes in a minute. If it keeps happening, check your internet or the provider's status page."]
];

/** The failure in plain words: "<what happened> (<the error's words>). <what to do>" */
export function failureReason(error) {
    const why = String(error?.message || error || "").trim().slice(0, 200);
    const hit = why && FAILURE_REASONS.find(([re]) => re.test(why));
    if (hit) return `${hit[1]} (${why}). ${hit[2]}`;
    return why ? `The request failed (${why}).` : "The request failed.";
}

/**
 * @param {"failed"|"empty"|"format"} kind
 * @param {string[]} jobs  feature keys (worldState, blocks, …)
 * @param {{ error?: any, switchedBack?: boolean }} [opts]  switchedBack: Chomusuke had
 *        switched the connection and has switched it back
 * @returns {string}
 */
export function chomusukeProblemText(kind, jobs, { error, switchedBack = false } = {}) {
    const what = joinJobNames(jobs);
    const readAgain = jobs.some(j => HAS_READ_AGAIN.has(j));
    if (kind === "failed") {
        return `Chomusuke couldn't get an answer for ${what}. ${failureReason(error)}`
            + (readAgain ? " Then use Read again on the card." : "")
            + (switchedBack ? " Your story connection is back." : "");
    }
    if (kind === "empty") {
        return `Chomusuke's model sent back nothing for ${what}. A censored model can refuse an NSFW story without a word: try a less censored one (GLM 5.3 Flash, DeepSeek 4.1 Flash) in the Chomusuke tab, or check its connection there`
            + (readAgain ? ", then use Read again on the card." : ".");
    }
    return `Chomusuke answered, but not in a format it could use for ${what}, so nothing changed. `
        + (readAgain ? "Use Read again on the card, or pick a stronger model for Chomusuke." : "Pick a stronger model for Chomusuke if this keeps happening.");
}

// ── Once per chat (plan 020) ──────────────────────────────────────────────
// An empty answer usually means the model refuses this story, and it will keep
// refusing every reply: one warning per chat says it, more is noise. Failed
// requests and wrong formats still warn every time (they come and go).

/** Should this warning show? Records it in `seen` when it does. */
export function shouldWarn(kind, chatId, seen) {
    if (kind !== "empty") return true;
    const key = String(chatId || "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
}

const warnedEmpty = new Set();
const openChatId = () => {
    try { return globalThis.SillyTavern?.getContext?.()?.chatId || ""; } catch (e) { return ""; }
};

// ── The Test button (plan 020) ────────────────────────────────────────────
// Asks for one known word, so the test checks the model follows a short
// instruction, not only that something came back.

export const TEST_WORD = "pineapple";
export const TEST_PROMPT = `Reply with only this one word and nothing else: ${TEST_WORD}`;

/** "ok": the word came back; "empty": nothing (or only thinking); "other": something else. */
export function testAnswerKind(raw) {
    if (answerKind(raw) === "empty") return "empty";
    const text = String(raw).replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "");
    return new RegExp(`\\b${TEST_WORD}\\b`, "i").test(text) ? "ok" : "other";
}

/** Shows the warning. A failed request is an error (red), the rest are warnings.
 *  An empty answer warns once per chat. */
export function warnChomusuke(kind, jobs, opts) {
    if (!jobs.length || typeof toastr === "undefined") return;
    if (!shouldWarn(kind, openChatId(), warnedEmpty)) return;
    const text = chomusukeProblemText(kind, jobs, opts);
    if (kind === "failed") toastr.error(text, "Chomusuke", { timeOut: 12000 });
    else toastr.warning(text, "Chomusuke", { timeOut: 7000 });
}
