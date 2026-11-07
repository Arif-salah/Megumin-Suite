// ────────────────────────────────────────────────────────────────────────────
// Images tab — the shell (plan 012): title and on/off switch, the version bar
// (Classic | Version 2 · Consistent characters) with status chips, then three
// pages: Characters (Version 2 only) · When & how · Generator.
//
// Under the version bar, a setup checklist (plan 020): connect ComfyUI, pick a
// workflow and model, when to draw (+ World State for Version 2). It shrinks
// to one line once every step is done. Nothing is hidden while ComfyUI isn't
// connected: every setting stays usable. The connection is checked quietly
// once per ComfyUI address (and again on Test), never on every redraw.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../core/state.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { worldEnabled } from "../../state/index.js";
import { toggleQuickGenButton, igCheckConnection, igKnownConnection, igTestConnection } from "./comfy.js";
import { checklist } from "../../ui/checklist.js";
import { esc } from "../../ui/controls.js";
import { imageViaChomusuke } from "./auto.js";
import { imageGenSelectedEngine, enableWorldState, askToEnableWorldState } from "./engineChoice.js";
import { renderCharacters } from "./v2/characters.js";
import { renderWhenHow } from "./pages/whenHow.js";
import { renderGenerator } from "./pages/generator.js";
import { imageBackend, sillyTavernImagesReady } from "./backend.js";

// The page you were on, kept while SillyTavern is open.
let currentPage = null;

// "When to draw", as the When & how page names it.
const WHEN_LABEL = { always: "Every reply", frequency: "Every few replies", conditional: "When a character sends a picture", manual: "Only when I ask" };

const VERSION_DESC = {
    v2: "The story names characters as @Name, and each one's saved look and current outfit are filled in, so they stay the same from image to image.",
    classic: "The model writes the whole image prompt itself, appearance and clothing included."
};

export function renderImageGen(c) {
    c.empty();
    const s = localProfile.imageGen;
    const engine = imageGenSelectedEngine();
    const pages = [
        ...(engine === "v2" ? [{ id: "chars", label: "Characters", icon: "fa-users" }] : []),
        { id: "when", label: "When & how", icon: "fa-wand-magic-sparkles" },
        { id: "gen", label: "Generator", icon: "fa-sliders" }
    ];
    if (!pages.some(p => p.id === currentPage)) currentPage = pages[0].id;
    const redraw = () => renderImageGen(c);

    // ── Title + on/off ──
    const $head = $(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #06b6d4, #0891b2);"><i class="fa-solid fa-image"></i></div>
                <div><h2>Images</h2><p>Draw the scenes of the story with ComfyUI.</p></div>
            </div>
        </div>
    `);
    const $on = $(`<div class="mtab-toggle-row igx-switch igx-master ${s.enabled ? "active" : ""}">
        <div class="toggle-info"><div class="toggle-label">${s.enabled ? "Images on" : "Images off"}</div></div>
        <div class="ps-switch"></div>
    </div>`);
    $on.on("click", () => {
        s.enabled = !s.enabled;
        saveProfileToMemory();
        toggleQuickGenButton();
        $on.toggleClass("active", s.enabled).find(".toggle-label").text(s.enabled ? "Images on" : "Images off");
    });
    $head.append($on);
    c.append($head);

    // ── Version bar ──
    const $ver = $(`
        <div class="igx-card igx-version">
            <div class="igx-spread">
                <div class="igx-seg igx-version-seg" role="tablist">
                    <button type="button" data-engine="classic" class="${engine === "classic" ? "on" : ""}"><i class="fa-solid fa-clock-rotate-left"></i> Classic</button>
                    <button type="button" data-engine="v2" class="${engine === "v2" ? "on" : ""}"><i class="fa-solid fa-users"></i> Version 2 · Consistent characters</button>
                </div>
                <div class="igx-chips">
                    <span class="igx-chip igx-conn"></span>
                    <span class="igx-chip" title="Change this in the Chomusuke tab">${imageViaChomusuke() ? `<i class="fa-solid fa-cat"></i> Prompts written by Chomusuke` : `<i class="fa-solid fa-feather"></i> Prompts written by the story model`}</span>
                </div>
            </div>
            <div class="igx-card-sub">${VERSION_DESC[engine]}</div>
        </div>
    `);
    $ver.find("[data-engine]").on("click", async function () {
        const next = $(this).data("engine");
        if (next === imageGenSelectedEngine()) return;
        s.engine = next;
        saveProfileToMemory();
        if (next === "v2" && !worldEnabled()) await askToEnableWorldState();
        currentPage = null;
        redraw();
    });
    c.append($ver);

    // ── Set up: the steps, with the real controls (plan 020) ──
    const $setup = $(`<div></div>`);
    c.append($setup);
    const goPage = id => { currentPage = id; redraw(); };
    const drawSetup = () => {
        const connected = igKnownConnection();
        const whenLabel = WHEN_LABEL[s.triggerMode || "always"] || WHEN_LABEL.always;

        // 1. The address and Test, here as on the Generator page.
        const $conn = $(`<div class="igx-inline">
            <input type="text" class="ps-modern-input igx-setup-url" value="${esc(s.comfyUrl || "")}" placeholder="http://127.0.0.1:8188" />
            <button type="button" class="menu_button igx-btn gold igx-setup-test"><i class="fa-solid fa-plug"></i> Test</button>
        </div>`);
        $conn.find(".igx-setup-url").on("change", e => {
            s.comfyUrl = String($(e.target).val() || "").trim();
            saveProfileToMemory();
            $("#ig_url").val(s.comfyUrl);
        });
        $conn.find(".igx-setup-test").on("click", async e => {
            const $b = $(e.currentTarget);
            if ($b.prop("disabled")) return;
            $b.prop("disabled", true);
            try { await igTestConnection(); } finally { $b.prop("disabled", false); }
            if ($.contains(document, $setup[0])) { showConnection(); drawSetup(); }
        });

        // 2. Workflow and model: their lists come from ComfyUI, on the Generator page.
        const $gen = $(`<div class="igx-stack">
            <div class="igx-note">Workflow: <b>${esc(s.currentWorkflowName || "none")}</b> · Model: <b>${esc(s.selectedModel || "none picked")}</b></div>
            <div class="igx-inline"><button type="button" class="menu_button igx-btn">Open the Generator page <i class="fa-solid fa-arrow-right"></i></button></div>
        </div>`);
        $gen.find("button").on("click", () => goPage("gen"));

        // 3. When to draw. The Draw button next to the send button works in every mode.
        const $when = $(`<div class="igx-stack">
            <div class="igx-note">Now: <b>${esc(whenLabel)}</b>. The <i class="fa-solid fa-image"></i> Draw button next to the send button draws the scene whenever you want, in every mode.</div>
            <div class="igx-inline"><button type="button" class="menu_button igx-btn">Open When & how <i class="fa-solid fa-arrow-right"></i></button></div>
        </div>`);
        $when.find("button").on("click", () => goPage("when"));

        // Plan 028: with SillyTavern's Image Generation, its own settings replace steps 1 and 2.
        const viaST = imageBackend() === "st";
        const $st = $(`<div class="igx-stack">
            <div class="igx-note">Images are made by SillyTavern's Image Generation. Pick its source, model and size in SillyTavern's Extensions panel, under Image Generation.</div>
            <div class="igx-inline"><button type="button" class="menu_button igx-btn">Open the Generator page <i class="fa-solid fa-arrow-right"></i></button></div>
        </div>`);
        $st.find("button").on("click", () => goPage("gen"));
        const steps = viaST ? [
            { title: "Set up SillyTavern's Image Generation", done: sillyTavernImagesReady(), body: $st,
              note: sillyTavernImagesReady() ? "" : "SillyTavern's Image Generation extension is off. Turn it on in SillyTavern's Extensions." },
            { title: "Choose when to draw", done: true, body: $when }
        ] : [
            { title: "Connect ComfyUI", done: connected === true, body: $conn,
              note: connected === null ? "Checking…" : connected ? "Connected." : "ComfyUI isn't answering at this address. Start it, check the address, then Test." },
            { title: "Pick a workflow and a model", done: Boolean(s.currentWorkflowName && s.selectedModel), body: $gen },
            { title: "Choose when to draw", done: true, body: $when }
        ];
        if (engine === "v2") {
            const $ws = $(`<div class="igx-stack">
                <div class="igx-note">Version 2 takes each character's outfit, and who is in the scene, from World State. Until it is on, images are made the Classic way.</div>
                <div class="igx-inline">
                    <button type="button" class="menu_button igx-btn igx-enable-ws"><i class="fa-solid fa-thumbtack"></i> Turn on World State</button>
                    <button type="button" class="menu_button igx-btn igx-ws-tab">World State tab <i class="fa-solid fa-arrow-right"></i></button>
                </div>
            </div>`);
            $ws.find(".igx-enable-ws").toggle(!worldEnabled()).on("click", () => {
                if (enableWorldState()) toastr.success("World State is on. Version 2 is active.", "Megumin Suite");
                redraw();
            });
            $ws.find(".igx-ws-tab").on("click", () => fireRefreshHook(REFRESH.SWITCH_TAB, "world"));
            steps.push({ title: "Turn on World State", done: worldEnabled(), body: $ws });
        }
        $setup.empty().append(checklist({
            id: "images",
            title: "Set up Images",
            ready: `Ready · ${viaST ? "SillyTavern's Image Generation" : esc(s.currentWorkflowName || "")} · ${esc(whenLabel)}${s.enabled ? "" : " <small>(Images are off: switch them on at the top)</small>"}`,
            steps
        }));
    };

    // One check per ComfyUI address, shared by every redraw (comfy.js); Test asks again.
    const showConnection = () => {
        const connected = igKnownConnection();
        const $chip = $ver.find(".igx-conn");
        if (imageBackend() === "st") $chip.attr("class", "igx-chip igx-conn").html(`<i class="fa-solid fa-image"></i> Made by SillyTavern's Image Generation`);
        else if (connected === null) $chip.attr("class", "igx-chip igx-conn").html(`<i class="fa-solid fa-spinner fa-spin"></i> Checking ComfyUI…`);
        else if (connected) $chip.attr("class", "igx-chip igx-conn ok").html(`<span class="igx-dot"></span> ComfyUI connected`);
        else $chip.attr("class", "igx-chip igx-conn warn").html(`<span class="igx-dot"></span> ComfyUI not connected`);
    };
    const check = async () => {
        if (imageBackend() !== "st") await igCheckConnection();
        if ($.contains(document, $ver[0])) { showConnection(); drawSetup(); }
    };
    showConnection();
    drawSetup();
    check();

    // ── Pages ──
    const $tabs = $(`<div class="igx-tabs" role="tablist"></div>`);
    pages.forEach(p => {
        const $b = $(`<button type="button" class="${p.id === currentPage ? "on" : ""}"><i class="fa-solid ${p.icon}"></i> ${p.label}</button>`);
        $b.on("click", () => { if (currentPage !== p.id) { currentPage = p.id; redraw(); } });
        $tabs.append($b);
    });
    c.append($tabs);

    const $page = $(`<div class="igx-page"></div>`);
    c.append($page);
    const redrawPage = () => { $page.empty(); drawPage(); };
    const drawPage = () => {
        if (currentPage === "chars") renderCharacters($page, { redraw: redrawPage });
        else if (currentPage === "when") renderWhenHow($page, { engine, redraw: redrawPage });
        else renderGenerator($page, { redraw: redrawPage, onTested: check, onBackend: () => { showConnection(); drawSetup(); check(); } });
    };
    drawPage();
}
