// ─────────────────────────────────────────────────────────────────────────────
// Megumin Suite — per-block treatments
//
// A block body is a template the model filled in, so it is structured text
// pretending to be prose. These turn four of them into the thing they already
// are: World State into a scene board, Inner Chatter into a whisper thread,
// and the Character Sheet's list fields into chips and a pack list.
//
// EVERY TREATMENT FOLLOWS THE CYOA CONTRACT. A parse function returns null the
// moment the body stops looking like what it expects, and the pane falls back
// to renderBody() — the plain markdown the card has always drawn. That is not
// politeness, it is the only thing that makes this safe: the model drifts from
// the template constantly, and a half-parsed World State that silently drops
// four fields is worse than the paragraph it replaced.
//
// So the rule for anything added here: when in doubt, return null. A block that
// renders as prose has lost a nicety. A block that renders as a confident,
// incomplete card has lost the reader's data.
//
// This file imports only text.js and knows nothing about SillyTavern, the
// profile or the registry — it is handed a block id and a string.
// ─────────────────────────────────────────────────────────────────────────────

import { esc, renderBody, renderStatLine } from "./text.js";
import { resolvePortrait } from "../core/portraits.js";

// The inline formatter renderStatLine expects. Same shape as the one inside
// renderBody, kept here so a treatment can format a fragment without going
// through the whole line renderer.
function inline(t) {
    return esc(t)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)!?]|$)/g, "$1<em>$2</em>");
}

// Bold/italic markers off, for text that is about to become a label or a value
// in a slot of our own rather than a run of prose.
function plain(t) {
    return String(t || "").replace(/\*\*/g, "").replace(/(^|\s)\*(\S[^*]*)\*/g, "$1$2").trim();
}

// A `[like this]` value: the template's own placeholder, left unfilled.
//
// These are DROPPED only when the body is the template itself. A row reading
// "[Current clothing]" is not a fact about anyone and must not be shown as one,
// but the bracket alone cannot say which rows those are: a model filling the
// block in copies the brackets round some of its own answers, because the thing
// it is imitating is written in brackets. Dropping on the bracket alone took
// real moods and real secrets off the card — and out of the message with it,
// since the block region is hidden. See isUnfilledTemplate below.
//
// In the BLOCKS tab preview they are KEPT and dimmed, because that preview is
// fed the templates rather than a real reply — dropping them there leaves every
// treatment with nothing to draw, so it declines, and the settings screen shows
// the old prose while the chat shows the new card. Same reasoning as the
// disabled rows in the CYOA preview.
const PLACEHOLDER = /^\[([\s\S]*)\]$/;

// Returns null when the caller should drop the value entirely.
function readValue(raw, keep) {
    const value = String(raw == null ? "" : raw).trim();
    if (!value) return null;
    const m = value.match(PLACEHOLDER);
    if (!m) return { value, ph: false };
    if (!keep) return null;
    const inner = m[1].trim();
    return inner ? { value: inner, ph: true } : null;
}

// A `Label: value` slot, where the label is short enough to be one — the same
// 28 characters the field matcher allows. A sentence with a colon in it is not
// a slot and does not get a vote below.
//
// Written to have exactly one way to match, because the obvious spelling does
// not. Bullet and bold markers are ONE bounded class rather than two runs with
// whitespace between them, and the label run is greedy and cannot hold a colon,
// so it can only end where the colon is. Spelled the natural way — `[*-•\s]*`
// then `[*_]{0,2}\s*` then a lazy label — the two whitespace runs overlap and a
// long line carrying no colon takes quadratic time, which is a shape the model
// writes and the report's own adversarial sweep looks for.
const SLOT_LINE = /^[*\-•_\s]{0,8}[^:*_\n]{1,28}:\s*[*_]{0,2}\s*(.+)$/;

// Whether a body is the template itself rather than a reply written from it.
//
// What the bracket cannot say on its own, the company it keeps can: an unfilled
// template is unfilled THROUGHOUT, so the moment one slot arrives without
// brackets the model was writing rather than echoing, and the bracketed values
// beside it are its own words. Measured over the whole body once, because the
// same phrase in brackets is a placeholder in one block and a fact in the next.
//
// The failure is safe in both directions. A body wrongly called the template
// loses every value, which leaves nothing described and hands the block to the
// prose renderer whole; a body wrongly called filled shows the leftover
// placeholders dimmed rather than as facts, which is what the preview has
// always done with them.
function isUnfilledTemplate(body) {
    let bracketed = 0;
    let written = 0;
    String(body || "").split(/\r?\n/).forEach(raw => {
        const m = raw.trim().match(SLOT_LINE);
        if (!m) return;
        const value = plain(m[1]);
        if (!value) return;
        if (PLACEHOLDER.test(value)) bracketed++; else written++;
    });
    return bracketed > 0 && !written;
}

// A leading emoji on a template label — `📅 Time` — pulled off so the label can
// be styled as a label and the emoji used as an icon.
const LEADING_EMOJI = /^([\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]+)\s*/u;
function splitEmoji(text) {
    const m = String(text || "").match(LEADING_EMOJI);
    if (!m) return { emoji: "", text: String(text || "").trim() };
    return { emoji: m[1].trim(), text: String(text).slice(m[0].length).trim() };
}

// ═════════════════════════════════════════════════════════════════════════════
// WORLD STATE — Scene Board
// ═════════════════════════════════════════════════════════════════════════════
//
// The template is: a header line of `**emoji Label:** value` cells, then person
// sections (`**Name:**` followed by `* *Field:* value` bullets), then an
// off-screen list, then threads and four inline summary fields. Horizontal
// rules and the `**👥 NPCs Present:**` divider separate them.
//
// The parse is a small state machine over the lines rather than a set of
// regexes over the whole body, because the only reliable structure here is
// ORDER: a bullet belongs to the last person header seen. Matching globally
// would attach Merrit's outfit to Sera whenever the model skipped a field.

// A `* *Field:* value` bullet, or the looser `- **Field:** value` the model
// writes when it is paraphrasing the template.
//
// The whitespace after the bullet is REQUIRED and is the whole reason this
// matches what it should. Markdown spells a bullet and a bold marker with the
// same character, so `\s*` here lets `**Sera Vance:**` parse as a bullet whose
// field is "Sera Vance" — every person after the first then collapses into the
// previous one's field list, and the card shows one character holding everyone
// else's outfit. A bullet is followed by a space; a bold marker is not.
const WS_FIELD = /^[*\-•][ 	]+[*_]{1,2}\s*([^:*_]{1,28}?)\s*:?\s*[*_]{1,2}\s*:?\s*(.*)$/;
// A `**Name:**` line on its own — a person header, or a section divider.
const WS_HEADER = /^[*_]{2}\s*(.+?)\s*:?\s*[*_]{2}\s*:?\s*(.*)$/;
// A plain `* Something — detail` bullet, used by Off-Screen and Threads.
const WS_BULLET = /^[*\-•]\s+(.*)$/;

// Section dividers that introduce a list rather than name a person. Matched on
// the words, not the emoji, because the emoji is the first thing a model drops.
const WS_SECTIONS = [
    { key: "npcs",     re: /npcs?\s*present|present\s*npcs?|in\s*scene/i },
    { key: "offscreen",re: /off[\s-]?screen|elsewhere/i },
    { key: "threads",  re: /unresolved|threads|open\s*threads/i }
];

// The four inline summary fields at the foot of the template, and the two
// ladders the phase markers sit on. A phase word that is not on its ladder
// still renders — it just gets no progress rail, which is the honest outcome
// for a value the template did not offer.
const WS_SUMMARY = [
    { key: "seeds",  re: /planted\s*seeds?|seeds?/i,               label: "Planted seeds",  emoji: "\u{1F331}" },
    { key: "timers", re: /consequence\s*timers?|timers?/i,         label: "Timers",         emoji: "\u{23F3}" },
    { key: "arc",    re: /arc\s*phase/i,   label: "Arc phase",   emoji: "\u{1F3AF}",
      ladder: ["setup", "escalation", "complication", "crisis", "resolution"] },
    { key: "scene",  re: /scene\s*phase/i, label: "Scene phase", emoji: "\u{1F3AC}",
      ladder: ["early simmer", "building", "midpoint tension", "climax", "breather"] }
];

// Fields that get their own treatment inside a person card rather than being
// drawn as another labelled row.
const WS_MOOD   = /^mood$/i;
const WS_SECRET = /^secret/i;
// The PC's card. The template marks it with 🧍 and puts it first; both are
// checked because either one alone is a coin flip.
const WS_PC_EMOJI = "\u{1F9CD}";

// The header line, cut at its labels rather than at its separators.
//
// Splitting on "|" is the obvious move and it is wrong: the template's own Loc
// field is `[Place | Region]`, so a pipe appears INSIDE a value and the cell
// breaks in half. The half with no label then fails the parse, the whole line
// falls through to the person matcher, and "Time" becomes a character with
// twenty fields. Labels are the only reliable boundary, so the value is
// whatever sits between one label and the next.
const WS_CELL_LABEL = /[*_]{2}\s*([^*_:|]{1,28}?)\s*:\s*[*_]{2}/g;

function splitHeaderCells(line, keep) {
    const found = [];
    WS_CELL_LABEL.lastIndex = 0;
    let m;
    while ((m = WS_CELL_LABEL.exec(line)) !== null) {
        found.push({ label: m[1], from: m.index, to: m.index + m[0].length });
    }
    if (found.length < 2) return [];

    return found.map((f, i) => {
        const end = i + 1 < found.length ? found[i + 1].from : line.length;
        // Trailing separator between this value and the next label.
        const raw = plain(line.slice(f.to, end)).replace(/[|·,;]\s*$/, "").trim();
        const v = readValue(raw, keep);
        const { emoji, text } = splitEmoji(plain(f.label));
        return v ? { emoji, label: text, value: v.value, ph: v.ph } : null;
    }).filter(c => c && c.label);
}

// ── The compact World State ──────────────────────────────────────────────────
//
// With Compact Mode on, buildBaseDict swaps in a much smaller template on most
// turns. It is a DIFFERENT shape, not a subset of the full one: a single header
// cell instead of three, the PC's whole state inline on the `**PC:**` line rather
// than in bullets under a name, and one bullet per NPC.
//
// Run through the main parser it does not half-work, it mis-works -- `PC` is read
// as a person and the NPC bullets become that person's fields -- so the guard
// rejects it and every compact turn drew as plain prose while full turns drew a
// board. Hence its own parse rather than a looser main one, which would have put
// drifted full bodies at risk to fix this.
//
// Recognised by the one thing the full template never produces: a bold `**PC:**`
// with its value on the same line. The full template's PC header is
// `**<pc emoji> [PC Name]:**` with nothing after the closing markers.
const WS_COMPACT_PC = /^[*_]{2}\s*PC\s*:?\s*[*_]{2}\s*:?\s*(.+)$/i;
const WS_COMPACT_HEAD = /^[*_]{2}\s*([^:*_]{1,24}?)\s*:?\s*[*_]{2}\s*:?\s*(.+)$/;

function parseWorldStateCompact(body, keep, preview) {
    const all = String(body || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!all.some(l => WS_COMPACT_PC.test(l))) return null;

    // The BLOCKS preview is fed the dict value, and the compact one opens with a
    // line of instruction aimed at the model -- "Omit deep lore, unresolved
    // threads..." -- sitting above the template INSIDE the tag. That line is
    // load-bearing in the envelope, so it cannot be stripped upstream, but the
    // model never echoes it back, so a real reply never carries it.
    //
    // Dropped HERE and only in preview. Counted as an unplaceable line it sent the
    // whole preview to the prose renderer, so the settings screen showed a
    // paragraph while the chat showed a board. In a real reply a stray sentence
    // still fails the parse, which is the contract the rest of this file keeps.
    let lines = all;
    if (preview) {
        const first = all.findIndex(l => /^[*_]{2}/.test(l) || WS_BULLET.test(l));
        if (first > 0) lines = all.slice(first);
    }

    const header = [];
    const people = [];
    let seenPc = false;
    let lost = 0;

    // `clothing | posture`, in the compact template's own order. A third cell
    // keeps its value and goes unlabelled rather than being dropped.
    const cells = v => {
        const out = [];
        const labels = ["Outfit", "Position"];
        v.split("|").forEach((raw, i) => {
            const rv = readValue(plain(raw).trim(), keep);
            if (rv) out.push({ label: labels[i] || "", value: rv.value, ph: rv.ph });
        });
        return out;
    };

    for (const line of lines) {
        const pc = line.match(WS_COMPACT_PC);
        if (pc) {
            seenPc = true;
            const fields = cells(pc[1]);
            // No name to read: compact never asks for one. "You" matches the pill
            // the card already draws for the PC.
            if (fields.length) people.push({ name: "You", emoji: WS_PC_EMOJI, isPc: true, fields });
            continue;
        }

        const hm = line.match(WS_HEADER);
        // The `**NPCs Present:**` divider carries nothing the card needs.
        if (hm && !plain(hm[2]).trim() && WS_SECTIONS.some(x => x.re.test(plain(hm[1])))) continue;

        if (!seenPc && hm) {
            const h = line.match(WS_COMPACT_HEAD);
            const hv = h ? readValue(plain(h[2]), keep) : null;
            if (hv) {
                const { emoji, text } = splitEmoji(plain(h[1]));
                // `**Time & Loc:** [Time] at [Location]` is two facts in one cell,
                // and read whole it also defeats readValue: the outer brackets of
                // `[Time] at [Location]` strip as one placeholder and the chip
                // reads "Time] at [Location". Split at the template's own joiner
                // and each half is a clean cell, matching the full board's chips.
                // Only the FIRST " at ", and only when the label really is both --
                // a location that contains the word must not lose its tail.
                const both = /time/i.test(text) && /loc/i.test(text);
                // Split the RAW value, not hv.value: readValue has already taken the
                // outer bracket pair off `[Time] at [Location]`, so splitting its output
                // yields "Time]" and "[Location". Each raw half is its own clean
                // placeholder and reads back correctly.
                const at = both ? plain(h[2]).split(/\s+at\s+/) : [];
                if (at.length === 2 && at[0].trim() && at[1].trim()) {
                    const t0 = readValue(at[0].trim(), keep);
                    const l0 = readValue(at[1].trim(), keep);
                    if (t0 && l0) {
                        header.push({ emoji: emoji || "", label: "Time", value: t0.value, ph: t0.ph });
                        header.push({ emoji: "", label: "Loc", value: l0.value, ph: l0.ph });
                        continue;
                    }
                }
                header.push({ emoji, label: text, value: hv.value, ph: hv.ph });
                continue;
            }
        }

        const bm = line.match(WS_BULLET);
        if (bm) {
            const t = plain(bm[1]);
            const split = t.match(/^(.{1,40}?)\s*:\s*(.+)$/);
            const nv = split ? readValue(split[1], preview) : null;
            const fields = split ? cells(split[2]) : [];
            if (nv && fields.length) {
                people.push({ name: nv.value, emoji: "", isPc: false, fields });
                continue;
            }
            lost++;
            continue;
        }

        const stray = plain(line);
        if (!PLACEHOLDER.test(stray) && stray.split(/\s+/).length >= 5) lost++;
    }

    // Same contract as everything else here: one line the parse could not place
    // is enough to hand the whole body back to the prose renderer.
    if (lost) return null;
    if (!people.some(x => x.fields.length)) return null;
    return { header, people, offscreen: [], threads: [], summary: {} };
}

export function parseWorldState(body, opts = {}) {
    const preview = Boolean(opts.keepPlaceholders);
    // Bracketed values are kept unless this body is the template itself.
    const keep = preview || !isUnfilledTemplate(body);

    // Compact bodies are checked first: they would otherwise mis-parse below rather
    // than simply fail, and a mis-parse is the one outcome this file exists to avoid.
    // Returns null unless the compact signature is actually present.
    const compact = parseWorldStateCompact(body, keep, preview);
    if (compact) return compact;
    const lines = String(body || "").split(/\r?\n/);

    const header = [];      // the time / loc / weather cells
    const people = [];      // { name, emoji, isPc, fields: [{label, value}] }
    const offscreen = [];   // { name, detail }
    const threads = [];     // { text }
    const summary = {};     // key -> { label, emoji, value, ladder, at }

    let section = "npcs";   // which list a bare bullet belongs to
    let person = null;      // the person a field bullet attaches to
    let sawHeader = false;
    let lost = 0;           // lines the parse could not place anywhere
    let npcsDividerAfter = -1;  // how many people were named before the divider

    for (const raw of lines) {
        const line = raw.trim();
        if (!line || /^-{3,}$/.test(line)) continue;

        // ── The header line: two or more `**Label:** value` cells
        if (!sawHeader && /[*_]{2}/.test(line)) {
            const cells = splitHeaderCells(line, keep);
            if (cells.length >= 2) {
                header.push(...cells);
                sawHeader = true;
                continue;
            }
        }

        // ── A field bullet belongs to whoever was named last
        const fm = line.match(WS_FIELD);
        if (fm && person) {
            const v = readValue(plain(fm[2]), keep);
            if (v) person.fields.push({ label: plain(fm[1]), value: v.value, ph: v.ph });
            continue;
        }

        // ── A bold line: either a section divider or somebody's name
        const hm = line.match(WS_HEADER);
        if (hm) {
            const { emoji, text } = splitEmoji(plain(hm[1]));
            const trailing = plain(hm[2]);

            const sect = WS_SECTIONS.find(s => s.re.test(text));
            if (sect && !trailing) {
                if (sect.key === "npcs" && npcsDividerAfter < 0) npcsDividerAfter = people.length;
                section = sect.key; person = null; continue;
            }

            const sum = WS_SUMMARY.find(s => s.re.test(text));
            const sv = sum ? readValue(trailing, keep) : null;
            if (sum && sv) {
                summary[sum.key] = { ...sum, value: sv.value, ph: sv.ph, emoji: sum.emoji || emoji };
                person = null;
                continue;
            }
            // Not a divider and not a summary field, so it is a person. A bold
            // line inside the off-screen or threads section is still a person
            // header — the model writes `**Isolde:**` there too — but it does
            // not switch the section back.
            // A name is the one value a bracket never rescues: `**[NPC Name]:**`
            // is the template's own header and there is no NPC behind it. Kept
            // in the preview so the shape shows, dropped anywhere else.
            const nv = readValue(text, preview);
            if (nv) {
                person = { name: nv.value, emoji, isPc: emoji === WS_PC_EMOJI, fields: [] };
                people.push(person);
                section = "person";
                continue;
            }
            // A bold line that named nobody still ENDS the person before it.
            // Without this the bullets under an unfilled name header attach to
            // the last person who did have one, and the card shows one
            // character wearing two moods and somebody else's position.
            person = null;
            continue;
        }

        // ── A plain bullet: off-screen entry or thread, by section
        const bm = line.match(WS_BULLET);
        if (bm) {
            const bv = readValue(plain(bm[1]), keep);
            if (!bv) continue;
            const text = bv.value;
            if (section === "offscreen") {
                // `[Name] — doing something` or `**Name** doing something`.
                // The ASCII hyphen needs a space on BOTH sides to count. Without
                // that, `Jean-Luc Aubert - waiting at the docks` files under
                // "Jean" and puts the rest of his own name in the detail.
                const split = text.match(/^(.{1,32}?)(?:\s*[—–:]\s*|\s+-\s+|\s\s+)\s*(.+)$/);
                offscreen.push(split ? { name: split[1], detail: split[2] } : { name: "", detail: text });
            } else if (section === "threads") {
                threads.push({ text });
            } else if (person) {
                // A bullet under a person that did not match the field shape.
                // Keep it as an unlabelled line rather than losing it.
                person.fields.push({ label: "", value: text });
            } else {
                // A bullet in the person section with nobody to hang it on —
                // what the field bullets under an unfilled name header become.
                // Counted, not shown, so the guard below can hand the body back
                // to the prose renderer rather than let them disappear.
                lost++;
            }
            continue;
        }

        // ── An inline summary field with no bold markers at all
        const bare = line.match(/^([A-Za-z\s]{3,24}):\s*(.+)$/);
        if (bare) {
            const { text } = splitEmoji(plain(bare[1]));
            const sum = WS_SUMMARY.find(s => s.re.test(text));
            const bv2 = sum ? readValue(plain(bare[2]), keep) : null;
            if (sum && bv2) {
                summary[sum.key] = { ...sum, value: bv2.value, ph: bv2.ph };
                continue;
            }
        }
        // Anything else is prose the template did not ask for. Ignored rather
        // than shown, because a scene board with a stray sentence wedged in it
        // looks broken — and counted, so the guard below can refuse the whole
        // treatment rather than swallow it.
        //
        // Only a real sentence counts. A wholly bracketed line is the template
        // talking to the model and is nobody's to lose, and a line of four
        // words or fewer is a divider or a label the parse did not recognise —
        // neither carries anything the card is not already showing.
        const stray = plain(line);
        if (!PLACEHOLDER.test(stray) && stray.split(/\s+/).length >= 5) lost++;
    }

    // The PC is the 🧍-marked card, or failing that the first one — but only
    // when the model wrote a divider before the NPCs, otherwise "first" means
    // nothing. Marking someone the reader on a coin flip costs them their mood
    // as well, since the card draws the "You" pill or the mood and never both.
    if (npcsDividerAfter > 0 && !people.some(p => p.isPc)) people[0].isPc = true;

    // ── The guard. Anything less than a header and one described person is not
    // a World State block, whatever it is.
    const described = people.filter(p => p.fields.length).length;
    if (!header.length && !described) return null;
    if (!described) return null;
    // A line the parse could not place is a line the card cannot draw, and the
    // block region is hidden in the message, so it would be on screen nowhere at
    // all. One is enough to hand the body back: the scene board is a nicety, a
    // sentence the reader never sees is not.
    if (lost) return null;

    return { header, people, offscreen, threads, summary };
}

function renderPersonCard(p) {
    const rows = [];
    let mood = "";

    p.fields.forEach(f => {
        if (WS_MOOD.test(f.label)) {
            // The first few words only. A mood pill is a glance, and the model
            // writes "Guarded — watching the door more than him".
            mood = f.value.split(/\s*[—–-]\s|\s*[,.]\s/)[0].trim();
            if (mood.length > 24) mood = mood.slice(0, 22).trim() + "…";
            // The full line still shows as a row, so nothing is lost to the pill.
        }
        // Blurred on the label alone. Gating this on the value not being
        // bracketed meant a secret the model wrote in brackets was printed in
        // the open, which is the one field on this card where that matters.
        const secret = WS_SECRET.test(f.label);
        rows.push(`
            <div class="meg-ws-row${secret ? " meg-ws-secret" : ""}${f.ph ? " meg-ws-ph" : ""}">
                <span class="meg-ws-k">${esc(f.label || "·")}</span>
                <span class="meg-ws-v"${secret ? ' tabindex="0" title="Click or focus to reveal"' : ""}>${
                    secret ? `<span>${inline(f.value)}</span>` : inline(f.value)
                }</span>
            </div>`);
    });

    const initial = (p.name.match(/\p{L}/u) || ["?"])[0].toUpperCase();
    const pfp = resolvePortrait(p.name);
    const avatar = pfp
        ? `<span class="meg-ws-av meg-av-img"><img src="${esc(pfp)}" alt=""></span>`
        : `<span class="meg-ws-av">${esc(initial)}</span>`;

    return `
        <div class="meg-ws-person${p.isPc ? " meg-ws-pc" : ""}">
            <div class="meg-ws-person-head">
                ${avatar}
                <span class="meg-ws-nm">${esc(p.name)}</span>
                ${p.isPc
                    ? `<span class="meg-ws-mood meg-ws-you">You</span>`
                    : mood ? `<span class="meg-ws-mood">${esc(mood)}</span>` : ""}
            </div>
            <div class="meg-ws-rows">${rows.join("")}</div>
        </div>`;
}

function renderPhase(s) {
    if (!s) return "";
    // Where the written phase sits on its ladder. -1 (not on it) draws the name
    // with no rail rather than guessing a position.
    const at = s.ladder
        ? s.ladder.findIndex(step => s.value.toLowerCase().includes(step))
        : -1;
    const rail = at > -1
        ? `<div class="meg-ws-seg">${s.ladder.map((_, i) =>
            `<i class="${i < at ? "meg-done" : i === at ? "meg-now" : ""}"></i>`).join("")}</div>`
        : "";
    return `
        <div class="meg-ws-phase">
            <div class="meg-ws-sub">${esc(s.label)}</div>
            <div class="meg-ws-phase-nm">${esc(s.value)}</div>
            ${rail}
        </div>`;
}

export function renderWorldState(parsed) {
    const { header, people, offscreen, threads, summary } = parsed;

    const chips = header.map(c => `
        <span class="meg-ws-chip${c.ph ? " meg-ws-ph" : ""}">
            ${c.emoji ? `<span class="meg-ws-ic">${esc(c.emoji)}</span>` : ""}
            <span class="meg-ws-lb">${esc(c.label)}</span>
            <span class="meg-ws-vl">${esc(c.value)}</span>
        </span>`).join("");

    const cards = people.filter(p => p.fields.length).map(renderPersonCard).join("");

    const off = offscreen.length ? `
        <div class="meg-ws-panel">
            <div class="meg-ws-sub">Off-screen</div>
            ${offscreen.map(o => `
                <div class="meg-ws-off">
                    ${o.name ? `<span class="meg-ws-off-nm">${esc(o.name)}</span>` : ""}
                    <span class="meg-ws-off-tx">${inline(o.detail)}</span>
                </div>`).join("")}
        </div>` : "";

    // Seeds and timers ride in the threads panel rather than getting boxes of
    // their own — they are the same kind of thing, a pending consequence, and
    // three near-empty panels in a row read worse than one full one.
    const extras = ["seeds", "timers"].filter(k => summary[k]).map(k => `
        <div class="meg-ws-thread">
            <span class="meg-ws-dot meg-ws-soft"></span>
            <span>${esc(summary[k].emoji)} ${inline(summary[k].value)}</span>
        </div>`).join("");

    const threadPanel = (threads.length || extras) ? `
        <div class="meg-ws-panel">
            <div class="meg-ws-sub">Unresolved threads</div>
            ${threads.map((t, i) => `
                <div class="meg-ws-thread">
                    <span class="meg-ws-dot${i === 0 ? " meg-ws-hot" : i === 1 ? " meg-ws-warm" : ""}"></span>
                    <span>${inline(t.text)}</span>
                </div>`).join("")}
            ${extras}
        </div>` : "";

    const phases = (summary.arc || summary.scene) ? `
        <div class="meg-ws-phases">${renderPhase(summary.arc)}${renderPhase(summary.scene)}</div>` : "";

    return `
        ${chips ? `<div class="meg-ws-rail">${chips}</div>` : ""}
        ${cards ? `<div class="meg-ws-grid">${cards}</div>` : ""}
        ${(off || threadPanel || phases) ? `<div class="meg-ws-foot">${off}${threadPanel}${phases}</div>` : ""}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// NPC INNER CHATTER — Whisper Thread, falling to Interior for one speaker
// ═════════════════════════════════════════════════════════════════════════════
//
// The template forks and the old renderer drew both forks the same: several
// NPCs talking behind the PC's back is a conversation, one NPC is a private
// thought. Counting speakers picks the shape.

// A speaker marker: a short name in caps or title case, followed by a colon.
// Anchored to a line start OR to the end of a sentence, because the model
// writes the whole exchange as one paragraph as often as it writes lines.
const CHAT_SPEAKER = /(?:^|(?<=[.!?"”'’)\]])\s+|\n)([\p{Lu}][\p{L}\p{N}'’.\- ]{1,28}?)\s*:\s+/gu;

// Words that end in a colon but are not people. Without this, "Note:" and
// "Example:" — both of which appear in the template's own instructions —
// become speakers with a bubble each.
const CHAT_NOT_A_NAME = /^(note|example|tone|edit|ooc|warning|summary|context|rules?|output|format)$/i;

export function parseChatter(body, opts = {}) {
    const text = String(body || "").trim();
    if (!text) return null;

    // The Inner Chatter template is not a fillable skeleton like the others —
    // it is a paragraph of instructions to the model, wrapped in one pair of
    // brackets, with a worked example inside it. Whisper-threading that example
    // would show the reader a card built out of the prompt. Declined in the
    // preview and in the chat alike, since a reply that echoed its own
    // instructions back is not something to draw nicely either.
    if (PLACEHOLDER.test(text)) return null;
    void opts;

    const turns = [];
    let preamble = "";
    let last = null;
    let cursor = 0;

    CHAT_SPEAKER.lastIndex = 0;
    let m;
    while ((m = CHAT_SPEAKER.exec(text)) !== null) {
        const name = plain(m[1]).replace(/\s+/g, " ").trim();
        if (CHAT_NOT_A_NAME.test(name) || name.split(" ").length > 4) continue;

        const chunk = text.slice(cursor, m.index).trim();
        if (last) last.text = chunk;
        else preamble = chunk;

        last = { name, text: "" };
        turns.push(last);
        cursor = m.index + m[0].length;
    }
    if (last) last.text = text.slice(cursor).trim();

    // No speaker markers at all. One unattributed block of thought is still a
    // valid Interior; anything longer is prose we should not be reshaping.
    if (!turns.length) {
        const stripped = plain(text);
        if (!stripped || /^\[.*\]$/.test(stripped)) return null;
        if (stripped.length > 900) return null;
        return { mode: "interior", who: "", text: stripped, preamble: "" };
    }

    const filled = turns.filter(t => t.text);
    if (!filled.length) return null;

    // One speaker, one turn: the solo case the template describes as unspoken
    // thought. Two turns from the same person is still a thread — they are
    // consecutive thoughts, and stacking them reads better than joining them.
    if (filled.length === 1) {
        return { mode: "interior", who: filled[0].name, text: filled[0].text, preamble };
    }

    return { mode: "thread", turns: filled, preamble };
}

// A stable tint per speaker, so someone keeps their colour for the whole card.
// Index into a fixed set rather than a hash of the name: with two or three
// speakers a hash collides often enough to be noticeable, and order is stable
// within one message anyway.
function speakerTints(turns) {
    const seen = [];
    turns.forEach(t => { if (!seen.includes(t.name)) seen.push(t.name); });
    const map = {};
    seen.forEach((name, i) => { map[name] = i % 4; });
    return map;
}

export function renderChatter(parsed) {
    const lead = parsed.preamble
        ? `<div class="meg-chat-lead">${renderBody(parsed.preamble)}</div>` : "";

    if (parsed.mode === "interior") {
        return `
            ${lead}
            <div class="meg-chat-interior">
                <div class="meg-chat-im-tx">${inline(parsed.text)}</div>
                ${parsed.who ? `<div class="meg-chat-im-who">${esc(parsed.who)}</div>` : ""}
            </div>`;
    }

    const tints = speakerTints(parsed.turns);
    const bubbles = parsed.turns.map(t => {
        const initial = (t.name.match(/\p{L}/u) || ["?"])[0].toUpperCase();
        return `
            <div class="meg-chat-b meg-chat-t${tints[t.name]}">
                <span class="meg-chat-av">${esc(initial)}</span>
                <div class="meg-chat-bub">
                    <div class="meg-chat-nm">${esc(t.name)}</div>
                    <div class="meg-chat-tx">${inline(t.text)}</div>
                </div>
            </div>`;
    }).join("");

    return `
        ${lead}
        <div class="meg-chat-thread">
            ${bubbles}
            <div class="meg-chat-note">not heard by you</div>
        </div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// CHARACTER SHEET — meters as before, list fields as chips and a pack list
// ═════════════════════════════════════════════════════════════════════════════
//
// Skills and Inventory are not blocks. They are `type: "list"` fields on the
// Character Sheet stat block, which is why this is one renderer for the whole
// sheet rather than two treatments: the pane has to draw the meter line too.
//
// Which list field gets which treatment is decided by SHAPE AND LABEL, not by
// reading the field config. That is deliberate — stat fields are data the
// reader edits, so a custom "Spells" or "Contacts" field inherits the chip
// treatment for free, which is the same reasoning that made the fields data in
// the first place.

// `Label: a, b, c` on its own line — no pipes, so it cannot be a meter row.
const LIST_LINE = /^\s*[*_]{0,2}\s*([A-Za-z][A-Za-z \-/]{1,26}?)\s*[*_]{0,2}\s*:\s*(.+?)\s*$/;
// The labels that mean "this is a container of things", not "these are ranks".
const PACK_LABEL = /invent|pack|gear|bag|carr|equip|loot|belongings|supplies/i;

// The declared type of a field, when the caller handed the field list down.
//
// Stat block fields carry a type - meter, number, text, list - set by the reader
// in the tab. This parser used to infer it from the shape of the line instead,
// and "two or more comma-separated parts means a list" is wrong in both
// directions: a Status sentence with a comma in it was cut in half and drawn as
// two tags, and a genuine one-item Skills list was demoted to a plain line.
//
// Returns null when the field was not declared, which is a real case - the model
// invents a field, or the reader renamed one - and the old inference still
// handles those.
function declaredFieldType(fields, label) {
    if (!Array.isArray(fields) || !fields.length) return null;
    const want = String(label || "").trim().toLowerCase();
    if (!want) return null;
    const f = fields.find(x => String((x && x.label) || "").trim().toLowerCase() === want);
    return f ? (f.type || "text") : null;
}

// Rank words, weakest first, mapped to the four tiers the chips are coloured
// by. A rank the model invents lands in no tier and renders as a plain chip.
const RANK_TIERS = [
    { tier: "novice", words: ["untrained", "novice", "beginner", "apprentice", "rookie", "e", "f"] },
    { tier: "adept",  words: ["trained", "adept", "competent", "skilled", "journeyman", "c", "d"] },
    { tier: "expert", words: ["expert", "veteran", "advanced", "proficient", "b"] },
    { tier: "master", words: ["master", "grandmaster", "legendary", "mythic", "s", "a"] }
];

function rankOf(word) {
    const w = String(word || "").toLowerCase().replace(/[^a-z+]/g, "");
    if (!w) return null;
    const hit = RANK_TIERS.find(t => t.words.includes(w));
    return hit ? hit.tier : null;
}

// `Duelling Master`, `Lockpicking (Expert)`, `Streetwise - Adept`. The rank is
// always trailing, so only the last token or the last parenthesis is tested.
function splitSkill(item) {
    const paren = item.match(/^(.*?)\s*[([]\s*([^)\]]+)\s*[)\]]\s*$/);
    if (paren && rankOf(paren[2])) return { name: paren[1].trim(), rank: paren[2].trim(), tier: rankOf(paren[2]) };

    const dash = item.match(/^(.*?)\s+[—–-]\s+(\S+)$/);
    if (dash && rankOf(dash[2])) return { name: dash[1].trim(), rank: dash[2].trim(), tier: rankOf(dash[2]) };

    const words = item.trim().split(/\s+/);
    if (words.length > 1 && rankOf(words[words.length - 1])) {
        const rank = words.pop();
        return { name: words.join(" "), rank, tier: rankOf(rank) };
    }
    return { name: item.trim(), rank: "", tier: "" };
}

// `Belt knife (equipped)`, `12 crowns`, `Lockpicks ×2`, `Half-flask of gin`.
const IV_STATE = /^(.*?)\s*[([]\s*([^)\]]{1,24})\s*[)\]]\s*$/;
const IV_LEAD_QTY = /^(\d+)\s+(.+)$/;
const IV_TAIL_QTY = /^(.*?)\s*[x×]\s*(\d+)$/i;
// States that mean the thing is in a hand or on a body right now.
const IV_EQUIPPED = /equip|wield|held|in hand|worn|wearing|drawn|readied/i;

// A modest keyword map. Wrong sometimes and that is fine — the glyph is
// decoration beside a name that is always visible, so a bad guess costs
// nothing. The neutral fallback is used far more often than any single entry.
const IV_GLYPHS = [
    [/knife|dagger|blade|sword|sabre|saber|rapier|katana/i, "\u{1F5E1}"],
    [/bow|arrow|quiver/i,                                   "\u{1F3F9}"],
    [/gun|pistol|rifle|revolver/i,                          "\u{1F52B}"],
    [/shield|buckler/i,                                     "\u{1F6E1}"],
    [/coin|crown|gold|silver|penny|pence|credit|gil|zeni/i, "\u{1FA99}"],
    [/letter|note|paper|scroll|map|document|ledger/i,       "\u{1F4DC}"],
    [/book|tome|grimoire|journal|diary/i,                   "\u{1F4D5}"],
    [/key|lockpick|picks/i,                                 "\u{1F5DD}"],
    [/potion|vial|flask|elixir|tonic/i,                     "\u{1F9EA}"],
    [/gin|wine|ale|beer|whisk|rum|bottle|liquor/i,          "\u{1F376}"],
    [/bread|ration|food|meat|apple|cheese/i,                "\u{1F35E}"],
    [/rope|cord|twine|thread|oilskin/i,                     "\u{1F9F5}"],
    [/torch|lantern|candle|lamp/i,                          "\u{1F526}"],
    [/ring|amulet|pendant|charm|talisman/i,                 "\u{1F48D}"],
    [/token|badge|medal|seal|insignia/i,                    "\u{1F396}"],
    [/bandage|salve|medicine|kit|herb/i,                    "\u{1FA79}"],
    [/cloak|coat|boots|glove|hat|armor|armour/i,            "\u{1F9E5}"],
    [/bag|pack|pouch|sack|satchel/i,                        "\u{1F392}"]
];
function glyphFor(name) {
    const hit = IV_GLYPHS.find(([re]) => re.test(name));
    return hit ? hit[1] : "\u{25AB}";
}

function splitItem(item) {
    let text = item.trim();
    let state = "";

    const st = text.match(IV_STATE);
    if (st) { text = st[1].trim(); state = st[2].trim(); }

    let qty = "";
    const tail = text.match(IV_TAIL_QTY);
    if (tail) { text = tail[1].trim(); qty = tail[2]; }
    else {
        const lead = text.match(IV_LEAD_QTY);
        if (lead) { qty = lead[1]; text = lead[2].trim(); }
    }

    if (!text) return null;
    return { name: text, state, qty, equipped: IV_EQUIPPED.test(state) };
}

export function parseSheet(body, opts = {}) {
    const keep = Boolean(opts.keepPlaceholders);
    const fields = opts.fields;
    const template = keep || isUnfilledTemplate(body);
    const lines = String(body || "").split(/\r?\n/);
    const out = [];
    const prose = [];
    let found = 0;
    let inRules = false;

    // Unmatched lines are drawn together rather than one at a time, so a list
    // stays one list. Flushed before anything structural is pushed, so the
    // order the model wrote in is the order the pane shows.
    const flushProse = () => {
        if (!prose.length) return;
        out.push({ kind: "html", html: renderBody(prose.join("\n")) });
        prose.length = 0;
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        // The rules paragraph the template opens with, and any stray bracketed
        // instruction. Not the reader's data — and not a field placeholder
        // either, because those sit after a `Label:` rather than starting the
        // line, so the preview does not want these back.
        //
        // The paragraph is ONE bracket pair spread over several lines, so the
        // bullets inside it never look bracketed on their own and are tracked as
        // a region instead. Only the body's FIRST line can open that region: a
        // bracket further down is the reader's content, and a rule that guessed
        // from the words instead deleted their sentences wholesale — "she cares
        // about the boy", "he shares the room", "the plan changed" all carry the
        // letters the template's rules do.
        if (inRules) { if (/\]$/.test(line)) inRules = false; continue; }
        if (template && /^\[/.test(line) && /\]$/.test(line)) continue;
        if (!out.length && !prose.length && /^\[/.test(line) && !/\]$/.test(line)) { inRules = true; continue; }

        const lm = !line.includes("|") && line.match(LIST_LINE);
        if (lm) {
            const label = plain(lm[1]);
            const rest = plain(lm[2]);
            // In the preview a whole-field placeholder — `Skills: [Name rank,
            // comma separated]` — is split on its commas like any other list, so
            // the reader sees the chip shape rather than one long chip.
            const listSrc = keep ? rest.replace(PLACEHOLDER, "$1").trim() : rest;
            const items = listSrc.split(/\s*,\s*/).map(x => x.trim()).filter(Boolean)
                .filter(x => keep || !/^\[.*\]$/.test(x));

            // "nothing" / "none" is a real answer the template asks for, and a
            // row saying so beats an empty container.
            if (/^(nothing|none|empty|n\/?a)\.?$/i.test(rest)) {
                flushProse();
                out.push({ kind: "empty", label });
                found++;
                continue;
            }
            // Whether this is a list at all. The declared type answers it outright;
            // only an undeclared field falls back to counting commas, where one item
            // with no comma is more likely a `text` field than a list.
            const declared = declaredFieldType(fields, label);
            const isList = declared ? declared === "list" : items.length >= 2;
            if (isList && items.length) {
                flushProse();
                out.push({ kind: PACK_LABEL.test(label) ? "pack" : "chips", label, items, ph: keep && PLACEHOLDER.test(rest) });
                found++;
                continue;
            }
        }

        // Everything else goes through the existing stat renderer, so meters
        // and counted fields are drawn exactly as they are today.
        const stats = renderStatLine(line, inline);
        if (stats) { flushProse(); out.push({ kind: "html", html: stats }); found++; continue; }

        // What is left is ordinary markdown, and the shared renderer already
        // knows how to draw it. Writing a paragraph by hand here made the
        // treated pane worse at markdown than the fallback it replaced: bullet
        // lists arrived as paragraphs with the markers still in them, `---` as
        // the text `---`, and backticks as backticks.
        prose.push(line);
    }
    flushProse();

    // Nothing recognisable: let renderBody have it, unchanged.
    if (!found) return null;
    return out;
}

function renderChips(label, items, ph) {
    const chips = items.map(raw => {
        const s = splitSkill(raw);
        return `
            <span class="meg-sk-chip${s.tier ? ` meg-t-${s.tier}` : ""}">
                <span class="meg-sk-nm">${esc(s.name)}</span>
                ${s.rank ? `<span class="meg-sk-rk">${esc(s.rank)}</span>` : ""}
            </span>`;
    }).join("");
    return `
        <div class="meg-sheet-field${ph ? " meg-ws-ph" : ""}">
            <div class="meg-ws-sub">${esc(label)}</div>
            <div class="meg-sk-chips">${chips}</div>
        </div>`;
}

function renderPack(label, items, ph) {
    const parsed = items.map(splitItem).filter(Boolean);
    const held = parsed.filter(i => i.equipped);
    const carried = parsed.filter(i => !i.equipped);

    // No count written, no count printed. A "1" beside every unnumbered line
    // is a number the model never wrote, on a card whose whole job is to state
    // what it did.
    const line = i => `
        <div class="meg-iv-line">
            <span class="meg-iv-g">${glyphFor(i.name)}</span>
            <span class="meg-iv-n">${esc(i.name)}${
                i.state ? ` <small>${esc(i.state)}</small>` : ""}</span>
            ${i.qty ? `<span class="meg-iv-q">${esc(i.qty)}</span>` : ""}
        </div>`;

    // The equipped band is only drawn when something is actually equipped —
    // an empty "In hand" header above nothing is worse than no split at all.
    const bands = [];
    if (held.length) {
        bands.push(`
            <div class="meg-iv-band meg-iv-held">
                <div class="meg-iv-band-h">In hand &amp; worn</div>
                ${held.map(line).join("")}
            </div>`);
    }
    if (carried.length) {
        bands.push(`
            <div class="meg-iv-band">
                <div class="meg-iv-band-h">${held.length ? "Carried" : esc(label)}</div>
                ${carried.map(line).join("")}
            </div>`);
    }

    return `
        <div class="meg-sheet-field${ph ? " meg-ws-ph" : ""}">
            ${held.length ? `<div class="meg-ws-sub">${esc(label)}</div>` : ""}
            <div class="meg-iv-pack">${bands.join("")}</div>
        </div>`;
}

export function renderSheet(parts) {
    return parts.map(p => {
        if (p.kind === "html") return p.html;
        if (p.kind === "chips") return renderChips(p.label, p.items, p.ph);
        if (p.kind === "pack") return renderPack(p.label, p.items, p.ph);
        if (p.kind === "empty") {
            return `<div class="meg-sheet-field">
                <div class="meg-ws-sub">${esc(p.label)}</div>
                <div class="meg-iv-none">nothing</div>
            </div>`;
        }
        return "";
    }).join("");
}

// ═════════════════════════════════════════════════════════════════════════════
// DICE — the roll the model wrote before the scene
// ═════════════════════════════════════════════════════════════════════════════
//
// The line has a fixed shape because the add-on hands the model a skeleton:
//
//   🎲 lift the keys off the bar — d20+1 vs 15 → 7+1 = 8 · fail
//
// Every part after the attempt is numeric, so unlike the other treatments this
// one can check its own arithmetic. It does: a total that does not equal the
// roll plus the modifier is a line the model made up rather than worked out, and
// drawing it as a tidy readout would launder that. Those fall back to prose,
// where the reader can see the numbers disagree.

// Tolerant about the separators, strict about the numbers. The em dash between
// attempt and formula may arrive as a hyphen, and the arrow as "->".
const DICE_LINE = new RegExp(
    "^\\s*(?:\\u{1F3B2}\\s*)?" +          // the die, optional
    "(.*?)\\s*[\\u2014\\u2013-]\\s*" +    // attempt, then a dash
    "d\\s*20\\s*([+-]\\s*\\d+)?\\s*" +    // d20, optional modifier
    "vs\\.?\\s*(?:DC\\s*)?(\\d+)\\s*" +     // vs 15, or vs DC 15 - the model writes both
    "(?:\\u2192|->)\\s*" +                // arrow
    "(\\d+)\\s*(?:[+-]\\s*\\d+)?\\s*" +   // the raw roll, modifier repeated
    "(?:=\\s*(\\d+))?\\s*" +              // total, optional
    "(?:[\\u00B7|,]\\s*(.+?))?\\s*$",     // verdict, optional
    "u"
);

// Which of the five outcomes a verdict is, so the pill can be coloured without
// the model having to write a keyword we invented. Order matters: "success, at a
// cost" has to be tested before plain success.
function diceOutcome(verdict, roll, total, dc) {
    const v = String(verdict || "").toLowerCase();
    if (roll === 20) return "crit";
    if (roll === 1) return "critfail";
    if (/cost|complicat|but |however/.test(v)) return "cost";
    if (/fail|miss|no\b/.test(v)) return "fail";
    if (/succe|pass|works|yes\b/.test(v)) return "success";
    // No verdict written, or one in words we do not know: read it off the
    // numbers, which is the same rule the add-on gives the model.
    if (!Number.isFinite(total) || !Number.isFinite(dc)) return "";
    if (total >= dc) return "success";
    return total >= dc - 2 ? "cost" : "fail";
}

const DICE_LABELS = {
    success: "success",
    cost: "success, at a cost",
    fail: "fail",
    crit: "critical success",
    critfail: "critical fail"
};

// One roll line, or null when it is not one.
function parseDiceLine(line) {
    const m = String(line).match(DICE_LINE);
    if (!m) return null;

    const attempt = plain(m[1] || "");
    const mod = m[2] ? parseInt(m[2].replace(/\s+/g, ""), 10) : 0;
    const dc = parseInt(m[3], 10);
    const roll = parseInt(m[4], 10);
    const total = m[5] !== undefined ? parseInt(m[5], 10) : roll + mod;

    // A d20 is a d20. Anything outside it is not a roll this treatment can draw.
    if (!Number.isFinite(roll) || roll < 1 || roll > 20) return null;
    if (!Number.isFinite(dc) || dc < 1 || dc > 60) return null;
    if (!Number.isFinite(mod) || Math.abs(mod) > 20) return null;
    // The one check the other treatments cannot make: does the sum add up?
    if (total !== roll + mod) return null;

    const outcome = diceOutcome(m[6], roll, total, dc);
    if (!outcome) return null;

    // The model often writes the outcome and then what it cost — "fail, the
    // screen wakes at maximum brightness". The pill shows the outcome so the
    // five verdicts always read the same; the rest becomes a line of its own
    // rather than a pill three times the width of the card.
    const verdict = plain(m[6] || "") || DICE_LABELS[outcome];
    const label = DICE_LABELS[outcome];
    let note = "";
    if (verdict.toLowerCase() !== label.toLowerCase()) {
        const tail = verdict.replace(/^\s*(critical\s+)?(success|fail(?:ure)?|pass|miss)\b[\s,;:.—–-]*/i, "");
        note = tail.trim() && tail.trim().toLowerCase() !== "at a cost" ? tail.trim() : "";
    }

    return {
        attempt,
        roll, mod, dc, total, outcome,
        verdict, note, made: total >= dc
    };
}

// The block holds one roll per line. The player-only add-on almost always
// writes one; the everyone add-on writes one per character who tried something,
// so a turn can legitimately carry three or four.
//
// EVERY non-empty line has to parse or the whole block goes back to prose. A
// block that rendered two of four rolls would drop the other two off the screen
// entirely, because the block region is hidden from the message — the same
// reason the scene board refuses a body it could not place every line of.
export function parseDice(body) {
    const lines = String(body || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return null;

    const rolls = [];
    for (const line of lines) {
        const roll = parseDiceLine(line);
        if (!roll) return null;
        rolls.push(roll);
    }
    // More than a handful is the model looping, not a busy scene.
    if (rolls.length > 8) return null;
    return { rolls };
}

// The numbers the reel spins past before it lands.
//
// Derived from the roll rather than drawn at random, for two reasons: a renderer
// that calls Math.random is a renderer whose output cannot be tested, and the
// same roll re-rendered should look like the same roll. Stepping by 7 works
// because 7 and 20 share no factor, so the sequence cannot repeat itself or come
// back round to the real number inside five steps.
export function reelDecoys(roll, n = 5) {
    const out = [];
    let v = roll;
    for (let i = 0; i < n; i++) {
        v = ((v - 1 + 7) % 20) + 1;
        out.push(v);
    }
    return out;
}

// The die face. Animated, it is a strip of numbers behind a one-row window;
// at rest it is the number on its own.
//
// The strip's RESTING position already shows the last row, and the animation
// only supplies a `from`. So if the animation never runs — reduced motion, a
// stylesheet that failed to load, a browser that does not like the keyframes —
// what is on screen is still the number that was rolled. The motion is the
// decoration; the correct value is the default.
function diceFace(d, animate) {
    if (!animate) return `<span class="meg-dice-roll">${d.roll}</span>`;
    const decoys = reelDecoys(d.roll);
    return `
        <div class="meg-dice-reel">
            <div class="meg-dice-strip" style="--meg-decoys:${decoys.length}">
                ${decoys.map(v => `<span>${v}</span>`).join("")}
                <span>${d.roll}</span>
            </div>
        </div>`;
}

function renderOneDice(d, animate) {
    const sign = d.mod > 0 ? `+${d.mod}` : d.mod < 0 ? String(d.mod) : "";
    return `
        <div class="meg-dice meg-dice-${esc(d.outcome)}${animate ? " meg-dice-animate" : ""}">
            <div class="meg-dice-face">
                ${diceFace(d, animate)}
                <span class="meg-dice-die">d20</span>
            </div>
            <div class="meg-dice-body">
                ${d.attempt ? `<div class="meg-dice-attempt">${inline(d.attempt)}</div>` : ""}
                <div class="meg-dice-sum">
                    <span class="meg-dice-total">${d.total}</span>
                    ${sign ? `<span class="meg-dice-mod">${esc(d.roll + " " + sign)}</span>` : ""}
                    <span class="meg-dice-vs">vs</span>
                    <span class="meg-dice-dc">${d.dc}</span>
                </div>
                ${d.note ? `<div class="meg-dice-note">${inline(d.note)}</div>` : ""}
            </div>
            <span class="meg-dice-verdict">${esc(DICE_LABELS[d.outcome] || d.verdict)}</span>
        </div>`;
}

export function renderDice(parsed, opts = {}) {
    const animate = Boolean(opts.animate);
    return parsed.rolls.map(d => renderOneDice(d, animate)).join("");
}

// ═════════════════════════════════════════════════════════════════════════════
// The table render.js routes through
// ═════════════════════════════════════════════════════════════════════════════
//
// Keyed by block id. A block with no entry, or an entry whose parse returns
// null, is drawn by renderBody exactly as before — which is what makes adding
// one of these a safe change rather than a rewrite of the card.
export const BLOCK_TREATMENTS = {
    dice:    { parse: parseDice,       render: renderDice,       cls: "meg-dice-pane" },
    world:   { parse: parseWorldState, render: renderWorldState, cls: "meg-ws-pane" },
    chatter: { parse: parseChatter,    render: renderChatter,    cls: "meg-chat-pane" },
    sheet:   { parse: parseSheet,      render: renderSheet,      cls: "meg-sheet-pane" }
};
