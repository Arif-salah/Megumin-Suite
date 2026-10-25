// ────────────────────────────────────────────────────────────────────────────
// Images, Version 2 — Characters page: one small card per character (where
// they are, their look, what they're wearing). A click opens a popup with that
// character's look to edit. Everyone away is folded under one line.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../../core/state.js";
import { saveProfileToMemory } from "../../../core/profile.js";
import { Popup, POPUP_TYPE } from "../../../st.js";
import { v2Settings, currentImageCast, getLooks } from "./index.js";
import { scanLooks, describeLooks, sheetSource } from "./looks.js";
import { findLookKey, outfitHash } from "./looksCore.js";
import { card, busy, esc } from "../../../ui/controls.js";

const SOURCE_LABEL = { npc: "from the NPC Bank", sheet: "read from the card", chat: "read from the chat", manual: "written by you" };

// The away fold stays open across redraws once opened.
let awayOpen = false;

const inStory = m => m.isPc || m.inScene || m.mentioned;
const whereOf = m => (m.isPc ? "you" : m.inScene ? "in the scene" : m.mentioned ? "mentioned" : "away");
const whereClass = m => (m.isPc || m.inScene ? "ok" : m.mentioned ? "warm" : "");

// The stored look for a cast member, created on first edit.
function lookFor(member) {
    const looks = getLooks();
    let k = findLookKey(looks, member.name, member.aliases || []);
    if (!k) {
        k = member.name;
        const fromNpc = member.lookSource === "npc";
        looks[k] = { tags: fromNpc ? member.look : "", body: fromNpc ? member.body : "", natural: "", aliases: [], locked: false, source: "manual" };
    }
    return { key: k, look: looks[k] };
}

export function renderCharacters(c, { redraw }) {
    const cfg = v2Settings();
    const cast = currentImageCast();
    const looks = getLooks();
    const castNow = cast.filter(inStory);
    const castAway = cast.filter(m => !inStory(m));

    const box = card("In the story now", "Each character keeps the same look in every image. Click a card to change it.");
    const $tools = $(`<div class="igx-actions">
        <button type="button" class="menu_button igx-btn igx-scan-sheet" title="Read every character on the card, and your persona"><i class="fa-solid fa-id-card"></i> Read looks from the card</button>
        <button type="button" class="menu_button igx-btn igx-scan-chat" title="Read looks from the recent chat for characters who have none"><i class="fa-solid fa-comments"></i> Read looks from the chat</button>
        ${cfg.style === "natural" ? `<button type="button" class="menu_button igx-btn igx-describe" title="Write a plain description for every look that has none"><i class="fa-solid fa-feather"></i> Describe the missing ones</button>` : ""}
        <button type="button" class="menu_button igx-btn gold igx-add"><i class="fa-solid fa-plus"></i> Add character</button>
    </div>`);
    box.find(".igx-card-title").after($tools);

    const cardFor = m => {
        const k = findLookKey(looks, m.name, m.aliases || []);
        const stored = k ? looks[k] : null;
        const lookText = m.look || (cfg.style === "natural" ? m.lookNatural : "") || "";
        const $c = $(`<button type="button" class="igx-char ${inStory(m) ? "" : "is-away"}">
            <span class="igx-char-head"><b>${esc(m.name)}</b><span class="igx-chip ${whereClass(m)}">${whereOf(m)}</span></span>
            <span class="igx-char-line"><em>Look</em>${lookText ? esc(lookText) : `<i>none yet</i>`}</span>
            ${inStory(m) ? `<span class="igx-char-line"><em>Wearing</em>${m.outfit || m.outfitText ? esc(m.outfitText || m.outfit) : `<i>not in World State yet</i>`}</span>` : ""}
            ${stored && stored.locked ? `<span class="igx-chip"><i class="fa-solid fa-lock"></i> Look locked</span>` : ""}
        </button>`);
        $c.on("click", () => openLookEditor(m.name, redraw));
        return $c;
    };

    const $grid = $(`<div class="igx-chars"></div>`);
    castNow.forEach(m => $grid.append(cardFor(m)));
    if (!castNow.length) $grid.append(`<div class="igx-note">No one in the scene yet. Read the looks from the card, or add a character.</div>`);
    box.append($grid);

    if (castAway.length) {
        const label = open => `<i class="fa-solid fa-chevron-${open ? "down" : "right"}"></i> ${open ? "Hide" : "Show"} ${castAway.length} ${castAway.length === 1 ? "character who is" : "characters who are"} away`;
        const $fold = $(`<button type="button" class="igx-fold">${label(awayOpen)}</button>`);
        const $away = $(`<div class="igx-stack" style="display:${awayOpen ? "flex" : "none"};">
            <div class="igx-note">Only characters in the scene or just mentioned go into an image. These are kept so they look the same if they come back.</div>
        </div>`);
        const $awayGrid = $(`<div class="igx-chars"></div>`);
        castAway.forEach(m => $awayGrid.append(cardFor(m)));
        $away.append($awayGrid);
        $fold.on("click", () => {
            awayOpen = !awayOpen;
            $fold.html(label(awayOpen));
            $away.css("display", awayOpen ? "flex" : "none");
        });
        box.append($fold).append($away);
    }
    c.append(box);

    busy($tools.find(".igx-scan-sheet"), () => scanLooks({ from: "sheet" }), redraw);
    busy($tools.find(".igx-scan-chat"), () => {
        const need = cast.filter(m => !String(m.look || m.body || m.lookNatural || "").trim()).map(m => ({ name: m.name, aliases: m.aliases || [] }));
        if (!need.length) { toastr.info("Everyone already has a look. To read one again, open that character.", "Megumin Suite"); return; }
        return scanLooks({ from: "chat", targets: need });
    }, redraw);
    busy($tools.find(".igx-describe"), () => describeLooks(), redraw);
    $tools.find(".igx-add").on("click", async () => {
        const name = String(await Popup.show.input("Add a character", "Their name, as the story writes it.", "") || "").trim();
        if (!name) return;
        const all = getLooks();
        if (!findLookKey(all, name)) all[name] = { tags: "", natural: "", aliases: [], locked: false, source: "manual" };
        saveProfileToMemory();
        redraw();
        openLookEditor(name, redraw);
    });
}

// ── The popup ────────────────────────────────────────────────────────────

async function openLookEditor(name, redraw) {
    const $root = $(`<div class="igx-editor"></div>`);
    let popup = null;
    let gone = false;

    const draw = () => {
        $root.empty();
        const cfg = v2Settings();
        const member = currentImageCast().find(m => m.name === name);
        if (!member) { $root.append(`<div class="igx-note">This character is no longer kept.</div>`); return; }
        const looks = getLooks();
        const k = findLookKey(looks, member.name, member.aliases || []);
        const stored = k ? looks[k] : null;
        const detailed = cfg.outfitTags && cfg.style === "tags";
        const outfitLocked = Boolean(stored && stored.outfitTags && stored.outfitTags.locked);
        const nicknames = [...new Set([...(stored ? stored.aliases || [] : []), ...(member.aliases || [])])].join(", ");
        // A card can describe more than its own character, so the button shows whenever there is one.
        const hasCard = Boolean(sheetSource());

        $root.append(`
            <div class="igx-editor-head">
                <div><h3>${esc(member.name)}</h3><span>The story writes them as <b>@${esc(member.name)}</b>${member.lookSource ? ` · look ${esc(SOURCE_LABEL[member.lookSource] || member.lookSource)}` : ""}</span></div>
                <span class="igx-chip ${whereClass(member)}">${whereOf(member)}</span>
            </div>
            <label class="igx-field"><div class="igx-field-label">Nicknames <small>Other names the story uses, separated by commas</small></div>
                <input type="text" class="ps-modern-input igx-ed-aliases" value="${esc(nicknames)}" placeholder="Matt, Matty" /></label>
            <label class="igx-field"><div class="igx-field-label">Look <small>Permanent appearance, in every image</small></div>
                <textarea class="ps-modern-input igx-ed-tags" rows="3" placeholder="female, long blue hair, blue eyes, pale skin…">${esc(member.look)}</textarea></label>
            <label class="igx-field"><div class="igx-field-label">Body <small>Only in full-body shots</small></div>
                <textarea class="ps-modern-input igx-ed-body" rows="2" placeholder="slender, long legs…">${esc(member.body)}</textarea></label>
            ${cfg.style === "natural" ? `
            <label class="igx-field"><div class="igx-field-label">Description <small>The look in plain sentences, for the Plain sentences style</small></div>
                <textarea class="ps-modern-input igx-ed-natural" rows="2" placeholder="a slender young woman with long blue hair">${esc(stored ? stored.natural : "")}</textarea></label>` : ""}
            <div class="igx-field"><div class="igx-field-label">Wearing now <small>From World State. It changes when the story changes it.</small></div>
                <div class="igx-readonly">${member.outfitText || member.outfit ? esc(member.outfitText || member.outfit) : `<i>Nothing in World State yet, so the model describes it.</i>`}</div></div>
            ${detailed && member.outfitText ? `
            <div class="igx-field"><div class="igx-field-label">Outfit tags <small>${member.outfitStale ? "Remade before the next image" : "Made from the outfit above"}</small></div>
                <div class="igx-inline">
                    <input type="text" class="ps-modern-input igx-ed-outfit" value="${esc(member.outfitStale ? "" : member.outfit)}" placeholder="made before the next image" />
                    <button type="button" class="menu_button igx-btn igx-ed-outfit-lock ${outfitLocked ? "on" : ""}" title="${outfitLocked ? "Kept even when the story changes the outfit. Click to unlock." : "Keep these tags even when the story changes the outfit"}"><i class="fa-solid ${outfitLocked ? "fa-lock" : "fa-lock-open"}"></i></button>
                </div></div>` : ""}
            ${member.position ? `<div class="igx-field"><div class="igx-field-label">Where</div><div class="igx-readonly">${esc(member.position)}</div></div>` : ""}
            <div class="mtab-toggle-row igx-switch igx-ed-lock ${stored && stored.locked ? "active" : ""}">
                <div class="toggle-info"><div class="toggle-label">Lock this look</div><div class="toggle-desc">Reading looks again never changes it.</div></div>
                <div class="ps-switch"></div>
            </div>
            <div class="igx-actions">
                ${hasCard ? `<button type="button" class="menu_button igx-btn igx-ed-rescan-card" title="Read this character's look from the character card or your persona"><i class="fa-solid fa-id-card"></i> Read the look again from the card</button>` : ""}
                <button type="button" class="menu_button igx-btn igx-ed-rescan"><i class="fa-solid fa-magnifying-glass"></i> Read the look again from the chat</button>
                ${stored ? `<button type="button" class="menu_button igx-btn danger igx-ed-forget"><i class="fa-solid fa-trash"></i> Delete this look</button>` : ""}
            </div>
        `);

        // Both halves are saved together, so a look split on the fly becomes a
        // stored split the first time it is edited.
        $root.find(".igx-ed-tags, .igx-ed-body").on("change", () => {
            const { look } = lookFor(member);
            look.tags = String($root.find(".igx-ed-tags").val() || "").trim();
            look.body = String($root.find(".igx-ed-body").val() || "").trim();
            look.source = "manual";
            saveProfileToMemory();
        });
        $root.find(".igx-ed-natural").on("change", function () {
            const { look } = lookFor(member);
            look.natural = String($(this).val() || "").trim();
            saveProfileToMemory();
        });
        $root.find(".igx-ed-aliases").on("change", function () {
            const { key, look } = lookFor(member);
            look.aliases = String($(this).val() || "").split(",").map(a => a.trim())
                .filter((a, i, all) => a && a.toLowerCase() !== key.toLowerCase() && all.findIndex(x => x.toLowerCase() === a.toLowerCase()) === i);
            saveProfileToMemory();
        });
        // Outfit tags edited by hand count as made from the current outfit.
        $root.find(".igx-ed-outfit").on("change", function () {
            const { look } = lookFor(member);
            const tags = String($(this).val() || "").trim();
            const locked = Boolean(look.outfitTags && look.outfitTags.locked);
            look.outfitTags = tags ? { from: outfitHash(member.outfitText), tags, locked } : null;
            saveProfileToMemory();
        });
        $root.find(".igx-ed-outfit-lock").on("click", () => {
            const { look } = lookFor(member);
            const cur = look.outfitTags || { from: outfitHash(member.outfitText), tags: "", locked: false };
            if (!String(cur.tags || "").trim()) { toastr.info("There are no outfit tags to lock yet.", "Megumin Suite"); return; }
            look.outfitTags = { ...cur, locked: !cur.locked };
            saveProfileToMemory();
            draw();
        });
        $root.find(".igx-ed-lock").on("click", function () {
            const { look } = lookFor(member);
            look.locked = !look.locked;
            $(this).toggleClass("active", look.locked);
            saveProfileToMemory();
        });
        busy($root.find(".igx-ed-rescan"),
            () => scanLooks({ from: "chat", targets: [{ name: member.name, aliases: member.aliases || [] }] }),
            () => { if (!gone) draw(); });
        busy($root.find(".igx-ed-rescan-card"),
            () => scanLooks({ from: "sheet", targets: [{ name: member.name, aliases: member.aliases || [] }] }),
            () => { if (!gone) draw(); });
        const $forget = $root.find(".igx-ed-forget");
        $forget.on("click", () => {
            if ($forget.attr("data-armed") !== "1") {
                $forget.attr("data-armed", "1").html(`<i class="fa-solid fa-trash"></i> Click again to delete`);
                setTimeout(() => { $forget.attr("data-armed", "0").html(`<i class="fa-solid fa-trash"></i> Delete this look`); }, 3000);
                return;
            }
            const all = getLooks();
            const key = findLookKey(all, member.name, member.aliases || []);
            if (key) delete all[key];
            saveProfileToMemory();
            toastr.info(`${member.name}'s look is deleted.`, "Megumin Suite");
            if (popup) popup.completeCancelled();
        });
    };

    draw();
    popup = new Popup($root, POPUP_TYPE.TEXT, "", { wide: true, allowVerticalScrolling: true, okButton: "Done" });
    await popup.show();
    gone = true;
    redraw();
}
