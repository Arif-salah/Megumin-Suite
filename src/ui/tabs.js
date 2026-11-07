// ────────────────────────────────────────────────────────────────────────────
// The settings window's tabs, their dock, and the scope control in the top bar
// ("This tab: This character only / Every character").
//
// This is the one module that knows which renderer draws which tab, so it must
// import all of them. The renderers therefore must not import back: a tab that
// needs to redraw itself fires REFRESH.SWITCH_TAB instead, which is registered
// at the bottom of this file. The ids, titles and dock places are in
// ui/tabList.js (pure), so other pages can name a tab.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile, currentTab, setCurrentTab } from "../core/state.js";
import { registerRefreshHook, REFRESH } from "../core/refreshHooks.js";
import { TABS_ALREADY_GLOBAL, meguminGlobalSyncMap, meguminIsTabSynced, applyTabKeysToAllProfiles, scopeNoun } from "../core/sync.js";
import { isSyncableTab } from "../core/syncKeys.js";
import { saveSettingsDebounced, Popup, POPUP_TYPE } from "../st.js";
import { updateLiveTokenCount } from "../core/tokens.js";
import { TAB_LIST, DOCK_GROUPS, tabPath } from "./tabList.js";
import { esc } from "./controls.js";
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
import { renderWorldStateTab } from "../features/worldstate/ui.js";
import { renderChomusuke } from "./tabs/chomusuke.js";

export { DOCK_GROUPS };

const RENDERERS = {
    setup: renderModelSetup,
    preset: renderCoreAndCot,
    style: renderStoryConfig,
    addons: renderGlobalAndBlocks,
    blocks: renderBlocksTab,
    world: renderWorldStateTab,
    notebook: renderNotebookTab,
    images: renderImageGen,
    npc: renderNpcBank,
    chomusuke: renderChomusuke,
    banlist: renderBanList,
    memory: renderMemoryCore,
    director: renderStoryPlanner,
    sidepanel: renderSidePanelTab,
    persona: renderPersonality,
    settings: renderGlobalSettings
};

// `shown()` hides a tab while it has nothing to do.
const SHOWN = { persona: personaTabInUse };

export const tabsUI = TAB_LIST.map(t => ({ ...t, render: RENDERERS[t.id], shown: SHOWN[t.id] }));

export function tabIndex(id) {
    return tabsUI.findIndex(t => t.id === id);
}

// The dock entry that stands for a tab: its own, or its parent's for a page.
function dockIndexOf(index) {
    const t = tabsUI[index];
    return t && t.parent ? tabIndex(t.parent) : index;
}

// A tab and its pages, in order, or null when it has none.
function pagesOf(tab) {
    const root = tab.parent || tab.id;
    const kids = tabsUI.filter(t => t.parent === root);
    return kids.length ? [tabsUI[tabIndex(root)], ...kids] : null;
}

// Which groups are open. Not saved: the group of the tab you open is opened for
// you, so there is nothing to lose between sessions.
const openGroups = new Set();

function dockDot(t, i) {
    const legacy = t.group === "legacy" ? " dock-legacy" : "";
    return `<div class="dock-icon sidebar-step${legacy}" id="dot_${i}" data-tab-id="${t.id}" title="${t.title}">
        <i class="fa-solid ${t.icon}"></i> <span>${t.title}</span>
    </div>`;
}

function buildDock(dotsContainer) {
    dotsContainer.empty();

    tabsUI.forEach((t, i) => { if (!t.group && !t.bottom && !t.parent) dotsContainer.append(dockDot(t, i)); });

    DOCK_GROUPS.forEach(g => {
        if (!g.fold) {
            // A heading only. Its tabs go straight into the dock, so the phone
            // bar shows them as pills of their own.
            dotsContainer.append(`<div class="dock-group-label" data-group="${g.id}"><span>${g.title}</span></div>`);
            tabsUI.forEach((t, i) => { if (t.group === g.id && !t.parent) dotsContainer.append(dockDot(t, i)); });
            return;
        }
        const legacy = g.id === "legacy" ? " dock-legacy" : "";
        dotsContainer.append(`<div class="dock-icon dock-group-head${legacy}" data-group="${g.id}" title="${g.tip || g.title}">
            <i class="fa-solid ${g.icon}"></i> <span>${g.title}<em class="dock-group-current"></em></span>
            <i class="fa-solid fa-chevron-right dock-group-chevron"></i>
        </div>`);
        const items = $(`<div class="dock-group-items" data-group="${g.id}"></div>`);
        tabsUI.forEach((t, i) => { if (t.group === g.id && !t.parent) items.append(dockDot(t, i)); });
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
        if (t.group !== groupId || t.parent) return;
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
    const activeTab = tabsUI[dockIndexOf(currentTab)] || {};
    const activeGroup = activeTab.group;
    DOCK_GROUPS.forEach(g => {
        if (!g.fold) return;
        const open = openGroups.has(g.id);
        const $head = dotsContainer.find(`.dock-group-head[data-group="${g.id}"]`);
        $head.toggleClass("open", open)
            .toggleClass("has-active", !open && activeGroup === g.id)
            // The phone bar never unfolds, so it always marks the group you are in
            // and names the tab: "Legacy · Memory".
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
    const dockTab = tabsUI[dockIndexOf(index)] || {};
    if (dockTab.group && !isSameTab) openGroups.add(dockTab.group);

    $(".dock-icon").removeClass("active");
    $(`#dot_${dockIndexOf(index)}`).addClass("active");
    refreshDockGroups();

    // Re-read every switch rather than only at build time: the dots are drawn once
    // and reused, so a notice spent this session has to be able to go out again.
    $(`#dot_${tabIndex("settings")}`).toggleClass("has-notice", hasUnseenSettingsNotice());

    container.empty();
    container.off(".devDirty");

    // A tab with pages gets the page bar on top, and draws into a box under it:
    // its own redraws empty that box, so the bar stays.
    let target = container;
    const pages = pagesOf(tab);
    if (pages) {
        const $bar = $(`<div class="igx-tabs dock-pages" role="tablist"></div>`);
        pages.forEach(p => {
            const $b = $(`<button type="button" class="${p.id === tab.id ? "on" : ""}"><i class="fa-solid ${p.icon}"></i> ${p.title}</button>`);
            $b.on("click", () => { if (p.id !== tab.id) switchTab(tabIndex(p.id)); });
            $bar.append($b);
        });
        target = $(`<div class="dock-page-body"></div>`);
        container.append($bar, target);
    }

    tab.render(target);

    if (isSameTab) {
        container.scrollTop(savedScroll);
    } else {
        container.scrollTop(0);
    }

    updateLiveTokenCount();
}

// ── "This tab: This character only / Every character" (plan 020) ──────────
//
// One control in the top bar, the same words on every tab. Tabs stored once
// for everyone show a quiet "Shared by every character" instead; a tab with
// nothing to share (Model Setup: a loadout has its own choice) shows nothing.
// In "Per Chat" save mode the words say chat instead of character.

const currentTabId = () => (tabsUI[currentTab] || {}).id;

function closeScopeMenu() {
    $("#meg_scope_menu").remove();
    $(document).off("click.megScope");
}

async function setTabScope(id, every) {
    const noun = scopeNoun();
    const title = tabPath(id);
    const map = meguminGlobalSyncMap();
    if (Boolean(map[id]) === every) return;
    if (every) {
        const $body = $(`<div style="text-align:left;">
            <h3 style="margin-top:0;">Use these ${esc(title)} settings for every ${noun}?</h3>
            <p>Every other ${noun}'s ${esc(title)} settings are replaced by the ones on screen now. From then on, a change here goes to all of them.</p>
            <p style="opacity:0.75;">Going back to "This ${noun} only" later keeps everyone's settings as they are then.</p>
        </div>`);
        const ok = await new Popup($body, POPUP_TYPE.CONFIRM, "", { okButton: `Use for every ${noun}`, cancelButton: "Cancel" }).show();
        if (!ok) return;
        map[id] = true;
        saveSettingsDebounced();
        if (!applyTabKeysToAllProfiles(id)) {
            map[id] = false;
            saveSettingsDebounced();
            toastr.warning("The panel is still showing the previous chat's settings. Reopen it and try again.", "Megumin Suite");
            updateGlobalSyncButton();
            return;
        }
        toastr.success(`${title}: every ${noun} uses these settings now.`, "Megumin Suite");
    } else {
        map[id] = false;
        saveSettingsDebounced();
        toastr.info(`${title}: changes stay with this ${noun} from now on. The others keep the settings they have.`, "Megumin Suite");
    }
    // Redraw: a page can depend on it (Story Config's row in Preset & Thinking).
    switchTab(currentTab);
}

/** Opens the scope menu under the top bar button. */
export function openScopeMenu(e) {
    if (e) e.stopPropagation();
    const id = currentTabId();
    if (!isSyncableTab(id)) return;
    if ($("#meg_scope_menu").length) { closeScopeMenu(); return; }
    const noun = scopeNoun();
    const on = meguminIsTabSynced(id);
    const $m = $(`<div id="meg_scope_menu" class="meg-scope-menu" role="menu">
        <div class="meg-scope-head">Who the ${esc(tabPath(id))} settings are for</div>
        <button type="button" role="menuitemradio" data-every="0" class="${on ? "" : "on"}">
            <i class="fa-solid fa-user"></i>
            <span><b>This ${noun} only</b><small>Changes here stay with this ${noun}. The others keep their own.</small></span>
        </button>
        <button type="button" role="menuitemradio" data-every="1" class="${on ? "on" : ""}">
            <i class="fa-solid fa-users"></i>
            <span><b>Every ${noun}</b><small>One setup for all of them. A change here goes to every ${noun}.</small></span>
        </button>
    </div>`);
    $m.on("click", "button", function () {
        const every = $(this).attr("data-every") === "1";
        closeScopeMenu();
        setTabScope(id, every);
    });
    const $btn = $("#btn_apply_tab_all");
    const host = $btn.closest(".ps-modern-modal");
    (host.length ? host : $("body")).append($m);
    // Under the button, kept inside the window.
    const hostRect = (host.length ? host[0] : document.body).getBoundingClientRect();
    const r = $btn[0].getBoundingClientRect();
    const width = $m.outerWidth();
    const left = Math.max(10, Math.min(r.right - hostRect.left - width, hostRect.width - width - 10));
    $m.css({ top: `${r.bottom - hostRect.top + 6}px`, left: `${left}px` });
    setTimeout(() => {
        $(document).on("click.megScope", ev => {
            if (!$(ev.target).closest("#meg_scope_menu").length) closeScopeMenu();
        });
    }, 0);
}

export function meguminPropagateTabIfSynced() {
    // Only while the settings window is open: a save from a background feature
    // (an NPC banking itself, a summary landing) is not an edit to a tab.
    if (!$("#btn_apply_tab_all").length) return;
    const id = currentTabId();
    if (!meguminIsTabSynced(id)) return;
    applyTabKeysToAllProfiles(id);
}

export function updateGlobalSyncButton() {
    const btn = $("#btn_apply_tab_all");
    if (!btn.length) return;
    closeScopeMenu();
    const id = currentTabId();
    const noun = scopeNoun();
    btn.removeClass("scope-shared scope-every scope-one");

    if (TABS_ALREADY_GLOBAL.includes(id)) {
        btn.addClass("scope-shared").prop("disabled", true)
            .html(`<i class="fa-solid fa-users"></i> <span class="meg-scope-text">Shared by every ${noun}</span>`)
            .attr("title", "This tab is one setup for everyone: there is nothing to choose here.");
        return;
    }
    if (!isSyncableTab(id)) {
        btn.hide();
        return;
    }
    const on = meguminIsTabSynced(id);
    btn.addClass(on ? "scope-every" : "scope-one").prop("disabled", false)
        .html(`<i class="fa-solid ${on ? "fa-users" : "fa-user"}"></i> <span class="meg-scope-pre">This tab:</span> <span class="meg-scope-text">${on ? `Every ${noun}` : `This ${noun} only`}</span> <i class="fa-solid fa-caret-down meg-scope-caret"></i>`)
        .attr("title", on
            ? `A change on this tab goes to every ${noun}. Click to change.`
            : `Changes on this tab stay with this ${noun}. Click to change.`);
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
