// ────────────────────────────────────────────────────────────────────────────
// Character portraits — one lookup for every place a face is drawn.
//
// A portrait can live in two places. Banked NPCs keep theirs on the NPC Bank
// record (`npc.pfp`), which is what the bank card, the Present Characters bar
// and the side panel already read. Characters that are in the scene but not
// (yet) in the bank had nowhere to keep one, so the World State card and the
// Inner Chatter bubble fell back to an initial even after a portrait existed
// elsewhere. `localProfile.portraits` is that missing home: a name-keyed map
// on the profile, filled by the automatic portrait generator.
//
// resolvePortrait(name) is the single question every renderer asks. The bank
// record wins when it has a picture (the reader may have uploaded one), the
// profile map answers otherwise, and the same first-name fallback the side
// panel uses keeps "Tammy" and "Tammy Vance" pointing at one face.
// ────────────────────────────────────────────────────────────────────────────
import { localProfile } from "./state.js";
import { saveProfileToMemory } from "./profile.js";

export function portraitKey(name) {
    return (name || "").trim().toLowerCase();
}

// Same matching the side panel's lookupBankedNpc does: exact name first, then
// first word, so a card that says "Tammy" finds the dossier filed as "Tammy Vance".
export function findBankedNpc(name) {
    const target = portraitKey(name);
    if (!target) return null;
    const npcs = localProfile?.npcBank?.npcs;
    if (!Array.isArray(npcs)) return null;
    const targetFirst = target.split(/\s+/)[0];
    let firstNameHit = null;
    for (const n of npcs) {
        const nm = portraitKey(n.name);
        if (!nm) continue;
        if (nm === target) return n;
        if (!firstNameHit && nm.split(/\s+/)[0] === targetFirst) firstNameHit = n;
    }
    return firstNameHit;
}

export function resolvePortrait(name) {
    const key = portraitKey(name);
    if (!key) return "";
    const banked = findBankedNpc(name);
    if (banked && banked.pfp) return banked.pfp;
    const map = localProfile?.portraits;
    if (!map || typeof map !== "object") return "";
    if (map[key]) return map[key];
    const first = key.split(/\s+/)[0];
    for (const [k, v] of Object.entries(map)) {
        if (v && k.split(/\s+/)[0] === first) return v;
    }
    return "";
}

export function hasPortrait(name) {
    return Boolean(resolvePortrait(name));
}

// Stores a generated portrait where the renderers will find it: on the bank
// record when the character is banked, on the profile map otherwise. A name
// that gets banked later still resolves, because resolvePortrait falls
// through to the map when the new record has no picture of its own.
export function setPortrait(name, dataUrl) {
    const key = portraitKey(name);
    if (!key || !dataUrl) return false;
    const banked = findBankedNpc(name);
    if (banked) {
        banked.pfp = dataUrl;
    } else {
        if (!localProfile.portraits || typeof localProfile.portraits !== "object") localProfile.portraits = {};
        localProfile.portraits[key] = dataUrl;
    }
    saveProfileToMemory();
    return true;
}

// When a character that already has an auto portrait gets banked, the picture
// moves onto the bank record. The NPC Book card, the side panel's bank list and
// the vision hand-off all read the record directly, so without this move the
// bank would show an empty portrait next to a Present Characters card that has
// one, and a click on Generate would make a second, different face.
export function adoptPortraitIntoRecord(record) {
    if (!record || record.pfp) return false;
    const map = localProfile?.portraits;
    if (!map || typeof map !== "object") return false;
    const key = portraitKey(record.name);
    if (!key) return false;
    let hit = map[key] ? key : null;
    if (!hit) {
        const first = key.split(/\s+/)[0];
        hit = Object.keys(map).find(k => map[k] && k.split(/\s+/)[0] === first) || null;
    }
    if (!hit) return false;
    record.pfp = map[hit];
    delete map[hit];
    return true;
}
