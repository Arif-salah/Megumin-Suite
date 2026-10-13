/* eslint-disable no-undef */
/*
 * Megumin Suite — Present Characters Bar
 *
 * Horizontal portrait strip mounted above/below SillyTavern's chat input
 * (#send_form). Mirrors Doom's Enhancement Suite "Present Characters Panel"
 * shape: full-bleed portrait card + gradient name overlay. Pulls the cast
 * from the AI-emitted World State NPCs Present block and resolves portraits
 * from the existing NPC Bank.
 *
 * Stays decoupled from panel.js render loop — exports its own update hook
 * that the panel call sites already invoke on every message event.
 */

import { extension_settings } from "../../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../../script.js";
import { resolvePortrait } from "../core/portraits.js";

const EXT_NAME = "Megumin-Suite";
const SETTINGS_KEY = "presentBar";
const WRAPPER_ID = "meg-pb-wrapper";
const SCROLL_ID = "meg-pb-scroll";
const COUNT_ID = "meg-pb-count";

const DEFAULTS = Object.freeze({
    enabled: true,
    position: "above",         // "above" | "below" | "off"
    cardWidth: 120,            // px
    cardHeight: 160,           // px
});

let initialised = false;
let getCast = () => [];        // injected from panel.js; returns [{ name, fields?, banked? }]
let openInBook = null;         // optional callback: (npcName, bankIdx?) => void

function settings() {
    if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = {};
    if (!extension_settings[EXT_NAME][SETTINGS_KEY]) {
        extension_settings[EXT_NAME][SETTINGS_KEY] = structuredClone(DEFAULTS);
    } else {
        const cur = extension_settings[EXT_NAME][SETTINGS_KEY];
        for (const k of Object.keys(DEFAULTS)) {
            if (cur[k] === undefined) cur[k] = DEFAULTS[k];
        }
    }
    return extension_settings[EXT_NAME][SETTINGS_KEY];
}

function persist() {
    try { saveSettingsDebounced(); } catch (e) { /* */ }
}

function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function isMaleSex(sexStr) {
    return (sexStr || "").trim().toLowerCase().startsWith("m");
}

// -----------------------------------------------------------------------------
// DOM mount + lifecycle
// -----------------------------------------------------------------------------
function buildWrapperHtml() {
    return `
        <div id="${WRAPPER_ID}" class="meg-pb-wrapper">
            <button class="meg-pb-toggle meg-pb-open" id="meg-pb-toggle" type="button" title="Collapse / expand">
                <span class="meg-pb-toggle-dots">
                    <span class="meg-pb-toggle-dot"></span>
                    <span class="meg-pb-toggle-dot"></span>
                    <span class="meg-pb-toggle-dot"></span>
                </span>
                <span class="meg-pb-toggle-label">Characters</span>
                <i class="fa-solid fa-chevron-up meg-pb-toggle-chevron"></i>
            </button>
            <div class="meg-pb-bar meg-pb-expanded" id="meg-pb-bar">
                <div class="meg-pb-header">
                    <span class="meg-pb-title"><i class="fa-solid fa-users"></i> Present Characters</span>
                    <span class="meg-pb-count" id="${COUNT_ID}">0</span>
                </div>
                <button class="meg-pb-arrow meg-pb-left"  id="meg-pb-left"  type="button" tabindex="-1"><i class="fa-solid fa-chevron-left"></i></button>
                <button class="meg-pb-arrow meg-pb-right" id="meg-pb-right" type="button" tabindex="-1"><i class="fa-solid fa-chevron-right"></i></button>
                <div class="meg-pb-scroll" id="${SCROLL_ID}"></div>
            </div>
        </div>
    `;
}

function mountWrapper() {
    if (document.getElementById(WRAPPER_ID)) return;
    const cfg = settings();
    const spCfg = extension_settings["Megumin-Suite"]?.sidePanel || {};
    if (spCfg.enabled === false || cfg.position === "off") return;

    const $sendForm = window.jQuery ? window.jQuery("#send_form") : null;
    const $sheld = window.jQuery ? window.jQuery("#sheld") : null;
    const html = buildWrapperHtml();

    if ($sendForm && $sendForm.length) {
        cfg.position === "below" ? $sendForm.after(html) : $sendForm.before(html);
    } else if ($sheld && $sheld.length) {
        $sheld.append(html);
    } else {
        document.body.insertAdjacentHTML("beforeend", html);
    }

    wireEvents();
    applyCardSize();
    // update() calls back into mountWrapper() when the wrapper is missing, so only
    // call it once the insert has really landed in the document. If the target was
    // detached there is nothing to find, and the two would call each other forever.
    if (document.getElementById(WRAPPER_ID)) update();
}

function repositionWrapper() {
    const cfg = settings();
    const wrapper = document.getElementById(WRAPPER_ID);
    const $sendForm = window.jQuery ? window.jQuery("#send_form") : null;
    if (cfg.position === "off") {
        if (wrapper) wrapper.remove();
        return;
    }
    if (!wrapper) {
        mountWrapper();
        return;
    }
    if (!$sendForm || !$sendForm.length) return;
    if (cfg.position === "below") $sendForm.after(wrapper);
    else $sendForm.before(wrapper);
}

function wireEvents() {
    const toggle = document.getElementById("meg-pb-toggle");
    const bar = document.getElementById("meg-pb-bar");
    if (toggle && bar) {
        toggle.addEventListener("click", () => {
            const collapsed = bar.classList.toggle("meg-pb-collapsed");
            bar.classList.toggle("meg-pb-expanded", !collapsed);
            toggle.classList.toggle("meg-pb-open", !collapsed);
        });
    }
    const left = document.getElementById("meg-pb-left");
    const right = document.getElementById("meg-pb-right");
    const scroll = document.getElementById(SCROLL_ID);
    if (left && scroll) left.addEventListener("click", () => scroll.scrollBy({ left: -240, behavior: "smooth" }));
    if (right && scroll) right.addEventListener("click", () => scroll.scrollBy({ left:  240, behavior: "smooth" }));

    // Click a portrait card → open Character Sheet
    if (scroll) {
        scroll.addEventListener("click", (e) => {
            const card = e.target.closest(".meg-pb-card");
            if (!card) return;
            e.preventDefault();
            e.stopPropagation();
            const name = card.getAttribute("data-name");
            if (name) openCharacterSheet(name);
        });
    }

    // ESC to close sheet
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeCharacterSheet();
    });
}

function applyCardSize() {
    const cfg = settings();
    const wrapper = document.getElementById(WRAPPER_ID);
    if (!wrapper) return;
    wrapper.style.setProperty("--meg-pb-card-w", cfg.cardWidth + "px");
    wrapper.style.setProperty("--meg-pb-card-h", cfg.cardHeight + "px");
}

// -----------------------------------------------------------------------------
// Render
// -----------------------------------------------------------------------------
function cardHtml(entry) {
    const name = entry.name || "NPC";
    const banked = entry.banked || null;
    const portrait = banked && banked.pfp ? banked.pfp : resolvePortrait(name);
    const male = banked ? isMaleSex(banked.sex) : null;
    const accent = male === true ? "meg-pb-card-male"
                  : male === false ? "meg-pb-card-female"
                  : "";
    const initial = (name || "?").trim().charAt(0).toUpperCase();
    const nameEsc = escapeHtml(name);
    const innerImg = portrait
        ? `<img src="${escapeHtml(portrait)}" alt="${nameEsc}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
           <div class="meg-pb-card-emoji" style="display:none;">${initial}</div>`
        : `<div class="meg-pb-card-emoji">${initial}</div>`;

    return `<div class="meg-pb-card ${accent}" data-name="${nameEsc}" title="${nameEsc}">
        ${innerImg}
        <div class="meg-pb-card-name">${nameEsc}</div>
    </div>`;
}

export function update() {
    const cfg = settings();
    const spCfg = extension_settings["Megumin-Suite"]?.sidePanel || {};
    const wrapper = document.getElementById(WRAPPER_ID);
    if (!wrapper) {
        // Mid-session enable: the bar was never mounted because one of the two
        // switches was off when initPresentBar ran. mountWrapper() is a no-op when
        // the wrapper already exists, and it ends by calling update() itself.
        if (spCfg.enabled === false || !cfg.enabled || cfg.position === "off") return;
        mountWrapper();
        return;
    }
    if (spCfg.enabled === false || !cfg.enabled || cfg.position === "off") {
        wrapper.style.display = "none";
        return;
    }
    wrapper.style.display = "";

    const cast = getCast() || [];
    const scroll = document.getElementById(SCROLL_ID);
    const count = document.getElementById(COUNT_ID);
    if (!scroll) return;
    if (!cast.length) {
        scroll.innerHTML = `<div class="meg-pb-empty">No characters in scene</div>`;
        if (count) count.textContent = "0";
        return;
    }
    scroll.innerHTML = cast.map(cardHtml).join("");
    if (count) count.textContent = String(cast.length);
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------
export function initPresentBar({ castGetter, onOpenInBook } = {}) {
    if (initialised) return;
    initialised = true;
    if (typeof castGetter === "function") getCast = castGetter;
    if (typeof onOpenInBook === "function") openInBook = onOpenInBook;

    const mount = () => {
        const cfg = settings();
        if (cfg.position === "off") return;
        mountWrapper();
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
        // Defer slightly so SillyTavern's #send_form is in the DOM
        setTimeout(mount, 250);
    }
}

export function refreshPresentBar() { update(); }

export function getPresentBarSettings() { return settings(); }

export function applyPresentBarChange() {
    const cfg = settings();
    if (cfg.position === "off") {
        const w = document.getElementById(WRAPPER_ID);
        if (w) w.remove();
        return;
    }
    if (!document.getElementById(WRAPPER_ID)) {
        mountWrapper();
    } else {
        repositionWrapper();
        applyCardSize();
        update();
    }
    persist();
}

// =============================================================================
// Character Sheet — full-info popup opened by clicking a card
// =============================================================================
const SHEET_ID = "meg-pb-sheet";

/**
 * Renders a "Name" → "value" row, but only when value is non-empty.
 * Returns "" so we can chain with ${ ... }.
 */
function fieldRow(label, val) {
    if (val === undefined || val === null || String(val).trim() === "") return "";
    return `<div class="meg-pb-sheet-field">
        <div class="meg-pb-sheet-field-key">${escapeHtml(label)}</div>
        <div class="meg-pb-sheet-field-val">${escapeHtml(val)}</div>
    </div>`;
}

function sheetSection(title, icon, rows) {
    const body = rows.filter(Boolean).join("");
    if (!body) return "";
    return `<div class="meg-pb-sheet-section">
        <div class="meg-pb-sheet-section-head"><i class="fa-solid ${icon}"></i> ${escapeHtml(title)}</div>
        <div class="meg-pb-sheet-section-body">${body}</div>
    </div>`;
}

function entryByName(name) {
    const cast = getCast() || [];
    const target = (name || "").trim().toLowerCase();
    return cast.find(e => (e.name || "").trim().toLowerCase() === target) || null;
}

export function openCharacterSheet(name) {
    const entry = entryByName(name);
    if (!entry) return;

    const sceneFields = Object.entries(entry.fields || {}); // raw scene fields
    const banked = entry.banked || null;

    // Portrait
    const portrait = banked && banked.pfp ? banked.pfp : resolvePortrait(name);
    const initial = (entry.name || "?").trim().charAt(0).toUpperCase();
    const male = banked ? isMaleSex(banked.sex) : null;
    const accentClass = male === true ? "meg-pb-sheet-male"
                       : male === false ? "meg-pb-sheet-female"
                       : "";

    // Bake the body
    const portraitInner = portrait
        ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(entry.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
           <div class="meg-pb-sheet-initial" style="display:none;">${escapeHtml(initial)}</div>`
        : `<div class="meg-pb-sheet-initial">${escapeHtml(initial)}</div>`;

    const ageSex = [banked?.age, banked?.sex].filter(Boolean).join(" · ");

    const sceneSection = sheetSection("This Scene", "fa-clapperboard",
        sceneFields.map(([k, v]) => fieldRow(k, v)));

    // V8 schema (role, voice, whereToFind, readOnPc, secrets, canonLock,
    // orientation) with V7 fallbacks (occupation, hiddenLayer) for NPCs
    // banked before the upgrade.
    const bankSection = banked ? sheetSection("Dossier", "fa-address-card", [
        fieldRow("Role", banked.role || banked.occupation),
        fieldRow("Orientation", banked.orientation),
        fieldRow("Where to Find", banked.whereToFind),
        fieldRow("Appearance", banked.appearance),
        fieldRow("Voice", banked.voice),
        fieldRow("Personality", banked.personality),
        fieldRow("Inner Circle", banked.innerCircle),
        fieldRow("Background", banked.background),
        fieldRow("Read on PC", banked.readOnPc),
        fieldRow("Agenda (long-term)", banked.agenda),
        fieldRow("Secrets", banked.secrets || banked.hiddenLayer),
        fieldRow("Canon Lock", banked.canonLock),
    ]) : "";

    const bookBtn = banked
        ? `<button class="meg-pb-sheet-book-btn" id="meg-pb-sheet-book-btn">
              <i class="fa-solid fa-book-open"></i> Open in NPC Book
           </button>`
        : `<div class="meg-pb-sheet-unbanked">
              <i class="fa-solid fa-circle-info"></i>
              Not in NPC Bank yet — banks fill automatically when the AI emits a "🆕 New NPC" dossier.
           </div>`;

    const html = `
        <div id="${SHEET_ID}" class="meg-pb-sheet ${accentClass}" role="dialog" aria-modal="true">
            <div class="meg-pb-sheet-backdrop"></div>
            <div class="meg-pb-sheet-card">
                <button class="meg-pb-sheet-close" type="button" aria-label="Close" title="Close (Esc)">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <div class="meg-pb-sheet-head">
                    <div class="meg-pb-sheet-portrait">${portraitInner}</div>
                    <div class="meg-pb-sheet-titles">
                        <div class="meg-pb-sheet-name">${escapeHtml(entry.name)}</div>
                        ${ageSex ? `<div class="meg-pb-sheet-meta">${escapeHtml(ageSex)}</div>` : ""}
                        ${(banked?.role || banked?.occupation) ? `<div class="meg-pb-sheet-occ">${escapeHtml(banked.role || banked.occupation)}</div>` : ""}
                    </div>
                </div>
                <div class="meg-pb-sheet-body">
                    ${sceneSection || `<div class="meg-pb-sheet-empty">No scene-specific info parsed for this character in the last reply.</div>`}
                    ${bankSection}
                </div>
                <div class="meg-pb-sheet-footer">
                    ${bookBtn}
                </div>
            </div>
        </div>
    `;

    closeCharacterSheet();
    document.body.insertAdjacentHTML("beforeend", html);
    const root = document.getElementById(SHEET_ID);
    if (!root) return;

    // Wire up close handlers
    root.querySelector(".meg-pb-sheet-backdrop").addEventListener("click", closeCharacterSheet);
    root.querySelector(".meg-pb-sheet-close").addEventListener("click", closeCharacterSheet);

    const bookEl = root.querySelector("#meg-pb-sheet-book-btn");
    if (bookEl && banked && typeof openInBook === "function") {
        bookEl.addEventListener("click", () => {
            try { openInBook(banked.name || entry.name); } catch (e) { /* */ }
            closeCharacterSheet();
        });
    }

    // Fade-in animation hook
    requestAnimationFrame(() => root.classList.add("meg-pb-sheet-shown"));
}

export function closeCharacterSheet() {
    const root = document.getElementById(SHEET_ID);
    if (root) root.remove();
}
