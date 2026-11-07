// ────────────────────────────────────────────────────────────────────────────
// Plan 028: where images are made. "comfy" = our own ComfyUI workflows (the
// default); "st" = SillyTavern's Image Generation extension (/imagine, /sd),
// with whatever source the user set up there. One choice for the whole
// install (globalSettings.imageBackend), never per character.
//
// With "st" only the prompt is ours: SillyTavern adds its own prefix and
// negative, and uses its own model, size and seed.
// ────────────────────────────────────────────────────────────────────────────

import { extension_settings, saveSettingsDebounced, getContext } from "../../st.js";
import { extensionName } from "../../core/constants.js";

export function imageBackend() {
    return extension_settings[extensionName]?.globalSettings?.imageBackend === "st" ? "st" : "comfy";
}

export function setImageBackend(id) {
    const root = extension_settings[extensionName];
    if (!root) return;
    if (!root.globalSettings) root.globalSettings = {};
    root.globalSettings.imageBackend = id === "st" ? "st" : "comfy";
    saveSettingsDebounced();
}

/** The name shown to the user: "ComfyUI" or "SillyTavern's Image Generation". */
export const imageBackendName = () => (imageBackend() === "st" ? "SillyTavern's Image Generation" : "ComfyUI");

/** SillyTavern's /imagine command, or null when its Image Generation extension is off. */
function imagineCommand() {
    const parser = getContext().SlashCommandParser;
    return parser?.commands?.imagine || null;
}

export const sillyTavernImagesReady = () => Boolean(imagineCommand());

/**
 * Makes one image with SillyTavern's Image Generation. Nothing is posted to
 * the chat (quiet); SillyTavern saves the file and hands back its address.
 * extend/edit off: our prompt goes out as written, with no popup of theirs.
 * @returns {Promise<string>} the image's address, "" when it failed or was stopped
 */
export async function generateWithSillyTavern(prompt) {
    const cmd = imagineCommand();
    if (!cmd) throw new Error("SillyTavern's Image Generation extension is off");
    const url = await cmd.callback({ quiet: "true", extend: "false", edit: "false" }, String(prompt || ""));
    return typeof url === "string" ? url : "";
}
