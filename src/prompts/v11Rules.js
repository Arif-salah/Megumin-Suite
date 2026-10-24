// ─────────────────────────────────────────────────────────────────────────────
// The V11 preset's rules, in V11's style (plan 018, phase 2).
//
// Every rule the V11 preset sends in its top part: the block rules, the NPC
// dossier, the dice, the image opening and the add-ons. Each is written once
// here so it can be read and reviewed in one place. Only the V11 preset gets
// these; older presets keep the old texts word for word.
//
// A text you edited yourself (Dev Mode, a custom prompt) is never replaced:
// the V11 version is used only while the old one is the built-in default.
// ─────────────────────────────────────────────────────────────────────────────

// "Affection, Trust and Desire"
export const andList = items => items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const startOf = f => `${f.label} ${f.start !== undefined ? f.start : 0}`;

// The cap is for meters only: a counted field like Gold can jump by hundreds.
function meterCap(fields) {
    const meters = fields.filter(f => f.type === "meter").map(f => f.label);
    if (!meters.length) return "";
    return `${andList(meters)} ${meters.length === 1 ? "moves" : "move"} by 10 at most in one reply, unless the scene plainly earns more.`;
}

const tracked = fields => fields.filter(f => f.type === "meter" || f.type === "number");

// ── <block_rules> ───────────────────────────────────────────────────────────

export const BLOCK_RULES_LEAD = "These rules say how to fill the blocks <turn_notes> asks for. Follow them; never write them out.";

// The <Blocks> skeleton's opening in <turn_notes>: only the lines to fill in.
export const BLOCKS_HEAD_SPLIT = "After the story, write one <Blocks> section holding the blocks below, in this order. Each block is its own plain tag, closed before the next one opens, never wrapped in <details>. Leave a block out when its rules say so this turn, and add no tags of your own.";

export const wrapBlockRules = rules => `<block_rules>\n${BLOCK_RULES_LEAD}\n\n${rules.join("\n\n")}\n</block_rules>`;

// World State and the Notebook write "## World State rules"; inside
// <block_rules> the heading is just the block's name.
export const shortRulesHeading = text => String(text || "").replace(/^(#{1,3} .+?) rules[ \t]*$/m, "$1");

/** @param {Array<{label: string, type: string, start?: number}>} fields */
export function bondsRulesSplit(fields) {
    const lines = ["One line for each named character in the scene, and for anyone whose numbers changed in it."];
    if (tracked(fields).length) {
        lines.push("Start every number from <Bonds_Now> in <Current_Info>. A number moves only when something in this scene moved it: write the change and its reason in brackets, like (-6 he apologised and she heard pity), or (=) when nothing moved it.");
        const cap = meterCap(fields);
        if (cap) lines.push(cap);
        lines.push(`Someone with no numbers yet starts at ${tracked(fields).map(startOf).join(", ")}.`);
    }
    lines.push("Bonds are feelings only: leave out clothes, posture and place.");
    return `## Bonds\n${lines.join(" ")}`;
}

/** @param {Array<{label: string, type: string, start?: number}>} fields */
export function sheetRulesSplit(fields) {
    const lines = ["The sheet is {{user}}'s."];
    if (tracked(fields).length) {
        lines.push("Start every number from <Character_Sheet_Now> in <Current_Info>. A number moves only when something in this scene moved it: write the change and its reason in brackets, like (-8 a blade across the ribs), or (=) when nothing moved it.");
        const cap = meterCap(fields);
        if (cap) lines.push(cap);
        lines.push(`With no sheet yet, it starts at ${tracked(fields).map(startOf).join(", ")}.`);
    }
    lines.push("Inventory and skills change only when the story changes them; nothing comes back or gets equipped on its own.");
    return `## Character Sheet\n${lines.join(" ")}`;
}

export const CHATTER_RULES = `## Inner Chatter
What the characters really think, which {{user}} never hears. With two or more characters in the scene, write a few lines they trade behind {{user}}'s back, with their public face dropped: what they really think, what they want, who they side with, what they hold against someone. With one, write a stray thought in their own head: a feeling, a regret, a judgment, a memory. 30 words at most, honest and unguarded, and different from what they show on the surface.
Example, a father alone: "What a disappointment of a son... I miss my wife. She'd know what to say to him. I never did."`;

export const CHATTER_SKELETON = "[Name]: [what they really think, or say behind {{user}}'s back]";

export const CHOICES_RULES = `## CYOA
Four things {{user}} could do next, each a few words long and each heading somewhere different.`;

export const TRACKER_RULES = `## Story Tracker
Your own notes on where the story stands against the plan in <Story_Director>, written after the story. The story itself never mentions the plan or the notes; the reader only sees what they change.`;

// The tracker's fields, as the skeleton keeps them.
export const TRACKER_SKELETON = `arc_status: [progressing | nearing_climax | completed | pivoted]
current_arc: [Name the arc you are actively writing]
main_event_progress: [How far along the main event is — not started | building | in motion | resolving]
sub_event_advanced: [Which numbered sub-event you just advanced or set up in this response]
npc_actions: [Which NPCs acted on their agenda in this response and what they did]
simmering_threads: [2-3 background tensions you are keeping warm]
hidden_state: [NPC secrets and motives that {{user}} does not know yet]
next_beat: [What sub-event or NPC action you intend to steer toward next]`;

// The two NPC lines in the skeleton point at <npc_dossier_rules>.
export const NEW_NPC_SLOT = `<New_NPC name="[Full Name]">\n[A dossier goes here when this reply brings in a character who earns one, following <npc_dossier_rules>. Leave this tag out otherwise.]\n</New_NPC>`;
export const NPC_UPDATE_SLOT = `<NPC_Update name="[Exact name as it appears in the NPC bank]">\n[The changed lines go here when this scene changed something on file, following <npc_dossier_rules>. Leave this tag out otherwise.]\n</NPC_Update>`;

// ── <npc_dossier_rules> ─────────────────────────────────────────────────────────────

// {{template}} and {{persistenceRule}} are filled from the NPC Bank's fields.
export const NPC_DOSSIER_RULES = `## New characters
Write a dossier once for a character who meets all three of these in one scene:
1. Named: they have a proper name, or one {{user}} will use again.
2. Voiced: they say more than a passing line ("That'll be 5 credits" doesn't count).
3. Staked: they want something, think something, or hold a place that can matter to the story later.
Cashiers, bartenders, guards, crowds and one-line faces get none, and neither does anyone who is only there as scenery. A character gets one dossier, ever, and once written it is fixed.

Write one <New_NPC> tag per character, inside <Blocks>, in this form. Keep it dense: short fragments everywhere, with full sentences only in Background and Secrets.

{{template}}

{{persistenceRule}}
Inner Circle: two to five people, and at least one of them off-screen and unknown to the story so far (a mother, an ex, a childhood friend, a rival). They are seeds for later.
Secrets: they drive what the character does in ways {{user}} can't predict. The story shows a secret only when the character gives it away through what they do or say, and the deeper the tier, the longer it stays buried.
Canon Lock: these facts never change. If a later scene needs one of them to be wrong, it comes out as a reveal: the earlier version was a lie or a mistake.
Image Tags: 12 to 20 comma-separated booru tags for the body and face only, with no clothes, accessories, weapons, background, pose or expression. The character reads as an adult. In this order: 1girl, 1boy or 1other; hair (length, style, colour); eyes (colour, shape); skin tone; body (type, build); apparent age; marks (scars, freckles, moles, tattoos, birthmarks).`;

/** @param {string[]} labels the fields that describe the character's life */
export function npcPersistenceRuleSplit(labels) {
    if (!labels.length) return "";
    return `${andList(labels)} describe this person's life apart from this scene. Write each one as it would still be true at 2pm on an ordinary Tuesday months from now, long after this scene is over. Where they're standing, what they're doing and who they're with right now belong in none of them.`;
}

export const npcKnownNames = names => names.length
    ? `These characters already have a dossier or need none: ${names.join(", ")}.`
    : "";

/**
 * The update rules, from the NPC Bank's fields.
 * @param {{ updatable: string[], single: string[], multi: string[], locked: string[], template: string }} f
 */
export function npcUpdateRulesSplit({ updatable, single, multi, locked, template }) {
    if (!updatable.length) return "";
    const holds = list => (list.length === 1 ? "holds" : "hold");
    const lines = [
        "## Changes to known characters",
        "When this scene changed something on file for a character who already has a dossier, write one <NPC_Update> for them, inside <Blocks>, holding only what changed. When nothing changed, leave it out.",
        "",
        `Fields that can change: ${andList(updatable)}.`,
        "~ replaces a field's whole value. + adds one entry to a list. - removes one entry from a list.",
    ];
    if (single.length) lines.push(`${andList(single)} ${holds(single)} one value: use ~.`);
    if (multi.length) lines.push(`${andList(multi)} ${holds(multi)} a list: use +, - or ~.`);
    if (locked.length) lines.push(`${andList(locked)} are written once and never change.`);
    lines.push("", template);
    return lines.join("\n");
}

export const wrapNpcRules = parts => {
    const body = parts.filter(p => String(p || "").trim()).join("\n\n");
    return body ? `<npc_dossier_rules>\n${body}\n</npc_dossier_rules>` : "";
};

// ── <dice_rules> ────────────────────────────────────────────────────────────

const DICE_SHARED = `Set the difficulty from the task and what stands against it, before the roll is read, and never move it after: 5 trivial, 10 easy, 15 ordinary, 20 hard, 25 very hard, 30 near-impossible. A modifier from -3 to +3 comes only from skill the story has already shown.

Reading the roll: at or above the DC, success. One or two below, success at a cost. Three or more below, failure, and the world moves. A natural 20 gives more than was asked; a natural 1 fails and takes something.

A failure still moves the scene forward: whoever tried ends up later, poorer, seen, hurt, or holding a worse version of what they wanted. Nothing resets, and nobody rescues them in the same beat. Trying again is a new attempt at a higher difficulty.`;

const DICE_NUMBERS = "This turn's rolls are listed in <turn_notes>. Take them in order, one per attempt. Never invent a number, reuse one, or swap one for another because it suits the scene. When the list runs out, there are no more rolls this turn.";

export const DICE_RULES_PLAYER = `<dice_rules>
The dice are rolled before the scene is written, and the scene answers them.

When {{user}} attempts something that can fail at real cost, it takes a roll, one per attempt. What {{user}} feels, wants or decides never takes one. Decide which attempts need a roll before you look at the numbers.

${DICE_NUMBERS}

${DICE_SHARED}

The roll line is the first thing in the reply, before any prose, and it never changes once the prose exists:
<Dice>🎲 attempt — d20+N vs DC → roll+N = total · verdict</Dice>
Nothing else goes on that line, and the prose never mentions the numbers, the dice or luck.
</dice_rules>`;

export const DICE_RULES_EVERYONE = `<dice_rules>
The dice are rolled before the scene is written, and the scene answers them.

When anyone attempts something that can fail at real cost, {{user}} or any character in the scene, it takes a roll, one per attempt. What a character feels, wants or decides never takes one, and neither does background business nobody is watching. Decide which attempts need a roll before you look at the numbers.

${DICE_NUMBERS}

${DICE_SHARED}

Every roll line for this reply comes first, before any prose, and none of them changes once the prose exists. They all go in one <Dice> tag, one per line, naming who rolls:
<Dice>🎲 who does what — d20+N vs DC → roll+N = total · verdict</Dice>
The prose never mentions the numbers, the dice or luck.
</dice_rules>`;

// ── <image_rules> ───────────────────────────────────────────────────────────

// The old opening heading ("### IMAGE GENERATION:", "### IMAGE") comes off: the
// tag names the section.
export const wrapImageRules = text => {
    const body = String(text || "").replace(/^\s*#{1,3}\s*IMAGE[^\n]*\n/i, "").trim();
    return body ? `<image_rules>\n${body}\n</image_rules>` : "";
};

// ── Add-ons, each in its own tag ────────────────────────────────────────────

export const ADDON_RULES_SPLIT = {
    death: `<death>
When something {{user}} does or suffers would really kill them, {{user}} dies. Nothing in the story protects them. Write the death plainly and end the scene there.
Then offer the reader two choices, and only these:
1. Survival: a believable reason inside the story for how {{user}} lives or comes back, with consequences that last.
2. A new character: the reader takes over another character for good, someone new or someone already in the story. The death stays part of the story.
The choice is final. The world goes on, and the characters remember the death as far as the events give them reason to.
</death>`,

    combat: `<combat>
Fights follow physical reality. Size, skill, numbers, weapons and preparation decide them, and nobody has plot armour: a human against a stronger creature loses unless they have a believable edge.
A fight goes one exchange at a time, and each action has a clear cause, cost and result, with no steps skipped. Every strike, miss, wound and hesitation counts, and injury, tiredness, fear and pain weigh on what comes after.
A fight ends when it would really end: a death, a retreat, a capture, or someone who can't go on. Winning has to be earned, and surviving has to make sense.
</combat>`,

    onomato: `<sound>
The narration uses sound words for physical things, exact to what makes each one: the click of a latch, the thud of something heavy, the hiss of wind.
</sound>`,

    onomatoStyled: `<sound>
The narration uses sound words for physical things, exact to what makes each one: the click of a latch, the thud of something heavy, the hiss of wind.
Every sound word is coloured and animated with HTML and CSS, and the colour and animation match what the sound physically is: a repeating rub like "shush-shush" slides.
</sound>`,
};

// A rule you wrote yourself keeps its words; it only gets a tag around it, so
// it sits in the top part like the others.
export const wrapAddon = (tag, text) => {
    const body = String(text || "").trim();
    if (!body) return "";
    return /^<[A-Za-z_]+>/.test(body) ? body : `<${tag}>\n${body}\n</${tag}>`;
};

// Same text, ignoring spacing: is this still the built-in default?
export const sameText = (a, b) => String(a || "").replace(/\s+/g, " ").trim() === String(b || "").replace(/\s+/g, " ").trim();

// ── The V11 Тайна turn frame (plan 018, phase 4) ────────────────────────────
// Only for an engine with turnFrame "v11" (V11 Тайна and its Writers' Room).
// The words around the turn, as the tested versions have them; the Preview
// and older engines keep the old ones.

export const STORY_SETTINGS_PREAMBLE = "These settings hold for the whole story. Where one contradicts anything above, the setting wins.";

export const storySettingsBlock = lines => lines.length
    ? `<story_settings>\n${STORY_SETTINGS_PREAMBLE}\n${lines.join("\n")}\n</story_settings>`
    : "";

export const wrapRepetition = text => {
    const body = String(text || "").trim();
    return body ? `<repetition>\n${body}\n</repetition>` : "";
};

export const FINAL_CHECK_HEAD = "Before you output, check:";

export const wrapFinalCheck = lines => lines.length
    ? `<final_check>\n${FINAL_CHECK_HEAD}\n${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n</final_check>`
    : "";

export const wrapFormatting = parts => parts.length ? `<formatting>\n${parts.join("\n")}\n</formatting>` : "";

// "ENGLISH" → "Write the response in English."
export const languageLine = lang => {
    const l = String(lang || "english").trim().toLowerCase();
    return `Write the response in ${l.charAt(0).toUpperCase() + l.slice(1)}.`;
};

// Your banned phrases, after the built-in list inside <banlist>.
export const BAN_ADDITIONS = "Also avoid these:\n{{banItems}}";
