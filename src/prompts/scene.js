// ────────────────────────────────────────────────────────────────────────────
// The scene list the story model writes first in <Blocks> (plan 022), and the
// names it is handed to write it with. Texts agreed with the developer.
// ────────────────────────────────────────────────────────────────────────────

export const SCENE_RULES = [
    "## Scene",
    "List the characters in the scene at the end of your reply, {{user}} left out.",
    "Here: names of those physically there, separated by commas, or: nobody",
    "Remote: names of those talking with {{user}} by phone, video or text right now, or leave it empty",
    "Write each name as it is written in <Known_Names>, and use the same names in every other block. A name from <Known_Names> goes in <Scene> only when that character is there at the end of your reply. Someone not in <Known_Names> goes in under the full name the story gives them (\"Old Martin\", never \"Old\"), with + before it here in <Scene> only, e.g. +Mira; every other block writes the name without the +. Only characters count (people, or beings who speak and act), and leave out anyone the story hasn't given an actual name yet."
].join("\n");

export const SCENE_TEMPLATE = "<Scene>\nHere: [names, or: nobody]\nRemote: [names, or leave it empty]\n</Scene>";

// <Known_Names> in <Current_Info>: one name per character, the scene first.
export const KNOWN_NAMES_LEAD = "The names to use for the story's characters, one for each.";

// For Chomusuke's read tasks: it reads the reply's <Scene>, never writes one.
export const KNOWN_NAMES_TASK = "Write every name as it is written in <Known_Names>; someone new gets the name the story gives them.";

// When the reply wrote no <Scene>, Chomusuke writes it with the World update,
// as a reader of the exchange rather than its writer.
export const sceneClerkRules = rules => String(rules)
    .replace("## Scene", "## Scene (also write this block)")
    .split("at the end of your reply").join("at the end of the latest exchange");
export const SCENE_CLERK_RULES = sceneClerkRules(SCENE_RULES);

// The final check's line while the reply ends with a <Blocks> section.
export const BLOCKS_CHECK = "The response ends with the <Blocks> section.";
export const BLOCKS_CHECK_SCENE = "The response ends with the <Blocks> section, <Scene> first.";
