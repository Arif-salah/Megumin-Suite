// ────────────────────────────────────────────────────────────────────────────
// Lorebook entries for background calls.
//
// Background calls (looks, NPC Bank, Story Director) replace SillyTavern's
// whole prompt with their own, so the World Info it activated never reaches
// the model. These two helpers fetch it back, two ways:
//
//   loreForChat()      — what SillyTavern itself would activate for the recent
//                        chat (a dry run: no timers, no events, its own budget).
//   loreForNames([..]) — every entry whose keys or title name one of these
//                        characters (full name or first name), for calls about
//                        specific people (looks, one NPC, a portrait).
//
// One install-wide switch: globalSettings.loreInTasks (missing = on).
// Never throws: a lorebook problem just means no lore in that call.
// ────────────────────────────────────────────────────────────────────────────

import { extension_settings, getContext, substituteParams, checkWorldInfo, getSortedEntries } from "../st.js";
import { extensionName } from "./constants.js";

export function loreInTasksEnabled() {
    const gs = extension_settings[extensionName]?.globalSettings;
    return !gs || gs.loreInTasks !== false;
}

const sub = t => { try { return substituteParams(t); } catch (e) { return t; } };
const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const wordIn = (text, word) => new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(text);

/** The entries SillyTavern would activate for the recent chat, as one text. */
export async function loreForChat() {
    if (!loreInTasksEnabled()) return "";
    try {
        const ctx = getContext();
        const chat = (ctx.chat || []).filter(m => m && !m.is_system).map(m => `${m.name}: ${m.mes}`).reverse();
        if (!chat.length) return "";
        const res = await checkWorldInfo(chat, Number(ctx.maxContext) || 8192, true);
        const depth = (res.WIDepthEntries || []).flatMap(d => d.entries || []);
        const parts = [res.worldInfoBefore, res.worldInfoAfter, ...(res.ANBeforeEntries || []), ...(res.ANAfterEntries || []), ...depth]
            .map(t => String(t || "").trim()).filter(Boolean);
        return sub([...new Set(parts)].join("\n\n"));
    } catch (e) {
        console.warn(`[${extensionName}] Lorebook read failed; going on without it.`, e);
        return "";
    }
}

/** Entries that name these characters, in lorebook order, up to maxChars. */
export async function loreForNames(names, { maxChars = 6000 } = {}) {
    if (!loreInTasksEnabled()) return "";
    const full = [...new Set((names || []).map(norm).filter(Boolean))];
    const wanted = [...new Set(full.flatMap(n => [n, n.split(" ")[0]]))].filter(w => w.length > 2);
    if (!wanted.length) return "";
    try {
        const entries = await getSortedEntries();
        const out = [];
        let size = 0;
        for (const e of entries || []) {
            if (!e || e.disable) continue;
            const content = String(e.content || "").trim();
            if (!content || out.includes(content)) continue;
            if (!entryNames(e, wanted, full)) continue;
            if (size + content.length > maxChars && out.length) break;
            out.push(content);
            size += content.length;
        }
        return sub(out.join("\n\n"));
    } catch (e) {
        console.warn(`[${extensionName}] Lorebook read failed; going on without it.`, e);
        return "";
    }
}

// A key that is a name ("Anno", "Anno Ryo"), a regex key that matches one,
// or a title that mentions one as a whole word.
function entryNames(e, wanted, full) {
    for (const raw of [...(e.key || []), ...(e.keysecondary || [])]) {
        const k = String(raw || "").trim();
        const rx = k.match(/^\/(.+)\/([a-z]*)$/i);
        if (rx) {
            try { if (full.some(n => new RegExp(rx[1], rx[2].replace(/g/g, "")).test(n))) return true; } catch (err) { /* bad regex key */ }
            continue;
        }
        const nk = norm(k);
        if (nk && (wanted.includes(nk) || full.some(n => wordIn(nk, n)))) return true;
    }
    const title = norm(e.comment);
    return Boolean(title) && wanted.some(w => wordIn(title, w));
}

/** Wraps lore for a prompt; empty when there is none. */
export function loreBlock(text, tag = "Lore") {
    const t = String(text || "").trim();
    return t ? `<${tag}>\n${t}\n</${tag}>` : "";
}
