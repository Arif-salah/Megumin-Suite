import { resolvePortrait } from "../core/portraits.js";
/* eslint-disable no-undef */
/*
 * Megumin Suite — Side Panel shared DOM helpers
 * Tiny element builder + escaping + avatar rendering, shared by
 * panel.js and sections.js. No state, no side effects.
 */

export function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") e.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
        else if (k === "html") e.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v !== null && v !== undefined) e.setAttribute(k, v);
    }
    for (const c of children) {
        if (c == null || c === false) continue;
        if (Array.isArray(c)) {
            for (const sub of c) {
                if (sub == null || sub === false) continue;
                e.appendChild(typeof sub === "string" ? document.createTextNode(sub) : sub);
            }
        } else {
            e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
        }
    }
    return e;
}

export function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function isMaleSex(sexStr) {
    return (sexStr || "").trim().toLowerCase().startsWith("m");
}

export function avatarNode(npc, name, { portrait = true } = {}) {
    const fallbackChar = (name || "?").trim().charAt(0).toUpperCase();
    const male = npc ? isMaleSex(npc.sex) : null;
    // A face can come from the bank record or from the profile portrait map
    // (auto portraits for characters that were never banked).
    // Callers that want the initial only (Inner Chatter) pass portrait: false.
    const pfp = portrait ? ((npc && npc.pfp) || resolvePortrait(name)) : "";
    const accentClass = male === true ? "meg-sp-av-male"
                       : male === false ? "meg-sp-av-female"
                       : "meg-sp-av-neutral";
    if (pfp) {
        return el("div", { class: "meg-sp-av " + accentClass },
            el("img", { src: pfp, alt: name || "NPC", onerror: function () { this.style.display = "none"; } }));
    }
    return el("div", { class: "meg-sp-av meg-sp-av-empty " + accentClass },
        el("span", { class: "meg-sp-av-initial" }, fallbackChar));
}
