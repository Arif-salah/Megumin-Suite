// Author's Notebook as a state-store module (plan 010). The store undoes it
// with swipes, edits and deletes, like World State. Phase 1: the pure core.

import { parseNotebook } from "./parse.js";
import { emptyNotebook, applyNotebook } from "./model.js";

export const notebookModule = {
    id: "notebook",
    version: 1,
    empty: emptyNotebook,
    parse: text => parseNotebook(text),
    apply: applyNotebook
};
