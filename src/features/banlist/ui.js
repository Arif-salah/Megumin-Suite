// ──────────────────────────────────────────────────────────────────────────────
// Dynamic Ban List — the tab that scans the chat for repeated phrasing and bans it.
// ──────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../core/state.js";
import { syncPromptsGlobally } from "../../core/sync.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../core/profile.js";
import { DEFAULT_PROMPTS } from "../../prompts/index.js";
import { renderPromptEditor } from "../../ui/promptEditor.js";
import { getCleanedChatHistory } from "../../engine/chatText.js";
import { analyzeSlopDirectly, analyzeSlopWithPreset, runWithChomusuke } from "../../engine/tasks.js";
import { Popup, POPUP_TYPE, extension_settings } from "../../st.js";
import { switchRow, segmented } from "../../ui/controls.js";
import { getSharedFragment, setSharedFragment } from "../../core/sharedFragments.js";
import { BUILTIN_BAN_LIST } from "../../prompts/presetFrame.js";
import { V11_BAN_LIST } from "../../../data/modes/v11taina.js";
import { hardcodedLogic } from "../../../data/database.js";
import { extensionName } from "../../core/constants.js";

// V11 Тайна sends the full list in its own wording, kept and edited apart from
// the one older presets send (plan 018).
function fullList() {
    const all = [...hardcodedLogic.modes, ...((extension_settings[extensionName] || {}).customModes || [])];
    const engine = all.find(m => m.id === localProfile.mode);
    return engine && engine.turnFrame === "v11"
        ? { key: "banlistBuiltInV11", original: V11_BAN_LIST, name: engine.label }
        : { key: "banlistBuiltIn", original: BUILTIN_BAN_LIST, name: "" };
}

// The built-in list in a popup. Saving the original text back stores nothing,
// so a later update to the original still reaches this install.
async function editBuiltInList() {
    const list = fullList();
    const $root = $(`
        <div style="text-align:left;">
            <h3 style="margin-top:0;">Built-in list${list.name ? ` (${list.name})` : ""}</h3>
            <div style="opacity:0.75; font-size:0.85rem; margin-bottom:8px;">The same list in every chat. Switch it off in the Banned Phrases tab.</div>
            <textarea class="ps-modern-input" rows="18" style="width:100%; font-family:monospace; font-size:0.8rem;"></textarea>
            <button type="button" class="ps-modern-btn secondary bl-reset" style="margin-top:8px; padding: 4px 10px; font-size: 0.75rem;"><i class="fa-solid fa-rotate-left"></i> Put back the original list</button>
        </div>
    `);
    const $text = $root.find("textarea");
    $text.val(getSharedFragment(list.key) || list.original);
    $root.find(".bl-reset").on("click", () => $text.val(list.original));

    const saved = await new Popup($root, POPUP_TYPE.CONFIRM, "", { okButton: "Save", cancelButton: "Cancel", wide: true, large: true, allowVerticalScrolling: true }).show();
    if (!saved) return;
    const value = String($text.val() || "");
    const original = value.replace(/\r\n/g, "\n").trim() === list.original.trim();
    setSharedFragment(list.key, original ? "" : value);
    if (!original && value.trim() === "") toastr.info("The built-in list is empty now, so the original list will be used. To send none, switch it off instead.");
    else toastr.success(original ? "Built-in list set back to the original." : "Built-in list saved.");
}

export function renderBanList(c) {
    c.empty();
    if (!localProfile.banList) localProfile.banList = [];

    // ── BUILT-IN LIST (plan 017) ──
    // Used to be fixed text in the preset. It can be switched off per profile
    // (follows this tab's Global switch); the edited text is one for the whole
    // install, the same text Dev Mode shows as "Ban List (built-in)".
    const $builtIn = $(`
        <div class="mtab-panel" style="margin-bottom:16px;">
            <div class="mtab-panel-title red"><i class="fa-solid fa-book"></i> Built-in list</div>
        </div>
    `);
    $builtIn.append(switchRow({
        label: "Use the built-in list",
        desc: "Wording and habits the story never uses: cliché phrases, naming feelings, echoing your words. Your own phrases below are added to it.",
        on: localProfile.banListBuiltIn !== false,
        onChange: on => {
            localProfile.banListBuiltIn = on;
            saveProfileToMemory();
        },
    }));
    // Plan 018: the short list, for models that redraft over a long one.
    const $which = $(`<div style="margin-top:10px;"><div class="set-desc" style="margin-bottom:6px;">Which list: the short one keeps five habits and drops the word list. GLM, DeepSeek and models like them redraft for ages over a long list.</div></div>`);
    const $editBuiltIn = $(`<button class="ps-modern-btn secondary" style="margin-top:10px; padding: 6px 12px; font-size: 0.78rem;"><i class="fa-solid fa-pen"></i> Edit the full list</button>`);
    $which.append(segmented([
        { id: "full", label: "Full list" },
        { id: "short", label: "Short list" }
    ], localProfile.banListShort ? "short" : "full", id => {
        localProfile.banListShort = id === "short";
        saveProfileToMemory();
        $editBuiltIn.toggle(!localProfile.banListShort);
    }));
    $builtIn.append($which);
    $editBuiltIn.toggle(!localProfile.banListShort);
    $editBuiltIn.on("click", editBuiltInList);
    $builtIn.append($editBuiltIn);
    c.append($builtIn);

    // ── AI SLOP DETECTOR ──
    c.append(`
        <div class="mtab-panel" style="margin-bottom:16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <div class="mtab-panel-title purple" style="margin-bottom:0;"><i class="fa-solid fa-radar"></i> AI Slop Detector</div>
                <button id="ps_btn_scan_slop" class="wstyle-gen-btn" style="padding: 8px 18px; font-size: 0.78rem; background: linear-gradient(135deg, #a855f7, #7c3aed);"><i class="fa-solid fa-radar"></i> Analyze Chat</button>
            </div>
            <div class="mtab-setting-row">
                <div class="set-info">
                    <div class="set-label"><i class="fa-solid fa-cat" style="color: #f43f5e; margin-right: 6px;"></i> Background Worker</div>
                    <div class="set-desc">Managed by the <b>Chomusuke</b> tab. Configure Chomusuke to offload slop analysis to a dedicated worker LLM.</div>
                </div>
            </div>

        <div class="mtab-panel" style="margin-bottom:16px;">
            <div class="mtab-panel-title red"><i class="fa-solid fa-plus-circle"></i> Add Phrase</div>
            <div style="display: flex; gap: 10px;">
                <input type="text" id="ps_manual_ban_input" class="ps-modern-input" placeholder="Manually add a phrase to ban…" style="flex: 1;" />
                <button id="ps_btn_add_ban" class="ps-modern-btn secondary" style="padding: 0 15px;">Add</button>
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div class="wstyle-section-head red" style="margin-bottom:0;"><i class="fa-solid fa-list"></i> Active Banned Phrases</div>
            <div class="mtab-btn-row">
                <input type="file" id="ps_import_bans_file" accept=".json" style="display: none;">
                <button id="ps_btn_import_bans" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #3b82f6; border-color: rgba(59, 130, 246, 0.3);"><i class="fa-solid fa-file-import"></i> Import</button>
                <button id="ps_btn_export_bans" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #10b981; border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-file-export"></i> Export</button>
                <button id="ps_btn_clear_bans" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);"><i class="fa-solid fa-trash-can"></i> Clear All</button>
            </div>
        </div>
        <div id="ps_banlist_container" class="mtab-card-list" style="min-height: 50px; padding: 10px; border: 1px dashed var(--border-color); border-radius: 10px; margin-bottom: 16px;"></div>
        
        <!-- NEW DEDICATED CONTAINER FOR THE EDITOR -->
        <div id="ban_editor_container" style="margin-bottom: 16px;"></div>

        <div class="mtab-callout purple" style="margin-top: 16px;">
            <i class="fa-solid fa-circle-info"></i>
            <span>This is a beta feature. Don't complain if you have to generate more than once.</span>
        </div>
    `);

    // --- PROMPT EDITOR UI ---
    const banEditor = renderPromptEditor({
        id: "ban_prompt_editor",
        title: "Advanced: Edit Prompts",
        defaultData: DEFAULT_PROMPTS.banList,
        currentData: localProfile.banListCustomPrompts,
        enabled: localProfile.banListCustomPromptsEnabled, // <-- NEW
        onToggle: (val) => { 
            localProfile.banListCustomPromptsEnabled = val; 
            syncPromptsGlobally('banList', 'banListCustomPromptsEnabled', val);
            saveProfileToMemory(); 
        },
        fields: [
            { key: "systemPrompt", label: "System Prompt", hint: "AI role definition." },
            { key: "userPrompt", label: "User Task Prompt", hint: "Tokens: <code>{{chatHistory}}</code>" },
            { key: "thinkingPrompt", label: "Thinking Instructions", hint: "Must include output ordering instructions." },
            { key: "injectionTemplate", label: "Ban List Injection Template", hint: "Tokens: <code>{{banItems}}</code>" }
        ],
        onSave: (val, key) => {
            if (!localProfile.banListCustomPrompts) localProfile.banListCustomPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.banList));
            localProfile.banListCustomPrompts[key] = val;
            syncPromptsGlobally('banList', 'banListCustomPrompts', localProfile.banListCustomPrompts);
            saveProfileDebounced();
            return localProfile.banListCustomPrompts;
        },
        onReset: () => {
            localProfile.banListCustomPrompts = null;
            syncPromptsGlobally('banList', 'banListCustomPrompts', null);
            saveProfileToMemory();
        }
    });
    
    // RELIABLY INJECT THE EDITOR INTO THE CONTAINER WE JUST MADE
    c.find('#ban_editor_container').append(banEditor);

    const renderTags = () => {
        const box = $("#ps_banlist_container"); box.empty();
        if (localProfile.banList.length === 0) { box.append(`<span style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">No phrases banned yet.</span>`); $("#ban_header_badge").html(`<i class="fa-solid fa-ban" style="font-size:0.6rem;"></i> 0 Banned`); return; }
        localProfile.banList.forEach(phrase => {
            const tEl = $(`<div class="mtab-ban-item">
                <span style="padding-right: 15px;">${phrase}</span>
                <i class="fa-solid fa-xmark"></i>
            </div>`);
            tEl.on("click", () => { localProfile.banList = localProfile.banList.filter(p => p !== phrase); saveProfileToMemory(); renderTags(); }); box.append(tEl);
        });
        // Update header badge dynamically
        $("#ban_header_badge").html(`<i class="fa-solid fa-ban" style="font-size:0.6rem;"></i> ${localProfile.banList.length} Banned`);
    }; renderTags();

    $("#ps_btn_add_ban").on("click", () => {
        const val = $("#ps_manual_ban_input").val().trim();
        if (val && !localProfile.banList.includes(val)) { localProfile.banList.push(val); saveProfileToMemory(); $("#ps_manual_ban_input").val(""); renderTags(); }
    });
    $("#ps_btn_clear_bans").on("click", () => {
        if (localProfile.banList.length === 0) return;
        if (confirm("Are you sure you want to delete all banned phrases?")) { localProfile.banList = []; saveProfileToMemory(); renderTags(); toastr.info("Ban list cleared."); }
    });
    $("#ps_btn_export_bans").on("click", () => {
        if (!localProfile.banList || localProfile.banList.length === 0) return toastr.warning("Ban list is empty!");
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(localProfile.banList, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `banlist_${localProfile.id || 'export'}.json`);
        document.body.appendChild(dlAnchorElem);
        dlAnchorElem.click();
        document.body.removeChild(dlAnchorElem);
    });
    $("#ps_btn_import_bans").on("click", () => {
        $("#ps_import_bans_file").trigger("click");
    });
    $("#ps_import_bans_file").on("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (evt) {
            try {
                const imported = JSON.parse(evt.target.result);
                if (Array.isArray(imported)) {
                    let added = 0;
                    imported.forEach(p => {
                        if (typeof p === 'string' && !localProfile.banList.includes(p.trim()) && p.trim().length > 0) {
                            localProfile.banList.push(p.trim());
                            added++;
                        }
                    });
                    saveProfileToMemory();
                    renderTags();
                    if (added > 0) toastr.success(`Imported ${added} phrases!`);
                    else toastr.info("No new phrases imported.");
                } else {
                    toastr.error("Invalid JSON format. Expected an array of strings.");
                }
            } catch (err) {
                toastr.error("Error parsing JSON file.");
            }
        };
        reader.readAsText(file);
        $(this).val('');
    });
    $("#ps_btn_scan_slop").on("click", async function () {
        const chatText = getCleanedChatHistory();
        if (chatText.length < 50) return toastr.warning("Not enough chat history to analyze!");
        $(this).prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...`);
        let rawResponse = await runWithChomusuke("banList", () => analyzeSlopDirectly(chatText));
        if (rawResponse) {
            const newPhrases = rawResponse.split(/[,*\n-]/).map(t => t.trim().replace(/['"\[\]\.]/g, '')).filter(t => t.length > 3);
            let addedCount = 0;
            newPhrases.forEach(p => { if (!localProfile.banList.includes(p)) { localProfile.banList.push(p); addedCount++; } });
            if (addedCount > 0) { saveProfileToMemory(); renderTags(); toastr.success(`Caught and banned ${addedCount} repetitive phrases!`); } else { toastr.info("No new repetitive phrases found."); }
        }
        $(this).prop("disabled", false).html(`<i class="fa-solid fa-radar"></i> Analyze Chat History`);
    });
}
