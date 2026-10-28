// ────────────────────────────────────────────────────────────────────────────
// World State parser.
//
// Turns the text of one reply into a list of changes the world model applies.
// Pure: no imports and no SillyTavern access, so it runs under plain node.
//
// One pass handles both shapes the model may write:
//   • the line format the prompts ask for   (Aqua.Outfit: towel · + Darkness · Thread+: …)
//   • the older markdown blocks              (**Aqua:** / * *Outfit:* … / **📅 Time:** … | **🌤 Loc:** …)
// Self-contained lines are tried first; header/bullet lines fall back on the
// section and character they sit under.
//
// Section labels are matched EXACTLY (after emoji and markdown are stripped).
// Never `includes("loc")`: that is how an NPC called Lockhart used to be read
// as a Location header and swallow the whole update.
// ────────────────────────────────────────────────────────────────────────────

export const PC = "{{pc}}";

const SCENE_LABELS = {
    time: "time", date: "time", "date & time": "time", "time & date": "time", "date/time": "time",
    loc: "location", location: "location", place: "location",
    wx: "weather", weather: "weather", temp: "weather", temperature: "weather", atmosphere: "weather"
};

const PHASE_LABELS = { arc: "arcPhase", "arc phase": "arcPhase", scene: "scenePhase", "scene phase": "scenePhase" };

const LIST_LABELS = {
    thread: "threads", threads: "threads", "unresolved thread": "threads", "unresolved threads": "threads",
    seed: "seeds", seeds: "seeds", "planted seed": "seeds", "planted seeds": "seeds",
    timer: "timers", timers: "timers", "consequence timer": "timers", "consequence timers": "timers"
};

const NPC_SECTION_LABELS = new Set(["npcs present", "npcs", "npc", "characters present", "present", "cast", "characters"]);
const OFFSCREEN_LABELS = new Set(["off-screen", "offscreen", "off screen"]);
const PC_LABELS = new Set(["pc", "player", "user", "{{user}}", "player character"]);

const FIELD_SYNONYMS = {
    outfit: "outfit", clothes: "outfit", clothing: "outfit", attire: "outfit", wearing: "outfit",
    dress: "outfit", apparel: "outfit", garb: "outfit",
    position: "position", pose: "position", posture: "position", stance: "position",
    condition: "condition", "visible condition": "condition", status: "condition", state: "condition",
    injuries: "condition", "physical state": "condition", "physical condition": "condition",
    carrying: "carrying", items: "carrying", holding: "carrying", inventory: "carrying", "in hand": "carrying",
    mood: "mood", emotion: "mood", emotions: "mood", feeling: "mood", feelings: "mood", "emotional state": "mood",
    agenda: "agenda", goal: "agenda", goals: "agenda", intent: "agenda", intention: "agenda",
    motive: "agenda", motivation: "agenda",
    secret: "secret", secrets: "secret"
};

const SENTINEL_VALUE = /^(unchanged|no change|no changes|same|same as before|not changed|n\/?a|none|-+|—|–|\.\.\.|…)\.?$/i;

// A label with emoji, markdown and stray punctuation removed, lowercased.
export function normLabel(s) {
    return String(s || "")
        .replace(/[^\p{L}\p{N}\s&/'{}-]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

// The key a name is stored under: case- and decoration-insensitive.
export function nameKey(s) {
    return String(s || "")
        .replace(/[^\p{L}\p{N}\s'{}-]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

export function canonicalField(label) {
    const l = normLabel(label);
    return FIELD_SYNONYMS[l] || null;
}

function customFieldKey(label) {
    const l = normLabel(label);
    if (!l || l.split(" ").length > 4 || l.length > 32) return null;
    return FIELD_SYNONYMS[l] || l;
}

// "🧍 Aqua (the goddess)" → { name: "Aqua", note: "the goddess", pc: true, aliases: [] }
// 'Matthew "Matt"'        → { name: "Matthew", aliases: ["Matt"] }
// A quoted nickname is a second name for the same person, not part of the name:
// stripping the quotes used to make "Matthew Matt", a stranger to "Matt.Outfit".
function cleanName(raw) {
    let s = String(raw || "").trim();
    const pc = s.includes("🧍");
    const aliases = [];
    const nick = s.match(/^(.+?)\s+["“‘']([^"”’']{1,32})["”’']\s*(\(.*\)|\[.*\])?\s*$/);
    if (nick && nick[1].trim()) {
        aliases.push(nick[2].trim());
        s = (nick[1] + (nick[3] ? " " + nick[3] : "")).trim();
    }
    s = s.replace(/[^\p{L}\p{N}\s'{}().,&\[\]-]/gu, "").trim();
    let note = "";
    const paren = s.match(/^(.*?)\s*[(\[]([^)\]]*)[)\]]?\s*$/);
    if (paren && paren[1].trim()) {
        s = paren[1].trim();
        note = paren[2].trim();
    }
    s = s.replace(/^["'“”‘’]+|["'“”‘’.,:;]+$/g, "").trim();
    if (!s || s.length > 48 || s.split(/\s+/).length > 6) return null;
    if (!/^[\p{L}{]/u.test(s)) return null;
    return { name: s, note, pc, aliases: aliases.filter(a => a.toLowerCase() !== s.toLowerCase()) };
}

// An enter change, carrying any nickname the name came with.
function enterChange(cn, extra = {}) {
    const ch = { type: "enter", who: cn.name, ...extra };
    if (cn.aliases && cn.aliases.length) ch.aliases = cn.aliases;
    return ch;
}

function isPlaceholder(v) {
    const t = String(v || "").trim();
    return /^\[[^\]]*\]$/.test(t) || /^\([^)]*\)$/.test(t) || /^<[^>]*>$/.test(t);
}

function skipValue(v) {
    const t = String(v || "").trim();
    return !t || isPlaceholder(t) || SENTINEL_VALUE.test(t);
}

// Strips one line of markdown: bold/italic markers, leading bullets, full-width colons.
function cleanLine(raw) {
    let t = String(raw || "").replace(/：/g, ":").trim();
    if (!t) return null;
    if (/^([-*_=~]\s*){3,}$/.test(t)) return null;          // --- *** ===
    t = t.replace(/\*\*|__/g, "");
    let bullet = false;
    for (;;) {
        const m = t.match(/^([*•·>]|\d+[.)])\s+/);
        if (!m) break;
        t = t.slice(m[0].length);
        bullet = true;
    }
    t = t.replace(/\*/g, "").replace(/`/g, "").trim();
    if (!t) return null;
    return { t, bullet };
}

// "Outfit=armor; Mood=eager" / "Outfit: armor | Mood: eager"
function parseInlinePairs(text) {
    const pairs = [];
    const rest = [];
    for (const part of String(text || "").split(/[;|]/)) {
        const p = part.trim();
        if (!p) continue;
        const m = p.match(/^([^=:]{1,32}?)\s*[=:]\s*(.+)$/);
        const field = m && customFieldKey(m[1]);
        if (field) pairs.push({ field, value: m[2].trim() });
        else rest.push(p);
    }
    return { pairs, rest };
}

function extractBlocks(text) {
    const blocks = [];
    const re = /<(World_State|World_Update)\b[^>]*>([\s\S]*?)(<\/\1\s*>|$)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        blocks.push({
            tag: m[1].toLowerCase() === "world_state" ? "state" : "update",
            body: m[2],
            closed: Boolean(m[3])
        });
        if (!m[3]) break;
    }
    return blocks;
}

/**
 * Parses every <World_State> / <World_Update> block in a reply.
 * @param {string} text  the reply text
 * @returns {null | {
 *   kind: "snapshot" | "delta",
 *   changes: Array<object>,
 *   skipped: string[],
 *   noChanges: boolean
 * }} null when the reply carries no world block at all.
 */
export function parseWorldBlocks(text) {
    if (!text || typeof text !== "string") return null;
    const clean = text
        .replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "")
        .replace(/<summary\b[^>]*>[\s\S]*?<\/summary\s*>/gi, "")
        .replace(/<\/?details\b[^>]*>/gi, "");

    const blocks = extractBlocks(clean);
    if (!blocks.length) return null;

    // A full <World_State> is applied first, any <World_Update> on top of it.
    blocks.sort((a, b) => (a.tag === b.tag ? 0 : a.tag === "state" ? -1 : 1));

    const result = { kind: "delta", changes: [], skipped: [], noChanges: false };
    for (const b of blocks) {
        // Where a second block starts: "written twice" is counted per block, so
        // a <World_Update> can still change what the <World_State> above it set.
        if (result.changes.length) result.changes.push({ type: "block" });
        if (b.tag === "state") result.kind = "snapshot";
        parseBody(b.body, b.closed, b.tag, result);
    }
    return result;
}

function parseBody(body, closed, tag, out) {
    let text = String(body || "")
        .replace(/<!--[\s\S]*?(-->|$)/g, "")
        .replace(/<\/?(b|strong|i|em|u|br|p|span|div|font)\b[^>]*>/gi, "\n");

    let lines = text.split(/\r?\n/).filter(l => !/^\s*```/.test(l));
    if (!closed) {
        // A cut-off reply: the last line may be half written.
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        lines.pop();
    }

    const ctx = { section: null, who: null, tag };
    for (const raw of lines) {
        const cl = cleanLine(raw);
        if (!cl) continue;
        if (!parseLine(cl, ctx, out)) out.skipped.push(raw.trim());
    }
}

const push = (out, change) => { out.changes.push(change); return true; };

// "- Time: Dawn" is a bulleted scene line, not Time leaving the scene.
function isSectionLabel(label) {
    const L = normLabel(label);
    return Boolean(SCENE_LABELS[L] || PHASE_LABELS[L] || LIST_LABELS[L] ||
        OFFSCREEN_LABELS.has(L) || NPC_SECTION_LABELS.has(L) || L === "time & loc");
}

// Returns true when the line was understood (even if it was deliberately ignored).
function parseLine({ t, bullet }, ctx, out) {
    if (/^(no changes?|nothing changed|none)\.?$/i.test(t)) { out.noChanges = true; return true; }
    if (isPlaceholder(t)) return true;
    if (/^\((repeat|include|add|if)\b/i.test(t)) return true;

    // ── Arrival: "+ Darkness" / "+ Darkness: Outfit=armor; Mood=eager"
    let m = t.match(/^\+\s*(.+)$/);
    if (m) return parseArrival(m[1], ctx, out);

    // ── Leading dash: departure, unless it is a bullet in context
    m = t.match(/^[-–—]\s*(.+)$/);
    if (m) {
        const rest = m[1];
        const label = rest.split(":")[0];
        const inList = ctx.section === "threads" || ctx.section === "seeds" || ctx.section === "timers" || ctx.section === "offscreen";
        const isFieldBullet = ctx.who && rest.includes(":") && canonicalField(label);
        const isLabelBullet = rest.includes(":") && isSectionLabel(label);
        // A full <World_State> has nobody leaving: every dash there is a bullet.
        if (inList || isFieldBullet || isLabelBullet || ctx.tag === "state") return parseLine({ t: rest, bullet: true }, ctx, out);
        return parseDeparture(rest, out, ctx);
    }

    // ── Scene line with several cells: "Time: Night | Loc: Tavern | Wx: Rain"
    if (t.includes("|")) {
        // Cut at the LABELS, not at the pipes: "Loc: Axel | tavern" is one
        // location with a pipe inside it, not a location and a stray cell.
        const labelRe = /(^|\|)\s*([^|:]{1,24}?)\s*:/g;
        const hits = [];
        let lm;
        while ((lm = labelRe.exec(t)) !== null) {
            const L = normLabel(lm[2]);
            if (SCENE_LABELS[L] || L === "time & loc") hits.push({ start: lm.index, end: lm.index + lm[0].length, label: lm[2] });
        }
        if (hits.length >= 2 && hits[0].start === 0) {
            hits.forEach((h, i) => {
                const value = t.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : t.length).trim();
                parseLine({ t: `${h.label}: ${value}`, bullet: false }, ctx, out);
            });
            return true;
        }
    }

    // ── "Offscreen-: Wiz": her off-screen line goes
    m = t.match(/^off[\s-]?screen\s*[-–]\s*:?\s*(.+)$/i);
    if (m) {
        ctx.who = null;
        const cn = cleanName(m[1].split(/\s*(?:=|:|—|–|\s-\s)\s*/)[0]);
        if (!cn || isPlaceholder(m[1]) || skipValue(m[1])) return true;
        return push(out, { type: "offscreenRemove", who: cn.name });
    }

    // ── List ops: "Thread+: text" / "Seeds - : text"
    m = t.match(/^([\p{L}\s]{3,24}?)\s*([+\-–])\s*:?\s*(.+)$/u);
    if (m && LIST_LABELS[normLabel(m[1])]) {
        const value = m[3].replace(/^:\s*/, "").trim();
        if (skipValue(value)) return true;
        return push(out, { type: "list", list: LIST_LABELS[normLabel(m[1])], op: m[2] === "+" ? "add" : "remove", value });
    }

    const colon = t.indexOf(":");
    if (colon > 0) {
        const label = t.slice(0, colon).trim();
        const value = t.slice(colon + 1).trim();
        const L = normLabel(label);

        // Scene
        if (SCENE_LABELS[L]) {
            if (skipValue(value)) return true;
            return push(out, { type: "scene", key: SCENE_LABELS[L], value });
        }
        if (L === "time & loc" || L === "time and loc" || L === "time & location") {
            if (skipValue(value)) return true;
            const at = value.match(/^(.*?)\s+at\s+(.+)$/i);
            if (at) {
                push(out, { type: "scene", key: "time", value: at[1].trim() });
                return push(out, { type: "scene", key: "location", value: at[2].trim() });
            }
            return push(out, { type: "scene", key: "location", value });
        }

        // Phases
        if (PHASE_LABELS[L]) {
            if (skipValue(value)) return true;
            return push(out, { type: "phase", key: PHASE_LABELS[L], value });
        }

        // Off-screen: "Offscreen: Wiz = restocking" or a section header
        if (OFFSCREEN_LABELS.has(L)) {
            ctx.section = "offscreen";
            ctx.who = null;
            if (!value || skipValue(value)) return true;
            return parseOffscreenItem(value, out);
        }

        // Section headers
        if (NPC_SECTION_LABELS.has(L)) {
            ctx.section = "npcs";
            ctx.who = null;
            return true;
        }
        if (LIST_LABELS[L]) {
            ctx.section = LIST_LABELS[L];
            ctx.who = null;
            if (value && !skipValue(value)) return push(out, { type: "list", list: LIST_LABELS[L], op: "item", value });
            return true;
        }

        // Self-contained character fields
        const dotted = splitWhoField(label);
        if (dotted) {
            if (skipValue(value)) return true;
            return push(out, { type: "field", who: dotted.who, field: dotted.field, value });
        }

        // PC header: "🧍 Kazuma:" / "PC:" / "{{user}}:"
        if (label.includes("🧍") || PC_LABELS.has(L)) {
            const cn = cleanName(label);
            ctx.who = PC;
            ctx.section = "pc";
            if (cn && cn.name && !PC_LABELS.has(nameKey(cn.name))) push(out, { type: "pcname", name: cn.name });
            if (value && !skipValue(value)) {
                // Compact template: "PC: [clothing] | [posture]"
                return parseCompactCells(PC, value, out);
            }
            return true;
        }

        // Field under the current character: "Outfit: …" (bullet or bare)
        if (ctx.who && (canonicalField(label) || (bullet && customFieldKey(label)))) {
            if (skipValue(value)) return true;
            return push(out, { type: "field", who: ctx.who, field: customFieldKey(label), value });
        }

        // Inside a list section, a line with a colon is still one item.
        if (ctx.section === "threads" || ctx.section === "seeds" || ctx.section === "timers") {
            return push(out, { type: "list", list: ctx.section, op: "item", value: t });
        }
        if (ctx.section === "offscreen") return parseOffscreenItem(t, out);

        // Character header: "Aqua:" alone on its line
        const cn = cleanName(label);
        if (cn && !value) {
            ctx.who = cn.pc ? PC : cn.name;
            if (cn.pc) {
                ctx.section = "pc";
                return push(out, { type: "pcname", name: cn.name });
            }
            return push(out, enterChange(cn, { implicit: true }));
        }

        // Compact NPC line inside the NPC section: "Aqua: blue dress | by the bar"
        if (cn && value && ctx.section === "npcs") {
            push(out, enterChange(cn, { implicit: true }));
            ctx.who = cn.name;
            return parseCompactCells(cn.name, value, out);
        }
        return false;
    }

    // ── Lines without a colon
    if (ctx.section === "threads" || ctx.section === "seeds" || ctx.section === "timers") {
        if (skipValue(t)) return true;
        return push(out, { type: "list", list: ctx.section, op: "item", value: t });
    }
    if (ctx.section === "offscreen") return parseOffscreenItem(t, out);
    return false;
}

// "Aqua.Outfit" · "Aqua's outfit" · "Aqua - Outfit" · "PC Outfit"
function splitWhoField(label) {
    let m = label.match(/^(.+)\.\s*([\p{L}][\p{L}\s]{0,31})$/u);
    if (m) {
        const cn = cleanName(m[1]);
        const field = customFieldKey(m[2]);
        if (cn && field) return { who: cn.pc || PC_LABELS.has(nameKey(cn.name)) ? PC : cn.name, field };
    }
    m = label.match(/^(.+?)(?:'s|’s)\s+(.+)$/);
    if (m && canonicalField(m[2])) {
        const cn = cleanName(m[1]);
        if (cn) return { who: PC_LABELS.has(nameKey(cn.name)) ? PC : cn.name, field: canonicalField(m[2]) };
    }
    m = label.match(/^(.+?)\s*(?:\s[-–—]|\|)\s*(.+)$/);
    if (m && canonicalField(m[2])) {
        const cn = cleanName(m[1]);
        if (cn) return { who: PC_LABELS.has(nameKey(cn.name)) ? PC : cn.name, field: canonicalField(m[2]) };
    }
    m = label.match(/^(pc|player|user|\{\{user\}\})\s+(.+)$/i);
    if (m && canonicalField(m[2])) return { who: PC, field: canonicalField(m[2]) };
    return null;
}

function parseArrival(rest, ctx, out) {
    const colon = rest.indexOf(":");
    const namePart = colon >= 0 ? rest.slice(0, colon) : rest;
    const tail = colon >= 0 ? rest.slice(colon + 1).trim() : "";
    const cn = cleanName(namePart);
    if (!cn) return false;
    push(out, enterChange(cn));
    ctx.who = cn.name;
    ctx.section = "npcs";
    if (tail && !skipValue(tail)) {
        const { pairs, rest: leftover } = parseInlinePairs(tail);
        for (const p of pairs) {
            if (!skipValue(p.value)) push(out, { type: "field", who: cn.name, field: p.field, value: p.value });
        }
        if (leftover.length) out.skipped.push(`+ ${cn.name}: ${leftover.join("; ")}`);
    }
    return true;
}

function parseDeparture(rest, out, ctx) {
    let namePart = rest;
    let where = "";
    const colon = rest.indexOf(":");
    if (colon >= 0) {
        namePart = rest.slice(0, colon);
        where = rest.slice(colon + 1).trim();
    }
    const cn = cleanName(namePart);
    if (!cn) return false;
    if (!where && cn.note) where = cn.note;
    if (skipValue(where)) where = "";
    ctx.who = null;
    return push(out, { type: "leave", who: cn.pc ? PC : cn.name, where });
}

// "Wiz = restocking her shop" · "Wiz: restocking" · "Wiz — restocking" · "Wiz restocking her shop"
function parseOffscreenItem(text, out) {
    const t = String(text || "").trim();
    if (skipValue(t)) return true;
    const m = t.match(/^(.{1,48}?)\s*(?:=|:|—|–|\s-\s)\s*(.+)$/);
    // The template's own "[NPC Name] = [where they are]" echoed back.
    if (m && (isPlaceholder(m[1]) || skipValue(m[2]))) return true;
    if (m) {
        const cn = cleanName(m[1]);
        if (cn) return push(out, { type: "offscreen", who: cn.name, value: m[2].trim() });
    }
    return push(out, { type: "offscreen", who: null, value: t });
}

// "blue dress | leaning on the bar" → outfit, position
function parseCompactCells(who, value, out) {
    const cells = value.split("|").map(c => c.trim()).filter(Boolean);
    const order = ["outfit", "position"];
    cells.forEach((cell, i) => {
        const kv = cell.match(/^([^:]{1,32}):\s*(.+)$/);
        const field = kv && canonicalField(kv[1]);
        if (field) {
            if (!skipValue(kv[2])) push(out, { type: "field", who, field, value: kv[2].trim() });
        } else if (order[i] && !skipValue(cell)) {
            push(out, { type: "field", who, field: order[i], value: cell });
        }
    });
    return true;
}
