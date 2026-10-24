// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 prompts (plan 006, B2).
//
// One structure to fill in and one worked example per style, instead of a list
// of rules: models follow a shape they can see far more reliably than a shape
// they have to infer (the first version, rules only, came back with @Name used
// three times and clothing added after it). The shot choice is one extra line.
//
// Framing rule: the model is never told about an extension or anything
// "filling in" for it; @Name simply stands for a character.
// ────────────────────────────────────────────────────────────────────────────

export const IMAGE_V2_PROMPTS = {
    system:
        "You write image prompts for moments from an ongoing story: who is in the shot, what they are doing, " +
        "their expressions and poses, the place, the light and the framing.",

    style: {
        // Plan 007: one line per character. After @Name is filled in, each
        // character's look sits in its own sentence with their name in front,
        // so the image model keeps every tag with the right person.
        tags: [
            "## How to write the image prompt",
            "Write it top to bottom in this order:",
            "",
            "1. **Count, camera, place, time, framing**, as tags on the first line: the count (1girl, 1boy, 1girl 1boy, 2girls, no humans…; <Cast> says who is male and who is female; one person: add solo), indoors or outdoors, the place, the time, and exactly ONE framing (close-up, portrait, upper body, cowboy shot, medium shot, full body, wide shot). The framing decides how much of each character is shown.",
            "2. **One line per character**: where they are in the frame (on the left, on the right, in the center, in the foreground, in the background), then \"is @Name.\" @Name carries that character's whole look and clothing, so each description stays in its own sentence.",
            "3. **Right after, what only they are doing**, starting with He, She or They, in a few plain words: their pose, their main action, their expression, and the one thing they hold, if any. The one the moment is about comes first. Three characters at most; anyone else goes in as background tags (people in background, crowd).",
            "4. **Last line: the background, a few objects and ONE main light**, as tags.",
            "",
            "Rules:",
            "- <Cast> is reference only. Never write hair, eyes, face, body or clothing for a @Name character. The one exception: when <Cast> explicitly says \"wearing: not noted\", add \"wearing …\" right after their @Name.",
            "- Write each @Name once. Use no names anywhere else: \"holding her hand\", not \"holding Theo's hand\"; \"bedroom\", not \"Mira's bedroom\".",
            "- Draw the moment, not the story. Show feelings as what the face and body do: \"nervous, looking away\", not \"hesitant because she is shy\".",
            "- Use simple words an image model knows: \"smug smile\", \"arms crossed\", \"holding a cake\". Don't copy the story's wording.",
            "- Leave out anything too small to see in the picture: nail polish, a label, a ring, a print on a can. If it would be a speck, it doesn't belong.",
            "- No quality tags (masterpiece, best quality…).",
            "",
            "Example (made-up characters; use the names from <Cast>):",
            "1girl, 1boy, indoors, tavern, night, medium shot,",
            "On the left is @Mira. She sits at the bar, laughing, holding a mug.",
            "On the right is @Theo. He leans on the counter, smiling at her.",
            "wooden bar, shelves of bottles, rainy window, warm lamplight"
        ].join("\n"),
        natural: [
            "## How to write the image prompt",
            "Write it top to bottom in plain sentences, in this order:",
            "",
            "1. **The shot**, in one short sentence: the framing (close-up, from the waist up, medium shot, full body, wide shot), the place and the time. The framing decides how much of each character is shown.",
            "2. **One sentence per character**: where they are in the frame (on the left, on the right, in the center, in the foreground, in the background), then \"is @Name.\" @Name carries that character's whole look and clothing, so each description stays in its own sentence.",
            "3. **Right after, what only they are doing**, starting with He, She or They, in a few plain words: their pose, their main action, their expression, and the one thing they hold, if any. The one the moment is about comes first. Three characters at most; mention anyone else briefly as background.",
            "4. **Last: the background, a few objects and ONE main light**, in one or two sentences.",
            "",
            "Rules:",
            "- <Cast> is reference only. Never describe a @Name character's hair, eyes, face, body or clothing. The one exception: when <Cast> explicitly says \"wearing: not noted\", describe what they wear right after their @Name.",
            "- Write each @Name once. Use no names anywhere else: \"holding her hand\", not \"holding Theo's hand\"; \"a bedroom\", not \"Mira's bedroom\".",
            "- Draw the moment, not the story. Show feelings as what the face and body do: \"nervous, looking away\", not \"hesitant because she is shy\".",
            "- Use simple words an image model knows: \"a smug smile\", \"arms crossed\", \"holding a cake\". Don't copy the story's wording.",
            "- Leave out anything too small to see in the picture: nail polish, a label, a ring, a print on a can. If it would be a speck, it doesn't belong.",
            "",
            "Example (made-up characters; use the names from <Cast>):",
            "A medium shot inside a tavern at night.",
            "On the left is @Mira. She sits at the bar, laughing, holding a mug.",
            "On the right is @Theo. He leans on the counter, smiling at her.",
            "Shelves of bottles line the wall behind them, rain runs down the window, and warm lamplight fills the room."
        ].join("\n")
    },

    shot: {
        cinematic: "Shot: a film still of the moment. Pick a wide, medium or close shot to suit it.",
        pov: "Shot: through {{user}}'s eyes. Include pov. {{user}} is the viewer: write \"the viewer\" for them (looking at the viewer, holding the viewer's hand), never their name. They are never in the shot, except their hands when they touch something.",
        portrait: "Shot: one character, head-and-shoulders or chest-up, focused on face and expression, with a simple background from the place."
    },

    // Reference method (experimental): the model edits the previous image prompt
    // instead of writing placeholders, with the cast as the source of truth.
    reference: {
        head: [
            "## How to write the image prompt",
            "<Previous_Image_Prompt> is the last image made in this story. Write the new image prompt by editing it:",
            "- Keep everything that still holds, word for word: each character's appearance and clothing tags, their order, and the style of the prompt.",
            "- Change only what the new moment changes: who is in the shot, their poses and actions, expressions, the place, the light and the framing.",
            "- Each character's appearance and clothing must match <Cast> exactly. If the previous prompt disagrees with <Cast>, <Cast> is right.",
            "- A character's body tags go in only when the shot shows their body (full body, wide shot, cowboy shot); leave them out of close-ups and portraits.",
            "- Why: the closer the new prompt stays to the previous one, the more consistent the images and the characters stay from one image to the next. Make small edits; do not write a new prompt from scratch.",
            "- With no previous prompt, write a new one, using each character's tags from <Cast> word for word for their appearance and clothing."
        ].join("\n"),
        tags: [
            "- ONE line of comma-separated booru tags. Start with the count (1girl, 1boy, 2boys, 1girl 1boy…; <Cast> says who is male and who is female), then each character's appearance and clothing tags followed by what only they are doing, then what they do together, the place, the light, and the framing last.",
            "- No quality tags (masterpiece, best quality…)."
        ].join("\n"),
        natural: "- 2 to 4 plain sentences: each character's appearance and clothing as in <Cast>, what they are doing, the place, the light, and how the shot is framed."
    },

    // Image models read English: a story told in French still gets English
    // prompts and tags. Blocks and World State keep the story's language.
    inEnglish: "Write the image prompt in English, whatever language the story is told in.",
    tagsInEnglish: "Write the tags in English, whatever language the story is told in.",

    manualTask: "The image shows the moment <Last_Message> ends on. <Earlier_Story> is only there so you understand it: draw nothing that has already ended (someone who put an item away no longer holds it). Write the image prompt for that moment. Output only the prompt, nothing else.",
    manualTaskWithExtras: "The image shows the moment <Last_Message> ends on. <Earlier_Story> is only there so you understand it: draw nothing that has already ended (someone who put an item away no longer holds it). Write the image prompt for that moment.",

    inlineHead: "### IMAGE\n{{conditionalText}}Within your response, insert {{imageCount}} image tag(s) like this: <img prompt=\"...\"> at the moment the image shows.",
    // Plan 018: the V11 preset's rules up top; <turn_notes> says when an image is due.
    inlineHeadSplit: "### IMAGE\n{{conditionalText}}When <turn_notes> asks for an image, insert the image tag like this: <img prompt=\"...\"> at the moment the image shows.",
    inlineTail: "Inside prompt=\"...\", never use double quotes."
};
