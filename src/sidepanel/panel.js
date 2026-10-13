/* eslint-disable no-undef */
/*
 * Megumin Suite — Side Panel (orchestrator)
 *
 * Mounts a dockable/floatable panel that mirrors the trackers Megumin emits
 * inline in chat (World State, NPC Inner Chatter, Summary, New NPC dossiers)
 * plus profile-stored data (Story Planner, NPC Bank, Ban List).
 *
 * Section content lives in sections.js (SECTION_REGISTRY); window management
 * (drag/resize/dock-float/scale) lives in chrome.js; shared DOM helpers in
 * dom.js. This module owns: settings + migration, the panel skeleton, the
 * render loop, SillyTavern event wiring, inline-block stripping, and the
 * public API consumed by index.js.
 */

import { extension_settings, getContext } from "../../../../../extensions.js";
import {
    eventSource,
    event_types,
    saveSettingsDebounced,
} from "../../../../../../script.js";

import { findLastAssistantMessage, getParsedBlockCounts, getParsedBlockTypes, parseMessage, parseStoryTracker } from "./parsers.js";
import { el } from "./dom.js";
import { allSections } from "./sections.js";
import {
    initPanelChrome,
    applyLayout,
    applyScale,
    setMode,
    clampToViewport,
} from "./chrome.js";
import {
    initPresentBar,
    refreshPresentBar,
    getPresentBarSettings,
    applyPresentBarChange,
} from "./presentBar.js";

const EXT_NAME = "Megumin-Suite";
const PANEL_ID = "meg-sp-panel";
const FAB_ID = "meg-sp-fab";
const BODY_HIDE_CLASS = "meg-sp-hide-inline";
const BODY_OPEN_CLASS = "meg-sp-panel-open";
const SETTINGS_KEY = "sidePanel";

// One console line to settle which copy of this module the browser is
// actually running. Browsers cache extension files on their own schedule, and
// a stale copy looks exactly like a bug in the fresh one - it already cost a
// full investigation of code that was never running. The tag changes on every
// deploy; if the console shows an older tag than the deploy notes, the
// browser needs a cache-clearing reload before anything else is worth doing.
const BUILD_TAG = "2026-08-02g";
try { console.debug(`[Megumin Side Panel] sidepanel build ${BUILD_TAG}`); } catch (e) { /* */ }

const DEFAULTS = Object.freeze({
    schemaVersion: 2,
    enabled: false,
    mode: "docked",              // "docked" | "floating"
    position: "right",           // docked edge
    width: 340,                  // docked width px
    collapsed: false,
    hideInline: true,
    scale: 1.0,                  // 0.8–1.4
    autoHideEmpty: true,
    float: { x: null, y: null, w: 620, h: 720 },
    sections: {
        worldState:   { visible: true, open: true,  order: 0 },
        innerChatter: { visible: true, open: true,  order: 1 },
        newNpcs:      { visible: true, open: true,  order: 2 },
        storyPlan:    { visible: true, open: false, order: 3 },
        npcBank:      { visible: true, open: true,  order: 4 },
        banList:      { visible: true, open: false, order: 5 },
    },
});

let initialised = false;
let getProfile = () => ({});   // Injected by index.js
let pendingRender = null;
const lastBadgeCounts = new Map();

// -----------------------------------------------------------------------------
// Settings + migration
// -----------------------------------------------------------------------------
const LEGACY_DEFAULTS = Object.freeze({
    width: [360], // historic default widths
});

function migrateSidePanelSettings(cur) {
    // v1 → v2: sections were booleans; now {visible, open, order}.
    // Keyed on the actual saved shape, NOT schemaVersion — the generic
    // defaults backfill stamps schemaVersion: 2 before we run, so a
    // version check would always pass and the migration would never fire.
    for (const def of allSections()) {
        const v = cur.sections[def.id];
        if (typeof v === "boolean") {
            cur.sections[def.id] = { visible: v, open: def.defaultOpen, order: def.order };
        } else if (v === undefined) {
            cur.sections[def.id] = { visible: true, open: def.defaultOpen, order: def.order };
        }
    }
    cur.schemaVersion = 2;
}

function settings() {
    if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = {};
    if (!extension_settings[EXT_NAME][SETTINGS_KEY]) {
        extension_settings[EXT_NAME][SETTINGS_KEY] = structuredClone(DEFAULTS);
    } else {
        const cur = extension_settings[EXT_NAME][SETTINGS_KEY];
        const def = DEFAULTS;
        for (const k of Object.keys(def)) {
            if (cur[k] === undefined) cur[k] = structuredClone(def[k]);
        }
        if (!cur.sections) cur.sections = structuredClone(def.sections);
        for (const [k, legacyVals] of Object.entries(LEGACY_DEFAULTS)) {
            if (legacyVals.includes(cur[k]) && cur[k] !== def[k]) cur[k] = def[k];
        }
        migrateSidePanelSettings(cur);
        // Backfill sections added after migration stamped v2
        for (const sd of allSections()) {
            if (cur.sections[sd.id] === undefined) {
                cur.sections[sd.id] = { visible: true, open: sd.defaultOpen, order: sd.order };
            }
        }
        if (!cur.float || typeof cur.float !== "object") cur.float = structuredClone(def.float);
    }
    return extension_settings[EXT_NAME][SETTINGS_KEY];
}

function persist() {
    try { saveSettingsDebounced(); } catch (e) { /* noop */ }
}

// -----------------------------------------------------------------------------
// Panel skeleton
// -----------------------------------------------------------------------------
function buildPanelSkeleton() {
    const cfg = settings();

    const fab = el("button", {
        id: FAB_ID,
        class: "meg-sp-fab",
        title: "Megumin Suite Trackers",
    }, el("i", { class: "fa-solid fa-clipboard-list" }));
    fab.addEventListener("click", () => togglePanel());

    const panel = el("aside", {
        id: PANEL_ID,
        class: `meg-sp-panel${cfg.collapsed ? " meg-sp-collapsed" : ""}`,
    });

    const header = el("div", { class: "meg-sp-header" },
        el("div", { class: "meg-sp-header-bg", id: "meg-sp-header-bg" }),
        el("div", { class: "meg-sp-header-overlay" }),
        el("div", { class: "meg-sp-title" },
            el("i", { class: "fa-solid fa-wand-magic-sparkles" }),
            " Megumin Trackers"),
        el("div", { class: "meg-sp-header-actions" },
            el("button", {
                class: "meg-sp-icon-btn",
                title: "Open NPC Book",
                onclick: () => openNpcBook(),
            }, el("i", { class: "fa-solid fa-book-open" })),
            el("button", {
                class: "meg-sp-icon-btn",
                title: "Refresh from latest message",
                onclick: () => { render(); refreshPresentBar(); },
            }, el("i", { class: "fa-solid fa-rotate" })),
            el("button", {
                class: "meg-sp-icon-btn",
                title: "Collapse panel",
                onclick: () => togglePanel(false),
            }, el("i", { class: "fa-solid fa-xmark" })),
        ),
    );

    const body = el("div", { class: "meg-sp-body" });
    body.appendChild(el("div", { class: "meg-sp-empty", id: "meg-sp-empty" },
        el("i", { class: "fa-solid fa-hat-wizard" }),
        el("p", {}, "No tracker data yet. The panel updates whenever the AI emits its Blocks section."),
    ));
    body.appendChild(el("div", { class: "meg-sp-sections", id: "meg-sp-sections" }));

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(fab);
    document.body.appendChild(panel);

    initPanelChrome(panel, {
        getSettings: settings,
        persist,
        onLayoutChange: () => syncBodyClasses(),
    });
}

// -----------------------------------------------------------------------------
// NPC Book bridge — opens the existing Megumin Suite modal on the NPCs Bank tab
// -----------------------------------------------------------------------------
function clickNpcBankDot() {
    // Title-based lookup so upstream tab reorders don't break us
    const dock = document.querySelectorAll("#ps_dynamic_dots .dock-icon");
    for (let i = 0; i < dock.length; i++) {
        if ((dock[i].getAttribute("title") || "").trim() === "NPCs Bank") {
            const dot = document.getElementById("dot_" + i);
            if (dot) { dot.click(); return true; }
        }
    }
    return false;
}

function openNpcBook(focusIdx) {
    const $overlay = window.jQuery ? window.jQuery("#prompt-slot-modal-overlay") : null;
    if (!$overlay || !$overlay.length) {
        try { (window.toastr || console).info("Open Megumin Suite (wand icon) at least once first.", "NPC Book"); } catch (e) { /* */ }
        return;
    }

    // The dock icons are only injected by Megumin's own open path (wand
    // click → switchTab). If the modal has never been opened this session,
    // the dock is empty and fading the overlay in shows a blank stage —
    // so go through the wand's click handler, which runs the full init.
    const dockEmpty = !document.querySelector("#ps_dynamic_dots .dock-icon");
    if (dockEmpty) {
        const wand = document.getElementById("prompt-slot-fixed-btn");
        if (wand) wand.click();
        // switchTab(0) has now rendered the dock; hop to the bank tab.
        setTimeout(clickNpcBankDot, 50);
    } else {
        $overlay.fadeIn(200).css("display", "flex");
        clickNpcBankDot();
    }

    if (typeof focusIdx === "number" && focusIdx >= 0) {
        setTimeout(() => {
            const cards = document.querySelectorAll("#ps_stage_content .npc-card");
            const targetName = (getProfile().npcBank?.npcs || [])[focusIdx]?.name;
            if (!targetName) return;
            for (const card of cards) {
                if ((card.textContent || "").includes(targetName)) {
                    const header = card.querySelector(".npc-card-header");
                    const body = card.querySelector(".npc-card-body");
                    if (header && body && body.style.display === "none") header.click();
                    // Scroll ONLY the modal's stage container. scrollIntoView
                    // walks every scrollable ancestor — including the
                    // overflow-hidden but programmatically-scrollable body —
                    // which shifted ST's whole layout (the "grey bar" bug).
                    const stage = document.getElementById("ps_stage_content");
                    if (stage && stage.contains(card)) {
                        const top = card.offsetTop - stage.clientHeight / 2 + card.offsetHeight / 2;
                        stage.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
                    }
                    break;
                }
            }
            // Defensive: undo any stray document scroll from earlier sessions
            if (document.documentElement.scrollTop) document.documentElement.scrollTop = 0;
            if (document.body.scrollTop) document.body.scrollTop = 0;
        }, dockEmpty ? 450 : 300);
    }
}

// -----------------------------------------------------------------------------
// Banked NPC lookup (shared with sections + present bar cast)
// -----------------------------------------------------------------------------
function lookupBankedNpc(name) {
    if (!name) return null;
    const npcs = getProfile()?.npcBank?.npcs;
    if (!Array.isArray(npcs)) return null;
    const target = name.trim().toLowerCase();
    for (const n of npcs) {
        const nm = (n.name || "").trim().toLowerCase();
        if (!nm) continue;
        if (nm === target) return n;
        if (nm.split(/\s+/)[0] === target.split(/\s+/)[0]) return n;
    }
    return null;
}

// -----------------------------------------------------------------------------
// Render loop
// -----------------------------------------------------------------------------
function buildSectionCtx() {
    let parsed = { hasAny: false };
    // Fail open. A context that could not be read is not proof that no chat is
    // open, and the profile sections showing when they should not is the smaller
    // fault of the two - the same way round as the inline hider, which fails
    // visible rather than hidden.
    let hasChat = true;
    try {
        const ctx = getContext();
        // Closing a chat leaves SillyTavern with neither a character nor a group:
        // `closeCurrentChat` puts both back to nothing, and the chat id it then
        // reports is nothing as well. Either one being present is a chat being
        // open. Both are checked against undefined AND null, because the two are
        // emptied to different ones of those.
        hasChat = (ctx?.characterId !== undefined && ctx?.characterId !== null)
            || (ctx?.groupId !== undefined && ctx?.groupId !== null);
        const found = findLastAssistantMessage(ctx?.chat);
        if (found) parsed = parseMessage(found.msg.mes);
    } catch (e) {
        console.warn("[Megumin Side Panel] parse failure", e);
    }
    return {
        parsed,
        hasChat,
        profile: getProfile() || {},
        cfg: settings(),
        openNpcBook,
        lookupBankedNpc,
    };
}

export function getOrderedSections(cfg) {
    return [...allSections()].sort((a, b) =>
        (cfg.sections[a.id]?.order ?? a.order) - (cfg.sections[b.id]?.order ?? b.order));
}

function onGripKeydown(e, sectionId) {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    e.stopPropagation();
    const cfg = settings();
    const ordered = getOrderedSections(cfg).filter(d => cfg.sections[d.id]?.visible !== false);
    const idx = ordered.findIndex(d => d.id === sectionId);
    if (idx < 0) return;
    const swapWith = e.key === "ArrowUp" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    const ids = ordered.map(d => d.id);
    [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
    applySectionOrder(ids);
    // Restore focus to the moved grip after re-render
    requestAnimationFrame(() => {
        document.querySelector(`#meg-sp-section-${sectionId} .meg-sp-drag-handle`)?.focus();
    });
}

function buildSectionShell(def, st, contentNode, badgeVal) {
    const d = el("details", {
        class: "meg-sp-section",
        id: "meg-sp-section-" + def.id,
        "data-section-id": def.id,
    });
    d.open = !!st.open;

    const grip = el("span", {
        class: "meg-sp-drag-handle",
        tabindex: "0",
        role: "button",
        title: "Alt+↑/↓ to reorder",
        onkeydown: (e) => onGripKeydown(e, def.id),
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); },
    }, el("i", { class: "fa-solid fa-grip-vertical" }));

    let badgeNode = null;
    if (badgeVal !== null && badgeVal !== undefined) {
        badgeNode = el("span", { class: "meg-sp-badge" }, String(badgeVal));
        const prev = lastBadgeCounts.get(def.id);
        if (prev !== undefined && prev !== badgeVal) {
            badgeNode.classList.add("meg-sp-badge-pulse");
            badgeNode.addEventListener("animationend", () => badgeNode.classList.remove("meg-sp-badge-pulse"), { once: true });
        }
        lastBadgeCounts.set(def.id, badgeVal);
    }

    const sum = el("summary", { class: "meg-sp-summary" },
        grip,
        el("span", { class: "meg-sp-summary-title" },
            el("i", { class: "fa-solid " + def.icon }),
            " ",
            def.title),
        badgeNode,
        el("i", { class: "fa-solid fa-chevron-down meg-sp-chevron" }),
    );
    d.appendChild(sum);
    d.appendChild(contentNode);

    d.addEventListener("toggle", () => {
        // <details> toggle events are macrotasks, so a render-time flag can't
        // distinguish rebuild-triggered events from user clicks. Compare the
        // persisted value instead: rebuild events fire with open === saved
        // state (a no-op write we skip); only real user toggles differ.
        const cfg = settings();
        const st2 = cfg.sections[def.id];
        if (st2 && typeof st2 === "object" && st2.open !== d.open) {
            st2.open = d.open;
            persist();
        }
    });

    return d;
}

function syncBodyClasses() {
    const cfg = settings();
    // Only the FAB's dim/shrink cue consumes this class (no layout depends
    // on it), so it applies in both docked and floating modes.
    document.body.classList.toggle(BODY_OPEN_CLASS, cfg.enabled && !cfg.collapsed);
    document.body.classList.toggle(BODY_HIDE_CLASS, cfg.enabled && !!cfg.hideInline);
}

function render() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const cfg = settings();
    if (!cfg.enabled) {
        panel.style.display = "none";
        document.body.classList.remove(BODY_OPEN_CLASS);
        return;
    }
    panel.classList.toggle("meg-sp-collapsed", !!cfg.collapsed);

    // Update chevron/icon direction on toggle button (FAB)
    const fab = panel.querySelector("#" + FAB_ID);
    if (fab) {
        const icon = fab.querySelector("i");
        if (icon) {
            const position = cfg.position || "right";
            const collapsed = !!cfg.collapsed;
            const floating = cfg.mode === "floating";
            icon.className = "fa-solid";
            if (floating) {
                icon.classList.add("fa-clipboard-list");
            } else if (position === "right") {
                icon.classList.add(collapsed ? "fa-chevron-left" : "fa-chevron-right");
            } else {
                icon.classList.add(collapsed ? "fa-chevron-right" : "fa-chevron-left");
            }
        }
    }

    applyLayout();
    syncBodyClasses();

    const host = panel.querySelector("#meg-sp-sections");
    const empty = panel.querySelector("#meg-sp-empty");
    const bodyEl = panel.querySelector(".meg-sp-body");
    if (!host) return;

    const savedScroll = bodyEl ? bodyEl.scrollTop : 0;

    const ctx = buildSectionCtx();

    // Worked out once per render, off the same raw text the panel just parsed.
    // The console line goes out whether or not the empty text is on screen, so a
    // bug report has something concrete in it either way — but only when the
    // answer CHANGES, because the render loop runs on every panel event and the
    // same message would otherwise print the same line over and over.
    const unreadable = findUnreadableBlockTypes(ctx.parsed?.rawText);
    if (unreadableNoticeChanged(unreadable)) {
        console.debug("[Megumin Side Panel] block found in the last message but could not be read:", unreadable.join(", "));
    }

    host.innerHTML = "";

    for (const def of getOrderedSections(cfg)) {
        const st = cfg.sections[def.id];
        if (!st || st.visible === false) continue;

        let content = null;
        try {
            content = def.render(ctx);
        } catch (e) {
            console.warn(`[Megumin Side Panel] section ${def.id} render failed`, e);
        }

        if (!content) {
            if (cfg.autoHideEmpty) continue;
            content = el("div", { class: "meg-sp-muted" }, "—");
        }

        const badgeVal = typeof def.badge === "function" ? def.badge(ctx) : null;
        host.appendChild(buildSectionShell(def, st, content, badgeVal));
    }


    if (empty) {
        if (host.children.length) {
            empty.style.display = "none";
        } else {
            // Distinguish "no data yet" from "data exists but every section
            // is hidden" — the old panel keyed off actual data presence.
            // With no chat open the profile is still full, but none of it belongs
            // to anything on screen, so it must not count as data here. Left in, it
            // made closing a chat report "all sections are hidden", which is not
            // what happened and sends the reader to a settings tab with nothing
            // wrong in it.
            const prof = ctx.hasChat === false ? {} : (ctx.profile || {});
            const hasData = ctx.parsed?.hasAny
                || (ctx.parsed?.newNpcs && ctx.parsed.newNpcs.length)
                || (prof.storyPlan?.currentPlan && prof.storyPlan.currentPlan.trim())
                || (prof.npcBank?.npcs && prof.npcBank.npcs.length)
                || (prof.banList && prof.banList.length);
            const p = empty.querySelector("p");
            if (p) {
                // A block that arrived and could not be read is named here instead of
                // the generic line, which reads as "the AI sent nothing" and is wrong.
                const notice = unreadableBlockNotice(unreadable);
                p.textContent = hasData
                    ? "All sections are hidden. Re-enable them in the Side Panel settings tab."
                    : (notice || "No tracker data yet. The panel updates whenever the AI emits its Blocks section.");
            }
            empty.style.display = "";
        }
    }
    if (bodyEl) bodyEl.scrollTop = savedScroll;
}

function scheduleRender(delay = 0) {
    if (pendingRender) clearTimeout(pendingRender);
    pendingRender = setTimeout(() => {
        pendingRender = null;
        render();
        try { refreshPresentBar(); } catch (e) { /* */ }
    }, delay);
}

// -----------------------------------------------------------------------------
// Section order API (used by grip keyboard reorder + settings tab)
// -----------------------------------------------------------------------------
export function applySectionOrder(ids) {
    const cfg = settings();
    ids.forEach((id, i) => {
        if (cfg.sections[id]) cfg.sections[id].order = i;
    });
    // Push hidden sections after the visible ones, preserving relative order
    let tail = ids.length;
    for (const def of getOrderedSections(cfg)) {
        if (!ids.includes(def.id)) {
            if (cfg.sections[def.id]) cfg.sections[def.id].order = tail++;
        }
    }
    persist();
    render();
}

export function resetSectionLayout() {
    const cfg = settings();
    for (const def of allSections()) {
        cfg.sections[def.id] = { visible: true, open: def.defaultOpen, order: def.order };
    }
    persist();
    render();
}

// -----------------------------------------------------------------------------
// Present Characters cast
// -----------------------------------------------------------------------------
function buildPresentCast() {
    try {
        const ctx = getContext();
        const found = findLastAssistantMessage(ctx?.chat);
        const parsed = found ? parseMessage(found.msg.mes) : null;
        const npcs = parsed?.worldState?.npcs || [];
        const out = [];
        const seen = new Set();
        for (const npc of npcs) {
            const name = (npc.name || "").trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ name, fields: npc.fields || {}, banked: lookupBankedNpc(name) });
        }
        return out;
    } catch (e) {
        return [];
    }
}

// -----------------------------------------------------------------------------
// Inline-hiding: hide tracker <details> in the rendered chat DOM.
// Raw chat[].mes stays intact so re-parsing on swipe/edit keeps working.
//
// Parse first, hide second. A block only leaves the chat if the panel could
// actually read it out of the raw message; if it can't be parsed, it isn't
// hidden. Two consequences worth knowing about:
//   - a renamed or half-written (truncated) block now STAYS in the chat by
//     design, and the panel shows nothing for it. Visible-but-not-in-the-panel
//     is fine. The old behaviour's gone-from-both is what this replaces.
//   - for New NPC dossiers the check is per block, not per block type. A
//     message can carry several, so the number the patterns found and the
//     number on screen have to be the same number, and at least one. Two
//     dossiers where only one parses: BOTH stay in the chat.
// -----------------------------------------------------------------------------

// The label is the anchor, not the emoji — an AI that dropped the 📌 still
// wrote a World State block. Case-insensitive, since the summary is free text.
// `name` is the same label in the words the panel puts in front of the reader.
const INLINE_BLOCK_LABELS = [
    { type: "worldState", re: /World State/i, name: "World State" },
    { type: "innerChatter", re: /NPC Inner Chatter/i, name: "NPC Inner Chatter" },
    { type: "newNpc", re: /New NPC:/i, name: "New NPC" },
];

// Summary text -> block type. Pure. "unknown" covers everything we can't name,
// including ordinary <details> the user or another extension put in the chat.
export function classifyInlineBlock(summaryText) {
    const s = typeof summaryText === "string" ? summaryText : "";
    for (const { type, re } of INLINE_BLOCK_LABELS) {
        if (re.test(s)) return type;
    }
    return "unknown";
}

// The NOTICE asks a stricter question than the hider does. To the readers, a
// summary whose run in front of the label carries a WORD is prose ABOUT the
// block rather than the block itself: `Author's note on the World State
// system` is somebody writing about it, and the readers refuse to parse it.
// The classifier above finds the label ANYWHERE in the summary, so left to it
// this notice would report every such fold as a block that arrived and could not
// be read — on screen and in the console, on every render.
//
// Same letter rule as the readers, and only here: whatever sits in front of the
// label may not contain a letter, so a leading emoji, `**`, `*`, `_`, digits,
// spaces and bars all still pass and an ordinary word does not. Letters AFTER
// the label are fine, so a model writing `World State Tracker` is still
// reported, and so are the cases this notice exists for: a block whose tag came
// out wrong under a clean heading, and a block cut off before it finished.
//
// The HIDING path deliberately keeps the plain classifier. Parse first, hide
// second already leaves a fold the readers refuse to parse sitting in the chat,
// so narrowing the classifier there would change what gets hidden and nothing
// else. This changes only what the panel SAYS.
export function classifyNoticeBlock(summaryText) {
    const s = typeof summaryText === "string" ? summaryText : "";
    for (const { type, re } of INLINE_BLOCK_LABELS) {
        const m = s.match(re);
        if (m && !/\p{L}/u.test(s.slice(0, m.index))) return type;
    }
    return "unknown";
}

// Every <summary> in the raw message. Global, so its position is reset before
// each walk, the same guard the readers in parsers.js use.
const SUMMARY_SCAN_RE = /<summary[^>]*>([\s\S]*?)<\/summary\s*>/ig;

// Which block types did the message CARRY without the panel managing to READ
// them? The classifier above says what a block looks like and getParsedBlockTypes
// says what actually parsed, and the gap between the two is the one thing the
// panel has never been able to tell the reader: it says there is no tracker data
// when a block did arrive and could not be read. Raw message text in, list of
// types out, no DOM — the same string the hiding code reads, so the two can never
// disagree about the same message.
export function findUnreadableBlockTypes(mesText) {
    const out = [];
    if (typeof mesText !== "string" || !mesText) return out;
    const parsed = getParsedBlockTypes(mesText);
    SUMMARY_SCAN_RE.lastIndex = 0;
    let m;
    while ((m = SUMMARY_SCAN_RE.exec(mesText)) !== null) {
        // Tags inside the summary come out first, so `<b>World State</b>` reads as
        // its own text — which is what the classifier expects to be handed.
        const type = classifyNoticeBlock((m[1] || "").replace(/<[^>]*>/g, " "));
        if (type === "unknown" || parsed.has(type) || out.includes(type)) continue;
        out.push(type);
    }
    return out;
}

// That list as the one line the panel shows. Empty string for an empty list,
// which is what leaves the generic empty text in place when the message simply
// carried no block at all.
export function unreadableBlockNotice(types) {
    if (!Array.isArray(types) || !types.length) return "";
    const names = types.map(t => (INLINE_BLOCK_LABELS.find(l => l.type === t) || {}).name || t);
    // One shape for one block and for several, so no label ever lands behind the
    // wrong article — "a NPC Inner Chatter block" is not a sentence.
    return `${names.length === 1 ? "A block was" : "Blocks were"} found in the last reply but could not be read: ${names.join(", ")}.`;
}

// The console line is a hook for a bug report, not a log stream. The render loop
// runs on every panel event, so a message carrying a block the panel cannot read
// would print the same line again and again for as long as it is the last
// message. It goes out when the answer CHANGES instead: the first render that
// finds a block it cannot read, and again whenever the list becomes a different
// list. Renders that say the same thing stay quiet, and a message with nothing
// wrong with it says nothing at all.
let lastUnreadableNotice = null;
export function unreadableNoticeChanged(types) {
    const key = Array.isArray(types) ? types.join(",") : "";
    if (key === lastUnreadableNotice) return false;
    lastUnreadableNotice = key;
    return Boolean(key);
}

// Block type + the set of types the raw message parsed into -> hide it? Pure.
// A parsedTypes of null means the raw text couldn't be reached at all, and the
// answer is no: fail visible, never fail hidden.
//
// New NPC dossiers get one extra question. A message can carry several of them,
// and a type-level yes would hide all of them the moment ONE parsed, taking the
// unparsed ones with it. So for newNpc the number the patterns found and the
// number on screen have to match, and be at least one; anything else and every
// dossier in that message stays visible.
//
// World State and NPC Inner Chatter keep the plain type-level rule. They are
// one per message, so their counts only ever run 0 or 1 and the two rules give
// the same answer — running the count rule on them would change nothing.
//
// parsedCounts and domCount are optional. Left out, the answer is the old
// type-level one, which is what keeps this callable with two arguments.
export function shouldHideInlineBlock(type, parsedTypes, parsedCounts, domCount) {
    if (!type || type === "unknown") return false;
    if (!parsedTypes || typeof parsedTypes.has !== "function") return false;
    if (!parsedTypes.has(type)) return false;
    if (type !== "newNpc") return true;
    if (!parsedCounts || typeof domCount !== "number") return true;
    const parsedCount = parsedCounts[type];
    if (typeof parsedCount !== "number") return true;
    return parsedCount > 0 && parsedCount === domCount;
}

// The chat index a rendered message body belongs to, read off its mesid.
// -1 when the body can't be identified, which every caller reads as "leave
// it alone".
function mesIndexOf(node) {
    const mes = node?.closest?.(".mes[mesid]");
    if (!mes) return -1;
    const idx = Number(mes.getAttribute("mesid"));
    return Number.isInteger(idx) && idx >= 0 ? idx : -1;
}

// The one message the hider applies to: the latest AI reply. The walk-back is
// findLastAssistantMessage's own — a user message sitting at the end of the
// chat is stepped over, and so are system messages — so the hider and the
// panel always mean the same message. -1 when there is none.
function latestAssistantIndex() {
    try {
        const found = findLastAssistantMessage(getContext()?.chat);
        return found ? found.index : -1;
    } catch (e) {
        return -1;
    }
}

// The raw text behind a rendered message, straight off ctx.chat — the same
// string the panel parses. null when the message can't be identified (no
// mesid, index past the end of the chat), which reads as "leave it visible".
function rawMesTextFor(node) {
    try {
        const idx = mesIndexOf(node);
        if (idx < 0) return null;
        const chat = getContext()?.chat;
        if (!Array.isArray(chat) || idx >= chat.length) return null;
        const raw = chat[idx]?.mes;
        return typeof raw === "string" ? raw : null;
    } catch (e) {
        return null;
    }
}

// The span that hides a Story Tracker remnant, and the marker for the empty
// formatting hidden alongside a block. Both hide with an inline style rather
// than a stylesheet rule: nothing in any stylesheet competes for a plain
// span's display, so the style alone is enough, and clearing it is the whole
// undo.
const TRACKER_WRAP_CLASS = "meg-sp-tracker-remnant";
const TRACKER_BOX_CLASS = "meg-sp-tracker-box";
const GAP_HIDE_CLASS = "meg-sp-hidden-gap";

// Put one message body back the way it renders untouched. No parsing: whatever
// this file hid in the body comes back, and a body it never touched reads as
// a no-op. The details class has to come off, not just the style — styles.css
// hides that class with `!important`, so a visible message may not carry it.
// The wrapper spans around a tracker remnant stay in place as inert spans;
// unwrapping them would reshuffle the body's children on every pass, and an
// inline span with no style of its own changes nothing on screen.
function unhideInline(root) {
    root.querySelectorAll("details.meg-sp-tracker-block").forEach(d => {
        d.classList.remove("meg-sp-tracker-block");
        d.style.display = "";
    });
    root.querySelectorAll("span." + TRACKER_WRAP_CLASS).forEach(w => {
        w.style.display = "";
    });
    root.querySelectorAll("." + TRACKER_BOX_CLASS).forEach(b => {
        b.style.display = "";
    });
    root.querySelectorAll("." + GAP_HIDE_CLASS).forEach(el => {
        el.classList.remove(GAP_HIDE_CLASS);
        el.style.display = "";
    });
}

// Every tracker span in one message, in the order they sit in it, through the
// reader in parsers.js. That reader answers for the first tracker in whatever
// text it is handed, so the text is re-sliced past each span and asked again:
// same reader, same handshake, no second pattern to drift away from it.
function collectStoryTrackers(raw) {
    const out = [];
    let text = typeof raw === "string" ? raw : "";
    let guard = 0;
    while (text && guard++ < 25) {
        const t = parseStoryTracker(text);
        if (!t.raw) break;
        out.push(t);
        const at = text.indexOf(t.raw);
        if (at < 0) break;
        text = text.slice(at + t.raw.length);
    }
    return out;
}

// What a line of tracker text reads as once the message pipeline is done with
// it. The platform drops the unknown tracker tags and leaves the body behind
// as ordinary text, and markdown is applied to that text on its way to the
// screen: `**` and `*` wrappers become tags, `_word_` becomes italics, while
// an underscore inside a word — `arc_status` — survives as itself. So the
// emphasis marker characters are dropped from BOTH sides of the comparison, a
// leading bullet comes off the same way, and whitespace is folded, which is
// also what a raw newline collapses to on screen. Lowercased because nothing
// here needs case.
function normalizeRemnantLine(s) {
    return String(s ?? "")
        .replace(/^\s*(?:>\s*)+/, "")
        .replace(/^\s*[-•]\s+/, "")
        .replace(/[*_~`]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

const REMNANT_BLOCK_TAGS = /^(P|DIV|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|THEAD|TBODY|TR|TD|TH|H[1-6]|HR)$/;

// Cut one message body into on-screen lines. A line ends at a <br>, at the
// edge of a block-level element, or at the end of the body; a newline inside
// a text node is only a space on screen and does not end one. Each line
// remembers the sibling nodes it is made of, so a located run can be wrapped
// without touching anything outside it. <details> subtrees are the folds this
// file already manages and are stepped over whole. A wrapper span from an
// earlier pass is walked through as if it were not there, which is what lets
// a second pass find the same lines in the same places instead of reading the
// whole wrapped remnant as one long line.
function collectDomLines(root) {
    const lines = [];
    let cur = null;
    const flush = () => {
        if (cur && cur.norm) lines.push(cur);
        cur = null;
    };
    const take = (node) => {
        if (!cur) cur = { nodes: [], text: "", norm: "" };
        cur.nodes.push(node);
        cur.text += node.textContent || "";
        cur.norm = normalizeRemnantLine(cur.text);
    };
    const walk = (container) => {
        for (let n = container.firstChild; n; n = n.nextSibling) {
            if (n.nodeType === 3) { take(n); continue; }
            if (n.nodeType !== 1) continue;
            const tag = n.tagName || "";
            if (tag === "BR") { flush(); continue; }
            // The panel's own folds hide as whole elements and are stepped
            // over as before. A fold some OTHER extension built around a
            // stretch of the message is different: the tracker can be sitting
            // inside it, so its content has to be walked or the walk reports
            // the tracker as never drawn. The fold's title line is skipped —
            // it is the box's own label, never message text.
            if (tag === "DETAILS") {
                flush();
                const sum = n.querySelector ? n.querySelector("summary") : null;
                if (classifyInlineBlock(sum ? sum.textContent || "" : "") === "unknown") {
                    walk(n);
                    flush();
                }
                continue;
            }
            if (tag === "SUMMARY") { flush(); continue; }
            // Inside a code box the line breaks are real newlines, not <br>
            // elements, so its text is cut on those. Every line remembers the
            // box itself: a code box can only be hidden whole.
            if (tag === "PRE") {
                flush();
                for (const piece of String(n.textContent || "").split(/\r?\n/)) {
                    const norm = normalizeRemnantLine(piece);
                    if (norm) lines.push({ nodes: [n], text: piece, norm, boxEl: n });
                }
                continue;
            }
            if (n.classList && n.classList.contains(TRACKER_WRAP_CLASS)) {
                flush();
                walk(n);
                flush();
                continue;
            }
            if (REMNANT_BLOCK_TAGS.test(tag)) {
                flush();
                walk(n);
                flush();
                continue;
            }
            take(n);
        }
    };
    walk(root);
    flush();
    return lines;
}

// Find the run of on-screen lines that IS this tracker's body. The anchor is
// the first body line, and from wherever it matches the whole body has to
// match, line for line, through to the last one — which is what keeps a
// sentence of prose that happens to repeat the first line from being taken
// for the block. null when the body cannot be found whole; the caller then
// leaves every tracker in the message visible.
function locateTrackerLines(domLines, tracker, fromIdx) {
    const bodyLines = String(tracker.body || "").split(/\r?\n/)
        .map(normalizeRemnantLine)
        .filter(Boolean);
    if (!bodyLines.length) return null;
    for (let i = fromIdx; i + bodyLines.length <= domLines.length; i++) {
        let ok = true;
        for (let k = 0; k < bodyLines.length; k++) {
            if (domLines[i + k].norm !== bodyLines[k]) { ok = false; break; }
        }
        if (ok) return { start: i, end: i + bodyLines.length - 1 };
    }
    return null;
}

// Hide a located run reversibly. The run's nodes are grouped by parent —
// paragraph breaks inside a tracker body split it across elements — and each
// group is moved into one marked span with an inline display:none, separator
// <br>s between the lines included. A group whose lines already sit inside a
// span from an earlier pass is only re-hidden, never re-wrapped, so a second
// pass over the same message changes attributes and nothing else. That is
// also what keeps the rewrite watch below, which listens for child changes
// only, from feeding on its own re-hide.
function hideRemnantRun(domLines, start, end, boxHidden) {
    const groups = [];
    for (let i = start; i <= end; i++) {
        for (const node of domLines[i].nodes) {
            const parent = node.parentNode;
            const g = groups[groups.length - 1];
            if (g && g.parent === parent) g.nodes.push(node);
            else groups.push({ parent, nodes: [node] });
        }
    }
    for (const g of groups) {
        if (!g.parent) continue;
        const wrapped = g.parent.nodeType === 1 && g.parent.closest
            ? g.parent.closest("." + TRACKER_WRAP_CLASS + ", ." + TRACKER_BOX_CLASS)
            : null;
        if (wrapped) {
            wrapped.style.display = "none";
            continue;
        }
        // Lines living in a box that was already hidden whole need no span.
        if (typeof boxHidden === "function" && g.nodes[0] && boxHidden(g.nodes[0])) continue;
        const first = g.nodes[0];
        const last = g.nodes[g.nodes.length - 1];
        const span = document.createElement("span");
        span.className = TRACKER_WRAP_CLASS;
        span.style.display = "none";
        g.parent.insertBefore(span, first);
        let n = first;
        while (n) {
            const next = n.nextSibling;
            span.appendChild(n);
            if (n === last) break;
            n = next;
        }
    }
}

// The reasons the tracker hider declines are silent by design - fail visible,
// never fail hidden - and that silence has already sent one investigation
// chasing code that was not the problem. Each decline now says why in the
// console, at debug level, and only when a tracker actually parsed out of the
// message; a message with no tracker in it stays silent. The same line twice
// in a row is swallowed, so a rebuild replaying the pass does not fill the
// console with copies.
let lastTrackerDecline = null;
function reportTrackerDecline(root, detail) {
    const line = `message ${mesIndexOf(root)}: ${detail}`;
    if (line === lastTrackerDecline) return;
    lastTrackerDecline = line;
    console.debug("[Megumin Side Panel] tracker left visible - " + line);
}

// Which body line could not be found on screen, and what the screen had in
// its place. Walked only after hiding has already been declined, so the cost
// is paid on a broken message and nowhere else.
function explainMissingRun(domLines, tracker, fromIdx) {
    const bodyLines = String(tracker.body || "").split(/\r?\n/)
        .map(normalizeRemnantLine)
        .filter(Boolean);
    const clip = s => String(s).slice(0, 80);
    let best = null;
    for (let i = fromIdx; i < domLines.length; i++) {
        if (domLines[i].norm !== bodyLines[0]) continue;
        let k = 1;
        while (k < bodyLines.length && i + k < domLines.length
            && domLines[i + k].norm === bodyLines[k]) k++;
        if (!best || k > best.matched) best = { at: i, matched: k };
    }
    if (!best) {
        // Both sides of the failed comparison, so one console paste shows the
        // divergence: the line looked for, and the first lines the walk saw.
        const saw = domLines.slice(fromIdx, fromIdx + 3).map(l => `"${clip(l.norm)}"`).join(", ");
        return `the tracker's first line was never drawn: "${clip(bodyLines[0])}"; the walk saw: ${saw || "(no lines at all)"}`;
    }
    const k = best.matched;
    const got = domLines[best.at + k] ? `"${clip(domLines[best.at + k].norm)}"` : "the end of the message";
    return `tracker line ${k + 1} of ${bodyLines.length} is not what the screen shows - expected "${clip(bodyLines[k])}", found ${got}`;
}

// Hide every Story Tracker remnant in one message, or none of them. The
// handshake is the reader's `found` — a tracker the reader could not read
// stays visible, and one unreadable tracker leaves every tracker in the
// message visible, the same all-or-nothing the New NPC dossiers follow. The
// same answer covers a body that cannot be located on screen: the pipeline
// can transform a line past recognising (an emoji shortcode expanded, a value
// rewritten by another extension), and a body that cannot be found whole is
// left alone rather than half-hidden.
function applyTrackerHiding(root, raw) {
    const showAll = () => {
        root.querySelectorAll("span." + TRACKER_WRAP_CLASS).forEach(w => {
            w.style.display = "";
        });
        root.querySelectorAll("." + TRACKER_BOX_CLASS).forEach(b => {
            b.style.display = "";
        });
    };
    if (typeof raw !== "string" || !raw) { showAll(); return "the stored text could not be reached"; }
    const trackers = collectStoryTrackers(raw);
    if (!trackers.length) { showAll(); return "no tracker in the stored text"; }
    if (trackers.some(t => !t.found)) {
        reportTrackerDecline(root, "a tracker in this message has no readable body, so every tracker in it stays visible");
        showAll();
        return "left visible (a tracker has no readable body)";
    }
    // The reader's install restyles the tracker on screen with a display-only
    // text rule: the whole block becomes one fold whose title line is the
    // tracker's first line behind a decorative quote marker. That fold is a
    // thing that can be pointed at, so it hides the way the panel's own folds
    // do - whole, box and toggle included. The handshake stays: only a
    // tracker the reader got out of the stored text is looked for at all, and
    // the title has to be that tracker's own first line. Several trackers
    // hide all together or not at all, in order; anything short of a full
    // match falls through to the line walk below, which serves installs
    // without the restyle rule.
    const foldTitles = [];
    root.querySelectorAll("details").forEach(d => {
        const sum = d.querySelector("summary");
        if (!sum) return;
        if (classifyInlineBlock(sum.textContent || "") !== "unknown") return;
        foldTitles.push({ d, norm: normalizeRemnantLine(sum.textContent || "") });
    });
    const styled = [];
    let scan = 0;
    for (const t of trackers) {
        const firstLine = normalizeRemnantLine(
            String(t.body || "").split(/\r?\n/).find(l => l.trim()) || "");
        let hit = -1;
        for (let k = scan; k < foldTitles.length; k++) {
            if (firstLine && foldTitles[k].norm === firstLine) { hit = k; break; }
        }
        if (hit < 0) { styled.length = 0; break; }
        styled.push(foldTitles[hit].d);
        scan = hit + 1;
    }
    if (styled.length && styled.length === trackers.length) {
        styled.forEach(d => {
            d.classList.add(TRACKER_BOX_CLASS);
            d.style.display = "none";
        });
        hideAdjacentGaps(root);
        lastTrackerDecline = null;
        return `hidden (${trackers.length === 1 ? "1 tracker" : trackers.length + " trackers"}, restyled fold)`;
    }
    // The runner extension on this install draws rendered blocks inside a
    // frame: a little page of its own, whose content no walk of this
    // document can reach. A frame that can be read (same page, which is how
    // the runner builds them) and holds the tracker's first line IS the
    // tracker on screen, so the frame element is hidden - reversible, one
    // frame per tracker, in order. A frame that cannot be read into cannot
    // be verified, so it stays, and the decline below says so.
    const frameEls = root.querySelectorAll("iframe");
    let sealedFrames = 0;
    const readFrames = [];
    frameEls.forEach(f => {
        let d = null;
        try { d = f.contentDocument || (f.contentWindow && f.contentWindow.document) || null; } catch (e) { d = null; }
        const body = d && (d.body || d.documentElement);
        if (!body) { sealedFrames++; readFrames.push({ f, norm: null }); return; }
        readFrames.push({ f, norm: normalizeRemnantLine(body.textContent || "") });
    });
    if (frameEls.length) {
        const picked = [];
        let fscan = 0;
        for (const t of trackers) {
            const firstLine = normalizeRemnantLine(
                String(t.body || "").split(/\r?\n/).find(l => l.trim()) || "");
            let hit = -1;
            for (let k = fscan; k < readFrames.length; k++) {
                if (firstLine && readFrames[k].norm && readFrames[k].norm.includes(firstLine)) { hit = k; break; }
            }
            if (hit < 0) { picked.length = 0; break; }
            picked.push(readFrames[hit].f);
            fscan = hit + 1;
        }
        if (picked.length && picked.length === trackers.length) {
            picked.forEach(f => {
                f.classList.add(TRACKER_BOX_CLASS);
                f.style.display = "none";
            });
            hideAdjacentGaps(root);
            lastTrackerDecline = null;
            return `hidden (${trackers.length === 1 ? "1 tracker" : trackers.length + " trackers"}, in a frame)`;
        }
    }
    const domLines = collectDomLines(root);
    const runs = [];
    let from = 0;
    for (const t of trackers) {
        const run = locateTrackerLines(domLines, t, from);
        if (!run) {
            const frameNote = frameEls.length
                ? `; ${frameEls.length} frame(s) on screen` + (sealedFrames
                    ? `, ${sealedFrames} of them could not be read into`
                    : ", none holding the tracker's first line")
                : "";
            reportTrackerDecline(root, explainMissingRun(domLines, t, from) + frameNote);
            showAll();
            return "left visible (body not located on screen)";
        }
        runs.push(run);
        from = run.end + 1;
    }
    // A foreign fold or code box whose every line belongs to the tracker is
    // hidden as one element, the way the panel's own folds hide - the box
    // and its toggle go with the text. The tracker's own tag lines count as
    // the tracker's. A fold holding other text besides keeps its other text:
    // only the tracker lines inside it are wrapped. A code box holding other
    // text cannot be cut apart, so it declines whole, fail visible.
    const inRun = i => runs.some(r => i >= r.start && i <= r.end);
    const tagLine = norm => /^<\/?storytracker\b[^>]*>?$/.test(norm);
    // A code box sitting inside a fold belongs to the fold: hiding has to
    // take the outermost container, or the fold's frame stays on screen.
    const boxOf = line => {
        if (line.boxEl) {
            const outer = line.boxEl.closest ? line.boxEl.closest("details") : null;
            return outer || line.boxEl;
        }
        return line.nodes[0] && line.nodes[0].parentElement && line.nodes[0].parentElement.closest
            ? line.nodes[0].parentElement.closest("details")
            : null;
    };
    const boxes = new Map();
    for (let i = 0; i < domLines.length; i++) {
        const box = boxOf(domLines[i]);
        if (!box || !root.contains(box)) continue;
        let rec = boxes.get(box);
        if (!rec) { rec = { covered: true, used: false, pre: !!domLines[i].boxEl }; boxes.set(box, rec); }
        if (inRun(i)) rec.used = true;
        else if (!tagLine(domLines[i].norm)) rec.covered = false;
    }
    const hiddenBoxes = [];
    for (const [box, rec] of boxes) {
        if (!rec.used) continue;
        if (!rec.covered) {
            if (rec.pre) {
                reportTrackerDecline(root, "the tracker sits in a code box together with other text, and a code box cannot be split");
                showAll();
                return "left visible (tracker shares a code box with other text)";
            }
            continue;
        }
        box.classList.add(TRACKER_BOX_CLASS);
        box.style.display = "none";
        hiddenBoxes.push(box);
    }
    const boxHidden = node => hiddenBoxes.some(b => b === node || (b.contains && b.contains(node)));
    runs.forEach(r => hideRemnantRun(domLines, r.start, r.end, boxHidden));
    lastTrackerDecline = null;
    const total = runs.reduce((a, r) => a + (r.end - r.start + 1), 0);
    return `hidden (${trackers.length === 1 ? "1 tracker" : trackers.length + " trackers"}, ${total} lines)`;
}

// A hidden block leaves its line spacing behind, and the blocks sit together
// at the end of a reply, so the leftover breaks stack into a run of blank
// lines. Hide the empty formatting that touches a hidden element, narrowly:
// the <br> run in front of it always; the run after it when nothing visible
// follows in the same parent, when nothing visible precedes the block, or
// when the front walk found no break to take — a block whose line came with
// exactly one separator has to lose that one, whichever side it is on. A
// break with visible prose on both sides of it and no hidden block touching
// it is never marked. Whitespace-only text is walked through rather than
// marked; it draws nothing on its own. A parent left holding nothing visible
// (a paragraph that held only the remnant) still spends its margins, so it is
// hidden with its contents and comes back with them.
function hideAdjacentGaps(root) {
    const isBr = n => n.nodeType === 1 && n.tagName === "BR";
    const isGhost = n =>
        (n.nodeType === 3 && !(n.textContent || "").trim())
        || (n.nodeType === 1 && n.style && n.style.display === "none");
    const hideBr = n => {
        n.classList.add(GAP_HIDE_CLASS);
        n.style.display = "none";
    };
    const hidden = [];
    root.querySelectorAll("details.meg-sp-tracker-block, span." + TRACKER_WRAP_CLASS + ", ." + TRACKER_BOX_CLASS)
        .forEach(el => { if (el.style && el.style.display === "none") hidden.push(el); });
    for (const el of hidden) {
        let sawVisibleBefore = false;
        let tookBackward = false;
        for (let n = el.previousSibling; n; n = n.previousSibling) {
            if (isBr(n)) { hideBr(n); tookBackward = true; continue; }
            if (isGhost(n)) continue;
            sawVisibleBefore = true;
            break;
        }
        let visibleAfter = false;
        for (let n = el.nextSibling; n; n = n.nextSibling) {
            if (isBr(n) || isGhost(n)) continue;
            visibleAfter = true;
            break;
        }
        if (!visibleAfter || !sawVisibleBefore || !tookBackward) {
            for (let n = el.nextSibling; n; n = n.nextSibling) {
                if (isBr(n)) { hideBr(n); continue; }
                if (isGhost(n)) continue;
                break;
            }
        }
        const parent = el.parentElement;
        if (parent && parent !== root && parent.classList
            && !parent.classList.contains(GAP_HIDE_CLASS)) {
            let anyVisible = false;
            for (let n = parent.firstChild; n; n = n.nextSibling) {
                if (!isGhost(n)) { anyVisible = true; break; }
            }
            if (!anyVisible) {
                parent.classList.add(GAP_HIDE_CLASS);
                parent.style.display = "none";
            }
        }
    }
}

// Walk one message's blocks and hide or un-hide them. `hide` false is the
// plain undo — no parsing, nothing classified, everything this file hid put
// back. `hide` true is parse first, hide second, exactly as before, now over
// three kinds of thing: the <details> folds, the Story Tracker remnant, and
// the empty formatting either one leaves behind.
function applyInlineHiding(root, hide) {
    if (!hide) { unhideInline(root); return null; }
    const raw = rawMesTextFor(root);
    const parsedTypes = raw === null ? null : getParsedBlockTypes(raw);
    const parsedCounts = raw === null ? null : getParsedBlockCounts(raw);
    // Two passes, because the New NPC rule needs the whole message's tally
    // before it can answer for any single dossier. First pass classifies and
    // counts, second pass decides.
    const blocks = [];
    const domCounts = Object.create(null);
    root.querySelectorAll("details").forEach(d => {
        const sum = d.querySelector("summary");
        if (!sum) return;
        const type = classifyInlineBlock(sum.textContent || "");
        if (type === "unknown") return;
        domCounts[type] = (domCounts[type] || 0) + 1;
        blocks.push({ d, type });
    });
    let foldsHidden = 0;
    blocks.forEach(({ d, type }) => {
        const hideable = shouldHideInlineBlock(type, parsedTypes, parsedCounts, domCounts[type]);
        if (hideable) foldsHidden++;
        // styles.css hides `.meg-sp-tracker-block` with `!important`, so the
        // class IS the hiding. A block that has to stay visible must lose the
        // class — an inline `display: ""` can't outrank an `!important`.
        d.classList.toggle("meg-sp-tracker-block", hideable);
        d.style.display = hideable ? "none" : "";
    });
    const tracker = applyTrackerHiding(root, raw);
    hideAdjacentGaps(root);
    return {
        folds: blocks.length,
        foldsHidden,
        frames: root.querySelectorAll("iframe").length,
        tracker,
    };
}

// While the AI is streaming a reply, SillyTavern redraws the message body on
// every chunk. Each redraw replaces the body's children, so the rebuild watch
// below would re-hide after every chunk and the reader watches the blocks
// flicker in and out for the whole stream. So the hider sleeps through a
// generation: the start event raises this flag, every pass and the watch
// return at once while it is up, and the end of the generation drops it and
// runs one pass over the settled message. A dry run builds a prompt and
// streams nothing — it must not raise the flag, because its end events may
// never come.
let hidingSuspended = false;

function suspendInlineHiding() {
    if (hidingSuspended) return;
    hidingSuspended = true;
    console.debug("[Megumin Side Panel] hiding suspended (generation started)");
}

// Drop the flag and run the one settled pass. Called from both end events and
// from the rendered-reply safety net; whichever arrives first does the work,
// the others find the flag already down and change nothing.
function resumeInlineHiding(why) {
    if (!hidingSuspended) return false;
    hidingSuspended = false;
    console.debug(`[Megumin Side Panel] hiding resumed (${why})`);
    setTimeout(() => applyInlineHidingPass("post-generation"), 0);
    return true;
}

// One pass over every rendered message: the latest AI reply gets its blocks
// hidden, every other message gets its blocks put back on show. The panel
// mirrors the latest reply and nothing else, so only that reply's copy leaves
// the chat and the history above it stays readable — the author's decision.
// When a user message sits at the end of the chat, the walk-back inside
// latestAssistantIndex steps over it to the AI reply before it. The un-hide
// side is what makes the transition work: the moment a new reply becomes the
// latest, the pass runs and the previous one's blocks come back.
function applyInlineHidingPass(marker) {
    // Asleep while a reply is streaming; the pass at the end of the
    // generation covers whatever this one would have done.
    if (hidingSuspended) return;
    const cfg = settings();
    const hide = cfg.enabled && !!cfg.hideInline;
    const latest = hide ? latestAssistantIndex() : -1;
    let chatLen = -1;
    try {
        const c = getContext()?.chat;
        if (Array.isArray(c)) chatLen = c.length;
    } catch (e) { /* */ }
    let summary = null;
    let latestSeen = false;
    let latestRoot = null;
    document.querySelectorAll(".mes .mes_text").forEach(root => {
        // A body mid-edit holds SillyTavern's edit box; the pass after
        // MESSAGE_UPDATED covers it once the edit lands.
        if (root.querySelector(".edit_textarea")) return;
        const isLatest = hide && latest >= 0 && mesIndexOf(root) === latest;
        const res = applyInlineHiding(root, isLatest);
        if (isLatest) { latestSeen = true; latestRoot = root; summary = res; }
    });
    // The pass says what it did, every time it runs. A pass that never
    // engages is otherwise exactly as silent as no pass at all, and that
    // silence has already cost an investigation.
    if (!hide) {
        console.debug("[Megumin Side Panel] hiding pass: hiding is off, everything left on show");
    } else if (latest < 0) {
        console.debug(`[Megumin Side Panel] hiding pass: no AI reply found (chat has ${chatLen} messages)`);
    } else if (!latestSeen) {
        console.debug(`[Megumin Side Panel] hiding pass: latest AI reply is message ${latest} of ${chatLen}, but its body is not on screen`);
    } else {
        const s = summary || { folds: 0, foldsHidden: 0, frames: 0, tracker: "nothing to do" };
        console.debug(`[Megumin Side Panel] hiding pass${marker ? ` (${marker})` : ""}: latest AI reply is message ${latest} of ${chatLen}; folds found ${s.folds}, hidden ${s.foldsHidden}; frames ${s.frames}; tracker: ${s.tracker}`);
    }
    // A frame can finish loading after the pass that looked into it, and its
    // loading changes nothing this document's watcher can see - so a pass
    // that left the tracker visible with frames on screen gets one delayed
    // second look, and only one.
    if (latestRoot && summary && summary.frames > 0
        && /^left visible/.test(summary.tracker || "") && !pendingRehide.has(latestRoot)) {
        pendingRehide.add(latestRoot);
        setTimeout(() => {
            pendingRehide.delete(latestRoot);
            reapplyInlineHiding(latestRoot, "frame retry", true);
        }, 600);
    }
}

// Another extension can rebuild a message body after the hiding has already run,
// and nothing announces it. One such extension re-renders .mes_text 150ms after
// a chat opens and 250ms after a reply lands; Megumin's own image generation
// hands the same job to SillyTavern's updateMessageBlock. Either way the children are
// replaced, so the class and the inline style this file just put on a tracker
// block go with them — every hiding pass has been and gone by then, and the
// blocks are back in the chat with nothing in the console to say why.
//
// So watch the chat for a message body whose children were replaced, and put
// that message back the way it should be: hidden again if it is the latest AI
// reply, visible if it is any other message — a rebuild of an older message
// must never re-hide it. Watching childList and nothing else is what keeps
// this from feeding itself: the details hiding writes a class and a style onto
// nodes that are already there, and an attribute change is not a childList
// change. Wrapping a tracker remnant IS a childList change, so the watch sees
// its own wrap once — and the pass it then queues finds the wrapper already in
// place, changes attributes only, and the chain stops there.
let inlineRewriteWatch = null;
const pendingRehide = new Set();

// One message decided fresh: which message is the latest NOW, hide or
// un-hide accordingly, and say what happened. Shared by the rebuild watch
// and the delayed frame retry.
function reapplyInlineHiding(root, label, noRetry) {
    // A timer queued before the suspension can still fire mid-stream; the
    // pass at the end of the generation covers it.
    if (hidingSuspended) return;
    const cfg = settings();
    const hide = cfg.enabled && !!cfg.hideInline;
    const latest = hide ? latestAssistantIndex() : -1;
    const isLatest = hide && latest >= 0 && mesIndexOf(root) === latest;
    const res = applyInlineHiding(root, isLatest);
    if (isLatest) {
        const s = res || { folds: 0, foldsHidden: 0, frames: 0, tracker: "nothing to do" };
        console.debug(`[Megumin Side Panel] hiding pass (${label}): message ${latest}; folds found ${s.folds}, hidden ${s.foldsHidden}; frames ${s.frames}; tracker: ${s.tracker}`);
        if (!noRetry && s.frames > 0 && /^left visible/.test(s.tracker || "") && !pendingRehide.has(root)) {
            pendingRehide.add(root);
            setTimeout(() => {
                pendingRehide.delete(root);
                reapplyInlineHiding(root, "frame retry", true);
            }, 600);
        }
    } else if (hide) {
        console.debug(`[Megumin Side Panel] hiding pass (${label}): message ${mesIndexOf(root)} is not the latest AI reply, left on show`);
    }
}

function watchInlineRewrites() {
    if (inlineRewriteWatch || typeof MutationObserver === "undefined") return;
    const chatEl = document.getElementById("chat");
    if (!chatEl) return;   // called again from CHAT_CHANGED, by when it exists
    inlineRewriteWatch = new MutationObserver(records => {
        // A streaming reply redraws its body on every chunk; reacting to
        // those redraws is the on-screen flicker. The pass at the end of the
        // generation re-hides once.
        if (hidingSuspended) return;
        const cfg = settings();
        if (!cfg.enabled || !cfg.hideInline) return;
        for (const r of records) {
            const root = r.target?.closest?.(".mes_text");
            if (!root || pendingRehide.has(root)) continue;
            // An edit empties .mes_text and parks SillyTavern's textarea inside
            // it. That body is on its way out, and MESSAGE_UPDATED re-hides once
            // the edit lands, so leave it alone.
            if (root.querySelector(".edit_textarea")) continue;
            // One re-hide per body per burst: a rebuild arrives as a run of
            // records, and each walk costs a parse of the whole raw message.
            pendingRehide.add(root);
            setTimeout(() => {
                pendingRehide.delete(root);
                // Decided fresh inside reapplyInlineHiding, not in the
                // callback: by the time this runs the chat may have moved
                // on, and only the message that is the latest AI reply NOW
                // goes back into hiding.
                reapplyInlineHiding(root, "rebuild");
            }, 0);
        }
    });
    inlineRewriteWatch.observe(chatEl, { childList: true, subtree: true });
}

// -----------------------------------------------------------------------------
// Panel collapse toggle (FAB + ✕)
// -----------------------------------------------------------------------------
function togglePanel(force) {
    const cfg = settings();
    cfg.collapsed = (typeof force === "boolean") ? !force : !cfg.collapsed;
    persist();
    render();
}

function injectStylesheet() {
    if (document.getElementById("meg-sp-styles")) return;
    const link = document.createElement("link");
    link.id = "meg-sp-styles";
    link.rel = "stylesheet";
    try {
        link.href = new URL("./styles.css", import.meta.url).toString();
    } catch (e) {
        link.href = "scripts/extensions/third-party/Megumin-Suite/src/sidepanel/styles.css";
    }
    document.head.appendChild(link);
}

// -----------------------------------------------------------------------------
// Debug handle
// -----------------------------------------------------------------------------
function installDebugHandle() {
    try {
        window.LukaSuite = Object.freeze({
            refresh: () => { render(); refreshPresentBar(); },
            settings,
            parseLast: () => buildSectionCtx().parsed,
            cast: buildPresentCast,
            sections: {
                get registry() { return allSections(); },
                order: () => getOrderedSections(settings()).map(d => d.id),
                setOrder: applySectionOrder,
                reset: resetSectionLayout,
            },
            panel: {
                el: () => document.getElementById(PANEL_ID),
                toggle: togglePanel,
                setMode,
            },
            openNpcBook,
            presentBar: {
                settings: getPresentBarSettings,
                refresh: refreshPresentBar,
            },
        });
    } catch (e) { /* non-fatal */ }
}

function updateHeaderImage() {
    const bg = document.getElementById("meg-sp-header-bg");
    if (!bg) return;
    const ctx = getContext();
    let imgUrl = "";
    if (ctx.groupId !== undefined && ctx.groupId !== null) {
        imgUrl = `/scripts/extensions/third-party/Megumin-Suite/img/group.png`;
    } else if (ctx.characterId !== undefined && ctx.characterId !== null && ctx.characters && ctx.characters[ctx.characterId]) {
        imgUrl = `/characters/${ctx.characters[ctx.characterId].avatar}`;
    }
    if (imgUrl) {
        bg.style.backgroundImage = `url('${imgUrl}')`;
    } else {
        bg.style.backgroundImage = "none";
    }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------
export function initSidePanel({ profileGetter } = {}) {
    if (initialised) return;
    initialised = true;

    if (typeof profileGetter === "function") getProfile = profileGetter;

    injectStylesheet();
    initPresentBar({
        castGetter: buildPresentCast,
        onOpenInBook: (npcName) => {
            const list = getProfile()?.npcBank?.npcs || [];
            const idx = list.findIndex(n => (n.name || "").trim().toLowerCase() === (npcName || "").trim().toLowerCase());
            openNpcBook(idx >= 0 ? idx : undefined);
        },
    });

    const mount = () => {
        if (document.getElementById(PANEL_ID)) return;
        settings().collapsed = true;
        persist();
        buildPanelSkeleton();
        updateHeaderImage();
        render();
        applyInlineHidingPass();
        watchInlineRewrites();
        refreshPresentBar();
        installDebugHandle();
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
        mount();
    }

    if (typeof eventSource !== "undefined" && typeof event_types !== "undefined") {
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
            scheduleRender(50);
            // A finished reply on screen also means any generation is over —
            // the safety net for a generation whose end event never arrives.
            // Resuming runs the settled pass itself; otherwise this is the
            // ordinary event pass.
            if (!resumeInlineHiding("reply rendered")) {
                setTimeout(applyInlineHidingPass, 0);
            }
        });
        eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
            setTimeout(applyInlineHidingPass, 0);
        });
        // MESSAGE_EDITED arrives BEFORE SillyTavern empties and rebuilds the
        // message body (script.js, messageEditDone), so a re-hide run here would
        // decorate a node that is about to be thrown away. Deferring it past the
        // rebuild is what makes it stick. MESSAGE_UPDATED arrives after the
        // rebuild on both paths, the edit saved and the edit cancelled, so it is
        // the one that always lands; MESSAGE_EDITED is kept for the panel refresh
        // and as cover for a build that sends only that one.
        eventSource.on(event_types.MESSAGE_EDITED, () => {
            scheduleRender(50);
            setTimeout(applyInlineHidingPass, 0);
        });
        eventSource.on(event_types.MESSAGE_UPDATED, () => {
            setTimeout(applyInlineHidingPass, 0);
        });
        // A delete can change which message is the latest AI reply, so the
        // pass runs here too: the newly-latest message goes into hiding and
        // whatever the deleted one left behind comes back on show.
        eventSource.on(event_types.MESSAGE_DELETED, () => {
            scheduleRender(50);
            setTimeout(applyInlineHidingPass, 0);
        });
        eventSource.on(event_types.MESSAGE_SWIPED, () => {
            scheduleRender(50);
            setTimeout(applyInlineHidingPass, 50);
        });
        eventSource.on(event_types.CHAT_CHANGED, () => {
            updateHeaderImage();
            scheduleRender(50);
            watchInlineRewrites();   // #chat may not have existed at mount time
            setTimeout(applyInlineHidingPass, 100);
        });
        eventSource.on(event_types.MORE_MESSAGES_LOADED, () => {
            setTimeout(applyInlineHidingPass, 50);
        });
        eventSource.on(event_types.APP_READY, () => {
            scheduleRender(100);
            setTimeout(applyInlineHidingPass, 150);
            setTimeout(clampToViewport, 200);
        });
        // Generation lifecycle: sleep through the stream, one pass at the
        // end. The started event's third argument marks a dry run — a
        // prompt-building call that streams nothing and may never send the
        // end events, so it must not put the hider to sleep. The stopped
        // event covers aborted and errored generations. Guarded per event
        // name, so a build without one of them keeps the safety net above.
        if (event_types.GENERATION_STARTED) {
            eventSource.on(event_types.GENERATION_STARTED, (type, params, dryRun) => {
                if (dryRun) return;
                suspendInlineHiding();
            });
        }
        if (event_types.GENERATION_ENDED) {
            eventSource.on(event_types.GENERATION_ENDED, () => resumeInlineHiding("generation ended"));
        }
        if (event_types.GENERATION_STOPPED) {
            eventSource.on(event_types.GENERATION_STOPPED, () => resumeInlineHiding("generation stopped"));
        }
    }
}

export function refreshSidePanel() { render(); refreshPresentBar(); }
export { getPresentBarSettings, applyPresentBarChange, refreshPresentBar };
export function getSidePanelSettings() { return settings(); }

export function applyInlineHidingChange() {
    syncBodyClasses();
    // With the setting off the pass un-hides everything itself — the details
    // class, the tracker wrappers and the hidden formatting alike.
    applyInlineHidingPass();
}

// Thin delegates — index.js call sites keep working
export function applyPositionChange() { applyLayout(); }
export function applyWidthChange() { applyLayout(); }
export function applyModeChange() { setMode(settings().mode); }
export function applyScaleChange() { applyScale(); }

export function applyEnabledChange() {
    const panel = document.getElementById(PANEL_ID);
    const fab = document.getElementById(FAB_ID);
    const cfg = settings();
    if (panel) panel.style.display = cfg.enabled ? "" : "none";
    if (fab) fab.style.display = cfg.enabled ? "" : "none";
    syncBodyClasses();
    if (cfg.enabled) {
        render();
        applyInlineHidingPass();
    } else {
        // Disabled runs the same pass: with the switch off it un-hides every
        // message, wrappers and hidden formatting included.
        applyInlineHidingPass();
        document.body.classList.remove(BODY_HIDE_CLASS);
    }
    refreshPresentBar();
}
