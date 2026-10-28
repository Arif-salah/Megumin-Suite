// ────────────────────────────────────────────────────────────────────────────
// Language & Add-ons — language, pronouns, sound effects and the gameplay add-ons.
// ────────────────────────────────────────────────────────────────────────────

import { Popup, POPUP_TYPE } from "../../st.js";
import { localProfile, currentTab } from "../../core/state.js";
import { extension_settings } from "../../st.js";
import { extensionName } from "../../core/constants.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../core/profile.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { hardcodedLogic } from "../../../data/database.js";
import { meguminSlotByTrigger } from "../../../data/slots.js";
import { hasSharedFragment } from "../../core/sharedFragments.js";
import { engineUsesRenderLimits } from "../../core/engines.js";

// "You have rewritten this one in Dev Mode."
//
// An add-on card said only whether the add-on was ON. It could not say that the
// text behind it was no longer the shipped text, so a reader who reworded the
// ban list six weeks ago had no way to be reminded of it from the screen where
// they switch it on -- and when the output looked wrong, the edit they had
// forgotten was invisible.
//
// The link between a card and its slot is the trigger both already carry
// ([[Direct]], [[html]], [[MVU]] ...), so this needs no lookup table to fall out
// of date. Two dice add-ons share [[dice]] and both light up, which is right:
// the one edit applies to whichever variant is switched on.
function customBadge(triggerOwner) {
    const slot = meguminSlotByTrigger(triggerOwner && triggerOwner.trigger);
    if (!slot || !slot.key || !hasSharedFragment(slot.key)) return "";
    return `<span class="ecard-badge custom" title="You edited this in Dev Mode. It no longer uses the built-in text."><i class="fa-solid fa-pen"></i> Custom</span>`;
}

export function renderGlobalAndBlocks(c) {
    c.empty();

    const addonDescriptions = {
        "death": "Enables permanent consequences. Characters — including yours — can die for real. No safety net, no plot armor.",
        "combat": "Activates a grounded, tactical combat layer. Actions have real weight, positioning matters, and you can lose badly.",
        "direct": "Forces AI to say words like D and P. No dancing around the subject, no polite deflection. you know what i mean. <b>Not needed on V10</b> — that engine already writes this way, so switching it on just repeats the instruction.",
        "color": "Each character's dialogue is color-coded for easy visual parsing.",
        "npc_events": "Requires all new story events to grow naturally from prior context or environmental cues — no random drama out of nowhere. V6 only.",
        "html": "When a character reads something — a phone screen, a letter, a sign — the AI draws the thing itself as HTML instead of describing it. Rare by design: one per reply at most, and most replies have none.",
        "dice_all": "Same d20 system, but everyone rolls — NPCs included. Any character who tries something that can fail gets a roll, all of them listed before the reply. Use this OR Dice, not both.",
        "dice": "A d20 decides whether risky attempts land. The AI rolls before it writes the scene, so the story follows the die rather than the die following the story. The roll gets its own tab on the block card."
    };

    // Only MVU is left in this tab's Output Formats section, so only MVU needs a line
    // here. The tracker blocks' descriptions moved onto MEGUMIN_BLOCK_REGISTRY as `desc`
    // when they moved to the BLOCKS tab -- they were sitting here unreachable, because
    // the section below filters to mvu and nothing else ever reached this map.
    const blockDescriptions = {
        "mvu": "Add MVU Compatibility still in test read more here: <a href='https://github.com/KritBlade/MVU_Game_Maker' target='_blank' style='color: var(--gold); text-decoration: underline;'>https://github.com/KritBlade/MVU_Game_Maker</a>"
    };

    const activeMode = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])].find(m => m.id === localProfile.mode);
    const isV6 = activeMode && (activeMode.id.includes("v6") || activeMode.label.includes("V6"));
    // Asked for by behaviour, not by generation: the Lean/Full split is the one thing
    // V10 does not inherit from V9, and naming it that way keeps the next generation
    // from having to be excluded here by hand.
    const isV9 = engineUsesRenderLimits(activeMode);

    // ── UNIFIED HEADER ──
    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #3b82f6, #10b981);">
                    <i class="fa-solid fa-puzzle-piece"></i>
                </div>
                <div>
                    <h2>Language & Add-ons</h2>
                    <p>The story's language and your pronouns, plus the gameplay add-ons.</p>
                </div>
            </div>
            <div class="mtab-header-badge" style="background: rgba(59,130,246,0.12); color: #3b82f6; border: 1px solid rgba(59,130,246,0.25);">
                <i class="fa-solid fa-gears" style="font-size:0.6rem;"></i> ${localProfile.addons.length + localProfile.blocks.length} Active Modules
            </div>
        </div>
    `);

    // ── HINT ──
    c.append(`
        <div class="mtab-callout blue" style="margin-bottom: 20px;">
            <i class="fa-solid fa-circle-info"></i>
            <span><strong>Did you know?</strong> Global Preferences set the language and pronouns every engine reads. Gameplay Add-ons bolt extra systems onto the story — dice, death, combat, HTML props. Output Formats is just MVU, a compatibility contract with another extension. The tracker blocks live in the <b>BLOCKS</b> tab, not here.</span>
        </div>
    `);

    // ==========================================
    // ── 1. GLOBAL PREFERENCES ──
    // ==========================================
    c.append(`<div class="wstyle-section-head blue"><i class="fa-solid fa-sliders"></i> Global Preferences</div>`);
    
    const extraPanel = $(`
        <div class="mtab-panel" style="margin-bottom: 24px;">
            ${isV9 ? `
            <div class="mtab-setting-row" style="flex-direction: column; align-items: stretch; gap: 10px;">
                <div class="set-info">
                    <div class="set-label" style="color: #f43f5e;"><i class="fa-solid fa-layer-group"></i> V9 Dynamic Render Limits</div>
                    <div class="set-desc">V9 switches between Lean (quick interactions) and Full (deep scenes). Set the word count ranges for each.</div>
                </div>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <div style="flex: 1; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 2px;">LEAN RENDER</div>
                        <div style="font-size: 0.6rem; color: #a855f7; margin-bottom: 6px; line-height: 1.2;">Triggered by the AI for fast dialogue, back-and-forth arguments, and quick actions.</div>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <input type="number" id="ps_v9_lean_min" class="ps-modern-input" style="width: 100%; text-align: center;" value="${localProfile.v9Limits.leanMin}" />
                            <span style="color: var(--text-muted);">to</span>
                            <input type="number" id="ps_v9_lean_max" class="ps-modern-input" style="width: 100%; text-align: center;" value="${localProfile.v9Limits.leanMax}" />
                        </div>
                    </div>
                    <div style="flex: 1; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 2px;">FULL RENDER</div>
                        <div style="font-size: 0.6rem; color: #10b981; margin-bottom: 6px; line-height: 1.2;">Triggered by the AI for scene changes, deep immersion, and major plot events.</div>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <input type="number" id="ps_v9_full_min" class="ps-modern-input" style="width: 100%; text-align: center;" value="${localProfile.v9Limits.fullMin}" />
                            <span style="color: var(--text-muted);">to</span>
                            <input type="number" id="ps_v9_full_max" class="ps-modern-input" style="width: 100%; text-align: center;" value="${localProfile.v9Limits.fullMax}" />
                        </div>
                    </div>
                </div>
            </div>
            ` : ``}
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">Language Output</div><div class="set-desc">Leave empty for default (English)</div></div>
                <input type="text" id="ps_input_language" class="ps-modern-input" style="width: 180px;" placeholder="e.g. Arabic, French…" value="${localProfile.userLanguage || ''}" />
            </div>
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">User Gender</div><div class="set-desc">Ensure the AI addresses you correctly</div></div>
                <select id="ps_select_pronouns" class="ps-modern-input" style="width: 180px; cursor: pointer;">
                    <option value="off" ${localProfile.userPronouns === 'off' ? 'selected' : ''}>Off</option>
                    <option value="male" ${localProfile.userPronouns === 'male' ? 'selected' : ''}>Male (Him/He)</option>
                    <option value="female" ${localProfile.userPronouns === 'female' ? 'selected' : ''}>Female (Her/She)</option>
                </select>
            </div>
        </div>
    `);
    c.append(extraPanel);

    $("#ps_v9_lean_min").on("input", function () { localProfile.v9Limits.leanMin = parseInt($(this).val()) || 300; saveProfileDebounced(); });
    $("#ps_v9_lean_max").on("input", function () { localProfile.v9Limits.leanMax = parseInt($(this).val()) || 400; saveProfileDebounced(); });
    $("#ps_v9_full_min").on("input", function () { localProfile.v9Limits.fullMin = parseInt($(this).val()) || 700; saveProfileDebounced(); });
    $("#ps_v9_full_max").on("input", function () { localProfile.v9Limits.fullMax = parseInt($(this).val()) || 1200; saveProfileDebounced(); });
    $("#ps_input_language").on("input", function () { localProfile.userLanguage = $(this).val(); saveProfileDebounced(); });
    $("#ps_select_pronouns").on("change", function () { localProfile.userPronouns = $(this).val(); saveProfileToMemory(); });

    // ==========================================
    // ── 2. GAMEPLAY ADD-ONS ──
    // ==========================================
    c.append(`<div class="wstyle-section-head blue"><i class="fa-solid fa-puzzle-piece"></i> Gameplay Add-ons</div>`);
    c.append(`
        <div class="mtab-callout gold" style="margin-bottom: 16px;">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>Pick the three or four you actually want, not all of them. Every add-on is another
            system the model has to hold in mind while it writes, and past a handful the prose
            thins out as the attention goes into bookkeeping. Fewer, chosen on purpose, reads better.</span>
        </div>
    `);
    const addonGrid = $(`<div class="mtab-card-grid" style="margin-bottom: 24px;"></div>`);

    hardcodedLogic.addons.forEach(a => {
        const isSel = localProfile.addons.includes(a.id);
        let badges = '';
        if (a.recommended) badges += `<span class="ecard-badge rec"><i class="fa-solid fa-star"></i> Recommended</span>`;
        badges += customBadge(a);

        let extraClass = '';
        let v6BadgeHtml = '';
        if (a.id === "npc_events") {
            if (!isV6) {
                extraClass = 'locked-card';
                v6BadgeHtml = `<span class="ecard-badge" style="background:rgba(239,68,68,0.12);color:#ef4444;"><i class="fa-solid fa-lock"></i> Requires V6</span>`;
            } else {
                v6BadgeHtml = `<span class="ecard-badge v6-active"><i class="fa-solid fa-unlock"></i> V6 Active</span>`;
            }
        }

        const card = $(`
            <div class="mtab-eng-card ${isSel ? 'active' : ''} ${extraClass}">
                <div class="ecard-accent"></div>
                <div class="ecard-body">
                    <div class="ecard-title">
                        <span>${a.label}</span>
                        ${isSel ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> On</span>` : ''}
                    </div>
                    <p class="ecard-desc">${addonDescriptions[a.id] || ""}</p>
                    ${badges || v6BadgeHtml ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">${badges}${v6BadgeHtml}</div>` : ''}
                </div>
            </div>
        `);

        card.on("click", () => {
            if (isSel) {
                localProfile.addons = localProfile.addons.filter(i => i !== a.id);
            } else {
                // Two add-ons in the same `exclusive` group write to the same
                // prompt anchor, so switching to one has to switch the other
                // off — otherwise whichever the loop reached last would win and
                // the toggles would disagree with what was actually sent.
                if (a.exclusive) {
                    const rivals = hardcodedLogic.addons
                        .filter(o => o.id !== a.id && o.exclusive === a.exclusive)
                        .map(o => o.id);
                    localProfile.addons = localProfile.addons.filter(i => !rivals.includes(i));
                }
                localProfile.addons.push(a.id);
            }
            saveProfileToMemory(); fireRefreshHook(REFRESH.SWITCH_TAB);
        }); 
        addonGrid.append(card);
    });

    if (!localProfile.onomatopoeia) localProfile.onomatopoeia = { enabled: false, useStyling: false };
    const isOno = localProfile.onomatopoeia.enabled;
    const isOnoStyle = localProfile.onomatopoeia.useStyling;

    const onoCard = $(`
        <div class="mtab-eng-card ${isOno ? 'active' : ''}">
            <div class="ecard-accent"></div>
            <div class="ecard-body">
                <div class="ecard-title">
                    <span>Cinematic Sounds</span>
                    ${isOno ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> On</span>` : ''}
                    ${customBadge({ trigger: "[[onomato]]" })}
                </div>
                <p class="ecard-desc">Force the AI to use precise phonetic sound words (e.g., click, thud) instead of abstract descriptions.</p>
                <div style="display: ${isOno ? 'flex' : 'none'}; margin-top: 8px; padding-top: 10px; border-top: 1px dashed var(--border-color); justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight:700; font-size: 0.75rem; color: var(--text-main);">Animate Sounds</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted);">Wrap in HTML tags. For capable AI only.</div>
                    </div>
                    <div class="ps-toggle-card ${isOnoStyle ? 'active' : ''}" id="ono_inner_toggle" style="padding: 4px; min-width: 44px; justify-content: center; background: transparent; border-color: ${isOnoStyle ? '#10b981' : 'var(--border-color)'};">
                        <div class="ps-switch" style="transform: scale(0.75); ${isOnoStyle ? 'background: #10b981;' : ''}"></div>
                    </div>
                </div>
            </div>
        </div>
    `);
    onoCard.on("click", (e) => {
        if ($(e.target).closest("#ono_inner_toggle").length) {
            localProfile.onomatopoeia.useStyling = !localProfile.onomatopoeia.useStyling;
            saveProfileToMemory(); fireRefreshHook(REFRESH.SWITCH_TAB); return;
        }
        localProfile.onomatopoeia.enabled = !localProfile.onomatopoeia.enabled;
        saveProfileToMemory(); fireRefreshHook(REFRESH.SWITCH_TAB);
    });
    addonGrid.append(onoCard);
    c.append(addonGrid);

    // Custom Engine Settings (Addons)
    if (activeMode && activeMode.customToggles) {
        const customSettings = activeMode.customToggles.filter(t => t.location === "settings");
        if (customSettings.length > 0) {
            const toggleList = $(`<div class="mtab-card-list" style="margin-bottom: 24px;"></div>`);
            customSettings.forEach(cs => {
                const isSel = !!localProfile.toggles[cs.id];
                const tCard = $(`
                    <div class="mtab-toggle-row ${isSel ? 'active' : ''}" style="${isSel ? 'border-color:#10b981;' : ''}">
                        <div class="toggle-info">
                            <div class="toggle-label" style="${isSel ? 'color:#10b981;' : ''}">${cs.name}</div>
                            <div class="toggle-desc">Custom Module → [[${cs.attachPoint}]]</div>
                        </div>
                        <div class="ps-switch" style="${isSel ? 'background:#10b981;' : ''}"></div>
                    </div>
                `);
                tCard.on("click", () => { localProfile.toggles[cs.id] = !localProfile.toggles[cs.id]; saveProfileToMemory(); fireRefreshHook(REFRESH.SWITCH_TAB); });
                toggleList.append(tCard);
            });
            c.append(toggleList);
        }
    }

    // ── OUTPUT FORMATS ──
    // Everything the reader sees as a block lives in the BLOCKS tab. What stays
    // here is MVU, which is not a tracker at all but a contract with another
    // extension, and never enters the envelope.
    c.append(`<div class="wstyle-section-head green"><i class="fa-solid fa-cubes"></i> Output Formats</div>`);
    const formatGrid = $(`<div class="mtab-card-grid"></div>`);

    hardcodedLogic.blocks.filter(b => b.id === "mvu").forEach(b => {
        const isSel = localProfile.blocks.includes(b.id);
        const isOverridden = activeMode && activeMode[b.id] && activeMode[b.id].trim() !== "";
        const card = $(`
            <div class="mtab-eng-card ${isSel ? 'active' : ''}">
                <div class="ecard-accent"></div>
                <div class="ecard-body">
                    <div class="ecard-title">
                        <span>${b.label}</span>
                        ${isSel ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> On</span>` : ''}
                        ${customBadge(b)}
                    </div>
                    <p class="ecard-desc">${blockDescriptions[b.id] || ""}</p>
                    ${isOverridden ? `<div style="margin-top:4px;"><span class="ecard-badge override"><i class="fa-solid fa-code-branch"></i> Engine Override</span></div>` : ''}
                </div>
            </div>
        `);
        card.on("click", () => {
            if (isSel) localProfile.blocks = localProfile.blocks.filter(i => i !== b.id);
            else localProfile.blocks.push(b.id);
            saveProfileToMemory(); fireRefreshHook(REFRESH.SWITCH_TAB);
        });
        formatGrid.append(card);
    });
    c.append(formatGrid);
}
