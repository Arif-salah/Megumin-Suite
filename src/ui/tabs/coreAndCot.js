// ────────────────────────────────────────────────────────────────────────────
// Preset & Thinking (plan 014) — which preset tells the story, how it thinks
// before it writes, and the story's standing settings (Story Config).
//
// Same layout as the Images tab: a summary row, then pages picked at the top
// (Preset · Thinking · Story Config). Built from the shared controls
// (ui/controls.js) and the existing preset cards.
// ────────────────────────────────────────────────────────────────────────────

import { extension_settings } from "../../st.js";
import { extensionName } from "../../core/constants.js";
import { localProfile } from "../../core/state.js";
import { styleAfterPicking, isV7Engine, isV10Engine } from "../../core/engines.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { hardcodedLogic } from "../../../data/database.js";
import { renderDevMode } from "../devmode.js";
import { meguminCotForMode } from "../../../data/cot/index.js";
import { buildStoryConfigSection } from "../../features/storyconfig/ui.js";
import { countActiveConfigFields } from "../../features/storyconfig/config.js";
import { card as pageCard, segmented, switchRow, field, esc } from "../controls.js";

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced Dialogue — the switch drawn inside a preset card.
//
// It lives on the card rather than in the tab's own toggle strip because it
// belongs to the preset: it replaces that preset's <dialogue> section and means
// nothing for any other generation. V10 only, because no other generation writes
// that tag and the switch would be inert.
//
// Official presets and your own copies both draw preset cards, and a Dev Mode
// copy of a V10 preset is still flagged isV10, so the switch has to appear on
// both. Written once here: the first version was on the official card only, and
// the feature disappeared the moment anybody copied a preset to edit it.
// ─────────────────────────────────────────────────────────────────────────────

function enhancedDialogueOn(m) {
    return Boolean(m && localProfile.enhancedDialogue && localProfile.enhancedDialogue[m.id]);
}

function enhancedDialogueMarkup(m, isLocked) {
    if (!isV10Engine(m) || isLocked) return "";
    const on = enhancedDialogueOn(m);
    return `
        <div class="ecard-opt ${on ? "on" : ""}" title="Swap this preset's dialogue rules for the stricter, prescriptive set: named categories, orthographic cues for emotion, and an explicit ban list. For models that read the shipped section as a suggestion.">
            <div class="ecard-opt-text">
                <span class="ecard-opt-label"><i class="fa-solid fa-comment-dots"></i> Enhanced Dialogue</span>
                <span class="ecard-opt-state">${on ? "On" : "Off"}</span>
            </div>
            <div class="ecard-opt-switch"></div>
        </div>`;
}

function wireEnhancedDialogue(card, m, rerender) {
    card.find(".ecard-opt").on("click", function (ev) {
        // Without this the click also picks the preset. Flipping a setting and
        // switching preset are separate intentions.
        ev.stopPropagation();
        if (!localProfile.enhancedDialogue) localProfile.enhancedDialogue = {};
        // Deleted rather than set false, so the map only ever holds presets that
        // are actually on and an untouched profile stays empty.
        if (localProfile.enhancedDialogue[m.id]) delete localProfile.enhancedDialogue[m.id];
        else localProfile.enhancedDialogue[m.id] = true;
        saveProfileToMemory();
        // The counter reads the preset's prompt through buildBaseDict, and the
        // two dialogue sections are different lengths.
        fireRefreshHook(REFRESH.TOKEN_COUNT);
        if (typeof rerender === "function") rerender();
    });
}

// ── Data ─────────────────────────────────────────────────────────────────

const DESCRIPTIONS = {
    "balance": "The original Secret Sauce. NPCs react naturally — no simping, no needless hostility.",
    "balance Test": "New and improved balance mode that aims to use less tokens and more creativity.",
    "cinematic": "Hollywood-inspired storytelling. Dramatic beats and heightened tension.",
    "dark": "Balance but harsher. The world is unforgiving and consequences hit harder.",
    "v6-anime-director": "Advanced cinematic framing and pacing. Designed to emulate high-budget anime direction.",
    "v6-dream-team": "The ultimate 6-specialist writer room. Unprecedented narrative consistency and realism.",
    "v6-dream-team-lite": "A streamlined version of the Dream Team. Faster generation with lower token overhead.",
    "v7-core": "The V7 Core engine. The perfect middle ground: cinematic pacing, realistic friction, and relentless world progression.",
    "v7-reality": "The V7 Reality engine. Grounded, unrelenting simulation with zero narrative protection.",
    "v7-gentle": "The V7 Gentle engine. A softer, more intimate storytelling flow.",
    "v7.5": "The Kismet engine. Focused purely on inescapable narrative momentum, pushing the story forward as the unseen author of fate.",
    "v8-m": "Unmatched in complex human psychology, authentic flawed dialogue, and autonomous, multi-layered story plotting.",
    "v8-lite": "A streamlined, highly efficient version of Obsidian. Retains the core rules of psychology, dialogue, and momentum with a much lighter token footprint.",
    "v8-fusion": "The absolute pinnacle of the Megumin Suite. A hybrid engine mixing V8 Obsidian's deep psychology with V6 Dream Team's specialist writer room framework.",
    "v11-voice": "One storyteller writes the whole turn, plainly and with a voice of its own. Characters play their sheets at full strength, the world goes on without you, and a notebook keeps the story's hidden truths until they come out. The base for every model.",
    "v11-deepseek": "V11 Тайна with one more line for DeepSeek, which tends to treat the character as the player and leave them doing nothing: the character and everyone else in the story are the AI's to write and to move. Use it with Chomusuke writing the blocks, since DeepSeek leaves them out.",
    "v11-writers-room": "V11 Тайна written by a room of five: a director, a psychologist, a story architect, a storyteller and a dialogue writer talk the turn over in the thinking before it is written.",
    "v11-room": "The first V11 release, kept as it was. A writers' room of five: a director who keeps continuity and checks every draft, a psychologist for what each character wants, a story architect who keeps the author's notebook of hidden truths, a storyteller for the narration, and a dialogue writer for the voices. The reader gets one voice. Turns the Author's Notebook on by itself.",
    "v10-core": "The storyteller. Ukiyo is the looser of the two — a teller with a temperament, spinning the world and its history, following whatever in the scene is most alive. It trades a little polish for invention: the prose wanders, reaches for an image, and occasionally overreaches. Pick it for atmosphere, momentum and a world that feels told rather than composed. Neither V10 is a downgrade of the other — run a few scenes on each and keep the one that sounds like the story you want to read.",
    "v10-shura": "The writer. Shura is the stricter of the two — no slop, no AI tells, no line that exists to manage the scene. Every character is the protagonist of their own story, acting from their own values, and none of them is a villain in their own eyes; there is no objective right or wrong for the narration to take sides on. Pick it for prose that reads like a book and a cast that drives the story itself. Neither V10 is a downgrade of the other — run a few scenes on each and keep the one that sounds like the story you want to read.",
    "v10-core-cw": "Ukiyo, with the narrator writing {{user}} as well. It reads how you write — diction, rhythm, how boldly you act — and plays your character in that voice. Anything you write yourself is canon and is never overwritten or corrected. Your history stays yours; only the acting is shared.",
    "v10-shura-cw": "Shura with shared authorship: every character is a protagonist, {{user}} among them, and the narrator writes them all in your voice. It yields the moment you take a turn back, and never invents your past. For hands-off, cinematic play — watching the story rather than steering each beat.",
    "v9-core": "The definitive, final Megumin V9 Preset. V9 Mirage is the absolute pinnacle of narrative simulation, delivering hyper-realistic psychology, visceral atmospheric grounding, and dynamic world consequences. This is the ultimate, highly recommended preset.",
    "v9-lite": "An experimental beta engine with a slightly different, highly stylized narrative flow. Proved interesting enough to include for those who want an alternative storytelling rhythm. Note: this doesn't support custom Writing style it have it own one. ",
    "v9-director": "A unique beta hybrid blending the specialized writer-room mechanics of V8 Fusion with the raw psychological depth of V9 Xin. Highly experimental. Note: this doesn't support custom Writing style it have it own one.",
    "v9-immersion": "A streamlined, lightweight version of V9 Mirage. It retains the core philosophy and brutal realism of Mirage but runs with a smaller context footprint. V9 Mirage is still recommended if your model can handle it."
};

const COT_TYPES = [
    { id: "v11-voice", label: "CoT V11 Тайна", desc: "Five steps in order: read your turn and the history, decide what each other character does, decide what the turn adds and whether a hidden truth gets a clue, write, then check the draft. Made for V11 Тайна.", isNew: true },
    { id: "v11-voice-cap", label: "CoT V11 Тайна — Thinking Cap", desc: "The same five steps with a hard ceiling on the thinking: one line of notes per step, and the reply is written only once, in the reply. For models that over-think, like DeepSeek, Kimi, GLM and Qwen.", isNew: true },
    { id: "v11-wr", label: "CoT V11 Тайна · Writers' Room", desc: "The same five steps, worked by the room: the director reads, the psychologist decides what each other character does, the story architect picks what the turn adds, the storyteller and dialogue writer write, and the director checks.", isNew: true },
    { id: "v11-wr-cap", label: "CoT V11 Тайна · Writers' Room — Thinking Cap", desc: "The room's five steps with a hard ceiling on the thinking: one line of notes per role, and the reply is written only once, in the reply. For models that over-think, like DeepSeek, Kimi, GLM and Qwen.", isNew: true },
    { id: "v11", label: "CoT V11 Тайна Preview", desc: "The writers' room works the turn in order: the director reads the history, the psychologist decides what each character does, the story architect picks what is new and whether a hidden truth gets a clue or comes out, the writers draft, and the director checks it against the rules.", isNew: true },
    { id: "v11-cap", label: "CoT V11 Тайна Preview — Thinking Cap", desc: "The same five steps with a hard ceiling on the thinking: one line of notes per step, and the reply is written only once, in the reply. For models that over-think, like DeepSeek, Kimi, GLM and Qwen.", isNew: true },
    { id: "v10-ukiyo", label: "CoT V10 Ukiyo", desc: "The long-form reasoning built for Ukiyo. Thinks like a novelist muttering before a draft — present tense, a little messy, never a plan. No phases, no checklists, no audits.", isNew: true },
    { id: "v10-ukiyo-cap", label: "CoT V10 Ukiyo — Thinking Cap", desc: "The same writer's mind with a hard ceiling on the thinking phase. For models that over-think.", isNew: true },
    { id: "v10-shura", label: "CoT V10 Shura", desc: "Seven rules carried into the writing rather than a plan made before it. Built for V10 Shura, and the lightest of the four.", isNew: true },
    { id: "v10-shura-cap", label: "CoT V10 Shura — Thinking Cap", desc: "The same seven rules with a hard ceiling on the thinking phase. For models that over-think.", isNew: true },
    { id: "v1", label: "CoT V1 (Classic)", desc: "The original 8-step framework. Focuses heavily on the NPC's internal emotional landscape vs their observable actions." },
    { id: "v2", label: "CoT V2 (New)", desc: "The new experimental framework. Stricter reality checks, info audits, better NPCs, and hook generation." },
    { id: "v6", label: "CoT V6 (Dream Team)", desc: "The full 4-phase sequence designed specifically for V6 engines. Specialized validation and modeling." },
    { id: "v6-lite", label: "CoT V6 (Lite)", desc: "A streamlined 3-phase sequence. Less token overhead while maintaining narrative rules." },
    { id: "v7", label: "CoT V7", desc: "The new V7 sequence with 5-phase strict ground truth rebuilding." },
    { id: "v7-lite", label: "CoT V7 (Lite)", desc: "A streamlined 5-phase sequence for V7." },
    { id: "v7.5", label: "CoT V7.5 Kismet", desc: "The new V7.5 sequence focused on story engine mechanics." },
    { id: "v8", label: "CoT V8", desc: "The new V8 narrative processing sequence." },
    { id: "v8-fusion", label: "CoT V8 Fusion", desc: "The new V8 Fusion narrative processing sequence." },
    { id: "v9", label: "CoT V9 Mirage", desc: "The primary and most balanced reasoning sequence, purpose-built for the V9 Mirage engine. The gold standard for modern roleplay.", isNew: true },
    { id: "v9-director", label: "CoT V9 Mirage Air", desc: "A lighter, version of CoT V9 Mirage, it give Different output Try and see if you like.", isNew: true },
    { id: "v9-immersion", label: "CoT V9 Mirage Max", desc: "The heavy-duty, maximum-thinking sequence. Forces the AI to dive incredibly deep into sensory data and psychological realism before generating a single word.", isNew: true },
    { id: "v9-hybrid", label: "CoT V9 Kuromaku", desc: "A specialized multi-agent reasoning sequence designed specifically to pair with the V9 Kuromaku engine.", isNew: true },
    { id: "v9-lite", label: "CoT V9 Cui (Lite)", desc: "A highly streamlined, fast-executing reasoning sequence perfectly paired with the V9 Cui engine to save tokens.", isNew: true }
];

const ALL_LANGS = [
    { id: "english", label: "English" }, { id: "arabic", label: "Arabic (العربية)", rec: true }, { id: "spanish", label: "Spanish (Español)" },
    { id: "french", label: "French (Français)" }, { id: "zh", label: "Mandarin (中文)" }, { id: "ru", label: "Russian (Русский)" },
    { id: "jp", label: "Japanese (日本語)" }, { id: "pt", label: "Portuguese (Português)" }
];

// Version of an official preset, for the Latest / All lists.
function versionOf(m) {
    if (m.label.includes("V4")) return "V4";
    if (m.label.includes("V5")) return "V5";
    if (m.id.includes("v6")) return "V6";
    if (m.id.includes("v7")) return "V7";
    if (m.id.includes("v8")) return "V8";
    // Before the v9 test purely so the two lists stay in the same order.
    if (m.id.includes("v11")) return "V11";
    if (m.id.includes("v10")) return "V10";
    if (m.id.includes("v9")) return "V9";
    return "all";
}
const LATEST = ["V11", "V10"];

// Which reasoning set a CoT id is, and its language. Longest prefix first:
// "cot-v10-shura-cap-" also starts with "cot-v10-shura-", so the capped ids are
// tested ahead of the plain ones or every cap reads back as its uncapped sibling.
function parseCot(model) {
    const m = String(model || "");
    if (m.startsWith("cot-v11-cap-")) return { type: "v11-cap", lang: "english" };
    if (m.startsWith("cot-v11-voice-cap-")) return { type: "v11-voice-cap", lang: "english" };
    if (m.startsWith("cot-v11-wr-cap-")) return { type: "v11-wr-cap", lang: "english" };
    if (m.startsWith("cot-v11-voice-")) return { type: "v11-voice", lang: "english" };
    if (m.startsWith("cot-v11-wr-")) return { type: "v11-wr", lang: "english" };
    if (m.startsWith("cot-v11-")) return { type: "v11", lang: "english" };
    if (m.startsWith("cot-v10-ukiyo-cap-")) return { type: "v10-ukiyo-cap", lang: "english" };
    if (m.startsWith("cot-v10-shura-cap-")) return { type: "v10-shura-cap", lang: "english" };
    if (m.startsWith("cot-v10-ukiyo-")) return { type: "v10-ukiyo", lang: "english" };
    if (m.startsWith("cot-v10-shura-")) return { type: "v10-shura", lang: "english" };
    const pref = ["v1", "v2", "v6-lite", "v6", "v7.5", "v7-lite", "v7", "v8-fusion", "v8", "v9-lite", "v9-director", "v9-immersion", "v9-hybrid", "v9"];
    for (const p of pref) if (m.startsWith(`cot-${p}-`)) return { type: p, lang: m.replace(`cot-${p}-`, "") };
    return { type: "off", lang: "english" };
}

// The frameworks made for a preset; null = any (older and your own presets).
function cotTypesFor(mode) {
    const m = String(mode || "");
    if (m === "v11-voice" || m === "v11-deepseek") return ["v11-voice", "v11-voice-cap"];
    if (m === "v11-writers-room") return ["v11-wr", "v11-wr-cap"];
    if (m.includes("v11")) return ["v11", "v11-cap"];
    if (m.includes("v10")) return ["v10-ukiyo", "v10-ukiyo-cap", "v10-shura", "v10-shura-cap"];
    if (m.includes("v6")) return ["v6", "v6-lite"];
    if (m === "v7.5") return ["v7.5"];
    if (m.includes("v7")) return ["v7", "v7-lite"];
    if (m === "v8-fusion") return ["v8-fusion"];
    if (m.includes("v8")) return ["v8"];
    if (m.includes("v9")) return ["v9", "v9-lite", "v9-director", "v9-immersion", "v9-hybrid"];
    return null;
}

const ENGLISH_ONLY = t => t.startsWith("v11") || t.startsWith("v10") || t.startsWith("v9") || ["v7", "v7-lite", "v7.5", "v8", "v8-fusion"].includes(t);

function cotModelId(type, lang) {
    if (type.startsWith("v11") || type.startsWith("v10") || type.startsWith("v9")) return `cot-${type}-english`;
    if (["v7", "v7.5", "v7-lite", "v8", "v8-fusion"].includes(type)) return `cot-${type}-english`;
    return `cot-${type}-${lang}`;
}

// ── Page state, kept while SillyTavern is open ───────────────────────────

let currentPage = "preset";
// null until the tab is first opened: then the list that holds your preset.
let presetFilter = null;
let showAllCot = false;
let advancedOpen = false;

/** Which page the tab opens on next (Model Setup's buttons land on the right one). */
export function setPresetPage(id) {
    if (["preset", "thinking", "config"].includes(id)) currentPage = id;
}

export function renderCoreAndCot(c) {
    c.empty();
    const rerender = () => renderCoreAndCot(c);
    const customModes = extension_settings[extensionName].customModes || [];
    const official = hardcodedLogic.modes;
    const active = [...official, ...customModes].find(m => m.id === localProfile.mode);
    const activeIsCustom = customModes.some(m => m.id === localProfile.mode);

    // Old CoT ids, moved to their current names once.
    const migrationMap = {
        "cot-english": "cot-v1-english", "cot-arabic": "cot-v1-arabic", "cot-spanish": "cot-v1-spanish", "cot-french": "cot-v1-french",
        "cot-zh": "cot-v1-zh", "cot-ru": "cot-v1-ru", "cot-jp": "cot-v1-jp", "cot-pt": "cot-v1-pt", "cot-english-test": "cot-v2-english"
    };
    if (localProfile.cotEnabled === undefined) localProfile.cotEnabled = true;
    if (migrationMap[localProfile.model]) { localProfile.model = migrationMap[localProfile.model]; saveProfileToMemory(); }
    if (localProfile.model === "cot-off") {
        localProfile.cotEnabled = false;
        localProfile.model = "cot-v7.5-english";
        saveProfileToMemory();
    }
    const cot = parseCot(localProfile.model);
    const cotLabel = (COT_TYPES.find(t => t.id === cot.type) || {}).label || "None";
    const cfgCount = countActiveConfigFields(localProfile.storyConfig);

    // ── Header + summary ──
    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #f59e0b, #a855f7);"><i class="fa-solid fa-server"></i></div>
                <div><h2>Preset & Thinking</h2><p>Choose the preset, how it thinks before it writes, and the story's standing settings.</p></div>
            </div>
            <button type="button" class="menu_button ptx-guide-btn" title="Open Model Setup: the settings tested for the model you use"><i class="fa-solid fa-compass"></i> Model Setup</button>
        </div>
        <div class="igx-chips ptx-summary">
            <span class="igx-chip ok"><i class="fa-solid fa-server"></i> ${esc(active ? active.label : localProfile.mode)}</span>
            <span class="igx-chip ${localProfile.cotEnabled ? "warm" : ""}"><i class="fa-solid fa-brain"></i> Thinking: ${localProfile.cotEnabled ? esc(cotLabel) : "off"}</span>
            <span class="igx-chip"><i class="fa-solid fa-sliders"></i> Story Config: ${cfgCount ? `${cfgCount} set` : "preset defaults"}</span>
        </div>
    `);

    c.find(".ptx-guide-btn").on("click", () => fireRefreshHook(REFRESH.SWITCH_TAB, "setup"));

    const pages = [
        { id: "preset", label: "Preset", icon: "fa-server" },
        { id: "thinking", label: "Thinking", icon: "fa-brain" },
        { id: "config", label: "Story Config", icon: "fa-sliders" }
    ];
    const $tabs = $(`<div class="igx-tabs" role="tablist"></div>`);
    pages.forEach(p => {
        const $b = $(`<button type="button" class="${p.id === currentPage ? "on" : ""}"><i class="fa-solid ${p.icon}"></i> ${p.label}</button>`);
        $b.on("click", () => { if (currentPage !== p.id) { currentPage = p.id; rerender(); } });
        $tabs.append($b);
    });
    c.append($tabs);

    const $page = $(`<div class="igx-page"></div>`);
    c.append($page);
    if (currentPage === "preset") renderPresetPage($page, { active, activeIsCustom, official, customModes, rerender });
    else if (currentPage === "thinking") renderThinkingPage($page, { active, cot, rerender });
    else $page.append(buildStoryConfigSection().show());
}

// ── Preset page ──────────────────────────────────────────────────────────

function pickPreset(m) {
    localProfile.mode = m.id;
    // Same mapping the Writing Style tab uses when it finds a locked preset with
    // no style set. One list, so the two cannot disagree. Your own style, or a
    // style of the same generation (V11 Inside between the V11 engines), is
    // kept, as Model Setup does.
    const isBuiltIn = hardcodedLogic.directStyles.some(x => x.id === localProfile.activeStyleId);
    const lockedStyle = styleAfterPicking(m, localProfile.activeStyleId, isBuiltIn);
    if (lockedStyle) {
        localProfile.activeStyleId = lockedStyle;
        const ds = hardcodedLogic.directStyles.find(x => x.id === lockedStyle);
        if (ds) localProfile.aiRule = ds.rule;
    }
    const currentLang = (localProfile.model && localProfile.model.includes("-")) ? localProfile.model.split("-").pop() : "english";
    // The preset→thinking mapping lives in data/cot/index.js, so Dev Mode can
    // fill a copy's reasoning script from the same source.
    const targetCot = meguminCotForMode(m.id, currentLang);
    if (targetCot) localProfile.model = targetCot;
    saveProfileToMemory();
}

function badgesFor(m, isLocked) {
    let b = "";
    if (m.recommended) b += `<span class="ecard-badge rec"><i class="fa-solid fa-star"></i> Recommended</span>`;
    if (m.isNew && !isLocked) b += `<span class="ecard-badge new">New</span>`;
    if (isLocked) b += `<span class="ecard-badge locked"><i class="fa-solid fa-lock"></i> Coming Soon</span>`;
    return b;
}

function renderPresetPage(c, { active, activeIsCustom, official, customModes, rerender }) {
    c.append(`
        <div class="mtab-callout gold" style="margin-bottom: 14px;">
            <i class="fa-solid fa-lightbulb"></i>
            <span><strong>Pro Tip:</strong> The preset defines the "laws of physics" and pacing of your story. Thinking is the AI's scratchpad before it writes. For the best experience, match V11 Тайна with CoT V11 Тайна. Picking a preset picks its thinking for you.</span>
        </div>
    `);

    // V7's own modules belong to the preset, so they sit at the top while it is picked.
    if (active && isV7Engine(active)) {
        const mods = pageCard("V7 modules", "Turn one off to leave it out of the prompt.");
        [
            { id: "v7_ooc", label: "OOC Protocol", desc: "Allows out-of-character directives." },
            { id: "v7_pcsolo", label: "PC Solo Physicality", desc: "Narration of PC when unobserved." },
            { id: "v7_intro", label: "Introduction Protocol", desc: "How new NPCs enter the story." },
            { id: "v7_culture", label: "Cultural Anchoring", desc: "Real-world integration and references." },
            { id: "v7_scene", label: "Scene Choreography", desc: "Focus shifting and crowd management." }
        ].forEach(tog => {
            if (localProfile.toggles[tog.id] === undefined) localProfile.toggles[tog.id] = true;
            mods.append(switchRow({
                label: tog.label, desc: tog.desc, on: localProfile.toggles[tog.id],
                onChange: on => { localProfile.toggles[tog.id] = on; saveProfileToMemory(); }
            }));
        });
        c.append(mods);
    }

    // ── Choose a preset ──
    if (!presetFilter) presetFilter = activeIsCustom ? "mine" : (active && !LATEST.includes(versionOf(active)) ? "all" : "latest");
    const pick = pageCard("Choose a preset");
    const latestCount = official.filter(m => LATEST.includes(versionOf(m))).length;
    pick.append(segmented([
        { id: "latest", label: `Latest (${latestCount})` },
        { id: "all", label: `All (${official.length})` },
        { id: "mine", label: `Mine (${customModes.length})` }
    ], presetFilter, id => { presetFilter = id; rerender(); }));

    const $grid = $(`<div class="mtab-card-grid ptx-grid"></div>`);
    if (presetFilter === "mine") {
        if (!customModes.length) $grid.append(`<div class="igx-note">No presets of your own yet. Make or import one in Dev Mode.</div>`);
        customModes.forEach(m => $grid.append(presetCard(m, { custom: true, rerender })));
    } else {
        const list = presetFilter === "latest" ? official.filter(m => LATEST.includes(versionOf(m))) : official;
        list.forEach(m => $grid.append(presetCard(m, { custom: false, rerender })));
    }
    pick.append($grid);
    c.append(pick);
}

function presetCard(m, { custom, rerender }) {
    const isLocked = !custom && m.locked === true;
    const isSel = localProfile.mode === m.id;
    const badges = custom ? "" : badgesFor(m, isLocked);
    const $card = $(`
        <div class="mtab-eng-card ptx-compact ${isSel ? "active" : ""} ${isLocked ? "locked-card" : ""}">
            <div class="ecard-accent"></div>
            <div class="ecard-body">
                <div class="ecard-title">
                    <span>${esc(m.label)}</span>
                    ${isSel ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> Active</span>` : ""}
                    ${custom ? `<button type="button" class="ps-modern-btn secondary btn-quick-edit ptx-edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ""}
                </div>
                <p class="ecard-desc" title="${esc(custom ? "" : (DESCRIPTIONS[m.id] || ""))}">${custom ? "One of your own presets." : (DESCRIPTIONS[m.id] || "")}</p>
                ${badges ? `<div class="ptx-badges">${badges}</div>` : ""}
                ${enhancedDialogueMarkup(m, isLocked)}
            </div>
        </div>
    `);
    wireEnhancedDialogue($card, m, rerender);
    $card.find(".ptx-edit").on("click", e => { e.stopPropagation(); renderDevMode("editor", m.id, null, "tab"); });
    if (!isLocked) {
        $card.on("click", e => {
            if ($(e.target).closest(".btn-quick-edit, .ecard-opt").length) return;
            if (localProfile.mode === m.id) return;
            pickPreset(m);
            rerender();
        });
    }
    return $card;
}

// ── Thinking page ────────────────────────────────────────────────────────

function renderThinkingPage(c, { active, cot, rerender }) {
    const main = pageCard();
    main.append(switchRow({
        label: "Think before writing",
        desc: "The AI works the turn out on a scratchpad first, then writes the reply. Off: it writes the reply straight away.",
        on: localProfile.cotEnabled,
        onChange: on => { localProfile.cotEnabled = on; saveProfileToMemory(); rerender(); }
    }));
    c.append(main);
    if (!localProfile.cotEnabled) return;

    if (active && active.cot && active.cot.trim() !== "") {
        c.append(`
            <div class="mtab-callout green" style="margin-bottom:14px;">
                <i class="fa-solid fa-shield-halved"></i>
                <span><strong>This preset brings its own thinking.</strong> It carries its own [[COT]] and [[prefill]], so the choices below are not used.</span>
            </div>
        `);
    }

    // ── Framework ──
    const allowed = cotTypesFor(localProfile.mode);
    const fw = pageCard("How it thinks", allowed ? "The frameworks made for your preset." : "Your preset works with any of these.");
    const visible = COT_TYPES.filter(t => !allowed || showAllCot || allowed.includes(t.id) || t.id === cot.type);
    const $grid = $(`<div class="mtab-card-grid ptx-grid ptx-cot-grid"></div>`);
    visible.forEach(t => {
        const isSel = cot.type === t.id;
        const warned = allowed && !allowed.includes(t.id);
        const badge = warned
            ? `<span class="ecard-badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;"><i class="fa-solid fa-triangle-exclamation"></i> Made for another preset</span>`
            : (t.isNew ? `<span class="ecard-badge new">New</span>` : "");
        const $card = $(`
            <div class="mtab-eng-card ptx-cot ${isSel ? "active" : ""}">
                <div class="ecard-accent"></div>
                <div class="ecard-body">
                    <div class="ecard-title"><span>${t.label}</span>
                        ${isSel ? `<span class="ecard-badge" style="background:rgba(168,85,247,0.15);color:#a855f7;"><i class="fa-solid fa-check"></i> Active</span>` : ""}
                    </div>
                    <p class="ecard-desc">${t.desc}</p>
                    ${badge ? `<div class="ptx-badges">${badge}</div>` : ""}
                </div>
            </div>
        `);
        $card.on("click", () => {
            if (isSel) return;
            localProfile.model = cotModelId(t.id, cot.lang);
            saveProfileToMemory();
            rerender();
        });
        $grid.append($card);
    });
    fw.append($grid);
    if (allowed) {
        fw.append(switchRow({
            label: "Show every framework",
            desc: "Including the ones made for other presets. They may not fit yours.",
            on: showAllCot,
            onChange: on => { showAllCot = on; rerender(); }
        }));
    }
    c.append(fw);

    // ── Length (a Thinking Cap sets its own) ──
    if (!localProfile.thinkEffort) localProfile.thinkEffort = "unspecified";
    if (!localProfile.customThinkEffort) localProfile.customThinkEffort = "100";
    if (cot.type.endsWith("-cap")) {
        const capLen = pageCard("How long it thinks", "The Thinking Cap keeps the thinking short by itself, so there's no length to set.");
        capLen.append(`
            <div class="mtab-callout gold">
                <i class="fa-solid fa-lightbulb"></i>
                <span>For Kimi and DeepSeek, a temperature of 0.7–0.8 also helps them think less. Kimi ignores Reasoning Effort: it only thinks or doesn't.</span>
            </div>
        `);
        c.append(capLen);
    } else {
        const len = pageCard("How long it thinks");
        const $custom = field("Words", "", $(`<input type="number" id="ps_input_custom_effort" class="ps-modern-input igx-tiny" min="1" value="${esc(localProfile.customThinkEffort)}" />`));
        $custom.toggle(localProfile.thinkEffort === "custom");
        len.append(segmented([
            { id: "100", label: "100 words" }, { id: "250", label: "250 words" }, { id: "450", label: "450 words" },
            { id: "custom", label: "Custom" }, { id: "unspecified", label: "No limit" }
        ], localProfile.thinkEffort, id => {
            localProfile.thinkEffort = id;
            saveProfileToMemory();
            $custom.toggle(id === "custom");
        }));
        $custom.find("input").on("change input", function () { localProfile.customThinkEffort = $(this).val(); saveProfileToMemory(); });
        len.append($custom);
        c.append(len);
    }

    // ── Language: only where the framework has more than English ──
    if (!ENGLISH_ONLY(cot.type) && cot.type !== "off") {
        const lang = pageCard("Thinking language", "The AI thinks in this language; the reply follows your story's language.");
        lang.append(segmented(ALL_LANGS.map(l => ({ id: l.id, label: l.rec ? `${l.label} ★` : l.label })), cot.lang, id => {
            localProfile.model = `cot-${cot.type}-${id}`;
            saveProfileToMemory();
        }));
        c.append(lang);
    }

    // ── Advanced ──
    if (localProfile.thinkingV2 === undefined) localProfile.thinkingV2 = false;
    const adv = pageCard();
    const $fold = $(`<button type="button" class="igx-fold"><i class="fa-solid fa-chevron-${advancedOpen ? "down" : "right"}"></i> Advanced</button>`);
    const $box = $(`<div class="igx-stack" style="display:${advancedOpen ? "flex" : "none"};"></div>`);
    $fold.on("click", () => {
        advancedOpen = !advancedOpen;
        $box.css("display", advancedOpen ? "flex" : "none");
        $fold.find("i").attr("class", `fa-solid fa-chevron-${advancedOpen ? "down" : "right"}`);
    });
    $box.append(switchRow({
        label: "Gemini thinking override",
        desc: "Only for Gemini models: adds the tags Gemini needs for its thinking.",
        on: localProfile.thinkingV2,
        onChange: on => { localProfile.thinkingV2 = on; saveProfileToMemory(); }
    }));
    adv.append($fold).append($box);
    c.append(adv);
}
