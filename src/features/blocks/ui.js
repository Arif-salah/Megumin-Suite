// ────────────────────────────────────────────────────────────────────────────
// The Blocks tab — stack, per-block settings, stat fields, and the live preview.
//
// Separate from blocks/chat.js because the preview renders through the dict
// builder: it draws from the same code the chat uses, so a preview can never
// disagree with the real thing. That pulls in the top of the graph, which the
// chat-side renderer has no need of.
// ────────────────────────────────────────────────────────────────────────────

import { Popup, POPUP_TYPE } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { saveProfileToMemory, saveProfileDebounced, deleteCustomBlockEverywhere } from "../../core/profile.js";
import { escapeHtmlAttr } from "../../utils/html.js";
import { buildBlocksCard, extractBlocks } from "../../blocks/render.js";
import { buildBaseDict } from "../../engine/buildBaseDict.js";
import {
    MEGUMIN_BLOCK_REGISTRY, BLOCK_VISIBILITY_CHOICES, STAT_FIELD_PACKS, STAT_FIELD_TYPES,
    meguminRenderRegistry, meguminActiveBlocks, meguminBlockById, meguminStatFields, meguminStatFieldMap,
    blockTagFromName, validateCustomBlock, meguminSyncLegacyBlockIds, meguminBlockTemplateBody, meguminBuildCustomTemplate,
} from "./registry.js";
import { normalizeCustomBlock } from "../../state/modules/custom/model.js";
import { chomusukeReady } from "../../state/index.js";
import { meguminScheduleBlocksRefresh } from "./chat.js";
import { fireRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { keepScroll, confirmPopup } from "../../ui/controls.js";
import { meguminSlotByTrigger } from "../../../data/slots.js";
import { hasSharedFragment } from "../../core/sharedFragments.js";

// Mirrors customBadge() in ui/tabs/globalAndBlocks.js: a block whose text was
// rewritten in Dev Mode says so here, where it is switched on and ordered.
// The link is b.source -- the trigger the block already declares to read its
// body out of the dictionary -- so no lookup table can rot.
function editedFlag(b) {
    const slot = b && b.source ? meguminSlotByTrigger(b.source) : null;
    if (!slot || !slot.key || !hasSharedFragment(slot.key)) return "";
    return ` <span class="blk-edited-flag" title="You edited this in Dev Mode. It no longer uses the built-in text.">edited</span>`;
}

export function renderBlocksTab(c) {
    // An edit here redraws the tab: keep the scroll where it was (plan 020).
    return keepScroll(() => drawBlocksTab(c));
}

function drawBlocksTab(c) {
    c.empty();
    const stack = localProfile.blockStack;
    const all = [...MEGUMIN_BLOCK_REGISTRY, ...(stack.custom || [])].filter(b => !b.system);
    const inStack = stack.order.map(id => meguminBlockById(id)).filter(b => b && !b.system);
    const available = all.filter(b => !stack.order.includes(b.id));

    const visOf = b => (stack.overrides[b.id] && stack.overrides[b.id].visibility) || b.visibility || "open";

    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #f59e0b, #b45309);"><i class="fa-solid fa-cubes"></i></div>
                <div>
                    <h2>Blocks</h2>
                    <p>Everything in this list is sent as one master block at the end of the reply, and drawn in the chat as one collapsible card.</p>
                </div>
            </div>
            <div class="mtab-header-badge" style="background: rgba(245,158,11,0.12); color:var(--c-brand, #f59e0b); border:1px solid rgba(245,158,11,0.25);">
                <i class="fa-solid fa-layer-group" style="font-size:0.6rem;"></i> ${inStack.length} in block
            </div>
        </div>
    `);

    const layout = $(`<div class="blk-layout"></div>`);
    const left = $(`<div class="blk-col"></div>`);
    const right = $(`<div class="blk-col"></div>`);

    // ── HIDE BLOCKS FROM THE AI (plan 008) ──
    const hide = $(`
        <label class="blk-ws-chip blk-hide-ai" title="The story model reads the current values (Bonds, Sheet, World State, the last Inner Chatter and Story Tracker) once, in Current Info, instead of every old block in the chat. Turn off to let it read the old blocks again.">
            <input type="checkbox" id="blk_hide_ai" ${localProfile.hideBlocksFromAI !== false ? "checked" : ""}/> Hide old blocks from the AI (it reads Current Info instead) <span class="ecard-badge rec"><i class="fa-solid fa-star"></i> Recommended</span>
        </label>
    `);
    hide.find("#blk_hide_ai").on("change", function () {
        localProfile.hideBlocksFromAI = this.checked; saveProfileToMemory();
    });
    left.append(hide);

    // ── IN THE BLOCK ──
    left.append(`<div class="wstyle-section-head gold"><i class="fa-solid fa-list-ol"></i> Inside the master block</div>`);
    const list = $(`<div class="blk-stack"></div>`);

    if (!inStack.length) {
        list.append(`<div class="blk-empty">Nothing here yet. Add a block from the right.</div>`);
    }

    inStack.forEach((b, i) => {
        const off = typeof b.requires === "function" && !b.requires(localProfile);
        const row = $(`
            <div class="blk-row ${off ? 'blk-row-off' : ''}"${b.desc ? ` title="${escapeHtmlAttr(b.desc)}"` : ""}>
                <div class="blk-row-main">
                    <span class="blk-emoji">${b.emoji || "📦"}</span>
                    <div>
                        <div class="blk-name">${b.label}${b.builtin ? "" : ` <span class="blk-custom-flag">custom</span>`}${editedFlag(b)}</div>
                        <div class="blk-tag">&lt;${b.tag}&gt;${off ? " — its feature is switched off, so it is not sent" : ""}</div>
                    </div>
                </div>
                <div class="blk-row-actions">
                    <button class="ws-btn-small blk-up" ${i === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
                    <button class="ws-btn-small blk-down" ${i === inStack.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
                    <select class="ps-modern-input blk-vis">
                        ${BLOCK_VISIBILITY_CHOICES.map(o => `<option value="${o.v}" ${(visOf(b) === "hidden" ? "hidden" : "open") === o.v ? "selected" : ""} title="${o.hint}">${o.label}</option>`).join("")}
                    </select>
                    ${b.builtin ? "" : `<button class="ws-btn-small blk-edit" style="color:var(--gold);"><i class="fa-solid fa-pen"></i></button>`}
                    <button class="ws-btn-small blk-remove" style="color:var(--c-danger, #ef4444);" title="${b.builtin ? "Take this block out" : "Take this block out for this character. It stays under Add a block for every character."}"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
        `);

        const move = delta => {
            const j = i + delta;
            if (j < 0 || j >= stack.order.length) return;
            const [id] = stack.order.splice(i, 1);
            stack.order.splice(j, 0, id);
            meguminSyncLegacyBlockIds();
            saveProfileToMemory(); renderBlocksTab(c);
        };
        row.find(".blk-up").on("click", () => move(-1));
        row.find(".blk-down").on("click", () => move(1));
        row.find(".blk-vis").on("change", function () {
            stack.overrides[b.id] = { ...(stack.overrides[b.id] || {}), visibility: $(this).val() };
            saveProfileToMemory(); renderBlocksTab(c);
        });
        row.find(".blk-remove").on("click", () => {
            stack.order = stack.order.filter(x => x !== b.id);
            meguminSyncLegacyBlockIds();
            saveProfileToMemory(); renderBlocksTab(c);
        });
        row.find(".blk-edit").on("click", () => renderCustomBlockEditor(c, b.id));
        list.append(row);

        // World State's settings live in its own tab (plan 020): here it is
        // only ordered and shown or hidden, like every other block.
        if (b.id === "world") {
            const sub = $(`
                <div class="blk-sub blk-ws">
                    <button type="button" class="menu_button blk-ws-open"><i class="fa-solid fa-thumbtack"></i> World State settings <i class="fa-solid fa-arrow-right"></i></button>
                    <span class="blk-sub-desc">Who writes the updates, how much the model reads, and this chat's Editor.</span>
                </div>
            `);
            sub.find(".blk-ws-open").on("click", () => fireRefreshHook(REFRESH.SWITCH_TAB, "world"));
            list.append(sub);
        }

        // Stat blocks are generated from a field list, so they get an editor for it.
        if (b.id === "bonds" || b.id === "sheet") {
            list.append(renderStatFieldEditor(c, b));
        }
    });
    left.append(list);

    // ── AVAILABLE ──
    left.append(`<div class="wstyle-section-head green" style="margin-top:18px;"><i class="fa-solid fa-plus"></i> Add a block</div>`);
    const pool = $(`<div class="blk-pool"></div>`);
    if (!available.length) pool.append(`<div class="blk-empty">Every block is already in.</div>`);
    available.forEach(b => {
        const chip = $(`<button class="blk-add"${b.desc ? ` title="${escapeHtmlAttr(b.desc)}"` : ""}><span>${b.emoji || "📦"}</span> ${b.label}${editedFlag(b)}</button>`);
        chip.on("click", () => {
            if (b.preferFirst) stack.order.unshift(b.id); else stack.order.push(b.id);
            meguminSyncLegacyBlockIds();
            saveProfileToMemory(); renderBlocksTab(c);
        });
        pool.append(chip);
    });
    const newBtn = $(`<button class="blk-add blk-add-new"><i class="fa-solid fa-wand-magic-sparkles"></i> Create custom block</button>`);
    newBtn.on("click", () => renderCustomBlockEditor(c, null));
    pool.append(newBtn);
    left.append(pool);

    // ── PREVIEW ──
    right.append(`<div class="wstyle-section-head purple"><i class="fa-solid fa-eye"></i> Preview</div>`);
    right.append(`<div class="blk-preview-note">This is the card the chat draws. Click a header to fold it.</div>`);
    const previewHost = $(`<div class="blk-preview"></div>`);
    right.append(previewHost);

    layout.append(left).append(right);
    c.append(layout);

    renderBlocksPreview(previewHost[0]);
}

export function renderStatFieldEditor(c, def) {
    const cfg = localProfile.statBlocks[def.id];
    const wrap = $(`<div class="blk-sub blk-sub-fields"></div>`);

    wrap.append(`<div class="blk-sub-label" style="margin-bottom:2px;">Fields</div>
        <div class="blk-sub-desc" style="margin-bottom:8px;">What the AI is asked to track${def.id === "bonds" ? " for each NPC" : ""}. Every field costs tokens on every reply.</div>`);

    const rows = $(`<div class="stat-field-list"></div>`);
    (cfg.fields || []).forEach((f, i) => {
        const row = $(`
            <div class="stat-field">
                <input type="text" class="ps-modern-input sf-label" value="${escapeHtmlAttr(f.label)}" placeholder="Name" />
                <select class="ps-modern-input sf-type">
                    ${STAT_FIELD_TYPES.map(t => `<option value="${t.v}" ${f.type === t.v ? "selected" : ""} title="${t.hint}">${t.label}</option>`).join("")}
                </select>
                <input type="number" class="ps-modern-input sf-max" value="${f.max || 100}" title="Maximum" style="display:${f.type === "meter" ? "" : "none"};" />
                <input type="number" class="ps-modern-input sf-start" value="${f.start !== undefined ? f.start : 0}" title="Starting value" style="display:${f.type === "meter" || f.type === "number" ? "" : "none"};" />
                <button class="ws-btn-small sf-up" ${i === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
                <button class="ws-btn-small sf-del" style="color:var(--c-danger, #ef4444);"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `);
        row.find(".sf-label").on("input", function () { f.label = $(this).val(); saveProfileDebounced(); });
        row.find(".sf-type").on("change", function () {
            f.type = $(this).val();
            saveProfileToMemory(); renderBlocksTab(c);
        });
        row.find(".sf-max").on("input", function () { f.max = parseInt($(this).val(), 10) || 100; saveProfileDebounced(); });
        row.find(".sf-start").on("input", function () { f.start = parseInt($(this).val(), 10) || 0; saveProfileDebounced(); });
        row.find(".sf-up").on("click", () => {
            cfg.fields.splice(i - 1, 0, cfg.fields.splice(i, 1)[0]);
            saveProfileToMemory(); renderBlocksTab(c);
        });
        row.find(".sf-del").on("click", () => {
            cfg.fields.splice(i, 1);
            saveProfileToMemory(); renderBlocksTab(c);
        });
        rows.append(row);
    });
    wrap.append(rows);

    const tools = $(`<div class="blk-pool" style="margin-top:8px;"></div>`);
    const addBtn = $(`<button class="blk-add"><i class="fa-solid fa-plus"></i> Add field</button>`);
    addBtn.on("click", () => {
        cfg.fields.push({ id: "f_" + Date.now(), label: "New field", type: "meter", max: 100, start: 0 });
        saveProfileToMemory(); renderBlocksTab(c);
    });
    tools.append(addBtn);

    (STAT_FIELD_PACKS[def.id] || []).forEach(pack => {
        const btn = $(`<button class="blk-add"><i class="fa-solid fa-box-open"></i> ${pack.label}</button>`);
        btn.on("click", () => {
            // Merge, never replace: a field already there keeps its settings.
            pack.fields.forEach(pf => {
                if (!cfg.fields.some(f => String(f.label).toLowerCase() === pf.label.toLowerCase())) {
                    cfg.fields.push({ ...pf });
                }
            });
            saveProfileToMemory(); renderBlocksTab(c);
            toastr.success(`${pack.label} fields added.`);
        });
        tools.append(btn);
    });
    wrap.append(tools);

    return wrap;
}

export function renderBlocksPreview(host) {
    if (!host) return;
    host.innerHTML = "";

    const registry = meguminRenderRegistry();
    const active = meguminActiveBlocks();
    if (!active.length) {
        host.innerHTML = `<div class="blk-empty">No blocks in the master block, so nothing is sent and nothing is drawn.</div>`;
        return;
    }

    // Always the templates, never a reply from the open chat. This is where the
    // templates are being edited, so it has to show what is being sent — real
    // content from a past reply would hide the very thing that just changed.
    //
    // buildBaseDict is what the real envelope is assembled from, so the preview
    // inherits engine overrides, custom prompts and compact World State for free.
    let dict = {};
    try { dict = buildBaseDict(true) || {}; } catch (e) { dict = {}; }

    const sample = "<Blocks>\n" + active.map(b => {
        // Same three sources the envelope uses, so the preview cannot drift.
        const body = b.slot ? "[Only appears when the story introduces a new NPC.]" : meguminBlockTemplateBody(b, dict);
        return body ? `<${b.tag}>\n${body}\n</${b.tag}>` : "";
    }).filter(Boolean).join("\n") + "\n</Blocks>";

    const blocks = extractBlocks(sample, registry);
    if (!blocks.length) {
        host.innerHTML = `<div class="blk-empty">Nothing to preview yet.</div>`;
        return;
    }

    // Open on arrival: the chat card rests shut, but a shut preview shows nothing.
    host.appendChild(buildBlocksCard(blocks, { preview: true, expanded: true, statFields: meguminStatFieldMap() }));
    const note = document.createElement("div");
    note.className = "blk-preview-source";
    note.textContent = "Showing the templates the AI is asked to fill in.";
    host.appendChild(note);
}

// One-of-many as icon tiles (the World State tab's style). A disabled tile
// says why in its own line.
function choiceTiles(options, current, onPick) {
    const $t = $(`<div class="igx-tiles wsx-choice"></div>`);
    for (const o of options) {
        const $b = $(`<button type="button" class="igx-tile ${o.id === current ? "on" : ""}" ${o.disabled ? "disabled" : ""}>
            <b><i class="fa-solid ${o.icon}"></i> ${escapeHtmlAttr(o.label)}</b><span>${escapeHtmlAttr(o.disabled || o.desc)}</span>
        </button>`);
        $b.on("click", () => {
            if (o.disabled || $b.hasClass("on")) return;
            $t.children().removeClass("on");
            $b.addClass("on");
            onPick(o.id);
        });
        $t.append($b);
    }
    return $t;
}

// The grey example in a field's description box, by type.
const FIELD_DESC_EXAMPLE = {
    meter: "What it means and how it moves, e.g. How much she trusts {{user}}. Goes up when he keeps his word, down when he lies or hides things.",
    number: "What it counts and when it changes, e.g. Coins in {{user}}'s purse. Changes only when money changes hands.",
    text: "What to write here, e.g. Her mood in a few words, as the scene leaves her.",
    list: "What goes in the list, e.g. What {{user}} carries. Add or remove only when the story does."
};

const sectionHead = (label, desc) => `<div style="padding: 14px 0 6px;">
    <div class="set-label" style="margin-bottom:4px;">${label}</div>
    ${desc ? `<div class="set-desc">${desc}</div>` : ""}
</div>`;

// Plan 023: a custom block is a name and a look, what it holds (fields or
// free text), what the story remembers of it, and when it is written.
export function renderCustomBlockEditor(c, editId) {
    const stack = localProfile.blockStack;
    const existing = editId ? (stack.custom || []).find(b => b.id === editId) : null;
    const draft = existing
        ? normalizeCustomBlock(structuredClone(existing))
        : normalizeCustomBlock({ id: "blk_" + Date.now(), label: "", tag: "", emoji: "📦", visibility: "open", builtin: false, content: "" });
    if (draft.visibility !== "hidden") draft.visibility = "open";

    c.empty();
    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #10b981, #047857);"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                <div>
                    <h2>${existing ? "Edit" : "New"} block</h2>
                    <p>Give it a name, choose what it holds, and how the story keeps it. Your custom blocks are shared: every character can add them from Add a block, and a change here applies to all of them.</p>
                </div>
            </div>
        </div>
    `);

    const form = $(`
        <div class="mtab-panel">
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">Name</div><div class="set-desc">Shown as the header in chat</div></div>
                <input type="text" id="blk_name" class="ps-modern-input" style="width:220px;" placeholder="e.g. Relationship Meter" value="${escapeHtmlAttr(draft.label || "")}" />
            </div>
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">Emoji</div><div class="set-desc">Sits before the header</div></div>
                <input type="text" id="blk_emoji" class="ps-modern-input" style="width:70px; text-align:center;" value="${escapeHtmlAttr(draft.emoji || "📦")}" />
            </div>
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">Shown as</div><div class="set-desc">Hidden blocks are still written and still kept</div></div>
                <select id="blk_vis" class="ps-modern-input" style="width:150px;">
                    ${BLOCK_VISIBILITY_CHOICES.map(o => `<option value="${o.v}" ${draft.visibility === o.v ? "selected" : ""}>${o.label}</option>`).join("")}
                </select>
            </div>
            <div style="font-size:0.68rem; color:var(--text-muted);">Tag: <code id="blk_tag_preview">&lt;${escapeHtmlAttr(draft.tag || "…")}&gt;</code></div>
            <div class="blk-ed-holds"></div>
            <div class="blk-ed-body"></div>
            <div class="blk-ed-writer"></div>
            <div class="blk-ed-memory"></div>
            <div class="blk-ed-when"></div>
            <div class="blk-ed-preview"></div>
        </div>
    `);
    c.append(form);

    // What the story is told for this block, as it stands in the form.
    const drawPreview = () => {
        const host = form.find(".blk-ed-preview").empty();
        const label = String($("#blk_name").val() || "").trim() || "Block";
        const tag = blockTagFromName(label) || "Block";
        let body = "";
        try { body = meguminBuildCustomTemplate({ ...draft, label, tag }); } catch (e) { body = ""; }
        host.append(sectionHead("What the story is told", "The template sent for this block, updated as you type. Square brackets are filled in by the story."));
        const $pre = $(`<pre class="ps-modern-input" style="white-space:pre-wrap; font-size:0.72rem; line-height:1.45; max-height:260px; overflow:auto; margin:0;"></pre>`);
        $pre.text(body ? `<${tag}>\n${body}\n</${tag}>` : "Add a field or write a template to see it here.");
        host.append($pre);
    };
    // Every box updates the draft in its own handler first, then this runs.
    form.on("input change", () => drawPreview());

    form.find("#blk_name").on("input", function () {
        $("#blk_tag_preview").text(`<${blockTagFromName($(this).val()) || "…"}>`);
    });

    // What it holds.
    const drawHolds = () => {
        const host = form.find(".blk-ed-holds").empty();
        host.append(sectionHead("What it holds"));
        host.append(choiceTiles([
            { id: "fields", icon: "fa-sliders", label: "Fields", desc: "Named values like Trust or Gold. Meters are drawn as bars, lists as chips." },
            { id: "text", icon: "fa-align-left", label: "Free text", desc: "Your own template, sent as you wrote it." }
        ], draft.kind, v => { draft.kind = v; drawBody(); }));
    };

    // The fields, or the template.
    const drawBody = () => {
        const host = form.find(".blk-ed-body").empty();
        if (draft.kind === "text") {
            host.append(sectionHead("Template", "What the story is told to write. Square brackets read as fill-me-in."));
            const $ta = $(`<textarea class="ps-modern-input" rows="8" style="width:100%; resize:vertical;" placeholder="e.g.&#10;Goal: [what the party wants now]&#10;Next step: [what they do about it]"></textarea>`);
            $ta.val(draft.content || "");
            $ta.on("input", function () { draft.content = $(this).val(); });
            host.append($ta);
            drawPreview();
            return;
        }
        // Rules for the whole block, in the user's words (sent before the fields' own notes).
        host.append(sectionHead("Rules for this block", "How the story should write this block as a whole. Each line is sent as you wrote it."));
        const $rules = $(`<textarea class="ps-modern-input blk-rules" rows="3" style="width:100%; resize:vertical; font-size:0.75rem;"
            placeholder="e.g.&#10;Track only the party, never strangers.&#10;Numbers change slowly: a single scene rarely moves one by more than 5."></textarea>`);
        $rules.val(draft.rules || "");
        $rules.on("input", function () { draft.rules = $(this).val(); });
        host.append($rules);
        host.append(sectionHead("Fields", "What the story keeps in this block. Say what each field means and how it changes: the story reads it. Every field costs tokens on every reply."));
        const rows = $(`<div class="stat-field-list"></div>`);
        draft.fields.forEach((f, i) => {
            const item = $(`<div class="blk-field-item" style="margin-bottom:10px;"></div>`);
            const row = $(`
                <div class="stat-field">
                    <input type="text" class="ps-modern-input sf-label" value="${escapeHtmlAttr(f.label)}" placeholder="Name" />
                    <select class="ps-modern-input sf-type">
                        ${STAT_FIELD_TYPES.map(t => `<option value="${t.v}" ${f.type === t.v ? "selected" : ""} title="${t.hint}">${t.label}</option>`).join("")}
                    </select>
                    <input type="number" class="ps-modern-input sf-max" value="${f.max || 100}" title="Maximum" style="display:${f.type === "meter" ? "" : "none"};" />
                    <input type="number" class="ps-modern-input sf-start" value="${f.start !== undefined ? f.start : 0}" title="Starting value" style="display:${f.type === "meter" || f.type === "number" ? "" : "none"};" />
                    <button class="ws-btn-small sf-up" title="Move up" ${i === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
                    <button class="ws-btn-small sf-del" title="Remove this field" style="color:var(--c-danger, #ef4444);"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `);
            row.find(".sf-label").on("input", function () { f.label = $(this).val(); });
            row.find(".sf-type").on("change", function () { f.type = $(this).val(); f.ownLine = f.type === "list"; drawBody(); });
            row.find(".sf-max").on("input", function () { f.max = parseInt($(this).val(), 10) || 100; });
            row.find(".sf-start").on("input", function () { f.start = parseInt($(this).val(), 10) || 0; });
            row.find(".sf-up").on("click", () => { draft.fields.splice(i - 1, 0, draft.fields.splice(i, 1)[0]); drawBody(); });
            row.find(".sf-del").on("click", () => { draft.fields.splice(i, 1); drawBody(); });
            // What the field means and how it changes, in the user's words.
            const $desc = $(`<textarea class="ps-modern-input sf-desc" rows="2" style="width:100%; resize:vertical; margin-top:4px; font-size:0.75rem;"
                placeholder="${escapeHtmlAttr(FIELD_DESC_EXAMPLE[f.type] || FIELD_DESC_EXAMPLE.text)}"></textarea>`);
            $desc.val(f.desc || "");
            $desc.on("input", function () { f.desc = $(this).val(); });
            item.append(row).append($desc);
            rows.append(item);
        });
        if (!draft.fields.length) rows.append(`<div class="blk-empty">No fields yet.</div>`);
        host.append(rows);
        const add = $(`<button class="blk-add" style="margin-top:8px;"><i class="fa-solid fa-plus"></i> Add field</button>`);
        add.on("click", () => {
            draft.fields.push({ id: "f_" + Date.now(), label: "New field", type: "meter", max: 100, start: 0, desc: "" });
            drawBody();
        });
        host.append(add);
        drawPreview();
    };

    // Who writes it (plan 023 phase 3).
    const drawWriter = () => {
        const host = form.find(".blk-ed-writer").empty();
        host.append(sectionHead("Who writes it"));
        host.append(choiceTiles([
            { id: "story", icon: "fa-feather", label: "The story", desc: "The story model writes it at the end of its reply." },
            { id: "chomusuke", icon: "fa-cat", label: "Chomusuke", desc: "Chomusuke reads each reply and writes it after, so the story model only writes the story." }
        ], draft.writer, v => { draft.writer = v; drawWriter(); }));
        if (draft.writer === "chomusuke" && !chomusukeReady()) {
            host.append(`<div class="set-desc" style="margin-top:8px; color:var(--c-brand, #f59e0b);"><i class="fa-solid fa-triangle-exclamation"></i> Chomusuke is off or has no connection, so this block won't be written until you set it up in the Chomusuke tab.</div>`);
        }
        drawPreview();
    };

    // What the story remembers of it.
    const drawMemory = () => {
        const host = form.find(".blk-ed-memory").empty();
        host.append(sectionHead("What the story remembers of it", "Works the same with \"Hide old blocks from the AI\" on or off."));
        host.append(choiceTiles([
            { id: "fresh", icon: "fa-seedling", label: "Starts fresh", desc: "The story doesn't see the last one, so it writes this block new each time." },
            { id: "chat", icon: "fa-comments", label: "Stays in the chat", desc: "The story reads its old copies in earlier replies, even while other blocks are hidden. Costs tokens on every old reply." },
            { id: "info", icon: "fa-thumbtack", label: "Last one in Current Info", desc: "The story reads only the latest one, once, before it writes. A field the reply leaves out keeps its value." }
        ], draft.memory, v => {
            draft.memory = v;
            if (v === "fresh" && draft.when === "changes") draft.when = "every";
            drawWhen();
        }));
        drawPreview();
    };

    // When it is written.
    const drawWhen = () => {
        const host = form.find(".blk-ed-when").empty();
        host.append(sectionHead("When the story writes it"));
        host.append(choiceTiles([
            { id: "every", icon: "fa-rotate", label: "Every reply", desc: "Written at the end of each reply." },
            { id: "changes", icon: "fa-pen-to-square", label: "Only when it changes", desc: "The story leaves it out when nothing in it changed.",
              disabled: draft.memory === "fresh" ? "Needs the story to see the block. Pick \"Stays in the chat\" or \"Last one in Current Info\" above." : "" },
            { id: "everyN", icon: "fa-forward", label: "Every few replies", desc: "Written once every few replies. Set how many below." }
        ], draft.when, v => { draft.when = v; drawWhen(); }));
        if (draft.when === "everyN") {
            const $n = $(`<div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">How many replies</div><div class="set-desc">From 2 to 20</div></div>
                <input type="number" min="2" max="20" class="ps-modern-input" style="width:80px;" value="${draft.everyN}" />
            </div>`);
            $n.find("input").on("input", function () { draft.everyN = normalizeCustomBlock({ when: "everyN", everyN: $(this).val() }).everyN; });
            host.append($n);
        }
        drawPreview();
    };

    drawHolds(); drawBody(); drawWriter(); drawMemory(); drawWhen();

    const actions = $(`
        <div style="display:flex; gap:10px; margin-top:16px;">
            <button class="ws-btn-small" id="blk_save" style="color:var(--c-live, #10b981); border-color:rgba(16,185,129,0.4);"><i class="fa-solid fa-check"></i> Save</button>
            <button class="ws-btn-small" id="blk_cancel"><i class="fa-solid fa-xmark"></i> Cancel</button>
            ${existing ? `<button class="ws-btn-small" id="blk_delete" style="margin-left:auto; color:var(--c-danger, #ef4444); border-color:rgba(239,68,68,0.35);" title="Delete this block for every character"><i class="fa-solid fa-trash"></i> Delete block</button>` : ""}
        </div>
    `);
    actions.find("#blk_cancel").on("click", () => renderBlocksTab(c));
    // Custom blocks are shared by every character (plan 023), so this is for all of them.
    actions.find("#blk_delete").on("click", async () => {
        const name = escapeHtmlAttr(existing.label || existing.tag);
        if (!(await confirmPopup(`Delete "${name}"?`,
            "It is deleted for every character and taken out of every character's blocks. What your chats already kept of it stays in them, but nothing shows or sends it any more.",
            { ok: "Delete" }))) return;
        deleteCustomBlockEverywhere(existing.id);
        meguminScheduleBlocksRefresh();
        toastr.success(`"${existing.label || existing.tag}" deleted.`);
        renderBlocksTab(c);
    });
    actions.find("#blk_save").on("click", () => {
        const label = String($("#blk_name").val() || "").trim();
        const tag = blockTagFromName(label);
        const problem = validateCustomBlock(label, tag, draft.id);
        if (problem) { toastr.warning(problem); return; }
        if (draft.kind === "fields" && !draft.fields.some(f => String(f.label || "").trim())) {
            toastr.warning("Add at least one field, or pick Free text.");
            return;
        }

        // A renamed block keeps reading its old copies under the old tag.
        const tags = [...(draft.tags || [])];
        if (existing && existing.tag && existing.tag !== tag && !tags.includes(existing.tag)) tags.push(existing.tag);

        const entry = normalizeCustomBlock({
            ...draft,
            label, tag,
            tags: tags.filter(t => t !== tag),
            emoji: String($("#blk_emoji").val() || "📦").trim() || "📦",
            icon: "fa-cube", color: "#38bdf8",
            visibility: $("#blk_vis").val(),
            builtin: false,
            content: String(draft.content || "").trim(),
            rules: String(draft.rules || "").trim(),
            fields: draft.fields.filter(f => String(f.label || "").trim()).map(f => ({ ...f, label: String(f.label).trim() })),
            // Custom blocks carry their own body rather than reading a dict tag.
            source: null
        });

        if (!stack.custom) stack.custom = [];
        const at = stack.custom.findIndex(b => b.id === entry.id);
        if (at > -1) stack.custom[at] = entry; else stack.custom.push(entry);
        if (!stack.order.includes(entry.id)) stack.order.push(entry.id);

        meguminSyncLegacyBlockIds();
        saveProfileToMemory();
        toastr.success(`"${label}" saved.`);
        renderBlocksTab(c);
    });
    c.append(actions);
}
