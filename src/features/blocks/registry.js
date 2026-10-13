// ──────────────────────────────────────────────────────────────────────────────
// Block definitions and everything derived from them.
//
// This is the foundation the rest of the extension sits on: the chat cleaner, the
// dict builder, the side panel and the Blocks tab all key off these definitions.
// It has no dependencies of its own beyond the profile, which is why it comes out
// first — extracting it unblocks the layers above.
//
// Rendering and the Blocks tab UI stay in index.js for now; only definitions,
// templates and pure derivations live here.
// ──────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../core/state.js";
import { getSidePanelSettings } from "../../sidepanel/panel.js";

// -------------------------------------------------------------
// BLOCK REGISTRY — one definition per block the <Blocks> envelope can carry
// -------------------------------------------------------------
//
// A block used to be defined in six places at once: a template in database.js, a
// trigger in the dict builder, a strip pattern in the cleaner, a pattern in the
// side panel's parsers, a section in sections.js and a special case or two on
// top. This is the one place now.
//
// `source` is the dict tag the block's content still comes from, which is what
// keeps engine overrides, custom prompts and the compact World State logic
// working untouched — the envelope assembles what those already produced rather
// than owning a second copy of every template.
//
// `selfWrapped` marks content that already carries its own tags (the Story
// Tracker template opens and closes <Story_Tracker> itself). Everything else is
// wrapped in `tag` at assembly time.
//
// `slot` is for a block the model emits conditionally rather than every turn: the
// envelope carries the instruction line instead of a template, and the model
// fills it in only when the block's own rules fire.
//
// `desc` is one line telling the READER what the block does, shown when they are
// deciding whether to add it. Distinct from the template, which tells the MODEL what
// to write. Optional -- a block without one simply shows no tooltip.
export const MEGUMIN_BLOCK_REGISTRY = [
    {
        id: "dice", tag: "Dice", label: "Roll",
        emoji: "\u{1F3B2}", icon: "fa-dice-d20", color: "#22d3ee",
        visibility: "open", builtin: true, system: true,
        // The model writes one <Dice> per roll as often as it writes one tag
        // holding every line, and a turn where everyone acts has several. Left
        // non-repeating, extractBlocks took the first and the rest vanished off
        // the screen. They are captured separately here and merged back into one
        // pane by the renderer, so either shape draws the same card.
        repeating: true,
        // THE ONE BLOCK THAT IS NOT IN THE ENVELOPE. The roll has to be written
        // before the prose or it is not a roll — a number chosen after the scene
        // exists is chosen to fit it. So the model writes <Dice> as the FIRST
        // thing in the reply, and the envelope, which sits at the end, never
        // carries it. `lead` is what tells the envelope builder to skip it and
        // the renderer to look for it at the top of the message instead of in
        // the tail.
        lead: true,
        // Owned by the Dice add-on rather than by the block stack: the reader
        // turns the add-on on and the tab follows. There is nothing to arrange.
        requires: p => Boolean(p && (p.addons || []).includes("dice"))
    },
    {
        id: "cyoa", tag: "CYOA", label: "Choices",
        desc: "Choose-Your-Own-Adventure panel with 4 suggested actions for you to pick from each turn.",
        emoji: "🎲", icon: "fa-list-check", color: "#38bdf8",
        visibility: "open", builtin: true,
        // The one block the reader acts on rather than reads, so it opens first
        // and sits at the front of the strip unless they move it.
        preferFirst: true,
        source: "[[cyoa]]", legacyIds: ["cyoa"]
    },
    {
        id: "world", tag: "World_State", label: "World State",
        desc: "Appends a tidy status panel after each response showing time, weather, location, and what characters are wearing.",
        emoji: "📌", icon: "fa-thumbtack", color: "#f59e0b",
        visibility: "open", builtin: true,
        source: "[[infoblock]]", legacyIds: ["info"]
    },
    {
        id: "chatter", tag: "NPC_Inner_Chatter", label: "NPC Inner Chatter",
        desc: "Reveal NPC private thoughts the PC never hears — crushes, resentment, scheming, anxiety. This feeds future NPC behavior.",
        emoji: "💭", icon: "fa-comment-dots", color: "#a855f7",
        visibility: "open", builtin: true,
        source: "[[npc_inner_chatter]]", legacyIds: ["npc_inner_chatter", "npc_inner_chatter_v2"]
    },
    {
        id: "bonds", tag: "Bonds", label: "Bonds",
        emoji: "❤️", icon: "fa-heart", color: "#f43f5e",
        visibility: "open", builtin: true,
        // Generated from the field list rather than read from a dict tag, so
        // adding a field changes what the model is asked for.
        build: () => meguminBuildBondsTemplate()
    },
    {
        id: "sheet", tag: "Character_Sheet", label: "Character Sheet",
        emoji: "🎒", icon: "fa-shield-halved", color: "#38bdf8",
        visibility: "open", builtin: true,
        build: () => meguminBuildSheetTemplate()
    },
    {
        id: "newNpc", tag: "New_NPC", label: "New NPC Dossier",
        emoji: "🆕", icon: "fa-user-plus", color: "#10b981",
        visibility: "open", builtin: true, repeating: true, system: true,
        // The dossier rules ride in [[npc_dossier]] elsewhere in the prompt. The
        // slot line only makes sense next to those rules, so it appears only on
        // the turns where they were actually injected — the NPC Bank decides that
        // per reply, not just by being switched on.
        // The literal tag pair, not a sentence describing it. Every other block
        // in the envelope shows the model a skeleton to fill in; a slot that only
        // described one in prose was the odd one out, and the model had to infer
        // the tag it was supposed to open from a mention of it mid-sentence.
        slot: `<New_NPC name="[Full Name]">\n[The full dossier goes here when this response introduces an NPC that earns one — follow the NPC DOSSIER rules above. Omit this whole tag otherwise.]\n</New_NPC>`,
        requires: p => Boolean(p.npcBank && p.npcBank.enabled),
        // Gated on [[npc_dossier2]] rather than [[npc_dossier]]. The latter now
        // also carries the UPDATE rules, which are injected whenever the bank has
        // anyone in it — so testing it would light this slot up even on a turn the
        // OOC trigger deliberately withheld the dossier rules. [[npc_dossier2]] is
        // set only when those rules actually went out.
        slotRequires: dict => Boolean(String(dict["[[npc_dossier2]]"] || "").trim())
    },
    {
        id: "npcUpdate", tag: "NPC_Update", label: "NPC Update",
        emoji: "🔄", icon: "fa-arrows-rotate", color: "#fbbf24",
        visibility: "open", builtin: true, repeating: true, system: true,
        // Same shape as New NPC above: the rules ride in their own dict tag and
        // the envelope carries only the slot line, so the block appears on the
        // turns the NPC Bank actually asked for it rather than on every turn.
        //
        // It is gated on the bank HAVING someone in it, not just on the feature
        // being on — there is nothing to update in an empty bank, and asking for
        // updates to nobody is tokens spent on a block that can never be filled.
        slot: `<NPC_Update name="[Exact name as it appears in the NPC bank]">\n[The changed lines go here when this response changed something already on file — follow the NPC UPDATES rules above. Omit this whole tag otherwise.]\n</NPC_Update>`,
        requires: p => Boolean(p.npcBank && p.npcBank.enabled && (p.npcBank.npcs || []).length > 0),
        slotRequires: dict => Boolean(String(dict["[[npc_updates]]"] || "").trim())
    },
    {
        id: "tracker", tag: "Story_Tracker", label: "Story Tracker",
        emoji: "🎬", icon: "fa-map", color: "#f43f5e",
        visibility: "open", builtin: true, system: true,
        source: "[[storytracker]]",
        requires: p => Boolean(p.storyPlan && p.storyPlan.enabled)
    }
];

// Content written for the old format opens with <details><summary>…</summary>
// and closes with </details>. An engine override or a custom prompt can still be
// carrying that, and wrapping it in a clean tag without taking the old wrapper
// off would put both in the prompt. The label inside the summary is dropped with
// it: the interface draws the header now.
// The body of one block, with whatever wrapper it arrived in taken off, so the
// envelope can put exactly one back. The templates carry their own <World_State>
// / <NPC_Inner_Chatter> tags now, but an engine override or a hand-edited custom
// prompt can still be carrying the old <details> pair, and the compact World
// State variant opens with a line of prose before its wrapper — so nothing here
// is anchored to the start or end of the content. Half a wrapper surviving into
// the envelope is worse than either format on its own.
export function normalizeBlockBody(content, tag) {
    let out = String(content || "")
        .replace(/<summary[^>]*>[\s\S]*?<\/summary\s*>/gi, "")
        .replace(/<\/?details[^>]*>/gi, "");
    if (tag) {
        out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
    }
    return out.replace(/\n{3,}/g, "\n\n").trim();
}

// The blocks that are actually going to be emitted this turn, in order: in the
// stack, and — for blocks owned by a subsystem — with that subsystem switched on.
export function meguminActiveBlocks() {
    const stack = (localProfile && localProfile.blockStack) || { order: [], custom: [] };
    const on = b => b && (typeof b.requires !== "function" || b.requires(localProfile));

    // Blocks the reader arranges: whatever is in the stack, in stack order.
    const chosen = (stack.order || [])
        .map(id => meguminBlockById(id))
        .filter(b => on(b) && !b.system);

    // System blocks are not the reader's to arrange. The Story Tracker and the
    // NPC dossier exist so features work, not as decoration, so they are on
    // whenever their feature is on and they always sit at the end of the block —
    // which is also where they read best, after the scene has been described.
    const system = MEGUMIN_BLOCK_REGISTRY.filter(b => b.system && on(b));

    return [...chosen, ...system];
}

// Assembles the <Blocks> envelope. Returns "" when nothing is active, so the
// [[blocks]] tag is stripped from the preset rather than leaving an empty shell.
//
// The instruction is a literal skeleton rather than a description of one. Models
// follow a structure they can see far more reliably than a structure they have to
// infer from prose, and the templates were already fill-in-the-blank.
export function buildBlocksEnvelope(dict) {
    const active = meguminActiveBlocks();
    if (!active.length) return "";

    const parts = [];
    active.forEach(b => {
        // A lead block is written before the prose, so it is deliberately not in
        // the envelope at all — the envelope is the last thing in the reply, and
        // asking for the roll there would put it after the scene it decides.
        // Its instructions ride in its own add-on instead.
        if (b.lead) return;

        // A conditional block contributes its instruction line, not a template,
        // and only on the turns its own subsystem actually asked for it.
        if (b.slot) {
            if (typeof b.slotRequires === "function" && !b.slotRequires(dict)) return;
            parts.push(b.slot);
            return;
        }

        // Any per-block header line comes off first: the envelope carries one of
        // its own, above everything.
        // Three ways a body arrives: a dict tag the rest of the pipeline already
        // produced (so engine overrides and custom prompts still apply), a
        // template generated from a field list, or a custom block's own text.
        let raw;
        if (typeof b.build === "function") raw = b.build();
        else if (b.source) raw = dict[b.source] || "";
        else raw = b.content || "";
        const body = normalizeBlockBody(
            String(raw).replace(/^#{1,3}\s*At the end of your response[^\n]*\n?/i, ""),
            b.tag
        );
        if (!body) return;

        parts.push(`<${b.tag}>\n${body}\n</${b.tag}>`);
    });

    if (!parts.length) return "";

    const header = [
        "## At the end of your response, output exactly one <Blocks> section.",
        "Put every block inside it, in this order, each in its own tag. Do not add tags that are not listed. Do not nest blocks inside each other. Close every tag you open. Never wrap a block in <details> or <summary> — the interface draws the header and the fold itself."
    ].join("\n");

    return `${header}\n\n<Blocks>\n${parts.join("\n")}\n</Blocks>`;
}

//
// The registry the renderer works from: built-ins plus whatever custom blocks
// the profile carries, with any per-block visibility override applied. Rebuilt
// on each call because a block's visibility can change under the reader while
// the chat is open.
export function meguminRenderRegistry() {
    const stack = (localProfile && localProfile.blockStack) || { custom: [], overrides: {} };
    const overrides = stack.overrides || {};
    return [...MEGUMIN_BLOCK_REGISTRY, ...(stack.custom || [])].map(def => {
        const o = overrides[def.id];
        return o && o.visibility ? { ...def, visibility: o.visibility } : def;
    });
}

// Which blocks the side panel has taken over. When it is on with inline hiding,
// a block it is already showing must not also sit in the chat card — that is the
// whole point of the setting. A block the panel does NOT show (its section is
// switched off, or nothing over there covers it, like the choices block) stays
// in the chat, because otherwise it would be nowhere at all.
export const MEGUMIN_PANEL_SECTION_BY_BLOCK = {
    world: "worldState",
    chatter: "innerChatter",
    newNpc: "newNpcs",
    tracker: "storyPlan"
};

export function meguminBlocksTakenByPanel() {
    let cfg = null;
    try { cfg = getSidePanelSettings(); } catch (e) { return []; }
    if (!cfg || !cfg.enabled || !cfg.hideInline) return [];

    const sections = cfg.sections || {};
    const taken = Object.entries(MEGUMIN_PANEL_SECTION_BY_BLOCK)
        .filter(([, sec]) => (sections[sec] ? sections[sec].visible !== false : true))
        .map(([blockId]) => blockId);
    // Block sections (this fork): every other block the panel draws through its
    // generic sections is taken as well, so nothing is on screen twice.
    meguminRenderRegistry().forEach(def => {
        if (!def || !def.id || MEGUMIN_PANEL_SECTION_BY_BLOCK[def.id]) return;
        const sec = sections["block:" + def.id];
        if (!sec || sec.visible !== false) taken.push(def.id);
    });
    return taken;
}

// -------------------------------------------------------------
// STAT BLOCKS — templates generated from their field lists
// -------------------------------------------------------------
//
// Every block spells out its own rules. None of them refers to another block,
// because any of them can be switched off: a Character Sheet that says "same
// rules as Bonds" is a Character Sheet with no rules the moment Bonds is out of
// the stack.

export function meguminStatFields(blockId) {
    const cfg = (localProfile && localProfile.statBlocks && localProfile.statBlocks[blockId]) || {};
    return Array.isArray(cfg.fields) ? cfg.fields.filter(f => f && f.label) : [];
}

// Every stat block's declared fields, keyed by block id, for the renderers.
//
// The card treatments live in `src/blocks/`, which is below this file and must
// stay generic — nothing down there is allowed to know that "sheet" has a field
// called Skills. So the field list is handed DOWN through the render options
// rather than imported UP, and this is what the two callers pass.
//
// Without it the sheet treatment has to guess a field's type from the shape of
// the line, and the guess is wrong in a way the reader sees: "Status: cleansed,
// starving" has a comma in it, so a sentence gets cut in half and drawn as two
// tags. The types were declared all along.
export function meguminStatFieldMap() {
    const out = {};
    Object.keys((localProfile && localProfile.statBlocks) || {}).forEach(id => {
        out[id] = meguminStatFields(id);
    });
    return out;
}

// One field as the model should see it, placeholders and all.
export function meguminStatFieldSpec(f) {
    const max = f.max || 100;
    switch (f.type) {
        case "meter": return `${f.label}: [0-${max}]/${max} [(±N reason) or (=)]`;
        case "number": return `${f.label}: [number] [(±N reason) or (=)]`;
        case "list": return `${f.label}: [${f.hint || "comma separated"}]`;
        default: return `${f.label}: [${f.hint || "value"}]`;
    }
}

// Change rules, written once per block from the fields it actually has. A block
// with no meters and no numbers gets no carry-forward paragraph, because there
// is nothing to carry.
export function meguminStatRules(fields, subject, opts = {}) {
    const tracked = fields.filter(f => f.type === "meter" || f.type === "number");
    if (!tracked.length) return "";

    const meters = fields.filter(f => f.type === "meter");
    const seeds = tracked.map(f => `${f.label} ${f.start !== undefined ? f.start : 0}`).join(", ");

    const lines = [
        `- Carry every number forward from the previous ${subject} block. Never reset one, and never invent a value that already exists.`,
        `- A number moves only when something in THIS scene moved it. Write the change and the reason in brackets, e.g. (-6 he apologised and she heard pity). When nothing moved it, write (=).`
    ];
    // The cap is for meters only. A counted field like Gold legitimately jumps by
    // hundreds, and a rule that forbids it would either be broken every time it
    // mattered or quietly stop the story from paying anyone.
    if (meters.length) {
        lines.push(`- ${meters.map(f => f.label).join(", ")} move at most 10 in one reply unless the scene plainly earns more.`);
    }
    lines.push(`- Starting values when there is no previous one${opts.perSubject ? " for that person" : ""}: ${seeds}.`);
    return lines.join("\n");
}

// The Bonds template: one line per NPC, generated from the field list.
export function meguminBuildBondsTemplate() {
    const fields = meguminStatFields("bonds");
    if (!fields.length) return "";
    const line = fields.map(meguminStatFieldSpec).join(" | ");
    return [
        "[One line per named NPC present in the scene, plus any NPC whose numbers changed this scene. Nobody else.",
        meguminStatRules(fields, "Bonds", { perSubject: true }),
        "- These are feelings, not bodies. Do not describe clothing, posture or location here.]",
        "",
        `[NPC Name]: ${line}`
    ].filter(Boolean).join("\n");
}

// The Character Sheet template: {{user}} only, so nothing repeats.
export function meguminBuildSheetTemplate() {
    const fields = meguminStatFields("sheet");
    if (!fields.length) return "";
    const inline = fields.filter(f => !f.ownLine).map(meguminStatFieldSpec).join(" | ");
    const own = fields.filter(f => f.ownLine).map(meguminStatFieldSpec);
    return [
        "[{{user}}'s sheet.",
        meguminStatRules(fields, "Character Sheet"),
        "- Inventory and skills change only when the story changes them. Do not restock or re-equip on your own.]",
        "",
        inline,
        ...own
    ].filter(Boolean).join("\n");
}

export function meguminBlockById(id) {
    return MEGUMIN_BLOCK_REGISTRY.find(b => b.id === id)
        || (localProfile && localProfile.blockStack && (localProfile.blockStack.custom || []).find(b => b.id === id));
}

// Every child tag the envelope can carry, custom blocks included. The cleaner
// strips each one on its own as well as taking the envelope whole, so a block
// that arrived outside a broken envelope is still kept away from the summariser,
// the vault, image prompts and the ban list. A tag missing from this list is a
// block that silently leaks, which is why it is derived rather than typed out.
export function meguminAllBlockTags() {
    const custom = (localProfile && localProfile.blockStack && localProfile.blockStack.custom) || [];
    const tags = [...MEGUMIN_BLOCK_REGISTRY.map(b => b.tag), ...custom.map(b => b.tag)];
    // Story_Tracker is stripped explicitly by the cleaner before this list is
    // used, and stripping it twice is harmless, but a duplicate here would build
    // the same RegExp twice on every cleaned message.
    return [...new Set(tags.filter(Boolean))];
}

// The card is tabs now, so a block is either a tab or it is not. "collapsed" is
// still accepted from profiles written before that and reads as shown.
export const BLOCK_VISIBILITY_CHOICES = [
    { v: "open", label: "Shown", hint: "Gets a tab in the chat card" },
    { v: "hidden", label: "Hidden", hint: "No tab. Still sent, still read by the side panel." }
];

// Tag names are what every parser, the cleaner and the renderer key on, so a
// name that collides with something already meaningful would make a block vanish
// silently instead of failing loudly.
export const RESERVED_BLOCK_TAGS = [
    "blocks", "details", "summary", "think", "thinking", "gametxt", "updatevariable",
    "combat_log", "location", "options", "disclaimer", "div", "span", "img", "p", "br"
];

export function blockTagFromName(name) {
    return String(name || "").trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "");
}

export function validateCustomBlock(name, tag, editingId) {
    if (!name.trim()) return "Give the block a name.";
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(tag)) return "The tag must start with a letter and use only letters, numbers and underscores.";
    if (RESERVED_BLOCK_TAGS.includes(tag.toLowerCase())) return `"${tag}" is reserved. Pick another name.`;
    const clash = [...MEGUMIN_BLOCK_REGISTRY, ...(localProfile.blockStack.custom || [])]
        .find(b => b.id !== editingId && String(b.tag).toLowerCase() === tag.toLowerCase());
    if (clash) return `"${tag}" is already used by ${clash.label}.`;
    return "";
}

// Field packs. A pack is merged into the current list, not swapped for it, so
// Romance and Rivalry can both be on.
export const STAT_FIELD_PACKS = {
    bonds: [
        { id: "pack_romance", label: "Romance", fields: [
            { id: "affection", label: "Affection", type: "meter", max: 100, start: 20 },
            { id: "trust", label: "Trust", type: "meter", max: 100, start: 30 },
            { id: "desire", label: "Desire", type: "meter", max: 100, start: 0 },
            { id: "tension", label: "Tension", type: "meter", max: 100, start: 10 }
        ] },
        { id: "pack_rivalry", label: "Rivalry", fields: [
            { id: "respect", label: "Respect", type: "meter", max: 100, start: 20 },
            { id: "fear", label: "Fear", type: "meter", max: 100, start: 0 },
            { id: "grudge", label: "Grudge", type: "meter", max: 100, start: 0 }
        ] },
        { id: "pack_social", label: "Social", fields: [
            { id: "reputation", label: "Reputation", type: "meter", max: 100, start: 50 },
            { id: "suspicion", label: "Suspicion", type: "meter", max: 100, start: 0 }
        ] }
    ],
    sheet: [
        { id: "pack_rpg", label: "RPG", fields: [
            { id: "hp", label: "HP", type: "meter", max: 100, start: 100 },
            { id: "stamina", label: "Stamina", type: "meter", max: 100, start: 100 },
            { id: "mana", label: "Mana", type: "meter", max: 100, start: 100 },
            { id: "gold", label: "Gold", type: "number", start: 0 },
            { id: "skills", label: "Skills", type: "list", ownLine: true, hint: "Name rank, comma separated" },
            { id: "inventory", label: "Inventory", type: "list", ownLine: true, hint: "item, item xN, or \"nothing\"" }
        ] },
        { id: "pack_survival", label: "Survival", fields: [
            { id: "hunger", label: "Hunger", type: "meter", max: 100, start: 0 },
            { id: "thirst", label: "Thirst", type: "meter", max: 100, start: 0 },
            { id: "warmth", label: "Warmth", type: "meter", max: 100, start: 100 },
            { id: "injuries", label: "Injuries", type: "text", ownLine: true, hint: "or \"none\"" }
        ] }
    ]
};

export const STAT_FIELD_TYPES = [
    { v: "meter", label: "Meter", hint: "0–max, drawn as a bar" },
    { v: "number", label: "Number", hint: "a plain count, no cap" },
    { v: "text", label: "Text", hint: "a short line of prose" },
    { v: "list", label: "List", hint: "comma separated items" }
];

// The stack decides what is in the block; localProfile.blocks is what actually
// fills the dict tags the envelope reads from (Stage 5), what the engine-override
// conditions test, and what compact World State keys off. Adding a block in the
// BLOCKS tab therefore has to write both, or the envelope assembles from tags
// nothing ever populated and ships empty — which is exactly what it did.
export function meguminSyncLegacyBlockIds() {
    if (!localProfile || !localProfile.blockStack) return;
    const stack = localProfile.blockStack;
    const owned = MEGUMIN_BLOCK_REGISTRY.flatMap(b => b.legacyIds || []);
    const had = localProfile.blocks || [];

    // Anything the stack does not own (cyoa, mvu) is left exactly as it was.
    const next = had.filter(id => !owned.includes(id));

    MEGUMIN_BLOCK_REGISTRY.forEach(b => {
        if (!b.legacyIds || !b.legacyIds.length) return;
        if (!stack.order.includes(b.id)) return;
        // Keep the variant already chosen (npc_inner_chatter_v2 over the full one)
        // rather than resetting the reader's pick every save.
        next.push(b.legacyIds.find(id => had.includes(id)) || b.legacyIds[0]);
    });

    localProfile.blocks = [...new Set(next)];
}
