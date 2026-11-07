// ────────────────────────────────────────────────────────────────────────────
// The settings window's tabs: ids, titles, icons, where they sit in the dock.
// Pure, so any page can name a tab (Settings lists the shared ones, Model
// Setup labels its buttons) without importing the renderers. ui/tabs.js adds
// the renderer to each.
//
// Dock order is array order. `group` puts a tab under a heading of the dock
// (DOCK_GROUPS); `bottom` pins it under the spacer; `parent` makes it a page
// of another tab: no dock entry of its own, a page bar on top of both.
// Language & rules was a page of Writing Style (plan 020); it has its own
// dock entry again, since as a page its settings were easy to miss.
// Find a tab by `id`, never by title or position. Since plan 020 the scope
// setting is keyed by id too (core/syncKeys.js), so a title can change freely.
// ────────────────────────────────────────────────────────────────────────────

export const TAB_LIST = [
    { id: "setup", title: "Model Setup", sub: "Optional: the settings I tested for your model.", icon: "fa-compass" },
    { id: "preset", group: "story", title: "Preset & Thinking", sub: "Choose the preset, how it thinks, and the story's standing rules.", icon: "fa-server" },
    { id: "style", group: "story", title: "Writing Style", sub: "Pick the prose voice the story is told in.", icon: "fa-pen-nib" },
    { id: "addons", group: "story", title: "Language & rules", sub: "Language, pronouns, and the gameplay add-ons.", icon: "fa-language" },
    { id: "blocks", group: "story", title: "Blocks", sub: "What goes in the block under each reply, in what order, and how it looks.", icon: "fa-cubes" },
    { id: "world", group: "story", title: "World State", sub: "Keeps track of the scene: time, place, who is there, what they wear.", icon: "fa-thumbtack" },
    { id: "notebook", group: "story", title: "The Notebook", sub: "The truths the story is hiding, the clues it plants, and when they come out.", icon: "fa-book" },
    { id: "images", group: "helpers", title: "Images", sub: "Wire up ComfyUI to draw the scenes of the story.", icon: "fa-image" },
    { id: "npc", group: "helpers", title: "NPC Bank", sub: "The characters the story has met, kept and tracked.", icon: "fa-address-book" },
    { id: "chomusuke", group: "helpers", title: "Chomusuke", sub: "A second model that does the background work, so the story model doesn't have to.", icon: "fa-cat" },
    { id: "banlist", group: "helpers", title: "Banned Phrases", sub: "Find the phrases the AI keeps repeating and ban them.", icon: "fa-ban" },
    { id: "memory", group: "legacy", title: "Memory", sub: "How the story remembers older parts of the chat.", icon: "fa-memory" },
    { id: "director", group: "legacy", title: "Story Director", sub: "Direct the narrative. Shape what happens next.", icon: "fa-clapperboard" },
    { id: "sidepanel", group: "legacy", title: "Side Panel", sub: "Pop the tracker blocks out of the chat into a fixed side panel.", icon: "fa-table-columns" },
    { id: "persona", group: "legacy", title: "Persona", sub: "Define the personality.", icon: "fa-user-astronaut" },
    { id: "settings", bottom: true, title: "Settings", sub: "Extension preferences and about info.", icon: "fa-gear" }
];

// `fold`: the heading opens and closes its tabs (and is a pill with a sheet on
// the phone bar). Without it the heading is a label and its tabs always show.
export const DOCK_GROUPS = [
    { id: "story", title: "Story" },
    { id: "helpers", title: "Helpers" },
    { id: "legacy", title: "Legacy", icon: "fa-box-archive", fold: true, tip: "Older tools, kept for old chats" }
];

/** A tab's title by id ("" when there is no such tab). */
export function tabTitle(id) {
    const t = TAB_LIST.find(x => x.id === id);
    return t ? t.title : "";
}

/** "Writing Style → Language & rules" for a page, the plain title otherwise. */
export function tabPath(id) {
    const t = TAB_LIST.find(x => x.id === id);
    if (!t) return "";
    return t.parent ? `${tabTitle(t.parent)} → ${t.title}` : t.title;
}
