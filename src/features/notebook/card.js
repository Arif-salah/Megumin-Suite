// ────────────────────────────────────────────────────────────────────────────
// The notebook's tab in a reply's card (plan 010).
//
// The tab shows what THIS reply did to the notebook (the truths it wrote, the
// clues, who learned what, what came out), drawn from the store, behind a
// blur. Clicking asks first, because reading it spoils what the story is
// building toward; only "Show it" takes the blur off. A card redraw (a swipe,
// an image landing) keeps a pane the reader already opened open.
// ────────────────────────────────────────────────────────────────────────────

import { Popup, POPUP_TYPE } from "../../st.js";
import { notebookCardInfo, notebookSetEntryDisabled, notebookTurnLabel } from "../../state/index.js";
import { describeNotebookChange } from "../../state/modules/notebook/render.js";

// Drawn by the card renderer like any block, so the raw text is hidden from the
// chat and the tab appears. Not in the block stack: the notebook has its own tab.
export const NOTEBOOK_CARD_DEFS = [
    { id: "notebook", tag: "Notebook", label: "Notebook", emoji: "📓", visibility: "open" },
    { id: "notebookUpdate", tag: "Notebook_Update", label: "Notebook", emoji: "📓", visibility: "open" }
];

/** What the pane is drawn from, for the card's redraw stamp. */
export function notebookCardStamp(msgIndex) {
    try {
        const info = notebookCardInfo(msgIndex);
        return info ? JSON.stringify([info.entry && info.entry.id, info.disabled, info.applied, info.notes, info.pending, info.missing, info.canRead]) : "";
    } catch (e) { return ""; }
}

// Panes the reader chose to see, by journal entry (or message) so a redraw keeps them open.
const revealed = new Set();

const esc = v => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// What each change looks like on the card: an icon, a colour, the words.
const CHANGE_LOOK = {
    clue:    { icon: "fa-magnifying-glass", tone: "clue",  word: "Clue planted" },
    learned: { icon: "fa-user-check",       tone: "learn", word: "Found out" },
    out:     { icon: "fa-flag-checkered",   tone: "out",   word: "Came out" },
    edit:    { icon: "fa-pen",              tone: "muted", word: "Edited" },
    forget:  { icon: "fa-trash",            tone: "muted", word: "Deleted" },
    restore: { icon: "fa-rotate-left",      tone: "muted", word: "Active again" }
};

const note = text => `<div class="meg-nbc-note">${esc(text)}</div>`;

// A truth the reply wrote: the truth itself as a quote, then what it hangs on.
function truthHtml(t, label) {
    const rows = [];
    if (t.hiddenFrom.length) rows.push(`<div class="meg-nbc-row"><span class="meg-nbc-k">Hidden from</span><span class="meg-nbc-names">${t.hiddenFrom.map(n => `<span>${esc(n)}</span>`).join("")}</span></div>`);
    if (t.when) rows.push(`<div class="meg-nbc-row"><span class="meg-nbc-k">Comes out when</span><span>${esc(t.when)}</span></div>`);
    if (t.changes) rows.push(`<div class="meg-nbc-row"><span class="meg-nbc-k">What it changes</span><span>${esc(t.changes)}</span></div>`);
    if (t.clueIdeas) rows.push(`<div class="meg-nbc-row"><span class="meg-nbc-k">Clue ideas</span><span>${esc(t.clueIdeas)}</span></div>`);
    const clues = t.clues.map(c => `<li><span class="meg-nbc-turn">${esc(label(c.seq))}</span> ${esc(c.text)}${c.found === false ? ` <span class="meg-nbc-flag"><i class="fa-solid fa-triangle-exclamation"></i> not found in the reply</span>` : ""}</li>`).join("");
    return `
        <div class="meg-nbc-truth">
            <div class="meg-nbc-truth-head"><span class="meg-nbc-id">${esc(t.id)}</span> New hidden truth</div>
            <div class="meg-nbc-quote">${esc(t.truth)}</div>
            ${rows.length ? `<div class="meg-nbc-rows">${rows.join("")}</div>` : ""}
            ${clues ? `<ul class="meg-nbc-clues">${clues}</ul>` : ""}
        </div>`;
}

function changeHtml(a) {
    const look = CHANGE_LOOK[a.op];
    if (!look) {
        const line = describeNotebookChange(a);
        return line ? `<div class="meg-nbc-event muted"><span class="meg-nbc-text">${esc(line)}</span></div>` : "";
    }
    // "learned" carries who found out; the others carry the clue or what came out.
    return `
        <div class="meg-nbc-event ${look.tone}">
            <i class="fa-solid ${look.icon}"></i>
            <span class="meg-nbc-id">${esc(a.id)}</span>
            <span class="meg-nbc-word">${look.word}</span>
            ${a.text ? `<span class="meg-nbc-text">${esc(a.text)}</span>` : ""}
            ${a.found === false ? `<span class="meg-nbc-flag"><i class="fa-solid fa-triangle-exclamation"></i> not found in the reply</span>` : ""}
        </div>`;
}

function contentFor(info, fallbackHtml) {
    if (!info) return fallbackHtml;
    if (info.disabled) return note("This reply's notebook changes are reverted.");
    if (info.pending) return note("Chomusuke is reading this reply for the notebook…");
    const label = notebookTurnLabel();
    const truths = [];
    const events = [];
    for (const a of info.applied) {
        if (a.op === "entry" && info.truths[a.id]) truths.push(truthHtml(info.truths[a.id], label));
        else { const h = changeHtml(a); if (h) events.push(h); }
    }
    const extra = [
        ...info.notes.map(n => note(`Left out: ${n}`)),
        ...(info.missing ? [note("Chomusuke's read gave nothing usable. Use Read again.")] : [])
    ];
    if (!truths.length && !events.length && !extra.length) {
        return info.read ? note("Nothing changed in the notebook in this reply.") : fallbackHtml;
    }
    return `
        <div class="meg-nbc">
            ${truths.join("")}
            ${events.length ? `<div class="meg-nbc-events">${events.join("")}</div>` : ""}
            ${extra.join("")}
        </div>`;
}

/**
 * @param {HTMLElement} pane  the notebook pane of one message's card
 * @param {number} msgIndex
 * @param {{ onChanged?: () => void, onReread?: () => void }} [hooks]
 */
export function notebookDecoratePane(pane, msgIndex, hooks = {}) {
    if (!pane || pane.dataset.megNotebook === "1") return;
    pane.dataset.megNotebook = "1";
    let info = null;
    try { info = notebookCardInfo(msgIndex); } catch (e) { console.warn("[Megumin Suite] Notebook card:", e); }
    const key = info?.entry?.id || `msg:${msgIndex}`;
    // Nothing to spoil while Chomusuke is still reading.
    const shown = revealed.has(key) || Boolean(info && info.pending);

    const wrap = document.createElement("div");
    wrap.className = `meg-nb-spoiler${shown ? "" : " is-hidden"}`;
    const content = document.createElement("div");
    content.className = "meg-nb-content";
    content.innerHTML = contentFor(info, pane.innerHTML);
    wrap.appendChild(content);

    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.className = "meg-nb-reveal";
    reveal.innerHTML = `<i class="fa-solid fa-eye"></i> Show what the story is hiding`;
    wrap.appendChild(reveal);

    const actions = document.createElement("div");
    actions.className = "meg-nb-actions";
    const hide = document.createElement("button");
    hide.type = "button";
    hide.className = "menu_button";
    hide.innerHTML = `<i class="fa-solid fa-eye-slash"></i> Hide`;
    hide.style.display = shown && !info?.pending ? "" : "none";
    hide.addEventListener("click", e => {
        e.stopPropagation();
        revealed.delete(key);
        wrap.classList.add("is-hidden");
        hide.style.display = "none";
    });
    actions.appendChild(hide);
    if (info?.entry) {
        const undo = document.createElement("button");
        undo.type = "button";
        undo.className = "menu_button";
        undo.title = info.disabled ? "Count this reply's notebook changes again" : "Undo what this reply did to the notebook";
        undo.innerHTML = `<i class="fa-solid ${info.disabled ? "fa-rotate-right" : "fa-rotate-left"}"></i> ${info.disabled ? "Restore" : "Revert"}`;
        undo.addEventListener("click", e => {
            e.stopPropagation();
            notebookSetEntryDisabled(info.entry.id, !info.disabled);
            if (hooks.onChanged) hooks.onChanged();
        });
        actions.appendChild(undo);
    }
    // Chomusuke writes this reply's notebook lines: read it again.
    if (info && (info.canRead || info.pending) && hooks.onReread) {
        const again = document.createElement("button");
        again.type = "button";
        again.className = "menu_button";
        again.disabled = Boolean(info.pending);
        again.title = "Chomusuke reads this reply again for clues, who found out, and what came out";
        again.innerHTML = info.pending ? `<i class="fa-solid fa-spinner fa-spin"></i> Reading…` : `<i class="fa-solid fa-rotate"></i> Read again`;
        again.addEventListener("click", e => {
            e.stopPropagation();
            hooks.onReread();
        });
        actions.appendChild(again);
    }

    reveal.addEventListener("click", async e => {
        e.stopPropagation();
        const popup = new Popup(
            "<h3>Show the notebook?</h3><p>This shows what the story is hiding. Reading it spoils the truths it is building toward.</p>",
            POPUP_TYPE.CONFIRM, "", { okButton: "Show it", cancelButton: "Keep it hidden" }
        );
        if (!(await popup.show())) return;
        revealed.add(key);
        wrap.classList.remove("is-hidden");
        hide.style.display = "";
    });

    pane.innerHTML = "";
    pane.appendChild(wrap);
    pane.appendChild(actions);
}
