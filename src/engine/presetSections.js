// ────────────────────────────────────────────────────────────────────────────
// The sections a slots-only preset carries (plan 017).
//
// Each section comes with its own header, so a section that is off takes its
// header with it. Older presets have the headers written into them and keep
// using the old slots ([[THINK]], [[banlist]], [[user]]...), which still mean
// exactly what they did; these new slots are only in the V11 preset.
//
// Pure: buildBaseDict resolves every part (engine, Dev Mode edit, built-in)
// and hands the finished strings in.
// ────────────────────────────────────────────────────────────────────────────

import {
    THINKING_HEADER, FORMATTING_HEADER, REMINDER_HEADER, BANLIST_CHECK,
} from "../prompts/presetFrame.js";
import { wrapFormatting, wrapFinalCheck, FINAL_CHECK_HEAD } from "../prompts/v11Rules.js";

// frame "v11" (plan 018): an engine with the V11 Тайна turn frame. Its thinking
// brings its own <think> tags, and formatting and the checks are tags.

const filled = parts => parts.map(p => String(p || "").trim()).filter(Boolean);

/** [[thinking]]: the header and the thinking, or "" when thinking is off. */
export function thinkingSection(think, { frame } = {}) {
    const body = String(think || "").trim();
    if (!body) return "";
    return frame === "v11" ? body : `${THINKING_HEADER}\n${body}`;
}

/** [[formatting]]: the header, then each part that is on, in the preset's old order. */
export function formattingSection({ dnratio, color, rules, direct, frame } = {}) {
    // V11 Тайна: no formatting rules line, its <repetition> says it.
    if (frame === "v11") return wrapFormatting(filled([dnratio, color, direct]));
    const parts = filled([dnratio, color, rules, direct]);
    return parts.length ? `${FORMATTING_HEADER}\n\n${parts.join("\n")}` : "";
}

/** [[banned]]: the built-in list and your phrases in one <banlist>, or "" when both are empty. */
export function bannedSection({ builtIn, additions, frame } = {}) {
    const parts = filled([builtIn, additions]);
    return parts.length ? `<banlist>\n${parts.join(frame === "v11" ? "\n\n" : "\n")}\n</banlist>` : "";
}

// One check per line. A number the text already carries is dropped: the
// [[user]] line is written as "5." for the older presets' fixed list.
function checkLines(text) {
    return String(text || "").split(/\r?\n/)
        .map(l => l.replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean);
}

/**
 * [[reminder]]: the header and a numbered list, counted as it is built so a
 * check that is off leaves no gap. The ban list check is listed only while the
 * ban list is sent.
 */
export function reminderSection({ checks, banned, presetChecks, userLine, frame } = {}) {
    const lines = [
        ...checkLines(checks),
        ...(banned ? [BANLIST_CHECK] : []),
        ...checkLines(presetChecks),
        ...checkLines(userLine),
    ];
    if (frame === "v11") return wrapFinalCheck(lines);
    if (!lines.length) return "";
    return `${REMINDER_HEADER}\n${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;
}

/**
 * [[this_turn]] (plan 018): only what is new this turn, in one <turn_notes>,
 * or "" when nothing is. The rules these answer are in the preset's top part.
 * @param {{ dice?: string, image?: string, blocks?: string }} parts
 *   dice — the rolls line; image — the ask line and what goes with it (cast,
 *   previous prompt, character tags); blocks — the <Blocks> skeleton
 */
export function thisTurnSection({ dice, image, blocks } = {}) {
    const parts = filled([dice, image, blocks]);
    return parts.length ? `<turn_notes>\n${parts.join("\n\n")}\n</turn_notes>` : "";
}

// What each section is made of, for Dev Mode's Document view: it draws the
// preset with these spelled out, so the parts you can edit show up where they
// are sent.
export const PRESET_SECTION_PARTS = {
    "[[thinking]]": `${THINKING_HEADER}\n[[THINK]]`,
    "[[formatting]]": `${FORMATTING_HEADER}\n[[DNRATIO]]\n[[COLOR]]\n[[formatting_rules]]\n[[Direct]]`,
    "[[banned]]": "<banlist>\n[[banlist_builtin]]\n[[banlist]]\n</banlist>",
    "[[reminder]]": `${REMINDER_HEADER}\n[[final_checks]]\n[[reminder_checks]]\n[[user]]`,
};

// The same, for an engine with the V11 Тайна turn frame: its tags, no headers.
export const PRESET_SECTION_PARTS_V11 = {
    "[[thinking]]": "[[THINK]]",
    "[[formatting]]": "<formatting>\n[[DNRATIO]]\n[[COLOR]]\n[[Direct]]\n</formatting>",
    "[[banned]]": "<banlist>\n[[banlist_builtin]]\n\n[[banlist]]\n</banlist>",
    "[[reminder]]": `<final_check>\n${FINAL_CHECK_HEAD}\n[[final_checks]]\n[[reminder_checks]]\n[[user]]\n</final_check>`,
};

export function expandPresetSections(text, { frame } = {}) {
    let out = String(text || "");
    Object.entries(frame === "v11" ? PRESET_SECTION_PARTS_V11 : PRESET_SECTION_PARTS).forEach(([tag, parts]) => {
        out = out.split(tag).join(parts);
    });
    return out;
}
