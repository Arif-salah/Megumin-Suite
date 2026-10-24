// ────────────────────────────────────────────────────────────────────────────
// Images tab — the shell (plan 012): title and on/off switch, the version bar
// (Classic | Version 2 · Consistent characters) with status chips, then three
// pages: Characters (Version 2 only) · When & how · Generator.
//
// Nothing is hidden while ComfyUI isn't connected: a note says so and every
// setting stays usable. The connection is checked quietly once per ComfyUI
// address (and again on Test), never on every redraw.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../core/state.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { worldEnabled } from "../../state/index.js";
import { toggleQuickGenButton, igCheckConnection, igKnownConnection } from "./comfy.js";
import { imageViaChomusuke } from "./auto.js";
import { imageGenSelectedEngine, enableWorldState, askToEnableWorldState } from "./engineChoice.js";
import { renderCharacters } from "./v2/characters.js";
import { renderWhenHow } from "./pages/whenHow.js";
import { renderGenerator } from "./pages/generator.js";

// The page you were on, kept while SillyTavern is open.
let currentPage = null;

const VERSION_DESC = {
    v2: "The story names characters as @Name, and each one's saved look and current outfit are filled in, so they stay the same from image to image.",
    classic: "The model writes the whole image prompt itself, appearance and clothing included."
};

export function renderImageGen(c) {
    c.empty();
    const s = localProfile.imageGen;
    const engine = imageGenSelectedEngine();
    const v2Inactive = engine === "v2" && !worldEnabled();
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
            ${v2Inactive ? `
            <div class="igx-banner red">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span><b>Version 2 needs World State.</b> Until it is on, images are made the Classic way.</span>
                <button type="button" class="menu_button igx-btn igx-enable-ws"><i class="fa-solid fa-thumbtack"></i> Turn on World State</button>
            </div>` : ""}
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
    $ver.find(".igx-enable-ws").on("click", () => {
        if (enableWorldState()) toastr.success("World State is on. Version 2 is active.", "Megumin Suite");
        redraw();
    });
    c.append($ver);

    // ── Not connected: say so, hide nothing ──
    const $notConn = $(`<div class="igx-banner" style="display:none;">
        <i class="fa-solid fa-plug-circle-xmark"></i>
        <span><b>ComfyUI isn't connected.</b> Every setting is still here and saves as usual. Images start once it connects.</span>
        <button type="button" class="menu_button igx-btn igx-go-gen">Open Generator</button>
    </div>`);
    $notConn.find(".igx-go-gen").on("click", () => { currentPage = "gen"; redraw(); });
    c.append($notConn);

    // One check per ComfyUI address, shared by every redraw (comfy.js); Test asks again.
    const showConnection = () => {
        const connected = igKnownConnection();
        const $chip = $ver.find(".igx-conn");
        if (connected === null) $chip.attr("class", "igx-chip igx-conn").html(`<i class="fa-solid fa-spinner fa-spin"></i> Checking ComfyUI…`);
        else if (connected) $chip.attr("class", "igx-chip igx-conn ok").html(`<span class="igx-dot"></span> ComfyUI connected`);
        else $chip.attr("class", "igx-chip igx-conn warn").html(`<span class="igx-dot"></span> ComfyUI not connected`);
        $notConn.css("display", connected === false ? "flex" : "none");
    };
    const check = async () => {
        await igCheckConnection();
        if ($.contains(document, $ver[0])) showConnection();
    };
    showConnection();
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
        else renderGenerator($page, { redraw: redrawPage, onTested: check });
    };
    drawPage();
}
