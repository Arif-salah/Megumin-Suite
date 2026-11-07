// Custom blocks as one state-store module (plan 023). The store undoes them
// with swipes, edits and deletes, like the other blocks. The user's block list
// changes under it, so the bridge hands in a getter.

import { parseCustomBlocks } from "./parse.js";
import { emptyCustom, applyCustom, normalizeCustomBlock } from "./model.js";

/** @param {() => object[]} getBlocks  the custom blocks (blockStack.custom) */
export function createCustomModule(getBlocks) {
    const blocks = () => (getBlocks() || []).map(normalizeCustomBlock);
    return {
        id: "custom",
        version: 1,
        empty: emptyCustom,
        parse: text => parseCustomBlocks(text, blocks()),
        apply: applyCustom
    };
}
