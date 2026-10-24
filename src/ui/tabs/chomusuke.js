// ──────────────────────────────────────────────────────────────────────────────
// Chomusuke — the helper model.
//
// Runs background jobs on a second connection profile (SillyTavern Connection
// Profiles), sent straight to it so the story's connection never changes
// (plan 019; switched for each job only with the Settings fallback on), or on
// the current connection ("Use my current connection").
//
// One page (plan 015): the on switch and the worker connection, then the jobs
// grouped by what they cost: "After every reply" (a call on every reply, with
// Combine calls and a live cost line) and "When the job runs" (occasional).
// ──────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../core/state.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import {
    getSillyTavernConnectionProfiles,
    runWithChomusuke,
    CURRENT_CONNECTION,
    chomusukeSwitches,
} from "../../engine/tasks.js";
import { isChatProfile } from "../../engine/workerRequest.js";
import { generateQuietPrompt } from "../../st.js";
import { worldEnabled, notebookEnabled } from "../../state/index.js";
import { card, switchRow, esc } from "../controls.js";
import { chomusukeSetupHtml } from "../modelGuide.js";

// Folds stay as they were across redraws.
let advancedOpen = false;
// null = not touched yet: open while there's no profile to pick.
let setupOpen = null;

const BLOCK_ROUTES = [
    { id: "bonds", label: "Bonds", icon: "fa-heart" },
    { id: "sheet", label: "Character Sheet", icon: "fa-shield-halved" },
    { id: "chatter", label: "NPC Inner Chatter", icon: "fa-comments" },
    { id: "cyoa", label: "CYOA choices", icon: "fa-list-check" }
];

// After every reply: each is a call on every reply while on (off by default,
// except Images, which also covers the image button).
// Blocks covers World State too (it is a block in the Blocks tab): its chip is
// the World State route, the other chips the Blocks route (plan 009).
const PER_REPLY = [
    { key: "blocks", title: "Blocks", icon: "fa-cubes", color: "#f43f5e", defaultOff: true,
      desc: "Writes the blocks you tick after each reply, World State included. The story model stops writing them, so more of its reply goes to the story. World State is a call of its own; the other blocks share one." },
    { key: "notebook", title: "The Notebook", icon: "fa-book", color: "#8b5cf6", defaultOff: true,
      desc: "Notes the clues each reply showed, who found out a hidden truth, and what came out. The story model only writes new truths.",
      note: "I recommend keeping this one for the story model to handle." },
    { key: "imageGen", title: "Images", icon: "fa-image", color: "#06b6d4",
      desc: "Writes the image prompts: the automatic images after a reply, and the image button." }
];

// When the job runs: occasional, only when that job fires.
const OCCASIONAL = [
    { key: "memory", title: "Memory", icon: "fa-memory", color: "#3b82f6", desc: "Summarises older chat for the long-term vault." },
    { key: "npc", title: "NPC Bank", icon: "fa-address-book", color: "#10b981", desc: "Scans for new characters and updates their records." },
    { key: "storyPlan", title: "Story Director", icon: "fa-clapperboard", color: "#a855f7", desc: "Writes and evolves the story's next direction." },
    { key: "banList", title: "Banned Phrases", icon: "fa-ban", color: "#ef4444", desc: "Finds the phrases the AI keeps repeating." },
    { key: "styleGen", title: "Writing Style generator", icon: "fa-wand-magic-sparkles", color: "#ec4899", desc: "Writes new writing styles from your tags." }
];

function ensureConfig() {
    if (!localProfile.chomusuke) {
        localProfile.chomusuke = {
            enabled: false, profileId: "", primaryProfileId: "",
            features: { memory: true, storyPlan: true, npc: true, banList: true, imageGen: true, styleGen: true, worldState: false },
        };
    }
    const cfg = localProfile.chomusuke;
    if (!cfg.features) cfg.features = {};
    if (!cfg.blockRoutes || typeof cfg.blockRoutes !== "object") cfg.blockRoutes = { bonds: true, sheet: true, chatter: true, cyoa: true };
    if (!cfg.combine || typeof cfg.combine !== "object") cfg.combine = { all: false, worldFallback: false };
    // One switch now; the old "World State and image" switch carries over.
    if (cfg.combine.all === undefined) cfg.combine.all = cfg.combine.worldImage === true;
    return cfg;
}

const worldRouted = cfg => cfg.features.worldState === true;
const blockRouted = (cfg, id) => cfg.features.blocks === true && cfg.blockRoutes[id] !== false;
const anyBlockRouted = cfg => worldRouted(cfg) || BLOCK_ROUTES.some(b => blockRouted(cfg, b.id));

// Most routes are on unless switched off; a route that costs a call per reply
// (defaultOff) is off unless switched on.
const routeOn = (cfg, feat) => feat.defaultOff ? cfg.features[feat.key] === true : cfg.features[feat.key] !== false;

/** Is the job itself switched on in its own tab? null = yes (or nothing to switch). */
function featureOff(key) {
    const p = localProfile;
    const stack = (p.blockStack && p.blockStack.order) || [];
    switch (key) {
        case "blocks": return worldEnabled() || BLOCK_ROUTES.some(b => stack.includes(b.id)) ? null : { text: "None of these blocks are on", tab: "blocks" };
        case "notebook": return notebookEnabled() ? null : { text: "The Notebook is off", tab: "notebook" };
        case "imageGen": return p.imageGen && p.imageGen.enabled ? null : { text: "Images are off", tab: "images" };
        case "memory": return p.memoryCore && p.memoryCore.enabled ? null : { text: "Memory is off", tab: "memory" };
        case "npc": return p.npcBank && p.npcBank.enabled ? null : { text: "NPC Bank is off", tab: "npc" };
        case "storyPlan": return p.storyPlan && p.storyPlan.enabled ? null : { text: "Story Director is off", tab: "director" };
        default: return null;
    }
}

function offChip(key) {
    const off = featureOff(key);
    return off ? `<button type="button" class="chx-off" data-tab="${off.tab}" title="Open that tab">${esc(off.text)} <i class="fa-solid fa-arrow-right"></i></button>` : "";
}

/** How many Chomusuke calls a reply can cost right now. */
function callsPerReply(cfg) {
    const stack = (localProfile.blockStack && localProfile.blockStack.order) || [];
    const ig = localProfile.imageGen || {};
    let n = 0;
    // World State and the other blocks are separate calls unless combined.
    if (worldRouted(cfg) && worldEnabled()) n++;
    if (BLOCK_ROUTES.some(b => blockRouted(cfg, b.id) && stack.includes(b.id))) n++;
    if (cfg.features.notebook === true && notebookEnabled()) n++;
    if (cfg.features.imageGen !== false && ig.enabled && (ig.triggerMode || "always") !== "manual") n++;
    return n;
}

export function renderChomusuke(c) {
    c.empty();
    const cfg = ensureConfig();
    const redraw = () => renderChomusuke(c);
    // Chat Completion only: we don't support Text Completion.
    const allProfiles = getSillyTavernConnectionProfiles();
    const profiles = allProfiles.filter(isChatProfile);
    const switching = chomusukeSwitches();
    const onCurrent = cfg.profileId === CURRENT_CONNECTION;
    const worker = profiles.find(p => p.id === cfg.profileId);
    const textWorker = allProfiles.find(p => p.id === cfg.profileId && !isChatProfile(p));
    const running = Boolean(cfg.enabled && cfg.profileId);

    // ── Title + on/off ──
    const $head = $(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #f43f5e, #be123c);"><i class="fa-solid fa-cat"></i></div>
                <div><h2>Chomusuke</h2><p>Your helper model: it does the background jobs on a second connection, so the story model doesn't have to.</p></div>
            </div>
        </div>
    `);
    const $on = $(`<div class="mtab-toggle-row igx-switch igx-master ${cfg.enabled ? "active" : ""}">
        <div class="toggle-info"><div class="toggle-label">${cfg.enabled ? "Chomusuke on" : "Chomusuke off"}</div></div>
        <div class="ps-switch"></div>
    </div>`);
    $on.on("click", () => { cfg.enabled = !cfg.enabled; saveProfileToMemory(); redraw(); });
    $head.append($on);
    c.append($head);

    // ── Connection ──
    const conn = card("Worker connection", "The connection Chomusuke uses. Chomusuke works best with <b>GLM 5.3 Flash</b>.");
    if (!profiles.length) {
        conn.append(`<div class="igx-banner red"><i class="fa-solid fa-triangle-exclamation"></i>
            <span>No Chat Completion profiles yet. Chomusuke can use your current connection, or you can make a profile for it: the steps are below.</span></div>`);
    }
    if (textWorker) {
        conn.append(`<div class="igx-banner red"><i class="fa-solid fa-triangle-exclamation"></i>
            <span><b>${esc(textWorker.name)}</b> is a Text Completion profile. Chomusuke only works with Chat Completion: pick another connection.</span></div>`);
    }
    conn.append(`<div class="igx-banner"><i class="fa-solid fa-shield-halved"></i>
        <span>Chomusuke has no jailbreak. A censored model like Gemini can refuse its jobs on an NSFW story and send back nothing. Use an uncensored or less censored model, like <b>GLM 5.3 Flash</b> <i class="fa-solid fa-star" style="color: #fbbf24;" title="Recommended"></i> (recommended) or <b>DeepSeek 4.1 Flash</b>.</span></div>`);
    const $line = $(`<div class="igx-inline chx-conn">
        <select id="chomusuke_worker_profile" class="ps-modern-input">
            <option value="">Pick a connection…</option>
            <option value="${CURRENT_CONNECTION}" ${onCurrent ? "selected" : ""}>Use my current connection</option>
            ${profiles.map(p => `<option value="${esc(p.id)}" ${p.id === cfg.profileId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
        </select>
        <button type="button" id="btn_test_chomusuke" class="menu_button igx-btn"><i class="fa-solid fa-vial"></i> Test</button>
    </div>`);
    conn.append($line);
    conn.append(`<div id="chomusuke_test_status" class="igx-note">${running
        ? (onCurrent ? "Ready on <b>your current connection</b>: the same model as the story, with no switching." : `Ready on <b>${esc(worker ? worker.name : "your worker")}</b>.`)
        : cfg.enabled ? "Pick a connection to start." : "Chomusuke is off: every job below uses your story model."}</div>`);
    // Advanced: where to go back to after a job. Only when the connection is
    // switched for each job; nothing to go back to on the current connection.
    if (switching && profiles.length && !onCurrent) {
        const $fold = $(`<button type="button" class="igx-fold"><i class="fa-solid fa-chevron-${advancedOpen ? "down" : "right"}"></i> Advanced</button>`);
        const $box = $(`<div class="igx-stack" style="display:${advancedOpen ? "flex" : "none"};">
            <div class="igx-field">
                <div class="igx-field-label">Go back to after each job <small>Automatic uses whatever profile was on before the job ran</small></div>
                <select id="chomusuke_primary_profile" class="ps-modern-input igx-narrow">
                    <option value="" ${!cfg.primaryProfileId ? "selected" : ""}>Automatic</option>
                    ${profiles.map(p => `<option value="${esc(p.id)}" ${p.id === cfg.primaryProfileId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
                </select>
            </div>
        </div>`);
        $fold.on("click", () => {
            advancedOpen = !advancedOpen;
            $box.css("display", advancedOpen ? "flex" : "none");
            $fold.find("i").attr("class", `fa-solid fa-chevron-${advancedOpen ? "down" : "right"}`);
        });
        conn.append($fold).append($box);
    }

    // Step by step: making the connection profiles.
    const open = setupOpen === null ? !profiles.length : setupOpen;
    const $howFold = $(`<button type="button" class="igx-fold"><i class="fa-solid fa-chevron-${open ? "down" : "right"}"></i> How do I make a connection profile?</button>`);
    const $how = $(`<div class="chx-how" style="display:${open ? "flex" : "none"};">
        ${chomusukeSetupHtml(switching)}
    </div>`);
    $howFold.on("click", () => {
        setupOpen = $how.css("display") === "none";
        $how.css("display", setupOpen ? "flex" : "none");
        $howFold.find("i").attr("class", `fa-solid fa-chevron-${setupOpen ? "down" : "right"}`);
    });
    conn.append($howFold).append($how);
    c.append(conn);

    // ── After every reply ──
    const n = callsPerReply(cfg);
    const combine = cfg.combine;
    const routedPerReply = [worldRouted(cfg), cfg.features.blocks === true, cfg.features.notebook === true, cfg.features.imageGen !== false].filter(Boolean).length;
    const combineReady = Boolean(running && routedPerReply >= 2);
    const cost = !running ? "Chomusuke is off, so none of these cost a Chomusuke call."
        : n === 0 ? "No job runs after every reply right now."
        : n === 1 ? "Each reply costs <b>1</b> Chomusuke call."
        : combine.all && combineReady ? `Each reply costs up to <b>${n}</b> Chomusuke calls → with Combine calls on: <b>1</b>.`
        : `Each reply costs up to <b>${n}</b> Chomusuke calls. Turn on Combine calls to make it <b>1</b>.`;

    const every = card("After every reply", "Each job here is one Chomusuke call on every reply while it is on.");
    every.append(`<div class="chx-cost"><i class="fa-solid fa-receipt"></i> <span>${cost}</span></div>`);
    PER_REPLY.forEach(feat => {
        const isBlocks = feat.key === "blocks";
        const on = isBlocks ? anyBlockRouted(cfg) : routeOn(cfg, feat);
        const $row = routeRow(feat, on, offChip(feat.key));
        $row.on("click", e => {
            if ($(e.target).closest(".chx-off").length) return;
            if (isBlocks) {
                // The row turns every block on or off; the chips pick single ones.
                cfg.features.worldState = !on;
                cfg.features.blocks = !on;
                if (!on) BLOCK_ROUTES.forEach(b => { cfg.blockRoutes[b.id] = true; });
            } else {
                cfg.features[feat.key] = !on;
            }
            saveProfileToMemory();
            // Combine calls and the cost line depend on these: redraw.
            redraw();
        });
        every.append($row);
        if (isBlocks) every.append(blockChips(cfg, redraw));
    });

    // Combine calls belongs to this group.
    every.append(`<div class="chx-sub">Combine calls ${combineReady ? "" : `<small>Needs Chomusuke on and at least two of the jobs above.</small>`}</div>`);
    every.append(switchRow({
        label: `<i class="fa-solid fa-layer-group" style="color:#f59e0b; margin-right: 6px;"></i> Everything in one call`,
        desc: "After each reply, one call does every job above that is on, plus the image prompt when an image is due (on Version 2 also outfit tags and new looks). A reply that needs only one of them keeps its own call.",
        on: combine.all === true && combineReady,
        disabled: !combineReady,
        onChange: on => { combine.all = on; if (!on) combine.worldFallback = false; saveProfileToMemory(); redraw(); }
    }));
    every.append(switchRow({
        label: `<i class="fa-solid fa-life-ring" style="color:#10b981; margin-right: 6px;"></i> Fall back to separate reads`,
        desc: "If the combined answer has no usable World State update, blocks or notebook lines, read the reply again for just that part (one extra call, only then). Off: the card shows it, with Read again.",
        on: combine.worldFallback === true && combineReady && combine.all === true,
        disabled: !(combineReady && combine.all === true),
        onChange: on => { combine.worldFallback = on; saveProfileToMemory(); }
    }).addClass("chx-indent"));
    c.append(every);

    // ── When the job runs ──
    const occ = card("When the job runs", "Only when that job fires: a scan, a summary, a new direction.");
    const $grid = $(`<div class="chx-grid"></div>`);
    OCCASIONAL.forEach(feat => {
        const on = routeOn(cfg, feat);
        const $row = routeRow(feat, on, offChip(feat.key));
        $row.on("click", e => {
            if ($(e.target).closest(".chx-off").length) return;
            cfg.features[feat.key] = !on;
            saveProfileToMemory();
            redraw();
        });
        $grid.append($row);
    });
    occ.append($grid);
    c.append(occ);

    c.append(switching
        ? `<div class="igx-note chx-how"><i class="fa-solid fa-cat"></i> When a job starts, Chomusuke switches to the worker connection, does the job quietly, then switches back. If anything goes wrong, your story connection is put back straight away. (Settings: "Switch my connection for each Chomusuke job" is on.)</div>`
        : `<div class="igx-note chx-how"><i class="fa-solid fa-cat"></i> Chomusuke sends its jobs straight to its connection. Your story connection never changes.</div>`);

    // ── Wiring ──
    c.find(".chx-off").on("click", function (e) {
        e.stopPropagation();
        fireRefreshHook(REFRESH.SWITCH_TAB, $(this).data("tab"));
    });
    c.find("#chomusuke_worker_profile").on("change", function () { cfg.profileId = $(this).val(); saveProfileToMemory(); redraw(); });
    c.find("#chomusuke_primary_profile").on("change", function () { cfg.primaryProfileId = $(this).val(); saveProfileToMemory(); });
    c.find("#btn_test_chomusuke").on("click", async function () {
        const $btn = $(this);
        const $status = c.find("#chomusuke_test_status");
        if (!cfg.profileId) { toastr.warning("Pick a connection first.", "Chomusuke"); return; }
        $btn.prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> Testing…`);
        $status.text("Connecting to the worker…");
        try {
            const reply = await runWithChomusuke("test", async () => {
                const r = await generateQuietPrompt({ prompt: "Reply with the single word: OK", quietPrompt: "Reply with the single word: OK" });
                return typeof r === "string" ? r.trim() : "";
            }, { force: true });
            const back = switching && cfg.profileId !== CURRENT_CONNECTION ? " Your story connection is back." : "";
            if (reply) {
                $status.html(`<span class="chx-ok"><i class="fa-solid fa-circle-check"></i> It works: Chomusuke answered.${back}</span>`);
                toastr.success(`Chomusuke answered.${back}`, "Chomusuke");
            } else {
                $status.html(`<span class="chx-bad"><i class="fa-solid fa-circle-xmark"></i> Chomusuke sent no text back.${back}</span>`);
            }
        } catch (err) {
            $status.html(`<span class="chx-bad"><i class="fa-solid fa-circle-xmark"></i> The test failed: ${esc(err.message || err)}</span>`);
        } finally {
            $btn.prop("disabled", false).html(`<i class="fa-solid fa-vial"></i> Test`);
        }
    });
}

function routeRow(feat, on, chip) {
    return $(`
        <div class="mtab-toggle-row chx-route ${on ? "active" : ""}" data-feat="${feat.key}">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid ${feat.icon}" style="color: ${feat.color}; margin-right: 6px;"></i> ${feat.title} ${chip}</div>
                <div class="toggle-desc">${feat.desc}</div>
                ${feat.note ? `<div class="chx-note"><i class="fa-solid fa-star"></i> ${feat.note}</div>` : ""}
            </div>
            <div class="ps-switch"></div>
        </div>
    `);
}

// Which blocks Chomusuke writes, one tick each. World State is its own route
// (features.worldState); the rest are the Blocks route (features.blocks +
// blockRoutes, plan 009).
function blockChips(cfg, redraw) {
    const stack = (localProfile.blockStack && localProfile.blockStack.order) || [];
    const $chips = $(`<div class="chx-blocks"></div>`);
    const worldOn = worldRouted(cfg);
    const worldInStack = worldEnabled();
    const $world = $(`<label class="chx-block ${worldOn ? "on" : ""} ${worldInStack ? "" : "is-off"}" title="${worldInStack ? "" : "World State isn't on in the Blocks tab, so there is nothing to read."}">
        <input type="checkbox" ${worldOn ? "checked" : ""}/> <i class="fa-solid fa-thumbtack"></i> World State${worldInStack ? "" : " <small>(not on)</small>"}
    </label>`);
    $world.find("input").on("change", function () {
        cfg.features.worldState = this.checked;
        saveProfileToMemory();
        redraw();
    });
    $chips.append($world);
    BLOCK_ROUTES.forEach(b => {
        const on = blockRouted(cfg, b.id);
        const inStack = stack.includes(b.id);
        const $chip = $(`<label class="chx-block ${on ? "on" : ""} ${inStack ? "" : "is-off"}" title="${inStack ? "" : "This block isn't on in the Blocks tab, so there is nothing to write."}">
            <input type="checkbox" ${on ? "checked" : ""}/> <i class="fa-solid ${b.icon}"></i> ${b.label}${inStack ? "" : " <small>(not on)</small>"}
        </label>`);
        $chip.find("input").on("change", function () {
            if (this.checked && cfg.features.blocks !== true) {
                // The first block ticked turns the route on with just that block.
                cfg.features.blocks = true;
                BLOCK_ROUTES.forEach(x => { cfg.blockRoutes[x.id] = x.id === b.id; });
            } else {
                cfg.blockRoutes[b.id] = this.checked;
                if (!BLOCK_ROUTES.some(x => cfg.blockRoutes[x.id] !== false)) cfg.features.blocks = false;
            }
            saveProfileToMemory();
            redraw();
        });
        $chips.append($chip);
    });
    return $chips;
}
