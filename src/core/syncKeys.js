// ────────────────────────────────────────────────────────────────────────────
// Which settings each tab owns, for "This tab: This character only / Every
// character" (core/sync.js does the copying). Pure, so it is tested.
//
// Keyed by tab id (plan 020). It used to be keyed by tab TITLE, which meant
// every rename needed a migration line or the user's choice silently went back
// to "this character only". `syncMapByTabId` moves an old title-keyed map over
// once.
// ────────────────────────────────────────────────────────────────────────────

// Which profile keys each tab owns.
export const TAB_SYNC_KEYS = {
    // enhancedDialogue belongs here because its switch is drawn on the engine
    // cards, which are this tab. Leaving it out did not look like a sync bug from
    // the outside — it looked like the switch was not saving at all: it stuck on
    // the profile you set it on and was off everywhere else, which is what a
    // setting that failed to write looks like to the reader.
    preset: ["mode", "model", "cotEnabled", "thinkEffort", "customThinkEffort", "thinkingV2", "storyConfig", "enhancedDialogue"],
    persona: ["personality", "toggles"],
    style: ["activeStyleId", "aiRule", "customStyles", "dnRatio"],
    addons: ["addons", "blocks", "userLanguage", "userPronouns", "onomatopoeia", "v9Limits"],
    blocks: ["blockStack", "statBlocks", "blocks", "hideBlocksFromAI"],
    // Plan 020: World State's own settings. Whether it is on is the block
    // stack (Blocks); who writes it may be Chomusuke, which is shared anyway.
    world: ["worldState"],
    director: ["storyPlan"],
    notebook: ["notebook"],
    banlist: ["banList", "banListBuiltIn", "banListShort", "banListBackend", "banListCustomPromptsEnabled", "banListCustomPrompts"],
    images: ["imageGen"],
    npc: ["npcBank"],
    memory: ["memoryCore"]
};

// Stored once for every character already: nothing to choose on these tabs.
// Chomusuke (plan 018) is one setup in extension_settings, not a copy per profile.
export const TABS_ALREADY_GLOBAL = ["sidepanel", "settings", "chomusuke"];

// Story Config is drawn in Preset & Thinking, so it travels with that tab
// unless the user keeps it with the character (core/sync.js).
export const STORY_CONFIG_HOST_TAB = "preset";

export const isSyncableTab = id => Boolean(TAB_SYNC_KEYS[id]);

/** The keys a tab copies, after Story Config's opt-out. null: none. */
export function syncKeysFor(id, storyConfigTravels = true) {
    const keys = TAB_SYNC_KEYS[id];
    if (!keys) return null;
    if (id === STORY_CONFIG_HOST_TAB && !storyConfigTravels) return keys.filter(k => k !== "storyConfig");
    return keys;
}

// The titles the map was keyed by before plan 020 (after core/migrations.js
// RENAMED_TABS brought older titles up to these).
const TITLE_TO_ID = {
    "Preset & Thinking": "preset",
    "Persona": "persona",
    "Writing Style": "style",
    "Language & rules": "addons",
    "Blocks": "blocks",
    "Story Director": "director",
    "The Notebook": "notebook",
    "Banned Phrases": "banlist",
    "Images": "images",
    "NPC Bank": "npc",
    "Memory": "memory"
};

/**
 * The scope map keyed by tab id. Title keys move to their id (an id already
 * there wins); keys that are neither a syncable id nor a known title are
 * dropped (always-shared tabs, tabs that are gone). Returns a new map and
 * whether anything changed.
 */
export function syncMapByTabId(map) {
    const out = {};
    let changed = false;
    for (const [key, value] of Object.entries(map || {})) {
        if (isSyncableTab(key)) { out[key] = value; continue; }
        changed = true;
        const id = TITLE_TO_ID[key];
        if (id && !(id in (map || {})) && !(id in out)) out[id] = value;
    }
    return { map: out, changed };
}

/** The ids of the tabs set to every character right now, in `order`. */
export function sharedTabIds(map, order) {
    return order.filter(id => isSyncableTab(id) && Boolean(map && map[id]));
}
