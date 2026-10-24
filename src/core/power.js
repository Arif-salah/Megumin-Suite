// ────────────────────────────────────────────────────────────────────────────
// The master switch for the whole suite.
//
// Off means the suite stops acting on its own: the prompt goes out exactly as
// SillyTavern built it (the preset's [[placeholders]] included, untouched),
// and nothing runs after a reply (World State and block reads, automatic
// images, Story Director, Memory Core, NPC Bank, semantic search). What is
// already in the chat still draws — cards and image buttons on old messages —
// and the local bookkeeping that follows swipes, edits and deletes keeps
// running, since it never talks to a model. Buttons the user clicks inside the
// settings window still work: that is a deliberate ask, not the suite acting.
//
// Stored in globalSettings, so it is install-wide, never per character.
// Missing = on, so every existing install keeps working.
// ────────────────────────────────────────────────────────────────────────────

import { extension_settings, saveSettingsDebounced } from "../st.js";
import { extensionName } from "./constants.js";

export function suiteEnabled() {
    const gs = extension_settings[extensionName]?.globalSettings;
    return !gs || gs.suiteEnabled !== false;
}

export function setSuiteEnabled(on) {
    const root = extension_settings[extensionName];
    if (!root) return;
    if (!root.globalSettings) root.globalSettings = {};
    root.globalSettings.suiteEnabled = Boolean(on);
    saveSettingsDebounced();
    syncPowerUI();
    toastr[on ? "success" : "warning"](
        on ? "Megumin Suite is on." : "Megumin Suite is off. Prompts go out exactly as SillyTavern builds them, and nothing runs in the background.",
        "Megumin Suite"
    );
}

// Every place that shows the state: the top-bar button, the Global Settings
// row (when that tab is open) and the floating launcher, which dims while off
// so the state is visible without opening the window.
export function syncPowerUI() {
    const on = suiteEnabled();
    $("#ps_btn_power")
        .html(`<i class="fa-solid fa-power-off"></i> ${on ? "On" : "Off"}`)
        .attr("title", on
            ? "Megumin Suite is on. Click to turn the whole suite off."
            : "Megumin Suite is off: prompts go out as SillyTavern builds them and nothing runs in the background. Click to turn it on.")
        .css({ color: on ? "#10b981" : "#ef4444", "border-color": on ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.45)" });
    $("#gs_toggle_suite")
        .toggleClass("active", on)
        .css("border-color", on ? "#10b981" : "var(--border-color)")
        .find(".ps-switch").css("background", on ? "#10b981" : "");
    $("#prompt-slot-fixed-btn").toggleClass("ps-suite-off", !on);
}
