// ────────────────────────────────────────────────────────────────────────────
// NPC portrait generation via ComfyUI.
//
// Refreshes the list through the hook rather than calling renderNpcList()
// directly. That single call was the only thing making this file and the tab
// depend on each other; routing it through the registry leaves the dependency
// pointing one way, and the hook already existed for the profile loader.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, generateQuietPrompt, getRequestHeaders, Popup, POPUP_TYPE } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { meguminActiveDataIdentity } from "../../core/keys.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { setActiveNpcPfpRequest } from "../../core/activeRequests.js";
import { showKazumaProgress } from "../../ui/progress.js";
import { npcBuildTextFromData } from "./data.js";
import { comfyBase } from "../imagegen/comfyUrl.js";

// Generate NPC portrait via ComfyUI — uses AI to generate the prompt from full NPC info

export async function npcGeneratePfp(npcName) {
    const s = localProfile.imageGen;
    if (!s || !s.enabled || !s.currentWorkflowName) {
        toastr.warning("Turn on Images and set up ComfyUI in the Images tab first.");
        return null;
    }

    const npc = localProfile.npcBank.npcs.find(n => n.name === npcName);
    if (!npc) return null;

    // `npc` is a live object inside the profile that is loaded right now, and it is held
    // across a prompt generation, a confirm popup the user may sit on for minutes, and a
    // ComfyUI render polled once a second. Stamp the chat it belongs to here so the write
    // at the end can tell whether it is still the right one.
    const pfpIdentity = meguminActiveDataIdentity();

    // Build full NPC dossier text for the AI
    const npcText = npcBuildTextFromData(npc);

    let styleStr = s.promptStyle === "illustrious" ? "Use Danbooru-style tags separated by commas. Focus on anime art style." : (s.promptStyle === "sdxl" ? "Use natural, descriptive prose and full sentences. Focus on photorealism." : "Use a comma-separated list of detailed keywords and visual descriptors.");
    let perspStr = "This is a CHARACTER PORTRAIT. Frame it as an upper-body/bust shot focused on the character's face and shoulders. Soft, flattering lighting. Clean or simple background. Capture their personality through expression and posture.";

    toastr.info(`Generating portrait prompt for ${npcName}...`, "NPC Bank");
    showKazumaProgress("AI is writing portrait prompt...");

    // Step 1: Ask the AI to generate an image prompt from the NPC dossier
    setActiveNpcPfpRequest({ npcName, npcText, styleStr, perspStr, extraStr: s.promptExtra || "None" });

    let promptText;
    try {
        let rawOutput = await generateQuietPrompt({ prompt: "___PS_NPC_PFP___" });
        promptText = rawOutput.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

        // Try to extract <img prompt="..."> if the AI wrapped it
        const imgRegex = /<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/i;
        const match = promptText.match(imgRegex);
        if (match) promptText = match[2];
    } catch (e) {
        console.error("NPC PFP prompt generation failed:", e);
        $("#kazuma_progress_overlay").hide();
        toastr.error("Failed to generate portrait prompt.");
        setActiveNpcPfpRequest(null);
        return null;
    } finally {
        setActiveNpcPfpRequest(null);
    }

    if (!promptText || promptText.length < 5) {
        $("#kazuma_progress_overlay").hide();
        toastr.error("AI returned an empty prompt.");
        return null;
    }

    console.log(`[Megumin-Suite] NPC PFP prompt for ${npcName}: ${promptText}`);
    
    // --- ALWAYS ON PROMPT PREVIEW / EDIT FOR NPC PORTRAITS ---
    $("#kazuma_progress_overlay").hide(); // Hide progress bar temporarily

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
        setActiveNpcPfpRequest(null);
        return null;
    }

    promptText = liveText.trim();
    if (!promptText) {
        toastr.warning("Prompt cannot be empty.");
        setActiveNpcPfpRequest(null);
        return null;
    }

    toastr.info("Sending portrait prompt to ComfyUI...", "NPC Bank");
    showKazumaProgress("Rendering NPC Portrait...");

    // Step 2: Send the AI-generated prompt to ComfyUI
    let workflowRaw;
    try {
        const res = await fetch('/api/sd/comfy/workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: s.currentWorkflowName }) });
        if (!res.ok) throw new Error("Load failed"); workflowRaw = await res.json();
    } catch (e) { $("#kazuma_progress_overlay").hide(); toastr.error("Could not load workflow."); return null; }

    let workflow = (typeof workflowRaw === 'string') ? JSON.parse(workflowRaw) : workflowRaw;
    let finalSeed = Math.floor(Math.random() * 1000000000);

    for (const nodeId in workflow) {
        const node = workflow[nodeId];
        if (node.inputs) {
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
                if (val === "%width%") node.inputs[key] = 512;
                if (val === "%height%") node.inputs[key] = 512;
            }
            if (node.class_type === "KSampler" && 'seed' in node.inputs && typeof node.inputs['seed'] === 'number') { node.inputs.seed = finalSeed; }
        }
    }

    try {
        const res = await fetch(`${comfyBase(s.comfyUrl)}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow }) });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        showKazumaProgress("Rendering Portrait...");
        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                try {
                    const h = await (await fetch(`${comfyBase(s.comfyUrl)}/history/${data.prompt_id}`)).json();
                    if (h[data.prompt_id]) {
                        clearInterval(checkInterval);
                        let finalImage = null;
                        for (const nodeId in h[data.prompt_id].outputs) {
                            const nodeOut = h[data.prompt_id].outputs[nodeId];
                            if (nodeOut.images && nodeOut.images.length > 0) { finalImage = nodeOut.images[0]; break; }
                        }
                        if (finalImage) {
                            const imgUrl = `${comfyBase(s.comfyUrl)}/view?filename=${finalImage.filename}&subfolder=${finalImage.subfolder}&type=${finalImage.type}`;
                            const response = await fetch(imgUrl); const blob = await response.blob();
                            const base64 = await new Promise((r) => { const reader = new FileReader(); reader.onloadend = () => r(reader.result); reader.readAsDataURL(blob); });

                            // Compress to JPEG
                            const compressed = await new Promise((r) => {
                                const img = new Image(); img.src = base64;
                                img.onload = () => { const cvs = document.createElement('canvas'); cvs.width = img.width; cvs.height = img.height; cvs.getContext('2d').drawImage(img, 0, 0); r(cvs.toDataURL("image/jpeg", 0.85)); };
                                img.onerror = () => r(base64);
                            });

                            // A stale `npc` is a detached object from the old profile: the
                            // portrait would vanish with it, and renderNpcList() would
                            // repaint the panel with the wrong chat's bank.
                            if (meguminActiveDataIdentity() !== pfpIdentity) {
                                console.debug(`[Megumin-Suite] NPC portrait declined: it was generated for "${pfpIdentity}" but "${meguminActiveDataIdentity()}" is active now. The image was dropped rather than attached to a stale NPC record.`);
                                $("#kazuma_progress_overlay").hide();
                                resolve(null);
                                return;
                            }
                            npc.pfp = compressed;
                            saveProfileToMemory();
                            $("#kazuma_progress_overlay").hide();
                            toastr.success(`Portrait generated for ${npcName}!`);
                            fireRefreshHook(REFRESH.NPC_LIST);
                            resolve(compressed);
                        } else {
                            $("#kazuma_progress_overlay").hide();
                            resolve(null);
                        }
                    }
                } catch (e) { }
            }, 1000);
        });
    } catch (e) { $("#kazuma_progress_overlay").hide(); toastr.error("ComfyUI Error: " + e.message); return null; }
}
