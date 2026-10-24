// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 — the image cast: everyone who can be written as @Name, with the
// look and outfit that @Name turns into.
//
//   look    ← the stored look (Image Gen tab), else the NPC Bank's Image Tags
//   outfit  ← World State (current for those present, last known for the rest)
//   who is present / nicknames ← World State
//
// Pure: the caller hands in the stored looks, the World State and the NPC Bank.
// ────────────────────────────────────────────────────────────────────────────

import { splitLookTags, sexOf } from "./lookParts.js";
import { freshOutfitTags } from "./looksCore.js";

const key = s => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, "").replace(/\s+/g, " ").trim();

// A stored look in two parts. Looks saved before the split (one tag list) are
// split on the fly; nothing is written back until the user edits them.
function lookParts(entry) {
    if (typeof entry.body === "string") return { always: String(entry.tags || "").trim(), body: entry.body.trim() };
    return splitLookTags(entry.tags || "");
}

/** Who an image can show: the scene and anyone just named, plus the player unless the shot is through their eyes. */
export function inImage(m, shot) {
    return m.isPc ? shot !== "pov" : Boolean(m.inScene || m.mentioned);
}

/** Someone the image may show who has no look yet (a look is read for them in the same call). */
export function needsLook(m, shot) {
    const shown = m.isPc ? shot !== "pov" : m.inScene;
    return Boolean(shown) && !String(m.look || m.body || m.lookNatural || "").trim();
}

/**
 * @param {{
 *   looks?: Record<string, { tags?: string, natural?: string, aliases?: string[] }>,
 *   world?: object|null,           // World State (state store shape) or null
 *   npcs?: Array<{ name: string, imageTags?: string }>,
 *   userName?: string,             // persona name
 *   recentText?: string,           // for "mentioned" (absent but just named)
 *   npcFirst?: boolean,            // NPC Bank Image Tags win over a stored look
 *   outfitTags?: boolean           // use detailed outfit tags when they are fresh
 * }} src
 * @returns {Array<{ name: string, aliases: string[], look: string, body: string, sex: string, lookNatural: string,
 *                   outfit: string, isPc: boolean, inScene: boolean, mentioned: boolean, lookSource: string }>}
 *   look = the always part; body = build and proportions (full-body shots only)
 */
export function buildImageCast({ looks = {}, world = null, npcs = [], userName = "", recentText = "", npcFirst = false, outfitTags = false } = {}) {
    const members = [];
    const find = name => {
        const k = key(name);
        if (!k) return null;
        return members.find(m => key(m.name) === k || m.aliases.some(a => key(a) === k)) || null;
    };
    const add = m => { members.push(m); return m; };
    const blank = (name, extra = {}) => ({
        name, aliases: [], look: "", body: "", sex: "", lookNatural: "", outfit: "", position: "",
        lookKey: "", outfitText: "", outfitStale: false, outfitCache: null,
        isPc: false, inScene: false, mentioned: false, lookSource: "", ...extra
    });

    // 1. The player.
    const pcName = (world && world.pc && world.pc.name) || userName || "";
    if (pcName) {
        add(blank(pcName, {
            isPc: true,
            inScene: true,
            outfit: (world && world.pc && world.pc.fields && world.pc.fields.outfit) || "",
            position: (world && world.pc && world.pc.fields && world.pc.fields.position) || "",
            aliases: userName && key(userName) !== key(pcName) ? [userName] : []
        }));
    }

    // 2. Everyone World State knows, present or not.
    for (const c of Object.values((world && world.cast) || {})) {
        if (!c || !c.name || find(c.name)) continue;
        add(blank(c.name, {
            aliases: [...(c.aliases || [])],
            inScene: Boolean(c.present),
            outfit: (c.fields && c.fields.outfit) || "",
            position: (c.present && c.fields && c.fields.position) || ""
        }));
    }

    // 3. Stored looks: attach to a known member, or add them as absent.
    //    Exact names and nicknames first; then a look saved under a first name
    //    finds the full name World State uses ("Anno" ↔ "Anno Ryo"), when only
    //    one member without a look fits.
    const firstWord = s => key(s).split(" ")[0];
    const byFirstName = name => {
        const f = firstWord(name);
        if (f.length < 3) return null;
        const hits = members.filter(m => !m.lookKey && [m.name, ...m.aliases].some(n => firstWord(n) === f));
        return hits.length === 1 ? hits[0] : null;
    };
    const pending = [];
    for (const [name, entry] of Object.entries(looks || {})) {
        if (!entry) continue;
        const lookName = name === "{{user}}" ? pcName : name;
        if (!lookName) continue;
        const m = find(lookName) || (entry.aliases || []).map(find).find(Boolean) || null;
        if (m) attachLook(m, name, entry); else pending.push([name, entry, lookName]);
    }
    for (const [name, entry, lookName] of pending) {
        let m = byFirstName(lookName);
        if (m) m.aliases.push(lookName);   // so @Anno and the look's own name still find them
        else m = add(blank(lookName));
        attachLook(m, name, entry);
    }

    function attachLook(m, name, entry) {
        m.lookKey = name;
        m.outfitCache = entry.outfitTags || null;
        const parts = lookParts(entry);
        if (parts.always || parts.body || String(entry.natural || "").trim()) {
            m.look = parts.always;
            m.body = parts.body;
            m.lookNatural = String(entry.natural || "").trim();
            m.lookSource = entry.source || "manual";
        }
        for (const a of entry.aliases || []) {
            if (a && key(a) !== key(m.name) && !m.aliases.some(x => key(x) === key(a))) m.aliases.push(a);
        }
    }

    // 4. NPC Bank Image Tags where there is no stored look.
    for (const n of npcs || []) {
        if (!n || !n.name) continue;
        const tags = String(n.imageTags || "").trim();
        if (!tags) continue;
        const m = find(n.name);
        // Normally a stored look wins; with npcFirst the NPC Bank's tags do.
        if (m && (npcFirst || (!m.look && !m.body && !m.lookNatural))) {
            const parts = splitLookTags(tags);
            m.look = parts.always;
            m.body = parts.body;
            m.lookSource = "npc";
        }
    }

    for (const m of members) {
        m.sex = sexOf(`${m.look}, ${m.body}`);
        // Detailed outfit tags, when made from THIS outfit (or locked).
        // Otherwise the World State text is used and the tags get remade.
        if (outfitTags && String(m.outfit || "").trim()) {
            const tags = freshOutfitTags(m.outfitCache, m.outfit);
            m.outfitText = m.outfit;
            if (tags) m.outfit = tags; else m.outfitStale = true;
        }
    }

    // 5. Absent characters named in the recent text may be about to appear.
    const text = " " + key(recentText) + " ";
    for (const m of members) {
        if (m.isPc || m.inScene) continue;
        m.mentioned = [m.name, ...m.aliases].some(n => key(n) && text.includes(" " + key(n) + " "));
    }
    return members;
}
