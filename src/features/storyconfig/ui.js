// ──────────────────────────────────────────────────────────────────────────────
// The Story Config tab and the prose-style editor.
//
// UI only — the field definitions and the block they compile into live next door
// in config.js, which profile.js and the dict builder both depend on.
// ──────────────────────────────────────────────────────────────────────────────

import { extension_settings, saveSettingsDebounced } from "../../st.js";
import { extensionName } from "../../core/constants.js";
import { localProfile } from "../../core/state.js";
import { engineLocksStyle, lockedStyleIdFor } from "../../core/engines.js";
import { getCharacterKey } from "../../core/keys.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../core/profile.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { meguminStoryConfigSyncs, meguminSetStoryConfigSyncs, meguminStoryConfigHostSynced } from "../../core/sync.js";
import { hardcodedLogic } from "../../../data/database.js";
import { escapeHtmlAttr, fieldPlaceholder } from "../../utils/html.js";
import { cleanAIOutput } from "../../engine/chatText.js";
import { useMeguminEngine, runMeguminTask, runWithChomusuke } from "../../engine/tasks.js";
import { storyConfigFields, getAllConfigPresets, applyStoryConfigDefaults, isStandingConfigField } from "./config.js";

// -------------------------------------------------------------
// STORY CONFIG (<config> block → [[config]])
// -------------------------------------------------------------

// Builds the Config pane. Text fields save on input (debounced) so typing never re-renders
// and never steals focus; only structural changes re-render the whole tab.
// The "does Story Config travel with the tab's Global switch" row.
//
// Split out because it redraws itself on click rather than re-rendering the whole
// section: the section holds text inputs, and re-rendering while somebody may be
// mid-edit would steal focus for a control that has nothing to do with them.
function buildConfigSyncRow() {
    const row = $(`<div class="cfg-sync-row"></div>`);

    const paint = () => {
        const on = meguminStoryConfigSyncs();
        const hostOn = meguminStoryConfigHostSynced();
        row.html(`
            <div class="cfg-sync-text">
                <span class="cfg-sync-label"><i class="fa-solid fa-earth-americas"></i> Share Story Config with every character</span>
                <span class="cfg-sync-desc">${hostOn
                    ? (on
                        ? "These fields are copied to every character along with the rest of this tab."
                        : "The engine and CoT choice still go everywhere. These fields stay with this character.")
                    : "Only applies once this tab's <strong>Global</strong> switch is on. It is off, so nothing is being copied anywhere."}</span>
            </div>
            <button class="ws-btn-small cfg-sync-btn" id="cfg_sync_toggle"
                    style="${hostOn
                        ? (on ? "color:#10b981; border-color:rgba(16,185,129,0.45);" : "color:var(--gold); border-color:rgba(245,158,11,0.3);")
                        : "opacity:0.55;"}">
                <i class="fa-solid fa-earth-americas"></i> ${on ? "On" : "Off"}
            </button>`);
    };

    paint();

    row.on("click", "#cfg_sync_toggle", () => {
        const next = !meguminStoryConfigSyncs();
        meguminSetStoryConfigSyncs(next);
        paint();
        // Turning it back on has to catch up: the other profiles missed every
        // change made while it was off, so one save re-broadcasts the current
        // values. Turning it off broadcasts nothing and leaves what is already
        // out there alone — undoing a share nobody asked to undo would be worse.
        if (next) saveProfileToMemory();
        if (!meguminStoryConfigHostSynced()) {
            toastr.info("Saved. It takes effect when this tab's Global switch is on.", "Megumin Suite");
        } else {
            toastr.success(next
                ? "Story Config now travels with the other settings on this tab."
                : "Story Config stays with this character now.", "Megumin Suite");
        }
    });

    return row;
}

export function buildStoryConfigSection() {
    const cfg = localProfile.storyConfig;
    // The standing fields can never be drawn blank: their dropdown has no
    // "Preset default" row to select, so an empty value would show the wrong option.
    applyStoryConfigDefaults(cfg);
    const sec = $(`<div class="ws-section" id="sec-config"></div>`);

    sec.append(`<h3 style="margin-top: 0; color: var(--gold); font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;"><i class="fa-solid fa-sliders"></i> Story Config</h3>`);

    // No master toggle: the block is always injected. Anything left on Preset default
    // still emits no line, so "off" is expressed per field rather than for the whole
    // block -- which is what people were reaching for the toggle to do anyway.
    sec.append(`<div class="cfg-master-desc" style="margin-bottom: 10px;">Standing settings for the whole story. Anything left on preset default is left to your preset.</div>`);

    // ── GLOBAL SYNC OPT-OUT ──
    //
    // These fields sit on the PRESETS & COT tab, so the tab's Global switch
    // carries them along with the engine and CoT choice. That bundles the setup
    // (which people do want everywhere) with the story itself (which they often
    // do not — a horror chat and a slice-of-life chat want different genres).
    // The button is drawn greyed when the host tab is not global at all, because
    // then nothing broadcasts and this decides nothing.
    sec.append(buildConfigSyncRow());

    // ── PRESET BAR ──
    const presets = getAllConfigPresets();
    let presetOpts = `<option value="">Load a config preset…</option>`;
    presetOpts += `<optgroup label="Built-in">`;
    presets.filter(p => p.builtin).forEach(p => { presetOpts += `<option value="${p.id}">${p.name}</option>`; });
    presetOpts += `</optgroup>`;
    const savedPresets = presets.filter(p => !p.builtin);
    if (savedPresets.length) {
        presetOpts += `<optgroup label="My Presets">`;
        savedPresets.forEach(p => { presetOpts += `<option value="${p.id}">${p.name}</option>`; });
        presetOpts += `</optgroup>`;
    }

    const presetBar = $(`
        <div class="cfg-preset-bar">
            <select id="cfg_preset_select" class="ps-modern-input" style="flex: 1; min-width: 160px; cursor: pointer;">${presetOpts}</select>
            <button class="ws-btn-small" id="cfg_preset_load"><i class="fa-solid fa-download"></i> Load</button>
            <button class="ws-btn-small" id="cfg_preset_save" style="color:#10b981; border-color: rgba(16,185,129,0.35);"><i class="fa-solid fa-floppy-disk"></i> Save Current</button>
            <button class="ws-btn-small" id="cfg_preset_delete" style="color:#ef4444; border-color: rgba(239,68,68,0.3);"><i class="fa-solid fa-trash"></i></button>
            <button class="ws-btn-small" id="cfg_reset_all" style="margin-left:auto;"><i class="fa-solid fa-rotate-left"></i> Reset All</button>
        </div>
    `);

    presetBar.find("#cfg_preset_load").on("click", () => {
        const pid = presetBar.find("#cfg_preset_select").val();
        if (!pid) { toastr.info("Pick a preset first."); return; }
        const p = getAllConfigPresets().find(x => x.id === pid);
        if (!p) return;
        storyConfigFields.forEach(f => { cfg[f.key] = p.values[f.key] || ""; });
        applyStoryConfigDefaults(cfg);
        saveProfileToMemory();
        fireRefreshHook(REFRESH.SWITCH_TAB);
        toastr.success(`Loaded "${p.name}".`);
    });

    presetBar.find("#cfg_preset_save").on("click", () => {
        const name = prompt("Name this config preset:");
        if (!name || !name.trim()) return;
        const values = {};
        storyConfigFields.forEach(f => { values[f.key] = cfg[f.key] || ""; });
        extension_settings[extensionName].configPresets.push({
            id: "cfgp_" + Date.now(),
            name: name.trim(),
            builtin: false,
            values
        });
        saveSettingsDebounced();
        fireRefreshHook(REFRESH.SWITCH_TAB);
        toastr.success(`Saved "${name.trim()}".`);
    });

    presetBar.find("#cfg_preset_delete").on("click", () => {
        const pid = presetBar.find("#cfg_preset_select").val();
        if (!pid) { toastr.info("Pick a preset first."); return; }
        const p = getAllConfigPresets().find(x => x.id === pid);
        if (!p) return;
        if (p.builtin) { toastr.warning("Built-in presets can't be deleted."); return; }
        if (!confirm(`Delete the preset "${p.name}"?`)) return;
        extension_settings[extensionName].configPresets = extension_settings[extensionName].configPresets.filter(x => x.id !== pid);
        saveSettingsDebounced();
        fireRefreshHook(REFRESH.SWITCH_TAB);
        toastr.success("Preset deleted.");
    });

    presetBar.find("#cfg_reset_all").on("click", () => {
        if (!confirm("Set every setting back to preset default?")) return;
        storyConfigFields.forEach(f => { cfg[f.key] = ""; });
        applyStoryConfigDefaults(cfg);
        saveProfileToMemory();
        fireRefreshHook(REFRESH.SWITCH_TAB);
    });

    sec.append(presetBar);

    // ── FIELD ROWS ──
    const fieldWrap = $(`<div class="cfg-fields"></div>`);

    storyConfigFields.forEach(f => {
        const val = cfg[f.key] || "";
        const isOn = String(val).trim() !== "";

        const isOpen = openConfigRow === f.key;
        const summaryFor = v => {
            const t = String(v || "").trim();
            if (t === "") return f.defaultLabel ? `Preset default — ${f.defaultLabel}` : "Preset default";
            // Show the option's short label rather than the long text the model reads.
            const match = (f.options || []).find(o => typeof o !== "string" && o.value === t);
            return match ? match.label : t;
        };

        const row = $(`
            <div class="cfg-row ${isOn ? 'on' : ''} ${isOpen ? 'open' : ''}" data-key="${f.key}">
                <div class="cfg-row-head">
                    <span class="cfg-row-label"><i class="fa-solid ${f.icon}" style="color:${f.color};"></i> ${f.label}</span>
                    <span class="cfg-row-summary">${escapeHtmlAttr(summaryFor(val))}</span>
                    <i class="fa-solid fa-chevron-down cfg-row-chev"></i>
                </div>
                <div class="cfg-row-body">
                    <div class="cfg-row-hint">${f.hint}</div>
                    <div class="cfg-row-control"></div>
                </div>
            </div>
        `);
        const control = row.find(".cfg-row-control");

        // One row open at a time keeps the list readable at fifteen settings.
        row.find(".cfg-row-head").on("click", () => {
            const willOpen = !row.hasClass("open");
            fieldWrap.find(".cfg-row").removeClass("open");
            row.toggleClass("open", willOpen);
            openConfigRow = willOpen ? f.key : null;
        });

        const markState = () => {
            const now = String(cfg[f.key] || "").trim() !== "";
            row.toggleClass("on", now);
            row.find(".cfg-row-summary").text(summaryFor(cfg[f.key]));
        };

        if (f.type === "select") {
            // An option is either a plain string, or { label, value } when the value the
            // model reads is longer than the words that belong in a dropdown.
            const opList = f.options.map(o => typeof o === "string" ? { label: o, value: o } : o);
            const isCustom = isOn && !opList.some(o => o.value === val);
            // Fields with a named default (friction: normal, npc_disposition: ordinary,
            // narrator_presence: light) name it here — picking it still drops the line,
            // because the preset already behaves that way.
            const defLabel = f.defaultLabel ? `Preset default — ${f.defaultLabel}` : `Preset default`;
            // A standing field always reaches the model, so it has no "leave it to the
            // preset" state and its dropdown does not offer one.
            let opts = isStandingConfigField(f.key)
                ? ""
                : `<option value="" ${!isOn ? 'selected' : ''}>${defLabel}</option>`;
            opList.forEach(o => {
                opts += `<option value="${escapeHtmlAttr(o.value)}" ${val === o.value ? 'selected' : ''}>${o.label}</option>`;
            });
            opts += `<option value="__custom" ${isCustom ? 'selected' : ''}>Write my own…</option>`;

            const sel = $(`<select class="ps-modern-input cfg-select" style="width:100%; cursor:pointer;">${opts}</select>`);
            const customBox = $(`<input type="text" class="ps-modern-input cfg-custom" style="width:100%; margin-top:8px; display:${isCustom ? 'block' : 'none'};" placeholder="${escapeHtmlAttr(f.customPlaceholder || `Write it your own way`)}" value="${isCustom ? escapeHtmlAttr(val) : ''}" />`);

            sel.on("change", function () {
                const v = $(this).val();
                if (v === "__custom") {
                    customBox.show().trigger("focus");
                    cfg[f.key] = customBox.val() || "";
                } else {
                    customBox.hide();
                    cfg[f.key] = v;
                }
                saveProfileToMemory();
                markState();
            });
            customBox.on("input", function () {
                cfg[f.key] = $(this).val();
                saveProfileDebounced();
                markState();
            });

            control.append(sel).append(customBox);
        } else if (f.type === "textarea") {
            const ta = $(`<textarea class="ps-modern-input" rows="3" style="width:100%; resize:vertical;" placeholder="${escapeHtmlAttr(fieldPlaceholder(f))}"></textarea>`);
            ta.val(val);
            ta.on("input", function () {
                cfg[f.key] = $(this).val();
                saveProfileDebounced();
                markState();
            });
            control.append(ta);
        } else {
            const inp = $(`<input type="text" class="ps-modern-input" style="width:100%;" placeholder="${escapeHtmlAttr(fieldPlaceholder(f))}" />`);
            inp.val(val);
            inp.on("input", function () {
                cfg[f.key] = $(this).val();
                saveProfileDebounced();
                markState();
            });
            control.append(inp);

            if (f.chips && f.chips.length) {
                const chipWrap = $(`<div class="cfg-chips"></div>`);

                const refreshChips = () => {
                    const cur = String(inp.val() || "").trim();
                    const parts = cur.split(",").map(s => s.trim()).filter(Boolean);
                    chipWrap.find(".cfg-chip").each(function () {
                        const cd = $(this).data("chip");
                        $(this).toggleClass("selected", cd.replace ? cur === cd.value : parts.includes(cd.value));
                    });
                };

                f.chips.forEach(raw => {
                    // A chip is either a plain string (adds to a comma list) or
                    // { label, value, replace } for one that drops in a whole clause.
                    const cd = typeof raw === "string" ? { label: raw, value: raw, replace: false } : raw;
                    const chip = $(`<span class="wstyle-tag cfg-chip">${cd.label}</span>`).data("chip", cd);

                    chip.on("click", () => {
                        let next;
                        if (cd.replace) {
                            // Clicking it again clears the field.
                            next = String(inp.val() || "").trim() === cd.value ? "" : cd.value;
                        } else {
                            const parts = String(inp.val() || "").split(",").map(s => s.trim()).filter(Boolean);
                            const at = parts.indexOf(cd.value);
                            if (at > -1) parts.splice(at, 1);
                            else parts.push(cd.value);
                            next = parts.join(", ");
                        }
                        inp.val(next);
                        cfg[f.key] = next;
                        saveProfileToMemory();
                        markState();
                        refreshChips();
                    });

                    chipWrap.append(chip);
                });

                control.append(chipWrap);
                refreshChips();
            }
        }

        fieldWrap.append(row);
    });

    sec.append(fieldWrap);
    return sec;
}

// Empty text fields say so in the box itself, so nobody has to guess what blank means.

export function renderStoryConfig(c) {
    c.empty();
    const root = $(`<div style="display: flex; flex-direction: column; height: 100%;"></div>`);

    const activeEngineForStyle = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])].find(m => m.id === localProfile.mode);
    const isLockedStyleEngine = engineLocksStyle(activeEngineForStyle);

    if (isLockedStyleEngine && !localProfile.activeStyleId) {
        const targetStyle = lockedStyleIdFor(activeEngineForStyle) || "dir_v7";

        localProfile.activeStyleId = targetStyle;
        const ds = hardcodedLogic.directStyles.find(x => x.id === targetStyle);
        if (ds) localProfile.aiRule = ds.rule;
        saveProfileToMemory();
    }

    const isOff = !localProfile.activeStyleId;
    const customCount = (localProfile.customStyles || []).length;
    const existingNames = localProfile.customStyles ? localProfile.customStyles.map(s => s.name) : [];
    const genCount = hardcodedLogic.styleTemplates.filter(t => !existingNames.includes(t.name)).length;
    const precookedCount = hardcodedLogic.directStyles.length;

    let activeStyleName = "Off";
    if (!isOff) {
        const ds = hardcodedLogic.directStyles.find(d => d.id === localProfile.activeStyleId);
        if (ds) activeStyleName = ds.name;
        else {
            const cs = (localProfile.customStyles || []).find(s => s.id === localProfile.activeStyleId);
            if (cs) activeStyleName = cs.name;
        }
    }

    // ── HEADER ──
    root.append(`
        <div class="wstyle-header">
            <div class="wstyle-header-left">
                <div class="wstyle-header-icon"><i class="fa-solid fa-sliders"></i></div>
                <div>
                    <h2>Writing Style</h2>
                    <p>Pick the prose voice the story is told in.</p>
                </div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                <div class="wstyle-active-badge ${isOff ? 'off' : ''}">
                    <i class="fa-solid ${isOff ? 'fa-power-off' : 'fa-pen-nib'}"></i>
                    ${isOff ? 'No Style' : activeStyleName}
                </div>
            </div>
        </div>
    `);

    // ── TWO COLUMN LAYOUT ──
    const layout = $(`<div class="ws-layout"></div>`);
    const sidebar = $(`<div class="ws-sidebar"></div>`);
    const mainArea = $(`<div class="ws-main"></div>`);

    // --- BUILD SIDEBAR ---
    // ── DN RATIO ──
    // Its own option at the top of the sidebar rather than an afterthought under
    // the style list: it applies to every style, so it does not belong inside the
    // list of styles you pick between. The two ends are labelled because a bare
    // pair of percentages does not say which half of the writing each one governs.
    if (!localProfile.dnRatio) localProfile.dnRatio = { enabled: false, dialogue: 50 };
    const isDNR = localProfile.dnRatio.enabled;
    const dVal = localProfile.dnRatio.dialogue;

    const dnPanel = $(`
        <div style="margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-main);"><i class="fa-solid fa-scale-balanced" style="color: #3b82f6; margin-right: 5px;"></i> DN Ratio</span>
                <div class="ps-toggle-card ${isDNR ? 'active' : ''}" id="dnr_toggle_sb" style="padding: 2px; min-width: 36px; background: transparent; border-color: ${isDNR ? '#10b981' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;">
                    <div class="ps-switch" style="transform: scale(0.65); ${isDNR ? 'background: #10b981;' : ''}"></div>
                </div>
            </div>
            <div id="dnr_body_sb" style="display: ${isDNR ? 'block' : 'none'};">
                <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 6px; margin-bottom: 6px;">
                        <div style="text-align: left; min-width: 0;">
                            <div style="font-size: 0.55rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-muted);">Narration</div>
                            <div style="font-size: 0.9rem; font-weight: 800; color: #a855f7; line-height: 1.1;"><span id="lbl_narr">${100 - dVal}</span>%</div>
                        </div>
                        <div style="text-align: right; min-width: 0;">
                            <div style="font-size: 0.55rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-muted);">Dialogue</div>
                            <div style="font-size: 0.9rem; font-weight: 800; color: #10b981; line-height: 1.1;"><span id="lbl_dial">${dVal}</span>%</div>
                        </div>
                    </div>
                    <input type="range" id="dnr_slider" min="0" max="100" step="10" value="${dVal}" style="width: 100%; accent-color: var(--gold); height: 4px; display: block;">
                    <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 0.5rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                        <span>&#9664; more narration</span>
                        <span>more dialogue &#9654;</span>
                    </div>
                </div>
            </div>
        </div>
    `);

    dnPanel.find("#dnr_toggle_sb").on("click", function (e) {
        e.stopPropagation(); localProfile.dnRatio.enabled = !localProfile.dnRatio.enabled; saveProfileToMemory(); renderStyleLibrary(c);
    });
    dnPanel.find("#dnr_slider").on("input", function () {
        let d = parseInt($(this).val()); let n = 100 - d;
        $("#lbl_dial").text(d); $("#lbl_narr").text(n);
    });
    dnPanel.find("#dnr_slider").on("change", function () {
        localProfile.dnRatio.dialogue = parseInt($(this).val()); saveProfileToMemory();
    });
    sidebar.append(dnPanel);
    sidebar.append(`<div style="height: 1px; background: var(--border-color); margin: 0 0 8px 0;"></div>`);

    sidebar.append(`<div class="ws-sidebar-title">Writing Style</div>`);

    // Off Button
    const btnOff = $(`<button class="ws-nav-btn ${isOff ? 'active-green' : ''}"><span style="display:flex; align-items:center; gap:10px;"><i class="fa-solid fa-power-off" style="color:${isLockedStyleEngine ? '#ef4444' : ''}"></i> No Style (Off)</span> ${isLockedStyleEngine ? '<i class="fa-solid fa-lock" style="color:#ef4444; font-size:0.7rem;"></i>' : ''}</button>`);
    if (!isLockedStyleEngine) {
        btnOff.on("click", () => { localProfile.activeStyleId = null; localProfile.aiRule = ""; saveProfileToMemory(); renderStyleLibrary(c); });
    } else {
        btnOff.css({"opacity":"0.6", "cursor":"not-allowed"}).attr("title", "Modern Engines require a narrative style directive.");
    }
    sidebar.append(btnOff);
    sidebar.append(`<div style="height: 1px; background: var(--border-color); margin: 8px 0;"></div>`);

    // Nav Buttons
    const btnPrecooked = $(`<button class="ws-nav-btn active"><span style="display:flex; align-items:center; gap:10px;"><i class="fa-solid fa-fire-burner"></i> Precooked</span> <span class="ws-badge">${precookedCount}</span></button>`);
    const btnCustom = $(`<button class="ws-nav-btn"><span style="display:flex; align-items:center; gap:10px;"><i class="fa-solid fa-book"></i> My Library</span> <span class="ws-badge">${customCount}</span></button>`);
    const btnGenerators = $(`<button class="ws-nav-btn"><span style="display:flex; align-items:center; gap:10px;"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Generators</span> <span class="ws-badge">${genCount}</span></button>`);

    sidebar.append(btnPrecooked).append(btnCustom).append(btnGenerators);

    layout.append(sidebar);

    // --- BUILD MAIN CONTENT SECTIONS ---
    const secPrecooked = $(`<div class="ws-section" id="sec-precooked"></div>`);
    const secCustom = $(`<div class="ws-section" id="sec-custom" style="display:none;"></div>`);
    const secGenerators = $(`<div class="ws-section" id="sec-generators" style="display:none;"></div>`);

    // A. PRECOOKED
    secPrecooked.append(`<h3 style="margin-top: 0; color: var(--gold); font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;"><i class="fa-solid fa-fire-burner"></i> Precooked Styles</h3>`);
    const gridPre = $(`<div class="ws-grid"></div>`);
    hardcodedLogic.directStyles.forEach(ds => {
        const isSel = localProfile.activeStyleId === ds.id;
        const card = $(`
            <div class="ws-card ${isSel ? 'active' : ''}">
                <div class="ws-card-title">
                    <span style="color:${isSel ? '#10b981' : 'var(--text-main)'};">${ds.name}</span>
                    ${isSel ? '<i class="fa-solid fa-check" style="color:#10b981;"></i>' : ''}
                </div>
                <div class="ws-card-desc">${ds.desc}</div>
                <div class="ws-card-rule">${ds.rule}</div>
                <div class="ws-card-actions">
                    <button class="ws-btn-small ps-btn-edit-precooked"><i class="fa-solid fa-copy"></i> Edit as Custom</button>
                </div>
            </div>
        `);
        
        card.on("click", (e) => { 
            // Prevent selecting the style if they just wanted to click the edit button
            if ($(e.target).closest("button").length) return;
            
            localProfile.activeStyleId = ds.id; 
            localProfile.aiRule = ds.rule; 
            saveProfileToMemory(); 
            renderStyleLibrary(c); 
        });
        
        // The new Edit as Custom button logic
        card.find(".ps-btn-edit-precooked").on("click", () => {
            const presetData = {
                id: "style_" + Date.now(),
                name: ds.name + " (Custom)",
                tags: [],
                generatedOptions: [],
                notes: ds.desc,
                rule: ds.rule
            };
            renderStyleEditor(c, null, presetData);
        });
        
        gridPre.append(card);
    });
    secPrecooked.append(gridPre);

    // B. CUSTOM
    secCustom.append(`<h3 style="margin-top: 0; color: #10b981; font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;"><i class="fa-solid fa-book"></i> My Library</h3>`);
    const gridCust = $(`<div class="ws-grid"></div>`);
    
    const createCard = $(`
        <div class="ws-card" style="border: 1px dashed rgba(16,185,129,0.5); background: transparent; justify-content: center; align-items: center; min-height: 120px;">
            <div style="color: #10b981; font-weight: 700; font-size: 0.9rem;"><i class="fa-solid fa-plus"></i> Create New Style</div>
        </div>
    `);
    createCard.on("click", () => renderStyleEditor(c, null));
    gridCust.append(createCard);

    if (localProfile.customStyles && localProfile.customStyles.length > 0) {
        localProfile.customStyles.forEach(style => {
            const isSel = localProfile.activeStyleId === style.id;
            const card = $(`
                <div class="ws-card ${isSel ? 'active' : ''}">
                    <div class="ws-card-title">
                        <span style="color:${isSel ? '#10b981' : 'var(--text-main)'};">${style.name}</span>
                        ${isSel ? '<i class="fa-solid fa-check" style="color:#10b981;"></i>' : ''}
                    </div>
                    <div class="ws-card-desc" style="max-height: 40px; overflow: hidden;">${style.notes || "Custom AI generated style."}</div>
                    <div class="ws-card-actions">
                        <button class="ws-btn-small ps-btn-edit"><i class="fa-solid fa-pen"></i> Edit</button>
                        <button class="ws-btn-small ps-btn-regen" style="color: var(--gold); border-color: rgba(245,158,11,0.3);"><i class="fa-solid fa-rotate-right"></i></button>
                        <button class="ws-btn-small ps-btn-delete" style="color: #ef4444; border-color: rgba(239,68,68,0.3);"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `);
            card.on("click", (e) => {
                if ($(e.target).closest("button").length) return;
                localProfile.activeStyleId = style.id; localProfile.aiRule = style.rule; saveProfileToMemory(); renderStyleLibrary(c);
            });
            card.find(".ps-btn-edit").on("click", () => renderStyleEditor(c, style.id));
            card.find(".ps-btn-delete").on("click", () => {
                if (confirm(`Delete "${style.name}"?`)) {
                    localProfile.customStyles = localProfile.customStyles.filter(s => s.id !== style.id);
                    if (localProfile.activeStyleId === style.id) { localProfile.activeStyleId = null; localProfile.aiRule = ""; }
                    saveProfileToMemory(); renderStyleLibrary(c);
                }
            });
            card.find(".ps-btn-regen").on("click", async function () {
                $(this).html(`<i class="fa-solid fa-spinner fa-spin"></i>`);
                await runWithChomusuke("styleGen", async () => {
                    const orderText = `Inspired by ${style.notes}. Write a writing style rule based on: ${style.tags.join(", ")}. Direct instructions only. 2-3 paragraphs. No fluff.`;
                    let rule = await runMeguminTask(orderText);
                    style.rule = cleanAIOutput(rule).trim();
                    if (localProfile.activeStyleId === style.id) localProfile.aiRule = style.rule;
                    saveProfileToMemory(); renderStyleLibrary(c); toastr.success("Rule Regenerated!");
                    return rule;
                });
            });
            gridCust.append(card);
        });
    }
    secCustom.append(gridCust);

    // C. GENERATORS
    secGenerators.append(`<h3 style="margin-top: 0; color: #a855f7; font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Generators</h3>`);
    const gridGen = $(`<div class="ws-grid"></div>`);
    hardcodedLogic.styleTemplates.forEach(tpl => {
        if (existingNames.includes(tpl.name)) return;
        const card = $(`
            <div class="ws-card" style="border-style: dashed; border-color: rgba(168,85,247,0.4); background: rgba(168,85,247,0.02);">
                <div class="ws-card-title" style="color: #c084fc;">${tpl.name}</div>
                <div class="ws-card-desc">${tpl.notes}</div>
                <button class="ws-btn-small ps-btn-tpl-gen" style="margin-top: 12px; width: 100%; background: rgba(168,85,247,0.1); color: #c084fc; border-color: #a855f7;">
                    <i class="fa-solid fa-bolt"></i> Generate This Style
                </button>
            </div>
        `);
        card.find(".ps-btn-tpl-gen").on("click", async function () {
            const btn = $(this); btn.prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Generating...`);
            await runWithChomusuke("styleGen", async () => {
                const orderText = `Inspired by ${tpl.notes}. Write a writing style rule based on: ${tpl.tags.join(", ")}. Direct instructions only. 2-3 paragraphs. No fluff.`;
                let rule = await runMeguminTask(orderText);
                const newId = "style_" + Date.now();
                const newStyle = { id: newId, name: tpl.name, tags: [...tpl.tags], notes: tpl.notes, rule: cleanAIOutput(rule).trim() };
                localProfile.customStyles.push(newStyle); localProfile.activeStyleId = newId; localProfile.aiRule = newStyle.rule;
                saveProfileToMemory(); renderStyleLibrary(c); toastr.success(`${tpl.name} Added!`);
                return rule;
            });
        });
        gridGen.append(card);
    });
    secGenerators.append(gridGen);

    mainArea.append(secPrecooked).append(secCustom).append(secGenerators);
    layout.append(mainArea);
    root.append(layout);
    c.append(root);

    // ── NAVIGATION LOGIC ──
    const navButtons = [btnPrecooked, btnCustom, btnGenerators];
    const sections = [secPrecooked, secCustom, secGenerators];

    const switchSection = (index) => {
        navButtons.forEach((btn, i) => {
            if (i === index) btn.addClass('active');
            else btn.removeClass('active');
        });
        sections.forEach((sec, i) => {
            if (i === index) sec.show();
            else sec.hide();
        });
    };

    btnPrecooked.on('click', () => { lastStorySection = 0; switchSection(0); });
    btnCustom.on('click', () => { lastStorySection = 1; switchSection(1); });
    btnGenerators.on('click', () => { lastStorySection = 2; switchSection(2); });

    // Re-renders (toggling a field, loading a preset, picking a style) keep you where you were.
    if (lastStorySection === null) {
        // First open: land on Precooked, unless a custom style is what's actually active.
        lastStorySection = (localProfile.activeStyleId && localProfile.activeStyleId.startsWith("style_")) ? 1 : 0;
    }
    if (lastStorySection > 2) lastStorySection = 0;
    switchSection(lastStorySection);
}

// Remembers which pane of the Writing Style tab was open across re-renders.
export let lastStorySection = null;
// Remembers which config row is expanded, so a re-render doesn't collapse what you were editing.
export let openConfigRow = null;

// Back-compat: older call sites still ask for the style library by name.
export function renderStyleLibrary(c) {
    return renderStoryConfig(c);
}

export function renderStyleEditor(c, editId, presetData = null) {

    let currentStyle = presetData ? presetData : (editId ? JSON.parse(JSON.stringify(localProfile.customStyles.find(s => s.id === editId))) : {
        id: "style_" + Date.now(), name: "", tags: [], generatedOptions: [], notes: "", rule: ""
    });

    c.empty();
    let templateOptions = `<option value="" disabled selected>✨ Load a Pre-configured Template...</option>`;
    if (hardcodedLogic.styleTemplates) {
        hardcodedLogic.styleTemplates.forEach((tpl, index) => { templateOptions += `<option value="${index}">${tpl.name}</option>`; });
    }

    // ── TEMPLATE DROPDOWN ──
    c.append(`
        <div style="margin-bottom: 16px;">
            <select id="ps_style_template_dropdown" class="ps-modern-input" style="font-weight: 600; color: var(--gold); border-color: rgba(245,158,11,0.3); cursor: pointer;">${templateOptions}</select>
        </div>
    `);

    // ── EDITOR TOP BAR ──
    c.append(`
        <div class="wstyle-editor-bar">
            <i class="fa-solid fa-pen-nib" style="color: #a855f7; font-size: 1.1rem;"></i>
            <input type="text" id="ps_style_name" value="${currentStyle.name}" placeholder="Name your style…" />
            <button id="ps_btn_save_style" class="ps-modern-btn primary" style="background: #10b981; color: #fff; padding: 8px 18px; white-space: nowrap;">
                <i class="fa-solid fa-floppy-disk"></i> Save
            </button>
            <button id="ps_btn_cancel_style" class="ps-modern-btn secondary" style="color: var(--text-muted); padding: 8px 18px; white-space: nowrap;">
                <i class="fa-solid fa-arrow-left"></i> Back
            </button>
        </div>
    `);

    // ── TEMPLATE CHANGE ──
    $("#ps_style_template_dropdown").on("change", function () {
        const tplIndex = $(this).val(); if (tplIndex === null) return;
        const chosenTpl = hardcodedLogic.styleTemplates[tplIndex];
        currentStyle.name = chosenTpl.name; currentStyle.tags = [...chosenTpl.tags]; currentStyle.notes = chosenTpl.notes; currentStyle.rule = ""; currentStyle.generatedOptions = [];
        renderStyleEditor(c, editId, currentStyle); toastr.info(`${chosenTpl.name} loaded!`);
    });

    // ── TAG CATEGORIES ──
    const tagContainer = $(`<div class="wstyle-tag-section"></div>`);
    hardcodedLogic.styles.forEach(cat => {
        const catWrap = $(`<div style="margin-bottom: 18px;"></div>`);
        catWrap.append(`<div class="wstyle-tag-cat-title">${cat.category}</div>`);
        const grid = $(`<div class="wstyle-tag-grid"></div>`);
        cat.tags.forEach(tagObj => {
            const tagName = tagObj.id; const isSel = currentStyle.tags.includes(tagName);
            const tEl = $(`<span class="wstyle-tag ${isSel ? 'selected' : ''}" data-hint="${tagObj.hint}">${tagName}</span>`);
            tEl.on("click", () => {
                if (currentStyle.tags.includes(tagName)) currentStyle.tags = currentStyle.tags.filter(t => t !== tagName); else currentStyle.tags.push(tagName);
                tEl.toggleClass("selected");
            }); grid.append(tEl);
        }); catWrap.append(grid); tagContainer.append(catWrap);
    }); c.append(tagContainer);

    // ── AI INSIGHTS PANEL ──
    c.append(`
        <div class="wstyle-insights-panel">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-sparkles" style="color: var(--gold); font-size: 0.9rem;"></i>
                    <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">AI Author Matches</span>
                </div>
                <button id="ps_btn_get_authors_style" class="ps-modern-btn secondary" style="padding: 6px 14px; font-size: 0.73rem;">
                    <i class="fa-solid fa-lightbulb"></i> Generate Insights
                </button>
            </div>
            <div id="ps_ai_author_box_style" class="wstyle-tag-grid" style="min-height: 20px; margin-bottom: 14px;"></div>
            <div style="border-top: 1px dashed var(--border-color); padding-top: 14px;">
                <input type="text" id="ps_style_notes" class="ps-modern-input" placeholder="Custom directives or inspiration notes…" value="${currentStyle.notes || ''}" />
            </div>
        </div>
    `);

    // ── FINAL RULE PANEL ──
    c.append(`
        <div class="wstyle-rule-panel">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-scroll" style="color: #a855f7; font-size: 0.85rem;"></i>
                    <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">Generated Rule</span>
                </div>
                <button id="ps_btn_generate_style" class="wstyle-gen-btn" style="padding: 8px 18px; font-size: 0.78rem;">
                    <i class="fa-solid fa-bolt"></i> Generate Writing Rule
                </button>
            </div>
            <textarea id="ps_style_rule_text" placeholder="Select tags above and click Generate…">${currentStyle.rule || ''}</textarea>
            <div class="wstyle-info-callout">
                <i class="fa-solid fa-circle-info"></i>
                <span>After generating or editing your rule, hit <strong>Save</strong> in the toolbar above to apply it to your library.</span>
            </div>
        </div>
    `);

    // ── INSIGHTS RENDERING ──
    const renderInsights = () => {
        const box = $("#ps_ai_author_box_style"); box.empty();
        (currentStyle.generatedOptions || []).forEach(tag => {
            const isSel = currentStyle.tags.includes(tag);
            const tEl = $(`<span class="wstyle-tag ${isSel ? 'selected' : ''}">${tag.replace(" ✨", "")} <i class="fa-solid fa-sparkles" style="font-size:0.55rem; margin-left:3px; color:var(--gold);"></i></span>`);
            tEl.on("click", () => {
                if (isSel) currentStyle.tags = currentStyle.tags.filter(t => t !== tag); else currentStyle.tags.push(tag);
                tEl.toggleClass("selected");
            }); box.append(tEl);
        });
    };
    renderInsights();

    // ── EVENT BINDINGS ──
    $("#ps_style_notes").on("input", function () { currentStyle.notes = $(this).val(); });
    $("#ps_style_rule_text").on("input", function () { currentStyle.rule = $(this).val(); });
    $("#ps_style_name").on("input", function () { currentStyle.name = $(this).val(); });

    $("#ps_btn_cancel_style").on("click", () => renderStyleLibrary(c));
    $("#ps_btn_save_style").on("click", () => {
        if (currentStyle.name.trim() === "") currentStyle.name = "Unnamed Style";
        if (!editId) { localProfile.customStyles.push(currentStyle); }
        else { const idx = localProfile.customStyles.findIndex(s => s.id === editId); if (idx > -1) localProfile.customStyles[idx] = currentStyle; }
        if (localProfile.activeStyleId === currentStyle.id) { localProfile.aiRule = currentStyle.rule; }
        saveProfileToMemory(); renderStyleLibrary(c); toastr.success(`Saved "${currentStyle.name}"`);
    });

    $("#ps_btn_get_authors_style").on("click", async function () {
        if (!getCharacterKey()) return toastr.warning("Open a chat or group first so I can read the context!");
        $(this).prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Brainstorming...`);
        await runWithChomusuke("styleGen", async () => {
            const orderText = `Based on the active characters and scenario, give me EXACTLY 2 famous author names or literary writing styles (e.g. Edgar Allan Poe, Jane Austen style, Dark Fantasy Author) and 5 tags that fit the rp (e.g. internet culture, femboy, virtual game) whose writing style perfectly fits the tone and world. Return ONLY the 7 items separated by a comma. Do not explain them.`;
            let aiRawOutput = await runMeguminTask(orderText);
            const aiTagsTemp = cleanAIOutput(aiRawOutput).split(",").map(t => t.trim().replace(/['"[\].]/g, '')).filter(t => t.length > 0);
            if (aiTagsTemp.length > 0) {
                currentStyle.tags = currentStyle.tags.filter(tag => !tag.endsWith("✨"));
                currentStyle.generatedOptions = aiTagsTemp.map(tag => `${tag} ✨`);
                renderInsights(); toastr.success(`Generated ${aiTagsTemp.length} insights!`);
            }
            // The answer itself, so Chomusuke's runner does not report "no output".
            return aiRawOutput;
        }); $(this).prop("disabled", false).html(`<i class="fa-solid fa-lightbulb"></i> Generate Insights`);
    });

    $("#ps_btn_generate_style").on("click", async function () {
        if (currentStyle.tags.length === 0) return toastr.warning("Select tags first!");
        $(this).prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Finalizing...`);
        await runWithChomusuke("styleGen", async () => {
            const orderText = `Create a writing style prompt based on these traits:\n\nSelected style tags: ${currentStyle.tags.join(", ")}\n\nAdditional user instructions: ${currentStyle.notes}\n\nWrite a concise, well-structured writing style rule (100 words max) that the AI must follow. Combine all tags into a cohesive directive. Write it as a direct instruction. Do not use bullet points or introductory text.`;
            let rule = await runMeguminTask(orderText);
            currentStyle.rule = cleanAIOutput(rule).trim();
            $("#ps_style_rule_text").val(currentStyle.rule); toastr.success("Live AI Rule Generated!");
            return rule;
        }); $(this).prop("disabled", false).html(`<i class="fa-solid fa-bolt"></i> Generate Writing Rule`);
    });
}
