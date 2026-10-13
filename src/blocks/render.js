/* eslint-disable no-undef */
/*
 * Megumin Suite — Master Block renderer
 *
 * SillyTavern's sanitizer strips unknown tags out of the rendered DOM but leaves
 * their text behind, and the raw text stays in message.mes. So there is no
 * <World_State> element to find and restyle: the blocks arrive on screen as
 * loose paragraphs at the end of the message, and the tags that named them are
 * already gone by the time anything here runs.
 *
 * This file therefore works from mes, not from the DOM. It reads the blocks out
 * of the raw text, hides the paragraphs the sanitizer left behind, and appends
 * one card built from what it parsed.
 *
 * Two rules everything here follows:
 *
 *   Never rewrite mes.       Stored text stays canonical, so swipes, edits,
 *                            regeneration and the summariser all keep seeing
 *                            exactly what the model wrote.
 *   Fail visible.            Anything unexpected and the message is left the way
 *                            SillyTavern rendered it. That is the behaviour from
 *                            before this file existed, so the worst outcome is
 *                            "no improvement" and never "lost content".
 */

import { esc, renderBody } from "./text.js";
import { BLOCK_TREATMENTS } from "./treatments.js";

const CARD_CLASS = "meg-blocks";
const HIDDEN_ATTR = "data-meg-blocks-hidden";
const STAMP_ATTR = "data-meg-blocks-stamp";

// The class the preset's "Blocks display marker" regex puts on the <details> it
// wraps the envelope in. See findMarkerNodes for why it exists and what happens
// when it is missing.
// SillyTavern's sanitizer does not pass class names through untouched: a class it
// does not recognise is rewritten with a "custom-" prefix, so the marker arrives
// in the DOM as "custom-meg-blocks-src". Both spellings are matched — the bare
// one in case that behaviour changes or the element reaches us unsanitized (the
// BLOCKS tab preview builds its DOM directly).
const MARKER_SELECTOR = ".meg-blocks-src, .custom-meg-blocks-src";

// The block that is open when a card is first drawn, and the one it falls back
// to when the reader closes whatever they opened. Everything else starts shut.
const ALWAYS_OPEN_ID = "cyoa";

// The one block whose body is acted on rather than read. Its lines become
// buttons instead of a numbered list — see parseChoices below.
const CHOICES_ID = "cyoa";

// -----------------------------------------------------------------------------
// Reading the blocks out of the raw message
// -----------------------------------------------------------------------------

// Every block in the message, in the order the model wrote them — which is not
// necessarily the order of the stack, and the reader should see what arrived.
//
// The envelope is not required and is never searched inside: a reply cut off
// before </Blocks> still gives up every block it managed to write. Same rule the
// parsers follow, for the same reason.
export function extractBlocks(mes, registry) {
    const out = [];
    if (typeof mes !== "string" || !mes) return out;

    (registry || []).forEach(def => {
        if (!def.tag) return;
        const re = new RegExp(`<${def.tag}\\b([^>]*)>([\\s\\S]*?)<\\/${def.tag}\\s*>`, "gi");
        let m;
        while ((m = re.exec(mes)) !== null) {
            const body = (m[2] || "").trim();
            if (!body) continue;
            out.push({
                def,
                at: m.index,
                raw: m[0],
                name: def.repeating ? readNameAttr(m[1]) : "",
                body,
                truncated: false
            });
            if (!def.repeating) break;
        }

        // Cut off mid-block: opening tag, no closing one. Take what arrived —
        // half a World State on screen beats none of it, and the message is
        // already visibly broken to the reader.
        if (!out.some(b => b.def === def)) {
            const cut = mes.match(new RegExp(`<${def.tag}\\b([^>]*)>([\\s\\S]*)$`, "i"));
            if (cut && cut[2].trim()) {
                out.push({
                    def,
                    at: cut.index,
                    raw: cut[0],
                    name: def.repeating ? readNameAttr(cut[1]) : "",
                    body: cut[2].trim(),
                    truncated: true
                });
            }
        }
    });

    return out.sort((a, b) => a.at - b.at);
}

function readNameAttr(attrChunk) {
    const m = String(attrChunk || "").match(/name\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!m) return "";
    return (m[1] ?? m[2] ?? m[3] ?? "").replace(/\*\*/g, "").trim();
}

// The text the sanitizer will have left on screen for the block region: every
// block body, plus the envelope's own stray text, with the tags taken out.
// Used only to measure how much of the message tail to hide.
function remnantTextOf(mes, blocks) {
    if (!blocks.length) return "";
    const first = Math.min(...blocks.map(b => b.at));
    // From the envelope opener if there is one before the first block, so the
    // stray text of a <Blocks> line is measured too.
    const envAt = mes.search(/<Blocks\b[^>]*>/i);
    const from = envAt > -1 && envAt < first ? envAt : first;
    // To the end of the LAST block, never to the end of the message. Anything the
    // model writes after the final block — a stray line, a sign-off — is not block
    // text, and counting it would come up short against what is actually hidden
    // and refuse the whole message.
    const to = Math.max(...blocks.map(b => b.at + b.raw.length));
    return mes.slice(from, to).replace(/<[^>]*>/g, " ");
}

// -----------------------------------------------------------------------------
// Choices
// -----------------------------------------------------------------------------
//
// The CYOA block is the only one the reader ACTS on, so it is the only one that
// does not go through renderBody. Its lines become buttons.
//
// Parsing is deliberately strict and deliberately reversible: anything that does
// not look like a clean list of numbered options returns null and the block
// falls back to the ordinary renderer. A model that wrote its choices as prose
// still reads fine, it just does not get buttons — which is the same failure
// rule the rest of this file follows.
const CHOICE_LINE = /^\s*(?:\d+[.)]|[-*•])\s+(.+?)\s*$/;

// A choice often arrives as `**Confront him** — walk over and say it to his
// face`: a short label and the detail behind it. Split them so the button can
// lead with the label, and leave the line whole when there is no such split.
function splitChoice(text) {
    const bold = text.match(/^\*\*(.+?)\*\*\s*[—–:-]?\s*(.*)$/);
    if (bold) return { label: bold[1].trim(), detail: bold[2].trim() };

    const dash = text.match(/^(.{3,48}?)\s+[—–]\s+(.+)$/);
    if (dash) return { label: dash[1].trim(), detail: dash[2].trim() };

    return { label: text.trim(), detail: "" };
}

// Every list line in the body, plus whatever prose came before the first one.
// Returns null unless the body is mostly the list — two options at minimum, and
// no more stray lines after the list than there are options.
export function parseChoices(body) {
    const lines = String(body || "").split(/\r?\n/);
    const intro = [];
    const choices = [];
    let strayAfter = 0;

    lines.forEach(raw => {
        const line = raw.trim();
        if (!line) return;
        const m = line.match(CHOICE_LINE);
        if (m) {
            const text = m[1].trim();
            // The template's own placeholder, left unfilled. It still becomes a
            // row — that is what makes the BLOCKS tab preview show the reader
            // the buttons they will actually get — but a dead one, because
            // clicking it would put "Short suggestion" in the input.
            const placeholder = /^\[.*\]$/.test(text);
            const c = splitChoice(placeholder ? text.slice(1, -1) : text);
            c.placeholder = placeholder;
            choices.push(c);
            return;
        }
        if (choices.length) strayAfter++;
        else intro.push(line);
    });

    if (choices.length < 2) return null;
    if (strayAfter > choices.length) return null;

    return { intro: intro.join("\n"), choices };
}

// The buttons. `opts.onChoice(text, { send })` is what makes them live — without
// it (the BLOCKS tab preview) they render exactly the same and do nothing, so
// the preview shows the reader what they will actually get.
function renderChoicesInto(pane, parsed, doc, opts) {
    pane.classList.add("meg-choices-pane");

    const onChoice = typeof opts.onChoice === "function" ? opts.onChoice : null;
    if (!onChoice) pane.classList.add("meg-choices-static");

    if (parsed.intro) {
        const lead = doc.createElement("div");
        lead.className = "meg-choices-intro";
        lead.innerHTML = renderBody(parsed.intro);
        pane.appendChild(lead);
    }

    const list = doc.createElement("div");
    list.className = "meg-choices";

    parsed.choices.forEach((c, i) => {
        // What gets sent is the whole option as the model wrote it, not the
        // label alone — the detail is the half that carries the intent.
        const full = c.detail ? `${c.label} — ${c.detail}` : c.label;

        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "meg-choice";
        btn.dataset.choice = full;
        if (c.placeholder) {
            btn.classList.add("meg-choice-placeholder");
            btn.disabled = true;
            btn.title = "The model left this option unfilled";
        } else {
            btn.title = onChoice ? `Click to put in the input · Shift-click to send` : full;
        }
        btn.innerHTML = `
            <span class="meg-choice-num">${i + 1}</span>
            <span class="meg-choice-body">
                <span class="meg-choice-label">${esc(c.label)}</span>
                ${c.detail ? `<span class="meg-choice-detail">${esc(c.detail)}</span>` : ""}
            </span>
            <span class="meg-choice-go"><i class="fa-solid fa-arrow-right"></i></span>
        `;
        if (onChoice && !c.placeholder) {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                e.preventDefault();
                onChoice(full, { send: e.shiftKey });
            });
        }
        list.appendChild(btn);
    });

    pane.appendChild(list);

    if (onChoice) {
        const hint = doc.createElement("div");
        hint.className = "meg-choices-hint";
        hint.textContent = "Click to fill the input · Shift-click to send straight away";
        pane.appendChild(hint);
    }
}

// A block drawn by its own treatment, or "" when there is not one or it
// declined the body. Every failure path here ends in the same place — the
// caller falls back to renderBody — so a treatment that throws costs the reader
// nothing but the nicety.
function renderTreated(b, opts) {
    const t = BLOCK_TREATMENTS[b.def.id];
    if (!t) return "";
    // A block cut off mid-write is exactly the case a structural parser gets
    // wrong most confidently, so truncated bodies always take the prose path.
    if (b.truncated) return "";
    try {
        // The BLOCKS tab preview is fed the TEMPLATES, so every value in it is
        // an unfilled `[placeholder]`. A treatment drops those in the chat, and
        // dropping them here would leave it nothing to draw — it would decline,
        // and the settings screen would show prose while the chat showed a card.
        // The block's declared fields, when the caller supplied them. A treatment
        // that gets them can read a field's type instead of inferring it from the
        // line; one that does not still works, on the old inference.
        const parsed = t.parse(b.body, {
            keepPlaceholders: Boolean(opts && opts.preview),
            fields: (opts && opts.statFields && opts.statFields[b.def.id]) || null
        });
        if (!parsed) return "";
        // Whether this block gets its arrival animation. The card cannot decide
        // that on its own — it is rebuilt on every edit, swipe and image insert,
        // so "is this the first time" is a question only the caller, which knows
        // the message index, can answer. No answer means no animation, which is
        // why the BLOCKS tab preview is still.
        const animate = typeof (opts && opts.shouldAnimate) === "function"
            ? Boolean(opts.shouldAnimate(b))
            : false;
        const html = t.render(parsed, { animate });
        return html && html.trim() ? html : "";
    } catch (e) {
        console.debug("[Megumin Suite] block treatment declined", b.def.id, e);
        return "";
    }
}

// One pane for one block. Three ways it can be drawn, in order of how specific
// they are.
//
// Choices are buttons and need handlers, so they are built as DOM. Everything
// else a treatment handles produces a string. Anything with no treatment — or
// whose treatment declined the body — is the plain markdown the card has
// always drawn.
// Truncated bodies are refused here for the same reason renderTreated refuses
// them, and one reason more: a cut-off block takes the rest of the reply as its
// body, and buttons are the one thing on this card the reader can send. Prose
// that arrived in the wrong place is a placement problem; a button carrying
// someone's secret is not.
//
// Shared by the chat card and by the side panel's block sections, so a block
// the card learns to draw, the panel draws the same way the same day.
export function buildBlockPane(b, doc, opts = {}) {
    const pane = doc.createElement("div");
    pane.className = "meg-block-body";
    pane.setAttribute("data-block-id", b.def.id);
    if (b.truncated) pane.classList.add("meg-block-truncated");
    const parsedChoices = b.def.id === CHOICES_ID && !b.truncated ? parseChoices(b.body) : null;
    if (parsedChoices) {
        renderChoicesInto(pane, parsedChoices, doc, opts);
    } else {
        const treated = renderTreated(b, opts);
        // The treatment's class goes on only when the treatment actually drew
        // something. Putting it on unconditionally would style a prose fallback
        // with the scene board's layout rules.
        if (treated) {
            const t = BLOCK_TREATMENTS[b.def.id];
            if (t && t.cls) pane.classList.add(t.cls);
            pane.innerHTML = treated;
        } else {
            pane.innerHTML = renderBody(b.body);
        }
    }
    return pane;
}

// One card for the whole set: a strip of tabs across the top, one panel below.
// Shared by the chat and by the preview in the BLOCKS tab — a preview rendered
// by different code from the chat is worse than no preview, because it is
// confidently wrong.
export function buildBlocksCard(blocks, opts = {}) {
    const doc = opts.document || document;
    // `omit` is what the side panel has taken over. A block the panel is showing
    // should not also be in the chat, and a block the panel is NOT showing has to
    // stay here or it would be nowhere at all.
    const omit = opts.omit || [];
    const shown = blocks.filter(b =>
        (b.def.visibility || "open") !== "hidden" && !omit.includes(b.def.id));

    const card = doc.createElement("div");
    card.className = CARD_CLASS;
    card.setAttribute("data-meg-blocks", "1");
    if (opts.preview) card.classList.add("meg-blocks-preview");
    if (!shown.length) {
        // Every block in this message is set to hidden. The remnants are hidden
        // from the chat too, so the reader simply sees nothing — which is what
        // "hidden" means.
        card.classList.add("meg-blocks-empty");
        return card;
    }

    // A repeating block appears once per dossier, so tab keys have to separate
    // them or two New NPCs would fight over one tab.
    const keyOf = b => b.def.repeating && b.name ? `${b.def.id}:${b.name}` : b.def.id;

    const tabs = doc.createElement("div");
    tabs.className = "meg-blocks-tabs";

    const panel = doc.createElement("div");
    panel.className = "meg-blocks-panel";

    const buttons = [];
    const panels = [];

    // The choices block is the one the reader acts on, so it is the one thing a
    // card shows without being asked. Everything else waits to be clicked.
    const resting = shown.find(b => b.def.id === ALWAYS_OPEN_ID);
    const restingKey = resting ? keyOf(resting) : null;

    // A null key means nothing is open: no tab lit, no panel drawn, just the
    // strip. That is the resting state for every card.
    let current = null;
    const select = key => {
        current = key;
        buttons.forEach(btn => btn.classList.toggle("active", key !== null && btn.dataset.key === key));
        panels.forEach(p => { p.style.display = key !== null && p.dataset.key === key ? "" : "none"; });
        card.classList.toggle("meg-blocks-shut", key === null);
    };

    shown.forEach(b => {
        const key = keyOf(b);
        const label = b.name ? `${b.def.label}: ${b.name}` : b.def.label;

        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "meg-blocks-tab";
        btn.dataset.key = key;
        btn.setAttribute("data-block-id", b.def.id);
        btn.title = label;
        // The narrow layout hides tab labels and shows the emoji alone, so the
        // accessible name has to come from somewhere that is not the text.
        btn.setAttribute("aria-label", label);
        // A repeating block shares one emoji across all of its tabs — every New
        // NPC is the same 🆕 — so its NAME is the only thing telling two of them
        // apart. Marked here so the narrow layout can keep the label on these
        // and drop it everywhere else.
        if (b.name) btn.classList.add("meg-blocks-tab-named");
        btn.innerHTML = `
            <span class="meg-blocks-tab-emoji">${b.def.emoji || ""}</span>
            <span class="meg-blocks-tab-label">${esc(b.name || b.def.label)}</span>
            ${b.truncated ? `<span class="meg-block-flag" title="The reply was cut off before this block finished">cut</span>` : ""}
        `;
        // Clicking the open tab shuts it again, back to whatever the resting
        // state is — which is the CYOA block when there is one, nothing when
        // there is not.
        btn.addEventListener("click", e => {
            e.stopPropagation();
            select(current === key ? restingKey : key);
        });
        tabs.appendChild(btn);
        buttons.push(btn);

        const pane = buildBlockPane(b, doc, opts);
        pane.dataset.key = key;
        panel.appendChild(pane);
        panels.push(pane);
    });

    // Collapse control sits at the end of the strip, where the drawing put it.
    const chev = doc.createElement("button");
    chev.type = "button";
    chev.className = "meg-blocks-collapse";
    chev.title = "Fold";
    chev.innerHTML = `<i class="fa-solid fa-chevron-down"></i>`;
    chev.addEventListener("click", e => {
        e.stopPropagation();
        // Shuts everything, the resting block included.
        select(current === null ? restingKey : null);
    });
    tabs.appendChild(chev);

    card.appendChild(tabs);
    card.appendChild(panel);

    // The preview has no reason to start shut — a preview showing nothing is not
    // a preview — so it opens the first tab when there is no resting block.
    const initial = opts.startCollapsed
        ? null
        : (restingKey || (opts.expanded && shown.length ? keyOf(shown[0]) : null));
    select(initial);

    return card;
}

// -----------------------------------------------------------------------------
// Putting it in the message
// -----------------------------------------------------------------------------

// Letters and digits only. Markdown syntax is gone from the rendered text but
// still present in mes, so comparing anything else would never line up.
function norm(s) {
    return String(s || "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

// Ordered-list markers, taken off both sides before they are compared.
//
// THIS IS WHY THE CYOA BLOCK USED TO KILL THE WHOLE CARD. Its template is a
// markdown numbered list, so the renderer turns it into <ol><li> and the numbers
// become CSS list markers — which are NOT in textContent. mes says
// "1. Call her", the DOM says "Call her", norm keeps the digit on one side and
// not the other, and the safety probe below concluded the tail was not the
// blocks and refused to decorate the message at all. Every other block happened
// to start with prose, so the fault only ever showed when CYOA sorted first.
//
// Stripped from BOTH sides rather than added to one, because whether a list is
// rendered as a list at all depends on the markdown parser and where the block
// sits. Take the markers off each side and the two agree either way.
//
// Only the ordered form matters: norm already deletes "-", "*" and "+".
function stripListMarkers(s) {
    return String(s || "").replace(/^[ 	]*(?:\d+[.)]|[-*+•])[ 	]+/gm, "");
}

// The comparison form: markers off, then letters and digits only.
function normBody(s) {
    return norm(stripListMarkers(s));
}

// Nodes at the tail of a message that are not block remnants and must be stepped
// over rather than hidden: our own card and inline images.
//
// The CYOA box used to be listed here too, matched on the inline border style its
// old template carried. That dates from when CYOA sat outside the envelope. It is
// a block like any other now, so its remnant has to be CONSUMED — stepping over
// it left the options visible in the chat and repeated inside the card, and threw
// the length accounting off for everything after it.
function isSteppable(node) {
    if (node.nodeType === 3) return !node.textContent.trim();
    if (node.nodeType !== 1) return true;
    if (node.classList && node.classList.contains(CARD_CLASS)) return true;
    // HR is deliberately NOT here. The World State template separates its
    // sections with `---`, which renders as a rule, and skipping those left a
    // stray line floating above the card with nothing under it. They carry no
    // text, so consuming them costs the length accounting nothing.
    if (node.tagName === "IMG" || node.tagName === "BR") return true;
    if (node.querySelector && node.querySelector("img")) return true;
    if (node.classList && node.classList.contains("kazuma-img-placeholder")) return true;
    return false;
}

// Takes one node out of the visible message without removing it, so
// clearBlocksFromMessage can put it back exactly as it was.
function hideNode(n, doc) {
    if (n.nodeType === 3) {
        // A bare text node cannot carry an attribute, so it gets a span that can.
        const span = doc.createElement("span");
        span.setAttribute(HIDDEN_ATTR, "1");
        span.style.display = "none";
        n.parentNode.insertBefore(span, n);
        span.appendChild(n);
        return;
    }
    n.setAttribute(HIDDEN_ATTR, "1");
    n.style.display = "none";
}

// The node carrying a LEAD block — one the model wrote before the prose rather
// than in the envelope at the end. Returns it, or null when it cannot be found
// cleanly.
//
// The tail walk below cannot be reused for this. It works by consuming from the
// end until it has accounted for the block text, which only makes sense because
// the envelope is a suffix. A lead block is a prefix with the whole reply behind
// it, so this searches forward from the top instead, over the first few nodes.
//
// It refuses a node holding MORE than the block. The model writes the roll on
// its own line, but markdown joins a line to the paragraph under it when there
// is no blank line between them, and hiding that node would take the opening
// paragraph of the scene with it. Refusing costs the reader a tab; accepting
// would cost them the prose.
function findLeadNodes(root, want) {
    if (!want) return null;

    const taken = [];
    let acc = "";
    let node = root.firstChild;
    let guard = 0;

    // Forward walk, mirroring the backward one the envelope uses. Several nodes
    // because the artifact is not reliably one: three rolls may arrive as one
    // paragraph, as three, or as one with the first line of prose stuck to it,
    // depending on where the model put its blank lines.
    while (node && acc.length < want.length && guard++ < 12) {
        if (isSteppable(node)) { node = node.nextSibling; continue; }
        const have = normBody(node.textContent);
        if (!have) { node = node.nextSibling; continue; }

        const next = acc + have;
        // Whatever is at the top either IS the block or the block was not
        // written where it was asked for. Scanning past prose to find it would
        // let a roll mentioned mid-scene be treated as the leading one.
        if (!want.startsWith(next) && !next.startsWith(want)) return null;

        taken.push(node);
        acc = next;
        node = node.nextSibling;
    }

    if (!taken.length || !acc.startsWith(want)) return null;
    // The last node may carry prose glued to the end of the artifact. Hiding it
    // would take the opening of the scene with it, so refuse instead: the cost
    // is a tab, not a paragraph.
    return acc.length <= want.length * 1.15 + 10 ? taken : null;
}

// The element the block region actually lives in, when there is one.
//
// SillyTavern's sanitizer deletes <Blocks> and keeps its text, which is why
// everything else in this file has to work backwards from mes and guess which
// paragraphs on screen are the remnant. The guess is only sound while the DOM is
// a faithful render of mes, and three separate things break that: display-side
// regex scripts rewrite the text before markdown sees it, markdown merges or
// wraps paragraphs, and another extension can inject a subtree whose text is in
// no version of mes at all. MVU is the third case — its stats panel sits at the
// end of the message, the backward walk consumes it first, the safety probe
// rightly refuses, and the card is dropped.
//
// So the preset carries a display-only regex that rewrites the envelope into a
// <details class="meg-blocks-src">. <details> survives the sanitizer. When it is
// there, the region is known rather than inferred and none of the walking below
// runs.
//
// It is a fast path, never a requirement: a reader on a different preset, or one
// who deleted the script, has no marker and falls through to the walk exactly as
// before. Nothing here may assume the marker exists.
//
// Our own card is excluded because it is appended into the same body and a
// future card could legitimately contain the class; hiding it would hide the
// thing we just drew.
function findMarkerNodes(root) {
    if (!root || typeof root.querySelectorAll !== "function") return [];
    return Array.from(root.querySelectorAll(MARKER_SELECTOR))
        .filter(el => typeof el.closest !== "function" || !el.closest(`.${CARD_CLASS}`));
}

export function clearBlocksFromMessage(root) {
    if (!root) return;
    root.querySelectorAll(`.${CARD_CLASS}`).forEach(el => el.remove());
    root.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach(el => {
        el.removeAttribute(HIDDEN_ATTR);
        el.style.display = "";
    });
    root.removeAttribute(STAMP_ATTR);
}

// Hides the paragraphs the sanitizer left behind and appends the card.
// Returns true when the message was decorated, false when it was left alone.
export function applyBlocksToMessage(root, mes, registry, opts = {}) {
    if (!root || typeof mes !== "string") return false;

    const blocks = extractBlocks(mes, registry);
    if (!blocks.length) {
        clearBlocksFromMessage(root);
        return false;
    }

    // Same text AND same settings: skip the work and, more importantly, never
    // react to our own DOM writes. Something else rebuilding the body wipes the
    // stamp with it, so the next pass rebuilds rather than skipping.
    //
    // What is omitted has to be part of this. Turning the side panel on does not
    // change a single character of the message, so a stamp made of the text alone
    // still matched and every card was left exactly as it was — the blocks only
    // moved out of the chat after something else forced a re-render, which is why
    // it took a chat reload.
    const stamp = `${mes.length}:${norm(mes).length}:${blocks.length}:${(opts.omit || []).join(",")}`;
    if (root.getAttribute(STAMP_ATTR) === stamp && root.querySelector(`.${CARD_CLASS}`)) return true;

    // Start from whatever SillyTavern rendered, every time. Re-hiding on top of a
    // previous pass would creep further up the message on each call.
    clearBlocksFromMessage(root);

    const doc = opts.document || document;

    // A lead block is written before the prose and the envelope is written after
    // it, so the two are found in completely different ways and the tail
    // measurement must not include the lead. Measuring across both would span
    // the whole reply — every paragraph between the roll and the envelope would
    // count as block text, the walk would consume the entire message, and the
    // guard below would rightly refuse the lot.
    const leadBlocks = blocks.filter(b => b.def.lead);
    const tailBlocks = blocks.filter(b => !b.def.lead);

    // Lead blocks whose node was found, and which can therefore be hidden from
    // the prose and shown in the card instead. One that cannot be found is
    // dropped from the card entirely: the reader keeps the raw line where the
    // model put it, which is what they would have had anyway, and it is not also
    // repeated inside a tab.
    // Several <Dice> tags in a row are one readout, not one per tab. Merged
    // before anything looks for them so the search matches the text actually in
    // the DOM, where the tags are already gone and only the lines remain.
    const leadMerged = [];
    leadBlocks.forEach(b => {
        const last = leadMerged[leadMerged.length - 1];
        if (last && last.def === b.def) {
            last.body = `${last.body}\n${b.body}`;
            last.truncated = last.truncated || b.truncated;
            return;
        }
        leadMerged.push({ ...b });
    });

    const leadFound = [];
    const leadNodes = [];
    leadMerged.forEach(b => {
        const nodes = findLeadNodes(root, normBody(b.body));
        if (!nodes) return;
        leadFound.push(b);
        leadNodes.push(...nodes);
    });

    // The marker path. The region is an element, so it is hidden outright and
    // there is nothing to measure, nothing to consume and nothing to refuse.
    //
    // The lead blocks are still found the old way: they are written before the
    // prose and sit outside the envelope, so the regex never wrapped them.
    const markerNodes = tailBlocks.length ? findMarkerNodes(root) : [];
    if (opts.debug) {
        console.debug("[Megumin Blocks] lead=%d tail=%d markers=%d",
            leadBlocks.length, tailBlocks.length, markerNodes.length);
    }
    if (markerNodes.length) {
        markerNodes.forEach(n => hideNode(n, doc));
        leadNodes.forEach(n => hideNode(n, doc));
        root.appendChild(buildBlocksCard([...leadFound, ...tailBlocks], opts));
        root.setAttribute(STAMP_ATTR, stamp);
        return true;
    }

    const target = normBody(remnantTextOf(mes, tailBlocks));

    // Nothing but a lead block this turn — a roll on a reply that carried no
    // envelope. There is no tail to consume, so the walk below is skipped
    // entirely rather than run against an empty target.
    if (!tailBlocks.length) {
        if (!leadFound.length) { clearBlocksFromMessage(root); return false; }
        leadNodes.forEach(n => hideNode(n, doc));
        root.appendChild(buildBlocksCard(leadFound, opts));
        root.setAttribute(STAMP_ATTR, stamp);
        return true;
    }

    if (!target) return false;

    // Walk the tail backwards collecting nodes until they account for the block
    // text. The blocks are a suffix of the reply, which is what makes this
    // tractable at all — no searching, just consuming from the end.
    const consumed = [];
    let acc = 0;
    let node = root.lastChild;
    let guard = 0;

    while (node && acc < target.length && guard++ < 400) {
        if (isSteppable(node)) { node = node.previousSibling; continue; }
        const len = normBody(node.textContent).length;
        if (len) { consumed.push(node); acc += len; }
        else if (node.nodeType === 1) consumed.push(node);
        node = node.previousSibling;
    }

    // Two ways the tail can turn out not to be the blocks, and both end the same
    // way: leave the message exactly as SillyTavern drew it rather than hide
    // narrative somebody wrote a scene for.
    //
    // Over-consuming is the obvious one. Under-consuming is the dangerous one and
    // it is invisible to a length check alone — a message whose body no longer
    // matches mes at all (an edit that has not been saved back, another extension
    // rewriting the body) runs out of nodes early, and every node it did take
    // gets hidden. So the consumed text is compared against the block text
    // directly: they start at the same place or this does nothing.
    // Joined with newlines, not concatenated, so stripListMarkers can still see
    // where each node's first line begins.
    const consumedNorm = normBody(consumed.slice().reverse().map(n => n.textContent).join("\n"));
    const probe = Math.min(60, Math.max(12, Math.floor(target.length * 0.5)));
    const looksRight = consumedNorm.slice(0, probe) === target.slice(0, probe);

    if (!consumed.length || !looksRight || acc > target.length * 1.6 + 80) {
        clearBlocksFromMessage(root);
        return false;
    }

    consumed.forEach(n => hideNode(n, doc));
    leadNodes.forEach(n => hideNode(n, doc));

    // Card order is message order, which puts the roll first — it is the first
    // thing the model wrote and the first thing that happened.
    const shown = [...leadFound, ...tailBlocks];
    root.appendChild(buildBlocksCard(shown, opts));
    root.setAttribute(STAMP_ATTR, stamp);
    return true;
}
