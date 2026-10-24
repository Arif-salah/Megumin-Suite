// ────────────────────────────────────────────────────────────────────────────
// Stat blocks parser (plan 008): <Bonds> and <Character_Sheet>.
//
// Both are "Label: value" cells split by "|", the shape their templates ask for:
//   Bonds:  Anno: Mood: smug | Affection: 45/100 (+5 she liked the gift) | Trust: 60/100 (=)
//   Sheet:  HP: 80/100 (-20 the fall) | Gold: 120 (+20 reward)
//           Inventory: rope, torch x3
// Labels are read as written, never from a fixed list, so a field the user
// added (Jealousy, Mana) is kept like any other.
//
// Pure: no imports from SillyTavern, so it runs under plain node.
// ────────────────────────────────────────────────────────────────────────────

const SENTINEL = /^(unchanged|no change|no changes|same|same as before|n\/?a|-+|—|–|\.\.\.|…)\.?$/i;

/** Lowercase, no markdown or quotes, single spaces: how names and labels are compared. */
export function statKey(s) {
    return String(s || "")
        .replace(/["“”'‘’]/g, "")
        .replace(/[*_`~]/g, "")
        .toLowerCase().replace(/\s+/g, " ").trim();
}

function cleanText(text) {
    return String(text || "")
        .replace(/<think\b[^>]*>[\s\S]*?(<\/think\s*>|$)/gi, "")
        .replace(/<summary\b[^>]*>[\s\S]*?<\/summary\s*>/gi, "")
        .replace(/<\/?details\b[^>]*>/gi, "");
}

/** Every body of <Tag>…</Tag> in a reply (an unclosed last one included). */
export function extractTagBodies(text, tag) {
    const out = [];
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)(<\\/${tag}\\s*>|$)`, "gi");
    let m;
    const src = cleanText(text);
    while ((m = re.exec(src)) !== null) {
        out.push(m[1]);
        if (!m[2]) break;
    }
    return out;
}

// The template's own lines ("[One line per named NPC…]") are instructions, not values.
function isTemplateLine(line) {
    return /^\[[\s\S]*\]$/.test(line) || /^\[[^\]]*$/.test(line) || /^[^[]*\]$/.test(line);
}

function cleanLine(raw) {
    return String(raw || "")
        .replace(/<!--[\s\S]*?(-->|$)/g, "")
        .replace(/<\/?[a-z][^>]*>/gi, " ")
        .replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "")
        .replace(/\*\*|__/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// Lines of a block body, with the template's bracketed instruction paragraph left out.
function bodyLines(body, { keepMarkers = false } = {}) {
    const lines = [];
    let inTemplate = false;
    for (const raw of String(body || "").split("\n")) {
        const t = keepMarkers
            ? String(raw || "").replace(/<!--[\s\S]*?(-->|$)/g, "").trim()
            : cleanLine(raw);
        if (!t) continue;
        if (inTemplate) { if (/\]$/.test(t)) inTemplate = false; continue; }
        if (/^\[/.test(t) && !/\]/.test(t)) { inTemplate = true; continue; }
        if (isTemplateLine(t)) continue;
        lines.push(t);
    }
    return lines;
}

/**
 * One value as written: "45/100 (+5 she liked it)", "120 (=)", "smug", "rope, torch x3".
 * @returns {null | { text: string, value?: number, max?: number, delta?: number, reason?: string }}
 */
export function parseStatValue(raw) {
    let s = String(raw || "").trim();
    if (!s || /^\[.*\]$/.test(s) || SENTINEL.test(s)) return null;
    let delta, reason;
    const tail = s.match(/\(\s*(=|[+-−]\s*\d+(?:\.\d+)?)\s*([^)]*)\)\s*$/);
    if (tail) {
        if (tail[1] !== "=") delta = Number(tail[1].replace(/\s+/g, "").replace("−", "-"));
        reason = tail[2].trim() || undefined;
        s = s.slice(0, tail.index).trim();
    }
    const meter = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (meter) return { text: `${meter[1]}/${meter[2]}`, value: Number(meter[1]), max: Number(meter[2]), ...(delta !== undefined ? { delta } : {}), ...(reason ? { reason } : {}) };
    const num = s.match(/^(-?\d+(?:\.\d+)?)$/);
    if (num) return { text: num[1], value: Number(num[1]), ...(delta !== undefined ? { delta } : {}), ...(reason ? { reason } : {}) };
    // A bare change with no value ("+5 kind words") moves the old value.
    const bare = s.match(/^([+-−]\s*\d+(?:\.\d+)?)\s*(.*)$/);
    if (bare && !s.includes(",")) return { text: "", delta: Number(bare[1].replace(/\s+/g, "").replace("−", "-")), ...(bare[2] ? { reason: bare[2] } : {}) };
    if (!s || /^\[.*\]$/.test(s) || SENTINEL.test(s)) return null;
    return { text: s };
}

// "Label: value" cells of one line; a cell without a colon is kept as { label: "", raw }.
function cells(line) {
    return line.split(/\s+\|\s+|\s*\|\s*/).map(c => c.trim()).filter(Boolean).map(c => {
        const at = c.indexOf(":");
        return at < 0 ? { label: "", raw: c } : { label: c.slice(0, at).trim(), raw: c.slice(at + 1).trim() };
    });
}

function addField(fields, label, raw) {
    const l = label.replace(/^[*_]+|[*_]+$/g, "").trim();
    if (!l || /^\[.*\]$/.test(l)) return;
    const v = parseStatValue(raw);
    if (!v) return;
    const k = statKey(l);
    if (!fields.some(f => f.key === k)) fields.push({ key: k, label: l, ...v });   // first wins
}

// A name as written: markdown, emoji, a quoted nickname and brackets come off.
export function cleanStatName(raw) {
    let n = String(raw || "")
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
        .replace(/[*_`~]/g, "")
        .replace(/\s*["“][^"”]*["”]\s*/g, " ")
        .replace(/^[\s\-—–:]+|[\s\-—–:]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!n || /^\[.*\]$/.test(n) || n.length > 60) return "";
    return n;
}

/**
 * <Bonds>: one line per character.
 * @returns {null | { kind: "delta", people: Array<{ name: string, fields: object[] }> }}
 */
export function parseBonds(text) {
    const bodies = extractTagBodies(text, "Bonds");
    if (!bodies.length) return null;
    const people = [];
    for (const body of bodies) {
        for (const line of bodyLines(body)) {
            const cs = cells(line);
            if (!cs.length) continue;
            let name = "";
            const first = cs[0];
            // "Anno: Mood: smug" → name Anno, first cell "Mood: smug".
            const inner = first.raw.indexOf(":");
            if (first.label && inner > 0) {
                name = first.label;
                cs[0] = { label: first.raw.slice(0, inner).trim(), raw: first.raw.slice(inner + 1).trim() };
            } else if (!first.label) {
                // "Anno | Mood: smug" or "Anno — Mood: smug"
                const dash = first.raw.match(/^(.+?)\s+[—–-]\s+([^:]+):\s*(.*)$/);
                if (dash) { name = dash[1]; cs[0] = { label: dash[2], raw: dash[3] }; }
                else { name = first.raw; cs.shift(); }
            } else {
                const dash = first.label.match(/^(.+?)\s+[—–-]\s+(.+)$/);
                if (dash) { name = dash[1]; cs[0] = { label: dash[2], raw: first.raw }; }
                else continue;   // "Mood: smug" with no name: nobody to file it under
            }
            name = cleanStatName(name);
            if (!name) continue;
            const fields = [];
            for (const c of cs) if (c.label) addField(fields, c.label, c.raw);
            if (!fields.length) continue;
            const known = people.find(p => statKey(p.name) === statKey(name));
            if (known) { for (const f of fields) if (!known.fields.some(k => k.key === f.key)) known.fields.push(f); }
            else people.push({ name, fields });
        }
    }
    return people.length ? { kind: "delta", people } : null;
}

/**
 * <Character_Sheet>: the player's fields, every "Label: value" cell on every line.
 * @returns {null | { kind: "delta", fields: object[] }}
 */
export function parseSheet(text) {
    const bodies = extractTagBodies(text, "Character_Sheet");
    if (!bodies.length) return null;
    const fields = [];
    for (const body of bodies) {
        for (const line of bodyLines(body)) {
            for (const c of cells(line)) if (c.label) addField(fields, c.label, c.raw);
        }
    }
    return fields.length ? { kind: "delta", fields } : null;
}

/**
 * The last copy of a free-text block (Inner Chatter, Story Tracker).
 * @returns {null | { kind: "snapshot", text: string }}
 */
export function parseLatest(text, tag) {
    const bodies = extractTagBodies(text, tag);
    if (!bodies.length) return null;
    // Free text keeps its lines as written (list numbers, bullets); only the
    // template's bracketed instructions and HTML comments come out.
    const body = bodyLines(bodies[bodies.length - 1], { keepMarkers: true }).join("\n").trim();
    return body ? { kind: "snapshot", text: body } : null;
}
