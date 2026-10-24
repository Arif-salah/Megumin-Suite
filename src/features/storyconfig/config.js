// ──────────────────────────────────────────────────────────────────────────────
// Story Config — the field definitions and the block they compile into.
//
// Data and pure derivations only. The tab that edits them is UI and stays out.
// profile.js needs normalizeStoryConfig on load and buildBaseDict needs
// buildConfigBlock, so this layer sits below both.
// ──────────────────────────────────────────────────────────────────────────────


import { extension_settings } from "../../st.js";
import { extensionName } from "../../core/constants.js";
import { storySettingsBlock } from "../../prompts/v11Rules.js";

// The preamble is always emitted whenever the block is emitted at all.
export const CONFIG_PREAMBLE = `These are standing settings for this story. Where a setting here contradicts anything above, this block wins. These apply to the whole story, not a single scene.`;

// Every field is a single string on localProfile.storyConfig.
// Empty string = the field is off and its line never reaches the prompt.
// "select" fields offer a Custom… escape hatch so a user can write their own sentence
// ("hard. the world is against {{user}}") instead of the canned value.
export const storyConfigFields = [
    {
        key: "genre", tag: "genre", label: "Genre", icon: "fa-masks-theater", color: "#f59e0b", type: "text",
        placeholder: "e.g. horror, romance",
        aiNote: "sets the conventions the story plays straight, never comments on",
        hint: "The story's genre and the conventions that come with it. Played straight, never commented on.",
        // The first twelve are the genres readers asked for, in the order they
        // asked for them, so the common answer is the nearest one to hand. The
        // rest are the original list, kept because they are more specific than
        // what a survey answer tends to be — somebody who wants noir will not
        // write "drama".
        chips: [
            "slice of life", "romance", "fantasy", "action", "sci-fi", "drama",
            "horror", "comedy", "thriller", "anime", "adventure", "tabletop RPG",
            "noir", "mystery", "survival", "dark fantasy", "workplace comedy",
            "political thriller", "tragedy"
        ]
    },
    {
        key: "culture", tag: "culture", label: "Culture & Setting", icon: "fa-globe", color: "#22c55e", type: "text",
        placeholder: "e.g. Japanese, Western",
        aiNote: "the cultural world — names, honorifics, food, manners, idiom",
        hint: "The cultural world the story runs on — names, honorifics, food, manners, social rules and the idiom people speak in. Works with era to place the story.",
        chips: [
            "Japanese", "Korean", "Chinese", "wuxia / xianxia", "Southeast Asian", "Indian",
            "Middle Eastern", "North African", "West African", "Latin American", "Brazilian",
            "American", "Wild West frontier", "British", "Irish", "French", "Italian",
            "Mediterranean", "Nordic", "Slavic", "Greco-Roman", "high fantasy European",
            "steampunk Victorian", "cyberpunk East Asian", "post-Soviet"
        ]
    },
    {
        key: "era", tag: "era", label: "Era", icon: "fa-hourglass-half", color: "#d97706", type: "text",
        placeholder: "e.g. 1980s",
        aiNote: "the period the world runs on",
        hint: "The year or period the world runs on.",
        chips: ["ancient", "medieval", "renaissance", "victorian", "1920s", "1950s", "1970s", "1980s", "1990s", "present day", "near future", "far future", "post-apocalyptic"]
    },
    {
        key: "pov", tag: "pov", label: "Point of View", icon: "fa-eye", color: "#3b82f6", type: "select",
        hint: "How the story names your character: by name, as \"you\", or with the main character telling it as \"I\".",
        customPlaceholder: "e.g. third person, and {{user}} is only ever called \"the stranger\"",
        // Plan 018: the person only. Whose head the narration follows is the
        // writing style's (V11 Inside), so the old head options all read as
        // third person now, and so do the sentences they used to send.
        options: [
            { label: "third person", legacy: ["third limited", "third limited following one character", "third limited following one NPC", "third omniscient", "roving",
                "third person limited — one focal consciousness per scene. The reader learns only what the focal character perceives, and the gaps in their knowledge stand", "third person limited, locked to a single character for the whole scene — their perception is the boundary of the narration. Changing heads mid-scene is PROHIBITED; change only at a scene break", "third person omniscient — access to every interior. The narration MAY move between minds, but each shift MUST be legible rather than slid into", "third person limited, roving — the focal character MAY change between scenes, NEVER within one. Each scene commits to a vantage and holds it to the end"],
              value: "third person. Your narration calls {{user}} by name or he/she" },
            { label: "second person", legacy: ["second person on {{user}}", `second person — the narration addresses {{user}} as "you". Narrate what reaches {{user}}; NEVER what {{user}} decides, says, or feels about it`],
              value: `second person. Your narration calls {{user}} "you"` },
            { label: "first person", legacy: [`first person — the focal character's "I", never {{user}}'s. Their bias colors every observation; they MAY be wrong about what they report`],
              value: `first person. {{char}} tells the story as "I", and your narration calls {{user}} by name or he/she` }
        ]
    },
    {
        key: "focus", tag: "focus", label: "Focus", icon: "fa-crosshairs", color: "#eab308", type: "text",
        placeholder: "e.g. the camera follows Maya",
        aiNote: "whose story the camera favours",
        hint: "Whose story this is, if the camera should favour someone other than {{user}}. Name them.",
        chips: []
    },
    {
        key: "tone", tag: "narration tone", label: "Narration Tone", icon: "fa-cloud-sun-rain", color: "#a855f7", type: "text",
        placeholder: "e.g. bleak, absurd",
        aiNote: "the emotional weather over everything; overrides the default register",
        hint: "The mood that sits over the whole story, whatever is happening in a given scene.",
        // "lighthearted" is the one readers asked for by name — the opposite of
        // grimdark. It sits first because it is the counterweight to what these
        // engines default to, and warm/playful were near enough to look like it
        // without being it.
        chips: ["lighthearted", "warm", "bleak", "absurd", "tense", "melancholy", "playful", "dreamlike", "clinical", "wistful", "manic"]
    },
    {
        key: "narratorPresence", tag: "narrator_presence", label: "Narrator Presence", icon: "fa-comment-dots", color: "#14b8a6", type: "select",
        customPlaceholder: "e.g. heavy. comment on everything",
        hint: "How visible the narrator's attitude is. Light is your preset default.",
        defaultLabel: "light",
        defaultAliases: ["light", "light (one beat per response)", "light (default: one beat per response)"],
        options: [
            { label: "invisible", legacy: ["invisible (report only, no coloring)"],
              value: "report only — the narration carries no attitude toward what it describes and never editorialises" },
            { label: "heavy", legacy: ["heavy (commentary throughout)"],
              value: "the narrator's attitude is present throughout — dry, judging, or amused, and permitted to comment. The voice NEVER bleeds into any character's dialogue" }
        ]
    },
    {
        key: "npcSpeechStyle", tag: "npc_speech_style", label: "NPC Speech Style", icon: "fa-quote-left", color: "#0ea5e9", type: "text",
        placeholder: "e.g. 1980s poetic",
        aiNote: "how NPCs sound when they speak",
        hint: "Override how the NPCs sound.",
        chips: ["medieval poetic", "shakespearean", "victorian formal", "1920s slang", "1970s street", "1980s poetic", "modern casual", "corporate", "military clipped", "rural drawl", "cyberpunk street", "archaic high fantasy"]
    },
    {
        key: "npcDisposition", tag: "npc_disposition", label: "NPC Disposition", icon: "fa-users", color: "#8b5cf6", type: "select",

        customPlaceholder: "e.g. cold. the NPCs don't like {{user}}",
        hint: "How the cast feels about {{user}} before they earn anything else. Ordinary is your preset default.",
        defaultLabel: "ordinary",
        defaultAliases: ["ordinary"],
        options: [
            { label: "warm", legacy: ["warm"],
              value: "the cast likes {{user}} and shows it — seeking {{user}} out, taking {{user}}'s side, and giving warmth, trust and attention freely. This is the ground state, not something {{user}} has to earn" },
            { label: "wary", legacy: ["wary"],
              value: "the cast is polite but reserved with {{user}} — friendly on the surface, holding back what matters until they know {{user}} better. The warmth is close to the surface and comes with time" },
            { label: "cold", legacy: ["cold"],
              value: "the cast is indifferent to {{user}} — {{user}}'s presence does not interest them and their own business outranks it. Attention has to be taken, not given" },
            { label: "hostile", legacy: ["hostile"],
              value: "the cast is against {{user}} — obstructing, needling, or freezing {{user}} out, and needing a real reason to stop" }
        ]
    },
    {
        key: "difficulty", tag: "difficulty", label: "Difficulty", icon: "fa-mountain", color: "#ef4444", type: "select",
        customPlaceholder: "e.g. hard. the world is against {{user}}",
        hint: "How hard the world pushes back on what {{user}} attempts. Realistic is your preset default.",
        defaultLabel: "realistic",
        defaultAliases: ["realistic", "realistic (default)"],
        options: [
            { label: "forgiving", legacy: ["forgiving (most attempts land)"],
              value: "most attempts land. Competence is assumed; failure arrives only where the fiction makes it unavoidable" },
            { label: "harsh", legacy: ["harsh (competence required, failure common, mistakes carry a real cost)"],
              value: "competence is required and failure is common. Mistakes carry a cost that persists past the scene they happen in" }
        ]
    },
    {
        key: "friction", tag: "friction", label: "Friction", icon: "fa-bolt", color: "#f97316", type: "select",
        customPlaceholder: "e.g. high. trouble is always around the corner",
        hint: "How often trouble arrives. Normal is your preset default.",
        defaultLabel: "normal",
        defaultAliases: ["normal", "normal (the preset's own curve)"],
        options: [
            { label: "low", legacy: ["low (only ever as earned consequence)"],
              value: "complications arrive only as earned consequence of something already in motion — never introduced to keep a scene busy" },
            { label: "high", legacy: ["high (complications every scene, pressure never fully releasing)"],
              value: "a complication lands every scene and pressure NEVER fully releases — one thing resolving uncovers the next" }
        ]
    },
    {
        key: "explicitness", tag: "explicitness", label: "Explicitness", icon: "fa-fire", color: "#e11d48", type: "select",
        customPlaceholder: "e.g. graphic. give details",
        hint: "How far scenes go and how directly they are written.",
        options: [
            { label: "fade to black", legacy: ["fade to black"],
              value: "fade to black — cut at the threshold of a sexual act and resume after it. The act MAY be acknowledged as having happened; it is NEVER depicted" },
            { label: "plain", legacy: ["plain"],
              value: "plain — depict intimacy and violence directly but without anatomical detail. State what happens; do not linger on it" },
            { label: "graphic", legacy: ["graphic"],
              value: "graphic — depict sex and violence in full physical detail, using direct words for bodies and acts. NEVER cut away, NEVER euphemise" }
        ]
    },
    {
        key: "pace", tag: "pace", label: "Pace", icon: "fa-gauge-high", color: "#10b981", type: "select",

        customPlaceholder: "e.g. steady, but skip anything that isn't a real beat",
        hint: "How fast story time moves.",
        options: [
            { label: "slow burn", legacy: ["slow burn"],
              value: "slow burn — the story moves slowly. Story time advances in minutes rather than days, and a situation is allowed to keep unfolding instead of being hurried toward its conclusion" },
            { label: "steady", legacy: ["steady"],
              value: "steady — the story keeps moving without rushing. Scenes get the time they need and no more: do not linger on a moment past its use, and do not rush ahead before it has played out" },
            { label: "fast", legacy: ["fast"],
              value: "fast — the story moves quickly. Cut through any interval that changed nothing and keep landing on live moments; time jumps and changes of location come easily" }
        ]
    },
    {
        key: "length", tag: "length", label: "Length", icon: "fa-ruler-horizontal", color: "#06b6d4", type: "select",
        customPlaceholder: "e.g. around 300 words, longer when a scene earns it",
        hint: "How long each reply should run.",
        options: [
            { label: "flexible", legacy: ["flexible"],
              value: "flexible — as short as 50 words for a quick one-on-one exchange, up to 700 when a scene earns the space. Match the length to what the moment actually needs; never pad to reach a number" },
            { label: "250–350 words", legacy: ["250–350 words"],
              value: "250–350 words per response. When trimming to fit, cut description before dialogue" },
            { label: "250–350 words, longer for fights and sex", legacy: ["250–350 words, longer for fights and sex"],
              value: "usually 250–350 words, longer only while a fight or sex scene is under way" },
            { label: "450–550 words", legacy: ["450–550 words"],
              value: "450–550 words per response. When trimming to fit, cut description before dialogue" },
            { label: "minimum 900 words", legacy: ["minimum 900 words"],
              value: "at least 900 words per response — earn the length with new material. NEVER pad by restating what the scene has already established" }
        ]
    },
    {
        key: "notes", tag: "notes", label: "Notes", icon: "fa-note-sticky", color: "#94a3b8", type: "textarea",
        placeholder: "e.g. never let Maya win",
        aiNote: "standing instruction, applies to the whole story",
        hint: "Any standing instruction that doesn't fit a field above."
    }
];

// The three settings the block always carries. A story has a viewpoint, a pace and a
// length whether or not the reader has thought about one, and the block is always on
// now, so these ship set rather than blank.
//
// Stored as the option LABEL, not the sentence the model reads: upgradeConfigValue
// resolves it on load, so the wording still lives in exactly one place (the option).
export const STORY_CONFIG_DEFAULTS = {
    pov: "third person",
    pace: "steady",
    length: "flexible"
};

// Fills any of the always-on fields that has been left blank. Deliberately NOT folded
// into normalizeStoryConfig: that runs before the legacy userPov migration in
// profile.js, and seeding pov there would fill the very field that migration tests,
// silently discarding a POV set on the old dropdown.
//
// Call it anywhere a field can be emptied -- Reset All and preset load both blank every
// key, and without this the three standing fields stay empty until the next profile
// load puts them back.
export function applyStoryConfigDefaults(cfg) {
    if (!cfg) return cfg;
    Object.keys(STORY_CONFIG_DEFAULTS).forEach(k => {
        if (!String(cfg[k] == null ? "" : cfg[k]).trim()) cfg[k] = STORY_CONFIG_DEFAULTS[k];
    });
    return normalizeStoryConfig(cfg);
}

// A field that always reaches the model has no "leave it to the preset" state, so its
// dropdown must not offer one.
export function isStandingConfigField(key) {
    return Object.prototype.hasOwnProperty.call(STORY_CONFIG_DEFAULTS, key);
}

// Starter presets. These are read-only; loading one copies its values into the profile.
export const builtInConfigPresets = [
    {
        id: "cfg_grimdark", name: "Grimdark Survival", builtin: true,
        values: { genre: "survival, dark fantasy", tone: "bleak", pov: "third person", pace: "steady", length: "450–550 words", difficulty: "harsh (competence required, failure common, mistakes carry a real cost)", friction: "high (complications every scene, pressure never fully releasing)", npcDisposition: "wary", explicitness: "graphic", narratorPresence: "", focus: "", culture: "high fantasy European", era: "", npcSpeechStyle: "", notes: "" }
    },
    {
        id: "cfg_cozy", name: "Cozy Slice of Life", builtin: true,
        values: { genre: "slice of life", tone: "warm", pov: "second person", pace: "slow burn", length: "250–350 words", difficulty: "forgiving (most attempts land)", friction: "low (only ever as earned consequence)", npcDisposition: "warm", explicitness: "fade to black", narratorPresence: "invisible (report only, no coloring)", focus: "", era: "present day", npcSpeechStyle: "modern casual", notes: "" }
    },
    {
        id: "cfg_noir", name: "Noir Mystery", builtin: true,
        values: { genre: "noir, mystery", tone: "melancholy", pov: "first person", pace: "steady", length: "450–550 words", difficulty: "", friction: "", npcDisposition: "wary", explicitness: "plain", narratorPresence: "heavy (commentary throughout)", focus: "", culture: "American", era: "1950s", npcSpeechStyle: "1920s slang", notes: "" }
    },
    {
        id: "cfg_horror", name: "Slow Dread Horror", builtin: true,
        values: { genre: "horror", tone: "tense", pov: "third person", pace: "slow burn", length: "minimum 900 words", difficulty: "harsh (competence required, failure common, mistakes carry a real cost)", friction: "high (complications every scene, pressure never fully releasing)", npcDisposition: "cold", explicitness: "graphic", narratorPresence: "", focus: "", era: "", npcSpeechStyle: "", notes: "Never resolve a threat in the same scene it appears." }
    },
    {
        id: "cfg_romance", name: "Slow Burn Romance", builtin: true,
        values: { genre: "romance", tone: "warm", pov: "second person", pace: "slow burn", length: "450–550 words", difficulty: "", friction: "", npcDisposition: "", explicitness: "plain", narratorPresence: "", focus: "", era: "", npcSpeechStyle: "", notes: "" }
    }
];

export function getAllConfigPresets() {
    const saved = extension_settings[extensionName].configPresets || [];
    return [...builtInConfigPresets, ...saved];
}

// A field whose value is its own named default (friction "normal", npc_disposition
// "ordinary", narrator_presence "light") is the same as leaving it on Default: the line
// is dropped. This folds those values back to "" so the UI shows Default rather than Custom…
// Upgrades a stored value that is one of an option's older spellings -- or just its
// short label -- to the full instruction the model now reads. Called from
// normalizeStoryConfig, which runs on profile load and on every block build, so it is
// idempotent and there is no separate migration to remember to run.
//
// A value matching nothing is returned untouched. That is either already current or
// something the reader typed into the Custom... box, and overwriting the second would
// throw away their words to fix a problem they do not have.
export function upgradeConfigValue(field, raw) {
    const v = String(raw == null ? "" : raw).trim();
    if (!v || !field.options) return v;
    const opts = field.options.map(o => typeof o === "string" ? { label: o, value: o } : o);
    if (opts.some(o => o.value === v)) return v;
    const lower = v.toLowerCase();
    const hit = opts.find(o =>
        String(o.label).toLowerCase() === lower ||
        (o.legacy || []).some(l => String(l).toLowerCase() === lower));
    return hit ? hit.value : v;
}

export function normalizeStoryConfig(cfg) {
    if (!cfg) return cfg;
    storyConfigFields.forEach(f => { cfg[f.key] = upgradeConfigValue(f, cfg[f.key]); });
    storyConfigFields.forEach(f => {
        if (!f.defaultAliases) return;
        const v = String(cfg[f.key] || "").trim().toLowerCase();
        if (v && f.defaultAliases.some(a => a.toLowerCase() === v)) cfg[f.key] = "";
    });
    return cfg;
}

export function countActiveConfigFields(cfg) {
    if (!cfg) return 0;
    return storyConfigFields.filter(f => cfg[f.key] && String(cfg[f.key]).trim() !== "").length;
}

// Compiles the profile's storyConfig into the <config> block that replaces [[config]].
// frame "v11" (V11 Тайна, plan 018): <story_settings> with its own preamble.
// The block is always on; it returns "" only when every field is empty, so the tag is
// stripped cleanly on a profile that has somehow been blanked.
export function buildConfigBlock(cfg, { frame } = {}) {
    if (!cfg) return "";

    normalizeStoryConfig(cfg);
    const lines = [];
    storyConfigFields.forEach(f => {
        const raw = cfg[f.key];
        if (!raw || String(raw).trim() === "") return;
        // The asterisked note tells the model what the field governs. pov carries none —
        // the value already says everything it needs to.
        const note = f.aiNote ? ` *${f.aiNote}*` : "";
        lines.push(`- ${f.tag}: ${String(raw).trim()}${note}`);
    });

    if (lines.length === 0) return "";
    if (frame === "v11") return storySettingsBlock(lines);
    return `<config>\n${CONFIG_PREAMBLE}\n\n${lines.join("\n")}\n</config>`;
}
