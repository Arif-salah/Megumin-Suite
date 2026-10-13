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

export { extension_settings, getContext } from "../../../../extensions.js";

export {
    saveSettingsDebounced,
    generateQuietPrompt,
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
    getMaxPromptTokens,
} from "../../../../../script.js";

export { getTokenCountAsync } from "../../../../../scripts/tokenizers.js";
export { oai_settings } from "../../../../../scripts/openai.js";

export { saveBase64AsFile, debounce, cancelDebounce } from "../../../../utils.js";
export { humanizedDateTime } from "../../../../RossAscends-mods.js";
export { Popup, POPUP_TYPE } from "../../../../popup.js";
