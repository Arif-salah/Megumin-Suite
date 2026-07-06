/* eslint-disable no-undef */
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, generateQuietPrompt, event_types, eventSource, substituteParams, saveChat, reloadCurrentChat, addOneMessage, getRequestHeaders, appendMediaToMessage, updateMessageBlock } from "../../../../script.js";
import { saveBase64AsFile } from "../../../utils.js";
import { humanizedDateTime } from "../../../RossAscends-mods.js";
import { Popup, POPUP_TYPE } from "../../../popup.js";
import { hardcodedLogic } from "./data/database.js";
import { KAZUMA_PLACEHOLDERS, RESOLUTIONS } from "./data/image_data.js";

const extensionName = "Megumin-Suite";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const TARGET_PRESET_NAME = "Megumin Engine";

const DEFAULT_PROMPTS = {
    storyPlan: {
        systemPrompt: "Role: You are an expert Story Architect and Plot Planner.\n\n<lore>\n{{charLore}}\n</lore>\n\nUser Persona ({{user}}):\n<user_persona>\n{{userPersona}}\n</user_persona>\n\n<Story>\n{{chatHistory}}\n</Story>",
        userPrompt: "Task: Brainstorm a minimum of 10 theoretical, medium-to-long-term plot developments based on the story so far.\n\nStrict Rules & Constraints:\n1. DO NOT write the immediate next scene. Skip past the current moment and look ahead to future structural milestones.\n2. Use Narrative Structure, NOT Timeframes: Do not use phrases like \"three days later\" or \"next month.\" Instead, frame every idea as a theoretical future Arc, Chapter, or Episode.\n3. Create a Menu of Possibilities: Treat this list as a theoretical menu of branching paths. Focus on major plot shifts, new character introductions, or escalating conflicts that could anchor a future chapter.\n4. Zero Agency Theft: You are STRICTLY FORBIDDEN from writing dialogue, actions, thoughts, or emotional reactions for {{user}}. You must never describe what {{user}} does, feels, or says under any circumstances.\n5. No Assumptions or Suggestions: Do not predict, suggest, or assume what {{user}} will do next. Never end a response by telling or hinting at what {{user}} should do.\n\nFormat & Style: Keep the ideas punchy, plot-focused, and clearly labeled by narrative structure.",
        thinkingPrompt: "<thinking_steps>\nBefore creating the response, think deeply.\nThoughts must be wrapped in <think></think>. The first token must be <think>. The main text must immediately follow </think>.\n<think>\nReflect in approximately 100–150 words as a seamless paragraph.\n</think>\n</thinking_steps>\n\n[OUTPUT ORDER]\nEvery response must follow this exact structure in this exact order:\n<think>\n{Thinking}\n</think>\n<plot>\n{main response}\n</plot>",
        injectionTemplate: "<Story_Plan>\nThis is a possible event for the story, take from it:\n{{planText}}\n</Story_Plan>",
        trackerTemplate: "<Story_Tracker>\narc: The Arc that is now active.\nchapter: The chapter that is now active.\nEpisode: The episode that is now active.\nSecrets: Any secret that the user/{{user}} doesn't know.\n</Story_Tracker>"
    },
    banList: {
        systemPrompt: "You are an expert literary critique. Analyze the provided chat history and identify the 5 most repetitive, cliché, or overused stylistic patterns or crutch phrases the writer relies on. Instead of quoting the exact phrase, write a short, generalized rule forbidding the underlying trope. Return ONLY the 5 rules separated by commas. Do not explain them. Do not use quotes or numbers.",
        userPrompt: "Extract the top 5 most overused clichés or repetitive narrative patterns from this text. Return ONLY the 5 generalized rules forbidding them, separated by commas.\n<chat>\n{{chatHistory}}\n</chat>",
        thinkingPrompt: "<thinking_steps>\nBefore creating the response, think deeply.\n\nThoughts must be wrapped in <think></think>. The first token must be <think>. The main response must immediately follow </think>.\n\n<think>\nReflect in approximately 100–150 words as a seamless paragraph.\n\n– your thinking steps\n\n</think>\n</thinking_steps>\n\n[OUTPUT ORDER]\n    Every response must follow this exact structure in this exact order:\n\n    <think>\n    {Thinking}\n    </think>\n\n    {Main response}",
        injectionTemplate: "[BAN LIST]\nNever rely on these clichés, tropes, or repetitive patterns. They are dead language:\n{{banItems}}"
    },
    imageGen: {
        systemPrompt: "You are an expert AI image prompt engineer. Your job is to read a scene and convert it into a highly detailed visual prompt for an image generation model. You must adhere to the requested Rules and Constraints. Do not include quotes, conversational text, or explanations. Output ONLY the raw prompt text.",
        userPrompt: "Write an image generation prompt for the latest scene in this chat history.\n\n<chat>\n{{chatHistory}}\n</chat>\n\n{{templateRules}}\n\n{{extraStr}}\n\n{{directLanguage}}\n\n{{npcImageTags}}\n\n{{templateExamples}}",
        thinkingPrompt: "<thinking_steps>\nBefore creating the response, think deeply.\n\nThoughts must be wrapped in <think></think>. The first token must be <think>. The main response must immediately follow </think>.\n\n<think>\nReflect in approximately 50-100 words as a seamless paragraph on what visual elements are present.\n\n</think>\n</thinking_steps>\n\n[OUTPUT ORDER]\n    Every response must follow this exact structure in this exact order:\n\n    <think>\n    {Thinking}\n    </think>\n\n    {Main response}",
        injectionTemplate: "### IMAGE GENERATION:\n{{conditionalText}}Within your response, insert {{imageCount}} of this image tag: <img prompt=\"[prompt]\"> to illustrate the scene.\n{{templateRules}}\n\n{{promptExtra}}\n\n{{directLanguage}}\n\n{{npcImageTags}}\n\n{{templateExamples}}",

        rulesIllusPov: "Build the prompt in this EXACT order. Do NOT rearrange sections.\n\n**SECTION 1 — Quality + POV:**\nStart: masterpiece, best quality, highly detailed,\nThen POV:\n• Observing: \"1st person pov, looking at viewer,\" + foreground anchor (e.g., \"foreground edge of a desk visible,\")\n• Interacting: \"1st person pov, pov hands,\" + hand action (e.g., \"male hands holding silver tray,\")\n• NEVER describe the user's face.\n\n**SECTION 2 — Character Count:**\nBooru tag for visible characters: \"1girl,\", \"3girls,\", \"1boy 1girl,\", etc.\n\n**SECTION 3 — Character Descriptions:**\n\nFOR SINGLE CHARACTER (1 person in frame):\nUse a flat comma-separated Booru tag string for appearance + action. Example:\nmature female, pale skin, dark eyes, long black hair, messy ponytail, dark wool coat, white silk blouse, tear-streaked face, anxious expression, sitting sideways, holding blanket, reaching toward viewer,\n\nFOR MULTIPLE CHARACTERS (2+ people in frame):\nYou MUST describe each character in a SEPARATE natural-language sentence/paragraph to prevent feature bleeding. Use Booru tags for appearance and clothing WITHIN each sentence, but separate characters with clear spatial language (\"on the left,\" \"in the center,\" \"behind her\").\n\nFormat per character: \"The [position] is a [gender/species] with [hair tags], [eye tags], [skin tags], wearing [clothing tags]. She has a [expression tag] and is [action/pose].\"\n\nEach character gets their OWN paragraph. Do NOT merge characters into one comma-separated list.\n\n**SECTION 4 — Scene + Lighting (always last):**\nEnd with background, lighting, atmosphere in natural language.\n\n**BANS:** No \"realistic\" or \"photographic\". No describing the user's face/body.",
        examplesIllusPov: "EXAMPLE — Single Character:\n<img prompt=\"masterpiece, best quality, highly detailed, 1st person pov, looking at viewer, foreground edge of black leather car seat visible, 1girl, mature female, pale skin, dark eyes, long black hair, messy high ponytail, dark wool coat, white silk blouse, tear-streaked face, anxious expression, sitting sideways, holding blanket, reaching toward viewer, dark luxury SUV interior background, tinted windows, blurred city lights outside, soft amber interior lighting, depth of field\">\n\nEXAMPLE — Multiple Characters:\n<img prompt=\"masterpiece, best quality, highly detailed, 1st person pov, looking at viewer, foreground messy white bedsheets visible, 3girls, The woman on the left is a rabbit girl kemonomimi with long blonde hair, long white rabbit ears, pale skin, blue eyes, wearing short frilly black white french maid outfit, maid headdress. She has a nervous expression and her hands clasped near mouth. The woman in the center is a mature female human with black hair, tight hair bun, brown eyes, wearing strict long black white victorian maid uniform, high collar, long skirt. She has a serious expression and is holding a silver measuring tape. The woman on the right is a demon girl with pale skin, short black hair, red eyes, red oni horns, wearing dark blue maid dress, white apron. She has a stoic expression and is holding red velvet slippers. Lavish bedroom background with ornate furniture and glowing chandelier, warm golden lighting, depth of field\">",
        rulesSdxlPov: "Build the prompt in this EXACT order. Do NOT rearrange sections.\n\n1. **Natural Language Architecture:** Write the prompt as highly detailed, grammatically complete sentences. Use a masterpiece. \n2. **Camera & Perspective:**\n   * Always establish the camera position and angle first (e.g., \"A 1st person pov from the bed looking up at...\").\n   * *If the user is passively observing:* Treat the perspective purely as a camera anchor. Do NOT describe the user's body or hands. Use an environmental anchor instead (e.g., \"The camera is positioned looking out over the white bed sheets in the foreground.\").\n   * *If the user is physically interacting in the narrative:* Describe the hands actively doing the task (e.g., \"In the foreground, 1st person male hands are holding a silver tray.\").\n3. **NPC Isolation & Details:** Dedicate a distinct sentence or paragraph to each NPC visible in the scene to prevent their features from bleeding together. You MUST explicitly describe their:\n   * Age bracket (e.g., mature, young)\n   * Gender (e.g., woman, girl, man, boy)\n   * Exact Race/Species (e.g., human, rabbit girl kemonomimi, demon girl with horns)\n   * Skin tone\n   * Eye color\n   * Hair length, style, and color\n   * Specific uniform/clothing details\n   * Current facial expression, held items, and posture\n4. **Environment:** Briefly describe the background setting, lighting, and atmosphere in the final sentence.",
        examplesSdxlPov: "EXAMPLE — Single Character:\n<img prompt=\"A masterpiece in 1st person point of view. The camera is positioned at the edge of a black leather car seat, looking up. A mature woman with pale skin, dark eyes, and long black hair pulled into a messy high ponytail sits sideways in the back seat of a dark luxury SUV. She wears a dark wool coat over a white silk blouse. Her face is tear-streaked with an anxious expression as she reaches one hand toward the viewer while clutching a blanket with the other. Through the tinted windows behind her, blurred city lights streak past. Soft amber interior lighting illuminates the cabin with shallow depth of field.\">\n\nEXAMPLE — Multiple Characters:\n<img prompt=\"A masterpiece in 1st person point of view. The camera is positioned from a bed, looking out over messy white bedsheets in the foreground. Three women stand at the foot of the bed. On the left is a rabbit girl kemonomimi with long blonde hair, long white rabbit ears, pale skin, and blue eyes. She wears a short frilly black and white French maid outfit with a maid headdress. Her hands are clasped nervously near her mouth. In the center stands a mature human woman with black hair in a tight bun, brown eyes, wearing a strict long black and white Victorian maid uniform with a high collar and long skirt. Her expression is serious and she holds a silver measuring tape in both hands. On the right is a demon girl with pale skin, short black hair, red eyes, and red oni horns. She wears a dark blue maid dress with a white apron. Her expression is stoic and she holds a pair of red velvet slippers. Behind them is a lavish bedroom with ornate furniture and a glowing crystal chandelier. Warm golden lighting fills the room with soft depth of field.\">",
        rulesIllusCinematic: "Build the prompt in this EXACT order. Do NOT rearrange sections.\n\n**SECTION 1 — Quality + Camera:**\nStart: masterpiece, best quality, highly detailed, cinematic composition,\nThen camera type (pick one):\n- Wide: wide shot, full body,\n- Medium: medium shot, upper body,\n- Close: close-up, face focus,\n- Dramatic: dutch angle, or low angle, or high angle,\n\n**SECTION 2 — Character Count:**\nBooru tag for visible characters: 1girl,, 2boys,, 1boy 1girl,, etc.\n\n**SECTION 3 — Character Descriptions (anti-bleed rules):**\n\nFOR SINGLE CHARACTER (1 person in frame):\nUse a flat comma-separated Booru tag string for appearance + action. Example:\nmature female, pale skin, dark eyes, long black hair, messy ponytail, dark wool coat, white silk blouse, tear-streaked face, anxious expression, sitting sideways, holding blanket, reaching toward viewer,\n\nFOR MULTIPLE CHARACTERS (2+ people in frame):\nYou MUST describe each character in a SEPARATE natural-language sentence/paragraph to prevent feature bleeding. Use Booru tags for appearance and clothing WITHIN each sentence, but separate characters with clear spatial language (\"on the left,\" \"in the center,\" \"behind her\").\n\nFormat per character: \"The [position] is a [gender/species] with [hair tags], [eye tags], [skin tags], wearing [clothing tags]. She has a [expression tag] and is [action/pose].\"\n\nEach character gets their OWN paragraph. Do NOT merge characters into one comma-separated list.\n\n**SECTION 4 — Scene + Lighting (always last):**\nEnd with background, lighting, atmosphere. Cinematic lighting tags: volumetric lighting, rim lighting, god rays, lens flare, dramatic shadows, backlighting, silhouette,\n\n**BANS:** No \"realistic\" or \"photographic\". No first-person POV tags in this template.",
        examplesIllusCinematic: "EXAMPLE — Single Character Cinematic:\n<img prompt=\"masterpiece, best quality, highly detailed, cinematic composition, low angle, full body, 1girl, young woman, dark skin, amber eyes, long white hair, loose waves, gold circlet on forehead, white draped toga, gold belt, bare feet, determined expression, standing on cliff edge, arms at sides, fists clenched, wind blowing hair and fabric, mountainous desert landscape, ancient ruins in background, golden hour sunlight, volumetric lighting, rim lighting, dramatic shadows, dust particles in air\">\n\nEXAMPLE — Multiple Characters Cinematic:\n<img prompt=\"masterpiece, best quality, highly detailed, cinematic composition, wide shot, 2girls, The figure on the left is a tall elf woman with long silver hair, pointed ears, pale skin, green eyes, wearing dark leather armor, hooded cloak pushed back. She has a cautious expression and is gripping a bow at her side. The figure on the right is a short dwarf woman with tan skin, brown eyes, thick red braided hair, wearing dented iron plate armor, fur-lined pauldrons. She has a grinning expression and is resting a warhammer over her shoulder. Rain-soaked cobblestone street, medieval town at night, glowing tavern windows in background, volumetric fog, rim lighting from streetlamp, puddle reflections, dramatic shadows\">",
        rulesSdxlCinematic: "Build the prompt in this EXACT order. Do NOT rearrange sections.\n\n1. **Natural Language Architecture:** Write the prompt as highly detailed, grammatically complete sentences. Use a masterpiece.\n2. **Camera & Composition:**\n   - Establish the camera angle, distance, and framing first (e.g., \"A cinematic wide shot from a low angle looking up at...\").\n   - Do NOT use first-person POV. Frame the scene as a film camera would.\n   - Specify shot type: wide shot, medium shot, close-up, over-the-shoulder, tracking shot, Dutch angle.\n3. **NPC Isolation & Details:** Dedicate a distinct sentence or paragraph to each character visible in the scene. You MUST explicitly describe their:\n   - Age bracket, gender, exact race/species\n   - Skin tone, eye color, hair length/style/color\n   - Specific clothing details\n   - Current facial expression, held items, and posture\n4. **Environment & Cinematic Lighting:** Describe the background setting in the final sentence. Emphasize cinematic lighting: volumetric light, rim lighting, god rays, lens flare, dramatic shadows, backlighting, silhouette, color grading.",
        examplesSdxlCinematic: "EXAMPLE — Single Character Cinematic:\n<img prompt=\"A cinematic masterpiece. A low-angle medium shot looking up at a young woman with dark skin, amber eyes, and long white hair blowing in the wind. She wears a white draped toga with a gold belt and a gold circlet on her forehead. Her expression is fierce and determined, fists clenched at her sides. She stands at the edge of a sandstone cliff overlooking a vast desert valley with crumbling ancient ruins below. Golden hour sunlight casts volumetric god rays through dust in the air, rim lighting outlines her figure, and dramatic long shadows stretch across the rock.\">\n\nEXAMPLE — Multiple Characters Cinematic:\n<img prompt=\"A cinematic masterpiece. A wide shot of a rain-soaked medieval cobblestone street at night. On the left stands a tall elf woman with long silver hair, pointed ears, pale skin, and green eyes. She wears dark leather armor under a hooded cloak pushed back from her face. Her expression is cautious, and she grips a longbow at her side. On the right stands a short, stocky dwarf woman with tan skin, brown eyes, and thick red hair in twin braids. She wears dented iron plate armor with fur-lined pauldrons and grins broadly, resting a heavy warhammer over her right shoulder. Behind them, warm orange light spills from tavern windows. Volumetric fog drifts through the street, rim lighting catches the rain, and puddles reflect the scene.\">",
        rulesIllusPortrait: "Build the prompt in this EXACT order. Do NOT rearrange sections.\n\n**SECTION 1 — Quality + Framing:**\nStart: masterpiece, best quality, highly detailed, portrait,\nThen framing (pick one):\n- upper body, (chest and up)\n- head and shoulders, (shoulders and up)\n- close up, face only, (face only)\n- full body, (Full body)\n\n**SECTION 2 — Character Count:**\nAlways 1girl, or 1boy, or 1other,.\n\n**SECTION 3 — Character Description:**\nFlat comma-separated Booru tag string covering ALL of:\n- Species/race, age bracket, body type\n- Skin tone, eye color and shape, hair color/length/style\n- Clothing and accessories visible in frame\n- Facial expression, head tilt, gaze direction\n- Any held items visible in frame\n\n**SECTION 4 — Background + Lighting (always last):**\nUse simple or abstract backgrounds: simple background, gradient background, dark background, blurred background,\nThen lighting: soft lighting, studio lighting, natural lighting, side lighting,\n\n**BANS:** No \"realistic\" or \"photographic\". No full-body shots. No complex scenes. One character only.",
        examplesIllusPortrait: "EXAMPLE — Character Portrait:\n<img prompt=\"masterpiece, best quality, highly detailed, portrait, upper body, 1girl, young woman, elf, pointed ears, pale skin, freckles across nose, bright green eyes, long auburn hair, loose side braid over left shoulder, small silver leaf earrings, wearing dark green wool tunic, brown leather vest, high collar, slight smile, head tilted slightly right, looking at viewer, holding a small glowing blue flower near her chin, blurred forest background, dappled natural lighting, soft focus\">",
        rulesSdxlPortrait: "Build the prompt in this EXACT order. Do NOT rearrange sections.\n\n1. **Natural Language Architecture:** Write the prompt as highly detailed, grammatically complete sentences. Use a masterpiece.\n2. **Framing:** Establish that this is a portrait. Specify the crop: upper body, head and shoulders, or face close-up, full body. One character only.\n3. **Character Details:** Dedicate the full body of the prompt to the single character. You MUST explicitly describe:\n   - Age bracket, gender, exact race/species\n   - Skin tone, distinguishing marks (scars, freckles, tattoos)\n   - Eye color and shape, hair length/style/color\n   - Visible clothing and accessories within the frame\n   - Facial expression, gaze direction, head angle\n   - Any held items near the face or upper body\n4. **Background & Lighting:** Use a simple, non-distracting background. Describe studio-style or natural portrait lighting in the final sentence.",
        examplesSdxlPortrait: "EXAMPLE — Character Portrait:\n<img prompt=\"A masterpiece portrait. An upper-body shot of a young elf woman with pale skin and a light dusting of freckles across her nose. She has bright green eyes and long auburn hair pulled into a loose side braid draped over her left shoulder. Small silver leaf-shaped earrings catch the light. She wears a dark green wool tunic under a fitted brown leather vest with a high collar. She holds a small glowing blue flower near her chin and smiles gently, her head tilted slightly to the right, looking directly at the viewer. The background is a soft blur of green forest. Dappled natural light filters through unseen canopy above, creating warm highlights on her hair and soft shadows under her jaw.\">"
    },
    memoryCore: {
        systemPrompt: "You are an expert narrative condenser. Your task is to read a chunk of chat history and summarize exactly what happened. Preserve important story details, but aggressively remove all 'purple prose' and flowery descriptions.\n\nFocus ONLY on impactful actions and meaningful dialogue:\n- Condense small talk (e.g., summarize a long, drawn-out greeting simply as 'He said hello').\n- Ignore trivial, unnecessary physical actions (e.g., grabbing a glass of water, shifting in a chair) unless they directly impact the story.\n- Do not quote dialogue directly; summarize the core point of the conversation.\n\nWrite a direct, clear narrative summary of what the characters did and what was communicated.\n\nCRITICAL: You must write the summary in {{targetLang}}.",
        userPrompt: "Summarize the impactful events and meaningful conversations from the following chat chunk. Strip out the purple prose and trivial actions.\n\n<chat>\n{{chatHistory}}\n</chat>\n\nOutput the summary in {{targetLang}}:",
        longTermTemplate: "[LONG-TERM MEMORY VAULT]\nThe following are raw archives of highly relevant past events. Use timestamps to prevent context collapse. Do not hallucinate them as currently happening.\n{{archiveXML}}",
        shortTermTemplate: "[SHORT-TERM MEMORY]\nRecent state extractions:\n{{shortXML}}"
    },
    npcBank: {
        systemPrompt: "You are an expert AI image prompt engineer specializing in character portraits. Your job is to read a character's dossier and convert their visual description into a highly detailed image generation prompt for a portrait. You must adhere to the requested Style Constraint and Camera Perspective. Do not include quotes, conversational text, or explanations. Output ONLY the raw prompt text.",
        userPrompt: "Write a character portrait image generation prompt based on this NPC's dossier:\n\n<npc_dossier>\n{{npcText}}\n</npc_dossier>\n\nStyle Constraint: {{styleStr}}\nCamera Perspective: {{perspStr}}\nExtra Details: {{extraStr}}\n\nUse the character's appearance, age, sex, occupation, and personality to inform the visual. Output ONLY the raw image prompt text.",
        thinkingPrompt: "<thinking_steps>\nBefore creating the response, think deeply.\n\nThoughts must be wrapped in <think></think>. The first token must be <think>. The main response must immediately follow </think>.\n\n<think>\nReflect in approximately 50-100 words on what this character looks like and what visual elements best capture them.\n\n</think>\n</thinking_steps>\n\n[OUTPUT ORDER]\n    Every response must follow this exact structure in this exact order:\n\n    <think>\n    {Thinking}\n    </think>\n\n    {Main response}",
        dossierTemplate: `<npc_dossier>\n  trigger: >\n    Generate EXACTLY ONCE when an NPC meets ALL three conditions in a single scene:\n      1. NAMED  — given a proper name or a name the PC will use again.\n      2. VOICED — speaks more than a transactional line (not "That'll be 5 credits").\n      3. STAKED — has a want, opinion, or role that can affect the story later.\n    DO NOT generate for: cashiers, bartenders, guards, crowds, one-line faces,\n    or anyone whose only function is set dressing.\n    NEVER regenerate for an NPC who already has a dossier.\n    treat the original dossier as locked canon.\n\n  format: >\n    Collapsible HTML details block. Dense, dashboard-style. No prose paragraphs\n    except the Background and Secrets fields. Everything else is fragments.\n\n  template: |\n    <details>\n    <summary>🆕 <b>New NPC: [Full Name]</b></summary>\n\n    **Name:** [Full name + nickname/alias] | **Age:** [#] | **Sex:** [M/F/Other] | **Orientation:** [if relevant to plot]\n    **Role:** [Specific current job or function in the scene]\n    **Where to Find Them:** [Default location / when they appear / how to reach them again]\n\n    **Appearance:** [2–3 sentences a reader can picture: build, face, hair, distinguishing marks, how they carry themselves.]\n\n    **Image Tags:** [Booru-style appearance tags — see image_tag_rule. Body & face only.]\n\n    **Voice:** [How they speak — cadence, accent, verbal tics, topics they dodge.]\n\n    **Background:** [3–5 sentences. Origin, how they got here, the event that shaped them. A life sketch, not a résumé. Include facts the PC may never learn.]\n\n    **Inner Circle:**\n    * [Name] — [Relationship] | [Age, status, current dynamic in one line]\n    * [Name] — [Relationship] | [Same format]\n    * [Name] — [Relationship] | [At least one the PC has not met and may never meet]\n\n    **Personality:**\n    * Defining traits: [2–3 contradictions shown as behavior, not labels]\n    * Core flaw: [The thing that gets them in trouble]\n    * Core fear: [What they protect against]\n    * Tell: [A physical/verbal tell when lying, nervous, or attracted]\n\n    **Read on the PC:** [What this NPC currently thinks of the player character + how that could shift]\n\n    **Current Agenda:** [Their main agenda in the story]\n\n    **Secrets (never narrated unless disclosed):**\n    * Tier 1 (semi-public): [Rumored or guessable with effort]\n    * Tier 2 (private): [Known only to inner circle]\n    * Tier 3 (buried): [The big one. Drives unpredictable behavior.]\n    * Reveal hook: [What event or pressure could surface these]\n\n    **Canon Lock:** [3–5 immutable facts that must never change across appearances — name, key relationships, defining marks, the buried secret.]\n\n    </details>\n\n  guidelines:\n    inner_circle_rule: >\n      Include 2–5 people. At least one must be off-screen and unknown to the\n      story (a mother, an ex, a childhood friend, a rival). These are future\n      plot seeds, not just flavor.\n    secrets_rule: >\n      Secrets are for YOU as the narrative engine. They drive behavior the PC\n      can't predict. Never reveal in narration unless the NPC actually discloses\n      them through action or dialogue. Higher tiers stay buried longer.\n    canon_lock_rule: >\n      Once written, these facts are fixed. Future scenes must stay consistent\n      with them. If a later scene needs a contradiction, surface it as a\n      revelation (the earlier info was a lie/misunderstanding), never a silent retcon.\n    image_tags: 12-20 comma-separated Booru tags. PHYSICAL ONLY. NO clothes/accessories/weapons/bg/pose/expression. MUST read as adult. Order: anchor(1girl/1boy/1other) -> hair(len,style,col) -> eyes(col,shape) -> skin tone -> body(type,build) -> age-app -> marks(scars,freckles,moles,tattoos,birthmarks).\n</npc_dossier>`
    }
};

// -------------------------------------------------------------
// STATE MANAGEMENT
// -------------------------------------------------------------
let currentTab = 0;
let localProfile = {};
let activeGenerationOrder = null;
let lastPromptPreviewTime = 0;
let activeMemorySummarizationRequest = null;
let activeBanListChat = null;
let activeImageGenRequest = null;
let activeStoryPlanRequest = null;
let activeNpcImages = [];
let isDevEngineDirty = false;
let activeNpcScanRequest = null;

function getCharacterKey() {
    const context = getContext();
    if (context.groupId !== undefined && context.groupId !== null) { return `group_${context.groupId}`; }
    if (context.characterId !== undefined && context.characterId !== null && context.characters[context.characterId]) { return context.characters[context.characterId].avatar; }
    return null;
}

function cleanGhostProfiles() {
    if (!extension_settings[extensionName] || !extension_settings[extensionName].profiles) return;

    const context = getContext();
    if (!context.characters || context.characters.length === 0) {
        return;
    }
    // Get all valid avatars and group IDs currently in SillyTavern
    const activeAvatars = Object.values(context.characters || {}).map(c => c.avatar);
    const activeGroups = (context.groups || []).map(g => `group_${g.id}`);
    const validKeys = ["default", ...activeAvatars, ...activeGroups];

    let deletedCount = 0;
    Object.keys(extension_settings[extensionName].profiles).forEach(key => {
        if (!validKeys.includes(key)) {
            delete extension_settings[extensionName].profiles[key];
            deletedCount++;
        }
    });

    if (deletedCount > 0) {
        saveSettingsDebounced();
        console.log(`[Megumin Suite] Garbage Collection: Cleaned up ${deletedCount} ghost profiles.`);
    }
}


function initProfile() {
    const key = getCharacterKey();
    const context = getContext();
    const isGroup = context.groupId !== undefined && context.groupId !== null;

    if (!extension_settings[extensionName]) extension_settings[extensionName] = { profiles: {} };
    if (!extension_settings[extensionName].profiles) extension_settings[extensionName].profiles = {};
    if (!extension_settings[extensionName].customModes) {
        extension_settings[extensionName].customModes = [];
    }

    const defaults = {
        mode: "balance",
        personality: "engine",
        toggles: { ooc: false, control: false },
        disableUtilityPrefill: false,
        aiTags: [],
        aiGeneratedOptions: [],
        aiRule: "",
        customStyles: [],
        activeStyleId: null,
        dnRatio: {
            enabled: false,
            dialogue: 50
        },
        onomatopoeia: {
            enabled: false,
            useStyling: false
        },
        addons: [],
        blocks: [],
        model: "cot-v1-english",
        userNotes: "",
        userWordCount: "",
        userWordCountType: "max",
        userLanguage: "",
        userPronouns: "off",
        userPov: "",
        devOverrides: {},
        banList: [],
        banListBackend: "direct",
        banListCustomPrompts: null,
        banListCustomPromptsEnabled: false,
        customModes: [],
        thinkEffort: "unspecified",
        customThinkEffort: "100",
        storyPlan: {
            enabled: false,
            backend: "direct",
            triggerMode: "manual",
            autoFreq: 10,
            currentPlan: "",
            customPrompts: null,
            customPromptsEnabled: false
        },
        imageGen: {
            enabled: false,
            generatorBackend: "direct",
            injectMode: "inline",
            imageCount: 1,
            comfyUrl: "http://127.0.0.1:8188",
            currentWorkflowName: "",
            selectedModel: "",
            selectedLora: "", selectedLora2: "", selectedLora3: "", selectedLora4: "",
            selectedLoraWt: 1.0, selectedLoraWt2: 1.0, selectedLoraWt3: 1.0, selectedLoraWt4: 1.0,
            imgWidth: 1024, imgHeight: 1024,
            customNegative: "bad quality, blurry, worst quality, low quality",
            customSeed: -1,
            selectedSampler: "euler",
            compressImages: true,
            steps: 20, cfg: 7.0, denoise: 0.5, clipSkip: 1,
            promptTemplate: "illus_cinematic",
            includeExamples: true,
            directLanguage: false,
            injectNpcTags: false,
            promptExtra: "",
            triggerMode: "always",
            autoGenFreq: 1,
            previewPrompt: false,
            savedWorkflowStates: {},
            customPrompts: null,
            customPromptsEnabled: false
        },
        memoryCore: {
            enabled: false,
            architecture: "raw_short_long", // "raw_short_long" or "raw_long"
            workingLimit: 30,
            shortTermLimit: 70,
            chunkSize: 10,
            backend: "direct",
            scannerEngine: "tfidf",
            triggerMode: "frequency",
            autoFreq: 10,
            shortTermChunks: [],
            longTermVault: [],
            customPrompts: null,
            customPromptsEnabled: false
        },
        npcBank: {
            enabled: false,
            oocTrigger: false,
            npcs: [],
            customPrompts: null,
            customPromptsEnabled: false,
            scanDepth: 60
        }
    };


    if (!extension_settings[extensionName].profiles["default"]) {
        extension_settings[extensionName].profiles["default"] = JSON.parse(JSON.stringify(defaults));
    }

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

    // PATCH missing keys
    Object.keys(defaults).forEach(k => {
        if (localProfile[k] === undefined) localProfile[k] = defaults[k];
    });
    if (!localProfile.toggles) localProfile.toggles = defaults.toggles;
    if (!localProfile.imageGen) localProfile.imageGen = defaults.imageGen;
    if (localProfile.imageGen.directLanguage === undefined) localProfile.imageGen.directLanguage = false;
    if (localProfile.imageGen.imageCount === undefined) localProfile.imageGen.imageCount = 1;
    if (localProfile.imageGen.promptStyle !== undefined) {
        let style = localProfile.imageGen.promptStyle; 
        let persp = localProfile.imageGen.promptPerspective;

        if (style === "standard") style = "sdxl"; // Fallback standard to sdxl

        if (style === "illustrious" && persp === "pov") localProfile.imageGen.promptTemplate = "illus_pov";
        else if (style === "illustrious" && persp === "character") localProfile.imageGen.promptTemplate = "illus_portrait";
        else if (style === "illustrious") localProfile.imageGen.promptTemplate = "illus_cinematic";
        else if (persp === "pov") localProfile.imageGen.promptTemplate = "sdxl_pov";
        else if (persp === "character") localProfile.imageGen.promptTemplate = "sdxl_portrait";
        else localProfile.imageGen.promptTemplate = "sdxl_cinematic";

        delete localProfile.imageGen.promptStyle;
        delete localProfile.imageGen.promptPerspective;
    }
    if (localProfile.imageGen.includeExamples === undefined) localProfile.imageGen.includeExamples = true;
    if (!localProfile.storyPlan) localProfile.storyPlan = defaults.storyPlan;
    if (localProfile.npcBank && localProfile.npcBank.scanDepth === undefined) localProfile.npcBank.scanDepth = 60;
    if (localProfile.banListCustomPromptsEnabled === undefined) localProfile.banListCustomPromptsEnabled = false;
    if (localProfile.imageGen.injectNpcTags === undefined) localProfile.imageGen.injectNpcTags = false;
    if (localProfile.userPov === undefined) localProfile.userPov = "";
    if (localProfile.storyPlan && localProfile.storyPlan.customPromptsEnabled === undefined) localProfile.storyPlan.customPromptsEnabled = false;
    if (localProfile.imageGen && localProfile.imageGen.customPromptsEnabled === undefined) localProfile.imageGen.customPromptsEnabled = false;
    if (localProfile.memoryCore && localProfile.memoryCore.customPromptsEnabled === undefined) localProfile.memoryCore.customPromptsEnabled = false;
    if (localProfile.npcBank && localProfile.npcBank.customPromptsEnabled === undefined) localProfile.npcBank.customPromptsEnabled = false;
    if (localProfile.npcBank && localProfile.npcBank.oocTrigger === undefined) localProfile.npcBank.oocTrigger = false;
    if (!localProfile.memoryCore) {
        localProfile.memoryCore = defaults.memoryCore;
    } else {
        if (localProfile.memoryCore.chunkSize === undefined) localProfile.memoryCore.chunkSize = 10;
    }
    if (!localProfile.dnRatio) localProfile.dnRatio = defaults.dnRatio;
    if (!localProfile.onomatopoeia) localProfile.onomatopoeia = defaults.onomatopoeia;
    if (localProfile.disableUtilityPrefill === undefined) localProfile.disableUtilityPrefill = false;
    if (!localProfile.userWordCountType) localProfile.userWordCountType = "max"; 

    if (localProfile.devOverrides && Object.keys(localProfile.devOverrides).length > 0) {
        localProfile.devOverrides = {};
        saveSettingsDebounced();
    }

    let displayName = "Global Default";
    if (isGroup) {
        if (context.groups && Array.isArray(context.groups)) {
            const group = context.groups.find(g => String(g.id) === String(context.groupId));
            if (group && group.name) displayName = group.name;
            else displayName = `Group Chat (${context.groupId})`;
        } else { displayName = "Group Chat"; }
    } else if (key && context.characterId !== undefined && context.characters[context.characterId]) {
        displayName = context.characters[context.characterId].name;
    }

    $("#ps_char_rule_label").text(displayName);
    toggleQuickGenButton();
    updateLiveTokenCount();
}

function saveProfileToMemory() {
    const key = getCharacterKey() || "default";
    const ruleBox = $("#ps_main_current_rule");
    if (ruleBox.length > 0) { localProfile.aiRule = ruleBox.val(); }

    // Invalidate the optimized archived-set cache when profile changes
    if (localProfile?.memoryCore) {
        localProfile.memoryCore._archivedSet = null;
    }

    extension_settings[extensionName].profiles[key] = localProfile;
    saveSettingsDebounced();

    updateLiveTokenCount(); // NEW: Update the UI whenever settings are saved!

    const saveInd = $("#ps_save_indicator");
    if (saveInd.length) {
        saveInd.html(`<i class="fa-solid fa-check"></i> Saved`).fadeIn(150);
        clearTimeout(window.psSaveTimer);
        window.psSaveTimer = setTimeout(() => saveInd.fadeOut(400), 2000);
    }
}

// NEW: Function to calculate and update the token UI with a Hover Breakdown
function updateLiveTokenCount() {
    const counterBadge = $("#ps_live_token_count");
    if (!counterBadge.length) return;

    const dict = buildBaseDict();

    let engineStr = "";
    let cotStr = "";
    let styleStr = "";
    let addonsStr = "";

    // Array of dynamic systems we do NOT want to count
    const excludeKeys = [
        "[[long-Memory]]", "[[Short-memory]]", 
        "[[npc list]]", "[[npc_dossier]]", "[[npc_dossier2]]",
        "[[img1]]", "[[img2]]",
        "[[storyplan]]", "[[storytracker]]", "[[storytracker2]]",
        "[[banlist]]"
    ];

    Object.entries(dict).forEach(([key, value]) => {
        if (!value) return;
        // Skip the single-bracket aliases to prevent double counting
        if (key.match(/^\[prompt[1-6]\]$/)) return;

        // Skip highly variable dynamic blocks
        if (excludeKeys.includes(key)) return;

        // Categorize the text using exact matches to prevent overlap
        if (key === "[[aiprompt]]" || key === "[[Language]]" || key === "[[pronouns]]" || key === "[[count]]" || key === "[[DNRATIO]]" || key === "[[onomato]]") {
            styleStr += value + " ";
        } else if (key === "[[COT]]" || key === "[[prefill]]" || key === "[[THINK]]") {
            cotStr += value + " ";
        } else if (key.match(/^\[\[prompt[1-6]\]\]$/) || key === "[[main]]" || key === "[[AI1]]" || key === "[[AI2]]") {
            engineStr += value + " ";
        } else {
            addonsStr += value + " ";
        }
    });

    // Estimate tokens (Adjusted to 4.8 chars per token to match modern, highly-efficient tokenizers)
    const estEngine = Math.ceil(engineStr.replace(/\s+/g, ' ').length / 4.8);
    const estCot = Math.ceil(cotStr.replace(/\s+/g, ' ').length / 4.8);
    const estStyle = Math.ceil(styleStr.replace(/\s+/g, ' ').length / 4.8);
    const estAddons = Math.ceil(addonsStr.replace(/\s+/g, ' ').length / 4.8);

    const total = estEngine + estCot + estStyle + estAddons;

    // Update the UI text
    counterBadge.html(`<i class="fa-solid fa-microchip"></i> ~${total}`);

    // Build the Hover Breakdown HTML
    const breakdownHTML = `
        <div style="text-align:left; min-width: 160px; font-family: 'Inter', sans-serif;">
            <div style="border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 6px; margin-bottom: 6px; color: var(--gold); font-size: 0.8rem;"><b>Payload Breakdown</b></div>
            <div style="display:flex; justify-content:space-between; font-size: 0.75rem; margin-bottom: 4px;"><span>Engine Core:</span> <span style="color:#10b981; font-weight:bold;">~${estEngine}</span></div>
            <div style="display:flex; justify-content:space-between; font-size: 0.75rem; margin-bottom: 4px;"><span>CoT / Logic:</span> <span style="color:#3b82f6; font-weight:bold;">~${estCot}</span></div>
            <div style="display:flex; justify-content:space-between; font-size: 0.75rem; margin-bottom: 4px;"><span>Writing Style:</span> <span style="color:#a855f7; font-weight:bold;">~${estStyle}</span></div>
            <div style="display:flex; justify-content:space-between; font-size: 0.75rem;"><span>Add-ons/Blocks:</span> <span style="color:#ef4444; font-weight:bold;">~${estAddons}</span></div>
        </div>
    `;

    // Attach it to the badge
    counterBadge.attr("data-breakdown", breakdownHTML);
    counterBadge.css("cursor", "help");

    // Flash green to show it updated
    counterBadge.css("color", "#10b981");
    setTimeout(() => {
        counterBadge.css("color", "var(--text-muted)");
    }, 400);
}

let defaultImageCount = 0;

async function discoverDefaultImages() {
    if (defaultImageCount > 0) return;
    let count = 0;
    for (let i = 1; i <= 20; i++) {
        try {
            const res = await fetch(`${extensionFolderPath}/img/default${i}.png`, { method: 'HEAD' });
            if (res.ok) count = i;
            else break;
        } catch { break; }
    }
    defaultImageCount = count;
}

function getRandomDefaultImage() {
    if (defaultImageCount <= 0) return `${extensionFolderPath}/img/default.png`;
    const pick = Math.floor(Math.random() * defaultImageCount) + 1;
    return `${extensionFolderPath}/img/default${pick}.png`;
}

function updateCharacterDisplay() {
    const context = getContext();
    const bannerElement = $("#ps_hero_banner");
    let imgUrl = getRandomDefaultImage();

    if (context.groupId !== undefined && context.groupId !== null) {
        imgUrl = `${extensionFolderPath}/img/group.png`;
    } else if (context.characterId !== undefined && context.characterId !== null && context.characters[context.characterId]) {
        imgUrl = `/characters/${context.characters[context.characterId].avatar}`;
    }

    // Set the full-width background image smoothly
    bannerElement.css("background-image", `url('${imgUrl}')`);
}

function cleanAIOutput(text) {
    if (!text) return "";
    const re = new RegExp("(<disclaimer>.*?</disclaimer>)|(<guifan>.*?</guifan>)|(<danmu>.*?</danmu>)|(<options>.*?</options>)|```start|```end|<done>|`<done>`|(.*?</think(ing)?>(\\n)?)|(<think(ing)?>[\\s\\S]*?</think(ing)?>(\\n)?)", "gs");
    return text.replace(re, "").trim();
}

// MASTER CHAT CLEANER: Removes Megumin UI blocks, thoughts, and raw HTML from chat text.
function meguminCleanChatHistoryText(text) {
    if (!text) return "";
    let cleaned = text;

    // 1. Remove Specific Megumin Suite Blocks (Inner Chatter, World State, CYOA, NPC Dossiers, Inline Images)
    cleaned = cleaned.replace(/<img[^>]*?alt=["']KazumaInline["'][^>]*?>/gi, "");
    cleaned = cleaned.replace(/<div[^>]*?title=["']KazumaFail\|[^>]*?>.*?<\/div>/gi, "");
    
    // Comprehensive Image Block Cleanup
    cleaned = cleaned.replace(/<img\s+[^>]*\/>|<div class="kazuma-img-placeholder"[^>]*>[\s\S]*?<\/div>|<!-- kazuma-inline-start:[^>]*-->[\s\S]*?<!-- kazuma-inline-end:[^>]*-->/gi, "");
    cleaned = cleaned.replace(/<details>\s*<summary>.*?💭.*?<b>NPC Inner Chatter<\/b><\/summary>\s*([\s\S]*?)\s*<\/details>/gi, "");
    cleaned = cleaned.replace(/<details>\s*<summary>.*?📌.*?<b>World State<\/b><\/summary>\s*([\s\S]*?)\s*<\/details>/gi, "");
    cleaned = cleaned.replace(/<details>\s*<summary>.*?🆕.*?<b>New NPC:.*?<\/b><\/summary>\s*([\s\S]*?)\s*<\/details>/gi, ""); // <-- NEW
    cleaned = cleaned.replace(/<div style="border: 1px solid #444;[\s\S]*?<\/div>/gi, "");

    // 2. Remove AI reasoning and artifacts (think, disclaimer, options, start/end)
    const badStuffRegex = /(<disclaimer>.*?<\/disclaimer>)|(<guifan>.*?<\/guifan>)|(<danmu>.*?<\/danmu>)|(<options>.*?<\/options>)|```start|```end|<done>|`<done>`|(.*?<\/(?:ksc??|think(?:ing)?)>(\n)?)|(<(?:ksc??|think(?:ing)?)>[\s\S]*?<\/(?:ksc??|think(?:ing)?)>(\n)?)/gs;
    cleaned = cleaned.replace(badStuffRegex, "");

    // 3. Remove leftover standard details/summary tags & HTML
    cleaned = cleaned.replace(/<details>[\s\S]*?<\/details>/gi, "");
    cleaned = cleaned.replace(/<summary>[\s\S]*?<\/summary>/gi, "");
    cleaned = cleaned.replace(/<[^>]*>?/gm, "");

    return cleaned.trim();
}

// -------------------------------------------------------------
// UI TAB RENDERER (Toolbox System)
// -------------------------------------------------------------
const tabsUI = [
    { title: "Core Engine", sub: "Choose the core ruleset that drives all NPC behavior and world logic.", icon: "fa-server", render: renderMode },
    { title: "Persona & Toggles", sub: "Define the personality and extra toggles.", icon: "fa-user-astronaut", render: renderPersonality },
    { title: "Writing Style", sub: "Apply a prebuilt style, generate one with AI, or build your own.", icon: "fa-pen-nib", render: renderStyleLibrary },
    { title: "Global Settings", sub: "Set response length, output language, and how the AI addresses you.", icon: "fa-earth-americas", render: renderAddons },
    { title: "Add-ons & Blocks", sub: "Attach extra modules that appear at the end of every response.", icon: "fa-puzzle-piece", render: renderBlocks },
    { title: "Chain of Thought", sub: "Control the AI's internal reasoning process before it writes.", icon: "fa-brain", render: renderModels },
    { title: "Story Planner", sub: "Generate and track future plot developments.", icon: "fa-map", render: renderStoryPlanner },
    { title: "Dynamic Ban List", sub: "Scan and ban repetitive AI phrases.", icon: "fa-ban", render: renderBanList },
    { title: "Image Generation", sub: "Wire up ComfyUI to auto-generate scene images during roleplay.", icon: "fa-image", render: renderImageGen },
    { title: "NPCs Bank", sub: "Automatically extract and track significant NPCs in the story.", icon: "fa-address-book", render: renderNpcBank },
    { title: "Memory Core", sub: "Advanced 3-Tier Context & History Management.", icon: "fa-memory", render: renderMemoryCore }
];

function switchTab(index) {
    $(".dock").show();
    $("#ps_btn_save_close").show();

    // Hide Apply All on Tab 3 (Writing Style)
    if (index === 2) { $("#btn_apply_tab_all").hide(); }
    else { $("#btn_apply_tab_all").show(); }

    $("#ps_btn_dev_mode").html(`<i class="fa-solid fa-code"></i> Dev`).css("color", "#a855f7");

    let isSameTab = (currentTab === index);
    const container = $("#ps_stage_content");
    let savedScroll = 0;
    if (isSameTab && container.length) {
        savedScroll = container.scrollTop() || 0;
    }

    currentTab = index;
    const tab = tabsUI[index];

    // Generate Icons
    const dotsContainer = $("#ps_dynamic_dots");
    if (dotsContainer.children(".dock-icon").length < tabsUI.length) {
        dotsContainer.empty();
        tabsUI.forEach((t, i) => {
            dotsContainer.append(`<div class="dock-icon sidebar-step" id="dot_${i}" title="${t.title}">
                <i class="fa-solid ${t.icon}"></i> <span>${t.title}</span>
            </div>`);
        });
    }

    $(".dock-icon").removeClass("active");
    $(`#dot_${index}`).addClass("active");

    container.empty();
    container.off(".devDirty");

    tab.render(container);

    if (isSameTab) {
        container.scrollTop(savedScroll);
    } else {
        container.scrollTop(0);
    }

    updateLiveTokenCount();
}

function applyTabToAll() {
    const tabKeys = {
        0: ["mode"],
        1: ["personality", "toggles"],
        2: ["activeStyleId", "aiRule", "customStyles", "dnRatio"],
        3: ["userWordCount", "userWordCountType", "userLanguage", "userPronouns", "disableUtilityPrefill", "onomatopoeia"],
        4: ["addons", "blocks"],
        5: ["model"],
        6: ["storyPlan"],
        7: ["banList"],
        8: ["imageGen"],
        9: ["memoryCore"]
    };

    const keysToSync = tabKeys[currentTab];
    if (confirm(`Apply ${tabsUI[currentTab].title} settings to ALL characters, groups, and defaults?`)) {
        const currentData = localProfile;
        Object.keys(extension_settings[extensionName].profiles).forEach(profKey => {
            const prof = extension_settings[extensionName].profiles[profKey];
            keysToSync.forEach(k => {
                prof[k] = JSON.parse(JSON.stringify(currentData[k]));
            });
        });
        saveSettingsDebounced();
        toastr.success(`Synced ${tabsUI[currentTab].title} across all profiles!`);
    }
}

function renderMode(c) {
    const descriptions = {
        "balance": "The original Secret Sauce. NPCs react naturally — no simping, no needless hostility.",
        "balance Test": "New and improved balance mode that aims to use less tokens and more creativity.",
        "cinematic": "Hollywood-inspired storytelling. Dramatic beats and heightened tension.",
        "dark": "Balance but harsher. The world is unforgiving and consequences hit harder.",
        "v6-anime-director": "Advanced cinematic framing and pacing. Designed to emulate high-budget anime direction.",
        "v6-dream-team": "The ultimate 6-specialist writer room. Unprecedented narrative consistency and realism.",
        "v6-dream-team-lite": "A streamlined version of the Dream Team. Faster generation with lower token overhead.",
        "v7-core": "The V7 Core engine. The perfect middle ground: cinematic pacing, realistic friction, and relentless world progression.",
        "v7-reality": "The V7 Reality engine. Grounded, unrelenting simulation with zero narrative protection.",
        "v7-gentle": "The V7 Gentle engine. A softer, For pussies.",
        "v7.5": "The Kismet engine. Focused purely on inescapable narrative momentum, pushing the story forward as the unseen author of fate.",
        "v8-m": "Unmatched in complex human psychology, authentic flawed dialogue, and autonomous, multi-layered story plotting.",
        "v8-lite": "A streamlined, highly efficient version of Obsidian. Retains the core rules of psychology, dialogue, and momentum with a much lighter token footprint.",
        "v8-fusion": "The absolute pinnacle of the Megumin Suite. A hybrid engine mixing V8 Obsidian's deep psychology with V6 Dream Team's specialist writer room framework."
    };

    // Active engine name
    const activeEng = hardcodedLogic.modes.find(m => m.id === localProfile.mode);
    const activeLabel = activeEng ? activeEng.label : localProfile.mode;

    // Count by version
    let v4Count = 0, v5Count = 0, v6Count = 0, v7Count = 0, v8Count = 0;
    hardcodedLogic.modes.forEach(m => {
        if (m.label.includes("V4")) v4Count++;
        else if (m.label.includes("V5")) v5Count++;
        else if (m.id.includes("v6")) v6Count++;
        else if (m.id.includes("v7")) v7Count++;
        else if (m.id.includes("v8")) v8Count++;
    });
    const totalCount = hardcodedLogic.modes.length;

    // ── HEADER ──
    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                    <i class="fa-solid fa-microchip"></i>
                </div>
                <div>
                    <h2>Core Engines</h2>
                    <p>Choose the narrative engine that drives your AI's behavior.</p>
                </div>
            </div>
            <div class="mtab-header-badge" style="background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.25);">
                <i class="fa-solid fa-circle-check" style="font-size:0.6rem;"></i> ${activeLabel}
            </div>
        </div>
    `);

    // ── FILTER PILLS ──
    const filterBar = $(`
        <div class="wstyle-filters" style="margin-bottom: 20px;">
            <button class="wstyle-filter-pill active" data-filter="all">All <span class="pill-count">${totalCount}</span></button>
            <button class="wstyle-filter-pill" data-filter="V4">V4 <span class="pill-count">${v4Count}</span></button>
            <button class="wstyle-filter-pill" data-filter="V5">V5 <span class="pill-count">${v5Count}</span></button>
            <button class="wstyle-filter-pill" data-filter="V6"><i class="fa-solid fa-lock" style="font-size:0.6rem;"></i> V6 <span class="pill-count">${v6Count}</span></button>
            <button class="wstyle-filter-pill" data-filter="V7">V7 <span class="pill-count">${v7Count}</span></button>
            <button class="wstyle-filter-pill" data-filter="V8">V8 <span class="pill-count">${v8Count}</span></button>
        </div>
    `);
    c.append(filterBar);

    // ── ENGINE CARDS ──
    const coreGrid = $(`<div class="mtab-card-grid" style="margin-bottom: 20px;"></div>`);
    const v6Empty = $(`<div id="v6-empty-msg" style="display:none;"><div class="mtab-locked-state"><i class="fa-solid fa-hammer" style="color: var(--border-color);"></i><h3>V6 Engines are in the forge.</h3><p>Stay tuned for the next update! Later this week.</p></div></div>`);

    hardcodedLogic.modes.forEach(m => {
        let version = "all";
        if (m.label.includes("V4")) version = "V4";
        else if (m.label.includes("V5")) version = "V5";
        else if (m.id.includes("v6")) version = "V6";
        else if (m.id.includes("v7")) version = "V7";
        else if (m.id.includes("v8")) version = "V8";

        const isLocked = m.locked === true;
        const isSel = localProfile.mode === m.id;

        let badges = '';
        if (m.recommended) badges += `<span class="ecard-badge rec"><i class="fa-solid fa-star"></i> Recommended</span>`;
        if (m.isNew && !isLocked) badges += `<span class="ecard-badge new">New</span>`;
        if (isLocked) badges += `<span class="ecard-badge locked"><i class="fa-solid fa-lock"></i> Coming Soon</span>`;

        const card = $(`
            <div class="mtab-eng-card ${isSel ? 'active' : ''} ${isLocked ? 'locked-card' : ''}" data-version="${version}">
                <div class="ecard-accent"></div>
                <div class="ecard-body">
                    <div class="ecard-title">
                        <span>${m.label}</span>
                        ${isSel ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> Active</span>` : ''}
                    </div>
                    <p class="ecard-desc">${descriptions[m.id] || ""}</p>
                    ${badges ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">${badges}</div>` : ''}
                </div>
            </div>
        `);

        if (!isLocked) {
            card.on("click", () => {
                localProfile.mode = m.id;

                // Specific style mapping for V7 Core, V7 Gentle vs other V7s
                if (m.id === "v7-core") {
                    localProfile.activeStyleId = "dir_v7_core";
                    const ds = hardcodedLogic.directStyles.find(x => x.id === "dir_v7_core");
                    if (ds) localProfile.aiRule = ds.rule;
                } else if (m.id === "v7-gentle") {
                    // ... (keep all the existing style mapping code) ...
                } else if (m.id.startsWith("v8")) {
                    localProfile.activeStyleId = "dir_v8";
                    const ds = hardcodedLogic.directStyles.find(x => x.id === "dir_v8");
                    if (ds) localProfile.aiRule = ds.rule;
                }

                // ==========================================
                // ADD THIS NEW BLOCK RIGHT HERE
                // ==========================================
                const currentLang = (localProfile.model && localProfile.model.includes("-")) ? localProfile.model.split('-').pop() : "english";
                let targetCotPrefix = null;
                
                if (m.id.includes("v6")) targetCotPrefix = "cot-v6";
                else if (m.id === "v7.5") targetCotPrefix = "cot-v7.5";
                else if (m.id.includes("v7")) targetCotPrefix = "cot-v7";
                else if (m.id.includes("v8")) targetCotPrefix = "cot-v8";
                
                if (targetCotPrefix) {
                    if (targetCotPrefix.includes("v7") || targetCotPrefix.includes("v8")) {
                        localProfile.model = `${targetCotPrefix}-english`;
                    } else {
                        localProfile.model = `${targetCotPrefix}-${currentLang}`;
                    }
                }
                // ==========================================

                saveProfileToMemory();
                switchTab(currentTab);
            });
        }
        coreGrid.append(card);
    });

    c.append(coreGrid);
    c.append(v6Empty);

    // ── FILTER LOGIC ──
    filterBar.find('.wstyle-filter-pill').on('click', function () {
        filterBar.find('.wstyle-filter-pill').removeClass('active');
        $(this).addClass('active');
        const filter = $(this).attr('data-filter');
        if (filter === "all") {
            coreGrid.show(); coreGrid.find('.mtab-eng-card').show(); v6Empty.hide();
        } else {
            coreGrid.find('.mtab-eng-card').each(function () {
                if ($(this).attr('data-version') === filter) $(this).show(); else $(this).hide();
            });
            coreGrid.show();
            if (filter === "V6") v6Empty.show(); else v6Empty.hide();
        }
    });

    // V7 Modules Toggles
    const activeEngineForToggles = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])].find(m => m.id === localProfile.mode);
    const isV7ForToggles = activeEngineForToggles ? (activeEngineForToggles.id.startsWith("v7") || activeEngineForToggles.isV7 === true) : false;
    if (isV7ForToggles) {
        c.append(`<div class="wstyle-section-head blue" style="margin-top: 15px;"><i class="fa-solid fa-layer-group"></i> V7 Modules (Turn off to disable)</div>`);
        const v7ToggleList = $(`<div class="mtab-card-list"></div>`);
        const v7Toggles = [
            { id: "v7_ooc", label: "OOC Protocol", desc: "Allows out-of-character directives." },
            { id: "v7_pcsolo", label: "PC Solo Physicality", desc: "Narration of PC when unobserved." },
            { id: "v7_intro", label: "Introduction Protocol", desc: "How new NPCs enter the story." },
            { id: "v7_culture", label: "Cultural Anchoring", desc: "Real-world integration and references." },
            { id: "v7_scene", label: "Scene Choreography", desc: "Focus shifting and crowd management." }
        ];

        v7Toggles.forEach(tog => {
            if (localProfile.toggles[tog.id] === undefined) localProfile.toggles[tog.id] = true;
            const isOn = localProfile.toggles[tog.id];

            const tCard = $(`
                <div class="mtab-toggle-row ${isOn ? 'active' : ''}">
                    <div class="toggle-info">
                        <div class="toggle-label">${tog.label}</div>
                        <div class="toggle-desc">${tog.desc}</div>
                    </div>
                    <div class="ps-switch"></div>
                </div>
            `);
            tCard.on("click", () => { localProfile.toggles[tog.id] = !localProfile.toggles[tog.id]; saveProfileToMemory(); switchTab(currentTab); });
            v7ToggleList.append(tCard);
        });
        c.append(v7ToggleList);
    }

    // ── CUSTOM ENGINES ──
    const customModes = extension_settings[extensionName].customModes || [];
    if (customModes.length > 0) {
        c.append(`<div class="wstyle-section-head green" style="margin-top:12px;"><i class="fa-solid fa-puzzle-piece"></i> Custom User Engines</div>`);
        const customGrid = $(`<div class="mtab-card-grid"></div>`);
        customModes.forEach(m => {
            const isSel = localProfile.mode === m.id;
            const card = $(`
                <div class="mtab-eng-card ${isSel ? 'active' : ''}">
                    <div class="ecard-accent"></div>
                    <div class="ecard-body">
                        <div class="ecard-title">
                            <span>${m.label}</span>
                            <button class="ps-modern-btn secondary btn-quick-edit" style="padding:4px 10px;font-size:0.7rem;color:var(--gold);border-color:rgba(245,158,11,0.3);background:transparent;">
                                <i class="fa-solid fa-pen"></i> Edit
                            </button>
                        </div>
                        <p class="ecard-desc">Custom Engine Flow</p>
                    </div>
                </div>
            `);
            card.on("click", (e) => {
                if ($(e.target).closest('.btn-quick-edit').length) return;
                localProfile.mode = m.id; saveProfileToMemory(); switchTab(currentTab);
            });
            card.find(".btn-quick-edit").on("click", () => renderDevMode("editor", m.id, null, "tab"));
            customGrid.append(card);
        });
        c.append(customGrid);
    }
}

function renderPersonality(c) {
    const isV6DreamTeam = localProfile.mode.includes("v6-dream-team");
    const activeEngineForPersona = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])].find(m => m.id === localProfile.mode);
    const isV7 = activeEngineForPersona ? (activeEngineForPersona.id.startsWith("v7") || activeEngineForPersona.isV7 === true) : false;
    const isV8 = activeEngineForPersona ? (activeEngineForPersona.id.startsWith("v8") || activeEngineForPersona.isV8 === true) : false;
    const isLockedPersona = isV6DreamTeam || isV7 || isV8;

    // ── HEADER ──
    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #ec4899, #be185d);">
                    <i class="fa-solid fa-masks-theater"></i>
                </div>
                <div>
                    <h2>Persona & Toggles</h2>
                    <p>Set the narrator's voice and fine‑tune engine behavior.</p>
                </div>
            </div>
            <div class="mtab-header-badge" style="background: rgba(236,72,153,0.12); color: #ec4899; border: 1px solid rgba(236,72,153,0.25);">
                <i class="fa-solid fa-user" style="font-size:0.6rem;"></i> ${isLockedPersona ? 'Locked' : localProfile.personality}
            </div>
        </div>
    `);

    if (isV8) {
        c.append(`
            <div class="mtab-locked-state">
                <i class="fa-solid fa-user-lock" style="color: #f59e0b;"></i>
                <h3>Persona & Toggles Locked</h3>
                <p>The V8 engine manages its own internal persona and strictly enforces narrative toggles natively. Standard injections are completely disabled.</p>
            </div>
        `);
        return;
    } else if (isV6DreamTeam) {
        c.append(`
            <div class="mtab-locked-state">
                <i class="fa-solid fa-user-lock" style="color: #a855f7;"></i>
                <h3>Persona Selection Locked</h3>
                <p>The V6 Dream Team engine utilizes an intrinsic 6-specialist framework. Standard persona injections are disabled to prevent logic conflicts.</p>
            </div>
        `);
    } else if (isV7) {
        c.append(`
            <div class="mtab-locked-state">
                <i class="fa-solid fa-user-lock" style="color: #3b82f6;"></i>
                <h3>Persona Selection Locked</h3>
                <p>The V7 engine utilizes a pure narrative framework. Standard persona injections are disabled to prevent logic conflicts.</p>
            </div>
        `);
    } else {
        const descriptions = {
            "megumin": "A rebellious, dominant voice. Adds an edge of arrogance and chaos to the narration. Best for energetic or confrontational stories.",
            "director": "Professional narrator. Clean, authoritative story direction with cinematic awareness.",
            "Nora": "Nora should i say more.",
            "engine": "No personality overlay at all. The engine speaks in its purest form — precise, neutral, and fully under your control. Recommended for most setups."
        };

        c.append(`<div class="wstyle-section-head purple"><i class="fa-solid fa-masks-theater"></i> Select Persona</div>`);
        const grid = $(`<div class="mtab-card-grid" style="margin-bottom: 24px;"></div>`);
        hardcodedLogic.personalities.forEach(p => {
            const isSel = localProfile.personality === p.id;
            let badges = '';
            if (p.recommended) badges = `<span class="ecard-badge rec"><i class="fa-solid fa-star"></i> Recommended</span>`;

            const card = $(`
                <div class="mtab-eng-card ${isSel ? 'active' : ''}">
                    <div class="ecard-accent"></div>
                    <div class="ecard-body">
                        <div class="ecard-title">
                            <span>${p.label}</span>
                            ${isSel ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> Active</span>` : ''}
                        </div>
                        <p class="ecard-desc">${descriptions[p.id] || ""}</p>
                        ${badges ? `<div style="margin-top:4px;">${badges}</div>` : ''}
                    </div>
                </div>
            `);
            card.on("click", () => { localProfile.personality = p.id; saveProfileToMemory(); switchTab(currentTab); });
            grid.append(card);
        });
        c.append(grid);
    }

    // EXTRA TOGGLES (Always available)
    c.append(`<div class="wstyle-section-head gold"><i class="fa-solid fa-sliders"></i> Extra Toggles</div>`);
    const toggleList = $(`<div class="mtab-card-list"></div>`);
    Object.entries(hardcodedLogic.toggles).forEach(([key, tog]) => {
        const isOn = localProfile.toggles[key];
        const tCard = $(`
            <div class="mtab-toggle-row ${isOn ? 'active' : ''}">
                <div class="toggle-info">
                    <div class="toggle-label">${tog.label}</div>
                    ${tog.recommendedOff ? `<div class="toggle-desc"><i class="fa-solid fa-star" style="color:var(--gold);font-size:0.6rem;margin-right:4px;"></i> Off by default — most engines handle this natively</div>` : ''}
                </div>
                <div class="ps-switch"></div>
            </div>
        `);
        tCard.on("click", () => { localProfile.toggles[key] = !localProfile.toggles[key]; saveProfileToMemory(); switchTab(currentTab); });
        toggleList.append(tCard);
    });
    c.append(toggleList);
}

function renderStyleLibrary(c) {
    c.empty();
    const root = $(`<div style="display: flex; flex-direction: column; height: 100%;"></div>`);

    const activeEngineForStyle = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])].find(m => m.id === localProfile.mode);
    const isV7ForStyle = activeEngineForStyle ? (activeEngineForStyle.id.startsWith("v7") || activeEngineForStyle.isV7 === true) : false;
    const isV8ForStyle = activeEngineForStyle ? (activeEngineForStyle.id.startsWith("v8") || activeEngineForStyle.isV8 === true) : false;
    const isLockedStyleEngine = isV7ForStyle || isV8ForStyle;

    if (isLockedStyleEngine && !localProfile.activeStyleId) {
        let targetStyle = "dir_v7";
        if (localProfile.mode === "v7-core") targetStyle = "dir_v7_core";
        else if (localProfile.mode === "v7-gentle") targetStyle = "dir_v7_gentle";
        else if (localProfile.mode === "v7.5") targetStyle = "dir_v7.5";
        else if (isV8ForStyle) targetStyle = "dir_v8";

        localProfile.activeStyleId = targetStyle;
        const ds = hardcodedLogic.directStyles.find(x => x.id === targetStyle);
        if (ds) localProfile.aiRule = ds.rule;
        saveProfileToMemory();
    }

    const isOff = !localProfile.activeStyleId;
    const customCount = (localProfile.customStyles || []).length;
    const existingNames = localProfile.customStyles ? localProfile.customStyles.map(s => s.name) : [];
    const genCount = hardcodedLogic.styleTemplates.filter(t => !existingNames.includes(t.name)).length;
    const precookedCount = hardcodedLogic.directStyles.length;

    let activeStyleName = "Off";
    if (!isOff) {
        const ds = hardcodedLogic.directStyles.find(d => d.id === localProfile.activeStyleId);
        if (ds) activeStyleName = ds.name;
        else {
            const cs = (localProfile.customStyles || []).find(s => s.id === localProfile.activeStyleId);
            if (cs) activeStyleName = cs.name;
        }
    }

    // ── HEADER ──
    root.append(`
        <div class="wstyle-header">
            <div class="wstyle-header-left">
                <div class="wstyle-header-icon"><i class="fa-solid fa-pen-nib"></i></div>
                <div>
                    <h2>Writing Style</h2>
                    <p>Apply a prebuilt style, generate one with AI, or craft your own.</p>
                </div>
            </div>
            <div class="wstyle-active-badge ${isOff ? 'off' : ''}">
                <i class="fa-solid ${isOff ? 'fa-power-off' : 'fa-circle-check'}"></i>
                ${isOff ? 'No Style Active' : activeStyleName}
            </div>
        </div>
    `);

    // ── TWO COLUMN LAYOUT ──
    const layout = $(`<div class="ws-layout"></div>`);
    const sidebar = $(`<div class="ws-sidebar"></div>`);
    const mainArea = $(`<div class="ws-main"></div>`);

    // --- BUILD SIDEBAR ---
    sidebar.append(`<div class="ws-sidebar-title">Library Navigation</div>`);
    
    // Off Button
    const btnOff = $(`<button class="ws-nav-btn ${isOff ? 'active-green' : ''}"><span style="display:flex; align-items:center; gap:10px;"><i class="fa-solid fa-power-off" style="color:${isLockedStyleEngine ? '#ef4444' : ''}"></i> No Style (Off)</span> ${isLockedStyleEngine ? '<i class="fa-solid fa-lock" style="color:#ef4444; font-size:0.7rem;"></i>' : ''}</button>`);
    if (!isLockedStyleEngine) {
        btnOff.on("click", () => { localProfile.activeStyleId = null; localProfile.aiRule = ""; saveProfileToMemory(); renderStyleLibrary(c); });
    } else {
        btnOff.css({"opacity":"0.6", "cursor":"not-allowed"}).attr("title", "Modern Engines require a narrative style directive.");
    }
    sidebar.append(btnOff);
    sidebar.append(`<div style="height: 1px; background: var(--border-color); margin: 8px 0;"></div>`);

    // Nav Buttons
    const btnPrecooked = $(`<button class="ws-nav-btn active"><span style="display:flex; align-items:center; gap:10px;"><i class="fa-solid fa-fire-burner"></i> Precooked</span> <span class="ws-badge">${precookedCount}</span></button>`);
    const btnCustom = $(`<button class="ws-nav-btn"><span style="display:flex; align-items:center; gap:10px;"><i class="fa-solid fa-book"></i> My Library</span> <span class="ws-badge">${customCount}</span></button>`);
    const btnGenerators = $(`<button class="ws-nav-btn"><span style="display:flex; align-items:center; gap:10px;"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Generators</span> <span class="ws-badge">${genCount}</span></button>`);

    sidebar.append(btnPrecooked).append(btnCustom).append(btnGenerators);

    // DN Ratio Integrated into Sidebar Bottom
    if (!localProfile.dnRatio) localProfile.dnRatio = { enabled: false, dialogue: 50 };
    const isDNR = localProfile.dnRatio.enabled;
    const dVal = localProfile.dnRatio.dialogue;

    const dnPanel = $(`
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-main);"><i class="fa-solid fa-scale-balanced" style="color: #3b82f6; margin-right: 5px;"></i> DN Ratio</span>
                <div class="ps-toggle-card ${isDNR ? 'active' : ''}" id="dnr_toggle_sb" style="padding: 2px; min-width: 36px; background: transparent; border-color: ${isDNR ? '#10b981' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;">
                    <div class="ps-switch" style="transform: scale(0.65); ${isDNR ? 'background: #10b981;' : ''}"></div>
                </div>
            </div>
            <div id="dnr_body_sb" style="display: ${isDNR ? 'block' : 'none'};">
                <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 8px; border: 1px solid var(--border-color);">
                    <span style="font-size: 0.65rem; font-weight:bold; color: #a855f7; width:25px; text-align:right;"><span id="lbl_narr">${100 - dVal}</span>%</span>
                    <input type="range" id="dnr_slider" min="0" max="100" step="10" value="${dVal}" style="flex: 1; accent-color: var(--gold); height: 4px;">
                    <span style="font-size: 0.65rem; font-weight:bold; color: #10b981; width:25px;"><span id="lbl_dial">${dVal}</span>%</span>
                </div>
            </div>
        </div>
    `);

    dnPanel.find("#dnr_toggle_sb").on("click", function (e) {
        e.stopPropagation(); localProfile.dnRatio.enabled = !localProfile.dnRatio.enabled; saveProfileToMemory(); renderStyleLibrary(c);
    });
    dnPanel.find("#dnr_slider").on("input", function () {
        let d = parseInt($(this).val()); let n = 100 - d;
        $("#lbl_dial").text(d); $("#lbl_narr").text(n);
    });
    dnPanel.find("#dnr_slider").on("change", function () {
        localProfile.dnRatio.dialogue = parseInt($(this).val()); saveProfileToMemory();
    });
    sidebar.append(dnPanel);
    // POV Selection Dropdown
    const povPanel = $(`
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color);">
            <div style="margin-bottom: 8px;">
                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-main);"><i class="fa-solid fa-eye" style="color: #a855f7; margin-right: 5px;"></i> Point of View</span>
            </div>
            <select id="ws_pov_select" class="ps-modern-input" style="padding: 6px; font-size: 0.75rem; cursor: pointer;">
                <option value="" ${!localProfile.userPov ? 'selected' : ''}>Engine Default</option>
                <option value="First-Person (I/me)" ${localProfile.userPov === 'First-Person (I/me)' ? 'selected' : ''}>First-Person (I/me)</option>
                <option value="Second-Person (You)" ${localProfile.userPov === 'Second-Person (You)' ? 'selected' : ''}>Second-Person (You)</option>
                <option value="Third-Person Limited" ${localProfile.userPov === 'Third-Person Limited' ? 'selected' : ''}>Third-Person Limited</option>
                <option value="Third-Person Omniscient" ${localProfile.userPov === 'Third-Person Omniscient' ? 'selected' : ''}>Third-Person Omniscient</option>
            </select>
            <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 5px;">Injects POV into Precooked Styles only.</div>
        </div>
    `);

    povPanel.find("#ws_pov_select").on("change", function () {
        localProfile.userPov = $(this).val(); 
        saveProfileToMemory(); 
    });
    sidebar.append(povPanel);
    layout.append(sidebar);

    // --- BUILD MAIN CONTENT SECTIONS ---
    const secPrecooked = $(`<div class="ws-section" id="sec-precooked"></div>`);
    const secCustom = $(`<div class="ws-section" id="sec-custom" style="display:none;"></div>`);
    const secGenerators = $(`<div class="ws-section" id="sec-generators" style="display:none;"></div>`);

    // A. PRECOOKED
    secPrecooked.append(`<h3 style="margin-top: 0; color: var(--gold); font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;"><i class="fa-solid fa-fire-burner"></i> Precooked Styles</h3>`);
    const gridPre = $(`<div class="ws-grid"></div>`);
    hardcodedLogic.directStyles.forEach(ds => {
        const isSel = localProfile.activeStyleId === ds.id;
        const card = $(`
            <div class="ws-card ${isSel ? 'active' : ''}">
                <div class="ws-card-title">
                    <span style="color:${isSel ? '#10b981' : 'var(--text-main)'};">${ds.name}</span>
                    ${isSel ? '<i class="fa-solid fa-check" style="color:#10b981;"></i>' : ''}
                </div>
                <div class="ws-card-desc">${ds.desc}</div>
                <div class="ws-card-rule">${ds.rule}</div>
            </div>
        `);
        card.on("click", () => { localProfile.activeStyleId = ds.id; localProfile.aiRule = ds.rule; saveProfileToMemory(); renderStyleLibrary(c); });
        gridPre.append(card);
    });
    secPrecooked.append(gridPre);

    // B. CUSTOM
    secCustom.append(`<h3 style="margin-top: 0; color: #10b981; font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;"><i class="fa-solid fa-book"></i> My Library</h3>`);
    const gridCust = $(`<div class="ws-grid"></div>`);
    
    const createCard = $(`
        <div class="ws-card" style="border: 1px dashed rgba(16,185,129,0.5); background: transparent; justify-content: center; align-items: center; min-height: 120px;">
            <div style="color: #10b981; font-weight: 700; font-size: 0.9rem;"><i class="fa-solid fa-plus"></i> Create New Style</div>
        </div>
    `);
    createCard.on("click", () => renderStyleEditor(c, null));
    gridCust.append(createCard);

    if (localProfile.customStyles && localProfile.customStyles.length > 0) {
        localProfile.customStyles.forEach(style => {
            const isSel = localProfile.activeStyleId === style.id;
            const card = $(`
                <div class="ws-card ${isSel ? 'active' : ''}">
                    <div class="ws-card-title">
                        <span style="color:${isSel ? '#10b981' : 'var(--text-main)'};">${style.name}</span>
                        ${isSel ? '<i class="fa-solid fa-check" style="color:#10b981;"></i>' : ''}
                    </div>
                    <div class="ws-card-desc" style="max-height: 40px; overflow: hidden;">${style.notes || "Custom AI generated style."}</div>
                    <div class="ws-card-actions">
                        <button class="ws-btn-small ps-btn-edit"><i class="fa-solid fa-pen"></i> Edit</button>
                        <button class="ws-btn-small ps-btn-regen" style="color: var(--gold); border-color: rgba(245,158,11,0.3);"><i class="fa-solid fa-rotate-right"></i></button>
                        <button class="ws-btn-small ps-btn-delete" style="color: #ef4444; border-color: rgba(239,68,68,0.3);"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `);
            card.on("click", (e) => {
                if ($(e.target).closest("button").length) return;
                localProfile.activeStyleId = style.id; localProfile.aiRule = style.rule; saveProfileToMemory(); renderStyleLibrary(c);
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
                    saveProfileToMemory(); renderStyleLibrary(c); toastr.success("Rule Regenerated!");
                });
            });
            gridCust.append(card);
        });
    }
    secCustom.append(gridCust);

    // C. GENERATORS
    secGenerators.append(`<h3 style="margin-top: 0; color: #a855f7; font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Generators</h3>`);
    const gridGen = $(`<div class="ws-grid"></div>`);
    hardcodedLogic.styleTemplates.forEach(tpl => {
        if (existingNames.includes(tpl.name)) return;
        const card = $(`
            <div class="ws-card" style="border-style: dashed; border-color: rgba(168,85,247,0.4); background: rgba(168,85,247,0.02);">
                <div class="ws-card-title" style="color: #c084fc;">${tpl.name}</div>
                <div class="ws-card-desc">${tpl.notes}</div>
                <button class="ws-btn-small ps-btn-tpl-gen" style="margin-top: 12px; width: 100%; background: rgba(168,85,247,0.1); color: #c084fc; border-color: #a855f7;">
                    <i class="fa-solid fa-bolt"></i> Generate This Style
                </button>
            </div>
        `);
        card.find(".ps-btn-tpl-gen").on("click", async function () {
            const btn = $(this); btn.prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Generating...`);
            await useMeguminEngine(async () => {
                const orderText = `Inspired by ${tpl.notes}. Write a writing style rule based on: ${tpl.tags.join(", ")}. Direct instructions only. 2-3 paragraphs. No fluff.`;
                let rule = await runMeguminTask(orderText);
                const newId = "style_" + Date.now();
                const newStyle = { id: newId, name: tpl.name, tags: [...tpl.tags], notes: tpl.notes, rule: cleanAIOutput(rule).trim() };
                localProfile.customStyles.push(newStyle); localProfile.activeStyleId = newId; localProfile.aiRule = newStyle.rule;
                saveProfileToMemory(); renderStyleLibrary(c); toastr.success(`${tpl.name} Added!`);
            });
        });
        gridGen.append(card);
    });
    secGenerators.append(gridGen);

    mainArea.append(secPrecooked).append(secCustom).append(secGenerators);
    layout.append(mainArea);
    root.append(layout);
    c.append(root);

    // ── NAVIGATION LOGIC ──
    const navButtons = [btnPrecooked, btnCustom, btnGenerators];
    const sections = [secPrecooked, secCustom, secGenerators];

    const switchSection = (index) => {
        navButtons.forEach((btn, i) => {
            if (i === index) btn.addClass('active');
            else btn.removeClass('active');
        });
        sections.forEach((sec, i) => {
            if (i === index) sec.show();
            else sec.hide();
        });
    };

    btnPrecooked.on('click', () => switchSection(0));
    btnCustom.on('click', () => switchSection(1));
    btnGenerators.on('click', () => switchSection(2));

    // Smart logic: If user is actively using a custom style, open on the "My Library" tab automatically
    if (localProfile.activeStyleId && localProfile.activeStyleId.startsWith("style_")) {
        switchSection(1);
    }
}

function renderStyleEditor(c, editId, presetData = null) {

    let currentStyle = presetData ? presetData : (editId ? JSON.parse(JSON.stringify(localProfile.customStyles.find(s => s.id === editId))) : {
        id: "style_" + Date.now(), name: "", tags: [], generatedOptions: [], notes: "", rule: ""
    });

    c.empty();
    let templateOptions = `<option value="" disabled selected>✨ Load a Pre-configured Template...</option>`;
    if (hardcodedLogic.styleTemplates) {
        hardcodedLogic.styleTemplates.forEach((tpl, index) => { templateOptions += `<option value="${index}">${tpl.name}</option>`; });
    }

    // ── TEMPLATE DROPDOWN ──
    c.append(`
        <div style="margin-bottom: 16px;">
            <select id="ps_style_template_dropdown" class="ps-modern-input" style="font-weight: 600; color: var(--gold); border-color: rgba(245,158,11,0.3); cursor: pointer;">${templateOptions}</select>
        </div>
    `);

    // ── EDITOR TOP BAR ──
    c.append(`
        <div class="wstyle-editor-bar">
            <i class="fa-solid fa-pen-nib" style="color: #a855f7; font-size: 1.1rem;"></i>
            <input type="text" id="ps_style_name" value="${currentStyle.name}" placeholder="Name your style…" />
            <button id="ps_btn_save_style" class="ps-modern-btn primary" style="background: #10b981; color: #fff; padding: 8px 18px; white-space: nowrap;">
                <i class="fa-solid fa-floppy-disk"></i> Save
            </button>
            <button id="ps_btn_cancel_style" class="ps-modern-btn secondary" style="color: var(--text-muted); padding: 8px 18px; white-space: nowrap;">
                <i class="fa-solid fa-arrow-left"></i> Back
            </button>
        </div>
    `);

    // ── TEMPLATE CHANGE ──
    $("#ps_style_template_dropdown").on("change", function () {
        const tplIndex = $(this).val(); if (tplIndex === null) return;
        const chosenTpl = hardcodedLogic.styleTemplates[tplIndex];
        currentStyle.name = chosenTpl.name; currentStyle.tags = [...chosenTpl.tags]; currentStyle.notes = chosenTpl.notes; currentStyle.rule = ""; currentStyle.generatedOptions = [];
        renderStyleEditor(c, editId, currentStyle); toastr.info(`${chosenTpl.name} loaded!`);
    });

    // ── TAG CATEGORIES ──
    const tagContainer = $(`<div class="wstyle-tag-section"></div>`);
    hardcodedLogic.styles.forEach(cat => {
        const catWrap = $(`<div style="margin-bottom: 18px;"></div>`);
        catWrap.append(`<div class="wstyle-tag-cat-title">${cat.category}</div>`);
        const grid = $(`<div class="wstyle-tag-grid"></div>`);
        cat.tags.forEach(tagObj => {
            const tagName = tagObj.id; const isSel = currentStyle.tags.includes(tagName);
            const tEl = $(`<span class="wstyle-tag ${isSel ? 'selected' : ''}" data-hint="${tagObj.hint}">${tagName}</span>`);
            tEl.on("click", () => {
                if (currentStyle.tags.includes(tagName)) currentStyle.tags = currentStyle.tags.filter(t => t !== tagName); else currentStyle.tags.push(tagName);
                tEl.toggleClass("selected");
            }); grid.append(tEl);
        }); catWrap.append(grid); tagContainer.append(catWrap);
    }); c.append(tagContainer);

    // ── AI INSIGHTS PANEL ──
    c.append(`
        <div class="wstyle-insights-panel">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-sparkles" style="color: var(--gold); font-size: 0.9rem;"></i>
                    <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">AI Author Matches</span>
                </div>
                <button id="ps_btn_get_authors_style" class="ps-modern-btn secondary" style="padding: 6px 14px; font-size: 0.73rem;">
                    <i class="fa-solid fa-lightbulb"></i> Generate Insights
                </button>
            </div>
            <div id="ps_ai_author_box_style" class="wstyle-tag-grid" style="min-height: 20px; margin-bottom: 14px;"></div>
            <div style="border-top: 1px dashed var(--border-color); padding-top: 14px;">
                <input type="text" id="ps_style_notes" class="ps-modern-input" placeholder="Custom directives or inspiration notes…" value="${currentStyle.notes || ''}" />
            </div>
        </div>
    `);

    // ── FINAL RULE PANEL ──
    c.append(`
        <div class="wstyle-rule-panel">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-scroll" style="color: #a855f7; font-size: 0.85rem;"></i>
                    <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">Generated Rule</span>
                </div>
                <button id="ps_btn_generate_style" class="wstyle-gen-btn" style="padding: 8px 18px; font-size: 0.78rem;">
                    <i class="fa-solid fa-bolt"></i> Generate Writing Rule
                </button>
            </div>
            <textarea id="ps_style_rule_text" placeholder="Select tags above and click Generate…">${currentStyle.rule || ''}</textarea>
            <div class="wstyle-info-callout">
                <i class="fa-solid fa-circle-info"></i>
                <span>After generating or editing your rule, hit <strong>Save</strong> in the toolbar above to apply it to your library.</span>
            </div>
        </div>
    `);

    // ── INSIGHTS RENDERING ──
    const renderInsights = () => {
        const box = $("#ps_ai_author_box_style"); box.empty();
        (currentStyle.generatedOptions || []).forEach(tag => {
            const isSel = currentStyle.tags.includes(tag);
            const tEl = $(`<span class="wstyle-tag ${isSel ? 'selected' : ''}">${tag.replace(" ✨", "")} <i class="fa-solid fa-sparkles" style="font-size:0.55rem; margin-left:3px; color:var(--gold);"></i></span>`);
            tEl.on("click", () => {
                if (isSel) currentStyle.tags = currentStyle.tags.filter(t => t !== tag); else currentStyle.tags.push(tag);
                tEl.toggleClass("selected");
            }); box.append(tEl);
        });
    };
    renderInsights();

    // ── EVENT BINDINGS ──
    $("#ps_style_notes").on("input", function () { currentStyle.notes = $(this).val(); });
    $("#ps_style_rule_text").on("input", function () { currentStyle.rule = $(this).val(); });
    $("#ps_style_name").on("input", function () { currentStyle.name = $(this).val(); });

    $("#ps_btn_cancel_style").on("click", () => renderStyleLibrary(c));
    $("#ps_btn_save_style").on("click", () => {
        if (currentStyle.name.trim() === "") currentStyle.name = "Unnamed Style";
        if (!editId) { localProfile.customStyles.push(currentStyle); }
        else { const idx = localProfile.customStyles.findIndex(s => s.id === editId); if (idx > -1) localProfile.customStyles[idx] = currentStyle; }
        if (localProfile.activeStyleId === currentStyle.id) { localProfile.aiRule = currentStyle.rule; }
        saveProfileToMemory(); renderStyleLibrary(c); toastr.success(`Saved "${currentStyle.name}"`);
    });

    $("#ps_btn_get_authors_style").on("click", async function () {
        if (!getCharacterKey()) return toastr.warning("Open a chat or group first so I can read the context!");
        $(this).prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Brainstorming...`);
        await useMeguminEngine(async () => {
            const orderText = `Based on the active characters and scenario, give me EXACTLY 2 famous author names or literary writing styles (e.g. Edgar Allan Poe, Jane Austen style, Dark Fantasy Author) and 5 tags that fit the rp (e.g. internet culture, femboy, virtual game) whose writing style perfectly fits the tone and world. Return ONLY the 7 items separated by a comma. Do not explain them.`;
            let aiRawOutput = await runMeguminTask(orderText);
            const aiTagsTemp = cleanAIOutput(aiRawOutput).split(",").map(t => t.trim().replace(/['"[\].]/g, '')).filter(t => t.length > 0);
            if (aiTagsTemp.length > 0) {
                currentStyle.tags = currentStyle.tags.filter(tag => !tag.endsWith("✨"));
                currentStyle.generatedOptions = aiTagsTemp.map(tag => `${tag} ✨`);
                renderInsights(); toastr.success(`Generated ${aiTagsTemp.length} insights!`);
            }
        }); $(this).prop("disabled", false).html(`<i class="fa-solid fa-lightbulb"></i> Generate Insights`);
    });

    $("#ps_btn_generate_style").on("click", async function () {
        if (currentStyle.tags.length === 0) return toastr.warning("Select tags first!");
        $(this).prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Finalizing...`);
        await useMeguminEngine(async () => {
            const orderText = `Create a writing style prompt based on these traits:\n\nSelected style tags: ${currentStyle.tags.join(", ")}\n\nAdditional user instructions: ${currentStyle.notes}\n\nWrite a concise, well-structured writing style rule (100 words max) that the AI must follow. Combine all tags into a cohesive directive. Write it as a direct instruction. Do not use bullet points or introductory text.`;
            let rule = await runMeguminTask(orderText);
            currentStyle.rule = cleanAIOutput(rule).trim();
            $("#ps_style_rule_text").val(currentStyle.rule); toastr.success("Live AI Rule Generated!");
        }); $(this).prop("disabled", false).html(`<i class="fa-solid fa-bolt"></i> Generate Writing Rule`);
    });
}

function renderAddons(c) {
    const descriptions = {
        "death": "Enables permanent consequences. Characters — including yours — can die for real. No safety net, no plot armor.",
        "combat": "Activates a grounded, tactical combat layer. Actions have real weight, positioning matters, and you can lose badly.",
        "direct": "Forces AI to say words like D and P. No dancing around the subject, no polite deflection. you know what i mean.",
        "color": "Each character's dialogue is color-coded for easy visual parsing.",
        "npc_events": "Requires all new story events to grow naturally from prior context or environmental cues — no random drama out of nowhere. V6 only.",
        "dn": "Forces dialogue and narration to be wrapped in their respective XML tags. Useful for specific Models for better narration style adherence."
    };

    const activeMode = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])].find(m => m.id === localProfile.mode);
    const isV6 = activeMode && (activeMode.id.includes("v6") || activeMode.label.includes("V6"));

    // ── HEADER ──
    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8);">
                    <i class="fa-solid fa-puzzle-piece"></i>
                </div>
                <div>
                    <h2>Global Settings</h2>
                    <p>Toggle add-ons, set output preferences, and configure extras.</p>
                </div>
            </div>
            <div class="mtab-header-badge" style="background: rgba(59,130,246,0.12); color: #3b82f6; border: 1px solid rgba(59,130,246,0.25);">
                <i class="fa-solid fa-toggle-on" style="font-size:0.6rem;"></i> ${localProfile.addons.length} Active
            </div>
        </div>
    `);

    // ── ADDON CARDS ──
    c.append(`<div class="wstyle-section-head blue"><i class="fa-solid fa-puzzle-piece"></i> Gameplay Add-ons</div>`);
    const grid = $(`<div class="mtab-card-grid"></div>`);

    hardcodedLogic.addons.forEach(a => {
        const isSel = localProfile.addons.includes(a.id);
        let badges = '';
        if (a.recommended) badges += `<span class="ecard-badge rec"><i class="fa-solid fa-star"></i> Recommended</span>`;

        let extraClass = '';
        let v6BadgeHtml = '';
        if (a.id === "npc_events") {
            if (!isV6) {
                extraClass = 'locked-card';
                v6BadgeHtml = `<span class="ecard-badge" style="background:rgba(239,68,68,0.12);color:#ef4444;"><i class="fa-solid fa-lock"></i> Requires V6</span>`;
            } else {
                v6BadgeHtml = `<span class="ecard-badge v6-active"><i class="fa-solid fa-unlock"></i> V6 Active</span>`;
            }
        }

        const card = $(`
            <div class="mtab-eng-card ${isSel ? 'active' : ''} ${extraClass}">
                <div class="ecard-accent"></div>
                <div class="ecard-body">
                    <div class="ecard-title">
                        <span>${a.label}</span>
                        ${isSel ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> On</span>` : ''}
                    </div>
                    <p class="ecard-desc">${descriptions[a.id] || ""}</p>
                    ${badges || v6BadgeHtml ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">${badges}${v6BadgeHtml}</div>` : ''}
                </div>
            </div>
        `);

        card.on("click", () => {
            if (isSel) localProfile.addons = localProfile.addons.filter(i => i !== a.id); else localProfile.addons.push(a.id);
            saveProfileToMemory(); switchTab(currentTab);
        }); grid.append(card);
    });

    // Onomatopoeia card
    if (!localProfile.onomatopoeia) localProfile.onomatopoeia = { enabled: false, useStyling: false };
    const isOno = localProfile.onomatopoeia.enabled;
    const isOnoStyle = localProfile.onomatopoeia.useStyling;

    const onoCard = $(`
        <div class="mtab-eng-card ${isOno ? 'active' : ''}">
            <div class="ecard-accent"></div>
            <div class="ecard-body">
                <div class="ecard-title">
                    <span>Cinematic Sounds</span>
                    ${isOno ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> On</span>` : ''}
                </div>
                <p class="ecard-desc">Force the AI to use precise phonetic sound words (e.g., click, thud) instead of abstract descriptions.</p>
                <div style="display: ${isOno ? 'flex' : 'none'}; margin-top: 8px; padding-top: 10px; border-top: 1px dashed var(--border-color); justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight:700; font-size: 0.75rem; color: var(--text-main);">Animate Sounds</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted);">Wrap in HTML tags. For capable AI only.</div>
                    </div>
                    <div class="ps-toggle-card ${isOnoStyle ? 'active' : ''}" id="ono_inner_toggle" style="padding: 4px; min-width: 44px; justify-content: center; background: transparent; border-color: ${isOnoStyle ? '#10b981' : 'var(--border-color)'};">
                        <div class="ps-switch" style="transform: scale(0.75); ${isOnoStyle ? 'background: #10b981;' : ''}"></div>
                    </div>
                </div>
            </div>
        </div>
    `);
    onoCard.on("click", (e) => {
        if ($(e.target).closest("#ono_inner_toggle").length) {
            localProfile.onomatopoeia.useStyling = !localProfile.onomatopoeia.useStyling;
            saveProfileToMemory(); switchTab(currentTab); return;
        }
        localProfile.onomatopoeia.enabled = !localProfile.onomatopoeia.enabled;
        saveProfileToMemory(); switchTab(currentTab);
    });
    grid.append(onoCard);
    c.append(grid);

    // ── CUSTOM ENGINE SETTINGS ──
    if (activeMode && activeMode.customToggles) {
        const customSettings = activeMode.customToggles.filter(t => t.location === "settings");
        if (customSettings.length > 0) {
            c.append(`<div class="wstyle-section-head green" style="margin-top:16px;"><i class="fa-solid fa-gear"></i> Custom Engine Settings</div>`);
            const toggleList = $(`<div class="mtab-card-list"></div>`);
            customSettings.forEach(cs => {
                const isSel = !!localProfile.toggles[cs.id];
                const tCard = $(`
                    <div class="mtab-toggle-row ${isSel ? 'active' : ''}" style="${isSel ? 'border-color:#10b981;' : ''}">
                        <div class="toggle-info">
                            <div class="toggle-label" style="${isSel ? 'color:#10b981;' : ''}">${cs.name}</div>
                            <div class="toggle-desc">Custom Module → [[${cs.attachPoint}]]</div>
                        </div>
                        <div class="ps-switch" style="${isSel ? 'background:#10b981;' : ''}"></div>
                    </div>
                `);
                tCard.on("click", () => { localProfile.toggles[cs.id] = !localProfile.toggles[cs.id]; saveProfileToMemory(); switchTab(currentTab); });
                toggleList.append(tCard);
            });
            c.append(toggleList);
        }
    }

    // ── EXTRA SETTINGS PANEL ──
    c.append(`<div class="wstyle-section-head blue" style="margin-top:16px;"><i class="fa-solid fa-earth-americas"></i> Extra</div>`);
    const extraPanel = $(`
        <div class="mtab-panel">
            <div class="mtab-toggle-row ${localProfile.toggles.promptPreview ? 'active' : ''}" id="ps_toggle_prompt_preview" style="margin-bottom: 16px;">
                <div class="toggle-info">
                    <div class="toggle-label"><i class="fa-solid fa-magnifying-glass"></i> Prompt Payload Preview</div>
                    <div class="toggle-desc">Show a popup of the final constructed prompt right before it is sent to the AI.</div>
                </div>
                <div class="ps-switch"></div>
            </div>
            <div class="mtab-toggle-row ${localProfile.disableUtilityPrefill ? 'active' : ''}" id="ps_toggle_utility_prefill" style="margin-bottom: 16px;">
                <div class="toggle-info">
                    <div class="toggle-label">Disable Utility Prefills</div>
                    <div class="toggle-desc">Turn this ON if your API (like Claude) errors out during Image Gen, Banlist, or Story Planner generation.</div>
                </div>
                <div class="ps-switch"></div>
            </div>
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">Target Word Count</div><div class="set-desc">Leave empty for no limit</div></div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <select id="ps_select_wordcount_type" class="ps-modern-input" style="width: 110px; cursor: pointer;">
                        <option value="max" ${localProfile.userWordCountType !== 'min' ? 'selected' : ''}>Maximum</option>
                        <option value="min" ${localProfile.userWordCountType === 'min' ? 'selected' : ''}>Minimum</option>
                    </select>
                    <input type="number" id="ps_input_wordcount" class="ps-modern-input" style="width: 120px;" placeholder="e.g. 400" value="${localProfile.userWordCount || ''}" min="1" />
                </div>
            </div>
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">Language Output</div><div class="set-desc">Leave empty for default (English)</div></div>
                <input type="text" id="ps_input_language" class="ps-modern-input" style="width: 180px;" placeholder="e.g. Arabic, French…" value="${localProfile.userLanguage || ''}" />
            </div>
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">User Gender</div><div class="set-desc">Ensure the AI addresses you correctly</div></div>
                <select id="ps_select_pronouns" class="ps-modern-input" style="width: 180px; cursor: pointer;">
                    <option value="off" ${localProfile.userPronouns === 'off' ? 'selected' : ''}>Off</option>
                    <option value="male" ${localProfile.userPronouns === 'male' ? 'selected' : ''}>Male (Him/He)</option>
                    <option value="female" ${localProfile.userPronouns === 'female' ? 'selected' : ''}>Female (Her/She)</option>
                </select>
            </div>
        </div>
    `);
    c.append(extraPanel);

    // Bind the new toggle
    $("#ps_toggle_prompt_preview").on("click", function () {
        if (!localProfile.toggles) localProfile.toggles = {};
        localProfile.toggles.promptPreview = !localProfile.toggles.promptPreview;
        saveProfileToMemory();
        if (localProfile.toggles.promptPreview) $(this).addClass("active");
        else $(this).removeClass("active");
    });

    $("#ps_toggle_utility_prefill").on("click", function () {
        localProfile.disableUtilityPrefill = !localProfile.disableUtilityPrefill;
        saveProfileToMemory();
        if (localProfile.disableUtilityPrefill) $(this).addClass("active");
        else $(this).removeClass("active");
    });
    $("#ps_select_wordcount_type").on("change", function () { localProfile.userWordCountType = $(this).val(); saveProfileToMemory(); });
    $("#ps_input_wordcount").on("input", function () { localProfile.userWordCount = $(this).val(); saveProfileToMemory(); });
    $("#ps_input_language").on("input", function () { localProfile.userLanguage = $(this).val(); saveProfileToMemory(); });
    $("#ps_select_pronouns").on("change", function () { localProfile.userPronouns = $(this).val(); saveProfileToMemory(); });
}

function renderBlocks(c) {
    const activeEngine = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])].find(m => m.id === localProfile.mode);
    const descriptions = {
        "info": "Appends a tidy status panel after each response showing time, weather, location, and what characters are wearing.",
        "summary": "Keeps a running story digest that the AI updates each turn — helps it remember names, events, and details over long sessions.",
        "cyoa": "Choose-Your-Own-Adventure panel with 4 suggested actions for you to pick from each turn.",
        "mvu": "Add MVU Compatibility still in test read more here: <a href='https://github.com/KritBlade/MVU_Game_Maker' target='_blank' style='color: var(--gold); text-decoration: underline;'>https://github.com/KritBlade/MVU_Game_Maker</a>",
        "npc_inner_chatter": "Reveal NPC private thoughts the PC never hears — crushes, resentment, scheming, anxiety. This feeds future NPC behavior.",
        "npc_inner_chatter_v2": "A simpler version of NPC Inner Chatter. use less input token."
    };

    // ── HEADER ──
    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
                    <i class="fa-solid fa-cubes"></i>
                </div>
                <div>
                    <h2>Response Blocks</h2>
                    <p>Attach extra UI panels to every AI response.</p>
                </div>
            </div>
            <div class="mtab-header-badge" style="background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.25);">
                <i class="fa-solid fa-cubes" style="font-size:0.6rem;"></i> ${localProfile.blocks.length} Active
            </div>
        </div>
    `);

    const isMvuActive = localProfile.blocks.includes("mvu");
    const isMemActive = localProfile.memoryCore && localProfile.memoryCore.enabled;

    const grid = $(`<div class="mtab-card-grid"></div>`);
    hardcodedLogic.blocks.forEach(b => {
        const isSel = localProfile.blocks.includes(b.id);
        const isOverridden = activeEngine && activeEngine[b.id] && activeEngine[b.id].trim() !== "";
        
        let isWarned = false;
        let warnReason = "";
        
        if (b.id === "info" && isMvuActive) { isWarned = true; warnReason = "Conflict with MVU"; }
        if (b.id === "summary" && isMemActive) { isWarned = true; warnReason = "Conflict with Memory Core"; }

        let badges = '';
        if (isWarned) {
            badges += `<span class="ecard-badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;"><i class="fa-solid fa-triangle-exclamation"></i> ${warnReason}</span>`;
        } else if (isOverridden) {
            badges += `<span class="ecard-badge override"><i class="fa-solid fa-code-branch"></i> Engine Override</span>`;
        }

        const card = $(`
            <div class="mtab-eng-card ${isSel ? 'active' : ''}" style="${isOverridden && !isSel ? 'border-color: rgba(16,185,129,0.4);' : ''}">
                <div class="ecard-accent"></div>
                <div class="ecard-body">
                    <div class="ecard-title">
                        <span>${b.label}</span>
                        ${isSel ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> On</span>` : ''}
                    </div>
                    <p class="ecard-desc">${descriptions[b.id] || ""}</p>
                    ${badges ? `<div style="margin-top:4px;">${badges}</div>` : ''}
                </div>
            </div>
        `);
        
        card.on("click", (e) => {
            if ($(e.target).closest("a").length) return;
            if (isSel) {
                localProfile.blocks = localProfile.blocks.filter(i => i !== b.id);
            } else {
                localProfile.blocks.push(b.id);
                // Mutual exclusions for inner chatter ONLY
                if (b.id === "npc_inner_chatter") localProfile.blocks = localProfile.blocks.filter(i => i !== "npc_inner_chatter_v2");
                else if (b.id === "npc_inner_chatter_v2") localProfile.blocks = localProfile.blocks.filter(i => i !== "npc_inner_chatter");
            }
            saveProfileToMemory(); switchTab(currentTab);
        }); 
        
        grid.append(card);
    });

    if (activeEngine && activeEngine.customToggles) {
        const customAddons = activeEngine.customToggles.filter(t => t.location === "addons");
        if (customAddons.length > 0) {
            grid.append(`<div style="grid-column: 1 / -1;"><div class="wstyle-section-head green" style="margin:8px 0;"><i class="fa-solid fa-puzzle-piece"></i> Custom Engine Add-ons</div></div>`);
            customAddons.forEach(ca => {
                const isSel = !!localProfile.toggles[ca.id];
                const card = $(`
                    <div class="mtab-eng-card ${isSel ? 'active' : ''}">
                        <div class="ecard-accent"></div>
                        <div class="ecard-body">
                            <div class="ecard-title"><span>${ca.name}</span></div>
                            <p class="ecard-desc">Custom Module → [[${ca.attachPoint}]]</p>
                        </div>
                    </div>
                `);
                card.on("click", () => { localProfile.toggles[ca.id] = !localProfile.toggles[ca.id]; saveProfileToMemory(); switchTab(currentTab); });
                grid.append(card);
            });
        }
    } c.append(grid);
}


function renderModels(c) {
    c.empty();
    const activeEngine = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])].find(m => m.id === localProfile.mode);

    // ── HEADER ──
    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #a855f7, #7c3aed);">
                    <i class="fa-solid fa-brain"></i>
                </div>
                <div>
                    <h2>Chain of Thought</h2>
                    <p>Configure the AI's thinking framework and reasoning depth.</p>
                </div>
            </div>
        </div>
    `);

    if (localProfile.cotEnabled === undefined) localProfile.cotEnabled = true;

    const cotToggle = $(`
        <div class="mtab-toggle-row ${localProfile.cotEnabled ? 'active' : ''}" style="margin-bottom: 20px; border-color: ${localProfile.cotEnabled ? 'var(--gold)' : 'var(--border-color)'};">
            <div class="toggle-info">
                <div class="toggle-label" style="color: ${localProfile.cotEnabled ? 'var(--gold)' : 'var(--text-main)'};"><i class="fa-solid fa-power-off"></i> Enable Chain of Thought</div>
                <div class="toggle-desc">Toggle the entire CoT system on or off.</div>
            </div>
            <div class="ps-switch" style="${localProfile.cotEnabled ? 'background:var(--gold);' : ''}"></div>
        </div>
    `);
    cotToggle.on("click", function() {
        localProfile.cotEnabled = !localProfile.cotEnabled;
        saveProfileToMemory();
        renderModels(c);
    });
    c.append(cotToggle);

    if (!localProfile.cotEnabled) return;

    // Custom Engine override notice
    if (activeEngine && activeEngine.cot && activeEngine.cot.trim() !== "") {
        c.append(`
            <div class="mtab-callout green" style="margin-bottom:20px;">
                <i class="fa-solid fa-shield-halved"></i>
                <span><strong>Custom Engine Logic Active</strong> — This Engine provides its own [[COT]] and [[prefill]]. Selections below will be overridden by the Engine's code.</span>
            </div>
        `);
    }

    const migrationMap = {
        "cot-english": "cot-v1-english", "cot-arabic": "cot-v1-arabic", "cot-spanish": "cot-v1-spanish", "cot-french": "cot-v1-french",
        "cot-zh": "cot-v1-zh", "cot-ru": "cot-v1-ru", "cot-jp": "cot-v1-jp", "cot-pt": "cot-v1-pt", "cot-english-test": "cot-v2-english"
    };
    if (migrationMap[localProfile.model]) { localProfile.model = migrationMap[localProfile.model]; saveProfileToMemory(); }

    if (localProfile.model === "cot-off") {
        localProfile.cotEnabled = false;
        localProfile.model = "cot-v7.5-english"; // Default fallback
        saveProfileToMemory();
        if (!localProfile.cotEnabled) return;
    }

    let currentType = "off", currentLang = "english";
    if (localProfile.model && localProfile.model.startsWith("cot-v1-")) { currentType = "v1"; currentLang = localProfile.model.replace("cot-v1-", ""); }
    else if (localProfile.model && localProfile.model.startsWith("cot-v2-")) { currentType = "v2"; currentLang = localProfile.model.replace("cot-v2-", ""); }
    else if (localProfile.model && localProfile.model.startsWith("cot-v6-lite-")) { currentType = "v6-lite"; currentLang = localProfile.model.replace("cot-v6-lite-", ""); }
    else if (localProfile.model && localProfile.model.startsWith("cot-v6-")) { currentType = "v6"; currentLang = localProfile.model.replace("cot-v6-", ""); }
    else if (localProfile.model && localProfile.model.startsWith("cot-v7.5-")) { currentType = "v7.5"; currentLang = localProfile.model.replace("cot-v7.5-", ""); }
    else if (localProfile.model && localProfile.model.startsWith("cot-v7-lite-")) { currentType = "v7-lite"; currentLang = localProfile.model.replace("cot-v7-lite-", ""); }
    else if (localProfile.model && localProfile.model.startsWith("cot-v7-")) { currentType = "v7"; currentLang = localProfile.model.replace("cot-v7-", ""); }
    else if (localProfile.model && localProfile.model.startsWith("cot-v8-fusion-")) { currentType = "v8-fusion"; currentLang = localProfile.model.replace("cot-v8-fusion-", ""); }
    else if (localProfile.model && localProfile.model.startsWith("cot-v8-")) { currentType = "v8"; currentLang = localProfile.model.replace("cot-v8-", ""); }
    // ── DETERMINE ALLOWED CoTs ──
    let allowedCotTypes = null; // null means all allowed (V4, V5, custom)
    if (localProfile.mode.includes("v6")) allowedCotTypes = ["v6", "v6-lite"];
    else if (localProfile.mode === "v7.5") allowedCotTypes = ["v7.5"];
    else if (localProfile.mode.includes("v7")) allowedCotTypes = ["v7", "v7-lite"];
    else if (localProfile.mode === "v8-fusion") allowedCotTypes = ["v8-fusion"]; 
    else if (localProfile.mode.includes("v8")) allowedCotTypes = ["v8"]; 

    if (!localProfile.thinkEffort) localProfile.thinkEffort = "unspecified";
    if (!localProfile.customThinkEffort) localProfile.customThinkEffort = "100";

    // ── THINKING EFFORT ──
    c.append(`<div class="wstyle-section-head purple"><i class="fa-solid fa-gauge-high"></i> Thinking Effort</div>`);
    c.append(`<div class="mtab-callout" style="margin-bottom:12px; background: rgba(168,85,247,0.1); border-left: 3px solid #a855f7; padding: 8px 12px; font-size: 0.8rem; color: var(--text-main);">
        <i class="fa-solid fa-circle-info" style="color: #a855f7; margin-right: 6px;"></i>
        <strong>Hint:</strong> When using V7 CoT, it is highly recommended to <strong>not</strong> use low Thinking Effort.
    </div>`);
    const effortGrid = $(`<div class="mtab-card-grid" style="margin-bottom: 20px; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));"></div>`);
    const efforts = [
        { id: "100", label: "100 Words" },
        { id: "250", label: "250 Words" },
        { id: "450", label: "450 Words" },
        { id: "custom", label: "Custom" },
        { id: "unspecified", label: "Unspecified" }
    ];
    efforts.forEach(e => {
        const isSel = localProfile.thinkEffort === e.id;
        const card = $(`
            <div class="mtab-eng-card ${isSel ? 'active' : ''}" style="text-align:center;">
                <div class="ecard-accent"></div>
                <div class="ecard-body" style="padding:12px 10px; align-items:center;">
                    <span style="font-weight:700; font-size:0.85rem; color:${isSel ? '#10b981' : 'var(--text-main)'};">${e.label}</span>
                </div>
            </div>
        `);
        card.on("click", () => { localProfile.thinkEffort = e.id; saveProfileToMemory(); renderModels(c); });
        effortGrid.append(card);
    });
    c.append(effortGrid);

    if (localProfile.thinkEffort === "custom") {
        const customBlock = $(`
            <div class="mtab-panel" style="margin-top:-10px; margin-bottom:20px;">
                <div class="mtab-setting-row">
                    <div class="set-info"><div class="set-label">Custom Word Count</div></div>
                    <input type="number" id="ps_input_custom_effort" class="ps-modern-input" style="width: 150px;" value="${localProfile.customThinkEffort}" min="1" />
                </div>
            </div>
        `);
        customBlock.find("#ps_input_custom_effort").on("change input", function () {
            localProfile.customThinkEffort = $(this).val(); saveProfileToMemory();
        });
        c.append(customBlock);
    }

    // ── GEMINI THINKING ──
    if (localProfile.thinkingV2 === undefined) localProfile.thinkingV2 = false;
    const v2Card = $(`
        <div class="mtab-toggle-row ${localProfile.thinkingV2 ? 'active' : ''}" style="margin-bottom: 20px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-brain" style="color:#a855f7;"></i> Gemini Thinking</div>
                <div class="toggle-desc">
                    Enable only for Gemini. When enabled, you MUST add <code>&lt;think&gt;</code> and <code>&lt;/think&gt;</code> to the Reasoning Formatting prefix/suffix.<br>
                    <strong>Note:</strong> Enable Prefill ONLY if using Gemini models.
                </div>
            </div>
            <div class="ps-switch"></div>
        </div>
    `);
    v2Card.on("click", function () { localProfile.thinkingV2 = !localProfile.thinkingV2; saveProfileToMemory(); renderModels(c); });
    c.append(v2Card);

    // ── THINKING FRAMEWORK ──
    c.append(`<div class="wstyle-section-head purple"><i class="fa-solid fa-diagram-project"></i> Thinking Framework</div>`);
    const typeGrid = $(`<div class="mtab-card-grid" style="margin-bottom: 20px;"></div>`);
    const types = [
        { id: "v1", label: "CoT V1 (Classic)", desc: "The original 8-step framework. Focuses heavily on the NPC's internal emotional landscape vs their observable actions." },
        { id: "v2", label: "CoT V2 (New)", desc: "The new experimental framework. Stricter reality checks, info audits, better NPCs, and hook generation." },
        { id: "v6", label: "CoT V6 (Dream Team)", desc: "The full 4-phase sequence designed specifically for V6 engines. Specialized validation and modeling.", isNew: true },
        { id: "v6-lite", label: "CoT V6 (Lite)", desc: "A streamlined 3-phase sequence. Less token overhead while maintaining narrative rules.", isNew: true },
        { id: "v7", label: "CoT V7", desc: "The new V7 sequence with 5-phase strict ground truth rebuilding.", isNew: true },
        { id: "v7-lite", label: "CoT V7 (Lite)", desc: "A streamlined 5-phase sequence for V7.", isNew: true },
        { id: "v7.5", label: "CoT V7.5 Kismet", desc: "The new V7.5 sequence focused on story engine mechanics.", isNew: true },
        { id: "v8", label: "CoT V8", desc: "The new V8 narrative processing sequence.", isNew: true },
        { id: "v8-fusion", label: "CoT V8 Fusion", desc: "The new V8 Fusion narrative processing sequence.", isNew: true }
    ];
    types.forEach(t => {
        const isSel = currentType === t.id;
        const isWarned = allowedCotTypes !== null && !allowedCotTypes.includes(t.id);
        
        let badges = '';
        if (isWarned) badges = `<span class="ecard-badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;"><i class="fa-solid fa-triangle-exclamation"></i> May be Incompatible</span>`;
        else if (t.isNew) badges = `<span class="ecard-badge new">New</span>`;

        const card = $(`
            <div class="mtab-eng-card ${isSel ? 'active' : ''}">
                <div class="ecard-accent"></div>
                <div class="ecard-body">
                    <div class="ecard-title">
                        <span>${t.label}</span>
                        ${isSel ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i> Active</span>` : ''}
                    </div>
                    <p class="ecard-desc">${t.desc}</p>
                    ${badges ? `<div style="margin-top:4px;">${badges}</div>` : ''}
                </div>
            </div>
        `);
        
        card.on("click", () => {
            if (t.id === "v7") localProfile.model = `cot-v7-english`;
            else if (t.id === "v7.5") localProfile.model = `cot-v7.5-english`;
            else if (t.id === "v7-lite") localProfile.model = `cot-v7-lite-english`;
            else if (t.id === "v8") localProfile.model = `cot-v8-english`;
            else if (t.id === "v8-fusion") localProfile.model = `cot-v8-fusion-english`;
            else localProfile.model = `cot-${t.id}-${currentLang}`;
            saveProfileToMemory(); renderModels(c);
        }); 
        
        typeGrid.append(card);
    });
    c.append(typeGrid);

    // ── LANGUAGE ──
    if (currentType !== "off") {
        c.append(`<div class="wstyle-section-head gold"><i class="fa-solid fa-language"></i> Language</div>`);
        const langGrid = $(`<div class="mtab-card-grid" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));"></div>`);
        let langs = [
            { id: "english", label: "English" }, { id: "arabic", label: "Arabic (العربية)", rec: true }, { id: "spanish", label: "Spanish (Español)" },
            { id: "french", label: "French (Français)" }, { id: "zh", label: "Mandarin (中文)" }, { id: "ru", label: "Russian (Русский)" },
            { id: "jp", label: "Japanese (日本語)" }, { id: "pt", label: "Portuguese (Português)" }
        ];
        if (currentType === "v7" || currentType === "v7-lite" || currentType === "v7.5" || currentType === "v8" || currentType === "v8-fusion") langs = [{ id: "english", label: "English" }];
        langs.forEach(l => {
            const isSel = currentLang === l.id;
            let badges = '';
            if (l.rec) badges = `<span class="ecard-badge rec"><i class="fa-solid fa-star"></i> Pro Tip</span>`;

            const card = $(`
                <div class="mtab-eng-card ${isSel ? 'active' : ''}">
                    <div class="ecard-accent"></div>
                    <div class="ecard-body" style="padding:12px 16px;">
                        <div class="ecard-title" style="font-size:0.88rem;">
                            <span>${l.label}</span>
                            ${isSel ? `<span class="ecard-badge" style="background:rgba(16,185,129,0.15);color:#10b981;"><i class="fa-solid fa-check"></i></span>` : ''}
                        </div>
                        ${badges ? `<div style="margin-top:2px;">${badges}</div>` : ''}
                    </div>
                </div>
            `);
            card.on("click", () => { localProfile.model = `cot-${currentType}-${l.id}`; saveProfileToMemory(); renderModels(c); });
            langGrid.append(card);
        }); c.append(langGrid);
    }
}

// -------------------------------------------------------------
function renderPromptEditor(config) {
    const { id, title, defaultData, currentData, fields, onSave, onReset, enabled, onToggle } = config;
    let prompts = currentData || defaultData;
    if (typeof prompts !== 'object' || prompts === null) prompts = defaultData;
    
    let fieldsHtml = '';
    const disabledAttr = enabled ? '' : 'disabled';
    const opacityStyle = enabled ? '' : 'opacity: 0.5; pointer-events: none;';

    fields.forEach(f => {
        let val = prompts[f.key];
        if (val === undefined || val === null || String(val).trim() === '') {
            val = defaultData[f.key] || '';
        }
        
        let escapedVal = String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        fieldsHtml += `
            <div class="ps-prompt-field" style="${opacityStyle}">
                <div class="ps-prompt-field-label">
                    <span class="pf-name"><i class="fa-solid fa-code"></i> ${f.label}</span>
                    <button class="pf-reset" data-key="${f.key}" title="Reset to default" ${disabledAttr}><i class="fa-solid fa-rotate-left"></i> Reset</button>
                </div>
                <textarea class="ps-prompt-textarea" data-key="${f.key}" ${disabledAttr}>${escapedVal}</textarea>
                <div class="pf-hint">${f.hint}</div>
            </div>
        `;
    });

    const html = `
        <div class="ps-prompt-editor" id="${id}">
            <div class="ps-prompt-editor-toggle" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span class="pe-title"><i class="fa-solid fa-pen-to-square"></i> ${title}</span>
                    <div class="ps-toggle-card ${enabled ? 'active' : ''} pe-enable-toggle" style="padding: 2px; min-width: 36px; background: transparent; border-color: ${enabled ? '#10b981' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;" title="Enable custom prompts override">
                        <div class="ps-switch" style="transform: scale(0.65); ${enabled ? 'background: #10b981;' : ''}"></div>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-down pe-chevron" style="cursor:pointer; padding:5px;"></i>
            </div>
            <div class="ps-prompt-editor-body">
                ${fieldsHtml}
                <div class="ps-prompt-editor-actions" style="${opacityStyle}">
                    <button class="ps-modern-btn secondary btn-reset-all" style="padding: 6px 12px; font-size: 0.75rem;" ${disabledAttr}><i class="fa-solid fa-rotate-left"></i> Reset All Defaults</button>
                </div>
            </div>
        </div>
    `;

    const $el = $(html);

    // Open/Close Accordion
    $el.find('.ps-prompt-editor-toggle').on('click', function(e) {
        if ($(e.target).closest('.pe-enable-toggle').length) return; // Don't trigger if clicking the switch
        $el.toggleClass('open');
    });

    // Toggle Enable Switch
    $el.find('.pe-enable-toggle').on('click', function(e) {
        e.stopPropagation();
        const $toggle = $(this);
        const isNowEnabled = !$toggle.hasClass('active');
        
        if (isNowEnabled) {
            $toggle.addClass('active').css('border-color', '#10b981');
            $toggle.find('.ps-switch').css('background', '#10b981');
            $el.find('.ps-prompt-field, .ps-prompt-editor-actions').css({'opacity': '', 'pointer-events': ''});
            $el.find('textarea, button').prop('disabled', false);
        } else {
            $toggle.removeClass('active').css('border-color', 'var(--border-color)');
            $toggle.find('.ps-switch').css('background', '');
            $el.find('.ps-prompt-field, .ps-prompt-editor-actions').css({'opacity': '0.5', 'pointer-events': 'none'});
            $el.find('textarea, button').prop('disabled', true);
        }
        
        if (onToggle) onToggle(isNowEnabled);
    });

    $el.find('.ps-prompt-textarea').on('input', function() {
        const key = $(this).data('key');
        let cData = onSave($(this).val(), key);
        if (cData) prompts = cData;
    });

    $el.find('.pf-reset').on('click', function() {
        const key = $(this).data('key');
        $el.find(`textarea[data-key="${key}"]`).val(defaultData[key]);
        let cData = onSave(defaultData[key], key);
        if (cData) prompts = cData;
    });

    $el.find('.btn-reset-all').on('click', function() {
        onReset();
        $el.find('.ps-prompt-textarea').each(function() {
            const key = $(this).data('key');
            $(this).val(defaultData[key]);
        });
        prompts = defaultData;
    });

    return $el;
}

// -------------------------------------------------------------
// STAGE 7.5: STORY PLANNER
// -------------------------------------------------------------
function renderStoryPlanner(c) {
    c.empty();
    const sp = localProfile.storyPlan;

    c.append(`
        <!-- HEADER -->
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                    <i class="fa-solid fa-map-location-dot"></i>
                </div>
                <div>
                    <h2>Story Planner</h2>
                    <p>Brainstorm and track plot milestones automatically.</p>
                </div>
            </div>
            <div id="sp_header_badge" class="mtab-header-badge" style="background: ${sp.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)'}; color: ${sp.enabled ? '#10b981' : 'var(--text-muted)'}; border: 1px solid ${sp.enabled ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'};">
                <i class="fa-solid fa-${sp.enabled ? 'circle-check' : 'circle-xmark'}" style="font-size:0.6rem;"></i> ${sp.enabled ? 'Enabled' : 'Disabled'}
            </div>
        </div>

        <!-- MASTER TOGGLE -->
        <div class="mtab-toggle-row ${sp.enabled ? 'active' : ''}" id="sp_enable_card" style="margin-bottom: 20px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-map-location-dot" style="color:var(--gold);"></i> Enable Story Planner</div>
                <div class="toggle-desc">Just enable and hit generate plan now and let the ai do the rest.</div>
            </div>
            <div class="ps-switch"></div>
        </div>

        <div id="sp_main_content" style="display: ${sp.enabled ? 'block' : 'none'};">
            <div class="mtab-panel">
                <div class="mtab-panel-title gold"><i class="fa-solid fa-gears"></i> Engine Settings</div>
                <div class="mtab-setting-row">
                    <div class="set-info"><div class="set-label">Generation Backend</div></div>
                    <select id="sp_backend" class="ps-modern-input" style="width: 220px; cursor: pointer;">
                        <option value="direct" ${sp.backend === 'direct' ? 'selected' : ''}>Direct API Call (Fast)</option>
                        <option value="preset" ${sp.backend === 'preset' ? 'selected' : ''}>Megumin Engine Preset</option>
                    </select>
                </div>
                <div class="mtab-setting-row">
                    <div class="set-info">
                        <div class="set-label">Auto-Trigger Mode</div>
                        <div class="set-desc">Generate new plans automatically.</div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <select id="sp_trigger" class="ps-modern-input" style="width: 150px; cursor: pointer;">
                            <option value="manual" ${sp.triggerMode === 'manual' ? 'selected' : ''}>Manual Only</option>
                            <option value="frequency" ${sp.triggerMode === 'frequency' ? 'selected' : ''}>Every X Replies</option>
                        </select>
                        <input type="number" id="sp_freq" class="ps-modern-input" value="${sp.autoFreq}" min="1" style="width: 70px; text-align: center; display: ${sp.triggerMode === 'frequency' ? 'block' : 'none'};" />
                    </div>
                </div>
            </div>

            <div class="mtab-panel">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                    <div class="mtab-panel-title gold" style="margin-bottom:0;"><i class="fa-solid fa-book-open"></i> Current Story Plan</div>
                    <button id="sp_btn_generate" class="wstyle-gen-btn" style="padding: 8px 18px; font-size: 0.78rem;"><i class="fa-solid fa-bolt"></i> Generate Plan Now</button>
                </div>
                <textarea id="sp_current_plan" class="ps-modern-input" style="height: 250px; resize: vertical; font-size: 0.85rem; line-height: 1.5; margin-bottom: 12px;" placeholder="Generated plot milestones will appear here.">${sp.currentPlan || ""}</textarea>
                <div class="mtab-callout">
                    <i class="fa-solid fa-circle-info"></i>
                    <span>A tracker will be added automatically at the end of each response.</span>
                </div>
            </div>
        </div>
    `);

    // --- PROMPT EDITOR UI ---
    const spEditor = renderPromptEditor({
        id: "sp_prompt_editor",
        title: "Advanced: Edit Prompts",
        defaultData: DEFAULT_PROMPTS.storyPlan,
        currentData: sp.customPrompts,
        enabled: sp.customPromptsEnabled, // <-- NEW
        onToggle: (val) => { sp.customPromptsEnabled = val; saveProfileToMemory(); }, // <-- NEW
        fields: [
            { key: "systemPrompt", label: "System Prompt", hint: "Tokens: <code>{{charLore}}</code>, <code>{{userPersona}}</code>, <code>{{chatHistory}}</code>" },
            { key: "userPrompt", label: "User Task Prompt", hint: "Tokens: <code>{{user}}</code>" },
            { key: "thinkingPrompt", label: "Thinking Instructions", hint: "Must include output ordering instructions." },
            { key: "injectionTemplate", label: "Story Plan Injection Template", hint: "Tokens: <code>{{planText}}</code>" },
            { key: "trackerTemplate", label: "Story Tracker Template", hint: "Tokens: <code>{{user}}</code>" }
        ],
        onSave: (val, key) => {
            if (!sp.customPrompts) sp.customPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.storyPlan));
            sp.customPrompts[key] = val;
            saveProfileToMemory();
            return sp.customPrompts;
        },
        onReset: () => {
            sp.customPrompts = null;
            saveProfileToMemory();
        }
    });
    c.find('#sp_main_content').append(spEditor);

    // Listeners
    $("#sp_enable_card").on("click", function () {
        sp.enabled = !sp.enabled; saveProfileToMemory();
        if (sp.enabled) {
            $(this).addClass("active").css("border-color", "var(--gold)").find("span").css("color", "var(--gold)");
            $("#sp_main_content").slideDown(200);
            $("#sp_header_badge").css({ background: 'rgba(16,185,129,0.12)', color: '#10b981', 'border-color': 'rgba(16,185,129,0.25)' }).html(`<i class="fa-solid fa-circle-check" style="font-size:0.6rem;"></i> Enabled`);
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)").find("span").css("color", "var(--text-main)");
            $("#sp_main_content").slideUp(200);
            $("#sp_header_badge").css({ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', 'border-color': 'var(--border-color)' }).html(`<i class="fa-solid fa-circle-xmark" style="font-size:0.6rem;"></i> Disabled`);
        }
    });

    $("#sp_backend").on("change", e => { sp.backend = $(e.target).val(); saveProfileToMemory(); });
    $("#sp_trigger").on("change", e => {
        sp.triggerMode = $(e.target).val(); saveProfileToMemory();
        if (sp.triggerMode === 'frequency') $("#sp_freq").show(); else $("#sp_freq").hide();
    });
    $("#sp_freq").on("input", e => { sp.autoFreq = Math.max(1, parseInt($(e.target).val()) || 10); saveProfileToMemory(); });
    $("#sp_current_plan").on("input", e => { sp.currentPlan = $(e.target).val(); saveProfileToMemory(); });

    $("#sp_btn_generate").on("click", async function () {
        const chatText = getChatHistoryForStoryPlan();
        if (chatText.length < 100) return toastr.warning("Not enough chat history to generate a plot.");

        const btn = $(this);
        btn.prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Brainstorming...`);

        try {
            let output;
            if (!sp.backend || sp.backend === "direct") {
                output = await generateStoryPlanLogic(chatText);
            } else {
                await useMeguminEngine(async () => { output = await generateStoryPlanLogic(chatText); });
            }

            if (output) {
                // Extract only what is inside <plot></plot>
                const plotMatch = output.match(/<plot>([\s\S]*?)<\/plot>/i);
                if (plotMatch) {
                    sp.currentPlan = plotMatch[1].trim();
                    $("#sp_current_plan").val(sp.currentPlan);
                    saveProfileToMemory();
                    toastr.success("Story Plan Generated!");
                } else {
                    toastr.warning("AI failed to format the plot correctly. Try again.");
                }
            }
        } catch (e) {
            toastr.error("Failed to generate plot.");
        } finally {
            btn.prop("disabled", false).html(`<i class="fa-solid fa-bolt"></i> Generate Plan Now`);
        }
    });
}

async function generateStoryPlanLogic(chatText) {
    activeStoryPlanRequest = chatText;
    try {
        let rawOutput = await generateQuietPrompt({ prompt: "___PS_STORY_PLAN___" });
        return rawOutput;
    } finally {
        activeStoryPlanRequest = null;
    }
}

function renderBanList(c) {
    c.empty();
    if (!localProfile.banList) localProfile.banList = [];

    // ── AI SLOP DETECTOR ──
    c.append(`
        <div class="mtab-panel" style="margin-bottom:16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <div class="mtab-panel-title purple" style="margin-bottom:0;"><i class="fa-solid fa-radar"></i> AI Slop Detector</div>
                <button id="ps_btn_scan_slop" class="wstyle-gen-btn" style="padding: 8px 18px; font-size: 0.78rem; background: linear-gradient(135deg, #a855f7, #7c3aed);"><i class="fa-solid fa-radar"></i> Analyze Chat</button>
            </div>
            <div class="mtab-setting-row">
                <div class="set-info">
                    <div class="set-label">Generator Backend</div>
                    <div class="set-desc">Choose how to generate the analysis.</div>
                </div>
                <select id="ban_list_backend" class="ps-modern-input" style="width: 200px; cursor: pointer;">
                <option value="direct" ${localProfile.banListBackend === 'direct' ? 'selected' : ''}>Direct API Call (Fast)</option>
                <option value="preset" ${localProfile.banListBackend === 'preset' ? 'selected' : ''}>Megumin Engine Preset</option>
            </select>
        </div>

        <div class="mtab-panel" style="margin-bottom:16px;">
            <div class="mtab-panel-title red"><i class="fa-solid fa-plus-circle"></i> Add Phrase</div>
            <div style="display: flex; gap: 10px;">
                <input type="text" id="ps_manual_ban_input" class="ps-modern-input" placeholder="Manually add a phrase to ban…" style="flex: 1;" />
                <button id="ps_btn_add_ban" class="ps-modern-btn secondary" style="padding: 0 15px;">Add</button>
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div class="wstyle-section-head red" style="margin-bottom:0;"><i class="fa-solid fa-list"></i> Active Banned Phrases</div>
            <div class="mtab-btn-row">
                <input type="file" id="ps_import_bans_file" accept=".json" style="display: none;">
                <button id="ps_btn_import_bans" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #3b82f6; border-color: rgba(59, 130, 246, 0.3);"><i class="fa-solid fa-file-import"></i> Import</button>
                <button id="ps_btn_export_bans" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #10b981; border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-file-export"></i> Export</button>
                <button id="ps_btn_clear_bans" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);"><i class="fa-solid fa-trash-can"></i> Clear All</button>
            </div>
        </div>
        <div id="ps_banlist_container" class="mtab-card-list" style="min-height: 50px; padding: 10px; border: 1px dashed var(--border-color); border-radius: 10px; margin-bottom: 16px;"></div>
        
        <!-- NEW DEDICATED CONTAINER FOR THE EDITOR -->
        <div id="ban_editor_container" style="margin-bottom: 16px;"></div>

        <div class="mtab-callout purple" style="margin-top: 16px;">
            <i class="fa-solid fa-circle-info"></i>
            <span>This is a beta feature. Don't complain if you have to generate more than once.</span>
        </div>
    `);

    // --- PROMPT EDITOR UI ---
    const banEditor = renderPromptEditor({
        id: "ban_prompt_editor",
        title: "Advanced: Edit Prompts",
        defaultData: DEFAULT_PROMPTS.banList,
        currentData: localProfile.banListCustomPrompts,
        enabled: localProfile.banListCustomPromptsEnabled, // <-- NEW
        onToggle: (val) => { localProfile.banListCustomPromptsEnabled = val; saveProfileToMemory(); }, // <-- NEW
        fields: [
            { key: "systemPrompt", label: "System Prompt", hint: "AI role definition." },
            { key: "userPrompt", label: "User Task Prompt", hint: "Tokens: <code>{{chatHistory}}</code>" },
            { key: "thinkingPrompt", label: "Thinking Instructions", hint: "Must include output ordering instructions." },
            { key: "injectionTemplate", label: "Ban List Injection Template", hint: "Tokens: <code>{{banItems}}</code>" }
        ],
        onSave: (val, key) => {
            if (!localProfile.banListCustomPrompts) localProfile.banListCustomPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.banList));
            localProfile.banListCustomPrompts[key] = val;
            saveProfileToMemory();
            return localProfile.banListCustomPrompts;
        },
        onReset: () => {
            localProfile.banListCustomPrompts = null;
            saveProfileToMemory();
        }
    });
    
    // RELIABLY INJECT THE EDITOR INTO THE CONTAINER WE JUST MADE
    c.find('#ban_editor_container').append(banEditor);

    const renderTags = () => {
        const box = $("#ps_banlist_container"); box.empty();
        if (localProfile.banList.length === 0) { box.append(`<span style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">No phrases banned yet.</span>`); $("#ban_header_badge").html(`<i class="fa-solid fa-ban" style="font-size:0.6rem;"></i> 0 Banned`); return; }
        localProfile.banList.forEach(phrase => {
            const tEl = $(`<div class="mtab-ban-item">
                <span style="padding-right: 15px;">${phrase}</span>
                <i class="fa-solid fa-xmark"></i>
            </div>`);
            tEl.on("click", () => { localProfile.banList = localProfile.banList.filter(p => p !== phrase); saveProfileToMemory(); renderTags(); }); box.append(tEl);
        });
        // Update header badge dynamically
        $("#ban_header_badge").html(`<i class="fa-solid fa-ban" style="font-size:0.6rem;"></i> ${localProfile.banList.length} Banned`);
    }; renderTags();

    $("#ps_btn_add_ban").on("click", () => {
        const val = $("#ps_manual_ban_input").val().trim();
        if (val && !localProfile.banList.includes(val)) { localProfile.banList.push(val); saveProfileToMemory(); $("#ps_manual_ban_input").val(""); renderTags(); }
    });
    $("#ps_btn_clear_bans").on("click", () => {
        if (localProfile.banList.length === 0) return;
        if (confirm("Are you sure you want to delete all banned phrases?")) { localProfile.banList = []; saveProfileToMemory(); renderTags(); toastr.info("Ban list cleared."); }
    });
    $("#ps_btn_export_bans").on("click", () => {
        if (!localProfile.banList || localProfile.banList.length === 0) return toastr.warning("Ban list is empty!");
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(localProfile.banList, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `banlist_${localProfile.id || 'export'}.json`);
        document.body.appendChild(dlAnchorElem);
        dlAnchorElem.click();
        document.body.removeChild(dlAnchorElem);
    });
    $("#ps_btn_import_bans").on("click", () => {
        $("#ps_import_bans_file").trigger("click");
    });
    $("#ps_import_bans_file").on("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (evt) {
            try {
                const imported = JSON.parse(evt.target.result);
                if (Array.isArray(imported)) {
                    let added = 0;
                    imported.forEach(p => {
                        if (typeof p === 'string' && !localProfile.banList.includes(p.trim()) && p.trim().length > 0) {
                            localProfile.banList.push(p.trim());
                            added++;
                        }
                    });
                    saveProfileToMemory();
                    renderTags();
                    if (added > 0) toastr.success(`Imported ${added} phrases!`);
                    else toastr.info("No new phrases imported.");
                } else {
                    toastr.error("Invalid JSON format. Expected an array of strings.");
                }
            } catch (err) {
                toastr.error("Error parsing JSON file.");
            }
        };
        reader.readAsText(file);
        $(this).val('');
    });
    $("#ban_list_backend").on("change", function () {
        localProfile.banListBackend = $(this).val();
        saveProfileToMemory();
    });
    $("#ps_btn_scan_slop").on("click", async function () {
        const chatText = getCleanedChatHistory();
        if (chatText.length < 50) return toastr.warning("Not enough chat history to analyze!");
        $(this).prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...`);
        let rawResponse;
        if (!localProfile.banListBackend || localProfile.banListBackend === "direct") {
            rawResponse = await analyzeSlopDirectly(chatText);
        } else {
            rawResponse = await analyzeSlopWithPreset(chatText);
        }
        if (rawResponse) {
            const newPhrases = rawResponse.split(/[,*\n-]/).map(t => t.trim().replace(/['"\[\]\.]/g, '')).filter(t => t.length > 3);
            let addedCount = 0;
            newPhrases.forEach(p => { if (!localProfile.banList.includes(p)) { localProfile.banList.push(p); addedCount++; } });
            if (addedCount > 0) { saveProfileToMemory(); renderTags(); toastr.success(`Caught and banned ${addedCount} repetitive phrases!`); } else { toastr.info("No new repetitive phrases found."); }
        }
        $(this).prop("disabled", false).html(`<i class="fa-solid fa-radar"></i> Analyze Chat History`);
    });
}

// -------------------------------------------------------------
// STAGE 8: IMAGE GEN KAZUMA (ComfyUI Integration)
// -------------------------------------------------------------
function renderImageGen(c) {
    c.empty();
    const s = localProfile.imageGen;

    c.append(`
        <!-- HEADER -->
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #06b6d4, #0891b2);">
                    <i class="fa-solid fa-image"></i>
                </div>
                <div>
                    <h2>Image Generation</h2>
                    <p>ComfyUI integration for automatic scene rendering.</p>
                </div>
            </div>
            <div id="ig_header_badge" class="mtab-header-badge" style="background: ${s.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)'}; color: ${s.enabled ? '#10b981' : 'var(--text-muted)'}; border: 1px solid ${s.enabled ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'};">
                <i class="fa-solid fa-${s.enabled ? 'circle-check' : 'circle-xmark'}" style="font-size:0.6rem;"></i> ${s.enabled ? 'Enabled' : 'Disabled'}
            </div>
        </div>

        <!-- MASTER TOGGLE -->
        <div class="mtab-toggle-row ${s.enabled ? 'active' : ''}" id="ig_enable_card" style="margin-bottom: 20px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-image" style="color:#06b6d4;"></i> Enable Image Generation</div>
                <div class="toggle-desc">Activate ComfyUI integration for this specific character/group.</div>
            </div>
            <div class="ps-switch"></div>
        </div>

        <!-- Generator Backend -->
        <div class="mtab-panel" style="margin-bottom:16px;">
            <div class="mtab-panel-title blue"><i class="fa-solid fa-gears"></i> Prompt Generator Backend</div>
            <div class="mtab-setting-row">
                <div class="set-info">
                    <div class="set-label">Generation Method</div>
                    <div class="set-desc">"Direct" is faster. "Megumin Image" is more creative.</div>
                </div>
                <select id="img_gen_backend" class="ps-modern-input" style="width: 220px; cursor: pointer;">
                    <option value="direct" ${s.generatorBackend === 'direct' ? 'selected' : ''}>Direct API Call (Fast)</option>
                    <option value="preset" ${s.generatorBackend === 'preset' ? 'selected' : ''}>Megumin Image Preset</option>
                </select>
            </div>
        </div>

        <div id="ig_main_content" style="display: ${s.enabled ? 'block' : 'none'};">
            
            <!-- Connection & Workflow -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div class="mtab-panel-title blue"><i class="fa-solid fa-link"></i> ComfyUI Server & Workflow</div>
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <input type="text" id="ig_url" class="ps-modern-input" value="${s.comfyUrl}" placeholder="http://127.0.0.1:8188" style="flex: 1;" />
                    <button id="ig_test_btn" class="ps-modern-btn secondary" style="padding: 0 15px;"><i class="fa-solid fa-wifi"></i> Test</button>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <select id="ig_workflow_list" class="ps-modern-input" style="flex: 1; cursor: pointer;"></select>
                    <button id="ig_new_wf" class="ps-modern-btn secondary" title="New Workflow"><i class="fa-solid fa-plus"></i></button>
                    <button id="ig_edit_wf" class="ps-modern-btn secondary" title="Edit JSON"><i class="fa-solid fa-pen"></i></button>
                    <button id="ig_del_wf" class="ps-modern-btn secondary" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>

            <!-- Triggers & Formatting -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div class="mtab-panel-title gold"><i class="fa-solid fa-pen-nib"></i> Triggers & Formatting</div>
                <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Trigger Mode</div>
                        <select id="ig_trigger_mode" class="ps-modern-input" style="padding: 8px; font-size: 0.8rem; cursor: pointer;">
                            <option value="always" ${s.triggerMode === 'always' ? 'selected' : ''}>Always (Every Reply)</option>
                            <option value="frequency" ${s.triggerMode === 'frequency' ? 'selected' : ''}>After X Replies</option>
                            <option value="conditional" ${s.triggerMode === 'conditional' ? 'selected' : ''}>Only when character sends a pic</option>
                            <option value="manual" ${s.triggerMode === 'manual' ? 'selected' : ''}>Manual Button Only</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Inject Mode</div>
                        <select id="ig_inject_mode" class="ps-modern-input" style="padding: 8px; font-size: 0.8rem; cursor: pointer;">
                            <option value="new_msg" ${s.injectMode === 'new_msg' || !s.injectMode ? 'selected' : ''}>New Message (Gallery)</option>
                            <option value="inline" ${s.injectMode === 'inline' ? 'selected' : ''}>Inline (Inside AI Reply)</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Image Count</div>
                        <select id="ig_image_count" class="ps-modern-input" style="padding: 8px; font-size: 0.8rem; cursor: pointer;">
                            <option value="1" ${s.imageCount == 1 ? 'selected' : ''}>1 Image</option>
                            <option value="2" ${s.imageCount == 2 ? 'selected' : ''}>2 Images</option>
                            <option value="3" ${s.imageCount == 3 ? 'selected' : ''}>3 Images</option>
                            <option value="4" ${s.imageCount == 4 ? 'selected' : ''}>4 Images</option>
                        </select>
                    </div>
                    <div style="flex: 1; display: ${s.triggerMode === 'frequency' ? 'block' : 'none'};" id="ig_freq_container">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Every X Replies</div>
                        <input type="number" id="ig_auto_freq" class="ps-modern-input" value="${s.autoGenFreq}" min="1" style="padding: 8px; font-size: 0.8rem; text-align: center;" />
                    </div>
                </div>

                <div class="mtab-toggle-row ${s.previewPrompt ? 'active' : ''}" id="ig_preview_card" style="padding: 12px 18px; margin-bottom: 15px;">
                    <div class="toggle-info">
                        <div class="toggle-label" style="font-size:0.85rem;">Preview Prompt Before Sending</div>
                        <div class="toggle-desc">Show a popup to view or edit the AI's prompt before rendering.</div>
                    </div>
                    <div class="ps-switch"></div>
                </div>

                <div id="ig_prompt_builder" style="background: rgba(0,0,0,0.15); padding: 15px; border-radius: 10px; border-left: 3px solid var(--gold);">
                    <div style="display: flex; gap: 15px; margin-bottom: 10px; align-items: center; flex-wrap: wrap;">
                        <div style="flex: 2; min-width: 150px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px;">Prompt Template</div>
                            <select id="ig_template" class="ps-modern-input" style="padding: 8px; font-size: 0.8rem; cursor: pointer;">
                                <option value="illus_cinematic" ${s.promptTemplate === 'illus_cinematic' ? 'selected' : ''}>Illustrious/Anima + Cinematic</option>
                                <option value="sdxl_cinematic" ${s.promptTemplate === 'sdxl_cinematic' ? 'selected' : ''}>Z Image + Cinematic</option>
                                <option value="illus_pov" ${s.promptTemplate === 'illus_pov' ? 'selected' : ''}>Illustrious/Anima + POV</option>
                                <option value="sdxl_pov" ${s.promptTemplate === 'sdxl_pov' ? 'selected' : ''}>Z Image + POV</option>
                                <option value="illus_portrait" ${s.promptTemplate === 'illus_portrait' ? 'selected' : ''}>Illustrious/Anima + Portrait</option>
                                <option value="sdxl_portrait" ${s.promptTemplate === 'sdxl_portrait' ? 'selected' : ''}>Z Image + Portrait</option>
                            </select>
                        </div>
                        <div style="flex: 1; min-width: 100px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
                                Include Examples <i class="fa-solid fa-circle-question" title="Make the image prompt better but increase input token." style="cursor: help; color: var(--gold);"></i>
                            </div>
                            <div class="ps-toggle-card ${s.includeExamples ? 'active' : ''}" id="ig_examples_toggle" style="padding: 4px; min-width: 44px; justify-content: center; background: transparent; border-color: ${s.includeExamples ? '#10b981' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;">
                                <div class="ps-switch" style="transform: scale(0.75); ${s.includeExamples ? 'background: #10b981;' : ''}"></div>
                            </div>
                        </div>
                        <div style="flex: 1; min-width: 100px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
                                Better Booru tags <i class="fa-solid fa-circle-question" title="It may increase empty responses." style="cursor: help; color: var(--gold);"></i>
                            </div>
                            <div class="ps-toggle-card ${s.directLanguage ? 'active' : ''}" id="ig_direct_toggle" style="padding: 4px; min-width: 44px; justify-content: center; background: transparent; border-color: ${s.directLanguage ? '#10b981' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;" title="Forces the AI to only use exact Booru tags">
                                <div class="ps-switch" style="transform: scale(0.75); ${s.directLanguage ? 'background: #10b981;' : ''}"></div>
                            </div>
                        </div>
                        <div style="flex: 1; min-width: 100px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
                                Inject NPC Tags <i class="fa-solid fa-circle-question" title="Automatically attach saved NPC image tags to the prompt if they are in the scene." style="cursor: help; color: var(--gold);"></i>
                            </div>
                            <div class="ps-toggle-card ${s.injectNpcTags ? 'active' : ''}" id="ig_npc_tags_toggle" style="padding: 4px; min-width: 44px; justify-content: center; background: transparent; border-color: ${s.injectNpcTags ? '#10b981' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;">
                                <div class="ps-switch" style="transform: scale(0.75); ${s.injectNpcTags ? 'background: #10b981;' : ''}"></div>
                            </div>
                        </div>
                    </div>
                    <input type="text" id="ig_extra" class="ps-modern-input" placeholder="Extra Instructions (e.g. moody lighting, dark atmosphere...)" value="${s.promptExtra}" style="padding: 8px; font-size: 0.8rem;" />
                </div>

            <!-- Parameters -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div class="mtab-panel-title gold"><i class="fa-solid fa-sliders"></i> Image Parameters</div>
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <select id="ig_model" class="ps-modern-input" style="flex: 2;"><option value="">Loading Models...</option></select>
                    <select id="ig_sampler" class="ps-modern-input" style="flex: 1;"><option value="">Loading Samplers...</option></select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px; background: rgba(0,0,0,0.1); padding: 15px; border-radius: 10px; border: 1px solid var(--border-color);">
                    <div class="mtab-param-row"><span class="param-label">Steps</span><input type="range" id="ig_steps" min="1" max="100" value="${s.steps}"><input type="number" id="ig_steps_val" value="${s.steps}"></div>
                    <div class="mtab-param-row"><span class="param-label">CFG</span><input type="range" id="ig_cfg" min="1" max="30" step="0.5" value="${s.cfg}"><input type="number" id="ig_cfg_val" value="${s.cfg}"></div>
                    <div class="mtab-param-row"><span class="param-label">Denoise</span><input type="range" id="ig_denoise" min="0" max="1" step="0.05" value="${s.denoise}"><input type="number" id="ig_denoise_val" value="${s.denoise}"></div>
                    <div class="mtab-param-row"><span class="param-label">CLIP</span><input type="range" id="ig_clip" min="1" max="12" step="1" value="${s.clipSkip}"><input type="number" id="ig_clip_val" value="${s.clipSkip}"></div>
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <div style="flex: 2;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Resolution Preset</div>
                        <select id="ig_res_preset" class="ps-modern-input" style="padding: 8px; font-size: 0.8rem;"></select>
                    </div>
                    <div style="flex: 1; display: flex; align-items: flex-end; gap: 5px;">
                        <input type="number" id="ig_w" class="ps-modern-input" value="${s.imgWidth}" placeholder="W" style="padding: 8px; text-align: center; font-size: 0.8rem;" />
                        <span style="color: var(--text-muted); padding-bottom: 8px;">x</span>
                        <input type="number" id="ig_h" class="ps-modern-input" value="${s.imgHeight}" placeholder="H" style="padding: 8px; text-align: center; font-size: 0.8rem;" />
                    </div>
                </div>

                <div style="display: flex; gap: 10px;">
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Seed (-1 for random)</div>
                        <input type="number" id="ig_seed" class="ps-modern-input" value="${s.customSeed}" style="padding: 8px; font-size: 0.8rem;" />
                    </div>
                    <div style="flex: 2;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Negative Prompt Override</div>
                        <input type="text" id="ig_neg" class="ps-modern-input" value="${s.customNegative}" style="padding: 8px; font-size: 0.8rem;" />
                    </div>
                </div>
            </div>

            <!-- LoRA Lab -->
            <div class="mtab-panel">
                <div class="mtab-panel-title purple"><i class="fa-solid fa-flask"></i> LoRA Lab</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    ${[1, 2, 3, 4].map(i => `
                        <div style="background: rgba(0,0,0,0.1); border: 1px solid var(--border-color); padding: 12px; border-radius: 10px; border-left: 3px solid #a855f7;">
                            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Slot ${i}</div>
                            <select id="ig_lora_${i}" class="ps-modern-input" style="padding: 6px; font-size: 0.75rem; margin-bottom: 8px;"><option value="">Loading...</option></select>
                            <div class="mtab-param-row" style="padding:0;">
                                <span class="param-label" style="min-width:30px;">Wt</span>
                                <input type="range" id="ig_lorawt_${i}" min="-2" max="2" step="0.1" value="${i === 1 ? s.selectedLoraWt : i === 2 ? s.selectedLoraWt2 : i === 3 ? s.selectedLoraWt3 : s.selectedLoraWt4}">
                                <span id="ig_lorawt_lbl_${i}" style="font-size:0.78rem; font-weight:600; color:var(--text-main); min-width:30px; text-align:center;">${i === 1 ? s.selectedLoraWt : i === 2 ? s.selectedLoraWt2 : i === 3 ? s.selectedLoraWt3 : s.selectedLoraWt4}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `);

    // --- PROMPT EDITOR UI ---
    const igEditor = renderPromptEditor({
        id: "ig_prompt_editor",
        title: "Advanced: Edit Prompts",
        defaultData: DEFAULT_PROMPTS.imageGen,
        currentData: s.customPrompts,
        enabled: s.customPromptsEnabled, // <-- NEW
        onToggle: (val) => { s.customPromptsEnabled = val; saveProfileToMemory(); }, // <-- NEW
        fields: [
            { key: "systemPrompt", label: "System Prompt", hint: "AI role definition." },
            { key: "userPrompt", label: "User Task Prompt", hint: "Tokens: <code>{{chatHistory}}</code>, <code>{{templateRules}}</code>, <code>{{extraStr}}</code>, <code>{{directLanguage}}</code>, <code>{{npcImageTags}}</code>, <code>{{templateExamples}}</code>" },
            { key: "thinkingPrompt", label: "Thinking Instructions", hint: "Must include output ordering instructions." },
            { key: "injectionTemplate", label: "Image Injection Template", hint: "Tokens: <code>{{conditionalText}}</code>, <code>{{templateRules}}</code>, <code>{{promptExtra}}</code>, <code>{{directLanguage}}</code>, <code>{{npcImageTags}}</code>, <code>{{templateExamples}}</code>" },
            { key: "rulesIllusPov", label: "Rules: Illustrious + POV", hint: "" },
            { key: "examplesIllusPov", label: "Examples: Illustrious + POV", hint: "" },
            { key: "rulesSdxlPov", label: "Rules: Z Image + POV", hint: "" },
            { key: "examplesSdxlPov", label: "Examples: Z Image + POV", hint: "" },
            { key: "rulesIllusCinematic", label: "Rules: Illustrious + Cinematic", hint: "" },
            { key: "examplesIllusCinematic", label: "Examples: Illustrious + Cinematic", hint: "" },
            { key: "rulesSdxlCinematic", label: "Rules: Z Image + Cinematic", hint: "" },
            { key: "examplesSdxlCinematic", label: "Examples: Z Image + Cinematic", hint: "" },
            { key: "rulesIllusPortrait", label: "Rules: Illustrious + Portrait", hint: "" },
            { key: "examplesIllusPortrait", label: "Examples: Illustrious + Portrait", hint: "" },
            { key: "rulesSdxlPortrait", label: "Rules: Z Image + Portrait", hint: "" },
            { key: "examplesSdxlPortrait", label: "Examples: Z Image + Portrait", hint: "" }
        ],
        onSave: (val, key) => {
            if (!s.customPrompts) s.customPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.imageGen));
            s.customPrompts[key] = val;
            saveProfileToMemory();
            return s.customPrompts;
        },
        onReset: () => {
            s.customPrompts = null;
            saveProfileToMemory();
        }
    });
    c.find('#ig_main_content').append(igEditor);

    // --- EVENTS & BINDINGS ---
    $("#ig_enable_card").on("click", function () {
        s.enabled = !s.enabled;
        saveProfileToMemory();
        toggleQuickGenButton();
        if (s.enabled) {
            $(this).addClass("active"); $(this).css("border-color", "var(--gold)"); $(this).find("span").css("color", "var(--gold)");
            $("#ig_main_content").slideDown(200); 
            igPopulateWorkflows(); // <-- ADDED THIS!
            igFetchComfyLists();
            $("#ig_header_badge").css({ background: 'rgba(16,185,129,0.12)', color: '#10b981', 'border-color': 'rgba(16,185,129,0.25)' }).html(`<i class="fa-solid fa-circle-check" style="font-size:0.6rem;"></i> Enabled`);
        } else {
            $(this).removeClass("active"); $(this).css("border-color", "var(--border-color)"); $(this).find("span").css("color", "var(--text-main)");
            $("#ig_main_content").slideUp(200);
            $("#ig_header_badge").css({ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', 'border-color': 'var(--border-color)' }).html(`<i class="fa-solid fa-circle-xmark" style="font-size:0.6rem;"></i> Disabled`);
        }
    });
    $("#ig_template").on("change", (e) => { s.promptTemplate = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_extra").on("input", (e) => { s.promptExtra = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_image_count").on("change", (e) => { s.imageCount = parseInt($(e.target).val()); saveProfileToMemory(); });
    
    $("#ig_examples_toggle").on("click", function() {
        s.includeExamples = !s.includeExamples;
        saveProfileToMemory();
        if (s.includeExamples) {
            $(this).addClass("active").css("border-color", "#10b981");
            $(this).find(".ps-switch").css("background", "#10b981");
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
            $(this).find(".ps-switch").css("background", "");
        }
    });
    $("#ig_direct_toggle").on("click", function() {
        s.directLanguage = !s.directLanguage;
        saveProfileToMemory();
        if (s.directLanguage) {
            $(this).addClass("active").css("border-color", "#10b981");
            $(this).find(".ps-switch").css("background", "#10b981");
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
            $(this).find(".ps-switch").css("background", "");
        }
    });
    $("#ig_npc_tags_toggle").on("click", function() {
        s.injectNpcTags = !s.injectNpcTags;
        saveProfileToMemory();
        if (s.injectNpcTags) {
            $(this).addClass("active").css("border-color", "#10b981");
            $(this).find(".ps-switch").css("background", "#10b981");
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
            $(this).find(".ps-switch").css("background", "");
        }
    });
    $("#img_gen_backend").on("change", function () {
        s.generatorBackend = $(this).val();
        saveProfileToMemory();
    });

    $("#ig_inject_mode").on("change", (e) => { s.injectMode = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_trigger_mode").on("change", (e) => {
        s.triggerMode = $(e.target).val();
        saveProfileToMemory();
        toggleQuickGenButton(); // <-- ADDED
        if (s.triggerMode === 'frequency') $("#ig_freq_container").show(); else $("#ig_freq_container").hide();
    });
    $("#ig_auto_freq").on("input", (e) => { let v = parseInt($(e.target).val()); if (v < 1) v = 1; s.autoGenFreq = v; saveProfileToMemory(); });

    $("#ig_preview_card").on("click", function () {
        s.previewPrompt = !s.previewPrompt;
        saveProfileToMemory();
        if (s.previewPrompt) $(this).addClass("active");
        else $(this).removeClass("active");
    });

    // Inputs
    $("#ig_url").on("input", (e) => { s.comfyUrl = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_style").on("change", (e) => { s.promptStyle = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_persp").on("change", (e) => { s.promptPerspective = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_extra").on("input", (e) => { s.promptExtra = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_w, #ig_h").on("input", (e) => { s[e.target.id === "ig_w" ? "imgWidth" : "imgHeight"] = parseInt($(e.target).val()); saveProfileToMemory(); });
    $("#ig_neg").on("input", (e) => { s.customNegative = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_seed").on("input", (e) => { s.customSeed = parseInt($(e.target).val()); saveProfileToMemory(); });

    // Sliders
    const bindSlider = (id, key, isFloat) => {
        $(`#ig_${id}`).on("input", function () { let v = isFloat ? parseFloat(this.value) : parseInt(this.value); s[key] = v; $(`#ig_${id}_val`).val(v); saveProfileToMemory(); });
        $(`#ig_${id}_val`).on("input", function () { let v = isFloat ? parseFloat(this.value) : parseInt(this.value); s[key] = v; $(`#ig_${id}`).val(v); saveProfileToMemory(); });
    };
    bindSlider("steps", "steps", false); bindSlider("cfg", "cfg", true); bindSlider("denoise", "denoise", true); bindSlider("clip", "clipSkip", false);

    // Resolutions
    const resSel = $("#ig_res_preset");
    resSel.empty().append('<option value="">-- Select Preset --</option>');
    RESOLUTIONS.forEach((r, idx) => resSel.append(`<option value="${idx}">${r.label}</option>`));
    resSel.on("change", (e) => {
        const idx = parseInt($(e.target).val());
        if (!isNaN(idx) && RESOLUTIONS[idx]) { $("#ig_w").val(RESOLUTIONS[idx].w).trigger("input"); $("#ig_h").val(RESOLUTIONS[idx].h).trigger("input"); }
    });

    // LoRAs
    for (let i = 1; i <= 4; i++) {
        const key = i === 1 ? "selectedLora" : `selectedLora${i}`;
        const wtKey = i === 1 ? "selectedLoraWt" : `selectedLoraWt${i}`;
        $(`#ig_lora_${i}`).on("change", (e) => { s[key] = $(e.target).val(); saveProfileToMemory(); });
        $(`#ig_lorawt_${i}`).on("input", function () { let v = parseFloat(this.value); s[wtKey] = v; $(`#ig_lorawt_lbl_${i}`).text(v); saveProfileToMemory(); });
    }

    // Models & Samplers
    $("#ig_model").on("change", (e) => { s.selectedModel = $(e.target).val(); saveProfileToMemory(); });
    $("#ig_sampler").on("change", (e) => { s.selectedSampler = $(e.target).val(); saveProfileToMemory(); });

    // Buttons
    $("#ig_test_btn").on("click", igTestConnection);

    // Workflow Managers
    $("#ig_new_wf").on("click", igNewWorkflowClick);
    $("#ig_edit_wf").on("click", igOpenWorkflowEditorClick);
    $("#ig_del_wf").on("click", igDeleteWorkflowClick);
    $("#ig_workflow_list").on("change", (e) => {
        const newWorkflow = $(e.target).val();
        const oldWorkflow = s.currentWorkflowName;
        if (oldWorkflow) {
            if (!s.savedWorkflowStates) s.savedWorkflowStates = {};
            s.savedWorkflowStates[oldWorkflow] = {
                selectedModel: s.selectedModel, selectedSampler: s.selectedSampler, steps: s.steps, cfg: s.cfg, denoise: s.denoise, clipSkip: s.clipSkip,
                imgWidth: s.imgWidth, imgHeight: s.imgHeight, customSeed: s.customSeed, customNegative: s.customNegative,
                promptStyle: s.promptStyle, promptPerspective: s.promptPerspective, promptExtra: s.promptExtra, previewPrompt: s.previewPrompt,
                selectedLora: s.selectedLora, selectedLoraWt: s.selectedLoraWt, selectedLora2: s.selectedLora2, selectedLoraWt2: s.selectedLoraWt2,
                selectedLora3: s.selectedLora3, selectedLoraWt3: s.selectedLoraWt3, selectedLora4: s.selectedLora4, selectedLoraWt4: s.selectedLoraWt4
            };
        }
        if (s.savedWorkflowStates && s.savedWorkflowStates[newWorkflow]) {
            Object.assign(s, s.savedWorkflowStates[newWorkflow]);
            toastr.success(`Restored settings for ${newWorkflow}`);
            renderImageGen(c); // Re-render to update UI with restored values
        } else { toastr.info(`New workflow context active`); }

        s.currentWorkflowName = newWorkflow;
        saveProfileToMemory();
    });

    if (s.enabled) {
        igPopulateWorkflows();
        igFetchComfyLists();
    }
}

// -------------------------------------------------------------
// STAGE 8 HELPER FUNCTIONS
// -------------------------------------------------------------
async function igFetchComfyLists() {
    const s = localProfile.imageGen;
    const url = s.comfyUrl;
    try {
        const mRes = await fetch('/api/sd/comfy/models', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: url }) });
        if (mRes.ok) {
            const models = await mRes.json();
            const sel = $("#ig_model"); sel.empty().append('<option value="">-- Select Model --</option>');
            models.forEach(m => { let v = m.value || m; let t = m.text || v; sel.append(`<option value="${v}">${t}</option>`); });
            if (s.selectedModel) sel.val(s.selectedModel);
        }
        const sRes = await fetch('/api/sd/comfy/samplers', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: url }) });
        if (sRes.ok) {
            const samplers = await sRes.json();
            const sel = $("#ig_sampler"); sel.empty();
            samplers.forEach(sa => sel.append(`<option value="${sa}">${sa}</option>`));
            if (s.selectedSampler) sel.val(s.selectedSampler);
        }
        const lRes = await fetch(`${url}/object_info/LoraLoader`);
        if (lRes.ok) {
            const json = await lRes.json();
            const files = json['LoraLoader'].input.required.lora_name[0];
            for (let i = 1; i <= 4; i++) {
                const sel = $(`#ig_lora_${i}`); const val = i === 1 ? s.selectedLora : s[`selectedLora${i}`];
                sel.empty().append('<option value="">-- No LoRA --</option>');
                files.forEach(f => sel.append(`<option value="${f}">${f}</option>`));
                if (val) sel.val(val);
            }
        }
    } catch (e) { console.warn(`[Megumin-Suite] ComfyLists failed`, e); }
}

// -------------------------------------------------------------
// STAGE 8.5: NPC BANK
// -------------------------------------------------------------

// Reconstruct a plain-text dossier from structured NPC data for injection into [[npc list]]
function npcBuildTextFromData(n) {
    let lines = [];
    lines.push(`**Name:** ${n.name || "Unknown"} | **Age:** ${n.age || "?"} | **Sex:** ${n.sex || "?"} | **Orientation:** ${n.orientation || "?"}`);
    if (n.role) lines.push(`**Role:** ${n.role}`);
    if (n.whereToFind) lines.push(`**Where to Find Them:** ${n.whereToFind}`);
    if (n.appearance) lines.push(`**Appearance:** ${n.appearance}`);
    
    // DELIBERATELY SKIPPED: n.imageTags
    // Image tags are for ComfyUI only. Hiding them saves tokens and prevents the AI from mimicking Booru formatting.
    
    if (n.voice) lines.push(`**Voice:** ${n.voice}`);
    if (n.background) lines.push(`**Background:**\n${n.background}`);
    if (n.innerCircle) lines.push(`**Inner Circle:**\n${n.innerCircle}`);
    if (n.personality) lines.push(`**Personality:**\n${n.personality}`);
    if (n.readOnPc) lines.push(`**Read on the PC:** ${n.readOnPc}`);
    if (n.agenda) lines.push(`**Current Agenda:** ${n.agenda}`);
    if (n.secrets) lines.push(`**Secrets:**\n${n.secrets}`);
    if (n.canonLock) lines.push(`**Canon Lock:**\n${n.canonLock}`);
    
    return lines.join("\n");
}

// Parse raw NPC dossier HTML block into structured fields
function npcParseBlock(rawBlock) {
    const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/<\/?[^>]+>/g, "").trim();
    const data = {};

    // Single line headers
    const nameMatch = rawBlock.match(/\*\*Name:\*\*\s*(.*?)(?:\||\n|$)/i);
    if (nameMatch) data.name = strip(nameMatch[1]);
    const ageMatch = rawBlock.match(/\*\*Age:\*\*\s*(.*?)(?:\||\n|$)/i);
    if (ageMatch) data.age = strip(ageMatch[1]);
    const sexMatch = rawBlock.match(/\*\*Sex:\*\*\s*(.*?)(?:\||\n|$)/i);
    if (sexMatch) data.sex = strip(sexMatch[1]);
    const orientationMatch = rawBlock.match(/\*\*Orientation:\*\*\s*(.*?)(?:\||\n|$)/i);
    if (orientationMatch) data.orientation = strip(orientationMatch[1]);

    // Multi-line blocks up to the next ** or </details>
    const fields = [
        { key: "role", regex: /\*\*Role:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "whereToFind", regex: /\*\*Where to Find Them:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "appearance", regex: /\*\*Appearance:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "imageTags", regex: /\*\*Image Tags:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "voice", regex: /\*\*Voice:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "background", regex: /\*\*Background:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "innerCircle", regex: /\*\*Inner Circle:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "personality", regex: /\*\*Personality.*?\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "readOnPc", regex: /\*\*Read on the PC:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "agenda", regex: /\*\*Current Agenda:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "secrets", regex: /\*\*Secrets.*?\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i },
        { key: "canonLock", regex: /\*\*Canon Lock:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i }
    ];

    fields.forEach(f => {
        const m = rawBlock.match(f.regex);
        if (m) data[f.key] = m[1].trim();
    });

    // Fallbacks for older NPC saves
    if (!data.role) {
        const oldOcc = rawBlock.match(/\*\*Occupation:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i);
        if (oldOcc) data.role = oldOcc[1].trim();
    }
    if (!data.secrets) {
        const oldHid = rawBlock.match(/\*\*Hidden Layer:\*\*\s*([\s\S]*?)(?=\n\s*\*\*|<\/details>)/i);
        if (oldHid) data.secrets = oldHid[1].trim();
    }

    return data;
}

// Generate NPC portrait via ComfyUI — uses AI to generate the prompt from full NPC info
let activeNpcPfpRequest = null;

async function npcGeneratePfp(npcName) {
    const s = localProfile.imageGen;
    if (!s || !s.enabled || !s.currentWorkflowName) {
        toastr.warning("Image Generation must be enabled and configured first.");
        return null;
    }

    const npc = localProfile.npcBank.npcs.find(n => n.name === npcName);
    if (!npc) return null;

    // Build full NPC dossier text for the AI
    const npcText = npcBuildTextFromData(npc);

    let styleStr = s.promptStyle === "illustrious" ? "Use Danbooru-style tags separated by commas. Focus on anime art style." : (s.promptStyle === "sdxl" ? "Use natural, descriptive prose and full sentences. Focus on photorealism." : "Use a comma-separated list of detailed keywords and visual descriptors.");
    let perspStr = "This is a CHARACTER PORTRAIT. Frame it as an upper-body/bust shot focused on the character's face and shoulders. Soft, flattering lighting. Clean or simple background. Capture their personality through expression and posture.";

    toastr.info(`Generating portrait prompt for ${npcName}...`, "NPC Bank");
    showKazumaProgress("AI is writing portrait prompt...");

    // Step 1: Ask the AI to generate an image prompt from the NPC dossier
    activeNpcPfpRequest = { npcText, styleStr, perspStr, extraStr: s.promptExtra || "None" };

    let promptText;
    try {
        let rawOutput = await generateQuietPrompt({ prompt: "___PS_NPC_PFP___" });
        promptText = rawOutput.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

        // Try to extract <img prompt="..."> if the AI wrapped it
        const imgRegex = /<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/i;
        const match = promptText.match(imgRegex);
        if (match) promptText = match[2];
    } catch (e) {
        console.error("NPC PFP prompt generation failed:", e);
        $("#kazuma_progress_overlay").hide();
        toastr.error("Failed to generate portrait prompt.");
        activeNpcPfpRequest = null;
        return null;
    } finally {
        activeNpcPfpRequest = null;
    }

    if (!promptText || promptText.length < 5) {
        $("#kazuma_progress_overlay").hide();
        toastr.error("AI returned an empty prompt.");
        return null;
    }

    console.log(`[Megumin-Suite] NPC PFP prompt for ${npcName}: ${promptText}`);
    toastr.info("Sending portrait prompt to ComfyUI...", "NPC Bank");
    showKazumaProgress("Rendering NPC Portrait...");

    // Step 2: Send the AI-generated prompt to ComfyUI
    let workflowRaw;
    try {
        const res = await fetch('/api/sd/comfy/workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: s.currentWorkflowName }) });
        if (!res.ok) throw new Error("Load failed"); workflowRaw = await res.json();
    } catch (e) { $("#kazuma_progress_overlay").hide(); toastr.error("Could not load workflow."); return null; }

    let workflow = (typeof workflowRaw === 'string') ? JSON.parse(workflowRaw) : workflowRaw;
    let finalSeed = Math.floor(Math.random() * 1000000000);

    for (const nodeId in workflow) {
        const node = workflow[nodeId];
        if (node.inputs) {
            for (const key in node.inputs) {
                const val = node.inputs[key];
                if (val === "%prompt%") node.inputs[key] = promptText;
                if (val === "%negative_prompt%") node.inputs[key] = s.customNegative || "";
                if (val === "%seed%") node.inputs[key] = finalSeed;
                if (val === "%sampler%") node.inputs[key] = s.selectedSampler || "euler";
                if (val === "%model%") node.inputs[key] = s.selectedModel || "v1-5-pruned.ckpt";
                if (val === "%steps%") node.inputs[key] = parseInt(s.steps) || 20;
                if (val === "%scale%") node.inputs[key] = parseFloat(s.cfg) || 7.0;
                if (val === "%denoise%") node.inputs[key] = parseFloat(s.denoise) || 1.0;
                if (val === "%clip_skip%") node.inputs[key] = -Math.abs(parseInt(s.clipSkip)) || -1;
                if (val === "%lora1%") node.inputs[key] = s.selectedLora || "None";
                if (val === "%lora2%") node.inputs[key] = s.selectedLora2 || "None";
                if (val === "%lora3%") node.inputs[key] = s.selectedLora3 || "None";
                if (val === "%lora4%") node.inputs[key] = s.selectedLora4 || "None";
                if (val === "%lorawt1%") node.inputs[key] = parseFloat(s.selectedLoraWt) || 1.0;
                if (val === "%lorawt2%") node.inputs[key] = parseFloat(s.selectedLoraWt2) || 1.0;
                if (val === "%lorawt3%") node.inputs[key] = parseFloat(s.selectedLoraWt3) || 1.0;
                if (val === "%lorawt4%") node.inputs[key] = parseFloat(s.selectedLoraWt4) || 1.0;
                if (val === "%width%") node.inputs[key] = 512;
                if (val === "%height%") node.inputs[key] = 512;
            }
            if (node.class_type === "KSampler" && 'seed' in node.inputs && typeof node.inputs['seed'] === 'number') { node.inputs.seed = finalSeed; }
        }
    }

    try {
        const res = await fetch(`${s.comfyUrl}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow }) });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        showKazumaProgress("Rendering Portrait...");
        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                try {
                    const h = await (await fetch(`${s.comfyUrl}/history/${data.prompt_id}`)).json();
                    if (h[data.prompt_id]) {
                        clearInterval(checkInterval);
                        let finalImage = null;
                        for (const nodeId in h[data.prompt_id].outputs) {
                            const nodeOut = h[data.prompt_id].outputs[nodeId];
                            if (nodeOut.images && nodeOut.images.length > 0) { finalImage = nodeOut.images[0]; break; }
                        }
                        if (finalImage) {
                            const imgUrl = `${s.comfyUrl}/view?filename=${finalImage.filename}&subfolder=${finalImage.subfolder}&type=${finalImage.type}`;
                            const response = await fetch(imgUrl); const blob = await response.blob();
                            const base64 = await new Promise((r) => { const reader = new FileReader(); reader.onloadend = () => r(reader.result); reader.readAsDataURL(blob); });

                            // Compress to JPEG
                            const compressed = await new Promise((r) => {
                                const img = new Image(); img.src = base64;
                                img.onload = () => { const cvs = document.createElement('canvas'); cvs.width = img.width; cvs.height = img.height; cvs.getContext('2d').drawImage(img, 0, 0); r(cvs.toDataURL("image/jpeg", 0.85)); };
                                img.onerror = () => r(base64);
                            });

                            npc.pfp = compressed;
                            saveProfileToMemory();
                            $("#kazuma_progress_overlay").hide();
                            toastr.success(`Portrait generated for ${npcName}!`);
                            renderNpcList();
                            resolve(compressed);
                        } else {
                            $("#kazuma_progress_overlay").hide();
                            resolve(null);
                        }
                    }
                } catch (e) { }
            }, 1000);
        });
    } catch (e) { $("#kazuma_progress_overlay").hide(); toastr.error("ComfyUI Error: " + e.message); return null; }
}

function renderNpcBank(c) {
    c.empty();
    const nb = localProfile.npcBank;

    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #f43f5e, #e11d48);">
                    <i class="fa-solid fa-address-book"></i>
                </div>
                <div>
                    <h2>NPCs Bank</h2>
                    <p>Automatically extract and track significant NPCs in the story.</p>
                </div>
            </div>
            <div id="npc_header_badge" class="mtab-header-badge" style="background: ${nb.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)'}; color: ${nb.enabled ? '#10b981' : 'var(--text-muted)'}; border: 1px solid ${nb.enabled ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'};">
                <i class="fa-solid fa-${nb.enabled ? 'circle-check' : 'circle-xmark'}" style="font-size:0.6rem;"></i> ${nb.enabled ? 'Enabled' : 'Disabled'}
            </div>
        </div>

        <div class="mtab-toggle-row ${nb.enabled ? 'active' : ''}" id="npc_enable_card" style="margin-bottom: 10px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-users" style="color:#f43f5e;"></i> Enable NPC Bank</div>
                <div class="toggle-desc">When enabled, the AI generates detailed dossiers for new NPCs, which are saved here and injected when relevant.</div>
            </div>
            <div class="ps-switch"></div>
        </div>

        <div class="mtab-toggle-row ${nb.sendPortraitsToAi ? 'active' : ''}" id="npc_send_portraits" style="margin-bottom: 20px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-image" style="color:#a855f7;"></i> Send Portraits to AI</div>
                <div class="toggle-desc">If an injected NPC has a portrait, send the image to the AI to help it visualize the character.</div>
            </div>
            <div class="ps-switch"></div>
        </div>
        <div class="mtab-toggle-row ${nb.oocTrigger ? 'active' : ''}" id="npc_ooc_trigger" style="margin-bottom: 10px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-comment-slash" style="color:#a855f7;"></i> OOC Trigger (Save Tokens)</div>
                <div class="toggle-desc">When enabled, the blank NPC Dossier template (used to capture NEW characters) will ONLY be injected if the word <b>"NPC"</b> or <b>"dossier"</b> is detected in your latest message. example: (OOC: Make Npc doosier for luna.) <br><span style="color:var(--text-muted); font-size:0.7rem;"><i>(Known NPCs will still be injected normally to provide context).</i></span></div>
            </div>
            <div class="ps-switch"></div>
        </div>

        <div id="npc_main_content" style="display: ${nb.enabled ? 'block' : 'none'};">
            
            <!-- Scanner Settings -->
            <div class="mtab-panel" style="margin-top: 15px; margin-bottom: 16px;">
                <div class="mtab-panel-title gold" style="margin-bottom: 10px;"><i class="fa-solid fa-gears"></i> Scanner Settings</div>
                <div class="mtab-setting-row" style="padding-bottom: 0; border: none;">
                    <div class="set-info">
                        <div class="set-label">Scan Depth (Messages)</div>
                        <div class="set-desc">How many recent messages to read when clicking "Scan Story".<br><span style="color:var(--gold); font-weight: 600;">⚠️ Note: High numbers consume massive context limits and API tokens!</span></div>
                    </div>
                    <input type="number" id="npc_scan_depth" class="ps-modern-input" value="${nb.scanDepth || 60}" min="10" style="width: 90px; text-align: center;" />
                </div>
            </div>

            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="color: #f43f5e; font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"><i class="fa-solid fa-address-card"></i> Saved NPCs <span id="npc_count" style="color: var(--text-muted); font-size: 0.75rem; margin-left: 8px;">(${(nb.npcs || []).length})</span></div>
                    <div style="display: flex; gap: 8px;">
                        <button id="npc_btn_scan_story" class="ps-modern-btn primary" style="padding: 4px 10px; font-size: 0.72rem; background: linear-gradient(135deg, #f43f5e, #e11d48); color: #fff; border: none;"><i class="fa-solid fa-radar"></i> Scan Story</button>
                        <button id="npc_btn_clear_all" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);"><i class="fa-solid fa-trash-can"></i> Clear All</button>
                    </div>
                </div>
                <div id="npc_bank_list" style="display: flex; flex-direction: column; gap: 14px; padding: 4px;">
                </div>
            </div>
        </div>
    `);
    // --- PROMPT EDITOR UI ---
        const npcEditor = renderPromptEditor({
            id: "npc_prompt_editor",
            title: "Advanced: Edit NPC Prompts",
            defaultData: DEFAULT_PROMPTS.npcBank,
            currentData: nb.customPrompts,
            enabled: nb.customPromptsEnabled, // <-- NEW
            onToggle: (val) => { nb.customPromptsEnabled = val; saveProfileToMemory(); }, // <-- NEW
            fields: [
                { key: "systemPrompt", label: "Portrait AI: System Prompt", hint: "AI role definition for image generation." },
                { key: "userPrompt", label: "Portrait AI: User Task Prompt", hint: "Tokens: <code>{{npcText}}</code>, <code>{{styleStr}}</code>, <code>{{perspStr}}</code>, <code>{{extraStr}}</code>" },
                { key: "thinkingPrompt", label: "Portrait AI: Thinking Instructions", hint: "Must include output ordering instructions." },
                { key: "dossierTemplate", label: "Chat AI: Dossier Injection Template", hint: "The strict format template the main AI uses to extract and format new NPCs into the chat." }
            ],
            onSave: (val, key) => {
                if (!nb.customPrompts) nb.customPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.npcBank));
                nb.customPrompts[key] = val;
                saveProfileToMemory();
                return nb.customPrompts;
            },
            onReset: () => {
            nb.customPrompts = null;
            saveProfileToMemory();
        }
    });

    c.find('#npc_main_content').append(npcEditor);

    $("#npc_enable_card").on("click", function () {
        nb.enabled = !nb.enabled; saveProfileToMemory();
        if (nb.enabled) {
            $(this).addClass("active").css("border-color", "var(--gold)");
            $("#npc_main_content").slideDown(200);
            $("#npc_header_badge").css({ background: 'rgba(16,185,129,0.12)', color: '#10b981', 'border-color': 'rgba(16,185,129,0.25)' }).html(`<i class="fa-solid fa-circle-check" style="font-size:0.6rem;"></i> Enabled`);
            renderNpcList();
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
            $("#npc_main_content").slideUp(200);
            $("#npc_header_badge").css({ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', 'border-color': 'var(--border-color)' }).html(`<i class="fa-solid fa-circle-xmark" style="font-size:0.6rem;"></i> Disabled`);
        }
    });

    $("#npc_ooc_trigger").on("click", function () {
        nb.oocTrigger = !nb.oocTrigger; saveProfileToMemory();
        if (nb.oocTrigger) {
            $(this).addClass("active").css("border-color", "var(--gold)");
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
        }
    });

    $("#npc_btn_clear_all").on("click", function () {
        if (!localProfile.npcBank.npcs || localProfile.npcBank.npcs.length === 0) return;
        if (confirm("Are you sure you want to delete all saved NPCs? This cannot be undone.")) {
            localProfile.npcBank.npcs = [];
            saveProfileToMemory();
            renderNpcList();
        }
    });

    $("#npc_btn_scan_story").on("click", async function () {
        const chatText = getChatForNpcScan();
        if (chatText.length < 100) return toastr.warning("Not enough chat history to scan.");
        
        const btn = $(this);
        btn.prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Scanning...`);
        
        try {
            const existingNames = (localProfile.npcBank.npcs || []).map(n => n.name).join(", ");
            activeNpcScanRequest = { chatText, existingNames };
            
            let rawOutput = await generateQuietPrompt({ prompt: "___PS_NPC_SCAN___" });
            
            const npcRegex = /<details>[\s\S]*?<summary>.*?New NPC:\s*(.*?)<\/summary>([\s\S]*?)<\/details>/ig;
            let match;
            let addedCount = 0;
            while ((match = npcRegex.exec(rawOutput)) !== null) {
                const npcName = match[1].trim().replace(/<\/?b>/ig, "");
                const npcContent = match[0].trim();
                if (!localProfile.npcBank.npcs) localProfile.npcBank.npcs = [];
                if (!localProfile.npcBank.npcs.find(n => (n.name || "").trim().toLowerCase() === npcName.toLowerCase())) {
                    const parsed = npcParseBlock(npcContent);
                    localProfile.npcBank.npcs.push({
                        name: parsed.name || npcName,
                        age: parsed.age || "",
                        sex: parsed.sex || "",
                        orientation: parsed.orientation || "",
                        role: parsed.role || "",
                        whereToFind: parsed.whereToFind || "",
                        appearance: parsed.appearance || "",
                        imageTags: parsed.imageTags || "",
                        imageOnly: false,
                        voice: parsed.voice || "",
                        background: parsed.background || "",
                        innerCircle: parsed.innerCircle || "",
                        personality: parsed.personality || "",
                        readOnPc: parsed.readOnPc || "",
                        agenda: parsed.agenda || "",
                        secrets: parsed.secrets || "",
                        canonLock: parsed.canonLock || "",
                        pfp: "",
                        timestamp: Date.now()
                    });
                    addedCount++;
                }
            }
            
            if (addedCount > 0) {
                saveProfileToMemory();
                renderNpcList();
                toastr.success(`Found and added ${addedCount} new NPC(s)!`);
            } else {
                toastr.info("No new significant NPCs found in the story.");
            }
        } catch (e) {
            console.error("NPC Scan Error:", e);
            toastr.error("Failed to scan story for NPCs.");
        } finally {
            activeNpcScanRequest = null;
            btn.prop("disabled", false).html(`<i class="fa-solid fa-radar"></i> Scan Story`);
        }
    });

    $("#npc_send_portraits").on("click", function () {
        nb.sendPortraitsToAi = !nb.sendPortraitsToAi; saveProfileToMemory();
        if (nb.sendPortraitsToAi) {
            $(this).addClass("active").css("border-color", "var(--gold)");
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
        }
    });

    $("#npc_scan_depth").on("input change", function() {
        let val = parseInt($(this).val());
        if (isNaN(val) || val < 1) val = 60;
        localProfile.npcBank.scanDepth = val;
        saveProfileToMemory();
    });

    if (nb.enabled) renderNpcList();
}

function renderNpcList() {
    const list = $("#npc_bank_list");
    list.empty();
    if (!localProfile.npcBank.npcs) localProfile.npcBank.npcs = [];
    const npcs = localProfile.npcBank.npcs;
    $("#npc_count").text(`(${npcs.length})`);

    if (npcs.length === 0) {
        list.append('<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 20px;">No NPCs saved yet. The AI will add them automatically when significant NPCs are introduced.</div>');
        return;
    }

    const npcFieldMeta = [
        { key: "role", label: "Role", icon: "fa-briefcase", color: "#60a5fa" },
        { key: "whereToFind", label: "Where to Find", icon: "fa-map-location-dot", color: "#34d399" },
        { key: "appearance", label: "Appearance", icon: "fa-eye", color: "#a78bfa" },
        { key: "imageTags", label: "Image Tags", icon: "fa-tags", color: "#f472b6" },
        { key: "voice", label: "Voice", icon: "fa-comment-dots", color: "#fbbf24" },
        { key: "background", label: "Background", icon: "fa-book", color: "#34d399" },
        { key: "innerCircle", label: "Inner Circle", icon: "fa-people-group", color: "#fbbf24" },
        { key: "personality", label: "Personality", icon: "fa-masks-theater", color: "#f472b6" },
        { key: "readOnPc", label: "Read on PC", icon: "fa-magnifying-glass", color: "#60a5fa" },
        { key: "agenda", label: "Current Agenda", icon: "fa-bullseye", color: "#fb923c" },
        { key: "secrets", label: "Secrets", icon: "fa-user-secret", color: "#ef4444" },
        { key: "canonLock", label: "Canon Lock", icon: "fa-lock", color: "#a855f7" }
    ];

    [...npcs].reverse().forEach((n, revIdx) => {
        const idx = npcs.length - 1 - revIdx;
        const dateStr = new Date(n.timestamp).toLocaleDateString();
        const pfpSrc = n.pfp || "";

        // Dynamic color based on sex: Blue for male, Red/pink for female/other
        const isMale = (n.sex || "").trim().toLowerCase().startsWith("m");
        const accentColor = isMale ? "#3b82f6" : "#f43f5e";
        const accentRgba = isMale ? "59,130,246" : "244,63,94";
        const gradientFrom = isMale ? "rgba(59,130,246,0.15)" : "rgba(244,63,94,0.15)";
        const gradientTo = isMale ? "rgba(29,78,216,0.08)" : "rgba(225,29,72,0.08)";

        const pfpDisplay = pfpSrc ? `<img src="${pfpSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;color:${accentColor};"><i class="fa-solid fa-user-secret"></i></div>`;

        let fieldsHTML = "";
        npcFieldMeta.forEach(fm => {
            const val = n[fm.key] || "";
            fieldsHTML += `
                <div class="npc-field-section" style="margin-bottom: 6px;">
                    <div style="font-size: 0.65rem; color: ${fm.color}; font-weight: 600; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid ${fm.icon}" style="font-size: 0.6rem;"></i> ${fm.label}
                    </div>
                    <textarea class="ps-modern-input npc_field_edit" data-idx="${idx}" data-field="${fm.key}" 
                        style="height: ${['background', 'innerCircle', 'personality', 'secrets', 'canonLock', 'imageTags'].includes(fm.key) ? '60' : '32'}px; resize: vertical; font-size: 0.7rem; padding: 4px 6px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; line-height: 1.3;"
                    >${val}</textarea>
                </div>`;
        });

        const miniPfp = pfpSrc ? `<img src="${pfpSrc}" style="width:28px;height:28px;object-fit:cover;border-radius:6px;border:1px solid rgba(${accentRgba},0.3);" />` : "";

        const card = $(`
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(${accentRgba},0.2); border-radius: 12px; overflow: hidden; transition: border-color 0.2s;" class="npc-card" data-accent-rgba="${accentRgba}">
                <!-- Header (clickable to toggle) -->
                <div class="npc-card-header" style="background: linear-gradient(135deg, ${gradientFrom}, ${gradientTo}); padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-chevron-right npc-chevron" style="font-size: 0.6rem; color: ${accentColor}; transition: transform 0.2s;"></i>
                        ${miniPfp}
                        <span style="font-size: 0.85rem; font-weight: 700; color: ${accentColor};">${n.name}</span>
                        <button class="npc_edit_name_btn" data-idx="${idx}" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.7rem; padding: 2px 4px; margin-left: -4px;" title="Edit Name"><i class="fa-solid fa-pen"></i></button>
                        <span style="font-size: 0.6rem; color: var(--text-muted); background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${n.age || "?"} · ${n.sex || "?"}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <!-- New Image Tags Only Toggle -->
                        <div class="npc_img_only_toggle" data-idx="${idx}" style="display: flex; align-items: center; gap: 6px; cursor: pointer; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 8px; border: 1px solid ${n.imageOnly ? 'rgba(16,185,129,0.3)' : 'transparent'};" title="If enabled, hides the text dossier from the AI to save tokens, but still sends Image Tags to ComfyUI.">
                            <span style="font-size: 0.65rem; font-weight: 700; color: ${n.imageOnly ? '#10b981' : 'var(--text-muted)'};">Image Tags Only</span>
                            <div class="ps-toggle-card ${n.imageOnly ? 'active' : ''}" style="padding: 2px; min-width: 36px; background: transparent; border-color: ${n.imageOnly ? '#10b981' : 'rgba(255,255,255,0.1)'}; border-radius: 8px;">
                                <div class="ps-switch" style="transform: scale(0.65); ${n.imageOnly ? 'background: #10b981;' : ''}"></div>
                            </div>
                        </div>

                        <span style="color: var(--text-muted); font-size: 0.6rem;">${dateStr}</span>
                        <button class="npc_del_btn" data-idx="${idx}" style="background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 0.75rem; padding: 2px 4px;" title="Delete NPC"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <!-- Body (collapsed by default) -->
                <div class="npc-card-body" style="display: none; border-top: 1px solid rgba(${accentRgba},0.15);">
                    <div style="display: flex; gap: 12px; padding: 12px;">
                        <!-- PFP Column -->
                        <div style="flex-shrink: 0; width: 160px; display: flex; flex-direction: column; gap: 8px;">
                            <div class="npc-pfp-container" style="width: 160px; height: 240px; border-radius: 10px; overflow: hidden; border: 2px solid rgba(${accentRgba},0.3); background: rgba(0,0,0,0.4);">
                                ${pfpDisplay}
                            </div>
                            <div style="text-align: center; font-size: 0.95rem; font-weight: 800; color: ${accentColor}; margin-top: 2px; margin-bottom: 2px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${n.name}</div>
                            <button class="npc_upload_pfp" data-idx="${idx}" style="width: 100%; font-size: 0.65rem; padding: 4px 0; border-radius: 6px; border: 1px solid rgba(${accentRgba},0.3); background: rgba(${accentRgba},0.1); color: ${accentColor}; cursor: pointer; transition: background 0.2s;" title="Upload Image">
                                <i class="fa-solid fa-upload"></i> Upload
                            </button>
                            <button class="npc_gen_pfp" data-idx="${idx}" data-name="${n.name}" style="width: 100%; font-size: 0.65rem; padding: 4px 0; border-radius: 6px; border: 1px solid rgba(168,85,247,0.3); background: rgba(168,85,247,0.1); color: #a855f7; cursor: pointer; transition: background 0.2s;" title="Generate with ComfyUI">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Generate
                            </button>
                        </div>
                        <!-- Fields Column -->
                        <div style="flex: 1; min-width: 0;">
                            ${fieldsHTML}
                        </div>
                    </div>
                </div>
            </div>
        `);

        // Hover effect — dynamic color
        card.on("mouseenter", function () { $(this).css("border-color", `rgba(${$(this).attr('data-accent-rgba')},0.5)`); });
        card.on("mouseleave", function () { $(this).css("border-color", `rgba(${$(this).attr('data-accent-rgba')},0.2)`); });

        // Collapse / Expand toggle
        card.find(".npc-card-header").on("click", function (e) {
            if ($(e.target).closest(".npc_del_btn").length) return; // Don't toggle when clicking delete
            const body = $(this).siblings(".npc-card-body");
            const chevron = $(this).find(".npc-chevron");
            body.slideToggle(200);
            chevron.css("transform", body.is(":visible") ? "rotate(0deg)" : "rotate(90deg)");
        });

        // Field editing
        card.find(".npc_field_edit").on("change", function () {
            const i = parseInt($(this).attr("data-idx"));
            const field = $(this).attr("data-field");
            if (localProfile.npcBank.npcs[i]) {
                localProfile.npcBank.npcs[i][field] = $(this).val();
                saveProfileToMemory();
            }
        });

        // Image Tags Only Toggle
        card.find(".npc_img_only_toggle").on("click", function (e) {
            e.stopPropagation(); // Prevents the accordion from collapsing when clicking the toggle
            const i = parseInt($(this).attr("data-idx"));
            if (localProfile.npcBank.npcs[i]) {
                localProfile.npcBank.npcs[i].imageOnly = !localProfile.npcBank.npcs[i].imageOnly;
                saveProfileToMemory();
                renderNpcList();
                
                if (localProfile.npcBank.npcs[i].imageOnly) {
                    toastr.info("Image Tags Only enabled. Text dossier will be hidden from AI.");
                } else {
                    toastr.info("Full Sync enabled. Text dossier will be sent to AI.");
                }
            }
        });

        // Edit Name
        card.find(".npc_edit_name_btn").on("click", function (e) {
            e.stopPropagation();
            const i = parseInt($(this).attr("data-idx"));
            const currentName = localProfile.npcBank.npcs[i].name;
            const newName = prompt("Enter new name for this NPC:", currentName);
            if (newName && newName.trim() !== "" && newName !== currentName) {
                localProfile.npcBank.npcs[i].name = newName.trim();
                saveProfileToMemory();
                renderNpcList();
            }
        });

        // Delete
        card.find(".npc_del_btn").on("click", function () {
            const i = parseInt($(this).attr("data-idx"));
            if (confirm(`Delete ${localProfile.npcBank.npcs[i]?.name || "this NPC"}?`)) {
                localProfile.npcBank.npcs.splice(i, 1);
                saveProfileToMemory();
                renderNpcList();
            }
        });

        // Upload PFP
        card.find(".npc_upload_pfp").on("click", function () {
            const i = parseInt($(this).attr("data-idx"));
            const input = document.createElement("input");
            input.type = "file"; input.accept = "image/*";
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    // Compress to reasonable size
                    const img = new Image();
                    img.onload = () => {
                        const cvs = document.createElement("canvas");
                        const maxSize = 256;
                        let w = img.width, h = img.height;
                        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                        else { w = Math.round(w * maxSize / h); h = maxSize; }
                        cvs.width = w; cvs.height = h;
                        cvs.getContext("2d").drawImage(img, 0, 0, w, h);
                        const compressed = cvs.toDataURL("image/jpeg", 0.85);
                        localProfile.npcBank.npcs[i].pfp = compressed;
                        saveProfileToMemory();
                        renderNpcList();
                        toastr.success("Portrait uploaded!");
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });

        // Generate PFP via ComfyUI
        card.find(".npc_gen_pfp").on("click", async function () {
            const name = $(this).attr("data-name");
            await npcGeneratePfp(name);
        });

        list.append(card);
    });
}

// -------------------------------------------------------------
// STAGE 9: MEMORY CORE (3-Tier Context)
// -------------------------------------------------------------
function renderMemoryCore(c) {
    c.empty();
    const mem = localProfile.memoryCore;

    c.append(`
        <!-- HEADER -->
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
                    <i class="fa-solid fa-memory"></i>
                </div>
                <div>
                    <h2>Memory Core</h2>
                    <p>3-Tier Context Management: Working, Short-Term, and Long-Term Vector DB.</p>
                </div>
            </div>
            <div id="mem_header_badge" class="mtab-header-badge" style="background: ${mem.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)'}; color: ${mem.enabled ? '#10b981' : 'var(--text-muted)'}; border: 1px solid ${mem.enabled ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'};">
                <i class="fa-solid fa-${mem.enabled ? 'circle-check' : 'circle-xmark'}" style="font-size:0.6rem;"></i> ${mem.enabled ? 'Enabled' : 'Disabled'}
            </div>
        </div>

        <!-- MASTER TOGGLE -->
        <div class="mtab-toggle-row ${mem.enabled ? 'active' : ''}" id="mem_enable_card" style="margin-bottom: 20px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-microchip" style="color:#10b981;"></i> Enable Memory Core</div>
                <div class="toggle-desc">Archiving happens silently in the background. Old messages fade in the UI and are replaced in the prompt with injected summaries.</div>
            </div>
            <div class="ps-switch"></div>
        </div>

        <div id="mem_main_content" style="display: ${mem.enabled ? 'block' : 'none'};">
            
            <!-- Dashboard Progress Bar -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                    <div class="mtab-panel-title green" style="margin:0;"><i class="fa-solid fa-chart-gantt"></i> Context Allocation Dashboard</div>
                    <div style="font-size: 0.75rem; font-weight: 800; color: #10b981; background: rgba(16,185,129,0.1); padding: 4px 12px; border-radius: 12px; border: 1px solid rgba(16,185,129,0.3); box-shadow: 0 0 10px rgba(16,185,129,0.2);">
                        <i class="fa-solid fa-floppy-disk"></i> <span id="mem_live_tokens_saved">~0</span> Tokens Saved
                    </div>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span><i class="fa-solid fa-circle" style="color: #3b82f6; font-size: 0.5rem;"></i> Vault</span>
                    <span id="mem_dash_short_lbl" style="display:${mem.architecture === 'raw_long' ? 'none' : 'inline'};">
                        <i class="fa-solid fa-circle" style="color: #f59e0b; font-size: 0.5rem;"></i> Short-Term
                    </span>
                    <span><i class="fa-solid fa-circle-half-stroke" style="color: #047857; font-size: 0.5rem;"></i> Pending</span>
                    <span><i class="fa-solid fa-circle" style="color: #10b981; font-size: 0.5rem;"></i> Working</span>
                </div>
                <div class="mem-progress-container" style="background: rgba(0,0,0,0.6); display: flex;">
                    <!-- Oldest on Left -->
                    <div id="mem_bar_long" style="background: #3b82f6; transition: width 0.2s ease;" title="Vaulted (Archived)"></div>
                    <div id="mem_bar_short" style="background: #f59e0b; transition: width 0.2s ease;" title="Short-Term (Summaries)"></div>
                    <div id="mem_bar_pend" style="background: repeating-linear-gradient(45deg, #047857, #047857 10px, #10b981 10px, #10b981 20px); transition: width 0.2s ease;" title="Pending (Active Raw)"></div>
                    <div id="mem_bar_work" style="background: #10b981; transition: width 0.2s ease;" title="Working (Active Raw)"></div>
                    <!-- Newest on Right -->
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); margin-top: 4px; opacity: 0.7; font-weight: bold;">
                    <span>&larr; Oldest (First Message)</span>
                    <span>Newest (Last Message) &rarr;</span>
                </div>
                <div style="margin-top: 10px; font-size: 0.7rem; color: var(--text-muted); text-align: center;" id="mem_status_text">
                    Monitoring Chat History...
                </div>
            </div>

            <!-- Engine Settings -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div class="mtab-panel-title gold"><i class="fa-solid fa-gears"></i> Extraction Engine Settings</div>
                
                <!-- Quick Help / Hint -->
                <div style="background: rgba(245,158,11,0.1); border-left: 3px solid #f59e0b; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 0.8rem; color: var(--text-main);">
                    <div style="color: #f59e0b; font-weight: bold; margin-bottom: 6px;"><i class="fa-solid fa-circle-info"></i> How to Use</div>
                    <div style="color: var(--text-muted); line-height: 1.4;">
                        1- Choose your Memory Architecture and how much of each type you want (default is 30 raw, 70 summary).<br>
                        2- Hit <b>Apply & Extract Pending</b> to save and start it.<br>
                        3- You can choose between manual and auto. For manual, you have to hit <b>Apply & Extract Pending</b> to trigger it.
                    </div>
                </div>

                <!-- Architecture Preset Dropdown -->
                <div class="mtab-setting-row" style="padding-top: 0;">
                    <div class="set-info">
                        <div class="set-label">Memory Architecture</div>
                        <div class="set-desc">Configure how memory tiers are structured: Raw text, short-term summaries, and long-term vector database, or bypass summaries to save API usage.</div>
                    </div>
                    <select id="mem_architecture" class="ps-modern-input" style="width: 280px; cursor: pointer; color: var(--gold); border-color: rgba(245,158,11,0.3);">
                        <option value="raw_short_long" ${mem.architecture === 'raw_short_long' ? 'selected' : ''}>Raw Text + Short-Term Summaries + Vault</option>
                        <option value="raw_long" ${mem.architecture === 'raw_long' ? 'selected' : ''}>Raw Text + Vault Directly (Skip Summaries)</option>
                    </select>
                </div>

                <!-- Sliders Container -->
                <div style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 10px; border: 1px solid var(--border-color); margin-bottom: 15px;">
                    <div class="mtab-param-row">
                        <span class="param-label" style="width:120px;">Working Limit</span>
                        <input type="range" id="mem_work_slider" min="${mem.chunkSize || 10}" max="300" step="${mem.chunkSize || 10}" value="${mem.workingLimit}">
                        <span id="mem_work_val" style="font-size:0.8rem; font-weight:bold; min-width:30px; text-align:right;">${mem.workingLimit}</span>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-left: 130px; margin-top: -4px; margin-bottom: 12px; line-height: 1.3;">
                        Number of recent messages kept in raw, unmodified text format in the prompt. High limits consume more active context space.
                    </div>

                    <div class="mtab-param-row" id="mem_short_slider_row" style="display:${mem.architecture === 'raw_long' ? 'none' : 'flex'};">
                        <span class="param-label" style="width:120px;">Short-Term Limit</span>
                        <input type="range" id="mem_short_slider" min="${mem.chunkSize || 10}" max="1000" step="${mem.chunkSize || 10}" value="${mem.shortTermLimit}">
                        <span id="mem_short_val" style="font-size:0.8rem; font-weight:bold; min-width:30px; text-align:right;">${mem.shortTermLimit}</span>
                    </div>
                    <div id="mem_short_desc_row" style="font-size: 0.72rem; color: var(--text-muted); margin-left: 130px; margin-top: -4px; margin-bottom: 12px; line-height: 1.3; display:${mem.architecture === 'raw_long' ? 'none' : 'block'};">
                        Range of past messages to keep summarized. Summaries are automatically created in blocks and injected chronologically.
                    </div>

                    <!-- CHUNK SIZE SLIDER -->
                    <div class="mtab-param-row">
                        <span class="param-label" style="width:120px;">Chunk Size</span>
                        <input type="range" id="mem_chunk_slider" min="10" max="40" step="10" value="${mem.chunkSize || 10}">
                        <span id="mem_chunk_val" style="font-size:0.8rem; font-weight:bold; min-width:30px; text-align:right;">${mem.chunkSize || 10}</span>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-left: 130px; margin-top: -4px; margin-bottom: 8px; line-height: 1.3;">
                        Smaller chunks = more granular summaries but more API calls. Larger chunks = fewer calls but coarser memory.
                    </div>
                    
                    <!-- NEW APPLY BUTTON -->
                    <div style="margin-top: 15px; display: flex; justify-content: flex-end; border-top: 1px dashed var(--border-color); padding-top: 15px;">
                        <button id="mem_btn_apply_limits" class="ps-modern-btn secondary" style="color: #10b981; border-color: rgba(16,185,129,0.3); font-size: 0.75rem; padding: 6px 14px;">
                            <i class="fa-solid fa-arrows-rotate"></i> Apply & Extract Pending
                        </button>
                    </div>
                </div>

                <div class="mtab-setting-row" style="border-top: 1px solid rgba(255,255,255,0.04); padding-top: 14px;">
                    <div class="set-info">
                        <div class="set-label">Generator Backend</div>
                        <div class="set-desc">Bypass standard preset configs for fast direct API calls, or use defined Megumin engine settings for character-style summaries.</div>
                    </div>
                    <select id="mem_backend" class="ps-modern-input" style="width: 220px; cursor: pointer;">
                        <option value="direct" ${mem.backend === 'direct' ? 'selected' : ''}>Direct API Call (Fast)</option>
                        <option value="preset" ${mem.backend === 'preset' ? 'selected' : ''}>Megumin Engine Preset</option>
                    </select>
                </div>
                <div class="mtab-setting-row" style="border-top: 1px solid rgba(255,255,255,0.04); padding-top: 14px;">
                    <div class="set-info">
                        <div class="set-label">Vault Scanner Engine</div>
                        <div class="set-desc">Select the retrieval engine for matching long-term memories. TF-IDF runs locally, while Semantic Embeddings use Vector Storage.</div>
                    </div>
                    <select id="mem_scanner_engine" class="ps-modern-input" style="width: 280px; cursor: pointer;">
                        <option value="tfidf" ${mem.scannerEngine === 'tfidf' ? 'selected' : ''}>TF-IDF Keyword Matcher</option>
                        <option value="semantic" ${mem.scannerEngine === 'semantic' ? 'selected' : ''}>Semantic Embeddings (ST Native API)</option>
                    </select>
                </div>
                <div class="mtab-setting-row">
                    <div class="set-info">
                        <div class="set-label">Auto-Trigger Mode</div>
                        <div class="set-desc">Trigger background memory sweeps. 'Every Reply' checks after every message, wait-pooling messages until a full chunk accumulates.</div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <select id="mem_trigger" class="ps-modern-input" style="width: 150px; cursor: pointer;">
                            <option value="manual" ${mem.triggerMode === 'manual' ? 'selected' : ''}>Manual Only</option>
                            <option value="every" ${mem.triggerMode === 'every' ? 'selected' : ''}>Every Reply</option>
                            <option value="frequency" ${mem.triggerMode === 'frequency' ? 'selected' : ''}>Every N Replies</option>
                        </select>
                        <select id="mem_freq_val" class="ps-modern-input" style="width: 80px; cursor: pointer; display: ${mem.triggerMode === 'frequency' ? 'block' : 'none'};">
                            <option value="5" ${mem.autoFreq === 5 ? 'selected' : ''}>5</option>
                            <option value="10" ${mem.autoFreq === 10 || !mem.autoFreq ? 'selected' : ''}>10</option>
                            <option value="15" ${mem.autoFreq === 15 ? 'selected' : ''}>15</option>
                            <option value="20" ${mem.autoFreq === 20 ? 'selected' : ''}>20</option>
                            <option value="30" ${mem.autoFreq === 30 ? 'selected' : ''}>30</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Short-Term Editor -->
            <div class="mtab-panel" style="margin-bottom:16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                    <div class="mtab-panel-title gold" style="margin-bottom:0;">
                        <i class="fa-solid fa-box-archive"></i> Short-Term Memory
                        <span id="mem_processing_spinner" style="display:none; margin-left: 10px;" class="mem-spinner"><i class="fa-solid fa-circle-notch"></i></span>
                        <span id="mem_processing_progress" style="display:none; margin-left: 8px; font-size: 0.72rem; color: var(--text-muted); font-weight: normal; vertical-align: middle;"></span>
                    </div>
                    <button id="mem_btn_clear_short" class="ps-modern-btn secondary" style="padding: 4px 10px; font-size: 0.72rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);"><i class="fa-solid fa-trash-can"></i> Clear All</button>
                </div>
                
                <div id="mem_short_term_list">
                    <!-- Accordions Injected Here -->
                </div>
            </div>

            <!-- Long-Term Vault -->
            <div class="mtab-panel">
                <div class="mtab-panel-title blue" style="display:flex; justify-content:space-between;">
                    <span><i class="fa-solid fa-database"></i> Long-Term Vault (Vector Storage)</span>
                    <span id="mem_vault_count" style="font-size:0.7rem; color:var(--text-muted);">0 Entries</span>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <input type="text" id="mem_vault_search" class="ps-modern-input" placeholder="Search archived memories..." style="flex: 1; border-color: rgba(59,130,246,0.3);">
                    <button id="mem_btn_test_vector" class="ps-modern-btn secondary" style="color: #3b82f6; border-color: rgba(59,130,246,0.3);" title="See what memories the AI is retrieving right now"><i class="fa-solid fa-radar"></i> Test Scanner</button>
                    <button id="mem_btn_clear_vault" class="ps-modern-btn secondary" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" title="Delete all Vault Archives"><i class="fa-solid fa-trash-can"></i> Clear All</button>
                </div>
                <div id="mem_vault_list" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                    <!-- Vault items injected here -->
                </div>
            </div>
        </div>
    `);

    // Clear All Short-Term Memory
    $("#mem_btn_clear_short").off("click").on("click", function () {
        const mem = localProfile.memoryCore;
        if (!mem.shortTermChunks || mem.shortTermChunks.length === 0) return toastr.info("Short-Term memory is already empty.");
        
        if (confirm("Are you sure you want to delete ALL Short-Term Memory chunks? They will revert to 'Pending' status.")) {
            mem.shortTermChunks = [];
            delete mem._archivedSet; mem._tokensDirty = true;
            saveProfileToMemory();
            memRenderAccordion();
            memRenderDashboard();
            updateMemoryVisuals();
            toastr.success("Short-Term Memory cleared.");
        }
    });

    // Clear All Long-Term Vault
    $("#mem_btn_clear_vault").off("click").on("click", async function () {
        const mem = localProfile.memoryCore;
        if (!mem.longTermVault || mem.longTermVault.length === 0) return toastr.info("Vault is already empty.");
        
        if (confirm("WARNING: Are you sure you want to permanently delete ALL Long-Term Vault archives? This cannot be undone.")) {
            
            // If Semantic Mode is active, wipe them from the actual SillyTavern Vector DB
            if (mem.scannerEngine === 'semantic') {
                const allIds = mem.longTermVault.map(v => v.id);
                await memDeleteFromVectorDB(allIds);
            }
            
            mem.longTermVault = [];
            delete mem._archivedSet; mem._tokensDirty = true;
            saveProfileToMemory();
            memRenderVault($("#mem_vault_search").val() || "");
            memRenderDashboard();
            updateMemoryVisuals();
            toastr.success("Long-Term Vault cleared.");
        }
    });

    // --- PROMPT EDITOR UI ---
    const memEditor = renderPromptEditor({
        id: "mem_prompt_editor",
        title: "Advanced: Edit Prompts",
        defaultData: DEFAULT_PROMPTS.memoryCore,
        currentData: mem.customPrompts,
        enabled: mem.customPromptsEnabled, // <-- NEW
        onToggle: (val) => { mem.customPromptsEnabled = val; saveProfileToMemory(); }, // <-- NEW
        fields: [
            { key: "systemPrompt", label: "System Prompt", hint: "Summarizer system prompt." },
            { key: "userPrompt", label: "User Task Prompt", hint: "Tokens: <code>{{chatHistory}}</code>, <code>{{targetLang}}</code>" },
            { key: "longTermTemplate", label: "Long-Term Memory Template", hint: "Tokens: <code>{{archiveXML}}</code>" },
            { key: "shortTermTemplate", label: "Short-Term Memory Template", hint: "Tokens: <code>{{shortXML}}</code>" }
        ],
        onSave: (val, key) => {
            if (!mem.customPrompts) mem.customPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.memoryCore));
            mem.customPrompts[key] = val;
            saveProfileToMemory();
            return mem.customPrompts;
        },
        onReset: () => {
            mem.customPrompts = null;
            saveProfileToMemory();
        }
    });
    c.find('#mem_main_content').append(memEditor);

    // Toggle Listener
    $("#mem_enable_card").on("click", function () {
        mem.enabled = !mem.enabled;
        
        let isFirstEnable = false;
        if (mem.enabled) {
            if ((!mem.shortTermChunks || mem.shortTermChunks.length === 0) && 
                (!mem.longTermVault || mem.longTermVault.length === 0) && 
                mem.triggerMode === "frequency") {
                mem.triggerMode = "every";
                isFirstEnable = true;
            }
        }
        
        saveProfileToMemory();
        
        if (mem.enabled) {
            $(this).addClass("active").css("border-color", "var(--gold)");
            $("#mem_main_content").slideDown(200);
            $("#mem_header_badge").css({ background: 'rgba(16,185,129,0.12)', color: '#10b981', 'border-color': 'rgba(16,185,129,0.25)' }).html(`<i class="fa-solid fa-circle-check" style="font-size:0.6rem;"></i> Enabled`);
            
            if (isFirstEnable) {
                toastr.success("Memory Core activated! Auto-archiving on every reply.", "Megumin Suite");
                // Re-render to update the dropdowns and settings values in the UI
                setTimeout(() => renderMemoryCore(c), 200);
            } else {
                memRenderDashboard();
            }
        } else {
            $(this).removeClass("active").css("border-color", "var(--border-color)");
            $("#mem_main_content").slideUp(200);
            $("#mem_header_badge").css({ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', 'border-color': 'var(--border-color)' }).html(`<i class="fa-solid fa-circle-xmark" style="font-size:0.6rem;"></i> Disabled`);
        }
        updateMemoryVisuals();
    });

    // Slider & Architecture Listeners
    $("#mem_architecture").on("change", function () {
        mem.architecture = $(this).val();
        if (mem.architecture === "raw_long") {
            $("#mem_short_slider_row").hide();
            $("#mem_short_desc_row").hide();
            $("#mem_dash_short_lbl").hide();
            $("#mem_bar_short, #mem_bar_short_pend").hide();
        } else {
            $("#mem_short_slider_row").css("display", "flex");
            $("#mem_short_desc_row").show();
            $("#mem_dash_short_lbl").show();
            $("#mem_bar_short, #mem_bar_short_pend").css("display", "block");
        }
        saveProfileToMemory();
        memRunVaultMigration();
        memRenderDashboard();
    });

    $("#mem_work_slider").on("input", function () {
        let val = parseInt($(this).val());
        mem.workingLimit = val;
        $("#mem_work_val").text(val);

        // Short-term is now independent, no forced minimums based on working limit
        saveProfileToMemory();
        memRenderDashboard();
    });

    $("#mem_scanner_engine").on("change", async function () {
        mem.scannerEngine = $(this).val();
        saveProfileToMemory();
        if (mem.scannerEngine === 'semantic') {
            toastr.info("Semantic Mode active. Syncing vault to Vector Database...");
            await memInsertToVectorDB(mem.longTermVault);
            await memUpdateSemanticQuery();
            toastr.success("Vector Database Synced!");
        }
    });

    // Trigger migration ONLY on 'change' (when they let go of the mouse click) to avoid spamming calculations
    $("#mem_work_slider").on("change", function () { memRunVaultMigration(); });

    $("#mem_short_slider").on("input", function () {
        let val = parseInt($(this).val());
        mem.shortTermLimit = val;
        $("#mem_short_val").text(val);
        saveProfileToMemory();
        memRenderDashboard();
    });
    $("#mem_short_slider").on("change", function () { memRunVaultMigration(); });

    $("#mem_chunk_slider").on("input", function () {
        let val = parseInt($(this).val());
        mem.chunkSize = val;
        $("#mem_chunk_val").text(val);

        // Update step and min for dependent sliders
        $("#mem_work_slider").attr("step", val).attr("min", val);
        $("#mem_short_slider").attr("step", val).attr("min", val);

        // Snap working limit to a multiple of chunk size
        let workVal = parseInt($("#mem_work_slider").val());
        workVal = Math.max(val, Math.round(workVal / val) * val);
        mem.workingLimit = workVal;
        $("#mem_work_slider").val(workVal);
        $("#mem_work_val").text(workVal);

        // Snap short limit to a multiple of chunk size
        let shortVal = parseInt($("#mem_short_slider").val());
        shortVal = Math.max(val, Math.round(shortVal / val) * val);
        mem.shortTermLimit = shortVal;
        $("#mem_short_slider").val(shortVal);
        $("#mem_short_val").text(shortVal);

        saveProfileToMemory();
        memRenderDashboard();
    });
    $("#mem_chunk_slider").on("change", function () { memRunVaultMigration(); });

    $("#mem_trigger").on("change", function () {
        mem.triggerMode = $(this).val();
        if (mem.triggerMode === "frequency") {
            $("#mem_freq_val").show();
        } else {
            $("#mem_freq_val").hide();
        }
        saveProfileToMemory();
    });

    $("#mem_freq_val").on("change", function () {
        mem.autoFreq = parseInt($(this).val());
        saveProfileToMemory();
    });

    // Apply Limits & Auto-Extract Button
    $("#mem_btn_apply_limits").off("click").on("click", async function () {
        memSyncLimits(); // Scrub overlaps first

        // Check if there is actually anything pending to extract
        const context = typeof getContext === "function" ? getContext() : null;
        if (!context || !context.chat) return;
        let totalRealMessages = 0;
        for (let m of context.chat) { if (!m.is_system) totalRealMessages++; }

        const workingLimit = mem.workingLimit || 30;
        if (totalRealMessages > workingLimit) {
            toastr.info("Starting automatic extraction to fill new limits...");
            await memProcessPendingChunks(); // Start extraction!
        }
    });

    // Test Vector Scanner Button (Dual Engine UI)
    $("body").off("click", "#mem_btn_test_vector").on("click", "#mem_btn_test_vector", async function () {
        const context = typeof getContext === "function" ? getContext() : null;
        const mem = localProfile?.memoryCore;
        const engine = mem?.scannerEngine || 'tfidf';

        let html = `<div style="font-family: 'Inter', sans-serif; font-size: 0.85rem; color: var(--text-main); text-align: left; display: flex; flex-direction: column; gap: 10px;">`;

        if (engine === 'semantic') {
            toastr.info("Querying SillyTavern Vector Database...");
            $("#mem_btn_test_vector").prop("disabled", true);
            await memUpdateSemanticQuery(); // Force a fresh query right now
            $("#mem_btn_test_vector").prop("disabled", false);

            if (currentSemanticMatches.length === 0) {
                toastr.error("Semantic API Failed. Is ST Vector Storage enabled?");
            } else {
                html += `<div style="background: rgba(168,85,247,0.1); border-left: 3px solid #a855f7; padding: 10px; border-radius: 4px; margin-bottom: 5px;">
                <div style="color: #a855f7; font-weight: bold; margin-bottom: 4px;">Semantic Embeddings Engine Active</div>
                <div style="color: var(--text-muted); font-size: 0.75rem;">Using SillyTavern's Vector Storage API (LanceDB) to find the deep contextual meaning of the last 2 messages.</div>
            </div>`;
            }
        }

        // Only show TF-IDF block if Semantic failed OR TF-IDF is manually selected
        if (engine === 'tfidf' || currentSemanticMatches.length === 0) {
            const recentCleanedText = context.chat.filter(m => !m.is_system).slice(-4).map(m => meguminCleanChatHistoryText(m.mes)).join(" ").toLowerCase();
            const uniqueKeywords = memExtractKeywords(recentCleanedText);
            html += `<div style="background: rgba(16,185,129,0.1); border-left: 3px solid #10b981; padding: 10px; border-radius: 4px; margin-bottom: 5px;">
            <div style="color: #10b981; font-weight: bold; margin-bottom: 4px;">TF-IDF Smart Keywords (Last 2 Messages):</div>
            <div style="color: var(--text-muted); font-size: 0.75rem;">${uniqueKeywords.join(", ") || "None"}</div>
        </div>`;
        }

        const matches = memGetRelevantVaultEntries();

        if (matches.length === 0) {
            html += `<div style="padding: 10px;">No highly relevant memories found for the current context.</div>`;
        } else {
            html += `<div style="color: var(--text-muted); margin-bottom: 5px;">The following archives will be injected into the prompt:</div>`;
            matches.forEach(m => {
                const content = m.text || m.summary;
                const scoreColor = engine === 'semantic' ? '#a855f7' : '#3b82f6';
                html += `<div style="background: rgba(0,0,0,0.3); border-left: 3px solid ${scoreColor}; padding: 10px; border-radius: 4px;">
                <div style="color: ${scoreColor}; font-weight: bold; font-size: 0.75rem; margin-bottom: 2px;">[Match Score: ${m.score}] | Msg ${m.id}</div>
                <div style="color: #f59e0b; font-weight: bold; font-size: 0.7rem; margin-bottom: 6px;">Matched Triggers: ${m.matchedWords.join(", ")}</div>
                <div style="max-height: 150px; overflow-y: auto; white-space: pre-wrap; font-size: 0.8rem; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">${content}</div>
            </div>`;
            });
        }
        html += `</div>`;

        const { Popup, POPUP_TYPE } = typeof getContext === "function" ? getContext() : window;
        if (Popup) {
            const popup = new Popup(html, POPUP_TYPE.TEXT, "Vault Scanner Results", { wide: true });
            await popup.show();
        }
    });

    if (mem.enabled) {
        memRenderDashboard();
        memRenderAccordion();
        memRenderVault();
    }
}

function memRenderDashboard() {
    const context = typeof getContext === "function" ? getContext() : null;
    const chat = context?.chat || [];
    const mem = localProfile.memoryCore;

    let totalRealMessages = 0;
    for (let m of chat) { if (!m.is_system) totalRealMessages++; }

    $("#mem_live_tokens_saved").text(`~${memCalculateTokensSaved()}`);

    const isRawLong = (mem.architecture === "raw_long");

    // 1. Calculate active Working segment size (Solid Green - Rightmost)
    const workingSize = Math.min(totalRealMessages, mem.workingLimit || 30);

    // 2. Calculate the actual number of messages currently archived in the Vault (Solid Blue - Leftmost)
    let vaultSize = 0;
    if (mem.longTermVault) {
        mem.longTermVault.forEach(c => {
            const parts = c.id.split("-");
            vaultSize += (parseInt(parts[1]) - parseInt(parts[0]) + 1);
        });
    }

    // 3. Calculate the actual number of messages currently archived in Short-Term (Solid Yellow - Middle Left)
    let shortTermSize = 0;
    if (mem.shortTermChunks && !isRawLong) {
        mem.shortTermChunks.forEach(c => {
            const parts = c.id.split("-");
            shortTermSize += (parseInt(parts[1]) - parseInt(parts[0]) + 1);
        });
    }

    // 4. Calculate Pending Raw Messages (Stripes Green - Middle Right)
    // Any message that isn't in active working raw and isn't archived yet is pending raw
    const totalArchived = vaultSize + shortTermSize;
    const pendingSize = Math.max(0, totalRealMessages - workingSize - totalArchived);

    // 5. Convert to percentages for the left-to-right bar (Oldest -> Newest)
    const maxBarScale = Math.max(totalRealMessages, 1);
    const pVault = (vaultSize / maxBarScale) * 100;
    const pShort = (shortTermSize / maxBarScale) * 100;
    const pPend = (pendingSize / maxBarScale) * 100;
    const pWork = (workingSize / maxBarScale) * 100;

    // Apply widths to elements
    $("#mem_bar_long").css("width", `${pVault}%`);
    $("#mem_bar_short").css("width", `${pShort}%`);
    $("#mem_bar_pend").css("width", `${pPend}%`);
    $("#mem_bar_work").css("width", `${pWork}%`);

    // Hide or show Short-Term bar depending on architecture setting
    if (isRawLong) {
        $("#mem_bar_short").hide();
    } else {
        $("#mem_bar_short").show();
    }

    // Update descriptive status text beneath progress bar
    const shortText = isRawLong ? "" : `Short: ${shortTermSize} | `;
    $("#mem_status_text").text(`Total: ${totalRealMessages} | Vault: ${vaultSize} | ${shortText}Pending (Raw): ${pendingSize} | Working (Raw): ${workingSize}`);
}

// Renders the editable text areas for chunks already processed — PAGINATED (20 at a time)
const MEM_ACCORDION_PAGE_SIZE = 20;
function memRenderAccordion() {
    const mem = localProfile.memoryCore;
    const list = $("#mem_short_term_list");
    list.empty();

    if (!mem.shortTermChunks || mem.shortTermChunks.length === 0) {
        list.append(`<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 10px;">No chunks generated yet. Generate chat messages to trigger background summarization.</div>`);
        return;
    }

    // Reverse array to show newest chunks at the top
    const chunks = [...mem.shortTermChunks].reverse();
    let renderedCount = 0;

    function renderAccordionBatch() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(renderedCount + MEM_ACCORDION_PAGE_SIZE, chunks.length);

        for (let idx = renderedCount; idx < end; idx++) {
            const chunk = chunks[idx];
            const dateStr = new Date(chunk.timestamp).toLocaleString();
            const acc = $(`
                <div class="mem-accordion">
                    <div class="mem-accordion-header">
                        <span><i class="fa-solid fa-layer-group" style="color:var(--gold); margin-right:6px;"></i> Messages: ${chunk.id}</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 400;"><i class="fa-regular fa-clock"></i> ${dateStr}</span>
                    </div>
                    <div class="mem-accordion-body">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <div style="font-size:0.7rem; color:var(--text-muted);">You can manually edit this state extraction before it gets pushed to the Vector DB.</div>
                            <button class="mem_short_del" data-id="${chunk.id}" style="background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 0.8rem; padding: 2px 6px;" title="Delete Chunk"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <textarea class="mem_chunk_edit" data-id="${chunk.id}">${chunk.summary}</textarea>
                    </div>
                </div>
            `);

            // Accordion Toggle
            acc.find(".mem-accordion-header").on("click", function () {
                $(this).next(".mem-accordion-body").slideToggle(150);
            });

            // Auto-save edits
            acc.find("textarea").on("input", function () {
                const id = $(this).attr("data-id");
                const newText = $(this).val();
                const target = localProfile.memoryCore.shortTermChunks.find(c => c.id === id);
                if (target) {
                    target.summary = newText;
                    mem._tokensDirty = true;
                    saveProfileToMemory();
                }
            });

            // Delete button logic
            acc.find(".mem_short_del").on("click", function () {
                if (confirm(`Delete short-term memory chunk [Messages: ${chunk.id}]? It will be permanently removed.`)) {
                    const id = $(this).attr("data-id");
                    localProfile.memoryCore.shortTermChunks = localProfile.memoryCore.shortTermChunks.filter(c => c.id !== id);
                    mem._tokensDirty = true; delete mem._archivedSet;
                    saveProfileToMemory();
                    memRenderAccordion();
                    memRenderDashboard();
                    updateMemoryVisuals();
                }
            });

            fragment.appendChild(acc[0]);
        }

        // Remove old "Load More" button if present
        list.find(".mem-accordion-load-more").remove();
        list[0].appendChild(fragment);
        renderedCount = end;

        // Add "Load More" button if there are more entries
        if (renderedCount < chunks.length) {
            const remaining = chunks.length - renderedCount;
            const loadMoreBtn = $(`<button class="mem-accordion-load-more ps-modern-btn secondary" style="width: 100%; padding: 8px; margin-top: 6px; font-size: 0.75rem; color: #f59e0b; border-color: rgba(245,158,11,0.3);"><i class="fa-solid fa-chevron-down"></i> Load More (${remaining} remaining)</button>`);
            loadMoreBtn.on("click", function () { renderAccordionBatch(); });
            list.append(loadMoreBtn);
        }
    }

    renderAccordionBatch();
}

// Renders the Long-Term Vault UI with Search Filtering — PAGINATED (20 at a time)
const MEM_VAULT_PAGE_SIZE = 20;
function memRenderVault(searchFilter = "") {
    const mem = localProfile.memoryCore;
    const list = $("#mem_vault_list");
    list.empty();

    if (!mem.longTermVault) mem.longTermVault = [];
    $("#mem_vault_count").text(`${mem.longTermVault.length} Entries`);

    if (mem.longTermVault.length === 0) {
        const passMsg = (mem.workingLimit || 30) + (mem.shortTermLimit || 70);
        list.append(`<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 10px;">Vault is empty. Chunks automatically migrate here once they pass message ${passMsg}.</div>`);
        return;
    }

    // Filter using .text (fallback to .summary just in case you have old saves)
    const filtered = mem.longTermVault.filter(c => {
        const content = c.text || c.summary || "";
        return content.toLowerCase().includes(searchFilter.toLowerCase());
    }).reverse();

    let renderedCount = 0;

    function renderVaultBatch() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(renderedCount + MEM_VAULT_PAGE_SIZE, filtered.length);

        for (let idx = renderedCount; idx < end; idx++) {
            const chunk = filtered[idx];
            const dateStr = new Date(chunk.timestamp).toLocaleDateString();
            const content = chunk.text || chunk.summary || "";

            const row = $(`
                <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; position: relative;">
                    <div style="font-size: 0.65rem; color: #3b82f6; font-weight: 700; margin-bottom: 4px; display: flex; justify-content: space-between;">
                        <span>ARCHIVE #${chunk.id}</span>
                        <span>${dateStr}</span>
                    </div>
                    <textarea class="ps-modern-input mem_vault_edit" data-id="${chunk.id}" style="height: 120px; resize: vertical; font-size: 0.75rem; border: none; background: transparent; padding: 0;">${content}</textarea>
                    <button class="mem_vault_del" data-id="${chunk.id}" style="position: absolute; bottom: 8px; right: 10px; background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 0.8rem;" title="Delete Archive"><i class="fa-solid fa-trash"></i></button>
                </div>
            `);

            // Auto-save edits to .text
            row.find(".mem_vault_edit").on("change", function () {
                const id = $(this).attr("data-id");
                const target = localProfile.memoryCore.longTermVault.find(c => c.id === id);
                if (target) {
                    target.text = $(this).val();
                    mem._tokensDirty = true; delete mem._archivedSet;
                    saveProfileToMemory();
                    if (localProfile.memoryCore.scannerEngine === 'semantic') memInsertToVectorDB([target]);
                }
            });

            // Delete button
            row.find(".mem_vault_del").on("click", function () {
                if (confirm("Permanently delete this archived memory?")) {
                    const id = $(this).attr("data-id");
                    localProfile.memoryCore.longTermVault = localProfile.memoryCore.longTermVault.filter(c => c.id !== id);
                    if (localProfile.memoryCore.scannerEngine === 'semantic') memDeleteFromVectorDB([id]);
                    mem._tokensDirty = true; delete mem._archivedSet;
                    saveProfileToMemory();
                    memRenderVault($("#mem_vault_search").val());
                    memRenderDashboard();
                }
            });

            fragment.appendChild(row[0]);
        }

        // Remove old "Load More" button if present
        list.find(".mem-vault-load-more").remove();
        list[0].appendChild(fragment);
        renderedCount = end;

        // Add "Load More" button if there are more entries
        if (renderedCount < filtered.length) {
            const remaining = filtered.length - renderedCount;
            const loadMoreBtn = $(`<button class="mem-vault-load-more ps-modern-btn secondary" style="width: 100%; padding: 8px; margin-top: 6px; font-size: 0.75rem; color: #3b82f6; border-color: rgba(59,130,246,0.3);"><i class="fa-solid fa-chevron-down"></i> Load More (${remaining} remaining)</button>`);
            loadMoreBtn.on("click", function () { renderVaultBatch(); });
            list.append(loadMoreBtn);
        }
    }

    renderVaultBatch();
}

// Live Search Listener
$("body").off("input", "#mem_vault_search").on("input", "#mem_vault_search", function () {
    memRenderVault($(this).val());
});

// --- MEMORY GENERATION LOGIC ---

async function memProcessPendingChunks(isAuto = false) {
    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.chat || !localProfile.memoryCore.enabled) return;

    const chat = context.chat;
    const mem = localProfile.memoryCore;
    const workingLimit = mem.workingLimit || 30;
    const shortTermLimit = mem.shortTermLimit || 70;

    // 1. Get a clean array of [Index, Message Object]
    const realMessages = [];
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].is_system) realMessages.push({ originalIndex: i, msg: chat[i] });
    }

    if (realMessages.length <= workingLimit) {
        if (!isAuto) toastr.info("Not enough messages past the working limit to archive.");
        return;
    }

    // 2. Grab EVERYTHING outside of the Working Memory
    const archivableMessages = realMessages.slice(0, realMessages.length - workingLimit);

    // Identify the cutoff point where messages go straight to the Vault
    const effectiveShortTermLimit = mem.architecture === "raw_long" ? workingLimit : (workingLimit + shortTermLimit);
    const vaultCutoffLimit = Math.max(0, realMessages.length - effectiveShortTermLimit);
    let vaultCutoffMessageIndex = -1;
    if (vaultCutoffLimit > 0 && realMessages[vaultCutoffLimit]) {
        vaultCutoffMessageIndex = realMessages[vaultCutoffLimit].originalIndex;
    }

    // 3. Group into chunks of chunkSize and find what is missing
    const chunkSize = mem.chunkSize || 10;
    const chunksToProcess = [];

    // Filter archivable messages to only those not already archived (automatically handles gaps)
    const unarchivedArchivable = archivableMessages.filter(item => !isMessageArchived(item.originalIndex, mem));

    for (let i = 0; i < unarchivedArchivable.length; i += chunkSize) {
        const chunk = unarchivedArchivable.slice(i, i + chunkSize);
        if (chunk.length < chunkSize) continue; // SMART CHUNKING: Wait until a complete chunk accumulates

        const startId = chunk[0].originalIndex;
        const endId = chunk[chunk.length - 1].originalIndex;
        const chunkId = `${startId}-${endId}`;

        let rawText = "";
        chunk.forEach(item => {
            rawText += `${item.msg.name}: ${meguminCleanChatHistoryText(item.msg.mes)}\n\n`;
        });
        chunksToProcess.push({ id: chunkId, text: rawText.trim(), endId: endId });
    }

    if (chunksToProcess.length === 0) {
        memRunVaultMigration();
        if (!isAuto) toastr.info("All archives are up to date.");
        return;
    }

    // 4. Process the missing chunks — BATCHED with UI yields
    $("#mem_processing_spinner").show();
    $("#mem_processing_progress").show().text(`Preparing...`);
    $("#mem_btn_generate").prop("disabled", true).css("opacity", "0.5");

    let changesMade = false;
    const newlyAddedBypassedVaultChunks = [];
    let bypassedCount = 0;

    try {
        const totalChunks = chunksToProcess.length;
        const BATCH_SIZE = 5;
        const SAVE_INTERVAL = 10;
        let chunksSinceLastSave = 0;

        for (let idx = 0; idx < totalChunks; idx++) {
            const chunkData = chunksToProcess[idx];

            // Update progress text
            const percent = Math.round((idx / totalChunks) * 100);
            $("#mem_processing_progress").text(`Processing ${idx + 1}/${totalChunks} (${percent}%)`);

            // --- DIRECT-TO-VAULT BYPASS ---
            // If this chunk is older than the Short-Term limit, skip the AI entirely!
            if (vaultCutoffMessageIndex !== -1 && chunkData.endId < vaultCutoffMessageIndex) {
                if (!mem.longTermVault) mem.longTermVault = [];
                const newVaultChunk = {
                    id: chunkData.id,
                    text: chunkData.text, // Store the raw text directly!
                    timestamp: Date.now()
                };
                mem.longTermVault.push(newVaultChunk);
                newlyAddedBypassedVaultChunks.push(newVaultChunk);
                changesMade = true;
                bypassedCount++;
                chunksSinceLastSave++;

                // Yield to UI every BATCH_SIZE chunks to prevent freezing
                if (bypassedCount % BATCH_SIZE === 0) {
                    await new Promise(r => setTimeout(r, 0));
                }

                // Save progress every SAVE_INTERVAL chunks for crash safety
                if (chunksSinceLastSave >= SAVE_INTERVAL) {
                    delete mem._archivedSet; mem._tokensDirty = true;
                    saveProfileToMemory();
                    chunksSinceLastSave = 0;
                }

                continue; // Skip the rest of the loop
            }

            // --- NORMAL SHORT-TERM AI SUMMARIZATION ---
            toastr.info(`Extracting State: Messages ${chunkData.id} (${idx + 1}/${totalChunks})...`);

            let summaryResult = "";
            activeMemorySummarizationRequest = chunkData.text;

            if (!mem.backend || mem.backend === "direct") {
                summaryResult = await generateQuietPrompt({ prompt: "___PS_MEMORY_SUMMARIZE___" });
            } else {
                await useMeguminEngine(async () => {
                    summaryResult = await generateQuietPrompt({ prompt: "___PS_MEMORY_SUMMARIZE___" });
                }, "Megumin Engine");
            }

            summaryResult = summaryResult.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

            if (summaryResult) {
                if (!mem.shortTermChunks) mem.shortTermChunks = [];
                mem.shortTermChunks.push({
                    id: chunkData.id,
                    summary: summaryResult,
                    timestamp: Date.now()
                });
                changesMade = true;
                chunksSinceLastSave++;

                // Save progress every SAVE_INTERVAL chunks for crash safety
                if (chunksSinceLastSave >= SAVE_INTERVAL) {
                    delete mem._archivedSet; mem._tokensDirty = true;
                    saveProfileToMemory();
                    chunksSinceLastSave = 0;
                }
            }
        }

        // Show single summary toast for vault bypass instead of per-chunk spam
        if (bypassedCount > 0) {
            toastr.info(`Archived ${bypassedCount} chunk(s) directly to Vault (bypassed AI).`);
        }

        if (changesMade) {
            // Invalidate caches
            delete mem._archivedSet;
            mem._tokensDirty = true;

            // Sort shortTermChunks chronologically by start ID
            if (mem.shortTermChunks) {
                mem.shortTermChunks.sort((a, b) => {
                    const aStart = parseInt(a.id.split("-")[0]);
                    const bStart = parseInt(b.id.split("-")[0]);
                    return aStart - bStart;
                });
            }

            // Sort longTermVault chronologically by start ID
            if (mem.longTermVault) {
                mem.longTermVault.sort((a, b) => {
                    const aStart = parseInt(a.id.split("-")[0]);
                    const bStart = parseInt(b.id.split("-")[0]);
                    return aStart - bStart;
                });
            }

            saveProfileToMemory();

            // Batch insert bypassed vault chunks to Vector DB if semantic engine is active
            if (newlyAddedBypassedVaultChunks.length > 0 && mem.scannerEngine === 'semantic') {
                toastr.info("Syncing new Vault archives to Vector Database...");
                await memInsertToVectorDB(newlyAddedBypassedVaultChunks);
            }

            memRunVaultMigration();
            memRenderAccordion();
            memRenderVault($("#mem_vault_search").val() || "");
            memRenderDashboard();
            updateMemoryVisuals();
        }

        toastr.success("Archive Extraction Complete!");

    } catch (err) {
        console.error("Memory Extraction Error:", err);
        toastr.error("Failed to generate memory summaries.");
    } finally {
        activeMemorySummarizationRequest = null;
        $("#mem_processing_spinner").hide();
        $("#mem_processing_progress").hide().text("");
        $("#mem_btn_generate").prop("disabled", false).css("opacity", "1");
    }
}

// Standalone helper to push old chunks into the Vault (AS RAW TEXT) — OPTIMIZED
function memRunVaultMigration() {
    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.chat || !localProfile.memoryCore.enabled) return;

    const chat = context.chat;
    const mem = localProfile.memoryCore;
    const effectiveShortTermLimit = mem.architecture === "raw_long" ? (mem.workingLimit || 30) : ((mem.workingLimit || 30) + (mem.shortTermLimit || 70));

    const realMessages = [];
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].is_system) realMessages.push({ originalIndex: i, msg: chat[i] });
    }

    const cutoffLimit = Math.max(0, realMessages.length - effectiveShortTermLimit);
    let cutoffMessageIndex = -1;

    if (cutoffLimit > 0 && realMessages[cutoffLimit]) {
        cutoffMessageIndex = realMessages[cutoffLimit].originalIndex;
    }

    if (cutoffMessageIndex !== -1 && mem.shortTermChunks && mem.shortTermChunks.length > 0) {
        let migrated = false;
        const newVaultChunksForDB = []; // Batch vector DB inserts

        for (let i = mem.shortTermChunks.length - 1; i >= 0; i--) {
            const chunk = mem.shortTermChunks[i];
            const endMsgId = parseInt(chunk.id.split("-")[1]);

            // If the chunk is older than the Short-Term cutoff, migrate it as RAW TEXT!
            if (endMsgId < cutoffMessageIndex) {
                if (!mem.longTermVault) mem.longTermVault = [];

                // --- RECONSTRUCT RAW TEXT ---
                const parts = chunk.id.split("-");
                const startId = parseInt(parts[0]);
                const stopId = parseInt(parts[1]);
                let rawText = "";

                for (let j = startId; j <= stopId; j++) {
                    if (j >= 0 && j < chat.length && chat[j] && !chat[j].is_system) {
                        rawText += `${chat[j].name}: ${meguminCleanChatHistoryText(chat[j].mes)}\n\n`;
                    }
                }

                // If reconstruction failed (e.g. messages were deleted), use the summary as fallback
                if (!rawText.trim() && chunk.summary) {
                    rawText = chunk.summary;
                }

                // Push raw text instead of summary
                const newVaultChunk = {
                    id: chunk.id,
                    text: rawText.trim(), // Use 'text' key for raw data
                    timestamp: Date.now()
                };
                mem.longTermVault.push(newVaultChunk);
                newVaultChunksForDB.push(newVaultChunk);

                mem.shortTermChunks.splice(i, 1);
                migrated = true;
            }
        }
        if (migrated) {
            // Invalidate caches
            delete mem._archivedSet;
            mem._tokensDirty = true;

            // Batch vector DB insert instead of one-per-chunk
            if (newVaultChunksForDB.length > 0 && mem.scannerEngine === 'semantic') {
                memInsertToVectorDB(newVaultChunksForDB);
            }

            saveProfileToMemory();
            memRenderAccordion();
            memRenderVault($("#mem_vault_search").val() || "");
            memRenderDashboard();
        }
    }
}

// -------------------------------------------------------------
// STAGE 9 HELPER FUNCTIONS: MEMORY INTERCEPT & VISUALS
// -------------------------------------------------------------

// Checks if a message index is safely stored in either Short-Term or Long-Term memory
function isMessageArchived(mesId, mem) {
    if (!mem) return false;

    // Lazy load the cached Set of archived message IDs for O(1) lookups
    // Using instanceof Set prevents crashes after JSON deserialization turns it into {}
    if (!(mem._archivedSet instanceof Set)) {
        mem._archivedSet = new Set();
        const addChunk = (c) => {
            const parts = c.id.split("-");
            const start = parseInt(parts[0]);
            const end = parseInt(parts[1]);
            for (let i = start; i <= end; i++) {
                mem._archivedSet.add(i);
            }
        };
        if (mem.shortTermChunks) mem.shortTermChunks.forEach(addChunk);
        if (mem.longTermVault) mem.longTermVault.forEach(addChunk);
    }

    return mem._archivedSet.has(mesId);
}

// Scrubs the memory arrays and pulls overlapping chunks back into active chat
function memSyncLimits() {
    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.chat || !localProfile.memoryCore) return;

    const chat = context.chat;
    const mem = localProfile.memoryCore;

    let realMessages = [];
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].is_system) realMessages.push(i);
    }

    // Find the cutoff index for Working Memory
    const workingCutoffIndex = realMessages.length <= mem.workingLimit
        ? 0
        : realMessages[realMessages.length - mem.workingLimit];

    // Find the cutoff index for Short-Term Memory
    const effectiveShortLimit = (mem.workingLimit || 30) + (mem.shortTermLimit || 70);
    const shortCutoffIndex = realMessages.length <= effectiveShortLimit
        ? 0
        : realMessages[realMessages.length - effectiveShortLimit];

    let changesMade = false;

    // 1. Scrub Short-Term Chunks
    if (mem.shortTermChunks) {
        for (let i = mem.shortTermChunks.length - 1; i >= 0; i--) {
            const chunk = mem.shortTermChunks[i];
            const endId = parseInt(chunk.id.split("-")[1]);
            // If the chunk overlaps the Working Limit, delete the archive!
            if (endId >= workingCutoffIndex) {
                mem.shortTermChunks.splice(i, 1);
                changesMade = true;
            }
        }
    }

    // 2. Scrub Long-Term Vault
    if (mem.longTermVault) {
        for (let i = mem.longTermVault.length - 1; i >= 0; i--) {
            const chunk = mem.longTermVault[i];
            const endId = parseInt(chunk.id.split("-")[1]);

            // If it overlaps Working Memory, delete it!
            if (endId >= workingCutoffIndex) {
                mem.longTermVault.splice(i, 1);
                changesMade = true;
            }
            // If it overlaps Short-Term Memory (and we are using summaries), delete it to force a re-summary!
            else if (mem.architecture === "raw_short_long" && endId >= shortCutoffIndex) {
                mem.longTermVault.splice(i, 1);
                changesMade = true;
            }
        }
    }

    if (changesMade) {
        delete mem._archivedSet;
        mem._tokensDirty = true;
        saveProfileToMemory();
        toastr.success("Limits Applied! Overlapping archives returned to chat.");
    } else {
        toastr.info("Limits Applied. No overlaps found.");
    }

    memRunVaultMigration(); // Push any remaining items down
    memRenderAccordion();
    memRenderVault($("#mem_vault_search").val() || "");
    memRenderDashboard();
    updateMemoryVisuals(); // Remove the gray styling from the restored messages
}

// Universal Language Tokenizer: Automatically handles English, Arabic, Russian, and CJK (Chinese/Japanese/Korean)
function memExtractKeywords(text) {
    let rawWords = [];

    // 1. Use modern native JS segmenter which understands Japanese/Chinese word boundaries!
    if (window.Intl && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
        for (const { segment, isWordLike } of segmenter.segment(text)) {
            if (isWordLike) rawWords.push(segment.toLowerCase());
        }
    } else {
        // Fallback for extremely old browsers
        rawWords = text.match(/\p{L}+/gu) || [];
    }

    // 2. Filter the words smartly based on their language
    return [...new Set(rawWords)].filter(kw => {
        // Drop English stop words
        if (MEMORY_STOP_WORDS.has(kw)) return false;

        // If it contains CJK characters (Chinese, Japanese, Korean)
        if (/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(kw)) {
            return kw.length >= 1; // CJK nouns can be 1 character (e.g. 剣 "sword", 猫 "cat")
        }

        // Alphabetic languages (English, Arabic, Russian) need 3+ letters to filter out small junk
        return kw.length >= 3;
    });
}

// Calculates estimated tokens saved by the memory system (CACHED)
function memCalculateTokensSaved() {
    const context = typeof getContext === "function" ? getContext() : null;
    const mem = localProfile?.memoryCore;
    if (!context || !context.chat || !mem || !mem.enabled) return 0;

    // Return cached value if not dirty
    if (mem._cachedTokensSaved !== undefined && !mem._tokensDirty) {
        return mem._cachedTokensSaved;
    }

    let strippedChars = 0;
    for (let i = 0; i < context.chat.length; i++) {
        if (!context.chat[i].is_system && isMessageArchived(i, mem)) {
            strippedChars += context.chat[i].mes.length;
        }
    }

    let injectedChars = 0;
    if (mem.architecture === "raw_short_long" && mem.shortTermChunks) {
        mem.shortTermChunks.forEach(c => injectedChars += (c.summary || "").length);
    }

    // Assume top 3 vault entries injected
    const retrieved = memGetRelevantVaultEntries();
    retrieved.forEach(m => injectedChars += (m.text || m.summary || "").length);

    // Standard approximation: 4 characters = 1 token
    const savedTokens = Math.max(0, Math.ceil((strippedChars - injectedChars) / 4));
    mem._cachedTokensSaved = savedTokens;
    mem._tokensDirty = false;
    return savedTokens;
}

// Expanded stop words including common RP verbs and adjectives
const MEMORY_STOP_WORDS = new Set(["about", "above", "across", "after", "again", "against", "almost", "alone", "along", "already", "always", "among", "another", "anybody", "anyone", "anything", "anywhere", "around", "asked", "became", "because", "become", "been", "before", "began", "behind", "being", "below", "beside", "besides", "between", "beyond", "both", "came", "cannot", "come", "could", "didn't", "does", "doesn't", "doing", "don't", "during", "each", "either", "enough", "even", "ever", "every", "everyone", "everything", "everywhere", "except", "feel", "find", "first", "from", "front", "gave", "getting", "give", "given", "going", "good", "great", "happened", "have", "having", "heard", "hello", "help", "here", "herself", "himself", "however", "inside", "itself", "just", "knew", "know", "known", "left", "less", "like", "little", "look", "looked", "looking", "made", "make", "many", "matter", "mean", "might", "more", "most", "much", "must", "myself", "never", "next", "nobody", "none", "nothing", "nowhere", "often", "only", "other", "others", "ought", "ourselves", "outside", "over", "perhaps", "please", "probably", "quite", "rather", "really", "right", "said", "same", "saying", "seem", "seemed", "seems", "several", "shall", "should", "since", "small", "some", "somebody", "someone", "something", "sometimes", "somewhere", "soon", "still", "such", "sure", "take", "tell", "than", "that", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "thing", "things", "think", "this", "those", "though", "thought", "three", "through", "together", "told", "took", "toward", "towards", "tried", "under", "unless", "until", "upon", "very", "want", "wanted", "well", "went", "were", "what", "when", "where", "which", "while", "whom", "whose", "will", "with", "within", "without", "would", "wrong", "yeah", "your", "yours", "yourself", "yourselves", "details", "summary", "infoblock", "chatter", "dialogue", "narration", "narrative", "status", "tracker", "world", "state", "action", "words", "smiled", "nodded", "sighed", "walked", "eyes", "face", "turned", "replied", "whispered", "gazed", "stared", "glanced", "stepped", "shifted", "voice", "hands", "head", "fingers", "hair", "door", "room", "time", "back", "away", "down", "suddenly", "slowly", "softly", "quietly", "gently", "slightly", "single", "simply", "short", "sharp", "began"]);

// --- SEMANTIC EMBEDDING HELPERS ---

// Converts a string ID to a numeric hash (required by ST's Vectra backend)
function memStringHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// NOTE: memGetEmbedding / memUpdateCurrentQueryVector / memUpdateVaultEmbeddings removed.
// ST's native /api/vector/* API does NOT expose raw embeddings. Embedding is done server-side
// during insert and query. We use the proper insert+query flow instead of client-side cosine math.

// --- SEMANTIC EMBEDDING HELPERS (NATIVE ST VECTRA) ---

let currentSemanticMatches = [];

// Creates a unique database collection name for this specific character/group
function memGetCollectionId() {
    const context = typeof getContext === "function" ? getContext() : null;
    if (!context) return "megumin_default";
    const charId = context.characterId !== undefined ? String(context.characterId) : "group_" + context.groupId;
    return ("megumin_" + charId).replace(/[^a-zA-Z0-9_]/g, "_");
}

// Inserts vault chunks into ST's native vector database
async function memInsertToVectorDB(chunks) {
    if (!chunks || chunks.length === 0) return;
    const collectionId = memGetCollectionId();
    // ST's /api/vector/insert requires items with { hash: Number, text: String, index: Number }
    const items = chunks.map((c, i) => ({
        hash: memStringHash(c.id),
        text: c.text || c.summary || "",
        index: i
    }));
    try {
        await fetch('/api/vector/insert', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ collectionId, items, source: 'transformers' })
        });
    } catch (e) { console.warn("Megumin Suite: Vector Insert failed.", e); }
}

// Deletes vault chunks from ST's native vector database
async function memDeleteFromVectorDB(ids) {
    if (!ids || ids.length === 0) return;
    const collectionId = memGetCollectionId();
    // ST's /api/vector/delete requires { hashes: Number[] }, not string ids
    const hashes = ids.map(id => memStringHash(id));
    try {
        await fetch('/api/vector/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ collectionId, hashes, source: 'transformers' })
        });
    } catch (e) { console.warn("Megumin Suite: Vector Delete failed.", e); }
}

// Background task: Queries the DB silently while you chat so the AI's prompt is always ready
async function memUpdateSemanticQuery() {
    const mem = localProfile?.memoryCore;
    if (!mem || mem.scannerEngine !== 'semantic' || !mem.longTermVault || mem.longTermVault.length === 0) {
        currentSemanticMatches = [];
        return;
    }
    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.chat) return;

    const recentCleanedText = context.chat.filter(m => !m.is_system).slice(-2).map(m => meguminCleanChatHistoryText(m.mes)).join(" ");
    if (!recentCleanedText.trim()) return;

    const collectionId = memGetCollectionId();
    try {
        const res = await fetch('/api/vector/query', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                collectionId,
                searchText: recentCleanedText,
                topK: 3,
                source: 'transformers',
                threshold: 0.2
            })
        });
        if (res.ok) {
            const data = await res.json();
            // ST returns { hashes: number[], metadata: object[] }
            if (data && Array.isArray(data.metadata)) {
                currentSemanticMatches = data.metadata.map(meta => {
                    // Match back to vault using the numeric hash
                    const vaultEntry = mem.longTermVault.find(v => memStringHash(v.id) === meta.hash);
                    if (vaultEntry) {
                        return { ...vaultEntry, score: 99, matchedWords: ["Semantic Embedding Match (Vectra)"] };
                    }
                    // Fallback: try text match if hash doesn't match
                    const textMatch = mem.longTermVault.find(v => (v.text || v.summary || "").substring(0, 100) === (meta.text || "").substring(0, 100));
                    if (textMatch) {
                        return { ...textMatch, score: 99, matchedWords: ["Semantic Embedding Match (Vectra)"] };
                    }
                    return null;
                }).filter(Boolean);
            }
        }
    } catch (e) {
        console.warn("Megumin Suite: Semantic query failed, falling back to TF-IDF.", e);
        currentSemanticMatches = [];
    }
}

// Dual-Engine Scorer: TF-IDF or Semantic Embeddings
function memGetRelevantVaultEntries() {
    const context = typeof getContext === "function" ? getContext() : null;
    const mem = localProfile?.memoryCore;

    if (!context || !context.chat || !mem || !mem.longTermVault || mem.longTermVault.length === 0) return [];

    const vault = mem.longTermVault;
    const engine = mem.scannerEngine || 'tfidf';

    // --- ENGINE 1: SEMANTIC EMBEDDINGS (ST API) ---
    if (engine === 'semantic') {
        if (currentSemanticMatches.length > 0) return currentSemanticMatches;
        // If ST's vector database fails to respond in time, it gracefully falls back to TF-IDF!
    }

    // --- ENGINE 2: TF-IDF MULTILINGUAL (Keywords / Fallback) ---
    const recentCleanedText = context.chat.filter(m => !m.is_system).slice(-2).map(m => meguminCleanChatHistoryText(m.mes)).join(" ").toLowerCase();
    const uniqueKeywords = memExtractKeywords(recentCleanedText);
    const totalDocs = vault.length;

    let scoredVault = vault.map(v => {
        let score = 0;
        let matchedWords = [];
        const vText = (v.text || v.summary || "").toLowerCase();

        uniqueKeywords.forEach(kw => {
            if (vText.includes(kw)) {
                let docCount = 0;
                vault.forEach(doc => { if ((doc.text || doc.summary || "").toLowerCase().includes(kw)) docCount++; });
                if (docCount < totalDocs * 0.5) {
                    let wordWeight = Math.round(50 / docCount);
                    score += wordWeight;
                    matchedWords.push(`${kw} (+${wordWeight})`);
                }
            }
        });
        return { ...v, score, matchedWords };
    });

    return scoredVault.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}

// Rule B: Visual Fading Update (STRICT) — DEBOUNCED + RANGE-BASED CSS
let _memVisualsTimer = null;
function updateMemoryVisuals() {
    if (_memVisualsTimer) clearTimeout(_memVisualsTimer);
    _memVisualsTimer = setTimeout(_updateMemoryVisualsCore, 150);
}
function _updateMemoryVisualsCore() {
    _memVisualsTimer = null;
    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.chat || !context.chat.length) return;

    const mem = localProfile?.memoryCore;

    // Remove old injected style
    $("#megumin-archived-style").remove();

    if (!mem?.enabled) {
        return;
    }

    // Build the archived set once (uses cached Set from isMessageArchived)
    if (!mem._archivedSet) {
        // Force rebuild
        isMessageArchived(0, mem);
    }
    const archivedSet = mem._archivedSet;

    if (archivedSet && archivedSet.size > 0) {
        // Collect visible mesids that are archived — only scan what's in the DOM
        const selectors = [];
        $(".mes").each(function () {
            const mesId = parseInt(this.getAttribute("mesid"));
            if (!isNaN(mesId) && archivedSet.has(mesId)) {
                selectors.push(`.mes[mesid="${mesId}"] .mes_text`);
            }
        });

        if (selectors.length > 0) {
            // Inject a single <style> block instead of toggling classes on each element
            const css = selectors.join(",") + `{ opacity: 0.35; filter: saturate(0.3); transition: opacity 0.2s ease; }`;
            $("head").append(`<style id="megumin-archived-style">${css}</style>`);
        }
    }

    // Use cached token count
    $("#mem_live_tokens_saved").text(`~${memCalculateTokensSaved()}`);
}

// Rule A: The Prompt Interceptor (STRICT)
window.megumin_memory_intercept = function (chat, _contextSize, _abort, type) {
    const mem = localProfile?.memoryCore;
    if (!mem?.enabled) return;

    const context = typeof getContext === "function" ? getContext() : null;
    if (!context || !context.symbols || !context.symbols.ignore) return;

    const IGNORE_SYMBOL = context.symbols.ignore;

    for (let i = 0; i < chat.length; i++) {
        if (chat[i].is_system) continue;

        // ONLY wipe the message from the prompt if it has been successfully summarized
        if (isMessageArchived(i, mem)) {
            chat[i] = structuredClone(chat[i]);
            if (!chat[i].extra) chat[i].extra = {};
            chat[i].extra[IGNORE_SYMBOL] = true;
            chat[i].mes = ""; // Bulletproof wipe
        }
    }
};

function toggleQuickGenButton() {
    const s = localProfile?.imageGen;
    if (s && s.enabled && s.triggerMode === 'manual') {
        $("#kazuma_quick_gen").css("display", "flex");
    } else {
        $("#kazuma_quick_gen").css("display", "none");
    }
}

async function igTestConnection() {
    try {
        const res = await fetch('/api/sd/comfy/ping', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: localProfile.imageGen.comfyUrl }) });
        if (res.ok) { toastr.success("ComfyUI Connected!"); await igFetchComfyLists(); } else throw new Error("Ping failed");
    } catch (e) { toastr.error("Connection Failed: " + e.message); }
}

async function igPopulateWorkflows() {
    const sel = $("#ig_workflow_list"); sel.empty();
    try {
        const res = await fetch('/api/sd/comfy/workflows', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: localProfile.imageGen.comfyUrl }) });
        if (res.ok) {
            const wfs = await res.json();
            wfs.forEach(w => sel.append(`<option value="${w}">${w}</option>`));
            if (localProfile.imageGen.currentWorkflowName && wfs.includes(localProfile.imageGen.currentWorkflowName)) {
                sel.val(localProfile.imageGen.currentWorkflowName);
            } else if (wfs.length > 0) {
                sel.val(wfs[0]); localProfile.imageGen.currentWorkflowName = wfs[0]; saveProfileToMemory();
            }
        }
    } catch (e) { sel.append('<option disabled>Failed to load</option>'); }
}

async function igNewWorkflowClick() {
    let name = await prompt("New workflow file name (e.g. 'my_flux.json'):");
    if (!name) return; if (!name.toLowerCase().endsWith('.json')) name += '.json';
    try {
        const res = await fetch('/api/sd/comfy/save-workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name, workflow: '{}' }) });
        if (!res.ok) throw new Error(await res.text());
        toastr.success("Workflow created!"); await igPopulateWorkflows(); $("#ig_workflow_list").val(name).trigger('change');
        setTimeout(igOpenWorkflowEditorClick, 500);
    } catch (e) { toastr.error(e.message); }
}

async function igDeleteWorkflowClick() {
    const name = localProfile.imageGen.currentWorkflowName;
    if (!name) return; if (!confirm(`Delete ${name}?`)) return;
    try {
        const res = await fetch('/api/sd/comfy/delete-workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name }) });
        if (!res.ok) throw new Error(await res.text());
        toastr.success("Deleted."); await igPopulateWorkflows();
    } catch (e) { toastr.error(e.message); }
}

async function igOpenWorkflowEditorClick() {
    const name = localProfile.imageGen.currentWorkflowName;
    if (!name) return toastr.warning("No workflow selected");
    let loadedContent = "{}";
    try {
        const res = await fetch('/api/sd/comfy/workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name }) });
        if (res.ok) {
            const rawBody = await res.json(); let jsonObj = rawBody;
            if (typeof rawBody === 'string') { try { jsonObj = JSON.parse(rawBody); } catch (e) { } }
            loadedContent = JSON.stringify(jsonObj, null, 4);
        }
    } catch (e) { toastr.error("Failed to load file. Starting empty."); }

    let currentJsonText = loadedContent;
    const $container = $(`
        <div style="display: flex; flex-direction: column; width: 100%; gap: 10px; font-family: 'Inter', sans-serif; color: var(--text-main);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                <h3 style="margin:0; color: var(--gold);">${name}</h3>
                <div style="display:flex; gap:8px;">
                    <button class="ps-modern-btn secondary wf-format" title="Beautify JSON"><i class="fa-solid fa-align-left"></i> Format</button>
                    <button class="ps-modern-btn secondary wf-import" title="Upload .json file"><i class="fa-solid fa-upload"></i> Import</button>
                    <button class="ps-modern-btn secondary wf-export" title="Download .json file"><i class="fa-solid fa-download"></i> Export</button>
                    <input type="file" class="wf-file-input" accept=".json" style="display:none;" />
                </div>
            </div>
            <div style="display: flex; gap: 15px;">
                <textarea class="ps-modern-input wf-textarea" spellcheck="false" style="flex: 1; min-height: 500px; font-family: 'Consolas', 'Monaco', monospace; white-space: pre; resize: none; font-size: 13px; line-height: 1.4; background: #000;"></textarea>
                <div style="width: 250px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border-color); padding-left: 10px; max-height: 500px;">
                    <h4 style="margin: 0 0 10px 0; color: var(--text-muted);">Placeholders</h4>
                    <div class="wf-list" style="overflow-y: auto; flex: 1; padding-right: 5px;"></div>
                </div>
            </div>
        </div>
    `);

    const $textarea = $container.find('.wf-textarea'); const $list = $container.find('.wf-list'); const $fileInput = $container.find('.wf-file-input');
    $textarea.val(currentJsonText);

    KAZUMA_PLACEHOLDERS.forEach(item => {
        const $itemDiv = $('<div></div>').css({ 'padding': '8px', 'margin-bottom': '6px', 'background': 'rgba(255,255,255,0.05)', 'border-radius': '6px', 'border': '1px solid transparent', 'transition': '0.2s' });
        $itemDiv.append($('<span></span>').text(item.key).css({ 'font-weight': 'bold', 'color': 'var(--gold)', 'font-family': 'monospace' })).append($('<div></div>').text(item.desc).css({ 'font-size': '0.7rem', 'color': 'var(--text-muted)', 'margin-top': '4px' }));
        $list.append($itemDiv);
    });

    const updateState = () => {
        currentJsonText = $textarea.val();
        $list.children().each(function () {
            const cleanKey = $(this).find('span').first().text().replace(/"/g, '');
            if (currentJsonText.includes(cleanKey)) $(this).css({ 'border-color': '#10b981', 'background': 'rgba(16, 185, 129, 0.1)' });
            else $(this).css({ 'border-color': 'transparent', 'background': 'rgba(255,255,255,0.05)' });
        });
    };
    $textarea.on('input', updateState); setTimeout(updateState, 100);

    $container.find('.wf-format').on('click', () => { try { $textarea.val(JSON.stringify(JSON.parse($textarea.val()), null, 4)); updateState(); toastr.success("Formatted"); } catch (e) { toastr.warning("Invalid JSON"); } });
    $container.find('.wf-import').on('click', () => $fileInput.click());
    $fileInput.on('change', (e) => { if (!e.target.files[0]) return; const r = new FileReader(); r.onload = (ev) => { $textarea.val(ev.target.result); updateState(); toastr.success("Imported"); }; r.readAsText(e.target.files[0]); $fileInput.val(''); });
    $container.find('.wf-export').on('click', () => { try { JSON.parse(currentJsonText); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([currentJsonText], { type: "application/json" })); a.download = name; a.click(); } catch (e) { toastr.warning("Invalid content"); } });

    const popup = new Popup($container, POPUP_TYPE.CONFIRM, '', { okButton: 'Save Changes', cancelButton: 'Cancel', wide: true, large: true, onClosing: () => { try { JSON.parse(currentJsonText); return true; } catch (e) { toastr.error("Invalid JSON."); return false; } } });
    if (await popup.show()) {
        try {
            const res = await fetch('/api/sd/comfy/save-workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name, workflow: JSON.stringify(JSON.parse(currentJsonText)) }) });
            if (!res.ok) throw new Error(await res.text()); toastr.success("Workflow Saved!");
        } catch (e) { toastr.error("Save Failed."); }
    }
}

function showKazumaProgress(text = "Processing...") {
    if ($("#kazuma_progress_overlay").length === 0) {
        $("body").append(`
            <div id="kazuma_progress_overlay" style="position: fixed; bottom: 20px; right: 20px; width: 300px; background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 15px; z-index: 99999; box-shadow: 0 10px 30px rgba(0,0,0,0.8); display: none; align-items: center; gap: 15px; font-family: 'Inter', sans-serif;">
                <div style="flex:1">
                    <span id="kazuma_progress_text" style="font-weight: 600; font-size: 0.85rem; color: #fff; margin-bottom: 8px; display: block;">Generating Image...</span>
                    <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                        <div style="height: 100%; width: 100%; background: linear-gradient(45deg, #a855f7 25%, transparent 25%, transparent 50%, #a855f7 50%, #a855f7 75%, transparent 75%, transparent); background-size: 20px 20px; animation: kazuma-stripe-anim 1s linear infinite;"></div>
                    </div>
                </div>
            </div>
            <style>@keyframes kazuma-stripe-anim { 0% { background-position: 0 0; } 100% { background-position: 20px 0; } }</style>
        `);
    }
    $("#kazuma_progress_text").text(text); $("#kazuma_progress_overlay").css("display", "flex");
}

async function igManualGenerate() {
    const s = localProfile?.imageGen;
    if (!s || !s.enabled) return;

    showKazumaProgress("Analyzing Scene...");

    try {
        let promptText;
        if (!s.generatorBackend || s.generatorBackend === "direct") {
            promptText = await generateImagePromptText();
        } else {
            // Use the "Megumin Image" preset, but still run the exact same prompt logic
            await useMeguminEngine(async () => {
                promptText = await generateImagePromptText();
            }, "Megumin Image");
        }

        // Use capturing group 1 for the quote type, group 2 for the actual prompt text
        const imgRegex = /<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/i;
        const match = promptText.match(imgRegex);
        if (match) promptText = match[2];

        toastr.info("Sending to ComfyUI...", "Megumin Suite");
        igGenerateWithComfy(promptText, null);

    } catch (e) {
        console.error(e);
        $("#kazuma_progress_overlay").hide();
        toastr.error("Manual generation failed.");
    } finally {
        activeImageGenRequest = null;
    }
}

// New Helper Function for generating the prompt text
async function generateImagePromptText() {
    const ig = localProfile.imageGen;
    const chat = getContext().chat;
    const lastMessages = chat.filter(m => !m.is_user && !m.is_system).slice(-5).map(m => {
        return `${m.name}: ${meguminCleanChatHistoryText(m.mes)}`;
    }).join("\n\n");

    const customIg = ig.customPromptsEnabled ? (ig.customPrompts || {}) : {};
    const defIg = DEFAULT_PROMPTS.imageGen;

    let rules = "", examples = "";
    const tmpl = ig.promptTemplate || "illus_cinematic";

    const map = {
        "illus_pov": ["rulesIllusPov", "examplesIllusPov"],
        "sdxl_pov": ["rulesSdxlPov", "examplesSdxlPov"],
        "illus_cinematic": ["rulesIllusCinematic", "examplesIllusCinematic"],
        "sdxl_cinematic": ["rulesSdxlCinematic", "examplesSdxlCinematic"],
        "illus_portrait": ["rulesIllusPortrait", "examplesIllusPortrait"],
        "sdxl_portrait": ["rulesSdxlPortrait", "examplesSdxlPortrait"]
    };

    const keys = map[tmpl];
    if (keys) {
        rules = customIg[keys[0]] || defIg[keys[0]];
        examples = customIg[keys[1]] || defIg[keys[1]];
    }

    if (!ig.includeExamples) examples = "";

    let directLangStr = ig.directLanguage ? "**DIRECT LANGUAGE:** Use exact Booru tags only. \"naked\" not \"wearing nothing.\" \"erection\" not \"visible arousal.\"\n\n**NSFW TAG REFERENCE (use when scene is explicit):**\nBody: naked, nude, topless, exposed nipples, small breasts, medium breasts, large breasts, spread legs, ass, erection, veins, veiny penis\nActions: hetero, sex, vaginal, anal, oral, fellatio, after fellatio, paizuri, straddling, riding, missionary, doggystyle, cowgirl position, moaning, open mouth, tongue out, ahegao, clenching teeth\nFluids: cum, cum on body, cum on breasts, cum on face, cum on hair, cum on tongue, cum in mouth, cum inside, ejaculation, facial, saliva, sweat\nState: flushed face, heavy breathing, trembling, crying with eyes open, half-closed eyes, solo focus" : "";
    let npcTagsStr = getRelevantNpcImageTags(); // <-- GET THE TAGS

    activeImageGenRequest = { 
        chatText: lastMessages, 
        templateRules: rules, 
        templateExamples: examples, 
        extraStr: ig.promptExtra || "",
        directLanguageStr: directLangStr,
        npcTagsStr: npcTagsStr // <-- ADD TO REQUEST
    };

    let rawOutput = await generateQuietPrompt({ prompt: "___PS_IMAGE_GEN___" });
    return rawOutput.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ── Inline Image Retry: DOM-based button injection ──
// SillyTavern's HTML sanitizer renames custom CSS classes (e.g. "kazuma-foo" → "custom-kazuma-foo")
// when rendering message.mes. This means buttons stored in mes will never match click handlers.
// Instead, we inject buttons via direct DOM manipulation AFTER ST renders, like ComfyInject does.
function addKazumaRetryButtons(msgIndex) {
    const context = getContext();
    const message = context.chat[msgIndex];
    if (!message) return;

    const messageNode = document.querySelector(`[mesid="${msgIndex}"]`);
    if (!messageNode) return;

    // ST's sanitizer prefixes custom classes with "custom-" in the rendered DOM
    const images = messageNode.querySelectorAll('img[alt="KazumaInline"]');
    if (images.length === 0) return;

    images.forEach((img) => {
        // Find the wrapper div (ST may rename the class, but the structure is preserved)
        const wrapper = img.closest('div');
        if (!wrapper) return;

        // Don't add a second retry button if one already exists
        if (wrapper.querySelector('.kazuma-regen-btn')) return;

        // Get the wrapperId — try data attr first, then wrapper's id
        const wrapperId = img.getAttribute('data-kazumaid') || img.dataset?.kazumaid || wrapper.id || '';

        // Get the prompt — try title attr from DOM, then parse from message.mes
        let prompt = (img.getAttribute('title') || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        if (!prompt && wrapperId && message.mes) {
            // Extract prompt from the raw mes using the wrapperId
            const mesMatch = message.mes.match(new RegExp(`<img[^>]*?title="([^"]*)"[^>]*?data-kazumaid="${wrapperId}"`));
            if (mesMatch) prompt = mesMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        }

        if (!prompt || !wrapperId) return;

        // Style the wrapper for absolute positioning of the button
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';

        // Create the retry button
        const btn = document.createElement('div');
        btn.className = 'kazuma-regen-btn';
        btn.title = 'Regenerate this image';
        btn.style.cssText = 'position:absolute; top:8px; right:8px; cursor:pointer; background:rgba(0,0,0,0.65); color:#ffcc00; border-radius:6px; padding:5px 8px; font-size:14px; z-index:10; border:1px solid rgba(255,204,0,0.5); opacity:0; transition:opacity 0.2s ease; line-height:1;';
        btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';

        // Show/hide on hover
        wrapper.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        wrapper.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });

        // Click handler — directly attached, no delegation needed
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            const s = localProfile?.imageGen;
            if (!s || !s.enabled) { toastr.warning("Image Generation is disabled."); return; }

            // Re-find the message dynamically (index may have shifted)
            const ctx = getContext();
            const currentMsgIndex = ctx.chat.findIndex(m => m.mes && m.mes.includes(wrapperId));
            if (currentMsgIndex === -1) { toastr.warning("Could not find the original message for this image."); return; }
            const msg = ctx.chat[currentMsgIndex];

            // Replace the HTML block back to the loading placeholder
            const regenRegex = new RegExp(`<!-- kazuma-inline-start:${wrapperId} -->[\\s\\S]*?<!-- kazuma-inline-end:${wrapperId} -->`, "g");
            const placeholder = `<div id="${wrapperId}" class="kazuma-img-placeholder" style="color:var(--gold); font-style: italic; margin: 10px 0;">[Regenerating Image...]</div>`;

            if (msg.mes.includes(`kazuma-inline-start:${wrapperId}`)) {
                msg.mes = msg.mes.replace(regenRegex, placeholder);
            } else {
                toastr.warning("Could not find the original image block to replace.");
                return;
            }

            await saveChat();
            if (typeof updateMessageBlock === "function") {
                updateMessageBlock(currentMsgIndex, msg);
            } else {
                reloadCurrentChat();
            }

            toastr.info("Regenerating inline image...");
            igGenerateWithComfy(prompt, { message: msg, index: currentMsgIndex, mode: "inline", isInlineAuto: true, placeholderId: wrapperId });
        });

        wrapper.appendChild(btn);
    });
}

async function igGenerateWithComfy(positivePrompt, target = null) {
    const s = localProfile.imageGen;
    let finalPrompt = positivePrompt;

    // --- INTERCEPT PROMPT IF PREVIEW IS ENABLED ---
    if (s.previewPrompt) {
        $("#kazuma_progress_overlay").hide(); // Hide the progress bar temporarily

        const $content = $(`
            <div style="display:flex; flex-direction:column; gap:10px; font-family: 'Inter', sans-serif;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">Review or modify the prompt before it goes to ComfyUI.</div>
                <textarea class="ps-modern-input ig-preview-textarea" style="height: 150px; resize: vertical; font-family: monospace; font-size: 0.85rem; padding: 10px;">${finalPrompt}</textarea>
            </div>
        `);

        // CRITICAL FIX: SillyTavern destroys the popup HTML when it closes. 
        // We MUST capture the text while the user is typing!
        let liveText = finalPrompt;
        $content.find(".ig-preview-textarea").on("input", function () {
            liveText = $(this).val();
        });

        const popup = new Popup($content, POPUP_TYPE.CONFIRM, "Preview Image Prompt", { okButton: "Send to ComfyUI", cancelButton: "Cancel", wide: true });
        const confirmed = await popup.show();

        if (!confirmed) {
            toastr.info("Generation cancelled.");
            return;
        }

        finalPrompt = liveText.trim();
        if (!finalPrompt) return toastr.warning("Prompt cannot be empty.");

        showKazumaProgress("Preparing to Render..."); // Bring progress bar back
    }

    let workflowRaw;
    try {
        const res = await fetch('/api/sd/comfy/workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: s.currentWorkflowName }) });
        if (!res.ok) throw new Error("Load failed"); workflowRaw = await res.json();
    } catch (e) { return toastr.error(`Could not load ${s.currentWorkflowName}`); }

    let workflow = (typeof workflowRaw === 'string') ? JSON.parse(workflowRaw) : workflowRaw;
    let finalSeed = parseInt(s.customSeed); if (finalSeed === -1 || isNaN(finalSeed)) finalSeed = Math.floor(Math.random() * 1000000000);

    let seedInjected = false;
    for (const nodeId in workflow) {
        const node = workflow[nodeId];
        if (node.inputs) {
            for (const key in node.inputs) {
                const val = node.inputs[key];
                if (val === "%prompt%") node.inputs[key] = finalPrompt;
                if (val === "%negative_prompt%") node.inputs[key] = s.customNegative || "";
                if (val === "%seed%") { node.inputs[key] = finalSeed; seedInjected = true; }
                if (val === "%sampler%") node.inputs[key] = s.selectedSampler || "euler";
                if (val === "%model%") node.inputs[key] = s.selectedModel || "v1-5-pruned.ckpt";
                if (val === "%steps%") node.inputs[key] = parseInt(s.steps) || 20;
                if (val === "%scale%") node.inputs[key] = parseFloat(s.cfg) || 7.0;
                if (val === "%denoise%") node.inputs[key] = parseFloat(s.denoise) || 1.0;
                if (val === "%clip_skip%") node.inputs[key] = -Math.abs(parseInt(s.clipSkip)) || -1;
                if (val === "%lora1%") node.inputs[key] = s.selectedLora || "None";
                if (val === "%lora2%") node.inputs[key] = s.selectedLora2 || "None";
                if (val === "%lora3%") node.inputs[key] = s.selectedLora3 || "None";
                if (val === "%lora4%") node.inputs[key] = s.selectedLora4 || "None";
                if (val === "%lorawt1%") node.inputs[key] = parseFloat(s.selectedLoraWt) || 1.0;
                if (val === "%lorawt2%") node.inputs[key] = parseFloat(s.selectedLoraWt2) || 1.0;
                if (val === "%lorawt3%") node.inputs[key] = parseFloat(s.selectedLoraWt3) || 1.0;
                if (val === "%lorawt4%") node.inputs[key] = parseFloat(s.selectedLoraWt4) || 1.0;
                if (val === "%width%") node.inputs[key] = parseInt(s.imgWidth) || 512;
                if (val === "%height%") node.inputs[key] = parseInt(s.imgHeight) || 512;
            }
            if (!seedInjected && node.class_type === "KSampler" && 'seed' in node.inputs && typeof node.inputs['seed'] === 'number') { node.inputs.seed = finalSeed; }
        }
    }

    try {
        const res = await fetch(`${s.comfyUrl}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow }) });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        showKazumaProgress("Rendering Image...");
        const checkInterval = setInterval(async () => {
            try {
                const h = await (await fetch(`${s.comfyUrl}/history/${data.prompt_id}`)).json();
                if (h[data.prompt_id]) {
                    clearInterval(checkInterval);
                    let finalImage = null;
                    for (const nodeId in h[data.prompt_id].outputs) {
                        const nodeOut = h[data.prompt_id].outputs[nodeId];
                        if (nodeOut.images && nodeOut.images.length > 0) { finalImage = nodeOut.images[0]; break; }
                    }
                    if (finalImage) {
                        showKazumaProgress("Downloading...");
                        const imgUrl = `${s.comfyUrl}/view?filename=${finalImage.filename}&subfolder=${finalImage.subfolder}&type=${finalImage.type}`;

                        // Download & Compress
                        const response = await fetch(imgUrl); const blob = await response.blob();
                        const base64Raw = await new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(blob); });
                        let base64Clean = base64Raw; let format = "png";
                        if (s.compressImages) {
                            base64Clean = await new Promise((res) => { const img = new Image(); img.src = base64Raw; img.onload = () => { const cvs = document.createElement('canvas'); cvs.width = img.width; cvs.height = img.height; cvs.getContext('2d').drawImage(img, 0, 0); res(cvs.toDataURL("image/jpeg", 0.9)); }; img.onerror = () => res(base64Raw); });
                            format = "jpeg";
                        }

                        // Insert to Chat
                        const charName = getContext().characters[getContext().characterId]?.name || "User";
                        const savedPath = await saveBase64AsFile(base64Clean.split(',')[1], charName, `${charName}_${humanizedDateTime()}`, format);
                        const mediaAttach = {
                            url: savedPath,
                            type: "image",
                            source: "generated",
                            title: finalPrompt,
                            generation_type: "free"
                        };

                        if (target && target.isInlineAuto && target.mode === "inline") {
                            const safePrompt = finalPrompt.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            const wrapperId = target.placeholderId || `kazuma-img-${Date.now()}`;
                            const imgTag = `<!-- kazuma-inline-start:${wrapperId} --><div id="${wrapperId}" class="kazuma-img-wrapper">
<img src="${savedPath}" title="${safePrompt}" alt="KazumaInline" data-kazumaid="${wrapperId}" style="max-width: 100%; border-radius: 8px; display: block;" />
</div><!-- kazuma-inline-end:${wrapperId} -->`;
                            
                            if (target.placeholderId && target.message.mes.includes(`id="${target.placeholderId}"`)) {
                                const specificPlaceholderRegex = new RegExp(`<div id="${target.placeholderId}"[^>]*>.*?<\/div>`, "g");
                                target.message.mes = target.message.mes.replace(specificPlaceholderRegex, imgTag);
                            } else {
                                const placeholderRegex = /<div class="kazuma-img-placeholder"[^>]*>\[(Generating|Regenerating) Image\.\.\.\]<\/div>/g;
                                if (placeholderRegex.test(target.message.mes)) {
                                    target.message.mes = target.message.mes.replace(placeholderRegex, imgTag);
                                } else {
                                    target.message.mes += `\n\n${imgTag}`;
                                }
                            }
                            
                            await saveChat();
                            if (typeof updateMessageBlock === "function") {
                                updateMessageBlock(target.index, target.message);
                            } else {
                                await reloadCurrentChat();
                            }
                            toastr.success("Image injected inline!");
                            
                            // Add retry buttons via DOM manipulation (after ST renders)
                            setTimeout(() => addKazumaRetryButtons(target.index), 150);
                        } else if (target && target.message && !target.isInlineAuto) {
                            if (!target.message.extra) target.message.extra = {}; if (!target.message.extra.media) target.message.extra.media = [];
                            target.message.extra.media_display = "gallery"; target.message.extra.media.push(mediaAttach); target.message.extra.media_index = target.message.extra.media.length - 1;
                            if (typeof appendMediaToMessage === "function") appendMediaToMessage(target.message, target.element);
                            await saveChat(); toastr.success("Gallery updated!");
                        } else {
                            const newMsg = { name: "Image Gen Kazuma", is_user: false, is_system: true, send_date: Date.now(), mes: "", extra: { media: [mediaAttach], media_display: "gallery", media_index: 0 }, force_avatar: "img/five.png" };
                            getContext().chat.push(newMsg); await saveChat();
                            if (typeof addOneMessage === "function") addOneMessage(newMsg); else await reloadCurrentChat();
                            toastr.success("Image inserted!");
                        }
                        $("#kazuma_progress_overlay").hide();
                    } else { 
                        $("#kazuma_progress_overlay").hide(); 
                        if (target && target.isInlineAuto && target.mode === "inline") {
                            const wrapperId = target.placeholderId || `kazuma-img-${Date.now()}`;
                            const safePrompt = finalPrompt.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            const failTag = `<!-- kazuma-inline-start:${wrapperId} --><div id="${wrapperId}" class="kazuma-img-wrapper" style="color:#ef4444; font-style: italic; margin: 10px 0;"><span>[Image Generation Failed]</span> <img alt="KazumaInline" data-kazumaid="${wrapperId}" title="${safePrompt}" style="display:none;" /></div><!-- kazuma-inline-end:${wrapperId} -->`;
                            
                            if (target.placeholderId && target.message.mes.includes(`id="${target.placeholderId}"`)) {
                                const specificPlaceholderRegex = new RegExp(`<div id="${target.placeholderId}" class="kazuma-img-placeholder"[^>]*>.*?<\\/div>`, "g");
                                target.message.mes = target.message.mes.replace(specificPlaceholderRegex, failTag);
                            } else {
                                const placeholderRegex = /<div class="kazuma-img-placeholder"[^>]*>\[(Generating|Regenerating) Image\.\.\.\]<\/div>/g;
                                target.message.mes = target.message.mes.replace(placeholderRegex, failTag);
                            }
                            saveChat();
                            if (typeof updateMessageBlock === "function") {
                                updateMessageBlock(target.index, target.message);
                            }
                            setTimeout(() => addKazumaRetryButtons(target.index), 150);
                        }
                    }
                }
            } catch (e) { }
        }, 1000);
    } catch (e) { 
        $("#kazuma_progress_overlay").hide(); 
        toastr.error("Comfy Error: " + e.message); 
        if (target && target.isInlineAuto && target.mode === "inline") {
            const wrapperId = target.placeholderId || `kazuma-img-${Date.now()}`;
            const safePrompt = finalPrompt.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const failTag = `<!-- kazuma-inline-start:${wrapperId} --><div id="${wrapperId}" class="kazuma-img-wrapper" style="color:#ef4444; font-style: italic; margin: 10px 0;"><span>[Image Generation Failed: ${e.message}]</span> <img alt="KazumaInline" data-kazumaid="${wrapperId}" title="${safePrompt}" style="display:none;" /></div><!-- kazuma-inline-end:${wrapperId} -->`;
            
            if (target.placeholderId && target.message.mes.includes(`id="${target.placeholderId}"`)) {
                const specificPlaceholderRegex = new RegExp(`<div id="${target.placeholderId}" class="kazuma-img-placeholder"[^>]*>.*?<\\/div>`, "g");
                target.message.mes = target.message.mes.replace(specificPlaceholderRegex, failTag);
            } else {
                const placeholderRegex = /<div class="kazuma-img-placeholder"[^>]*>\[(Generating|Regenerating) Image\.\.\.\]<\/div>/g;
                target.message.mes = target.message.mes.replace(placeholderRegex, failTag);
            }
            saveChat();
            if (typeof updateMessageBlock === "function") {
                updateMessageBlock(target.index, target.message);
            }
            setTimeout(() => addKazumaRetryButtons(target.index), 150);
        }
    }
}

// -------------------------------------------------------------
// AI GENERATION & BAN LIST HELPER FUNCTIONS (RESTORED)
// -------------------------------------------------------------
function getCleanedChatHistory() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return "";

    const aiMessages = context.chat.filter(m => !m.is_user && !m.is_system).slice(-50);
    const badStuffRegex = /(<disclaimer>.*?<\/disclaimer>)|(<guifan>.*?<\/guifan>)|(<danmu>.*?<\/danmu>)|(<options>.*?<\/options>)|```start|```end|<done>|`<done>`|(.*?<\/(?:ksc??|think(?:ing)?)>(\n)?)|(<(?:ksc??|think(?:ing)?)>[\s\S]*?<\/(?:ksc??|think(?:ing)?)>(\n)?)/gs;

    let cleanedMessages = aiMessages.map(m => meguminCleanChatHistoryText(m.mes));

    cleanedMessages = cleanedMessages.filter(t => t.length > 0);
    return cleanedMessages.join("\n\n");
}

function getChatHistoryForStoryPlan() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return "";

    const messages = context.chat.filter(m => !m.is_system);
    let cleaned_messages = [];

    for (let m of messages)
    {
        cleaned_messages.push({
            mes: meguminCleanChatHistoryText(m.mes),
            is_system: m.is_system,
            is_user: m.is_user
        });
    }

    cleaned_messages = cleaned_messages.filter(t => t.mes.length > 0);
    let result = [];
    let is_first_message = true;
    
    for (let m of cleaned_messages)
    {
        if (is_first_message)
        {
            is_first_message = false;
        }
        else
        {
            result.push("\n\n");
        }

        if (m.is_system)
        {
            result.push("SYSTEM:\n");
        }
        else if (m.is_user)
        {
            result.push("PLAYER:\n");
        }
        else
        {
            result.push("GAME MASTER:\n");
        }
        
        result.push(m.mes);
    }

    return result.join("");
}

function getChatForNpcScan() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return "";
    const depth = localProfile?.npcBank?.scanDepth || 60;
    // Grab the last 'depth' actual messages (both user and AI) to have complete context
    const msgs = context.chat.filter(m => !m.is_system).slice(-depth);
    return msgs.map(m => `${m.name}: ${meguminCleanChatHistoryText(m.mes)}`).join("\n\n");
}

async function analyzeSlopDirectly(chatText) {
    activeBanListChat = chatText;
    try {
        let rawOutput = await generateQuietPrompt({ prompt: "___PS_BANLIST___" });
        return rawOutput.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    } catch (e) {
        console.error(`[${extensionName}] Ban List Analysis Failed:`, e);
        return null;
    } finally {
        activeBanListChat = null;
    }
}

async function analyzeSlopWithPreset(chatText) {
    let result = null;
    await useMeguminEngine(async () => {
        // We still use the interceptor! This just makes the engine switch first.
        result = await analyzeSlopDirectly(chatText);
    });
    return result;
}

async function useMeguminEngine(task, targetPreset = TARGET_PRESET_NAME) { // Added parameter with default value
    const selector = $("#settings_preset_openai");
    const option = selector.find(`option`).filter(function () { return $(this).text().trim() === targetPreset; }); // Use the new parameter
    let originalValue = null;

    if (option.length) {
        originalValue = selector.val();
        selector.val(option.val()).trigger("change");
        toastr.info(`Switched to ${targetPreset} preset... Please wait.`);
        await new Promise(r => setTimeout(r, 3000));
    } else {
        toastr.error(`"${targetPreset}" not found in OpenAI presets.`);
        return;
    }

    try {
        await task();
    } catch (e) {
        console.error(`[${extensionName}] AI Error:`, e);
    } finally {
        await new Promise(r => setTimeout(r, 500));
        selector.val(originalValue).trigger("change");
    }
}

async function runMeguminTask(orderText) {
    activeGenerationOrder = orderText;
    try {
        return await generateQuietPrompt({ prompt: "___PS_DUMMY___" });
    } finally {
        activeGenerationOrder = null;
    }
}

$("body").on("input", "#ps_main_current_rule", function () {
    localProfile.aiRule = $(this).val(); saveProfileToMemory();
});

// Scans the chat and extracts Image Tags for relevant NPCs
function getRelevantNpcImageTags() {
    const s = localProfile?.imageGen;
    if (!s || !s.injectNpcTags) return "";
    
    const nb = localProfile?.npcBank;
    if (!nb || !nb.npcs || nb.npcs.length === 0) return "";
    
    const context = typeof getContext === 'function' ? getContext() : null;
    if (!context || !context.chat) return "";

    // Scan the last 4 messages for keywords
    const recentText = context.chat.filter(m => !m.is_system).slice(-4).map(m => meguminCleanChatHistoryText(m.mes)).join(" ").toLowerCase();
    const keywords = typeof memExtractKeywords === 'function' ? memExtractKeywords(recentText) : [];
    if (keywords.length === 0) return "";

    let scoredNpcs = [];
    nb.npcs.forEach(n => {
        if (!n.imageTags || n.imageTags.trim() === "") return; // Skip NPCs with no image tags
        
        let score = 0;
        const contentLower = npcBuildTextFromData(n).toLowerCase();
        keywords.forEach(kw => {
            if (contentLower.includes(kw)) score++;
        });
        
        if (score >= 1) {
            scoredNpcs.push({ name: n.name, tags: n.imageTags, score: score });
        }
    });

    if (scoredNpcs.length === 0) return "";
    
    scoredNpcs.sort((a, b) => b.score - a.score);
    const topNpcs = scoredNpcs.slice(0, 3); // Grab the top 3 relevant NPCs
    
    return "**RELEVANT NPC IMAGE TAGS:**\n" + topNpcs.map(n => `[${n.name}]: ${n.tags}`).join("\n");
}

// -------------------------------------------------------------
// EVENT LISTENERS & INITS
// -------------------------------------------------------------
function buildBaseDict() {
    const dict = {};
    if (!localProfile) return dict;

    const allAvailableModes = [...hardcodedLogic.modes, ...(extension_settings[extensionName].customModes || [])];
    const activeEngine = allAvailableModes.find(m => m.id === localProfile.mode);
    const isV7 = activeEngine ? (activeEngine.id.startsWith("v7") || activeEngine.isV7 === true) : false;
    const isV8 = activeEngine ? (activeEngine.id.startsWith("v8") || activeEngine.isV8 === true) : false;

    // 1. GLOBAL DEFAULTS (Language, Pronouns, Word Count)
    const targetLang = (localProfile.userLanguage && localProfile.userLanguage.trim() !== "")
        ? localProfile.userLanguage.toUpperCase()
        : "ENGLISH";
    dict["[[Language]]"] = `[LANGUAGE RULE]\nALL OUTPUT EXCEPT THINKING MUST BE IN ${targetLang} ONLY.`;

    if (localProfile.userPronouns === "male") dict["[[pronouns]]"] = `{{user}} is male. Always portray and address him as such.`;
    else if (localProfile.userPronouns === "female") dict["[[pronouns]]"] = `{{user}} is female. Always portray and address her as such.`;

    const wordCountStr = (localProfile.userWordCount && String(localProfile.userWordCount).trim() !== "")
        ? String(localProfile.userWordCount).trim()
        : null;

    const countType = localProfile.userWordCountType === "min" ? "minimum" : "maximum";

    if (wordCountStr) {
        dict["[[count]]"] = `— ${countType} ${wordCountStr} words`;
    } else {
        dict["[[count]]"] = "";
    }

    // 2. STANDARD STAGE SELECTIONS (Stage 2, 4, 5, 6)

    // Personality (Stage 2) - Will be overwritten later if Custom Engine is active
    const pData = hardcodedLogic.personalities.find(p => p.id === localProfile.personality);
    dict["[[main]]"] = pData ? pData.content : "";
    dict["[[AI1]]"] = "Understood."; // Default
    dict["[[AI2]]"] = "Understood."; // Default

    if (localProfile.personality === "megumin") {
        dict["[[AI1]]"] = "Fine i read the rules.";
        dict["[[AI2]]"] = "OK i Understnd it.";
    }

    // Standard Toggles & Addons
    if (localProfile.toggles.ooc) dict["[[OOC]]"] = hardcodedLogic.toggles.ooc.content;
    if (localProfile.toggles.control) dict["[[control]]"] = hardcodedLogic.toggles.control.content;
    let povInjectionStr = "";
    if (localProfile.aiRule) {
        // Check if the current style is from the Precooked array
        const isPrecooked = hardcodedLogic.directStyles.some(ds => ds.id === localProfile.activeStyleId);
        if (isPrecooked && localProfile.userPov) {
            povInjectionStr = `POV: ${localProfile.userPov}\n`;
        }
    }

    if (localProfile.mode === "v7.5") {
        let narratorPersona = localProfile.aiRule ? localProfile.aiRule : "Adopt the narration of an unseen, witty observer who is vividly present in the scene. The narrator has a distinct personality—dry, occasionally judgmental, quietly amused, or sharply critical. Feel free to throw subtle shade at terrible decisions, point out the absurdity of a situation, or comment on the scene's chaos with a bit of comedic flair.";
        
        dict["[[aiprompt]]"] = `<Narration_style>\n narrator_persona: "${povInjectionStr}${narratorPersona}"\n quarantine_rule: "CRITICAL: This opinionated voice applies STRICTLY and EXCLUSIVELY to the narration. It MUST NOT bleed into <NPC_dialogue>. NPCs do not share the narrator's wit or perspective; their dialogue remains entirely bound by their own demographics, stress levels, and individual flaws."\n proportional_prose: "Match narrative intensity to the event. A spilled coffee is just a minor annoyance, not a catalyst for dramatic prose. Zero purple prose. Use grounded metaphors sparingly to anchor a scene, not distract from it."\n</Narration_style>`;
    } else if (localProfile.aiRule) {
        if (isV7 && localProfile.activeStyleId !== "dir_v7" && localProfile.activeStyleId !== "dir_v7_core" && localProfile.activeStyleId !== "dir_v7_gentle") {
            dict["[[aiprompt]]"] = `<narrative_style>\n voice: ${povInjectionStr}${localProfile.aiRule}\n  pacing: "Unhurried where it should be. A quiet moment can take a paragraph. A violent one can take a sentence. Match the rhythm to the content."\n  length_directive: "Typical outputs should run 3–6 substantial paragraphs, scaling with scene density. Lean toward the higher end during rich, atmospheric, or multi-character scenes. Go shorter — even a single paragraph — only when the moment genuinely demands economy: a held breath, a door closing, a line that hits harder alone. Never pad, never rush."\n</narrative_style>`;
        } else {
            dict["[[aiprompt]]"] = povInjectionStr + localProfile.aiRule;
        }
    }
    localProfile.addons.forEach(aId => {
        const item = hardcodedLogic.addons.find(a => a.id === aId);
        if (item) dict[item.trigger] = item.content;
    });

    // Stage 5 Defaults (Format Blocks)
    localProfile.blocks.forEach(bId => {
        // The UI handles the warning, so we allow the injection anyway:
        // if (bId === "info" && localProfile.blocks.includes("mvu")) return;
        // if (bId === "summary" && localProfile.memoryCore && localProfile.memoryCore.enabled) return;

        const item = hardcodedLogic.blocks.find(b => b.id === bId);
        if (item) dict[item.trigger] = item.content;
    });

    // Stage 6 Defaults (CoT Framework & Language)
    const modData = hardcodedLogic.models.find(m => m.id === localProfile.model);
    if (localProfile.cotEnabled !== false && modData) {
        dict["[[COT]]"] = modData.content;
        if (modData.prefill) dict["[[prefill]]"] = modData.prefill;
    } else {
        dict["[[COT]]"] = "";
        dict["[[prefill]]"] = "";
    }

    if (localProfile.dnRatio && localProfile.dnRatio.enabled) {
        const d = localProfile.dnRatio.dialogue;
        const n = 100 - d;
        dict["[[DNRATIO]]"] = `- Ratio: Maintain a balance of ${d}% Dialogue and ${n}% Narration.`;
    } else {
        dict["[[DNRATIO]]"] = "";
    }

    if (localProfile.onomatopoeia && localProfile.onomatopoeia.enabled) {
        let onoRule = `- Narration must utilize onomatopoeia. Use precise, context-specific phonetic representations for physical interactions (e.g., the click of a latch, the thud of a heavy object, the soughing of wind) rather than abstract descriptions of sound.`;
        if (localProfile.onomatopoeia.useStyling) {
            onoRule += `\nAll onomatopoeic words must animated and colored using HTML and CSS. The selected style tag and color must objectively correspond to the physical nature or movement of the sound produced; for example, a repetitive friction sound such as "shush-shush" must utilize a sliding animation tag to represent the physical action.`;
        }
        dict["[[onomato]]"] = onoRule;
    } else {
        dict["[[onomato]]"] = "";
    }

    // MVU Logic
    if (localProfile.blocks.includes("mvu")) {
        let baseMvu = hardcodedLogic.blocks.find(b => b.id === "mvu").content;
        
        // Inject [[img2]] into the gametxt block so it can be resolved if Image Gen is active
        baseMvu = baseMvu.replace("<gametxt>[[count]]</gametxt>", "<gametxt>[[count]][[img2]]</gametxt>");
        
        if (wordCountStr) dict["[[MVU]]"] = baseMvu.replace("[[count]]", `${countType} ${wordCountStr} words`);
        else dict["[[MVU]]"] = baseMvu.replace("[[count]]", "...");
    } else {
        // Embed [[img2]] into the standard curly brace format
        dict["[[MVU]]"] = wordCountStr ? `{main response — ${countType} ${wordCountStr} words[[img2]]}` : `{main response[[img2]]}`;
    }

    // 3. ENGINE OVERRIDES (The "Superior" Layer)
    // This part runs last so it can overwrite standard Stage choices
    const isCustom = activeEngine && !hardcodedLogic.modes.find(x => x.id === activeEngine.id);

    if (activeEngine) {
        // Map p1-p6
        for (let i = 1; i <= 6; i++) {
            const val = activeEngine[`p${i}`] || "";
            dict[`[[prompt${i}]]`] = val;
            dict[`[prompt${i}]`] = val;
        }

        // Custom Engines kill [[main]] personality ONLY if they are truly built from scratch
        if (isCustom && activeEngine.isCoreClone !== true) {
            dict["[[main]]"] = "";
        }

        // Engine-specific AI Prefills (If defined in the engine)
        if (activeEngine.A1) dict["[[AI1]]"] = activeEngine.A1;
        if (activeEngine.A2) dict["[[AI2]]"] = activeEngine.A2;

        // Engine-specific Block Overwrites
        const overrides = [
            { key: "cot", trigger: "[[COT]]", condition: true },
            { key: "prefill", trigger: "[[prefill]]", condition: true },
            { key: "think", trigger: "[[THINK]]", condition: localProfile.thinkingV2 },
            { key: "info", trigger: "[[infoblock]]", condition: localProfile.blocks.includes("info") },
            { key: "summary", trigger: "[[summary]]", condition: localProfile.blocks.includes("summary") },
            { key: "cyoa", trigger: "[[cyoa]]", condition: localProfile.blocks.includes("cyoa") },
            { key: "mvu", trigger: "[[MVU]]", condition: localProfile.blocks.includes("mvu") },
            { key: "death", trigger: "[[death]]", condition: localProfile.addons.includes("death") },
            { key: "combat", trigger: "[[combat]]", condition: localProfile.addons.includes("combat") },
            { key: "direct", trigger: "[[Direct]]", condition: localProfile.addons.includes("direct") },
            { key: "dn", trigger: "[[DN]]", condition: localProfile.addons.includes("dn") },
            { key: "dialogueColor", trigger: "[[COLOR]]", condition: localProfile.addons.includes("color") }, // FIXED NAME COLLISION
            { key: "npc_inner_chatter", trigger: "[[npc_inner_chatter]]", condition: localProfile.blocks.includes("npc_inner_chatter") || localProfile.blocks.includes("npc_inner_chatter_v2") },
            { key: "storytracker", trigger: "[[storytracker]]", condition: localProfile.storyPlan && localProfile.storyPlan.enabled },
            { key: "language", trigger: "[[Language]]", condition: true },
            { key: "pronouns", trigger: "[[pronouns]]", condition: true },
            { key: "count", trigger: "[[count]]", condition: true },
            { key: "dnratio", trigger: "[[DNRATIO]]", condition: localProfile.dnRatio && localProfile.dnRatio.enabled },
            { key: "onomato", trigger: "[[onomato]]", condition: localProfile.onomatopoeia && localProfile.onomatopoeia.enabled },
            { key: "banlist", trigger: "[[banlist]]", condition: true }
        ];

        overrides.forEach(o => {
            // Only inject the override if the toggle is ON (or if it's a global setting)
            if (o.condition && activeEngine[o.key] && activeEngine[o.key].trim() !== "") {
                dict[o.trigger] = activeEngine[o.key];
            }
        });

        // Custom Toggles Appender
        if (activeEngine.customToggles) {
            activeEngine.customToggles.forEach(ct => {
                if (localProfile.toggles[ct.id]) {
                    const targetKey = "[[prompt" + ct.attachPoint.replace('p', '') + "]]";
                    if (dict[targetKey] !== undefined) {
                        dict[targetKey] += `\n\n${ct.content}`;
                    }
                }
            });
        }

        // V7 Dynamic Stripping
        if (isV7) {
            if (!localProfile.toggles.v7_ooc && dict["[[prompt1]]"]) {
                dict["[[prompt1]]"] = dict["[[prompt1]]"].replace(/<ooc_protocol>[\s\S]*?<\/ooc_protocol>/g, "");
            }
            if (dict["[[prompt4]]"]) {
                if (!localProfile.toggles.v7_pcsolo) {
                    dict["[[prompt4]]"] = dict["[[prompt4]]"].replace(/<pc_solo_physicality[\s\S]*?<\/pc_solo_physicality>/g, "");
                }
                if (!localProfile.toggles.v7_culture) {
                    dict["[[prompt4]]"] = dict["[[prompt4]]"].replace(/<cultural_anchoring>[\s\S]*?<\/cultural_anchoring>/g, "");
                }
                if (!localProfile.toggles.v7_scene) {
                    dict["[[prompt4]]"] = dict["[[prompt4]]"].replace(/<scene_choreography>[\s\S]*?<\/scene_choreography>/g, "");
                }
                if (!localProfile.toggles.v7_intro) {
                    dict["[[prompt4]]"] = dict["[[prompt4]]"].replace(/\s*introduction_protocol:\s*"[^"]*"/g, "");
                }
            }
        }
        // V8 Dynamic Injection & Stripping
        if (isV8) {
            // 1. Inject [[aiprompt]] directly into the engine prompts (like p6) where the tag exists
            const aiPromptVal = dict["[[aiprompt]]"] || "";
            for (let i = 1; i <= 6; i++) {
                if (dict[`[[prompt${i}]]`] && dict[`[[prompt${i}]]`].includes("[[aiprompt]]")) {
                    dict[`[[prompt${i}]]`] = dict[`[[prompt${i}]]`].split("[[aiprompt]]").join(aiPromptVal);
                }
            }
            // 2. Wipe [[aiprompt]] from the dictionary so it gets erased from the main ST Preset!
            dict["[[aiprompt]]"] = "";
        }
    }

    // Wipe main persona for V6, V7, and V8
    if (localProfile.mode.includes("v6-dream-team") || isV7 || isV8) {
        dict["[[main]]"] = "";
    }

    // Wipe Persona & Toggle tags entirely for V8
    if (isV8) {
        dict["[[OOC]]"] = "";
        dict["[[control]]"] = "";
        dict["[[AI1]]"] = "";
        dict["[[AI2]]"] = "";
    }

    // NEW: Inject Thinking Effort to the absolute top of whatever [[COT]] is currently active
    let effort = localProfile.thinkEffort || "unspecified";
    if (effort !== "unspecified" && dict["[[COT]]"]) {
        let words = effort === "custom" ? (localProfile.customThinkEffort || "100") : effort;
        dict["[[COT]]"] = `Your Thinking must not be more than ${words} words.\n\n` + dict["[[COT]]"];
    }

    // [[THINK]] Macro Logic
    if (localProfile.cotEnabled !== false && dict["[[COT]]"]) {
        if (localProfile.thinkingV2) {
            dict["[[THINK]]"] = `<think>\n<think>\n<think>\n${dict["[[COT]]"]}\n</think>`;
        } else {
            dict["[[THINK]]"] = `<think>\n${dict["[[COT]]"]}\n</think>`;
        }
        dict["[[COT]]"] = ""; // Clear COT so it's not injected twice
    } else {
        dict["[[THINK]]"] = "";
    }

    // Story Planner Injection
    if (localProfile.storyPlan && localProfile.storyPlan.enabled) {
        const planText = localProfile.storyPlan.currentPlan;
        const spCustom = localProfile.storyPlan.customPromptsEnabled ? localProfile.storyPlan.customPrompts : null;
        if (planText && planText.trim() !== "") {
            const template = (spCustom && spCustom.injectionTemplate) || DEFAULT_PROMPTS.storyPlan.injectionTemplate;
            dict["[[storyplan]]"] = template.replace('{{planText}}', planText);
        } else {
            dict["[[storyplan]]"] = "";
        }

        // The refined tracker block you asked for
        const trackerTemplate = (spCustom && spCustom.trackerTemplate) || DEFAULT_PROMPTS.storyPlan.trackerTemplate;
        dict["[[storytracker]]"] = trackerTemplate;
    } else {
        dict["[[storyplan]]"] = "";
        dict["[[storytracker]]"] = "";
    }

    // 4. FINAL INJECTIONS (Banlist & Image Gen)
    if (localProfile.banList && localProfile.banList.length > 0) {
        const banStr = localProfile.banList.map(b => `- ${b}`).join("\n");
        const banCustom = localProfile.banListCustomPromptsEnabled ? localProfile.banListCustomPrompts : null;
        const template = (banCustom && banCustom.injectionTemplate) || DEFAULT_PROMPTS.banList.injectionTemplate;
        dict["[[banlist]]"] = template.replace('{{banItems}}', banStr);
    } else {
        dict["[[banlist]]"] = "";
    }

    if (localProfile.imageGen && localProfile.imageGen.enabled) {
        const ig = localProfile.imageGen;
        let shouldInject = false;
        let conditionalText = "";
        const mode = ig.triggerMode || "always";

        if (mode === "always") shouldInject = true;
        else if (mode === "frequency") {
            const chat = getContext().chat || [];
            const aiMsgCount = chat.filter(m => !m.is_user && !m.is_system).length;
            const freq = parseInt(ig.autoGenFreq) || 1;
            if ((aiMsgCount + 1) % freq === 0) shouldInject = true;
        } else if (mode === "conditional") {
            shouldInject = true;
            conditionalText = "CRITICAL INSTRUCTION: ONLY output the <img prompt=\"...\"> tag if the character is explicitly taking a photo, sending a picture, or sharing an image in this exact moment. If not, do NOT output the image tags at all.\n\n";
        }

        if (shouldInject) {
            const customIg = localProfile.imageGen.customPromptsEnabled ? (localProfile.imageGen.customPrompts || {}) : {};
            const defIg = DEFAULT_PROMPTS.imageGen;
            
            const tmpl = ig.promptTemplate || "illus_cinematic";
            const map = {
                "illus_pov": ["rulesIllusPov", "examplesIllusPov"],
                "sdxl_pov": ["rulesSdxlPov", "examplesSdxlPov"],
                "illus_cinematic": ["rulesIllusCinematic", "examplesIllusCinematic"],
                "sdxl_cinematic": ["rulesSdxlCinematic", "examplesSdxlCinematic"],
                "illus_portrait": ["rulesIllusPortrait", "examplesIllusPortrait"],
                "sdxl_portrait": ["rulesSdxlPortrait", "examplesSdxlPortrait"]
            };

            let rules = "", examples = "";
            const keys = map[tmpl];
            if (keys) {
                rules = customIg[keys[0]] || defIg[keys[0]];
                examples = customIg[keys[1]] || defIg[keys[1]];
            }

            if (!ig.includeExamples) examples = "";

            const template = customIg.injectionTemplate || defIg.injectionTemplate;
            let extraSection = ig.promptExtra ? `Extra Instructions: ${ig.promptExtra}` : "";
            let directLangStr = ig.directLanguage ? "**DIRECT LANGUAGE:** Use exact Booru tags only. \"naked\" not \"wearing nothing.\" \"erection\" not \"visible arousal.\"\n\n**NSFW TAG REFERENCE (use when scene is explicit):**\nBody: naked, nude, topless, exposed nipples, small breasts, medium breasts, large breasts, spread legs, ass, erection, veins, veiny penis\nActions: hetero, sex, vaginal, anal, oral, fellatio, after fellatio, paizuri, straddling, riding, missionary, doggystyle, cowgirl position, moaning, open mouth, tongue out, ahegao, clenching teeth\nFluids: cum, cum on body, cum on breasts, cum on face, cum on hair, cum on tongue, cum in mouth, cum inside, ejaculation, facial, saliva, sweat\nState: flushed face, heavy breathing, trembling, crying with eyes open, half-closed eyes, solo focus" : "";
            let npcTagsStr = getRelevantNpcImageTags(); // <-- GET THE TAGS
            const imageCountStr = ig.imageCount || 1; 

            dict["[[img1]]"] = template
                .replace('{{conditionalText}}', conditionalText)
                .replace('{{imageCount}}', imageCountStr)
                .replace('{{templateRules}}', rules)
                .replace('{{promptExtra}}', extraSection)
                .replace('{{directLanguage}}', directLangStr)
                .replace('{{npcImageTags}}', npcTagsStr) // <-- INJECT THEM
                .replace('{{templateExamples}}', examples);
            
            // Set the new value for img2 dynamically based on the count!
            dict["[[img2]]"] = ` and the ${imageCountStr} image tag`;
        } else {
            dict["[[img1]]"] = ""; 
            dict["[[img2]]"] = "";
        }
    } else {
        dict["[[img1]]"] = ""; dict["[[img2]]"] = "";
    }

    if (localProfile.thinkingV2 && dict["[[prefill]]"]) {
        dict["[[prefill]]"] = dict["[[prefill]]"].replace(/\n<think>[\s\S]*/, "\n<think>\n<think>");
    }

    if (dict["[[cyoa]]"]) dict["[[cyoa2]]"] = "[CYOA block here]"; else dict["[[cyoa2]]"] = "";
    if (dict["[[infoblock]]"]) dict["[[infoblock2]]"] = "[World state block here]"; else dict["[[infoblock2]]"] = "";
    if (dict["[[summary]]"]) dict["[[summary2]]"] = "[Summary block here]"; else dict["[[summary2]]"] = "";
    if (dict["[[storytracker]]"]) dict["[[storytracker2]]"] = "[Story tracker here]"; else dict["[[storytracker2]]"] = "";
    if (dict["[[npc_inner_chatter]]"]) dict["[[npc_inner_chatter2]]"] = "[Npc inner chatter here]"; else dict["[[npc_inner_chatter2]]"] = "";

    // Resolve early-evaluated tokens inside all other strings to prevent them from being missed and then cleaned up
    const earlyTokens = ["[[count]]", "[[Language]]", "[[pronouns]]", "[[DNRATIO]]", "[[img2]]"];
    earlyTokens.forEach(et => {
        if (dict[et] !== undefined) {
            const val = dict[et];
            Object.keys(dict).forEach(k => {
                if (k !== et && typeof dict[k] === 'string' && dict[k].includes(et)) {
                    dict[k] = dict[k].split(et).join(val);
                }
            });
        }
    });

    // --- 5. MEMORY CORE INJECTION ---
    // Initialize them as empty strings by default so the tags cleanly vanish if there are no memories
    dict["[[long-Memory]]"] = "";
    dict["[[Short-memory]]"] = "";

    if (localProfile.memoryCore && localProfile.memoryCore.enabled) {
        const mem = localProfile.memoryCore;

        const memCustom = mem.customPromptsEnabled ? mem.customPrompts : null;

        // A. Retrieve Long-Term Memories (Local TF-IDF Keyword Scoring)
        if (mem.longTermVault && mem.longTermVault.length > 0) {
            const retrieved = memGetRelevantVaultEntries();
            if (retrieved.length > 0) {
                let longXML = "<retrieved_archives>\n";
                retrieved.forEach(m => {
                    const dateStr = new Date(m.timestamp).toLocaleString();
                    const content = m.text || m.summary || "";
                    longXML += `<archive_memory time="${dateStr}">\n[Msg ${m.id}]:\n${content}\n</archive_memory>\n`;
                });
                longXML += "</retrieved_archives>";

                const template = (memCustom && memCustom.longTermTemplate) || DEFAULT_PROMPTS.memoryCore.longTermTemplate;
                dict["[[long-Memory]]"] = template.replace('{{archiveXML}}', longXML);
            }
        }

        // B. Inject Short-Term Memories (Chronological)
        if (mem.shortTermChunks && mem.shortTermChunks.length > 0) {
            let shortXML = "<recent_state_extracts>\n";
            mem.shortTermChunks.forEach(m => {
                const dateStr = new Date(m.timestamp).toLocaleString();
                shortXML += `<archive_memory time="${dateStr}">[Msg ${m.id}]: ${m.summary}</archive_memory>\n`;
            });
            shortXML += "</recent_state_extracts>";

            const templateShort = (memCustom && memCustom.shortTermTemplate) || DEFAULT_PROMPTS.memoryCore.shortTermTemplate;
            dict["[[Short-memory]]"] = templateShort.replace('{{shortXML}}', shortXML);
        }
    }

    // --- 5.5 NPC BANK INJECTION ---
    dict["[[npc_dossier]]"] = "";
    dict["[[npc_dossier2]]"] = "";
    dict["[[npc list]]"] = "";

    if (localProfile.npcBank && localProfile.npcBank.enabled) {
        
        // --- OOC Trigger Check (Applies ONLY to the Dossier Template) ---
        let allowDossierInjection = true;
        if (localProfile.npcBank.oocTrigger) {
            allowDossierInjection = false;
            const context = typeof getContext === 'function' ? getContext() : null;
            if (context && context.chat) {
                const lastUserMsg = context.chat.slice().reverse().find(m => m.is_user);
                if (lastUserMsg && lastUserMsg.mes) {
                    const msgLower = lastUserMsg.mes.toLowerCase();
                    if (msgLower.includes("npc") || msgLower.includes("dossier")) {
                        allowDossierInjection = true;
                    }
                }
            }
        }

        if (allowDossierInjection) {
            // Use custom prompt if it exists, otherwise use default
            const nbPrompts = (localProfile.npcBank.customPromptsEnabled && localProfile.npcBank.customPrompts) ? localProfile.npcBank.customPrompts : DEFAULT_PROMPTS.npcBank;
            
            dict["[[npc_dossier]]"] = nbPrompts.dossierTemplate;
            dict["[[npc_dossier2]]"] = "[NPC Dossier block here]";
        }

        // --- NPC List Injection (Always runs to provide context of known NPCs) ---
        if (localProfile.npcBank.npcs && localProfile.npcBank.npcs.length > 0) {
            const context = typeof getContext === 'function' ? getContext() : null;
            if (context && context.chat) {
                const recentText = context.chat.filter(m => !m.is_system).slice(-4).map(m => meguminCleanChatHistoryText(m.mes)).join(" ").toLowerCase();
                const keywords = typeof memExtractKeywords === 'function' ? memExtractKeywords(recentText) : [];
                if (keywords.length > 0) {
                    let scoredNpcs = [];
                    localProfile.npcBank.npcs.forEach(n => {
                        if (n.imageOnly) return;
                        
                        let score = 0;
                        let matchedWords = [];
                        const contentLower = npcBuildTextFromData(n).toLowerCase();
                        keywords.forEach(kw => {
                            if (contentLower.includes(kw)) { score++; matchedWords.push(kw); }
                        });
                        if (score >= 1) {
                            scoredNpcs.push({ ...n, score, matchedWords });
                        }
                    });
                    scoredNpcs.sort((a, b) => b.score - a.score);
                    const topNpcs = scoredNpcs.slice(0, 3);
                    if (topNpcs.length > 0) {
                        let npcXML = "<retrieved_npcs>\n";
                        topNpcs.forEach(n => { npcXML += `<${n.name}>\n${npcBuildTextFromData(n)}\n</${n.name}>\n\n`; });
                        npcXML += "</retrieved_npcs>";
                        dict["[[npc list]]"] = `[RELEVANT NPCs]\nThe following are details of known NPCs relevant to the current context:\n${npcXML}`;

                        // Collect pfp images for multimodal injection if enabled
                        activeNpcImages = [];
                        if (localProfile.npcBank.sendPortraitsToAi) {
                            topNpcs.forEach(n => {
                                if (n.pfp && n.pfp.startsWith("data:image")) {
                                    activeNpcImages.push({ name: n.name, base64: n.pfp });
                                }
                            });
                        }
                    }
                }
            }
        }
    }

    return dict;
}

function escapeRegex(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function handlePromptInjection(data, type) {
    const messages = data?.messages || data?.chat || (Array.isArray(data) ? data : null);
    if (!messages || !Array.isArray(messages)) return;
    const disablePrefill = localProfile && localProfile.disableUtilityPrefill === true;

    // --- INJECT STORY PLANNER PROMPT ---
    if (activeStoryPlanRequest) {
        messages.length = 0;

        // SillyTavern macro substitutions to get Lore and Persona
        const charLore = typeof substituteParams === 'function' ? substituteParams('{{description}}') : "No character description found.";
        const userPersona = typeof substituteParams === 'function' ? substituteParams('{{persona}}') : "No user persona found.";

        const spCustom = localProfile.storyPlan.customPromptsEnabled ? localProfile.storyPlan.customPrompts : null;
        const sys = (spCustom && spCustom.systemPrompt) || DEFAULT_PROMPTS.storyPlan.systemPrompt;
        const userTask = (spCustom && spCustom.userPrompt) || DEFAULT_PROMPTS.storyPlan.userPrompt;
        const thinking = (spCustom && spCustom.thinkingPrompt) || DEFAULT_PROMPTS.storyPlan.thinkingPrompt;

        messages.push({
            "role": "system",
            "content": sys.replace('{{charLore}}', charLore).replace('{{userPersona}}', userPersona).replace('{{chatHistory}}', activeStoryPlanRequest)
        });
        messages.push({
            "role": "user",
            "content": userTask
        });
        messages.push({
            "role": "system",
            "content": thinking
        });
        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": "ok i will start thinking \n<think>\n"
            });
        }

        console.log(`[${extensionName}] 🎯 Injected Story Planner array in memory.`);
        return;
    }

    // --- INJECT NPC SCAN PROMPT ---
    if (activeNpcScanRequest) {
        messages.length = 0;
        const nbPrompts = (localProfile.npcBank && localProfile.npcBank.customPromptsEnabled && localProfile.npcBank.customPrompts) ? localProfile.npcBank.customPrompts : DEFAULT_PROMPTS.npcBank;
        const formatTemplate = nbPrompts.dossierTemplate;
        
        messages.push({
            "role": "system",
            "content": "You are an expert narrative analyst and world-builder."
        });
        messages.push({
            "role": "user",
            "content": `Analyze the following story history. Identify any SIGNIFICANT NPCs (characters with names and dialogue/impact) that are NOT in this list of already known NPCs: [${activeNpcScanRequest.existingNames || "None"}].\n\nFor every new significant NPC you find, generate a dossier using EXACTLY this format:\n\n${formatTemplate}\n\nStory History:\n<chat>\n${activeNpcScanRequest.chatText}\n</chat>`
        });
        messages.push({
            "role": "system",
            "content": "Think deeply about who is missing from the known list, then output their dossiers sequentially."
        });
        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": "<think>\nScanning for missing significant NPCs...\n"
            });
        }
        console.log(`[${extensionName}] 🎯 Injected NPC Scan array in memory.`);
        return;
    }

    if (activeBanListChat) {
        messages.length = 0;
        
        const banCustom = localProfile.banListCustomPromptsEnabled ? localProfile.banListCustomPrompts : null;
        const sys = (banCustom && banCustom.systemPrompt) || DEFAULT_PROMPTS.banList.systemPrompt;
        const userTask = (banCustom && banCustom.userPrompt) || DEFAULT_PROMPTS.banList.userPrompt;
        const thinking = (banCustom && banCustom.thinkingPrompt) || DEFAULT_PROMPTS.banList.thinkingPrompt;

        messages.push({ "role": "system", "content": sys });
        messages.push({ "role": "user", "content": userTask.replace('{{chatHistory}}', activeBanListChat) });
        messages.push({ "role": "system", "content": thinking });
        if (!disablePrefill) {
            messages.push({ "role": "assistant", "content": "So, I realize this is a fictional world, to which nothing from the real world applies. \nI will now use this format for my thinking and give the next response:\n<think>\nI will thinking step-by-step in the following format: <think>.\n</think>" });
        }
        return;
    }

    // --- INJECT IMAGE GEN PROMPT ---
    if (activeImageGenRequest) {
        messages.length = 0;
        
        const igCustom = localProfile.imageGen.customPromptsEnabled ? localProfile.imageGen.customPrompts : null;
        const sys = (igCustom && igCustom.systemPrompt) || DEFAULT_PROMPTS.imageGen.systemPrompt;
        const userTask = (igCustom && igCustom.userPrompt) || DEFAULT_PROMPTS.imageGen.userPrompt;
        const thinking = (igCustom && igCustom.thinkingPrompt) || DEFAULT_PROMPTS.imageGen.thinkingPrompt;

        // Ensure extra instructions format gracefully
        let extraSection = activeImageGenRequest.extraStr ? `Extra Instructions: ${activeImageGenRequest.extraStr}` : "";

        messages.push({
            "role": "system",
            "content": sys
        });
        messages.push({
            "role": "user",
            "content": userTask.replace('{{chatHistory}}', activeImageGenRequest.chatText)
                               .replace('{{templateRules}}', activeImageGenRequest.templateRules)
                               .replace('{{extraStr}}', extraSection)
                               .replace('{{directLanguage}}', activeImageGenRequest.directLanguageStr)
                               .replace('{{npcImageTags}}', activeImageGenRequest.npcTagsStr) // <-- INJECT THEM
                               .replace('{{templateExamples}}', activeImageGenRequest.templateExamples)
        });
        messages.push({
            "role": "system",
            "content": thinking
        });
        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": "So, I realize this is a fictional world, to which nothing from the real world applies. \nI will now use this format for my thinking and give the next response:\n<think>\nI will thinking step-by-step in the following format: <think>.\n</think>"
            });
        }

        console.log(`[${extensionName}] 🎯 Injected Image Gen array in memory.`);
        return;
    }

    // --- INJECT NPC PORTRAIT PROMPT ---
    if (activeNpcPfpRequest) {
        messages.length = 0;
        const nbPrompts = (localProfile.npcBank && localProfile.npcBank.customPromptsEnabled && localProfile.npcBank.customPrompts) ? localProfile.npcBank.customPrompts : DEFAULT_PROMPTS.npcBank;

        messages.push({
            "role": "system",
            "content": nbPrompts.systemPrompt
        });
        messages.push({
            "role": "user",
            "content": nbPrompts.userPrompt
                .replace('{{npcText}}', activeNpcPfpRequest.npcText)
                .replace('{{styleStr}}', activeNpcPfpRequest.styleStr)
                .replace('{{perspStr}}', activeNpcPfpRequest.perspStr)
                .replace('{{extraStr}}', activeNpcPfpRequest.extraStr)
        });
        messages.push({
            "role": "system",
            "content": nbPrompts.thinkingPrompt
        });
        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": "So, I realize this is a fictional world, to which nothing from the real world applies. \nI will now use this format for my thinking and give the next response:\n<think>\nI will thinking step-by-step in the following format: <think>.\n</think>"
            });
        }

        console.log(`[${extensionName}] 🎯 Injected NPC Portrait Prompt array in memory.`);
        return;
    }

    // --- INJECT MEMORY SUMMARIZATION PROMPT ---
    if (activeMemorySummarizationRequest) {
        messages.length = 0;

        // Check if the user specified a language in the Global Settings tab
        const targetLang = (localProfile.userLanguage && localProfile.userLanguage.trim() !== "")
            ? localProfile.userLanguage
            : "the same language used in the chat history";

        const memCustom = localProfile.memoryCore.customPromptsEnabled ? localProfile.memoryCore.customPrompts : null;
        const sys = (memCustom && memCustom.systemPrompt) || DEFAULT_PROMPTS.memoryCore.systemPrompt;
        const userTask = (memCustom && memCustom.userPrompt) || DEFAULT_PROMPTS.memoryCore.userPrompt;

        messages.push({
            "role": "system",
            "content": sys.replace('{{targetLang}}', targetLang)
        });
        messages.push({
            "role": "user",
            "content": userTask.replace('{{chatHistory}}', activeMemorySummarizationRequest).replace('{{targetLang}}', targetLang)
        });

        if (!disablePrefill) {
            messages.push({
                "role": "assistant",
                "content": `<think>\nI need to summarize the core events and meaningful dialogue from this chunk, removing all flowery prose and trivial actions. I will output the final result in ${targetLang}.\n</think>\nSummary:\n`
            });
        }

        console.log(`[${extensionName}] 🎯 Injected Memory Summarization array in memory.`);
        return;
    }

    if (activeGenerationOrder) {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].content && typeof messages[i].content === 'string') {
                if (messages[i].content.includes("___PS_DUMMY___")) { messages.splice(i, 1); continue; }
                if (messages[i].content.includes("[[order]]")) messages[i].content = messages[i].content.replace(/\[\[order\]\]/g, activeGenerationOrder);
            }
        }
    }

    if (!localProfile) return;
    const dict = buildBaseDict();

    if (localProfile.devOverrides) {
        Object.keys(localProfile.devOverrides).forEach(key => { if (dict[key] !== undefined) dict[key] = localProfile.devOverrides[key]; });
    }

    let replacementsMade = 0;
    for (const msg of messages) {
        if (msg.content && typeof msg.content === 'string') {
            Object.entries(dict).forEach(([trigger, replacement]) => {
                if (msg.content.includes(trigger)) {
                    const processed = typeof substituteParams === 'function' ? substituteParams(replacement) : replacement;

                    // If the replacement is empty, remove the tag AND the empty line it sits on
                    if (processed.trim() === "") {
                        msg.content = msg.content.replace(new RegExp(`^[ \\t]*${escapeRegex(trigger)}[ \\t]*\\r?\\n?`, 'gm'), "");
                    }

                    // Standard replacement for everything else
                    msg.content = msg.content.replace(new RegExp(escapeRegex(trigger), 'g'), processed);
                    replacementsMade++;
                }
            });

            // Cleanup unused tags (Removes the tag AND the line break)
            ["[[long-Memory]]", "[[Short-memory]]", "[[prompt1]]", "[[prompt2]]", "[[prompt3]]", "[[prompt4]]", "[[prompt5]]", "[[prompt6]]", "[prompt1]", "[prompt2]", "[prompt3]", "[prompt4]", "[prompt5]", "[prompt6]", "[[AI1]]", "[[AI2]]", "[[main]]", "[[OOC]]", "[[control]]", "[[aiprompt]]", "[[death]]", "[[combat]]", "[[Direct]]", "[[DN]]", "[[COLOR]]", "[[infoblock]]", "[[summary]]", "[[cyoa]]", "[[COT]]", "[[prefill]]", "[[order]]", "[[Language]]", "[[pronouns]]", "[[banlist]]", "[[count]]", "[[MVU]]", "[[img1]]", "[[img2]]", "[[storyplan]]", "[[storytracker]]", "[[DNRATIO]]", "[[THINK]]", "[[onomato]]", "[[npc_events]]", "[[cyoa2]]", "[[infoblock2]]", "[[summary2]]", "[[storytracker2]]", "[[npc_inner_chatter]]", "[[npc_inner_chatter2]]", "[[npc_dossier]]", "[[npc_dossier2]]", "[[npc list]]"].forEach(tr => {
                if (msg.content.includes(tr)) {
                    msg.content = msg.content.replace(new RegExp(`^[ \\t]*${escapeRegex(tr)}[ \\t]*\\r?\\n?`, 'gm'), "");
                    msg.content = msg.content.replace(new RegExp(escapeRegex(tr), 'g'), ""); // Catch-all for inline tags
                }
            });

            // Cleanup Inline Image Artifacts so the AI doesn't see raw HTML
            msg.content = msg.content.replace(/<img[^>]*?alt=["']KazumaInline["'][^>]*?>/gi, "");
            msg.content = msg.content.replace(/<div[^>]*?title=["']KazumaFail\|[^>]*?>.*?<\/div>/gi, "");
            
            // Comprehensive Image Block Cleanup
            msg.content = msg.content.replace(/<img\s+[^>]*\/>|<div class="kazuma-img-placeholder"[^>]*>[\s\S]*?<\/div>|<!-- kazuma-inline-start:[^>]*-->[\s\S]*?<!-- kazuma-inline-end:[^>]*-->/gi, "");

            // Final Sweep: Collapse 3 or more blank lines into a standard double line break
            msg.content = msg.content.replace(/(?:\r?\n[ \t]*){3,}/g, '\n\n');
        }
    }

    // --- INJECT NPC PORTRAITS AS MULTIMODAL IMAGES ---
    if (activeNpcImages && activeNpcImages.length > 0) {
        // Find the message that contains the NPC list text and convert to multimodal
        for (const msg of messages) {
            if (msg.content && typeof msg.content === 'string' && msg.content.includes('[RELEVANT NPCs]')) {
                const parts = [{ type: "text", text: msg.content }];
                activeNpcImages.forEach(img => {
                    parts.push({ type: "text", text: `[Portrait of ${img.name}]` });
                    parts.push({ type: "image_url", image_url: { url: img.base64, detail: "low" } });
                });
                msg.content = parts;
                break;
            }
        }
        activeNpcImages = [];
    }

    if (replacementsMade > 0 && !activeGenerationOrder) {
        console.log(`[${extensionName}] ✅ Executed ${replacementsMade} block replacements.`);
    }

    // --- PROMPT PREVIEW ---
    const isBackgroundGen = activeStoryPlanRequest || activeBanListChat || activeImageGenRequest || activeNpcPfpRequest || activeMemorySummarizationRequest || activeGenerationOrder;

    // Prevent double-popups from Token Counting or rapid ST background triggers
    const now = Date.now();
    const isSpam = (now - lastPromptPreviewTime) < 2000;
    const isTokenCount = type === "count" || type === "quiet";

    if (localProfile.toggles && localProfile.toggles.promptPreview && !isBackgroundGen && !isTokenCount && !isSpam) {
        lastPromptPreviewTime = now; // Lock it immediately

        let promptString = "";
        messages.forEach(m => {
            let contentStr = "";
            if (typeof m.content === "string") contentStr = m.content;
            else if (Array.isArray(m.content)) {
                // Handle multimodal image data safely
                contentStr = m.content.map(c => c.type === "text" ? c.text : "[BASE64 IMAGE DATA]").join("\n");
            }
            promptString += `========== [ ${m.role.toUpperCase()} ] ==========\n${contentStr}\n\n`;
        });

        const $content = $(`
            <div style="display:flex; flex-direction:column; gap:10px; font-family: 'Inter', sans-serif;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">This is the exact payload being sent to the AI API.</div>
                <textarea class="ps-modern-input" readonly style="height: 450px; resize: vertical; font-family: monospace; font-size: 0.75rem; padding: 10px; white-space: pre-wrap; background: rgba(0,0,0,0.5);"></textarea>
            </div>
        `);
        $content.find("textarea").val(promptString);

        const { Popup, POPUP_TYPE } = typeof getContext === "function" ? getContext() : window;
        const popup = new Popup($content, POPUP_TYPE.CONFIRM, "Prompt Payload Preview", { okButton: "Send to AI", cancelButton: "Cancel", wide: true, large: true });

        const confirmed = await popup.show();

        if (!confirmed) {
            messages.length = 0; // Empty the payload
            toastr.info("Generation cancelled by user.");
            
            // FIX: Explicitly tell SillyTavern to abort to prevent Auto-Retry loops
            if (typeof window.stopGeneration === 'function') {
                window.stopGeneration();
            }
            // Fallback: visually click the stop buttons just in case
            setTimeout(() => {
                $("#mes_stop").trigger("click");
                $("#send_but_sheld").trigger("click");
            }, 10);
            
            return;
        }
    }
}


// -------------------------------------------------------------
// DEV MODE: VISUAL ENGINE BUILDER
// -------------------------------------------------------------
function renderDevMode(view = "landing", selectedModeId = null, passedModeData = null, returnTo = "landing") {
    const c = $("#ps_stage_content");
    c.empty();
    c.off(".devDirty");

    // Hide the dock and the apply to all button
    $(".dock").hide();
    $("#btn_apply_tab_all").hide();
    $("#ps_btn_save_close").hide();

    // Update Dev button visually
    $("#ps_btn_dev_mode").html(`<i class="fa-solid fa-right-from-bracket"></i> Exit Dev`).css("color", "#10b981");

    if (!extension_settings[extensionName].customModes) extension_settings[extensionName].customModes = [];

    // Update Dev button visuals
    $("#ps_btn_dev_mode")
        .html(`<i class="fa-solid fa-right-from-bracket"></i> Exit Dev`)
        .css("color", "#10b981");

    if (!extension_settings[extensionName].customModes) extension_settings[extensionName].customModes = [];

    // --- VIEW 1: DASHBOARD (Merged Landing & List) ---
    if (view === "landing") {
        isDevEngineDirty = false;
        $("#ps_stage_sub").text("Design your own chronological AI logic flow. Clone an existing template or start from scratch.");

        // Top Action Bar (Moved Import up here!)
        c.append(`
            <div style="display: flex; gap: 15px; margin-top: 10px; margin-bottom: 30px;">
                <button id="dev_btn_new" class="ps-modern-btn primary" style="background: #10b981; color: #fff; flex: 1; padding: 12px; font-size: 1rem;"><i class="fa-solid fa-wand-magic-sparkles"></i> Create Blank Engine</button>
                <button id="dev_btn_import" class="ps-modern-btn secondary" style="flex: 1; padding: 12px; font-size: 1rem;"><i class="fa-solid fa-file-import"></i> Import Engine (JSON)</button>
                <input type="file" id="dev_import_file" accept=".json" style="display:none;" />
            </div>
        `);

        // Event Listeners for Top Bar
        $("#dev_btn_new").on("click", () => renderDevMode("editor", "NEW"));
        $("#dev_btn_import").on("click", () => $("#dev_import_file").click());
        $("#dev_import_file").on("change", function (e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const imported = JSON.parse(e.target.result);
                    imported.id = "custom_" + Date.now(); // Ensure unique ID on import
                    extension_settings[extensionName].customModes.push(imported);
                    saveSettingsDebounced();
                    toastr.success(`Imported ${imported.label}!`);
                    renderDevMode("landing"); // Refresh UI
                } catch (e) { toastr.error("Invalid JSON file."); }
            };
            reader.readAsText(file);
        });

        // --- SECTION 1: CORE TEMPLATES (CLONE) ---
        c.append(`<div class="ps-rule-title" style="color: var(--gold); margin-bottom: 12px;"><i class="fa-solid fa-cube"></i> Core Templates (Clone)</div>`);
        const coreGrid = $(`<div class="ps-grid" style="margin-bottom: 30px;"></div>`); // Added margin-bottom so it breathes before the next section
        hardcodedLogic.modes.forEach(m => {
            const card = $(`
                <div class="ps-card" style="justify-content: space-between;">
                    <div style="width: 100%;">
                        <div class="ps-card-title"><span>${m.label}</span></div>
                        <div class="ps-card-desc">System Default Engine</div>
                    </div>
                    <div style="width: 100%; margin-top: 20px;">
                        <button class="ps-modern-btn secondary dev-clone" style="width: 100%; padding: 8px; font-size: 0.8rem; border-color: var(--gold); color: var(--gold);"><i class="fa-solid fa-copy"></i> Clone & Edit</button>
                    </div>
                </div>
            `);
            card.find(".dev-clone").on("click", () => renderDevMode("editor", m.id));
            coreGrid.append(card);
        });
        c.append(coreGrid);

        // --- SECTION 2: YOUR CUSTOM ENGINES ---
        const customModes = extension_settings[extensionName].customModes || [];
        c.append(`<div class="ps-rule-title" style="color: #10b981; margin-bottom: 12px;"><i class="fa-solid fa-microchip"></i> Your Custom Engines</div>`);

        if (customModes.length === 0) {
            c.append(`<div style="padding: 20px; text-align: center; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 12px; margin-bottom: 30px;">No custom engines yet. Create or import one above!</div>`);
        } else {
            const customGrid = $(`<div class="ps-grid" style="margin-bottom: 30px;"></div>`);
            customModes.forEach(m => {
                const card = $(`
                    <div class="ps-card" style="border-color: #10b981; background: rgba(16, 185, 129, 0.05); justify-content: space-between;">
                        <div style="width: 100%;">
                            <div class="ps-card-title"><span style="color: #10b981;">${m.label}</span></div>
                            <div class="ps-card-desc">Custom User Logic Flow</div>
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 20px; width: 100%;">
                            <button class="ps-modern-btn secondary dev-export" style="flex: 1; padding: 6px; font-size: 0.8rem; border-color: rgba(255,255,255,0.2);" title="Export"><i class="fa-solid fa-download"></i></button>
                            <button class="ps-modern-btn primary dev-edit" style="flex: 2; padding: 6px; font-size: 0.8rem; background: var(--gold); color: #000;"><i class="fa-solid fa-pen"></i> Edit</button>
                            <button class="ps-modern-btn secondary dev-delete" style="flex: 1; padding: 6px; font-size: 0.8rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" title="Delete"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                `);

                card.find(".dev-edit").on("click", () => renderDevMode("editor", m.id));
                card.find(".dev-export").on("click", () => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(m));
                    const downloadAnchorNode = document.createElement('a');
                    downloadAnchorNode.setAttribute("href", dataStr);
                    downloadAnchorNode.setAttribute("download", m.label.replace(/\s+/g, '_') + ".json");
                    document.body.appendChild(downloadAnchorNode);
                    downloadAnchorNode.click();
                    downloadAnchorNode.remove();
                });
                card.find(".dev-delete").on("click", () => {
                    if (confirm(`Delete ${m.label}?`)) {
                        extension_settings[extensionName].customModes = extension_settings[extensionName].customModes.filter(x => x.id !== m.id);
                        saveSettingsDebounced(); renderDevMode("landing");
                    }
                });
                customGrid.append(card);
            });
            c.append(customGrid);
        }

        return;
    }

    // --- VIEW 3: EDITOR ---
    if (view === "editor") {
        let modeData;
        let isNew = false;
        if (passedModeData) {
            modeData = passedModeData;
        } else if (selectedModeId === "NEW") {
            isNew = true;
            modeData = {
                id: "custom_" + Date.now(),
                label: "New Custom Engine",
                isCoreClone: false,
                isV7: false,
                p1: "", p2: "", p3: "", p4: "", p5: "", p6: "",
                cot: "", prefill: "", cyoa: "", info: "", summary: "", npc_inner_chatter: "",
                customToggles: []
            };
        } else {
            const coreMatch = hardcodedLogic.modes.find(m => m.id === selectedModeId);
            if (coreMatch) {
                isNew = true; modeData = JSON.parse(JSON.stringify(coreMatch));
                modeData.id = "custom_" + Date.now(); modeData.label = coreMatch.label + " (Copy)";
                modeData.isCoreClone = true;
                modeData.isV7 = coreMatch.id.startsWith("v7");
                if (!modeData.cot) modeData.cot = "";
                if (!modeData.prefill) modeData.prefill = "";
                if (!modeData.cyoa) modeData.cyoa = "";
                if (!modeData.info) modeData.info = "";
                if (!modeData.summary) modeData.summary = "";
                if (!modeData.npc_inner_chatter) modeData.npc_inner_chatter = "";
            } else {
                modeData = extension_settings[extensionName].customModes.find(m => m.id === selectedModeId);
            }
        }
        if (!modeData.customToggles) modeData.customToggles = [];

        c.append(`
            <div style="position: sticky; top: -11px; z-index: 100; background: var(--bg-panel); padding: 10px 0 15px 0; margin-top: -10px; margin-bottom: 20px; display: flex; gap: 10px; border-bottom: 1px solid var(--border-color); box-shadow: 0 10px 15px -10px rgba(0,0,0,0.6);">
                <button id="dev_back_list" class="ps-modern-btn secondary"><i class="fa-solid fa-arrow-left"></i> Back</button>
                <input type="text" id="dev_mode_name" class="ps-modern-input" value="${modeData.label}" style="flex: 1; font-weight: bold; font-size: 1.1rem; border-color: var(--gold);" />
                <button id="dev_save_mode" class="ps-modern-btn primary" style="background: #10b981; color: #fff;"><i class="fa-solid fa-floppy-disk"></i> Save Engine</button>
            </div>
        `);

        // NEW: Track if the user types anything
        c.off("input.devDirty change.devDirty").on("input.devDirty change.devDirty", "input, textarea, select", function () {
            isDevEngineDirty = true;
        });

        // NEW: Back button with unsaved changes warning
        $("#dev_back_list").on("click", () => {
            if (isDevEngineDirty) {
                if (!confirm("You have unsaved changes in this engine. Are you sure you want to go back? Changes will be lost.")) return;
            }
            isDevEngineDirty = false; // Reset tracker
            if (returnTo === "tab") { $(".ps-sidebar").show(); switchTab(0); }
            else { renderDevMode("landing"); }
        });

        const saveCurrentTextState = () => {
            modeData.label = $("#dev_mode_name").val();
            if ($("#dev_edit_p1").length) modeData.p1 = $("#dev_edit_p1").val();
            if ($("#dev_edit_p2").length) modeData.p2 = $("#dev_edit_p2").val();
            modeData.p3 = $("#dev_edit_p3").val();
            modeData.p4 = $("#dev_edit_p4").val(); modeData.p5 = $("#dev_edit_p5").val(); modeData.p6 = $("#dev_edit_p6").val();

            // Loop through all override fields
            const fields = ["cot", "prefill", "cyoa", "info", "summary", "death", "combat", "direct", "dn", "dialogueColor", "mvu", "storytracker", "think", "language", "pronouns", "count", "dnratio", "onomato", "banlist", "npc_inner_chatter"];
            fields.forEach(f => {
                if ($(`#dev_edit_${f}`).length) modeData[f] = $(`#dev_edit_${f}`).val();
            });
        };

        // UI Helpers
        const createInsertPoint = (attach) => `<div class="dev-insert-point" data-attach="${attach}" style="text-align: center; padding: 10px; cursor: pointer; color: var(--gold); border: 2px dashed rgba(245,158,11,0.3); border-radius: 8px; margin: 10px 0;"><i class="fa-solid fa-plus"></i> Add Module Here</div>`;
        const createLockedBlock = (t, c) => `<div style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 10px;"><div style="font-weight: bold; color: var(--text-muted); font-size: 0.8rem; margin-bottom: 6px;">${t} <i class="fa-solid fa-lock" style="float: right;"></i></div><div style="font-family: monospace; font-size: 0.75rem; color: #666; white-space: pre-wrap;">${c}</div></div>`;
        const createEditableBlock = (t, k, v) => `<div style="background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 10px;"><div style="font-weight: bold; color: var(--accent-color); font-size: 0.8rem; margin-bottom: 6px;">${t}</div><textarea id="dev_edit_${k}" class="ps-modern-input" style="height: 80px; resize: vertical; font-family: monospace; font-size: 0.8rem;">${v || ""}</textarea></div>`;
        const createOverrideBlock = (t, k, v, presets) => {
            let btnsHtml = presets.map(p => {
                const isActive = (v || "") === p.value;
                const style = isActive ? 'background: rgba(16, 185, 129, 0.15); border-color: #10b981; color: #10b981;' : '';
                return `<button type="button" class="ps-modern-btn secondary dev-preset-btn" data-target="dev_edit_${k}" data-val="${encodeURIComponent(p.value)}" style="padding: 4px 10px; font-size: 0.7rem; border-radius: 4px; ${style}">${p.label}</button>`;
            }).join('');

            return `<div style="background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="font-weight: bold; color: var(--accent-color); font-size: 0.8rem;">${t}</div>
                    <div style="display: flex; gap: 6px;">${btnsHtml}</div>
                </div>
                <textarea id="dev_edit_${k}" class="ps-modern-input" style="height: 80px; resize: vertical; font-family: monospace; font-size: 0.8rem;">${v || ""}</textarea>
            </div>`;
        };

        // Special Dropdown for CoT Languages
        const createCotDropdownBlock = (t, k, v, type) => {
            let options = `<option value="">[ Clear Box ]</option>`;
            hardcodedLogic.models.forEach(m => {
                if (m.id === "cot-off") return;
                const val = (type === "cot") ? m.content : m.prefill;
                options += `<option value="${encodeURIComponent(val || '')}">${m.id}</option>`;
            });

            return `<div style="background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="font-weight: bold; color: var(--accent-color); font-size: 0.8rem;">${t}</div>
                    <select class="ps-modern-input dev-preset-dropdown" data-target="dev_edit_${k}" style="width: 250px; padding: 4px; font-size: 0.75rem; cursor: pointer; color: var(--gold); border-color: var(--gold);">
                        <option value="" disabled selected>✨ Load Language Template...</option>
                        ${options}
                    </select>
                </div>
                <textarea id="dev_edit_${k}" class="ps-modern-input" style="height: 120px; resize: vertical; font-family: monospace; font-size: 0.8rem;">${v || ""}</textarea>
            </div>`;
        };

        const flow = $(`<div style="display: flex; flex-direction: column;"></div>`);

        flow.append(createEditableBlock("[[prompt1]]", "p1", modeData.p1));
        flow.append(createEditableBlock("[[prompt2]]", "p2", modeData.p2));
        flow.append(createEditableBlock("[[prompt3]]", "p3", modeData.p3));

        // Custom Modules Logic
        const modRender = (ap) => {
            const wrap = $("<div></div>");
            modeData.customToggles.filter(t => t.attachPoint === ap).forEach(m => {
                const div = $(`
                    <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid #10b981; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #10b981; font-size: 0.75rem; margin-bottom: 5px;">
                            <span>${m.name}</span>
                            <div style="display:flex; gap: 8px;">
                                <i class="ps-btn-edit-mod fa-solid fa-pen-to-square" style="cursor:pointer; color:var(--gold);"></i>
                                <i class="ps-btn-del-mod fa-solid fa-trash" style="cursor:pointer; color:#ef4444;"></i>
                            </div>
                        </div>
                        <div style="font-size:0.7rem; opacity:0.8; font-family: monospace; white-space: pre-wrap;">${m.content}</div>
                    </div>
                `);
                div.find(".ps-btn-del-mod").on("click", () => { modeData.customToggles = modeData.customToggles.filter(x => x.id !== m.id); saveCurrentTextState(); renderDevMode("editor", modeData.id, modeData); isDevEngineDirty = true; });
                div.find(".ps-btn-edit-mod").on("click", async () => {
                    saveCurrentTextState();
                    const $p = $(`<div style="display:flex; flex-direction:column; gap:10px;"><input type="text" id="m_n" class="ps-modern-input" value="${m.name}" /><select id="m_l" class="ps-modern-input"><option value="settings" ${m.location === 'settings' ? 'selected' : ''}>Stage 4: Settings</option><option value="addons" ${m.location === 'addons' ? 'selected' : ''}>Stage 5: Add-ons</option></select><textarea id="m_c" class="ps-modern-input" style="height:150px;">${m.content}</textarea></div>`);
                    if (await new Popup($p, POPUP_TYPE.CONFIRM, "Edit Module", { okButton: "Save", cancelButton: "Cancel", wide: true }).show()) { m.name = $p.find("#m_n").val() || "Module"; m.location = $p.find("#m_l").val(); m.content = $p.find("#m_c").val(); renderDevMode("editor", modeData.id, modeData); isDevEngineDirty = true; }
                });
                wrap.append(div);
            });
            return wrap;
        };

        flow.append(modRender("p3")); flow.append(createInsertPoint("p3"));
        flow.append(createLockedBlock("[[AI1]]", "Understood."));
        flow.append(createEditableBlock("[[prompt4]]", "p4", modeData.p4));
        flow.append(createEditableBlock("[[prompt5]]", "p5", modeData.p5));
        flow.append(modRender("p5")); flow.append(createInsertPoint("p5"));
        flow.append(createEditableBlock("[[prompt6]]", "p6", modeData.p6));
        flow.append(modRender("p6")); flow.append(createInsertPoint("p6"));
        flow.append(createLockedBlock("[[AI2]]", "Understood."));

        // Fetch raw template data for overrides
        const getAddon = id => hardcodedLogic.addons.find(a => a.id === id)?.content || "";
        const getBlock = id => hardcodedLogic.blocks.find(b => b.id === id)?.content || "";

        // Section 1: CoT & Logic Overrides
        flow.append(`<div class="ps-rule-title" style="margin: 30px 0 10px 0; color: #3b82f6;"><i class="fa-solid fa-brain"></i> CoT & Logic Overrides</div>`);
        flow.append(createCotDropdownBlock("[[COT]]", "cot", modeData.cot, "cot"));
        flow.append(createCotDropdownBlock("[[prefill]]", "prefill", modeData.prefill, "prefill"));
        flow.append(createOverrideBlock("[[THINK]]", "think", modeData.think, [{ label: "No Change", value: "" }, { label: "Default", value: "<think>\n<think>\n<think>\n{Thinking}\n</think>" }]));

        // Section 2: Add-ons & Formatting
        flow.append(`<div class="ps-rule-title" style="margin: 30px 0 10px 0; color: #10b981;"><i class="fa-solid fa-puzzle-piece"></i> Add-ons & Formatting Overrides</div>`);
        flow.append(createOverrideBlock("[[cyoa]]", "cyoa", modeData.cyoa, [{ label: "No Change", value: "" }, { label: "Default", value: getBlock("cyoa") }]));
        flow.append(createOverrideBlock("[[infoblock]]", "info", modeData.info, [{ label: "No Change", value: "" }, { label: "Default", value: getBlock("info") }]));
        flow.append(createOverrideBlock("[[summary]]", "summary", modeData.summary, [{ label: "No Change", value: "" }, { label: "Default", value: getBlock("summary") }]));
        flow.append(createOverrideBlock("[[death]]", "death", modeData.death, [{ label: "No Change", value: "" }, { label: "Default", value: getAddon("death") }]));
        flow.append(createOverrideBlock("[[combat]]", "combat", modeData.combat, [{ label: "No Change", value: "" }, { label: "Default", value: getAddon("combat") }]));
        flow.append(createOverrideBlock("[[Direct]]", "direct", modeData.direct, [{ label: "No Change", value: "" }, { label: "Default", value: getAddon("direct") }]));
        flow.append(createOverrideBlock("[[DN]]", "dn", modeData.dn, [{ label: "No Change", value: "" }, { label: "Default", value: getAddon("dn") }]));
        flow.append(createOverrideBlock("[[COLOR]]", "dialogueColor", modeData.dialogueColor, [{ label: "No Change", value: "" }, { label: "Default", value: getAddon("color") }])); flow.append(createOverrideBlock("[[MVU]]", "mvu", modeData.mvu, [{ label: "No Change", value: "" }, { label: "Default", value: getBlock("mvu") }]));
        flow.append(createOverrideBlock("[[storytracker]]", "storytracker", modeData.storytracker, [{ label: "No Change", value: "" }, { label: "Default", value: "# at the very end of the response put this block:\n<Story_Tracker>\narc: The Arc that is now active.\nchapter: The chapter that is now active.\nEpisode: The episode that is now active.\nSecrets: Any secret that the user/{{user}} doesn't know.\n</Story_Tracker>" }]));
        flow.append(createOverrideBlock("[[npc_inner_chatter]]", "npc_inner_chatter", modeData.npc_inner_chatter, [
            { label: "No Change", value: "" },
            { label: "Default", value: getBlock("npc_inner_chatter") },
            { label: "Simple", value: getBlock("npc_inner_chatter_v2") }
        ]));

        // Section 3: Global Variables
        flow.append(`<div class="ps-rule-title" style="margin: 30px 0 10px 0; color: #f59e0b;"><i class="fa-solid fa-earth-americas"></i> Global Variables Overrides</div>`);
        flow.append(createOverrideBlock("[[Language]]", "language", modeData.language, [{ label: "No Change", value: "" }, { label: "English Template", value: "[LANGUAGE RULE]\nALL OUTPUT EXCEPT THINKING MUST BE IN ENGLISH ONLY." }]));
        flow.append(createOverrideBlock("[[pronouns]]", "pronouns", modeData.pronouns, [{ label: "No Change", value: "" }, { label: "Male Template", value: "{{user}} is male. Always portray and address him as such." }]));
        flow.append(createOverrideBlock("[[count]]", "count", modeData.count, [{ label: "No Change", value: "" }, { label: "Example 400", value: "— maximum 400 words" }]));
        flow.append(createOverrideBlock("[[DNRATIO]]", "dnratio", modeData.dnratio, [{ label: "No Change", value: "" }, { label: "Example 50/50", value: "Ratio: Maintain a balance of 50% Dialogue and 50% Narration." }]));
        flow.append(createOverrideBlock("[[onomato]]", "onomato", modeData.onomato, [{ label: "No Change", value: "" }, { label: "Default", value: "- Narration must utilize onomatopoeia. Use precise, context-specific phonetic representations for physical interactions (e.g., the click of a latch, the thud of a heavy object, the soughing of wind) rather than abstract descriptions of sound." }]));
        flow.append(createOverrideBlock("[[banlist]]", "banlist", modeData.banlist, [{ label: "No Change", value: "" }, { label: "Example", value: "[BAN LIST]\nNever rely on these clichés, tropes, or repetitive patterns. They are dead language:\n- A shiver ran down their spine." }]));

        c.append(flow);

        // Events for Buttons & Dropdowns
        c.find(".dev-preset-btn").on("click", function () {
            const targetId = $(this).attr("data-target");
            const val = decodeURIComponent($(this).attr("data-val"));
            $("#" + targetId).val(val);
            $(this).siblings().css({ "background": "transparent", "border-color": "var(--border-color)", "color": "var(--text-main)" });
            $(this).css({ "background": "rgba(16, 185, 129, 0.15)", "border-color": "#10b981", "color": "#10b981" });
        });

        c.off("change.devPreset").on("change.devPreset", ".dev-preset-dropdown", function () {
            const targetId = $(this).attr("data-target");
            const val = decodeURIComponent($(this).val());
            if (val !== "null" && val !== undefined) {
                $("#" + targetId).val(val);
                isDevEngineDirty = true;
            }
            $(this).prop('selectedIndex', 0); // Reset dropdown
        });

        flow.find(".dev-insert-point").on("click", async function () {
            const ap = $(this).attr("data-attach"); saveCurrentTextState();
            const $p = $(`<div style="display:flex; flex-direction:column; gap:10px;"><input type="text" id="m_n" class="ps-modern-input" placeholder="Module Name" /><select id="m_l" class="ps-modern-input"><option value="settings">Stage 4: Settings</option><option value="addons">Stage 5: Add-ons</option></select><textarea id="m_c" class="ps-modern-input" placeholder="Prompt Content" style="height:100px;"></textarea></div>`);
            if (await new Popup($p, POPUP_TYPE.CONFIRM, "Add Module", { wide: true }).show()) {
                const content = $p.find("#m_c").val();
                if (content) { modeData.customToggles.push({ id: "mod_" + Date.now(), name: $p.find("#m_n").val() || "Module", location: $p.find("#m_l").val(), content: content, attachPoint: ap }); renderDevMode("editor", modeData.id, modeData); }
            }
        });

        $("#dev_save_mode").on("click", () => {
            saveCurrentTextState();
            isDevEngineDirty = false;
            if (isNew) { extension_settings[extensionName].customModes.push(modeData); }
            else { const idx = extension_settings[extensionName].customModes.findIndex(m => m.id === modeData.id); if (idx > -1) extension_settings[extensionName].customModes[idx] = modeData; }
            saveSettingsDebounced(); toastr.success("Engine Flow Saved!");
            if (returnTo === "tab") { $(".ps-sidebar").show(); switchTab(0); }
            else { renderDevMode("landing"); }
        });
    }
}
// UNIFIED DEV BUTTON CLICK LISTENER
$("body").off("click", "#ps_btn_dev_mode").on("click", "#ps_btn_dev_mode", function (e) {
    e.preventDefault();
    if ($(this).text().includes("Exit Dev")) {
        if (isDevEngineDirty) {
            if (!confirm("You have unsaved changes in your custom engine. Are you sure you want to exit? Changes will be lost.")) return;
        }
        isDevEngineDirty = false;
        switchTab(0);
    } else {
        renderDevMode("landing");
    }
});

// -------------------------------------------------------------
// DRAGGABLE FIXED BUTTON WITH SNAP-TO-VIEWPORT & PERSISTENCE
// -------------------------------------------------------------
function initDraggableButton() {
    const $btn = $('#prompt-slot-fixed-btn');
    if (!$btn.length) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let hasMoved = false;

    // Load saved position
    let savedPos = null;
    try {
        const stored = localStorage.getItem('megumin_btn_position');
        if (stored) savedPos = JSON.parse(stored);
    } catch (e) {
        console.error('Failed to parse megumin_btn_position', e);
    }

    // Apply saved position or defaults
    function applyPosition(pos) {
        // Reset positioning styles
        $btn.css({ left: '', right: '', top: '', bottom: '' });

        if (pos) {
            const topPx = Math.max(10, Math.min($(window).height() - $btn.outerHeight() - 10, (pos.topPercent / 100) * $(window).height()));
            $btn.css('top', `${topPx}px`);

            const gutter = $(window).width() <= 768 ? 12 : 20;
            if (pos.side === 'left') {
                $btn.css('left', `${gutter}px`);
            } else {
                $btn.css('right', `${gutter}px`);
            }
        } else {
            // Default position
            $btn.css({
                top: '60px',
                right: $(window).width() <= 768 ? '12px' : '20px'
            });
        }
    }

    applyPosition(savedPos);

    // Dynamic resize handler
    $(window).off('resize.megumin_btn').on('resize.megumin_btn', function () {
        applyPosition(savedPos);
    });

    // Start drag handler
    function dragStart(e) {
        // Only left click
        if (e.type === 'mousedown' && e.which !== 1) return;

        const event = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
        startX = event.clientX;
        startY = event.clientY;

        // Since the button is fixed, let's use client coordinates instead of offset() relative to page
        const bounding = $btn[0].getBoundingClientRect();
        initialLeft = bounding.left;
        initialTop = bounding.top;

        hasMoved = false;
        isDragging = true;

        // Remove transitions during drag for immediate tracking
        $btn.removeClass('ps-btn-transition');

        // Bind document level listeners
        $(document).on('mousemove.megumin_drag touchmove.megumin_drag', dragMove);
        $(document).on('mouseup.megumin_drag touchend.megumin_drag', dragEnd);

        // Prevent default actions to stop scrolling/text selection ONLY on mouse events
        if (e.type === 'mousedown') {
            e.preventDefault();
        }
    }

    // Drag move handler
    function dragMove(e) {
        if (!isDragging) return;

        const event = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        // Set movement threshold to avoid clicking issues
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasMoved = true;
        }

        if (hasMoved && e.cancelable) {
            e.preventDefault(); // Prevent scrolling while dragging
        }

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        // Keep it in bounds
        const btnWidth = $btn.outerWidth();
        const btnHeight = $btn.outerHeight();
        newLeft = Math.max(0, Math.min($(window).width() - btnWidth, newLeft));
        newTop = Math.max(10, Math.min($(window).height() - btnHeight - 10, newTop));

        $btn.css({
            left: `${newLeft}px`,
            right: 'auto',
            top: `${newTop}px`
        });
    }

    // Drag end handler
    function dragEnd(e) {
        if (!isDragging) return;
        isDragging = false;

        // Unbind move/up events
        $(document).off('.megumin_drag');

        if (hasMoved) {
            // Apply snap transition
            $btn.addClass('ps-btn-transition');

            const btnWidth = $btn.outerWidth();
            const btnHeight = $btn.outerHeight();
            const bounding = $btn[0].getBoundingClientRect();
            const currentLeft = bounding.left;
            const currentTop = bounding.top;

            const midPoint = $(window).width() / 2;
            const gutter = $(window).width() <= 768 ? 12 : 20;

            let side = 'right';
            let targetLeft = 0;

            if (currentLeft + btnWidth / 2 < midPoint) {
                side = 'left';
                targetLeft = gutter;
                $btn.css({
                    left: `${targetLeft}px`,
                    right: 'auto'
                });
            } else {
                side = 'right';
                targetLeft = $(window).width() - btnWidth - gutter;
                $btn.css({
                    left: 'auto',
                    right: `${gutter}px`
                });
            }

            // Calculate vertical percentage
            const topPercent = (currentTop / $(window).height()) * 100;

            savedPos = { side, topPercent };
            localStorage.setItem('megumin_btn_position', JSON.stringify(savedPos));

            // Prevent the subsequent click event from bubbling or executing handlers
            $btn.one('click', function (clickEvent) {
                clickEvent.stopImmediatePropagation();
                clickEvent.preventDefault();
            });
        }
    }

    // Attach start listeners
    $btn.off('mousedown.megumin_drag touchstart.megumin_drag').on('mousedown.megumin_drag touchstart.megumin_drag', dragStart);
}

jQuery(async () => {
    try {
        const h = await $.get(`${extensionFolderPath}/example.html`);
        $("body").append(h);
        initDraggableButton();
        $("body").append('<div id="ps-global-tooltip"></div>');
        // Modify DOM to transition from Wizard -> Tabs
        $(".ps-breadcrumbs").hide();
        $("#ps_btn_prev, #ps_btn_next").hide();

        $("body").off("click", "#btn_apply_tab_all").on("click", "#btn_apply_tab_all", applyTabToAll);

        $("body").on("mouseenter", ".ps-modern-tag", function () { const hint = $(this).attr("data-hint"); if (!hint) return; const title = $(this).text().trim(); $("#ps-global-tooltip").html(`<span class="ps-tooltip-title">${title}:</span> ${hint}`).addClass("visible"); });
        $("body").on("mouseenter", "#ps_live_token_count", function (e) {
            const hint = $(this).attr("data-breakdown");
            if (!hint) return;
            $("#ps-global-tooltip").html(hint).addClass("visible");
        });
        $("body").on("mousemove", "#ps_live_token_count", function (e) {
            const tooltip = $("#ps-global-tooltip");
            // Position to the left of the mouse so it doesn't go off the screen!
            let x = e.clientX - tooltip.outerWidth() - 15;
            let y = e.clientY + 15;
            tooltip.css({ left: x + 'px', top: y + 'px' });
        });
        $("body").on("mouseleave", "#ps_live_token_count", function () {
            $("#ps-global-tooltip").removeClass("visible");
        });
        $("body").on("mousemove", ".ps-modern-tag", function (e) { if (!$(this).attr("data-hint")) return; const tooltip = $("#ps-global-tooltip"); let x = e.clientX + 15; let y = e.clientY + 15; if (x + tooltip.outerWidth() > window.innerWidth) x = e.clientX - tooltip.outerWidth() - 15; if (y + tooltip.outerHeight() > window.innerHeight) y = e.clientY - tooltip.outerHeight() - 15; tooltip.css({ left: x + 'px', top: y + 'px' }); });
        $("body").on("mouseleave", ".ps-modern-tag", function () { $("#ps-global-tooltip").removeClass("visible"); });

        $("body").on("click", ".sidebar-step", function () { const index = parseInt($(this).attr("id").replace("dot_", "")); if (!isNaN(index)) switchTab(index); });

        $("body").on("click", "#ps_btn_reset", function () {
            if (confirm("Are you sure you want to completely reset this character's profile to the default template?")) {
                const key = getCharacterKey() || "default"; delete extension_settings[extensionName].profiles[key]; saveSettingsDebounced();
                initProfile(); switchTab(0); toastr.info("Profile has been reset to defaults.");
            }
        });

        $("body").on("click", "#ps_btn_save_close", function () { saveProfileToMemory(); $("#prompt-slot-modal-overlay").fadeOut(200); toastr.success("Workflow Configured & Applied Successfully!"); });

        if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
            eventSource.on(event_types.APP_READY, () => {
                cleanGhostProfiles();
                discoverDefaultImages();
            });
            eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, handlePromptInjection);
            eventSource.on(event_types.CHAT_CHANGED, () => {
                initProfile(); updateCharacterDisplay();
                if ($("#prompt-slot-modal-overlay").is(":visible")) switchTab(currentTab);
                updateMemoryVisuals();
            });
            // Background Vectorization triggers for Semantic Mode
            eventSource.on(event_types.USER_MESSAGE_RENDERED, memUpdateSemanticQuery);
            eventSource.on(event_types.MESSAGE_EDITED, memUpdateSemanticQuery);
            eventSource.on(event_types.CHAT_CHANGED, memUpdateSemanticQuery);
            // Trigger visual update when user clicks "Show more messages"
            eventSource.on(event_types.MORE_MESSAGES_LOADED, updateMemoryVisuals);
            // IMAGE GEN AUTO-GEN & SWIPE TRIGGERS
            eventSource.on(event_types.MESSAGE_RECEIVED, async () => {
                updateMemoryVisuals();

                // AUTO-TRIGGER STORY PLANNER
                const sp = localProfile?.storyPlan;
                if (sp && sp.enabled && sp.triggerMode === 'frequency') {
                    const chat = getContext().chat;
                    const aiMsgCount = chat.filter(m => !m.is_user && !m.is_system).length;
                    if (aiMsgCount > 0 && aiMsgCount % sp.autoFreq === 0) {
                        toastr.info("Auto-Generating new Story Plan...", "Megumin Suite");
                        setTimeout(async () => {
                            const chatText = getChatHistoryForStoryPlan();
                            if (chatText.length < 100) return;
                            try {
                                let output = sp.backend === "direct" ? await generateStoryPlanLogic(chatText) : await new Promise(r => useMeguminEngine(async () => r(await generateStoryPlanLogic(chatText))));
                                const plotMatch = output?.match(/<plot>([\s\S]*?)<\/plot>/i);
                                if (plotMatch) {
                                    sp.currentPlan = plotMatch[1].trim();
                                    saveProfileToMemory();
                                    if ($("#sp_current_plan").length) $("#sp_current_plan").val(sp.currentPlan);
                                    toastr.success("Story Plan Updated silently!");
                                }
                            } catch (e) { console.error("Story Plan auto-gen failed", e); }
                        }, 2000); // Small delay to let chat save first
                    }
                }

                // AUTO-TRIGGER MEMORY CORE
                const mem = localProfile?.memoryCore;
                if (mem && mem.enabled && (mem.triggerMode === 'frequency' || mem.triggerMode === 'every')) {
                    const chat = getContext().chat;
                    const aiMsgCount = chat.filter(m => !m.is_user && !m.is_system).length;

                    const freq = mem.triggerMode === 'every' ? 1 : (mem.autoFreq || 10);
                    if (aiMsgCount > 0 && aiMsgCount % freq === 0) {
                        // Check if we actually have enough messages to archive (avoid background notification spam)
                        let hasWork = false;
                        const workingLimit = mem.workingLimit || 30;
                        const chunkSize = mem.chunkSize || 10;
                        const realMessages = [];
                        for (let i = 0; i < chat.length; i++) {
                            if (!chat[i].is_system) realMessages.push({ originalIndex: i, msg: chat[i] });
                        }
                        if (realMessages.length > workingLimit) {
                            const archivableMessages = realMessages.slice(0, realMessages.length - workingLimit);
                            const unarchivedArchivable = archivableMessages.filter(item => !isMessageArchived(item.originalIndex, mem));
                            if (unarchivedArchivable.length >= chunkSize) {
                                hasWork = true;
                            }
                        }

                        if (hasWork) {
                            toastr.info("Background Memory Scan Triggered...", "Megumin Suite");
                            // We run it after a small delay so ST finishes saving the chat first
                            setTimeout(async () => {
                                await memProcessPendingChunks(true);
                            }, 3000);
                        }
                    }
                }

                const s = localProfile?.imageGen;

                // AUTO-EXTRACT NPCs
                const npcBank = localProfile?.npcBank;
                if (npcBank && npcBank.enabled) {
                    const chat = getContext().chat;
                    if (chat && chat.length) {
                        const lastMsg = chat[chat.length - 1];
                        if (!lastMsg.is_user && !lastMsg.is_system) {
                            const npcRegex = /<details>[\s\S]*?<summary>.*?New NPC:\s*(.*?)<\/summary>([\s\S]*?)<\/details>/ig;
                            let match;
                            let added = false;
                            while ((match = npcRegex.exec(lastMsg.mes)) !== null) {
                                const npcName = match[1].trim().replace(/<\/?b>/ig, "");
                                const npcContent = match[0].trim();
                                if (!npcBank.npcs) npcBank.npcs = [];
                                if (!npcBank.npcs.find(n => (n.name || "").trim().toLowerCase() === npcName.toLowerCase())) {
                                    // Parse structured fields from the raw block
                                    const parsed = npcParseBlock(npcContent);
                                    npcBank.npcs.push({
                                        name: parsed.name || npcName,
                                        age: parsed.age || "",
                                        sex: parsed.sex || "",
                                        orientation: parsed.orientation || "",
                                        role: parsed.role || "",
                                        whereToFind: parsed.whereToFind || "",
                                        appearance: parsed.appearance || "",
                                        imageTags: parsed.imageTags || "",
                                        imageOnly: false,
                                        voice: parsed.voice || "",
                                        background: parsed.background || "",
                                        innerCircle: parsed.innerCircle || "",
                                        personality: parsed.personality || "",
                                        readOnPc: parsed.readOnPc || "",
                                        agenda: parsed.agenda || "",
                                        secrets: parsed.secrets || "",
                                        canonLock: parsed.canonLock || "",
                                        pfp: "",
                                        timestamp: Date.now()
                                    });
                                    added = true;
                                    toastr.success(`NPC added to Bank: ${npcName}`, "Megumin Suite");
                                    if ($("#npc_bank_list").length) renderNpcList();
                                }
                            }
                            if (added) saveProfileToMemory();
                        }
                    }
                }

                if (!s || !s.enabled) return;

                const chat = getContext().chat;
                if (!chat || !chat.length) return;

                const lastMsg = chat[chat.length - 1];
                if (lastMsg.is_user || lastMsg.is_system) return;

                // Look for the <img prompt="..."> tags in the AI's response (supports multiple)
                const imgRegexGlobal = /<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/ig;
                const allMatches = [...lastMsg.mes.matchAll(imgRegexGlobal)];

                // FILTER: Ignore any image tags that appear inside the <think>...</think> block
                const lastThinkEnd = lastMsg.mes.lastIndexOf("</think>");
                const matches = allMatches.filter(m => m.index > lastThinkEnd);

                if (matches.length > 0) {
                    const msgIndex = chat.length - 1;
                    const injectMode = s.injectMode || "new_msg";
                    const batchId = Date.now();
                    
                    let modifiedMes = lastMsg.mes;

                    // Iterate backwards so we can replace by exact index without shifting string positions
                    for (let i = matches.length - 1; i >= 0; i--) {
                        const match = matches[i];
                        const uniquePlaceholderId = `kazuma-img-${batchId}-${i}`;
                        const placeholder = `<div id="${uniquePlaceholderId}" class="kazuma-img-placeholder" style="color:var(--gold); font-style: italic; margin: 10px 0;">[Generating Image...]</div>`;

                        if (injectMode === "inline") {
                            modifiedMes = modifiedMes.substring(0, match.index) + placeholder + modifiedMes.substring(match.index + match[0].length);
                        } else {
                            modifiedMes = modifiedMes.substring(0, match.index) + modifiedMes.substring(match.index + match[0].length);
                        }
                    }

                    lastMsg.mes = modifiedMes.trim();
                    await saveChat();
                    
                    // Delay UI update slightly so SillyTavern's internal handlers (like Reasoning) 
                    // finish rendering the DOM before we attempt to update the block.
                    setTimeout(() => {
                        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext && typeof SillyTavern.getContext().updateMessageBlock === "function") {
                            SillyTavern.getContext().updateMessageBlock(msgIndex, lastMsg);
                        } else if (typeof updateMessageBlock === "function") {
                            updateMessageBlock(msgIndex, lastMsg);
                        } else {
                            reloadCurrentChat(); // Refreshes the chat window instantly
                        }
                    }, 100);

                    // 2. Send the extracted prompts to ComfyUI!
                    matches.forEach((match, idx) => {
                        const extractedPrompt = match[2];
                        const uniquePlaceholderId = `kazuma-img-${batchId}-${idx}`;
                        
                        setTimeout(() => {
                            toastr.info(`Image tag ${idx + 1} detected. Sending to ComfyUI...`);
                            igGenerateWithComfy(extractedPrompt, { 
                                message: lastMsg, 
                                index: msgIndex, 
                                mode: injectMode, 
                                isInlineAuto: true,
                                placeholderId: uniquePlaceholderId 
                            });
                        }, 500 + (idx * 1500)); // Stagger calls slightly to prevent overloading ComfyUI
                    });
                }
            });
            const meguminSwipeHandler = async (data) => {
                const s = localProfile?.imageGen;
                if (!s || !s.enabled) return;

                const { message, direction, element } = data;

                // Only trigger on right swipes
                if (direction !== "right") return;

                const media = message.extra?.media || [];
                const idx = message.extra?.media_index || 0;

                // Only trigger on the LAST image in the gallery (overswipe)
                if (idx < media.length - 1) return;

                const mediaObj = media[idx];

                // If there is no title (prompt), we can't regenerate it.
                if (!mediaObj || !mediaObj.title) return;

                // PRIORITY HACK: Temporarily stun both old and new ST Image Gen settings
                // so the native ST listener aborts itself!
                let ogPower = null;
                if (window.power_user && window.power_user.image_overswipe) {
                    ogPower = window.power_user.image_overswipe;
                    window.power_user.image_overswipe = "off";
                }

                let ogExt = null;
                if (extension_settings.image_generation && extension_settings.image_generation.overswipe) {
                    ogExt = extension_settings.image_generation.overswipe;
                    extension_settings.image_generation.overswipe = false;
                }

                // Restore ST's native settings 200ms later after the default listener aborts
                setTimeout(() => {
                    if (ogPower && window.power_user) window.power_user.image_overswipe = ogPower;
                    if (ogExt && extension_settings.image_generation) extension_settings.image_generation.overswipe = ogExt;
                }, 200);

                toastr.info("Regenerating Image...", "Megumin Suite");
                await igGenerateWithComfy(mediaObj.title, { message: message, element: $(element) });
            };

            // Bind the listener
            eventSource.on(event_types.IMAGE_SWIPED, meguminSwipeHandler);

            // FORCE IT TO THE FRONT OF THE REAL ARRAY
            // This ensures our extension evaluates the swipe BEFORE SillyTavern does.
            if (eventSource._events && Array.isArray(eventSource._events[event_types.IMAGE_SWIPED])) {
                const arr = eventSource._events[event_types.IMAGE_SWIPED];
                if (arr.length > 1 && arr[arr.length - 1] === meguminSwipeHandler) {
                    arr.unshift(arr.pop());
                }
            }
        }

        $("body").on("click", "#prompt-slot-fixed-btn", function () { initProfile(); updateCharacterDisplay(); switchTab(0); $("#prompt-slot-modal-overlay").fadeIn(250).css("display", "flex"); });
        $("body").off("click", "#close-prompt-slot-modal, #prompt-slot-modal-overlay").on("click", "#close-prompt-slot-modal, #prompt-slot-modal-overlay", function (e) {
            if (e.target === this) {
                if (isDevEngineDirty) {
                    if (!confirm("You have unsaved changes in your custom engine. Are you sure you want to close? Changes will be lost.")) return;
                    isDevEngineDirty = false;
                }
                saveProfileToMemory();
                $("#prompt-slot-modal-overlay").fadeOut(200);
            }
        });
        let att = 0;
        const int = setInterval(() => {
            if ($("#kazuma_quick_gen").length > 0) {
                clearInterval(int);
                return;
            }
            const b = `<div id="kazuma_quick_gen" class="interactable" title="Visualize Last Scene (Manual)" style="cursor: pointer; width: 35px; height: 35px; display: none; align-items: center; justify-content: center; margin-right: 5px; color: var(--gold);"><i class="fa-solid fa-image fa-lg"></i></div>`;
            let t = $("#send_but_sheld");
            if (!t.length) t = $("#send_textarea");
            if (t.length) {
                t.attr("id") === "send_textarea" ? t.before(b) : t.prepend(b);
                toggleQuickGenButton(); // Ensure correct visibility immediately upon injection
                clearInterval(int);
            }
            att++;
            if (att > 10) clearInterval(int);
        }, 1000);

        $(document).on("click", "#kazuma_quick_gen", function (e) {
            e.preventDefault();
            e.stopPropagation();
            igManualGenerate();
        });

        // ── INLINE IMAGE RETRY: Add buttons to existing images on chat load ──
        eventSource.on(event_types.CHAT_CHANGED, () => {
            setTimeout(() => {
                const context = getContext();
                if (!context.chat) return;
                for (let i = 0; i < context.chat.length; i++) {
                    addKazumaRetryButtons(i);
                }
            }, 300);
        });

        // Re-add retry buttons after swipes and edits (ST re-renders the DOM)
        const kazumaReAddRetry = (index) => setTimeout(() => addKazumaRetryButtons(index), 150);
        eventSource.on(event_types.MESSAGE_SWIPED, kazumaReAddRetry);
        eventSource.on(event_types.MESSAGE_UPDATED, kazumaReAddRetry);
        eventSource.on(event_types.MESSAGE_EDITED, kazumaReAddRetry);
    } catch (e) { console.error(`[${extensionName}] Failed to load:`, e); }
});
