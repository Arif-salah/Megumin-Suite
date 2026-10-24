/* eslint-disable no-undef */
// ─────────────────────────────────────────────────────────────────────────────
// SillyTavern import shim.
//
// ST's modules are reached by relative path, so the number of "../" depends on
// how deep the importing file sits. Every file under src/ importing ST directly
// would have to count levels correctly, and every file MOVED between folders
// would silently break. This module counts once, from src/, and re-exports.
//
// Rule: nothing under src/ imports from ST directly. Import from here instead
// (or from "../st.js", "../../st.js", ... as depth requires — that path is a
// path inside OUR tree, so it moves with the file and is easy to fix).
// ─────────────────────────────────────────────────────────────────────────────

export { extension_settings, getContext, saveMetadataDebounced } from "../../../../extensions.js";

import {
    saveSettingsDebounced,
    generateQuietPrompt as stGenerateQuietPrompt,
    event_types,
    eventSource,
    substituteParams,
    saveChat,
    reloadCurrentChat,
    addOneMessage,
    getRequestHeaders,
    appendMediaToMessage,
    updateMessageBlock,
    chat_metadata,
    saveMetadata,
    isGenerating,
    online_status,
    saveChatDebounced,
    name1,
} from "../../../../../script.js";

import { saveBase64AsFile, debounce, cancelDebounce, waitUntilCondition } from "../../../../utils.js";
export { humanizedDateTime } from "../../../../RossAscends-mods.js";
export { Popup, POPUP_TYPE } from "../../../../popup.js";
export { checkWorldInfo, getSortedEntries } from "../../../../world-info.js";

export {
    saveSettingsDebounced,
    event_types,
    eventSource,
    substituteParams,
    saveChat,
    reloadCurrentChat,
    addOneMessage,
    getRequestHeaders,
    appendMediaToMessage,
    updateMessageBlock,
    chat_metadata,
    saveMetadata,
    isGenerating,
    online_status,
    saveChatDebounced,
    name1,
    saveBase64AsFile,
    debounce,
    cancelDebounce,
    waitUntilCondition,
};

// While a Chomusuke job runs on its own profile (plan 019), tasks.js points
// every quiet prompt here at it: sendRequest instead of SillyTavern's quiet
// generation. Null the rest of the time.
let quietRoute = null;
export function setQuietRoute(fn) { quietRoute = fn; }

/**
 * Universal wrapper for SillyTavern's generateQuietPrompt.
 * Ensures compatibility whether callers provide { prompt: '...' } or { quietPrompt: '...' }.
 * @param {object|string} params
 * @returns {Promise<string>}
 */
export async function generateQuietPrompt(params = {}) {
    if (typeof params === "string") {
        params = { quietPrompt: params, prompt: params };
    } else if (params && typeof params === "object") {
        const text = params.quietPrompt ?? params.prompt ?? "";
        params = { ...params, quietPrompt: text, prompt: text };
    }
    if (quietRoute) return await quietRoute(params.quietPrompt);
    return await stGenerateQuietPrompt(params);
}

