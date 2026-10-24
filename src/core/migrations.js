// ─────────────────────────────────────────────────────────────────────────────
// One-time repairs to stored settings.
//
// Everything here is subtractive and idempotent: it fixes data written by older
// builds and does nothing on a profile that is already current. Nothing in here
// is part of normal operation, which is exactly why it does not belong inline.
//
// Two further migrations (the memory vault rebuild and the legacy block-id sync)
// are still in index.js — they depend on the memory and blocks features, which
// are not modules yet. They land here once those move.
// ─────────────────────────────────────────────────────────────────────────────

import { extension_settings, saveSettingsDebounced } from "../st.js";
import { extensionName } from "./constants.js";

export function cleanLegacySettings() {
    if (!extension_settings[extensionName] || !extension_settings[extensionName].profiles) return;
    let didClean = false;
    Object.keys(extension_settings[extensionName].profiles).forEach(key => {
        if (key === 'default') return; // Do not touch global defaults
        const prof = extension_settings[extensionName].profiles[key];
        if (prof.memoryCore && (prof.memoryCore.shortTermChunks?.length > 0 || prof.memoryCore.longTermVault?.length > 0)) {
            delete prof.memoryCore.shortTermChunks;
            delete prof.memoryCore.longTermVault;
            didClean = true;
        }
        if (prof.storyPlan && (prof.storyPlan.currentPlan || prof.storyPlan.lastTrackerState)) {
            prof.storyPlan.currentPlan = "";
            prof.storyPlan.lastTrackerState = "";
            didClean = true;
        }
    });
    if (didClean) saveSettingsDebounced();
}

// Tab titles are the key of the global-sync map, so renaming a tab orphans whatever the
// reader had set on it and their choice silently reverts to off. Every rename belongs in
// this table.
//
// A rename carries the flag across; a tab SPLIT does not hand it to both halves. When
// Story Config split, the <config> half moved onto PRESETS & COT and deliberately did
// not inherit the flag: switching that on copies the engine and CoT choice into EVERY
// stored profile, which is far more than the reader agreed to. Losing sync on one field
// is one click to undo; overwriting every character is not.
const RENAMED_TABS = [
    ["Story Config", "Writing Style"],
    ["Global Toggles & Blocks", "Global Toggles & Add Ons"],
    // Plan 011: the dock cleanup. Runs after the line above, so the oldest
    // name still lands on the newest.
    ["PRESETS & COT", "Preset & Thinking"],
    ["Global Toggles & Add Ons", "Language & Add-ons"],
    ["BLOCKS", "Blocks"],
    ["Dynamic Ban List", "Banned Phrases"],
    ["Image Generation", "Images"],
    ["NPCs Bank", "NPC Bank"],
    ["Memory Core", "Memory"],
    ["Global Settings", "Settings"],
];

export function migrateRenamedTabs() {
    const store = extension_settings[extensionName];
    if (!store || !store.globalSyncTabs) return;
    const map = store.globalSyncTabs;
    let moved = false;
    RENAMED_TABS.forEach(([from, to]) => {
        if (!Object.prototype.hasOwnProperty.call(map, from)) return;
        if (!Object.prototype.hasOwnProperty.call(map, to)) map[to] = map[from];
        delete map[from];
        moved = true;
    });
    if (moved) saveSettingsDebounced();
}

// The utility prefill toggle was inverted: `disableUtilityPrefill` (opt out) became
// `enableUtilityPrefill` (opt in, default off). Nothing reads the old key any more, and
// a live key nothing reads is the trap localProfile.devOverrides already is -- so it is
// deleted rather than left to be found and half-wired back up later.
//
// The value is deliberately NOT carried over. Someone who had switched the old one on
// was disabling prefills, which is what the new default already does.
// Looks (Image Gen character tags) live in each chat's file. One Beta build kept them in
// settings.json for a day, and global sync copied that one chat's looks into every
// profile; the copies are stale, never read any more, and only add weight.
export function dropLookResidue() {
    const profiles = extension_settings[extensionName] && extension_settings[extensionName].profiles;
    if (!profiles) return;
    let dropped = 0;
    for (const p of Object.values(profiles)) {
        if (p && p.imageGen && Object.prototype.hasOwnProperty.call(p.imageGen, "characterTags")) {
            delete p.imageGen.characterTags;
            dropped++;
        }
    }
    if (dropped) {
        console.log(`[${extensionName}] Removed stale image looks from ${dropped} profile(s) in settings.`);
        saveSettingsDebounced();
    }
}

export function migrateUtilityPrefillFlag() {
    const gs = extension_settings[extensionName] && extension_settings[extensionName].globalSettings;
    if (!gs || !Object.prototype.hasOwnProperty.call(gs, "disableUtilityPrefill")) return;
    delete gs.disableUtilityPrefill;
    saveSettingsDebounced();
}
