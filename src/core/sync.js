// ─────────────────────────────────────────────────────────────────────────────
// Tab scope ("This tab: Every character") — copying one tab's settings into
// every stored profile.
//
// Data and pure logic only. The three functions that read the tab currently on
// screen (the toggle button, its label, and the post-save propagator) are jQuery
// and toastr code, so they stay with the UI and call in here. That keeps the
// broadcast logic testable and stops this module from depending on the tab list.
// ─────────────────────────────────────────────────────────────────────────────

import { extension_settings, saveSettingsDebounced } from "../st.js";
import { extensionName } from "./constants.js";
import { localProfile, _loadedProfileKey } from "./state.js";
import { getCharacterKey } from "./keys.js";
import { meguminDiffPrompts } from "../prompts/storage.js";
import { TAB_SYNC_KEYS, TABS_ALREADY_GLOBAL, STORY_CONFIG_HOST_TAB, syncKeysFor } from "./syncKeys.js";

// Which keys each tab owns, which tabs are always shared: core/syncKeys.js
// (pure, keyed by tab id since plan 020). Re-exported for older imports.
export { TAB_SYNC_KEYS, TABS_ALREADY_GLOBAL };

// ── Story Config's own opt-out ───────────────────────────────────────────────
//
// Story Config's fields are drawn inside the Preset & Thinking tab, so they ride on
// that tab's scope. That bundles two different decisions: "every character uses
// this engine" and "every character is the same genre, POV and pace". The first
// is setup and people do want it everywhere; the second is the story, and a
// horror chat and a slice-of-life chat should not share it.
//
// Default is ON (Story Config travels), which is exactly the behaviour before
// this existed. Stored as its own setting rather than an entry in globalSyncTabs.

export function meguminStoryConfigSyncs() {
    const store = extension_settings[extensionName];
    if (!store) return true;
    return store.storyConfigGlobalSync !== false;
}

export function meguminSetStoryConfigSyncs(on) {
    if (!extension_settings[extensionName]) return;
    extension_settings[extensionName].storyConfigGlobalSync = Boolean(on);
    saveSettingsDebounced();
}

// Whether the tab Story Config lives on is itself set to every character. With
// it off, nothing is copied at all and the opt-out has nothing to act on — the
// UI uses this to say so rather than offering a control that does nothing.
export function meguminStoryConfigHostSynced() {
    return meguminIsTabSynced(STORY_CONFIG_HOST_TAB);
}

// The keys a tab actually copies, after per-key opt-outs.
export function meguminTabSyncKeys(tabId) {
    return syncKeysFor(tabId, meguminStoryConfigSyncs());
}

// What "this one / every one" is about in the words the user sees: settings
// are kept per character, or per chat in "Per Chat" save mode (core/keys.js).
export function scopeNoun() {
    const gs = (extension_settings[extensionName] || {}).globalSettings || {};
    return gs.saveMode === "chat" ? "chat" : "character";
}

// { tabId: true } for the tabs set to every character.
export function meguminGlobalSyncMap() {
    if (!extension_settings[extensionName].globalSyncTabs) {
        extension_settings[extensionName].globalSyncTabs = {};
    }
    return extension_settings[extensionName].globalSyncTabs;
}

export function meguminIsTabSynced(tabId) {
    return Boolean(tabId && meguminGlobalSyncMap()[tabId]);
}

// Copies this tab's keys from the profile on screen into every stored profile.
// Returns false when it declined, so callers can stay quiet about it.
export function applyTabKeysToAllProfiles(tabId) {
    const keys = meguminTabSyncKeys(tabId);
    if (!keys || !keys.length) return false;

    // This writes localProfile into EVERY stored profile, so a stale localProfile
    // does not corrupt one save file, it corrupts all of them at once and there is
    // nothing to recover from. Runs in one tick, so one check at the top covers it.
    const liveKey = getCharacterKey() || "default";
    if (_loadedProfileKey && liveKey !== _loadedProfileKey) {
        console.debug(`[Megumin-Suite] Global tab sync declined: the settings on screen belong to "${_loadedProfileKey}" but the active chat is now "${liveKey}". Nothing was broadcast.`);
        return false;
    }

    const currentData = localProfile;
    Object.keys(extension_settings[extensionName].profiles).forEach(profKey => {
        const prof = extension_settings[extensionName].profiles[profKey];

        keys.forEach(k => {
            // --- SPECIAL HANDLING: settings travel, content stays put ---
            if (k === "storyPlan" && currentData[k]) {
                if (!prof[k]) prof[k] = {};
                const preservedPlan = prof[k].currentPlan;
                const preservedTracker = prof[k].lastTrackerState;
                const preservedIndex = prof[k].planMessageIndex;

                prof[k] = JSON.parse(JSON.stringify(currentData[k]));

                prof[k].currentPlan = preservedPlan || "";
                prof[k].lastTrackerState = preservedTracker || "";
                prof[k].planMessageIndex = preservedIndex !== undefined ? preservedIndex : null;

            } else if (k === "npcBank" && currentData[k]) {
                if (!prof[k]) prof[k] = {};
                const preservedNpcs = prof[k].npcs;
                prof[k] = JSON.parse(JSON.stringify(currentData[k]));
                prof[k].npcs = preservedNpcs || [];

            } else if (k === "memoryCore" && currentData[k]) {
                if (!prof[k]) prof[k] = {};
                const preservedShort = prof[k].shortTermChunks;
                const preservedLong = prof[k].longTermVault;
                prof[k] = JSON.parse(JSON.stringify(currentData[k]));
                prof[k].shortTermChunks = preservedShort || [];
                prof[k].longTermVault = preservedLong || [];

            } else if (k === "imageGen" && currentData[k]) {
                if (!prof[k]) prof[k] = {};
                prof[k] = JSON.parse(JSON.stringify(currentData[k]));
                // Looks belong to each chat's file, never to a synced profile.
                delete prof[k].characterTags;

            } else if (currentData[k] !== undefined) {
                prof[k] = JSON.parse(JSON.stringify(currentData[k]));
            }
        });
    });

    saveSettingsDebounced();
    return true;
}
// Helper to push advanced prompt edits to ALL profiles (Global Save)
export function syncPromptsGlobally(moduleName, dataKey, dataValue) {
    // Every call site hands this a value read straight out of localProfile, and it lands in
    // every stored profile. If localProfile is behind the active chat, one guard here stops
    // all ~15 of those sites from broadcasting the wrong chat's prompt text. Each call is a
    // single synchronous UI edit, so checking once on entry covers the whole broadcast.
    const liveKey = getCharacterKey() || "default";
    if (_loadedProfileKey && liveKey !== _loadedProfileKey) {
        console.debug(`[Megumin-Suite] Global prompt sync of ${moduleName}.${dataKey} declined: the value came from "${_loadedProfileKey}" but the active chat is now "${liveKey}". No profiles were changed.`);
        return;
    }
    // This is the write path that made settings.json grow: one edited prompt block fans
    // out across every stored profile, so a full copy costs (profile count x block size).
    // Reduce it to its diff against DEFAULT_PROMPTS once here rather than per profile —
    // the value is identical for all of them, and initProfile fills the rest back in.
    let valueToStore = dataValue;
    if (dataKey === 'customPrompts' || dataKey === 'banListCustomPrompts') {
        valueToStore = meguminDiffPrompts(dataValue, moduleName);
    }
    Object.values(extension_settings[extensionName].profiles).forEach(prof => {
        const clonedValue = valueToStore !== null && typeof valueToStore === 'object' ? JSON.parse(JSON.stringify(valueToStore)) : valueToStore;
        if (moduleName === 'banList') {
            prof[dataKey] = clonedValue;
        } else {
            // A profile saved before this module existed has no container. Writing one
            // bare key would create a half-built module whose other settings load as
            // undefined. Skip it: its next load fills full defaults, and every sync
            // after that reaches it normally.
            if (!prof[moduleName]) return;
            prof[moduleName][dataKey] = clonedValue;
        }
    });
    saveSettingsDebounced();
}
