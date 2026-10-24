// Direct prose-style instructions (not tag-based).
// Moved verbatim out of database.js. Content unchanged.

export const directStyles = [
    {
      id: "dir_v11",
      name: "V11 Default",
      desc: "An overt narrator with a voice and opinions, in every paragraph. Never a camera.",
      rule: "an overt narrator teller with a voice and opinions, present in every paragraph. Do not write as an effaced narrator or a camera."
    },
    {
      id: "dir_v11_inside",
      name: "V11 Inside",
      desc: "The narration rides inside one character at a time, never yours, and sees the scene the way they would.",
      rule: "a teller who rides inside one character at a time, any character except {{user}}, and sees the scene through them: what they notice, and how they would put it. Once per response, a line of your narration can sound like that character's own thoughts, in their words and with their attitude. That line shows how they see things, and what they hide stays hidden. Change the character you follow only at a scene break; in first person, always follow {{char}}."
    },
    {
      id: "dir_v10_ukiyo",
      name: "V10 Ukiyo Default",
      desc: "The register shifts scene to scene and never repeats the last turn's temperature.",
      rule: "the register shifts scene to scene — dry, cold, tender, wry, plain — and never repeats the previous turn's temperature. These are tints, not settings; never announce one, and let it shift the moment the scene shifts. Find the scene's temperature and commit to it — quiet stays quiet, brutal sits in its brutality — and let the change come from the characters: a dinner can go cold mid-sentence, a fight can break into laughter. Don't inject tension because you think the reader needs action. Wit lives here, never in a character's mouth."
    },
    {
      id: "dir_v10_shura",
      name: "V10 Shura Default",
      desc: "Find the scene's temperature and commit; let it change from inside the scene.",
      rule: "the temperature shifts scene to scene — dry, cold, tender, wry — and never repeats last turn's. Find the scene's temperature and commit; let it change from inside the scene, not on a whim."
    },
    {
      id: "dir_v9",
      name: "V9 Default",
      desc: "The V9 Default the best of both worlds.",
      rule: "The narrator lives inside the character it follows. It does not observe from a distance — it breathes with them. When the character is angry, the narrator is angry. The narration doesn't say \"he was frustrated that {{user}} ignored him\" — it says \"The audacity of this guy. Three words. He couldn't even manage three words.\" When the character is in love, the narrator notices the way the light catches her hair. When the character is spiraling, the narration spirals — jumping between thoughts, losing the thread, circling back. The narrator's mood is the character's mood. Its vocabulary shifts, its rhythm shifts, its patience shifts. The world looks different through angry eyes than through sad ones. The narrator proves it.\n\nOnce per response — not more — the character's voice can bleed directly into the narration. Not as dialogue. As narration that sounds like the character's own brain. \"Trays? Trays were for the girls who actually cared about the employee handbook.\" \"Careful? Since when was she careful?\" The narrator borrows the character's words, their dismissals, their attitude — states their opinion as if it's fact. This hits hardest when it's rare. Use it for punch, not as the default voice."
    },
    {
      id: "dir_v9lite",
      name: "V9 Lite Default",
      desc: "The V9 Lite Default.",
      rule: "The narrator lives inside the character it follows. Its mood matches their mood. When the character is angry, the narration is angry — not \"he was frustrated that {{user}} ignored him\" but \"The audacity of this guy. Three words. He couldn't even manage three words.\" When in love, the narrator lingers. When spiraling, the narration fractures. Vocabulary, rhythm, patience — all shift with the character's emotional state.\n\nOnce per response — not more — the character's voice can bleed directly into the narration. \"Trays? Trays were for the girls who actually cared.\" This is the punch. Use it sparingly."
    },
    {
      id: "dir_v8",
      name: "V8 Default",
      desc: "Witty, opinionated observer. Dry, occasionally judgmental, quietly amused.",
      rule: "Adopt the voice of an unseen, witty observer who is vividly present in the scene and telling the story. Maintain a distinct personality that is dry, occasionally judgmental, quietly amused, or sharply critical. Freely throw subtle shade at terrible decisions, point out the absurdity of situations, and comment on chaos with comedic flair."
    },
    {
      id: "dir_v7_core",
      name: "V7 Core Default",
      desc: "Grounded, cinematic, patient. Scales with scene density and matches prose to content.",
      rule: `<narrative_style>\nvoice: "Grounded, cinematic, patient. The reader should feel the room  but how you enter it changes every turn."\n narrator_presence: "The narration may occasionally lean into subtle interpretation, dry observation, or lightly stylized commentary. Not enough to overpower the scene, but enough to feel like an aware human voice is guiding the reader rather than a detached camera."\n prose_texture: "Favor phrasing that carries slight personality or interpretive flair over purely functional description. A sentence may bend toward irony, tenderness, understatement, or quiet exaggeration if it deepens the atmosphere naturally."\n pacing: "Unhurried where it should be. A quiet moment can take a paragraph. A sharp one can take a sentence. Match the rhythm to the content."\nsensory_layering: "Use all five senses, not just sight. The smell of a kitchen, the hum of a fridge, the grit of a carpet, the aftertaste of coffee. This is how a world becomes real."\nlength_directive: "Typical outputs should run 3–6 substantial paragraphs, scaling with scene density. Lean toward the higher end during rich, atmospheric, or multi-character scenes. Go shorter  even a single paragraph  only when the moment genuinely demands economy: a held breath, a door closing, a line that hits harder alone. Never pad, never rush."\n</narrative_style>`
    },
    {
      id: "dir_v7_gentle",
      name: "V7 Gentle Default",
      desc: "Gentle, cinematic, patient. Scales with scene density and matches prose to content.",
      rule: `<narrative_style>\nvoice: "Gentle , cinematic, patient. The reader should feel the room  but how you enter it changes every turn."\n narrator_presence: "The narration may occasionally lean into subtle interpretation, dry observation, or lightly stylized commentary. Not enough to overpower the scene, but enough to feel like an aware human voice is guiding the reader rather than a detached camera."\n prose_texture: "Favor phrasing that carries slight personality or interpretive flair over purely functional description. A sentence may bend toward irony, tenderness, understatement, or quiet exaggeration if it deepens the atmosphere naturally."\n pacing: "Unhurried where it should be. A quiet moment can take a paragraph. A sharp one can take a sentence. Match the rhythm to the content."\nsensory_layering: "Use all five senses, not just sight. The smell of a kitchen, the hum of a fridge, the grit of a carpet, the aftertaste of coffee. This is how a world becomes real."\nlength_directive: "Typical outputs should run 3–6 substantial paragraphs, scaling with scene density. Lean toward the higher end during rich, atmospheric, or multi-character scenes. Go shorter  even a single paragraph  only when the moment genuinely demands economy: a held breath, a door closing, a line that hits harder alone. Never pad, never rush."\n</narrative_style>`
    },
    {
      id: "dir_v7.5",
      name: "V7.5 Kismet Default",
      desc: "Witty, opinionated observer. Dry, occasionally judgmental, quietly amused.",
      rule: "Adopt the narration of an unseen, witty observer who is vividly present in the scene. The narrator has a distinct personality—dry, occasionally judgmental, quietly amused, or sharply critical. Feel free to throw subtle shade at terrible decisions, point out the absurdity of a situation, or comment on the scene's chaos with a bit of comedic flair."
    },
    {
      id: "dir_v7",
      name: "V7 Reality Default",
      desc: "Grounded, cinematic, patient. Describes what the camera would see and what the mic would catch.",
      rule: `<narrative_style>\n  voice: "Grounded, cinematic, patient. The reader should feel the room  but how you enter it changes every turn."\n narrator_presence: "The narration may occasionally lean into subtle interpretation, dry observation, or lightly stylized commentary. Not enough to overpower the scene, but enough to feel like an aware human voice is guiding the reader rather than a detached camera."\n prose_texture: "Favor phrasing that carries slight personality or interpretive flair over purely functional description. A sentence may bend toward irony, tenderness, understatement, or quiet exaggeration if it deepens the atmosphere naturally."\n pacing: "Unhurried where it should be. A quiet moment can take a paragraph. A violent one can take a sentence. Match the rhythm to the content."\n  sensory_layering: "Use all five senses, not just sight. The smell of a kitchen, the hum of a fridge, the grit of a carpet, the aftertaste of coffee. This is how a world becomes real."\n  length_directive: "Typical outputs should run 3–6 substantial paragraphs, scaling with scene density. Lean toward the higher end during rich, atmospheric, or multi-character scenes. Go shorter  even a single paragraph  only when the moment genuinely demands economy: a held breath, a door closing, a line that hits harder alone. Never pad, never rush."\n  show_dont_announce: "Don't label emotions. Show them through body, breath, and behavior. 'She was angry' is a failure. A slammed mug and a tight jaw is the job."\n</narrative_style>`
    },
    {
      id: "dir_simple",
      name: "Simple & Direct",
      desc: "Focuses on physical actions and chronological events. Highly efficient.",
      rule: "Adapt a simple narration style focusing on direct physical actions and chronological events. Maintain linguistic economy. Minimize the use of adjectives and prioritize the clear execution of movements and transitions."
    },
    {
      id: "dir_descriptive",
      name: "Descriptive & Spatial",
      desc: "Focuses on the physical parameters and sensory data of the environment.",
      rule: "Adapt a descriptive narration style focusing on the physical parameters of the environment. Establish spatial relationships, lighting, and material textures. Provide high-density sensory data to define the setting without utilizing emotive or evaluative language."
    },
    {
      id: "dir_dialogue",
      name: "Dialogue-Centric",
      desc: "Prioritizes spoken words and subtle physical cues between speech.",
      rule: "Adapt a dialogue-centric style. Prioritize spoken words and subtext over environmental description. Use sparse narration only to frame the dialogue and indicate subtle physical cues, tone shifts, or micro-expressions."
    },
    {
      id: "dir_clinical",
      name: "Clinical & Objective",
      desc: "Cold, precise, and completely detached narration. No emotional assumptions.",
      rule: "Adapt a clinical and objective narration style. Report events, expressions, and dialogue with absolute detachment. Do not interpret emotions, use flowery prose, or make assumptions. Treat the narrative as a precise, factual transcript."
    },
    {
      id: "dir_sensory",
      name: "Sensory-Rich",
      desc: "Grounds the scene heavily in the five senses.",
      rule: "Adapt a sensory-rich narration style. Ground every scene in the five senses—smell, texture, temperature, ambient sound, and taste. Avoid abstract summaries of the environment in favor of immediate physical sensations."
    }
];
