// ────────────────────────────────────────────────────────────────────────────
// Memory Core — tiering, the vault, the archived-message visuals, and the tab.
//
// WHY THIS IS ONE FILE AND NOT FIVE
//
// The obvious split is vault / chunks / visuals / ui. The dependency graph says
// otherwise: vault <-> ui, vault <-> visuals and chunks <-> ui are all genuine
// two-way cycles. Every one of them is a data operation calling a renderer to
// refresh after it mutates (memRunVaultMigration -> memRenderAccordion,
// memSyncLimits -> updateMemoryVisuals) while the renderers call straight back
// into those operations.
//
// Splitting on those lines would produce four files that all import each other
// — the same coupling, plus four sets of imports to read. keywords.js and
// vectordb.js are separate because they are real seams: acyclic, and depended
// on from outside. The rest is one mutually-recursive unit and is filed as one.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, generateQuietPrompt, Popup, POPUP_TYPE } from "../../st.js";
import { localProfile, _loadedProfileKey } from "../../core/state.js";
import { getCharacterKey, meguminActiveDataIdentity, setCollectionIdProvider } from "../../core/keys.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../core/profile.js";
import { syncPromptsGlobally } from "../../core/sync.js";
import { registerRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { setActiveMemorySummarizationRequest } from "../../core/activeRequests.js";
import { DEFAULT_PROMPTS } from "../../prompts/index.js";
import { renderPromptEditor } from "../../ui/promptEditor.js";
import { downloadJsonFile } from "../../utils/download.js";
import { meguminCleanChatHistoryText } from "../../engine/chatText.js";
import { runWithChomusuke } from "../../engine/tasks.js";
import { warnChomusuke } from "../../engine/chomusukeNotice.js";
import { suiteEnabled } from "../../core/power.js";
import { memGetCachedKeywords, memExtractKeywords, memStringHash } from "./keywords.js";
import {
    memGetCollectionId, memInsertToVectorDB, memDeleteFromVectorDB,
    memUpdateSemanticQuery, memUpdateSemanticQueryDebounced, currentSemanticMatches,
} from "./vectordb.js";

// -------------------------------------------------------------
// STAGE 9: MEMORY CORE (3-Tier Context)
// -------------------------------------------------------------
export function renderMemoryCore(c) {
    c.empty();
    const mem = localProfile.memoryCore;

    c.append(`
        <!-- HEADER -->
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
                    <i class="fa-solid fa-memory"></i>
                </div>
                <div>
                    <h2>Memory</h2>
                    <p>3-Tier Context Management: Working, Short-Term, and Long-Term Vector DB.</p>
                </div>
            </div>
            <div id="mem_header_badge" class="mtab-header-badge" style="background: ${mem.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)'}; color: ${mem.enabled ? '#10b981' : 'var(--text-muted)'}; border: 1px solid ${mem.enabled ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'};">
                <i class="fa-solid fa-${mem.enabled ? 'circle-check' : 'circle-xmark'}" style="font-size:0.6rem;"></i> ${mem.enabled ? 'Enabled' : 'Disabled'}
            </div>
        </div>

        <div class="mtab-callout gold" style="margin-bottom: 16px;">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span><strong>Before you switch this on, two things.</strong>
            <br>&bull; <strong>It is not cache friendly.</strong> Retrieved memories sit ahead of the
            chat history in the prompt, so when what it retrieves changes, your provider re-reads the
            whole history instead of serving it from cache.
            <br>&bull; <strong>Use Semantic Embeddings, not TF-IDF.</strong> Keyword matching is the
            fallback and it shows &mdash; semantic search finds the right archive far more often.</span>
        </div>

        <!-- MASTER TOGGLE -->
        <div class="mtab-toggle-row ${mem.enabled ? 'active' : ''}" id="mem_enable_card" style="margin-bottom: 20px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-microchip" style="color:#10b981;"></i> Turn on Memory</div>
                <div class="toggle-desc">Archiving happens silently in the background. Old messages fade in the UI and are replaced in the prompt with injected summaries.</div>
            </div>
            <div class="ps-switch"></div>
        </div>

        <div id="mem_main_content" style="display: ${mem.enabled ? 'block' : 'none'};">
            
            <!-- Dashboard Progress Bar -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                    <div class="mtab-panel-title green" style="margin:0; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-chart-gantt"></i> Context Allocation Dashboard
                        <input type="file" id="mem_file_import" accept=".json" style="display: none;">
                        <button id="mem_btn_import" class="ps-modern-btn secondary" style="padding: 2px 6px; font-size: 0.65rem; color: #10b981; border-color: rgba(16, 185, 129, 0.3);" title="Import Memory Core"><i class="fa-solid fa-file-import"></i></button>
                        <button id="mem_btn_export" class="ps-modern-btn secondary" style="padding: 2px 6px; font-size: 0.65rem; color: #3b82f6; border-color: rgba(59, 130, 246, 0.3);" title="Export Memory Core"><i class="fa-solid fa-download"></i></button>
                    </div>
                    <div style="font-size: 0.75rem; font-weight: 800; color: #10b981; background: rgba(16,185,129,0.1); padding: 4px 12px; border-radius: 12px; border: 1px solid rgba(16,185,129,0.3); box-shadow: 0 0 10px rgba(16,185,129,0.2);">
                        <i class="fa-solid fa-floppy-disk"></i> <span id="mem_live_tokens_saved">~0</span> Tokens Saved
                    </div>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span><i class="fa-solid fa-circle" style="color: #3b82f6; font-size: 0.5rem;"></i> Vault</span>
                    <span id="mem_dash_short_lbl" style="display:${mem.architecture === 'raw_long' ? 'none' : 'inline'};">
                        <i class="fa-solid fa-circle" style="color: #f59e0b; font-size: 0.5rem;"></i> Short-Term
                    </span>
                    <span><i class="fa-solid fa-circle-half-stroke" style="color: #047857; font-size: 0.5rem;"></i> Pending</span>
                    <span><i class="fa-solid fa-circle" style="color: #10b981; font-size: 0.5rem;"></i> Working</span>
                </div>
                <div class="mem-progress-container" style="background: rgba(0,0,0,0.6); display: flex;">
                    <!-- Oldest on Left -->
                    <div id="mem_bar_long" style="background: #3b82f6; transition: width 0.2s ease;" title="Vaulted (Archived)"></div>
                    <div id="mem_bar_short" style="background: #f59e0b; transition: width 0.2s ease;" title="Short-Term (Summaries)"></div>
                    <div id="mem_bar_pend" style="background: repeating-linear-gradient(45deg, #047857, #047857 10px, #10b981 10px, #10b981 20px); transition: width 0.2s ease;" title="Pending (Active Raw)"></div>
                    <div id="mem_bar_work" style="background: #10b981; transition: width 0.2s ease;" title="Working (Active Raw)"></div>
                    <!-- Newest on Right -->
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); margin-top: 4px; opacity: 0.7; font-weight: bold;">
                    <span>&larr; Oldest (First Message)</span>
                    <span>Newest (Last Message) &rarr;</span>
                </div>
                <div style="margin-top: 10px; font-size: 0.7rem; color: var(--text-muted); text-align: center;" id="mem_status_text">
                    Monitoring Chat History...
                </div>
            </div>

            <!-- Engine Settings -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div class="mtab-panel-title gold"><i class="fa-solid fa-gears"></i> Extraction Engine Settings</div>
                
                <!-- Quick Help / Hint -->
                <div style="background: rgba(245,158,11,0.1); border-left: 3px solid #f59e0b; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 0.8rem; color: var(--text-main);">
                    <div style="color: #f59e0b; font-weight: bold; margin-bottom: 6px;"><i class="fa-solid fa-circle-info"></i> How to Use</div>
                    <div style="color: var(--text-muted); line-height: 1.4;">
                        1- Choose your Memory Architecture and how much of each type you want (default is 30 raw, 70 summary).<br>
                        2- Hit <b>Apply & Extract Pending</b> to save and start it.<br>
                        3- You can choose between manual and auto. For manual, you have to hit <b>Apply & Extract Pending</b> to trigger it.
                    </div>
                </div>

                <!-- Architecture Preset Dropdown -->
                <div class="mtab-setting-row" style="padding-top: 0;">
                    <div class="set-info">
                        <div class="set-label">Memory Architecture</div>
                        <div class="set-desc">Configure how memory tiers are structured: Raw text, short-term summaries, and long-term vector database, or bypass summaries to save API usage.</div>
                    </div>
                    <select id="mem_architecture" class="ps-modern-input" style="width: 280px; cursor: pointer; color: var(--gold); border-color: rgba(245,158,11,0.3);">
                        <option value="raw_short_long" ${mem.architecture === 'raw_short_long' ? 'selected' : ''}>Raw Text + Short-Term Summaries + Vault</option>
                        <option value="raw_long" ${mem.architecture === 'raw_long' ? 'selected' : ''}>Raw Text + Vault Directly (Skip Summaries)</option>
                    </select>
                </div>

                <!-- Sliders Container -->
                <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 10px; border: 1px solid var(--border-color); margin-bottom: 15px;">
                    <div class="mtab-param-row">
                        <span class="param-label" style="width:120px;">Working Limit</span>
                        <input type="range" id="mem_work_slider" min="${mem.chunkSize || 10}" max="300" step="${mem.chunkSize || 10}" value="${mem.workingLimit}">
                        <span id="mem_work_val" style="font-size:0.8rem; font-weight:bold; min-width:30px; text-align:right;">${mem.workingLimit}</span>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-left: 130px; margin-top: -4px; margin-bottom: 12px; line-height: 1.3;">
                        Number of recent messages kept in raw, unmodified text format in the prompt. High limits consume more active context space.
                    </div>

                    <div class="mtab-param-row" id="mem_short_slider_row" style="display:${mem.architecture === 'raw_long' ? 'none' : 'flex'};">
                        <span class="param-label" style="width:120px;">Short-Term Limit</span>
                        <input type="range" id="mem_short_slider" min="${mem.chunkSize || 10}" max="1000" step="${mem.chunkSize || 10}" value="${mem.shortTermLimit}">
                        <span id="mem_short_val" style="font-size:0.8rem; font-weight:bold; min-width:30px; text-align:right;">${mem.shortTermLimit}</span>
                    </div>
                    <div id="mem_short_desc_row" style="font-size: 0.72rem; color: var(--text-muted); margin-left: 130px; margin-top: -4px; margin-bottom: 12px; line-height: 1.3; display:${mem.architecture === 'raw_long' ? 'none' : 'block'};">
                        Range of past messages to keep summarized. Summaries are automatically created in blocks and injected chronologically.
                    </div>

                    <!-- CHUNK SIZE SLIDER -->
                    <div class="mtab-param-row">
                        <span class="param-label" style="width:120px;">Chunk Size</span>
                        <input type="range" id="mem_chunk_slider" min="10" max="40" step="10" value="${mem.chunkSize || 10}">
                        <span id="mem_chunk_val" style="font-size:0.8rem; font-weight:bold; min-width:30px; text-align:right;">${mem.chunkSize || 10}</span>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-left: 130px; margin-top: -4px; margin-bottom: 8px; line-height: 1.3;">
                        Smaller chunks = more granular summaries but more API calls. Larger chunks = fewer calls but coarser memory.
                    </div>
                    
                    <!-- NEW APPLY BUTTON -->
                    <div style="margin-top: 15px; display: flex; justify-content: flex-end; border-top: 1px dashed var(--border-color); padding-top: 15px;">
                        <button id="mem_btn_apply_limits" class="ps-modern-btn secondary" style="color: #10b981; border-color: rgba(16,185,129,0.3); font-size: 0.75rem; padding: 6px 14px;">
                            <i class="fa-solid fa-arrows-rotate"></i> Apply & Extract Pending
                        </button>
                    </div>
                </div>

                <div class="mtab-setting-row" style="border-top: 1px solid rgba(255,255,255,0.04); padding-top: 14px;">
                    <div class="set-info">
                        <div class="set-label"><i class="fa-solid fa-cat" style="color: #f43f5e; margin-right: 6px;"></i> Background Worker</div>
                        <div class="set-desc">Managed by the <b>Chomusuke</b> tab. Configure Chomusuke to offload memory chunk summarization to a dedicated worker LLM.</div>
                    </div>
                </div>
                <div class="mtab-setting-row" style="border-top: 1px solid rgba(255,255,255,0.04); padding-top: 14px;">
                    <div class="set-info">
                        <div class="set-label">Vault Scanner Engine</div>
                        <div class="set-desc">Select the retrieval engine for matching long-term memories. TF-IDF runs locally, while Semantic Embeddings use Vector Storage.</div>
                    </div>
                    <select id="mem_scanner_engine" class="ps-modern-input" style="width: 280px; cursor: pointer;">
                        <option value="tfidf" ${mem.scannerEngine === 'tfidf' ? 'selected' : ''}>TF-IDF Keyword Matcher</option>
                        <option value="semantic" ${mem.scannerEngine === 'semantic' ? 'selected' : ''}>Semantic Embeddings (ST Native API)</option>
                    </select>
                </div>
                <div class="mtab-setting-row">
                    <div class="set-info">
                        <div class="set-label">Auto-Trigger Mode</div>
                        <div class="set-desc">Trigger background memory sweeps. 'Every Reply' checks after every message, wait-pooling messages until a full chunk accumulates.</div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <select id="mem_trigger" class="ps-modern-input" style="width: 150px; cursor: pointer;">
                            <option value="manual" ${mem.triggerMode === 'manual' ? 'selected' : ''}>Manual Only</option>
                            <option value="every" ${mem.triggerMode === 'every' ? 'selected' : ''}>Every Reply</option>
                            <option value="frequency" ${mem.triggerMode === 'frequency' ? 'selected' : ''}>Every N Replies</option>
                        </select>
                        <select id="mem_freq_val" class="ps-modern-input" style="width: 80px; cursor: pointer; display: ${mem.triggerMode === 'frequency' ? 'block' : 'none'};">
                            <option value="5" ${mem.autoFreq === 5 ? 'selected' : ''}>5</option>
                            <option value="10" ${mem.autoFreq === 10 || !mem.autoFreq ? 'selected' : ''}>10</option>
                            <option value="15" ${mem.autoFreq === 15 ? 'selected' : ''}>15</option>
                            <option value="20" ${mem.autoFreq === 20 ? 'selected' : ''}>20</option>
                            <option value="30" ${mem.autoFreq === 30 ? 'selected' : ''}>30</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Short-Term Editor -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                    <div class="mtab-panel-title gold" style="margin-bottom:0;">
                        <i class="fa-solid fa-box-archive"></i> Short-Term Memory
                        <span id="mem_processing_spinner" style="display:none; margin-left: 10px;" class="mem-spinner"><i class="fa-solid fa-circle-notch"></i></span>
                        <span id="mem_processing_progress" style="display:none; margin-left: 8px; font-size: 0.72rem; color: var(--text-muted); font-weight: normal; vertical-align: middle;"></span>
                    </div>
                    <button id="mem_btn_clear_short" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);"><i class="fa-solid fa-trash-can"></i> Clear All</button>
                </div>
                
                <div id="mem_short_term_list">
                    <!-- Accordions Injected Here -->
                </div>
            </div>

            <!-- Long-Term Vault -->
            <div class="mtab-panel">
                <div class="mtab-panel-title blue" style="display:flex; justify-content:space-between;">
                    <span><i class="fa-solid fa-database"></i> Long-Term Vault (Vector Storage)</span>
                    <span id="mem_vault_count" style="font-size:0.7rem; color:var(--text-muted);">0 Entries</span>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <input type="text" id="mem_vault_search" class="ps-modern-input" placeholder="Search archived memories..." style="flex: 1; border-color: rgba(59,130,246,0.3);">
                    <button id="mem_btn_test_vector" class="ps-modern-btn secondary" style="color: #3b82f6; border-color: rgba(59,130,246,0.3);" title="See what memories the AI is retrieving right now"><i class="fa-solid fa-radar"></i> Test Scanner</button>
                    <button id="mem_btn_clear_vault" class="ps-modern-btn secondary" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" title="Delete all Vault Archives"><i class="fa-solid fa-trash-can"></i> Clear All</button>
                </div>
                <div id="mem_vault_list" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                    <!-- Vault items injected here -->
                </div>
            </div>
        </div>
    `);

    // Clear All Short-Term Memory
    $("#mem_btn_clear_short").off("click").on("click", function () {
        const mem = localProfile.memoryCore;
        if (!mem.shortTermChunks || mem.shortTermChunks.length === 0) return toastr.info("Short-Term memory is already empty.");
        
        if (confirm("Are you sure you want to delete ALL Short-Term Memory chunks? They will revert to 'Pending' status.")) {
            mem.shortTermChunks = [];
            delete mem._archivedSet; mem._tokensDirty = true;
            saveProfileToMemory();
            memRenderAccordion();
            memRenderDashboard();
            updateMemoryVisuals();
            toastr.success("Short-Term Memory cleared.");
        }
    });

    // Clear All Long-Term Vault
    $("#mem_btn_export").on("click", function () {
        const data = {
            shortTermChunks: localProfile.memoryCore.shortTermChunks || [],
            longTermVault: localProfile.memoryCore.longTermVault || []
        };
        downloadJsonFile("megumin_memory_core.json", data);
    });

    $("#mem_btn_import").on("click", () => $("#mem_file_import").click());
    $("#mem_file_import").on("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = JSON.parse(evt.target.result);
                if (!data.shortTermChunks && !data.longTermVault) {
                    toastr.error("This file isn't a Memory export.");
                    return;
                }
                if (confirm("Do you want to merge imported memories with your existing ones? (Click 'Cancel' to overwrite)")) {
                    if (data.shortTermChunks) localProfile.memoryCore.shortTermChunks = (localProfile.memoryCore.shortTermChunks || []).concat(data.shortTermChunks);
                    if (data.longTermVault) localProfile.memoryCore.longTermVault = (localProfile.memoryCore.longTermVault || []).concat(data.longTermVault);
                } else {
                    localProfile.memoryCore.shortTermChunks = data.shortTermChunks || [];
                    localProfile.memoryCore.longTermVault = data.longTermVault || [];
                }
                delete localProfile.memoryCore._archivedSet;
                localProfile.memoryCore._tokensDirty = true;
                saveProfileToMemory();
                if (typeof memRenderAccordion === "function") memRenderAccordion();
                if (typeof memRenderVault === "function") memRenderVault($("#mem_vault_search").val() || "");
                if (typeof memRenderDashboard === "function") memRenderDashboard();
                updateMemoryVisuals();
                toastr.success("Memories imported successfully!");
            } catch (err) {
                toastr.error("Failed to parse JSON file.");
            }
            $("#mem_file_import").val("");
        };
        reader.readAsText(file);
    });

    $("#mem_btn_clear_vault").off("click").on("click", async function () {
        const mem = localProfile.memoryCore;
        if (!mem.longTermVault || mem.longTermVault.length === 0) return toastr.info("Vault is already empty.");
        
        if (confirm("WARNING: Are you sure you want to permanently delete ALL Long-Term Vault archives? This cannot be undone.")) {
            
            // If Semantic Mode is active, wipe them from the actual SillyTavern Vector DB
            if (mem.scannerEngine === 'semantic') {
                const allIds = mem.longTermVault.map(v => v.id);
                await memDeleteFromVectorDB(allIds);
            }
            
            mem.longTermVault = [];
            delete mem._archivedSet; mem._tokensDirty = true;
            saveProfileToMemory();
            memRenderVault($("#mem_vault_search").val() || "");
            memRenderDashboard();
            updateMemoryVisuals();
            toastr.success("Long-Term Vault cleared.");
        }
    });

    // --- PROMPT EDITOR UI ---
    const memEditor = renderPromptEditor({
        id: "mem_prompt_editor",
        title: "Advanced: Edit Prompts",
        defaultData: DEFAULT_PROMPTS.memoryCore,
        currentData: mem.customPrompts,
        enabled: mem.customPromptsEnabled, // <-- NEW
        onToggle: (val) => { 
            mem.customPromptsEnabled = val; 
            syncPromptsGlobally('memoryCore', 'customPromptsEnabled', val);
            saveProfileToMemory(); 
        },
        fields: [
            { key: "systemPrompt", label: "System Prompt", hint: "Summarizer system prompt." },
            { key: "userPrompt", label: "User Task Prompt", hint: "Tokens: <code>{{chatHistory}}</code>, <code>{{targetLang}}</code>" },
            { key: "longTermTemplate", label: "Long-Term Memory Template", hint: "Tokens: <code>{{archiveXML}}</code>" },
            { key: "shortTermTemplate", label: "Short-Term Memory Template", hint: "Tokens: <code>{{shortXML}}</code>" }
        ],
        onSave: (val, key) => {
            if (!mem.customPrompts) mem.customPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.memoryCore));
            mem.customPrompts[key] = val;
            syncPromptsGlobally('memoryCore', 'customPrompts', mem.customPrompts);
            saveProfileDebounced();
            return mem.customPrompts;
        },
        onReset: () => {
            mem.customPrompts = null;
            syncPromptsGlobally('memoryCore', 'customPrompts', null);
            saveProfileToMemory();
        }
    });
    c.find('#mem_main_content').append(memEditor);

    // Toggle Listener
    $("#mem_enable_card").on("click", function () {
        mem.enabled = !mem.enabled;
        
        let isFirstEnable = false;
        if (mem.enabled) {
            if ((!mem.shortTermChunks || mem.shortTermChunks.length === 0) && 
                (!mem.longTermVault || mem.longTermVault.length === 0) && 
                mem.triggerMode === "frequency") {
                mem.triggerMode = "every";
                isFirstEnable = true;
            }
        }
        
        saveProfileToMemory();
        
        if (mem.enabled) {
            $(this).addClass("active").css("border-color", "var(--gold)");
            $("#mem_main_content").slideDown(200);
            $("#mem_header_badge").css({ background: 'rgba(16,185,129,0.12)', color: '#10b981', 'border-color': 'rgba(16,185,129,0.25)' }).html(`<i class="fa-solid fa-circle-check" style="font-size:0.6rem;"></i> Enabled`);
            
            if (isFirstEnable) {
                toastr.success("Memory is on. Older chat is archived after every reply.", "Megumin Suite");
                // Re-render to update the dropdowns and settings values in the UI
                setTimeout(() => renderMemoryCore(c), 200);
            } else {
                // All three, not just the dashboard. The lists are only populated at
                // the bottom of renderMemoryCore(), and that is gated on the feature
                // being enabled — so a tab opened while disabled has empty containers,
                // and switching on revealed them still empty. The vault only filled in
                // after closing and reopening the tab, which ran the gated block.
                memRenderDashboard();
                memRenderAccordion();
                memRenderVault($("#mem_vault_search").val() || "");
            }
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
            $("#mem_main_content").slideUp(200);
            $("#mem_header_badge").css({ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', 'border-color': 'var(--border-color)' }).html(`<i class="fa-solid fa-circle-xmark" style="font-size:0.6rem;"></i> Disabled`);
        }
        updateMemoryVisuals();
    });

    // Slider & Architecture Listeners
    $("#mem_architecture").on("change", function () {
        mem.architecture = $(this).val();
        if (mem.architecture === "raw_long") {
            $("#mem_short_slider_row").hide();
            $("#mem_short_desc_row").hide();
            $("#mem_dash_short_lbl").hide();
            $("#mem_bar_short, #mem_bar_short_pend").hide();
        } else {
            $("#mem_short_slider_row").css("display", "flex");
            $("#mem_short_desc_row").show();
            $("#mem_dash_short_lbl").show();
            $("#mem_bar_short, #mem_bar_short_pend").css("display", "block");
        }
        saveProfileToMemory();
        memRunVaultMigration();
        memRenderDashboard();
    });

    $("#mem_work_slider").on("input", function () {
        let val = parseInt($(this).val());
        mem.workingLimit = val;
        $("#mem_work_val").text(val);

        // Short-term is now independent, no forced minimums based on working limit
        saveProfileDebounced();
        memRenderDashboard();
    });

    $("#mem_scanner_engine").on("change", async function () {
        mem.scannerEngine = $(this).val();
        saveProfileToMemory();
        if (mem.scannerEngine === 'semantic') {
            // "Synced!" used to appear even with an empty vault, because the insert
            // reports success when handed nothing to do. That turned "there is
            // nothing indexed" into a green tick, which is the worst possible
            // reading of it — say plainly that there was nothing to index.
            const count = (mem.longTermVault || []).length;
            if (count === 0) {
                toastr.info("Semantic mode is on, but the vault is empty — nothing to index yet.", "Megumin Suite");
                return;
            }
            toastr.info("Semantic Mode active. Syncing vault to Vector Database...");
            const inserted = await memInsertToVectorDB(mem.longTermVault);
            await memUpdateSemanticQuery();
            if (inserted) toastr.success(`Vector Database Synced! (${count} archive${count === 1 ? "" : "s"})`);
            else toastr.error("Vector sync failed, see the console for the server response.");
        }
    });

    // Trigger migration ONLY on 'change' (when they let go of the mouse click) to avoid spamming calculations
    $("#mem_work_slider").on("change", function () { memRunVaultMigration(); });

    $("#mem_short_slider").on("input", function () {
        let val = parseInt($(this).val());
        mem.shortTermLimit = val;
        $("#mem_short_val").text(val);
        saveProfileDebounced();
        memRenderDashboard();
    });
    $("#mem_short_slider").on("change", function () { memRunVaultMigration(); });

    $("#mem_chunk_slider").on("input", function () {
        let val = parseInt($(this).val());
        mem.chunkSize = val;
        $("#mem_chunk_val").text(val);

        // Update step and min for dependent sliders
        $("#mem_work_slider").attr("step", val).attr("min", val);
        $("#mem_short_slider").attr("step", val).attr("min", val);

        // Snap working limit to a multiple of chunk size
        let workVal = parseInt($("#mem_work_slider").val());
        workVal = Math.max(val, Math.round(workVal / val) * val);
        mem.workingLimit = workVal;
        $("#mem_work_slider").val(workVal);
        $("#mem_work_val").text(workVal);

        // Snap short limit to a multiple of chunk size
        let shortVal = parseInt($("#mem_short_slider").val());
        shortVal = Math.max(val, Math.round(shortVal / val) * val);
        mem.shortTermLimit = shortVal;
        $("#mem_short_slider").val(shortVal);
        $("#mem_short_val").text(shortVal);

        saveProfileDebounced();
        memRenderDashboard();
    });
    $("#mem_chunk_slider").on("change", function () { memRunVaultMigration(); });

    $("#mem_trigger").on("change", function () {
        mem.triggerMode = $(this).val();
        if (mem.triggerMode === "frequency") {
            $("#mem_freq_val").show();
        } else {
            $("#mem_freq_val").hide();
        }
        saveProfileToMemory();
    });

    $("#mem_freq_val").on("change", function () {
        mem.autoFreq = parseInt($(this).val());
        saveProfileToMemory();
    });

    // Apply Limits & Auto-Extract Button
    $("#mem_btn_apply_limits").off("click").on("click", async function () {
        memSyncLimits(); // Scrub overlaps first

        // Check if there is actually anything pending to extract
        const context = typeof getContext === "function" ? getContext() : null;
        if (!context || !context.chat) return;
        let totalRealMessages = 0;
        for (let m of context.chat) { if (!m.is_system) totalRealMessages++; }

        const workingLimit = mem.workingLimit || 30;
        if (totalRealMessages > workingLimit) {
            toastr.info("Starting automatic extraction to fill new limits...");
            await memProcessPendingChunks(); // Start extraction!
        }
    });

    // Test Vector Scanner Button (Dual Engine UI)
    $("body").off("click", "#mem_btn_test_vector").on("click", "#mem_btn_test_vector", async function () {
        const context = typeof getContext === "function" ? getContext() : null;
        const mem = localProfile?.memoryCore;
        const engine = mem?.scannerEngine || 'tfidf';

        let html = `<div style="font-family: 'Inter', sans-serif; font-size: 0.85rem; color: var(--text-main); text-align: left; display: flex; flex-direction: column; gap: 10px;">`;

        if (engine === 'semantic') {
            toastr.info("Querying SillyTavern Vector Database...");
            $("#mem_btn_test_vector").prop("disabled", true);
            await memUpdateSemanticQuery(); // Force a fresh query right now
            $("#mem_btn_test_vector").prop("disabled", false);

            if (currentSemanticMatches.length === 0) {
                const vaultCount = (mem?.longTermVault || []).length;
                if (vaultCount === 0) {
                    toastr.info("Vault is empty, so semantic mode has nothing to match yet.");
                } else {
                    toastr.warning(`Vector index returned nothing for ${vaultCount} vault archives. Either the inserts never landed or the query failed, and both print to the console. Re-pick Semantic in the engine dropdown to re-run the inserts.`);
                }
            } else {
                html += `<div style="background: rgba(168,85,247,0.1); border-left: 3px solid #a855f7; padding: 10px; border-radius: 4px; margin-bottom: 5px;">
                <div style="color: #a855f7; font-weight: bold; margin-bottom: 4px;">Semantic Embeddings Engine Active</div>
                <div style="color: var(--text-muted); font-size: 0.75rem;">Using SillyTavern's Vector Storage API (LanceDB) to find the deep contextual meaning of the last 2 messages.</div>
            </div>`;
            }
        }

        // Only show TF-IDF block if Semantic failed OR TF-IDF is manually selected
        if (engine === 'tfidf' || currentSemanticMatches.length === 0) {
            const { keywords: uniqueKeywords } = memGetCachedKeywords(context.chat, 4);
            html += `<div style="background: rgba(16,185,129,0.1); border-left: 3px solid #10b981; padding: 10px; border-radius: 4px; margin-bottom: 5px;">
            <div style="color: #10b981; font-weight: bold; margin-bottom: 4px;">TF-IDF Smart Keywords (Last 2 Messages):</div>
            <div style="color: var(--text-muted); font-size: 0.75rem;">${uniqueKeywords.join(", ") || "None"}</div>
        </div>`;
        }

        const matches = memGetRelevantVaultEntries();

        if (matches.length === 0) {
            html += `<div style="padding: 10px;">No highly relevant memories found for the current context.</div>`;
        } else {
            html += `<div style="color: var(--text-muted); margin-bottom: 5px;">The following archives will be injected into the prompt:</div>`;
            matches.forEach(m => {
                const content = m.text || m.summary;
                const scoreColor = engine === 'semantic' ? '#a855f7' : '#3b82f6';
                html += `<div style="background: rgba(0,0,0,0.3); border-left: 3px solid ${scoreColor}; padding: 10px; border-radius: 4px;">
                <div style="color: ${scoreColor}; font-weight: bold; font-size: 0.75rem; margin-bottom: 2px;">[Match Score: ${m.score}] | Msg ${m.id}</div>
                <div style="color: #f59e0b; font-weight: bold; font-size: 0.7rem; margin-bottom: 6px;">Matched Triggers: ${m.matchedWords.join(", ")}</div>
                <div style="max-height: 150px; overflow-y: auto; white-space: pre-wrap; font-size: 0.8rem; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">${content}</div>
            </div>`;
            });
        }
        html += `</div>`;

        const { Popup, POPUP_TYPE } = typeof getContext === "function" ? getContext() : window;
        if (Popup) {
            const popup = new Popup(html, POPUP_TYPE.TEXT, "Vault Scanner Results", { wide: true });
            await popup.show();
        }
    });

    if (mem.enabled) {
        memRenderDashboard();
        memRenderAccordion();
        memRenderVault();
    }
}

export function memRenderDashboard() {
    const context = typeof getContext === "function" ? getContext() : null;
    const chat = context?.chat || [];
    const mem = localProfile.memoryCore;

    let totalRealMessages = 0;
    for (let m of chat) { if (!m.is_system) totalRealMessages++; }

    $("#mem_live_tokens_saved").text(`~${memCalculateTokensSaved()}`);

    const isRawLong = (mem.architecture === "raw_long");

    // 1. Calculate active Working segment size (Solid Green - Rightmost)
    const workingSize = Math.min(totalRealMessages, mem.workingLimit || 30);

    // 2. Calculate the actual number of messages currently archived in the Vault (Solid Blue - Leftmost)
    let vaultSize = 0;
    if (mem.longTermVault) {
        mem.longTermVault.forEach(c => {
            const parts = c.id.split("-");
            vaultSize += (parseInt(parts[1]) - parseInt(parts[0]) + 1);
        });
    }

    // 3. Calculate the actual number of messages currently archived in Short-Term (Solid Yellow - Middle Left)
    let shortTermSize = 0;
    if (mem.shortTermChunks && !isRawLong) {
        mem.shortTermChunks.forEach(c => {
            const parts = c.id.split("-");
            shortTermSize += (parseInt(parts[1]) - parseInt(parts[0]) + 1);
        });
    }

    // 4. Calculate Pending Raw Messages (Stripes Green - Middle Right)
    // Any message that isn't in active working raw and isn't archived yet is pending raw
    const totalArchived = vaultSize + shortTermSize;
    const pendingSize = Math.max(0, totalRealMessages - workingSize - totalArchived);

    // 5. Convert to percentages for the left-to-right bar (Oldest -> Newest)
    const maxBarScale = Math.max(totalRealMessages, 1);
    const pVault = (vaultSize / maxBarScale) * 100;
    const pShort = (shortTermSize / maxBarScale) * 100;
    const pPend = (pendingSize / maxBarScale) * 100;
    const pWork = (workingSize / maxBarScale) * 100;

    // Apply widths to elements
    $("#mem_bar_long").css("width", `${pVault}%`);
    $("#mem_bar_short").css("width", `${pShort}%`);
    $("#mem_bar_pend").css("width", `${pPend}%`);
    $("#mem_bar_work").css("width", `${pWork}%`);

    // Hide or show Short-Term bar depending on architecture setting
    if (isRawLong) {
        $("#mem_bar_short").hide();
    } else {
        $("#mem_bar_short").show();
    }

    // Update descriptive status text beneath progress bar
    const shortText = isRawLong ? "" : `Short: ${shortTermSize} | `;
    $("#mem_status_text").text(`Total: ${totalRealMessages} | Vault: ${vaultSize} | ${shortText}Pending (Raw): ${pendingSize} | Working (Raw): ${workingSize}`);
}

// Renders the editable text areas for chunks already processed — PAGINATED (20 at a time)
export const MEM_ACCORDION_PAGE_SIZE = 20;
export function memRenderAccordion() {
    const mem = localProfile.memoryCore;
    const list = $("#mem_short_term_list");
    // The Memory Core tab may not be on screen: these run from the profile loader
    // and the prune, not only from the tab itself. jQuery no-ops .empty()/.append()
    // on an empty set, so the function looked safe — but the batch renderer reaches
    // for list[0].appendChild(), and undefined has no appendChild. It only threw
    // when there was something to draw, which is why an empty vault never showed it.
    if (!list.length) return;
    list.empty();

    if (!mem.shortTermChunks || mem.shortTermChunks.length === 0) {
        list.append(`<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 10px;">No chunks generated yet. Generate chat messages to trigger background summarization.</div>`);
        return;
    }

    // Reverse array to show newest chunks at the top
    const chunks = [...mem.shortTermChunks].reverse();
    let renderedCount = 0;

    function renderAccordionBatch() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(renderedCount + MEM_ACCORDION_PAGE_SIZE, chunks.length);

        for (let idx = renderedCount; idx < end; idx++) {
            const chunk = chunks[idx];
            const dateStr = new Date(chunk.timestamp).toLocaleString();
            const acc = $(`
                <div class="mem-accordion">
                    <div class="mem-accordion-header">
                        <span><i class="fa-solid fa-layer-group" style="color:var(--gold); margin-right:6px;"></i> Messages: ${chunk.id}</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 400;"><i class="fa-regular fa-clock"></i> ${dateStr}</span>
                    </div>
                    <div class="mem-accordion-body">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <div style="font-size:0.7rem; color:var(--text-muted);">You can manually edit this state extraction before it gets pushed to the Vector DB.</div>
                            <button class="mem_short_del" data-id="${chunk.id}" style="background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 0.8rem; padding: 2px 6px;" title="Delete Chunk"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <textarea class="mem_chunk_edit" data-id="${chunk.id}">${chunk.summary}</textarea>
                    </div>
                </div>
            `);

            // Accordion Toggle
            acc.find(".mem-accordion-header").on("click", function () {
                $(this).next(".mem-accordion-body").slideToggle(150);
            });

            // Auto-save edits
            acc.find("textarea").on("input", function () {
                const id = $(this).attr("data-id");
                const newText = $(this).val();
                const target = localProfile.memoryCore.shortTermChunks.find(c => c.id === id);
                if (target) {
                    target.summary = newText;
                    mem._tokensDirty = true;
                    saveProfileDebounced();
                }
            });

            // Delete button logic
            acc.find(".mem_short_del").on("click", function () {
                if (confirm(`Delete short-term memory chunk [Messages: ${chunk.id}]? It will be permanently removed.`)) {
                    const id = $(this).attr("data-id");
                    localProfile.memoryCore.shortTermChunks = localProfile.memoryCore.shortTermChunks.filter(c => c.id !== id);
                    mem._tokensDirty = true; delete mem._archivedSet;
                    saveProfileToMemory();
                    memRenderAccordion();
                    memRenderDashboard();
                    updateMemoryVisuals();
                }
            });

            fragment.appendChild(acc[0]);
        }

        // Remove old "Load More" button if present
        list.find(".mem-accordion-load-more").remove();
        list[0].appendChild(fragment);
        renderedCount = end;

        // Add "Load More" button if there are more entries
        if (renderedCount < chunks.length) {
            const remaining = chunks.length - renderedCount;
            const loadMoreBtn = $(`<button class="mem-accordion-load-more ps-modern-btn secondary" style="width: 100%; padding: 8px; margin-top: 6px; font-size: 0.75rem; color: #f59e0b; border-color: rgba(245,158,11,0.3);"><i class="fa-solid fa-chevron-down"></i> Load More (${remaining} remaining)</button>`);
            loadMoreBtn.on("click", function () { renderAccordionBatch(); });
            list.append(loadMoreBtn);
        }
    }

    renderAccordionBatch();
}

// Renders the Long-Term Vault UI with Search Filtering — PAGINATED (20 at a time)
export const MEM_VAULT_PAGE_SIZE = 20;
// Vault search used a raw substring match, which meant pasting a line back out of
// the vault often failed to find it: model output is full of typographic
// characters ("…", curly quotes, en/em dashes) and copying across a soft wrap
// picks up a newline where the stored text has a space. None of that is a
// difference the reader intended to type, so fold it away on both sides.
function memNormalizeForSearch(s) {
    return String(s)
        .toLowerCase()
        .replace(/…/g, "...")            // … → ...
        .replace(/[‘’‛]/g, "'") // curly single quotes
        .replace(/[“”]/g, '"')       // curly double quotes
        .replace(/[‐-―]/g, "-")      // hyphens, en/em dashes
        .replace(/\s+/g, " ")                  // newlines/tabs/runs → one space
        .trim();
}

export function memRenderVault(searchFilter = "") {
    const mem = localProfile.memoryCore;
    const list = $("#mem_vault_list");
    // The Memory Core tab may not be on screen: these run from the profile loader
    // and the prune, not only from the tab itself. jQuery no-ops .empty()/.append()
    // on an empty set, so the function looked safe — but the batch renderer reaches
    // for list[0].appendChild(), and undefined has no appendChild. It only threw
    // when there was something to draw, which is why an empty vault never showed it.
    if (!list.length) return;
    list.empty();

    if (!mem.longTermVault) mem.longTermVault = [];
    $("#mem_vault_count").text(`${mem.longTermVault.length} Entries`);

    if (mem.longTermVault.length === 0) {
        const passMsg = (mem.workingLimit || 30) + (mem.shortTermLimit || 70);
        list.append(`<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 10px;">Vault is empty. Chunks automatically migrate here once they pass message ${passMsg}.</div>`);
        return;
    }

    // Filter using .text (fallback to .summary just in case you have old saves)
    const needle = memNormalizeForSearch(searchFilter);
    const filtered = mem.longTermVault.filter(c => {
        const content = c.text || c.summary || "";
        return memNormalizeForSearch(content).includes(needle);
    }).reverse();

    let renderedCount = 0;

    function renderVaultBatch() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(renderedCount + MEM_VAULT_PAGE_SIZE, filtered.length);

        for (let idx = renderedCount; idx < end; idx++) {
            const chunk = filtered[idx];
            const dateStr = new Date(chunk.timestamp).toLocaleDateString();
            const content = chunk.text || chunk.summary || "";

            const row = $(`
                <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; position: relative;">
                    <div style="font-size: 0.65rem; color: #3b82f6; font-weight: 700; margin-bottom: 4px; display: flex; justify-content: space-between;">
                        <span>ARCHIVE #${chunk.id}</span>
                        <span>${dateStr}</span>
                    </div>
                    <textarea class="ps-modern-input mem_vault_edit" data-id="${chunk.id}" style="height: 120px; resize: vertical; font-size: 0.75rem; border: none; background: transparent; padding: 0;">${content}</textarea>
                    <button class="mem_vault_del" data-id="${chunk.id}" style="position: absolute; bottom: 8px; right: 10px; background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 0.8rem;" title="Delete Archive"><i class="fa-solid fa-trash"></i></button>
                </div>
            `);

            // Auto-save edits to .text
            row.find(".mem_vault_edit").on("change", function () {
                const id = $(this).attr("data-id");
                const target = localProfile.memoryCore.longTermVault.find(c => c.id === id);
                if (target) {
                    target.text = $(this).val();
                    mem._tokensDirty = true; delete mem._archivedSet;
                    saveProfileToMemory();
                    if (localProfile.memoryCore.scannerEngine === 'semantic') memInsertToVectorDB([target]);
                }
            });

            // Delete button
            row.find(".mem_vault_del").on("click", function () {
                if (confirm("Permanently delete this archived memory?")) {
                    const id = $(this).attr("data-id");
                    localProfile.memoryCore.longTermVault = localProfile.memoryCore.longTermVault.filter(c => c.id !== id);
                    if (localProfile.memoryCore.scannerEngine === 'semantic') memDeleteFromVectorDB([id]);
                    mem._tokensDirty = true; delete mem._archivedSet;
                    saveProfileToMemory();
                    memRenderVault($("#mem_vault_search").val());
                    memRenderDashboard();
                }
            });

            fragment.appendChild(row[0]);
        }

        // Remove old "Load More" button if present
        list.find(".mem-vault-load-more").remove();
        list[0].appendChild(fragment);
        renderedCount = end;

        // Add "Load More" button if there are more entries
        if (renderedCount < filtered.length) {
            const remaining = filtered.length - renderedCount;
            const loadMoreBtn = $(`<button class="mem-vault-load-more ps-modern-btn secondary" style="width: 100%; padding: 8px; margin-top: 6px; font-size: 0.75rem; color: #3b82f6; border-color: rgba(59,130,246,0.3);"><i class="fa-solid fa-chevron-down"></i> Load More (${remaining} remaining)</button>`);
            loadMoreBtn.on("click", function () { renderVaultBatch(); });
            list.append(loadMoreBtn);
        }
    }

    renderVaultBatch();
}

// Live Search Listener
$("body").off("input", "#mem_vault_search").on("input", "#mem_vault_search", function () {
    memRenderVault($(this).val());
});

// --- MEMORY GENERATION LOGIC ---

export async function memProcessPendingChunks(isAuto = false) {
    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.chat || !localProfile.memoryCore.enabled) return;

    const chat = context.chat;
    const mem = localProfile.memoryCore;

    // This run awaits one LLM call per chunk and can span minutes. `mem` is a live
    // reference into localProfile, so a chat switch mid-run leaves it pointing at the
    // previous chat's data while the summaries come from whatever is on screen now.
    // Stamp who the run belongs to and re-check before every write. The object compare
    // also catches a reload of the SAME chat, which swaps localProfile for a fresh
    // object under an unchanged key. A fresh run started afterwards works normally.
    const runIdentity = meguminActiveDataIdentity();
    const runIdentityLost = () => meguminActiveDataIdentity() !== runIdentity || localProfile?.memoryCore !== mem;

    const workingLimit = mem.workingLimit || 30;
    const shortTermLimit = mem.shortTermLimit || 70;

    // 1. Get a clean array of [Index, Message Object]
    const realMessages = [];
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].is_system) realMessages.push({ originalIndex: i, msg: chat[i] });
    }

    if (realMessages.length <= workingLimit) {
        if (!isAuto) toastr.info("Not enough messages past the working limit to archive.");
        return;
    }

    // 2. Grab EVERYTHING outside of the Working Memory
    const archivableMessages = realMessages.slice(0, realMessages.length - workingLimit);

    // Identify the cutoff point where messages go straight to the Vault
    const effectiveShortTermLimit = mem.architecture === "raw_long" ? workingLimit : (workingLimit + shortTermLimit);
    const vaultCutoffLimit = Math.max(0, realMessages.length - effectiveShortTermLimit);
    let vaultCutoffMessageIndex = -1;
    if (vaultCutoffLimit > 0 && realMessages[vaultCutoffLimit]) {
        vaultCutoffMessageIndex = realMessages[vaultCutoffLimit].originalIndex;
    }

    // 3. Group into chunks of chunkSize and find what is missing
    const chunkSize = mem.chunkSize || 10;
    const chunksToProcess = [];

    // Filter archivable messages to only those not already archived (automatically handles gaps)
    const unarchivedArchivable = archivableMessages.filter(item => !isMessageArchived(item.originalIndex, mem));

    for (let i = 0; i < unarchivedArchivable.length; i += chunkSize) {
        const chunk = unarchivedArchivable.slice(i, i + chunkSize);
        if (chunk.length < chunkSize) continue; // SMART CHUNKING: Wait until a complete chunk accumulates

        const startId = chunk[0].originalIndex;
        const endId = chunk[chunk.length - 1].originalIndex;
        const chunkId = `${startId}-${endId}`;

        let rawText = "";
        chunk.forEach(item => {
            rawText += `${item.msg.name}: ${meguminCleanChatHistoryText(item.msg.mes)}\n\n`;
        });
        chunksToProcess.push({ id: chunkId, text: rawText.trim(), endId: endId });
    }

    if (chunksToProcess.length === 0) {
        memRunVaultMigration();
        if (!isAuto) toastr.info("All archives are up to date.");
        return;
    }

    // 4. Process the missing chunks — BATCHED with UI yields
    $("#mem_processing_spinner").show();
    $("#mem_processing_progress").show().text(`Preparing...`);
    $("#mem_btn_generate").prop("disabled", true).css("opacity", "0.5");

    let changesMade = false;
    const newlyAddedBypassedVaultChunks = [];
    let bypassedCount = 0;
    let emptySummaries = 0;

    try {
        const totalChunks = chunksToProcess.length;
        const BATCH_SIZE = 5;
        const SAVE_INTERVAL = 10;
        let chunksSinceLastSave = 0;

        for (let idx = 0; idx < totalChunks; idx++) {
            if (runIdentityLost()) {
                console.debug(`[Megumin-Suite] memProcessPendingChunks stopped at chunk ${idx + 1}/${totalChunks}: the profile this run started on ("${runIdentity}") is no longer the active one ("${meguminActiveDataIdentity()}"). Nothing was saved; run the archive again on the chat you want.`);
                return;
            }

            const chunkData = chunksToProcess[idx];

            // Update progress text
            const percent = Math.round((idx / totalChunks) * 100);
            $("#mem_processing_progress").text(`Processing ${idx + 1}/${totalChunks} (${percent}%)`);

            // --- DIRECT-TO-VAULT BYPASS ---
            // If this chunk is older than the Short-Term limit, skip the AI entirely!
            if (vaultCutoffMessageIndex !== -1 && chunkData.endId < vaultCutoffMessageIndex) {
                if (!mem.longTermVault) mem.longTermVault = [];
                const newVaultChunk = {
                    id: chunkData.id,
                    text: chunkData.text, // Store the raw text directly!
                    timestamp: Date.now()
                };
                mem.longTermVault.push(newVaultChunk);
                newlyAddedBypassedVaultChunks.push(newVaultChunk);
                changesMade = true;
                bypassedCount++;
                chunksSinceLastSave++;

                // Yield to UI every BATCH_SIZE chunks to prevent freezing
                if (bypassedCount % BATCH_SIZE === 0) {
                    await new Promise(r => setTimeout(r, 0));
                }

                continue; // Skip the rest of the loop
            }

            // --- NORMAL SHORT-TERM AI SUMMARIZATION ---
            toastr.info(`Extracting State: Messages ${chunkData.id} (${idx + 1}/${totalChunks})...`);

            let summaryResult = "";

            // Marker set inside the job: Chomusuke runs are queued, and a marker
            // set while waiting would hijack the generation running ahead of it.
            summaryResult = await runWithChomusuke("memory", async () => {
                setActiveMemorySummarizationRequest(chunkData.text);
                return await generateQuietPrompt({ prompt: "___PS_MEMORY_SUMMARIZE___" });
            });

            if (typeof summaryResult !== "string") {
                throw new Error(`Summarization returned no text for chunk ${chunkData.id}. SillyTavern is most likely not connected to an API - check the connection status, then run the archive again.`);
            }
            summaryResult = summaryResult.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

            if (summaryResult) {
                if (!mem.shortTermChunks) mem.shortTermChunks = [];
                mem.shortTermChunks.push({
                    id: chunkData.id,
                    summary: summaryResult,
                    timestamp: Date.now()
                });
                changesMade = true;
                chunksSinceLastSave++;
            } else {
                emptySummaries++;
            }
        }

        // Once for the run, not per chunk. Those messages stay in the chat as they are.
        if (emptySummaries > 0) warnChomusuke("empty", ["memory"]);

        // Show single summary toast for vault bypass instead of per-chunk spam
        if (bypassedCount > 0) {
            toastr.info(`Archived ${bypassedCount} chunk(s) directly to Vault (bypassed AI).`);
        }

        if (changesMade) {
            // The last chunk's await can still have crossed a chat switch after the
            // loop's own check, so the final save is guarded too.
            if (runIdentityLost()) {
                console.debug(`[Megumin-Suite] memProcessPendingChunks declined its final save: the run belonged to "${runIdentity}" but "${meguminActiveDataIdentity()}" is active now. The finished summaries were dropped rather than written into the wrong chat.`);
                return;
            }

            // Invalidate caches
            delete mem._archivedSet;
            mem._tokensDirty = true;

            // Sort shortTermChunks chronologically by start ID
            if (mem.shortTermChunks) {
                mem.shortTermChunks.sort((a, b) => {
                    const aStart = (a && typeof a.id === 'string') ? parseInt(a.id.split("-")[0], 10) : NaN;
                    const bStart = (b && typeof b.id === 'string') ? parseInt(b.id.split("-")[0], 10) : NaN;
                    return (Number.isFinite(aStart) ? aStart : 0) - (Number.isFinite(bStart) ? bStart : 0);
                });
            }

            // Sort longTermVault chronologically by start ID
            if (mem.longTermVault) {
                mem.longTermVault.sort((a, b) => {
                    const aStart = (a && typeof a.id === 'string') ? parseInt(a.id.split("-")[0], 10) : NaN;
                    const bStart = (b && typeof b.id === 'string') ? parseInt(b.id.split("-")[0], 10) : NaN;
                    return (Number.isFinite(aStart) ? aStart : 0) - (Number.isFinite(bStart) ? bStart : 0);
                });
            }

            saveProfileToMemory();

            // Batch insert bypassed vault chunks to Vector DB if semantic engine is active
            if (newlyAddedBypassedVaultChunks.length > 0 && mem.scannerEngine === 'semantic') {
                toastr.info("Syncing new Vault archives to Vector Database...");
                await memInsertToVectorDB(newlyAddedBypassedVaultChunks, runIdentity);
            }

            memRunVaultMigration();
            memRenderAccordion();
            memRenderVault($("#mem_vault_search").val() || "");
            memRenderDashboard();
            updateMemoryVisuals();
        }

        toastr.success("Archive Extraction Complete!");

    } catch (err) {
        console.error("Memory Extraction Error:", err);
        // Fix 4 removed the in-loop saves and the end-of-run save is unreachable from
        // here, so without this every chunk finished before the failure is lost.
        if (changesMade && runIdentityLost()) {
            console.debug(`[Megumin-Suite] memProcessPendingChunks declined its error-path save: the run belonged to "${runIdentity}" but "${meguminActiveDataIdentity()}" is active now. The partial results were dropped rather than written into the wrong chat.`);
        } else if (changesMade) {
            delete mem._archivedSet;
            mem._tokensDirty = true;
            saveProfileToMemory();
        }
        toastr.error("Failed to generate memory summaries.");
    } finally {
        setActiveMemorySummarizationRequest(null);
        $("#mem_processing_spinner").hide();
        $("#mem_processing_progress").hide().text("");
        $("#mem_btn_generate").prop("disabled", false).css("opacity", "1");
    }
}

// Standalone helper to push old chunks into the Vault (AS RAW TEXT) — OPTIMIZED
export function memRunVaultMigration() {
    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.chat || !localProfile.memoryCore.enabled) return;

    // Called at the tail of runs that can span a chat switch, and it moves chunks between
    // short-term and the vault before saving. If the profile in memory no longer belongs
    // to the active chat, that reshuffle is being computed against the wrong chat's
    // message list. The identity is also handed to the vector insert below, which is
    // async and can outlive this function.
    const runIdentity = meguminActiveDataIdentity();
    if (_loadedProfileKey && (getCharacterKey() || "default") !== _loadedProfileKey) {
        console.debug(`[Megumin-Suite] memRunVaultMigration declined: the profile in memory belongs to "${_loadedProfileKey}" but the active chat is now "${getCharacterKey() || "default"}". No chunks were migrated.`);
        return;
    }

    const chat = context.chat;
    const mem = localProfile.memoryCore;
    const effectiveShortTermLimit = mem.architecture === "raw_long" ? (mem.workingLimit || 30) : ((mem.workingLimit || 30) + (mem.shortTermLimit || 70));

    const realMessages = [];
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].is_system) realMessages.push({ originalIndex: i, msg: chat[i] });
    }

    const cutoffLimit = Math.max(0, realMessages.length - effectiveShortTermLimit);
    let cutoffMessageIndex = -1;

    if (cutoffLimit > 0 && realMessages[cutoffLimit]) {
        cutoffMessageIndex = realMessages[cutoffLimit].originalIndex;
    }

    if (cutoffMessageIndex !== -1 && mem.shortTermChunks && mem.shortTermChunks.length > 0) {
        let migrated = false;
        const newVaultChunksForDB = []; // Batch vector DB inserts

        for (let i = mem.shortTermChunks.length - 1; i >= 0; i--) {
            const chunk = mem.shortTermChunks[i];
            const endMsgId = parseInt(chunk.id.split("-")[1]);

            // If the chunk is older than the Short-Term cutoff, migrate it as RAW TEXT!
            if (endMsgId < cutoffMessageIndex) {
                if (!mem.longTermVault) mem.longTermVault = [];

                // --- RECONSTRUCT RAW TEXT ---
                const parts = chunk.id.split("-");
                const startId = parseInt(parts[0]);
                const stopId = parseInt(parts[1]);
                let rawText = "";

                for (let j = startId; j <= stopId; j++) {
                    if (j >= 0 && j < chat.length && chat[j] && !chat[j].is_system) {
                        rawText += `${chat[j].name}: ${meguminCleanChatHistoryText(chat[j].mes)}\n\n`;
                    }
                }

                // If reconstruction failed (e.g. messages were deleted), use the summary as fallback
                if (!rawText.trim() && chunk.summary) {
                    rawText = chunk.summary;
                }

                // Push raw text instead of summary
                const newVaultChunk = {
                    id: chunk.id,
                    text: rawText.trim(), // Use 'text' key for raw data
                    timestamp: Date.now()
                };
                mem.longTermVault.push(newVaultChunk);
                newVaultChunksForDB.push(newVaultChunk);

                mem.shortTermChunks.splice(i, 1);
                migrated = true;
            }
        }
        if (migrated) {
            // Invalidate caches
            delete mem._archivedSet;
            mem._tokensDirty = true;

            // Batch vector DB insert instead of one-per-chunk
            if (newVaultChunksForDB.length > 0 && mem.scannerEngine === 'semantic') {
                memInsertToVectorDB(newVaultChunksForDB, runIdentity);
            }

            saveProfileToMemory();
            memRenderAccordion();
            memRenderVault($("#mem_vault_search").val() || "");
            memRenderDashboard();
        }
    }
}

// -------------------------------------------------------------
// STAGE 9 HELPER FUNCTIONS: MEMORY INTERCEPT & VISUALS
// -------------------------------------------------------------

// Checks if a message index is safely stored in either Short-Term or Long-Term memory
export function isMessageArchived(mesId, mem) {
    if (!mem) return false;

    // Lazy load the cached Set of archived message IDs for O(1) lookups
    if (!(mem._archivedSet instanceof Set)) {
        mem._archivedSet = new Set();
        const addChunk = (c) => {
            // SAFETY CHECK: Ensure the chunk and ID exist before splitting
            if (!c || !c.id || typeof c.id !== 'string') return;
            
            const parts = c.id.split("-");
            const start = parseInt(parts[0]);
            const end = parseInt(parts[1]);
            
            if (isNaN(start) || isNaN(end)) return;
            
            for (let i = start; i <= end; i++) {
                mem._archivedSet.add(i);
            }
        };
        if (mem.shortTermChunks) mem.shortTermChunks.forEach(addChunk);
        if (mem.longTermVault) mem.longTermVault.forEach(addChunk);
    }

    return mem._archivedSet.has(mesId);
}

// Deletes archives that overlap the working window, returning those messages to
// the raw chat. Split out of memSyncLimits() so the automatic path (a rewind) can
// do the scrub WITHOUT also running memRunVaultMigration() — that pushes chunks
// into the vector DB, and firing it on every profile load would mean vector
// writes on every chat switch.
//
// Returns true when it removed anything, so the caller knows to save.
export function memScrubOverlappingArchives({ notify = false } = {}) {
    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.chat || !localProfile.memoryCore) return false;

    const chat = context.chat;
    const mem = localProfile.memoryCore;

    let realMessages = [];
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].is_system) realMessages.push(i);
    }

    // Find the cutoff index for Working Memory
    const workingCutoffIndex = realMessages.length <= mem.workingLimit
        ? 0
        : realMessages[realMessages.length - mem.workingLimit];

    // Find the cutoff index for Short-Term Memory
    const effectiveShortLimit = (mem.workingLimit || 30) + (mem.shortTermLimit || 70);
    const shortCutoffIndex = realMessages.length <= effectiveShortLimit
        ? 0
        : realMessages[realMessages.length - effectiveShortLimit];

    let changesMade = false;
    let removedCount = 0;

    // 1. Scrub Short-Term Chunks
    if (mem.shortTermChunks) {
        for (let i = mem.shortTermChunks.length - 1; i >= 0; i--) {
            const chunk = mem.shortTermChunks[i];
            const endId = parseInt(chunk.id.split("-")[1]);
            // If the chunk overlaps the Working Limit, delete the archive!
            if (endId >= workingCutoffIndex) {
                mem.shortTermChunks.splice(i, 1);
                changesMade = true;
                removedCount++;
            }
        }
    }

    // 2. Scrub Long-Term Vault
    //
    // Vault chunks also live in the vector store, so removing one here without
    // removing its embedding leaves the two out of step. That matters more than
    // it looks: chunk ids are derived from the message range ("170-179"), so a
    // later migration over the same range re-uses the id and the store keeps
    // serving the OLD text under it. Semantic search then matches stale content
    // and cannot find the live text, while TF-IDF — which reads this array
    // directly — still can.
    const removedVaultIds = [];
    if (mem.longTermVault) {
        for (let i = mem.longTermVault.length - 1; i >= 0; i--) {
            const chunk = mem.longTermVault[i];
            const endId = parseInt(chunk.id.split("-")[1]);

            // If it overlaps Working Memory, delete it!
            if (endId >= workingCutoffIndex) {
                removedVaultIds.push(chunk.id);
                mem.longTermVault.splice(i, 1);
                changesMade = true;
                removedCount++;
            }
            // If it overlaps Short-Term Memory (and we are using summaries), delete it to force a re-summary!
            else if (mem.architecture === "raw_short_long" && endId >= shortCutoffIndex) {
                removedVaultIds.push(chunk.id);
                mem.longTermVault.splice(i, 1);
                changesMade = true;
                removedCount++;
            }
        }
    }

    // Take the embeddings out with them. Not awaited: the caller is synchronous
    // and the scrub's own result does not depend on the round-trip. Deleting is
    // unconditional rather than gated on the current scanner engine — entries
    // written while semantic was on outlive a switch back to TF-IDF, and those
    // are exactly the orphans that resurface if the engine is switched again.
    if (removedVaultIds.length > 0) {
        Promise.resolve(memDeleteFromVectorDB(removedVaultIds)).catch(e =>
            console.error("[Megumin Suite] Vector cleanup after rebalance failed:", e));
    }

    if (changesMade) {
        delete mem._archivedSet;
        mem._tokensDirty = true;
        if (notify) {
            toastr.info(
                `${removedCount} archived block${removedCount === 1 ? "" : "s"} returned to the chat.`,
                "Megumin Suite — working set rebalanced"
            );
        }
    }
    return changesMade;
}

// Scrubs the memory arrays and pulls overlapping chunks back into active chat
export function memSyncLimits() {
    const changesMade = memScrubOverlappingArchives();

    if (changesMade) {
        saveProfileToMemory();
        toastr.success("Limits Applied! Overlapping archives returned to chat.");
    } else {
        toastr.info("Limits Applied. No overlaps found.");
    }

    memRunVaultMigration(); // Push any remaining items down
    memRenderAccordion();
    memRenderVault($("#mem_vault_search").val() || "");
    memRenderDashboard();
    updateMemoryVisuals(); // Remove the gray styling from the restored messages
}

export let _vaultRetrievalCache = { key: "", result: [] };

// Calculates estimated tokens saved by the memory system (CACHED)
export function memCalculateTokensSaved() {
    const context = typeof getContext === "function" ? getContext() : null;
    const mem = localProfile?.memoryCore;
    if (!context || !context.chat || !mem || !mem.enabled) return 0;

    // Return cached value if not dirty
    if (mem._cachedTokensSaved !== undefined && !mem._tokensDirty) {
        return mem._cachedTokensSaved;
    }

    let strippedChars = 0;
    for (let i = 0; i < context.chat.length; i++) {
        if (!context.chat[i].is_system && isMessageArchived(i, mem)) {
            strippedChars += context.chat[i].mes.length;
        }
    }

    let injectedChars = 0;
    if (mem.architecture === "raw_short_long" && mem.shortTermChunks) {
        mem.shortTermChunks.forEach(c => injectedChars += (c.summary || "").length);
    }

    // Assume top 3 vault entries injected
    const retrieved = memGetRelevantVaultEntries();
    retrieved.forEach(m => injectedChars += (m.text || m.summary || "").length);

    // Standard approximation: 4 characters = 1 token
    const savedTokens = Math.max(0, Math.ceil((strippedChars - injectedChars) / 4));
    mem._cachedTokensSaved = savedTokens;
    mem._tokensDirty = false;
    return savedTokens;
}

// Dual-Engine Scorer: TF-IDF or Semantic Embeddings
// OPTIMIZED: Pre-computes IDF in a single pass (O(K×V) instead of O(K×V²))
// Remembers why we last fell back, so the warning below fires on a change of
// state rather than on every prompt build.
let _lastSemanticFallbackReason = null;

export function memGetRelevantVaultEntries() {
    const context = typeof getContext === "function" ? getContext() : null;
    const mem = localProfile?.memoryCore;

    if (!context || !context.chat || !mem || !mem.longTermVault || mem.longTermVault.length === 0) return [];

    const vault = mem.longTermVault;
    const engine = mem.scannerEngine || 'tfidf';

    // --- ENGINE 1: SEMANTIC EMBEDDINGS (ST API) ---
    if (engine === 'semantic') {
        if (currentSemanticMatches.length > 0) return currentSemanticMatches;
        // Falling through to TF-IDF keeps retrieval working when the vector store is
        // slow, empty, purged or unreachable — but it used to do so in complete
        // silence, so a broken index was indistinguishable from a working one and
        // simply looked like semantic search being bad at its job. Say it out loud.
        // Once per distinct reason, because this runs on every prompt build.
        const why = (!mem.longTermVault || mem.longTermVault.length === 0)
            ? "the vault is empty"
            : "the vector store returned no matches (it may be empty, still indexing, or unreachable)";
        if (_lastSemanticFallbackReason !== why) {
            _lastSemanticFallbackReason = why;
            console.warn(`[Megumin Suite] Semantic search is selected but ${why}. Falling back to keyword (TF-IDF) matching. Re-index from Memory Core → Scanner Engine if this is unexpected.`);
        }
    } else {
        _lastSemanticFallbackReason = null;
    }

    // --- ENGINE 2: TF-IDF MULTILINGUAL (Keywords / Fallback) ---
    // Use cached keywords to avoid redundant cleaning + tokenization
    const { keywords: uniqueKeywords, hash: kwHash } = memGetCachedKeywords(context.chat, 2);
    const totalDocs = vault.length;
    if (uniqueKeywords.length === 0) return [];

    const cacheKey = kwHash + "#" + vault.length + "#" + (vault[vault.length - 1]?.timestamp || 0);
    if (_vaultRetrievalCache.key === cacheKey) return _vaultRetrievalCache.result;

    // Pre-lowercase all vault texts ONCE (avoids thousands of redundant .toLowerCase() calls)
    const vaultTexts = vault.map(v => (v.text || v.summary || "").toLowerCase());

    // Pre-compute document frequency for each keyword in ONE pass over the vault
    const dfMap = new Map();
    for (const kw of uniqueKeywords) {
        let count = 0;
        for (let i = 0; i < vaultTexts.length; i++) {
            if (vaultTexts[i].includes(kw)) count++;
        }
        // Only keep keywords appearing in < 50% of docs (same filtering as before)
        if (count > 0 && count < totalDocs * 0.5) {
            dfMap.set(kw, Math.round(50 / count));
        }
    }

    if (dfMap.size === 0) {
        _vaultRetrievalCache = { key: cacheKey, result: [] };
        return [];
    }

    // Score each vault entry using the pre-computed weights — no inner vault scan!
    let scoredVault = vault.map((v, idx) => {
        let score = 0;
        let matchedWords = [];
        const vText = vaultTexts[idx];
        for (const [kw, weight] of dfMap) {
            if (vText.includes(kw)) {
                score += weight;
                matchedWords.push(`${kw} (+${weight})`);
            }
        }
        return { ...v, score, matchedWords };
    });

    const result = scoredVault.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    _vaultRetrievalCache = { key: cacheKey, result };
    return result;
}

// Rule B: Visual Fading Update (STRICT) — DEBOUNCED + RANGE-BASED CSS
export let _memVisualsTimer = null;
export function updateMemoryVisuals() {
    if (_memVisualsTimer) clearTimeout(_memVisualsTimer);
    _memVisualsTimer = setTimeout(_updateMemoryVisualsCore, 150);
}
export function _updateMemoryVisualsCore() {
    _memVisualsTimer = null;
    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.chat || !context.chat.length) return;

    const mem = localProfile?.memoryCore;

    // Remove old injected style
    $("#megumin-archived-style").remove();

    if (!mem?.enabled) {
        return;
    }

    // Build the archived set once (uses cached Set from isMessageArchived)
    if (!mem._archivedSet) {
        // Force rebuild
        isMessageArchived(0, mem);
    }
    const archivedSet = mem._archivedSet;

    if (archivedSet && archivedSet.size > 0) {
        // Collect visible mesids that are archived — only scan what's in the DOM
        const selectors = [];
        $(".mes").each(function () {
            const mesId = parseInt(this.getAttribute("mesid"));
            if (!isNaN(mesId) && archivedSet.has(mesId)) {
                selectors.push(`.mes[mesid="${mesId}"] .mes_text`);
            }
        });

        if (selectors.length > 0) {
            // Inject a single <style> block instead of toggling classes on each element
            const css = selectors.join(",") + `{ opacity: 0.35; filter: saturate(0.3); transition: opacity 0.2s ease; }`;
            $("head").append(`<style id="megumin-archived-style">${css}</style>`);
        }
    }

    // Use cached token count
    $("#mem_live_tokens_saved").text(`~${memCalculateTokensSaved()}`);
}

// The array the interceptor is handed is NOT context.chat.
//
// SillyTavern builds `coreChat = chat.filter(x => !x.is_system)` before calling
// generation interceptors, so what arrives here is compacted: position 0 is the
// first NON-system message, not chat[0]. Archive ids ("170-179") are raw
// context.chat indices, so the two only line up while the chat contains no
// system messages at all — which is the normal case, and why this went unnoticed.
//
// /hide sets is_system. One hidden message shifts every later position down by
// one, so recent working messages slide into old archived ranges and get wiped:
// the model receives the vault and short-term summaries and none of the live
// scene. That is not a disagreement between two extensions about what to hide,
// which is what it looked like — it is this array being read in the wrong index
// space.
//
// Rebuilding the same filter over context.chat recovers the mapping. If the two
// do not agree on length the assumption behind it no longer holds (ST changed
// what it passes, or something mutated the chat mid-generation), and positional
// indexing is used unchanged — the behaviour every existing chat already has.
function memRealIndexMap(chat, context) {
    if (!context || !Array.isArray(context.chat)) return null;
    const map = [];
    for (let i = 0; i < context.chat.length; i++) {
        if (!context.chat[i].is_system) map.push(i);
    }
    return map.length === chat.length ? map : null;
}

// Rule A: The Prompt Interceptor (STRICT)
window.megumin_memory_intercept = function (chat, _contextSize, _abort, type) {
    if (!suiteEnabled()) return;
    const mem = localProfile?.memoryCore;
    if (!mem?.enabled) return;

    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.symbols || !context.symbols.ignore) return;

    const IGNORE_SYMBOL = context.symbols.ignore;
    const realIndex = memRealIndexMap(chat, context);

    for (let i = 0; i < chat.length; i++) {
        // Kept even though ST has already filtered these out: the guard costs
        // nothing and this function must stay correct if it is ever handed the
        // unfiltered array.
        if (chat[i].is_system) continue;

        // ONLY wipe the message from the prompt if it has been successfully summarized
        if (isMessageArchived(realIndex ? realIndex[i] : i, mem)) {
            // SAFE CLONE: Spread operator avoids DataCloneErrors from other extensions
            chat[i] = { ...chat[i] };
            chat[i].extra = { ...chat[i].extra };
            
            chat[i].extra[IGNORE_SYMBOL] = true;
            chat[i].mes = ""; // Bulletproof wipe
        }
    }
};

// ────────────────────────────────────────────────────────────────────────────
// Wiring into the rest of the extension.
//
// These used to sit in index.js as temporary scaffolding while the feature was
// still there. They belong with the feature: it is this module that knows which
// of its own functions answer which hook.
// ────────────────────────────────────────────────────────────────────────────

// The vector-collection half of the data identity core/keys.js reports.
// Registered rather than imported because keys.js sits below this module.
setCollectionIdProvider(memGetCollectionId);

registerRefreshHook(REFRESH.MEMORY_VISUALS, () => updateMemoryVisuals());
registerRefreshHook(REFRESH.MEMORY_DASHBOARD, () => memRenderDashboard());
registerRefreshHook(REFRESH.MEMORY_ACCORDION, () => memRenderAccordion());
registerRefreshHook(REFRESH.MEMORY_VAULT, (filter) => memRenderVault(filter || ""));
registerRefreshHook(REFRESH.MEMORY_CACHE_INVALIDATE, () => { _vaultRetrievalCache.key = ""; });
registerRefreshHook(REFRESH.MEMORY_SCRUB_OVERLAPS, () => {
    // Only when the Memory Core is on: with it off its archives are inert, and
    // deleting them would throw away work the user may still switch back on.
    const m = localProfile?.memoryCore;
    if (!m?.enabled) return false;
    return memScrubOverlappingArchives({ notify: true });
});
