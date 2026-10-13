// ────────────────────────────────────────────────────────────────────────────
// Drawing the master block card into chat messages.
//
// The chat side of blocks, kept apart from the Blocks TAB: the tab's preview
// renders through the dict builder, which sits at the top of the dependency
// graph, while this only needs the registry. Splitting there lets image gen
// ask for a redraw without pulling the settings UI in behind it.
// ────────────────────────────────────────────────────────────────────────────

import { getContext } from "../../st.js";
import { extensionName } from "../../core/constants.js";
import { applyBlocksToMessage, clearBlocksFromMessage } from "../../blocks/render.js";
import { meguminRenderRegistry, meguminBlocksTakenByPanel, meguminStatFieldMap } from "./registry.js";
// One directed edge from the blocks feature to the NPC feature. No cycle:
// nothing under features/npc/ imports the block card.
import { npcDecorateUpdatePane } from "../npc/updateCard.js";

// ── Clicking a choice ────────────────────────────────────────────────────────
//
// The card renderer knows nothing about SillyTavern — it is handed a callback
// and calls it. This is that callback, and it lives here because this is the
// chat side, which is the only surface where a choice means anything. The
// BLOCKS tab preview passes no callback, so its buttons are inert by
// construction rather than by a flag someone has to remember to set.
//
// Plain click FILLS the input rather than sending. A choice is a suggestion,
// and the reader almost always wants to add to it — "3. Follow her out" becomes
// "Follow her out, but hang back at the door". Shift sends as-is for the times
// they do not.
export function meguminApplyChoice(text, { send = false } = {}) {
    const ta = document.getElementById("send_textarea");
    if (!ta) return;

    // Appended, not replaced. Something half-typed in the box is the reader's
    // work and must not be thrown away by a click.
    const existing = String(ta.value || "").replace(/\s+$/, "");
    ta.value = existing ? `${existing} ${text}` : text;

    // SillyTavern's auto-resize and its send-button state both hang off input.
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
    try { ta.selectionStart = ta.selectionEnd = ta.value.length; } catch (e) { /* not fatal */ }

    if (!send) return;

    // SillyTavern reads a leading slash as a command, so a choice that starts
    // with one is not a suggestion to the story, it is an instruction to the
    // app — and shift is one key away from an ordinary click. The text still
    // goes in the box, where the reader can see it and decide; what it will not
    // do is send itself. Tested on the composed message rather than on the
    // choice, because a slash only commands when it leads the line.
    if (/^\s*\//.test(ta.value)) {
        console.debug(`[${extensionName}] choice not sent: the message would lead with a slash command`);
        return;
    }

    // #send_but is the paper plane; #send_but_sheld is the holder around it and
    // is what the rest of this extension clicks. Either one starts a generation,
    // so try the specific one first and fall back.
    const btn = document.getElementById("send_but") || document.getElementById("send_but_sheld");
    if (btn) btn.click();
}

// ── Playing a roll's arrival animation exactly once ──────────────────────────
//
// The dice reel is the first thing on this card that is not idempotent: drawing
// it twice is visibly different from drawing it once. And the card is rebuilt
// constantly — an edit, a swipe, an image landing, another extension redrawing
// the body; there are a dozen paths in. Left alone, the die would re-roll in
// front of the reader every time any of them fired, which reads as a bug and
// quietly contradicts the one thing the feature promises, that the number is
// fixed once written.
//
// So a roll animates when both are true: it is in the newest message, and it has
// not been played before. Everything else draws the resting state, which is the
// same markup minus one class.
const meguminPlayedRolls = new Set();

// Keyed on the message AND the text of the roll, not on the message alone: a
// swipe replaces the reply at the same index with a different roll, and that one
// has genuinely not been seen yet.
function meguminRollKey(msgIndex, block) {
    return `${msgIndex}:${String(block.body || "").slice(0, 120)}`;
}

// A chat long enough to overflow this has scrolled past every one of these
// messages anyway, so forgetting the oldest costs at most one replay.
function meguminRememberRoll(key) {
    if (meguminPlayedRolls.size > 400) meguminPlayedRolls.clear();
    meguminPlayedRolls.add(key);
}

function meguminIsNewestMessage(msgIndex) {
    try {
        const ctx = typeof getContext === "function" ? getContext() : null;
        return Boolean(ctx && Array.isArray(ctx.chat) && msgIndex === ctx.chat.length - 1);
    } catch (e) {
        // No context means no way to tell, and the safe answer to "should this
        // move" is always no.
        return false;
    }
}

// Returns the predicate the renderer calls, or null when nothing should animate
// — an unknown message index, or any message that is not the newest. Without
// the second half, opening a chat would set every roll in the history spinning
// at once, because every one of them is being drawn for the first time.
function meguminAnimateGate(msgIndex) {
    if (typeof msgIndex !== "number" || !meguminIsNewestMessage(msgIndex)) return null;
    return block => {
        const key = meguminRollKey(msgIndex, block);
        if (meguminPlayedRolls.has(key)) return false;
        meguminRememberRoll(key);
        return true;
    };
}

// One message body, decorated or put back the way SillyTavern drew it.
//
// `msgIndex` is optional and only used to redraw the NPC Update tab from the
// changelog instead of from the model's raw text — see npcDecorateUpdatePane.
// A caller that does not know the index still gets a correct card, just without
// the undo buttons on that one tab.
export function meguminDecorateMessageBody(bodyEl, mesText, msgIndex) {
    try {
        applyBlocksToMessage(bodyEl, mesText, meguminRenderRegistry(), {
            omit: meguminBlocksTakenByPanel(),
            onChoice: meguminApplyChoice,
            shouldAnimate: meguminAnimateGate(msgIndex),
            statFields: meguminStatFieldMap(),
            debug: Boolean(window.MEGUMIN_BLOCKS_DEBUG)
        });
        if (typeof msgIndex === "number") {
            // The card renderer stays generic — it knows nothing about NPCs. The
            // pane it produced is found by the block id and handed to the NPC
            // feature to fill in.
            const pane = bodyEl.querySelector('.meg-block-body[data-block-id="npcUpdate"]');
            if (pane) npcDecorateUpdatePane(pane, msgIndex);
        }
    } catch (e) {
        // Fail visible: the reader keeps the raw block text, which is exactly
        // what they had before this existed.
        try { clearBlocksFromMessage(bodyEl); } catch (e2) { /* nothing left to do */ }
        console.debug(`[${extensionName}] block renderer skipped a message`, e);
    }
}

// Every rendered message in the chat, matched back to its raw text by mesid.
// The DOM is only ever the place the card goes — what gets rendered is read from
// chat[i].mes, because the tags this all keys on are gone from the DOM.
export function meguminRefreshBlocksInChat() {
    let ctx = null;
    try { ctx = typeof getContext === "function" ? getContext() : null; } catch (e) { return; }
    const chat = ctx && ctx.chat;
    if (!Array.isArray(chat)) return;

    document.querySelectorAll("#chat .mes").forEach(mesEl => {
        const idx = parseInt(mesEl.getAttribute("mesid"), 10);
        if (Number.isNaN(idx) || !chat[idx]) return;
        const msg = chat[idx];
        if (msg.is_user || msg.is_system) return;

        const bodyEl = mesEl.querySelector(".mes_text");
        if (!bodyEl) return;
        // A message being edited has SillyTavern's textarea parked in its body.
        // Decorating that would fight the editor and could eat the edit.
        if (bodyEl.querySelector("textarea")) { clearBlocksFromMessage(bodyEl); return; }

        meguminDecorateMessageBody(bodyEl, msg.mes, idx);
    });
}

export let meguminBlocksRefreshTimer = null;
// Several things rebuild .mes_text — image generation through updateMessageBlock,
// SillyTavern on edit and swipe, other extensions on their own timers. Every one
// of them drops the card and the hiding with it, so every path that can rebuild
// a body funnels through here, and the coalescing keeps a burst of them to one
// pass rather than one pass each.
export function meguminScheduleBlocksRefresh(delay = 60) {
    if (meguminBlocksRefreshTimer) clearTimeout(meguminBlocksRefreshTimer);
    meguminBlocksRefreshTimer = setTimeout(() => {
        meguminBlocksRefreshTimer = null;
        meguminRefreshBlocksInChat();
    }, delay);
}
