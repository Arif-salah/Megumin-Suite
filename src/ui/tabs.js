// ────────────────────────────────────────────────────────────────────────────
// The settings window's tab list and its dock.
//
// This is the one module that knows which renderer draws which tab, so it must
// import all of them. The renderers therefore must not import back: a tab that
// needs to redraw itself fires REFRESH.SWITCH_TAB instead, which is registered
// at the bottom of this file.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile, currentTab, setCurrentTab } from "../core/state.js";
import { registerRefreshHook, REFRESH } from "../core/refreshHooks.js";
import { TAB_SYNC_KEYS, TABS_ALREADY_GLOBAL, meguminGlobalSyncMap, meguminIsTabSynced, applyTabKeysToAllProfiles } from "../core/sync.js";
import { saveSettingsDebounced } from "../st.js";
import { updateLiveTokenCount } from "../core/tokens.js";
import { renderCoreAndCot } from "./tabs/coreAndCot.js";
import { renderModelSetup } from "../features/modelsetup/ui.js";
import { renderPersonality, personaTabInUse } from "./tabs/personality.js";
import { renderGlobalAndBlocks } from "./tabs/globalAndBlocks.js";
import { renderSidePanelTab } from "./tabs/sidePanelTab.js";
import { renderGlobalSettings, hasUnseenSettingsNotice } from "./tabs/globalSettings.js";
import { renderStoryConfig } from "../features/storyconfig/ui.js";
import { renderStoryPlanner } from "../features/storyplan/ui.js";
import { renderNotebookTab } from "../features/notebook/ui.js";
import { renderBanList } from "../features/banlist/ui.js";
import { renderImageGen } from "../features/imagegen/index.js";
import { renderNpcBank } from "../features/npc/ui.js";
import { renderMemoryCore } from "../features/memory/index.js";
import { renderBlocksTab } from "../features/blocks/ui.js";
import { renderChomusuke } from "./tabs/chomusuke.js";

// Dock order is array order. `group` puts a tab inside a folding group of the
// dock; `bottom` pins it under the spacer; `shown()` hides it while it has
// nothing to do. Find a tab by `id` (tabIndex), never by title or position:
// titles are what the user reads and positions move when the dock is reordered.
// The title is also the global-sync key (core/sync.js), so renaming one needs a
// line in RENAMED_TABS (core/migrations.js).
export const tabsUI = [
    { id: "setup", title: "Model Setup", sub: "Optional: the settings I tested for your model.", icon: "fa-compass", render: renderModelSetup },
    { id: "preset", title: "Preset & Thinking", sub: "Choose the preset, how it thinks, and the story's standing rules.", icon: "fa-server", render: renderCoreAndCot },
    { id: "blocks", title: "Blocks", sub: "What goes in the block under each reply, in what order, and how it looks.", icon: "fa-cubes", render: renderBlocksTab },
    { id: "notebook", title: "The Notebook", sub: "The truths the story is hiding, the clues it plants, and when they come out.", icon: "fa-book", render: renderNotebookTab },
    { id: "npc", title: "NPC Bank", sub: "The characters the story has met, kept and tracked.", icon: "fa-address-book", render: renderNpcBank },
    { id: "images", title: "Images", sub: "Wire up ComfyUI to draw the scenes of the story.", icon: "fa-image", render: renderImageGen },
    { id: "chomusuke", title: "Chomusuke", sub: "Your helper model: it does background work so the story model doesn't have to.", icon: "fa-cat", render: renderChomusuke },
    { id: "style", group: "setup", title: "Writing Style", sub: "Pick the prose voice the story is told in.", icon: "fa-pen-nib", render: renderStoryConfig },
    { id: "addons", group: "setup", title: "Language & Add-ons", sub: "Language, pronouns, and the gameplay add-ons.", icon: "fa-puzzle-piece", render: renderGlobalAndBlocks },
    { id: "director", group: "tools", title: "Story Director", sub: "Direct the narrative. Shape what happens next.", icon: "fa-clapperboard", render: renderStoryPlanner },
    { id: "memory", group: "tools", title: "Memory", sub: "How the story remembers older parts of the chat.", icon: "fa-memory", render: renderMemoryCore },
    { id: "banlist", group: "tools", title: "Banned Phrases", sub: "Find the phrases the AI keeps repeating and ban them.", icon: "fa-ban", render: renderBanList },
    { id: "sidepanel", group: "tools", title: "Side Panel", sub: "Pop the tracker blocks out of the chat into a fixed side panel.", icon: "fa-table-columns", render: renderSidePanelTab },
    { id: "persona", group: "tools", title: "Persona", sub: "Define the personality.", icon: "fa-user-astronaut", render: renderPersonality, shown: personaTabInUse },
    { id: "settings", bottom: true, title: "Settings", sub: "Extension preferences and about info.", icon: "fa-gear", render: renderGlobalSettings }
];

export const DOCK_GROUPS = [
    { id: "setup", title: "Story Setup", icon: "fa-sliders" },
    { id: "tools", title: "More Tools", icon: "fa-toolbox" }
];

export function tabIndex(id) {
    return tabsUI.findIndex(t => t.id === id);
}

// Which groups are open. Not saved: the group of the tab you open is opened for
// you, so there is nothing to lose between sessions.
const openGroups = new Set();

function dockDot(t, i) {
    return `<div class="dock-icon sidebar-step" id="dot_${i}" data-tab-id="${t.id}" title="${t.title}">
        <i class="fa-solid ${t.icon}"></i> <span>${t.title}</span>
    </div>`;
}

function buildDock(dotsContainer) {
    dotsContainer.empty();

    tabsUI.forEach((t, i) => { if (!t.group && !t.bottom) dotsContainer.append(dockDot(t, i)); });

    DOCK_GROUPS.forEach(g => {
        dotsContainer.append(`<div class="dock-icon dock-group-head" data-group="${g.id}" title="${g.title}">
            <i class="fa-solid ${g.icon}"></i> <span>${g.title}<em class="dock-group-current"></em></span>
            <i class="fa-solid fa-chevron-right dock-group-chevron"></i>
        </div>`);
        const items = $(`<div class="dock-group-items" data-group="${g.id}"></div>`);
        tabsUI.forEach((t, i) => { if (t.group === g.id) items.append(dockDot(t, i)); });
        dotsContainer.append(items);
    });

    // Push Settings to the bottom of the dock
    dotsContainer.append(`<div style="flex-grow: 1;"></div>`);
    tabsUI.forEach((t, i) => {
        if (t.bottom) dotsContainer.append($(dockDot(t, i)).css({ "margin-bottom": "15px", color: "#a1a1aa", transition: "0.2s" }));
    });

    dotsContainer.attr("data-built", "1");
    dotsContainer.off("click.dockGroup").on("click.dockGroup", ".dock-group-head", function (e) {
        const id = $(this).attr("data-group");
        // The phone bar has no room to unfold a group: its tabs open in a
        // small sheet above the bar instead.
        if (isPhoneDock()) { e.stopPropagation(); togglePhoneSheet(id, this); return; }
        if (openGroups.has(id)) openGroups.delete(id); else openGroups.add(id);
        refreshDockGroups();
    });
}

// The dock is a bottom bar at this width (style.css, "DOCK → floating bottom bar").
const isPhoneDock = () => window.matchMedia && window.matchMedia("(max-width: 768px)").matches;

function closePhoneSheet() {
    $("#ps_dock_sheet").remove();
    $(document).off("click.dockSheet");
}

function togglePhoneSheet(groupId, head) {
    const open = $("#ps_dock_sheet");
    if (open.length) {
        const same = open.attr("data-group") === groupId;
        closePhoneSheet();
        if (same) return;
    }
    const modal = $(head).closest(".ps-modern-modal");
    const host = modal.length ? modal : $("body");
    const g = DOCK_GROUPS.find(x => x.id === groupId);
    const $sheet = $(`<div id="ps_dock_sheet" class="dock-sheet" data-group="${groupId}">
        <div class="dock-sheet-title"><i class="fa-solid ${g ? g.icon : "fa-folder"}"></i> ${g ? g.title : ""}</div>
    </div>`);
    tabsUI.forEach((t, i) => {
        if (t.group !== groupId) return;
        if (typeof t.shown === "function" && !t.shown()) return;
        const $b = $(`<button type="button" class="dock-sheet-item ${i === currentTab ? "active" : ""}"><i class="fa-solid ${t.icon}"></i> ${t.title}</button>`);
        $b.on("click", () => { closePhoneSheet(); switchTab(i); });
        $sheet.append($b);
    });
    host.append($sheet);

    // Over the pill that opened it, kept inside the window.
    const hostRect = host[0].getBoundingClientRect();
    const headRect = head.getBoundingClientRect();
    const width = $sheet.outerWidth();
    let left = headRect.left - hostRect.left;
    left = Math.max(10, Math.min(left, hostRect.width - width - 10));
    $sheet.css({ left: `${left}px`, bottom: `${Math.max(70, hostRect.bottom - headRect.top + 8)}px` });

    // Closes on any tap outside it (the next tap, not this one).
    setTimeout(() => {
        $(document).on("click.dockSheet", ev => {
            if (!$(ev.target).closest("#ps_dock_sheet").length) closePhoneSheet();
        });
    }, 0);
}

// Open/closed state, the highlight on a closed group that holds the open tab,
// and the tabs that are hidden right now (Persona on presets that lock it).
function refreshDockGroups() {
    const dotsContainer = $("#ps_dynamic_dots");
    tabsUI.forEach((t, i) => {
        $(`#dot_${i}`).toggleClass("dock-hidden", typeof t.shown === "function" && !t.shown());
    });
    const activeTab = tabsUI[currentTab] || {};
    const activeGroup = activeTab.group;
    DOCK_GROUPS.forEach(g => {
        const open = openGroups.has(g.id);
        const $head = dotsContainer.find(`.dock-group-head[data-group="${g.id}"]`);
        $head.toggleClass("open", open)
            .toggleClass("has-active", !open && activeGroup === g.id)
            // The phone bar never unfolds, so it always marks the group you are in
            // and names the tab: "More Tools · Memory".
            .toggleClass("has-tab", activeGroup === g.id);
        $head.find(".dock-group-current").text(activeGroup === g.id ? ` · ${activeTab.title}` : "");
        dotsContainer.find(`.dock-group-items[data-group="${g.id}"]`).toggleClass("open", open);
    });
}

export function switchTab(index) {
    $(".dock").show();
    $("#ps_btn_save_close").show();
    $("#btn_apply_tab_all").show(); // Show on all tabs
    // The toggle is per tab, so its label has to follow the tab.
    setTimeout(updateGlobalSyncButton, 0);

    $("#ps_btn_dev_mode").html(`<i class="fa-solid fa-code"></i> Dev`).css("color", "#a855f7");

    let isSameTab = (currentTab === index);
    const container = $("#ps_stage_content");
    let savedScroll = 0;
    if (isSameTab && container.length) {
        savedScroll = container.scrollTop() || 0;
    }

    setCurrentTab(index);
    const tab = tabsUI[index];
    closePhoneSheet();

    // Generate Icons
    const dotsContainer = $("#ps_dynamic_dots");
    if (dotsContainer.attr("data-built") !== "1" || !dotsContainer.children(".sidebar-step").length) {
        buildDock(dotsContainer);
    }

    // Going to a tab opens its group, so you can see where you are.
    if (tab && tab.group && !isSameTab) openGroups.add(tab.group);

    $(".dock-icon").removeClass("active");
    $(`#dot_${index}`).addClass("active");
    refreshDockGroups();

    // Re-read every switch rather than only at build time: the dots are drawn once
    // and reused, so a notice spent this session has to be able to go out again.
    $(`#dot_${tabIndex("settings")}`).toggleClass("has-notice", hasUnseenSettingsNotice());

    container.empty();
    container.off(".devDirty");

    tab.render(container);

    if (isSameTab) {
        container.scrollTop(savedScroll);
    } else {
        container.scrollTop(0);
    }

    updateLiveTokenCount();
}

export function toggleTabGlobalSync() {
    const title = (tabsUI[currentTab] || {}).title;
    if (!title) return;

    if (TABS_ALREADY_GLOBAL.includes(title)) {
        toastr.info(`${title} is stored globally already — it is the same on every character.`, "Megumin Suite");
        return;
    }
    if (!TAB_SYNC_KEYS[title]) {
        toastr.info(title === "Model Setup"
            ? "A loadout goes to every character unless you turn on Only this character."
            : "This tab has nothing to sync.", "Megumin Suite");
        return;
    }

    const map = meguminGlobalSyncMap();
    const next = !map[title];
    map[title] = next;
    saveSettingsDebounced();

    if (next) {
        const ok = applyTabKeysToAllProfiles(title);
        if (!ok) {
            map[title] = false;
            saveSettingsDebounced();
            toastr.warning("The panel is still showing the previous chat's settings. Reopen it and try again.", "Megumin Suite");
            updateGlobalSyncButton();
            return;
        }
        toastr.success(`${title} now applies to every character. Changes here follow automatically.`, "Megumin Suite");
    } else {
        toastr.info(`${title} is back to per-character.`, "Megumin Suite");
    }

    updateGlobalSyncButton();
}

export function meguminPropagateTabIfSynced() {
    // Only while the settings window is open: a save from a background feature
    // (an NPC banking itself, a summary landing) is not an edit to a tab.
    if (!$("#btn_apply_tab_all").length) return;
    const title = (tabsUI[currentTab] || {}).title;
    if (!meguminIsTabSynced(title)) return;
    applyTabKeysToAllProfiles(title);
}

export function updateGlobalSyncButton() {
    const btn = $("#btn_apply_tab_all");
    if (!btn.length) return;

    const title = (tabsUI[currentTab] || {}).title;
    const alreadyGlobal = TABS_ALREADY_GLOBAL.includes(title);
    const syncable = Boolean(TAB_SYNC_KEYS[title]);
    const on = meguminIsTabSynced(title);

    if (alreadyGlobal || !syncable) {
        btn.html(`<i class="fa-solid fa-earth-americas"></i> Global`)
            .attr("title", alreadyGlobal ? "This tab is stored globally already."
                : title === "Model Setup" ? "A loadout goes to every character unless you turn on Only this character."
                : "This tab has nothing to sync.")
            .css({ color: "var(--text-muted)", "border-color": "var(--border-color)", opacity: "0.55" });
        return;
    }

    btn.html(`<i class="fa-solid fa-earth-americas"></i> Global: ${on ? "On" : "Off"}`)
        .attr("title", on
            ? `Every change on the ${title} tab is copied to all characters. Click to stop.`
            : `Changes on the ${title} tab stay with this character. Click to make them global.`)
        .css({
            color: on ? "#10b981" : "var(--gold)",
            "border-color": on ? "rgba(16,185,129,0.45)" : "rgba(245,158,11,0.3)",
            opacity: "1"
        });
}

// ────────────────────────────────────────────────────────────────────────────
// Wiring.
// ────────────────────────────────────────────────────────────────────────────

// With no index: redraw whatever is on screen. With one (a number, or a tab id
// like "notebook"): navigate to it.
registerRefreshHook(REFRESH.SWITCH_TAB, (index) => {
    const i = typeof index === "string" ? tabIndex(index) : index;
    switchTab(typeof i === "number" && i >= 0 ? i : currentTab);
});
registerRefreshHook(REFRESH.TAB_PROPAGATE, () => meguminPropagateTabIfSynced());
