// ────────────────────────────────────────────────────────────────────────────
// World State rendering: what the model reads, what the model is asked to
// write, and the markdown the in-chat card draws.
//
// FRAMING RULE: the storytelling model only knows it is telling a story with
// {{user}}. Nothing here mentions an extension, an app, a system, a ledger or
// anyone keeping records. State is "continuity notes"; updates are "record
// what your reply changed".
//
// Pure: no imports from SillyTavern. {{user}} is left in place for the caller
// to substitute.
// ────────────────────────────────────────────────────────────────────────────

import { nameKey } from "./parse.js";
import { fieldLabel, presentCast, castDisplayName, LIST_LIMITS } from "./model.js";

export const PC_FIELDS = ["outfit", "position", "condition", "carrying"];
export const NPC_FIELDS = ["outfit", "position", "mood", "agenda", "secret"];

// The slow fields. "Scene only" injection leaves them out, and the prompts
// frame them as deep currents so the model rarely rewrites them.
const DEEP_FIELDS = new Set(["mood", "agenda", "secret"]);

const CARD_LABEL = { condition: "Visible Condition" };

function orderedFields(fields, preferred) {
    const keys = Object.keys(fields || {}).filter(k => fields[k]);
    const known = preferred.filter(k => keys.includes(k));
    const rest = keys.filter(k => !preferred.includes(k));
    return [...known, ...rest];
}

export function isEmptyWorld(state) {
    if (!state) return true;
    const s = state.scene || {};
    return !s.time && !s.location && !s.weather &&
        !Object.keys(state.pc?.fields || {}).length &&
        !Object.keys(state.cast || {}).length &&
        !(state.threads || []).length;
}

/**
 * Absent characters named in the recent text, so a returning character's last
 * known state is in front of the model before it writes them back in.
 */
export function findReturning(state, recentText) {
    const text = " " + nameKey(recentText) + " ";
    if (!text.trim()) return [];
    return Object.values(state?.cast || {}).filter(c => {
        if (c.present) return false;
        return [c.name, ...(c.aliases || [])].some(n => {
            const k = nameKey(n);
            return k && text.includes(" " + k + " ");
        });
    });
}

// ── A. Continuity notes injected into the prompt ─────────────────────────

/**
 * @param {object} state
 * @param {{ detail?: "full"|"scene", returning?: object[], pcName?: string, noSecret?: boolean }} [opts]
 *   noSecret — the Author's Notebook is on: hidden things (Secret, Seeds) live there, not here
 */
export function renderWorldForPrompt(state, opts = {}) {
    if (isEmptyWorld(state)) return "";
    const full = opts.detail !== "scene";
    const keep = f => (full || !DEEP_FIELDS.has(f)) && !(opts.noSecret && f === "secret");
    const lines = [];
    const s = state.scene || {};

    lines.push("<Current_World_State>");
    lines.push("<!-- Continuity notes: where the story stands right now, before your reply. Keep your reply consistent with them. Never copy this block into your reply. -->");
    if (s.time) lines.push(`Time: ${s.time}`);
    if (s.location) lines.push(`Loc: ${s.location}`);
    if (s.weather) lines.push(`Wx: ${s.weather}`);

    const pcFields = orderedFields(state.pc?.fields, PC_FIELDS).filter(keep);
    lines.push("");
    lines.push(`{{user}} (PC)`);
    if (pcFields.length) {
        for (const f of pcFields) lines.push(`  ${fieldLabel(f)}: ${state.pc.fields[f]}`);
    } else {
        lines.push("  (nothing noted yet)");
    }

    const present = presentCast(state);
    lines.push("");
    lines.push("Present");
    if (!present.length) lines.push("  (no one else)");
    for (const c of present) {
        lines.push(`  ${castDisplayName(c)}`);
        for (const f of orderedFields(c.fields, NPC_FIELDS).filter(keep)) {
            lines.push(`    ${fieldLabel(f)}: ${c.fields[f]}`);
        }
    }

    const offscreen = Object.values(state.cast || {}).filter(c => !c.present && c.offscreen);
    if (full && offscreen.length) {
        lines.push("");
        lines.push("Off-screen");
        for (const c of offscreen) lines.push(`  ${c.name}: ${c.offscreen}`);
    }

    const returning = (opts.returning || []).filter(c => !c.present);
    if (returning.length) {
        lines.push("");
        lines.push("Returning (not in the scene; last known, use only if they reappear)");
        for (const c of returning) {
            const bits = orderedFields(c.fields, NPC_FIELDS).filter(keep).map(f => `${fieldLabel(f)}: ${c.fields[f]}`);
            if (c.offscreen) bits.push(`last seen: ${c.offscreen}`);
            lines.push(`  ${castDisplayName(c)}${bits.length ? " | " + bits.join(" | ") : ""}`);
        }
    }

    if (full) {
        // Numbered, so a removal can name the number instead of copying the text.
        const list = (key, title) => {
            const items = state[key] || [];
            if (!items.length) return;
            lines.push("");
            lines.push(`${title} (${items.length} of ${LIST_LIMITS[key]})`);
            items.forEach((it, i) => lines.push(`  ${i + 1}. ${it}`));
        };
        list("threads", "Threads");
        if (!opts.noSecret) list("seeds", "Seeds");
        list("timers", "Timers");
        const phases = [];
        if (state.arcPhase) phases.push(`Arc: ${state.arcPhase}`);
        if (state.scenePhase) phases.push(`Scene: ${state.scenePhase}`);
        if (phases.length) { lines.push(""); lines.push(phases.join(" | ")); }
    }

    lines.push("</Current_World_State>");
    return lines.join("\n");
}

// ── B / C. What the model is asked to write ──────────────────────────────

const DEEP_CURRENTS_UPDATE =
    "- Outfit, Position, Condition, Carrying, Time, Loc and Wx follow the scene moment to moment.\n" +
    "- Mood, Agenda, Secret and Threads are the story's deep currents, and they hold steady across many scenes. " +
    "Mood is a character's underlying state, not a passing reaction; flickers of emotion belong in your prose. " +
    "An Agenda is the big goal that drives a character through the story, and it changes only when the story truly turns it: achieved, abandoned, or overturned. " +
    "A Secret changes only when it is exposed or a new one is born. A Thread closes only when the story answers it. " +
    "A small moment is never a reason to rewrite them.";

const LISTS_UPDATE =
    `- Keep at most ${LIST_LIMITS.threads} Threads, ${LIST_LIMITS.seeds} Seeds and ${LIST_LIMITS.timers} Timers. ` +
    "When a list is full and you want to add one, first remove the one that matters least or the one the story has already answered. " +
    "<Current_World_State> numbers each Thread, Seed and Timer, so to remove one you can write its number.";

// While the Author's Notebook is on (plan 010), hidden things live in the
// notebook only, so World State stops asking for a Secret, and for Seeds: the
// notebook's clues are the foreshadowing (plan 020).
export function withoutSecret(text) {
    return String(text || "")
        .split(`${LIST_LIMITS.threads} Threads, ${LIST_LIMITS.seeds} Seeds and `).join(`${LIST_LIMITS.threads} Threads and `)
        .split("each Thread, Seed and Timer").join("each Thread and Timer")
        .split("\n").filter(l => !/^Seed\+:/.test(l)).join("\n")
        .split("Mood, Agenda, Secret and Threads").join("Mood, Agenda and Threads")
        .split("Outfit, Position, Mood, Agenda, Secret").join("Outfit, Position, Mood, Agenda")
        .split("A Secret changes only when it is exposed or a new one is born. ").join("")
        .split("\n").filter(l => !/\.Secret:/.test(l)).join("\n");
}

/**
 * @param {"update"|"bootstrap"} mode
 * @param {{ noSecret?: boolean }} [opts]
 * @returns {{ rules: string, template: string }}
 */
export function renderWorldInstructions(mode, { noSecret = false } = {}) {
    const ins = worldInstructions(mode);
    return noSecret ? { rules: withoutSecret(ins.rules), template: withoutSecret(ins.template) } : ins;
}

function worldInstructions(mode) {
    if (mode === "bootstrap") {
        return {
            rules: [
                "## World State rules",
                "In <World_State>, record the scene as it stands at the END of your reply, one fact per line, in the exact forms shown. " +
                "List every character physically present with a \"+ <Name>\" line followed by their fields. " +
                "Only what a camera could see goes in Outfit, Position and Condition. " +
                "Mood, Agenda, Secret and Threads are the story's deep currents: write them as things big enough to carry a character, and the story, through many scenes to come."
            ].join("\n"),
            template: [
                "<World_State>",
                "Time: [date, day, time of day]",
                "Loc: [place, region]",
                "Wx: [weather, temperature, lighting]",
                "{{user}}.Outfit: [the complete visible outfit, top to bottom, with colours: e.g. grey hoodie, black joggers, white socks]",
                "{{user}}.Position: [posture, where in the space]",
                "{{user}}.Condition: [visible injuries, exhaustion, sweat]",
                "{{user}}.Carrying: [what is in hands, pockets, bag]",
                "+ [NPC Name]",
                "[NPC Name].Outfit: [the complete visible outfit, top to bottom, with colours]",
                "[NPC Name].Position: [posture, where in the space, what they are doing]",
                "[NPC Name].Mood: [their underlying emotional state, what sits beneath the moment, not a passing reaction]",
                "[NPC Name].Agenda: [the big goal that drives them through the story, e.g. \"earn back her family's name\", never a small errand like \"order a drink\"]",
                "[NPC Name].Secret: [something that would change how others see them, or shift the story, if it came out]",
                "(repeat \"+ [NPC Name]\" and its fields for each character present)",
                "Offscreen: [NPC Name] = [where they are, what they are doing]",
                `Thread+: [a major tension or open question the story will have to answer, at most ${LIST_LIMITS.threads} lines in all]`,
                `Seed+: [foreshadowing detail, what it hints at; at most ${LIST_LIMITS.seeds}]`,
                `Timer+: [consequence]: [turns remaining]   (at most ${LIST_LIMITS.timers})`,
                "Arc: [Setup / Escalation / Complication / Crisis / Resolution]",
                "Scene: [Early Simmer / Building / Midpoint Tension / Climax / Breather]",
                "</World_State>"
            ].join("\n")
        };
    }
    return {
        rules: [
            "## World Update rules",
            "<Current_World_State> is where the story stands before your reply. In <World_Update>, record ONLY what your reply changed, one change per line, using these forms:",
            "Time: <new time>",
            "Loc: <new place>",
            "Wx: <new weather>",
            "<Name>.<Field>: <full new value>",
            "  Fields for {{user}}: Outfit, Position, Condition, Carrying",
            "  Fields for everyone else: Outfit, Position, Mood, Agenda, Secret",
            "+ <Name>                                someone enters the scene; follow with their Outfit, Position, Mood, Agenda, Secret lines",
            "- <Name>: <where they went or what they are doing now>",
            "Offscreen: <Name> = <where they are / what they are doing>",
            "Thread+: <new tension>        Thread-: <its number, or the resolved tension as written>",
            "Seed+: <foreshadowing detail>   Seed-: <its number, or the paid-off seed>",
            "Timer+: <consequence>: <turns left>   to count a timer down, write it again with the new count; it replaces the old one",
            "Timer-: <its number, or the consequence>   the timer fired or no longer applies",
            "Arc: <Setup/Escalation/Complication/Crisis/Resolution>",
            "Scene: <Early Simmer/Building/Midpoint Tension/Climax/Breather>",
            "- Use names exactly as they appear in <Current_World_State>. {{user}} is written as {{user}}.",
            "- Give the complete new value of a changed field. Never write \"unchanged\" or \"same\"; leave unchanged fields out.",
            "- Write each field at most once per character.",
            "- Clothing changes matter: if anyone's clothes changed at all (removed, torn, wet, swapped), write their new Outfit.",
            "- An Outfit is the complete visible outfit, top to bottom, with colours and materials (\"grey hoodie, black joggers, white socks\"), never a summary like \"casual clothes\" or \"loungewear\".",
            DEEP_CURRENTS_UPDATE,
            LISTS_UPDATE,
            "- If nothing changed, write exactly: No changes"
        ].join("\n"),
        template: "<World_Update>\n[change lines, or: No changes]\n</World_Update>"
    };
}

// ── Card markdown ────────────────────────────────────────────────────────
// Written in the exact shape the card treatment (src/blocks/treatments.js)
// already reads, so the card looks the same as it always did.

export function renderWorldCard(state, opts = {}) {
    if (isEmptyWorld(state)) return "";
    const s = state.scene || {};
    const out = [];
    const cell = v => (v && String(v).trim()) || "—";
    out.push(`**📅 Time:** ${cell(s.time)} | **🌤 Loc:** ${cell(s.location)} | **🌡 Wx:** ${cell(s.weather)}`);

    const pcName = state.pc?.name || opts.pcName || "{{user}}";
    const pcFields = orderedFields(state.pc?.fields, PC_FIELDS);
    out.push("", "---", "", `**🧍 ${pcName}:**`);
    for (const f of pcFields) out.push(`* *${CARD_LABEL[f] || fieldLabel(f)}:* ${state.pc.fields[f]}`);

    const present = presentCast(state);
    if (present.length) {
        out.push("", "---", "", "**👥 NPCs Present:**");
        for (const c of present) {
            out.push(`**${castDisplayName(c)}:**`);
            for (const f of orderedFields(c.fields, NPC_FIELDS).filter(f => !(opts.noSecret && f === "secret"))) out.push(`* *${CARD_LABEL[f] || fieldLabel(f)}:* ${c.fields[f]}`);
            out.push("");
        }
    }

    const offscreen = Object.values(state.cast || {}).filter(c => !c.present && c.offscreen);
    if (offscreen.length) {
        out.push("---", "**📡 Off-Screen:**");
        for (const c of offscreen) out.push(`* ${c.name} — ${c.offscreen}`);
        out.push("");
    }

    const tail = [];
    if ((state.threads || []).length) {
        tail.push("**🔥 Unresolved Threads:**");
        for (const t of state.threads) tail.push(`* ${t}`);
    }
    if (!opts.noSecret && (state.seeds || []).length) tail.push(`**🌱 Planted Seeds:** ${state.seeds.join("; ")}`);
    if ((state.timers || []).length) tail.push(`**⏳ Consequence Timers:** ${state.timers.join("; ")}`);
    if (state.arcPhase) tail.push(`**🎯 Arc Phase:** ${state.arcPhase}`);
    if (state.scenePhase) tail.push(`**🎬 Scene Phase:** ${state.scenePhase}`);
    if (tail.length) out.push("---", ...tail);

    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── One raw change as a line of text ─────────────────────────────────────
// For the history view, which also lists entries that are switched off and so
// have no computed before/after.

const SCENE_NAME = { time: "Time", location: "Loc", weather: "Wx" };
const PHASE_NAME = { arcPhase: "Arc", scenePhase: "Scene" };
const LIST_NAME = { threads: "Thread", seeds: "Seed", timers: "Timer" };

export function describeWorldChange(ch, pcLabel = "{{user}}") {
    const who = w => (w === "{{pc}}" ? pcLabel : w);
    switch (ch && ch.type) {
        case "scene": return `${SCENE_NAME[ch.key] || ch.key}: ${ch.value}`;
        case "phase": return `${PHASE_NAME[ch.key] || ch.key}: ${ch.value}`;
        case "field": return `${who(ch.who)} · ${fieldLabel(ch.field)}: ${ch.value || "(cleared)"}`;
        case "enter": return `${who(ch.who)} entered`;
        case "leave": return `${who(ch.who)} left${ch.where ? `: ${ch.where}` : ""}`;
        case "offscreen": return `${ch.who ? who(ch.who) + " " : ""}off-screen: ${ch.value}`;
        case "forget": return `${who(ch.who)} removed`;
        case "merge": return `${who(ch.who)} is ${who(ch.into)}`;
        case "pcname": return `Player character: ${ch.name}`;
        case "list": {
            const n = LIST_NAME[ch.list] || ch.list;
            return ch.op === "remove" ? `${n} −: ${ch.value}` : ch.op === "add" ? `${n} +: ${ch.value}` : `${n}: ${ch.value}`;
        }
        default: return "";
    }
}

// ── D. Side-model extraction ─────────────────────────────────────────────
// A separate task call: the storytelling model is not asked for a block, and a
// second call (Chomusuke's worker, or the main model) reads the latest exchange
// and writes it. It may be told its own job; it still never hears about an
// extension. Same rules as the inline prompt, reworded for a reader instead of
// the writer of the reply.

/**
 * @param {{ notes: string, exchange: string, mode: "update"|"bootstrap" }} args
 *   notes    — prompt A for the state BEFORE the exchange ("" when none yet)
 *   exchange — the latest exchange as "Name: text" paragraphs
 * @returns {{ system: string, user: string, prefill: string, tag: string }}
 */
/**
 * Task 1 of any background read of a reply: the World Update (or first World
 * State) rules, reworded for a reader of the exchange rather than its writer.
 * Shared word for word by the Chomusuke read and the combined call.
 * @returns {{ rules: string, template: string, tag: string }}
 */
export function renderWorldClerkTask(mode, { noSecret = false } = {}) {
    const ins = renderWorldInstructions(mode, { noSecret });
    const reword = t => t
        .replace(/before your reply/g, "before the latest exchange")
        .replace(/what your reply changed/g, "what the latest exchange changed")
        .replace(/at the END of your reply/g, "at the END of the latest exchange")
        .replace(/in your prose/g, "in the prose")
        .replace(/your reply/g, "the latest exchange");
    return { rules: reword(ins.rules), template: ins.template, tag: mode === "bootstrap" ? "World_State" : "World_Update" };
}

/** The continuity notes as a reader of the exchange sees them (or "nothing yet"). */
export function renderClerkNotes(notes) {
    return notes
        ? notes.replace(/<!--[\s\S]*?-->/, "<!-- Where the story stood before the latest exchange. -->")
        : "<Current_World_State>\n(Nothing has been noted about this story yet.)\n</Current_World_State>";
}

export function renderWorldExtractPrompt({ notes, exchange, mode, noSecret = false }) {
    const task = renderWorldClerkTask(mode, { noSecret });
    const system =
        "You are a continuity clerk for an ongoing roleplay. You read the latest exchange and note what it changed: " +
        "the physical scene, who is present and how they look, and the story's slow deep currents. " +
        "You never write story, never explain, and never add facts the exchange does not state or clearly show.";
    const user = [
        renderClerkNotes(notes),
        "",
        "<Latest_Exchange>",
        String(exchange || "").trim(),
        "</Latest_Exchange>",
        "",
        task.rules,
        "",
        `Output ONLY the <${task.tag}> block, nothing before or after it, in this shape:`,
        task.template
    ].join("\n");
    return { system, user, prefill: `<${task.tag}>\n`, tag: task.tag };
}
