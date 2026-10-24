// ────────────────────────────────────────────────────────────────────────────
// Images tab — Generator page (both versions): the ComfyUI address, workflow,
// model and size, then "Expert settings" (sampler, sliders, seed, quality tags,
// negative prompt, LoRAs).
//
// The ids are the ones comfy.js fills in (#ig_model, #ig_sampler, #ig_lora_N,
// #ig_workflow_list) and the V2 style switch writes to (#ig_prefix). Expert
// settings are hidden with CSS, never left out, so comfy.js always finds them.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../../core/state.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../../core/profile.js";
import { RESOLUTIONS } from "../../../../data/image_data.js";
import { igFetchComfyLists, igTestConnection, igCheckConnection, igPopulateWorkflows, igNewWorkflowClick, igDeleteWorkflowClick, igOpenWorkflowEditorClick } from "../comfy.js";
import { card, field, switchRow, esc } from "../../../ui/controls.js";

const GUIDE_URL = "https://www.reddit.com/r/SillyTavernAI/comments/1u87agq/tutorial_how_to_setup_inline_image_generation_in/";

// The settings a workflow remembers, restored when you switch back to it.
const WORKFLOW_KEYS = [
    "selectedModel", "selectedSampler", "steps", "cfg", "denoise", "clipSkip",
    "imgWidth", "imgHeight", "customSeed", "customNegative",
    "promptStyle", "promptPerspective", "promptExtra", "previewPrompt",
    "selectedLora", "selectedLoraWt", "loraTrigger1",
    "selectedLora2", "selectedLoraWt2", "loraTrigger2",
    "selectedLora3", "selectedLoraWt3", "loraTrigger3",
    "selectedLora4", "selectedLoraWt4", "loraTrigger4"
];

/**
 * @param c        the page container
 * @param redraw   draws this page again (a workflow switch restores values)
 * @param onTested called after Test, so the tab can update its status chip
 */
export function renderGenerator(c, { redraw, onTested }) {
    const s = localProfile.imageGen;
    // Until ComfyUI sends its lists, each box shows the saved choice, so nothing
    // looks lost while it is offline.
    const saved = (value, empty) => `<option value="${esc(value || "")}" selected>${value ? esc(value) : empty}</option>`;

    // ── ComfyUI ──
    const comfy = card("ComfyUI");
    comfy.find(".igx-card-title").append(`<a class="igx-guide" href="${GUIDE_URL}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-book-open"></i> New to this? Read the setup guide</a>`);
    const $url = $(`<div class="igx-inline">
        <input type="text" id="ig_url" class="ps-modern-input" value="${esc(s.comfyUrl)}" placeholder="http://127.0.0.1:8188" />
        <button type="button" id="ig_test_btn" class="menu_button igx-btn gold"><i class="fa-solid fa-plug"></i> Test</button>
    </div>`);
    comfy.append(field("Address", "Where ComfyUI is running", $url));
    const $wf = $(`<div class="igx-inline">
        <select id="ig_workflow_list" class="ps-modern-input"></select>
        <button type="button" id="ig_new_wf" class="menu_button igx-btn" title="Make a new workflow"><i class="fa-solid fa-plus"></i> New</button>
        <button type="button" id="ig_edit_wf" class="menu_button igx-btn" title="Edit this workflow's JSON"><i class="fa-solid fa-pen"></i> Edit</button>
        <button type="button" id="ig_del_wf" class="menu_button igx-btn danger" title="Delete this workflow"><i class="fa-solid fa-trash"></i> Delete</button>
    </div>`);
    comfy.append(field("Workflow", "Each workflow remembers its own settings below", $wf));
    c.append(comfy);

    // ── Image ──
    const image = card("Image");
    const $basics = $(`<div class="igx-grid2"></div>`);
    $basics.append(field("Model", "", $(`<select id="ig_model" class="ps-modern-input">${saved(s.selectedModel, "No model picked")}</select>`)));
    const $size = $(`<div class="igx-size">
        <select id="ig_res_preset" class="ps-modern-input"></select>
        <div class="igx-inline">
            <input type="number" id="ig_w" class="ps-modern-input" value="${esc(s.imgWidth)}" title="Width" />
            <span class="igx-x">×</span>
            <input type="number" id="ig_h" class="ps-modern-input" value="${esc(s.imgHeight)}" title="Height" />
        </div>
    </div>`);
    $basics.append(field("Size", "Pick one, or type width × height", $size));
    image.append($basics);

    const $expert = $(`<div class="igx-expert" style="display:${s.showExpert ? "flex" : "none"};"></div>`);
    image.append(switchRow({
        label: "Expert settings",
        desc: "Sampler, steps, seed, quality tags, negative prompt and LoRAs.",
        on: Boolean(s.showExpert),
        onChange: on => { s.showExpert = on; saveProfileToMemory(); $expert.css("display", on ? "flex" : "none"); }
    }));

    $expert.append(field("Sampler", "", $(`<select id="ig_sampler" class="ps-modern-input igx-narrow">${saved(s.selectedSampler, "Default")}</select>`)));
    const slider = (id, label, min, max, step, val) => `
        <div class="igx-param"><span>${label}</span>
            <input type="range" id="ig_${id}" min="${min}" max="${max}" step="${step}" value="${esc(val)}">
            <input type="number" id="ig_${id}_val" class="ps-modern-input" value="${esc(val)}">
        </div>`;
    $expert.append(`<div class="igx-params">
        ${slider("steps", "Steps", 1, 100, 1, s.steps)}
        ${slider("cfg", "CFG", 1, 30, 0.5, s.cfg)}
        ${slider("denoise", "Denoise", 0, 1, 0.05, s.denoise)}
        ${slider("clip", "CLIP skip", 1, 12, 1, s.clipSkip)}
    </div>`);
    $expert.append(field("Seed", "-1 picks a new one every time", $(`<div class="igx-inline igx-narrow">
        <input type="number" id="ig_seed" class="ps-modern-input" value="${esc(s.customSeed)}" />
        <button type="button" id="ig_seed_dice" class="menu_button igx-btn" title="A new seed every time (-1)"><i class="fa-solid fa-dice"></i></button>
    </div>`)));
    $expert.append(field("Quality tags", "Put at the start of every prompt. Picking a prompt style fills these in.",
        $(`<input type="text" id="ig_prefix" class="ps-modern-input" value="${esc(s.promptPrefix || "")}" placeholder="masterpiece, best quality…" />`)));
    $expert.append(field("Negative prompt", "What the image should not have",
        $(`<input type="text" id="ig_neg" class="ps-modern-input" value="${esc(s.customNegative)}" />`)));

    const loraRows = [1, 2, 3, 4].map(i => {
        const wt = i === 1 ? s.selectedLoraWt : s[`selectedLoraWt${i}`];
        const name = i === 1 ? s.selectedLora : s[`selectedLora${i}`];
        const trig = i === 1 ? s.loraTrigger1 : s[`loraTrigger${i}`];
        return `<div class="igx-lora">
            <select id="ig_lora_${i}" class="ps-modern-input" title="LoRA ${i}">${saved(name, "No LoRA")}</select>
            <input type="text" id="ig_lora_trig_${i}" class="ps-modern-input" placeholder="Trigger words" value="${esc(trig || "")}" title="Added to the prompt while this LoRA is on" />
            <div class="igx-lora-wt"><input type="range" id="ig_lorawt_${i}" min="-6" max="6" step="0.1" value="${esc(wt)}" title="Strength"><span id="ig_lorawt_lbl_${i}">${esc(wt)}</span></div>
        </div>`;
    }).join("");
    $expert.append(field("LoRAs", "Up to four. Trigger words are remembered for each LoRA.", $(`<div class="igx-loras">${loraRows}</div>`)));
    image.append($expert);
    c.append(image);

    // ── Bindings ──
    c.find("#ig_url").on("input", e => { s.comfyUrl = $(e.target).val(); saveProfileDebounced(); });
    c.find("#ig_test_btn").on("click", async () => {
        const $b = c.find("#ig_test_btn");
        if ($b.prop("disabled")) return;
        $b.prop("disabled", true);
        try { await igTestConnection(); } finally { $b.prop("disabled", false); }
        if (onTested) onTested();
    });
    c.find("#ig_new_wf").on("click", igNewWorkflowClick);
    c.find("#ig_edit_wf").on("click", igOpenWorkflowEditorClick);
    c.find("#ig_del_wf").on("click", igDeleteWorkflowClick);
    c.find("#ig_workflow_list").on("change", e => {
        const next = $(e.target).val();
        const prev = s.currentWorkflowName;
        if (prev) {
            if (!s.savedWorkflowStates) s.savedWorkflowStates = {};
            s.savedWorkflowStates[prev] = Object.fromEntries(WORKFLOW_KEYS.map(k => [k, s[k]]));
        }
        s.currentWorkflowName = next;
        saveProfileToMemory();
        if (s.savedWorkflowStates && s.savedWorkflowStates[next]) {
            Object.assign(s, s.savedWorkflowStates[next]);
            saveProfileToMemory();
            toastr.success(`Settings for ${next} are back.`, "Megumin Suite");
            redraw();
        }
    });

    c.find("#ig_model").on("change", e => { s.selectedModel = $(e.target).val(); saveProfileToMemory(); });
    c.find("#ig_sampler").on("change", e => { s.selectedSampler = $(e.target).val(); saveProfileToMemory(); });

    const resSel = c.find("#ig_res_preset");
    resSel.append(`<option value="">Pick a size…</option>`);
    RESOLUTIONS.forEach((r, idx) => resSel.append(`<option value="${idx}">${esc(r.label)}</option>`));
    resSel.on("change", e => {
        const r = RESOLUTIONS[parseInt($(e.target).val())];
        if (r) { c.find("#ig_w").val(r.w).trigger("input"); c.find("#ig_h").val(r.h).trigger("input"); }
    });
    c.find("#ig_w, #ig_h").on("input", e => { s[e.target.id === "ig_w" ? "imgWidth" : "imgHeight"] = parseInt($(e.target).val()); saveProfileDebounced(); });

    const bindSlider = (id, key, isFloat) => {
        const read = v => (isFloat ? parseFloat(v) : parseInt(v));
        c.find(`#ig_${id}`).on("input", function () { const v = read(this.value); s[key] = v; c.find(`#ig_${id}_val`).val(v); saveProfileDebounced(); });
        c.find(`#ig_${id}_val`).on("input", function () { const v = read(this.value); s[key] = v; c.find(`#ig_${id}`).val(v); saveProfileDebounced(); });
    };
    bindSlider("steps", "steps", false); bindSlider("cfg", "cfg", true); bindSlider("denoise", "denoise", true); bindSlider("clip", "clipSkip", false);

    c.find("#ig_seed").on("input", e => { s.customSeed = parseInt($(e.target).val()); saveProfileDebounced(); });
    c.find("#ig_seed_dice").on("click", () => { s.customSeed = -1; c.find("#ig_seed").val(-1); saveProfileToMemory(); });
    c.find("#ig_prefix").on("input", e => { s.promptPrefix = $(e.target).val(); saveProfileDebounced(); });
    c.find("#ig_neg").on("input", e => { s.customNegative = $(e.target).val(); saveProfileDebounced(); });

    for (let i = 1; i <= 4; i++) {
        const key = i === 1 ? "selectedLora" : `selectedLora${i}`;
        const wtKey = i === 1 ? "selectedLoraWt" : `selectedLoraWt${i}`;
        const trigKey = i === 1 ? "loraTrigger1" : `loraTrigger${i}`;
        c.find(`#ig_lora_${i}`).on("change", e => {
            const name = $(e.target).val();
            s[key] = name;
            // Each LoRA remembers its own trigger words.
            s[trigKey] = (name && s.loraTriggersMap && s.loraTriggersMap[name] !== undefined) ? s.loraTriggersMap[name] : "";
            c.find(`#ig_lora_trig_${i}`).val(s[trigKey]);
            saveProfileToMemory();
        });
        c.find(`#ig_lora_trig_${i}`).on("input", e => {
            const words = $(e.target).val();
            s[trigKey] = words;
            if (s[key] && s[key].trim() !== "") {
                if (!s.loraTriggersMap) s.loraTriggersMap = {};
                s.loraTriggersMap[s[key]] = words;
            }
            saveProfileDebounced();
        });
        c.find(`#ig_lorawt_${i}`).on("input", function () { const v = parseFloat(this.value); s[wtKey] = v; c.find(`#ig_lorawt_lbl_${i}`).text(v); saveProfileDebounced(); });
    }

    // The workflow list comes from SillyTavern. The model, sampler and LoRA lists
    // come from ComfyUI, so they are asked for only once it has answered.
    igPopulateWorkflows();
    igCheckConnection().then(ok => { if (ok && $.contains(document, c[0])) igFetchComfyLists(); });
}
