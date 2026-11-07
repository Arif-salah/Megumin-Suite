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

import { editableTree } from "./edits.js";

// The built-in texts; IMAGE_V2_PROMPTS reads each one's Dev Mode edit.
export const IMAGE_V2_BUILTIN = {
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
            "On the left is @Mira:waist. She sits at the bar, laughing, holding a mug.",
            "On the right is @Theo:waist. He leans on the counter, smiling at her.",
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
            "On the left is @Mira:waist. She sits at the bar, laughing, holding a mug.",
            "On the right is @Theo:waist. He leans on the counter, smiling at her.",
            "Shelves of bottles line the wall behind them, rain runs down the window, and warm lamplight fills the room."
        ].join("\n"),
        // Plan 026: Qwen Image, from Qwen's own prompt-rewriting guide. One long
        // paragraph describing the finished image; @Name still carries the look.
        qwen: [
            "## How to write the image prompt",
            "Write one long paragraph in English that describes the finished image as if you were looking at it: present tense, third person, plain statements. About twenty sentences, 300 to 450 words.",
            "",
            "1. **The opening sentence**, about twenty words: what kind of image it is, the art style below in a few words, ONE framing (close-up, medium shot, full-body shot, wide shot), who is there in plain words (a young woman, two people, never @Name), what is happening, and the background with its palette. \"The image is a medium-shot anime illustration of two people laughing at a tavern bar at night, the room glowing in warm amber tones.\"",
            "2. **Right after, the background and the place**: what the back of the frame is and what stands in it.",
            "3. **Walk the frame.** For a scene: the top of the frame, then the left side, the centre and the right side, then the foreground along the lower edge. For one person: the background and how it falls away, their pose and where they sit in the frame, their face and expression, then what they hold. Start about a third of your sentences on a place in the frame: \"On the right side of the frame, …\", \"In the upper-left corner, …\", \"Along the lower edge, …\".",
            "4. **Each character where they stand**: the place in the frame, then @Name (\"On the left side of the frame sits @Mira.\"). @Name carries that character's whole look and clothing. Then, starting with He, She or They, what only they are doing: posture, where they look, their expression, their hands and what they hold. The one the moment is about comes first. Three characters at most; mention anyone else briefly as people in the background.",
            "5. **Text that can be read**, only when the moment has some (a phone screen, a letter, a sign): where it sits, what it looks like and what it says, in double quotes, in English. Text too far away or too small to read is blurred. With nothing to read, write no text.",
            "6. **The light, in a sentence of its own**: \"The lighting is …\", with its source, direction and softness, and the shadows it leaves.",
            "7. **One closing sentence on the whole frame**: \"The overall composition …\", with its balance, palette and mood. Only one.",
            "",
            "Rules:",
            "- <Cast> is reference only. Never write hair, eyes, face shape, skin, body or clothing for a @Name character. The one exception: when <Cast> explicitly says \"wearing: not noted\", describe what they wear right after their @Name.",
            "- Write each @Name once, where that character stands, and nowhere else: not in the opening sentence, not later. After it, use he, she or they: \"her hand\", not \"Mira's hand\"; \"the bedroom\", not \"Theo's bedroom\".",
            "- The image is one frozen instant. Write what is true at that instant: \"her eyes flick toward the bedroom doors\", not \"her gaze darts to the doors before snapping back\".",
            "- Draw the moment, not the story. Show feelings as what the face and body do: \"laughing with her head tipped back\", not \"happy because he joked\"; \"a forced, too-wide smile\", not \"a strained grin\". Describe what can be seen: \"a picture frame lying face down\", not \"hiding the photograph\".",
            "- Everything holds together physically: windows and doors sit in walls, shadows fall away from the light, and things keep their size next to each other.",
            "- Give every colour a modifier (deep navy, pale cream, warm terracotta) and every object its material (weathered wood, frosted glass, dented pewter). Name each thing: \"two green bottles and a chipped clay bowl\", never \"various items\". Write small counts as words.",
            "- Small details belong: a chipped mug, steam rising from a cup, a ring on a finger.",
            "- For background things you can't be sure of, you may hedge: \"appears to be\", \"wood or dark laminate\". Never for the characters.",
            "- No quality words (masterpiece, 8K, highly detailed), no ratio, no resolution.",
            "- Output the paragraph only, on one line: no heading, no quotation marks around it, nothing before or after.",
            "",
            "Example (made-up characters; use the names from <Cast>):",
            "The image is a medium-shot anime illustration of a man and a woman sharing a laugh at a crowded tavern bar at night, the room glowing in warm amber and deep brown tones. Behind them, the back wall is lined with dark wooden shelves holding rows of green and amber glass bottles, a few of them dusty and half-empty. Across the top of the frame, heavy oak beams cross the ceiling, with a wrought-iron lantern hanging from the one on the left. On the left side of the frame sits @Mira:waist. She sits sideways on a tall stool with one elbow on the bar, laughing with her head tipped back and her eyes half closed, both hands wrapped around a dented pewter mug. In the centre of the bar top, a wooden board holds a heel of crusty bread and a small wedge of pale yellow cheese beside a chipped clay bowl. On the right side of the frame stands @Theo:waist. He leans forward on the counter on both forearms, smiling at her with one eyebrow raised, a folded cloth tucked over his shoulder. In the background between them, a few blurred patrons sit at round tables, their faces softened by a haze of pipe smoke. On the far right, a rain-streaked window shows a dark street and the smeared glow of a lamppost outside. Along the lower edge of the frame, the bar's scarred surface catches the light in a long glossy streak, with two damp rings left by earlier mugs. A small chalkboard propped against the bottles reads \"ALE 2 COPPER\" in uneven white letters. The lighting is warm and low, coming mostly from the lantern above and to the left, casting soft shadows to the right across the bar and leaving the corners of the room in deep brown shade. The overall composition is balanced between the two figures, framed by the shelves behind them, with a warm, cosy palette and a lively, friendly mood."
        ].join("\n"),
        // Plan 027: Krea 2, from the hand tests. A short paragraph; each
        // character's expression goes BEFORE @Name (after the look, Krea left
        // the face blank). No art style: it comes from the LoRA and the prefix.
        krea: [
            "## How to write the image prompt",
            "Write one paragraph in English, under 200 words of your own, in this order:",
            "",
            "1. **The shot**, one sentence: the framing (close-up, upper body, medium shot, cowboy shot, full body, wide shot), the angle, where the camera is, and who is there in plain words (a young woman, two men). \"Medium shot at eye level from a tavern doorway, looking at a young woman and a young man at the bar.\"",
            "2. **The light**, a few words: \"Warm lamplight from above the bar.\"",
            "3. **Each character**, the one the moment is about first: where they are in the frame, their name, their expression in a few strong words, then @Name, then what they are doing. \"On the left, Mira, laughing, eyes squeezed shut and cheeks flushed, @Mira:waist, sitting sideways on a stool with both hands around a mug.\"",
            "4. **The place**, one or two sentences: what frames them and what stands behind them.",
            "",
            "Rules:",
            "- <Cast> is reference only. @Name carries their look and clothing, so write no hair, eyes, body or clothing for them. The one exception: when <Cast> says \"wearing: not noted\", describe what they wear right after their @Name.",
            "- The expression comes before @Name, every time. Written after it, the image model leaves the face blank.",
            "- Write each @Name once. In the actions, call the others by name: \"smiling at Mira\".",
            "- Three characters at most; mention anyone else briefly as people in the background.",
            "- Draw the moment. Show feelings as what the face and body do: \"red-faced, eyes wide, mouth open mid-stammer\".",
            "- No art style, no quality words, no ratio.",
            "- Output the paragraph only, on one line.",
            "",
            "Example (made-up characters; use the names from <Cast>):",
            "Medium shot at eye level from a tavern doorway, looking at a young woman and a young man at the bar. Warm lamplight from above the bar. On the left, Mira, laughing, eyes squeezed shut and cheeks flushed, @Mira:waist, sitting sideways on a stool with both hands around a dented mug. On the right, Theo, amused, one eyebrow raised and a crooked grin, @Theo:waist, leaning on the counter on both forearms and smiling at Mira. Dark wooden shelves of green and amber bottles line the wall behind them, and rain runs down a window on the far right."
        ].join("\n")
    },

    // Plan 027: how much of each character the frame shows, after @Name.
    // Sent right after the guide, for every style that writes @Name.
    levels: "How much of each character the frame shows goes right after their @Name: @Mira:face for a close-up of the face, @Mira:upper for the chest up, @Mira:waist for the thighs up, @Mira:full when their feet are in the frame. Add :nude when they wear nothing at that moment: @Mira:full:nude.",

    // Plan 027: looks for Qwen and Krea, which draw the body in nude shots,
    // where a look with one tag per part drifted.
    lookDetail: "Give Upper and Lower 3 to 5 tags each, with the details that show when they are uncovered: breast size and shape, nipple colour, navel, body hair, tan lines, birthmarks and where each sits.",

    // Plan 026: the art style picked on the V2 tab, sent after the Qwen guide.
    // {{artStyle}} = the style's description (QWEN_ART_STYLES) or your own text.
    artStyleLine: "Art style: {{artStyle}}. Name it in a few words in the opening sentence, and let the rest show in how you describe surfaces, colour and light.",

    // The shot lines for the Qwen style: no tags ("pov"), and the opening
    // sentence names the framing, which decides whether a body is shown.
    shotQwen: {
        cinematic: "Shot: a film still of the moment. Pick a wide, medium or close shot to suit it, and say which in the opening sentence.",
        pov: "Shot: seen through {{user}}'s eyes. {{user}} is the viewer: write \"the viewer\" for them (looking at the viewer, reaching toward the viewer), never their name. The viewer is behind the camera, so describe only what is in front of them. Never describe the viewer's own face, head, hair, glasses, bandages or injuries: the image model would draw them on someone in the frame. A character who touches the viewer's face is shown reaching toward the viewer. The viewer's hands or knees may show at the lower edge only when they touch something. The opening sentence says the image is seen from the viewer's point of view.",
        portrait: "Shot: one character, a close-up from the chest up, walked as a single subject: the background and how it falls out of focus, their pose, their face and expression, and the clothing at the edge of the frame."
    },

    // Plan 027: the "Text in images" switch (Qwen Image and Krea 2 draw text).
    // English whatever the story's language. With inline images the quotes
    // become single quotes, since the prompt sits inside prompt="...".
    textInImages: "When the moment has a short spoken line or a word worth showing, you may put it in the picture: a speech bubble beside the speaker, a sign, a phone screen or a sound effect. Write the exact words in English in double quotes and say where they sit: a speech bubble beside Mira's head reads \"Back off!\". A few words, one or two pieces of text at most, and none in a quiet moment.",

    // The shot lines for Krea 2: the framing opens the paragraph.
    shotKrea: {
        cinematic: "Shot: a film still of the moment. Pick a wide, medium or close shot to suit it, and open the paragraph with it.",
        pov: "Shot: seen through {{user}}'s eyes. Start the prompt with \"Point-of-view\". {{user}} is the viewer: write \"the viewer\" for them, never their name. Describe only what is in front of the viewer, and never their own face, hair, glasses, bandages or injuries: the image model would put those on someone in the frame. The viewer's hands may show at the lower edge only when they touch something.",
        portrait: "Shot: one character from the chest up (@Name:upper), their face and expression first, with a simple background from the place."
    },

    // Qwen's looks: the saved tags turned into a detailed phrase per body part
    // (plan 027), so a close-up can leave the legs out.
    qwenLook: {
        system: "You turn booru appearance tags into detailed plain descriptions for an image model that reads long paragraphs.",
        task: [
            "For each character, turn the tags on each line into a plain phrase for that part of the body, 30 to 60 words in all.",
            "Core: one phrase that starts with \"a\" or \"an\": their life stage (a young adult, in her thirties, elderly), build and skin tone.",
            "Head: their hair with its colour, length and style, their eye colour, and marks on the face with where they sit.",
            "Upper, Lower and Feet: what that line's tags say, as a short phrase. Leave the line empty when its tags are empty.",
            "Give every colour a modifier: deep auburn, pale ivory, steel grey. Describe only their permanent appearance: no clothing, no names, no actions. State it plainly.",
            "Example:",
            "<Character_Qwen name=\"Mira\">",
            "Core: a slender young woman in her twenties with pale, lightly freckled skin",
            "Head: long wavy deep auburn hair falling past her shoulders, bright emerald-green eyes and a small mole under her left eye",
            "Upper: a modest bust",
            "Lower: long slim legs",
            "Feet:",
            "</Character_Qwen>"
        ].join("\n")
    },

    // Qwen's outfits: World State's outfit text as one phrase, once per outfit.
    qwenOutfit: {
        system: "You turn clothing descriptions into detailed plain descriptions for an image model that reads long paragraphs.",
        task: "Describe each outfit part by part, one phrase per line: Head (hats, glasses, earrings), Upper (tops, jackets, dresses, anything on the arms), Lower (skirts, shorts, trousers, underwear, tights) and Feet (socks, shoes); a garment that covers several goes on the highest one. On each line, one part per garment, each with its colour, material and cut or print (\"a loose cream cable-knit wool sweater\", \"faded light-blue denim jeans\"), joined with commas and a final \"and\". Keep the state of dress on its line (sleeves rolled up, unbuttoned, barefoot). Clothing only, nothing the text does not say. List only what they wear: never \"and nothing else\" or what they are not wearing, unless the text says they are partly undressed. Leave a line empty when nothing is worn there."
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
    descriptionsInEnglish: "Write the descriptions in English, whatever language the story is told in.",

    manualTask: "The image shows the moment <Last_Message> ends on. <Earlier_Story> is only there so you understand it: draw nothing that has already ended (someone who put an item away no longer holds it). Write the image prompt for that moment. Output only the prompt, nothing else.",
    manualTaskWithExtras: "The image shows the moment <Last_Message> ends on. <Earlier_Story> is only there so you understand it: draw nothing that has already ended (someone who put an item away no longer holds it). Write the image prompt for that moment.",

    inlineHead: "### IMAGE\n{{conditionalText}}Within your response, insert {{imageCount}} image tag(s) like this: <img prompt=\"...\"> at the moment the image shows.",
    // Plan 018: the V11 preset's rules up top; <turn_notes> says when an image is due.
    inlineHeadSplit: "### IMAGE\n{{conditionalText}}When <turn_notes> asks for an image, insert the image tag like this: <img prompt=\"...\"> at the moment the image shows.",
    inlineTail: "Inside prompt=\"...\", never use double quotes."
};

export const IMAGE_V2_PROMPTS = editableTree(IMAGE_V2_BUILTIN, "imageV2");

// Plan 026: the Qwen style's art styles. `text` fills {{artStyle}}; "custom"
// sends the user's own text instead.
export const QWEN_ART_STYLES = [
    { id: "anime", label: "Anime illustration", text: "anime illustration with clean, confident line art, cel shading with soft gradient highlights, vivid saturated colours and expressive faces with large, detailed eyes" },
    { id: "semireal", label: "Semi-realistic anime", text: "semi-realistic digital painting with an anime influence, painterly blended shading, realistic proportions and lighting, fine hair strands and soft fabric folds" },
    { id: "webtoon", label: "Webtoon", text: "full-colour webtoon illustration with crisp line art, smooth cel shading, clean bright colours and soft glowing highlights" },
    { id: "photo", label: "Realistic photograph", text: "realistic photograph taken with a full-frame camera and a prime lens, natural skin texture, true-to-life colour and a shallow depth of field with soft bokeh" },
    { id: "film", label: "Cinematic film still", text: "cinematic film still with wide framing, moody colour grading, gentle film grain and dramatic light from real sources in the scene" },
    { id: "watercolour", label: "Watercolour", text: "watercolour illustration on textured paper, soft bleeding washes, visible pigment granulation and loose ink outlines" },
    { id: "render3d", label: "Stylised 3D render", text: "stylised 3D render with soft global illumination, smooth skin with gentle subsurface glow and slightly exaggerated proportions" },
    { id: "custom", label: "Your own", text: "" },
];

/** The art style text sent for a pick: the list's description, or your own text. Empty = Anime illustration. */
export function qwenArtStyleText(id, custom = "") {
    if (id === "custom" && String(custom || "").trim()) return String(custom).trim();
    const s = QWEN_ART_STYLES.find(x => x.id === id && x.text) || QWEN_ART_STYLES[0];
    return s.text;
}
