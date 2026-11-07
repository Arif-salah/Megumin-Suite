// ────────────────────────────────────────────────────────────────────────────
// The scene list (plan 022): the story model writes who is in the scene at
// the end of every reply, first in <Blocks>:
//
//   <Scene>
//   Here: Lona, +Mira
//   Remote: Kade
//   </Scene>
//
// Here = physically there, Remote = talking with {{user}} from elsewhere (a
// call, texting). "+" marks a name the story has just introduced. World State
// takes who is present from it, Bonds who to hand over.
// Pure: runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

export const SCENE_TAG = "Scene";

/** The last <Scene> block in a message (thinking left out), or "". */
export function sceneBlockOf(text) {
    const t = String(text || "").replace(/<(think|thinking)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, " ");
    const all = t.match(/<Scene\b[^>]*>[\s\S]*?<\/Scene\s*>/gi);
    return all ? all[all.length - 1] : "";
}

const NOBODY = /^(nobody|no one|noone|none|empty|n\/a|-+|—)$/i;

function names(value) {
    return String(value || "")
        .replace(/\[[^\]]*\]/g, " ")              // an unfilled "[names, or: nobody]"
        .split(/\s*(?:,|;|\/|\band\b|&)\s*/i)
        .map(s => s.replace(/^[\s*_`"'“”•-]+|[\s*_`"'“”.]+$/g, "").replace(/\s*[(\[][^)\]]*[)\]]\s*$/, "").trim())
        .filter(s => s && !NOBODY.test(s))
        .map(s => {
            const isNew = s.startsWith("+");
            return { name: s.replace(/^\+\s*/, "").trim(), isNew };
        })
        .filter(n => n.name);
}

/**
 * @param {string} text  a message, or the block alone
 * @returns {{ here: Array<{name: string, isNew: boolean}>, remote: Array<{name: string, isNew: boolean}> } | null}
 *   null when the message has no <Scene> block
 */
export function parseScene(text) {
    const block = sceneBlockOf(text);
    if (!block) return null;
    const body = block.replace(/^<Scene\b[^>]*>/i, "").replace(/<\/Scene\s*>$/i, "");
    const out = { here: [], remote: [] };
    let labelled = false;
    for (const raw of body.split(/\r?\n/)) {
        const line = raw.replace(/^[\s*_•-]+/, "").replace(/\*\*/g, "").trim();
        const m = line.match(/^(here|present|remote|on the line|on a call)\s*:\s*(.*)$/i);
        if (m) {
            labelled = true;
            out[/^(here|present)$/i.test(m[1]) ? "here" : "remote"].push(...names(m[2]));
        } else if (!labelled && line) {
            out.here.push(...names(line));   // "Lona, Kade" with no label
        }
    }
    return out;
}
