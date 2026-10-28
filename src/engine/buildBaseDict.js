// ────────────────────────────────────────────────────────────────────────────
// Assembling the placeholder dictionary the preset is filled from.
//
// The top of the graph: it reads from every feature — blocks, story config,
// NPC, memory — and nothing reads from it except the injector and the token
// counter. That is why it moved last rather than first: extracting it early
// would have made it import from index.js instead of from the features.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, extension_settings, substituteParams } from "../st.js";
import { extensionName } from "../core/constants.js";
import { localProfile } from "../core/state.js";
import { isV7Engine, isV8Engine, isModernEngine, engineUsesRenderLimits, isCoWriterEngine, engineKeepsNotebook } from "../core/engines.js";
import {
    activeNpcImages, pushActiveNpcImage, clearActiveNpcImages,
} from "../core/activeRequests.js";
import { DEFAULT_PROMPTS } from "../prompts/index.js";
import { hardcodedLogic } from "../../data/database.js";
import { applyEnhancedDialogue } from "../../data/modes/v10.js";
import { blocksEnvelopeParts, buildBlocksEnvelope, blockRulesText, blocksSkeletonSplit } from "../features/blocks/registry.js";
import { buildConfigBlock } from "../features/storyconfig/config.js";
import { npcBuildTextFromData } from "../features/npc/data.js";
import { imageInjectionNpcTags, imageV2InlineInstruction, imageV2InlineSplit, imageViaChomusuke } from "../features/imagegen/index.js";
import { npcBuildDossierPrompt, npcBuildUpdatePrompt, npcBuildDossierPromptSplit, npcBuildUpdatePromptSplit } from "../features/npc/fields.js";
import { memGetCachedKeywords } from "../features/memory/keywords.js";
import { memGetRelevantVaultEntries } from "../features/memory/index.js";
import { meguminRollD20s } from "../utils/dice.js";
import { meguminOverridableSlots, meguminSlotIsLive, meguminModuleTrigger, meguminSlotByTrigger } from "../../data/slots.js";
import { thinkingSection, formattingSection, bannedSection, reminderSection, thisTurnSection } from "./presetSections.js";
import { DICE_ROLLS_POINTER, IMAGE_ASK_OLD, IMAGE_ASK_NEW, diceTurnLine, imageTurnLine } from "../prompts/presetFrame.js";
import {
    DICE_RULES_PLAYER, DICE_RULES_EVERYONE, wrapImageRules, wrapNpcRules, npcKnownNames,
    ADDON_RULES_SPLIT, wrapAddon, sameText, wrapRepetition, languageLine, BAN_ADDITIONS,
} from "../prompts/v11Rules.js";
import { V11_BAN_LIST, SHORT_BAN_LIST } from "../../data/modes/v11taina.js";
import { resolveSlot, getSharedFragment } from "../core/sharedFragments.js";
import { worldPromptBlock, statsPromptParts, notebookPromptBlock, notebookCurrentPhase } from "../state/index.js";
import { NOTEBOOK_CRAFT } from "../prompts/notebook.js";
import { meguminCleanChatHistoryText } from "./chatText.js";

export function buildBaseDict(isTokenCount = false) {
    const dict = {};
    if (!localProfile) return dict;

    const allAvailableModes = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])];
    const activeEngine = allAvailableModes.find(m => m.id === localProfile.mode);
    const isV7 = isV7Engine(activeEngine);
    const isV8 = isV8Engine(activeEngine);
    // Everything V8/V9 does, V10 does too. The one exception is the Lean/Full render
    // split below, which asks engineUsesRenderLimits() instead.
    const isModern = isModernEngine(activeEngine);
    // Plan 018: V11 Тайна's words around the turn. "v11" or undefined.
    const frame = activeEngine && activeEngine.turnFrame === "v11" ? "v11" : undefined;

    if (engineUsesRenderLimits(activeEngine)) {
        const v9l = localProfile.v9Limits || {};
        dict["[[v9_lean_min]]"] = String(v9l.leanMin || 300);
        dict["[[v9_lean_max]]"] = String(v9l.leanMax || 400);
        dict["[[v9_full_min]]"] = String(v9l.fullMin || 700);
        dict["[[v9_full_max]]"] = String(v9l.fullMax || 1200);
        
        // Strip normal count entirely just in case
        dict["[[count]]"] = "";
    } else {
        dict["[[v9_lean_min]]"] = "";
        dict["[[v9_lean_max]]"] = "";
        dict["[[v9_full_min]]"] = "";
        dict["[[v9_full_max]]"] = "";
    }

    // 1. GLOBAL DEFAULTS (Language, Pronouns, Word Count)
    const targetLang = (localProfile.userLanguage && localProfile.userLanguage.trim() !== "")
        ? localProfile.userLanguage.toUpperCase()
        : "ENGLISH";
    // V11 Тайна: after a blank line, as in its versions (the preset has one newline there).
    dict["[[Language]]"] = frame
        ? "\n" + languageLine(targetLang)
        : `[LANGUAGE RULE]\nALL OUTPUT EXCEPT THINKING MUST BE IN ${targetLang} ONLY.`;

    if (localProfile.userPronouns === "male") dict["[[pronouns]]"] = `{{user}} is male. Always portray and address him as such.`;
    else if (localProfile.userPronouns === "female") dict["[[pronouns]]"] = `{{user}} is female. Always portray and address her as such.`;

    // The legacy word count is gone — length now lives in the Story Config block.
    // The tag is still emitted as empty so any preset that still carries it gets it stripped.
    dict["[[count]]"] = "";

    // Story Config (<config> block). Empty when the config is off or every field is on Default.
    dict["[[config]]"] = buildConfigBlock(localProfile.storyConfig, { frame });
    // V11 Тайна: <repetition> rides in the same message, after the settings.
    if (frame) dict["[[config]]"] = [dict["[[config]]"], wrapRepetition(activeEngine.repetition)].filter(Boolean).join("\n\n");

    // 2. STANDARD STAGE SELECTIONS (Stage 2, 4, 5, 6)

    // Personality (Stage 2) - Will be overwritten later if Custom Engine is active
    const pData = hardcodedLogic.personalities.find(p => p.id === localProfile.personality);
    dict["[[main]]"] = pData ? pData.content : "";
    dict["[[AI1]]"] = "Understood."; // Default
    dict["[[AI2]]"] = "Understood."; // Default

    if (localProfile.personality === "megumin") {
        dict["[[AI1]]"] = "Fine i read the rules.";
        dict["[[AI2]]"] = "OK i Understnd it.";
    }

    // Standard Toggles & Addons
    if (localProfile.toggles.ooc) dict["[[OOC]]"] = hardcodedLogic.toggles.ooc.content;
    if (localProfile.toggles.control) dict["[[control]]"] = hardcodedLogic.toggles.control.content;
    // POV moved out of the style library and into the Story Config block.
    const povInjectionStr = "";

    if (localProfile.mode === "v7.5") {
        let narratorPersona = localProfile.aiRule ? localProfile.aiRule : "Adopt the narration of an unseen, witty observer who is vividly present in the scene. The narrator has a distinct personality—dry, occasionally judgmental, quietly amused, or sharply critical. Feel free to throw subtle shade at terrible decisions, point out the absurdity of a situation, or comment on the scene's chaos with a bit of comedic flair.";
        
        dict["[[aiprompt]]"] = `<Narration_style>\n narrator_persona: "${povInjectionStr}${narratorPersona}"\n quarantine_rule: "CRITICAL: This opinionated voice applies STRICTLY and EXCLUSIVELY to the narration. It MUST NOT bleed into <NPC_dialogue>. NPCs do not share the narrator's wit or perspective; their dialogue remains entirely bound by their own demographics, stress levels, and individual flaws."\n proportional_prose: "Match narrative intensity to the event. A spilled coffee is just a minor annoyance, not a catalyst for dramatic prose. Zero purple prose. Use grounded metaphors sparingly to anchor a scene, not distract from it."\n</Narration_style>`;
    } else if (localProfile.aiRule) {
        if (isV7 && localProfile.activeStyleId !== "dir_v7" && localProfile.activeStyleId !== "dir_v7_core" && localProfile.activeStyleId !== "dir_v7_gentle") {
            dict["[[aiprompt]]"] = `<narrative_style>\n voice: ${povInjectionStr}${localProfile.aiRule}\n  pacing: "Unhurried where it should be. A quiet moment can take a paragraph. A violent one can take a sentence. Match the rhythm to the content."\n  length_directive: "Typical outputs should run 3–6 substantial paragraphs, scaling with scene density. Lean toward the higher end during rich, atmospheric, or multi-character scenes. Go shorter — even a single paragraph — only when the moment genuinely demands economy: a held breath, a door closing, a line that hits harder alone. Never pad, never rush."\n</narrative_style>`;
        } else {
            dict["[[aiprompt]]"] = povInjectionStr + localProfile.aiRule;
        }
    }
    // [[style]] (plan 018): the style you picked, as written, for a preset that
    // carries its own text ("You narrate as [[style]]"). Unlike [[aiprompt]] it
    // is never wiped, and with no style picked it falls back to V11 Default.
    dict["[[style]]"] = String(localProfile.aiRule || "").trim()
        || (hardcodedLogic.directStyles.find(s => s.id === "dir_v11") || {}).rule || "";
    localProfile.addons.forEach(aId => {
        const item = hardcodedLogic.addons.find(a => a.id === aId);
        if (item) dict[item.trigger] = item.content;
    });


    // Stage 5 Defaults (Format Blocks)
    localProfile.blocks.forEach(bId => {
        if (bId === "summary") return;
        // The UI handles the warning, so we allow the injection anyway:
        // if (bId === "info" && localProfile.blocks.includes("mvu")) return;
        // if (bId === "summary" && localProfile.memoryCore && localProfile.memoryCore.enabled) return;

        const item = hardcodedLogic.blocks.find(b => b.id === bId);
        if (item) dict[item.trigger] = item.content;
    });

    // Stage 6 Defaults (CoT Framework & Language)
    const modData = hardcodedLogic.models.find(m => m.id === localProfile.model);
    if (localProfile.cotEnabled !== false && modData) {
        dict["[[COT]]"] = modData.content;
        if (modData.prefill) dict["[[prefill]]"] = modData.prefill;
    } else {
        dict["[[COT]]"] = "";
        dict["[[prefill]]"] = "";
    }

    if (localProfile.dnRatio && localProfile.dnRatio.enabled) {
        const d = localProfile.dnRatio.dialogue;
        const n = 100 - d;
        dict["[[DNRATIO]]"] = `- Ratio: Maintain a balance of ${d}% Dialogue and ${n}% Narration.`;
    } else {
        dict["[[DNRATIO]]"] = "";
    }

    let onoBuiltin = "";
    if (localProfile.onomatopoeia && localProfile.onomatopoeia.enabled) {
        let onoRule = `- Narration must utilize onomatopoeia. Use precise, context-specific phonetic representations for physical interactions (e.g., the click of a latch, the thud of a heavy object, the soughing of wind) rather than abstract descriptions of sound.`;
        if (localProfile.onomatopoeia.useStyling) {
            onoRule += `\nAll onomatopoeic words must animated and colored using HTML and CSS. The selected style tag and color must objectively correspond to the physical nature or movement of the sound produced; for example, a repetitive friction sound such as "shush-shush" must utilize a sliding animation tag to represent the physical action.`;
        }
        onoBuiltin = onoRule;
        dict["[[onomato]]"] = onoRule;
    } else {
        dict["[[onomato]]"] = "";
    }

    // MVU Logic
    if (localProfile.blocks.includes("mvu")) {
        let baseMvu = hardcodedLogic.blocks.find(b => b.id === "mvu").content;
        // Length is a Story Config field now, so the MVU block never carries a word count of its own.
        dict["[[MVU]]"] = baseMvu.replace("[[count]]", "");
    } else {
        dict["[[MVU]]"] = "";
    }

    // 3. ENGINE OVERRIDES (The "Superior" Layer)
    // This part runs last so it can overwrite standard Stage choices
    const isCustom = activeEngine && !hardcodedLogic.modes.find(x => x.id === activeEngine.id);

    if (activeEngine) {
        // Map p1-p6
        //
        // Enhanced Dialogue is applied here rather than at the engine definition,
        // because this is the one place the engine's prompt text is read — the
        // token counter comes through the same function, so the count and the
        // prompt can never disagree about which dialogue section is in play.
        //
        // The swap is keyed on the engine's own id, so a clone gets its own
        // setting rather than inheriting the original's, and it is a no-op on any
        // engine whose prompts carry no <dialogue> tag.
        const enhanced = Boolean(localProfile.enhancedDialogue
            && localProfile.enhancedDialogue[activeEngine.id]);
        for (let i = 1; i <= 6; i++) {
            let val = activeEngine[`p${i}`] || "";
            if (enhanced) val = applyEnhancedDialogue(val);
            dict[`[[prompt${i}]]`] = val;
            dict[`[prompt${i}]`] = val;
        }

        // Custom Engines kill [[main]] personality ONLY if they are truly built from scratch
        if (isCustom && activeEngine.isCoreClone !== true) {
            dict["[[main]]"] = "";
        }

        // Engine-specific AI Prefills (If defined in the engine)
        if (activeEngine.A1) dict["[[AI1]]"] = activeEngine.A1;
        if (activeEngine.A2) dict["[[AI2]]"] = activeEngine.A2;

        // [[user]] -- the rule telling the model to keep its hands off {{user}}.
        //
        // Written here rather than by the add-on loop because it is not an add-on:
        // there is no switch for it, it applies to every engine except the
        // Co-writer variants, and those are precisely the engines built to write
        // {{user}}. Sending it to a Co-writer would have one prompt argue with
        // itself, so the slot is blanked instead of skipped -- an unwritten tag
        // would survive as a literal "[[user]]" if the leak guard ever missed it.
        //
        // It sits immediately above the override pass so a Dev Mode edit of the
        // shared fragment still wins, exactly like every other shared slot.
        dict["[[user]]"] = isCoWriterEngine(activeEngine)
            ? ""
            : "5. The response does not speak, think, feel, or act for {{user}}, and it shows everything {{user}} reached for.";

        // Slot overrides, driven by MEGUMIN_SLOT_REGISTRY.
        //
        // This used to be a hand-written overrides[] array duplicating the list
        // of editor boxes in devmode.js. Every placeholder now declares itself
        // once in data/slots.js, including the condition that gates it, so the
        // editor and the engine cannot disagree about which slots exist or when
        // they apply.
        //
        // Resolution is engine → shared → built-in (see core/sharedFragments).
        // "built-in" is deliberately NOT written back: the code above already
        // put the shipped default in the dictionary, and rewriting it here
        // would change nothing except add a second place for it to go wrong.
        meguminOverridableSlots().forEach(slot => {
            if (!meguminSlotIsLive(slot, localProfile)) return;
            const { value, source } = resolveSlot(slot, activeEngine);
            if (source === "builtin") return;
            dict[slot.trigger] = value;
        });


        // Custom Toggles Appender
        //
        // The target used to be rebuilt here as "[[prompt" + n + "]]", which is
        // why modules could only ever attach to p3/p5/p6. meguminModuleTrigger
        // owns that spelling now and accepts a full trigger, so a module can
        // hang off any slot in the document while old engines storing "p3"
        // keep resolving exactly as before.
        if (activeEngine.customToggles) {
            activeEngine.customToggles.forEach(ct => {
                if (!localProfile.toggles[ct.id]) return;
                const targetKey = meguminModuleTrigger(ct.attachPoint);
                if (targetKey && dict[targetKey] !== undefined) {
                    dict[targetKey] += `\n\n${ct.content}`;
                }
            });
        }

        // V7 Dynamic Stripping
        if (isV7) {
            if (!localProfile.toggles.v7_ooc && dict["[[prompt1]]"]) {
                dict["[[prompt1]]"] = dict["[[prompt1]]"].replace(/<ooc_protocol>[\s\S]*?<\/ooc_protocol>/g, "");
            }
            if (dict["[[prompt4]]"]) {
                if (!localProfile.toggles.v7_pcsolo) {
                    dict["[[prompt4]]"] = dict["[[prompt4]]"].replace(/<pc_solo_physicality[\s\S]*?<\/pc_solo_physicality>/g, "");
                }
                if (!localProfile.toggles.v7_culture) {
                    dict["[[prompt4]]"] = dict["[[prompt4]]"].replace(/<cultural_anchoring>[\s\S]*?<\/cultural_anchoring>/g, "");
                }
                if (!localProfile.toggles.v7_scene) {
                    dict["[[prompt4]]"] = dict["[[prompt4]]"].replace(/<scene_choreography>[\s\S]*?<\/scene_choreography>/g, "");
                }
                if (!localProfile.toggles.v7_intro) {
                    dict["[[prompt4]]"] = dict["[[prompt4]]"].replace(/\s*introduction_protocol:\s*"[^"]*"/g, "");
                }
            }
        }
        // V8/V9 Dynamic Injection & Stripping
        if (isModern) {
            // 1. Inject [[aiprompt]] directly into the engine prompts (like p6) where the tag exists
            // V11 Тайна's text always names its narrator: V11 Default when no style is picked.
            const aiPromptVal = dict["[[aiprompt]]"] || (frame ? dict["[[style]]"] : "") || "";
            for (let i = 1; i <= 6; i++) {
                if (dict[`[[prompt${i}]]`] && dict[`[[prompt${i}]]`].includes("[[aiprompt]]")) {
                    dict[`[[prompt${i}]]`] = dict[`[[prompt${i}]]`].split("[[aiprompt]]").join(aiPromptVal);
                }
            }
            // 2. Wipe [[aiprompt]] from the dictionary so it gets erased from the main ST Preset!
            dict["[[aiprompt]]"] = "";
        }
    }

    // Dice numbers are filled in AFTER the override pass, not before.
    // [[dice]] is an editable add-on now, so a reader can rewrite the dice
    // rules and keep the [[dice_rolls]] marker. Rolling first and
    // overriding second would replace the filled text with their unfilled
    // copy, and the marker would then be stripped by the injector's leak
    // guard -- the rules would arrive with the numbers silently missing.
    // The dice add-on ships with a marker where this turn's numbers go, and it
    // is filled in HERE rather than by a second dict entry. A nested trigger
    // would work only because Object.entries walks the dict in insertion order,
    // so [[dice]] happens to expand before [[dice_rolls]] is searched for — a
    // correctness that depends on the order two unrelated lines were written in.
    // One explicit replacement cannot be broken by reordering anything.
    //
    // Fresh numbers every build, so a swipe re-rolls the turn rather than
    // rewriting the prose around a die that already landed.
    // Any add-on that declares a roll count gets this turn's numbers. Written as
    // a loop over what the add-ons ask for rather than a branch per add-on: the
    // player-only and everyone variants want three and six, and a third variant
    // would otherwise mean editing the engine to add a number.
    //
    // Plan 018: the V11 preset sends the rules up top as [[dice_rules]], the
    // numbers pointed to in <turn_notes>, and the same numbers on their own line.
    let diceRollsLine = "";
    dict["[[dice_rules]]"] = "";
    (localProfile.addons || []).forEach(aId => {
        const item = hardcodedLogic.addons.find(a => a.id === aId);
        if (!item || !item.rolls || !dict[item.trigger]) return;
        const rolls = meguminRollD20s(item.rolls);
        // The V11 wording while the rules are the built-in ones; your own
        // rules are kept, pointed at <turn_notes>.
        dict["[[dice_rules]]"] = sameText(dict[item.trigger], item.content)
            ? (aId === "dice_all" ? DICE_RULES_EVERYONE : DICE_RULES_PLAYER)
            : dict[item.trigger].replace("[[dice_rolls]]", DICE_ROLLS_POINTER);
        diceRollsLine = diceTurnLine(rolls);
        dict[item.trigger] = dict[item.trigger].replace("[[dice_rolls]]", rolls.join(", "));
    });

    // Wipe main persona for V6, V7, V8, and V9
    if (localProfile.mode.includes("v6-dream-team") || isV7 || isModern) {
        dict["[[main]]"] = "";
    }

    // Wipe Persona & Toggle tags entirely for V8, V9 and V10
    if (isModern) {
        dict["[[OOC]]"] = "";
        dict["[[control]]"] = "";
        dict["[[AI1]]"] = "";
        dict["[[AI2]]"] = "";
    }

    // NEW: Inject Thinking Effort to the absolute top of whatever [[COT]] is currently active
    // Not for a Thinking Cap: it sets its own length, and a word count makes the
    // models it is for count and redraft.
    let effort = localProfile.thinkEffort || "unspecified";
    const isCap = /^cot-.+-cap-/.test(localProfile.model || "");
    if (effort !== "unspecified" && dict["[[COT]]"] && !isCap) {
        let words = effort === "custom" ? (localProfile.customThinkEffort || "100") : effort;
        dict["[[COT]]"] = `Your Thinking must not be more than ${words} words.\n\n` + dict["[[COT]]"];
    }

    // [[THINK]] macro.
    //
    // [[COT]] never travels under its own tag. The reasoning script is wrapped
    // in think tags and delivered inside [[THINK]], which is the tag the preset
    // actually carries; [[COT]] is then blanked so it is not sent twice.
    //
    // The wrapper is the Thinking Tags add-on and {Thinking} marks where the
    // script goes. This used to be two hardcoded template strings, which meant
    // an edited wrapper was silently discarded: the override pass runs far
    // above, and this line overwrote whatever it had put there. The add-on
    // could be edited and saved and never did anything.
    if (localProfile.cotEnabled !== false && dict["[[COT]]"]) {
        const defaultWrapper = localProfile.thinkingV2
            ? "<think>\n<think>\n<think>\n{Thinking}\n</think>"
            : "<think>\n{Thinking}\n</think>";

        let wrapper = (dict["[[THINK]]"] && dict["[[THINK]]"].trim() !== "")
            ? dict["[[THINK]]"]
            : defaultWrapper;

        // A wrapper edited down to just the tags still has to receive the
        // script. Appending is better than dropping it on the floor, which
        // would look exactly like the CoT setting having no effect.
        if (!wrapper.includes("{Thinking}")) wrapper += "\n{Thinking}";

        dict["[[THINK]]"] = wrapper.split("{Thinking}").join(dict["[[COT]]"]);
        dict["[[COT]]"] = "";
    } else {
        dict["[[THINK]]"] = "";
    }

    // Story Planner Injection
    if (localProfile.storyPlan && localProfile.storyPlan.enabled) {
        const planText = localProfile.storyPlan.currentPlan;
        const spCustom = localProfile.storyPlan.customPromptsEnabled ? localProfile.storyPlan.customPrompts : null;
        let unrestricted = "";
        let plan = "";

        if (localProfile.storyPlan.unrestrictedContent) {
            unrestricted = (spCustom && spCustom.unrestrictedBlock) || DEFAULT_PROMPTS.storyPlan.unrestrictedBlock;
        }

        if (planText && planText.trim() !== "") {
            const template = (spCustom && spCustom.injectionTemplate) || DEFAULT_PROMPTS.storyPlan.injectionTemplate;
            plan = template.replace('{{planText}}', planText);
        }

        dict["[[storyplan]]"] = [unrestricted, plan].filter(Boolean).join("\n\n").trim();
        // Plan 018: the V11 preset sends the fixed rule up top and the plan,
        // which changes, after the chat.
        dict["[[storyplan_rules]]"] = unrestricted.trim();
        dict["[[storyplan_now]]"] = plan.trim();

        // The refined tracker block you asked for
        const trackerTemplate = (spCustom && spCustom.trackerTemplate) || DEFAULT_PROMPTS.storyPlan.trackerTemplate;
        dict["[[storytracker]]"] = trackerTemplate;
    } else {
        dict["[[storyplan]]"] = "";
        dict["[[storyplan_rules]]"] = "";
        dict["[[storyplan_now]]"] = "";
        dict["[[storytracker]]"] = "";
    }

    // 4. FINAL INJECTIONS (Banlist & Image Gen)
    if (localProfile.banList && localProfile.banList.length > 0) {
        const banStr = localProfile.banList.map(b => `- ${b}`).join("\n");
        const banCustom = localProfile.banListCustomPromptsEnabled ? localProfile.banListCustomPrompts : null;
        let template = (banCustom && banCustom.injectionTemplate) || DEFAULT_PROMPTS.banList.injectionTemplate;
        // V11 Тайна: no old-style header inside its <banlist>, unless you wrote your own.
        if (frame && sameText(template, DEFAULT_PROMPTS.banList.injectionTemplate)) template = BAN_ADDITIONS;
        dict["[[banlist]]"] = template.replace('{{banItems}}', banStr);
    } else {
        dict["[[banlist]]"] = "";
    }

    // Plan 018: the V11 preset's image rules go up top whenever the story model
    // writes the images ([[img_rules]]), and <turn_notes> asks on the turns one
    // is due (imageTurn).
    dict["[[img_rules]]"] = "";
    let imageTurn = "";
    if (localProfile.imageGen && localProfile.imageGen.enabled) {
        const ig = localProfile.imageGen;
        let shouldInject = false;
        let conditionalText = "";
        const mode = ig.triggerMode || "always";

        if (mode === "always") shouldInject = true;
        else if (mode === "frequency") {
            const chat = getContext().chat || [];
            const aiMsgCount = chat.filter(m => !m.is_user && !m.is_system).length;
            const freq = parseInt(ig.autoGenFreq) || 1;
            if ((aiMsgCount + 1) % freq === 0) shouldInject = true;
        } else if (mode === "conditional") {
            shouldInject = true;
            conditionalText = "CRITICAL INSTRUCTION: ONLY output the <img prompt=\"...\"> tag if the character is explicitly taking a photo, sending a picture, or sharing an image in this exact moment. If not, do NOT output the image tags at all.\n\n";
        }

        // Chomusuke writes the automatic images after the reply (imagegen/auto.js),
        // so the story model is not asked for an <img> tag at all.
        if (imageViaChomusuke()) shouldInject = false;
        const storyModelDraws = ["always", "frequency", "conditional"].includes(mode) && !imageViaChomusuke();

        if (shouldInject || storyModelDraws) {
            const customIg = localProfile.imageGen.customPromptsEnabled ? (localProfile.imageGen.customPrompts || {}) : {};
            const defIg = DEFAULT_PROMPTS.imageGen;
            
            const tmpl = ig.promptTemplate || "illus_cinematic";
            const map = {
                "illus_pov": ["rulesIllusPov", "examplesIllusPov"],
                "sdxl_pov": ["rulesSdxlPov", "examplesSdxlPov"],
                "illus_cinematic": ["rulesIllusCinematic", "examplesIllusCinematic"],
                "sdxl_cinematic": ["rulesSdxlCinematic", "examplesSdxlCinematic"],
                "illus_portrait": ["rulesIllusPortrait", "examplesIllusPortrait"],
                "sdxl_portrait": ["rulesSdxlPortrait", "examplesSdxlPortrait"]
            };

            let rules = "", examples = "";
            const keys = map[tmpl];
            if (keys) {
                rules = customIg[keys[0]] || defIg[keys[0]];
                examples = customIg[keys[1]] || defIg[keys[1]];
            }

            if (!ig.includeExamples) examples = "";

            const template = customIg.injectionTemplate || defIg.injectionTemplate;
            let extraSection = ig.promptExtra ? `Extra Instructions: ${ig.promptExtra}` : "";
            let directLangStr = ig.directLanguage ? "**DIRECT LANGUAGE:** Use exact Booru tags only. \"naked\" not \"wearing nothing.\" \"erection\" not \"visible arousal.\"\n\n**NSFW TAG REFERENCE (use when scene is explicit):**\nBody: naked, nude, topless, exposed nipples, small breasts, medium breasts, large breasts, spread legs, ass, erection, veins, veiny penis\nActions: hetero, sex, vaginal, anal, oral, fellatio, after fellatio, paizuri, straddling, riding, missionary, doggystyle, cowgirl position, moaning, open mouth, tongue out, ahegao, clenching teeth\nFluids: cum, cum on body, cum on breasts, cum on face, cum on hair, cum on tongue, cum in mouth, cum inside, ejaculation, facial, saliva, sweat\nState: flushed face, heavy breathing, trembling, crying with eyes open, half-closed eyes, solo focus" : "";
            let npcTagsStr = imageInjectionNpcTags(); // <-- GET THE TAGS (Classic or V2)
            const imageCountStr = ig.imageCount || 1; 

            const fill = (tmpl, npcTags, cond = conditionalText) => tmpl
                .replace('{{conditionalText}}', cond)
                .replace('{{imageCount}}', imageCountStr)
                .replace('{{templateRules}}', rules)
                .replace('{{promptExtra}}', extraSection)
                .replace('{{directLanguage}}', directLangStr)
                .replace('{{npcImageTags}}', npcTags)
                .replace('{{templateExamples}}', examples);
            const img1 = fill(template, npcTagsStr);

            // Image Gen V2 has its own, shorter instruction (@Name, cast list).
            const v2Inline = imageV2InlineInstruction({ conditionalText, imageCount: imageCountStr });

            // The split. The characters' tags (Classic) and the cast (V2)
            // change with the scene, so they ride in <turn_notes>. A custom
            // template without the opening sentence can't be split: it is
            // sent whole in <turn_notes>, on the turns an image is due.
            // The "only when a photo is taken" warning is left out of the rules:
            // the line in <turn_notes> says it, on the turns it applies.
            let turnExtra = "";
            const v2Split = imageV2InlineSplit({ conditionalText: "" });
            if (v2Split) {
                dict["[[img_rules]]"] = wrapImageRules(v2Split.rules);
                turnExtra = v2Split.turn;
            } else if (template.includes(IMAGE_ASK_OLD)) {
                dict["[[img_rules]]"] = wrapImageRules(fill(template.replace(IMAGE_ASK_OLD, IMAGE_ASK_NEW), "", "").replace(/\n{3,}/g, "\n\n"));
                turnExtra = npcTagsStr;
            }
            if (shouldInject) {
                imageTurn = dict["[[img_rules]]"]
                    ? [imageTurnLine(imageCountStr, mode === "conditional"), turnExtra].filter(s => String(s || "").trim()).join("\n")
                    : (v2Inline || img1);
            }

            if (shouldInject) {
                dict["[[img1]]"] = v2Inline || img1;
                // Set the new value for img2 dynamically based on the count!
                dict["[[img2]]"] = ` and the ${imageCountStr} image tag`;
            } else {
                dict["[[img1]]"] = "";
                dict["[[img2]]"] = "";
            }
        } else {
            dict["[[img1]]"] = "";
            dict["[[img2]]"] = "";
        }
    } else {
        dict["[[img1]]"] = ""; dict["[[img2]]"] = "";
    }

    if (localProfile.thinkingV2 && dict["[[prefill]]"]) {
        dict["[[prefill]]"] = dict["[[prefill]]"].replace(/\n<think>[\s\S]*/, "\n<think>\n<think>");
    }

    if (dict["[[cyoa]]"]) dict["[[cyoa2]]"] = "[CYOA block here]"; else dict["[[cyoa2]]"] = "";
    if (dict["[[infoblock]]"]) dict["[[infoblock2]]"] = "[World state block here]"; else dict["[[infoblock2]]"] = "";
    if (dict["[[storytracker]]"]) dict["[[storytracker2]]"] = "[Story tracker here]"; else dict["[[storytracker2]]"] = "";
    if (dict["[[npc_inner_chatter]]"]) dict["[[npc_inner_chatter2]]"] = "[Npc inner chatter here]"; else dict["[[npc_inner_chatter2]]"] = "";

    // --- AUTHOR'S NOTEBOOK (plan 010) ---
    // The craft of keeping it, for an engine that carries [[notebook]] in its
    // text (so it is resolved early, below). Empty while the notebook is off,
    // so the engine never talks about a notebook that isn't there, and
    // empty for an engine that keeps its own notebook (V11): its own text
    // carries the craft, and a preset holding [[notebook]] would say it twice.
    let notebookPhaseNow = "off";
    try { notebookPhaseNow = notebookCurrentPhase(); } catch (e) { /* no chat */ }
    dict["[[notebook]]"] = notebookPhaseNow === "off" || engineKeepsNotebook(activeEngine) ? "" : NOTEBOOK_CRAFT;

    // Resolve early-evaluated tokens inside all other strings to prevent them from being missed and then cleaned up
    const earlyTokens = ["[[notebook]]", "[[count]]", "[[Language]]", "[[pronouns]]", "[[DNRATIO]]", "[[img2]]", "[[v9_lean_min]]", "[[v9_lean_max]]", "[[v9_full_min]]", "[[v9_full_max]]"];
    earlyTokens.forEach(et => {
        if (dict[et] !== undefined) {
            const val = dict[et];
            Object.keys(dict).forEach(k => {
                if (k !== et && typeof dict[k] === 'string' && dict[k].includes(et)) {
                    dict[k] = dict[k].split(et).join(val);
                }
            });
        }
    });
    // An engine that places [[pronouns]] in its own text (V11 Тайна, inside
    // <reader>) has it filled there; the preset's copy stays empty.
    if (activeEngine && [1, 2, 3, 4, 5, 6].some(i => String(activeEngine[`p${i}`] || "").includes("[[pronouns]]"))) {
        dict["[[pronouns]]"] = "";
    }

    // --- CURRENT WORLD STATE (continuity notes) ---
    // Injected into [[infoblockcurrent]] above [[blocks]] once the story has a
    // state on file. The state store owns it; see src/state/index.js.
    // [[infoblockcorrent]] is an old misspelling some presets still carry.
    //
    // Plan 008: the same spot is "Current Info" — World State plus the Bonds the
    // story needs right now, the player's sheet, and the last Inner Chatter and
    // Story Tracker — so the model reads the true values here instead of its own
    // old blocks in the chat. Each part only when its block is on.
    const worldNotes = localProfile.blocks && localProfile.blocks.includes("info") ? worldPromptBlock() : "";
    const currentInfo = buildCurrentInfo(worldNotes);
    dict["[[infoblockcurrent]]"] = currentInfo;
    dict["[[infoblockcorrent]]"] = currentInfo;

    // --- PER-BLOCK HEADERS ---
    // The envelope carries its own header, once, above everything. These lines
    // were written into the individual templates back when each block had to
    // introduce itself, and inside the envelope they are noise.
    ["[[infoblock]]", "[[npc_inner_chatter]]", "[[cyoa]]", "[[storytracker]]"].forEach(block => {
        if (dict[block] && dict[block].trim() !== "") {
            dict[block] = dict[block].replace(/# at the very end of the response put this block:\s*/gi, "");
        }
    });

    // --- 5. MEMORY CORE INJECTION ---
    // Initialize them as empty strings by default so the tags cleanly vanish if there are no memories
    dict["[[long-Memory]]"] = "";
    dict["[[Short-memory]]"] = "";

    if (localProfile.memoryCore && localProfile.memoryCore.enabled) {
        const mem = localProfile.memoryCore;

        const memCustom = mem.customPromptsEnabled ? mem.customPrompts : null;

        // A. Retrieve Long-Term Memories (Local TF-IDF Keyword Scoring)
        // updateLiveTokenCount drops [[long-Memory]] via excludeKeys anyway,
        // so the scan only ever fed a value that got thrown away
        if (!isTokenCount && mem.longTermVault && mem.longTermVault.length > 0) {
            const retrieved = memGetRelevantVaultEntries();
            if (retrieved.length > 0) {
                // Feed these to the model oldest-first so the archives read as a timeline instead of a relevance ranking.
                // Sort a COPY - the array can be the live semantic match list or the retrieval cache, never reorder it in place!
                const ordered = [...retrieved].sort((a, b) => {
                    const aStart = (a && typeof a.id === 'string') ? parseInt(a.id.split("-")[0], 10) : NaN;
                    const bStart = (b && typeof b.id === 'string') ? parseInt(b.id.split("-")[0], 10) : NaN;
                    return (Number.isFinite(aStart) ? aStart : 0) - (Number.isFinite(bStart) ? bStart : 0);
                });
                let longXML = "<retrieved_archives>\n";
                ordered.forEach(m => {
                    const dateStr = new Date(m.timestamp).toLocaleString();
                    const content = m.text || m.summary || "";
                    longXML += `<archive_memory time="${dateStr}">\n[Msg ${m.id}]:\n${content}\n</archive_memory>\n`;
                });
                longXML += "</retrieved_archives>";

                const template = (memCustom && memCustom.longTermTemplate) || DEFAULT_PROMPTS.memoryCore.longTermTemplate;
                dict["[[long-Memory]]"] = template.replace('{{archiveXML}}', longXML);
            }
        }

        // B. Inject Short-Term Memories (Chronological)
        if (mem.shortTermChunks && mem.shortTermChunks.length > 0) {
            // Same rule as the long-term sort: imports can concatenate chunks out of order,
            // and one bad id must never break prompt assembly. Sort a COPY - this array IS
            // the stored data, reordering it here would rewrite storage on the next save.
            const orderedShort = [...mem.shortTermChunks].sort((a, b) => {
                const aStart = (a && typeof a.id === 'string') ? parseInt(a.id.split("-")[0], 10) : NaN;
                const bStart = (b && typeof b.id === 'string') ? parseInt(b.id.split("-")[0], 10) : NaN;
                return (Number.isFinite(aStart) ? aStart : 0) - (Number.isFinite(bStart) ? bStart : 0);
            });
            let shortXML = "<recent_state_extracts>\n";
            orderedShort.forEach(m => {
                const dateStr = new Date(m.timestamp).toLocaleString();
                shortXML += `<archive_memory time="${dateStr}">[Msg ${m.id}]: ${m.summary}</archive_memory>\n`;
            });
            shortXML += "</recent_state_extracts>";

            const templateShort = (memCustom && memCustom.shortTermTemplate) || DEFAULT_PROMPTS.memoryCore.shortTermTemplate;
            dict["[[Short-memory]]"] = templateShort.replace('{{shortXML}}', shortXML);
        }
    }

    // --- 5.5 NPC BANK INJECTION ---
    dict["[[npc_dossier]]"] = "";
    dict["[[npc_dossier2]]"] = "";
    dict["[[npc list]]"] = "";
    dict["[[npc_updates]]"] = "";
    // [[npc_rules]] (plan 018): the V11 preset's <npc_dossier_rules>, dossier and updates.
    const npcRulesParts = [];

    if (localProfile.npcBank && localProfile.npcBank.enabled) {
        
        // --- OOC Trigger Check (Applies ONLY to the Dossier Template) ---
        let allowDossierInjection = true;
        if (localProfile.npcBank.oocTrigger) {
            allowDossierInjection = false;
            const context = typeof getContext === 'function' ? getContext() : null;
            if (context && context.chat) {
                const lastUserMsg = context.chat.slice().reverse().find(m => m.is_user);
                if (lastUserMsg && lastUserMsg.mes) {
                    const msgLower = lastUserMsg.mes.toLowerCase();
                    if (msgLower.includes("npc") || msgLower.includes("dossier")) {
                        allowDossierInjection = true;
                    }
                }
            }
        }

        // --- Construct Ignore List ---
        let knownNamesText = "";
        let ignoredArr = [];
        if (localProfile.npcBank.npcs && localProfile.npcBank.npcs.length > 0) {
            ignoredArr.push(...localProfile.npcBank.npcs.map(n => n.name));
        }
        if (localProfile.npcBank.ignoredNames) {
            ignoredArr.push(...localProfile.npcBank.ignoredNames.split(',').map(s => s.trim()).filter(s => s));
        }
        ignoredArr = [...new Set(ignoredArr)];
        
        if (ignoredArr.length > 0) {
            knownNamesText = `[CRITICAL RULE: DO NOT generate a dossier for the following already-known or ignored characters: ${ignoredArr.join(", ")}]\n\n`;
        }

        if (allowDossierInjection) {
            const nbPrompts = (localProfile.npcBank.customPromptsEnabled && localProfile.npcBank.customPrompts) ? localProfile.npcBank.customPrompts : DEFAULT_PROMPTS.npcBank;

            // Inject Ignore List alongside the Dossier Rules!
            // The rules are the author's; the fill-in template inside them is
            // generated from the field list, so a field added in the tab is
            // asked for here without a prompt edit.
            dict["[[npc_dossier]]"] = npcBuildDossierPrompt(nbPrompts.dossierRules || DEFAULT_PROMPTS.npcBank.dossierRules) + knownNamesText;
            dict["[[npc_dossier2]]"] = "[NPC Dossier block here]";

            // Plan 018: the V11 preset's wording, while the rules are the built-in ones.
            npcRulesParts.push(sameText(nbPrompts.dossierRules || DEFAULT_PROMPTS.npcBank.dossierRules, DEFAULT_PROMPTS.npcBank.dossierRules)
                ? [npcBuildDossierPromptSplit(), npcKnownNames(ignoredArr)].filter(Boolean).join("\n\n")
                : dict["[[npc_dossier]]"].trim());
        }

        // --- Update rules ---
        // Deliberately NOT gated on allowDossierInjection. The OOC trigger is
        // about whether to spend tokens asking for NEW dossiers; an NPC already
        // in the bank should keep up to date whether or not the user said the
        // word "npc" this turn.
        if (localProfile.npcBank.npcs && localProfile.npcBank.npcs.length > 0) {
            const updatePrompt = npcBuildUpdatePrompt();
            dict["[[npc_updates]]"] = updatePrompt;
            npcRulesParts.push(npcBuildUpdatePromptSplit());

            // AND appended to [[npc_dossier]], which is the only one of the two
            // that existing presets actually contain.
            //
            // A new tag reaches the model only if a preset has an anchor for it,
            // and every preset in the wild was written before [[npc_updates]]
            // existed — so on its own it went nowhere and the rules were never
            // injected at all. [[npc_dossier]] is already in those presets and
            // already carries rules rather than a block, which is exactly what
            // this is. The separate tag stays supported for a preset that wants
            // to place the rules somewhere of its own.
            if (updatePrompt) {
                dict["[[npc_dossier]]"] = dict["[[npc_dossier]]"]
                    ? dict["[[npc_dossier]]"] + "\n\n" + updatePrompt
                    : updatePrompt;
            }
        }

        // --- NPC List Injection (TF-IDF Context Recall) ---
        // OPTIMIZED: Pre-computes NPC text + IDF in single passes (O(K×N) instead of O(K×N²))
        if (localProfile.npcBank.npcs && localProfile.npcBank.npcs.length > 0) {
            const context = typeof getContext === 'function' ? getContext() : null;
            if (context && context.chat) {
                // Use cached keywords (shared with vault retrieval in same prompt build)
                const { keywords } = memGetCachedKeywords(context.chat, 4);
                
                if (keywords.length > 0) {
                    const npcs = localProfile.npcBank.npcs;
                    const totalNpcs = npcs.length;

                    // Pre-compute NPC text + lowercase ONCE (was being rebuilt inside inner loops)
                    const npcTexts = npcs.map(n => npcBuildTextFromData(n).toLowerCase());
                    const npcNames = npcs.map(n => n.name.toLowerCase());

                    // Pre-compute document frequency per keyword across all NPCs in ONE pass
                    const npcDfMap = new Map();
                    for (const kw of keywords) {
                        let count = 0;
                        for (let i = 0; i < npcTexts.length; i++) {
                            if (npcTexts[i].includes(kw)) count++;
                        }
                        if (count > 0 && (totalNpcs <= 2 || count <= Math.ceil(totalNpcs * 0.5))) {
                            npcDfMap.set(kw, Math.max(1, Math.round(10 / count)));
                        }
                    }

                    let scoredNpcs = [];
                    npcs.forEach((n, idx) => {
                        if (n.imageOnly) return; // Skip if "Image Tags Only" is toggled
                        
                        let score = 0;
                        let matchedWords = [];
                        const contentLower = npcTexts[idx];
                        const nameLower = npcNames[idx];
                        
                        for (const [kw, baseWeight] of npcDfMap) {
                            if (contentLower.includes(kw)) {
                                let weight = baseWeight;
                                
                                // Massive bonus if the keyword matches the NPC's actual name
                                if (nameLower.includes(kw)) {
                                    weight += 50;
                                }
                                
                                score += weight;
                                matchedWords.push(`${kw}(+${weight})`);
                            }
                        }
                        
                        // Require at least 1 point to be considered "relevant"
                        if (score >= 1) {
                            scoredNpcs.push({ ...n, score, matchedWords });
                        }
                    });
                    
                    if (scoredNpcs.length > 0) {
                        // Sort by highest score
                        scoredNpcs.sort((a, b) => b.score - a.score);
                        
                        // Enforce the Injection Limit chosen in the UI
                        const limit = localProfile.npcBank.injectionLimit || 3;
                        const topNpcs = scoredNpcs.slice(0, limit);
                        
                        let npcXML = "<retrieved_npcs>\n";
                        topNpcs.forEach(n => { npcXML += `<${n.name}>\n${npcBuildTextFromData(n)}\n</${n.name}>\n\n`; });
                        npcXML += "</retrieved_npcs>";
                        
                        dict["[[npc list]]"] = `[RELEVANT NPCs]\nThe following are details of known NPCs relevant to the current context:\n${npcXML}`;

                        clearActiveNpcImages();
                        if (localProfile.npcBank.sendPortraitsToAi) {
                            topNpcs.forEach(n => {
                                if (n.pfp && n.pfp.startsWith("data:image")) {
                                    pushActiveNpcImage({ name: n.name, base64: n.pfp });
                                }
                            });
                        }
                    }
                }
            }
        }
    }

    // --- PRESET SECTIONS (plan 017) ---
    // The V11 preset is only slots. These carry their own headers, so a section
    // that is off takes its header with it. Built here, after [[THINK]], the
    // ban list and the override pass, from the finished parts: a Dev Mode edit
    // of any part still reaches the section.
    const slotText = trigger => {
        const slot = meguminSlotByTrigger(trigger);
        if (!slot || !meguminSlotIsLive(slot, localProfile)) return "";
        return resolveSlot(slot, activeEngine).value || "";
    };
    // The built-in ban list (plan 018): the short list when you picked it; on
    // V11 Тайна the full list in its own wording (your edit of it, if any).
    let builtInBan = slotText("[[banlist_builtin]]");
    if (builtInBan) {
        if (localProfile.banListShort) builtInBan = SHORT_BAN_LIST;
        else if (frame) builtInBan = getSharedFragment("banlistBuiltInV11") || V11_BAN_LIST;
    }
    const banned = bannedSection({ builtIn: builtInBan, additions: dict["[[banlist]]"], frame });
    dict["[[thinking]]"] = thinkingSection(dict["[[THINK]]"], { frame });
    dict["[[formatting]]"] = formattingSection({
        dnratio: dict["[[DNRATIO]]"], color: dict["[[COLOR]]"], rules: slotText("[[formatting_rules]]"),
        direct: dict["[[Direct]]"], frame,
    });
    dict["[[banned]]"] = banned;
    dict["[[reminder]]"] = reminderSection({
        checks: slotText("[[final_checks]]"), banned: !!banned,
        presetChecks: slotText("[[reminder_checks]]"), userLine: dict["[[user]]"], frame,
    });
    dict["[[content]]"] = slotText("[[content]]");

    // --- MASTER BLOCK ENVELOPE ---
    // Built from the same per-block values the legacy path uses, so engine
    // overrides, custom prompts and compact World State all still apply. Which of
    // the two actually reaches the model is decided later, by whether the preset
    // has a [[blocks]] anchor in it.
    //
    // LAST, AND IT HAS TO BE LAST. The envelope reads the dict it is handed: a
    // block's body comes from its `source` tag, and a conditional block asks
    // `slotRequires` about a tag too. This used to sit above the Memory Core and
    // NPC Bank sections, so every NPC tag it consulted was still empty and the
    // <New_NPC> slot could never appear in the envelope no matter what the bank
    // was doing. Anything that populates a tag a block reads must run before
    // this line.
    const envelope = blocksEnvelopeParts(dict);
    dict["[[blocks]]"] = buildBlocksEnvelope(envelope);

    // --- PLAN 018: the V11 preset's two halves ---
    // [[block_rules]] goes up top with [[npc_dossier]], [[dice_rules]] and
    // [[img_rules]]; [[this_turn]] goes last, with only what is new this turn.
    dict["[[block_rules]]"] = blockRulesText(envelope);
    dict["[[npc_rules]]"] = wrapNpcRules(npcRulesParts);

    // The add-ons, each in its own tag. A built-in text gets its V11 wording;
    // one you edited is kept as you wrote it. Organic NPCs & Events is V6's
    // and stays out.
    const addonBuiltin = id => (hardcodedLogic.addons.find(a => a.id === id) || {}).content;
    dict["[[addon_rules]]"] = [
        ["[[onomato]]", "sound", onoBuiltin, (localProfile.onomatopoeia || {}).useStyling ? ADDON_RULES_SPLIT.onomatoStyled : ADDON_RULES_SPLIT.onomato],
        ["[[death]]", "death", addonBuiltin("death"), ADDON_RULES_SPLIT.death],
        ["[[combat]]", "combat", addonBuiltin("combat"), ADDON_RULES_SPLIT.combat],
        ["[[html]]", "render", addonBuiltin("html"), null],
    ].map(([trigger, tag, builtin, v11]) => {
        const now = dict[trigger];
        if (!now || !String(now).trim()) return "";
        return v11 && sameText(now, builtin) ? v11 : wrapAddon(tag, now);
    }).filter(Boolean).join("\n\n");
    dict["[[this_turn]]"] = thisTurnSection({
        dice: diceRollsLine,
        image: imageTurn,
        blocks: blocksSkeletonSplit(envelope),
    });

    return dict;
}

// The last few messages, blocks removed: whose bonds the story needs is read from these.
function recentStoryText(count = 3) {
    const chat = (getContext() && getContext().chat) || [];
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < count; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        out.push(meguminCleanChatHistoryText(String(m.mes || "")));
    }
    return out.join("\n");
}

// [[infoblockcurrent]]: one <Current_Info> section, or "" when nothing is on file.
function buildCurrentInfo(worldNotes) {
    let parts = { bonds: "", sheet: "", chatter: "", tracker: "" };
    try { parts = statsPromptParts({ recentText: recentStoryText() }); } catch (e) {
        console.warn("[Megumin Suite] Current Info: could not read the kept blocks.", e);
    }
    let notebook = "";
    try { notebook = notebookPromptBlock(); } catch (e) {
        console.warn("[Megumin Suite] Current Info: could not read the notebook.", e);
    }
    const sections = [];
    if (worldNotes) sections.push(worldNotes);
    if (notebook) sections.push(notebook);
    if (parts.bonds) sections.push(`<Bonds_Now>\n${parts.bonds}\n</Bonds_Now>`);
    if (parts.sheet) sections.push(`<Character_Sheet_Now>\n${parts.sheet}\n</Character_Sheet_Now>`);
    if (parts.chatter) sections.push(`<Last_Inner_Chatter>\n${parts.chatter}\n</Last_Inner_Chatter>`);
    if (parts.tracker) sections.push(`<Last_Story_Tracker>\n${parts.tracker}\n</Last_Story_Tracker>`);
    if (!sections.length) return "";
    return [
        "<Current_Info>",
        "<!-- Where the story stands right now, before your reply: the world, how the characters feel about {{user}}, {{user}}'s sheet, and the last private thoughts and story notes. Keep your reply consistent with it and carry these values forward. Never copy this section into your reply. -->",
        "",
        sections.join("\n\n"),
        "</Current_Info>"
    ].join("\n");
}
