// ─────────────────────────────────────────────────────────────────────────────
// The preset's own words (plan 017).
//
// The V11 preset used to carry this text between its slots. A header written
// into the preset stays when the slot under it comes back empty, so with
// thinking off the model still read "## your thinking steps:" and took the
// next section for its thinking. The preset is now only slots, and the text
// lives here. Moved word for word from "Megumin Suite V11 Universal.json".
// The plain wrappers (<character_sheet>, <history>...) and the closing fiction
// lines stay in the preset as text, so they are easy to edit there.
//
// Headers are not editable on their own: a header goes wherever its section
// goes. Everything else is a shared fragment default (data/slots.js).
// ─────────────────────────────────────────────────────────────────────────────

export const THINKING_HEADER = "## your thinking steps:";

export const FORMATTING_HEADER = "## FORMATTING RULES:";

export const FORMATTING_RULES = `- FORBIDDEN: Repeating actions, physical descriptors, or internal monologues used in the previous two turns.
- Opening: read how the previous response opened and open this one differently. A response can open on speech, on an action already under way, or on one or two sentences of narration.`;

export const REMINDER_HEADER = "## final reminder:\nBefore you output, check:";

// One check per line. The list is numbered when it is built.
export const FINAL_CHECKS = "Characters know only what they have seen, heard, or been told.\nThe story ends on a character's action or line.";

// Only listed while the ban list is sent.
export const BANLIST_CHECK = "Nothing in the response is on the banlist.";

// ── Plan 018: rules up top, what changes each turn in <turn_notes> ──────────
// The V11 preset sends every rule in its top part, the same each turn, so it
// caches. These lines point the rules at <turn_notes>, which carries the
// numbers and asks at the end. Older presets keep the old combined wording.
// The rules themselves, in V11's style, are in v11Rules.js.

// Takes the place of [[dice_rolls]] in the dice rules: "this turn's rolls are listed in <turn_notes>."
export const DICE_ROLLS_POINTER = "listed in <turn_notes>";

// The Classic image rules' opening sentence, old and new.
export const IMAGE_ASK_OLD = "Within your response, insert {{imageCount}} of this image tag:";
export const IMAGE_ASK_NEW = "When <turn_notes> asks for an image, insert this image tag within your response:";

export const diceTurnLine = rolls => `Dice rolls: ${rolls.join(", ")}`;

export function imageTurnLine(count, conditional) {
    const n = Math.max(1, parseInt(count, 10) || 1);
    const tags = n === 1 ? "1 image tag" : `${n} image tags`;
    return conditional
        ? `Image: up to ${tags} this turn, only if a character is taking or sharing a picture right now.`
        : `Image: insert ${tags} in this reply.`;
}

export const BUILTIN_BAN_LIST = `NEVER output the following.

*Constructions:*
- **negation-framing** (antithesis/litotes): "not X but Y," "it wasn't anger, it was fear."
- **thought-verbs:** felt, realized, knew, understood, sensed.
- **on-the-nose:** a character naming their own feeling, explaining their behavior, or summarizing the situation.
- **pathetic-fallacy naming:** "the air was charged/heavy," "tension was palpable," "silence stretched."
- **unspoken-labeling:** "nobody said it out loud," "it sat there between them," "unasked."
- **machine-verbs for feeling:** engineered, weaponized, calculated, short-circuited, tactical.
- **action + its own gloss:** "he reached for her, as if afraid she'd vanish."
- **object + attached fact:** "the register, where the money went missing."
- **mask-drop announcement:** "the composed X was gone, replaced by Y."
- **cliché motions:** "a breath he didn't know he was holding," "before he could stop himself," "mouth opens, closes."
- **metaphor tics:** "hit like a [noun]," "washed over/flooded," "something inside him broke/cracked," "the weight of [abstract]."
- **>1 emotional adjective per noun.**
*Words* (any form): fresh meat, meat, asset, prey, predatory · spine, shivers · breath hitching/catching · husky, throaty, guttural, "barely above a whisper" · pupils blown/dilated · ozone, musk · velvet, vise/vice, furnace, structural integrity, deep curve · calloused, slick, unadulterated · jaw clenched · "a beat" (time).

*Echo:*
- NEVER open >2 consecutive sentences with he/she/they/name.
- NEVER parrot {{user}}'s input; NEVER reuse a detail/gesture/descriptor from the previous 2 turns.
- NEVER: "no one had ever said that before" (or variants); characters losing shoes.`;
