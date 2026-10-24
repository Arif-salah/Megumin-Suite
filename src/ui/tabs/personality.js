// ────────────────────────────────────────────────────────────────────────────
// Persona — narrator personality and the global toggles.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile, currentTab } from "../../core/state.js";
import { isV7Engine, isModernEngine } from "../../core/engines.js";
import { extension_settings } from "../../st.js";
import { extensionName } from "../../core/constants.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { hardcodedLogic } from "../../../data/database.js";

// The dock shows the Persona tab only when the preset uses it. Modern presets
// (V8 and later) lock the tab to a notice and nothing else, so it is hidden.
export function personaTabInUse() {
    const engine = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])].find(m => m.id === localProfile.mode);
    return !isModernEngine(engine);
}

export function renderPersonality(c) {
    const isV6DreamTeam = localProfile.mode.includes("v6-dream-team");
    const activeEngineForPersona = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])].find(m => m.id === localProfile.mode);
    const isV7 = isV7Engine(activeEngineForPersona);
    const isModern = isModernEngine(activeEngineForPersona);
    const isLockedPersona = isV6DreamTeam || isV7 || isModern;

    // ── HEADER ──
    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #ec4899, #be185d);">
                    <i class="fa-solid fa-masks-theater"></i>
                </div>
                <div>
                    <h2>Persona</h2>
                    <p>Set the narrator's voice and fine‑tune engine behavior.</p>
                </div>
            </div>
            <div class="mtab-header-badge" style="background: rgba(236,72,153,0.12); color: #ec4899; border: 1px solid rgba(236,72,153,0.25);">
                <i class="fa-solid fa-user" style="font-size:0.6rem;"></i> ${isLockedPersona ? 'Locked' : localProfile.personality}
            </div>
        </div>
    `);

    // Named from the engine itself, never rebuilt from a flag. Deriving the word "V9"
    // from isV9 is what told a V10 reader they were on V9, and the next generation
    // would have done it again. The engine already knows what it is called.
    const lockedEngineName = (activeEngineForPersona && activeEngineForPersona.label)
        ? activeEngineForPersona.label
        : "This engine";

    if (isModern) {
        c.append(`
            <div class="mtab-locked-state">
                <i class="fa-solid fa-user-lock" style="color: #f59e0b;"></i>
                <h3>Persona Locked</h3>
                <p>${lockedEngineName} manages its own internal persona and strictly enforces narrative toggles natively. Standard injections are completely disabled.</p>
            </div>
        `);
        return;
    } else if (isV6DreamTeam) {
        c.append(`
            <div class="mtab-locked-state">
                <i class="fa-solid fa-user-lock" style="color: #a855f7;"></i>
                <h3>Persona Selection Locked</h3>
                <p>The V6 Dream Team engine utilizes an intrinsic 6-specialist framework. Standard persona injections are disabled to prevent logic conflicts.</p>
            </div>
        `);
    } else if (isV7) {
        c.append(`
            <div class="mtab-locked-state">
                <i class="fa-solid fa-user-lock" style="color: #3b82f6;"></i>
                <h3>Persona Selection Locked</h3>
                <p>The V7 engine utilizes a pure narrative framework. Standard persona injections are disabled to prevent logic conflicts.</p>
            </div>
        `);
    } else {
        const descriptions = {
            "megumin": "A rebellious, dominant voice. Adds an edge of arrogance and chaos to the narration. Best for energetic or confrontational stories.",
            "director": "Professional narrator. Clean, authoritative story direction with cinematic awareness.",
            "Nora": "Nora should i say more.",
            "engine": "No personality overlay at all. The engine speaks in its purest form — precise, neutral, and fully under your control. Recommended for most setups."
        };

        c.append(`<div class="wstyle-section-head purple"><i class="fa-solid fa-masks-theater"></i> Select Persona</div>`);
        const grid = $(`<div class="mtab-card-grid" style="margin-bottom: 24px;"></div>`);
        hardcodedLogic.personalities.forEach(p => {
            const isSel = localProfile.personality === p.id;
            let badges = '';
            if (p.recommended) badges = `<span class="ecard-badge rec"><i class="fa-solid fa-star"></i> Recommended</span>`;

            const card = $(`
                <div class="mtab-eng-card ${isSel ? 'active' : ''}">
                    <div class="ecard-accent"></div>
                    <div class="ecard-body">
                        <div class="ecard-title">
                            <span>${p.label}</span>
                            ${isSel ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> Active</span>` : ''}
                        </div>
                        <p class="ecard-desc">${descriptions[p.id] || ""}</p>
                        ${badges ? `<div style="margin-top:4px;">${badges}</div>` : ''}
                    </div>
                </div>
            `);
            card.on("click", () => { localProfile.personality = p.id; saveProfileToMemory(); fireRefreshHook(REFRESH.SWITCH_TAB); });
            grid.append(card);
        });
        c.append(grid);
    }

    // EXTRA TOGGLES (Always available)
    c.append(`<div class="wstyle-section-head gold"><i class="fa-solid fa-sliders"></i> Extra Toggles</div>`);
    const toggleList = $(`<div class="mtab-card-list"></div>`);
    Object.entries(hardcodedLogic.toggles).forEach(([key, tog]) => {
        const isOn = localProfile.toggles[key];
        const tCard = $(`
            <div class="mtab-toggle-row ${isOn ? 'active' : ''}">
                <div class="toggle-info">
                    <div class="toggle-label">${tog.label}</div>
                    ${tog.recommendedOff ? `<div class="toggle-desc"><i class="fa-solid fa-star" style="color:var(--gold);font-size:0.6rem;margin-right:4px;"></i> Off by default — most engines handle this natively</div>` : ''}
                </div>
                <div class="ps-switch"></div>
            </div>
        `);
        tCard.on("click", () => { localProfile.toggles[key] = !localProfile.toggles[key]; saveProfileToMemory(); fireRefreshHook(REFRESH.SWITCH_TAB); });
        toggleList.append(tCard);
    });
    c.append(toggleList);
}
