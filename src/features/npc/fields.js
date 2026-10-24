// ────────────────────────────────────────────────────────────────────────────
// NPC field definitions, and everything derived from them.
//
// A field used to be spelled out in five places at once: the dossier template in
// prompts/npcBank.js, a regex in npcParseBlock, a line in npcBuildTextFromData,
// an entry in the tab's npcFieldMeta, and a key in the auto-extract literal in
// index.js. Adding "Fighting Style" meant five edits and five chances to miss
// one — the same trap the block registry was built to close.
//
// This is the one place now. The prompt template, the parser, the injected text
// and the card are all generated from this list, exactly the way Bonds and the
// Character Sheet are generated from localProfile.statBlocks[id].fields.
//
// It is a leaf: it imports the profile and nothing else, so data.js, the tab,
// the dict builder and profile.js can all read from it without a cycle.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../core/state.js";
import { escapeRegex } from "../../utils/regex.js";
import { NPC_DOSSIER_RULES, npcPersistenceRuleSplit, npcUpdateRulesSplit } from "../../prompts/v11Rules.js";

// ── Field types ─────────────────────────────────────────────────────────────
//
// No meters here. A meter is a number that moves every scene, which is Bonds'
// job — an NPC dossier describes a person, and a block that is not in the stack
// costs nothing, so there is no reason to duplicate Bonds inside it.
export const NPC_FIELD_TYPES = [
    { v: "text", label: "Text", hint: "a single line" },
    { v: "longtext", label: "Paragraph", hint: "a few sentences of prose" },
    { v: "list", label: "List", hint: "bulleted entries, one per line" }
];

// ── Structural fields ───────────────────────────────────────────────────────
//
// Three fields carry behaviour that code depends on, so they can be renamed and
// reordered but never deleted:
//
//   "name"      the identity key. Dedupe, the <New_NPC name="..."> attribute,
//               the card header and every update's addressing all key on it.
//   "vitals"    age / sex / orientation. They share one header line in the
//               template and render as a badge rather than as rows.
//   "imageTags" deliberately withheld from the text sent to the model (it would
//               start mimicking Booru syntax in its prose) and handed to
//               ComfyUI instead.
//
// Everything else is the reader's to add, remove, relabel and reorder.
export const NPC_SYSTEM_ROLES = ["name", "vitals", "imageTags"];

// ── The defaults ────────────────────────────────────────────────────────────
//
// The ids are NOT free. Every NPC already saved in every chat's metadata carries
// these exact keys, so changing one here does not migrate a field, it blanks it
// for everybody. Relabel freely; leave `id` alone.
//
// Three flags that look similar and are not:
//
//   fixed       the field is part of the dossier's skeleton and does not appear
//               in the Dossier Fields editor at all. What a person looks like,
//               sounds like, where they live and who they know is what a dossier
//               IS — those stay put. The editor is for the handful of fields
//               that are genuinely a matter of taste, plus anything added.
//   persistent  the field describes this person's ongoing life rather than the
//               current scene. Persistent fields get the "ordinary Tuesday"
//               framing, which is what stops "Where to Find Them: the PC's bed".
//   updatable   the field may be changed later by an <NPC_Update> block.
//
// All three are independent, and every pair of them actually occurs:
//
//   Role        fixed, persistent AND updatable — where someone works is a fact
//               about their life rather than about this scene, but people do
//               change jobs.
//   Canon Lock  editable in the tab, but never updatable by the model. A fact
//               that can be revised is not a canon lock.
//   Agenda      editable and updatable, and not persistent at all.
export const NPC_DEFAULT_FIELDS = [
    {
        id: "name", label: "Name", type: "text", system: "name",
        icon: "fa-id-card", color: "#e5e7eb",
        fixed: true,
        persistent: true, updatable: false,
        placeholder: "Full name + nickname or alias",
        hint: "The identity key. Dedupe, updates and the card header all use it."
    },
    {
        id: "age", label: "Age", type: "text", system: "vitals",
        icon: "fa-cake-candles", color: "#e5e7eb",
        fixed: true,
        persistent: true, updatable: false,
        placeholder: "#"
    },
    {
        id: "sex", label: "Sex", type: "text", system: "vitals",
        icon: "fa-venus-mars", color: "#e5e7eb",
        fixed: true,
        persistent: true, updatable: false,
        placeholder: "M/F/Other"
    },
    {
        id: "orientation", label: "Orientation", type: "text", system: "vitals",
        icon: "fa-heart", color: "#e5e7eb",
        fixed: true,
        persistent: true, updatable: false,
        placeholder: "if relevant to plot"
    },
    {
        id: "role", label: "Role", type: "text",
        icon: "fa-briefcase", color: "#60a5fa",
        fixed: true,
        persistent: true, updatable: true,
        placeholder: "Their actual occupation or place in the world, not just their immediate scene function",
        hint: "What they do in the world. Updatable — people change jobs."
    },
    {
        id: "whereToFind", label: "Where to Find Them", type: "text",
        icon: "fa-map-location-dot", color: "#34d399",
        fixed: true,
        persistent: true, updatable: false,
        // Reworded away from the old "NEVER use temporary scene locations like
        // the PC's bed" phrasing. Naming the failure made it available; asking
        // for an ordinary future weekday makes the current scene structurally
        // the wrong answer instead of a forbidden one.
        placeholder: "A home district, a workplace, a regular haunt — somewhere they could still be found at 2pm on an ordinary Tuesday months from now",
        hint: "Where they live and work, not where the current scene put them."
    },
    {
        id: "appearance", label: "Appearance", type: "longtext",
        icon: "fa-eye", color: "#a78bfa",
        fixed: true,
        persistent: true, updatable: false,
        placeholder: "2–3 sentences a reader can picture: build, face, hair, distinguishing marks, how they carry themselves"
    },
    {
        id: "imageTags", label: "Image Tags", type: "text", system: "imageTags",
        icon: "fa-tags", color: "#f472b6",
        fixed: true,
        persistent: true, updatable: false,
        placeholder: "Booru-style appearance tags — see image_tag_rule. Body and face only.",
        hint: "Sent to ComfyUI, withheld from the model's text so it does not copy the tag syntax into prose."
    },
    {
        id: "voice", label: "Voice", type: "text",
        icon: "fa-comment-dots", color: "#fbbf24",
        fixed: true,
        persistent: true, updatable: false,
        placeholder: "How they speak — cadence, accent, verbal tics, topics they dodge"
    },
    {
        id: "background", label: "Background", type: "longtext",
        icon: "fa-book", color: "#34d399",
        ownLine: true,
        fixed: true,
        persistent: true, updatable: false,
        placeholder: "3–5 sentences. Origin, how they got here, the event that shaped them. A life sketch, not a resume. Include facts the PC may never learn."
    },
    {
        id: "innerCircle", label: "Inner Circle", type: "list",
        icon: "fa-people-group", color: "#fbbf24",
        ownLine: true,
        fixed: true,
        persistent: true, updatable: false,
        itemFormat: "[Name] — [Relationship] | [Age, status, current dynamic in one line]",
        placeholder: "2–5 people. At least one must be off-screen and unknown to the story — a mother, an ex, a childhood friend, a rival. These are plot seeds, not flavour."
    },
    {
        id: "personality", label: "Personality", type: "list",
        icon: "fa-masks-theater", color: "#f472b6",
        ownLine: true,
        fixed: true,
        persistent: true, updatable: false,
        itemFormat: "Defining traits: [2–3 contradictions shown as behaviour, not labels]",
        placeholder: "One line each for defining traits, core flaw (the thing that gets them in trouble), core fear (what they protect against), and tell (a physical or verbal sign when lying, nervous or attracted)."
    },
    {
        id: "readOnPc", label: "Read on the PC", type: "text",
        icon: "fa-magnifying-glass", color: "#60a5fa",
        persistent: false, updatable: true,
        placeholder: "What this NPC currently thinks of the PC, and how that could shift",
        hint: "Current, not permanent. Expected to move as the story does."
    },
    {
        id: "agenda", label: "Agenda", type: "text",
        icon: "fa-bullseye", color: "#fb923c",
        persistent: false, updatable: true,
        placeholder: "What they are working toward right now",
        hint: "Current, not permanent. Expected to move as the story does."
    },
    {
        id: "secrets", label: "Secrets", type: "list",
        icon: "fa-user-secret", color: "#ef4444",
        ownLine: true,
        persistent: false, updatable: true,
        itemFormat: "Tier 1 (semi-public): [rumoured, or guessable with effort]",
        placeholder: "One line per tier: Tier 2 (private) is known only to the inner circle, Tier 3 (buried) is the big one that drives unpredictable behaviour. Close with a Reveal hook: the pressure that could surface these.",
        hint: "A list, so an update can add one secret or retire one without rewriting the rest."
    },
    {
        id: "canonLock", label: "Canon Lock", type: "list",
        icon: "fa-lock", color: "#a855f7",
        ownLine: true,
        persistent: true, updatable: false,
        placeholder: "3–5 immutable facts that must never change across appearances — name, key relationships, defining marks, the buried secret",
        hint: "Never updatable. A fact that can be revised is not a canon lock."
    }
];

// ── Reading the list ────────────────────────────────────────────────────────

// The active field list. Falls back to the defaults so anything running before
// initProfile() has patched the profile still sees a complete set rather than an
// empty dossier.
export function npcFields() {
    const nb = localProfile && localProfile.npcBank;
    const list = (nb && Array.isArray(nb.fields) && nb.fields.length) ? nb.fields : NPC_DEFAULT_FIELDS;
    return list.filter(f => f && f.id && f.label);
}

// The field carrying a structural role, whatever the reader relabelled it to.
// Returns undefined if a profile somehow lost it; every caller guards.
export function npcFieldByRole(role) {
    return npcFields().find(f => f.system === role);
}

export function npcFieldById(id) {
    return npcFields().find(f => f.id === id);
}

// The fields that get a row of their own, in order: everything except the name
// and the vitals, which share the template's header line and render as a badge.
export function npcBodyFields() {
    return npcFields().filter(f => f.system !== "name" && f.system !== "vitals");
}

export function npcVitalsFields() {
    return npcFields().filter(f => f.system === "vitals");
}

// The fields an <NPC_Update> block is allowed to touch.
export function npcUpdatableFields() {
    return npcFields().filter(f => f.updatable);
}

// Which operations make sense on a field, derived from its type rather than
// listed by hand.
//
// A single-valued field has nothing to add to and nothing to remove from — the
// only coherent change to an Agenda is a different Agenda. Offering the model
// "+ Agenda:" would only ever produce an operation that cannot be applied, so
// the type decides. A field marked updatable later gets the right verbs with no
// edit here.
export function npcFieldOps(f) {
    if (!f || !f.updatable) return [];
    return (f.type === "list" || f.type === "longtext") ? ["+", "-", "~"] : ["~"];
}

export function npcFieldAllowsOp(f, op) {
    return npcFieldOps(f).includes(op);
}

// ── Generating the dossier template ─────────────────────────────────────────
//
// This replaces the hand-written `template:` section that used to sit inside
// prompts/npcBank.js. The rules around it still live there — they are prose
// about how to think, which is not derivable from a field list — but the shape
// the model fills in is generated, so a field added in the tab appears in the
// prompt without anyone editing prompt text.

// One field as the model should see it.
//
// A list field reads as a guidance line and then the shape of an entry, which is
// how the hand-written template did it — guidance folded into a bullet reads as
// though it were itself an entry, and the model copies it out as one.
function npcFieldSpec(f) {
    if (f.type === "list") {
        const lines = [`**${f.label}:**`];
        if (f.placeholder) lines.push(`[${f.placeholder}]`);
        if (f.itemFormat) {
            lines.push(`* ${f.itemFormat}`);
            lines.push(`* [same format, one per line]`);
        } else {
            lines.push(`* [one per line]`);
        }
        return lines.join("\n");
    }
    return `**${f.label}:** [${f.placeholder || "value"}]`;
}

// The framing that keeps persistent fields out of the current scene.
//
// Stated once, positively, and naming the fields it governs. The old template
// carried a per-field warning listing the exact wrong answers ("never use the
// PC's bed or the alley"), which made those answers salient — and it sat forty
// lines below the line it was meant to govern, so by the time the model wrote
// the field the rule was long out of view.
export function npcPersistenceRule() {
    // Image Tags is persistent too, but it has its own rule right below this one
    // and naming it here would only dilute the list this rule is trying to make
    // memorable.
    const persistent = npcBodyFields().filter(f => f.persistent && f.system !== "imageTags");
    if (!persistent.length) return "";
    const names = persistent.map(f => f.label).join(", ");
    return [
        `persistent_fields_rule: >`,
        `  ${names} describe this person's ongoing life, not this scene.`,
        `  Write each one as it would still be true at 2pm on an ordinary Tuesday,`,
        `  months from now, with the current scene long over. A fact that only holds`,
        `  inside this scene — where they are standing, what they are doing, who they`,
        `  are with right now — belongs in none of them.`
    ].join("\n");
}

// The <New_NPC> skeleton, generated from the fields.
export function npcBuildDossierTemplate() {
    const nameField = npcFieldByRole("name");
    const vitals = npcVitalsFields();
    const body = npcBodyFields();

    // The header line: name and vitals share one row, the way the old template
    // had them, so an NPC's identity reads at a glance instead of over four rows.
    const headerParts = [];
    if (nameField) headerParts.push(`**${nameField.label}:** [${nameField.placeholder || "Full name"}]`);
    vitals.forEach(f => headerParts.push(`**${f.label}:** [${f.placeholder || "value"}]`));
    const header = headerParts.join(" | ");

    const rows = body.map(npcFieldSpec).join("\n\n");
    const nameAttr = nameField ? `[${nameField.placeholder || "Full Name"}]` : "[Full Name]";

    return [
        `<New_NPC name="${nameAttr}">`,
        "",
        header,
        "",
        rows,
        "",
        `</New_NPC>`
    ].join("\n");
}

// Replace a token that sits on its own line, indenting every line of the
// replacement to the token's own indentation.
//
// The rules text is YAML-shaped, so a generated block dropped in at column zero
// would break the nesting it lands in. Matching the token's indent means the
// author can move `{{template}}` under a different key and it still reads right.
function replaceIndentedToken(text, token, replacement) {
    const re = new RegExp(`^([ \\t]*)${escapeRegex(token)}[ \\t]*$`, "m");
    const m = text.match(re);
    if (!m) return text;
    const pad = m[1];
    const body = String(replacement || "")
        .split("\n")
        .map(line => (line.trim() === "" ? "" : pad + line))
        .join("\n");
    return text.replace(re, () => body);
}

// The full dossier instruction: the author's rules with the generated template
// and the generated persistence rule dropped into their tokens.
//
// A rules text that never had the tokens still works — it just gets no template,
// which is visible rather than silent, and is what an author who deliberately
// wrote their own inline template would want.
export function npcBuildDossierPrompt(rulesText) {
    let out = String(rulesText || "");
    out = replaceIndentedToken(out, "{{template}}", npcBuildDossierTemplate());
    out = replaceIndentedToken(out, "{{persistenceRule}}", npcPersistenceRule());
    return out;
}

// ── Generating the update block ─────────────────────────────────────────────
//
// One entry per updatable field, with only the operations that field's type can
// actually take. Returns "" when nothing is updatable, so the block disappears
// rather than asking the model to fill in an empty contract.
export function npcBuildUpdateTemplate() {
    const updatable = npcUpdatableFields();
    if (!updatable.length) return "";

    const lines = [];
    updatable.forEach(f => {
        const ops = npcFieldOps(f);
        if (ops.includes("~")) lines.push(`~ ${f.label}: [the replacement value for this whole field]`);
        if (ops.includes("+")) lines.push(`+ ${f.label}: [one new entry this scene established]`);
        if (ops.includes("-")) lines.push(`- ${f.label}: [enough of an existing entry's wording to identify which one]`);
    });

    return [
        `<NPC_Update name="[Exact name as it appears in the NPC bank]">`,
        ...lines,
        `</NPC_Update>`
    ].join("\n");
}

// The rules and the shape together — what [[npc_updates]] carries.
//
// Self-contained on purpose: the envelope's slot line points back here, and a
// slot whose rules were somewhere else conditional would be a slot the model
// sometimes cannot fill.
export function npcBuildUpdatePrompt() {
    const rules = npcBuildUpdateRules();
    if (!rules) return "";
    return `${rules}\n\n  template: |\n${npcBuildUpdateTemplate().split("\n").map(l => "    " + l).join("\n")}\n`;
}

// The rules that go with it. Generated too, so the list of what may and may not
// be touched can never drift from the field list that decides it.
export function npcBuildUpdateRules() {
    const updatable = npcUpdatableFields();
    if (!updatable.length) return "";

    const single = updatable.filter(f => npcFieldOps(f).length === 1);
    const multi = updatable.filter(f => npcFieldOps(f).length > 1);
    const locked = npcBodyFields().filter(f => !f.updatable && f.system !== "imageTags");

    const lines = [
        "### NPC UPDATES:",
        "  trigger: >",
        "    Emit <NPC_Update> only when THIS scene changed something already on file",
        "    for an NPC who already has a dossier. Omit the block entirely otherwise.",
        "    Never restate information that did not change. One block per NPC.",
        "",
        `  updatable_fields: ${updatable.map(f => f.label).join(", ")}`,
        "",
        "  operations:",
        "    ~  replaces the field's whole contents.",
        "    +  adds one new entry to a field that holds a list.",
        "    -  removes one existing entry from a field that holds a list."
    ];

    // "Secrets hold a list" reads as a mistake and costs the sentence its
    // authority, so the verb follows the count.
    const verb = list => (list.length === 1 ? "holds" : "hold");
    if (single.length) {
        lines.push("", `    ${single.map(f => f.label).join(", ")} ${verb(single)} a single value: use ~ only.`);
    }
    if (multi.length) {
        lines.push(`    ${multi.map(f => f.label).join(", ")} ${verb(multi)} a list: use +, - or ~.`);
    }
    if (locked.length) {
        lines.push("", "  locked_fields: >", `    Never touch ${locked.map(f => f.label).join(", ")}. Those are written once and fixed.`);
    }

    return lines.join("\n");
}

// ── The V11 preset's versions (plan 018) ────────────────────────────────────
// The same fields, in V11's style (prompts/v11Rules.js). Used only while the
// dossier rules are the built-in ones.

export function npcBuildDossierPromptSplit() {
    const labels = npcBodyFields().filter(f => f.persistent && f.system !== "imageTags").map(f => f.label);
    // The built-in Image Tags hint points at the old rules' key name.
    const template = npcBuildDossierTemplate().replace("see image_tag_rule", "see Image Tags below");
    return NPC_DOSSIER_RULES
        .split("{{template}}").join(template)
        .split("{{persistenceRule}}").join(npcPersistenceRuleSplit(labels))
        .replace(/\n{3,}/g, "\n\n");
}

export function npcBuildUpdatePromptSplit() {
    const updatable = npcUpdatableFields();
    if (!updatable.length) return "";
    const label = f => f.label;
    return npcUpdateRulesSplit({
        updatable: updatable.map(label),
        single: updatable.filter(f => npcFieldOps(f).length === 1).map(label),
        multi: updatable.filter(f => npcFieldOps(f).length > 1).map(label),
        locked: npcBodyFields().filter(f => !f.updatable && f.system !== "imageTags").map(label),
        template: npcBuildUpdateTemplate(),
    });
}
