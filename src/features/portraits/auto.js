// ────────────────────────────────────────────────────────────────────────────
// Automatic portraits for everyone in the scene.
//
// Switched on by "Generate Portraits for Every New Character Automatically" on
// the Image Gen tab. After each AI reply, every name the World State block lists
// as present (and every speaker in NPC Inner Chatter) that has no portrait yet
// gets one rendered through ComfyUI in the background — banked or not.
//
// Banked NPCs are described from their dossier, exactly as the manual button
// does. Unbanked characters are described from their World State card (outfit,
// position, mood…) plus a short excerpt of the recent scene, which is the only
// thing the story has said about them so far.
//
// One job at a time. ComfyUI queues fine, but the prompt-writing step hijacks a
// quiet generation on the main API, and two of those in flight would fight over
// the same injection slot. Failures are remembered for a while so a character
// the model cannot draw does not get retried on every single reply.
// ────────────────────────────────────────────────────────────────────────────
import { getContext } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { meguminActiveDataIdentity } from "../../core/keys.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { findBankedNpc, hasPortrait, portraitKey, setPortrait } from "../../core/portraits.js";
import { npcBuildTextFromData } from "../npc/data.js";
import { buildPortraitPrompt, renderPortraitImage } from "../npc/pfp.js";
import { findLastAssistantMessage, parseMessage } from "../../sidepanel/parsers.js";
import { refreshSidePanel } from "../../sidepanel/panel.js";
import { meguminCleanChatHistoryText } from "../../engine/chatText.js";
import { meguminScheduleBlocksRefresh } from "../blocks/chat.js";

const RETRY_AFTER_MS = 10 * 60 * 1000;
const SCENE_EXCERPT_CHARS = 1800;

const queue = [];
const queued = new Set();
const inFlight = new Set();
const failedAt = new Map();
let running = false;

export function autoPortraitsEnabled() {
    const s = localProfile?.imageGen;
    return Boolean(s && s.enabled && s.autoPortraits && s.currentWorkflowName);
}

function ignoredNames() {
    const raw = localProfile?.npcBank?.ignoredNames || "";
    return new Set(String(raw).split(/[,\n]/).map(portraitKey).filter(Boolean));
}

// Everyone the last reply put in the scene, deduplicated by name. The user's
// persona is skipped: SillyTavern already has a picture of them.
export function collectPresentCharacters() {
    const ctx = getContext();
    const found = findLastAssistantMessage(ctx?.chat);
    if (!found) return [];
    const parsed = parseMessage(found.msg.mes || "");
    const userKey = portraitKey(ctx?.name1);
    const ignored = ignoredNames();
    const out = new Map();
    const add = (name, fields) => {
        const key = portraitKey(name);
        if (!key || key === userKey || ignored.has(key) || out.has(key)) return;
        out.set(key, { name: String(name).trim(), fields: fields || {} });
    };
    for (const npc of parsed?.worldState?.npcs || []) {
        if (npc?.isPc) continue;
        add(npc?.name, npc?.fields);
    }
    for (const line of parsed?.innerChatter || []) add(line?.name, {});
    return [...out.values()];
}

// The dossier when there is one; otherwise the World State card plus what the
// last two replies said, trimmed to the tail so the newest description wins.
function describeCharacter(name, fields) {
    const banked = findBankedNpc(name);
    if (banked) return npcBuildTextFromData(banked);
    const lines = [`Name: ${name}`];
    for (const [label, value] of Object.entries(fields || {})) {
        if (value && String(value).trim()) lines.push(`${label}: ${String(value).trim()}`);
    }
    const chat = getContext()?.chat || [];
    const recent = chat
        .filter(m => m && !m.is_user && !m.is_system && m.mes)
        .slice(-2)
        .map(m => meguminCleanChatHistoryText(m.mes))
        .join("\n\n")
        .trim();
    if (recent) {
        lines.push("", "Recent scene excerpt — use only what it reveals about this character's appearance, age, sex and demeanor:", recent.slice(-SCENE_EXCERPT_CHARS));
    }
    return lines.join("\n");
}

export function scheduleAutoPortraits() {
    if (!autoPortraitsEnabled()) return;
    const now = Date.now();
    for (const person of collectPresentCharacters()) {
        const key = portraitKey(person.name);
        if (hasPortrait(person.name) || queued.has(key) || inFlight.has(key)) continue;
        const lastFail = failedAt.get(key);
        if (lastFail && now - lastFail < RETRY_AFTER_MS) continue;
        queued.add(key);
        queue.push(person);
    }
    pump();
}

async function pump() {
    if (running) return;
    running = true;
    try {
        while (queue.length) {
            if (!autoPortraitsEnabled()) { queue.length = 0; queued.clear(); break; }
            const person = queue.shift();
            queued.delete(portraitKey(person.name));
            await generateFor(person);
        }
    } finally {
        running = false;
    }
}

async function generateFor({ name, fields }) {
    const key = portraitKey(name);
    // Stamped before the two awaits. The reader can change chats while a
    // portrait renders; a picture made for one chat's Tammy must not land on
    // another chat's profile.
    const identity = meguminActiveDataIdentity();
    inFlight.add(key);
    try {
        if (hasPortrait(name)) return;
        toastr.info(`Auto portrait: writing a prompt for ${name}…`, "Megumin Suite");
        const promptText = await buildPortraitPrompt(name, describeCharacter(name, fields), { silent: true });
        if (!promptText) { failedAt.set(key, Date.now()); return; }
        if (meguminActiveDataIdentity() !== identity) return;
        toastr.info(`Auto portrait: rendering ${name}…`, "Megumin Suite");
        const image = await renderPortraitImage(promptText, { silent: true, label: name });
        if (!image) { failedAt.set(key, Date.now()); return; }
        if (meguminActiveDataIdentity() !== identity) {
            console.debug(`[Megumin-Suite] Auto portrait for "${name}" dropped: generated for "${identity}" but "${meguminActiveDataIdentity()}" is active now.`);
            return;
        }
        if (!setPortrait(name, image)) return;
        failedAt.delete(key);
        toastr.success(`Portrait generated for ${name}`, "Megumin Suite");
        fireRefreshHook(REFRESH.NPC_LIST);
        try { refreshSidePanel(); } catch (e) { console.debug("[Megumin-Suite] side panel refresh after auto portrait failed", e); }
        meguminScheduleBlocksRefresh();
    } catch (e) {
        console.warn(`[Megumin-Suite] Auto portrait for "${name}" failed:`, e);
        failedAt.set(key, Date.now());
    } finally {
        inFlight.delete(key);
    }
}
