// World State as a state-store module. Prompt rendering and instructions join
// this in phase 2; phase 1 is the pure core the store needs.

import { parseWorldBlocks } from "./parse.js";
import { emptyWorld, applyWorldChanges } from "./model.js";
import { parseScene } from "../../scene.js";

// A <Scene> list in the text read (Chomusuke writes one when the reply has
// none, plan 022) rides along with the update; a reply's own list is read
// from the message itself.
function parseWorld(text) {
    const parsed = parseWorldBlocks(text);
    const scene = parsed ? parseScene(text) : null;
    return scene ? { ...parsed, scene } : parsed;
}

export const worldModule = {
    id: "world",
    // Raise when a parser change should reach entries already on file.
    // 2: 'Matthew "Matt"' is one character with a nickname, not "Matthew Matt".
    // 3: "Scene: Breather | Scene: Building" is two phase lines, not one value.
    version: 3,
    empty: emptyWorld,
    parse: parseWorld,
    apply: applyWorldChanges
};
