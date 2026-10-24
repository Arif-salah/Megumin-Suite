// ────────────────────────────────────────────────────────────────────────────
// Background prompts (plan 013): show a background job's prompt before it is
// sent (Settings → "Preview background prompts"), and keep the last 10 sent.
//
// Called by the prompt handler (injection.js) right after it has swapped a
// background marker for the job's messages, so every job and both routes
// (story model, Chomusuke) pass through here.
//
// The log lives in the browser's database (SillyTavern's localforage), never
// in the settings file: one list of 10 for the whole install.
// ────────────────────────────────────────────────────────────────────────────

import {
    activeStoryPlanRequest, activeNpcScanRequest, activeWorldExtractRequest, activeNpcUpdateRequest,
    activeBanListChat, activeImageGenRequest, activeNpcPfpRequest, activeMemorySummarizationRequest,
    activeGenerationOrder,
} from "../core/activeRequests.js";
import { extension_settings, getContext, saveSettingsDebounced, Popup, POPUP_TYPE } from "../st.js";
import { extensionName } from "../core/constants.js";
import { getCurrentConnectionProfileId, chomusukeJobRunning, chomusukeProfileNow } from "./tasks.js";
import { bgJobLabel, bgJobWanted, messageText, editableText, applyEditedTexts, makeLogEntry, pushLog } from "./bgPromptsCore.js";

const LOG_KEY = "megumin_background_prompts";

function gs() {
    const store = extension_settings[extensionName];
    if (!store) return {};
    if (!store.globalSettings) store.globalSettings = {};
    return store.globalSettings;
}

/**
 * Which background job the prompt being built belongs to, or null for the
 * story. Same order as the prompt handler's own checks.
 */
export function backgroundJobNow() {
    if (activeStoryPlanRequest) return "director";
    if (activeNpcScanRequest) return "npc";
    if (activeWorldExtractRequest) return activeWorldExtractRequest.job || "world";
    if (activeNpcUpdateRequest) return "npc";
    if (activeBanListChat) return "banlist";
    if (activeImageGenRequest) return (activeImageGenRequest.v2 && activeImageGenRequest.v2.job) || "images";
    if (activeNpcPfpRequest) return "npc";
    if (activeMemorySummarizationRequest) return "memory";
    if (activeGenerationOrder) return "style";
    return null;
}

/** The connection this call goes out on, in the user's words. */
function connectionLabel() {
    const id = chomusukeProfileNow() || getCurrentConnectionProfileId();
    const profiles = (extension_settings.connectionManager && extension_settings.connectionManager.profiles) || [];
    const p = profiles.find(x => x.id === id);
    const name = p ? p.name : "your current connection";
    return chomusukeJobRunning() ? `Chomusuke · ${name}` : name;
}

// ── The log ──────────────────────────────────────────────────────────────

function store() {
    return (typeof window !== "undefined" && window.localforage) || null;
}

export async function readBackgroundLog() {
    const lf = store();
    if (!lf) return [];
    try { const v = await lf.getItem(LOG_KEY); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
}

// Writes are chained so two jobs finishing together don't drop one entry.
let writing = Promise.resolve();
function addToLog(entry) {
    const lf = store();
    if (!lf) return;
    writing = writing.then(async () => {
        try { await lf.setItem(LOG_KEY, pushLog(await readBackgroundLog(), entry)); }
        catch (e) { console.warn(`[${extensionName}] Could not save the background prompt log.`, e); }
    });
}

export async function clearBackgroundLog() {
    const lf = store();
    if (lf) { try { await lf.removeItem(LOG_KEY); } catch (e) { /* nothing to clear */ } }
}

// ── The hook ─────────────────────────────────────────────────────────────

/**
 * After the prompt handler built a background job's messages: log them, and
 * when the preview is on for this job, let the user read, edit or cancel.
 * Returns false when the user cancelled (the messages are then emptied).
 */
export async function reviewBackgroundPrompt(messages, job) {
    const settings = gs();
    const connection = connectionLabel();
    const wanted = settings.bgPreview === true && bgJobWanted(settings.bgPreviewJobs, job);
    if (!wanted) {
        addToLog(makeLogEntry({ job, connection, messages, status: "sent" }));
        return true;
    }

    const label = bgJobLabel(job);
    const total = messages.reduce((n, m) => n + messageText(m).length, 0);
    const $root = $(`
        <div class="bgp">
            <div class="bgp-head">
                <div><b>${label}</b> is about to send this prompt.</div>
                <div class="bgp-meta">To: ${$("<span>").text(connection).html()} · ${messages.length} messages · about ${Math.round(total / 4).toLocaleString()} tokens</div>
                <div class="bgp-meta">You can change the text before sending it.</div>
            </div>
            <div class="bgp-msgs"></div>
            <label class="bgp-stop"><input type="checkbox" class="bgp-stop-box" /> Stop showing ${label} prompts</label>
        </div>
    `);
    const $msgs = $root.find(".bgp-msgs");
    messages.forEach((m, i) => {
        const $box = $(`<div class="bgp-msg">
            <div class="bgp-role">${String(m.role || "").toUpperCase()}</div>
            <textarea class="ps-modern-input bgp-text" data-i="${i}" rows="6"></textarea>
        </div>`);
        $box.find("textarea").val(editableText(m));
        if (Array.isArray(m.content) && m.content.some(c => c && c.type !== "text")) $box.find(".bgp-role").append(" · with an image (kept as it is)");
        $msgs.append($box);
    });

    const popup = new Popup($root, POPUP_TYPE.CONFIRM, "", { okButton: "Send", cancelButton: "Cancel", wide: true, large: true, allowVerticalScrolling: true });
    const confirmed = await popup.show();

    if ($root.find(".bgp-stop-box").prop("checked")) {
        settings.bgPreviewJobs = { ...(settings.bgPreviewJobs || {}), [job]: false };
        saveSettingsDebounced();
    }

    if (!confirmed) {
        addToLog(makeLogEntry({ job, connection, messages, status: "cancelled" }));
        messages.length = 0;
        toastr.info(`${label}: you cancelled the prompt, so nothing was sent.`, "Megumin Suite");
        // Sent to Chomusuke's profile, nothing is generating to stop (and the
        // story may be: leave it alone).
        if (!chomusukeProfileNow()) {
            try { const ctx = getContext(); if (ctx && typeof ctx.stopGeneration === "function") ctx.stopGeneration(); } catch (e) { /* already stopped */ }
        }
        return false;
    }

    const texts = $root.find(".bgp-text").toArray().map(t => t.value);
    const edited = applyEditedTexts(messages, texts);
    addToLog(makeLogEntry({ job, connection, messages, status: "sent", edited }));
    return true;
}

// ── The viewer (Settings) ────────────────────────────────────────────────

const timeOf = at => new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export async function openBackgroundLog() {
    const $root = $(`<div class="bgp"></div>`);
    const draw = async () => {
        const log = await readBackgroundLog();
        $root.empty();
        $root.append(`<div class="bgp-head"><div><b>Last background prompts</b></div>
            <div class="bgp-meta">The last 10, for every chat and character. Kept in this browser only.</div></div>`);
        if (!log.length) { $root.append(`<div class="bgp-meta">Nothing yet. Prompts appear here after a background job sends one.</div>`); return; }
        const $list = $(`<div class="bgp-list"></div>`);
        log.forEach(e => {
            const size = e.messages.reduce((n, m) => n + m.text.length, 0);
            const status = e.status === "cancelled" ? `<span class="bgp-tag off">cancelled</span>` : e.edited ? `<span class="bgp-tag">edited</span>` : "";
            const $row = $(`<details class="bgp-entry">
                <summary><b>${bgJobLabel(e.job)}</b> ${status}<span class="bgp-meta">${timeOf(e.at)} · ${$("<span>").text(e.connection).html()} · about ${Math.round(size / 4).toLocaleString()} tokens</span></summary>
                <div class="bgp-entry-body">
                    <button type="button" class="menu_button bgp-copy"><i class="fa-solid fa-copy"></i> Copy</button>
                    <pre class="bgp-pre"></pre>
                </div>
            </details>`);
            const text = e.messages.map(m => `========== [ ${String(m.role || "").toUpperCase()} ] ==========\n${m.text}`).join("\n\n");
            $row.find(".bgp-pre").text(text);
            $row.find(".bgp-copy").on("click", async () => {
                try { await navigator.clipboard.writeText(text); toastr.success("Copied.", "Megumin Suite"); }
                catch (err) { toastr.error("Your browser didn't allow copying.", "Megumin Suite"); }
            });
            $list.append($row);
        });
        $root.append($list);
        const $clear = $(`<button type="button" class="menu_button bgp-clear"><i class="fa-solid fa-trash"></i> Clear the list</button>`);
        $clear.on("click", async () => { await clearBackgroundLog(); draw(); });
        $root.append($clear);
    };
    await draw();
    await new Popup($root, POPUP_TYPE.TEXT, "", { wide: true, large: true, allowVerticalScrolling: true, okButton: "Close" }).show();
}
