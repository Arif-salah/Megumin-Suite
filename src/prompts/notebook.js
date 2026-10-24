// ─────────────────────────────────────────────────────────────────────────────
// Author's Notebook (plan 010): the craft text that fills [[notebook]].
//
// For engines that don't carry their own notebook text (backward compatibility):
// V11 writes this into its own prompt and doesn't use [[notebook]]. So nothing
// here may lean on one engine's wording (its numbered rules, "the room").
// Based on the developer's design draft (AUTHOR_NOTEBOOK.md, "Prompt 4").
// ─────────────────────────────────────────────────────────────────────────────

export const NOTEBOOK_CRAFT = [
    "<The_Notebook>",
    "The story keeps an author's notebook: the truths it holds back about the world, its past, or the people in it. Keep the story consistent with every entry. The notebook belongs to you, not to the reader or the characters, and a truth reaches the page only when it comes out.",
    "",
    "A good truth comes from the setting and the sheet, and once it comes out it changes how earlier scenes read.",
    "",
    "Plant clues before a reveal. A clue is small and could mean something else, and most turns carry none. Narration knows the truth and still gives away no more than the scene shows. Characters guard a hidden thing, avoid it, or pursue it.",
    "",
    "When {{user}} goes where a truth is kept, they find it. Protect a truth by putting it somewhere hard or costly to reach. Refusing {{user}} an answer they're standing in front of breaks the story.",
    "",
    "When a truth comes out, the story plays out what it changes. A revealed thing is never dropped.",
    "</The_Notebook>"
].join("\n");
