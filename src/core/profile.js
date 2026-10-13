// ──────────────────────────────────────────────────────────────────────────────
// Loading, saving and pruning the active profile.
//
// The whole extension's state lives in localProfile; this is the only module that
// builds it, writes it back to settings.json / chat metadata, and repairs it.
//
// It refreshes the tabs that a load or a prune invalidates through the hook
// registry rather than by calling renderers directly — see refreshHooks.js for
// why. That keeps every dependency here pointing down.
// ──────────────────────────────────────────────────────────────────────────────

import {
    getContext, extension_settings, saveSettingsDebounced, chat_metadata, saveMetadata,
    debounce, humanizedDateTime, isGenerating,
} from "../st.js";
import { extensionName } from "./constants.js";
import { localProfile, setLocalProfile, _loadedProfileKey, setLoadedProfileKey } from "./state.js";
import { getCharacterKey, getRawAvatar, getAvatarKey, getParentChatKey, getProfileLevel } from "./keys.js";
import { adoptPortraitIntoRecord } from "./portraits.js";
import { fireRefreshHook, REFRESH } from "./refreshHooks.js";
import { meguminSparsifyProfilePrompts, meguminRehydrateProfilePrompts } from "../prompts/storage.js";
import { DEFAULT_PROMPTS } from "../prompts/defaults.js";
import { hardcodedLogic } from "../../data/database.js";
import { MEGUMIN_BLOCK_REGISTRY, meguminSyncLegacyBlockIds } from "../features/blocks/registry.js";
import { NPC_DEFAULT_FIELDS, NPC_SYSTEM_ROLES } from "../features/npc/fields.js";
import { npcRollbackHistoryFrom } from "../features/npc/updates.js";
import { normalizeStoryConfig, applyStoryConfigDefaults } from "../features/storyconfig/config.js";
import { escapeRegex } from "../utils/regex.js";
import { refreshSidePanel, refreshPresentBar } from "../sidepanel/panel.js";

// Last chat_metadata stamp written, so an unchanged profile doesn't re-save.
export let _lastSavedMetaStamp = "";
// Set when a debounced profile save is scheduled; cleared whenever a save actually
// runs and after a fresh load. The chat-switch flush reads it, so a chat nobody
// edited never gets a profile written under its own key.
export let _profileSavePending = false;

export function initProfile() {
    const context = getContext();
    const chatLevelKey = getCharacterKey(); // Returns chat::xxx, group_xxx, avatar, or null
    const isGroup = context.groupId !== undefined && context.groupId !== null;

    // For non-group chats: try chat-level, then character-level (avatar), then default
    // For group chats: only group-level or default
    const profileLevel = isGroup ? 'group' : getProfileLevel();
    let activeKey = null;
    let fallbackKeys = [];

    if (isGroup) {
        activeKey = chatLevelKey; // group_xxx
    } else if (chatLevelKey) {
        // Priority: chat::xxx → parent_chat::xxx (if branch) → avatar → default
        activeKey = chatLevelKey;
        if (chatLevelKey.startsWith('chat::')) {
            fallbackKeys = [];
            // Add parent chat key if this is a branch
            const parentKey = getParentChatKey();
            if (parentKey) {
                fallbackKeys.push(parentKey);
            }
            // Add character-level (avatar) as final fallback for backward compatibility
            const avatarKey = getAvatarKey();
            if (avatarKey) fallbackKeys.push(avatarKey);
        }
    }

    if (!extension_settings[extensionName]) extension_settings[extensionName] = { profiles: {} };
    if (!extension_settings[extensionName].profiles) extension_settings[extensionName].profiles = {};
    if (!extension_settings[extensionName].customModes) {
        extension_settings[extensionName].customModes = [];
    }
    // Saved Story Config presets live globally so they follow the user across every character
    if (!extension_settings[extensionName].configPresets) {
        extension_settings[extensionName].configPresets = [];
    }

    const defaults = {
        mode: "balance",
        // Which engines have Enhanced Dialogue switched on, keyed by engine id.
        //
        // Per engine rather than one flag, because the switch is drawn inside the
        // engine card: a control that sits on the Ukiyo card and silently changes
        // Shura's card too is lying about its own scope. Only the active engine's
        // entry is ever read, so in practice a reader who never switches engines
        // sees a single on/off.
        enhancedDialogue: {},
        personality: "engine",
        v9Limits: { leanMin: 300, leanMax: 400, fullMin: 700, fullMax: 1200 },
        toggles: { ooc: false, control: false },
        aiTags: [],
        aiGeneratedOptions: [],
        aiRule: "",
        customStyles: [],
        activeStyleId: null,
        storyConfig: {
            enabled: true,
            genre: "",
            tone: "",
            pov: "",
            pace: "",
            length: "",
            difficulty: "",
            friction: "",
            npcDisposition: "",
            explicitness: "",
            narratorPresence: "",
            focus: "",
            culture: "",
            era: "",
            npcSpeechStyle: "",
            notes: ""
        },
        dnRatio: {
            enabled: false,
            dialogue: 50
        },
        onomatopoeia: {
            enabled: false,
            useStyling: false
        },
        addons: [],
        blocks: [],
        // What sits inside the <Blocks> envelope, and in what order. `order` is
        // membership as well as sequence: a block not listed is not emitted.
        blockStack: {
            order: [],
            custom: [],
            overrides: {}
        },
        // Fields for the stat blocks. Their templates are generated from these,
        // so adding Jealousy or Mana is a setting, not a code change.
        statBlocks: {
            bonds: {
                fields: [
                    { id: "mood", label: "Mood", type: "text", hint: "emotional surface" },
                    { id: "affection", label: "Affection", type: "meter", max: 100, start: 20 },
                    { id: "trust", label: "Trust", type: "meter", max: 100, start: 30 },
                    { id: "desire", label: "Desire", type: "meter", max: 100, start: 0 }
                ]
            },
            sheet: {
                fields: [
                    { id: "hp", label: "HP", type: "meter", max: 100, start: 100 },
                    { id: "stamina", label: "Stamina", type: "meter", max: 100, start: 100 },
                    { id: "gold", label: "Gold", type: "number", start: 0 },
                    { id: "status", label: "Status", type: "text", ownLine: true, hint: "conditions, or \"none\"" },
                    { id: "skills", label: "Skills", type: "list", ownLine: true, hint: "Name rank, comma separated" },
                    { id: "inventory", label: "Inventory", type: "list", ownLine: true, hint: "item, item xN, or \"nothing\"" }
                ]
            }
        },
        model: "cot-v1-english",
        userNotes: "",
        userLanguage: "",
        userPronouns: "off",
        devOverrides: {},
        banList: [],
        banListBackend: "direct",
        banListCustomPrompts: null,
        banListCustomPromptsEnabled: false,
        customModes: [],
        thinkEffort: "unspecified",
        customThinkEffort: "100",
        storyPlan: {
            enabled: false,
            backend: "direct",
            triggerMode: "auto",
            autoFreq: 10,
            currentPlan: "",
            customPrompts: null,
            customPromptsEnabled: false,
            contentRating: "none",
            pacing: "natural",
            primaryGenre: "drama",
            // Only read when primaryGenre is "custom" — the select keeps its own
            // value either way, so switching to Custom and back does not lose
            // whatever was typed.
            customGenre: "",
            flavorTags: [],
            directorsNote: "",
            unrestrictedContent: false,
            lastTrackerState: "",
            planMessageIndex: null
        },
        imageGen: {
            enabled: false,
            generatorBackend: "direct",
            injectMode: "inline",
            imageCount: 1,
            comfyUrl: "http://127.0.0.1:8188",
            currentWorkflowName: "",
            selectedModel: "",
            selectedLora: "", selectedLora2: "", selectedLora3: "", selectedLora4: "",
            selectedLoraWt: 1.0, selectedLoraWt2: 1.0, selectedLoraWt3: 1.0, selectedLoraWt4: 1.0,
            imgWidth: 1024, imgHeight: 1024,
            customNegative: "bad quality, blurry, worst quality, low quality",
            customSeed: -1,
            selectedSampler: "euler",
            compressImages: true,
            steps: 20, cfg: 7.0, denoise: 0.5, clipSkip: 1,
            promptTemplate: "illus_cinematic",
            includeExamples: true,
            directLanguage: false,
            injectNpcTags: false,
            promptExtra: "",
            triggerMode: "always",
            autoGenFreq: 1,
            previewPrompt: false,
            autoPortraits: false,
            savedWorkflowStates: {},
            customPrompts: null,
            customPromptsEnabled: false
        },
        memoryCore: {
            enabled: false,
            architecture: "raw_short_long", // "raw_short_long" or "raw_long"
            workingLimit: 30,
            shortTermLimit: 70,
            chunkSize: 10,
            backend: "direct",
            scannerEngine: "tfidf",
            triggerMode: "frequency",
            autoFreq: 10,
            shortTermChunks: [],
            longTermVault: [],
            customPrompts: null,
            customPromptsEnabled: false
        },
        npcBank: {
            enabled: false,
            oocTrigger: false,
            sendPortraitsToAi: false,
            npcs: [],
            // The dossier's shape. The prompt template, the parser, the card and
            // the injected text are all generated from this, so adding a field
            // is a setting the reader changes rather than a code change.
            fields: JSON.parse(JSON.stringify(NPC_DEFAULT_FIELDS)),
            customPrompts: null,
            customPromptsEnabled: false,
            scanDepth: 60,
            ignoredNames: "",
            injectionLimit: 3
        }
    };


    if (!extension_settings[extensionName].globalSettings) {
        extension_settings[extensionName].globalSettings = {
            promptPreview: false,
            enableUtilityPrefill: false,
            saveMode: "character"
        };
    } else if (!extension_settings[extensionName].globalSettings.saveMode) {
        extension_settings[extensionName].globalSettings.saveMode = "character";
    }

    if (!extension_settings[extensionName].profiles["default"]) {
        extension_settings[extensionName].profiles["default"] = JSON.parse(JSON.stringify(defaults));
    }

    // ── PROFILE LOADING: Try exact keys first, then fuzzy match all stored chat-level keys ──
    let profileFound = false;
    const avatarName = getRawAvatar();
    let keysToTry = [activeKey, ...fallbackKeys].filter(k => k);

    // Add avatar name as fallback if not already in the chain (for cross-format compatibility)
    if (avatarName && !keysToTry.includes(avatarName)) {
        keysToTry.push(avatarName);
    }

    // Step 1: Try exact key matches first
    for (const tryKey of keysToTry) {
        if (extension_settings[extensionName].profiles[tryKey]) {
            setLocalProfile(JSON.parse(JSON.stringify(extension_settings[extensionName].profiles[tryKey])));
            profileFound = true;
            activeKey = tryKey;

            if (tryKey.startsWith('chat::')) {
                // Check if this is a parent chat key (branch fallback)
                const isParent = (tryKey !== chatLevelKey && chatLevelKey && chatLevelKey.startsWith('chat::') && getParentChatKey() === tryKey);
                if (isParent) {
                    $("#ps_rule_status_main").css({ "color": "#818cf8", "text-shadow": "0 0 10px rgba(129,140,248,0.5)" }).text(`PARENT CHAT PROFILE (branch)`);
                } else {
                    $("#ps_rule_status_main").css({ "color": "#a855f7", "text-shadow": "0 0 10px rgba(168,85,247,0.5)" }).text(`CHAT PROFILE ACTIVE`);
                }
            } else if (isGroup) {
                $("#ps_rule_status_main").css({ "color": "#3b82f6", "text-shadow": "0 0 10px rgba(59,130,246,0.5)" }).text(`GROUP PROFILE ACTIVE`);
            } else {
                $("#ps_rule_status_main").css({ "color": "#10b981", "text-shadow": "0 0 10px rgba(16,185,129,0.5)" }).text(`CHARACTER PROFILE ACTIVE`);
            }
            break;
        }
    }



    // If no profile found in the chain, use defaults
    if (!profileFound) {
        setLocalProfile(JSON.parse(JSON.stringify(extension_settings[extensionName].profiles["default"])));

        if (isGroup) {
            $("#ps_rule_status_main").css({ "color": "#f59e0b", "text-shadow": "0 0 10px rgba(245,158,11,0.5)" }).text(`USING DEFAULT — no group profile`);
        } else if (activeKey && activeKey.startsWith('chat::')) {
            // Check if parent chat fallback exists
            const parentKey = getParentChatKey();
            if (parentKey && extension_settings[extensionName].profiles[parentKey]) {
                $("#ps_rule_status_main").css({ "color": "#f59e0b", "text-shadow": "0 0 10px rgba(245,158,11,0.5)" }).text(`USING PARENT CHAT PROFILE (fallback)`);
            } else {
                // Check if character fallback exists (use avatar name, not chatId)
                const charFallback = getRawAvatar();
                if (charFallback && extension_settings[extensionName].profiles[charFallback]) {
                    $("#ps_rule_status_main").css({ "color": "#f59e0b", "text-shadow": "0 0 10px rgba(245,158,11,0.5)" }).text(`USING CHARACTER PROFILE (fallback)`);
                } else {
                    $("#ps_rule_status_main").css({ "color": "#f59e0b", "text-shadow": "0 0 10px rgba(245,158,11,0.5)" }).text(`USING DEFAULT — no chat or character profile`);
                }
            }
        } else {
            $("#ps_rule_status_main").css({ "color": "#a855f7", "text-shadow": "0 0 10px rgba(168,85,247,0.5)" }).text(`MODIFYING GLOBAL DEFAULT`);
        }
    }

    // PATCH missing keys
    Object.keys(defaults).forEach(k => {
        if (localProfile[k] === undefined) localProfile[k] = defaults[k];
    });
    if (!localProfile.toggles) localProfile.toggles = defaults.toggles;
    if (!localProfile.v9Limits) localProfile.v9Limits = defaults.v9Limits;
    if (!localProfile.imageGen) localProfile.imageGen = defaults.imageGen;
    if (localProfile.imageGen.directLanguage === undefined) localProfile.imageGen.directLanguage = false;
    if (localProfile.imageGen.imageCount === undefined) localProfile.imageGen.imageCount = 1;
    if (localProfile.imageGen.promptPrefix === undefined) localProfile.imageGen.promptPrefix = "";
    if (localProfile.imageGen.loraTrigger1 === undefined) localProfile.imageGen.loraTrigger1 = "";
    if (localProfile.imageGen.loraTrigger2 === undefined) localProfile.imageGen.loraTrigger2 = "";
    if (localProfile.imageGen.loraTrigger3 === undefined) localProfile.imageGen.loraTrigger3 = "";
    if (localProfile.imageGen.loraTrigger4 === undefined) localProfile.imageGen.loraTrigger4 = "";
    if (localProfile.imageGen.loraTriggersMap === undefined) localProfile.imageGen.loraTriggersMap = {};
    if (localProfile.imageGen.promptStyle !== undefined) {
        let style = localProfile.imageGen.promptStyle; 
        let persp = localProfile.imageGen.promptPerspective;

        if (style === "standard") style = "sdxl"; // Fallback standard to sdxl

        if (style === "illustrious" && persp === "pov") localProfile.imageGen.promptTemplate = "illus_pov";
        else if (style === "illustrious" && persp === "character") localProfile.imageGen.promptTemplate = "illus_portrait";
        else if (style === "illustrious") localProfile.imageGen.promptTemplate = "illus_cinematic";
        else if (persp === "pov") localProfile.imageGen.promptTemplate = "sdxl_pov";
        else if (persp === "character") localProfile.imageGen.promptTemplate = "sdxl_portrait";
        else localProfile.imageGen.promptTemplate = "sdxl_cinematic";

        delete localProfile.imageGen.promptStyle;
        delete localProfile.imageGen.promptPerspective;
    }
    if (localProfile.imageGen.includeExamples === undefined) localProfile.imageGen.includeExamples = true;
    if (!localProfile.storyPlan) localProfile.storyPlan = defaults.storyPlan;
    // Story Director migration: add new fields to existing profiles
    if (localProfile.storyPlan) {
        if (localProfile.storyPlan.customPromptsEnabled === undefined) localProfile.storyPlan.customPromptsEnabled = false;
        if (localProfile.storyPlan.contentRating === undefined) localProfile.storyPlan.contentRating = "none";
        if (localProfile.storyPlan.pacing === undefined) localProfile.storyPlan.pacing = "natural";
        if (localProfile.storyPlan.primaryGenre === undefined) localProfile.storyPlan.primaryGenre = "drama";
        if (typeof localProfile.storyPlan.customGenre !== "string") localProfile.storyPlan.customGenre = "";
        if (localProfile.storyPlan.flavorTags === undefined) localProfile.storyPlan.flavorTags = [];
        if (localProfile.storyPlan.directorsNote === undefined) localProfile.storyPlan.directorsNote = "";
        if (localProfile.storyPlan.unrestrictedContent === undefined) localProfile.storyPlan.unrestrictedContent = false;
        if (localProfile.storyPlan.lastTrackerState === undefined) localProfile.storyPlan.lastTrackerState = "";
        if (localProfile.storyPlan.planMessageIndex === undefined) localProfile.storyPlan.planMessageIndex = null;
        if (localProfile.storyPlan.contextLimit === undefined) localProfile.storyPlan.contextLimit = 100;
    }
    if (localProfile.npcBank && localProfile.npcBank.scanDepth === undefined) localProfile.npcBank.scanDepth = 60;
    if (localProfile.banListCustomPromptsEnabled === undefined) localProfile.banListCustomPromptsEnabled = false;
    if (localProfile.imageGen.injectNpcTags === undefined) localProfile.imageGen.injectNpcTags = false;
    // Story Config (replaces the old standalone POV dropdown and the legacy word count)
    if (!localProfile.storyConfig) localProfile.storyConfig = JSON.parse(JSON.stringify(defaults.storyConfig));
    if (localProfile.imageGen && localProfile.imageGen.autoPortraits === undefined) localProfile.imageGen.autoPortraits = false;
    Object.keys(defaults.storyConfig).forEach(k => {
        if (localProfile.storyConfig[k] === undefined) localProfile.storyConfig[k] = defaults.storyConfig[k];
    });
    normalizeStoryConfig(localProfile.storyConfig);
    // One-time migration: the old POV dropdown becomes the config's pov field
    if (localProfile.userPov && !localProfile.storyConfig.pov) {
        localProfile.storyConfig.pov = localProfile.userPov;
        localProfile.userPov = "";
    }
    // One-time migration: the old Target Word Count becomes the config's length field
    if (localProfile.userWordCount && String(localProfile.userWordCount).trim() !== "" && !localProfile.storyConfig.length) {
        const legacyType = localProfile.userWordCountType === "min" ? "minimum" : "maximum";
        localProfile.storyConfig.length = `${legacyType} ${String(localProfile.userWordCount).trim()} words`;
        localProfile.userWordCount = "";
    }
    // AFTER the two legacy migrations, never before: seeding pov would fill the very
    // field `if (!localProfile.storyConfig.pov)` tests, and an upgrading reader would
    // silently lose the POV they had set on the old dropdown.
    //
    // The block is always injected now, so its three standing fields ship set rather
    // than blank. Only fills what is empty, so a reader who picked something keeps it.
    applyStoryConfigDefaults(localProfile.storyConfig);
    if (localProfile.imageGen && localProfile.imageGen.customPromptsEnabled === undefined) localProfile.imageGen.customPromptsEnabled = false;
    if (localProfile.memoryCore && localProfile.memoryCore.customPromptsEnabled === undefined) localProfile.memoryCore.customPromptsEnabled = false;
    if (localProfile.npcBank && localProfile.npcBank.customPromptsEnabled === undefined) localProfile.npcBank.customPromptsEnabled = false;
    if (localProfile.npcBank && localProfile.npcBank.oocTrigger === undefined) localProfile.npcBank.oocTrigger = false;
    if (localProfile.npcBank && localProfile.npcBank.ignoredNames === undefined) localProfile.npcBank.ignoredNames = "";
    if (localProfile.npcBank && localProfile.npcBank.injectionLimit === undefined) localProfile.npcBank.injectionLimit = 3;
    // NPC field list. Seeded from the defaults, whose ids are the exact keys every
    // already-saved NPC carries — so an upgrading profile keeps rendering every
    // dossier it has without a data migration.
    if (localProfile.npcBank) {
        if (!Array.isArray(localProfile.npcBank.fields) || localProfile.npcBank.fields.length === 0) {
            localProfile.npcBank.fields = JSON.parse(JSON.stringify(NPC_DEFAULT_FIELDS));
        } else {
            // A structural field is code the reader can rename, not code they can
            // delete: without a name field there is nothing to key an NPC on, and
            // without the vitals the header line has nothing to draw. Put back any
            // that a hand-edited or partially-written profile is missing.
            NPC_SYSTEM_ROLES.forEach(role => {
                const present = localProfile.npcBank.fields.some(f => f && f.system === role);
                if (present) return;
                const restored = NPC_DEFAULT_FIELDS.filter(f => f.system === role);
                // Restored at the front so name and vitals stay ahead of the body
                // rows, which is the order the template's header line needs.
                localProfile.npcBank.fields.unshift(...JSON.parse(JSON.stringify(restored)));
                console.debug(`[Megumin-Suite] NPC field list was missing its "${role}" field; the default was restored.`);
            });
        }

        // Structural metadata is code's, not the reader's, so it is re-read from
        // the defaults on every load rather than trusted from storage.
        //
        // Without this, a profile saved before a flag existed keeps the old
        // behaviour for good: `fixed` shipped after the field list did, so every
        // profile written in between has a fields array with no `fixed` on it,
        // and the editor would go on listing Name and Age forever.
        //
        // What the reader owns — label, placeholder, order, persistent,
        // updatable — is never touched here.
        const npcDefaultById = new Map(NPC_DEFAULT_FIELDS.map(f => [f.id, f]));
        localProfile.npcBank.fields.forEach(f => {
            const def = npcDefaultById.get(f && f.id);
            if (!def) return;   // a field the reader added; nothing to sync
            f.fixed = def.fixed === true;
            if (def.system) f.system = def.system; else delete f.system;
            if (def.ownLine) f.ownLine = true;
            if (def.itemFormat && !f.itemFormat) f.itemFormat = def.itemFormat;
            if (!f.icon) f.icon = def.icon;
            if (!f.color) f.color = def.color;
        });
    }
    if (!localProfile.memoryCore) {
        localProfile.memoryCore = defaults.memoryCore;
    } else {
        if (localProfile.memoryCore.chunkSize === undefined) localProfile.memoryCore.chunkSize = 10;
    }
    if (!localProfile.dnRatio) localProfile.dnRatio = defaults.dnRatio;
    if (!localProfile.onomatopoeia) localProfile.onomatopoeia = defaults.onomatopoeia;
    if (!localProfile.worldState) localProfile.worldState = { compactEnabled: false, fullFreq: 5 };
    // Prompt blocks are stored as a diff against DEFAULT_PROMPTS. Put the untouched keys
    // back before anything reads them. Runs after the patching above has guaranteed each
    // module container exists, so a profile saved before a module shipped is covered too.
    meguminRehydrateProfilePrompts(localProfile);

    // The dossier template is generated from the field list now, so a stored
    // hand-edit of it is no longer read. Nothing is deleted and nothing breaks —
    // it simply stops applying, which is exactly the kind of silent change worth
    // saying out loud. Once per install, not once per chat.
    if (localProfile.npcBank && localProfile.npcBank.customPrompts
        && typeof localProfile.npcBank.customPrompts.dossierTemplate === "string"
        && localProfile.npcBank.customPrompts.dossierTemplate.trim() !== ""
        && !extension_settings[extensionName].globalSettings.npcTemplateNoticeShown) {
        extension_settings[extensionName].globalSettings.npcTemplateNoticeShown = true;
        saveSettingsDebounced();
        console.log("[Megumin Suite] A hand-edited NPC dossier template was found. The template is generated from the NPC Bank's field list now, so that edit is no longer applied — rebuild it as fields in the NPCs Bank tab.");
        if (typeof toastr !== "undefined") {
            toastr.info(
                "Your edited NPC dossier template is no longer used — the dossier is built from the field list in the NPCs Bank tab now. Your old text is still stored, nothing was deleted.",
                "Megumin Suite — NPC template moved",
                { timeOut: 12000 }
            );
        }
    }

    // Block stack. Built once from whatever the old per-block toggles said, so an
    // upgrading profile keeps the exact blocks it already had, in a sensible
    // order. localProfile.blocks stays written in parallel — it still drives the
    // legacy per-tag injection path, and a downgrade must not wipe anyone's setup.
    if (!localProfile.blockStack || !Array.isArray(localProfile.blockStack.order)) {
        const order = [];
        MEGUMIN_BLOCK_REGISTRY.forEach(b => {
            // System blocks are never in the stack: they are appended at the end
            // whenever their feature is on, and the reader does not arrange them.
            if (b.system) return;
            if (!(b.legacyIds || []).some(id => (localProfile.blocks || []).includes(id))) return;
            if (b.preferFirst) order.unshift(b.id); else order.push(b.id);
        });
        localProfile.blockStack = { order, custom: [], overrides: {} };
    }
    // A profile written before Enhanced Dialogue existed has no map at all.
    if (!localProfile.enhancedDialogue || typeof localProfile.enhancedDialogue !== "object") {
        localProfile.enhancedDialogue = {};
    }
    if (!localProfile.statBlocks) localProfile.statBlocks = JSON.parse(JSON.stringify(defaults.statBlocks));
    Object.keys(defaults.statBlocks).forEach(k => {
        if (!localProfile.statBlocks[k] || !Array.isArray(localProfile.statBlocks[k].fields)) {
            localProfile.statBlocks[k] = JSON.parse(JSON.stringify(defaults.statBlocks[k]));
        }
    });
    if (!Array.isArray(localProfile.blockStack.custom)) localProfile.blockStack.custom = [];
    if (!localProfile.blockStack.overrides) localProfile.blockStack.overrides = {};
    // A profile written before system blocks were pinned can still be carrying
    // them in the stack, where they would now show up twice.
    const systemIds = MEGUMIN_BLOCK_REGISTRY.filter(b => b.system).map(b => b.id);
    localProfile.blockStack.order = localProfile.blockStack.order.filter(id => !systemIds.includes(id));
    meguminSyncLegacyBlockIds();

    if (localProfile.devOverrides && Object.keys(localProfile.devOverrides).length > 0) {
        localProfile.devOverrides = {};
        saveSettingsDebounced();
    }

    // Captured BEFORE the migration blocks below run. A block that was already in this
    // chat's metadata on entry got there in an earlier session and survived a reload, so
    // the settings-side copy is provably redundant. A block this pass has only just
    // written is NOT counted: saveMetadata() could still fail, and the settings copy is
    // the sole remaining original until it lands. Those clean up on the next open.
    const metaHadOnEntry = {
        memory: !!(chat_metadata && chat_metadata["megumin_memory_core"]),
        plan: !!(chat_metadata && chat_metadata["megumin_story_plan"]),
        npcs: !!(chat_metadata && chat_metadata["megumin_npc_bank"])
    };

    if (chat_metadata && chat_metadata["megumin_memory_core"]) {
        if (localProfile.memoryCore) {
            localProfile.memoryCore.shortTermChunks = chat_metadata["megumin_memory_core"].shortTermChunks || [];
            localProfile.memoryCore.longTermVault = chat_metadata["megumin_memory_core"].longTermVault || [];
        }
    } else if (chat_metadata && localProfile.memoryCore && (localProfile.memoryCore.shortTermChunks?.length > 0 || localProfile.memoryCore.longTermVault?.length > 0)) {
        chat_metadata["megumin_memory_core"] = {
            shortTermChunks: localProfile.memoryCore.shortTermChunks || [],
            longTermVault: localProfile.memoryCore.longTermVault || []
        };
        saveMetadata();
    }

    if (chat_metadata && chat_metadata["megumin_story_plan"]) {
        if (localProfile.storyPlan) {
            localProfile.storyPlan.currentPlan = chat_metadata["megumin_story_plan"].currentPlan || "";
            localProfile.storyPlan.lastTrackerState = chat_metadata["megumin_story_plan"].lastTrackerState || "";
        }
    } else if (chat_metadata && localProfile.storyPlan && (localProfile.storyPlan.currentPlan || localProfile.storyPlan.lastTrackerState)) {
        chat_metadata["megumin_story_plan"] = {
            currentPlan: localProfile.storyPlan.currentPlan || "",
            lastTrackerState: localProfile.storyPlan.lastTrackerState || ""
        };
        saveMetadata();
    }

    // --- LOAD AUTO PORTRAITS FROM CHAT METADATA (this fork) ---
    // Portraits of unbanked characters are chat data, like the NPC list: a new chat
    // starts with none, whatever the character profile carried over.
    localProfile.portraits = (chat_metadata && chat_metadata["megumin_portraits"] && typeof chat_metadata["megumin_portraits"] === "object")
        ? { ...chat_metadata["megumin_portraits"] }
        : {};
    // --- LOAD NPCs FROM CHAT METADATA ---
    if (chat_metadata && chat_metadata["megumin_npc_bank"]) {
        if (localProfile.npcBank) {
            localProfile.npcBank.npcs = chat_metadata["megumin_npc_bank"].npcs || [];
        }
    } else if (chat_metadata && localProfile.npcBank && localProfile.npcBank.npcs?.length > 0) {
        // Migration: If NPCs are stuck in settings.json, move them to the chat file!
        chat_metadata["megumin_npc_bank"] = {
            npcs: localProfile.npcBank.npcs || []
        };
        saveMetadata();
    }

    // Records banked before their auto portrait was moved onto them pick it up here,
    // now that both the bank and the portrait map belong to this chat.
    (localProfile.npcBank?.npcs || []).forEach(n => adoptPortraitIntoRecord(n));
    // The three blocks above are still a migration SOURCE: a chat opened for the first
    // time since chat_metadata became the home for this data has its only copy sitting in
    // settings.json. That residue is the other half of what makes settings.json large, so
    // it is dropped once the chat's own metadata is confirmed to carry the data.
    //
    // Only the exact chat-level key is touched. A character-level profile is shared by
    // every chat of that character and a parent-chat profile by every branch off it, so
    // one chat migrating its copy says nothing about the rest — clearing either would
    // destroy NPCs and memory belonging to chats that have not been opened yet. Those
    // keys keep their residue, which is the safe side to err on.
    if (chat_metadata && activeKey && activeKey === chatLevelKey && activeKey.startsWith('chat::')) {
        const stored = extension_settings[extensionName].profiles[activeKey];
        if (stored) {
            let freed = false;
            if (metaHadOnEntry.memory && stored.memoryCore
                && (stored.memoryCore.shortTermChunks !== undefined || stored.memoryCore.longTermVault !== undefined)) {
                delete stored.memoryCore.shortTermChunks;
                delete stored.memoryCore.longTermVault;
                freed = true;
            }
            if (metaHadOnEntry.plan && stored.storyPlan
                && (stored.storyPlan.currentPlan !== undefined || stored.storyPlan.lastTrackerState !== undefined)) {
                delete stored.storyPlan.currentPlan;
                delete stored.storyPlan.lastTrackerState;
                freed = true;
            }
            if (metaHadOnEntry.npcs && stored.npcBank && stored.npcBank.npcs !== undefined) {
                delete stored.npcBank.npcs;
                freed = true;
            }
            if (stored.portraits !== undefined) {
                delete stored.portraits;
                freed = true;
            }
            if (freed) saveSettingsDebounced();
        }
    }

    let displayName = "Global Default";
    if (isGroup) {
        if (context.groups && Array.isArray(context.groups)) {
            const group = context.groups.find(g => String(g.id) === String(context.groupId));
            if (group && group.name) displayName = group.name;
            else displayName = `Group Chat (${context.groupId})`;
        } else { displayName = "Group Chat"; }
    } else if (chatLevelKey && context.characterId !== undefined && context.characters[context.characterId]) {
        displayName = context.characters[context.characterId].name;
    }

    const saveLevel = getProfileLevel();
    const levelIcons = { chat: '🎯', character: '👤', group: '👥', global: '⚙️' };
    const levelLabels = { chat: 'Chat', character: 'Character', group: 'Group', global: 'Global' };
    const levelColors = { chat: '#a855f7', character: '#3b82f6', group: '#f59e0b', global: '#6b7280' };
    
    if (isGroup) {
        $("#ps_char_rule_label").html(`${displayName} <span class="ps-level-badge" style="background:${levelColors[saveLevel]};">${levelIcons[saveLevel]} ${levelLabels[saveLevel]}</span>`);
    } else {
        $("#ps_char_rule_label").html(`${displayName} <span class="ps-level-badge" style="background:${levelColors[saveLevel]};">${levelIcons[saveLevel]} ${levelLabels[saveLevel]}</span>`);
    }
    fireRefreshHook(REFRESH.QUICK_GEN_BUTTON);
    fireRefreshHook(REFRESH.TOKEN_COUNT);
    pruneFutureData(); // Automatically prune out-of-bounds future data on load/initialization
    fireRefreshHook(REFRESH.MEMORY_VISUALS);

    // Remember the key this profile came from, so a save still pending when the
    // chat switches can be flushed to it after ST has moved on to the next chat.
    setLoadedProfileKey(chatLevelKey || "default");
    // Fresh profile in memory — nothing the user typed is waiting to be written.
    _profileSavePending = false;

    // The side panel renders 50ms after CHAT_CHANGED but the profile only lands
    // here at +200ms, so profile-fed sections would still show the previous chat.
    try { refreshSidePanel(); } catch (e) { /* side panel may not be mounted yet */ }
    try { refreshPresentBar(); } catch (e) { /* present bar may not be mounted yet */ }
}

export function pruneFutureData() {
    const context = typeof getContext === "function" ? getContext() : null;
    
    // FIX 1: Ensure chat is fully loaded and not empty
    if (!context || !Array.isArray(context.chat) || context.chat.length === 0) return;
    
    // FIX 2: Skip pruning if SillyTavern is currently generating (fixes swipe/regenerate bug)
    if (typeof isGenerating === "function" && isGenerating()) return; 

    const chatLength = context.chat.length;
    let changesMade = false;

    // 1. Prune Memory Core Chunks
    const mem = localProfile?.memoryCore;
    if (mem) {
        if (mem.shortTermChunks && mem.shortTermChunks.length > 0) {
            const originalLength = mem.shortTermChunks.length;
            mem.shortTermChunks = mem.shortTermChunks.filter(chunk => {
                const parts = chunk.id.split("-");
                if (parts.length < 2) return true; 
                return parseInt(parts[1]) < chatLength;
            });
            if (mem.shortTermChunks.length !== originalLength) {
                changesMade = true;
                delete mem._archivedSet;
                mem._tokensDirty = true;
            }
        }

        if (mem.longTermVault && mem.longTermVault.length > 0) {
            const originalLength = mem.longTermVault.length;
            mem.longTermVault = mem.longTermVault.filter(chunk => {
                const parts = chunk.id.split("-");
                if (parts.length < 2) return true;
                return parseInt(parts[1]) < chatLength;
            });
            if (mem.longTermVault.length !== originalLength) {
                changesMade = true;
                delete mem._archivedSet;
                mem._tokensDirty = true;
            }
        }
    }

    // 2. Prune NPC Bank (SMART SURVIVAL LOGIC)
    const npcBank = localProfile?.npcBank;
    if (npcBank && npcBank.npcs && npcBank.npcs.length > 0) {
        const originalLength = npcBank.npcs.length;
        
        // Grab the last 20 messages to check for NPC survival if their index is out of bounds
        const recentText = context.chat.slice(-20).map(m => m.mes).join(" ");

        // Named NPCs the rewind culled, so the user can be told who vanished.
        // Nameless entries are corrupted records rather than characters anyone
        // recognises, so they are dropped silently and left out of the count.
        const removedNpcNames = [];

        npcBank.npcs = npcBank.npcs.filter(npc => {
            if (npc.messageIndex !== undefined && npc.messageIndex !== null) {
                if (npc.messageIndex >= chatLength) {
                    const fullName = typeof npc.name === "string" ? npc.name.trim() : "";
                    if (!fullName) return false; // Cull corrupted/nameless NPCs

                    // Test the first token. The lookahead (?=\W|$) replaces the trailing \b, 
                    // which prevents bugs with names ending in parentheses or quotes.
                    const firstToken = fullName.split(/\s+/)[0];
                    const nameRegex = new RegExp(`\\b${escapeRegex(firstToken)}(?=\\W|$)`, 'i');
                    const dossierRegex = new RegExp(`New NPC:\\s*${escapeRegex(fullName)}`, 'i');

                    const survived = nameRegex.test(recentText) || dossierRegex.test(recentText);

                    if (survived) {
                        // messageIndex left untouched so the original creation point survives
                        changesMade = true; 
                        return true;
                    }
                    removedNpcNames.push(fullName);
                    return false; // Cull them (they are truly gone)
                }
            }
            return true; // Keep established NPCs (index < chatLength)
        });

        if (npcBank.npcs.length !== originalLength) {
            changesMade = true;
        }

        // An NPC disappearing from the bank is silent otherwise: the entry is
        // simply gone the next time the tab is opened, with nothing saying why.
        if (removedNpcNames.length > 0) {
            toastr.info(
                removedNpcNames.join(", "),
                `Megumin Suite — ${removedNpcNames.length} NPC${removedNpcNames.length === 1 ? "" : "s"} removed by rewind`
            );
        }
    }

    // 2c. Roll back dossier updates that arrived in messages the rewind removed.
    //
    // Runs after the NPC cull above, so an NPC that vanished entirely takes its
    // history with it and this only has to consider the ones still here. A field
    // changed twice is restored to the value from before the EARLIER change —
    // see npcRollbackHistoryFrom, where that ordering is the whole point.
    if (npcRollbackHistoryFrom(chatLength)) {
        changesMade = true;
    }

    // 2b. Rebalance the working window.
    //
    // The prune above only drops chunks that point PAST the end of the chat.
    // Rewinding also moves the working-limit cutoff backwards over messages that
    // were archived while the chat was longer — those stay in _archivedSet, so
    // they remain dimmed in the UI and stripped from the prompt by the memory
    // interceptor, with no way back except pressing "Apply & Extract Pending".
    // Hand them back automatically instead.
    if (fireRefreshHook(REFRESH.MEMORY_SCRUB_OVERLAPS)) {
        changesMade = true;
    }

    // 3. Prune Story Director Plan
    const sp = localProfile?.storyPlan;
    if (sp && sp.currentPlan && sp.planMessageIndex !== undefined && sp.planMessageIndex !== null) {
        if (sp.planMessageIndex >= chatLength) {
            sp.currentPlan = "";
            sp.planMessageIndex = null;
            sp.lastTrackerState = "";
            changesMade = true;
            if ($("#sd_current_plan").length) {
                $("#sd_current_plan").val("");
                $("#sd_btn_evolve").prop("disabled", true);
            }
        }
    }

    if (changesMade) {
        saveProfileToMemory();
        console.log(`[Megumin Suite] Pruned/Adjusted out-of-bounds future data (chat length: ${chatLength})`);
        
        fireRefreshHook(REFRESH.MEMORY_ACCORDION);
        fireRefreshHook(REFRESH.MEMORY_VAULT, $("#mem_vault_search").val() || "");
        fireRefreshHook(REFRESH.MEMORY_DASHBOARD);
        fireRefreshHook(REFRESH.MEMORY_VISUALS);
        fireRefreshHook(REFRESH.NPC_LIST);
    }
}

export function saveProfileToMemory() {
    const key = getCharacterKey() || "default";

    // `key` is the live truth; localProfile belongs to _loadedProfileKey, which is set in
    // the same synchronous block as localProfile itself. They disagree whenever the chat
    // has moved on but the profile has not caught up yet (initProfile runs 200ms after
    // CHAT_CHANGED) or when a long await outlived a chat switch. Decline the whole save
    // instead of quietly redirecting it to _loadedProfileKey: that is the kind of guesswork
    // that caused the earlier flush bug, and the caller may be holding data that is stale
    // in its own right. _profileSavePending is deliberately left alone so
    // flushProfileSettingsToLoadedKey() can still write the settings half under the key
    // the data actually belongs to; initProfile clears the flag when the next profile
    // loads, so it cannot leak into an untouched chat.
    if (_loadedProfileKey && key !== _loadedProfileKey) {
        console.debug(`[Megumin-Suite] saveProfileToMemory declined: the profile in memory belongs to "${_loadedProfileKey}" but the active chat is now "${key}". Skipping the chat_metadata blocks and the settings write so this chat's data is not saved into another chat.`);
        return;
    }

    _profileSavePending = false;
    const ruleBox = $("#ps_main_current_rule");
    if (ruleBox.length > 0) { localProfile.aiRule = ruleBox.val(); }

    // Invalidate the optimized archived-set cache when profile changes
    if (localProfile?.memoryCore) {
        localProfile.memoryCore._archivedSet = null;
        fireRefreshHook(REFRESH.MEMORY_CACHE_INVALIDATE);
    }

    // Save current avatar/character identifier inside the profile for identification/fuzzy matching
    if (key.startsWith('chat::')) {
        const avatar = getRawAvatar();
        if (avatar) {
            localProfile.chatAvatar = avatar;
        }
    }

    if (chat_metadata) {
        const mem = localProfile.memoryCore;
        const plan = localProfile.storyPlan;
        const bank = localProfile.npcBank;

        // Write a block if it has content now, or if the key already exists on the chat.
        // The second half is what keeps a deletion, and a bank left empty by the
        // settings.json migration in initProfile, from being skipped.
        if (mem && ((mem.shortTermChunks?.length > 0) || (mem.longTermVault?.length > 0)
            || chat_metadata["megumin_memory_core"] !== undefined)) {
            if (!chat_metadata["megumin_memory_core"]) chat_metadata["megumin_memory_core"] = {};
            chat_metadata["megumin_memory_core"].shortTermChunks = mem.shortTermChunks || [];
            chat_metadata["megumin_memory_core"].longTermVault = mem.longTermVault || [];
        }

        if (plan && (plan.currentPlan || plan.lastTrackerState
            || chat_metadata["megumin_story_plan"] !== undefined)) {
            if (!chat_metadata["megumin_story_plan"]) chat_metadata["megumin_story_plan"] = {};
            chat_metadata["megumin_story_plan"].currentPlan = plan.currentPlan || "";
            chat_metadata["megumin_story_plan"].lastTrackerState = plan.lastTrackerState || "";
        }

        if (bank && ((bank.npcs?.length > 0) || chat_metadata["megumin_npc_bank"] !== undefined)) {
            if (!chat_metadata["megumin_npc_bank"]) chat_metadata["megumin_npc_bank"] = {};
            chat_metadata["megumin_npc_bank"].npcs = bank.npcs || [];
        }

        const portraits = localProfile.portraits;
        if (portraits && (Object.keys(portraits).length > 0 || chat_metadata["megumin_portraits"] !== undefined)) {
            chat_metadata["megumin_portraits"] = { ...portraits };
        }

        const hasAnyBlock = !!(chat_metadata["megumin_memory_core"]
            || chat_metadata["megumin_story_plan"]
            || chat_metadata["megumin_npc_bank"]
            || chat_metadata["megumin_portraits"]);

        if (hasAnyBlock) {
            // chat_metadata ends up holding the same array objects as localProfile, so
            // comparing the two would report "equal" even right after a push. Compare
            // against the last thing that actually went to disk instead. `key` is in the
            // stamp so switching chats cannot reuse a stale one.
            const metaStamp = key + "|" + JSON.stringify([
                chat_metadata["megumin_memory_core"] || null,
                chat_metadata["megumin_story_plan"] || null,
                chat_metadata["megumin_npc_bank"] || null,
                chat_metadata["megumin_portraits"] || null
            ]);
            if (metaStamp !== _lastSavedMetaStamp) {
                _lastSavedMetaStamp = metaStamp;
                saveMetadata();
            }
        }
    }

    const profileToSave = JSON.parse(JSON.stringify(localProfile));
    if (profileToSave.memoryCore) {
        delete profileToSave.memoryCore.shortTermChunks;
        delete profileToSave.memoryCore.longTermVault;
    }
    if (profileToSave.storyPlan) {
        delete profileToSave.storyPlan.currentPlan;
        delete profileToSave.storyPlan.lastTrackerState;
    }
    if (profileToSave.npcBank) {
        delete profileToSave.npcBank.npcs; // DO NOT save NPCs in settings.json!
    }

    delete profileToSave.portraits; // chat data, lives in chat_metadata like the NPCs
    // Drop prompt text that matches DEFAULT_PROMPTS. Safe on profileToSave because it is
    // already a clone; localProfile keeps the full text the editor is bound to.
    meguminSparsifyProfilePrompts(profileToSave);

    extension_settings[extensionName].profiles[key] = profileToSave;
    saveSettingsDebounced();

    // A tab set to global copies itself out on every save. Hooking it here rather
    // than on each control is what makes it true for every change, including the
    // ones added later.
    fireRefreshHook(REFRESH.TAB_PROPAGATE);

    fireRefreshHook(REFRESH.TOKEN_COUNT); // NEW: Update the UI whenever settings are saved!
    try { refreshSidePanel(); } catch (e) { /* side panel may not be mounted yet */ }

    const saveInd = $("#ps_save_indicator");
    if (saveInd.length) {
        const level = getProfileLevel();
        const levelIcons = { chat: '🎯', character: '👤', group: '👥', global: '⚙️' };
        const levelLabels = { chat: 'Chat', character: 'Character', group: 'Group', global: 'Global' };
        saveInd.html(`<i class="fa-solid fa-check"></i> Saved <span class="ps-profile-badge">${levelIcons[level]} ${levelLabels[level]}</span>`).fadeIn(150);
        clearTimeout(window.psSaveTimer);
        window.psSaveTimer = setTimeout(() => saveInd.fadeOut(400), 2000);
    }
}

// FLUSH A PENDING PROFILE SAVE BEFORE THE CHAT SWITCHES (regression H8).
// CHAT_CHANGED fires AFTER SillyTavern has repointed chat_metadata and context.chatId
// at the NEW chat, so a full saveProfileToMemory() here would write the old profile
// under the new chat's key and copy the old chat's memory blocks into the new chat's
// metadata. Only the settings half is flushed, and only under the key the live
// profile was actually loaded from.
export function flushProfileSettingsToLoadedKey() {
    // Only flush a save the user actually triggered. Without this, every chat switch
    // would write a chat-level profile for a chat that was merely inheriting the
    // character-level one, and that inheritance would be gone for good.
    if (!_profileSavePending) return;
    if (!_loadedProfileKey) return;
    if (!localProfile || !extension_settings[extensionName]?.profiles) return;

    const ruleBox = $("#ps_main_current_rule");
    if (ruleBox.length > 0) { localProfile.aiRule = ruleBox.val(); }

    // The same reset the full save does. The archived-set cache is a Set, which
    // JSON.stringify turns into `{}`; every stored profile holds null there, so
    // writing `{}` would be a shape nothing else produces and the archived-message
    // dimming would read it back as an empty cache instead of "not built yet".
    if (localProfile?.memoryCore) {
        localProfile.memoryCore._archivedSet = null;
    }

    const profileToSave = JSON.parse(JSON.stringify(localProfile));
    if (profileToSave.memoryCore) {
        delete profileToSave.memoryCore.shortTermChunks;
        delete profileToSave.memoryCore.longTermVault;
    }
    if (profileToSave.storyPlan) {
        delete profileToSave.storyPlan.currentPlan;
        delete profileToSave.storyPlan.lastTrackerState;
    }
    if (profileToSave.npcBank) {
        delete profileToSave.npcBank.npcs; // DO NOT save NPCs in settings.json!
    }

    meguminSparsifyProfilePrompts(profileToSave);

    extension_settings[extensionName].profiles[_loadedProfileKey] = profileToSave;
    saveSettingsDebounced();
    _profileSavePending = false;
}

// Split in two so the ~30 call sites stay as they are while the flush gets a dirty
// flag. cancelDebounce() has to be handed the INNER function: that is the one
// debounce() returned and registered in its map, and the wrapper is unknown to it.
export const _saveProfileDebouncedInner = debounce(saveProfileToMemory, 500);
export const saveProfileDebounced = () => { _profileSavePending = true; _saveProfileDebouncedInner(); };
