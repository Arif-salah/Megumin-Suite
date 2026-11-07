// ────────────────────────────────────────────────────────────────────────────
// Model Setup (plan 018, phase 5): the tested loadouts and the settings they
// set. Pure: the page (ui.js) hands in what needs SillyTavern (the Story
// Config length sentences). Every value here comes from Desktop/prompt/
// loadouts.md; a loadout recommends, it never locks.
// ────────────────────────────────────────────────────────────────────────────

import { meguminCotForMode, models } from "../../../data/cot/index.js";
import { directStyles } from "../../../data/directStyles.js";
import { styleAfterPicking } from "../../core/engines.js";

export const V11_STYLE_IDS = ["dir_v11", "dir_v11_inside"];

// The Story Config length options a loadout picks, by their label.
export const LENGTH_FLEXIBLE = "flexible";
export const LENGTH_SHORT = "250–350 words, longer for fights and sex";

// One row per setting. `tab` is the tab id the row's button opens (and whose
// Global sync a change on the page follows); `page` a page inside that tab.
// read/write work on a profile object; ctx = { lengthLabel, lengthValue }.
export const SETTINGS = [
    {
        key: "mode", label: "Preset", tab: "preset", page: "preset",
        read: p => p.mode,
        write: (p, id) => pickEngine(p, id)
    },
    {
        key: "thinking", label: "Custom thinking", tab: "preset", page: "thinking",
        read: p => p.cotEnabled !== false,
        write: (p, on) => { p.cotEnabled = Boolean(on); }
    },
    {
        // The preset's thinking, capped or not. Comes after "mode" in a
        // loadout's settings, so it caps the thinking of the preset just picked.
        key: "thinkingCap", label: "Thinking Cap", tab: "preset", page: "thinking",
        desc: "Keeps the custom thinking to five short lines. For a model that thinks too long. Works only with custom thinking on.",
        read: p => isCapped(p.model),
        write: (p, on) => setCap(p, on)
    },
    {
        key: "length", label: "Length", tab: "preset", page: "config",
        read: (p, ctx) => ctx.lengthLabel(p.storyConfig && p.storyConfig.length),
        write: (p, label, ctx) => {
            if (!p.storyConfig) p.storyConfig = {};
            p.storyConfig.length = ctx.lengthValue(label);
        }
    },
    {
        key: "banList", label: "Ban list", tab: "banlist",
        read: p => p.banListBuiltIn === false ? "off" : (p.banListShort ? "short" : "full"),
        write: (p, v) => {
            p.banListBuiltIn = v !== "off";
            if (v !== "off") p.banListShort = v === "short";
        }
    },
    { key: "html", label: "Immersive HTML", tab: "addons", ...addonRow("html") },
    {
        // Only the Gemini loadouts have this row; using any other loadout
        // switches it off (offElsewhere).
        key: "geminiJB", label: "Gemini JB", tab: "addons", ...addonRow("gemini_jb"), offElsewhere: true,
        desc: "Helps Gemini get through gritty and heavy NSFW scenes without cutting the reply off."
    },
    {
        // Who writes what comes after the story: the blocks, World State, the
        // notebook and the image tags. "mixed" when the Chomusuke tab splits them.
        // Chomusuke is one setup for every character, so this row is too.
        key: "chomusuke", label: "Chomusuke", tab: "chomusuke", global: true,
        desc: "Writes the blocks, World State, the notebook and the image prompts after each reply, so the story model writes only the story.",
        read: p => {
            const c = p.chomusuke || {};
            const f = c.features || {};
            const routes = c.blockRoutes || {};
            const on = [f.blocks === true, f.worldState === true, f.notebook === true, f.imageGen !== false];
            if (!on.some(Boolean)) return "story";
            return on.every(Boolean) && BLOCK_IDS.every(id => routes[id] !== false) ? "chomusuke" : "mixed";
        },
        write: (p, v) => {
            if (!p.chomusuke) p.chomusuke = { enabled: false, profileId: "", primaryProfileId: "", features: {} };
            if (!p.chomusuke.features) p.chomusuke.features = {};
            const on = v === "chomusuke";
            for (const f of ["blocks", "worldState", "notebook", "imageGen"]) p.chomusuke.features[f] = on;
            if (on) p.chomusuke.blockRoutes = Object.fromEntries(BLOCK_IDS.map(id => [id, true]));
        }
    }
];

// A row that switches one add-on (Language & rules tab) on or off.
function addonRow(id) {
    return {
        read: p => Array.isArray(p.addons) && p.addons.includes(id),
        write: (p, on) => {
            const list = (Array.isArray(p.addons) ? p.addons : []).filter(a => a !== id);
            if (on) list.push(id);
            p.addons = list;
        }
    };
}

// The blocks Chomusuke can write (the Chomusuke tab's block switches).
const BLOCK_IDS = ["bonds", "sheet", "chatter", "cyoa"];

export const settingFor = key => SETTINGS.find(s => s.key === key);

const isCapped = model => /^cot-.+-cap-/.test(model || "");

/** The preset's own thinking, or its Thinking Cap when it has one. */
function setCap(p, on) {
    const cot = meguminCotForMode(p.mode, "english");
    if (!cot) return;
    const capped = cot.replace(/-english$/, "-cap-english");
    p.model = on && models.some(m => m.id === capped) ? capped : cot;
}

/** Picks an engine the way the Preset tab does: its thinking comes with it.
 *  A Thinking Cap stays on when the new engine has one too.
 *  The style is kept when it is a V11 style or one of your own; another
 *  generation's built-in style becomes V11 Default. */
export function pickEngine(p, id) {
    const wasCapped = isCapped(p.model);
    p.mode = id;
    const cot = meguminCotForMode(id, "english");
    if (cot) p.model = cot;
    if (wasCapped) setCap(p, true);
    const builtIn = directStyles.some(s => s.id === p.activeStyleId);
    const styleId = styleAfterPicking({ id }, p.activeStyleId, builtIn);
    const ds = styleId && directStyles.find(s => s.id === styleId);
    if (ds) {
        p.activeStyleId = ds.id;
        p.aiRule = ds.rule;
    }
}

// Chomusuke is optional on the models that write the blocks themselves.
const PREFILL_OFF = why => ({ tone: "gold", text: `<b>Keep the prefill off.</b> ${why}` });
const CHOMUSUKE_OPTIONAL = { tone: "gold", chomusuke: true, text: "<b>Chomusuke is off here.</b> You can turn it on below to save tokens." };

export const LOADOUTS = [
    {
        id: "gemini-pro", name: "Gemini Pro", icon: "fa-gem", models: "Gemini 3.1 Pro, 2.5 Pro, Gemini 4",
        why: "What Megumin was built for. Gemini writes best with its own thinking, the full ban list and the length left flexible.",
        notes: [
            { tone: "gold", text: "<b>Gemini 4:</b> keep custom thinking off. <b>Gemini 3.1 Pro and 2.5 Pro:</b> turn custom thinking on. Turn the prefill on only if you get refusals." },
            CHOMUSUKE_OPTIONAL
        ],
        settings: { mode: "v11-voice", thinking: false, length: LENGTH_FLEXIBLE, banList: "full", geminiJB: true, chomusuke: "story" }
    },
    {
        id: "gemini-flash", name: "Gemini Flash", icon: "fa-gem", models: "Gemini 3.5 – 3.8 Flash",
        why: "Set up like Gemini Pro, with custom thinking on: Flash plans the reply better when it writes its thinking out.",
        notes: [
            { tone: "gold", chomusuke: true, text: "<b>Gemini 3.8 Flash writes the blocks fine</b>, but in heavy NSFW scenes it can cut them off. If that happens, turn Chomusuke on below and give it another model to write the blocks." }
        ],
        settings: { mode: "v11-voice", thinking: true, thinkingCap: false, length: LENGTH_FLEXIBLE, banList: "full", geminiJB: true, chomusuke: "story" }
    },
    {
        id: "claude", name: "Claude", icon: "fa-feather", models: "Claude Opus 5.5",
        why: "The best prose of any model tested. Claude keeps its thinking to itself: asked to write it out, replies can get blocked after the first message.",
        notes: [PREFILL_OFF("Claude on OpenRouter often fails with it on."), CHOMUSUKE_OPTIONAL],
        settings: { mode: "v11-voice", thinking: false, length: LENGTH_FLEXIBLE, banList: "full", chomusuke: "story" }
    },
    {
        id: "big-open", name: "Big open models", icon: "fa-dragon", models: "GLM 5.3, GLM 5.3 Flash",
        why: "GLM writes plainer dialogue with custom thinking off, and the short ban list keeps it from redrafting. Immersive HTML leaks into its replies, so it stays off.",
        notes: [
            { tone: "gold", text: "<b>GLM 5.3 Flash</b> can forget a block now and then. If it does, let Chomusuke write the blocks." },
            PREFILL_OFF("GLM thinks on its own and doesn't need it."),
            CHOMUSUKE_OPTIONAL
        ],
        settings: { mode: "v11-voice", thinking: false, thinkingCap: false, length: LENGTH_SHORT, banList: "short", html: false, chomusuke: "story" }
    },
    {
        id: "fast", name: "Fast models", icon: "fa-bolt", models: "DeepSeek",
        why: "Fast and cheap, and good at the story. V11 Тайна DeepSeek has one more line, so it doesn't treat the character as the player.",
        notes: [
            { tone: "red", chomusuke: true, text: "<b>DeepSeek needs Chomusuke.</b> It leaves out everything after the story: the blocks, World State, the notebook and the image tags. Chomusuke writes them for it." }
        ],
        settings: { mode: "v11-deepseek", thinking: true, thinkingCap: false, length: LENGTH_SHORT, banList: "short", html: false, chomusuke: "chomusuke" }
    }
];

export const COMING_SOON = [
    { name: "Overthinkers", icon: "fa-hourglass-half", models: "Kimi K3, Xiaomi MiMo V2.6" },
    { name: "Local", icon: "fa-house-laptop", models: "Gemma 4 31B, Qwen 3.8 27B" }
];

export const loadoutById = id => LOADOUTS.find(l => l.id === id);

/** What Use this loadout writes: the loadout's settings, plus off for every
 *  offElsewhere row it doesn't have (Gemini JB on a non-Gemini loadout). */
export function loadoutWrites(settings) {
    const off = SETTINGS.filter(s => s.offElsewhere && !(s.key in settings)).map(s => [s.key, false]);
    return { ...settings, ...Object.fromEntries(off) };
}

/** Writes a loadout's settings into one profile (or `settings`, the
 *  loadout's settings as changed on the page before using it). Containers a
 *  profile lacks are made. `skipGlobal`: leave out the rows stored once for
 *  every character (written through the profile on screen). */
export function applyLoadout(p, loadout, ctx, settings = loadout.settings, { skipGlobal = false } = {}) {
    for (const [key, value] of Object.entries(loadoutWrites(settings))) {
        const s = settingFor(key);
        if (!(skipGlobal && s.global)) s.write(p, value, ctx);
    }
    p.loadout = loadout.id;
}

/** What Use this loadout would change on one profile, before it runs (plan
 *  020): [{ key, label, from, to }] in the loadout's order, values as the
 *  rows read them; plus { key: "style" } when the preset brings its own
 *  writing style. Empty: nothing would change. The profile is not touched. */
export function loadoutChanges(p, loadout, ctx, settings = loadout.settings) {
    const after = JSON.parse(JSON.stringify(p));
    applyLoadout(after, loadout, ctx, settings);
    const out = [];
    for (const key of Object.keys(loadoutWrites(settings))) {
        const s = settingFor(key);
        const from = s.read(p, ctx);
        const to = s.read(after, ctx);
        if (from !== to) out.push({ key, label: s.label, from, to });
    }
    if ((after.activeStyleId || "") !== (p.activeStyleId || "")) {
        out.push({ key: "style", label: "Writing style", from: p.activeStyleId || "", to: after.activeStyleId || "" });
    }
    return out;
}

/** The keys whose value differs from the loadout this profile last used.
 *  Empty when it used none, or another one. */
export function changedFromLoadout(p, loadout, ctx) {
    if (!loadout || p.loadout !== loadout.id) return [];
    return Object.entries(loadout.settings)
        .filter(([key, value]) => settingFor(key).read(p, ctx) !== value)
        .map(([key]) => key);
}
