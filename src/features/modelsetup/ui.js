// ────────────────────────────────────────────────────────────────────────────
// Model Setup (plan 018, phase 5): the first tab. Pick your model, see the
// settings tested for it, and "Use this loadout" applies them, to every
// character unless you keep it to this one. A loadout not in use shows its own
// settings, and a change there only changes what Use this loadout will set.
// The loadout in use shows the real settings (the same ones their tabs show),
// so changing one here is changing it there. A tab set to Global still goes to
// every character, and Chomusuke is one setup for all of them.
// Replaces the Model guide popup.
// ────────────────────────────────────────────────────────────────────────────

import { extension_settings, saveSettingsDebounced } from "../../st.js";
import { extensionName } from "../../core/constants.js";
import { localProfile, _loadedProfileKey } from "../../core/state.js";
import { getCharacterKey } from "../../core/keys.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { meguminIsTabSynced, applyTabKeysToAllProfiles } from "../../core/sync.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { hardcodedLogic } from "../../../data/database.js";
import { storyConfigFields, upgradeConfigValue } from "../storyconfig/config.js";
import { setPresetPage } from "../../ui/tabs/coreAndCot.js";
import { chomusukeSetupHtml } from "../../ui/modelGuide.js";
import { chomusukeSwitches } from "../../engine/tasks.js";
import { card, segmented, switchRow, esc } from "../../ui/controls.js";
import {
    LOADOUTS, COMING_SOON, V11_STYLE_IDS, loadoutById, settingFor, applyLoadout, changedFromLoadout
} from "./loadouts.js";

// The tabs a row opens. Titles are the Global sync keys (core/sync.js); the
// tab list itself can't be imported from here (ui/tabs.js imports this file).
const TABS = {
    preset: "Preset & Thinking",
    banlist: "Banned Phrases",
    addons: "Language & Add-ons",
    chomusuke: "Chomusuke",
    style: "Writing Style"
};

// The engines the Preset row offers. Any other preset you are on is listed too.
const V11_ENGINES = ["v11-voice", "v11-writers-room", "v11-deepseek"];

const GOOD_HABITS = [
    "<b>Turn on only what your story needs.</b> Every block, tracker and helper adds to what the model reads each turn, and some add a call after every reply. Start with a loadout and two or three blocks, and add more when you miss them.",
    "<b>Keep \"Hide old blocks from the AI\" on</b> (Blocks tab). The model gets the true values once instead of every old block in the chat.",
    "<b>Sending several jobs to Chomusuke?</b> Turn on <b>Combine calls</b> in the Chomusuke tab: one call per reply instead of several."
];

// Page state, kept while SillyTavern is open.
let picked = null;
let onlyThisCharacter = false;
// A loadout's settings as changed on the page before using it, by loadout id.
const drafts = {};

const lengthField = () => storyConfigFields.find(f => f.key === "length");

// Story Config keeps the sentence the model reads; a row shows its label.
const CTX = {
    lengthLabel(v) {
        const f = lengthField();
        const value = upgradeConfigValue(f, v || "");
        if (!value) return "";
        const o = f.options.find(x => x.value === value);
        return o ? o.label : "custom";
    },
    lengthValue(label) {
        const o = lengthField().options.find(x => x.label === label);
        return o ? o.value : label;
    }
};

const chomusukeReady = () => {
    const c = localProfile.chomusuke;
    return Boolean(c && c.enabled && c.profileId);
};

const openTab = (tab, page) => {
    if (tab === "preset" && page) setPresetPage(page);
    fireRefreshHook(REFRESH.SWITCH_TAB, tab);
};

// A change on the page saves like the same change in its tab, Global sync
// included. Returns the titles of the tabs it sent to every character.
function saveFor(...tabs) {
    saveProfileToMemory();
    const sent = tabs.map(t => TABS[t]).filter(title => meguminIsTabSynced(title) && applyTabKeysToAllProfiles(title));
    fireRefreshHook(REFRESH.TOKEN_COUNT);
    return sent;
}

// The tabs a change of these settings touches. A preset that brings its own
// style changes the Writing Style tab too.
function tabsOf(keys, styleBefore) {
    const tabs = new Set(keys.map(k => settingFor(k)).filter(s => !s.global).map(s => s.tab));
    if (localProfile.activeStyleId !== styleBefore) tabs.add("style");
    return [...tabs];
}

const listNames = names => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function renderModelSetup(c) {
    c.empty();
    const rerender = () => renderModelSetup(c);
    if (!picked || !loadoutById(picked)) picked = loadoutById(localProfile.loadout) ? localProfile.loadout : LOADOUTS[0].id;

    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #0ea5e9, #a855f7);"><i class="fa-solid fa-compass"></i></div>
                <div><h2>Model Setup</h2><p>Pick the model you play with, and use the settings I tested for it.</p></div>
            </div>
        </div>
        <div class="mtab-callout green" style="margin-bottom: 16px;"><i class="fa-solid fa-circle-info"></i><span><b>This page is optional.</b> A loadout is just the settings I tested for that model. Skipping it, or using a model that isn't listed, won't break the preset. You can use any engine and set everything yourself in the other tabs.</span></div>
    `);

    // ── Pick your model ──
    const pick = card("Pick your model", "Clicking a model shows its settings. Nothing changes until you press Use this loadout.");
    const $grid = $(`<div class="mtab-card-grid ptx-grid msx-grid"></div>`);
    LOADOUTS.forEach(l => {
        const inUse = localProfile.loadout === l.id;
        const $card = $(`
            <div class="mtab-eng-card ptx-compact msx-model ${l.id === picked ? "active" : ""}">
                <div class="ecard-accent"></div>
                <div class="ecard-body">
                    <div class="ecard-title"><span><i class="fa-solid ${l.icon}"></i> ${esc(l.name)}</span>
                        ${inUse ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> In use</span>` : ""}
                    </div>
                    <p class="ecard-desc">${esc(l.models)}</p>
                </div>
            </div>
        `);
        $card.on("click", () => { if (picked !== l.id) { picked = l.id; rerender(); } });
        $grid.append($card);
    });
    COMING_SOON.forEach(l => {
        $grid.append(`
            <div class="mtab-eng-card ptx-compact msx-model locked-card">
                <div class="ecard-accent"></div>
                <div class="ecard-body">
                    <div class="ecard-title"><span><i class="fa-solid ${l.icon}"></i> ${esc(l.name)}</span></div>
                    <p class="ecard-desc">${esc(l.models)}</p>
                    <div class="ptx-badges"><span class="ecard-badge locked"><i class="fa-solid fa-lock"></i> Coming soon</span></div>
                </div>
            </div>
        `);
    });
    pick.append($grid);
    c.append(pick);

    c.append(loadoutCard(loadoutById(picked), rerender));
    c.append(styleCard(rerender));
    c.append(helpCard());
}

// ── The picked loadout ───────────────────────────────────────────────────

function loadoutCard(l, rerender) {
    const $card = card(`<span><i class="fa-solid ${l.icon}"></i> ${esc(l.name)}</span>`, esc(l.why));
    // Not in use: the rows show the loadout's own settings, as a draft.
    const draft = localProfile.loadout === l.id ? null : (drafts[l.id] = drafts[l.id] || { ...l.settings });
    const changed = draft
        ? Object.keys(l.settings).filter(k => draft[k] !== l.settings[k])
        : changedFromLoadout(localProfile, l, CTX);

    l.notes.forEach(n => {
        const $n = $(`<div class="mtab-callout ${n.tone} msx-note"><i class="fa-solid ${n.tone === "red" ? "fa-triangle-exclamation" : "fa-lightbulb"}"></i><span>${n.text}</span></div>`);
        if (n.chomusuke && !chomusukeReady()) {
            const $b = $(`<button type="button" class="menu_button msx-link">Set up Chomusuke <i class="fa-solid fa-arrow-right"></i></button>`);
            $b.on("click", () => openTab("chomusuke"));
            $n.find("span").append(" Chomusuke isn't set up yet.").after($b);
        }
        $card.append($n);
    });

    if (draft) $card.append(`<div class="mtab-callout msx-note"><i class="fa-solid fa-eye"></i><span><b>Not in use yet.</b> These are the settings Use this loadout will set. Change any of them first if you like.</span></div>`);

    const $rows = $(`<div class="msx-rows"></div>`);
    Object.keys(l.settings).forEach(key => $rows.append(settingRow(settingFor(key), l, changed.includes(key), draft, rerender)));
    $card.append($rows);

    const $foot = $(`<div class="msx-foot"></div>`);
    $foot.append(switchRow({
        label: "Only this character",
        desc: onlyThisCharacter
            ? "The loadout goes to the character you're chatting with. Chomusuke, and any tab you set to Global, still go to every character."
            : "Off: the loadout goes to every character, and to new ones.",
        on: onlyThisCharacter,
        onChange: on => { onlyThisCharacter = on; rerender(); }
    }));
    const $use = $(`<button type="button" class="menu_button msx-use"><i class="fa-solid fa-check"></i> Use this loadout</button>`);
    $use.on("click", () => useLoadout(l, draft, rerender));
    $foot.append($use);
    $card.append($foot);
    return $card;
}

function settingRow(s, l, isChanged, draft, rerender) {
    const value = draft ? draft[s.key] : s.read(localProfile, CTX);
    const $row = $(`
        <div class="msx-row">
            <div class="msx-row-label">${esc(s.label)}${s.desc ? ` <span class="msx-desc">${esc(s.desc)}</span>` : ""}${value === "mixed" ? ` <span class="msx-mixed">Some of these go to Chomusuke, some don't</span>` : ""}${isChanged ? ` <span class="msx-changed" title="The loadout sets ${esc(describe(s.key, l.settings[s.key]))}.">Changed from the loadout</span>` : ""}</div>
            <div class="msx-row-control"></div>
            <button type="button" class="menu_button msx-open" title="Open ${esc(TABS[s.tab])}"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${esc(TABS[s.tab])}</button>
        </div>
    `);
    $row.find(".msx-open").on("click", () => openTab(s.tab, s.page));
    const set = draft
        ? v => { draft[s.key] = v; rerender(); }
        : v => {
            const styleBefore = localProfile.activeStyleId;
            s.write(localProfile, v, CTX);
            saveFor(...tabsOf([s.key], styleBefore));
            rerender();
        };
    const $ctl = $row.find(".msx-row-control");

    if (s.key === "mode") {
        const ids = V11_ENGINES.includes(value) ? V11_ENGINES : [...V11_ENGINES, value];
        const $sel = $(`<select class="text_pole msx-select"></select>`);
        ids.forEach(id => $sel.append(`<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(engineLabel(id))}</option>`));
        $sel.on("change", () => set($sel.val()));
        $ctl.append($sel);
    } else if (s.key === "thinking" || s.key === "thinkingCap" || s.key === "html") {
        $ctl.append(switchRow({ label: value ? "On" : "Off", on: value, onChange: on => set(on) }));
    } else if (s.key === "length") {
        const $sel = $(`<select class="text_pole msx-select"></select>`);
        if (value === "custom" || value === "") $sel.append(`<option value="" selected>${value === "custom" ? "Your own" : "Not set"}</option>`);
        lengthField().options.forEach(o => $sel.append(`<option value="${esc(o.label)}" ${o.label === value ? "selected" : ""}>${esc(o.label)}</option>`));
        $sel.on("change", () => { if ($sel.val()) set($sel.val()); });
        $ctl.append($sel);
    } else if (s.key === "banList") {
        $ctl.append(segmented([{ id: "full", label: "Full list" }, { id: "short", label: "Short list" }, { id: "off", label: "Only your phrases" }], value, set));
    } else {
        $ctl.append(segmented([{ id: "story", label: "Off" }, { id: "chomusuke", label: "On" }], value, set));
    }
    return $row;
}

function engineLabel(id) {
    const all = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])];
    const m = all.find(x => x.id === id);
    return m ? m.label : id;
}

// How a loadout value reads in the "Changed from the loadout" tooltip.
function describe(key, v) {
    if (key === "mode") return engineLabel(v);
    if (key === "thinking" || key === "thinkingCap" || key === "html") return v ? "on" : "off";
    if (key === "banList") return { full: "the full list", short: "the short list", off: "only your phrases" }[v];
    if (key === "length") return v;
    return v === "chomusuke" ? "Chomusuke on" : "Chomusuke off";
}

function useLoadout(l, draft, rerender) {
    const settings = draft || l.settings;
    // Same guard as Global sync: the page must belong to the chat that's open,
    // or this character's settings land on another one.
    const liveKey = getCharacterKey() || "default";
    if (_loadedProfileKey && liveKey !== _loadedProfileKey) {
        toastr.warning("The panel is still showing the previous chat's settings. Reopen it and try again.", "Megumin Suite");
        return;
    }
    if (!onlyThisCharacter) {
        // Chomusuke's row is written once, through the profile on screen.
        Object.values(extension_settings[extensionName].profiles || {}).forEach(p => applyLoadout(p, l, CTX, settings, { skipGlobal: true }));
        saveSettingsDebounced();
    }
    const styleBefore = localProfile.activeStyleId;
    applyLoadout(localProfile, l, CTX, settings);
    delete drafts[l.id];
    if (!onlyThisCharacter) {
        saveProfileToMemory();
        fireRefreshHook(REFRESH.TOKEN_COUNT);
        toastr.success(`${l.name} is in use on every character.`, "Megumin Suite");
    } else {
        // Global sync wins: a tab set to Global goes to every character, as an edit there would.
        const sent = saveFor(...tabsOf(Object.keys(settings), styleBefore));
        const also = sent.length
            ? ` ${listNames(sent)} ${sent.length > 1 ? "are" : "is"} set to Global, so ${sent.length > 1 ? "their" : "its"} settings went to every character.`
            : "";
        toastr.success(`${l.name} is in use on this character.${also}${"chomusuke" in settings ? " Chomusuke is the same on every character." : ""}`, "Megumin Suite");
    }
    rerender();
}

// ── Writing style ────────────────────────────────────────────────────────

function styleCard(rerender) {
    const $card = card("Writing style", "How the V11 presets tell the story. Both work with every loadout.");
    const $tiles = $(`<div class="igx-tiles"></div>`);
    V11_STYLE_IDS.forEach(id => {
        const ds = hardcodedLogic.directStyles.find(s => s.id === id);
        if (!ds) return;
        const $b = $(`<button type="button" class="igx-tile ${localProfile.activeStyleId === id ? "on" : ""}"><b>${esc(ds.name)}</b><span>${esc(ds.desc)}</span></button>`);
        $b.on("click", () => {
            localProfile.activeStyleId = ds.id;
            localProfile.aiRule = ds.rule;
            saveFor("style");
            rerender();
        });
        $tiles.append($b);
    });
    $card.append($tiles);
    const $open = $(`<button type="button" class="menu_button msx-open msx-open-solo"><i class="fa-solid fa-arrow-up-right-from-square"></i> Writing Style</button>`);
    $open.on("click", () => openTab("style"));
    $card.append($open);
    return $card;
}

// ── Chomusuke setup and good habits (from the old Model guide) ───────────

function helpCard() {
    const $card = card("Help");
    $card.append(`
        <details class="msx-help">
            <summary><i class="fa-solid fa-cat"></i> Set up Chomusuke</summary>
            ${chomusukeSetupHtml(chomusukeSwitches(), "msx-note")}
        </details>
        <details class="msx-help">
            <summary><i class="fa-solid fa-seedling"></i> Good habits</summary>
            <ul class="msx-habits">${GOOD_HABITS.map(p => `<li>${p}</li>`).join("")}</ul>
        </details>
    `);
    return $card;
}
