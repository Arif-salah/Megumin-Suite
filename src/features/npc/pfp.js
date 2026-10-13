// ────────────────────────────────────────────────────────────────────────────
// NPC portrait generation via ComfyUI.
//
// Refreshes the list through the hook rather than calling renderNpcList()
// directly. That single call was the only thing making this file and the tab
// depend on each other; routing it through the registry leaves the dependency
// pointing one way, and the hook already existed for the profile loader.
//
// The two halves of the job — asking the AI for a portrait prompt, and sending
// a prompt through the workflow — are exported on their own so the automatic
// portrait generator can run them without the preview popup. npcGeneratePfp
// is the manual button and keeps its popup.
// ────────────────────────────────────────────────────────────────────────────
import { generateQuietPrompt, getRequestHeaders, Popup, POPUP_TYPE } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { meguminActiveDataIdentity } from "../../core/keys.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { setActiveNpcPfpRequest } from "../../core/activeRequests.js";
import { showKazumaProgress } from "../../ui/progress.js";
import { npcBuildTextFromData } from "./data.js";

const PORTRAIT_SIZE = 512;
const RENDER_TIMEOUT_MS = 10 * 60 * 1000;

function hideProgress() { $("#kazuma_progress_overlay").hide(); }

function portraitStyleStr(s) {
    const style = s.promptStyle || (String(s.promptTemplate || "").startsWith("illus") ? "illustrious" : "");
    if (style === "illustrious") return "Use Danbooru-style tags separated by commas. Focus on anime art style.";
    if (style === "sdxl") return "Use natural, descriptive prose and full sentences. Focus on photorealism.";
    return "Use a comma-separated list of detailed keywords and visual descriptors.";
}

const PORTRAIT_PERSPECTIVE = "This is a CHARACTER PORTRAIT. Frame it as an upper-body/bust shot focused on the character's face and shoulders. Soft, flattering lighting. Clean or simple background. Capture their personality through expression and posture.";

// Step 1: ask the AI to turn a character description into an image prompt.
// Returns the prompt text, or null when the model gave nothing usable.
export async function buildPortraitPrompt(npcName, npcText, { silent = false } = {}) {
    const s = localProfile.imageGen;
    if (!s) return null;
    if (!silent) {
        toastr.info(`Generating portrait prompt for ${npcName}...`, "NPC Bank");
        showKazumaProgress("AI is writing portrait prompt...");
    }
    setActiveNpcPfpRequest({ npcText, styleStr: portraitStyleStr(s), perspStr: PORTRAIT_PERSPECTIVE, extraStr: s.promptExtra || "None" });
    let promptText;
    try {
        const rawOutput = await generateQuietPrompt({ prompt: "___PS_NPC_PFP___" });
        promptText = String(rawOutput || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        // Try to extract <img prompt="..."> if the AI wrapped it
        const imgRegex = /<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/i;
        const match = promptText.match(imgRegex);
        if (match) promptText = match[2];
    } catch (e) {
        console.error("NPC PFP prompt generation failed:", e);
        if (!silent) { hideProgress(); toastr.error("Failed to generate portrait prompt."); }
        return null;
    } finally {
        setActiveNpcPfpRequest(null);
    }
    if (!promptText || promptText.length < 5) {
        if (!silent) { hideProgress(); toastr.error("AI returned an empty prompt."); }
        return null;
    }
    console.log(`[Megumin-Suite] NPC PFP prompt for ${npcName}: ${promptText}`);
    return promptText;
}

// Step 2: send a prompt through the current workflow and return the finished
// portrait as a compressed JPEG data URL, or null.
export async function renderPortraitImage(promptText, { silent = false, label = "" } = {}) {
    const s = localProfile.imageGen;
    if (!s || !s.currentWorkflowName) return null;
    if (!silent) {
        toastr.info("Sending portrait prompt to ComfyUI...", "NPC Bank");
        showKazumaProgress("Rendering NPC Portrait...");
    }
    let workflowRaw;
    try {
        const res = await fetch('/api/sd/comfy/workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: s.currentWorkflowName }) });
        if (!res.ok) throw new Error("Load failed");
        workflowRaw = await res.json();
    } catch (e) {
        if (!silent) { hideProgress(); toastr.error("Could not load workflow."); }
        return null;
    }
    const workflow = (typeof workflowRaw === 'string') ? JSON.parse(workflowRaw) : workflowRaw;
    const finalSeed = Math.floor(Math.random() * 1000000000);
    for (const nodeId in workflow) {
        const node = workflow[nodeId];
        if (!node.inputs) continue;
        for (const key in node.inputs) {
            const val = node.inputs[key];
            if (val === "%prompt%") node.inputs[key] = promptText;
            if (val === "%negative_prompt%") node.inputs[key] = s.customNegative || "";
            if (val === "%seed%") node.inputs[key] = finalSeed;
            if (val === "%sampler%") node.inputs[key] = s.selectedSampler || "euler";
            if (val === "%model%") node.inputs[key] = s.selectedModel || "v1-5-pruned.ckpt";
            if (val === "%steps%") node.inputs[key] = parseInt(s.steps) || 20;
            if (val === "%scale%") node.inputs[key] = parseFloat(s.cfg) || 7.0;
            if (val === "%denoise%") node.inputs[key] = parseFloat(s.denoise) || 1.0;
            if (val === "%clip_skip%") node.inputs[key] = -Math.abs(parseInt(s.clipSkip)) || -1;
            if (val === "%lora1%") node.inputs[key] = s.selectedLora || "None";
            if (val === "%lora2%") node.inputs[key] = s.selectedLora2 || "None";
            if (val === "%lora3%") node.inputs[key] = s.selectedLora3 || "None";
            if (val === "%lora4%") node.inputs[key] = s.selectedLora4 || "None";
            if (val === "%lorawt1%") node.inputs[key] = parseFloat(s.selectedLoraWt) || 1.0;
            if (val === "%lorawt2%") node.inputs[key] = parseFloat(s.selectedLoraWt2) || 1.0;
            if (val === "%lorawt3%") node.inputs[key] = parseFloat(s.selectedLoraWt3) || 1.0;
            if (val === "%lorawt4%") node.inputs[key] = parseFloat(s.selectedLoraWt4) || 1.0;
            if (val === "%width%") node.inputs[key] = PORTRAIT_SIZE;
            if (val === "%height%") node.inputs[key] = PORTRAIT_SIZE;
        }
        if (node.class_type === "KSampler" && 'seed' in node.inputs && typeof node.inputs['seed'] === 'number') node.inputs.seed = finalSeed;
    }
    try {
        const res = await fetch(`${s.comfyUrl}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow }) });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (!silent) showKazumaProgress(label ? `Rendering Portrait: ${label}...` : "Rendering Portrait...");
        const started = Date.now();
        while (Date.now() - started < RENDER_TIMEOUT_MS) {
            await new Promise(r => setTimeout(r, 1000));
            let h;
            try { h = await (await fetch(`${s.comfyUrl}/history/${data.prompt_id}`)).json(); } catch (e) { continue; }
            const entry = h && h[data.prompt_id];
            if (!entry) continue;
            if (entry.status && entry.status.status_str === "error") throw new Error("ComfyUI reported an error for this job.");
            let finalImage = null;
            for (const nodeId in entry.outputs || {}) {
                const nodeOut = entry.outputs[nodeId];
                if (nodeOut.images && nodeOut.images.length > 0) { finalImage = nodeOut.images[0]; break; }
            }
            if (!finalImage) { if (!silent) hideProgress(); return null; }
            const imgUrl = `${s.comfyUrl}/view?filename=${finalImage.filename}&subfolder=${finalImage.subfolder}&type=${finalImage.type}`;
            const blob = await (await fetch(imgUrl)).blob();
            const base64 = await new Promise((r) => { const reader = new FileReader(); reader.onloadend = () => r(reader.result); reader.readAsDataURL(blob); });
            // Compress to JPEG
            const compressed = await new Promise((r) => {
                const img = new Image(); img.src = base64;
                img.onload = () => { const cvs = document.createElement('canvas'); cvs.width = img.width; cvs.height = img.height; cvs.getContext('2d').drawImage(img, 0, 0); r(cvs.toDataURL("image/jpeg", 0.85)); };
                img.onerror = () => r(base64);
            });
            if (!silent) hideProgress();
            return compressed;
        }
        throw new Error("Timed out waiting for ComfyUI.");
    } catch (e) {
        if (!silent) { hideProgress(); toastr.error("ComfyUI Error: " + e.message); }
        else console.warn("[Megumin-Suite] Portrait render failed:", e);
        return null;
    }
}

// The manual button on an NPC card: dossier → prompt → preview popup → render.
export async function npcGeneratePfp(npcName) {
    const s = localProfile.imageGen;
    if (!s || !s.enabled || !s.currentWorkflowName) {
        toastr.warning("Image Generation must be enabled and configured first.");
        return null;
    }
    const npc = localProfile.npcBank.npcs.find(n => n.name === npcName);
    if (!npc) return null;

    // `npc` is a live object inside the profile that is loaded right now, and it is held
    // across a prompt generation, a confirm popup the user may sit on for minutes, and a
    // ComfyUI render polled once a second. Stamp the chat it belongs to here so the write
    // at the end can tell whether it is still the right one.
    const pfpIdentity = meguminActiveDataIdentity();

    let promptText = await buildPortraitPrompt(npcName, npcBuildTextFromData(npc));
    if (!promptText) return null;

    // --- ALWAYS ON PROMPT PREVIEW / EDIT FOR NPC PORTRAITS ---
    hideProgress(); // Hide progress bar temporarily
    const $content = $(`
        <div style="display:flex; flex-direction:column; gap:10px; font-family: 'Inter', sans-serif;">
            <div style="font-size: 0.85rem; color: var(--text-muted);">Review or modify the character portrait prompt before rendering.</div>
            <textarea class="ps-modern-input npc-preview-textarea" style="height: 150px; resize: vertical; font-family: monospace; font-size: 0.85rem; padding: 10px;">${promptText}</textarea>
        </div>
    `);
    // Capture the text dynamically as the user types
    let liveText = promptText;
    $content.find(".npc-preview-textarea").on("input", function () {
        liveText = $(this).val();
    });
    const popup = new Popup($content, POPUP_TYPE.CONFIRM, `Edit Portrait Prompt: ${npcName}`, { okButton: "Render Portrait", cancelButton: "Cancel", wide: true });
    const confirmed = await popup.show();
    if (!confirmed) {
        toastr.info("Portrait generation cancelled.");
        return null;
    }
    promptText = liveText.trim();
    if (!promptText) {
        toastr.warning("Prompt cannot be empty.");
        return null;
    }

    const compressed = await renderPortraitImage(promptText, { label: npcName });
    if (!compressed) return null;

    // A stale `npc` is a detached object from the old profile: the
    // portrait would vanish with it, and renderNpcList() would
    // repaint the panel with the wrong chat's bank.
    if (meguminActiveDataIdentity() !== pfpIdentity) {
        console.debug(`[Megumin-Suite] NPC portrait declined: it was generated for "${pfpIdentity}" but "${meguminActiveDataIdentity()}" is active now. The image was dropped rather than attached to a stale NPC record.`);
        return null;
    }
    npc.pfp = compressed;
    saveProfileToMemory();
    toastr.success(`Portrait generated for ${npcName}!`);
    fireRefreshHook(REFRESH.NPC_LIST);
    return compressed;
}
