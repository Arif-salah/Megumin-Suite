// ────────────────────────────────────────────────────────────────────────────
// Side Panel — popping tracker blocks out of the chat.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../core/state.js";
import { extension_settings, saveSettingsDebounced } from "../../st.js";
import { meguminScheduleBlocksRefresh } from "../../features/blocks/chat.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../core/profile.js";
import {
    getSidePanelSettings, applyInlineHidingChange, applyPositionChange, applyWidthChange,
    applyEnabledChange, applyModeChange, applyScaleChange, applySectionOrder,
    resetSectionLayout, getOrderedSections, getPresentBarSettings, applyPresentBarChange,
    refreshSidePanel, refreshPresentBar,
} from "../../sidepanel/panel.js";

export function renderSidePanelTab(c) {
    c.empty();
    const cfg = getSidePanelSettings();
    const pb = getPresentBarSettings();

    const enabledBadge = `<div id="megsp_header_badge" class="mtab-header-badge" style="background: ${cfg.enabled ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.06)'}; color: ${cfg.enabled ? '#f59e0b' : 'var(--text-muted)'}; border: 1px solid ${cfg.enabled ? 'rgba(245,158,11,0.25)' : 'var(--border-color)'};">
        <i class="fa-solid fa-${cfg.enabled ? 'circle-check' : 'circle-xmark'}" style="font-size:0.6rem;"></i> ${cfg.enabled ? 'Enabled' : 'Disabled'}
    </div>`;

    const isDocked = cfg.mode !== "floating";
    const sectionRows = getOrderedSections(cfg).map((def, i) => `
        <div class="mtab-toggle-row meg-sp-section-toggle ${cfg.sections[def.id]?.visible !== false ? 'active' : ''}" data-section="${def.id}">
            <div class="toggle-info">
                <div class="toggle-label"><span class="meg-sp-order-num">${i + 1}</span><i class="fa-solid ${def.icon}" style="color: var(--gold);"></i> ${def.title}</div>
            </div>
            <div class="ps-switch"></div>
        </div>
    `).join("");

    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #f59e0b, #b45309);">
                     <i class="fa-solid fa-table-columns"></i>
                </div>
                <div>
                    <h2>Side Panel</h2>
                    <p>Dockable / floatable tracker panel. Drag it by the header when floating, resize from the edge, reorder sections. Updates automatically as the AI replies.</p>
                </div>
            </div>
            ${enabledBadge}
        </div>

        <div class="mtab-callout green" style="margin-bottom: 16px;">
            <i class="fa-solid fa-heart"></i>
            <span><strong>Maintained by LukaTheHero</strong> in this fork. Upstream stopped developing the
            panel; here it keeps up with everything the chat card can draw. Every block in the stack
            &mdash; Choices, Dice, Bonds, Character Sheet, NPC updates and any custom block you add in
            the BLOCKS tab &mdash; gets its own section, drawn by the same renderers as the card, so new
            blocks show up here automatically. Toggle and reorder them below like any other section.</span>
        </div>

        <div class="mtab-toggle-row ${cfg.enabled ? 'active' : ''}" id="megsp_enabled_row" style="margin-bottom: 20px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-table-columns" style="color:var(--gold);"></i> Enable Side Panel</div>
                <div class="toggle-desc">Mounts the panel on the page. When off, trackers stay inline in the chat as usual.</div>
            </div>
            <div class="ps-switch"></div>
        </div>

        <div id="megsp_main_content" style="display: ${cfg.enabled ? 'block' : 'none'};">
            <div class="meg-sp-group-head"><i class="fa-solid fa-window-maximize"></i> Panel</div>

            <div class="meg-sp-settings-row">
                <div>
                    <div class="label">Mode</div>
                    <div class="desc">Docked pins the panel to a screen edge; Floating turns it into a draggable, resizable window.</div>
                </div>
                <div class="control">
                    <select id="megsp_mode" class="ps-modern-input" style="min-width: 140px;">
                        <option value="docked" ${isDocked ? "selected" : ""}>Docked</option>
                        <option value="floating" ${!isDocked ? "selected" : ""}>Floating</option>
                    </select>
                </div>
            </div>

            <div class="meg-sp-settings-row" id="megsp_position_row" style="${isDocked ? "" : "display:none;"}">
                <div>
                    <div class="label">Docked edge</div>
                    <div class="desc">Which edge of the screen the panel anchors to.</div>
                </div>
                <div class="control">
                    <select id="megsp_position" class="ps-modern-input" style="min-width: 140px;">
                        <option value="right" ${cfg.position === "right" ? "selected" : ""}>Right</option>
                        <option value="left" ${cfg.position === "left" ? "selected" : ""}>Left</option>
                    </select>
                </div>
            </div>

            <div class="meg-sp-settings-row" id="megsp_width_row" style="${isDocked ? "" : "display:none;"}">
                <div>
                    <div class="label">Docked width</div>
                    <div class="desc">You can also drag the panel's inner edge to resize. Mobile clamps to 94% of viewport.</div>
                </div>
                <div class="control">
                    <input id="megsp_width" type="number" min="320" max="1100" step="10" value="${cfg.width || 620}" class="ps-modern-input" style="width: 110px;" />
                    <span style="color: var(--text-muted); font-size: 12px;">px</span>
                </div>
            </div>

            <div class="meg-sp-settings-row">
                <div>
                    <div class="label">UI scale</div>
                    <div class="desc">Zoom the whole panel — text, cards, avatars, everything.</div>
                </div>
                <div class="control">
                    <input id="megsp_scale" type="range" min="0.8" max="1.4" step="0.05" value="${cfg.scale || 1}" style="width: 140px;" />
                    <span id="megsp_scale_val" style="color: var(--text-muted); font-size: 12px; min-width: 42px; text-align: right;">${Math.round((cfg.scale || 1) * 100)}%</span>
                </div>
            </div>

            <div class="meg-sp-settings-row">
                <div>
                    <div class="label">Reset floating position</div>
                    <div class="desc">Brings a lost floating panel back on screen at the default spot and size.</div>
                </div>
                <div class="control"><button id="megsp_float_reset" class="ps-modern-btn secondary"><i class="fa-solid fa-crosshairs"></i> Reset</button></div>
            </div>

            <div class="meg-sp-group-head"><i class="fa-solid fa-layer-group"></i> Sections</div>

            <div class="meg-sp-settings-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
                <div>
                    <div class="label">Sections to show</div>
                    <div class="desc">Toggle visibility. Numbers show current panel order — Alt+↑/↓ on a section's grip (in the panel) reorders it.</div>
                </div>
                <div class="meg-sp-section-grid">
                    ${sectionRows}
                </div>
            </div>

            <div class="mtab-toggle-row ${cfg.autoHideEmpty ? 'active' : ''}" id="megsp_autohide_row">
                <div class="toggle-info">
                    <div class="toggle-label">Hide sections with no data</div>
                    <div class="toggle-desc">Sections with nothing to show disappear instead of rendering an empty shell.</div>
                </div>
                <div class="ps-switch"></div>
            </div>

            <div class="meg-sp-settings-row">
                <div>
                    <div class="label">Reset section layout</div>
                    <div class="desc">Restores default order, visibility, and open/closed states.</div>
                </div>
                <div class="control"><button id="megsp_sections_reset" class="ps-modern-btn secondary"><i class="fa-solid fa-rotate-left"></i> Reset</button></div>
            </div>

            <div class="meg-sp-group-head"><i class="fa-solid fa-users"></i> Present Characters Bar</div>

            <div class="mtab-toggle-row ${pb.enabled ? 'active' : ''}" id="megpb_enabled_row">
                <div class="toggle-info">
                    <div class="toggle-label">Enable Present Characters Bar</div>
                    <div class="toggle-desc">A Doom-style horizontal portrait strip next to the chat input. Pulls the cast from the AI's World State NPCs Present, portraits from the NPC Bank.</div>
                </div>
                <div class="ps-switch"></div>
            </div>

            <div class="meg-sp-settings-row">
                <div>
                    <div class="label">Bar position</div>
                    <div class="desc">Where the strip mounts relative to SillyTavern's message input.</div>
                </div>
                <div class="control">
                    <select id="megpb_position" class="ps-modern-input" style="min-width: 160px;">
                        <option value="above" ${pb.position === "above" ? "selected" : ""}>Above input</option>
                        <option value="below" ${pb.position === "below" ? "selected" : ""}>Below input</option>
                        <option value="off"   ${pb.position === "off"   ? "selected" : ""}>Off (hide)</option>
                    </select>
                </div>
            </div>

            <div class="meg-sp-settings-row">
                <div>
                    <div class="label">Card size</div>
                    <div class="desc">Width × height of each portrait card in the strip.</div>
                </div>
                <div class="control">
                    <input id="megpb_card_w" type="number" min="80" max="240" step="5" value="${pb.cardWidth || 120}" class="ps-modern-input" style="width: 80px;" />
                    <span style="color: var(--text-muted); font-size: 12px;">×</span>
                    <input id="megpb_card_h" type="number" min="100" max="320" step="5" value="${pb.cardHeight || 160}" class="ps-modern-input" style="width: 80px;" />
                    <span style="color: var(--text-muted); font-size: 12px;">px</span>
                </div>
            </div>

            <div class="meg-sp-group-head"><i class="fa-solid fa-screwdriver-wrench"></i> Advanced</div>

            <div class="mtab-toggle-row ${cfg.hideInline ? 'active' : ''}" id="megsp_hideinline_row">
                <div class="toggle-info">
                    <div class="toggle-label">Hide inline tracker blocks in chat</div>
                    <div class="toggle-desc">Removes the <code>&lt;details&gt;</code> tracker blocks from the rendered chat DOM (they stay in the saved message so re-parsing keeps working).</div>
                </div>
                <div class="ps-switch"></div>
            </div>

            <div class="meg-sp-settings-row">
                <div>
                    <div class="label">Force refresh</div>
                    <div class="desc">Re-parse the latest assistant message and rebuild the panel right now.</div>
                </div>
                <div class="control"><button id="megsp_refresh" class="ps-modern-btn primary"><i class="fa-solid fa-rotate"></i> Refresh</button></div>
            </div>

            <div class="meg-sp-settings-row">
                <div>
                    <div class="label">Reset all side-panel settings</div>
                    <div class="desc">Wipes every setting on this tab back to defaults. Debug console handle: <code>window.LukaSuite</code></div>
                </div>
                <div class="control"><button id="megsp_reset_all" class="ps-modern-btn secondary" style="color: #ef4444; border-color: rgba(239,68,68,0.3);"><i class="fa-solid fa-trash"></i> Reset all</button></div>
            </div>
        </div>
    `);

    // ── Panel group ──
    c.find("#megsp_enabled_row").on("click", function () {
        cfg.enabled = !cfg.enabled;
        saveSettingsDebounced();
        applyEnabledChange();
        refreshSidePanel();
        meguminScheduleBlocksRefresh();
        if (cfg.enabled) {
            $(this).addClass("active");
            $("#megsp_main_content").slideDown(200);
            $("#megsp_header_badge").css({ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', 'border-color': 'rgba(245,158,11,0.25)' }).html(`<i class="fa-solid fa-circle-check" style="font-size:0.6rem;"></i> Enabled`);
        } else {
            $(this).removeClass("active");
            $("#megsp_main_content").slideUp(200);
            $("#megsp_header_badge").css({ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', 'border-color': 'var(--border-color)' }).html(`<i class="fa-solid fa-circle-xmark" style="font-size:0.6rem;"></i> Disabled`);
        }
    });
    c.find("#megsp_mode").on("change", function () {
        cfg.mode = $(this).val();
        saveSettingsDebounced();
        applyModeChange();
        refreshSidePanel();
        const docked = cfg.mode === "docked";
        $("#megsp_position_row, #megsp_width_row").toggle(docked);
    });
    c.find("#megsp_position").on("change", function () {
        cfg.position = $(this).val();
        saveSettingsDebounced();
        applyPositionChange();
    });
    c.find("#megsp_width").on("input change", function () {
        const v = Math.max(320, Math.min(1100, parseInt($(this).val(), 10) || 620));
        cfg.width = v;
        saveSettingsDebounced();
        applyWidthChange();
    });
    c.find("#megsp_scale").on("input", function () {
        cfg.scale = parseFloat($(this).val()) || 1;
        $("#megsp_scale_val").text(Math.round(cfg.scale * 100) + "%");
        applyScaleChange();
    });
    c.find("#megsp_scale").on("change", function () {
        saveSettingsDebounced();
    });
    c.find("#megsp_float_reset").on("click", function () {
        cfg.float = { x: null, y: null, w: 620, h: 720 };
        saveSettingsDebounced();
        applyModeChange();
        toastr.success("Floating position reset", "Megumin Suite");
    });

    // ── Sections group ──
    c.find(".meg-sp-section-toggle").on("click", function () {
        const key = $(this).attr("data-section");
        if (!cfg.sections[key]) return;
        cfg.sections[key].visible = !cfg.sections[key].visible;
        $(this).toggleClass("active", cfg.sections[key].visible);
        saveSettingsDebounced();
        refreshSidePanel();
    });
    c.find("#megsp_autohide_row").on("click", function () {
        cfg.autoHideEmpty = !cfg.autoHideEmpty;
        $(this).toggleClass("active", cfg.autoHideEmpty);
        saveSettingsDebounced();
        refreshSidePanel();
    });
    c.find("#megsp_sections_reset").on("click", function () {
        resetSectionLayout();
        renderSidePanelTab(c);
        toastr.success("Section layout reset", "Megumin Suite");
    });

    // ── Present Characters Bar group ──
    c.find("#megpb_enabled_row").on("click", function () {
        pb.enabled = !pb.enabled;
        $(this).toggleClass("active", pb.enabled);
        saveSettingsDebounced();
        applyPresentBarChange();
    });
    c.find("#megpb_position").on("change", function () {
        pb.position = $(this).val();
        saveSettingsDebounced();
        applyPresentBarChange();
    });
    c.find("#megpb_card_w").on("input change", function () {
        const v = Math.max(80, Math.min(240, parseInt($(this).val(), 10) || 120));
        pb.cardWidth = v;
        saveSettingsDebounced();
        applyPresentBarChange();
    });
    c.find("#megpb_card_h").on("input change", function () {
        const v = Math.max(100, Math.min(320, parseInt($(this).val(), 10) || 160));
        pb.cardHeight = v;
        saveSettingsDebounced();
        applyPresentBarChange();
    });

    // ── Advanced group ──
    c.find("#megsp_hideinline_row").on("click", function () {
        cfg.hideInline = !cfg.hideInline;
        $(this).toggleClass("active", cfg.hideInline);
        saveSettingsDebounced();
        applyInlineHidingChange();
        meguminScheduleBlocksRefresh();
    });
    c.find("#megsp_refresh").on("click", function () {
        refreshSidePanel();
        refreshPresentBar();
        toastr.success("Side panel refreshed", "Megumin Suite");
    });
    c.find("#megsp_reset_all").on("click", function () {
        if (!confirm("Reset ALL side-panel settings to defaults?")) return;
        delete extension_settings["Megumin-Suite"].sidePanel;
        delete extension_settings["Megumin-Suite"].presentBar;
        saveSettingsDebounced();
        applyEnabledChange();
        applyPresentBarChange();
        refreshSidePanel();
        meguminScheduleBlocksRefresh();
        renderSidePanelTab(c);
        toastr.success("Side-panel settings reset", "Megumin Suite");
    });
}
