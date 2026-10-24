// ────────────────────────────────────────────────────────────────────────────
// What Chomusuke is doing right now (plan 019, phase 3), for the indicator on
// the blocks bar. tasks.js publishes; the indicator listens. Pure.
// ────────────────────────────────────────────────────────────────────────────

import { joinJobNames } from "./chomusukeNotice.js";

let status = { running: null, waiting: 0 };
const listeners = new Set();

/** { running: { jobs: string[] } | null, waiting: number } */
export function getChomusukeStatus() {
    return status;
}

export function setChomusukeStatus(next) {
    status = { running: next.running || null, waiting: Math.max(0, next.waiting || 0) };
    listeners.forEach(fn => { try { fn(status); } catch (e) { /* a listener's problem stays its own */ } });
}

export function onChomusukeStatus(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

// What the Stop button on the indicator does (set by the indicator module, so
// the card builder needs nothing but this file).
let stopHandler = null;
export function setChomusukeStopHandler(fn) { stopHandler = fn; }
export function stopFromIndicator() { if (stopHandler) stopHandler(); }

/** "World State and Blocks… (2 more waiting)", or "" when Chomusuke is idle. */
export function chomusukeStatusText(s = status) {
    if (!s.running) return s.waiting ? `${s.waiting} job${s.waiting === 1 ? "" : "s"} waiting…` : "";
    const what = joinJobNames(s.running.jobs || []) || "a job";
    return `${what}…${s.waiting ? ` (${s.waiting} more waiting)` : ""}`;
}
