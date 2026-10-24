// ────────────────────────────────────────────────────────────────────────────
// The Blocks tab — stack, per-block settings, stat fields, and the live preview.
//
// Separate from blocks/chat.js because the preview renders through the dict
// builder: it draws from the same code the chat uses, so a preview can never
// disagree with the real thing. That pulls in the top of the graph, which the
// chat-side renderer has no need of.
// ────────────────────────────────────────────────────────────────────────────

import { getContext, Popup, POPUP_TYPE } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../core/profile.js";
import { escapeHtmlAttr } from "../../utils/html.js";
import { buildBlocksCard, extractBlocks } from "../../blocks/render.js";
import { buildBaseDict } from "../../engine/buildBaseDict.js";
import {
    MEGUMIN_BLOCK_REGISTRY, BLOCK_VISIBILITY_CHOICES, STAT_FIELD_PACKS, STAT_FIELD_TYPES,
    meguminRenderRegistry, meguminActiveBlocks, meguminBlockById, meguminStatFields, meguminStatFieldMap,
    normalizeBlockBody, blockTagFromName, validateCustomBlock, meguminSyncLegacyBlockIds,
} from "./registry.js";
import { meguminScheduleBlocksRefresh } from "./chat.js";
import { stateStore, worldUpdateMode } from "../../state/index.js";
import { openWorldEditor } from "../worldstate/editor.js";
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
            <div class="mtab-header-badge" style="background: rgba(245,158,11,0.12); color:#f59e0b; border:1px solid rgba(245,158,11,0.25);">
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
                    <button class="ws-btn-small blk-remove" style="color:#ef4444;"><i class="fa-solid fa-xmark"></i></button>
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

        // World State settings ride under its own row: they mean nothing apart
        // from this block. The state itself lives in the chat file; these are
        // only how it is kept and how much of it the model reads.
        if (b.id === "world") {
            const ws = localProfile.worldState;
            const hasChat = Boolean(getContext()?.chatId);
            const pending = stateStore.isPendingFullRewrite("world");
            const sub = $(`
                <div class="blk-sub blk-ws">
                    <div class="blk-ws-grid">
                        <label class="blk-ws-field">
                            <span class="blk-sub-label">Updates</span>
                            <select id="blk_ws_mode" class="ps-modern-input">
                                <option value="inline" ${ws.updateMode !== "manual" ? "selected" : ""}>Automatic</option>
                                <option value="manual" ${ws.updateMode === "manual" ? "selected" : ""}>Manual</option>
                            </select>
                            <span class="blk-sub-desc">${worldUpdateMode() === "sidemodel"
                                ? "Automatic: Chomusuke reads each reply (set in the Chomusuke tab)."
                                : "Automatic: each reply records what it changed. Chomusuke can take this over in its tab."} Manual: only read.</span>
                        </label>
                        <label class="blk-ws-field">
                            <span class="blk-sub-label">Detail sent</span>
                            <select id="blk_ws_detail" class="ps-modern-input">
                                <option value="full" ${ws.injectionDetail === "full" ? "selected" : ""}>Full</option>
                                <option value="scene" ${ws.injectionDetail === "scene" ? "selected" : ""}>Scene only</option>
                            </select>
                            <span class="blk-sub-desc">Scene only skips mood, agenda, secrets and threads to save tokens.</span>
                        </label>
                    </div>
                    <div class="blk-ws-chips">
                        <label class="blk-ws-chip" title="Show what each reply changed at the top of its World State card">
                            <input type="checkbox" id="blk_ws_changes" ${ws.showChanges !== false ? "checked" : ""}/> Show what changed on cards
                        </label>
                        <label class="blk-ws-chip" title="When an absent character is mentioned again, remind the model how they last were">
                            <input type="checkbox" id="blk_ws_returning" ${ws.showReturning !== false ? "checked" : ""}/> Remind the model of returning characters
                        </label>
                    </div>
                    <div class="blk-ws-actions">
                        <button id="blk_ws_editor" class="menu_button" ${hasChat ? "" : "disabled"} title="Edit this chat's World State and its history"><i class="fa-solid fa-pen"></i> Editor</button>
                        <button id="blk_ws_rewrite" class="menu_button ${pending ? "is-on" : ""}" ${hasChat ? "" : "disabled"} title="Ask the next reply to write the whole state again"><i class="fa-solid ${pending ? "fa-check" : "fa-arrows-rotate"}"></i> ${pending ? "Rewrite queued" : "Rewrite next"}</button>
                        <button id="blk_ws_reset" class="menu_button" ${hasChat ? "" : "disabled"} title="Clear this chat's World State"><i class="fa-solid fa-eraser"></i> Reset</button>
                    </div>
                </div>
            `);
            sub.find("#blk_ws_mode").on("change", function () {
                ws.updateMode = $(this).val(); saveProfileToMemory(); renderBlocksTab(c); meguminScheduleBlocksRefresh();
            });
            sub.find("#blk_ws_detail").on("change", function () {
                ws.injectionDetail = $(this).val(); saveProfileToMemory();
            });
            sub.find("#blk_ws_changes").on("change", function () {
                ws.showChanges = this.checked; saveProfileToMemory(); meguminScheduleBlocksRefresh();
            });
            sub.find("#blk_ws_returning").on("change", function () {
                ws.showReturning = this.checked; saveProfileToMemory();
            });
            sub.find("#blk_ws_editor").on("click", () => openWorldEditor());
            sub.find("#blk_ws_rewrite").on("click", () => {
                stateStore.setPendingFullRewrite("world", !stateStore.isPendingFullRewrite("world"));
                renderBlocksTab(c);
            });
            sub.find("#blk_ws_reset").on("click", () => {
                if (!confirm("Clear this chat's World State? The next reply will describe the scene from scratch.")) return;
                stateStore.reset("world");
                meguminScheduleBlocksRefresh();
                toastr.info("World State cleared for this chat.", "Megumin Suite");
            });
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
                <button class="ws-btn-small sf-del" style="color:#ef4444;"><i class="fa-solid fa-xmark"></i></button>
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
        let raw;
        if (b.slot) raw = "[Only appears when the story introduces a new NPC.]";
        else if (typeof b.build === "function") raw = b.build();
        else if (b.source) raw = dict[b.source] || "";
        else raw = b.content || "";
        const body = b.slot ? raw : normalizeBlockBody(
            String(raw).replace(/^#{1,3}\s*At the end of your response[^\n]*\n?/i, ""), b.tag);
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

export function renderCustomBlockEditor(c, editId) {
    const stack = localProfile.blockStack;
    const existing = editId ? (stack.custom || []).find(b => b.id === editId) : null;
    const draft = existing
        ? { ...existing }
        : { id: "blk_" + Date.now(), label: "", tag: "", emoji: "📦", visibility: "collapsed", builtin: false, content: "" };

    c.empty();
    c.append(`
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #10b981, #047857);"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                <div>
                    <h2>${existing ? "Edit" : "New"} block</h2>
                    <p>Give it a name, an emoji and the template the AI fills in.</p>
                </div>
            </div>
        </div>
    `);

    const form = $(`
        <div class="mtab-panel">
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">Name</div><div class="set-desc">Shown as the header in chat</div></div>
                <input type="text" id="blk_name" class="ps-modern-input" style="width:220px;" placeholder="e.g. Relationship Meter" value="${escapeHtmlAttr(draft.label)}" />
            </div>
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">Emoji</div><div class="set-desc">Sits before the header</div></div>
                <input type="text" id="blk_emoji" class="ps-modern-input" style="width:70px; text-align:center;" value="${escapeHtmlAttr(draft.emoji)}" />
            </div>
            <div class="mtab-setting-row">
                <div class="set-info"><div class="set-label">Shown as</div><div class="set-desc">Hidden blocks are still sent and still read by the side panel</div></div>
                <select id="blk_vis" class="ps-modern-input" style="width:150px;">
                    ${BLOCK_VISIBILITY_CHOICES.map(o => `<option value="${o.v}" ${draft.visibility === o.v ? "selected" : ""}>${o.label}</option>`).join("")}
                </select>
            </div>
            <div style="padding: 12px 0;">
                <div class="set-label" style="margin-bottom:6px;">Template</div>
                <div class="set-desc" style="margin-bottom:8px;">What the AI is told to write. Square brackets read as fill-me-in.</div>
                <textarea id="blk_content" class="ps-modern-input" rows="8" style="width:100%; resize:vertical;" placeholder="e.g.&#10;**Trust:** [0-100] | **Tension:** [0-100]&#10;**Last shift:** [what moved it this scene]">${escapeHtmlAttr(draft.content)}</textarea>
            </div>
            <div style="font-size:0.68rem; color:var(--text-muted);">Tag: <code id="blk_tag_preview">&lt;${escapeHtmlAttr(draft.tag || "…")}&gt;</code></div>
        </div>
    `);
    c.append(form);

    const syncTag = () => {
        const t = blockTagFromName($("#blk_name").val());
        $("#blk_tag_preview").text(`<${t || "…"}>`);
        return t;
    };
    form.find("#blk_name").on("input", syncTag);

    const actions = $(`
        <div style="display:flex; gap:10px; margin-top:16px;">
            <button class="ws-btn-small" id="blk_save" style="color:#10b981; border-color:rgba(16,185,129,0.4);"><i class="fa-solid fa-check"></i> Save</button>
            <button class="ws-btn-small" id="blk_cancel"><i class="fa-solid fa-xmark"></i> Cancel</button>
        </div>
    `);
    actions.find("#blk_cancel").on("click", () => renderBlocksTab(c));
    actions.find("#blk_save").on("click", () => {
        const label = String($("#blk_name").val() || "").trim();
        const tag = blockTagFromName(label);
        const problem = validateCustomBlock(label, tag, draft.id);
        if (problem) { toastr.warning(problem); return; }

        const entry = {
            id: draft.id, label, tag,
            emoji: String($("#blk_emoji").val() || "📦").trim() || "📦",
            icon: "fa-cube", color: "#38bdf8",
            visibility: $("#blk_vis").val(),
            builtin: false,
            content: String($("#blk_content").val() || "").trim(),
            // Custom blocks carry their own body rather than reading a dict tag.
            source: null
        };

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
