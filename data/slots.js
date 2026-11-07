// ─────────────────────────────────────────────────────────────────────────────
// MEGUMIN_SLOT_REGISTRY — every [[placeholder]] the engine knows about.
//
// This is the same idea as MEGUMIN_BLOCK_REGISTRY, applied to the other half of
// the system. A placeholder used to be declared in three hand-maintained lists:
//
//   1. a createOverrideBlock(...) call in ui/devmode.js       (the editor box)
//   2. an entry in the overrides[] array in buildBaseDict.js  (the actual wiring)
//   3. a string in the 60-tag cleanup array in injection.js   (the leak guard)
//
// Only #2 was load-bearing, so forgetting #1 meant an uneditable slot and
// forgetting #3 meant a raw "[[whatever]]" leaking into the model's context.
// Three edits, three chances to miss one, and two of the three failures are
// silent. Everything is now derived from the one entry below.
//
// Adding a placeholder means adding ONE object here. If you find yourself
// editing devmode.js or the cleanup list to introduce a slot, stop — the thing
// you are about to hand-write is meant to be derived.
// ─────────────────────────────────────────────────────────────────────────────

import { addons, blocks, models, modes } from "./database.js";
import { isCoWriterEngine } from "../src/core/engines.js";
import {
    FORMATTING_RULES, FINAL_CHECKS, BUILTIN_BAN_LIST,
} from "../src/prompts/presetFrame.js";

import { worldPromptDefault } from "../src/state/modules/world/render.js";
import {
    bondsRulesText, sheetRulesText,
    CHOICES_RULES, CHATTER_RULES, CHATTER_SKELETON, TRACKER_RULES, TRACKER_SKELETON,
    BLOCKS_HEAD_SPLIT, BLOCK_RULES_LEAD, STORY_SETTINGS_PREAMBLE, FINAL_CHECK_HEAD,
    DICE_RULES_PLAYER, DICE_RULES_EVERYONE, ADDON_RULES_SPLIT, NPC_DOSSIER_RULES, GEMINI_JB, GEMINI_CARET_LINE,
} from "../src/prompts/v11Rules.js";
import {
    SCENE_RULES, SCENE_TEMPLATE, KNOWN_NAMES_LEAD, KNOWN_NAMES_TASK, BLOCKS_CHECK, BLOCKS_CHECK_SCENE,
} from "../src/prompts/scene.js";
import { CUSTOM_CHANGES_LINE, CUSTOM_FRESH_FIELDS_LINE, CUSTOM_LAST_NOTE } from "../src/prompts/customBlocks.js";
import { notebookSetupText, notebookUpdateText, NOTEBOOK_TRUTH_FORM } from "../src/state/modules/notebook/render.js";
import {
    NOTEBOOK_WORKER_SYSTEM, NOTEBOOK_CLERK_RULES, NOTEBOOK_SETUP_SYSTEM, notebookSetupClerkText,
} from "../src/state/modules/notebook/worker.js";
import { BLOCKS_WORKER_SYSTEM, BLOCKS_WORKER_TASK } from "../src/state/modules/stats/worker.js";
import { worldClerkSystem } from "../src/state/modules/world/render.js";
import {
    V2_LOOKS_TASK, V2_OUTFIT_TASK, COMBINED_IMAGE_TASK, COMBINED_SYSTEM_EDITABLE,
} from "../src/features/imagegen/v2/prompt.js";
import { IMAGE_V2_BUILTIN } from "../src/prompts/imageGenV2.js";

const addonText = id => addons.find(a => a.id === id)?.content || "";
const statFieldsOf = (p, id) => {
    const cfg = (p && p.statBlocks && p.statBlocks[id]) || {};
    return Array.isArray(cfg.fields) ? cfg.fields.filter(f => f && f.label) : [];
};
const blockText = id => blocks.find(b => b.id === id)?.content || "";

// ── Scopes ───────────────────────────────────────────────────────────────────
//
// engine  this engine's own text. Lives on the engine object. Editing it means
//         cloning, exactly as it always has.
// shared  one value for the whole install, stored outside every engine in
//         extension_settings[...].sharedFragments. No engine CONTAINS this
//         text — they all leave the slot for the dictionary to fill — which is
//         why one edit reaches stock V7 and your own clone alike.
// auto    built at generation time by a feature. Read-only in Dev Mode unless
//         the slot is marked overridable, in which case the editor offers an
//         opt-in box that shadows the computed value.
//
export const SLOT_SCOPE = { ENGINE: "engine", SHARED: "shared", AUTO: "auto" };

// ── Gates ────────────────────────────────────────────────────────────────────
//
// What has to be switched on for a slot to reach the prompt at all. These
// MIRROR the conditions in buildBaseDict's overrides[] array — that is the
// point of recording them: the editor can now say "this is currently off and
// your text will not be used", instead of silently accepting an edit that goes
// nowhere. `where` names the tab the reader has to visit to switch it on.
//
const gate = (test, label, where) => ({ test, label, where });

const GATE = {
    think:   gate(p => p.cotEnabled !== false, "Chain of Thought", "Preset & Thinking"),
    block:   id => gate(p => (p.blocks || []).includes(id), null, "Blocks"),
    addon:   id => gate(p => (p.addons || []).includes(id), null, "Writing Style → Language & rules"),
    chatter: gate(p => (p.blocks || []).includes("npc_inner_chatter")
                    || (p.blocks || []).includes("npc_inner_chatter_v2"),
                  "NPC Inner Chatter", "Blocks"),
    plan:    gate(p => !!(p.storyPlan && p.storyPlan.enabled), "Story Director", "Story Plan"),
    dnratio: gate(p => !!(p.dnRatio && p.dnRatio.enabled), "Dialogue/Narration ratio", "Writing Style"),
    onomato: gate(p => !!(p.onomatopoeia && p.onomatopoeia.enabled), "Onomatopoeia", "Writing Style → Language & rules"),
    dice:    gate(p => (p.addons || []).includes("dice")
                    || (p.addons || []).includes("dice_all"), "Dice", "Writing Style → Language & rules"),
    banBuiltIn: gate(p => p.banListBuiltIn !== false, "Built-in list", "Banned Phrases"),
    world:   gate(p => (p.blocks || []).includes("info"), "World State", "Blocks"),
    stat:    (id, label) => gate(p => ((p.blockStack && p.blockStack.order) || []).includes(id), label, "Blocks"),

    // The one gate keyed on the ENGINE rather than a switch the reader flips.
    // Every engine gets the "never write for {{user}}" rule except the Co-writer
    // variants, where authoring {{user}} is the whole point -- sending it there
    // would have the engine contradict itself inside one prompt.
    //
    // Custom clones are resolved from customModes as well as the shipped list,
    // because a clone of a Co-writer is still a Co-writer.
    notCoWriter: gate(p => !isCoWriterEngine(meguminModeById(p && p.mode)),
                      "a non Co-writer preset", "Preset & Thinking"),
};

/**
 * Look up an engine by id across the shipped list and the reader's own clones.
 *
 * Gates receive the profile, not the engine, so a gate that depends on which
 * engine is selected has to resolve it. The clones come from a reader that
 * index.js hands over at startup (setEngineClonesReader): data/ can't import
 * extension_settings itself, since that would pull SillyTavern into the pure
 * modules. SillyTavern never puts extension_settings on globalThis, so the old
 * globalThis read always came back empty and clones were never found. No
 * reader yet simply means "no clones".
 */
let readEngineClones = () => [];
export function setEngineClonesReader(fn) {
    readEngineClones = typeof fn === "function" ? fn : () => [];
}

function meguminModeById(id) {
    if (!id) return null;
    const found = modes.find(m => m.id === id);
    if (found) return found;
    try {
        return (readEngineClones() || []).find(m => m.id === id) || null;
    } catch { return null; }
}


// The chain-of-thought library, offered as a dropdown on the two slots that can
// be filled from it. cot-off is skipped: it exists to mean "no reasoning", and
// picking it would silently empty the box rather than load anything.
const cotPicker = key => () => models
    .filter(m => m.id !== "cot-off" && (m[key] || "").trim() !== "")
    .map(m => ({ label: m.id, value: m[key] }));

// ── Texts read where they are built (plan 024) ──────────────────────────────
//
// No preset tag: src/prompts/edits.js reads the edit where the text is built,
// and the trigger is only a name. `placement` says where it goes instead of
// the preset map. {{tokens}} are filled in when it is sent.
const PLACE = {
    v11: "Sent with a V11 preset only, near the top of the prompt with the other rules. Older presets send the box above it instead.",
    v11Turn: "Sent with a V11 preset only, in the last part of the prompt, after the chat.",
    scene: "Sent while World State, Bonds or Inner Chatter is on: the rules with the other block rules, the template first in <Blocks>.",
    names: "Sent in <Current_Info> while the story has named characters, and to Chomusuke with its notes.",
    check: "A line of the final check at the end of the prompt, on turns that ask for blocks.",
    custom: "Sent with your custom blocks (Blocks tab), for the blocks whose settings use it.",
    notebook: "Sent to the story while the Author's Notebook is on.",
    chomusuke: "Sent to Chomusuke, never to the story model.",
    image: "Sent wherever an image prompt is written: by Chomusuke, or by the story with inline images.",
};
const text = (key, group, label, placement, hint, fallback) =>
    ({ key, trigger: `[[edit:${key}]]`, label, scope: "shared", group, placement, hint, fallback });

const IMAGE_V2_LABELS = {
    "system": "Opening (who writes the image prompt)",
    "style.tags": "Style guide: tags",
    "style.natural": "Style guide: natural sentences",
    "style.qwen": "Style guide: Qwen Image",
    "style.krea": "Style guide: Krea 2",
    "levels": "How much of each character shows (@Name:waist)",
    "lookDetail": "Looks for Qwen Image and Krea 2: body detail",
    "textInImages": "Text in images (Qwen Image and Krea 2)",
    "shotKrea.cinematic": "Krea 2 shot: cinematic",
    "shotKrea.pov": "Krea 2 shot: point of view",
    "shotKrea.portrait": "Krea 2 shot: portrait",
    "artStyleLine": "Qwen Image: art style line",
    "shotQwen.cinematic": "Qwen Image shot: cinematic",
    "shotQwen.pov": "Qwen Image shot: point of view",
    "shotQwen.portrait": "Qwen Image shot: portrait",
    "qwenLook.system": "Qwen Image looks: opening",
    "qwenLook.task": "Qwen Image looks: task",
    "qwenOutfit.system": "Qwen Image outfits: opening",
    "qwenOutfit.task": "Qwen Image outfits: task",
    "descriptionsInEnglish": "Descriptions in English",
    "shot.cinematic": "Shot: cinematic",
    "shot.pov": "Shot: point of view",
    "shot.portrait": "Shot: portrait",
    "reference.head": "Edit last prompt: opening",
    "reference.tags": "Edit last prompt: tags",
    "reference.natural": "Edit last prompt: natural sentences",
    "inEnglish": "Image prompt in English",
    "tagsInEnglish": "Tags in English",
    "manualTask": "Task: draw the last message",
    "manualTaskWithExtras": "Task: draw the last message, with outfits and looks",
    "inlineHead": "Inline images: opening (older presets)",
    "inlineHeadSplit": "Inline images: opening (V11)",
    "inlineTail": "Inline images: closing line",
};
const imageV2Texts = (tree, prefix = "") => Object.entries(tree).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) return imageV2Texts(v, path);
    return [text(`imageV2.${path}`, "imagev2", IMAGE_V2_LABELS[path] || path, PLACE.image,
        path.startsWith("inline") ? "{{conditionalText}} and {{imageCount}} are filled in from the Images tab." : "",
        () => Array.isArray(v) ? v.join("\n") : v)];
});

const EDITABLE_TEXTS = [
    // V11 preset rules
    text("v11BlockRulesLead", "v11", "Block rules: opening line", PLACE.v11, "The line that opens <block_rules>.", () => BLOCK_RULES_LEAD),
    text("v11BlocksHead", "v11", "Blocks: opening line", PLACE.v11Turn, "The line before the <Blocks> skeleton in <turn_notes>.", () => BLOCKS_HEAD_SPLIT),
    text("v11ChoicesRules", "v11", "Choices rules", PLACE.v11, "Used while the Choices Block box above is not edited.", () => CHOICES_RULES),
    text("v11ChatterRules", "v11", "Inner Chatter rules", PLACE.v11, "Used while the NPC Inner Chatter box above is not edited.", () => CHATTER_RULES),
    text("v11ChatterLine", "v11", "Inner Chatter: line to fill in", PLACE.v11Turn, "The skeleton line in <Blocks>.", () => CHATTER_SKELETON),
    text("v11TrackerRules", "v11", "Story Tracker rules", PLACE.v11, "Used while the Story Tracker box above is not edited.", () => TRACKER_RULES),
    text("v11TrackerTemplate", "v11", "Story Tracker: lines to fill in", PLACE.v11Turn, "The skeleton lines in <Blocks>. Keep the labels: the story's answer is read by them.", () => TRACKER_SKELETON),
    text("v11DiceRulesPlayer", "v11", "Dice rules: player only", PLACE.v11, "Used while the Dice box is not edited and Dice is set to the player.", () => DICE_RULES_PLAYER),
    text("v11DiceRulesEveryone", "v11", "Dice rules: everyone", PLACE.v11, "Used while the Dice box is not edited and Dice is set to everyone.", () => DICE_RULES_EVERYONE),
    text("v11AddonDeath", "v11", "Death System", PLACE.v11, "Used while the Death System box is not edited.", () => ADDON_RULES_SPLIT.death),
    text("v11AddonCombat", "v11", "Combat System", PLACE.v11, "Used while the Combat System box is not edited.", () => ADDON_RULES_SPLIT.combat),
    text("v11AddonOnomato", "v11", "Onomatopoeia", PLACE.v11, "Used while the Onomatopoeia box is not edited, without styling.", () => ADDON_RULES_SPLIT.onomato),
    text("v11AddonOnomatoStyled", "v11", "Onomatopoeia (styled)", PLACE.v11, "Used while the Onomatopoeia box is not edited, with styling on.", () => ADDON_RULES_SPLIT.onomatoStyled),
    text("geminiJB", "v11", "Gemini line", "Sent while the Gemini JB add-on is on, where your preset has [[GeminiJB]].", "", () => GEMINI_JB),
    text("geminiCaret", "v11", "Gemini: ^ before every word", "Sent while the Gemini JB add-on is on, as the last line of the formatting section.", "The ^ are taken out of each reply as soon as it arrives.", () => GEMINI_CARET_LINE),
    text("v11NpcDossierRules", "v11", "NPC Bank: new characters", PLACE.v11, "{{template}} is the dossier form from the NPC Bank tab, {{persistenceRule}} the line about fields that never change.", () => NPC_DOSSIER_RULES),
    text("v11StorySettingsLead", "v11", "Story settings: opening line", PLACE.v11Turn, "The line that opens <story_settings>.", () => STORY_SETTINGS_PREAMBLE),
    text("v11FinalCheckHead", "v11", "Final check: opening line", PLACE.v11Turn, "The line that opens <final_check>.", () => FINAL_CHECK_HEAD),

    // Scene and names
    text("sceneRules", "scene", "Scene rules", PLACE.scene, "Chomusuke gets the same rules, worded for the latest exchange, when it writes the scene. Keep Here: and Remote: as they are: the answer is read by them.", () => SCENE_RULES),
    text("sceneTemplate", "scene", "Scene template", PLACE.scene, "The <Scene> lines to fill in.", () => SCENE_TEMPLATE),
    text("knownNamesLead", "scene", "Known names: opening line", PLACE.names, "The line above the list of names.", () => KNOWN_NAMES_LEAD),
    text("knownNamesTask", "scene", "Known names: Chomusuke's line", PLACE.chomusuke, "Told after the names when Chomusuke writes World State or blocks.", () => KNOWN_NAMES_TASK),
    text("blocksCheck", "scene", "Final check: blocks", PLACE.check, "When the turn has no <Scene>.", () => BLOCKS_CHECK),
    text("blocksCheckScene", "scene", "Final check: blocks with Scene", PLACE.check, "When <Scene> opens <Blocks>.", () => BLOCKS_CHECK_SCENE),

    // Custom blocks
    text("customChangesLine", "blocks", "Custom blocks: only when it changes", PLACE.custom, "Leads a block set to \"Only when it changes\".", () => CUSTOM_CHANGES_LINE),
    text("customFreshFieldsLine", "blocks", "Custom blocks: starts fresh", PLACE.custom, "The rule line of a field block set to \"Starts fresh\".", () => CUSTOM_FRESH_FIELDS_LINE),
    text("customLastNote", "blocks", "Custom blocks: last copy note", PLACE.custom, "Sits on top of a free-text block's last copy in Current Info.", () => CUSTOM_LAST_NOTE),

    // Author's Notebook
    text("notebookSetupRules", "notebook", "Setup rules", PLACE.notebook, "Asked while the notebook is empty. {{truths}} is \"two or three truths\" (from the number of truths in The Notebook tab), {{truth_form}} the truth form below.", () => notebookSetupText("{{truths}}", "{{truth_form}}")),
    text("notebookTruthForm", "notebook", "Truth form", PLACE.notebook, "How one truth is written. Also given to Chomusuke when it writes the setup. Keep the labels: the answer is read by them.", () => NOTEBOOK_TRUTH_FORM.join("\n")),
    text("notebookUpdateRules", "notebook", "Update rules", PLACE.notebook, "Asked once the notebook has truths. {{max}} is the number of truths.", () => notebookUpdateText(false, "{{max}}")),
    text("notebookUpdateRulesNewOnly", "notebook", "Update rules (Chomusuke writes the clues)", PLACE.notebook, "Asked when Chomusuke writes the clues, so the story only adds new truths. {{max}} is the number of truths.", () => notebookUpdateText(true, "{{max}}")),

    // Chomusuke
    text("worldClerkSystem", "chomusuke", "World State read: opening", PLACE.chomusuke, "Who Chomusuke is when it writes World State on its own. Its rules are the World State boxes under Output Blocks.", () => worldClerkSystem("")),
    text("blocksWorkerSystem", "chomusuke", "Blocks read: opening", PLACE.chomusuke, "Who Chomusuke is when it writes blocks on its own.", () => BLOCKS_WORKER_SYSTEM),
    text("blocksWorkerTask", "chomusuke", "Blocks read: task line", PLACE.chomusuke, "The line above the blocks it writes (also in the combined call).", () => BLOCKS_WORKER_TASK),
    text("notebookWorkerSystem", "chomusuke", "Notebook read: opening", PLACE.chomusuke, "Who Chomusuke is when it reads the notebook's clues.", () => NOTEBOOK_WORKER_SYSTEM),
    text("notebookClerkRules", "chomusuke", "Notebook read: rules", PLACE.chomusuke, "Also used in the combined call. Keep the line forms (Clue T1:, Learned T1:, Truth-:): the answer is read by them.", () => NOTEBOOK_CLERK_RULES),
    text("notebookSetupSystem", "chomusuke", "Notebook setup: opening", PLACE.chomusuke, "Who Chomusuke is when it writes the notebook's truths.", () => NOTEBOOK_SETUP_SYSTEM),
    text("notebookSetupClerkRules", "chomusuke", "Notebook setup: rules", PLACE.chomusuke, "{{truths}} is \"two or three truths\", {{truth_form}} the truth form (Author's Notebook group).", () => notebookSetupClerkText("{{truths}}", "{{truth_form}}")),
    text("combinedSystem", "chomusuke", "Combined call: opening", PLACE.chomusuke, "Your text replaces every form of it. {{jobs}} is what the call does this time (\"note what it changed in the world and write an image prompt…\").", () => COMBINED_SYSTEM_EDITABLE),
    text("combinedImageTask", "chomusuke", "Combined call: image task", PLACE.chomusuke, "The first line of the image task.", () => COMBINED_IMAGE_TASK),
    text("imageV2OutfitTask", "imagev2", "Outfit tags task", PLACE.chomusuke, "{{who}} is whose outfits.", () => V2_OUTFIT_TASK),
    text("imageV2LooksTask", "imagev2", "Looks task", PLACE.chomusuke, "{{names}} is the characters who need a look.", () => V2_LOOKS_TASK),

    // Image V2
    ...imageV2Texts(IMAGE_V2_BUILTIN),
];

// Where each text sits in each Universal .json (plan 025): Dev Mode draws it
// under that tag in the file's skeleton. The V11 file sends the rules up top
// in [[block_rules]] and the lines to fill in [[this_turn]]; the V10 file
// sends both inside [[blocks]]. No entry = not in the preset file (Chomusuke,
// Images), or not in that file.
const RULES = { v11: "[[block_rules]]", v10: "[[blocks]]" };
const LINES = { v11: "[[this_turn]]", v10: "[[blocks]]" };
export const SLOT_IN_TAG = {
    worldFullRules: RULES, worldUpdateRules: RULES, bondsRules: RULES, sheetRules: RULES,
    worldFullTemplate: LINES, worldUpdateTemplate: LINES,
    sceneRules: RULES, sceneTemplate: LINES,
    notebookSetupRules: RULES, notebookTruthForm: RULES, notebookUpdateRules: RULES, notebookUpdateRulesNewOnly: RULES,
    customChangesLine: LINES, customFreshFieldsLine: LINES,
    customLastNote: { v11: "[[infoblockcurrent]]", v10: "[[infoblockcurrent]]" },
    knownNamesLead: { v11: "[[infoblockcurrent]]", v10: "[[infoblockcurrent]]" },
    v11BlockRulesLead: { v11: "[[block_rules]]" },
    v11ChoicesRules: { v11: "[[block_rules]]" },
    v11ChatterRules: { v11: "[[block_rules]]" },
    v11TrackerRules: { v11: "[[block_rules]]" },
    v11BlocksHead: { v11: "[[this_turn]]" },
    v11ChatterLine: { v11: "[[this_turn]]" },
    v11TrackerTemplate: { v11: "[[this_turn]]" },
    v11DiceRulesPlayer: { v11: "[[dice_rules]]" },
    v11DiceRulesEveryone: { v11: "[[dice_rules]]" },
    v11AddonDeath: { v11: "[[addon_rules]]" },
    v11AddonCombat: { v11: "[[addon_rules]]" },
    v11AddonOnomato: { v11: "[[addon_rules]]" },
    v11AddonOnomatoStyled: { v11: "[[addon_rules]]" },
    v11NpcDossierRules: { v11: "[[npc_rules]]" },
    v11StorySettingsLead: { v11: "[[config]]" },
    // Dev Mode draws V11's [[reminder]] as its lines, so these sit with the checks.
    v11FinalCheckHead: { v11: "[[final_checks]]" },
    blocksCheck: { v11: "[[final_checks]]" },
    blocksCheckScene: { v11: "[[final_checks]]" },
    "imageV2.inlineHeadSplit": { v11: "[[img_rules]]" },
    "imageV2.inlineHead": { v10: "[[img1]]" },
    "imageV2.inlineTail": { v11: "[[img_rules]]", v10: "[[img1]]" },
};

/** The tag a text slot sits in for one .json ("v11" | "v10"), or null. */
export function meguminSlotInTag(slot, json) {
    const m = slot && slot.key ? SLOT_IN_TAG[slot.key] : null;
    return (m && m[json]) || null;
}

export const MEGUMIN_SLOT_REGISTRY = [
    // ── The engine's own voice ───────────────────────────────────────────────
    { key: "p1", trigger: "[[prompt1]]", structural: true, label: "Prompt 1", scope: "engine", group: "engine",
      hint: "The first thing the model reads. Sets the ground rules." },
    { key: "p2", trigger: "[[prompt2]]", structural: true, hidden: true, label: "Prompt 2", scope: "engine", group: "engine",
      hint: "Runs straight on from the opening rules." },
    { key: "p3", trigger: "[[prompt3]]", structural: true, label: "Prompt 3", scope: "engine", group: "engine",
      hint: "Closes the first system message." },
    { key: "p4", trigger: "[[prompt4]]", structural: true, label: "Prompt 4", scope: "engine", group: "engine",
      hint: "How the model is meant to write. Usually the longest section." },
    { key: "p5", trigger: "[[prompt5]]", structural: true, label: "Prompt 5", scope: "engine", group: "engine",
      hint: "How characters act and what the model may decide on its own." },
    { key: "p6", trigger: "[[prompt6]]", structural: true, label: "Prompt 6", scope: "engine", group: "engine",
      hint: "The last of the preset's own instructions." },
    { key: "main", trigger: "[[main]]", hidden: true, label: "Personality", scope: "auto", group: "engine",
      where: "Persona",
      hint: "Comes from the Persona tab. Blanked entirely on V6 and newer presets." },
    { key: "A1", trigger: "[[AI1]]", structural: true, hidden: true, label: "Model Acknowledgement 1", scope: "engine", group: "engine",
      advanced: true, hint: "A fake reply from the model, agreeing that it read the rules." },
    { key: "A2", trigger: "[[AI2]]", structural: true, hidden: true, label: "Model Acknowledgement 2", scope: "engine", group: "engine",
      advanced: true, hint: "The second fake acknowledgement." },
    { key: "contentRules", trigger: "[[content]]", label: "Content Rules", scope: "engine", group: "engine",
      hint: "What the story may show and how plainly. Only V11 has one; other presets send nothing here." },
    { key: "reminderChecks", trigger: "[[reminder_checks]]", label: "This Preset's Final Checks", scope: "engine", group: "engine",
      hint: "Checks only this preset adds to the final reminder, one per line. They are numbered for you." },

    // ── Reasoning ────────────────────────────────────────────────────────────
    { key: "cot", trigger: "[[COT]]", label: "Chain of Thought", scope: "engine", group: "reasoning",
      carrier: "think",
      picker: { label: "Load from a chain-of-thought", options: cotPicker("content") },
      hint: "The reasoning script the model works through before it writes. Preset-specific, because it is written to match the preset's own rules." },
    { key: "prefill", trigger: "[[prefill]]", label: "Prefill", scope: "engine", group: "reasoning",
      picker: { label: "Load from a chain-of-thought", options: cotPicker("prefill") },
      hint: "Words put into the model's mouth to start its reply." },
    { key: "think", trigger: "[[THINK]]", label: "Thinking Tags", scope: "shared", group: "reasoning",
      gate: GATE.think,
      hint: "The tags the reasoning is wrapped in. {Thinking} marks where the preset's Chain of Thought is dropped in — keep it, or the script has nowhere to go.",
      fallback: () => "<think>\n<think>\n<think>\n{Thinking}\n</think>" },

    // ── Shared fragments: one value, every engine ────────────────────────────
    { key: "death", trigger: "[[death]]", label: "Death System", scope: "shared", group: "systems",
      gate: GATE.addon("death"), hint: "What happens when a character should die.",
      fallback: () => addonText("death") },
    { key: "combat", trigger: "[[combat]]", label: "Combat System", scope: "shared", group: "systems",
      gate: GATE.addon("combat"), hint: "How fights are resolved.",
      fallback: () => addonText("combat") },
    { key: "html", trigger: "[[html]]", label: "Immersive HTML", scope: "shared", group: "systems",
      gate: GATE.addon("html"),
      hint: "Lets the model draw a screen, letter or sign as real HTML instead of describing it.",
      fallback: () => addonText("html") },
    { key: "dice", trigger: "[[dice]]", label: "Dice", scope: "shared", group: "systems",
      gate: GATE.dice,
      hint: "How the model must use the d20 rolls it is handed each turn. Keep the [[dice_rolls]] marker — this turn's numbers are dropped in there.",
      // Two add-ons share the [[dice]] anchor and are mutually exclusive, so the
      // default shown depends on which variant is switched on. That is why the
      // fallback takes the profile.
      fallback: p => addonText((p && (p.addons || []).includes("dice_all")) ? "dice_all" : "dice"),
      presets: [
          { label: "Player only (3 rolls)", value: () => addonText("dice") },
          { label: "Everyone (6 rolls)", value: () => addonText("dice_all") },
      ] },
    { key: "userControl", trigger: "[[user]]", label: "Never Write For {{user}}", scope: "shared", group: "systems",
      gate: GATE.notCoWriter,
      hint: "Sent on every preset except the Co-writer variants, which are built to write {{user}}. The last line of the final reminder. Older presets number that list by hand, so keep it written as a numbered line; on V11 the number is counted for you.",
      fallback: () => "5. The response does not speak, think, feel, or act for {{user}}, and it shows everything {{user}} reached for." },
    { key: "finalChecks", trigger: "[[final_checks]]", label: "Final Checks", scope: "shared", group: "systems",
      hint: "The checks at the top of the final reminder, one per line. They are numbered for you.",
      fallback: () => FINAL_CHECKS },
    { key: "direct", trigger: "[[Direct]]", label: "Direct Language", scope: "shared", group: "systems",
      gate: GATE.addon("direct"), hint: "Blunt anatomical wording instead of euphemism.",
      fallback: () => addonText("direct") },
    { key: "dialogueColor", trigger: "[[COLOR]]", label: "Dialogue Colours", scope: "shared", group: "format",
      gate: GATE.addon("color"), hint: "Gives each speaker their own colour.",
      fallback: () => addonText("color") },
    { key: "onomato", trigger: "[[onomato]]", label: "Onomatopoeia", scope: "shared", group: "format",
      gate: GATE.onomato, hint: "Asks for real sound words rather than descriptions of sound.",
      fallback: () => "- Narration must utilize onomatopoeia. Use precise, context-specific phonetic representations for physical interactions (e.g., the click of a latch, the thud of a heavy object, the soughing of wind) rather than abstract descriptions of sound." },
    { key: "dnratio", trigger: "[[DNRATIO]]", label: "Dialogue / Narration Ratio", scope: "shared", group: "format",
      gate: GATE.dnratio, hint: "How much of a reply should be speech versus description.",
      fallback: () => "Ratio: Maintain a balance of 50% Dialogue and 50% Narration." },
    { key: "banlist", trigger: "[[banlist]]", label: "Ban List (your additions)", scope: "shared", group: "format",
      hint: "Your banned phrases from the Banned Phrases tab, sent under the built-in list.",
      fallback: () => "" },
    { key: "banlistBuiltIn", trigger: "[[banlist_builtin]]", label: "Ban List (built-in)", scope: "shared", group: "format",
      gate: GATE.banBuiltIn,
      hint: "The phrases and habits the story never uses. Can be switched off in the Banned Phrases tab.",
      fallback: () => BUILTIN_BAN_LIST },
    { key: "formattingRules", trigger: "[[formatting_rules]]", label: "Formatting Rules", scope: "shared", group: "format",
      hint: "The lines under FORMATTING RULES: don't repeat the last two turns, and open each reply differently.",
      fallback: () => FORMATTING_RULES },

    // ── Shared fragments that happen to be output blocks ─────────────────────
    // The old World State block text. Nothing sends it any more (World State
    // writes its own rules, below), so it is hidden; the tag stays for the
    // leak guard.
    { key: "info", trigger: "[[infoblock]]", hidden: true, carrier: "blocks", label: "World State Block (old)", scope: "shared", group: "blocks",
      gate: GATE.block("info"), hint: "The scene board printed under each reply.",
      fallback: () => blockText("info") },

    // ── Rules built by the blocks themselves (no tag of their own in the preset).
    // The text is read where it is built (src/prompts/edits.js); the trigger is
    // only a name. {{tokens}} are filled from your settings when it is sent.
    { key: "worldFullRules", trigger: "[[world_full_rules]]", carrier: "blockRules", label: "World State: full scene rules",
      scope: "shared", group: "blocks", gate: GATE.world,
      hint: "Asked when the scene is written in full: the first reply, Rewrite next reply, or \"Full update each time\". Also given to Chomusuke when it writes World State. "
          + "{{threads}}, {{seeds}}, {{timers}} and {{offscreen}} are filled in from the Limits in the World State tab.",
      fallback: () => worldPromptDefault("bootstrap", "rules") },
    { key: "worldFullTemplate", trigger: "[[world_full_template]]", carrier: "blocks", label: "World State: full scene template",
      scope: "shared", group: "blocks", gate: GATE.world,
      hint: "The <World_State> lines to fill in when the scene is written in full. Keep the labels as they are (Time:, Loc:, Name.Outfit:…): the story's answer is read by them. "
          + "{{threads}}, {{seeds}}, {{timers}} and {{offscreen}} are filled in from the Limits.",
      fallback: () => worldPromptDefault("bootstrap", "template") },
    { key: "worldUpdateRules", trigger: "[[world_update_rules]]", carrier: "blockRules", label: "World Update rules",
      scope: "shared", group: "blocks", gate: GATE.world,
      hint: "Asked on the replies after the scene is on file: write only what changed. Also given to Chomusuke. Keep the line forms as they are (Name.Field:, Thread+:, Timer-:…): the answer is read by them. "
          + "{{threads}}, {{seeds}}, {{timers}} and {{offscreen}} are filled in from the Limits.",
      fallback: () => worldPromptDefault("update", "rules") },
    { key: "worldUpdateTemplate", trigger: "[[world_update_template]]", carrier: "blocks", label: "World Update template",
      scope: "shared", group: "blocks", gate: GATE.world,
      hint: "The <World_Update> block the story fills in.",
      fallback: () => worldPromptDefault("update", "template") },
    { key: "bondsRules", trigger: "[[bonds_rules]]", carrier: "blockRules", label: "Bonds rules",
      scope: "shared", group: "blocks", gate: GATE.stat("bonds", "Bonds"),
      hint: "How the story writes Bonds. The line to fill in comes from the fields in the Blocks tab. "
          + "{{start}} is filled with the starting values and {{meters}} with the meters' names, from those fields.",
      fallback: p => bondsRulesText(statFieldsOf(p, "bonds"), { tokens: true }) },
    { key: "sheetRules", trigger: "[[sheet_rules]]", carrier: "blockRules", label: "Character Sheet rules",
      scope: "shared", group: "blocks", gate: GATE.stat("sheet", "Character Sheet"),
      hint: "How the story writes {{user}}'s sheet. The lines to fill in come from the fields in the Blocks tab. "
          + "{{start}} is filled with the starting values and {{meters}} with the meters' names, from those fields.",
      fallback: p => sheetRulesText(statFieldsOf(p, "sheet"), { tokens: true }) },
    { key: "cyoa", trigger: "[[cyoa]]", carrier: "blocks", label: "Choices Block", scope: "shared", group: "blocks",
      gate: GATE.block("cyoa"), hint: "The numbered options offered at the end of a reply.",
      fallback: () => blockText("cyoa") },
    { key: "mvu", trigger: "[[MVU]]", label: "MVU Variables", scope: "shared", group: "blocks",
      gate: GATE.block("mvu"), hint: "The contract with the MVU extension.",
      fallback: () => blockText("mvu") },
    { key: "npc_inner_chatter", trigger: "[[npc_inner_chatter]]", carrier: "blocks", label: "NPC Inner Chatter",
      scope: "shared", group: "blocks", gate: GATE.chatter,
      hint: "What the NPCs are privately thinking.",
      fallback: () => blockText("npc_inner_chatter"),
      presets: [
          { label: "Default", value: () => blockText("npc_inner_chatter") },
          { label: "Simple", value: () => blockText("npc_inner_chatter_v2") },
      ] },
    { key: "storytracker", trigger: "[[storytracker]]", carrier: "blocks", label: "Story Tracker", scope: "shared", group: "blocks",
      gate: GATE.plan, hint: "Arc, chapter and secrets, printed for the Story Director.",
      fallback: () => "# at the very end of the response put this block:\n<Story_Tracker>\narc: The Arc that is now active.\nchapter: The chapter that is now active.\nEpisode: The episode that is now active.\nSecrets: Any secret that the user/{{user}} doesn't know.\n</Story_Tracker>" },

    // ── Plan 024: every other text the story model or Chomusuke is sent ──
    ...EDITABLE_TEXTS,

    // ── Computed from your settings. Overridable, but rarely worth it ────────
    { key: "language", trigger: "[[Language]]", label: "Language Rule", scope: "auto", group: "global",
      overridable: true, where: "Writing Style → Language & rules",
      hint: "Built from the language you picked on Writing Style → Language & rules." },
    { key: "pronouns", trigger: "[[pronouns]]", label: "Your Pronouns", scope: "auto", group: "global",
      overridable: true, where: "Writing Style → Language & rules",
      hint: "Built from the pronouns you picked on Writing Style → Language & rules." },
    { key: "count", trigger: "[[count]]", label: "Word Count", scope: "auto", group: "global",
      overridable: true, deprecated: true, where: "Preset & Thinking",
      hint: "Superseded by Length in Story settings. Always sent empty unless you override it here." },

    // ── Filled live by a feature. Nothing to edit ────────────────────────────
    { key: null, trigger: "[[config]]", label: "Story settings", scope: "auto", group: "live", where: "Preset & Thinking",
      hint: "The <config> block built from your Story settings choices." },
    { key: null, trigger: "[[infoblockcurrent]]", label: "Current World State", scope: "auto", group: "live", where: "Blocks",
      hint: "The current compiled World State context on file, injected right above <Blocks> when in delta update mode." },
    { key: null, trigger: "[[notebook]]", label: "Author's Notebook", scope: "auto", group: "live", where: "Blocks",
      hint: "How to keep the notebook's hidden truths. Empty while the notebook is off or paused." },
    { key: null, trigger: "[[blocks]]", label: "Output Blocks", scope: "auto", group: "live", where: "Blocks",
      hint: "The whole <Blocks> envelope, assembled from the blocks you switched on." },
    // Plan 017: a section and its header in one slot (src/engine/presetSections.js).
    // Made of the slots above, so edit those; these only put them together.
    { key: null, trigger: "[[thinking]]", label: "Thinking Steps", scope: "auto", group: "live", where: "Preset & Thinking",
      gate: GATE.think, hint: "The \"your thinking steps\" heading and the Thinking Tags. With thinking off, the heading goes too." },
    { key: null, trigger: "[[formatting]]", label: "Formatting Rules section", scope: "auto", group: "live", where: "Writing Style",
      hint: "The FORMATTING RULES heading with the ratio, colours, formatting rules, direct language and tags under it." },
    { key: null, trigger: "[[banned]]", label: "Ban List section", scope: "auto", group: "live", where: "Banned Phrases",
      hint: "The built-in list and your phrases together. Nothing is sent when both are off or empty." },
    { key: null, trigger: "[[reminder]]", label: "Final Reminder", scope: "auto", group: "live", where: "Preset & Thinking",
      hint: "The final checks, numbered: the shared ones, the ban list one while a ban list is sent, the preset's own, and Never Write For {{user}}." },
    // Plan 018: the V11 preset sends the rules once, up top, and only what is
    // new each turn at the end. Older presets use the combined slots above.
    { key: null, trigger: "[[block_rules]]", label: "Block Rules", scope: "auto", group: "live", where: "Blocks",
      hint: "How to fill World State and the Notebook, sent up top. The blocks to write this turn are in This Turn." },
    { key: null, trigger: "[[dice_rules]]", label: "Dice Rules", scope: "auto", group: "live", where: "Writing Style → Language & rules",
      gate: GATE.addon("dice"), hint: "The Dice rules without this turn's numbers. Edit them in Dice; the numbers are in This Turn." },
    { key: null, trigger: "[[img_rules]]", label: "Image Rules (top)", scope: "auto", group: "live", where: "Images",
      hint: "How to write an image tag, sent up top. This Turn says when one is due, with the characters in the scene." },
    { key: null, trigger: "[[npc_rules]]", label: "NPC Rules (top)", scope: "auto", group: "live", where: "NPC Bank",
      hint: "How to write a new character's dossier and update a known one, sent up top. Built from the NPC Bank's fields." },
    { key: null, trigger: "[[addon_rules]]", label: "Add-on Rules", scope: "auto", group: "live", where: "Writing Style → Language & rules",
      hint: "The add-ons you switched on (Death, Combat, Organic NPCs, Immersive HTML, Onomatopoeia), each in its own section, sent up top." },
    { key: null, trigger: "[[storyplan_rules]]", label: "Story Director: Unrestricted Content", scope: "auto", group: "live", where: "Story Director",
      gate: GATE.plan, hint: "The Story Director's unrestricted content rule, sent up top." },
    { key: null, trigger: "[[storyplan_now]]", label: "Story Director: Current Plan", scope: "auto", group: "live", where: "Story Director",
      gate: GATE.plan, hint: "The Story Director's current plan, sent after the chat." },
    { key: null, trigger: "[[this_turn]]", label: "This Turn", scope: "auto", group: "live", where: "Blocks",
      hint: "Only what is new this turn: the dice numbers, the image when one is due, and the blocks to write." },
    { key: null, trigger: "[[long-Memory]]", label: "Long-term Memory", scope: "auto", group: "live", where: "Memory",
      hint: "Archived summaries pulled from the vault for this turn." },
    { key: null, trigger: "[[Short-memory]]", label: "Short-term Memory", scope: "auto", group: "live", where: "Memory",
      hint: "Recent chat kept verbatim." },
    { key: null, trigger: "[[npc list]]", label: "NPC List", scope: "auto", group: "live", where: "NPC Bank",
      hint: "The NPCs judged relevant to the current scene." },
    { key: null, trigger: "[[npc_dossier]]", label: "NPC Dossier Rules", scope: "auto", group: "live", where: "NPC Bank",
      hint: "Instructions for keeping dossiers up to date. Not the dossiers themselves." },
    { key: null, trigger: "[[npc_events]]", label: "Organic NPCs & Events", scope: "auto", group: "live",
      where: "Writing Style → Language & rules", gate: GATE.addon("npc_events"),
      hint: "Stops new characters appearing out of nowhere." },
    { key: null, trigger: "[[storyplan]]", label: "Story Plan", scope: "auto", group: "live", where: "Story Director",
      gate: GATE.plan, hint: "The current directive from the Story Director." },
    { key: null, trigger: "[[img1]]", label: "Image Rules", scope: "auto", group: "live", where: "Images",
      hint: "Instructions for emitting image prompts." },
    { key: null, trigger: "[[aiprompt]]", label: "Narration Style", scope: "auto", group: "live",
      where: "Writing Style",
      hint: "Your writing style, wrapped differently depending on the preset generation." },
    { key: null, trigger: "[[style]]", label: "Writing Style (as written)", scope: "auto", group: "live",
      where: "Writing Style",
      hint: "The style you picked, exactly as written, for presets that say \"You narrate as [[style]]\". Falls back to V11 Default." },
    { key: null, trigger: "[[OOC]]", label: "OOC Protocol", scope: "auto", group: "live", where: "Persona",
      hint: "Out-of-character directives. Blanked on V8 and V9." },
    { key: null, trigger: "[[control]]", label: "Control Protocol", scope: "auto", group: "live", where: "Persona",
      hint: "Who may act for whom. Blanked on V8 and V9." },
];

// ── Derived views. Never hand-maintain these ────────────────────────────────

/**
 * Every trigger the injector must strip if nothing filled it. Replaces the
 * 60-string array that used to sit inline in injection.js.
 */
export function meguminAllSlotTriggers() {
    const out = new Set();
    MEGUMIN_SLOT_REGISTRY.forEach(s => out.add(s.trigger));
    // Numbered twins: some presets emit a block a second time further down.
    ["[[infoblock2]]", "[[cyoa2]]", "[[storytracker2]]", "[[npc_inner_chatter2]]",
        "[[npc_dossier2]]", "[[img2]]", "[[dice_rolls]]", "[[npc_updates]]", "[[order]]",
        "[[v9_lean_min]]", "[[v9_lean_max]]", "[[v9_full_min]]", "[[v9_full_max]]"]
        .forEach(t => out.add(t));
    // Removed add-ons whose tag older presets still carry.
    out.add("[[DN]]");
    // The bare-bracket spellings an older preset generation used.
    for (let i = 1; i <= 6; i++) out.add(`[prompt${i}]`);
    return [...out];
}

/**
 * The slots buildBaseDict's override pass may take from an engine or from the
 * shared bucket.
 *
 * Structural slots are excluded. p1..p6 and AI1/AI2 are written a few lines
 * earlier by hand, and that code does more than a plain assignment: the p1..p6
 * loop also fills the bare-bracket twin [prompt1] that older presets use, and
 * it writes even when the value is empty so an unused tag still gets blanked.
 * Running them through here as well would be a redundant second write, which is
 * exactly the kind of "two places set the same thing" this registry exists to
 * remove.
 */
export function meguminOverridableSlots() {
    return MEGUMIN_SLOT_REGISTRY.filter(s =>
        s.key && !s.structural && (s.scope !== "auto" || s.overridable));
}

/**
 * The add-ons: the slots Dev Mode lets you edit on their own, independently of
 * any engine. Shared fragments plus the handful of computed slots that accept
 * an override.
 *
 * Hidden slots are excluded. [[prompt2]] and [[main]] are used by exactly one
 * generation -- the V4/V5 engines flagged devLegacy -- and Dev Mode no longer
 * offers those for editing, so drawing their slots would be drawing controls
 * that can never apply to anything you can open. They stay in the registry
 * regardless, because the preset still contains both tags and the injector's
 * leak guard is derived from this same list.
 */
export function meguminAddonSlots() {
    return MEGUMIN_SLOT_REGISTRY.filter(s =>
        !s.hidden && (s.scope === "shared" || (s.scope === "auto" && s.overridable)));
}

/** The slots an engine owns and Dev Mode draws inline. */
export function meguminEngineSlots() {
    return MEGUMIN_SLOT_REGISTRY.filter(s => !s.hidden && s.scope === "engine");
}

/** Engines Dev Mode offers as a starting point. */
export function meguminIsDevEditableMode(mode) {
    return !!mode && mode.devLegacy !== true;
}

export function meguminSlotByTrigger(trigger) {
    return MEGUMIN_SLOT_REGISTRY.find(s => s.trigger === trigger) || null;
}

export function meguminSlotByKey(key) {
    return MEGUMIN_SLOT_REGISTRY.find(s => s.key === key) || null;
}

/**
 * Is this slot's toggle currently on? Slots with no gate are always live.
 * A throwing gate reports live: a broken predicate must not make the editor
 * claim a slot is dead when the engine would happily use it.
 */
export function meguminSlotIsLive(slot, profile) {
    if (!slot || !slot.gate || !profile) return true;
    try { return !!slot.gate.test(profile); } catch { return true; }
}

/**
 * Which slot a custom module hangs off.
 *
 * Modules used to be nailed to p3, p5 and p6, because those were the only
 * positions the old editor drew an insert point at. They can now attach to any
 * slot, so the stored value is a full trigger. Older engines stored "p3", and
 * they keep working: anything that is not already bracketed is read as the old
 * spelling. buildBaseDict and the editor both come here rather than each
 * rebuilding the string, which is how the two used to drift.
 */
export function meguminModuleTrigger(attachPoint) {
    if (!attachPoint) return null;
    if (attachPoint.startsWith("[[")) return attachPoint;
    const n = String(attachPoint).replace(/^p/, "");
    return `[[prompt${n}]]`;
}

export const SLOT_GROUPS = [
    { id: "engine", label: "The Preset's Own Rules", hint: "Belongs to this preset. Editing means saving your own copy." },
    { id: "reasoning", label: "Reasoning" },
    { id: "systems", label: "Systems" },
    { id: "format", label: "Formatting" },
    { id: "blocks", label: "Output Blocks" },
    { id: "v11", label: "V11 Preset Rules", hint: "What a V11 preset sends in place of the boxes above while those are not edited." },
    { id: "scene", label: "Scene & Names" },
    { id: "notebook", label: "Author's Notebook" },
    { id: "chomusuke", label: "Chomusuke" },
    { id: "imagev2", label: "Images (V2)" },
    { id: "global", label: "Built From Your Settings" },
    { id: "live", label: "Filled In Automatically" },
];
