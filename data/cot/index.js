// The chain-of-thought library, in display order.
//
// Exported as `models` because that is the key it occupies in hardcodedLogic and
// the name every reader downstream already uses. The folder is named cot/ because
// that is what these actually are — none of them describe an LLM model.

import { cot_v11taina } from "./v11taina.js";
import { cot_v11 } from "./v11.js";
import { cot_v10 } from "./v10.js";
import { cot_v9 } from "./v9.js";
import { cot_v8 } from "./v8.js";
import { cot_v7 } from "./v7.js";
import { cot_legacy } from "./legacy.js";

export const models = [
    ...cot_v11taina,
    ...cot_v11,
    ...cot_v10,
    ...cot_v9,
    ...cot_v8,
    ...cot_v7,
    ...cot_legacy,
];

/**
 * Which chain-of-thought an engine is written for.
 *
 * This mapping used to be an inline if/else chain inside the PRESETS tab's
 * click handler, which made it invisible to anything else that needed the same
 * answer -- and Dev Mode needs it, to fill in a clone's reasoning script. Two
 * copies of a mapping like this drift the moment a generation is added.
 *
 * The language argument only matters for the generations that were translated;
 * v7, v8, v10 and v11 exist in English alone, so they ignore it. That asymmetry is
 * carried over from the original chain rather than tidied, because the CoT
 * files really are shaped that way.
 */
export function meguminCotForMode(modeId, lang = "english") {
    if (!modeId) return null;

    let prefix = null;
    if (modeId.includes("v6")) prefix = "cot-v6";
    else if (modeId === "v7.5") prefix = "cot-v7.5";
    else if (modeId.includes("v7")) prefix = "cot-v7";
    else if (modeId.includes("v8")) prefix = "cot-v8";
    // Shura first: "v10-shura" contains "v10", and the specific pairing wins.
    // The uncapped variant is the default either way -- the Thinking Cap is a
    // remedy for a model that over-thinks, not something to hand everyone.
    // V11 Тайна and its Writers' Room each have their own; "v11-room" is the Preview.
    // V11 Тайна DeepSeek thinks like V11 Тайна.
    else if (modeId === "v11-voice" || modeId === "v11-deepseek") prefix = "cot-v11-voice";
    else if (modeId === "v11-writers-room") prefix = "cot-v11-wr";
    else if (modeId.includes("v11")) prefix = "cot-v11";
    else if (modeId.includes("v10-shura")) prefix = "cot-v10-shura";
    else if (modeId.includes("v10")) prefix = "cot-v10-ukiyo";
    else if (modeId.includes("v9")) prefix = "cot-v9";
    if (!prefix) return null;

    const englishOnly = prefix.startsWith("cot-v11") || prefix.startsWith("cot-v10") || prefix.includes("v7") || prefix.includes("v8");
    const id = englishOnly ? `${prefix}-english` : `${prefix}-${lang}`;
    return models.find(m => m.id === id) ? id : null;
}

/** The CoT entry an engine is written for, or null. */
export function meguminCotEntryForMode(modeId, lang = "english") {
    const id = meguminCotForMode(modeId, lang);
    return id ? models.find(m => m.id === id) || null : null;
}
