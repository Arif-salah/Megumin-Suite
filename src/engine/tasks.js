// ──────────────────────────────────────────────────────────────────────────────
// Running a one-off generation through SillyTavern.
//
// The pattern throughout: park a payload in activeRequests, fire a quiet prompt
// that the injection handler recognises, clear the payload in a finally.
// useMeguminEngine additionally swaps the OpenAI preset for the duration and puts
// it back, so a background task can use a different preset than the roleplay.
// ──────────────────────────────────────────────────────────────────────────────

import { generateQuietPrompt, eventSource, event_types, extension_settings, isGenerating, getContext, online_status, waitUntilCondition, setQuietRoute } from "../st.js";
import { extensionName, TARGET_PRESET_NAME } from "../core/constants.js";
import { localProfile } from "../core/state.js";
import { setActiveBanListChat, setActiveGenerationOrder } from "../core/activeRequests.js";
import { warnChomusuke } from "./chomusukeNotice.js";
import { workerRoute, requestError, storyWaitsFor } from "./workerRequest.js";
import { canSendToProfile, sendToProfile } from "./workerSend.js";
import { setChomusukeStatus } from "./chomusukeStatus.js";

// Chomusuke's connection when it should use whatever the story uses: its jobs
// run one at a time as usual, with no switching.
export const CURRENT_CONNECTION = "__current__";

/**
 * Returns available SillyTavern Connection Profiles.
 * @returns {Array<{id: string, name: string, mode?: string}>}
 */
export function getSillyTavernConnectionProfiles() {
    try {
        const profiles = extension_settings?.connectionManager?.profiles;
        if (Array.isArray(profiles)) {
            return profiles.map(p => ({ id: p.id, name: p.name, mode: p.mode }));
        }
    } catch (err) {
        console.warn(`[${extensionName}] Unable to read connectionManager profiles:`, err);
    }
    return [];
}

/**
 * Returns the currently active connection profile ID in SillyTavern.
 * @returns {string}
 */
export function getCurrentConnectionProfileId() {
    try {
        return extension_settings?.connectionManager?.selectedProfile || "";
    } catch {
        return "";
    }
}

/**
 * Safely switches SillyTavern's active connection profile by ID.
 * Awaits both CONNECTION_PROFILE_LOADED and backend online_status readiness.
 * 
 * @param {string} profileId
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<boolean>}
 */
export async function applyConnectionProfileById(profileId, timeoutMs = 10000) {
    const select = document.getElementById("connection_profiles");
    if (!select) {
        console.warn(`[${extensionName}] #connection_profiles element not found in DOM.`);
        return false;
    }

    // Check if the requested profile ID exists in options (or is empty for None)
    const options = Array.from(select.options);
    const targetIndex = profileId ? options.findIndex(o => o.value === profileId) : 0;
    if (targetIndex === -1 && profileId) {
        console.warn(`[${extensionName}] Connection profile ID "${profileId}" not found in options.`);
        return false;
    }

    // If it's already the selected profile, no need to switch unless disconnected
    if (select.selectedIndex === targetIndex && targetIndex >= 0) {
        const currentStatus = getContext()?.onlineStatus || online_status;
        if (!profileId || (currentStatus && currentStatus !== "no_connection")) {
            return true;
        }
    }

    // 1. Await CONNECTION_PROFILE_LOADED
    const awaitLoaded = new Promise((resolve) => {
        let settled = false;
        let timer = null;

        const onLoaded = () => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            resolve(true);
        };

        if (eventSource && event_types?.CONNECTION_PROFILE_LOADED) {
            eventSource.once(event_types.CONNECTION_PROFILE_LOADED, onLoaded);
        }

        timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            console.warn(`[${extensionName}] Timed out waiting for CONNECTION_PROFILE_LOADED for "${profileId}".`);
            resolve(false);
        }, timeoutMs);
    });

    select.selectedIndex = targetIndex;
    select.dispatchEvent(new Event("change"));

    await awaitLoaded;

    // 2. Await backend online_status readiness (mirrors SillyTavern's own /profile command)
    if (profileId) {
        try {
            await waitUntilCondition(() => {
                const status = getContext()?.onlineStatus || online_status;
                return status && status !== "no_connection";
            }, timeoutMs, 100, { rejectOnTimeout: false });
        } catch (err) {
            console.warn(`[${extensionName}] Error waiting for online_status:`, err);
        }
    }

    // 3. Settle buffer for UI state, samplers, and secrets rotation
    await new Promise(r => setTimeout(r, 400));

    // 4. Verify backend connection succeeded
    if (profileId) {
        const finalStatus = getContext()?.onlineStatus || online_status;
        if (!finalStatus || finalStatus === "no_connection") {
            console.error(`[${extensionName}] Connection profile "${profileId}" failed to achieve connection. Status: ${finalStatus}`);
            return false;
        }
    }

    return true;
}

/**
 * Executes a task using Chomusuke (the worker connection profile) if enabled and configured.
 * Otherwise executes the task directly using the currently active model.
 * 
 * Guarantees primary connection profile restoration on completion or error.
 * 
 * @param {"memory"|"storyPlan"|"npc"|"banList"|"imageGen"|"styleGen"|"worldState"|"test"} featureKey
 * @param {() => Promise<any>} task
 * @param {{ force?: boolean, jobs?: string[] }} [options]  jobs: what a failure
 *        message names (a combined call covers several); default [featureKey].
 *        A failure on the worker is shown here and comes back as null, so a
 *        caller that gets null has nothing more to tell the user.
 * @returns {Promise<any>}
 */
// ── Worker session ───────────────────────────────────────────────────────
// Switching (the fallback): from the moment the worker profile is switched IN
// until the main profile is switched back, SillyTavern's active connection is
// the worker. SillyTavern swaps Send for Stop while the worker is generating,
// but not while the profile is switching either way, so a message sent in
// those gaps would go to the worker. The session promise lets the send guard
// (index.js) wait it out.
let workerSession = null;

// Sending to the profile: the story's connection never moves, but a message
// sent while Chomusuke still reads the last reply (World State, Blocks, the
// Notebook) waits for it, so the next prompt's Current Info has its result.
let readsPending = 0;
let readsDone = null;
let endReads = null;
function holdReplies() {
    if (readsPending++ === 0) readsDone = new Promise(r => { endReads = r; });
}
function releaseReplies() {
    if (--readsPending > 0) return;
    readsPending = 0;
    readsDone = null;
    if (endReads) endReads();
}

/** Resolves when the message you sent can go; null when nothing holds it. */
export function chomusukeSessionPromise() {
    const waits = [workerSession, readsDone].filter(Boolean);
    return waits.length ? Promise.all(waits) : null;
}

// True while the send guard holds your message. The story is not writing yet,
// so a queued Chomusuke job must not wait for it.
let replyHeld = false;
export function setReplyHeld(v) { replyHeld = Boolean(v); }

// The profile a Chomusuke job is sending to right now (the background prompt
// log names it), or null.
let profileNow = null;
export function chomusukeProfileNow() { return profileNow; }

// ── Stopping jobs (phase 3) ──────────────────────────────────────────────
// Every queued or running job has its own AbortController and the chat it was
// queued in. Leaving that chat stops it; so does Stop on the indicator. A
// stopped job that hasn't started never runs; a running one is cut off (the
// request on its profile, or SillyTavern's quiet generation). Either comes
// back null with no warning.
const liveJobs = new Set();
let runningEntry = null;
// A read that falls back to a separate read when its answer is unusable would
// queue a new job straight after a stop: jobs queued this soon after Stop, in
// the same chat, are dropped too.
let stoppedAt = 0;
let stoppedChat = null;
const STOP_SPILL_MS = 3000;

function publishStatus() {
    const waiting = [...liveJobs].filter(e => e !== runningEntry && !e.controller.signal.aborted).length;
    setChomusukeStatus({ running: runningEntry ? { jobs: runningEntry.jobs } : null, waiting });
}

/**
 * Stops Chomusuke's jobs: all of them, or those `stop(entry)` picks
 * (entry: { jobs, chatId }). Returns how many it stopped.
 */
export function stopChomusukeJobs(stop = () => true) {
    let n = 0;
    for (const e of liveJobs) {
        if (e.controller.signal.aborted || !stop(e)) continue;
        e.controller.abort();
        n++;
        // A quiet generation (current connection, or switched) is SillyTavern's
        // own: stop it there. A request to the profile stops on its signal.
        if (e === runningEntry && e.route && e.route !== "profile") {
            try { const ctx = getContext(); if (ctx && typeof ctx.stopGeneration === "function") ctx.stopGeneration(); } catch (err) { /* already stopped */ }
        }
    }
    if (n) {
        stoppedAt = Date.now();
        stoppedChat = getContext()?.chatId ?? null;
    }
    publishStatus();
    return n;
}

/** Leaving a chat stops the jobs queued for another one. */
export function stopJobsForOtherChats() {
    const chatId = getContext()?.chatId ?? null;
    return stopChomusukeJobs(e => e.chatId !== chatId);
}

/** Is the connection switched for each job (the Settings fallback, or an old SillyTavern)? */
export function chomusukeSwitches() {
    return !canSendToProfile() || extension_settings[extensionName]?.globalSettings?.chomusukeSwitchConnection === true;
}

/** How a job would go out now: "current", "profile" or "switch" (workerRequest.js). */
function routeFor(workerProfileId) {
    return workerRoute({
        profileId: workerProfileId === CURRENT_CONNECTION ? "" : workerProfileId,
        currentId: getCurrentConnectionProfileId(),
        hasService: canSendToProfile(),
        fallback: chomusukeSwitches(),
    });
}

export async function runWithChomusuke(featureKey, task, { force = false, jobs = null } = {}) {
    const chomusuke = localProfile?.chomusuke;
    const isEnabled = Boolean(chomusuke?.enabled) || force;
    const workerProfileId = chomusuke?.profileId;
    const isFeatureEnabled = featureKey === "test" || chomusuke?.features?.[featureKey] !== false;

    // If Chomusuke is not enabled, missing a profile, or toggled off for this feature -> run directly
    if (!isEnabled || !workerProfileId || !isFeatureEnabled) {
        return await task();
    }

    // One worker run at a time. Several features now run after every reply
    // (World State read, the auto image prompt); two runs switching the
    // connection profile over each other would restore the main profile while
    // the other is still working. Queued in arrival order, so an image prompt
    // started after a World State read sees the outfits that read produced.
    //
    // Never call runWithChomusuke from INSIDE a task it is running: the inner
    // call queues behind the outer one and both wait forever. Do that work
    // before starting the outer job. The watchdog below names a stuck queue.
    const jobList = jobs || [featureKey];
    const chatId = getContext()?.chatId ?? null;
    if (stoppedAt && Date.now() - stoppedAt < STOP_SPILL_MS && chatId === stoppedChat && featureKey !== "test") {
        console.debug(`[${extensionName}] Chomusuke "${featureKey}" dropped: you stopped Chomusuke a moment ago.`);
        return null;
    }
    const entry = { jobs: jobList, chatId, controller: new AbortController(), route: null };
    liveJobs.add(entry);
    publishStatus();
    const holds = routeFor(workerProfileId) === "profile" && storyWaitsFor(jobList);
    if (holds) holdReplies();
    const waitingSince = Date.now();
    const ahead = runningWorkerJob;
    const watchdog = setTimeout(() => {
        console.warn(`[${extensionName}] Chomusuke "${featureKey}" has waited ${Math.round((Date.now() - waitingSince) / 1000)}s behind "${ahead || "?"}". If this never ends, a Chomusuke call is being made from inside another Chomusuke job.`);
    }, 90000);
    const turn = workerQueue.then(async () => {
        clearTimeout(watchdog);
        try {
            if (entry.controller.signal.aborted) return null;
            runningWorkerJob = featureKey;
            runningEntry = entry;
            publishStatus();
            return await runOnWorker(featureKey, task, chomusuke, workerProfileId, jobList, entry);
        } finally {
            if (runningEntry === entry) { runningWorkerJob = null; runningEntry = null; }
            liveJobs.delete(entry);
            publishStatus();
            if (holds) releaseReplies();
        }
    });
    workerQueue = turn.catch(() => {});
    return turn;
}

let runningWorkerJob = null;

/** The Chomusuke job running right now ("worldState", "imageGen"…), or null. */
export function chomusukeJobRunning() {
    return runningWorkerJob;
}

let workerQueue = Promise.resolve();

async function runOnWorker(featureKey, task, chomusuke, workerProfileId, jobs, entry) {
    const signal = entry.controller.signal;
    // Traffic guard: wait while the story model is writing, so the job reads
    // the finished reply. Not for a message the send guard is holding: that
    // one waits for us.
    let waitLoops = 0;
    while (typeof isGenerating === "function" && isGenerating() && !replyHeld && !signal.aborted && waitLoops < 60) {
        await new Promise(r => setTimeout(r, 500));
        waitLoops++;
    }

    if (signal.aborted) return null;

    const route = routeFor(workerProfileId);
    entry.route = route;
    if (route === "current") {
        // The story's own connection, or the worker profile is already active.
        const result = await task();
        return signal.aborted ? null : result;
    }
    if (route === "profile") return await runOnProfile(featureKey, task, workerProfileId, jobs, signal);

    const currentProfileId = getCurrentConnectionProfileId();
    const originalProfileId = chomusuke.primaryProfileId || currentProfileId;

    let switchedToWorker = false;
    let endSession;
    const session = new Promise(resolve => { endSession = resolve; });
    workerSession = session;

    try {
        switchedToWorker = await applyConnectionProfileById(workerProfileId, 10000);
        if (!switchedToWorker) {
            throw new Error("Worker profile failed to establish connection (timed out or offline).");
        }

        const result = await task();
        if (signal.aborted) return null;
        if (result === undefined || result === null) {
            throw new Error("Worker model returned no output.");
        }

        return result;
    } catch (e) {
        if (signal.aborted) return null;
        console.error(`[${extensionName}] Chomusuke worker execution failed for "${featureKey}":`, e);
        warnChomusuke("failed", jobs, { error: e, switchedBack: true });
        return null;
    } finally {
        if (switchedToWorker) {
            try {
                await applyConnectionProfileById(originalProfileId, 10000);
            } catch (restoreErr) {
                console.error(`[${extensionName}] Failed to restore primary connection profile "${originalProfileId}":`, restoreErr);
            }
        }
        if (workerSession === session) workerSession = null;
        endSession();
    }
}

// The job's quiet prompts go to the profile with sendRequest. A quiet prompt
// sent by anything else while the job runs goes there too, as it did while
// the connection was switched.
async function runOnProfile(featureKey, task, workerProfileId, jobs, signal) {
    let sendError = null;
    profileNow = workerProfileId;
    setQuietRoute(async text => {
        try { return await sendToProfile(workerProfileId, text, signal); }
        catch (e) { sendError = e; throw e; }
    });
    try {
        const result = await task();
        if (signal.aborted) return null;
        if (result === undefined || result === null) {
            throw sendError || new Error("Worker model returned no output.");
        }
        return result;
    } catch (e) {
        if (signal.aborted) {
            console.debug(`[${extensionName}] Chomusuke "${featureKey}" was stopped.`);
            return null;
        }
        console.error(`[${extensionName}] Chomusuke failed for "${featureKey}" on its profile:`, e);
        // Most jobs catch their own errors and return null: the API's words
        // are in sendError then.
        warnChomusuke("failed", jobs, { error: requestError(sendError || e) });
        return null;
    } finally {
        setQuietRoute(null);
        profileNow = null;
    }
}

export async function analyzeSlopDirectly(chatText) {
    setActiveBanListChat(chatText);
    try {
        let rawOutput = await generateQuietPrompt({ prompt: "___PS_BANLIST___", quietPrompt: "___PS_BANLIST___" });
        return rawOutput.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    } catch (e) {
        console.error(`[${extensionName}] Ban List Analysis Failed:`, e);
        return null;
    } finally {
        setActiveBanListChat(null);
    }
}


export async function analyzeSlopWithPreset(chatText) {
    return await runWithChomusuke("banList", () => analyzeSlopDirectly(chatText));
}

export async function useMeguminEngine(task, targetPreset = TARGET_PRESET_NAME) {
    const selector = $("#settings_preset_openai");
    const option = selector.find(`option`).filter(function () { return $(this).text().trim() === targetPreset; });
    let originalValue = null;

    if (option.length) {
        originalValue = selector.val();
        selector.val(option.val()).trigger("change");
        toastr.info(`Switched to ${targetPreset} preset... Please wait.`);
        await new Promise(r => setTimeout(r, 3000));
    } else {
        toastr.error(`"${targetPreset}" not found in OpenAI presets.`);
        return;
    }

    try {
        await task();
    } catch (e) {
        console.error(`[${extensionName}] AI Error:`, e);
    } finally {
        await new Promise(r => setTimeout(r, 500));
        selector.val(originalValue).trigger("change");
    }
}

export async function runMeguminTask(orderText) {
    setActiveGenerationOrder(orderText);
    try {
        return await generateQuietPrompt({ prompt: "___PS_DUMMY___" });
    } finally {
        setActiveGenerationOrder(null);
    }
}
