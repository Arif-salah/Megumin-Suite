// ────────────────────────────────────────────────────────────────────────────
// Image generation — ComfyUI wiring, the tab, and the in-chat image handling.
//
// Filed as one unit for the same reason as the Memory Core: the tab, the
// generator and the retry buttons call each other in both directions (the tab
// starts a generation, a finished generation redraws the tab's workflow list and
// re-attaches retry buttons). The genuinely separable piece — the ComfyUI
// progress socket — is already its own file next door.
// ────────────────────────────────────────────────────────────────────────────

import {
    getContext, getRequestHeaders, generateQuietPrompt, saveChat, reloadCurrentChat,
    addOneMessage, appendMediaToMessage, updateMessageBlock, saveBase64AsFile,
    humanizedDateTime, Popup, POPUP_TYPE,
} from "../../st.js";
import { extensionName } from "../../core/constants.js";
import { localProfile } from "../../core/state.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../core/profile.js";
import { syncPromptsGlobally } from "../../core/sync.js";
import { registerRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { setActiveImageGenRequest } from "../../core/activeRequests.js";
import { DEFAULT_PROMPTS } from "../../prompts/index.js";
import { renderPromptEditor } from "../../ui/promptEditor.js";
import { showKazumaProgress } from "../../ui/progress.js";
import { meguminCleanChatHistoryText } from "../../engine/chatText.js";
import { useMeguminEngine } from "../../engine/tasks.js";
import { KAZUMA_PLACEHOLDERS, RESOLUTIONS } from "../../../data/image_data.js";
import { getRelevantNpcImageTags } from "../npc/data.js";
import { meguminScheduleBlocksRefresh } from "../blocks/chat.js";
import { makeComfyClientId, openComfyProgressSocket } from "./comfyProgress.js";

export function renderImageGen(c) {
    c.empty();
    const s = localProfile.imageGen;

    c.append(`
        <!-- HEADER -->
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #06b6d4, #0891b2);">
                    <i class="fa-solid fa-image"></i>
                </div>
                <div>
                    <h2>Image Generation</h2>
                    <p>ComfyUI integration for automatic scene rendering.</p>
                </div>
            </div>
            <div id="ig_header_badge" class="mtab-header-badge" style="background: ${s.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)'}; color: ${s.enabled ? '#10b981' : 'var(--text-muted)'}; border: 1px solid ${s.enabled ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'};">
                <i class="fa-solid fa-${s.enabled ? 'circle-check' : 'circle-xmark'}" style="font-size:0.6rem;"></i> ${s.enabled ? 'Enabled' : 'Disabled'}
            </div>
        </div>

        <div class="mtab-callout blue" style="margin-bottom: 16px;">
            <i class="fa-solid fa-book-open"></i>
            <span><strong>New to this? There's a setup guide.</strong> Getting ComfyUI talking to
            SillyTavern is the hard part, and none of the settings below matter until it is.
            <a href="https://www.reddit.com/r/SillyTavernAI/comments/1u87agq/tutorial_how_to_setup_inline_image_generation_in/"
               target="_blank" rel="noopener noreferrer"
               style="color:#3b82f6; text-decoration:underline;">Read the walkthrough</a> — it covers
            the install, the connection and the first working image.</span>
        </div>

        <!-- MASTER TOGGLE -->
        <div class="mtab-toggle-row ${s.enabled ? 'active' : ''}" id="ig_enable_card" style="margin-bottom: 20px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-image" style="color:#06b6d4;"></i> Enable Image Generation</div>
                <div class="toggle-desc">Activate ComfyUI integration for this specific character/group.</div>
            </div>
            <div class="ps-switch"></div>
        </div>

        <!-- Generator Backend -->
        <div class="mtab-panel" style="margin-bottom:16px;">
            <div class="mtab-panel-title blue"><i class="fa-solid fa-gears"></i> Prompt Generator Backend</div>
            <div class="mtab-setting-row">
                <div class="set-info">
                    <div class="set-label">Generation Method</div>
                    <div class="set-desc">"Direct" is faster. "Megumin Image" is more creative.</div>
                </div>
                <select id="img_gen_backend" class="ps-modern-input" style="width: 220px; cursor: pointer;">
                    <option value="direct" ${s.generatorBackend === 'direct' ? 'selected' : ''}>Direct API Call (Fast)</option>
                    <option value="preset" ${s.generatorBackend === 'preset' ? 'selected' : ''}>Megumin Image Preset</option>
                </select>
            </div>
        </div>

        <div id="ig_main_content" style="display: ${s.enabled ? 'block' : 'none'};">
            
            <!-- Connection & Workflow -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div class="mtab-panel-title blue"><i class="fa-solid fa-link"></i> ComfyUI Server & Workflow</div>
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <input type="text" id="ig_url" class="ps-modern-input" value="${s.comfyUrl}" placeholder="http://127.0.0.1:8188" style="flex: 1;" />
                    <button id="ig_test_btn" class="ps-modern-btn secondary" style="padding: 0 15px;"><i class="fa-solid fa-wifi"></i> Test</button>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <select id="ig_workflow_list" class="ps-modern-input" style="flex: 1; cursor: pointer;"></select>
                    <button id="ig_new_wf" class="ps-modern-btn secondary" title="New Workflow"><i class="fa-solid fa-plus"></i></button>
                    <button id="ig_edit_wf" class="ps-modern-btn secondary" title="Edit JSON"><i class="fa-solid fa-pen"></i></button>
                    <button id="ig_del_wf" class="ps-modern-btn secondary" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>

            <!-- Triggers & Formatting -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div class="mtab-panel-title gold"><i class="fa-solid fa-pen-nib"></i> Triggers & Formatting</div>
                <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Trigger Mode</div>
                        <select id="ig_trigger_mode" class="ps-modern-input" style="padding: 8px; font-size: 0.8rem; cursor: pointer;">
                            <option value="always" ${s.triggerMode === 'always' ? 'selected' : ''}>Always (Every Reply)</option>
                            <option value="frequency" ${s.triggerMode === 'frequency' ? 'selected' : ''}>After X Replies</option>
                            <option value="conditional" ${s.triggerMode === 'conditional' ? 'selected' : ''}>Only when character sends a pic</option>
                            <option value="manual" ${s.triggerMode === 'manual' ? 'selected' : ''}>Manual Button Only</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Inject Mode</div>
                        <select id="ig_inject_mode" class="ps-modern-input" style="padding: 8px; font-size: 0.8rem; cursor: pointer;">
                            <option value="new_msg" ${s.injectMode === 'new_msg' || !s.injectMode ? 'selected' : ''}>New Message (Gallery)</option>
                            <option value="inline" ${s.injectMode === 'inline' ? 'selected' : ''}>Inline (Inside AI Reply)</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Image Count</div>
                        <select id="ig_image_count" class="ps-modern-input" style="padding: 8px; font-size: 0.8rem; cursor: pointer;">
                            <option value="1" ${s.imageCount == 1 ? 'selected' : ''}>1 Image</option>
                            <option value="2" ${s.imageCount == 2 ? 'selected' : ''}>2 Images</option>
                            <option value="3" ${s.imageCount == 3 ? 'selected' : ''}>3 Images</option>
                            <option value="4" ${s.imageCount == 4 ? 'selected' : ''}>4 Images</option>
                        </select>
                    </div>
                    <div style="flex: 1; display: ${s.triggerMode === 'frequency' ? 'block' : 'none'};" id="ig_freq_container">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Every X Replies</div>
                        <input type="number" id="ig_auto_freq" class="ps-modern-input" value="${s.autoGenFreq}" min="1" style="padding: 8px; font-size: 0.8rem; text-align: center;" />
                    </div>
                </div>

                <div class="mtab-toggle-row ${s.previewPrompt ? 'active' : ''}" id="ig_preview_card" style="padding: 12px 18px; margin-bottom: 15px;">
                    <div class="toggle-info">
                        <div class="toggle-label" style="font-size:0.85rem;">Preview Prompt Before Sending</div>
                        <div class="toggle-desc">Show a popup to view or edit the AI's prompt before rendering.</div>
                    </div>
                    <div class="ps-switch"></div>
                </div>

                <div class="mtab-toggle-row ${s.autoPortraits ? 'active' : ''}" id="ig_auto_portraits_card" style="padding: 12px 18px; margin-bottom: 15px;">
                    <div class="toggle-info">
                        <div class="toggle-label" style="font-size:0.85rem;">Generate Portraits for Every New Character Automatically</div>
                        <div class="toggle-desc">After each reply, every character present in the scene without a portrait gets one rendered in the background, banked or not. Portraits show in the NPC Bank, Present Characters and the World State card.</div>
                    </div>
                    <div class="ps-switch"></div>
                </div>

                <div id="ig_prompt_builder" style="background: rgba(0,0,0,0.15); padding: 15px; border-radius: 10px; border-left: 3px solid var(--gold);">
                    <div style="display: flex; gap: 15px; margin-bottom: 10px; align-items: center; flex-wrap: wrap;">
                        <div style="flex: 2; min-width: 150px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Prompt Template</div>
                            <select id="ig_template" class="ps-modern-input" style="padding: 8px; font-size: 0.8rem; cursor: pointer;">
                                <option value="illus_cinematic" ${s.promptTemplate === 'illus_cinematic' ? 'selected' : ''}>Illustrious/Anima + Cinematic</option>
                                <option value="sdxl_cinematic" ${s.promptTemplate === 'sdxl_cinematic' ? 'selected' : ''}>Z Image + Cinematic</option>
                                <option value="illus_pov" ${s.promptTemplate === 'illus_pov' ? 'selected' : ''}>Illustrious/Anima + POV</option>
                                <option value="sdxl_pov" ${s.promptTemplate === 'sdxl_pov' ? 'selected' : ''}>Z Image + POV</option>
                                <option value="illus_portrait" ${s.promptTemplate === 'illus_portrait' ? 'selected' : ''}>Illustrious/Anima + Portrait</option>
                                <option value="sdxl_portrait" ${s.promptTemplate === 'sdxl_portrait' ? 'selected' : ''}>Z Image + Portrait</option>
                            </select>
                        </div>
                        <div style="flex: 1; min-width: 100px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
                                Include Examples <i class="fa-solid fa-circle-question" title="Make the image prompt better but increase input token." style="cursor: help; color: var(--gold);"></i>
                            </div>
                            <div class="ps-toggle-card ${s.includeExamples ? 'active' : ''}" id="ig_examples_toggle" style="padding: 4px; min-width: 44px; justify-content: center; background: transparent; border-color: ${s.includeExamples ? '#10b981' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;">
                                <div class="ps-switch" style="transform: scale(0.75); ${s.includeExamples ? 'background: #10b981;' : ''}"></div>
                            </div>
                        </div>
                        <div style="flex: 1; min-width: 100px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
                                Better Booru tags <i class="fa-solid fa-circle-question" title="It may increase empty responses." style="cursor: help; color: var(--gold);"></i>
                            </div>
                            <div class="ps-toggle-card ${s.directLanguage ? 'active' : ''}" id="ig_direct_toggle" style="padding: 4px; min-width: 44px; justify-content: center; background: transparent; border-color: ${s.directLanguage ? '#10b981' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;" title="Forces the AI to only use exact Booru tags">
                                <div class="ps-switch" style="transform: scale(0.75); ${s.directLanguage ? 'background: #10b981;' : ''}"></div>
                            </div>
                        </div>
                        <div style="flex: 1; min-width: 100px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
                                Inject NPC Tags <i class="fa-solid fa-circle-question" title="Automatically attach saved NPC image tags to the prompt if they are in the scene." style="cursor: help; color: var(--gold);"></i>
                            </div>
                            <div class="ps-toggle-card ${s.injectNpcTags ? 'active' : ''}" id="ig_npc_tags_toggle" style="padding: 4px; min-width: 44px; justify-content: center; background: transparent; border-color: ${s.injectNpcTags ? '#10b981' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;">
                                <div class="ps-switch" style="transform: scale(0.75); ${s.injectNpcTags ? 'background: #10b981;' : ''}"></div>
                            </div>
                        </div>
                    </div>
                    <input type="text" id="ig_extra" class="ps-modern-input" placeholder="Extra Instructions (e.g. moody lighting, dark atmosphere...)" value="${s.promptExtra}" style="padding: 8px; font-size: 0.8rem;" />
                </div>

            <!-- Parameters -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div class="mtab-panel-title gold"><i class="fa-solid fa-sliders"></i> Image Parameters</div>
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <select id="ig_model" class="ps-modern-input" style="flex: 2; cursor: pointer;"><option value="">Loading Models...</option></select>
                    <select id="ig_sampler" class="ps-modern-input" style="flex: 1; cursor: pointer;"><option value="">Loading Samplers...</option></select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px; background: rgba(0,0,0,0.1); padding: 15px; border-radius: 10px; border: 1px solid var(--border-color);">
                    <div class="mtab-param-row"><span class="param-label">Steps</span><input type="range" id="ig_steps" min="1" max="100" value="${s.steps}"><input type="number" id="ig_steps_val" value="${s.steps}"></div>
                    <div class="mtab-param-row"><span class="param-label">CFG</span><input type="range" id="ig_cfg" min="1" max="30" step="0.5" value="${s.cfg}"><input type="number" id="ig_cfg_val" value="${s.cfg}"></div>
                    <div class="mtab-param-row"><span class="param-label">Denoise</span><input type="range" id="ig_denoise" min="0" max="1" step="0.05" value="${s.denoise}"><input type="number" id="ig_denoise_val" value="${s.denoise}"></div>
                    <div class="mtab-param-row"><span class="param-label">CLIP</span><input type="range" id="ig_clip" min="1" max="12" step="1" value="${s.clipSkip}"><input type="number" id="ig_clip_val" value="${s.clipSkip}"></div>
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <div style="flex: 2;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Resolution Preset</div>
                        <select id="ig_res_preset" class="ps-modern-input" style="padding: 8px; font-size: 0.8rem;"></select>
                    </div>
                    <div style="flex: 1; display: flex; align-items: flex-end; gap: 5px;">
                        <input type="number" id="ig_w" class="ps-modern-input" value="${s.imgWidth}" placeholder="W" style="padding: 8px; text-align: center; font-size: 0.8rem;" />
                        <span style="color: var(--text-muted); padding-bottom: 8px;">x</span>
                        <input type="number" id="ig_h" class="ps-modern-input" value="${s.imgHeight}" placeholder="H" style="padding: 8px; text-align: center; font-size: 0.8rem;" />
                    </div>
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Seed (-1 for random)</div>
                        <div style="display: flex; gap: 5px;">
                            <input type="number" id="ig_seed" class="ps-modern-input" value="${s.customSeed}" style="padding: 8px; font-size: 0.8rem; flex: 1;" />
                            <button id="ig_seed_dice" class="ps-modern-btn secondary" style="padding: 8px 12px;" title="Set to Random (-1)"><i class="fa-solid fa-dice"></i></button>
                        </div>
                    </div>
                    <div style="flex: 2;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Negative Prompt Override</div>
                        <input type="text" id="ig_neg" class="ps-modern-input" value="${s.customNegative}" style="padding: 8px; font-size: 0.8rem;" />
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Positive Prefix (Auto-Added to Front)</div>
                        <input type="text" id="ig_prefix" class="ps-modern-input" value="${s.promptPrefix || ''}" placeholder="e.g. score_9, score_8_up, masterpiece..." style="padding: 8px; font-size: 0.8rem;" />
                    </div>
                </div>
            </div>

            <!-- LoRA Lab -->
            <div class="mtab-panel">
                <div class="mtab-panel-title purple"><i class="fa-solid fa-flask"></i> LoRA Lab</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    ${[1, 2, 3, 4].map(i => {
                        const wtVal = i === 1 ? s.selectedLoraWt : s[`selectedLoraWt${i}`];
                        const trigVal = i === 1 ? s.loraTrigger1 : s[`loraTrigger${i}`];
                        return `
                        <div style="background: rgba(0,0,0,0.1); border: 1px solid var(--border-color); padding: 12px; border-radius: 10px; border-left: 3px solid #a855f7;">
                            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Slot ${i}</div>
                            
                            <select id="ig_lora_${i}" class="ps-modern-input" style="padding: 6px; font-size: 0.75rem; margin-bottom: 4px; width: 100%; box-sizing: border-box; cursor: pointer;">
                                <option value="">Loading...</option>
                            </select>
                            
                            <input type="text" id="ig_lora_trig_${i}" class="ps-modern-input" placeholder="Trigger words..." value="${trigVal || ''}" style="padding: 6px; font-size: 0.7rem; margin-bottom: 8px; width: 100%; box-sizing: border-box;" title="Words automatically injected into the prompt when this LoRA is active." />
                            
                            <div class="mtab-param-row" style="padding:0;">
                                <span class="param-label" style="min-width:30px;">Wt</span>
                                <input type="range" id="ig_lorawt_${i}" min="-6" max="6" step="0.1" value="${wtVal}">
                                <span id="ig_lorawt_lbl_${i}" style="font-size:0.78rem; font-weight:600; color:var(--text-main); min-width:30px; text-align:center;">${wtVal}</span>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `);

    // --- PROMPT EDITOR UI ---
    const igEditor = renderPromptEditor({
        id: "ig_prompt_editor",
        title: "Advanced: Edit Prompts",
        defaultData: DEFAULT_PROMPTS.imageGen,
        currentData: s.customPrompts,
        enabled: s.customPromptsEnabled, // <-- NEW
        onToggle: (val) => { 
            s.customPromptsEnabled = val; 
            syncPromptsGlobally('imageGen', 'customPromptsEnabled', val);
            saveProfileToMemory(); 
        },
        fields: [
            { key: "systemPrompt", label: "System Prompt", hint: "AI role definition." },
            { key: "userPrompt", label: "User Task Prompt", hint: "Tokens: <code>{{chatHistory}}</code>, <code>{{templateRules}}</code>, <code>{{extraStr}}</code>, <code>{{directLanguage}}</code>, <code>{{npcImageTags}}</code>, <code>{{templateExamples}}</code>" },
            { key: "thinkingPrompt", label: "Thinking Instructions", hint: "Must include output ordering instructions." },
            { key: "injectionTemplate", label: "Image Injection Template", hint: "Tokens: <code>{{conditionalText}}</code>, <code>{{templateRules}}</code>, <code>{{promptExtra}}</code>, <code>{{directLanguage}}</code>, <code>{{npcImageTags}}</code>, <code>{{templateExamples}}</code>" },
            { key: "rulesIllusPov", label: "Rules: Illustrious + POV", hint: "" },
            { key: "examplesIllusPov", label: "Examples: Illustrious + POV", hint: "" },
            { key: "rulesSdxlPov", label: "Rules: Z Image + POV", hint: "" },
            { key: "examplesSdxlPov", label: "Examples: Z Image + POV", hint: "" },
            { key: "rulesIllusCinematic", label: "Rules: Illustrious + Cinematic", hint: "" },
            { key: "examplesIllusCinematic", label: "Examples: Illustrious + Cinematic", hint: "" },
            { key: "rulesSdxlCinematic", label: "Rules: Z Image + Cinematic", hint: "" },
            { key: "examplesSdxlCinematic", label: "Examples: Z Image + Cinematic", hint: "" },
            { key: "rulesIllusPortrait", label: "Rules: Illustrious + Portrait", hint: "" },
            { key: "examplesIllusPortrait", label: "Examples: Illustrious + Portrait", hint: "" },
            { key: "rulesSdxlPortrait", label: "Rules: Z Image + Portrait", hint: "" },
            { key: "examplesSdxlPortrait", label: "Examples: Z Image + Portrait", hint: "" }
        ],
        onSave: (val, key) => {
            if (!s.customPrompts) s.customPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.imageGen));
            s.customPrompts[key] = val;
            syncPromptsGlobally('imageGen', 'customPrompts', s.customPrompts);
            saveProfileDebounced();
            return s.customPrompts;
        },
        onReset: () => {
            s.customPrompts = null;
            syncPromptsGlobally('imageGen', 'customPrompts', null);
            saveProfileToMemory();
        }
    });
    c.find('#ig_main_content').append(igEditor);

    // --- EVENTS & BINDINGS ---
    $("#ig_enable_card").on("click", function () {
        s.enabled = !s.enabled;
        saveProfileToMemory();
        toggleQuickGenButton();
        if (s.enabled) {
            $(this).addClass("active"); $(this).css("border-color", "var(--gold)"); $(this).find("span").css("color", "var(--gold)");
            $("#ig_main_content").slideDown(200); 
            igPopulateWorkflows(); // <-- ADDED THIS!
            igFetchComfyLists();
            $("#ig_header_badge").css({ background: 'rgba(16,185,129,0.12)', color: '#10b981', 'border-color': 'rgba(16,185,129,0.25)' }).html(`<i class="fa-solid fa-circle-check" style="font-size:0.6rem;"></i> Enabled`);
        } else {
            $(this).removeClass("active"); $(this).css("border-color", "var(--border-color)"); $(this).find("span").css("color", "var(--text-main)");
            $("#ig_main_content").slideUp(200);
            $("#ig_header_badge").css({ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', 'border-color': 'var(--border-color)' }).html(`<i class="fa-solid fa-circle-xmark" style="font-size:0.6rem;"></i> Disabled`);
        }
    });
    $("#ig_template").on("change", (e) => { s.promptTemplate = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_extra").on("input", (e) => { s.promptExtra = $(e.target).val(); saveProfileDebounced(); });
    $("#ig_image_count").on("change", (e) => { s.imageCount = parseInt($(e.target).val()); saveProfileToMemory(); });
    
    $("#ig_examples_toggle").on("click", function() {
        s.includeExamples = !s.includeExamples;
        saveProfileToMemory();
        if (s.includeExamples) {
            $(this).addClass("active").css("border-color", "#10b981");
            $(this).find(".ps-switch").css("background", "#10b981");
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
            $(this).find(".ps-switch").css("background", "");
        }
    });
    $("#ig_direct_toggle").on("click", function() {
        s.directLanguage = !s.directLanguage;
        saveProfileToMemory();
        if (s.directLanguage) {
            $(this).addClass("active").css("border-color", "#10b981");
            $(this).find(".ps-switch").css("background", "#10b981");
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
            $(this).find(".ps-switch").css("background", "");
        }
    });
    $("#ig_npc_tags_toggle").on("click", function() {
        s.injectNpcTags = !s.injectNpcTags;
        saveProfileToMemory();
        if (s.injectNpcTags) {
            $(this).addClass("active").css("border-color", "#10b981");
            $(this).find(".ps-switch").css("background", "#10b981");
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
            $(this).find(".ps-switch").css("background", "");
        }
    });
    $("#img_gen_backend").on("change", function () {
        s.generatorBackend = $(this).val();
        saveProfileToMemory();
    });

    $("#ig_inject_mode").on("change", (e) => { s.injectMode = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_trigger_mode").on("change", (e) => {
        s.triggerMode = $(e.target).val();
        saveProfileToMemory();
        toggleQuickGenButton(); // <-- ADDED
        if (s.triggerMode === 'frequency') $("#ig_freq_container").show(); else $("#ig_freq_container").hide();
    });
    $("#ig_auto_freq").on("input", (e) => { let v = parseInt($(e.target).val()); if (v < 1) v = 1; s.autoGenFreq = v; saveProfileDebounced(); });

    $("#ig_preview_card").on("click", function () {
        s.previewPrompt = !s.previewPrompt;
        saveProfileToMemory();
        if (s.previewPrompt) $(this).addClass("active");
        else $(this).removeClass("active");
    });

    $("#ig_auto_portraits_card").on("click", function () {
        s.autoPortraits = !s.autoPortraits;
        saveProfileToMemory();
        $(this).toggleClass("active", Boolean(s.autoPortraits));
        if (s.autoPortraits) toastr.info("Auto portraits on. Every character in the scene gets a portrait after each reply while ComfyUI is running.", "Megumin Suite");
    });

    // Inputs
    $("#ig_url").on("input", (e) => { s.comfyUrl = $(e.target).val(); saveProfileDebounced(); });
    $("#ig_style").on("change", (e) => { s.promptStyle = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_persp").on("change", (e) => { s.promptPerspective = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_extra").on("input", (e) => { s.promptExtra = $(e.target).val(); saveProfileDebounced(); });
    $("#ig_w, #ig_h").on("input", (e) => { s[e.target.id === "ig_w" ? "imgWidth" : "imgHeight"] = parseInt($(e.target).val()); saveProfileDebounced(); });
    $("#ig_neg").on("input", (e) => { s.customNegative = $(e.target).val(); saveProfileDebounced(); });
    $("#ig_seed").on("input", (e) => { s.customSeed = parseInt($(e.target).val()); saveProfileDebounced(); });
    $("#ig_seed_dice").on("click", () => {
        s.customSeed = -1;
        $("#ig_seed").val(-1);
        saveProfileToMemory();
    });
    $("#ig_prefix").on("input", (e) => { s.promptPrefix = $(e.target).val(); saveProfileDebounced(); });

    // Sliders
    const bindSlider = (id, key, isFloat) => {
        $(`#ig_${id}`).on("input", function () { let v = isFloat ? parseFloat(this.value) : parseInt(this.value); s[key] = v; $(`#ig_${id}_val`).val(v); saveProfileDebounced(); });
        $(`#ig_${id}_val`).on("input", function () { let v = isFloat ? parseFloat(this.value) : parseInt(this.value); s[key] = v; $(`#ig_${id}`).val(v); saveProfileDebounced(); });
    };
    bindSlider("steps", "steps", false); bindSlider("cfg", "cfg", true); bindSlider("denoise", "denoise", true); bindSlider("clip", "clipSkip", false);

    // Resolutions
    const resSel = $("#ig_res_preset");
    resSel.empty().append('<option value="">-- Select Preset --</option>');
    RESOLUTIONS.forEach((r, idx) => resSel.append(`<option value="${idx}">${r.label}</option>`));
    resSel.on("change", (e) => {
        const idx = parseInt($(e.target).val());
        if (!isNaN(idx) && RESOLUTIONS[idx]) { $("#ig_w").val(RESOLUTIONS[idx].w).trigger("input"); $("#ig_h").val(RESOLUTIONS[idx].h).trigger("input"); }
    });

    // LoRAs with Smart Dictionary Memory
    for (let i = 1; i <= 4; i++) {
        const key = i === 1 ? "selectedLora" : `selectedLora${i}`;
        const wtKey = i === 1 ? "selectedLoraWt" : `selectedLoraWt${i}`;
        const trigKey = i === 1 ? "loraTrigger1" : `loraTrigger${i}`;
        
        $(`#ig_lora_${i}`).on("change", (e) => { 
            const selectedLoraName = $(e.target).val();
            s[key] = selectedLoraName; 
            
            // Look up if we have saved trigger words for this specific LoRA
            if (selectedLoraName && s.loraTriggersMap && s.loraTriggersMap[selectedLoraName] !== undefined) {
                s[trigKey] = s.loraTriggersMap[selectedLoraName];
            } else {
                s[trigKey] = ""; // Clear box if no saved words
            }
            
            // Update the UI box to reflect the loaded triggers
            $(`#ig_lora_trig_${i}`).val(s[trigKey]);
            saveProfileToMemory(); 
        });

        $(`#ig_lora_trig_${i}`).on("input", (e) => { 
            const newTriggers = $(e.target).val();
            s[trigKey] = newTriggers; 
            
            // Save to the global dictionary so it remembers it next time you select this LoRA
            if (s[key] && s[key].trim() !== "") {
                if (!s.loraTriggersMap) s.loraTriggersMap = {};
                s.loraTriggersMap[s[key]] = newTriggers;
            }
            
            saveProfileDebounced(); 
        });

        $(`#ig_lorawt_${i}`).on("input", function () { let v = parseFloat(this.value); s[wtKey] = v; $(`#ig_lorawt_lbl_${i}`).text(v); saveProfileDebounced(); });
    }

    // Models & Samplers
    $("#ig_model").on("change", (e) => { s.selectedModel = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_sampler").on("change", (e) => { s.selectedSampler = $(e.target).val(); saveProfileToMemory(); });

    // Buttons
    $("#ig_test_btn").on("click", igTestConnection);

    // Workflow Managers
    $("#ig_new_wf").on("click", igNewWorkflowClick);
    $("#ig_edit_wf").on("click", igOpenWorkflowEditorClick);
    $("#ig_del_wf").on("click", igDeleteWorkflowClick);
    $("#ig_workflow_list").on("change", (e) => {
        const newWorkflow = $(e.target).val();
        const oldWorkflow = s.currentWorkflowName;
        if (oldWorkflow) {
            if (!s.savedWorkflowStates) s.savedWorkflowStates = {};
            s.savedWorkflowStates[oldWorkflow] = {
                selectedModel: s.selectedModel, selectedSampler: s.selectedSampler, steps: s.steps, cfg: s.cfg, denoise: s.denoise, clipSkip: s.clipSkip,
                imgWidth: s.imgWidth, imgHeight: s.imgHeight, customSeed: s.customSeed, customNegative: s.customNegative,
                promptStyle: s.promptStyle, promptPerspective: s.promptPerspective, promptExtra: s.promptExtra, previewPrompt: s.previewPrompt,
                selectedLora: s.selectedLora, selectedLoraWt: s.selectedLoraWt, loraTrigger1: s.loraTrigger1,
                selectedLora2: s.selectedLora2, selectedLoraWt2: s.selectedLoraWt2, loraTrigger2: s.loraTrigger2,
                selectedLora3: s.selectedLora3, selectedLoraWt3: s.selectedLoraWt3, loraTrigger3: s.loraTrigger3,
                selectedLora4: s.selectedLora4, selectedLoraWt4: s.selectedLoraWt4, loraTrigger4: s.loraTrigger4
            };
        }
        if (s.savedWorkflowStates && s.savedWorkflowStates[newWorkflow]) {
            Object.assign(s, s.savedWorkflowStates[newWorkflow]);
            toastr.success(`Restored settings for ${newWorkflow}`);
            renderImageGen(c); // Re-render to update UI with restored values
        } else { toastr.info(`New workflow context active`); }

        s.currentWorkflowName = newWorkflow;
        saveProfileToMemory();
    });

    if (s.enabled) {
        igPopulateWorkflows();
        igFetchComfyLists();
    }
}

// -------------------------------------------------------------
// STAGE 8 HELPER FUNCTIONS
// -------------------------------------------------------------
export async function igFetchComfyLists() {
    const s = localProfile.imageGen;
    const url = s.comfyUrl;
    try {
        const mRes = await fetch('/api/sd/comfy/models', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: url }) });
        if (mRes.ok) {
            const models = await mRes.json();
            const sel = $("#ig_model"); sel.empty().append('<option value="">-- Select Model --</option>');
            models.forEach(m => { let v = m.value || m; let t = m.text || v; sel.append(`<option value="${v}">${t}</option>`); });
            if (s.selectedModel) sel.val(s.selectedModel);
        }
        const sRes = await fetch('/api/sd/comfy/samplers', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: url }) });
        if (sRes.ok) {
            const samplers = await sRes.json();
            const sel = $("#ig_sampler"); sel.empty();
            samplers.forEach(sa => sel.append(`<option value="${sa}">${sa}</option>`));
            if (s.selectedSampler) sel.val(s.selectedSampler);
        }
        const lRes = await fetch(`${url}/object_info/LoraLoader`);
        if (lRes.ok) {
            const json = await lRes.json();
            const files = json['LoraLoader'].input.required.lora_name[0];
            for (let i = 1; i <= 4; i++) {
                const sel = $(`#ig_lora_${i}`); 
                const val = i === 1 ? s.selectedLora : s[`selectedLora${i}`];
                sel.empty().append('<option value="">-- No LoRA --</option>');
                files.forEach(f => sel.append(`<option value="${f}">${f}</option>`));
                if (val) sel.val(val);
            }
        }
    } catch (e) { console.warn(`[Megumin-Suite] ComfyLists failed`, e); }
}

export function toggleQuickGenButton() {
    const s = localProfile?.imageGen;
    if (s && s.enabled && s.triggerMode === 'manual') {
        $("#kazuma_quick_gen").css("display", "flex");
    } else {
        $("#kazuma_quick_gen").css("display", "none");
    }
}

export async function igTestConnection() {
    try {
        const res = await fetch('/api/sd/comfy/ping', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: localProfile.imageGen.comfyUrl }) });
        if (res.ok) { toastr.success("ComfyUI Connected!"); await igFetchComfyLists(); } else throw new Error("Ping failed");
    } catch (e) { toastr.error("Connection Failed: " + e.message); }
}

export async function igPopulateWorkflows() {
    const sel = $("#ig_workflow_list"); sel.empty();
    try {
        const res = await fetch('/api/sd/comfy/workflows', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: localProfile.imageGen.comfyUrl }) });
        if (res.ok) {
            const wfs = await res.json();
            wfs.forEach(w => sel.append(`<option value="${w}">${w}</option>`));
            if (localProfile.imageGen.currentWorkflowName && wfs.includes(localProfile.imageGen.currentWorkflowName)) {
                sel.val(localProfile.imageGen.currentWorkflowName);
            } else if (wfs.length > 0) {
                sel.val(wfs[0]); localProfile.imageGen.currentWorkflowName = wfs[0]; saveProfileToMemory();
            }
        }
    } catch (e) { sel.append('<option disabled>Failed to load</option>'); }
}

export async function igNewWorkflowClick() {
    let name = await prompt("New workflow file name (e.g. 'my_flux.json'):");
    if (!name) return; if (!name.toLowerCase().endsWith('.json')) name += '.json';
    try {
        const res = await fetch('/api/sd/comfy/save-workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name, workflow: '{}' }) });
        if (!res.ok) throw new Error(await res.text());
        toastr.success("Workflow created!"); await igPopulateWorkflows(); $("#ig_workflow_list").val(name).trigger('change');
        setTimeout(igOpenWorkflowEditorClick, 500);
    } catch (e) { toastr.error(e.message); }
}

export async function igDeleteWorkflowClick() {
    const name = localProfile.imageGen.currentWorkflowName;
    if (!name) return; if (!confirm(`Delete ${name}?`)) return;
    try {
        const res = await fetch('/api/sd/comfy/delete-workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name }) });
        if (!res.ok) throw new Error(await res.text());
        toastr.success("Deleted."); await igPopulateWorkflows();
    } catch (e) { toastr.error(e.message); }
}

export async function igOpenWorkflowEditorClick() {
    const name = localProfile.imageGen.currentWorkflowName;
    if (!name) return toastr.warning("No workflow selected");
    let loadedContent = "{}";
    try {
        const res = await fetch('/api/sd/comfy/workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name }) });
        if (res.ok) {
            const rawBody = await res.json(); let jsonObj = rawBody;
            if (typeof rawBody === 'string') { try { jsonObj = JSON.parse(rawBody); } catch (e) { } }
            loadedContent = JSON.stringify(jsonObj, null, 4);
        }
    } catch (e) { toastr.error("Failed to load file. Starting empty."); }

    let currentJsonText = loadedContent;
    const $container = $(`
        <div style="display: flex; flex-direction: column; width: 100%; gap: 10px; font-family: 'Inter', sans-serif; color: var(--text-main);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                <h3 style="margin:0; color: var(--gold);">${name}</h3>
                <div style="display:flex; gap:8px;">
                    <button class="ps-modern-btn secondary wf-format" title="Beautify JSON"><i class="fa-solid fa-align-left"></i> Format</button>
                    <button class="ps-modern-btn secondary wf-import" title="Upload .json file"><i class="fa-solid fa-upload"></i> Import</button>
                    <button class="ps-modern-btn secondary wf-export" title="Download .json file"><i class="fa-solid fa-download"></i> Export</button>
                    <input type="file" class="wf-file-input" accept=".json" style="display:none;" />
                </div>
            </div>
            <div style="display: flex; gap: 15px;">
                <textarea class="ps-modern-input wf-textarea" spellcheck="false" style="flex: 1; min-height: 500px; font-family: 'Consolas', 'Monaco', monospace; white-space: pre; resize: none; font-size: 13px; line-height: 1.4; background: #000;"></textarea>
                <div style="width: 250px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border-color); padding-left: 10px; max-height: 500px;">
                    <h4 style="margin: 0 0 10px 0; color: var(--text-muted);">Placeholders</h4>
                    <div class="wf-list" style="overflow-y: auto; flex: 1; padding-right: 5px;"></div>
                </div>
            </div>
        </div>
    `);

    const $textarea = $container.find('.wf-textarea'); const $list = $container.find('.wf-list'); const $fileInput = $container.find('.wf-file-input');
    $textarea.val(currentJsonText);

    KAZUMA_PLACEHOLDERS.forEach(item => {
        const $itemDiv = $('<div></div>').css({ 'padding': '8px', 'margin-bottom': '6px', 'background': 'rgba(255,255,255,0.05)', 'border-radius': '6px', 'border': '1px solid transparent', 'transition': '0.2s' });
        $itemDiv.append($('<span></span>').text(item.key).css({ 'font-weight': 'bold', 'color': 'var(--gold)', 'font-family': 'monospace' })).append($('<div></div>').text(item.desc).css({ 'font-size': '0.7rem', 'color': 'var(--text-muted)', 'margin-top': '4px' }));
        $list.append($itemDiv);
    });

    const updateState = () => {
        currentJsonText = $textarea.val();
        $list.children().each(function () {
            const cleanKey = $(this).find('span').first().text().replace(/"/g, '');
            if (currentJsonText.includes(cleanKey)) $(this).css({ 'border-color': '#10b981', 'background': 'rgba(16, 185, 129, 0.1)' });
            else $(this).css({ 'border-color': 'transparent', 'background': 'rgba(255,255,255,0.05)' });
        });
    };
    $textarea.on('input', updateState); setTimeout(updateState, 100);

    $container.find('.wf-format').on('click', () => { try { $textarea.val(JSON.stringify(JSON.parse($textarea.val()), null, 4)); updateState(); toastr.success("Formatted"); } catch (e) { toastr.warning("Invalid JSON"); } });
    $container.find('.wf-import').on('click', () => $fileInput.click());
    $fileInput.on('change', (e) => { if (!e.target.files[0]) return; const r = new FileReader(); r.onload = (ev) => { $textarea.val(ev.target.result); updateState(); toastr.success("Imported"); }; r.readAsText(e.target.files[0]); $fileInput.val(''); });
    $container.find('.wf-export').on('click', () => { try { JSON.parse(currentJsonText); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([currentJsonText], { type: "application/json" })); a.download = name; a.click(); } catch (e) { toastr.warning("Invalid content"); } });

    const popup = new Popup($container, POPUP_TYPE.CONFIRM, '', { okButton: 'Save Changes', cancelButton: 'Cancel', wide: true, large: true, onClosing: () => { try { JSON.parse(currentJsonText); return true; } catch (e) { toastr.error("Invalid JSON."); return false; } } });
    if (await popup.show()) {
        try {
            const res = await fetch('/api/sd/comfy/save-workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name, workflow: JSON.stringify(JSON.parse(currentJsonText)) }) });
            if (!res.ok) throw new Error(await res.text()); toastr.success("Workflow Saved!");
        } catch (e) { toastr.error("Save Failed."); }
    }
}

export async function igManualGenerate() {
    const s = localProfile?.imageGen;
    if (!s || !s.enabled) return;

    showKazumaProgress("Analyzing Scene...");

    try {
        let promptText;
        if (!s.generatorBackend || s.generatorBackend === "direct") {
            promptText = await generateImagePromptText();
        } else {
            // Use the "Megumin Image" preset, but still run the exact same prompt logic
            await useMeguminEngine(async () => {
                promptText = await generateImagePromptText();
            }, "Megumin Image");
        }

        // Use capturing group 1 for the quote type, group 2 for the actual prompt text
        const imgRegex = /<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/i;
        const match = promptText.match(imgRegex);
        if (match) promptText = match[2];

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

// New Helper Function for generating the prompt text
export async function generateImagePromptText() {
    const ig = localProfile.imageGen;
    const chat = getContext().chat;
    const lastMessages = chat.filter(m => !m.is_user && !m.is_system).slice(-5).map(m => {
        return `${m.name}: ${meguminCleanChatHistoryText(m.mes)}`;
    }).join("\n\n");

    const customIg = ig.customPromptsEnabled ? (ig.customPrompts || {}) : {};
    const defIg = DEFAULT_PROMPTS.imageGen;

    let rules = "", examples = "";
    const tmpl = ig.promptTemplate || "illus_cinematic";

    const map = {
        "illus_pov": ["rulesIllusPov", "examplesIllusPov"],
        "sdxl_pov": ["rulesSdxlPov", "examplesSdxlPov"],
        "illus_cinematic": ["rulesIllusCinematic", "examplesIllusCinematic"],
        "sdxl_cinematic": ["rulesSdxlCinematic", "examplesSdxlCinematic"],
        "illus_portrait": ["rulesIllusPortrait", "examplesIllusPortrait"],
        "sdxl_portrait": ["rulesSdxlPortrait", "examplesSdxlPortrait"]
    };

    const keys = map[tmpl];
    if (keys) {
        rules = customIg[keys[0]] || defIg[keys[0]];
        examples = customIg[keys[1]] || defIg[keys[1]];
    }

    if (!ig.includeExamples) examples = "";

    let directLangStr = ig.directLanguage ? "**DIRECT LANGUAGE:** Use exact Booru tags only. \"naked\" not \"wearing nothing.\" \"erection\" not \"visible arousal.\"\n\n**NSFW TAG REFERENCE (use when scene is explicit):**\nBody: naked, nude, topless, exposed nipples, small breasts, medium breasts, large breasts, spread legs, ass, erection, veins, veiny penis\nActions: hetero, sex, vaginal, anal, oral, fellatio, after fellatio, paizuri, straddling, riding, missionary, doggystyle, cowgirl position, moaning, open mouth, tongue out, ahegao, clenching teeth\nFluids: cum, cum on body, cum on breasts, cum on face, cum on hair, cum on tongue, cum in mouth, cum inside, ejaculation, facial, saliva, sweat\nState: flushed face, heavy breathing, trembling, crying with eyes open, half-closed eyes, solo focus" : "";
    let npcTagsStr = getRelevantNpcImageTags(); // <-- GET THE TAGS

    setActiveImageGenRequest({
        chatText: lastMessages, 
        templateRules: rules, 
        templateExamples: examples, 
        extraStr: ig.promptExtra || "",
        directLanguageStr: directLangStr,
        npcTagsStr: npcTagsStr // <-- ADD TO REQUEST
    });

    let rawOutput = await generateQuietPrompt({ prompt: "___PS_IMAGE_GEN___" });
    return rawOutput.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ── Inline Image Retry: DOM-based button injection ──
// SillyTavern's HTML sanitizer renames custom CSS classes (e.g. "kazuma-foo" → "custom-kazuma-foo")
// when rendering message.mes. This means buttons stored in mes will never match click handlers.
// Instead, we inject buttons via direct DOM manipulation AFTER ST renders, like ComfyInject does.
export function addKazumaRetryButtons(msgIndex) {
    const context = getContext();
    const message = context.chat[msgIndex];
    if (!message) return;

    const messageNode = document.querySelector(`[mesid="${msgIndex}"]`);
    if (!messageNode) return;

    // ST's sanitizer prefixes custom classes with "custom-" in the rendered DOM
    const images = messageNode.querySelectorAll('img[alt="KazumaInline"]');
    if (images.length === 0) return;

    images.forEach((img) => {
        // Find the wrapper div (ST may rename the class, but the structure is preserved)
        const wrapper = img.closest('div');
        if (!wrapper) return;

        // Don't add a second retry button if one already exists
        if (wrapper.querySelector('.kazuma-regen-btn')) return;

        // Get the wrapperId — try data attr first, then wrapper's id
        const wrapperId = img.getAttribute('data-kazumaid') || img.dataset?.kazumaid || wrapper.id || '';

        // Get the prompt — try title attr from DOM, then parse from message.mes
        let prompt = (img.getAttribute('title') || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        if (!prompt && wrapperId && message.mes) {
            // Extract prompt from the raw mes using the wrapperId
            const mesMatch = message.mes.match(new RegExp(`<img[^>]*?title="([^"]*)"[^>]*?data-kazumaid="${wrapperId}"`));
            if (mesMatch) prompt = mesMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        }

        if (!prompt || !wrapperId) return;

        // Style the wrapper for absolute positioning of the button
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';

        // Create the retry button
        const btn = document.createElement('div');
        btn.className = 'kazuma-regen-btn';
        btn.title = 'Regenerate this image';
        // On a device with no pointer there is no mouseenter, so a button that
        // rests at opacity 0 can never be seen. Rest it at 0.85 instead.
        const kazumaCanHover = !window.matchMedia || window.matchMedia('(hover: hover)').matches;
        const kazumaRestOpacity = kazumaCanHover ? '0' : '0.85';
        btn.style.cssText = 'position:absolute; top:8px; right:8px; cursor:pointer; background:rgba(0,0,0,0.65); color:#ffcc00; border-radius:6px; padding:5px 8px; font-size:14px; z-index:10; border:1px solid rgba(255,204,0,0.5); opacity:' + kazumaRestOpacity + '; transition:opacity 0.2s ease; line-height:1;';
        btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';

        // Show/hide on hover
        wrapper.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        wrapper.addEventListener('mouseleave', () => { btn.style.opacity = kazumaRestOpacity; });

        // Click handler — directly attached, no delegation needed
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            const s = localProfile?.imageGen;
            if (!s || !s.enabled) { toastr.warning("Image Generation is disabled."); return; }

            // Re-find the message dynamically (index may have shifted)
            const ctx = getContext();
            const currentMsgIndex = ctx.chat.findIndex(m => m.mes && m.mes.includes(wrapperId));
            if (currentMsgIndex === -1) { toastr.warning("Could not find the original message for this image."); return; }
            const msg = ctx.chat[currentMsgIndex];

            // Replace the HTML block back to the loading placeholder
            const regenRegex = new RegExp(`<!-- kazuma-inline-start:${wrapperId} -->[\\s\\S]*?<!-- kazuma-inline-end:${wrapperId} -->`, "g");
            const placeholder = `<div id="${wrapperId}" class="kazuma-img-placeholder" style="color:var(--gold); font-style: italic; margin: 10px 0;">[Regenerating Image...]</div>`;

            if (msg.mes.includes(`kazuma-inline-start:${wrapperId}`)) {
                msg.mes = msg.mes.replace(regenRegex, placeholder);
            } else {
                toastr.warning("Could not find the original image block to replace.");
                return;
            }

            await saveChat();
            if (typeof updateMessageBlock === "function") {
                updateMessageBlock(currentMsgIndex, msg);
                // The rebuild dropped the block card with the rest of the body.
                meguminScheduleBlocksRefresh();
            } else {
                reloadCurrentChat();
            }

            toastr.info("Regenerating inline image...");
            igGenerateWithComfy(prompt, { message: msg, index: currentMsgIndex, mode: "inline", isInlineAuto: true, placeholderId: wrapperId });
        });

        wrapper.appendChild(btn);
    });
}

// One attempt 150ms after the redraw is a single chance. If anything redraws the
// message after that, or if the code below the call throws before the timer is
// set, the button never comes back until the chat is loaded again. Try a few
// times instead. Each pass covers every image in the message and leaves images
// that already have a button alone, so the extra passes cost nothing.
export function kazumaRetrySweep(msgIndex) {
    [150, 600, 1500, 3000].forEach((ms) => setTimeout(() => {
        try { addKazumaRetryButtons(msgIndex); } catch (e) { }
    }, ms));
}

export async function igGenerateWithComfy(positivePrompt, target = null) {
    const s = localProfile.imageGen;
    let finalPrompt = positivePrompt;

    // This one writes into a CHAT MESSAGE and calls saveChat(), not into a profile, so
    // _loadedProfileKey is the wrong thing to check: what matters is whether the message
    // being written to is still part of the chat that is open. `target.message` and
    // `target.index` are captured before a prompt popup, a ComfyUI submit and a 1s poll
    // loop; by the time an image comes back the user can be several chats away, and
    // target.index would then point at whatever message happens to sit at that position.
    const igChatId = getContext().chatId ?? null;
    const igGroupId = getContext().groupId ?? null;
    // Re-resolve instead of trusting the captured index, since deleting or swiping a
    // message above the target shifts everything below it. Object identity is checked
    // first, then the inline placeholder id, which is unique and lives in the message
    // text itself so it survives the message object being rebuilt on a chat reload.
    const igResolveTarget = () => {
        const ctx = getContext();
        if ((ctx.chatId ?? null) !== igChatId || (ctx.groupId ?? null) !== igGroupId) return false;
        if (!target || !target.message) return true; // free-standing insert: the chat check above is the whole test
        const chat = ctx.chat;
        if (!Array.isArray(chat)) return false;
        if (chat[target.index] === target.message) return true;
        const moved = chat.indexOf(target.message);
        if (moved !== -1) { target.index = moved; return true; }
        if (target.placeholderId) {
            const byId = chat.findIndex(m => typeof m?.mes === "string" && m.mes.includes(target.placeholderId));
            if (byId !== -1) { target.message = chat[byId]; target.index = byId; return true; }
        }
        // Gallery inserts carry no placeholder, so a chat reload inside the SAME chat would
        // otherwise lose them: reloadCurrentChat() rebuilds every message object. send_date
        // plus sender is stable across that rebuild and unique enough within one chat.
        if (target.message.send_date !== undefined) {
            const byStamp = chat.findIndex(m => m?.send_date === target.message.send_date
                && m?.name === target.message.name
                && !!m?.is_user === !!target.message.is_user);
            if (byStamp !== -1) { target.message = chat[byStamp]; target.index = byStamp; return true; }
        }
        return false;
    };
    const igDeclineWrite = (what) => {
        console.debug(`[Megumin-Suite] Image gen ${what} declined: it was started for chat "${igChatId}" message ${target?.index}, which is no longer reachable in the open chat. Nothing was written, so no unrelated message was edited. Any leftover "[Generating Image...]" placeholder in the original chat is cosmetic and clears on the next edit of that message.`);
    };

    // --- INJECT LORA TRIGGER WORDS ---
    let loraTriggers = [];
    if (s.selectedLora && s.selectedLora.trim() !== "" && s.loraTrigger1) loraTriggers.push(s.loraTrigger1.trim());
    if (s.selectedLora2 && s.selectedLora2.trim() !== "" && s.loraTrigger2) loraTriggers.push(s.loraTrigger2.trim());
    if (s.selectedLora3 && s.selectedLora3.trim() !== "" && s.loraTrigger3) loraTriggers.push(s.loraTrigger3.trim());
    if (s.selectedLora4 && s.selectedLora4.trim() !== "" && s.loraTrigger4) loraTriggers.push(s.loraTrigger4.trim());

    if (loraTriggers.length > 0) {
        let combinedTriggers = loraTriggers.join(", ");
        if (!combinedTriggers.endsWith(",")) combinedTriggers += ",";
        finalPrompt = combinedTriggers + " " + finalPrompt;
    }

    // --- INJECT PREFIX ---
    if (s.promptPrefix && s.promptPrefix.trim() !== "") {
        let prefix = s.promptPrefix.trim();
        if (!prefix.endsWith(",")) prefix += ",";
        finalPrompt = prefix + " " + finalPrompt;
    }

    // --- INTERCEPT PROMPT IF PREVIEW IS ENABLED ---
    if (s.previewPrompt) {
        $("#kazuma_progress_overlay").hide(); // Hide the progress bar temporarily

        const $content = $(`
            <div style="display:flex; flex-direction:column; gap:10px; font-family: 'Inter', sans-serif;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">Review or modify the prompt before it goes to ComfyUI.</div>
                <textarea class="ps-modern-input ig-preview-textarea" style="height: 150px; resize: vertical; font-family: monospace; font-size: 0.85rem; padding: 10px;">${finalPrompt}</textarea>
            </div>
        `);

        // CRITICAL FIX: SillyTavern destroys the popup HTML when it closes. 
        // We MUST capture the text while the user is typing!
        let liveText = finalPrompt;
        $content.find(".ig-preview-textarea").on("input", function () {
            liveText = $(this).val();
        });

        const popup = new Popup($content, POPUP_TYPE.CONFIRM, "Preview Image Prompt", { okButton: "Send to ComfyUI", cancelButton: "Cancel", wide: true });
        const confirmed = await popup.show();

        if (!confirmed) {
            toastr.info("Generation cancelled.");
            return;
        }

        finalPrompt = liveText.trim();
        if (!finalPrompt) return toastr.warning("Prompt cannot be empty.");

        showKazumaProgress("Preparing to Render..."); // Bring progress bar back
    }

    let workflowRaw;
    try {
        const res = await fetch('/api/sd/comfy/workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: s.currentWorkflowName }) });
        if (!res.ok) throw new Error("Load failed"); workflowRaw = await res.json();
    } catch (e) { return toastr.error(`Could not load ${s.currentWorkflowName}`); }

    let workflow = (typeof workflowRaw === 'string') ? JSON.parse(workflowRaw) : workflowRaw;
    let finalSeed = parseInt(s.customSeed); if (finalSeed === -1 || isNaN(finalSeed)) finalSeed = Math.floor(Math.random() * 1000000000);

    let seedInjected = false;
    for (const nodeId in workflow) {
        const node = workflow[nodeId];
        if (node.inputs) {
            for (const key in node.inputs) {
                const val = node.inputs[key];
                if (val === "%prompt%") node.inputs[key] = finalPrompt;
                if (val === "%negative_prompt%") node.inputs[key] = s.customNegative || "";
                if (val === "%seed%") { node.inputs[key] = finalSeed; seedInjected = true; }
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
                if (val === "%width%") node.inputs[key] = parseInt(s.imgWidth) || 512;
                if (val === "%height%") node.inputs[key] = parseInt(s.imgHeight) || 512;
            }
            if (!seedInjected && node.class_type === "KSampler" && 'seed' in node.inputs && typeof node.inputs['seed'] === 'number') { node.inputs.seed = finalSeed; }
        }
    }

    // ComfyUI reports real step progress, but only to the client id that queued
    // the job — so the same id must go to the socket and into the /prompt body.
    const comfyClientId = makeComfyClientId();
    const progress = openComfyProgressSocket(s.comfyUrl, comfyClientId, {
        onProgress: (value, max) => {
            const pct = Math.round((value / max) * 100);
            showKazumaProgress(`Rendering Image... ${value}/${max} (${pct}%)`, pct);
        },
    });

    try {
        const res = await fetch(`${s.comfyUrl}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: comfyClientId }) });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        showKazumaProgress("Rendering Image...");
        const checkInterval = setInterval(async () => {
            try {
                const h = await (await fetch(`${s.comfyUrl}/history/${data.prompt_id}`)).json();
                if (h[data.prompt_id]) {
                    clearInterval(checkInterval);
                    let finalImage = null;
                    for (const nodeId in h[data.prompt_id].outputs) {
                        const nodeOut = h[data.prompt_id].outputs[nodeId];
                        if (nodeOut.images && nodeOut.images.length > 0) { finalImage = nodeOut.images[0]; break; }
                    }
                    if (finalImage) {
                        showKazumaProgress("Downloading...");
                        const imgUrl = `${s.comfyUrl}/view?filename=${finalImage.filename}&subfolder=${finalImage.subfolder}&type=${finalImage.type}`;

                        // Download & Compress
                        const response = await fetch(imgUrl); const blob = await response.blob();
                        const base64Raw = await new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(blob); });
                        let base64Clean = base64Raw; let format = "png";
                        if (s.compressImages) {
                            base64Clean = await new Promise((res) => { const img = new Image(); img.src = base64Raw; img.onload = () => { const cvs = document.createElement('canvas'); cvs.width = img.width; cvs.height = img.height; cvs.getContext('2d').drawImage(img, 0, 0); res(cvs.toDataURL("image/jpeg", 0.9)); }; img.onerror = () => res(base64Raw); });
                            format = "jpeg";
                        }

                        // Insert to Chat
                        if (!igResolveTarget()) {
                            igDeclineWrite("insert");
                            progress.close(); $("#kazuma_progress_overlay").hide();
                            return;
                        }
                        const charName = getContext().characters[getContext().characterId]?.name || "User";
                        const savedPath = await saveBase64AsFile(base64Clean.split(',')[1], charName, `${charName}_${humanizedDateTime()}`, format);
                        const mediaAttach = {
                            url: savedPath,
                            type: "image",
                            source: "generated",
                            title: finalPrompt,
                            generation_type: "free"
                        };

                        if (target && target.isInlineAuto && target.mode === "inline") {
                            const safePrompt = finalPrompt.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            const wrapperId = target.placeholderId || `kazuma-img-${Date.now()}`;
                            const imgTag = `<!-- kazuma-inline-start:${wrapperId} --><div id="${wrapperId}" class="kazuma-img-wrapper">
<img src="${savedPath}" title="${safePrompt}" alt="KazumaInline" data-kazumaid="${wrapperId}" style="max-width: 100%; border-radius: 8px; display: block;" />
</div><!-- kazuma-inline-end:${wrapperId} -->`;
                            
                            if (target.placeholderId && target.message.mes.includes(`id="${target.placeholderId}"`)) {
                                const specificPlaceholderRegex = new RegExp(`<div id="${target.placeholderId}"[^>]*>.*?<\/div>`, "g");
                                target.message.mes = target.message.mes.replace(specificPlaceholderRegex, imgTag);
                            } else {
                                const placeholderRegex = /<div class="kazuma-img-placeholder"[^>]*>\[(Generating|Regenerating) Image\.\.\.\]<\/div>/g;
                                if (placeholderRegex.test(target.message.mes)) {
                                    target.message.mes = target.message.mes.replace(placeholderRegex, imgTag);
                                } else {
                                    target.message.mes += `\n\n${imgTag}`;
                                }
                            }
                            
                            // Queue the retry buttons before the redraw, not after it.
                            // The passes run on their own timers so they still land
                            // after SillyTavern has drawn, and they survive anything
                            // below here throwing into the empty catch.
                            kazumaRetrySweep(target.index);

                            await saveChat();
                            if (typeof updateMessageBlock === "function") {
                                updateMessageBlock(target.index, target.message);
                                // The rebuild dropped the block card with the rest of the body.
                                meguminScheduleBlocksRefresh();
                            } else {
                                await reloadCurrentChat();
                            }
                            toastr.success("Image injected inline!");
                        } else if (target && target.message && !target.isInlineAuto) {
                            if (!target.message.extra) target.message.extra = {}; if (!target.message.extra.media) target.message.extra.media = [];
                            target.message.extra.media_display = "gallery"; target.message.extra.media.push(mediaAttach); target.message.extra.media_index = target.message.extra.media.length - 1;
                            if (typeof appendMediaToMessage === "function") appendMediaToMessage(target.message, target.element);
                            await saveChat(); toastr.success("Gallery updated!");
                        } else {
                            const newMsg = { name: "Image Gen Kazuma", is_user: false, is_system: true, send_date: Date.now(), mes: "", extra: { media: [mediaAttach], media_display: "gallery", media_index: 0 }, force_avatar: "img/five.png" };
                            getContext().chat.push(newMsg); await saveChat();
                            if (typeof addOneMessage === "function") addOneMessage(newMsg); else await reloadCurrentChat();
                            toastr.success("Image inserted!");
                        }
                        progress.close(); $("#kazuma_progress_overlay").hide();
                    } else {
                        progress.close(); $("#kazuma_progress_overlay").hide();
                        if (target && target.isInlineAuto && target.mode === "inline" && !igResolveTarget()) {
                            igDeclineWrite("failure notice");
                        } else if (target && target.isInlineAuto && target.mode === "inline") {
                            const wrapperId = target.placeholderId || `kazuma-img-${Date.now()}`;
                            const safePrompt = finalPrompt.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            const failTag = `<!-- kazuma-inline-start:${wrapperId} --><div id="${wrapperId}" class="kazuma-img-wrapper" style="color:#ef4444; font-style: italic; margin: 10px 0;"><span>[Image Generation Failed]</span> <img alt="KazumaInline" data-kazumaid="${wrapperId}" title="${safePrompt}" style="display:none;" /></div><!-- kazuma-inline-end:${wrapperId} -->`;
                            
                            if (target.placeholderId && target.message.mes.includes(`id="${target.placeholderId}"`)) {
                                const specificPlaceholderRegex = new RegExp(`<div id="${target.placeholderId}" class="kazuma-img-placeholder"[^>]*>.*?<\\/div>`, "g");
                                target.message.mes = target.message.mes.replace(specificPlaceholderRegex, failTag);
                            } else {
                                const placeholderRegex = /<div class="kazuma-img-placeholder"[^>]*>\[(Generating|Regenerating) Image\.\.\.\]<\/div>/g;
                                target.message.mes = target.message.mes.replace(placeholderRegex, failTag);
                            }
                            kazumaRetrySweep(target.index);
                            saveChat();
                            if (typeof updateMessageBlock === "function") {
                                updateMessageBlock(target.index, target.message);
                                // The rebuild dropped the block card with the rest of the body.
                                meguminScheduleBlocksRefresh();
                            }
                        }
                    }
                }
            } catch (e) { }
        }, 1000);
    } catch (e) {
        progress.close(); $("#kazuma_progress_overlay").hide();
        toastr.error("Comfy Error: " + e.message);
        if (target && target.isInlineAuto && target.mode === "inline" && !igResolveTarget()) {
            igDeclineWrite("error notice");
        } else if (target && target.isInlineAuto && target.mode === "inline") {
            const wrapperId = target.placeholderId || `kazuma-img-${Date.now()}`;
            const safePrompt = finalPrompt.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const failTag = `<!-- kazuma-inline-start:${wrapperId} --><div id="${wrapperId}" class="kazuma-img-wrapper" style="color:#ef4444; font-style: italic; margin: 10px 0;"><span>[Image Generation Failed: ${e.message}]</span> <img alt="KazumaInline" data-kazumaid="${wrapperId}" title="${safePrompt}" style="display:none;" /></div><!-- kazuma-inline-end:${wrapperId} -->`;
            
            if (target.placeholderId && target.message.mes.includes(`id="${target.placeholderId}"`)) {
                const specificPlaceholderRegex = new RegExp(`<div id="${target.placeholderId}" class="kazuma-img-placeholder"[^>]*>.*?<\\/div>`, "g");
                target.message.mes = target.message.mes.replace(specificPlaceholderRegex, failTag);
            } else {
                const placeholderRegex = /<div class="kazuma-img-placeholder"[^>]*>\[(Generating|Regenerating) Image\.\.\.\]<\/div>/g;
                target.message.mes = target.message.mes.replace(placeholderRegex, failTag);
            }
            kazumaRetrySweep(target.index);
            saveChat();
            if (typeof updateMessageBlock === "function") {
                updateMessageBlock(target.index, target.message);
                // The rebuild dropped the block card with the rest of the body.
                meguminScheduleBlocksRefresh();
            }
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Wiring. The quick-generate button's visibility follows the profile, so the
// profile loader asks for it by name rather than knowing this module exists.
// ────────────────────────────────────────────────────────────────────────────

registerRefreshHook(REFRESH.QUICK_GEN_BUTTON, () => toggleQuickGenButton());
