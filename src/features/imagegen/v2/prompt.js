// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 — prompt assembly. Pure: takes the cast and settings, returns
// strings. {{user}} is left for the caller to substitute.
//
// Two methods:
//   placeholders — the model writes @Name; the extension puts in the look and
//                  outfit. The cast is shown as reference only.
//   reference    — (experimental) the model edits the previous image prompt,
//                  with the cast as the source of truth for looks and clothes.
// ────────────────────────────────────────────────────────────────────────────

import { IMAGE_V2_PROMPTS as P } from "../../../prompts/imageGenV2.js";
import { renderBlocksTasks } from "../../../state/modules/stats/worker.js";

// Every section a combined answer can carry besides the image prompt (plan 009
// adds the blocks Chomusuke writes), so none of them leaks into the prompt.
const SECTION_TAGS = ["Outfit_Tags", "Character_Visual", "World_Update", "World_State", "Bonds", "Character_Sheet", "NPC_Inner_Chatter", "CYOA", "Notebook_Update", "Notebook"];
const ANY_SECTION = SECTION_TAGS.join("|");

export const V2_STYLES = ["tags", "natural"];
export const V2_SHOTS = ["cinematic", "pov", "portrait"];
export const V2_METHODS = ["placeholders", "reference"];

/**
 * @typedef {Object} ImageCastMember
 * @property {string}   name
 * @property {string[]} [aliases]
 * @property {boolean}  [isPc]
 * @property {boolean}  [inScene]
 * @property {boolean}  [mentioned]  absent, but named in the recent text
 * @property {string}   [sex]        "male" | "female" | ""
 * @property {string}   [look]       appearance that shows in any shot
 * @property {string}   [body]       build and proportions (full-body shots only)
 * @property {string}   [outfit]     current outfit; empty = the model describes the clothing
 * @property {string}   [position]   where they are and their posture (World State), for framing
 */

/**
 * <Cast>: the player, who is in the scene, and absent characters just
 * mentioned — each with their sex, look, body and clothing, so the model can
 * pick the count and the framing. Only characters with a look: without one,
 * @Name would turn into a bare name. lookPending = names whose look is being
 * written in this same answer (saved before the image is made), so they stay.
 */
export function renderCastList(cast, { shot = "cinematic", method = "placeholders", lookPending = [] } = {}) {
    const ref = method === "reference";
    const pending = new Set(lookPending.map(n => String(n).toLowerCase()));
    const blocks = [];
    for (const c of cast || []) {
        if (!c || !c.name) continue;
        if (!c.isPc && !c.inScene && !c.mentioned) continue;
        if (!String(c.look || c.body || c.lookNatural || "").trim() && !pending.has(c.name.toLowerCase())) continue;
        // POV: the player is the camera, so they are not offered as a subject.
        if (c.isPc && shot === "pov") continue;
        const aka = (c.aliases || []).filter(Boolean);
        const handle = ref ? c.name : `@${c.name}`;
        const also = aka.length ? ` (also ${aka.map(a => ref ? a : `@${a}`).join(", ")})` : "";
        const where = c.isPc ? "the player" : c.inScene ? "in the scene" : "not in the scene";
        const sex = c.sex ? `${c.sex}, ` : "";
        const lines = [`${handle}${also}: ${sex}${where}`];
        if (String(c.look || "").trim()) lines.push(`  appearance: ${c.look}`);
        if (String(c.body || "").trim()) lines.push(`  body (only when the shot shows it): ${c.body}`);
        if (String(c.outfit || "").trim()) lines.push(`  wearing: ${c.outfit}`);
        else lines.push("  wearing: not noted (describe what they wear)");
        if (String(c.position || "").trim()) lines.push(`  position: ${c.position}`);
        blocks.push(lines.join("\n"));
    }
    return blocks.length ? `<Cast>\n${blocks.join("\n")}\n</Cast>` : "";
}

export const V2_FOCUS = ["2", "3", "4", "all"];

// How many characters get a line of their own (the V2 tab's "Characters in
// focus"). The guide is written for three; the other choices swap that sentence.
function focusRule(guide, focus) {
    const n = { 2: "Two", 3: "Three", 4: "Four" }[focus];
    if (n) return guide.replace(/Three characters at most;/g, `${n} characters at most;`);
    if (focus !== "all") return guide;
    return guide
        .replace("Three characters at most; anyone else goes in as background tags (people in background, crowd).",
            "Every named character in the moment gets a line of their own; unnamed people go in as background tags (people in background, crowd).")
        .replace("Three characters at most; mention anyone else briefly as background.",
            "Every named character in the moment gets a sentence of their own; mention unnamed people briefly as background.");
}

/** The style guide (structure + example + rules), the shot line, extra instructions. */
export function renderV2Rules({ style = "tags", shot = "cinematic", extra = "", method = "placeholders", focus = "3" } = {}) {
    const guide = focusRule(method === "reference"
        ? [P.reference.head, P.reference[style] || P.reference.tags].join("\n")
        : (P.style[style] || P.style.tags), String(focus));
    const parts = [guide, P.shot[shot] || P.shot.cinematic, P.inEnglish];
    if (String(extra || "").trim()) parts.push(`Extra instructions: ${String(extra).trim()}`);
    // A blank line, so the shot line never reads as part of the example above it.
    return parts.join("\n\n");
}

const previousBlock = previous =>
    `<Previous_Image_Prompt>\n${String(previous || "").trim() || "(none yet: this is the first image)"}\n</Previous_Image_Prompt>`;

/** <Character_Sheets>: always BEFORE the story, never among the tasks. */
export function renderSheetsBlock(sheets) {
    const s = String(sheets || "").trim();
    return s ? `<Character_Sheets>\n${s}\n</Character_Sheets>` : "";
}

/**
 * The manual button's quiet generation. Reference material first (cast,
 * sheets, scene, story), the tasks together at the end.
 * @returns {{ system: string, user: string }}
 */
export function renderV2ManualPrompt({ castList = "", sheets = "", scene = "", earlier = "", last = "", rules = "", method = "placeholders", previous = "", extras = "" } = {}) {
    const user = [
        castList,
        renderSheetsBlock(sheets),
        scene ? `<Scene>\n${scene}\n</Scene>` : "",
        String(earlier || "").trim() ? `<Earlier_Story>\n${String(earlier).trim()}\n</Earlier_Story>` : "",
        `<Last_Message>\n${String(last || "").trim()}\n</Last_Message>`,
        method === "reference" ? previousBlock(previous) : "",
        rules,
        // With extra sections the answer has a shape of its own (see renderV2Extras).
        extras ? P.manualTaskWithExtras : P.manualTask,
        extras
    ].filter(Boolean).join("\n\n");
    return { system: P.system, user };
}

/** [[img1]]: the inline instruction the story model reads. */
export function renderV2InlineInstruction({ conditionalText = "", imageCount = 1, castList = "", rules = "", method = "placeholders", previous = "" } = {}) {
    const head = P.inlineHead
        .replace("{{conditionalText}}", conditionalText || "")
        .replace("{{imageCount}}", String(imageCount || 1));
    return [head, castList, method === "reference" ? previousBlock(previous) : "", rules, P.inlineTail].filter(Boolean).join("\n");
}

/**
 * The same instruction split for the V11 preset (plan 018): the rules, the
 * same every turn, and what changes with the scene (the cast, the previous
 * prompt), which goes in <turn_notes>.
 * @returns {{ rules: string, turn: string }}
 */
export function renderV2InlineSplit({ conditionalText = "", castList = "", rules = "", method = "placeholders", previous = "" } = {}) {
    const head = P.inlineHeadSplit.replace("{{conditionalText}}", conditionalText || "");
    return {
        rules: [head, rules, P.inlineTail].filter(Boolean).join("\n"),
        turn: [castList, method === "reference" ? previousBlock(previous) : ""].filter(Boolean).join("\n"),
    };
}

// ── One call, several answers ────────────────────────────────────────────
// The image call can also bring the outfit tags that went stale and the looks
// that are missing, so an image never costs more than one background call.
// Only what is needed is asked for; with nothing extra, the answer is just the
// prompt, as before. Sections come back as tags, not JSON: a broken section
// loses only itself.

/**
 * The instructions for the extra sections (no heading, no answer shape).
 * @param {{ outfits?: Array<{ name: string, outfit: string }>, looks?: string[], followUpdate?: boolean }} needs
 *   followUpdate: in a combined call, also give tags for every outfit the World_Update changes
 */
export function renderV2ExtraTasks({ outfits = [], looks = [], followUpdate = false } = {}) {
    const parts = [];
    if (outfits.length || followUpdate) {
        const who = followUpdate
            ? `for every character whose Outfit your World_Update changes${outfits.length ? ", and for these outfits" : ""}`
            : "for these outfits";
        parts.push(`- Outfit tags ${who}: main garments only, 3 to 6 booru tags, one tag per garment with its colour, material and print ("oversized pink sweater", "white cat print bra"; never two tags for one garment), plus one standout accessory; plain over detailed; keep the state of dress; clothing only, nothing the text does not say.`);
        parts.push(...outfits.map(o => `  ${o.name}: ${o.outfit}`));
    }
    if (outfits.length || followUpdate || looks.length) parts.push(`- ${P.tagsInEnglish}`);
    if (looks.length) {
        parts.push(`- Appearance of ${looks.join(", ")} as 8 to 12 booru tags each. Someone with a sheet in <Character_Sheets> looks the way the sheet says; use the story only for what the sheet leaves out. Always start with sex (male or female) and an age tag (young adult, adult, mature female, mature male, old woman, old man; never a number like "30s"), then hair, eye colour, skin, build, permanent features. A feminine-looking man gets "otoko no ko, flat chest"; a masculine-looking woman gets "tomboy". One tag per thing, never two that fight (petite with tall), only real booru tags ("mole under eye", not "moles"), no small face details (nose, lips, eyelashes). No clothing, expressions, poses or count tags. Skip anyone the text does not describe.`);
    }
    return parts.join("\n");
}

/** The answer-shape lines for the extra sections that were asked for. */
export function renderV2ExtraShape({ outfits = [], looks = [], followUpdate = false } = {}) {
    return [
        ...(outfits.length || followUpdate ? ["<Outfit_Tags name=\"Name\">tag, tag, tag</Outfit_Tags>"] : []),
        ...(looks.length ? ["<Character_Visual name=\"Name\">tag, tag, tag</Character_Visual>"] : [])
    ];
}

/**
 * The extras for a normal (image-only) call: tasks and answer shape.
 * The sheets the looks need go BEFORE the story (renderV2ManualPrompt), not here.
 * @param {{ outfits?: Array<{ name: string, outfit: string }>, looks?: string[] }} needs
 * @returns {string} "" when nothing extra is needed
 */
export function renderV2Extras({ outfits = [], looks = [] } = {}) {
    if (!outfits.length && !looks.length) return "";
    return [
        "## In the same answer",
        renderV2ExtraTasks({ outfits, looks }),
        "",
        "Answer in this shape and nothing else:",
        "<Image_Prompt>the image prompt</Image_Prompt>",
        ...renderV2ExtraShape({ outfits, looks })
    ].join("\n");
}

const OTHER_SECTIONS = new RegExp(`<(${ANY_SECTION})\\b[^>]*>[\\s\\S]*?(?:<\\/\\1\\s*>|(?=<(?:${ANY_SECTION}|Image_Prompt)\\b)|$)`, "gi");

/**
 * Splits a combined answer. The prompt is <Image_Prompt> when present;
 * otherwise the whole answer minus every other section (a model that ignored
 * the shape still gives a usable prompt). `rest` holds the extra sections.
 * @returns {{ prompt: string, rest: string }}
 */
export function splitCombinedAnswer(raw) {
    const text = String(raw || "").replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "");
    const extra = new RegExp(`<(Outfit_Tags|Character_Visual)\\b[^>]*>[\\s\\S]*?(?:<\\/\\1\\s*>|(?=<(?:${ANY_SECTION}|Image_Prompt)\\b)|$)`, "gi");
    const rest = (text.match(extra) || []).join("\n");
    const m = text.match(new RegExp(`<Image_Prompt\\b[^>]*>([\\s\\S]*?)(?:<\\/Image_Prompt\\s*>|(?=<(?:${ANY_SECTION})\\b)|$)`, "i"));
    // No wrapper: everything outside the other sections. With a prefill the
    // answer starts INSIDE the World block (no opening tag), so everything up
    // to its closing tag goes too.
    let body = text;
    const close = body.search(/<\/World_(Update|State)\s*>/i);
    if (close >= 0 && !/<World_(Update|State)\b/i.test(body.slice(0, close))) body = body.slice(body.indexOf(">", close) + 1);
    const prompt = (m ? m[1] : body.replace(OTHER_SECTIONS, "")).trim();
    return { prompt, rest };
}

// ── World State + image in one call (Chomusuke "Combine calls") ──────────
// On a reply that gets an automatic image, one Chomusuke call does the World
// State read AND the image prompt (and, on V2, outfit tags and missing looks).
// Reference material first, the tasks together at the end, then the shape.

export const COMBINED_SYSTEM =
    "You are a continuity clerk and image prompt writer for an ongoing roleplay. You read the latest exchange, " +
    "note what it changed in the world, and write an image prompt for the moment it ends on. " +
    "You never write story, never explain, and never add facts the exchange does not state or clearly show.";

/**
 * One call for everything a reply needs from Chomusuke. Each part is optional:
 *   world  — the World State task (renderWorldClerkTask), or null
 *   image  — false for no image task (default: an image task)
 *   blocks — { notes, tasks: [{ tag, body }] } for the blocks Chomusuke writes (plan 009)
 *   notebook — { notes, task } for the notebook read (plan 010): notes is
 *              <Author_Notebook> before the reply, task is renderNotebookClerkTask()
 * @param {{
 *   notes?: string,           // the continuity notes as a reader sees them (renderClerkNotes)
 *   castList?: string,        // V2 only
 *   sheets?: string,          // character and persona sheets (before the story)
 *   earlier?: string,         // messages before the latest exchange (context)
 *   exchange: string,         // the latest exchange
 *   world?: { rules: string, template: string, tag: string } | null,
 *   engine?: "v2"|"classic",
 *   image?: boolean,
 *   imageRules?: string,      // V2: renderV2Rules(...); Classic: its NPC tags + template rules + extra + examples
 *   onlyIfPhoto?: boolean,
 *   extras?: { outfits?: Array<{name: string, outfit: string}>, looks?: string[], followUpdate?: boolean },
 *   previous?: string|null,   // V2 "Edit last prompt" method: the previous image prompt
 *   blocks?: { notes?: string, tasks: Array<{ tag: string, body: string }> } | null,
 *   notebook?: { notes?: string, task: { rules: string, template: string, tag: string } } | null
 * }} a
 * @returns {{ system: string, user: string, prefill: string }}
 */
export function renderCombinedPrompt(a) {
    const world = a.world || null;
    const tag = world ? world.tag : "World_Update";
    const image = a.image !== false;
    const v2 = image && a.engine === "v2";
    const extras = v2 ? (a.extras || {}) : {};
    const extraTasks = v2 ? renderV2ExtraTasks(world ? extras : { ...extras, followUpdate: false }) : "";
    const blocks = a.blocks && (a.blocks.tasks || []).length ? renderBlocksTasks(a.blocks.tasks) : null;
    const notebook = a.notebook && a.notebook.task ? a.notebook : null;

    let n = 0;
    const tasks = [];
    if (world) tasks.push(`# Task ${++n}: ${tag === "World_State" ? "World State" : "World Update"}\n${world.rules}`);
    if (image) {
        const follow = !world ? ""
            : v2
                ? ` <Cast> shows everyone as they stood BEFORE the latest exchange: where your ${tag} changes someone's clothing or position, the image follows your ${tag} (@Name will carry the new outfit).`
                : ` Where your ${tag} changes someone's clothing, draw them in the new clothing.`;
        tasks.push([
            `# Task ${++n}: Image prompt`,
            `The image shows the moment the latest exchange ends on; draw nothing that has already ended (someone who put an item away no longer holds it).${follow}`,
            a.imageRules,
            a.onlyIfPhoto ? "If nobody in the latest exchange takes, sends or shares a picture, write <Image_Prompt>NONE</Image_Prompt>." : ""
        ].filter(Boolean).join("\n"));
    }
    if (blocks && blocks.tasks) tasks.push(`# Task ${++n}: Story notes\n${blocks.tasks}`);
    if (notebook) tasks.push(`# Task ${++n}: The author's notebook\n${notebook.task.rules}`);

    const user = [
        world ? a.notes : "",
        a.blocks ? a.blocks.notes : "",
        notebook ? notebook.notes : "",
        v2 ? a.castList : "",
        renderSheetsBlock(a.sheets),
        String(a.earlier || "").trim() ? `<Earlier_Story>\n${String(a.earlier).trim()}\n</Earlier_Story>` : "",
        `<Latest_Exchange>\n${String(a.exchange || "").trim()}\n</Latest_Exchange>`,
        v2 && a.previous != null ? previousBlock(a.previous) : "",
        ...tasks,
        extraTasks ? `# Also in the same answer\n${extraTasks}` : "",
        [
            "# Answer in this shape and nothing else",
            world ? world.template : "",
            image ? "<Image_Prompt>the image prompt</Image_Prompt>" : "",
            ...(v2 ? renderV2ExtraShape(world ? extras : { ...extras, followUpdate: false }) : []),
            ...(blocks ? blocks.shape : []),
            notebook ? notebook.task.template : ""
        ].filter(Boolean).join("\n")
    ].filter(s => String(s || "").trim()).join("\n\n");
    return { system: combinedSystem({ world: Boolean(world), image, blocks: Boolean(blocks), notebook: notebook ? (notebook.setup ? "setup" : "read") : false }), user, prefill: world ? `<${tag}>\n` : "" };
}

// The system line for whatever the call does. World State + image keeps the
// original wording.
function combinedSystem({ world, image, blocks, notebook = false }) {
    if (world && image && !blocks && !notebook) return COMBINED_SYSTEM;
    const jobs = [];
    if (world) jobs.push("note what it changed in the world");
    if (blocks) jobs.push("keep the story's running notes (how the characters feel about {{user}}, {{user}}'s condition and belongings, their private thoughts, the choices open next)");
    if (notebook === "setup") jobs.push("start the author's notebook (two or three truths the story keeps hidden)");
    else if (notebook) jobs.push("keep the author's notebook (the clues it shows, who finds out a hidden truth, what comes out)");
    if (image) jobs.push("write an image prompt for the moment it ends on");
    const last = jobs.pop();
    const list = jobs.length ? `${jobs.join(", ")} and ${last}` : last;
    // The notebook's truths are the one thing it makes up: no fact-rule for them.
    return `You follow an ongoing roleplay. You read the latest exchange and ${list}. ` +
        (notebook === "setup"
            ? "You never continue the story and never explain. Apart from the notebook's truths, you never add facts the exchange does not state or clearly show."
            : "You never continue the story, never explain, and never add facts the exchange does not state or clearly show.");
}
