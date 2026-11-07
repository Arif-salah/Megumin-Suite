// ────────────────────────────────────────────────────────────────────────────
// The World State tab (plan 020, phase 3): everything about World State in one
// place. It used to be spread over the Blocks tab (switch + settings under its
// row), the Chomusuke tab (who writes the updates) and Images.
//
// - On / off: puts the block in the block stack or takes it out (the Blocks
//   tab still orders it and says how it is shown).
// - Who writes the updates: the story model, Chomusuke, or only you. One
//   control for two settings: worldState.updateMode (this character) and
//   Chomusuke's World State job (one setup for every character).
// - Its own section for the Editor, with how to take someone out of the scene
//   (users kept asking). Detail sent, the two switches, Rewrite next / Reset.
// - This chat's card, as the chat draws it.
//
// The state itself lives in the chat file; these are only how it is kept.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, Popup, POPUP_TYPE } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { scopeNoun } from "../../core/sync.js";
import { stateStore, worldEnabled, worldCardTextAt, worldHidesSecrets, worldLimits, WORLD_LIMITS_MAX } from "../../state/index.js";
import { STALE_AFTER_DEFAULT } from "../../state/modules/world/model.js";
import { meguminSyncLegacyBlockIds, meguminRenderRegistry, meguminStatFieldMap } from "../blocks/registry.js";
import { meguminScheduleBlocksRefresh } from "../blocks/chat.js";
import { buildBlocksCard, extractBlocks } from "../../blocks/render.js";
import { openWorldEditor } from "./editor.js";
import { card, segmented, switchRow, field, esc } from "../../ui/controls.js";

// "How each update is written: Only what changed / Full update each time".
// false = not shown; worldState.writeMode still decides (default "changes").
const SHOW_WRITE_MODE = true;

function ws() {
    if (!localProfile.worldState) localProfile.worldState = {};
    return localProfile.worldState;
}

const chomusukeReady = () => {
    const c = localProfile.chomusuke;
    return Boolean(c && c.enabled && c.profileId);
};

/** Who writes the updates, as the user picked it: "story" | "chomusuke" | "me". */
function writer() {
    if (ws().updateMode === "manual") return "me";
    const c = localProfile.chomusuke;
    return c && c.features && c.features.worldState === true ? "chomusuke" : "story";
}

function setWriter(who) {
    ws().updateMode = who === "me" ? "manual" : "inline";
    const c = localProfile.chomusuke;
    if (c) {
        if (!c.features) c.features = {};
        // "Only me" leaves Chomusuke's job as it is: it is shared by every
        // character, and the manual mode already stops every update here.
        if (who === "chomusuke") c.features.worldState = true;
        if (who === "story") c.features.worldState = false;
    }
    saveProfileToMemory();
    meguminScheduleBlocksRefresh();
    fireRefreshHook(REFRESH.TOKEN_COUNT);
}

function setWorldOn(on) {
    const stack = localProfile.blockStack;
    if (!stack || !Array.isArray(stack.order)) return;
    if (on && !stack.order.includes("world")) stack.order.push("world");
    if (!on) stack.order = stack.order.filter(id => id !== "world");
    meguminSyncLegacyBlockIds();
    saveProfileToMemory();
    meguminScheduleBlocksRefresh();
    fireRefreshHook(REFRESH.TOKEN_COUNT);
}

const WRITER_DESC = {
    story: "Each reply ends with what changed in the scene.",
    chomusuke: "Chomusuke reads each reply after it arrives and writes what changed, so the story model only writes the story.",
    me: "Nothing updates by itself. Change it yourself in the Editor."
};

// One-of-many as tiles, like the Limits: an icon, the name, one line.
function choiceTiles(options, current, onPick) {
    const $t = $(`<div class="igx-tiles wsx-choice"></div>`);
    for (const o of options) {
        const $b = $(`<button type="button" class="igx-tile ${String(o.id) === String(current) ? "on" : ""}" ${o.disabled ? "disabled" : ""}>
            <b><i class="fa-solid ${o.icon}"></i> ${esc(o.label)}</b>${o.desc ? `<span>${o.desc}</span>` : ""}
        </button>`);
        $b.on("click", () => {
            if (o.disabled || $b.hasClass("on")) return;
            $t.children().removeClass("on");
            $b.addClass("on");
            onPick(o.id);
        });
        $t.append($b);
    }
    return $t;
}

const sub = text => `<div class="wsx-sub">${text}</div>`;

// The order follows what people come here for: fix this chat first, then how
// updates are written, how much is kept, who counts as in the scene, what the
// model reads, and last the card as the chat draws it.
export function renderWorldStateTab(c) {
    c.empty();
    const redraw = () => renderWorldStateTab(c);
    const on = worldEnabled();
    const cfg = ws();
    const noun = scopeNoun();
    const hasChat = Boolean(getContext()?.chatId);
    const who = writer();
    let $host = null;
    const refreshPreview = () => { if ($host) drawPreview($host[0], worldEnabled(), hasChat); };

    // ── Title + on/off ──
    const $head = $(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #f59e0b, #b45309);"><i class="fa-solid fa-thumbtack"></i></div>
                <div><h2>World State</h2><p>Keeps track of the scene: time, place, who is there, what they wear, and what is still unresolved.</p></div>
            </div>
        </div>
    `);
    const $on = $(`<div class="mtab-toggle-row igx-switch igx-master ${on ? "active" : ""}">
        <div class="toggle-info"><div class="toggle-label">${on ? "World State on" : "World State off"}</div></div>
        <div class="ps-switch"></div>
    </div>`);
    $on.on("click", () => { setWorldOn(!worldEnabled()); redraw(); });
    $head.append($on);
    c.append($head);

    if (!on) {
        c.append(`<div class="igx-banner"><i class="fa-solid fa-circle-info"></i>
            <span>World State is off: nothing is tracked and nothing is sent. Your settings below are kept for when you turn it on.</span></div>`);
    }

    // ── 1. This chat: fix it yourself (users kept asking how) ──
    const chatBox = card(`<span><i class="fa-solid fa-pen"></i> This chat's World State</span>`,
        "Someone is in the scene who shouldn't be, an outfit is wrong, the time is off? Fix it yourself. Your changes stay: swipes and rewinds never undo them.");
    const pending = hasChat && stateStore.isPendingFullRewrite("world");
    // With the whole scene written every reply, a one-off full rewrite adds nothing.
    const everyReply = cfg.writeMode === "full" && who !== "me";
    const ready = hasChat && on;
    const $actions = $(`<div class="wsx-actions-row">
        <button type="button" class="menu_button wsx-btn wsx-btn-main wsx-open-editor" ${ready ? "" : "disabled"}><i class="fa-solid fa-pen-to-square"></i> Open the Editor</button>
        <button type="button" class="menu_button wsx-btn wsx-rewrite ${pending ? "is-on" : ""}" ${ready && !everyReply ? "" : "disabled"} title="${everyReply ? "Every reply already writes the whole scene" : pending ? "Click to cancel" : "The next update describes the whole scene again, not just what changed"}"><i class="fa-solid ${pending ? "fa-check" : "fa-arrows-rotate"}"></i> ${pending ? "Full rewrite next reply" : "Rewrite next reply"}</button>
        <button type="button" class="menu_button wsx-btn wsx-reset" ${ready ? "" : "disabled"} title="Clear this chat's World State"><i class="fa-solid fa-eraser"></i> Reset</button>
    </div>`);
    $actions.find(".wsx-open-editor").on("click", () => openWorldEditor());
    $actions.find(".wsx-rewrite").on("click", () => {
        stateStore.setPendingFullRewrite("world", !stateStore.isPendingFullRewrite("world"));
        redraw();
    });
    $actions.find(".wsx-reset").on("click", async () => {
        const ok = await new Popup($(`<div style="text-align:left;"><h3 style="margin-top:0;">Clear this chat's World State?</h3><p>The next reply describes the scene from scratch. Other chats are not touched.</p></div>`),
            POPUP_TYPE.CONFIRM, "", { okButton: "Clear it", cancelButton: "Cancel" }).show();
        if (!ok) return;
        stateStore.reset("world");
        meguminScheduleBlocksRefresh();
        toastr.info("World State cleared for this chat.", "Megumin Suite");
        redraw();
    });
    chatBox.append($actions);
    if (!on) chatBox.append(`<div class="igx-note">Turn World State on to edit it.</div>`);
    else if (!hasChat) chatBox.append(`<div class="igx-note">Open a chat first: each chat has its own World State.</div>`);
    chatBox.append(`<details class="wsx-howto-box">
        <summary><i class="fa-solid fa-circle-question"></i> How do I…</summary>
        <ul class="wsx-howto">
            <li><b>Take someone out of the scene:</b> click the <i class="fa-solid fa-xmark"></i> on them in the last reply's World State card. Or in the Editor, set them to <i>Left the scene</i>, or <i class="fa-solid fa-trash"></i> to forget them.</li>
            <li><b>Bring someone in:</b> in the Editor, type their name under the people in the scene and press Enter.</li>
            <li><b>Change an outfit, the place or the time:</b> in the Editor, change the text and click away.</li>
            <li><b>Undo one of your changes:</b> the Editor's History, Delete on that change.</li>
            <li><b>Start the scene over:</b> Rewrite next reply describes it again from what is on file; Reset clears it, and the next reply starts from scratch.</li>
        </ul>
    </details>`);
    c.append(chatBox);

    // ── 2. Updates: who writes them, and what each one holds ──
    const updates = card(`<span><i class="fa-solid fa-feather-pointed"></i> Updates</span>`);
    updates.append(sub("Who writes them"));
    updates.append(choiceTiles([
        { id: "story", icon: "fa-book-open", label: "The story model", desc: WRITER_DESC.story },
        { id: "chomusuke", icon: "fa-cat", label: "Chomusuke", desc: WRITER_DESC.chomusuke },
        { id: "me", icon: "fa-hand", label: "Only me", desc: WRITER_DESC.me }
    ], who, id => { setWriter(id); redraw(); }));
    if (who === "chomusuke") {
        updates.append(`<div class="igx-note"><i class="fa-solid fa-cat"></i> Chomusuke's jobs are the same for every ${noun}.</div>`);
        if (!chomusukeReady()) {
            const $warn = $(`<div class="igx-banner red"><i class="fa-solid fa-triangle-exclamation"></i>
                <span><b>Chomusuke isn't set up yet.</b> Until it is, the story model writes the updates.</span>
                <button type="button" class="menu_button igx-btn">Chomusuke tab <i class="fa-solid fa-arrow-right"></i></button></div>`);
            $warn.find("button").on("click", () => fireRefreshHook(REFRESH.SWITCH_TAB, "chomusuke"));
            updates.append($warn);
        }
    }
    // Plan 020: what each update holds. Not for "Only me": nothing is written.
    // "Full update each time" also lifts every limit (threads, seeds, timers,
    // Off-screen): the model writes what still matters, and that's the list.
    if (SHOW_WRITE_MODE && who !== "me") {
        const full = cfg.writeMode === "full";
        updates.append(sub("How each update is written"));
        updates.append(choiceTiles([
            { id: "changes", icon: "fa-pen-to-square", label: "Only what changed", desc: "Short, and details stay exactly as written. Keeps to the limits below." },
            { id: "full", icon: "fa-rotate", label: "Full update each time", desc: "The whole World State every reply. Helps models that forget to update it or keep old characters in the scene. More tokens, and no limits." }
        ], full ? "full" : "changes", id => {
            cfg.writeMode = id;
            saveProfileToMemory();
            fireRefreshHook(REFRESH.TOKEN_COUNT);
            redraw();
        }));
    }
    c.append(updates);

    // ── 3. Limits (plan 022) ──
    c.append(limitsCard(cfg, who, hasChat, refreshPreview));

    // ── 4. Who's in the scene (plan 020; plan 022: the reply's scene list comes first) ──
    const scene = card(`<span><i class="fa-solid fa-users"></i> Who's in the scene</span>`,
        "Each reply lists who is in the scene, and World State follows that list. When a reply leaves the list out, anyone the story hasn't named for a while is moved out of the scene instead, with their details kept. Never the last one left with you.");
    const staleNow = cfg.staleAfter === undefined ? STALE_AFTER_DEFAULT : Number(cfg.staleAfter) || 0;
    scene.append(field("Move them out when not named for", "",
        segmented([
            { id: 0, label: "Never" },
            { id: 5, label: "5 replies" },
            { id: 8, label: "8 replies" },
            { id: 12, label: "12 replies" }
        ], [0, 5, 8, 12].includes(staleNow) ? staleNow : 8, id => {
            cfg.staleAfter = Number(id);
            saveProfileToMemory();
            meguminScheduleBlocksRefresh();
            refreshPreview();
        })));
    scene.append(`<div class="igx-note">The reply that moves someone out says so in its card ("Changed in this reply"); Revert on that reply brings them back. Take someone out yourself with the <i class="fa-solid fa-xmark"></i> on them in the card.</div>`);
    c.append(scene);

    // ── 5. What the story model reads ──
    const reads = card(`<span><i class="fa-solid fa-book-open-reader"></i> What the story model reads</span>`);
    reads.append(sub("Detail sent"));
    reads.append(choiceTiles([
        { id: "full", icon: "fa-layer-group", label: "Full", desc: "Everything on file: the scene, each character's mood and agenda, and the threads." },
        { id: "scene", icon: "fa-eye", label: "Scene only", desc: "Time, place, who is there, what they wear and where they are. Saves tokens." }
    ], cfg.injectionDetail === "scene" ? "scene" : "full", id => { cfg.injectionDetail = id; saveProfileToMemory(); fireRefreshHook(REFRESH.TOKEN_COUNT); }));
    reads.append(switchRow({
        label: "Remind the model of returning characters",
        desc: "When someone who left the scene is mentioned again, the model is reminded how they last were.",
        on: cfg.showReturning !== false,
        onChange: v => { cfg.showReturning = v; saveProfileToMemory(); }
    }));
    if (worldHidesSecrets()) {
        const $nb = $(`<div class="igx-note"><i class="fa-solid fa-book"></i> The Notebook is on, so World State leaves out secrets and planted seeds: the Notebook keeps those. <button type="button" class="menu_button igx-btn">Keep them (The Notebook tab) <i class="fa-solid fa-arrow-right"></i></button></div>`);
        $nb.find("button").on("click", () => fireRefreshHook(REFRESH.SWITCH_TAB, "notebook"));
        reads.append($nb);
    }
    c.append(reads);

    // ── 6. The card, as the chat draws it ──
    const preview = card(`<span><i class="fa-solid fa-id-card"></i> The World State card</span>`, "As the chat draws it after the last message.");
    preview.append(switchRow({
        label: "Show what changed on cards",
        desc: "The top of each reply's World State card lists what that reply changed.",
        on: cfg.showChanges !== false,
        onChange: v => { cfg.showChanges = v; saveProfileToMemory(); meguminScheduleBlocksRefresh(); }
    }));
    $host = $(`<div class="blk-preview wsx-preview"></div>`);
    preview.append($host);
    c.append(preview);
    drawPreview($host[0], on, hasChat);
}

// How long each list may get. "Full update each time" has no limits at all,
// and says so here: most users never read the changelog.
const LIMIT_ROWS = [
    { key: "threads", icon: "fa-fire", label: "Threads", desc: "Open questions the story still has to answer." },
    { key: "seeds", icon: "fa-seedling", label: "Seeds", desc: "Small details that hint at something later." },
    { key: "timers", icon: "fa-hourglass-half", label: "Timers", desc: "Things that happen in a set number of replies." },
    { key: "offscreen", icon: "fa-satellite-dish", label: "Off-screen", desc: "People away from the scene, with what they are doing." }
];

// One tile per list, side by side: the name, − number +, and a short line.
function limitsCard(cfg, who, hasChat, onChange) {
    const full = cfg.writeMode === "full" && who !== "me";
    const box = card(`<span><i class="fa-solid fa-sliders"></i> Limits</span>`,
        "How many of each the World State keeps. When a list is full, the oldest one is dropped to make room. Bigger lists remember more but cost more tokens every reply.");
    if (full) {
        box.append(`<div class="igx-banner"><i class="fa-solid fa-circle-info"></i>
            <span><b>No limits right now.</b> "Full update each time" is on, so every reply writes the lists out whole and keeps whatever still matters. These numbers are used with "Only what changed".</span></div>`);
    }
    const lim = worldLimits();
    const seedsOff = worldHidesSecrets();
    const $grid = $(`<div class="wsx-limits ${full ? "is-off" : ""}"></div>`);
    for (const row of LIMIT_ROWS) {
        const unused = row.key === "seeds" && seedsOff;
        const $tile = $(`<div class="wsx-limit-tile ${unused ? "is-unused" : ""}">
            <div class="wsx-limit-name"><i class="fa-solid ${row.icon}"></i> ${row.label}</div>
            <div class="wsx-step">
                <button type="button" class="wsx-step-btn" data-d="-1" title="One fewer" ${full ? "disabled" : ""}><i class="fa-solid fa-minus"></i></button>
                <span class="wsx-step-val">${lim[row.key]}</span>
                <button type="button" class="wsx-step-btn" data-d="1" title="One more" ${full ? "disabled" : ""}><i class="fa-solid fa-plus"></i></button>
            </div>
            <div class="wsx-limit-desc">${unused ? "Not used while the Notebook is on: it keeps those." : row.desc}</div>
        </div>`);
        $tile.find(".wsx-step-btn").on("click", function () {
            const now = Number($tile.find(".wsx-step-val").text()) || lim[row.key];
            const n = Math.max(1, Math.min(WORLD_LIMITS_MAX, now + Number(this.dataset.d)));
            if (n === now) return;
            $tile.find(".wsx-step-val").text(n);
            cfg.limits = { ...(cfg.limits || {}), [row.key]: n };
            saveProfileToMemory();
            fireRefreshHook(REFRESH.TOKEN_COUNT);
            meguminScheduleBlocksRefresh();
            onChange();
        });
        $grid.append($tile);
    }
    box.append($grid);
    box.append(`<div class="igx-note">Lowering a number drops the oldest ones on the next reply. Your own edits in the Editor are never cut.</div>`);
    return box;
}

function drawPreview(host, on, hasChat) {
    const empty = text => { host.innerHTML = `<div class="blk-empty">${esc(text)}</div>`; };
    if (!on) return empty("World State is off.");
    if (!hasChat) return empty("Open a chat to see its World State.");
    const chat = getContext()?.chat || [];
    const body = chat.length ? worldCardTextAt(chat.length - 1) : "";
    if (!body) return empty("Nothing recorded in this chat yet. The next reply describes the scene.");
    const blocks = extractBlocks(`<Blocks>\n<World_State>\n${body}\n</World_State>\n</Blocks>`, meguminRenderRegistry());
    if (!blocks.length) return empty("Nothing to show yet.");
    host.appendChild(buildBlocksCard(blocks, { preview: true, expanded: true, statFields: meguminStatFieldMap() }));
}
