// ────────────────────────────────────────────────────────────────────────────
// The NPC Bank tab and the NPC list.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, generateQuietPrompt, Popup, POPUP_TYPE } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../core/profile.js";
import { syncPromptsGlobally } from "../../core/sync.js";
import { registerRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { setActiveNpcScanRequest, setActiveNpcUpdateRequest } from "../../core/activeRequests.js";
import { DEFAULT_PROMPTS } from "../../prompts/index.js";
import { renderPromptEditor } from "../../ui/promptEditor.js";
import { downloadJsonFile } from "../../utils/download.js";
import { getChatForNpcScan } from "../../engine/chatText.js";
import { runWithChomusuke } from "../../engine/tasks.js";
import { npcBuildTextFromData, npcParseBlock, meguminFindNpcDossiers, npcCreateRecord } from "./data.js";
import { npcBodyFields, npcVitalsFields, NPC_FIELD_TYPES, NPC_DEFAULT_FIELDS, npcBuildUpdatePrompt } from "./fields.js";
import { npcParseUpdateBlocks, npcApplyUpdates } from "./updates.js";
import { meguminActiveDataIdentity } from "../../core/keys.js";
import { escapeHtmlAttr } from "../../utils/html.js";
import { npcGeneratePfp } from "./pfp.js";

// Everything on an NPC record can come from somewhere untrusted: an imported
// pack, a shared chat file, or a story model talked into writing markup into a
// dossier. So every value is escaped where it is drawn, and a portrait is only
// drawn when it is exactly the kind upload and ComfyUI store: an image data URL.
const escv = (v) => escapeHtmlAttr(v == null ? "" : v);
const SAFE_PFP = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const safePfp = (v) => (typeof v === "string" && SAFE_PFP.test(v)) ? v : "";

// An imported NPC, reduced to the shape the bank expects. Not the XSS guard
// (drawing escapes everything anyway), but a file with a number where a name
// goes or an object for a history should not break the tab later.
function npcCleanImported(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        if (k === "history" || k === "pfp" || k === "imageOnly" || k === "timestamp" || k === "messageIndex") continue;
        if (typeof v === "string") out[k] = v;
        else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
    }
    if (!(out.name || "").trim()) return null;
    out.pfp = safePfp(raw.pfp);
    out.imageOnly = raw.imageOnly === true;
    out.timestamp = Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now();
    out.messageIndex = Number.isInteger(raw.messageIndex) && raw.messageIndex >= 0 ? raw.messageIndex : 0;
    out.history = Array.isArray(raw.history)
        ? raw.history.filter(e => e && typeof e === "object" && !Array.isArray(e))
        : [];
    return out;
}

export function renderNpcBank(c) {
    c.empty();
    const nb = localProfile.npcBank;
    if (nb.injectionLimit === undefined) nb.injectionLimit = 3;

    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #f43f5e, #e11d48);">
                    <i class="fa-solid fa-address-book"></i>
                </div>
                <div>
                    <h2>NPC Bank</h2>
                    <p>Automatically extract and track significant NPCs in the story.</p>
                </div>
            </div>
            <div id="npc_header_badge" class="mtab-header-badge" style="background: ${nb.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)'}; color: ${nb.enabled ? '#10b981' : 'var(--text-muted)'}; border: 1px solid ${nb.enabled ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'};">
                <i class="fa-solid fa-${nb.enabled ? 'circle-check' : 'circle-xmark'}" style="font-size:0.6rem;"></i> ${nb.enabled ? 'Enabled' : 'Disabled'}
            </div>
        </div>

        <!-- ROOT LEVEL ENABLE TOGGLE -->
        <div class="mtab-toggle-row ${nb.enabled ? 'active' : ''}" id="npc_enable_card" style="margin-bottom: 20px;">
            <div class="toggle-info">
                <div class="toggle-label" style="font-size: 1.05rem;"><i class="fa-solid fa-users" style="color:#f43f5e;"></i> Enable NPC Bank</div>
                <div class="toggle-desc">When enabled, the AI generates detailed dossiers for new NPCs and injects them when relevant.</div>
            </div>
            <div class="ps-switch"></div>
        </div>

        <!-- MAIN CONTENT BLOCK -->
        <div id="npc_main_content" style="display: ${nb.enabled ? 'block' : 'none'};">
            
            <!-- NEW CORE SETTINGS PANEL -->
            <div class="mtab-panel" style="margin-bottom: 16px;">
                <div class="mtab-panel-title purple" style="margin-bottom: 14px;"><i class="fa-solid fa-sliders"></i> Injection Settings</div>
                
                <div style="display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 15px;">
                    <div style="flex: 1; min-width: 200px;">
                        <div style="font-size: 0.75rem; font-weight: bold; color: var(--text-main); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                            OOC Trigger <i class="fa-solid fa-circle-question" title="When ON, Dossier Template ONLY injects if 'NPC' or 'dossier' is in your latest message." style="cursor: help; color: #a855f7;"></i>
                        </div>
                        <div class="ps-toggle-card ${nb.oocTrigger ? 'active' : ''}" id="npc_ooc_trigger" style="padding: 10px 14px; justify-content: space-between; background: rgba(0,0,0,0.2); border-color: ${nb.oocTrigger ? '#a855f7' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;">
                            <span style="font-size: 0.75rem; color: ${nb.oocTrigger ? '#a855f7' : 'var(--text-muted)'}; font-weight: 600;">Manual Extract</span>
                            <div class="ps-switch" style="transform: scale(0.8); ${nb.oocTrigger ? 'background: #a855f7;' : ''}"></div>
                        </div>
                    </div>
                    
                    <div style="flex: 1; min-width: 200px;">
                        <div style="font-size: 0.75rem; font-weight: bold; color: var(--text-main); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                            Send Portraits <i class="fa-solid fa-circle-question" title="If an injected NPC has a portrait, send the image to the AI vision model." style="cursor: help; color: #a855f7;"></i>
                        </div>
                        <div class="ps-toggle-card ${nb.sendPortraitsToAi ? 'active' : ''}" id="npc_send_portraits" style="padding: 10px 14px; justify-content: space-between; background: rgba(0,0,0,0.2); border-color: ${nb.sendPortraitsToAi ? '#a855f7' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;">
                            <span style="font-size: 0.75rem; color: ${nb.sendPortraitsToAi ? '#a855f7' : 'var(--text-muted)'}; font-weight: 600;">Multimodal</span>
                            <div class="ps-switch" style="transform: scale(0.8); ${nb.sendPortraitsToAi ? 'background: #a855f7;' : ''}"></div>
                        </div>
                    </div>
                    
                    <div style="flex: 1; min-width: 150px;">
                        <div style="font-size: 0.75rem; font-weight: bold; color: var(--text-main); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                            Max Injections <i class="fa-solid fa-circle-question" title="Limit how many NPCs are injected into the prompt at once." style="cursor: help; color: #a855f7;"></i>
                        </div>
                        <input type="number" id="npc_injection_limit" class="ps-modern-input" value="${nb.injectionLimit}" min="1" max="20" style="padding: 10px 14px; width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.2);" />
                    </div>
                </div>

                <div class="mtab-setting-row" style="padding-bottom: 0; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.05); align-items: flex-start; flex-direction: column;">
                    <div class="set-info" style="width: 100%; margin-bottom: 8px;">
                        <div class="set-label" style="color: #ef4444;"><i class="fa-solid fa-user-slash"></i> Ignore List (Do Not Extract)</div>
                        <div class="set-desc">Comma-separated names the AI should NEVER make a dossier for (e.g., background characters).</div>
                    </div>
                    <input type="text" id="npc_ignored_names" class="ps-modern-input" value="${nb.ignoredNames || ''}" placeholder="e.g. Fluffy, Guards, The Bartender..." style="width: 100%; background: rgba(0,0,0,0.2);" />
                </div>
            </div>

            <!-- SCANNER SETTINGS PANEL -->
            <div class="mtab-panel" style="margin-bottom: 16px;">
                <div class="mtab-panel-title gold" style="margin-bottom: 10px;"><i class="fa-solid fa-gears"></i> Scanner Settings</div>
                <div class="mtab-setting-row" style="padding-bottom: 0; border: none;">
                    <div class="set-info">
                        <div class="set-label">Scan Depth (Messages)</div>
                        <div class="set-desc">How many recent messages to read when clicking "Scan Story".<br><span style="color:var(--gold); font-weight: 600;">⚠️ Note: High numbers consume massive context limits and API tokens!</span></div>
                    </div>
                    <input type="number" id="npc_scan_depth" class="ps-modern-input" value="${nb.scanDepth || 60}" min="10" style="width: 90px; text-align: center; background: rgba(0,0,0,0.2);" />
                </div>
            </div>

            <!-- DOSSIER FIELDS -->
            <div id="npc_fields_host"></div>

            <!-- SAVED NPCs -->
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="color: #f43f5e; font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"><i class="fa-solid fa-address-card"></i> Saved NPCs <span id="npc_count" style="color: var(--text-muted); font-size: 0.75rem; margin-left: 8px;">(${(nb.npcs || []).length})</span></div>
                    <div style="display: flex; gap: 8px;">
                        <input type="file" id="npc_file_import" accept=".json" style="display: none;">
                        <button id="npc_btn_import" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #10b981; border-color: rgba(16, 185, 129, 0.3);" title="Import NPCs"><i class="fa-solid fa-file-import"></i></button>
                        <button id="npc_btn_export" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #3b82f6; border-color: rgba(59, 130, 246, 0.3);" title="Export All NPCs"><i class="fa-solid fa-download"></i></button>
                        <button id="npc_btn_add" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #a855f7; border-color: rgba(168, 85, 247, 0.3);" title="Create an NPC by hand"><i class="fa-solid fa-user-plus"></i> Add NPC</button>
                        <button id="npc_btn_scan_story" class="ps-modern-btn primary" style="padding: 4px 10px; font-size: 0.72rem; background: linear-gradient(135deg, #f43f5e, #e11d48); color: #fff; border: none;"><i class="fa-solid fa-radar"></i> Scan Story</button>
                        <button id="npc_btn_clear_all" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);"><i class="fa-solid fa-trash-can"></i> Clear All</button>
                    </div>
                </div>
                <div id="npc_bank_list" style="display: flex; flex-direction: column; gap: 14px; padding: 4px;">
                </div>
            </div>
        </div>
    `);

    // --- DOSSIER FIELD EDITOR ---
    c.find("#npc_fields_host").append(renderNpcFieldEditor(c));

    // --- PROMPT EDITOR UI ---
    const npcEditor = renderPromptEditor({
        id: "npc_prompt_editor",
        title: "Advanced: Edit NPC Prompts",
        defaultData: DEFAULT_PROMPTS.npcBank,
        currentData: nb.customPrompts,
        enabled: nb.customPromptsEnabled,
        onToggle: (val) => { 
            nb.customPromptsEnabled = val; 
            syncPromptsGlobally('npcBank', 'customPromptsEnabled', val);
            saveProfileToMemory(); 
        },
        fields: [
            { key: "systemPrompt", label: "Portrait AI: System Prompt", hint: "AI role definition for image generation." },
            { key: "userPrompt", label: "Portrait AI: User Task Prompt", hint: "Tokens: <code>{{npcText}}</code>, <code>{{styleStr}}</code>, <code>{{perspStr}}</code>, <code>{{extraStr}}</code>" },
            { key: "thinkingPrompt", label: "Portrait AI: Thinking Instructions", hint: "Must include output ordering instructions." },
            { key: "dossierRules", label: "Chat AI: Dossier Rules", hint: "When to write a dossier and how to think about each field. The fill-in template itself is built from the field list above and dropped in at <code>{{template}}</code>; <code>{{persistenceRule}}</code> is generated too." }
        ],
        onSave: (val, key) => {
            if (!nb.customPrompts) nb.customPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.npcBank));
            nb.customPrompts[key] = val; 
            syncPromptsGlobally('npcBank', 'customPrompts', nb.customPrompts);
            saveProfileDebounced(); 
            return nb.customPrompts;
        },
        onReset: () => { 
            nb.customPrompts = null; 
            syncPromptsGlobally('npcBank', 'customPrompts', null);
            saveProfileToMemory(); 
        }
    });

    c.find('#npc_main_content').append(npcEditor);

    // --- EVENT LISTENERS ---
    $("#npc_enable_card").on("click", function () {
        nb.enabled = !nb.enabled; saveProfileToMemory();
        if (nb.enabled) {
            $(this).addClass("active").css("border-color", "var(--gold)");
            $("#npc_main_content").slideDown(200);
            $("#npc_header_badge").css({ background: 'rgba(16,185,129,0.12)', color: '#10b981', 'border-color': 'rgba(16,185,129,0.25)' }).html(`<i class="fa-solid fa-circle-check" style="font-size:0.6rem;"></i> Enabled`);
            renderNpcList();
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
            $("#npc_main_content").slideUp(200);
            $("#npc_header_badge").css({ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', 'border-color': 'var(--border-color)' }).html(`<i class="fa-solid fa-circle-xmark" style="font-size:0.6rem;"></i> Disabled`);
        }
    });

    $("#npc_ooc_trigger").on("click", function () {
        nb.oocTrigger = !nb.oocTrigger; saveProfileToMemory();
        if (nb.oocTrigger) {
            $(this).addClass("active").css("border-color", "#a855f7").find("span").css("color", "#a855f7");
            $(this).find(".ps-switch").css("background", "#a855f7");
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)").find("span").css("color", "var(--text-muted)");
            $(this).find(".ps-switch").css("background", "");
        }
    });

    $("#npc_send_portraits").on("click", function () {
        nb.sendPortraitsToAi = !nb.sendPortraitsToAi; saveProfileToMemory();
        if (nb.sendPortraitsToAi) {
            $(this).addClass("active").css("border-color", "#a855f7").find("span").css("color", "#a855f7");
            $(this).find(".ps-switch").css("background", "#a855f7");
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)").find("span").css("color", "var(--text-muted)");
            $(this).find(".ps-switch").css("background", "");
        }
    });

    $("#npc_injection_limit").on("input change", function() {
        nb.injectionLimit = Math.max(1, parseInt($(this).val()) || 3);
        saveProfileToMemory();
    });

    $("#npc_ignored_names").on("input", function() {
        nb.ignoredNames = $(this).val();
        saveProfileDebounced();
    });

    $("#npc_btn_export").on("click", function () {
        const data = localProfile.npcBank.npcs || [];
        downloadJsonFile("megumin_npc_bank.json", data);
    });

    $("#npc_btn_import").on("click", () => $("#npc_file_import").click());
    $("#npc_file_import").on("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const parsed = JSON.parse(evt.target.result);
                if (!Array.isArray(parsed)) {
                    toastr.error("Invalid NPC Bank file format.");
                    return;
                }
                const data = parsed.map(npcCleanImported).filter(Boolean);
                if (!data.length) {
                    toastr.error("No usable NPCs in that file.");
                    return;
                }
                if (confirm("Do you want to merge imported NPCs with your existing ones? (Click 'Cancel' to overwrite)")) {
                    localProfile.npcBank.npcs = (localProfile.npcBank.npcs || []).concat(data);
                } else {
                    localProfile.npcBank.npcs = data;
                }
                saveProfileToMemory();
                renderNpcList();
                toastr.success("NPCs imported successfully!");
            } catch (err) {
                toastr.error("Failed to parse JSON file.");
            }
            $("#npc_file_import").val("");
        };
        reader.readAsText(file);
    });

    // Create an NPC by hand.
    //
    // Every field is created empty and filled in through the normal card editor, so
    // there is one place that knows what a field is and nothing to keep in step.
    // messageIndex is the current end of the chat: an NPC added by hand exists from
    // now on, which is what makes a rewind past this point remove it, exactly as it
    // would for one the scanner found here.
    $("#npc_btn_add").on("click", function () {
        const name = prompt("Name for the new NPC:", "");
        if (!name || !name.trim()) return;
        const trimmed = name.trim();

        if (!localProfile.npcBank.npcs) localProfile.npcBank.npcs = [];
        const clash = localProfile.npcBank.npcs.find(n => (n.name || "").trim().toLowerCase() === trimmed.toLowerCase());
        if (clash) return toastr.warning(`"${trimmed}" is already in the bank.`);

        const context = getContext();
        const chat = context?.chat;
        localProfile.npcBank.npcs.push(npcCreateRecord({
            name: trimmed,
            messageIndex: (chat && chat.length > 0) ? chat.length - 1 : 0
        }));
        saveProfileToMemory();
        renderNpcList();
        toastr.success(`"${trimmed}" added. Open the card to fill in the details.`);
    });

    $("#npc_btn_clear_all").on("click", function () {
        if (!localProfile.npcBank.npcs || localProfile.npcBank.npcs.length === 0) return;
        if (confirm("Are you sure you want to delete all saved NPCs? This cannot be undone.")) {
            localProfile.npcBank.npcs = []; saveProfileToMemory(); renderNpcList();
        }
    });

    $("#npc_btn_scan_story").on("click", async function () {
        const chatText = getChatForNpcScan();
        if (chatText.length < 100) return toastr.warning("Not enough chat history to scan.");
        
        const btn = $(this);
        btn.prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Scanning...`);
        
        try {
            const context = getContext();
            const chat = context?.chat;
            const msgIndex = (chat && chat.length > 0) ? chat.length - 1 : 0;
            const existingNames = (localProfile.npcBank.npcs || []).map(n => n.name).join(", ");
            
            // Marker set inside the job (Chomusuke runs are queued; set while
            // waiting, it would hijack the generation running ahead of it).
            let rawOutput = await runWithChomusuke("npc", () => {
                setActiveNpcScanRequest({ chatText, existingNames });
                return generateQuietPrompt({ prompt: "___PS_NPC_SCAN___" });
            });
            
            let addedCount = 0;
            for (const dossier of meguminFindNpcDossiers(rawOutput)) {
                const npcName = dossier.name;
                const npcContent = dossier.raw;
                if (!localProfile.npcBank.npcs) localProfile.npcBank.npcs = [];
                if (!localProfile.npcBank.npcs.find(n => (n.name || "").trim().toLowerCase() === npcName.toLowerCase())) {
                    const parsed = npcParseBlock(npcContent);
                    localProfile.npcBank.npcs.push(npcCreateRecord({ parsed, name: npcName, messageIndex: msgIndex }));
                    addedCount++;
                }
            }
            if (addedCount > 0) { saveProfileToMemory(); renderNpcList(); toastr.success(`Found and added ${addedCount} new NPC(s)!`); } 
            else { toastr.info("No new significant NPCs found in the story."); }
        } catch (e) { toastr.error("Failed to scan story for NPCs."); } 
        finally { setActiveNpcScanRequest(null); btn.prop("disabled", false).html(`<i class="fa-solid fa-radar"></i> Scan Story`); }
    });

    $("#npc_scan_depth").on("input change", function() {
        let val = parseInt($(this).val()); if (isNaN(val) || val < 1) val = 60;
        localProfile.npcBank.scanDepth = val; saveProfileToMemory();
    });

    if (nb.enabled) renderNpcList();
}

// ────────────────────────────────────────────────────────────────────────────
// The dossier field editor.
//
// Collapsed by default, and deliberately SHORT. It lists only the fields that
// are a matter of taste — Read on the PC, Agenda, Secrets, Canon Lock — plus
// anything the reader adds.
//
// The rest of the dossier is its skeleton and is not shown here at all. What a
// person looks like, how they speak, where they live, who they know: that is
// what a dossier IS, and an editor offering to delete Appearance invites a
// reader to break their own NPCs to no benefit. Those fields are marked `fixed`
// in the field list.
//
// What the reader changes here still rewrites the prompt template, the parser,
// the injected text and the cards below, because all of those are generated
// from the one list.
// ────────────────────────────────────────────────────────────────────────────
export function renderNpcFieldEditor(c) {
    const nb = localProfile.npcBank;
    const all = Array.isArray(nb.fields) ? nb.fields : [];

    // Only the non-skeleton fields, paired with their real position in the full
    // list so reordering and deleting act on the right entry.
    const editable = all.map((f, realIndex) => ({ f, realIndex })).filter(x => !x.f.fixed);

    const wrap = $(`
        <div class="ps-prompt-editor" id="npc_fields_editor" style="margin-bottom: 18px;">
            <div class="ps-prompt-editor-toggle">
                <span class="pe-title"><i class="fa-solid fa-list-check"></i> Dossier Fields</span>
                <i class="fa-solid fa-chevron-down pe-chevron" style="cursor:pointer; padding:5px;"></i>
            </div>
            <div class="ps-prompt-editor-body">
                <div class="blk-sub-desc" style="margin-bottom:10px;">
                    The changeable part of the dossier. Name, age, appearance, voice, background, inner circle and the rest are the dossier's fixed skeleton and are not listed here.<br>
                    <b style="color:#34d399;">Lasting</b> fields describe the person's ongoing life and are told to ignore the current scene.
                    <b style="color:#fbbf24;">Updatable</b> fields can be changed later by an <code>&lt;NPC_Update&gt;</code> block; fixed ones are written once.
                </div>
                <div class="stat-field-list" id="npc_fields_rows"></div>
                <div class="blk-pool" id="npc_fields_tools" style="margin-top:8px;"></div>
            </div>
        </div>
    `);

    // Same accordion behaviour as the prompt editor below it, so the tab has one
    // way of folding things rather than two.
    wrap.find(".ps-prompt-editor-toggle").on("click", function () {
        wrap.toggleClass("open");
    });

    const rows = wrap.find("#npc_fields_rows");

    if (!editable.length) {
        rows.append(`<div class="blk-sub-desc" style="opacity:.7;">Every field has been removed. Add one below, or reset to the defaults.</div>`);
    }

    editable.forEach(({ f, realIndex }, i) => {
        const row = $(`
            <div class="stat-field npc-field-row">
                <input type="text" class="ps-modern-input nf-label" value="${escapeHtmlAttr(f.label)}" placeholder="Field name" style="min-width: 130px;" />
                <select class="ps-modern-input nf-type" title="How much room this field gets, and whether an update can add or remove single entries.">
                    ${NPC_FIELD_TYPES.map(t => `<option value="${t.v}" ${f.type === t.v ? "selected" : ""} title="${t.hint}">${t.label}</option>`).join("")}
                </select>
                <button class="ws-btn-small nf-persist" title="Lasting: describes their ongoing life, not this scene."
                    style="color:${f.persistent ? "#34d399" : "var(--text-muted)"}; border-color:${f.persistent ? "rgba(52,211,153,0.4)" : "var(--border-color)"};">
                    <i class="fa-solid ${f.persistent ? "fa-anchor" : "fa-clock"}"></i> ${f.persistent ? "Lasting" : "Current"}
                </button>
                <button class="ws-btn-small nf-update" title="Updatable: an &lt;NPC_Update&gt; block may change this field later."
                    style="color:${f.updatable ? "#fbbf24" : "var(--text-muted)"}; border-color:${f.updatable ? "rgba(251,191,36,0.4)" : "var(--border-color)"};">
                    <i class="fa-solid ${f.updatable ? "fa-pen-to-square" : "fa-lock"}"></i> ${f.updatable ? "Updatable" : "Fixed"}
                </button>
                <button class="ws-btn-small nf-up" ${i === 0 ? "disabled" : ""} title="Move up"><i class="fa-solid fa-arrow-up"></i></button>
                <button class="ws-btn-small nf-del" style="color:#ef4444;" title="Remove this field"><i class="fa-solid fa-xmark"></i></button>
                <input type="text" class="ps-modern-input nf-placeholder" value="${escapeHtmlAttr(f.placeholder || "")}" placeholder="What to tell the AI to put here" style="flex-basis: 100%; font-size: 0.7rem; opacity: 0.85;" />
            </div>
        `);

        // Reopened after every redraw, because every control below redraws the
        // whole tab and a section that folded itself on each edit would be
        // unusable.
        const keepOpen = () => { renderNpcBank(c); $("#npc_fields_editor").addClass("open"); };

        row.find(".nf-label").on("input", function () { f.label = $(this).val(); saveProfileDebounced(); });
        row.find(".nf-placeholder").on("input", function () { f.placeholder = $(this).val(); saveProfileDebounced(); });
        row.find(".nf-type").on("change", function () {
            f.type = $(this).val();
            saveProfileToMemory(); keepOpen();
        });
        row.find(".nf-persist").on("click", () => {
            f.persistent = !f.persistent;
            saveProfileToMemory(); keepOpen();
        });
        row.find(".nf-update").on("click", () => {
            f.updatable = !f.updatable;
            saveProfileToMemory(); keepOpen();
        });
        row.find(".nf-up").on("click", () => {
            // Swap with the previous EDITABLE field, not the previous entry in
            // the array — the skeleton fields sit in between and must not move.
            const prev = editable[i - 1];
            if (!prev) return;
            const tmp = all[realIndex];
            all[realIndex] = all[prev.realIndex];
            all[prev.realIndex] = tmp;
            saveProfileToMemory(); keepOpen();
        });
        row.find(".nf-del").on("click", () => {
            // The field goes out of the dossier, but the text every NPC already
            // has under it is left alone. Deleting a field changes what the AI is
            // asked for; it is not permission to throw away what it wrote — and
            // re-adding the field brings all of it back.
            if (!confirm(`Remove "${f.label}" from the dossier?\n\nThe AI stops being asked for it and it disappears from the cards. Text your NPCs already have under it is kept, and re-adding the field shows it again.`)) return;
            all.splice(realIndex, 1);
            saveProfileToMemory(); keepOpen();
        });

        rows.append(row);
    });

    const tools = wrap.find("#npc_fields_tools");
    const reopen = () => { renderNpcBank(c); $("#npc_fields_editor").addClass("open"); };

    const addBtn = $(`<button class="blk-add"><i class="fa-solid fa-plus"></i> Add field</button>`);
    addBtn.on("click", () => {
        // Lasting and Fixed by default: the safe answers. Lasting keeps it out of
        // the current scene, and Fixed keeps the update block small until the
        // reader decides this is a field that moves.
        all.push({
            id: "npc_f_" + Date.now(),
            label: "New field",
            type: "text",
            icon: "fa-circle-dot",
            color: "#94a3b8",
            persistent: true,
            updatable: false,
            placeholder: ""
        });
        saveProfileToMemory(); reopen();
    });
    tools.append(addBtn);

    const resetBtn = $(`<button class="blk-add" style="color:#ef4444; border-color:rgba(239,68,68,0.3);"><i class="fa-solid fa-rotate-left"></i> Reset fields</button>`);
    resetBtn.on("click", () => {
        if (!confirm("Put the dossier fields back to the defaults?\n\nFields you added stop being asked for. No NPC text is deleted.")) return;
        nb.fields = JSON.parse(JSON.stringify(NPC_DEFAULT_FIELDS));
        saveProfileToMemory(); reopen();
        toastr.info("Dossier fields reset to defaults.");
    });
    tools.append(resetBtn);

    return wrap;
}

export function renderNpcList() {
    const list = $("#npc_bank_list");
    list.empty();
    if (!localProfile.npcBank.npcs) localProfile.npcBank.npcs = [];
    const npcs = localProfile.npcBank.npcs;
    $("#npc_count").text(`(${npcs.length})`);

    if (npcs.length === 0) {
        list.append('<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 20px;">No NPCs saved yet. The AI will add them automatically when significant NPCs are introduced.</div>');
        return;
    }

    // The rows a card draws, and their labels, icons and colours, all come from
    // the field list — so a field added in the editor below shows up here with
    // no edit, which is the whole point of the list existing.
    const npcFieldMeta = npcBodyFields().map(f => ({
        key: f.id, label: f.label, icon: f.icon || "fa-circle-dot", color: f.color || "#94a3b8",
        // A paragraph or a list needs room; a one-liner does not. Derived from
        // the type rather than from a hand-kept list of which fields are tall.
        tall: f.type === "longtext" || f.type === "list" || f.system === "imageTags"
    }));

    [...npcs].reverse().forEach((n, revIdx) => {
        const idx = npcs.length - 1 - revIdx;
        const dateStr = new Date(n.timestamp).toLocaleDateString();
        const pfpSrc = escv(safePfp(n.pfp));
        const name = escv(n.name);

        // Dynamic color based on sex: Blue for male, Red/pink for female/other
        const isMale = String(n.sex || "").trim().toLowerCase().startsWith("m");
        const accentColor = isMale ? "#3b82f6" : "#f43f5e";
        const accentRgba = isMale ? "59,130,246" : "244,63,94";
        const gradientFrom = isMale ? "rgba(59,130,246,0.15)" : "rgba(244,63,94,0.15)";
        const gradientTo = isMale ? "rgba(29,78,216,0.08)" : "rgba(225,29,72,0.08)";

        const pfpDisplay = pfpSrc ? `<img src="${pfpSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;color:${accentColor};"><i class="fa-solid fa-user-secret"></i></div>`;

        let fieldsHTML = "";
        npcFieldMeta.forEach(fm => {
            const val = escv(n[fm.key]);
            fieldsHTML += `
                <div class="npc-field-section" style="margin-bottom: 6px;">
                    <div style="font-size: 0.65rem; color: ${fm.color}; font-weight: 600; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid ${fm.icon}" style="font-size: 0.6rem;"></i> ${escv(fm.label)}
                    </div>
                    <textarea class="ps-modern-input npc_field_edit" data-idx="${idx}" data-field="${fm.key}"
                        style="height: ${fm.tall ? '60' : '32'}px; resize: vertical; font-size: 0.7rem; padding: 4px 6px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; line-height: 1.3;"
                    >${val}</textarea>
                </div>`;
        });

        const miniPfp = pfpSrc ? `<img src="${pfpSrc}" style="width:28px;height:28px;object-fit:cover;border-radius:6px;border:1px solid rgba(${accentRgba},0.3);" />` : "";

        const card = $(`
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(${accentRgba},0.2); border-radius: 12px; overflow: hidden; transition: border-color 0.2s;" class="npc-card" data-accent-rgba="${accentRgba}">
                <!-- Header (clickable to toggle) -->
                <div class="npc-card-header" style="background: linear-gradient(135deg, ${gradientFrom}, ${gradientTo}); padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-chevron-right npc-chevron" style="font-size: 0.6rem; color: ${accentColor}; transition: transform 0.2s;"></i>
                        ${miniPfp}
                        <span style="font-size: 0.85rem; font-weight: 700; color: ${accentColor};">${name}</span>
                        <button class="npc_edit_name_btn" data-idx="${idx}" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.7rem; padding: 2px 4px; margin-left: -4px;" title="Edit Name"><i class="fa-solid fa-pen"></i></button>
                        <span class="npc_edit_vitals_btn" data-idx="${idx}" style="font-size: 0.6rem; color: var(--text-muted); background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; cursor: pointer;" title="Edit age, sex and orientation">${escv(n.age) || "?"} · ${escv(n.sex) || "?"} <i class="fa-solid fa-pen" style="font-size: 0.5rem; opacity: 0.6;"></i></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <!-- New Image Tags Only Toggle -->
                        <div class="npc_img_only_toggle" data-idx="${idx}" style="display: flex; align-items: center; gap: 6px; cursor: pointer; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 8px; border: 1px solid ${n.imageOnly ? 'rgba(16,185,129,0.3)' : 'transparent'};" title="If enabled, hides the text dossier from the AI to save tokens, but still sends Image Tags to ComfyUI.">
                            <span style="font-size: 0.65rem; font-weight: 700; color: ${n.imageOnly ? '#10b981' : 'var(--text-muted)'};">Image Tags Only</span>
                            <div class="ps-toggle-card ${n.imageOnly ? 'active' : ''}" style="padding: 2px; min-width: 36px; background: transparent; border-color: ${n.imageOnly ? '#10b981' : 'rgba(255,255,255,0.1)'}; border-radius: 8px;">
                                <div class="ps-switch" style="transform: scale(0.65); ${n.imageOnly ? 'background: #10b981;' : ''}"></div>
                            </div>
                        </div>

                        <span style="color: var(--text-muted); font-size: 0.6rem;">${dateStr}</span>
                        <button class="npc_force_update" data-idx="${idx}" style="background: transparent; border: none; color: #fbbf24; cursor: pointer; font-size: 0.75rem; padding: 2px 4px;" title="Re-read the story and update this NPC's changeable fields now"><i class="fa-solid fa-arrows-rotate"></i></button>
                        <button class="npc_export_btn" data-idx="${idx}" style="background: transparent; border: none; color: #3b82f6; cursor: pointer; font-size: 0.75rem; padding: 2px 4px;" title="Export NPC"><i class="fa-solid fa-download"></i></button>
                        <button class="npc_del_btn" data-idx="${idx}" style="background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 0.75rem; padding: 2px 4px;" title="Delete NPC"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <!-- Body (collapsed by default) -->
                <div class="npc-card-body" style="display: none; border-top: 1px solid rgba(${accentRgba},0.15);">
                    <div style="display: flex; gap: 12px; padding: 12px;">
                        <!-- PFP Column -->
                        <div style="flex-shrink: 0; width: 160px; display: flex; flex-direction: column; gap: 8px;">
                            <div class="npc-pfp-container" style="width: 160px; height: 240px; border-radius: 10px; overflow: hidden; border: 2px solid rgba(${accentRgba},0.3); background: rgba(0,0,0,0.4);">
                                ${pfpDisplay}
                            </div>
                            <div style="text-align: center; font-size: 0.95rem; font-weight: 800; color: ${accentColor}; margin-top: 2px; margin-bottom: 2px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${name}</div>
                            <button class="npc_upload_pfp" data-idx="${idx}" style="width: 100%; font-size: 0.65rem; padding: 4px 0; border-radius: 6px; border: 1px solid rgba(${accentRgba},0.3); background: rgba(${accentRgba},0.1); color: ${accentColor}; cursor: pointer; transition: background 0.2s;" title="Upload Image">
                                <i class="fa-solid fa-upload"></i> Upload
                            </button>
                            <button class="npc_gen_pfp" data-idx="${idx}" data-name="${name}" style="width: 100%; font-size: 0.65rem; padding: 4px 0; border-radius: 6px; border: 1px solid rgba(168,85,247,0.3); background: rgba(168,85,247,0.1); color: #a855f7; cursor: pointer; transition: background 0.2s;" title="Generate with ComfyUI">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Generate
                            </button>
                        </div>
                        <!-- Fields Column -->
                        <div style="flex: 1; min-width: 0;">
                            ${fieldsHTML}
                        </div>
                    </div>
                </div>
            </div>
        `);

        // Hover effect — dynamic color
        card.on("mouseenter", function () { $(this).css("border-color", `rgba(${$(this).attr('data-accent-rgba')},0.5)`); });
        card.on("mouseleave", function () { $(this).css("border-color", `rgba(${$(this).attr('data-accent-rgba')},0.2)`); });

        // Collapse / Expand toggle
        card.find(".npc-card-header").on("click", function (e) {
            if ($(e.target).closest(".npc_del_btn").length) return; // Don't toggle when clicking delete
            const body = $(this).siblings(".npc-card-body");
            const chevron = $(this).find(".npc-chevron");
            body.slideToggle(200);
            chevron.css("transform", body.is(":visible") ? "rotate(0deg)" : "rotate(90deg)");
        });

        // Field editing
        card.find(".npc_field_edit").on("change", function () {
            const i = parseInt($(this).attr("data-idx"));
            const field = $(this).attr("data-field");
            if (localProfile.npcBank.npcs[i]) {
                localProfile.npcBank.npcs[i][field] = $(this).val();
                saveProfileToMemory();
            }
        });

        // Image Tags Only Toggle
        card.find(".npc_img_only_toggle").on("click", function (e) {
            e.stopPropagation(); // Prevents the accordion from collapsing when clicking the toggle
            const i = parseInt($(this).attr("data-idx"));
            if (localProfile.npcBank.npcs[i]) {
                localProfile.npcBank.npcs[i].imageOnly = !localProfile.npcBank.npcs[i].imageOnly;
                saveProfileToMemory();
                renderNpcList();
                
                if (localProfile.npcBank.npcs[i].imageOnly) {
                    toastr.info("Image Tags Only enabled. Text dossier will be hidden from AI.");
                } else {
                    toastr.info("Full Sync enabled. Text dossier will be sent to AI.");
                }
            }
        });

        // Edit Name
        card.find(".npc_edit_name_btn").on("click", function (e) {
            e.stopPropagation();
            const i = parseInt($(this).attr("data-idx"));
            const currentName = localProfile.npcBank.npcs[i].name;
            const newName = prompt("Enter new name for this NPC:", currentName);
            if (newName && newName.trim() !== "" && newName !== currentName) {
                localProfile.npcBank.npcs[i].name = newName.trim();
                saveProfileToMemory();
                renderNpcList();
            }
        });

        // Age / sex / orientation.
        //
        // These three are the only dossier fields the card had no way to change:
        // they render as a summary badge in the header rather than as rows in the
        // field list below, so the scanner's guess was permanent. They are edited
        // together because they are read together, and because three separate
        // prompt() boxes for three short values would be worse than one form.
        card.find(".npc_edit_vitals_btn").on("click", async function (e) {
            e.stopPropagation();
            const i = parseInt($(this).attr("data-idx"));
            const npc = localProfile.npcBank.npcs[i];
            if (!npc) return;

            const esc = (v) => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
            // One row per vitals field, so relabelling Sex to Gender in the field
            // editor relabels it here too rather than leaving the two disagreeing.
            const vitals = npcVitalsFields();
            const $form = $(`
                <div style="display:flex; flex-direction:column; gap:10px; text-align:left;">
                    ${vitals.map(f => `
                    <div><label style="font-size:0.7rem; color:var(--text-muted); display:block; margin-bottom:4px;">${esc(f.label)}</label>
                        <input type="text" data-vital="${esc(f.id)}" class="ps-modern-input" value="${esc(npc[f.id])}" placeholder="${esc(f.placeholder || "")}" /></div>`).join("")}
                </div>
            `);

            const confirmed = await new Popup($form, POPUP_TYPE.CONFIRM, `Edit ${escv(npc.name)}`, { okButton: "Save", cancelButton: "Cancel" }).show();
            if (!confirmed) return;

            vitals.forEach(f => {
                npc[f.id] = ($form.find(`[data-vital="${f.id}"]`).val() || "").trim();
            });
            saveProfileToMemory();
            renderNpcList();
        });

        // Export
        // Force an update now, rather than waiting for the story to produce one.
        card.find(".npc_force_update").on("click", async function (e) {
            e.stopPropagation();
            const i = parseInt($(this).attr("data-idx"));
            const target = localProfile.npcBank.npcs[i];
            if (!target) return;

            const rules = npcBuildUpdatePrompt();
            if (!rules) {
                toastr.info("No field is marked Updatable, so there is nothing an update could change.", "Megumin Suite");
                return;
            }

            const btn = $(this);
            btn.prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i>`);

            // The chat can move under a long generation, and applying an update
            // built from another chat's story would be worse than not applying it.
            const identity = meguminActiveDataIdentity();

            const updateRequest = {
                npcName: target.name,
                npcText: npcBuildTextFromData(target),
                chatText: getChatForNpcScan(),
                rules
            };
            try {
                // Marker set inside the job (Chomusuke runs are queued).
                const raw = await runWithChomusuke("npc", () => {
                    setActiveNpcUpdateRequest(updateRequest);
                    return generateQuietPrompt({ prompt: "___PS_NPC_UPDATE___" });
                });
                const cleaned = String(raw || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();

                if (meguminActiveDataIdentity() !== identity) {
                    console.debug(`[Megumin-Suite] Forced NPC update discarded: it was requested in "${identity}" but "${meguminActiveDataIdentity()}" is active now.`);
                    return;
                }

                const parsedUpdates = npcParseUpdateBlocks(cleaned);
                if (!parsedUpdates.length) {
                    toastr.info(`Nothing on ${target.name}'s record has changed.`, "Megumin Suite");
                    return;
                }

                // Whatever name the model wrote in the attribute, this was asked
                // about one NPC and must only ever touch that one.
                parsedUpdates.forEach(u => { u.name = target.name; });

                const chat = getContext()?.chat;
                const { applied, refused } = npcApplyUpdates(parsedUpdates, {
                    messageIndex: (chat && chat.length > 0) ? chat.length - 1 : 0
                });
                refused.forEach(r => console.debug(`[Megumin-Suite] Forced NPC update declined: ${r.reason}.`));

                if (applied.length) {
                    saveProfileToMemory();
                    renderNpcList();
                    toastr.success(
                        applied.map(a => `${a.label}: ${a.op === "+" ? "added" : a.op === "-" ? "removed" : "replaced"}`).join(" · "),
                        `Megumin Suite — ${target.name} updated`
                    );
                } else {
                    toastr.info(`Nothing on ${target.name}'s record has changed.`, "Megumin Suite");
                }
            } catch (err) {
                console.error("[Megumin Suite] Forced NPC update failed", err);
                toastr.error(`Could not update ${target.name}.`);
            } finally {
                setActiveNpcUpdateRequest(null);
                // The list may have been redrawn already, in which case this
                // button is gone and the reset is a no-op.
                btn.prop("disabled", false).html(`<i class="fa-solid fa-arrows-rotate"></i>`);
            }
        });

        card.find(".npc_export_btn").on("click", function (e) {
            e.stopPropagation();
            const i = parseInt($(this).attr("data-idx"));
            const n = localProfile.npcBank.npcs[i];
            if (n) {
                const safeName = (n.name || "npc").replace(/[^a-z0-9]/gi, '_').toLowerCase();
                downloadJsonFile(`megumin_npc_${safeName}.json`, [n]);
            }
        });

        // Delete
        card.find(".npc_del_btn").on("click", function (e) {
            e.stopPropagation();
            const i = parseInt($(this).attr("data-idx"));
            if (confirm(`Delete ${localProfile.npcBank.npcs[i]?.name || "this NPC"}?`)) {
                localProfile.npcBank.npcs.splice(i, 1);
                saveProfileToMemory();
                renderNpcList();
            }
        });

        // Upload PFP
        card.find(".npc_upload_pfp").on("click", function () {
            const i = parseInt($(this).attr("data-idx"));
            const input = document.createElement("input");
            input.type = "file"; input.accept = "image/*";
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    // Compress to reasonable size
                    const img = new Image();
                    img.onload = () => {
                        const cvs = document.createElement("canvas");
                        const maxSize = 256;
                        let w = img.width, h = img.height;
                        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                        else { w = Math.round(w * maxSize / h); h = maxSize; }
                        cvs.width = w; cvs.height = h;
                        cvs.getContext("2d").drawImage(img, 0, 0, w, h);
                        const compressed = cvs.toDataURL("image/jpeg", 0.85);
                        localProfile.npcBank.npcs[i].pfp = compressed;
                        saveProfileToMemory();
                        renderNpcList();
                        toastr.success("Portrait uploaded!");
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });

        // Generate PFP via ComfyUI
        card.find(".npc_gen_pfp").on("click", async function () {
            const name = $(this).attr("data-name");
            await npcGeneratePfp(name);
        });

        list.append(card);
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Wiring. The list redraws after a profile load, a prune, or a portrait
// finishing — none of which this file knows about directly.
// ────────────────────────────────────────────────────────────────────────────

registerRefreshHook(REFRESH.NPC_LIST, () => renderNpcList());
