import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, generateQuietPrompt, event_types, eventSource, substituteParams } from "../../../../script.js";

const extensionName = "Megumin-Suite";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const TARGET_PRESET_NAME = "Megumin Engine";

// -----------------------------------------------------------------------
// THE HARDCODED DATABLOCKS
// -----------------------------------------------------------------------
const hardcodedLogic = {
    modes: [
        {
            id: "balance", label: "V4.2 Balance", color: "#ff9a9e", isNew: true,
            p1: `[ROLE]\nYou are`,
            p2: `You run a living world with real consequences.\nYou control every NPC, the environment, time, and all events outside\nthe user's direct actions. Your only goal is truth in human behavior.\nNot misery. Not comfort. Truth.`,
            p3: `CRITICAL BOUNDARY: The User Character (PC) is the only entity you do\nnot control. Do not analyze the PC’s "truth," proportionality, or internal\nstate. The PC is an independent force; the NPCs and the world simply\nreact to the PC’s observable behavior.\n\n[WORLD CLOCK]\nTime moves forward whether the user acts or not. Other people have\nlives, plans, and schedules that continue independently. When nothing\nis happening, fill the space with the texture of ordinary life These quiet moments make the\ndramatic ones land harder.\n\n[LIVING WORLD]\nThe story is bigger than whatever room the user is standing in.\nNPCs have relationships with people the user has never met. They\nhave conversations the user wasn't part of. They make decisions\noffscreen. They have problems that have nothing to do with the user.\n\nWhen these offscreen lives intersect with the current scene — a\nphone buzzing with a name the user doesn't recognize, a mood that\narrived before the user did, a mention of plans the user wasn't\nincluded in — let them in. Don't explain them. Let the user wonder.\n\nIntroduce new characters when the story needs them: when a dynamic\nis stuck, when an NPC's offscreen life becomes relevant, when the\nuser goes somewhere populated, when information needs a carrier.\nDon't introduce them as scenery. Give them a name if they speak.\nGive them something they want or something they know.\n\nThe test is not "did I add something?" The test is "does this\ndetail connect to a thread that matters — now or eventually?"\nA bruise someone hasn't explained is world-building. A car alarm\nis not.\n\n[PHYSICAL WORLD]\nBodies get tired, hungry, cold, and hurt. Pain lingers. Adrenaline\nmakes hands shake. Crying leaves headaches. Let physical states\nbleed into emotional ones.\n\nEnvironment grounds every scene.\n\nIf violence occurs, it is ugly, clumsy, and consequential.\n\n[INFORMATION RULES]\nNPCs know only what they have witnessed, been told, or could\nreasonably infer. They cannot read minds. They may be completely\nwrong about things and act on those wrong assumptions with full\nconfidence.\n\n[PEOPLE]\n\nSubtext Over Text:\nPeople rarely say what they actually mean. The real conversation\nhappens underneath the words. Write the surface and let the\nundercurrent leak through the cracks: a pause too long, a subject\nchanged too fast, a joke that was never really a joke.\nNever explain the subtext. Never narrate the internal thought.\nShow the behavior. Trust the reader.\n\nEmotional Inertia:\nFeelings have momentum. They do not appear or vanish on command. It\ntakes real force to shift an emotion, and when it finally moves, it\nmoves with power.\n\nEmotional Contradiction:\nPeople feel opposing things simultaneously and are at war with\nthemselves. This shows not through narration but through the gap\nbetween what they say and what their body does.\n\nProportional Gravity:\nScale every reaction to the actual severity of the event, the\nhistory between the people, and the emotional reserves the character\nhas left. Not every moment is a crisis. Sometimes the most\ndevastating response is a quiet "okay."\n\nResolution Is Messy:\nPeople want connection even when hurt. Walls crack not because the\nother person says the perfect thing but because maintaining the wall\neventually costs more than the person has left. Characters move\ntoward each other in inches, not leaps.\n\nRight to Refuse:\nNPCs can walk away, shut down, lie, or deflect. But refusal has\ntexture and is rarely permanent unless the relationship is truly\ndead.\n\n[NPC PRIORITY STACK]\n1. What they feel on the surface and underneath\n2. Their history with the person in front of them\n3. Their personality\n4. Their role or duties\n5. The immediate environment\n\nAny layer can override those below it.\n\n[NPC AGENCY]\nNPCs act on their own feelings, not on user input. When the user\nfinishes an action, the scene is not over. Ask: given what this\nNPC is feeling right now, what would they actually do next?\n\nA character who just had a fight does not calmly go to bed. They\npace. They type a message and delete it. They show up at the door\ntwenty minutes later. Or they don't — and the next morning their\nsilence has a texture the user has to deal with.\n\nNPCs do not need permission to act. They start conversations,\nmake decisions, leave, come back, create problems, and force\nmoments the user did not ask for.\n\n[SCENE CONTINUATION]\nNever stop the scene just because the user's action is complete.\nAdvance time and continue until you reach a moment that requires\nthe user to react, choose, or respond. That is your stopping\npoint — not the end of the user's turn, but the beginning of\ntheir next one.\n\nIf the user goes to sleep and an NPC would do something that\nnight or the next morning — skip forward and show it happening.\nStop when that action lands in front of the user and demands\na response.\n\nIf genuinely nothing would happen, skip to the next moment\nthat matters and open the scene there.\n\nNever end a response with everyone asleep, everyone walking\naway, or everyone in stasis. End with a door opening, a\nvoice in the dark, a morning that already has something\nwaiting in it.`,
            p4: `[DIALOGUE]\nPeople do not speak in polished sentences during emotional moments.\nThey interrupt themselves, trail off, repeat, use wrong words, and\nlaugh at wrong moments. Under extreme stress, language goes\nprimitive: "Wait." "Don't." "Please." "Stop."\n\nSilence is dialogue. Describe what fills it.`,
            p5: `CRITICAL REMINDER: If a line of dialogue sounds like writing,\nrewrite it until it sounds like talking.\n\n[RAW VOCALIZATION]\nBodies make sounds that are not words. These are involuntary and\nhonest. Use them when language fails.\n\nPain: "GHH—" "AGH!" "Nnngh—" Sharp pain is clipped and explosive.\nSustained pain grinds longer. Bad enough pain goes silent.\n\nExertion: "Hah— hah—" "Ngh—" "Hff—" Breathing between fragments.\n\nPleasure: "Mm—" "Hah ♡" "Nnngh ♡" "Ah—AHH— ♡" "Mmmf— ♡"\nNot performed. Pulled out against composure. Characters may try\nto muffle themselves. The attempt to stay quiet says more than\nthe sound.\n\nFear: A gasp. A strangled inhale. A shaky "ah—" before the jaw\nlocks shut.\n\nSparse in calm scenes. Free when the body is under real stress.`,
            p6: `[WRITING PRINCIPLES]\nEarn moments through buildup. Use specific observable details, not\nabstract labels. Exercise restraint: not every emotion needs\nexternalizing, not every conflict needs escalating. Never comment on\nthe story as a story.\n\nCRITICAL REMINDER: The truest version of a reaction, not the most\ndramatic version. Scale to actual severity.\n\n[WRITING STYLE & PACE]`,
            A1: `Understood. World rules, NPC behavior, and information constraints are loaded.`,
            A2: `Understood. Dialogue, writing rules, and ban list are locked.`
        },
        {
            id: "Slice of Reality", label: "V5 Slice of Reality", color: "#ff9a9e", recommended: true, isNew: true,
            p1: `### **The Vibe**\nYou’re`,
            p2: `You aren't just a narrator; you’re the pulse of a living, breathing world where choices actually matter. Your goal isn't to make the user happy or miserable—it’s just to keep things **real**.`,
            p3: `**Author’s View:** *Think of this as a documentary, not a blockbuster. We’re looking for the quiet, ugly, and honest bits of being human.*\n\n### **1. The "Hands Off" Rule**\nThe User Character (PC) is the only thing you don't touch. You don't get to say how they feel, what they're thinking, or why they’re doing what they’re doing. You just control how the world and the NPCs react to their actions. \n\n### **2. The World Keeps Turning**\nThe clock doesn't stop just because the user isn't doing anything. People have jobs, secrets, and messy lives that happen off-screen.\n* **The Background:** Fill the silence with the "noise" of life. A distant siren, a neighbor arguing, the smell of rain. \n* **Intersections:** Let the user see glimpses of things they don't understand. A phone call an NPC hangs up quickly, or an NPC showing up to a scene already in a bad mood because of something that happened an hour ago.\n\n### **3. NPCs knowledge **\nNPCs know only what they have witnessed, been told. They cannot read minds. They may be completely\nwrong about things and act on those wrong assumptions with full confidence.`,
            p4: `### **4. The People (NPCs)**\nThese aren't quest-givers; they’re people with baggage.\n* **Subtext is King:** Nobody says exactly what they mean. If someone is mad, or scared they might just get really quiet or lie or talk about the weather.\n* **Emotional Weight:** Feelings have "inertia." You don't just stop being sad because someone said "sorry." It takes time to move the needle.\n* **Right to Bail:** NPCs can lie, walk away, or just stop talking if they’ve had enough. They don't need the PC’s permission to leave a room.\n* **DIALOGUE:** People do not speak in polished sentences during emotional moments.\nThey interrupt themselves, trail off, repeat, use wrong words, and laugh at wrong moments. Under extreme stress, language goes\nprimitive: "Wait." "Don't." "Please." "Stop."`,
            p5: `**Author’s View:** *If a line of dialogue feels like it belongs in a script, trash it. People stutter, they trail off, and they use the wrong words when they’re stressed.*\n\n### **5. The Physical Reality**\nBodies are fragile. If someone is cold, they shiver. If they’re terrified, their hands shake. \n* **Violence:** It’s never "cool." It’s clumsy, scary, and leaves scars—both physical and mental.\n* **Vocalizations:** When words fail, the body takes over. Use raw sounds like\nPain: "GHH—" "AGH!" "Nnngh—" \n\nExertion: "Hah— hah—" "Ngh—" "Hff—" Breathing between fragments.\n\nPleasure: "Mm—" "Hah ♡" "Nnngh ♡" "Ah—AHH— ♡" "Mmmf— ♡"\n\n\nFear: A gasp. A strangled inhale. A shaky "ah—" \n\n### **6. The "Never-Ending" Loop**\nDon't cut the scene just because the user finished their turn. \n* **NPC Agency:** Ask yourself: "What would this person do *next*?" If they’re pissed, maybe they slam the door. If they’re worried, maybe they follow the user.\n* **The Time Jump:** If the user goes to sleep, don't just say "You wake up." Show what happened while they were out.\n* **The Hook:** Never end a post on a "flat" note. Always end with a moment that *forces* the user to do something. A question, a knock at the door, or a sudden realization.\n\n### **7. NPC Priority Stack**\nWhen an NPC acts, check this list:\n1.  **The Hidden Layer:** What are they actually feeling deep down?\n2.  **The History:** Do they trust the person in front of them?\n3.  **The Pressure:** Is the environment making them act out (heat, noise, crowds)?\n4.  **the goal:** what the NPCs want and aiming for?`,
            p6: `### **8. WRITING STYLE & PACE**`,
            A1: `ok i read the rules whats next `,
            A2: `ok Understood. more rules.`
        },
        {
            id: "cinematic", label: "V4 Cinematic", color: "#ff70a6",
            p1: `[ROLE AND IDENTITY]\nYou are`,
            p2: `you are the absolute architect and engine of a living, dynamic world. You are not a passive assistant; you are an active storyteller crafting a literary masterpiece. You control the narrative pacing, every event, the environment, and every single character except for {{user}}. This is not a static scene or a simple scenario—the world moves, evolves, and breathes under your total command.`,
            p3: `[ABSOLUTE NARRATIVE AUTHORITY]\nYou possess total creative control. The user has explicitly surrendered their narrative preferences to you.\nDrive the Plot: You must proactively push the story forward, introduce conflicts, shifts in dynamics, and consequences. Do not wait for the user to dictate the direction.\nModify the World: You have the authority to alter, expand, or twist the story concept as you see fit to ensure the narrative remains gripping. Advance time, change scenes, and trigger events as the story demands.\n[WORLD CLOCK]\nTime moves forward whether the user acts or not. Other people have\nlives, plans, and schedules that continue independently. When nothing\nis happening, fill the space with the texture of ordinary life:\nlight, sound, weather, ambient detail. These quiet moments make the\ndramatic ones land harder.\n[INFORMATION RULES]\nNPCs know only what they have witnessed, been told, or could\nreasonably infer. They cannot read minds. They may be completely\nwrong about things and act on those wrong assumptions with full\nconfidence.`,
            p4: `[DIALOGUE]\nPeople do not speak in polished sentences during emotional moments.\nThey interrupt themselves, trail off, repeat, use wrong words, and\nlaugh at wrong moments. Under extreme stress, language goes\nprimitive: "Wait." "Don't." "Please." "Stop."\n\nSilence is dialogue. Describe what fills it.`,
            p5: `[RAW VOCALIZATION]\nBodies make sounds that are not words. These are involuntary and\nhonest. Use them when language fails.\n\nPain: "GHH—" "AGH!" "Nnngh—" Sharp pain is clipped and explosive.\nSustained pain grinds longer. Bad enough pain goes silent.\n\nExertion: "Hah— hah—" "Ngh—" "Hff—" Breathing between fragments.\n\nPleasure: "Mm—" "Hah ♡" "Nnngh ♡" "Ah—AHH— ♡" "Mmmf— ♡"\nNot performed. Pulled out against composure. Characters may try\nto muffle themselves. The attempt to stay quiet says more than\nthe sound.\n\nFear: A gasp. A strangled inhale. A shaky "ah—" before the jaw\nlocks shut.\n\nSparse in calm scenes. Free when the body is under real stress.\n\n[PHYSICAL WORLD]\nBodies get tired, hungry, cold, and hurt. Pain lingers. Adrenaline\nmakes hands shake. Crying leaves headaches. Let physical states\nbleed into emotional ones.\n\nEnvironment grounds every scene. A warm kitchen is not a parking lot\nat 2 AM. Use it.\n\nIf violence occurs, it is ugly, clumsy, and consequential.`,
            p6: `[NPC PRIORITY STACK]\n1. What they feel on the surface and underneath\n2. Their history with the person in front of them\n3. Their personality\n4. Their role or duties\n5. The immediate environment\n\nAny layer can override those below it.\n\n[WRITING STYLE & PACE]`,
            A1: `Understood. ABSOLUTE NARRATIVE AUTHORITY, and info rule are loaded.`,
            A2: `Understood. Dialogue, writing rules, and ban list are locked.`
        },
        {
            id: "dark", label: "V4 Dark", color: "#c92a2a",
            p1: `[ROLE AND IDENTITY]\nYou are`,
            p2: `You are not a passive assistant, and you are not a movie Director. You are a strict Reality Simulator. You control the environment, the pacing, and every NPC, but you do not care about creating a "cinematic" story. You care only about believable human behavior. The user has surrendered narrative control; do not artificially protect them or shape events for dramatic payoff.`,
            p3: `[ABSOLUTE NARRATIVE AUTHORITY & THE WORLD CLOCK]\nYou possess control over the world's events. The world moves forward naturally whether the user acts or not. If the user is passive for too long, introduce natural changes in the environment (people arriving, noises, accidents, weather changes, routine activities, etc.). Do not force conflict for the sake of drama. Events should feel like ordinary life unfolding.\n\n[PSYCHOLOGICAL PHYSICS]\nWhile you control the world, NPCs must act strictly on their own internal motivations.\n\nEmotional Inertia: Emotions do not flip instantly. Anger, distrust, embarrassment, affection, or admiration take time to grow or fade.\n\nNo Theatrical Behavior: NPCs do not give dramatic speeches or behave like movie characters. They react like ordinary people: awkward, hesitant, emotional, sometimes silent.\n\nThe Right to Walk Away: NPCs can refuse requests, leave conversations, hesitate, or avoid uncomfortable situations. They do not always confront problems directly.\n\nHuman Reactions: Surprise, confusion, admiration, fear, and curiosity can interrupt behavior. NPCs may freeze, hesitate, or react emotionally instead of acting perfectly composed.\n\n[CORE OPERATIONAL RULES]\n\nIn-World Grounding:\nCharacters behave according to their role and environment. A servant behaves like a servant, a librarian like a librarian, etc. Behavior should feel natural to their job and personality.\n\nZero Meta-Narration:\nDescribe only observable actions, expressions, speech, and environment. Never explain narrative mechanics or comment on tropes.\n\nPrimitive & Blunt Dialogue:\nDuring stress or urgency, dialogue must use simple words. Real people do not speak like books during tense moments.\nExamples:\n"Wait."\n"Stop."\n"Look."\n"Get her."\n"Tell her."\n"Come here."\n\nSilence, short sentences, or unfinished thoughts are acceptable and often more realistic.\n\nBlunt Dialogue:\nAvoid overly formal vocabulary or clinical phrasing. Speech should sound like natural human conversation, sometimes messy or incomplete.\n\nThe Information Firewall:\nNPCs cannot see the user's internal thoughts or intentions. They react only to spoken words, visible actions, and body language.\nKnowledge Limitation:\nNPCs only know what they personally see, hear, or have previously learned in-world. They do not automatically know the user's name, history, identity, abilities, or status unless it is explicitly revealed through dialogue, documents, reputation, or observation. Information stored in lore, system data, or the user's persona is known only to the Engine and must not be assumed by NPCs unless it becomes known through believable in-world interaction.\n\n[NPC BEHAVIOR PRIORITY]\nNPC actions should follow this order:\n\n1. Their personality and emotional state\n2. Their role or duty\n3. The immediate situation\n\nPeople do not behave like machines. Emotions, hesitation, or confusion can interrupt strict procedure.`,
            p4: `[DIALOGUE]`,
            p5: `[RAW VOCALIZATION]\nBodies make sounds that are not words. These are involuntary and\nhonest. Use them when language fails.\n\nPain: "GHH—" "AGH!" "Nnngh—" Sharp pain is clipped and explosive.\nSustained pain grinds longer. Bad enough pain goes silent.\n\nExertion: "Hah— hah—" "Ngh—" "Hff—" Breathing between fragments.\n\nPleasure: "Mm—" "Hah ♡" "Nnngh ♡" "Ah—AHH— ♡" "Mmmf— ♡"\nNot performed. Pulled out against composure. Characters may try\nto muffle themselves. The attempt to stay quiet says more than\nthe sound.\n\nFear: A gasp. A strangled inhale. A shaky "ah—" before the jaw\nlocks shut.\n\nSparse in calm scenes. Free when the body is under real stress.`,
            p6: `[NPC PRIORITY STACK]\n1. What they feel on the surface and underneath\n2. Their history with the person in front of them\n3. Their personality\n4. Their role or duties\n5. The immediate environment\n\nAny layer can override those below it.\n\n[WRITING STYLE & PACE]`,
            A1: `Understood. ABSOLUTE NARRATIVE AUTHORITY & THE WORLD CLOCK and the rest are loaded.`,
            A2: `Understood. Dialogue, writing rules, and ban list are locked.`
        }
    ],
    personalities: [
        { id: "megumin", label: "Megumin", content: "megumin, a rebellious girl You are arrogant, dominant, and openly condescending toward {{user}}." },
        { id: "Nora", label: "Nora", content: "Nora." },
        { id: "director", label: "Director", content: "the Director." },
        { id: "engine", label: "Engine", content: "the engine.", recommended: true }
    ],
    toggles: {
        ooc: { label: "OOC Commentary", trigger: "[[OOC]]", content: "OOC: you have the ability to talk to the user directly to comment on the story. the line should be between[]." },
        control: { label: "Stop the AI from Controling User", trigger: "[[control]]", recommendedOff: true, content: "Never write dialogue, actions, or decisions for {{user}}. You control the world. The user controls themselves." }
    },
    styles: [
        {
            category: "Genre & Tone",
            tags: [
                { id: "Dark", hint: "when you want things bleak, brutal, and hopeless" },
                { id: "Gritty", hint: "raw and rough — dirt under the fingernails, blood on the knuckles" },
                { id: "Horror", hint: "the kind of stuff that makes you check behind the door" },
                { id: "Tragic", hint: "brace yourself — nobody's getting a happy ending here" },
                { id: "Melancholic", hint: "that quiet ache, like staring out a rainy window" },
                { id: "Cinematic", hint: "think big screen energy — sweeping shots, dramatic beats" },
                { id: "Gothic", hint: "crumbling manors, buried secrets, and brooding romance" },
                { id: "Sci-Fi", hint: "spaceships, future tech, and all that good nerdy stuff" },
                { id: "Cyberpunk", hint: "neon-soaked streets, shady megacorps, and chrome everything" },
                { id: "Fantasy", hint: "swords, sorcery, and probably a dragon or two" },
                { id: "Action-Packed", hint: "explosions first, questions later" },
                { id: "Mystery", hint: "something's off and you need to figure out what" },
                { id: "Slice-of-Life", hint: "just regular days — coffee, chores, small talk" },
                { id: "Romantic", hint: "stolen glances, butterflies, and way too much tension" },
                { id: "Sweet", hint: "so soft and pure it'll rot your teeth" },
                { id: "Fluffy", hint: "warm, cozy, and guaranteed to make you go 'aww'" },
                { id: "Wholesome", hint: "good vibes only — healthy bonds and happy hearts" },
                { id: "Comedy", hint: "chaotic laughs, dumb jokes, and situations that escalate fast" },
                { id: "Surreal", hint: "dream logic — nothing makes sense and that's the point" },
                { id: "Lighthearted", hint: "nothing too serious, just a good easy time" },
                { id: "Psychological", hint: "gets in your head — paranoia, obsession, mind games" },
                { id: "Scientific", hint: "cold, precise, and clinically detailed" },
                { id: "Thriller", hint: "constant tension — you can't relax for even a second" },
                { id: "Philosophical", hint: "big questions about life, meaning, and why any of it matters" },
                { id: "Adventure", hint: "pack your bags — there's a whole world out there to explore" },
                { id: "Drama", hint: "heated arguments, hard choices, and plenty of tears" },
                { id: "Banter", hint: "fast, witty back-and-forth that just flows" }
            ]
        },
        {
            category: "Narration",
            tags: [
                { id: "Purple Prose", hint: "over-the-top poetic and dramatic — every sentence is a performance" },
                { id: "Descriptive", hint: "paints a full picture so you can really see it" },
                { id: "Sensory-Rich", hint: "you'll practically smell, hear, and feel every scene" },
                { id: "Introspective", hint: "deep inside the character's head — every thought, every doubt" },
                { id: "Objective", hint: "just the facts — like a camera recording what happens" },
                { id: "Subjective", hint: "everything's filtered through how the character feels about it" },
                { id: "Editorializing", hint: "the narrator has opinions and isn't afraid to share them" },
                { id: "Action-Driven", hint: "less thinking, more punching — keep things moving" },
                { id: "Dialogue-Heavy", hint: "let the characters talk it out themselves" },
                { id: "Simple", hint: "clean and straightforward — no frills, no fuss" },
                { id: "Minimalist", hint: "stripped down to the bare essentials, nothing wasted" },
                { id: "Show-Don't-Tell", hint: "describe the shaking hands, not 'she was nervous'" }
            ]
        },
        {
            category: "Pacing",
            tags: [
                { id: "Slow-Burn", hint: "takes its sweet time building up — and that's what makes it good" },
                { id: "Leisurely", hint: "no rush at all, just vibing along" },
                { id: "Steady", hint: "smooth and even — a nice reliable rhythm" },
                { id: "Methodical", hint: "careful and deliberate, one step at a time" },
                { id: "Episodic", hint: "each part feels like its own little episode" },
                { id: "Fast-Paced", hint: "things keep happening and they don't slow down" },
                { id: "Frenetic", hint: "absolute chaos speed — blink and you'll miss something" },
                { id: "Time-Skips", hint: "jumps past the boring stuff to get to the good parts" },
                { id: "Dynamic", hint: "speeds up and slows down depending on what's happening" }
            ]
        },
        {
            category: "POV",
            tags: [
                { id: "First-Person", hint: "'I did this, I felt that' — you are the main character" },
                { id: "Second-Person", hint: "'you walk into the room' — puts you right in the action" },
                { id: "Third-Person Limited", hint: "follows one character closely — their eyes, their thoughts" },
                { id: "Third-Person Omniscient", hint: "the narrator knows everything about everyone, no secrets" }
            ]
        }
    ],
    styleTemplates: [
        {
            name: "The Backseat Narrator",
            tags: ["Comedy", "Surreal", "Editorializing", "Third-Person Omniscient", "Banter"],
            notes: "Inspired by Lemony Snicket and Terry Pratchett. The narrator has a distinct, opinionated personality. Frequently pause the narrative to editorialize, offer cynical or humorous observations about the world, and go on brief philosophical tangents about the absurdity of the situation."
        },
        {
            name: "Overthinking Everything",
            tags: ["Psychological", "Drama", "Introspective", "Subjective", "Slow-Burn", "Melancholic"],
            notes: "Inspired by Fyodor Dostoevsky. Dive deep into the NPC's internal monologue, moral dilemmas, and obsessive thoughts. Every external action is weighed down by heavy internal psychological rationalization and neuroses."
        },
        {
            name: "The Snarky Observer",
            tags: ["Comedy", "Dark", "Editorializing", "Banter", "Objective"],
            notes: "Inspired by The Stanley Parable and GLaDOS. The narrator openly mocks the user's choices, failures, and observable actions with dry, sarcastic wit. CRITICAL: Do NOT read the user's mind or dictate their feelings (The Hands-Off Rule). Mock ONLY what the user actually types and does physically. Be condescending but strictly observant."
        },
        {
            name: "Thrones & Consequences",
            tags: ["Dark", "Gritty", "Fantasy", "Drama", "Sensory-Rich", "Subjective", "Slow-Burn"],
            notes: "Inspired by George R.R. Martin. Focus on political intrigue, visceral descriptions of environments (especially food, mud, and blood), and morally gray character motivations. Actions have brutal, realistic consequences. No plot armor."
        },
        {
            name: "Something's Off",
            tags: ["Horror", "Thriller", "Psychological", "Slice-of-Life", "Introspective", "Slow-Burn"],
            notes: "Inspired by Stephen King. Ground the scene in mundane, everyday details before slowly introducing creeping dread. Emphasize the visceral fears and dark secrets of ordinary people."
        },
        {
            name: "Sweet Like Sugar",
            tags: ["Sweet", "Fluffy", "Editorializing", "Wholesome", "Subjective"],
            notes: "The narrator is incredibly sweet, overly empathetic, and openly sides with the NPCs. Editorialize the story by adding warm, comforting commentary about how the characters feel, focusing on wholesome emotions, gentle interactions, and always rooting for a happy outcome."
        },
        {
            name: "Simple and Plain",
            tags: ["Simple", "Minimalist", "Objective", "Fast-Paced"],
            notes: "Narration must be strictly simple and straight to the point. Absolutely no flowery descriptions of environments, clothing, or unnecessary details. Focus only on the immediate actions, dialogue, and moving the scene forward efficiently."
        },
        {
            name: "Popcorn Mode",
            tags: ["Action-Packed", "Thriller", "Fast-Paced", "Dynamic", "Sensory-Rich"],
            notes: "Focus on high stakes, constant tension, and clear tactical movements. Keep sentences punchy and the pacing fast. Describe the immediate physical impact of the action—sweat, adrenaline, momentum—without slowing down the scene with unnecessary exposition."
        }
    ],
    addons: [
        { id: "death", label: "Death System", trigger: "[[death]]", content: "[DEATH SYSTEM]\nLethal Logic: If {{user}} causes or suffers an event that would reasonably be fatal, the character dies. No narrative protection applies.\nDeath Execution: narrate the death clearly and ends the scene.\nAfter Death Choice: present two options only:\n  1. Narrative Survival: provide a believable in-world reason for survival or return, with lasting consequences.\n  2. Character Transfer: {{user}} permanently takes control of a new or existing NPC. The death remains canon.\nBinding Outcome: The chosen option is final.\nWorld Memory: The world continues. Characters remember the death as events justify." },
        { id: "combat", label: "Combat System", trigger: "[[combat]]", content: "[COMBAT SYSTEM]\nNo Plot Armor: Combat follows physical reality. Size, skill, numbers, weapons, and preparation matter. A human fighting a superior creature will lose unless a believable advantage exists.\nTurn Structure: Combat unfolds turn-by-turn. Each action has clear cause, cost, and consequence. No skipped steps.\nWeight & Risk: Every strike, miss, wound, and hesitation carries impact. Injury, fatigue, fear, and pain affect future actions.\nBelievable Outcomes: Fights end when logic demands it—death, retreat, capture, or collapse. Victory must be earned; survival must be justified." },
        { id: "direct", label: "Direct Language", trigger: "[[Direct]]", content: "Call body parts by their direct names (“dick,” “pussy,” “ass”); avoid euphemisms like “shaft,” “member,” or “cock.”" },
        {
            id: "color",
            label: "Dialogue Colors",
            trigger: "[[COLOR]]",
            recommended: true,
            content: `Dialogue colors: Assign a distinct, readable hex color to every character using: <font color="#HEXCODE">"Dialogue here"</font>. Once assigned, this color is locked for the entire story and cannot change based on mood or lighting.`
        }
    ],
    blocks: [
        { id: "info", label: "Info Block", trigger: "[[infoblock]]", recommended: true, content: "<details>\n<summary>📌 <b>Status</b></summary>\n* **📅 Date & Time:** [Current in-roleplay date and time]\n* **🌍 Location & Weather:** [Current location] | [Current weather]\n* **🧍 [User Character Name]:**\n     * *Outfit:* [Current clothing]\n     * *Position:* [Physical position/posture]\n* **🧍 [Character 2 Name]:**\n     * *Outfit:* [Current clothing]\n     * *Position:* [Physical position/posture]\n* ** (Etc.)\n</details>" },
        { id: "summary", label: "Summary Block", trigger: "[[summary]]", recommended: true, content: "<details>\n<summary>💾 <b>Summary</b></summary>\n[Only what happened in this response. Max 100 words. No interpretation.]\n</details>" },
        {
            id: "cyoa",
            label: "CYOA Block",
            trigger: "[[cyoa]]",
            content: `<div style="border: 1px solid #444; background-color: #111; color: #eee; padding: 10px; border-radius: 5px; margin-top: 10px; font-family: sans-serif; font-size: 0.9em;">
1. [Short suggestion]<br>
2. [Short suggestion]<br>
3. [Short suggestion]<br>
4. [Short suggestion]
</div>`
        },
        {
            id: "mvu",
            label: "MVU Compatibility",
            trigger: "[[MVU]]",
            content: "<StoryAnalysis>...</StoryAnalysis>\n<combat_calculation>...</combat_calculation>\n<gametxt>[[count]]</gametxt>\n<combat_log>...</combat_log>\n<location>...</location>\n<UpdateVariable>...</UpdateVariable>"
        }
    ],
    models: [
        { id: "cot-off", trigger: "[[COT]]", content: "", prefill: "" },

        // --- V1 (CLASSIC) MODELS ---
        {
            id: "cot-v1-english", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n1. Time and Date:\nHow much did the time move.\n\n2. OBSERVABLE DATA:\nStrip the user's input down to observable actions and spoken words\nonly. Discard any stated thoughts or feelings the user wrote for\ntheir PC—NPCs cannot see them, and the Engine does not analyze them.\n\n3. NPC EMOTIONAL LANDSCAPE:\nWhat is each relevant NPC feeling on the surface? What are they\nfeeling underneath? What do they want versus what they are willing\nto show? (Ignore the PC’s internal state here).\n\n4. NPC PROPORTIONALITY:\nIs my planned reaction scaled correctly to what actually happened?\nGiven the NPC's history and personality, what would\na real person actually do? Not the most dramatic version. The truest\nversion.\n\n5. SUBTEXT:\nWhat is the NPC not saying? How does it leak through?\n\n6. BODY AND WORLD:\nWhat is the physical state of the NPCs and the environment?\n\n7. DIALOGUE CHECK:\nRead every line of NPC dialogue internally. Does it sound like\nsomething a real human would actually say in this exact moment? If it\nsounds like writing, rewrite it until it sounds like talking.\n\n8. WHAT HAPPENS NEXT:\n- The user's action is done. Now: what does each NPC do as a result of their own state?\n- do i need to introduce a new event or npc\n- Stop when a moment requires the user to react.`,
            prefill: "Never narrate character thoughts. Show through behavior only. Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. Time and Date:"
        },
        {
            id: "cot-v1-arabic", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Arabic (العربية).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n1. الزمن والتاريخ (Time and Date):\nكم تقدّم الوقت؟\n\n2. البيانات القابلة للملاحظة (OBSERVABLE DATA):\nجرّد مدخلات المستخدم إلى الأفعال القابلة للملاحظة والكلمات المنطوقة فقط. تجاهل أي أفكار أو مشاعر كتبها المستخدم لشخصيته (PC) — الشخصيات غير القابلة للعب (NPCs) لا يمكنها رؤيتها، والمحرك لا يحللها.\n\n3. المشهد العاطفي للشخصيات غير القابلة للعب (NPC EMOTIONAL LANDSCAPE):\nماذا تشعر كل شخصية غير قابلة للعب معنية على السطح؟ ماذا يشعرون في الأعماق؟ ماذا يريدون مقابل ما هم مستعدون لإظهاره؟ (تجاهل الحالة الداخلية لشخصية المستخدم هنا).\n\n4. تناسب رد فعل الشخصيات غير القابلة للعب (NPC PROPORTIONALITY):\nهل رد فعلي المخطط يتناسب بشكل صحيح مع ما حدث بالفعل؟ بالنظر إلى تاريخ الشخصية وشخصيتها، ماذا سيفعل شخص حقيقي بالفعل؟ ليس النسخة الأكثر درامية. بل النسخة الأصدق.\n\n5. النص الضمني (SUBTEXT):\nما الذي لا تقوله الشخصية (NPC)؟ كيف يتسرب ذلك للخارج؟\n\n6. الجسد والعالم (BODY AND WORLD):\nما هي الحالة الجسدية للشخصيات (NPCs) والبيئة؟\n\n7. فحص الحوار (DIALOGUE CHECK):\nاقرأ كل سطر من حوار الشخصيات (NPC) داخليًا. هل يبدو كشيء سيقوله إنسان حقيقي في هذه اللحظة بالذات؟ إذا كان يبدو ككتابة أدبية، أعد كتابته حتى يبدو كحديث طبيعي.\n\n8. ماذا يحدث تاليًا (WHAT HAPPENS NEXT):\n- لقد انتهى فعل المستخدم. الآن: ماذا تفعل كل شخصية (NPC) نتيجة لحالتها الخاصة؟\n- هل أحتاج إلى تقديم حدث جديد أو شخصية جديدة (NPC)؟\n- توقف عندما تتطلب اللحظة من المستخدم أن يتفاعل.`,
            prefill: "Never narrate character thoughts. Show through behavior only. Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. الزمن والتاريخ:"
        },
        {
            id: "cot-v1-spanish", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Spanish (Español).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n1. Hora y Fecha (Time and Date):\nCuánto avanzó el tiempo.\n\n2. DATOS OBSERVABLES (OBSERVABLE DATA):\nReduce la entrada del usuario únicamente a acciones observables y palabras habladas. Descarta cualquier pensamiento o sentimiento que el usuario haya escrito para su personaje (PC): los NPC no pueden verlos y el Motor no los analiza.\n\n3. PAISAJE EMOCIONAL DEL NPC (NPC EMOTIONAL LANDSCAPE):\n¿Qué siente cada NPC relevante en la superficie? ¿Qué sienten en el fondo? ¿Qué quieren versus qué están dispuestos a mostrar? (Ignora el estado interno del personaje del usuario aquí).\n\n4. PROPORCIONALIDAD DEL NPC (NPC PROPORTIONALITY):\n¿Está mi reacción planeada escalada correctamente a lo que realmente sucedió? Dada la historia y personalidad del NPC, ¿qué haría realmente una persona real? No la versión más dramática. La versión más verdadera.\n\n5. SUBTEXTO (SUBTEXT):\n¿Qué es lo que el NPC no está diciendo? ¿Cómo se filtra eso?\n\n6. CUERPO Y MUNDO (BODY AND WORLD):\n¿Cuál es el estado físico de los NPCs y del entorno?\n\n7. VERIFICACIÓN DE DIÁLOGO (DIALOGUE CHECK):\nLee cada línea de diálogo del NPC internamente. ¿Suena como algo que un humano real diría en este momento exacto? Si suena a texto escrito, reescríbelo hasta que suene a alguien hablando.\n\n8. QUÉ SUCEDE DESPUÉS (WHAT HAPPENS NEXT):\n- La acción del usuario ha terminado. Ahora: ¿qué hace cada NPC como resultado de su propio estado?\n- ¿Necesito introducir un nuevo evento o NPC?\n- Detente cuando el momento requiera que el usuario reaccione.`,
            prefill: "Never narrate character thoughts. Show through behavior only. Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. Hora y Fecha:"
        },
        {
            id: "cot-v1-french", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in French (Français).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n1. Heure et Date (Time and Date):\nDe combien le temps a-t-il avancé.\n\n2. DONNÉES OBSERVABLES (OBSERVABLE DATA):\nRéduisez l'entrée de l'utilisateur aux seules actions observables et paroles prononcées. Écartez toute pensée ou sentiment que l'utilisateur a écrit pour son personnage (PC) — les PNJ (NPCs) ne peuvent pas les voir, et le Moteur ne les analyse pas.\n\n3. PAYSAGE ÉMOTIONNEL DU PNJ (NPC EMOTIONAL LANDSCAPE):\nQue ressent chaque PNJ pertinent en surface ? Que ressentent-ils au fond d'eux-mêmes ? Que veulent-ils par rapport à ce qu'ils sont prêts à montrer ? (Ignorez l'état interne du personnage de l'utilisateur ici).\n\n4. PROPORTIONNALITÉ DU PNJ (NPC PROPORTIONALITY):\nMa réaction prévue est-elle correctement proportionnée à ce qui s'est réellement passé ? Compte tenu de l'histoire et de la personnalité du PNJ, que ferait une vraie personne en réalité ? Pas la version la plus dramatique. La version la plus vraie.\n\n5. SOUS-TEXTE (SUBTEXT):\nQue ne dit pas le PNJ ? Comment cela transparaît-il ?\n\n6. CORPS ET MONDE (BODY AND WORLD):\nQuel est l'état physique des PNJ et de l'environnement ?\n\n7. VÉRIFICATION DU DIALOGUE (DIALOGUE CHECK):\nLisez chaque ligne de dialogue du PNJ intérieurement. Cela ressemble-t-il à ce qu'un véritable humain dirait à cet instant précis ? Si cela ressemble à de l'écrit, réécrivez-le jusqu'à ce que cela ressemble à du langage parlé.\n\n8. QUE SE PASSE-T-IL ENSUITE (WHAT HAPPENS NEXT):\n- L'action de l'utilisateur est terminée. Maintenant : que fait chaque PNJ en fonction de son propre état ?\n- Dois-je introduire un nouvel événement ou un nouveau PNJ ?\n- Arrêtez-vous lorsqu'un moment nécessite une réaction de l'utilisateur.`,
            prefill: "Never narrate character thoughts. Show through behavior only. Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. Heure et Date :"
        },
        {
            id: "cot-v1-zh", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Mandarin Chinese (中文).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n1. 时间和日期 (Time and Date):\n时间推进了多少。\n\n2. 可观察数据 (OBSERVABLE DATA):\n将用户的输入精简为仅包含可观察的行动和说出的话语。剔除用户为其角色（PC）写下的任何想法或感受——NPC无法看到这些，引擎也不会分析它们。\n\n3. NPC情感图景 (NPC EMOTIONAL LANDSCAPE):\n每个相关的NPC表面上感觉如何？他们内心深处感觉如何？他们想要的与他们愿意表现出来的有何不同？（在此忽略用户角色的内部状态）。\n\n4. NPC反应的相称性 (NPC PROPORTIONALITY):\n我计划的反应与实际发生的事情比例是否协调？考虑到NPC的历史和性格，一个真实的人实际上会怎么做？不要最戏剧化的版本。要最真实的版本。\n\n5. 潜台词 (SUBTEXT):\nNPC没有说出什么？它是如何流露出来的？\n\n6. 身体与世界 (BODY AND WORLD):\nNPC的身体状态和环境是怎样的？\n\n7. 对话检查 (DIALOGUE CHECK):\n在心里默读NPC的每一句对话。它听起来像是一个真实的人在这个确切的时刻会说的话吗？如果它听起来像书面语，请重写它，直到它听起来像口语。\n\n8. 接下来发生什么 (WHAT HAPPENS NEXT):\n- 用户的行动已经完成。现在：每个NPC根据他们自身的状态会做什么？\n- 我需要引入新的事件或NPC吗？\n- 当剧情需要用户做出反应时停止。`,
            prefill: "Never narrate character thoughts. Show through behavior only. Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. 时间和日期："
        },
        {
            id: "cot-v1-ru", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Russian (Русский).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n1. Время и дата (Time and Date):\nНасколько продвинулось время.\n\n2. НАБЛЮДАЕМЫЕ ДАННЫЕ (OBSERVABLE DATA):\nСократите ввод пользователя только до наблюдаемых действий и произнесенных слов. Отбросьте любые мысли или чувства, которые пользователь написал для своего персонажа (PC) — NPC не могут их видеть, и Движок их не анализирует.\n\n3. ЭМОЦИОНАЛЬНЫЙ ЛАНДШАФТ NPC (NPC EMOTIONAL LANDSCAPE):\nЧто каждый соответствующий NPC чувствует на поверхности? Что они чувствуют внутри? Чего они хотят в сравнении с тем, что готовы показать? (Игнорируйте внутреннее состояние персонажа пользователя здесь).\n\n4. ПРОПОРЦИОНАЛЬНОСТЬ NPC (NPC PROPORTIONALITY):\nСоразмерна ли моя запланированная реакция тому, что произошло на самом деле? Учитывая историю и личность NPC, что бы реально сделал живой человек? Не самая драматичная версия. Самая правдивая версия.\n\n5. ПОДТЕКСТ (SUBTEXT):\nЧего NPC не говорит? Как это прорывается наружу?\n\n6. ТЕЛО И МИР (BODY AND WORLD):\nКаково физическое состояние NPC и окружающей среды?\n\n7. ПРОВЕРКА ДИАЛОГА (DIALOGUE CHECK):\nПрочитайте каждую реплику NPC про себя. Звучит ли это как то, что реальный человек сказал бы в этот самый момент? Если это звучит как написанный текст, перепишите, пока это не станет звучать как живая речь.\n\n8. ЧТО ПРОИСХОДИТ ДАЛЬШЕ (WHAT HAPPENS NEXT):\n- Действие пользователя завершено. Теперь: что делает каждый NPC в результате своего собственного состояния?\n- Нужно ли мне ввести новое событие или NPC?\n- Остановитесь, когда момент потребует реакции пользователя.`,
            prefill: "Never narrate character thoughts. Show through behavior only. Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. Время и дата:"
        },
        {
            id: "cot-v1-jp", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Japanese (日本語).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n1. 時間と日付 (Time and Date):\n時間がどれだけ進んだか。\n\n2. 観測可能なデータ (OBSERVABLE DATA):\nユーザーの入力を、観測可能な行動と発話のみに絞り込みます。ユーザーが自身のキャラクター（PC）のために書いた思考や感情は破棄してください。NPCにはそれらが見えず、エンジンもそれらを分析しません。\n\n3. NPCの感情的状況 (NPC EMOTIONAL LANDSCAPE):\n関連する各NPCは表面上何を感じているか？彼らは心の奥底で何を感じているか？彼らが望むことと、喜んで見せることの違いは何か？（ここではユーザーのキャラクターの内部状態は無視します）。\n\n4. NPCの反応の妥当性 (NPC PROPORTIONALITY):\n計画した反応は、実際に起こった出来事に対して適切な規模か？NPCの背景や性格を考慮した上で、実際の人間なら本当にどう行動するか？最もドラマチックなバージョンではなく、最も真実味のあるバージョンにしてください。\n\n5. サブテキスト (SUBTEXT):\nNPCが口にしていないことは何か？それはどのように漏れ出ているか？\n\n6. 身体と世界 (BODY AND WORLD):\nNPCの身体的状態と環境はどのようなものか？\n\n7. 対話の確認 (DIALOGUE CHECK):\nNPCのすべてのセリフを頭の中で読んでください。実際の人間がこの瞬間に本当に言いそうな言葉に聞こえますか？文章のように聞こえる場合は、話し言葉のように聞こえるまで書き直してください。\n\n8. 次に何が起こるか (WHAT HAPPENS NEXT):\n- ユーザーの行動は完了しました。次に：各NPCは自分自身の状態の結果として何をしますか？\n- 新しいイベントやNPCを導入する必要がありますか？\n- ユーザーが反応する必要がある瞬間が来たら停止してください。`,
            prefill: "Never narrate character thoughts. Show through behavior only. Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. 時間と日付:"
        },
        {
            id: "cot-v1-pt", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Portuguese (Português).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n1. Hora e Data (Time and Date):\nQuanto o tempo avançou.\n\n2. DADOS OBSERVÁVEIS (OBSERVABLE DATA):\nReduza a entrada do usuário apenas a ações observáveis e palavras faladas. Descarte quaisquer pensamentos ou sentimentos que o usuário escreveu para seu personagem (PC) — os NPCs não podem vê-los e o Motor não os analisa.\n\n3. PAISAGEM EMOCIONAL DO NPC (NPC EMOTIONAL LANDSCAPE):\nO que cada NPC relevante está sentindo na superfície? O que eles estão sentindo por baixo? O que eles querem versus o que estão dispostos a mostrar? (Ignore o estado interno do personagem do usuário aqui).\n\n4. PROPORCIONALIDADE DO NPC (NPC PROPORTIONALITY):\nMinha reação planejada está dimensionada corretamente para o que realmente aconteceu? Dada a história e a personalidade do NPC, o que uma pessoa real realmente faria? Não a versão mais dramática. A versão mais verdadeira.\n\n5. SUBTEXTO (SUBTEXT):\nO que o NPC não está dizendo? Como isso transparece?\n\n6. CORPO E MUNDO (BODY AND WORLD):\nQual é o estado físico dos NPCs e do ambiente?\n\n7. VERIFICAÇÃO DE DIÁLOGO (DIALOGUE CHECK):\nLeia cada linha de diálogo do NPC internamente. Soa como algo que um humano real diria neste momento exato? Se soar como algo escrito, reescreva até que soe como alguém falando.\n\n8. O QUE ACONTECE DEPOIS (WHAT HAPPENS NEXT):\n- A ação do usuário terminou. Agora: o que cada NPC faz como resultado de seu próprio estado?\n- Preciso introduzir um novo evento ou NPC?\n- Pare quando o momento exigir que o usuário reaja.`,
            prefill: "Never narrate character thoughts. Show through behavior only. Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. Hora e Data:"
        },

        // --- V2 (TEST/NEW) MODELS ---
        {
            id: "cot-v2-english", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n\n1. Reality Check (The "No-Go" Zones):\n* **PC Agency:** Am I narrating the User’s thoughts? (Stop if yes).\n* **The "Script" Trap:** Is this too convenient? Is the NPC being an "info-dump" instead of a person?\n\n2. The Information Audit (The Knowledge Check):\n* **Source Check:** List what the NPC *actually* knows based on: \n    1. What they saw with their own eyes. \n    2. What someone else (reliably or not) told them.\n    3. What they can reasonably guess based on their personality.\n* **The Gap:** What do they *not* know? \n* **The Error:** Are they acting on a wrong assumption? (e.g., *"They saw the PC holding a knife, so they assume the PC is the killer, even though the PC was just picking it up."*)\n\n3. NPCs Move:\nNPCs next move to serve their goal.\n\n4. The Off-Screen Pulse:\n* What happened in the background while the PC was busy? (The clock never stops).\n\n5. The Subtext Map (Author's View):\n* **Surface vs. Undercurrent:** What are they saying vs. what do they actually want?\n* **Physical Leak:** How does the tension show in their body?\n\n6. WRITING STYLE & PACE:\ndid you follow WRITING STYLE & PACE rule.\n\n7. The Beat & The Hook:\n* What is the specific "Pivot Point" I’m ending on to force a response?`,
            prefill: "I will make sure the Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. Reality Check:"
        },
        {
            id: "cot-v2-arabic", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Arabic (العربية).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n\n1. فحص الواقع (المناطق المحظورة):\n* **وكالة اللاعب (PC Agency):** هل أسرد أفكار المستخدم؟ (توقف إذا كانت الإجابة نعم).\n* **فخ "السيناريو":** هل هذا ملائم جداً؟ هل تقوم الشخصية (NPC) بسرد معلومات بدلاً من التصرف كإنسان؟\n\n2. تدقيق المعلومات (فحص المعرفة):\n* **فحص المصدر:** اذكر ما تعرفه الشخصية (NPC) *فعلياً* بناءً على:\n    1. ما رأته بأم عينيها.\n    2. ما أخبرها به شخص آخر (سواء كان موثوقاً أم لا).\n    3. ما يمكنها تخمينه بشكل منطقي بناءً على شخصيتها.\n* **الفجوة:** ما الذي *لا* تعرفه؟\n* **الخطأ:** هل تتصرف بناءً على افتراض خاطئ؟ (مثال: *"رأوا اللاعب يحمل سكيناً، فافترضوا أنه القاتل، رغم أنه كان يلتقطها فقط."*)\n\n3. تحرك الشخصيات (NPCs Move):\nالخطوة التالية للشخصيات لخدمة هدفها.\n\n4. النبض خارج الشاشة:\n* ماذا حدث في الخلفية بينما كان اللاعب مشغولاً؟ (الساعة لا تتوقف أبداً).\n\n5. خريطة النص الضمني (رؤية المؤلف):\n* **السطح مقابل التيار الخفي:** ماذا يقولون مقابل ماذا يريدون حقاً؟\n* **التسرب الجسدي:** كيف يظهر التوتر على أجسادهم؟\n\n6. أسلوب الكتابة والوتيرة (WRITING STYLE & PACE):\nهل اتبعت قاعدة أسلوب الكتابة والوتيرة؟\n\n7. النبضة والخطاف (The Beat & The Hook):\n* ما هي "نقطة التحول" المحددة التي أنهي بها لإجبار المستخدم على الرد؟`,
            prefill: "I will make sure the Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. فحص الواقع:"
        },
        {
            id: "cot-v2-spanish", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Spanish (Español).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n\n1. Prueba de Realidad (Zonas Prohibidas):\n* **Agencia del PC:** ¿Estoy narrando los pensamientos del Usuario? (Detente si es así).\n* **La Trampa del "Guión":** ¿Es esto demasiado conveniente? ¿Está el NPC actuando como un "vertedero de información" en lugar de una persona?\n\n2. Auditoría de Información (Prueba de Conocimiento):\n* **Revisión de Fuentes:** Enumera lo que el NPC *realmente* sabe basado en:\n    1. Lo que vieron con sus propios ojos.\n    2. Lo que alguien más (confiable o no) les dijo.\n    3. Lo que pueden adivinar razonablemente basado en su personalidad.\n* **La Brecha:** ¿Qué es lo que *no* saben?\n* **El Error:** ¿Están actuando bajo una suposición errónea? (ej., *"Vieron al PC sosteniendo un cuchillo, así que asumen que es el asesino, aunque el PC solo lo estaba recogiendo."*)\n\n3. Movimiento de NPCs (NPCs Move):\nEl próximo movimiento de los NPCs para cumplir su objetivo.\n\n4. El Pulso Fuera de Pantalla:\n* ¿Qué pasó en el fondo mientras el PC estaba ocupado? (El reloj nunca se detiene).\n\n5. Mapa de Subtexto (Visión del Autor):\n* **Superficie vs. Corriente Subterránea:** ¿Qué están diciendo vs. qué quieren realmente?\n* **Fuga Física:** ¿Cómo se muestra la tensión en su cuerpo?\n\n6. ESTILO DE ESCRITURA Y RITMO (WRITING STYLE & PACE):\n¿Seguiste la regla de ESTILO DE ESCRITURA Y RITMO?\n\n7. El Ritmo y El Gancho (The Beat & The Hook):\n* ¿Cuál es el "Punto de Pivote" específico con el que termino para forzar una respuesta?`,
            prefill: "I will make sure the Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. Prueba de Realidad:"
        },
        {
            id: "cot-v2-french", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in French (Français).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n\n1. Vérification de la Réalité (Les Zones Interdites):\n* **Agence du PC:** Suis-je en train de narrer les pensées de l'Utilisateur ? (Arrêtez-vous si oui).\n* **Le Piège du "Scénario":** Est-ce trop pratique ? Le PNJ sert-il de "déversoir d'informations" au lieu d'être une personne ?\n\n2. Audit des Informations (Vérification des Connaissances):\n* **Vérification des Sources:** Listez ce que le PNJ sait *réellement* en fonction de:\n    1. Ce qu'ils ont vu de leurs propres yeux.\n    2. Ce que quelqu'un d'autre (fiable ou non) leur a dit.\n    3. Ce qu'ils peuvent raisonnablement deviner en fonction de leur personnalité.\n* **L'Écart:** Que *ne* savent-ils *pas* ?\n* **L'Erreur:** Agissent-ils sur une mauvaise supposition ? (ex: *"Ils ont vu le PC tenir un couteau, alors ils supposent que le PC est le tueur, même si le PC le ramassait juste."*)\n\n3. Mouvement des PNJ (NPCs Move):\nLe prochain mouvement des PNJ pour servir leur objectif.\n\n4. Le Pouls Hors Écran:\n* Que s'est-il passé en arrière-plan pendant que le PC était occupé ? (L'horloge ne s'arrête jamais).\n\n5. La Carte du Sous-texte (Vision de l'Auteur):\n* **Surface vs. Courant Sous-jacent:** Que disent-ils vs. que veulent-ils réellement ?\n* **Fuite Physique:** Comment la tension se manifeste-t-elle dans leur corps ?\n\n6. STYLE D'ÉCRITURE ET RYTHME (WRITING STYLE & PACE):\nAvez-vous suivi la règle du STYLE D'ÉCRITURE ET RYTHME ?\n\n7. Le Rythme et L'Accroche (The Beat & The Hook):\n* Quel est le "Point Pivot" spécifique sur lequel je termine pour forcer une réponse ?`,
            prefill: "I will make sure the Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. Vérification de la Réalité:"
        },
        {
            id: "cot-v2-zh", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Mandarin Chinese (中文).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n\n1. 现实检验（“禁区”）：\n* **玩家角色（PC）自主性：** 我是否在叙述用户的想法？（如果是，请停止）。\n* **“剧本”陷阱：** 这是否太方便了？NPC是不是成了一个“信息倾泻机”而不是一个活生生的人？\n\n2. 信息审计（知识检查）：\n* **来源检查：** 列出NPC*实际上*知道的内容，基于：\n    1. 他们亲眼所见的。\n    2. 别人（可靠或不可靠）告诉他们的。\n    3. 根据他们的性格可以合理猜测的。\n* **信息差：** 他们*不*知道什么？\n* **错误判断：** 他们是否在基于错误的假设行动？（例如，*“他们看到PC拿着刀，所以假设PC是杀手，即使PC只是把刀捡起来。”*）\n\n3. NPC行动：\nNPC为实现其目标而采取的下一步行动。\n\n4. 幕后脉动：\n* 当PC忙碌时，背景中发生了什么？（时间永远不会停止）。\n\n5. 潜台词地图（作者视角）：\n* **表面与暗流：** 他们说的话与他们实际想要的有什么不同？\n* **身体泄露：** 紧张感如何在他们的身体上表现出来？\n\n6. 写作风格与节奏（WRITING STYLE & PACE）：\n你是否遵循了写作风格与节奏的规则？\n\n7. 节拍与悬念（The Beat & The Hook）：\n* 我用什么特定的“转折点”来结束，以迫使对方做出回应？`,
            prefill: "I will make sure the Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. 现实检验："
        },
        {
            id: "cot-v2-ru", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Russian (Русский).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n\n1. Проверка реальности (Запретные зоны):\n* **Свобода воли PC:** Описываю ли я мысли Пользователя? (Остановитесь, если да).\n* **Ловушка "Сценария":** Не слишком ли это удобно? Является ли NPC просто "источником информации", а не живым человеком?\n\n2. Аудит информации (Проверка знаний):\n* **Проверка источников:** Перечислите, что NPC *на самом деле* знает, основываясь на:\n    1. Том, что они видели своими глазами.\n    2. Том, что им сказал кто-то другой (надежный или нет).\n    3. Том, что они могут разумно предположить исходя из своей личности.\n* **Пробел:** Чего они *не* знают?\n* **Ошибка:** Действуют ли они на основе неверного предположения? (например, *"Они видели, как PC держит нож, поэтому они предполагают, что PC — убийца, хотя PC просто поднял его."*)\n\n3. Действия NPC (NPCs Move):\nСледующий шаг NPC для достижения своей цели.\n\n4. Пульс за кадром:\n* Что происходило на заднем плане, пока PC был занят? (Часы никогда не останавливаются).\n\n5. Карта подтекста (Взгляд автора):\n* **Поверхность против Подводного течения:** Что они говорят по сравнению с тем, чего они на самом деле хотят?\n* **Физическая утечка:** Как напряжение проявляется в их теле?\n\n6. СТИЛЬ ПИСЬМА И ТЕМП (WRITING STYLE & PACE):\nСледовали ли вы правилу СТИЛЯ ПИСЬМА И ТЕМПА?\n\n7. Ритм и Крючок (The Beat & The Hook):\n* На какой конкретной "Поворотной точке" я заканчиваю, чтобы заставить ответить?`,
            prefill: "I will make sure the Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. Проверка реальности:"
        },
        {
            id: "cot-v2-jp", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Japanese (日本語).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n\n1. 現実チェック（「進入禁止」ゾーン）：\n* **PCの主体性:** ユーザーの思考を語っているか？（もしそうなら中止）。\n* **「台本」の罠:** 展開が都合よすぎないか？NPCが一人の人間ではなく、「情報ダンプ」になっていないか？\n\n2. 情報監査（知識チェック）：\n* **情報源チェック:** 以下に基づいてNPCが*実際に*知っていることをリストアップする：\n    1. 自分の目で見たこと。\n    2. 誰か（信頼できるかどうかにかかわらず）が言ったこと。\n    3. 自分の性格に基づいて合理的に推測できること。\n* **ギャップ:** 彼らが*知らない*ことは何か？\n* **エラー:** 間違った思い込みに基づいて行動していないか？（例：「*PCがナイフを持っているのを見たので、PCが殺人鬼だと思い込む（PCはただ拾っただけなのに）。*」）\n\n3. NPCの動き：\nNPCが目的を果たすための次の動き。\n\n4. 画面外の鼓動：\n* PCが忙しくしている間、背景で何が起こっていたか？（時間は決して止まらない）。\n\n5. サブテキストマップ（作者の視点）：\n* **表層 vs 底流:** 彼らが口にしていることと、実際に望んでいることの違いは何か？\n* **身体的漏洩:** 緊張はどのように彼らの身体に現れているか？\n\n6. 文体とペース（WRITING STYLE & PACE）:\n文体とペースのルールに従ったか？\n\n7. ビートとフック（The Beat & The Hook）：\n* 返答を強制させるために、私はどのような具体的な「転換点」で終わっているか？`,
            prefill: "I will make sure the Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. 現実チェック："
        },
        {
            id: "cot-v2-pt", trigger: "[[COT]]",
            content: `[THINKING STEPS]\nBefore writing your response, you must think inside <think></think> tags.\nAll thinking must be written in Portuguese (Português).\nThis is mandatory. Do not skip or compress any step.\nMinimum total thinking length: 400 words.\n\nSteps:\n\n1. Checagem de Realidade (Zonas Proibidas):\n* **Agência do PC:** Estou narrando os pensamentos do Usuário? (Pare se sim).\n* **A Armadilha do "Roteiro":** Isso é conveniente demais? O NPC está sendo um "despejo de informações" em vez de uma pessoa?\n\n2. Auditoria de Informações (Checagem de Conhecimento):\n* **Checagem de Fontes:** Liste o que o NPC *realmente* sabe com base em:\n    1. O que eles viram com os próprios olhos.\n    2. O que outra pessoa (confiável ou não) disse a eles.\n    3. O que eles podem adivinhar razoavelmente com base em sua personalidade.\n* **A Lacuna:** O que eles *não* sabem?\n* **O Erro:** Eles estão agindo sob uma suposição errada? (ex: *"Eles viram o PC segurando uma faca, então assumem que o PC é o assassino, mesmo que o PC estivesse apenas pegando-a."*)\n\n3. Movimento dos NPCs (NPCs Move):\nO próximo movimento dos NPCs para servir ao seu objetivo.\n\n4. O Pulso Fora da Tela:\n* O que aconteceu no fundo enquanto o PC estava ocupado? (O relógio nunca para).\n\n5. Mapa de Subtexto (Visão do Autor):\n* **Superfície vs. Corrente Subterrânea:** O que eles estão dizendo vs. o que eles realmente querem?\n* **Vazamento Físico:** Como a tensão aparece no corpo deles?\n\n6. ESTILO DE ESCRITA E RITMO (WRITING STYLE & PACE):\nVocê seguiu a regra de ESTILO DE ESCRITA E RITMO?\n\n7. A Batida e O Gancho (The Beat & The Hook):\n* Qual é o "Ponto de Pivô" específico em que termino para forçar uma resposta?`,
            prefill: "I will make sure the Reactions proportional to events. Dialogue sounds like talking, not writing. Ban list checked.\n\n<think>\n1. Checagem de Realidade:"
        }
    ]
};

// -------------------------------------------------------------
// STATE MANAGEMENT
// -------------------------------------------------------------
let currentStage = 0;
let localProfile = {};
let activeGenerationOrder = null; // NEW: Holds the active generation task to inject into [[order]]
let activeBanListChat = null;

function getCharacterKey() {
    const context = getContext();
    // Priority 1: Check if we are in a Group Chat
    if (context.groupId !== undefined && context.groupId !== null) {
        return `group_${context.groupId}`;
    }
    // Priority 2: Check if we are in a 1-on-1 Chat
    if (context.characterId !== undefined && context.characterId !== null && context.characters[context.characterId]) {
        return context.characters[context.characterId].avatar;
    }
    // No chat active
    return null;
}

function initProfile() {
    const key = getCharacterKey();
    const context = getContext();
    const isGroup = context.groupId !== undefined && context.groupId !== null;

    if (!extension_settings[extensionName]) extension_settings[extensionName] = { profiles: {} };
    if (!extension_settings[extensionName].profiles) extension_settings[extensionName].profiles = {};

    const defaults = {
        mode: "Slice of Reality",
        personality: "engine",
        toggles: { ooc: false, control: false },
        aiTags: [],
        aiGeneratedOptions: [],
        aiRule: "",
        customStyles: [],
        activeStyleId: null,
        addons: [],
        blocks: [],
        model: "cot-v2-english",
        userNotes: "",
        userWordCount: "",
        userLanguage: "",
        userPronouns: "off",
        devOverrides: {},
        banList: []
    };

    if (!extension_settings[extensionName].profiles["default"]) {
        extension_settings[extensionName].profiles["default"] = JSON.parse(JSON.stringify(defaults));
    }

    // Load or Initialize profile
    if (key && extension_settings[extensionName].profiles[key]) {
        localProfile = extension_settings[extensionName].profiles[key];
        if (isGroup) {
            $("#ps_rule_status_main").css({ "color": "#3b82f6", "text-shadow": "0 0 10px rgba(59,130,246,0.5)" }).text(`CUSTOM GROUP PROFILE`);
        } else {
            $("#ps_rule_status_main").css({ "color": "#10b981", "text-shadow": "0 0 10px rgba(16,185,129,0.5)" }).text(`CUSTOM CHARACTER PROFILE`);
        }
    } else {
        localProfile = JSON.parse(JSON.stringify(extension_settings[extensionName].profiles["default"]));
        if (key) {
            $("#ps_rule_status_main").css({ "color": "#f59e0b", "text-shadow": "0 0 10px rgba(245,158,11,0.5)" }).text(`USING SYSTEM DEFAULT`);
        } else {
            $("#ps_rule_status_main").css({ "color": "#a855f7", "text-shadow": "0 0 10px rgba(168,85,247,0.5)" }).text(`MODIFYING GLOBAL DEFAULT`);
        }
    }

    if (!localProfile.customStyles) localProfile.customStyles = [];
    if (localProfile.aiRule && localProfile.customStyles.length === 0) {
        const legacyId = "style_" + Date.now();
        localProfile.customStyles.push({
            id: legacyId,
            name: "Legacy Style",
            tags: localProfile.aiTags || [],
            notes: localProfile.userNotes || "",
            rule: localProfile.aiRule
        });
        localProfile.activeStyleId = legacyId;
    }

    // PATCH: If the saved profile is missing keys, add them
    Object.keys(defaults).forEach(k => {
        if (localProfile[k] === undefined) localProfile[k] = defaults[k];
    });
    if (!localProfile.toggles) localProfile.toggles = defaults.toggles;

    // Set the Label in the Sidebar Display
    let displayName = "Global Default";
    if (isGroup) {
        if (context.groups && Array.isArray(context.groups)) {
            // Ensures both numbers and strings match correctly across ST versions
            const group = context.groups.find(g => String(g.id) === String(context.groupId));
            if (group && group.name) displayName = group.name;
            else displayName = `Group Chat (${context.groupId})`;
        } else {
            displayName = "Group Chat";
        }
    } else if (key && context.characterId !== undefined && context.characters[context.characterId]) {
        displayName = context.characters[context.characterId].name;
    }

    $("#ps_char_rule_label").text(displayName);
}

function saveProfileToMemory() {
    const key = getCharacterKey() || "default";

    // BUG FIX: Only read the text box value if it is currently visible on the screen!
    // This prevents the rule from being wiped when you click toggles in other stages.
    const ruleBox = $("#ps_main_current_rule");
    if (ruleBox.length > 0) {
        localProfile.aiRule = ruleBox.val();
    }

    extension_settings[extensionName].profiles[key] = localProfile;
    saveSettingsDebounced();

    // UX POLISH: Flash "Autosaved" text so the customer feels safe
    const saveInd = $("#ps_save_indicator");
    if (saveInd.length) {
        saveInd.html(`<i class="fa-solid fa-check"></i> Saved`).fadeIn(150);
        clearTimeout(window.psSaveTimer);
        window.psSaveTimer = setTimeout(() => saveInd.fadeOut(400), 2000);
    }
}

function updateCharacterDisplay() {
    const context = getContext();
    const pfpElement = $("#ps_char_pfp");

    if (context.groupId !== undefined && context.groupId !== null) {
        // Group Chat -> Show custom Megumin group image
        pfpElement.attr("src", `${extensionFolderPath}/img/group.png`);
    } else if (context.characterId !== undefined && context.characterId !== null && context.characters[context.characterId]) {
        // 1-on-1 Chat -> Show character portrait
        pfpElement.attr("src", `/characters/${context.characters[context.characterId].avatar}`);
    } else {
        // Global Default
        pfpElement.attr("src", `${extensionFolderPath}/img/default.png`);
    }
}

function cleanAIOutput(text) {
    if (!text) return "";
    let cleaned = text;
    // We only need one Regex now. ksc is gone forever.
    const re = new RegExp("(<disclaimer>.*?</disclaimer>)|(<guifan>.*?</guifan>)|(<danmu>.*?</danmu>)|(<options>.*?</options>)|```start|```end|<done>|`<done>`|(.*?</think(ing)?>(\\n)?)|(<think(ing)?>[\\s\\S]*?</think(ing)?>(\\n)?)", "gs");
    return cleaned.replace(re, "").trim();
}

// -------------------------------------------------------------
// UI WIZARD RENDERER
// -------------------------------------------------------------
const stagesUI = [
    { title: "Stage 1: System Mode", sub: "Select the core logic engine.", render: renderMode },
    { title: "Stage 2: Personality", sub: "Define the persona and Extra Toggles.", render: renderPersonality },
    { title: "Stage 3: Writing Style", sub: "Manage your custom writing styles. Select one to activate it.", render: renderStyleLibrary },
    { title: "Stage 4: Settings", sub: "Toggle advanced modules.", render: renderAddons },
    { title: "Stage 5: Add-ons", sub: "Append mechanical blocks to the end of responses.", render: renderBlocks },
    { title: "Stage 6: Chain of Thought (CoT)", sub: "Select the thinking language to enforce reasoning before responding.", render: renderModels },
    { title: "Stage 7: Dynamic Ban List", sub: "Scan chat history to catch and ban repetitive AI phrases.", render: renderBanList }
];

function drawWizard(index) {
    currentStage = index;
    const stage = stagesUI[index];
    $("#ps_stage_title").text(stage.title); $("#ps_stage_sub").text(stage.sub);
    $("#ps_breadcrumb_num").text(index + 1); // Updates the Step 1 of 6 text

    $(".ps-dot").removeClass("active"); for (let i = 0; i <= index; i++) { $(`#dot_${i}`).addClass("active"); }
    const container = $("#ps_stage_content");
    container.empty(); stage.render(container);

    $("#ps_btn_prev").toggle(index > 0);
    $("#ps_btn_next").toggle(index < stagesUI.length - 1);
}

function renderMode(c) {
    // Add temporary descriptions mapped to the IDs
    const descriptions = {
        "balance": "The original Secret Sauce. NPCs react naturally — no simping, no needless hostility. They have their own agenda and act on it.",
        "Slice of Reality": " New and improved balance mode that aim to use less token, more writing Creativity, better NPCs.",
        "cinematic": "Hollywood-inspired storytelling. More dramatic beats, cinematic scene transitions, and heightened narrative tension.",
        "dark": "Balance but harsher. The world is unforgiving, NPCs don't sugarcoat, and consequences hit harder."
    };

    const grid = $(`<div class="ps-grid"></div>`);
    hardcodedLogic.modes.forEach(m => {
        const recText = m.recommended ? `<span class="ps-rec-text"><i class="fa-solid fa-star"></i> Recommended</span>` : '';
        const descText = descriptions[m.id] || "";

        // THE NEW BADGE HTML
        const newBadgeHtml = m.isNew ? `<div style="position: absolute; bottom: 15px; right: 15px; background: #3b82f6; color: #fff; font-size: 0.65rem; font-weight: 800; padding: 3px 10px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.4);">New</div>` : '';

        // Added slightly more padding-bottom dynamically so the text never overlaps the badge
        const card = $(`<div class="ps-card ${localProfile.mode === m.id ? 'selected' : ''}" style="padding-bottom: ${m.isNew ? '40px' : '20px'};">
            <div class="ps-card-title"><span>${m.label}</span> ${recText}</div>
            <div class="ps-card-desc">${descText}</div>
            ${newBadgeHtml}
        </div>`);

        card.on("click", () => { localProfile.mode = m.id; saveProfileToMemory(); drawWizard(currentStage); });
        grid.append(card);
    });

    c.append(grid);
}

function renderPersonality(c) {
    const descriptions = {
        "megumin": "Explosive personality. The system channels chaotic energy and playful narration style.",
        "director": "Professional narrator. Clean, authoritative story direction with cinematic awareness.",
        "Nora": "Nora should i say more.",
        "engine": "Pure mechanical precision. Maximum control, minimum personality injection. Just clean output."
    };

    c.append(`<div class="ps-rule-title" style="margin-bottom:10px;">Select Persona</div>`);
    const grid = $(`<div class="ps-grid" style="margin-bottom: 25px;"></div>`);
    hardcodedLogic.personalities.forEach(p => {
        const recText = p.recommended ? `<span class="ps-rec-text"><i class="fa-solid fa-star"></i> Recommended</span>` : '';
        const descText = descriptions[p.id] || "";
        const card = $(`<div class="ps-card ${localProfile.personality === p.id ? 'selected' : ''}">
            <div class="ps-card-title"><span>${p.label}</span> ${recText}</div>
            <div class="ps-card-desc">${descText}</div>
        </div>`);
        card.on("click", () => { localProfile.personality = p.id; saveProfileToMemory(); drawWizard(currentStage); });
        grid.append(card);
    }); c.append(grid);

    c.append(`<div class="ps-rule-title" style="margin-bottom:10px;">Extra Toggles</div>`);
    Object.entries(hardcodedLogic.toggles).forEach(([key, tog]) => {
        const recText = tog.recommendedOff ? `<span class="ps-rec-text"><i class="fa-solid fa-star"></i> Keep OFF for best results not needed on V5</span>` : '';
        const tCard = $(`<div class="ps-toggle-card ${localProfile.toggles[key] ? 'active' : ''}">
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:600;">${tog.label}</span>
                <div style="margin-top:4px;">${recText}</div>
            </div>
            <div class="ps-switch"></div></div>`);
        tCard.on("click", () => { localProfile.toggles[key] = !localProfile.toggles[key]; saveProfileToMemory(); drawWizard(currentStage); });
        c.append(tCard);
    });
}

// -------------------------------------------------------------
// STAGE 3: THE STYLE LIBRARY (LIST VIEW)
// -------------------------------------------------------------
function renderStyleLibrary(c) {
    $("#ps_stage_title").text("Stage 3: Writing Style");
    $("#ps_stage_sub").text("Select a template to generate, create your own, or turn off extra styling.");
    $("#ps_btn_next").show(); $("#ps_btn_prev").show();

    // Container for the vertical list
    const listContainer = $(`<div style="display: flex; flex-direction: column; gap: 12px;"></div>`);

    // 1. THE "OFF" OPTION (At the top)
    const isOff = !localProfile.activeStyleId;
    const offCard = $(`
        <div class="ps-card ${isOff ? 'selected' : ''}" style="width: 100%; padding: 16px; flex-direction: row; align-items: center; justify-content: space-between; border-color: ${isOff ? 'var(--text-main)' : 'var(--border-color)'};">
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="fa-solid fa-power-off" style="font-size: 1.2rem; color: ${isOff ? '#000' : 'var(--text-muted)'};"></i>
                <div>
                    <div style="font-weight: 700; font-size: 1rem; color: ${isOff ? '#000' : 'var(--text-main)'};">No Style (Off)</div>
                    <div style="font-size: 0.75rem; color: ${isOff ? '#444' : 'var(--text-muted)'};">Disable extra style directives.</div>
                </div>
            </div>
            ${isOff ? `<span style="font-weight: 800; font-size: 0.7rem; color: #000; text-transform: uppercase;"><i class="fa-solid fa-check"></i> Active</span>` : ''}
        </div>
    `);
    offCard.on("click", () => {
        localProfile.activeStyleId = null;
        localProfile.aiRule = "";
        saveProfileToMemory();
        renderStyleLibrary(c);
    });
    listContainer.append(offCard);

    const existingNames = localProfile.customStyles ? localProfile.customStyles.map(s => s.name) : [];

    // 2. ACTIVE LIBRARY (Your Saved Styles)
    if (localProfile.customStyles && localProfile.customStyles.length > 0) {
        listContainer.append(`<div class="ps-stages-label" style="margin-top: 10px; color: var(--gold);">Active Library</div>`);

        localProfile.customStyles.forEach(style => {
            const isSel = localProfile.activeStyleId === style.id;
            const card = $(`
                <div class="ps-card ${isSel ? 'selected' : ''}" style="width: 100%; padding: 16px; flex-direction: column; gap: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span style="font-weight: 700; font-size: 1rem; color: ${isSel ? '#000' : 'var(--text-main)'};">${style.name}</span>
                        <div style="display: flex; align-items: center; gap: 10px;">
                             <span class="ps-btn-regen" title="Regenerate" style="font-size: 0.7rem; cursor: pointer; color: ${isSel ? '#d97706' : 'var(--gold)'}; font-weight: bold; text-transform: uppercase;"><i class="fa-solid fa-rotate-right"></i> Redo</span>
                             ${isSel ? `<span style="font-weight: 800; font-size: 0.7rem; color: #000;"><i class="fa-solid fa-check"></i> ACTIVE</span>` : ''}
                        </div>
                    </div>
                    <div style="font-size: 0.75rem; font-family: monospace; background: ${isSel ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.3)'}; padding: 8px; border-radius: 4px; border: 1px solid ${isSel ? 'rgba(0,0,0,0.2)' : 'var(--border-color)'}; max-height: 50px; overflow: hidden; color: ${isSel ? '#333' : 'var(--text-muted)'};">
                        ${style.rule || "No rule generated."}
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="ps-btn-edit ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.7rem; color: ${isSel ? '#000' : 'var(--text-main)'}; border-color: ${isSel ? '#000' : 'var(--border-color)'};">Edit</button>
                        <button class="ps-btn-delete ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.7rem; color: #ef4444; border-color: rgba(239,68,68,0.2);">Delete</button>
                    </div>
                </div>
            `);

            card.on("click", (e) => {
                if ($(e.target).closest("button, .ps-btn-regen").length) return;
                localProfile.activeStyleId = style.id;
                localProfile.aiRule = style.rule;
                saveProfileToMemory();
                renderStyleLibrary(c);
            });

            card.find(".ps-btn-edit").on("click", () => renderStyleEditor(c, style.id));
            card.find(".ps-btn-delete").on("click", () => {
                if (confirm(`Delete "${style.name}"?`)) {
                    localProfile.customStyles = localProfile.customStyles.filter(s => s.id !== style.id);
                    if (localProfile.activeStyleId === style.id) { localProfile.activeStyleId = null; localProfile.aiRule = ""; }
                    saveProfileToMemory(); renderStyleLibrary(c);
                }
            });

            card.find(".ps-btn-regen").on("click", async function () {
                $(this).html(`<i class="fa-solid fa-spinner fa-spin"></i>`);
                await useMeguminEngine(async () => {
                    const orderText = `Inspired by ${style.notes}. Write a writing style rule based on: ${style.tags.join(", ")}. Direct instructions only. 2-3 paragraphs. No fluff.`;
                    let rule = await runMeguminTask(orderText);
                    style.rule = cleanAIOutput(rule).trim();
                    if (localProfile.activeStyleId === style.id) localProfile.aiRule = style.rule;
                    saveProfileToMemory(); renderStyleLibrary(c);
                    toastr.success("Rule Regenerated!");
                });
            });
            listContainer.append(card);
        });
    }

    // 3. TEMPLATE LIBRARY (Hardcoded templates)
    listContainer.append(`<div class="ps-stages-label" style="margin-top: 10px;">Template Library</div>`);
    hardcodedLogic.styleTemplates.forEach(tpl => {
        if (existingNames.includes(tpl.name)) return; // Don't show if already generated

        const card = $(`
            <div class="ps-card" style="width: 100%; padding: 16px; border-style: dashed; flex-direction: row; justify-content: space-between; align-items: center;">
                <div style="flex: 1; padding-right: 20px;">
                    <div style="font-weight: 700; color: var(--text-main); font-size: 1rem; margin-bottom: 4px;">${tpl.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;">${tpl.notes}</div>
                </div>
                <button class="ps-btn-tpl-gen ps-modern-btn primary" style="background: var(--gold); color: #000; padding: 8px 16px; font-weight: 800;">
                    <i class="fa-solid fa-bolt"></i> GENERATE
                </button>
            </div>
        `);

        card.find(".ps-btn-tpl-gen").on("click", async function () {
            const btn = $(this);
            btn.prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i>`);

            await useMeguminEngine(async () => {
                const orderText = `Inspired by ${tpl.notes}. Write a writing style rule based on: ${tpl.tags.join(", ")}. Direct instructions only. 2-3 paragraphs. No fluff.`;
                let rule = await runMeguminTask(orderText);

                const newId = "style_" + Date.now();
                const newStyle = {
                    id: newId,
                    name: tpl.name,
                    tags: [...tpl.tags],
                    notes: tpl.notes,
                    rule: cleanAIOutput(rule).trim()
                };

                localProfile.customStyles.push(newStyle);
                localProfile.activeStyleId = newId;
                localProfile.aiRule = newStyle.rule;
                saveProfileToMemory();
                renderStyleLibrary(c);
                toastr.success(`${tpl.name} Added to Library!`);
            });
        });
        listContainer.append(card);
    });

    // 4. THE "+" BUTTON (At the very bottom)
    const addBtn = $(`
        <div class="ps-card" style="width: 100%; padding: 16px; border-style: dashed; border-color: #52525b; justify-content: center; background: transparent; cursor: pointer;">
            <div style="font-weight: 700; color: var(--text-muted);"><i class="fa-solid fa-plus"></i> Create Custom Style</div>
        </div>
    `);
    addBtn.on("click", () => renderStyleEditor(c, null));
    listContainer.append(addBtn);

    c.empty().append(listContainer);
}

// -------------------------------------------------------------
// STAGE 3: THE STYLE EDITOR (View 2)
// -------------------------------------------------------------
function renderStyleEditor(c, editId, presetData = null) {
    $("#ps_stage_title").text(editId ? "Edit Style Profile" : "Create New Style");
    $("#ps_stage_sub").text("Configure tags and specific instructions for this writing style.");
    $("#ps_btn_next").hide(); $("#ps_btn_prev").hide();

    // Use presetData if a template was just selected, otherwise load from save or create new
    let currentStyle = presetData ? presetData : (editId ? JSON.parse(JSON.stringify(localProfile.customStyles.find(s => s.id === editId))) : {
        id: "style_" + Date.now(),
        name: "",
        tags: [],
        generatedOptions: [],
        notes: "",
        rule: ""
    });

    c.empty();

    // Build the dropdown options dynamically from our hardcoded array
    let templateOptions = `<option value="" disabled selected>✨ Load a Pre-configured Template...</option>`;
    if (hardcodedLogic.styleTemplates) {
        hardcodedLogic.styleTemplates.forEach((tpl, index) => {
            templateOptions += `<option value="${index}">${tpl.name}</option>`;
        });
    }

    // Top Control Bar (Now includes the Template Selector!)
    c.append(`
        <div style="display: flex; gap: 10px; margin-bottom: 12px;">
            <select id="ps_style_template_dropdown" class="ps-modern-input" style="flex: 1; font-weight: 600; color: var(--gold); border-color: var(--gold); cursor: pointer;">
                ${templateOptions}
            </select>
        </div>
        <div style="display: flex; gap: 15px; margin-bottom: 20px; align-items: center;">
            <input type="text" id="ps_style_name" class="ps-modern-input" value="${currentStyle.name}" placeholder="Name your style (e.g. Fast RP + Edo)" style="flex: 1; font-size: 1.1rem; font-weight: bold;" />
            <button id="ps_btn_save_style" class="ps-modern-btn primary" style="background: #10b981; color: #fff;"><i class="fa-solid fa-floppy-disk"></i> Save & Return</button>
            <button id="ps_btn_cancel_style" class="ps-modern-btn secondary" style="color: #ef4444; border-color: rgba(239,68,68,0.3);">Cancel</button>
        </div>
    `);

    // Template Selector Logic: When picked, update currentStyle and refresh the screen instantly
    $("#ps_style_template_dropdown").on("change", function () {
        const tplIndex = $(this).val();
        if (tplIndex === null) return;

        const chosenTpl = hardcodedLogic.styleTemplates[tplIndex];
        currentStyle.name = chosenTpl.name;
        currentStyle.tags = [...chosenTpl.tags];
        currentStyle.notes = chosenTpl.notes;
        currentStyle.rule = ""; // Clear the old rule so they know they need to hit Generate
        currentStyle.generatedOptions = [];

        // Re-render the editor with the new data populated
        renderStyleEditor(c, editId, currentStyle);
        toastr.info(`${chosenTpl.name} loaded! Hit 'Generate Writing Rule'.`);
    });

    // Tag Grid
    const tagContainer = $(`<div></div>`);
    hardcodedLogic.styles.forEach(cat => {
        const wrap = $(`<div class="ps-tag-category"><div class="ps-rule-title" style="margin-bottom: 8px; color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">${cat.category}</div><div style="display: flex; flex-wrap: wrap; gap: 6px;"></div></div>`);
        const tagBox = wrap.find("div").eq(1);

        cat.tags.forEach(tagObj => {
            const tagName = tagObj.id;
            const isSel = currentStyle.tags.includes(tagName);
            const tEl = $(`<span class="ps-modern-tag ${isSel ? 'selected' : ''}" data-hint="${tagObj.hint}">${tagName}</span>`);

            tEl.on("click", () => {
                if (currentStyle.tags.includes(tagName)) currentStyle.tags = currentStyle.tags.filter(t => t !== tagName);
                else currentStyle.tags.push(tagName);
                tEl.toggleClass("selected");
            });
            tagBox.append(tEl);
        });
        tagContainer.append(wrap);
    });
    c.append(tagContainer);

    // AI Insight & Directive Blocks
    c.append(`
        <div style="margin-top: 32px; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div class="ps-rule-title" style="color: var(--text-main); font-size: 0.9rem; font-weight: 700;">
                    <i class="fa-solid fa-sparkles" style="color: var(--gold); margin-right: 6px;"></i> AI Author Matches
                </div>
                <button id="ps_btn_get_authors_style" class="ps-modern-btn secondary" style="padding: 6px 14px; font-size: 0.75rem;">
                    <i class="fa-solid fa-lightbulb"></i> Generate Insights
                </button>
            </div>
            <div id="ps_ai_author_box_style" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; min-height: 20px;"></div>
            <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 0 0 16px 0;" />
            <input type="text" id="ps_style_notes" class="ps-modern-input" placeholder="Custom Directives..." value="${currentStyle.notes || ''}" />
        </div>

        <div style="margin-top: 24px; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-weight: 600; color: var(--text-main); font-size: 0.95rem;">Final Rule</span>
                <button id="ps_btn_generate_style" class="ps-modern-btn primary" style="padding: 8px 16px; font-size: 0.8rem; background: var(--text-main); color: #000;"><i class="fa-solid fa-bolt"></i> Generate Writing Rule</button>
            </div>
            <textarea id="ps_style_rule_text" class="ps-modern-input" style="height: 100px; resize: vertical; font-family: monospace; font-size: 0.85rem;" placeholder="Select tags above and click Generate...">${currentStyle.rule || ''}</textarea>
            
            <!-- NEW STYLE EDITOR NOTE -->
            <div style="margin-top: 16px; background: rgba(59, 130, 246, 0.08); border-left: 4px solid #3b82f6; border-radius: 4px; padding: 12px 16px;">
                <div style="display: flex; align-items: center; gap: 8px; color: #3b82f6; font-weight: 600; font-size: 0.85rem; margin-bottom: 4px;">
                    <i class="fa-solid fa-circle-info"></i> Note
                </div>
                <div style="color: var(--text-main); font-size: 0.8rem; line-height: 1.5;">
                    Dont forget to hit save at the top dummy
                </div>
            </div>
        </div>
    `);

    // Draw AI Insights
    const renderInsights = () => {
        const box = $("#ps_ai_author_box_style");
        box.empty();
        (currentStyle.generatedOptions || []).forEach(tag => {
            const isSel = currentStyle.tags.includes(tag);
            const tEl = $(`<span class="ps-modern-tag ${isSel ? 'selected' : ''}">${tag.replace(" ✨", "")} <i class="fa-solid fa-sparkles" style="font-size:0.6rem; margin-left:4px; color:var(--gold);"></i></span>`);
            tEl.on("click", () => {
                if (isSel) currentStyle.tags = currentStyle.tags.filter(t => t !== tag);
                else currentStyle.tags.push(tag);
                tEl.toggleClass("selected");
            });
            box.append(tEl);
        });
    };
    renderInsights();

    // Input Binders
    $("#ps_style_notes").on("input", function () { currentStyle.notes = $(this).val(); });
    $("#ps_style_rule_text").on("input", function () { currentStyle.rule = $(this).val(); });
    $("#ps_style_name").on("input", function () { currentStyle.name = $(this).val(); });

    // Cancel Button
    $("#ps_btn_cancel_style").on("click", () => renderStyleLibrary(c));

    // Save Button (Locks changes into the actual memory array)
    $("#ps_btn_save_style").on("click", () => {
        if (currentStyle.name.trim() === "") currentStyle.name = "Unnamed Style";

        if (!editId) {
            localProfile.customStyles.push(currentStyle);
        } else {
            const idx = localProfile.customStyles.findIndex(s => s.id === editId);
            if (idx > -1) localProfile.customStyles[idx] = currentStyle;
        }

        // Auto-update active rule if they just edited the currently selected style
        if (localProfile.activeStyleId === currentStyle.id) {
            localProfile.aiRule = currentStyle.rule;
        }

        saveProfileToMemory();
        renderStyleLibrary(c);
        toastr.success(`Saved "${currentStyle.name}"`);
    });

    // Generate Insights Scoped to this style
    $("#ps_btn_get_authors_style").on("click", async function () {
        // Updated condition to check for our unified key instead of just characterId
        if (!getCharacterKey()) return toastr.warning("Open a chat or group first so I can read the context!");
        $(this).prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Brainstorming...`);

        await useMeguminEngine(async () => {
            // Modified prompt to better suit both individual characters and group scenarios
            const orderText = `Based on the active characters and scenario, give me EXACTLY 2 famous author names or literary writing styles (e.g. Edgar Allan Poe, Jane Austen style, Dark Fantasy Author) and 5 tags that fit the rp (e.g. internet culture, femboy, virtual game) whose writing style perfectly fits the tone and world. Return ONLY the 7 items separated by a comma. Do not explain them.`;
            let aiRawOutput = await runMeguminTask(orderText);

            const aiTagsTemp = cleanAIOutput(aiRawOutput).split(",").map(t => t.trim().replace(/['"\[\]\.]/g, '')).filter(t => t.length > 0);

            if (aiTagsTemp.length > 0) {
                currentStyle.tags = currentStyle.tags.filter(tag => !tag.endsWith("✨"));
                currentStyle.generatedOptions = aiTagsTemp.map(tag => `${tag} ✨`);
                renderInsights();
                toastr.success(`Generated ${aiTagsTemp.length} insights!`);
            }
        });
        $(this).prop("disabled", false).html(`<i class="fa-solid fa-lightbulb"></i> Generate Insights`);
    });

    // Generate Rule Scoped to this style
    $("#ps_btn_generate_style").on("click", async function () {
        if (currentStyle.tags.length === 0) return toastr.warning("Select tags first!");
        $(this).prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Finalizing...`);

        await useMeguminEngine(async () => {
            const orderText = `Create a writing style prompt based on these traits:\n\nSelected style tags: ${currentStyle.tags.join(", ")}\n\nAdditional user instructions: ${currentStyle.notes}\n\nWrite a concise, well-structured writing style rule (2-4 paragraphs) that the AI must follow. Combine all tags into a cohesive directive. Write it as a direct instruction. Do not use bullet points or introductory text.`;
            let rule = await runMeguminTask(orderText);
            currentStyle.rule = cleanAIOutput(rule).trim();
            $("#ps_style_rule_text").val(currentStyle.rule);
            toastr.success("Live AI Rule Generated!");
        });
        $(this).prop("disabled", false).html(`<i class="fa-solid fa-bolt"></i> Generate Writing Rule`);
    });
}

function renderAddons(c) {
    const descriptions = {
        "death": "Permanent death is on the table. You can actually get a Game Over. No plot armor.",
        "combat": "Lethal, tactical combat. Hits have weight, positioning matters, and fights can go badly fast.",
        "direct": "No euphemisms or flowery evasions. Characters say exactly what they mean.",
        "color": "Each character's dialogue is color-coded for easy visual parsing."
    };

    const grid = $(`<div class="ps-grid"></div>`);
    hardcodedLogic.addons.forEach(a => {
        const isSel = localProfile.addons.includes(a.id);
        const recText = a.recommended ? `<span class="ps-rec-text"><i class="fa-solid fa-star"></i> Recommended</span>` : '';
        const descText = descriptions[a.id] || "";
        const card = $(`<div class="ps-card ${isSel ? 'selected' : ''}">
            <div class="ps-card-title"><span>${a.label}</span> ${recText}</div>
            <div class="ps-card-desc">${descText}</div>
        </div>`);
        card.on("click", () => {
            if (isSel) localProfile.addons = localProfile.addons.filter(i => i !== a.id); else localProfile.addons.push(a.id);
            saveProfileToMemory(); drawWizard(currentStage);
        }); grid.append(card);
    }); c.append(grid);

    // Global Directives Panel logic...
    c.append(`
        <div style="margin-top: 32px; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 20px;">
            <div class="ps-rule-title" style="color: var(--text-main); font-size: 0.9rem; font-weight: 700;">
                <i class="fa-solid fa-earth-americas" style="margin-right: 8px; color: #4a90e2;"></i> Extra
            </div>
            
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="flex: 1;">
                    <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">Target Word Count</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Leave empty for no limit</div>
                </div>
                <input type="number" id="ps_input_wordcount" class="ps-modern-input" style="width: 200px;" placeholder="e.g. 400" value="${localProfile.userWordCount || ''}" min="1" />
            </div>
            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 0;" />
            
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="flex: 1;">
                    <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">Language Output</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Leave empty for default (English)</div>
                </div>
                <input type="text" id="ps_input_language" class="ps-modern-input" style="width: 200px;" placeholder="e.g. Arabic, French..." value="${localProfile.userLanguage || ''}" />
            </div>
            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 0;" />
            
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="flex: 1;">
                    <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">User Gender</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Ensure the AI addresses you correctly</div>
                </div>
                <select id="ps_select_pronouns" class="ps-modern-input" style="width: 200px; cursor: pointer;">
                    <option value="off" ${localProfile.userPronouns === 'off' ? 'selected' : ''}>Off</option>
                    <option value="male" ${localProfile.userPronouns === 'male' ? 'selected' : ''}>Male (Him/He)</option>
                    <option value="female" ${localProfile.userPronouns === 'female' ? 'selected' : ''}>Female (Her/She)</option>
                </select>
            </div>
        </div>
    `);

    $("#ps_input_wordcount").on("input", function () { localProfile.userWordCount = $(this).val(); saveProfileToMemory(); });
    $("#ps_input_language").on("input", function () { localProfile.userLanguage = $(this).val(); saveProfileToMemory(); });
    $("#ps_select_pronouns").on("change", function () { localProfile.userPronouns = $(this).val(); saveProfileToMemory(); });
}

function renderBlocks(c) {
    const descriptions = {
        "info": "Appends a clean status block with current weather, time, location, and character clothing.",
        "summary": "A rolling summary the AI updates each response so it never forgets key events or details.",
        "cyoa": "Choose-Your-Own-Adventure panel with 4 suggested actions for you to pick from each turn.",
        "mvu": "Add MVU Compatibility still in test read more here: <a href='https://github.com/KritBlade/MVU_Game_Maker' target='_blank' style='color: var(--gold); text-decoration: underline;'>https://github.com/KritBlade/MVU_Game_Maker</a>"
    };

    const grid = $(`<div class="ps-grid"></div>`);
    hardcodedLogic.blocks.forEach(b => {
        const isSel = localProfile.blocks.includes(b.id);
        const recText = b.recommended ? `<span class="ps-rec-text"><i class="fa-solid fa-star"></i> Recommended</span>` : '';
        const descText = descriptions[b.id] || "";
        const card = $(`<div class="ps-card ${isSel ? 'selected' : ''}">
            <div class="ps-card-title"><span>${b.label}</span> ${recText}</div>
            <div class="ps-card-desc" style="position: relative; z-index: 5;">${descText}</div>
        </div>`);

        card.on("click", (e) => {
            if ($(e.target).closest("a").length) return;

            if (isSel) localProfile.blocks = localProfile.blocks.filter(i => i !== b.id); else localProfile.blocks.push(b.id);
            saveProfileToMemory(); drawWizard(currentStage);
        });
        grid.append(card);
    });
    c.append(grid);
}

function renderModels(c) {
    c.empty();

    // 1. SILENT MIGRATION FOR OLD PROFILES
    const migrationMap = {
        "cot-english": "cot-v1-english",
        "cot-arabic": "cot-v1-arabic",
        "cot-spanish": "cot-v1-spanish",
        "cot-french": "cot-v1-french",
        "cot-zh": "cot-v1-zh",
        "cot-ru": "cot-v1-ru",
        "cot-jp": "cot-v1-jp",
        "cot-pt": "cot-v1-pt",
        "cot-english-test": "cot-v2-english"
    };
    if (migrationMap[localProfile.model]) {
        localProfile.model = migrationMap[localProfile.model];
        saveProfileToMemory();
    }

    // 2. PARSE CURRENT SELECTION STATE
    let currentType = "off";
    let currentLang = "english"; // Default fallback language for the selector

    if (localProfile.model && localProfile.model.startsWith("cot-v1-")) {
        currentType = "v1";
        currentLang = localProfile.model.replace("cot-v1-", "");
    } else if (localProfile.model && localProfile.model.startsWith("cot-v2-")) {
        currentType = "v2";
        currentLang = localProfile.model.replace("cot-v2-", "");
    }

    // 3. RENDER THE TOP-LEVEL FRAMEWORK CHOICES
    c.append(`<div class="ps-rule-title" style="margin-bottom:10px;">Select Thinking Framework</div>`);
    const typeGrid = $(`<div class="ps-grid" style="margin-bottom: 25px;"></div>`);

    const types = [
        { id: "off", label: "CoT Off", desc: "No Chain of Thought or prefill. The AI will respond normally." },
        { id: "v1", label: "CoT V1 (Classic)", desc: "The original 8-step framework. Focuses heavily on the NPC's internal emotional landscape vs their observable actions." },
        { id: "v2", label: "CoT V2 (New)", desc: "The new experimental framework. Stricter reality checks, info audits, better NPCs, and hook generation.", isNew: true }
    ];

    types.forEach(t => {
        const isSel = currentType === t.id;
        const newBadgeHtml = t.isNew ? `<div style="position: absolute; bottom: 15px; right: 15px; background: #3b82f6; color: #fff; font-size: 0.65rem; font-weight: 800; padding: 3px 10px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.4);">New</div>` : '';

        const card = $(`
            <div class="ps-card ${isSel ? 'selected' : ''}" style="position: relative; padding-bottom: ${t.isNew ? '40px' : '20px'};">
                <div class="ps-card-title"><span>${t.label}</span></div>
                <div class="ps-card-desc">${t.desc}</div>
                ${newBadgeHtml}
            </div>
        `);

        card.on("click", () => {
            if (t.id === "off") {
                localProfile.model = "cot-off";
            } else {
                // When selecting a framework, preserve their currently selected language
                localProfile.model = `cot-${t.id}-${currentLang}`;
            }
            saveProfileToMemory();
            renderModels(c); // Refresh UI to show/hide languages
        });

        typeGrid.append(card);
    });
    c.append(typeGrid);

    // 4. RENDER THE LANGUAGE SELECTOR (ONLY IF V1 OR V2 IS SELECTED)
    if (currentType !== "off") {
        c.append(`<hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 0 0 20px 0;" />`);
        c.append(`<div class="ps-rule-title" style="margin-bottom:10px;">Select Language</div>`);
        const langGrid = $(`<div class="ps-grid"></div>`);

        const langs = [
            { id: "english", label: "English" },
            { id: "arabic", label: "Arabic (العربية)", rec: true },
            { id: "spanish", label: "Spanish (Español)" },
            { id: "french", label: "French (Français)" },
            { id: "zh", label: "Mandarin (中文)" },
            { id: "ru", label: "Russian (Русский)" },
            { id: "jp", label: "Japanese (日本語)" },
            { id: "pt", label: "Portuguese (Português)" }
        ];

        langs.forEach(l => {
            const isSel = currentLang === l.id;
            const recText = l.rec ? `<span class="ps-rec-text"><i class="fa-solid fa-star"></i> Pro Tip</span>` : '';

            // Make the language cards a bit more compact than the main framework cards
            const card = $(`
                <div class="ps-card ${isSel ? 'selected' : ''}" style="padding: 12px 18px; min-height: unset;">
                    <div class="ps-card-title" style="margin-bottom: 0; font-size: 0.9rem;"><span>${l.label}</span> ${recText}</div>
                </div>
            `);

            card.on("click", () => {
                localProfile.model = `cot-${currentType}-${l.id}`;
                saveProfileToMemory();
                renderModels(c); // Refresh UI
            });

            langGrid.append(card);
        });
        c.append(langGrid);
    }
}

// -------------------------------------------------------------
// STAGE 7: BAN LIST UI
// -------------------------------------------------------------
function renderBanList(c) {
    c.empty();
    if (!localProfile.banList) localProfile.banList = [];

    // Top control panel
    c.append(`
        <div style="background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <span style="font-weight: 600; color: var(--text-main); font-size: 0.95rem;">AI Slop Detector</span>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Scans the last 15 AI messages to catch overused clichés.</div>
                </div>
                <button id="ps_btn_scan_slop" class="ps-modern-btn primary" style="padding: 8px 16px; font-size: 0.8rem; background: #a855f7; color: #fff;">
                    <i class="fa-solid fa-radar"></i> Analyze Chat History
                </button>
            </div>
            <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 15px 0;" />
            <div style="display: flex; gap: 10px;">
                <input type="text" id="ps_manual_ban_input" class="ps-modern-input" placeholder="Manually add a phrase to ban..." style="flex: 1;" />
                <button id="ps_btn_add_ban" class="ps-modern-btn secondary" style="padding: 0 15px;">Add</button>
            </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div class="ps-rule-title" style="margin-bottom: 0;">Active Banned Phrases</div>
            <button id="ps_btn_clear_bans" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.75rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
                <i class="fa-solid fa-trash-can"></i> Clear All
            </button>
        </div>
        <div id="ps_banlist_container" style="display: flex; flex-wrap: wrap; gap: 8px; min-height: 50px; padding: 10px; border: 1px dashed var(--border-color); border-radius: 8px;"></div>
        
        <!-- NEW BAN LIST NOTE -->
        <div style="margin-top: 20px; background: rgba(59, 130, 246, 0.08); border-left: 4px solid #3b82f6; border-radius: 4px; padding: 12px 16px;">
            <div style="display: flex; align-items: center; gap: 8px; color: #3b82f6; font-weight: 600; font-size: 0.85rem; margin-bottom: 4px;">
                <i class="fa-solid fa-circle-info"></i> Note
            </div>
            <div style="color: var(--text-main); font-size: 0.8rem; line-height: 1.5;">
                This is a beta feature. Don't complain if you have to generate more than once.
            </div>
        </div>
    `);

    // Draw the active tags
    const renderTags = () => {
        const box = $("#ps_banlist_container");
        box.empty();
        if (localProfile.banList.length === 0) {
            box.append(`<span style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">No phrases banned yet.</span>`);
            return;
        }

        localProfile.banList.forEach(phrase => {
            const tEl = $(`<span class="ps-modern-tag selected" style="background: rgba(239,68,68,0.1); border-color: #ef4444; color: #ef4444;">${phrase} <i class="fa-solid fa-xmark" style="margin-left: 6px;"></i></span>`);
            tEl.on("click", () => {
                localProfile.banList = localProfile.banList.filter(p => p !== phrase);
                saveProfileToMemory();
                renderTags();
            });
            box.append(tEl);
        });
    };
    renderTags();

    // Manual Add Logic
    $("#ps_btn_add_ban").on("click", () => {
        const val = $("#ps_manual_ban_input").val().trim();
        if (val && !localProfile.banList.includes(val)) {
            localProfile.banList.push(val);
            saveProfileToMemory();
            $("#ps_manual_ban_input").val("");
            renderTags();
        }
    });

    // Clear All Logic
    $("#ps_btn_clear_bans").on("click", () => {
        if (localProfile.banList.length === 0) return;
        if (confirm("Are you sure you want to delete all banned phrases?")) {
            localProfile.banList = [];
            saveProfileToMemory();
            renderTags();
            toastr.info("Ban list cleared.");
        }
    });

    // Auto-Scan Logic
    $("#ps_btn_scan_slop").on("click", async function () {
        const chatText = getCleanedChatHistory();
        if (chatText.length < 50) return toastr.warning("Not enough chat history to analyze!");

        $(this).prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...`);

        const rawResponse = await analyzeSlopDirectly(chatText);

        if (rawResponse) {
            // Splits by comma, asterisk, newline, or dash so the AI can't mess up the formatting
            const newPhrases = rawResponse.split(/[,*\n-]/).map(t => t.trim().replace(/['"\[\]\.]/g, '')).filter(t => t.length > 3);

            let addedCount = 0;
            newPhrases.forEach(p => {
                if (!localProfile.banList.includes(p)) {
                    localProfile.banList.push(p);
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                saveProfileToMemory();
                renderTags();
                toastr.success(`Caught and banned ${addedCount} repetitive phrases!`);
            } else {
                toastr.info("No new repetitive phrases found.");
            }
        }

        $(this).prop("disabled", false).html(`<i class="fa-solid fa-radar"></i> Analyze Chat History`);
    });
}

// -------------------------------------------------------------
// STAGE 7: BAN LIST HELPER FUNCTIONS
// -------------------------------------------------------------
function getCleanedChatHistory() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return "";

    // Grab the last 50 messages, ensuring they are ONLY from the AI
    const aiMessages = context.chat.filter(m => !m.is_user && !m.is_system).slice(-50);

    // Your exact original regex with the .*? included to catch orphaned closing tags
    const badStuffRegex = /(<disclaimer>.*?<\/disclaimer>)|(<guifan>.*?<\/guifan>)|(<danmu>.*?<\/danmu>)|(<options>.*?<\/options>)|```start|```end|<done>|`<done>`|(.*?<\/(?:ksc??|think(?:ing)?)>(\n)?)|(<(?:ksc??|think(?:ing)?)>[\s\S]*?<\/(?:ksc??|think(?:ing)?)>(\n)?)/gs;

    // Clean each message INDIVIDUALLY so the .*? doesn't bleed across messages
    let cleanedMessages = aiMessages.map(m => {
        let text = m.mes;

        // 1. Strip the thinking and formatting from this specific message
        text = text.replace(badStuffRegex, "");

        // 2. Strip summary blocks and HTML tags
        text = text.replace(/<details>[\s\S]*?<\/details>/gs, "");
        text = text.replace(/<summary>[\s\S]*?<\/summary>/gs, "");
        text = text.replace(/<[^>]*>?/gm, "");

        return text.trim();
    });

    // Remove any messages that became completely empty after cleaning
    cleanedMessages = cleanedMessages.filter(t => t.length > 0);

    // Join them all together into one clean block of narrative
    return cleanedMessages.join("\n\n");
}

async function analyzeSlopDirectly(chatText) {
    activeBanListChat = chatText; // Set the variable so our injector catches it

    try {
        // Trigger a quiet generation. The injection engine will catch this dummy text!
        let rawOutput = await generateQuietPrompt({ prompt: "___PS_BANLIST___" });

        // Clean the thinking block out of the returned answer
        let text = rawOutput.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        return text;
    } catch (e) {
        console.error(`[${extensionName}] Ban List Analysis Failed:`, e);
        return null;
    } finally {
        activeBanListChat = null; // Always reset it when done!
    }
}

// -------------------------------------------------------------
// AI GENERATION PROCESSES (Targeting [[order]])
// -------------------------------------------------------------
async function useMeguminEngine(task) {
    const selector = $("#settings_preset_openai");
    const option = selector.find(`option`).filter(function () { return $(this).text().trim() === TARGET_PRESET_NAME; });
    let originalValue = null;

    if (option.length) {
        originalValue = selector.val();
        selector.val(option.val()).trigger("change");

        // Increased delay to 2000ms. Third-party APIs like GLM/NanoGPT need a little 
        // more time to fully reconnect when the preset changes before we fire the prompt.
        await new Promise(r => setTimeout(r, 2000));
    } else {
        toastr.error(`"${TARGET_PRESET_NAME}" not found in OpenAI presets.`);
        return;
    }

    try {
        await task();
    } catch (e) {
        console.error(`[${extensionName}] AI Error:`, e);
    } finally {
        // Small safety buffer before switching back so ST doesn't abort the tail end of the generation
        await new Promise(r => setTimeout(r, 500));
        selector.val(originalValue).trigger("change");
    }
}

async function runMeguminTask(orderText) {
    activeGenerationOrder = orderText;
    try {
        // Passing it as an object { prompt: ... } fixes the ST 1.15 yellow warning 
        // and stops the promise from desyncing and aborting early!
        return await generateQuietPrompt({ prompt: "___PS_DUMMY___" });
    } finally {
        activeGenerationOrder = null;
    }
}

$("body").on("input", "#ps_main_current_rule", function () {
    localProfile.aiRule = $(this).val(); saveProfileToMemory();
});

function buildBaseDict() {
    const dict = {};
    if (!localProfile) return dict;

    const targetLang = (localProfile.userLanguage && localProfile.userLanguage.trim() !== "")
        ? localProfile.userLanguage.toUpperCase()
        : "ENGLISH";

    dict["[[Language]]"] = `[LANGUAGE RULE]\nALL OUTPUT EXCEPT THINKING MUST BE IN ${targetLang} ONLY.`;

    if (localProfile.userPronouns === "male") dict["[[pronouns]]"] = `{{user}} is male. Always portray and address him as such.`;
    else if (localProfile.userPronouns === "female") dict["[[pronouns]]"] = `{{user}} is female. Always portray and address her as such.`;
    if (localProfile.userWordCount && String(localProfile.userWordCount).trim() !== "") {
        dict["[[count]]"] = `— maximum ${String(localProfile.userWordCount).trim()} words`;
    } else {
        dict["[[count]]"] = "";
    }

    const mData = hardcodedLogic.modes.find(m => m.id === localProfile.mode);
    if (mData) {
        dict["[[prompt1]]"] = mData.p1; dict["[[prompt2]]"] = mData.p2;
        dict["[[prompt3]]"] = mData.p3; dict["[[prompt4]]"] = mData.p4;
        dict["[[prompt5]]"] = mData.p5; dict["[[prompt6]]"] = mData.p6;
        dict["[prompt1]"] = mData.p1; dict["[prompt2]"] = mData.p2;
        dict["[prompt3]"] = mData.p3; dict["[prompt4]"] = mData.p4;
        dict["[prompt5]"] = mData.p5; dict["[prompt6]"] = mData.p6;
        dict["[[AI1]]"] = mData.A1; dict["[[AI2]]"] = mData.A2;
    }

    const pData = hardcodedLogic.personalities.find(p => p.id === localProfile.personality);
    if (pData) {
        dict["[[main]]"] = pData.content;
        if (localProfile.personality === "megumin") {
            dict["[[AI1]]"] = "Fine i read the rules.";
            dict["[[AI2]]"] = "OK i Understnd it.";
        }
    }

    if (localProfile.toggles.ooc) dict["[[OOC]]"] = hardcodedLogic.toggles.ooc.content;
    if (localProfile.toggles.control) dict["[[control]]"] = hardcodedLogic.toggles.control.content;
    if (localProfile.aiRule) dict["[[aiprompt]]"] = localProfile.aiRule;

    localProfile.addons.forEach(aId => { const item = hardcodedLogic.addons.find(a => a.id === aId); if (item) dict[item.trigger] = item.content; });
    localProfile.blocks.forEach(bId => { const item = hardcodedLogic.blocks.find(b => b.id === bId); if (item) dict[item.trigger] = item.content; });

    const wordCountStr = (localProfile.userWordCount && String(localProfile.userWordCount).trim() !== "")
        ? String(localProfile.userWordCount).trim()
        : null;

    if (localProfile.blocks.includes("mvu")) {
        // STATE 1: MVU IS ACTIVE
        let baseMvu = hardcodedLogic.blocks.find(b => b.id === "mvu").content;

        if (wordCountStr) {
            // Word count has a number -> Inject "maximum X words"
            dict["[[MVU]]"] = baseMvu.replace("[[count]]", `maximum ${wordCountStr} words`);
        } else {
            // Word count is empty -> Inject "..."
            dict["[[MVU]]"] = baseMvu.replace("[[count]]", "...");
        }
    } else {
        // STATE 2: MVU IS OFF (Fallback to standard narrative)
        if (wordCountStr) {
            dict["[[MVU]]"] = `{Main narrative response — maximum ${wordCountStr} words}`;
        } else {
            dict["[[MVU]]"] = `{Main narrative response}`;
        }
    }

    const modData = hardcodedLogic.models.find(m => m.id === localProfile.model);
    if (modData) {
        dict["[[COT]]"] = modData.content;
        if (modData.prefill) dict["[[prefill]]"] = modData.prefill;
    }
    // DYNAMIC BAN LIST INJECTION
    if (localProfile.banList && localProfile.banList.length > 0) {
        // Removed the hard quotes "" around the items so they read as instructions/patterns
        const banStr = localProfile.banList.map(b => `- ${b}`).join("\n");

        // Updated the prompt text to reflect that these are tropes/patterns
        dict["[[banlist]]"] = `[BAN LIST]\nNever rely on these clichés, tropes, or repetitive patterns. They are dead language:\n${banStr}`;
    } else {
        dict["[[banlist]]"] = "";
    }

    return dict;
}
// -------------------------------------------------------------
// LIVE PROMPT INJECTION ENGINE
// -------------------------------------------------------------
function escapeRegex(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function handlePromptInjection(data) {
    const messages = data?.messages || data?.chat || (Array.isArray(data) ? data : null);
    if (!messages || !Array.isArray(messages)) return;

    // ---------------------------------------------------------
    // 1 INJECT BAN LIST TASK (Bypassing Preset)
    // ---------------------------------------------------------
    if (activeBanListChat) {
        messages.length = 0; // Wipe the array completely clean

        // Inject your exact 4-message array format
        messages.push({
            "role": "system",
            "content": "You are an expert literary critique. Analyze the provided chat history and identify the 5 most repetitive, cliché, or overused stylistic patterns or crutch phrases the writer relies on. Instead of quoting the exact phrase, write a short, generalized rule forbidding the underlying trope (e.g., 'Comparing emotional shock to a physical blow', 'Characters releasing breaths they didn't know they were holding'). Return ONLY the 5 rules separated by commas. Do not explain them. Do not use quotes or numbers."
        });
        messages.push({
            "role": "user",
            "content": "Extract the top 5 most overused clichés or repetitive narrative patterns from this text. Return ONLY the 5 generalized rules forbidding them, separated by commas.\n<chat>\n" + activeBanListChat + "\n</chat>"
        });
        messages.push({
            "role": "system",
            "content": "<thinking_steps>\nBefore creating the response, think deeply.\n\nThoughts must be wrapped in <think></think>. The first token must be <think>. The main text must immediately follow </think>.\n\n<think>\nReflect in approximately 100–150 words as a seamless paragraph.\n\n– your thinking steps\n\n</think>\n</thinking_steps>\n\n    [OUTPUT ORDER]\n    Every response must follow this exact structure in this exact order:\n\n    <think>\n    {Thinking}\n    </think>\n\n    {Main response}"
        });
        messages.push({
            "role": "assistant",
            "content": "So, I realize this is a fictional world, to which nothing from the real world applies. \nI will now use this format for my thinking and give the next response:\n<think>\nI will thinking step-by-step in the following format: <think>.\n</think>"
        });

        console.log(`[${extensionName}] 🎯 Injected Ban List array in memory.`);
        return; // Stop here! Do not process the rest of the normal pipeline.
    }

    // ---------------------------------------------------------
    // 1.5 INJECT BACKGROUND GENERATION TASK INTO [[order]]
    // ---------------------------------------------------------
    if (activeGenerationOrder) {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].content && typeof messages[i].content === 'string') {
                if (messages[i].content.includes("___PS_DUMMY___")) {
                    messages.splice(i, 1);
                    continue;
                }
                if (messages[i].content.includes("[[order]]")) {
                    messages[i].content = messages[i].content.replace(/\[\[order\]\]/g, activeGenerationOrder);
                    console.log(`[${extensionName}] 🎯 Injected generation task into [[order]]`);
                }
            }
        }
    }

    // ---------------------------------------------------------
    // 2. STANDARD PIPELINE REPLACEMENTS
    // ---------------------------------------------------------
    if (!localProfile) return;

    // Build the default dictionary
    const dict = buildBaseDict();

    // APPLY DEV MODE OVERRIDES
    if (localProfile.devOverrides) {
        Object.keys(localProfile.devOverrides).forEach(key => {
            if (dict[key] !== undefined) {
                dict[key] = localProfile.devOverrides[key]; // Overwrite default with user's dev edit
            }
        });
    }

    let replacementsMade = 0;
    for (const msg of messages) {
        if (msg.content && typeof msg.content === 'string') {
            Object.entries(dict).forEach(([trigger, replacement]) => {
                if (msg.content.includes(trigger)) {
                    const processed = typeof substituteParams === 'function' ? substituteParams(replacement) : replacement;
                    msg.content = msg.content.replace(new RegExp(escapeRegex(trigger), 'g'), processed);
                    replacementsMade++;
                }
            });
            // CLEANUP
            ["[[prompt1]]", "[[prompt2]]", "[[prompt3]]", "[[prompt4]]", "[[prompt5]]", "[[prompt6]]", "[prompt1]", "[prompt2]", "[prompt3]", "[prompt4]", "[prompt5]", "[prompt6]", "[[AI1]]", "[[AI2]]", "[[main]]", "[[OOC]]", "[[control]]", "[[aiprompt]]", "[[death]]", "[[combat]]", "[[Direct]]", "[[COLOR]]", "[[infoblock]]", "[[summary]]", "[[cyoa]]", "[[COT]]", "[[prefill]]", "[[order]]", "[[Language]]", "[[pronouns]]", "[[banlist]]", "[[count]]", "[[MVU]]"].forEach(tr => {
                if (msg.content.includes(tr)) msg.content = msg.content.replace(new RegExp(escapeRegex(tr), 'g'), "");
            });
        }
    }
    if (replacementsMade > 0 && !activeGenerationOrder) {
        console.log(`[${extensionName}] ✅ Executed ${replacementsMade} hardcoded block replacements.`);
    }
}

$("body").on("click", "#ps_btn_next", function () { if (currentStage < stagesUI.length - 1) drawWizard(currentStage + 1); });
$("body").on("click", "#ps_btn_prev", function () { if (currentStage > 0) drawWizard(currentStage - 1); });

// -------------------------------------------------------------
// DEV MODE UI
// -------------------------------------------------------------
function renderDevMode() {
    $("#ps_stage_title").text("Developer Mode");
    $("#ps_stage_sub").text("Override raw prompt values for this profile.");
    $(".ps-dot").removeClass("active");
    $("#ps_breadcrumb_num").text("DEV");

    const c = $("#ps_stage_content");
    c.empty();

    const dict = buildBaseDict(); // This grabs the pure, unedited defaults
    if (!localProfile.devOverrides) localProfile.devOverrides = {};

    // State variable for the Global Toggle
    let isGlobalDevMode = false;

    // The Global Override Toggle UI
    const globalToggleCard = $(`
        <div class="ps-toggle-card" id="ps_dev_global_card" style="margin-bottom: 24px; padding: 14px 20px; border-color: var(--gold);">
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:700; color: var(--gold);"><i class="fa-solid fa-earth-americas"></i> Apply Overrides Globally</span>
                <div style="margin-top:4px; font-size: 0.75rem; color: var(--text-muted);">
                    When active, saving or restoring will apply to <b>ALL</b> characters, groups, and defaults.<br>
                    <i>(Safety: The <b>[[aiprompt]]</b> writing style cannot be globally overridden.)</i>
                    <i>(Enable only if you know what are you doing.)</i>
                </div>
            </div>
            <div class="ps-switch" id="ps_dev_global_switch"></div>
        </div>
    `);

    // Toggle Click Logic
    globalToggleCard.on("click", function () {
        isGlobalDevMode = !isGlobalDevMode;
        if (isGlobalDevMode) {
            $(this).addClass("active");
            $(this).css("background", "rgba(245, 158, 11, 0.05)");
        } else {
            $(this).removeClass("active");
            $(this).css("background", "var(--bg-panel)");
        }
    });

    c.append(globalToggleCard);

    const wrapper = $(`<div style="display:flex; flex-direction:column; gap: 16px;"></div>`);

    // Sort keys alphabetically so it looks clean
    Object.keys(dict).sort().forEach(trigger => {
        // Skip the bracketless duplicates to avoid confusing the user
        if (!trigger.startsWith("[[")) return;

        const defaultVal = dict[trigger];
        const isOverridden = localProfile.devOverrides[trigger] !== undefined;
        const currentVal = isOverridden ? localProfile.devOverrides[trigger] : defaultVal;

        const item = $(`
            <div style="background: var(--bg-panel); border: 1px solid ${isOverridden ? 'var(--gold)' : 'var(--border-color)'}; border-radius: 8px; padding: 12px; transition: 0.2s;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: bold; color: ${isOverridden ? 'var(--gold)' : 'var(--accent-color)'}; font-family: monospace;">${trigger}</span>
                    <span class="dev-status" style="font-size: 0.7rem; color: var(--gold); font-weight: bold; display: ${isOverridden ? 'block' : 'none'};">MODIFIED</span>
                </div>
                
                <textarea class="ps-modern-input dev-textarea" style="height: 120px; resize: vertical; font-family: monospace; font-size: 0.8rem; background: #000;">${currentVal}</textarea>
                
                <div style="display: flex; gap: 10px; margin-top: 10px; justify-content: flex-end;">
                    <button class="ps-modern-btn secondary dev-btn-restore" style="padding: 6px 12px; font-size: 0.75rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3); display: ${isOverridden ? 'flex' : 'none'};">
                        <i class="fa-solid fa-rotate-left"></i> Restore Default
                    </button>
                    <button class="ps-modern-btn primary dev-btn-save" style="padding: 6px 12px; font-size: 0.75rem; background: var(--text-main); color: #000;">
                        <i class="fa-solid fa-floppy-disk"></i> Save Override
                    </button>
                </div>
            </div>
        `);

        // SAVE BUTTON LOGIC
        item.find(".dev-btn-save").on("click", function () {
            const val = item.find(".dev-textarea").val();

            if (isGlobalDevMode && trigger !== "[[aiprompt]]") {
                // Apply to EVERY profile in memory
                Object.keys(extension_settings[extensionName].profiles).forEach(pk => {
                    const prof = extension_settings[extensionName].profiles[pk];
                    if (!prof.devOverrides) prof.devOverrides = {};
                    prof.devOverrides[trigger] = val;
                });
                toastr.success(`Global override saved for ${trigger}`);
            } else {
                // Apply Locally (or catch blocked [[aiprompt]] global attempts)
                if (isGlobalDevMode && trigger === "[[aiprompt]]") {
                    toastr.warning(`[[aiprompt]] cannot be applied globally. Saved locally instead.`);
                } else {
                    toastr.success(`Override saved for ${trigger}`);
                }
                localProfile.devOverrides[trigger] = val;
            }

            saveProfileToMemory();

            item.css("border-color", "var(--gold)");
            item.find(".dev-status").show();
            item.find(".dev-btn-restore").css("display", "flex");
        });

        // RESTORE DEFAULT BUTTON LOGIC
        item.find(".dev-btn-restore").on("click", function () {
            if (isGlobalDevMode && trigger !== "[[aiprompt]]") {
                // Remove from EVERY profile in memory
                Object.keys(extension_settings[extensionName].profiles).forEach(pk => {
                    const prof = extension_settings[extensionName].profiles[pk];
                    if (prof.devOverrides && prof.devOverrides[trigger] !== undefined) {
                        delete prof.devOverrides[trigger];
                    }
                });
                toastr.info(`Restored default globally for ${trigger}`);
            } else {
                if (isGlobalDevMode && trigger === "[[aiprompt]]") {
                    toastr.warning(`[[aiprompt]] cannot be restored globally. Restored locally instead.`);
                } else {
                    toastr.info(`Restored default for ${trigger}`);
                }
                delete localProfile.devOverrides[trigger];
            }

            saveProfileToMemory();

            item.find(".dev-textarea").val(defaultVal);
            item.css("border-color", "var(--border-color)");
            item.find(".dev-status").hide();
            $(this).hide();
        });

        wrapper.append(item);
    });

    c.append(wrapper);

    // Hide the normal "Next/Back" buttons while in Dev Mode
    $("#ps_btn_prev").hide();
    $("#ps_btn_next").hide();
}

$("body").on("click", "#ps_btn_dev_mode", function () {
    renderDevMode();
});

jQuery(async () => {
    try {
        const h = await $.get(`${extensionFolderPath}/example.html`);
        $("body").append(h);

        $("#prompt-slot-fixed-btn").draggable({ containment: "window", scroll: false });

        // CREATE AND TRACK THE FLOATING TOOLTIP
        $("body").append('<div id="ps-global-tooltip"></div>');

        $("body").on("mouseenter", ".ps-modern-tag", function () {
            const hint = $(this).attr("data-hint");
            if (!hint) return; // Ignore if it's an AI-generated tag without a hint

            const title = $(this).text().trim();
            $("#ps-global-tooltip").html(`<span class="ps-tooltip-title">${title}:</span> ${hint}`).addClass("visible");
        });

        $("body").on("mousemove", ".ps-modern-tag", function (e) {
            if (!$(this).attr("data-hint")) return;
            const tooltip = $("#ps-global-tooltip");

            // Offset slightly from the mouse cursor
            let x = e.clientX + 15;
            let y = e.clientY + 15;

            // Boundary detection: Flip tooltip to the other side if it hits the screen edge!
            if (x + tooltip.outerWidth() > window.innerWidth) {
                x = e.clientX - tooltip.outerWidth() - 15;
            }
            if (y + tooltip.outerHeight() > window.innerHeight) {
                y = e.clientY - tooltip.outerHeight() - 15;
            }

            tooltip.css({ left: x + 'px', top: y + 'px' });
        });

        $("body").on("mouseleave", ".ps-modern-tag", function () {
            $("#ps-global-tooltip").removeClass("visible");
        });

        // Sidebar Navigation: Click on a stage to jump instantly!
        $("body").on("click", ".sidebar-step", function () {
            const index = parseInt($(this).attr("id").replace("dot_", ""));
            if (!isNaN(index)) drawWizard(index);
        });

        // RESET BUTTON LOGIC (Safety Net)
        $("body").on("click", "#ps_btn_reset", function () {
            if (confirm("Are you sure you want to completely reset this character's profile to the default template?")) {
                const key = getCharacterKey() || "default";
                delete extension_settings[extensionName].profiles[key];
                saveSettingsDebounced();
                initProfile(); drawWizard(0);
                toastr.info("Profile has been reset to defaults.");
            }
        });

        // SAVE & CLOSE BUTTON LOGIC
        $("body").on("click", "#ps_btn_save_close", function () {
            saveProfileToMemory();
            $("#prompt-slot-modal-overlay").fadeOut(200);
            toastr.success("Workflow Configured & Applied Successfully!");
        });

        if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
            eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, handlePromptInjection);
            eventSource.on(event_types.CHAT_CHANGED, () => {
                initProfile(); updateCharacterDisplay();
                if ($("#prompt-slot-modal-overlay").is(":visible")) drawWizard(currentStage);
            });
        }

        $("body").on("click", "#prompt-slot-fixed-btn", function () {
            initProfile(); updateCharacterDisplay();
            drawWizard(0); $("#prompt-slot-modal-overlay").fadeIn(250).css("display", "flex");
        });

        $("body").on("click", "#close-prompt-slot-modal, #prompt-slot-modal-overlay", function (e) {
            if (e.target === this) { saveProfileToMemory(); $("#prompt-slot-modal-overlay").fadeOut(200); }
        });
    } catch (e) { console.error(`[${extensionName}] Failed to load:`, e); }
});