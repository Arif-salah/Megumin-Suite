// ────────────────────────────────────────────────────────────────────────────
// Images — the entry point.
//
// Two versions under one tab, picked at the top of it:
//   Classic   — the model writes the whole image prompt (classic/).
//   Version 2 — consistent characters: the model writes @Name, the extension
//               puts in each character's stored look and current outfit (v2/).
// Both share the ComfyUI side (comfy.js) and its stored settings, so switching
// loses nothing. The tab itself is page.js (plan 012); everything the rest of
// the extension imports from "imagegen/index.js" is still exported here.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../core/state.js";
import { setActiveImageGenRequest } from "../../core/activeRequests.js";
import { showKazumaProgress } from "../../ui/progress.js";
import { runWithChomusuke } from "../../engine/tasks.js";
import { igGenerateWithComfy, setImagePromptResolver } from "./comfy.js";
import { classicGenerateImagePromptText, classicInlineNpcTags } from "./classic/prompt.js";
import { v2GenerateImagePromptText, v2InlineInstruction, v2InlineSplit, v2ResolveForComfy, v2PrepareImagePrompt } from "./v2/index.js";
import { imageGenEngine } from "./engineChoice.js";

export {
    igFetchComfyLists, toggleQuickGenButton, igTestConnection, igPopulateWorkflows,
    igNewWorkflowClick, igDeleteWorkflowClick, igOpenWorkflowEditorClick,
    addKazumaRetryButtons, kazumaRetrySweep, igGenerateWithComfy,
} from "./comfy.js";
export { imageGenSelectedEngine, imageGenEngine } from "./engineChoice.js";
export { renderImageGen } from "./page.js";

// Every image goes through this before ComfyUI (manual, inline, retry). On V2
// it turns @Name into the stored look and current outfit; a prompt that has
// already been resolved (a retry) passes through unchanged.
setImagePromptResolver(p => (imageGenEngine() === "v2" ? v2ResolveForComfy(p) : p));

// ── Generation entry points (dispatch by engine) ─────────────────────────

/** The quiet "write me an image prompt" call behind the manual button. */
/** Anything the prompt writer needs that takes its own Chomusuke call. Run it
 * BEFORE runWithChomusuke(... generateImagePromptText), never inside. */
export async function prepareImagePrompt() {
    if (imageGenEngine() === "v2") await v2PrepareImagePrompt();
}

export async function generateImagePromptText(opts = {}) {
    return imageGenEngine() === "v2" ? v2GenerateImagePromptText(opts) : classicGenerateImagePromptText(opts);
}

export { imageViaChomusuke, igAutoImageForReply } from "./auto.js";
export { combinedTurnWanted, runCombinedTurn } from "./combinedTurn.js";
export { v2LooksForArrivals } from "./v2/looks.js";

/** The NPC tag section for the Classic inline [[img1]] instruction. */
export function imageInjectionNpcTags() {
    return imageGenEngine() === "v2" ? "" : classicInlineNpcTags();
}

/** V2 replaces the whole inline instruction; null on Classic. */
export function imageV2InlineInstruction(opts) {
    return imageGenEngine() === "v2" ? v2InlineInstruction(opts) : null;
}

/** V2's instruction split for the V11 preset (plan 018); null on Classic. */
export function imageV2InlineSplit(opts) {
    return imageGenEngine() === "v2" ? v2InlineSplit(opts) : null;
}

export async function igManualGenerate() {
    const s = localProfile?.imageGen;
    if (!s || !s.enabled) return;

    showKazumaProgress("Analyzing Scene...");

    try {
        await prepareImagePrompt();
        let promptText = await runWithChomusuke("imageGen", () => generateImagePromptText());

        // Use capturing group 1 for the quote type, group 2 for the actual prompt text
        const imgRegex = /<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/i;
        const match = promptText.match(imgRegex);
        if (match) promptText = match[2];

        // An empty answer would reach ComfyUI as the prefix alone. SillyTavern
        // hands back "" when it cannot read the reply (e.g. a provider that
        // wraps non-streamed answers in its own envelope).
        if (!String(promptText || "").trim()) {
            $("#kazuma_progress_overlay").hide();
            toastr.error("The model's answer came back empty, so no image was made. If the model did reply (check the Network tab), your API sends answers in a shape SillyTavern can't read when streaming is off; try another provider for image prompts.", "Megumin Suite", { timeOut: 12000 });
            return;
        }

        toastr.info("Sending to ComfyUI...", "Megumin Suite");
        igGenerateWithComfy(promptText, null);

    } catch (e) {
        console.error(e);
        $("#kazuma_progress_overlay").hide();
        toastr.error("Manual generation failed.");
    } finally {
        setActiveImageGenRequest(null);
    }
}
