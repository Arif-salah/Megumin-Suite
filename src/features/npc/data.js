// ────────────────────────────────────────────────────────────────────────────
// NPC data — parsing dossiers out of replies and rendering them back to text.
//
// The leaf of the feature: no dependency on the portrait generator or the tab,
// which is why the prompt builder can read from it without dragging the UI in.
// ────────────────────────────────────────────────────────────────────────────

import { getContext } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { adoptPortraitIntoRecord } from "../../core/portraits.js";
import { memGetCachedKeywords } from "../memory/keywords.js";
import { escapeRegex } from "../../utils/regex.js";
import { npcFields, npcFieldByRole, npcBodyFields, npcVitalsFields } from "./fields.js";

// -------------------------------------------------------------
// STAGE 8.5: NPC BANK
// -------------------------------------------------------------

// Reconstruct a plain-text dossier from structured NPC data for injection into [[npc list]]
//
// Generated from the field list rather than written out, so a field the reader
// adds in the tab reaches the model without an edit here. The shape is the one
// this function always emitted: name and vitals on one header line, then a row
// per populated field, with `ownLine` fields putting their value on the next
// line — which is why background and the list fields carry that flag.
export function npcBuildTextFromData(n) {
    let lines = [];

    const nameField = npcFieldByRole("name");
    const headerParts = [];
    if (nameField) headerParts.push(`**${nameField.label}:** ${n[nameField.id] || "Unknown"}`);
    npcVitalsFields().forEach(f => headerParts.push(`**${f.label}:** ${n[f.id] || "?"}`));
    if (headerParts.length) lines.push(headerParts.join(" | "));

    npcBodyFields().forEach(f => {
        // DELIBERATELY SKIPPED: the image-tags field.
        // Image tags are for ComfyUI only. Hiding them saves tokens and prevents
        // the AI from mimicking Booru formatting in its prose.
        if (f.system === "imageTags") return;

        const val = n[f.id];
        if (!val) return;
        lines.push(f.ownLine ? `**${f.label}:**\n${val}` : `**${f.label}:** ${val}`);
    });

    return lines.join("\n");
}

// A fresh NPC record, with one key per field plus the bookkeeping the bank needs.
//
// Three callers built this literal by hand — the auto-extract in index.js, the
// tab's Scan Story, and its Add NPC button — so a new field meant remembering
// all three, and the one you forgot silently dropped that field on those NPCs.
//
// `parsed` is what npcParseBlock returned, or nothing for a hand-made NPC.
// `name` is the fallback when the dossier's own Name line is missing.
export function npcCreateRecord({ parsed = {}, name = "", messageIndex = 0 } = {}) {
    const nameField = npcFieldByRole("name");
    const record = {};

    npcFields().forEach(f => { record[f.id] = parsed[f.id] || ""; });
    if (nameField) record[nameField.id] = parsed[nameField.id] || name || "";

    record.imageOnly = false;
    record.pfp = "";
    // A face made for this character before it was banked belongs on the record.
    adoptPortraitIntoRecord(record);
    record.timestamp = Date.now();
    record.messageIndex = messageIndex;
    // Every change an <NPC_Update> block has applied to this NPC, newest last.
    // Carries the previous value of each field it touched, which is what lets a
    // single change be undone from the chat card and what lets a rewind put back
    // the value that was true at the message it rewound to.
    record.history = [];
    return record;
}

// Parse raw NPC dossier HTML block into structured fields
// Every New NPC dossier in one piece of text, in either shape, as { name, raw }.
// `raw` is the whole matched block — npcParseBlock reads its `**Field:**` lines
// and does not care which wrapper they arrived in.
//
// The tag shape is asked about first and, when it matches, answered alone: a
// message is one format or the other, and running both would double-count a
// legacy dossier that happens to sit inside a new envelope.
export function meguminFindNpcDossiers(text) {
    const out = [];
    if (!text) return out;
    let m;

    const tagRe = /<New_NPC\b([^>]*)>([\s\S]*?)<\/New_NPC\s*>/ig;
    while ((m = tagRe.exec(text)) !== null) {
        const raw = m[0].trim();
        const attrs = m[1] || "";
        const nameAttr = attrs.match(/name\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        let name = nameAttr ? (nameAttr[1] ?? nameAttr[2] ?? nameAttr[3] ?? "") : "";
        // A dossier that forgot the attribute still has the template's own
        // `**Name:**` line; losing the whole NPC over a missing attribute would
        // be a poor trade.
        if (!name.trim()) {
            const fromBody = (m[2] || "").match(/\*\*Name:\*\*\s*(.*?)(?:\||\n|$)/i);
            if (fromBody) name = fromBody[1];
        }
        out.push({ name: name.replace(/\*\*/g, "").replace(/<\/?b>/ig, "").trim(), raw });
    }
    if (out.length) return out;

    const legacyRe = /<details[^>]*>[\s\S]*?<summary[^>]*>.*?New NPC:\s*(.*?)<\/summary\s*>([\s\S]*?)<\/details\s*>/ig;
    while ((m = legacyRe.exec(text)) !== null) {
        out.push({ name: m[1].trim().replace(/<\/?b>/ig, ""), raw: m[0].trim() });
    }
    return out;
}

// Labels an older build wrote that a current field should still absorb. Keyed by
// field id, so a renamed field keeps collecting its own history.
const NPC_LEGACY_LABELS = {
    role: ["Occupation"],
    secrets: ["Hidden Layer"]
};

// The two shapes a field's value can arrive in.
//
// A header field stops at the first "|" or newline, because name, age, sex and
// orientation share one line. Everything else runs until the next "**" heading
// or the closing tag, so a paragraph or a bulleted list survives intact.
//
// Each label is tried strictly first ("**Voice:**") and then loosely
// ("**Secrets (never narrated unless disclosed):**"). The strict pass is what
// the old hand-written regexes did, so a standard dossier parses exactly as it
// always did; the loose pass is what let Personality and Secrets carry a
// parenthetical, generalised now to every field.
function npcMatchField(rawBlock, label, isHeader) {
    const L = escapeRegex(label);
    const tail = isHeader ? `\\s*(.*?)(?:\\||\\n|$)` : `\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*|<\\/details>|<\\/New_NPC)`;
    for (const head of [`\\*\\*${L}:\\*\\*`, `\\*\\*${L}[^*]*\\*\\*`]) {
        const m = rawBlock.match(new RegExp(head + tail, "i"));
        if (m) return m[1];
    }
    return null;
}

export function npcParseBlock(rawBlock) {
    const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/<\/?[^>]+>/g, "").trim();
    const data = {};

    npcFields().forEach(f => {
        const isHeader = (f.system === "name" || f.system === "vitals");
        // The reader's own label first, then anything an older build called it.
        const labels = [f.label, ...(NPC_LEGACY_LABELS[f.id] || [])];
        for (const label of labels) {
            const hit = npcMatchField(rawBlock, label, isHeader);
            if (hit === null) continue;
            const val = isHeader ? strip(hit) : hit.trim();
            if (val === "") continue;
            data[f.id] = val;
            break;
        }
    });

    return data;
}

// Scans the chat and extracts Image Tags for relevant NPCs
// OPTIMIZED: Pre-computes NPC text once, uses cached keywords
export function getRelevantNpcImageTags() {
    const s = localProfile?.imageGen;
    if (!s || !s.injectNpcTags) return "";
    
    const nb = localProfile?.npcBank;
    if (!nb || !nb.npcs || nb.npcs.length === 0) return "";
    
    const context = typeof getContext === 'function' ? getContext() : null;
    if (!context || !context.chat) return "";

    // Use cached keywords (shared with other TF-IDF callers in this prompt build)
    const { keywords } = memGetCachedKeywords(context.chat, 4);
    if (keywords.length === 0) return "";

    let scoredNpcs = [];
    // Pre-compute NPC texts ONCE instead of inside each iteration
    nb.npcs.forEach(n => {
        if (!n.imageTags || n.imageTags.trim() === "") return; // Skip NPCs with no image tags
        
        let score = 0;
        const contentLower = npcBuildTextFromData(n).toLowerCase();
        for (const kw of keywords) {
            if (contentLower.includes(kw)) score++;
        }
        
        if (score >= 1) {
            scoredNpcs.push({ name: n.name, tags: n.imageTags, score: score });
        }
    });

    if (scoredNpcs.length === 0) return "";
    
    scoredNpcs.sort((a, b) => b.score - a.score);
    const topNpcs = scoredNpcs.slice(0, 3); // Grab the top 3 relevant NPCs
    
    return "**RELEVANT NPC IMAGE TAGS:**\n" + topNpcs.map(n => `[${n.name}]: ${n.tags}`).join("\n");
}
