/* eslint-disable no-undef */
/*
 * Megumin Suite — Side Panel section registry
 *
 * Every tracker section is declared once here as { id, icon, title,
 * defaultOpen, order, render(ctx), badge(ctx) }. panel.js iterates this
 * registry to build the panel — adding a new tracker section means adding
 * one entry here, nothing else.
 *
 * render(ctx) returns a DOM Node, or null when the section has no data
 * (panel.js hides null sections when cfg.autoHideEmpty is on).
 *
 * SectionCtx = { parsed, profile, cfg, openNpcBook, lookupBankedNpc }
 */

import { el, escapeHtml, isMaleSex, avatarNode } from "./dom.js";
import { extractBlocks, buildBlockPane } from "../blocks/render.js";
import { MEGUMIN_PANEL_SECTION_BY_BLOCK, meguminRenderRegistry, meguminStatFieldMap } from "../features/blocks/registry.js";
import { meguminApplyChoice } from "../features/blocks/chat.js";

// The panel mirrors one chat. Three of the sections below draw from the saved
// profile rather than from a message, and the profile is still there when no chat
// is open - so closing a chat left Story Planner and NPC Bank drawn over nothing,
// while World State and NPC Inner Chatter, which read the message, went correctly
// empty. panel.js works out whether a chat is open and puts the answer in the
// section context; these three draw nothing when it says no, and the panel's
// hide-empty setting then drops them.
//
// `false` only, never merely falsy. A context that does not carry the answer at
// all - anything drawing a section outside the panel's own loop - keeps the old
// behaviour, and panel.js sends `true` deliberately whenever it cannot tell.
const noChat = (ctx) => ctx.hasChat === false;

// -----------------------------------------------------------------------------
// World State
// -----------------------------------------------------------------------------
function renderWorldState(ctx) {
    const ws = ctx.parsed?.worldState;
    if (!ws) return null;

    const kv = (label, val) => val ? el("div", { class: "meg-sp-kv" },
        el("span", { class: "meg-sp-kv-key" }, label),
        el("span", { class: "meg-sp-kv-val" }, val),
    ) : null;

    const rows = [
        kv("Date & Time", ws.dateTime),
        kv("Location", ws.location),
        kv("Weather", ws.weather),
        kv("Arc Phase", ws.arcPhase),
        kv("Scene Phase", ws.scenePhase),
    ].filter(Boolean);

    const container = el("div", { class: "meg-sp-ws" });
    if (rows.length) {
        container.appendChild(el("div", { class: "meg-sp-ws-meta" }, rows));
    }

    // PC card
    if (ws.pc && (ws.pc.name || Object.keys(ws.pc.fields || {}).length)) {
        container.appendChild(el("div", { class: "meg-sp-card meg-sp-card-pc" },
            el("div", { class: "meg-sp-card-head" },
                el("i", { class: "fa-solid fa-user" }),
                " ",
                ws.pc.name || "PC"),
            el("div", { class: "meg-sp-card-fields" },
                Object.entries(ws.pc.fields || {}).map(([k, v]) =>
                    el("div", { class: "meg-sp-field" },
                        el("span", { class: "meg-sp-field-key" }, k + ":"),
                        " ",
                        el("span", { class: "meg-sp-field-val" }, v),
                    ))),
        ));
    }

    // NPCs Present renders in the Present Characters bar (bottom of chat);
    // click a portrait there for the full sheet.

    if (ws.offScreen && ws.offScreen.length) {
        container.appendChild(el("div", { class: "meg-sp-card-head meg-sp-card-head-sep" },
            el("i", { class: "fa-solid fa-satellite-dish" }), " Off-Screen"));
        container.appendChild(el("ul", { class: "meg-sp-bullets" },
            ws.offScreen.map(x => el("li", {}, x))));
    }

    if (ws.threads && ws.threads.length) {
        container.appendChild(el("div", { class: "meg-sp-card-head meg-sp-card-head-sep" },
            el("i", { class: "fa-solid fa-fire" }), " Unresolved Threads"));
        container.appendChild(el("ul", { class: "meg-sp-bullets" },
            ws.threads.map(x => el("li", {}, x))));
    }

    if (ws.plantedSeeds && ws.plantedSeeds.length) {
        container.appendChild(el("div", { class: "meg-sp-card-head meg-sp-card-head-sep" },
            el("i", { class: "fa-solid fa-seedling" }), " Planted Seeds"));
        container.appendChild(el("ul", { class: "meg-sp-bullets" },
            ws.plantedSeeds.map(x => el("li", {}, x))));
    }

    if (ws.consequenceTimers && ws.consequenceTimers.length) {
        container.appendChild(el("div", { class: "meg-sp-card-head meg-sp-card-head-sep" },
            el("i", { class: "fa-solid fa-hourglass-half" }), " Consequence Timers"));
        container.appendChild(el("ul", { class: "meg-sp-bullets" },
            ws.consequenceTimers.map(x => el("li", {}, x))));
    }

    if (ws.leftovers && ws.leftovers.length) {
        container.appendChild(el("div", { class: "meg-sp-leftover", html:
            ws.leftovers.map(t => `<div>${escapeHtml(t)}</div>`).join("") }));
    }

    if (!container.children.length) return null;
    return container;
}

// -----------------------------------------------------------------------------
// NPC Inner Chatter
// -----------------------------------------------------------------------------
function renderInnerChatter(ctx) {
    const entries = ctx.parsed?.innerChatter;
    if (!entries || !entries.length) return null;

    // Group consecutive lines by the same NPC so multiple thoughts share one avatar
    const groups = [];
    for (const e of entries) {
        const last = groups[groups.length - 1];
        if (last && last.name === e.name) last.quotes.push(e.quote);
        else groups.push({ name: e.name, quotes: [e.quote] });
    }
    const wrap = el("div", { class: "meg-sp-chatter" });
    for (const g of groups) {
        const banked = ctx.lookupBankedNpc(g.name);
        wrap.appendChild(el("div", { class: "meg-sp-thought" },
            el("div", { class: "meg-sp-thought-avatar" },
                avatarNode(banked, g.name, { portrait: false }),
                el("div", { class: "meg-sp-thought-bubbles" },
                    el("div", { class: "meg-sp-bubble meg-sp-bubble-2" }),
                    el("div", { class: "meg-sp-bubble meg-sp-bubble-1" }),
                ),
            ),
            el("div", { class: "meg-sp-thought-content" },
                g.name ? el("div", { class: "meg-sp-thought-name" }, g.name) : null,
                el("div", { class: "meg-sp-thought-quotes" },
                    // A thought written over several lines arrives as one entry
                    // with its line breaks in it, so it is drawn as one thought
                    // with its line breaks kept rather than chopped into several.
                    // `pre-line` is the one property that does that; it changes
                    // nothing for a thought written on a single line, which is
                    // almost all of them. Inline rather than a rule, because the
                    // class already carries everything else this line needs.
                    g.quotes.map(q => el("div", {
                        class: "meg-sp-thought-text",
                        style: { whiteSpace: "pre-line" },
                    }, q))),
            ),
        ));
    }
    return wrap;
}

// -----------------------------------------------------------------------------
// New NPC Dossiers
// -----------------------------------------------------------------------------
// The one line that sits beside a closed dossier's name. Their role says who
// the person is in the fewest words; age and sex are the next best; failing
// both, whatever the first field turned out to be. The dossier's opening line is
// name, age, sex and orientation all in one field, so everything after the first
// `|` is dropped — one fact reads better than four fragments. Long values are
// cut so the header stays one line at any panel width.
const DOSSIER_PREVIEW_KEYS = ["Role", "Occupation", "Age", "Sex", "Where to Find Them"];
const DOSSIER_PREVIEW_MAX = 64;

export function dossierPreview(fields) {
    const f = fields || {};
    const pick = k => (typeof f[k] === "string" && f[k].trim()) ? f[k].trim() : "";
    let s = "";
    for (const k of DOSSIER_PREVIEW_KEYS) { s = pick(k); if (s) break; }
    if (!s) {
        const first = Object.values(f).find(v => typeof v === "string" && v.trim());
        s = (first || "").trim();
    }
    s = s.split("|")[0].trim();
    return s.length > DOSSIER_PREVIEW_MAX ? s.slice(0, DOSSIER_PREVIEW_MAX - 1).trimEnd() + "\u2026" : s;
}

function renderNewNpcs(ctx) {
    const list = ctx.parsed?.newNpcs;
    if (!list || !list.length) return null;
    // A dossier is a full page — name, age, role, appearance, background, inner
    // circle, personality, secrets, canon lock — and several of them can arrive
    // in one message. Every one of them is drawn, always; what changes with the
    // count is how much of it is open. From two upward each starts closed behind
    // a header line, so the section is a short list instead of a wall and the
    // sections under it stay reachable. A single dossier floods nothing and is
    // the whole point of the section when it turns up, so that one stays open.
    const many = list.length > 1;
    const wrap = el("div", { class: "meg-sp-newnpcs" });
    for (const n of list) {
        // Each dossier is its own collapsible so long ones can be tucked away
        const d = el("details", { class: "meg-sp-card meg-sp-card-newnpc meg-sp-newnpc" });
        d.open = !many;
        // Only worth the room when the body is hidden; with the body open the
        // same fact is already the first row under the header.
        const preview = many ? dossierPreview(n.fields) : "";
        d.appendChild(el("summary", { class: "meg-sp-newnpc-head" },
            el("i", { class: "fa-solid fa-user-plus" }), " ",
            el("span", { class: "meg-sp-newnpc-name" }, n.name || "Unnamed NPC"),
            // The six layout properties this line needs used to sit here in the
            // code, because the stylesheet was the author's own file and nothing
            // was being added to it. They are now the one rule the earlier round
            // wrote down for him, `.meg-sp-newnpc-preview`, and the code carries
            // the class name instead. meg-sp-muted goes on supplying the colour,
            // the italic and the smaller size, as it always did.
            preview ? el("span", {
                class: "meg-sp-muted meg-sp-newnpc-preview",
                title: preview,
            }, preview) : null,
            el("i", { class: "fa-solid fa-chevron-down meg-sp-chevron" }),
        ));
        d.appendChild(Object.keys(n.fields || {}).length
            ? el("div", { class: "meg-sp-card-fields" },
                Object.entries(n.fields).map(([k, v]) =>
                    el("div", { class: "meg-sp-field" },
                        el("span", { class: "meg-sp-field-key" }, k + ":"),
                        " ",
                        // A value built from several bulleted source lines -
                        // an inner circle with one person per line - arrives
                        // with a line break between entries, and the browser
                        // was folding those breaks into spaces so three people
                        // read as one line. Such a value now draws as the same
                        // bullet list the Planted Seeds rows use: the label on
                        // its own line, then one bulleted line per entry. The
                        // usual one-line value keeps the span it always had.
                        v.includes("\n")
                            ? el("ul", { class: "meg-sp-bullets meg-sp-field-val" },
                                v.split("\n").map(t => el("li", {}, t)))
                            : el("span", { class: "meg-sp-field-val" }, v))))
            : el("div", { class: "meg-sp-muted" }, "(no parsed fields)"));
        wrap.appendChild(d);
    }
    return wrap;
}

// -----------------------------------------------------------------------------
// Story Planner
// -----------------------------------------------------------------------------
// The story tracker the model appends to a reply is drawn here rather than in a
// section of its own. That is the decision, in the author's words: handled the
// same way as the other blocks, hidden in the chat by the side panel hider, and
// shown in the Story Planner section separated by a horizontal bar from the
// information below it.
//
// Field lines draw as the label-and-value rows the dossier cards already use, so
// the tracker reads like the rest of the panel and no rule was added for it. A
// line the reader could not turn into a field is drawn as it arrived, in its own
// place in the order, because these blocks are written freely and a line dropped
// on the floor is a line nobody can ask about.
function renderStoryTracker(ctx) {
    const t = ctx.parsed?.storyTracker;
    if (!t || !t.found || !t.lines.length) return null;
    return el("div", { class: "meg-sp-card-fields" },
        t.lines.map(ln => el("div", { class: "meg-sp-field" },
            ln.key ? el("span", { class: "meg-sp-field-key" }, ln.key + ":") : null,
            ln.key ? " " : null,
            el("span", { class: "meg-sp-field-val" }, ln.key ? ln.value : ln.text))));
}

// The bar between the tracker and the plan. Written on the element rather than as
// a rule so the stylesheet gains nothing for it: the three properties are the
// panel's own separator, the dashed line the World State headings already draw
// between their groups, in the panel's own soft border colour.
const trackerRule = () => el("hr", {
    style: { border: "0", borderTop: "1px dashed var(--meg-sp-border-soft)", margin: "10px 0" },
});

// Exactly what this section drew before the tracker was added to it, moved into
// its own function so the tracker can sit above it without touching any of it.
function renderStoryPlanBody(ctx) {
    const sp = ctx.profile?.storyPlan || {};
    const plan = sp.currentPlan;
    if (!(sp.enabled || (plan && plan.trim()))) return null;
    if (!plan || !plan.trim()) return el("div", { class: "meg-sp-muted" }, "Story Planner is empty.");
    const lines = plan.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const list = el("ol", { class: "meg-sp-plan" });
    let added = 0;
    for (const ln of lines) {
        const clean = ln.replace(/^[\-\*•]\s*/, "").replace(/^\d+[\.\)]\s*/, "");
        if (!clean) continue;
        list.appendChild(el("li", {}, clean));
        added++;
    }
    if (!added) return el("div", { class: "meg-sp-summary-text" }, plan.trim());
    return list;
}

function renderStoryPlan(ctx) {
    if (noChat(ctx)) return null;
    const tracker = renderStoryTracker(ctx);
    const body = renderStoryPlanBody(ctx);
    // No tracker in the last reply and the section is exactly what it was: the
    // same node, with no empty space where a tracker would have gone and no bar
    // across the top of it. A tracker with nothing under it draws on its own,
    // with nothing to separate it from.
    if (!tracker) return body;
    if (!body) return tracker;
    return el("div", {}, tracker, trackerRule(), body);
}

// -----------------------------------------------------------------------------
// NPC Bank
// -----------------------------------------------------------------------------
function renderNpcBank(ctx) {
    if (noChat(ctx)) return null;
    const bank = ctx.profile?.npcBank;
    if (!bank) return null;
    const npcs = bank.npcs || [];
    const wrap = el("div", { class: "meg-sp-bank" });

    const openBookBtn = el("button", {
        class: "meg-sp-book-btn",
        title: "Open the full NPC Book (browse, edit, upload, generate portraits)",
        onclick: () => ctx.openNpcBook(),
    },
        el("i", { class: "fa-solid fa-book-open" }),
        " Open NPC Book",
        npcs.length ? el("span", { class: "meg-sp-book-count" }, String(npcs.length)) : null,
    );
    wrap.appendChild(openBookBtn);

    if (!npcs.length) {
        wrap.appendChild(el("div", { class: "meg-sp-muted", style: { marginTop: "8px" } },
            "No NPCs banked yet. They get added automatically as the AI introduces them."));
        return wrap;
    }

    const grid = el("div", { class: "meg-sp-bank-grid" });
    // Newest first (matches the NPC Book's reverse-iteration pattern)
    [...npcs].reverse().forEach((n, revIdx) => {
        const idx = npcs.length - 1 - revIdx;
        const male = isMaleSex(n.sex);
        const accentVar = male ? "var(--meg-sp-npc-male, #3b82f6)" : "var(--meg-sp-npc-female, #f43f5e)";
        const portrait = n.pfp
            ? el("img", { class: "meg-sp-npc-pfp", src: n.pfp, alt: n.name || "NPC" })
            : el("div", { class: "meg-sp-npc-pfp meg-sp-npc-pfp-empty" },
                el("i", { class: "fa-solid fa-user-secret" }));

        const ageSex = [n.age, n.sex].filter(Boolean).join(" · ");

        grid.appendChild(el("div", {
            class: "meg-sp-bank-mini",
            style: { "--accent": accentVar },
            title: "Click to open in NPC Book",
            onclick: () => ctx.openNpcBook(idx),
        },
            portrait,
            el("div", { class: "meg-sp-bank-mini-info" },
                el("div", { class: "meg-sp-bank-mini-name" }, n.name || "Unnamed"),
                ageSex ? el("div", { class: "meg-sp-bank-mini-meta" }, ageSex) : null,
                (n.role || n.occupation)
                    ? el("div", { class: "meg-sp-bank-mini-occ" }, n.role || n.occupation)
                    : null,
            ),
        ));
    });
    wrap.appendChild(grid);
    return wrap;
}

// -----------------------------------------------------------------------------
// Ban List
// -----------------------------------------------------------------------------
function renderBanList(ctx) {
    if (noChat(ctx)) return null;
    const items = ctx.profile?.banList;
    if (!items || !items.length) return null;
    return el("ul", { class: "meg-sp-banlist" },
        items.map(p => el("li", {}, typeof p === "string" ? p : (p.phrase || p.text || JSON.stringify(p)))));
}

// -----------------------------------------------------------------------------
// Registry — panel.js iterates this; settings tab reads id/icon/title/order
// -----------------------------------------------------------------------------
export const SECTION_REGISTRY = [
    {
        id: "worldState", icon: "fa-thumbtack", title: "World State",
        defaultOpen: true, order: 0, render: renderWorldState, badge: null,
    },
    {
        id: "innerChatter", icon: "fa-comment-dots", title: "NPC Inner Chatter",
        defaultOpen: true, order: 1, render: renderInnerChatter,
        badge: (ctx) => ctx.parsed?.innerChatter?.length || null,
    },
    {
        id: "newNpcs", icon: "fa-user-plus", title: "New NPC Dossiers",
        defaultOpen: true, order: 2, render: renderNewNpcs,
        badge: (ctx) => ctx.parsed?.newNpcs?.length || null,
    },
    {
        id: "storyPlan", icon: "fa-map", title: "Story Planner",
        defaultOpen: false, order: 3, render: renderStoryPlan, badge: null,
    },
    {
        id: "npcBank", icon: "fa-address-book", title: "NPC Bank",
        defaultOpen: false, order: 4, render: renderNpcBank,
        badge: (ctx) => ctx.profile?.npcBank?.npcs?.length || null,
    },
    {
        id: "banList", icon: "fa-ban", title: "Ban List",
        defaultOpen: false, order: 5, render: renderBanList,
        badge: (ctx) => ctx.profile?.banList?.length || null,
    },
];

// -----------------------------------------------------------------------------
// Block sections — one panel section per block the chat card can draw.
// Maintained by LukaTheHero for this fork.
//
// The native sections above know four blocks by hand (World State, Inner
// Chatter, New NPC dossiers, Story Tracker). Everything else in the block
// registry — Choices, Dice, Bonds, Character Sheet, NPC Updates and any custom
// block added in the BLOCKS tab — gets a section here, drawn by the very same
// pane builder the chat card uses. A block the card learns, the panel learns
// with it; nothing in this file has to change when a new one lands.
// -----------------------------------------------------------------------------
export const BLOCK_SECTION_PREFIX = "block:";
export function blockSectionId(blockId) { return BLOCK_SECTION_PREFIX + blockId; }
export function isBlockSectionId(id) { return typeof id === "string" && id.startsWith(BLOCK_SECTION_PREFIX); }

function blocksInLastReply(ctx, def) {
    const raw = ctx?.parsed?.rawText || "";
    try {
        return extractBlocks(raw, [def]).filter(b => (b.def.visibility || "open") !== "hidden");
    } catch (e) {
        return [];
    }
}

function renderBlockSection(ctx, def) {
    const blocks = blocksInLastReply(ctx, def);
    if (!blocks.length) return null;
    const wrap = el("div", { class: "meg-sp-blocks" });
    for (const b of blocks) {
        const item = el("div", { class: "meg-sp-block" + (b.truncated ? " meg-sp-block-cut" : "") });
        if (b.name) item.appendChild(el("div", { class: "meg-sp-block-name" }, b.name));
        item.appendChild(buildBlockPane(b, document, {
            onChoice: meguminApplyChoice,
            statFields: meguminStatFieldMap(),
        }));
        wrap.appendChild(item);
    }
    return wrap;
}

export function blockSections() {
    let registry = [];
    try { registry = meguminRenderRegistry() || []; } catch (e) { return []; }
    const native = new Set(Object.keys(MEGUMIN_PANEL_SECTION_BY_BLOCK));
    return registry
        .filter(def => def && def.id && def.tag && !native.has(def.id))
        .map((def, i) => ({
            id: blockSectionId(def.id),
            icon: def.icon || "fa-cube",
            title: def.label || def.name || def.tag,
            defaultOpen: true,
            order: 100 + i,
            block: def,
            render: (ctx) => renderBlockSection(ctx, def),
            badge: (ctx) => { const n = blocksInLastReply(ctx, def).length; return n > 1 ? n : null; },
        }));
}

// Everything the panel can show right now: the hand-written sections plus one
// per block. Read fresh each time, because custom blocks come and go.
export function allSections() {
    return [...SECTION_REGISTRY, ...blockSections()];
}
