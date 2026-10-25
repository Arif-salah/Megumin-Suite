// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 — looks: scans, the review popup, natural descriptions, and the
// automatic look for a character who just arrived (+ Name in World State).
//
// Established looks change only when the user clicks a scan, and then only
// through the review popup. The automatic scan only ever ADDS a look for
// someone who has none.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, generateQuietPrompt, Popup, POPUP_TYPE } from "../../../st.js";
import { localProfile } from "../../../core/state.js";
import { saveProfileToMemory } from "../../../core/profile.js";
import { setActiveImageGenRequest } from "../../../core/activeRequests.js";
import { runWithChomusuke } from "../../../engine/tasks.js";
import { meguminCleanChatHistoryText } from "../../../engine/chatText.js";
import { worldEnabled, worldHasState, getWorldState } from "../../../state/index.js";
import { buildCharacterSheets } from "../classic/prompt.js";
import { getLooks, currentImageCast, v2Settings } from "./index.js";
import { splitLookTags } from "./lookParts.js";
import { inImage, needsLook } from "./cast.js";
import { loreForNames, loreBlock } from "../../../core/lore.js";
import { imageViaChomusuke } from "../auto.js";
import {
    LOOK_SCAN_SYSTEM, renderLookScanPrompt, parseLookBlocks, planLookUpdates, findLookKey, sheetNames, lookSourceFor,
    NATURAL_SYSTEM, renderNaturalPrompt, parseNaturalBlocks, matchScanToTargets,
    OUTFIT_SYSTEM, renderOutfitTagsPrompt, parseOutfitBlocks, outfitHash
} from "./looksCore.js";

const esc = v => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// One background call through Chomusuke's Image Generation route (or the main
// model when that route is off). The marker is set inside the job: Chomusuke
// runs are queued.
async function ask(system, user) {
    const raw = await runWithChomusuke("imageGen", async () => {
        setActiveImageGenRequest({ v2: { system, user } });
        try {
            return await generateQuietPrompt({ prompt: "___PS_IMAGE_GEN___" });
        } finally {
            setActiveImageGenRequest(null);
        }
    });
    return String(raw || "");
}

function chatSource(count = 30) {
    const chat = (getContext() && getContext().chat) || [];
    return chat.filter(m => m && !m.is_system).slice(-count)
        .map(m => `${m.name}: ${meguminCleanChatHistoryText(m.mes)}`).join("\n\n");
}

export function sheetSource() {
    return buildCharacterSheets().replace(/^Use these sheets for what each character looks like:\s*/, "").trim();
}

/** The sheets plus the lorebook entries about these characters, for a look read in an image call. */
export async function sheetSourceFor(members) {
    const lore = loreBlock(await loreForNames((members || []).flatMap(m => [m.name, ...(m.aliases || [])])), "lore");
    return [sheetSource(), lore].filter(Boolean).join("\n\n");
}

// A look for someone on the card counts as read from the card.
function autoSource(item) {
    return lookSourceFor(item.key, item.aliases, sheetNames(buildCharacterSheets()));
}

function writeLook(looks, item, source) {
    const k = item.key;
    const cur = looks[k] || {};
    const aliases = [...(cur.aliases || [])];
    for (const a of item.aliases || []) {
        if (a && a.toLowerCase() !== k.toLowerCase() && !aliases.some(x => x.toLowerCase() === a.toLowerCase())) aliases.push(a);
    }
    // Saved in two parts: what shows in any shot, and the body (full-body shots only).
    const parts = splitLookTags(item.tags);
    // New tags make an old natural description stale; it is remade on request.
    const changed = (cur.tags || "") !== parts.always || (cur.body || "") !== parts.body;
    const natural = cur.tags && changed ? "" : (cur.natural || "");
    looks[k] = { ...cur, tags: parts.always, body: parts.body, natural, aliases, locked: Boolean(cur.locked), source, updatedAt: Date.now() };
}

// ── The review popup (established looks) ────────────────────────────────

async function reviewChanges(plan) {
    if (!plan.change.length) return [];
    const rows = plan.change.map((c, i) => `
        <div class="ig2-review-row">
            <div class="ig2-review-name"><b>${esc(c.key)}</b></div>
            <div class="ig2-review-tags"><span>Now</span>${esc(c.old)}</div>
            <div class="ig2-review-tags new"><span>Scan</span>${esc(c.tags)}</div>
            <div class="ig2-review-pick">
                <label><input type="radio" name="ig2r${i}" value="keep" checked> Keep</label>
                <label><input type="radio" name="ig2r${i}" value="new"> Use new</label>
            </div>
        </div>`).join("");
    const $body = $(`
        <div class="ig2-review">
            <div class="ig2-review-head">The scan found a different look for ${plan.change.length === 1 ? "this character" : "these characters"}. Choose what to keep:</div>
            <div class="ig2-review-all">
                <button type="button" class="menu_button ig2-keep-all">Keep all</button>
                <button type="button" class="menu_button ig2-use-all">Use all new</button>
            </div>
            ${rows}
            ${plan.locked.length ? `<div class="ig2-review-locked"><i class="fa-solid fa-lock"></i> Locked, not changed: ${plan.locked.map(l => esc(l.key)).join(", ")}</div>` : ""}
        </div>
    `);
    $body.find(".ig2-keep-all").on("click", () => $body.find('input[value="keep"]').prop("checked", true));
    $body.find(".ig2-use-all").on("click", () => $body.find('input[value="new"]').prop("checked", true));
    const ok = await new Popup($body, POPUP_TYPE.CONFIRM, "Review looks", { okButton: "Apply", cancelButton: "Keep all", wide: true }).show();
    if (!ok) return [];
    return plan.change.filter((c, i) => $body.find(`input[name="ig2r${i}"]:checked`).val() === "new");
}

// ── Scans ────────────────────────────────────────────────────────────────

/**
 * @param {{ from: "sheet"|"chat"|"auto", targets?: Array<{ name: string, aliases?: string[] }>, interactive?: boolean }} opts
 *   from: "auto" = the recent chat plus the card's sheets (the card wins), for
 *     a character who just arrived; "chat" and "sheet" read only that one.
 *   targets: only these characters (by name or nickname); empty = everyone the text describes.
 *   interactive: false (the automatic scan) only ever adds missing looks.
 * @returns {Promise<{ added: string[], changed: string[], locked: string[], same: string[] } | null>}
 */
export async function scanLooks({ from, targets = [], interactive = true }) {
    const names = targets.map(t => t.name);
    const source = from === "sheet" ? sheetSource() : chatSource();
    const sheets = from === "auto" ? sheetSource() : "";
    // What the lorebook says about them (everyone in the image cast when no one is named).
    const lore = await loreForNames(targets.length
        ? targets.flatMap(t => [t.name, ...(t.aliases || [])])
        : currentImageCast().flatMap(m => [m.name, ...(m.aliases || [])]));
    if (!source && !lore && !sheets) {
        if (interactive) toastr.info(from === "sheet" ? "No character or persona description to read." : "The chat is empty.", "Megumin Suite");
        return null;
    }
    const chatAtStart = getContext()?.chatId;
    const user = renderLookScanPrompt({ source, sourceLabel: from === "sheet" ? "Character_Sheets" : "Recent_Story", names, lore, sheets });
    const raw = await ask(LOOK_SCAN_SYSTEM, user);
    if (getContext()?.chatId !== chatAtStart) return null; // the user moved on: this belongs to another chat

    const scanned = matchScanToTargets(parseLookBlocks(raw), targets);
    if (!scanned.length) {
        if (interactive) toastr.warning("The scan found no appearance to use.", "Megumin Suite");
        return { added: [], changed: [], locked: [], same: [] };
    }

    const looks = getLooks();
    const plan = planLookUpdates(looks, scanned);
    const src = item => from === "auto" ? autoSource(item) : from === "sheet" ? "sheet" : "chat";
    for (const item of plan.add) writeLook(looks, item, src(item));
    const accepted = interactive ? await reviewChanges(plan) : [];
    for (const item of accepted) writeLook(looks, item, src(item));
    // Nicknames the scan found are worth keeping even where the tags were not.
    for (const item of [...plan.same, ...plan.locked, ...plan.change]) {
        const cur = looks[item.key];
        if (!cur) continue;
        cur.aliases = cur.aliases || [];
        for (const a of item.aliases) if (!cur.aliases.some(x => x.toLowerCase() === a.toLowerCase()) && a.toLowerCase() !== item.key.toLowerCase()) cur.aliases.push(a);
    }
    saveProfileToMemory();

    const result = {
        added: plan.add.map(x => x.key),
        changed: accepted.map(x => x.key),
        locked: plan.locked.map(x => x.key),
        same: plan.same.map(x => x.key)
    };
    if (interactive) {
        const bits = [];
        if (result.added.length) bits.push(`added ${result.added.join(", ")}`);
        if (result.changed.length) bits.push(`updated ${result.changed.join(", ")}`);
        if (!bits.length) bits.push("no changes");
        toastr.success(`Looks: ${bits.join("; ")}.`, "Megumin Suite");
    }
    return result;
}

/** Natural descriptions for the given looks (default: every look without one). */
export async function describeLooks(names = null) {
    const looks = getLooks();
    const targets = Object.entries(looks)
        .filter(([k, v]) => v && String(v.tags || "").trim() && (names ? names.includes(k) : !String(v.natural || "").trim()))
        .map(([k, v]) => ({ name: k, tags: v.tags }));
    if (!targets.length) {
        toastr.info("Every look already has a description.", "Megumin Suite");
        return 0;
    }
    const chatAtStart = getContext()?.chatId;
    const raw = await ask(NATURAL_SYSTEM, renderNaturalPrompt(targets));
    if (getContext()?.chatId !== chatAtStart) return 0;
    let n = 0;
    for (const d of parseNaturalBlocks(raw)) {
        const k = findLookKey(looks, d.name);
        if (k && looks[k]) { looks[k].natural = d.natural; n++; }
    }
    saveProfileToMemory();
    toastr[n ? "success" : "warning"](n ? `Described ${n} look${n === 1 ? "" : "s"}.` : "No descriptions came back.", "Megumin Suite");
    return n;
}

// ── A character just arrived ─────────────────────────────────────────────

const attempted = new Set();   // "chatId|name": one automatic try per character per chat

/** Characters with no look yet, not tried in this chat: marked as tried. */
export function takeLookAttempts(chatId, members) {
    const out = members.filter(m => !attempted.has(`${chatId}|${m.name.toLowerCase()}`));
    out.forEach(m => attempted.add(`${chatId}|${m.name.toLowerCase()}`));
    return out;
}

// Once per character per chat: someone the image could show has no look, so
// they are left out of <Cast> (and so out of the picture).
const warned = new Set();

/** Warns about anyone the image could show who has no look and is not being asked for one. */
export function warnLooklessInScene(chatId, cast, shot, asked = []) {
    const askedNames = new Set(asked.map(m => m.name.toLowerCase()));
    const names = (cast || [])
        .filter(m => needsLook(m, shot) && !askedNames.has(m.name.toLowerCase()) && !warned.has(`${chatId}|${m.name.toLowerCase()}`))
        .map(m => m.name);
    if (!names.length) return;
    names.forEach(n => warned.add(`${chatId}|${n.toLowerCase()}`));
    toastr.warning(`${names.join(", ")} ${names.length === 1 ? "has" : "have"} no look yet, so ${names.length === 1 ? "they are" : "they are all"} left out of images. Add a look or scan one in Image Gen › V2.`,
        "Megumin Suite", { timeOut: 9000 });
}

/** Warns about looks that were asked for and did not come back. */
export function warnLooksNotMade(asked, added) {
    const got = new Set((added || []).map(n => n.toLowerCase()));
    const missed = (asked || []).map(m => m.name).filter(n => !got.has(n.toLowerCase()));
    if (!missed.length) return;
    toastr.warning(`Couldn't make a look for ${missed.join(", ")} from the story. ${missed.length === 1 ? "They are" : "They are all"} left out of images until you add a look or scan one in Image Gen › V2.`,
        "Megumin Suite", { timeOut: 9000 });
}

/** The call failed or came back empty: these get asked for again next image. */
export function releaseLookAttempts(chatId, members) {
    (members || []).forEach(m => attempted.delete(`${chatId}|${m.name.toLowerCase()}`));
}

/**
 * Someone in the scene has no look (and no NPC Bank tags): read one for them
 * from the card and the recent chat, in the background, and add it. Never changes an
 * existing look. Only while V2 is the active image engine.
 */
export function v2LooksForArrivals() {
    const ig = localProfile && localProfile.imageGen;
    if (!ig || !ig.enabled || ig.engine !== "v2" || !worldEnabled() || !worldHasState()) return;
    // When images are written by a background call (Chomusuke's automatic
    // images, or the manual button only), that call brings missing looks in the
    // same answer, and warns. Only when the story model writes images inline is
    // there no call to ride on, so only then does a look get a call of its own.
    if (imageViaChomusuke() || ig.triggerMode === "manual") return;
    const chatId = getContext()?.chatId;
    if (!chatId) return;
    const cfg = v2Settings();
    // The image cast already knows who has a look (stored, NPC Bank, or one
    // saved under a first name), so it decides who is missing one.
    const cast = currentImageCast();
    const missing = cfg.autoLooks === false ? [] : cast    // off: "Automatic look for new characters"
        .filter(m => !m.isPc && needsLook(m) && !attempted.has(`${chatId}|${m.name.toLowerCase()}`))
        .map(m => ({ name: m.name, aliases: m.aliases || [] }));
    warnLooklessInScene(chatId, cast, cfg.shot, missing);
    if (!missing.length) return;
    missing.forEach(t => attempted.add(`${chatId}|${t.name.toLowerCase()}`));
    scanLooks({ from: "auto", targets: missing, interactive: false })
        .then(r => {
            if (!r || getContext()?.chatId !== chatId) return;
            if (r.added.length) toastr.info(`New look${r.added.length === 1 ? "" : "s"} for ${r.added.join(", ")}.`, "Megumin Suite", { timeOut: 3500 });
            warnLooksNotMade(missing, r.added);
        })
        .catch(e => console.error("[Megumin-Suite] Automatic look scan failed", e));
}

// ── Detailed outfit tags ─────────────────────────────────────────────────
// Made lazily, right before an image, only for outfits that changed since
// their tags were made (and are not locked): an outfit that changes three
// times between images costs one call, not three.

let outfitRefresh = null;

/**
 * Saves the <Outfit_Tags> blocks of an answer for the cast members they were
 * asked for, made from each one's current outfit. No calls: safe from inside
 * a Chomusuke job. @returns {number} saved
 */
export function storeOutfitTags(stale, raw) {
    const looks = getLooks();
    let n = 0;
    for (const r of parseOutfitBlocks(raw)) {
        const m = stale.find(x => [x.name, ...(x.aliases || [])].some(a => a.toLowerCase() === r.name.toLowerCase()));
        if (!m) continue;
        const k = m.lookKey || findLookKey(looks, m.name, m.aliases || []) || m.name;
        if (!looks[k]) looks[k] = { tags: "", body: "", natural: "", aliases: [], locked: false, source: "manual" };
        looks[k].outfitTags = { from: outfitHash(m.outfitText), tags: r.tags, locked: false };
        n++;
    }
    if (n) saveProfileToMemory();
    return n;
}

/**
 * Adds the <Character_Visual> blocks of an answer as NEW looks for the
 * characters they were asked for. Never changes an existing look. No calls.
 * @returns {string[]} names added
 */
export function storeNewLooks(targets, raw) {
    const looks = getLooks();
    const plan = planLookUpdates(looks, matchScanToTargets(parseLookBlocks(raw), targets));
    for (const item of plan.add) writeLook(looks, item, autoSource(item));
    if (plan.add.length) saveProfileToMemory();
    return plan.add.map(x => x.key);
}

/** Brings every stale outfit of the people in the shot up to date. */
export function refreshOutfitTags() {
    if (outfitRefresh) return outfitRefresh;
    const cfg = v2Settings();
    if (!cfg.outfitTags || cfg.style !== "tags") return Promise.resolve(0);
    const stale = currentImageCast().filter(m => m.outfitStale && inImage(m, cfg.shot));
    if (!stale.length) return Promise.resolve(0);

    const chatAtStart = getContext()?.chatId;
    outfitRefresh = (async () => {
        const raw = await ask(OUTFIT_SYSTEM, renderOutfitTagsPrompt(stale.map(m => ({ name: m.name, outfit: m.outfitText }))));
        if (getContext()?.chatId !== chatAtStart) return 0;
        return storeOutfitTags(stale, raw);
    })().catch(e => { console.error("[Megumin-Suite] Outfit tags failed", e); return 0; })
        .finally(() => { outfitRefresh = null; });
    return outfitRefresh;
}
