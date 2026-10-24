// ────────────────────────────────────────────────────────────────────────────
// Dev mode — the prompt editor.
//
// Two doors, because there are two genuinely different jobs and the old single
// screen made you do both at once:
//
//   ADD-ONS   the pieces every engine shares — thinking steps, MVU, the ban
//             list, death and combat. Edited on their own, with a map showing
//             where in the outgoing prompt they land. No engine involved.
//
//   ENGINES   the rules that make one engine different from another. Shown as
//             the real document, in the real order. Add-ons appear in that
//             document as chips at their true position: you can see where they
//             sit, and clicking one takes you to its page.
//
// The old editor drew an invented running order — p1..p6 and then every other
// placeholder in a flat pile underneath. That pile was a lie about placement.
// [[MVU]] and [[THINK]] live in "Output RULES", which SillyTavern sends AFTER
// the entire chat history; [[death]] and [[combat]] sit inside Main 2 between
// p5 and p6. data/skeleton.js is generated from the shipped preset so the
// document cannot drift from what actually goes out.
//
// Why V4/V5 are not offered here: they are the only engines that use [[prompt2]]
// and the only ones where [[main]] survives (buildBaseDict blanks it for V6 and
// up). Dropping them from the editor is what lets the editor stop drawing those
// two slots at all. They remain fully selectable and unchanged in the PRESETS
// tab — see devLegacy in data/modes/legacy.js.
//
// One file rather than a folder for the reason memory/index.js is one file:
// every view needs the editing session and needs to redraw the whole screen, so
// a split produces modules importing each other plus a context object threaded
// through all of them. Same coupling, more to read.
// ────────────────────────────────────────────────────────────────────────────

import { extension_settings, saveSettingsDebounced, Popup, POPUP_TYPE } from "../st.js";
import { extensionName } from "../core/constants.js";
import { localProfile } from "../core/state.js";
import { isDevEngineDirty, setDevEngineDirty } from "../core/state.js";
import { fireRefreshHook, REFRESH } from "../core/refreshHooks.js";
import { hardcodedLogic } from "../../data/database.js";
import { meguminCotEntryForMode } from "../../data/cot/index.js";
import { SKELETON as PRESET_SKELETON } from "../../data/skeleton.js";
import { expandPresetSections } from "../engine/presetSections.js";
import {
    MEGUMIN_SLOT_REGISTRY,
    SLOT_GROUPS, meguminSlotByTrigger, meguminSlotByKey, meguminSlotIsLive,
    meguminModuleTrigger, meguminAddonSlots, meguminIsDevEditableMode,
    meguminEngineSlots,
} from "../../data/slots.js";
import {
    getSharedFragment, setSharedFragment, resolveSlot, engineShadowsShared,
} from "../core/sharedFragments.js";
import { escapeHtmlAttr } from "../utils/html.js";

const esc = s => escapeHtmlAttr(s == null ? "" : String(s));

// ── Which preset is actually running ────────────────────────────────────────
//
// data/skeleton.js is generated from the STANDARD preset, so the Document view
// draws that card order. The Cache Friendly variant moves several tags down
// into "Output RULES" so the prompt prefix stays byte-stable across turns and
// the provider can serve it from cache. Nothing at the reader's end can
// generate a skeleton for that layout -- gen-skeleton.py is a build tool and
// does not ship -- so the document is allowed to keep drawing the standard
// order. It just has to say so rather than let the reader assume.
//
// Matched on the VARIANT, not the version. "Megumin Suite V11 Cache Friendly"
// has to work the day it ships without an edit here, and the version number is
// the part that churns.
//
// A miss costs nothing: no banner, which is exactly the behaviour before this
// existed. A false positive would be the harmful direction, and "cache
// friendly" is specific enough that it will not fire by accident.
//
// Read off the same selector tasks.js switches presets with.
const CACHE_FRIENDLY_RE = /cache[\s_-]?friendly/i;

function isCacheFriendlyPreset() {
    try {
        return CACHE_FRIENDLY_RE.test($("#settings_preset_openai option:selected").text().trim());
    } catch (e) {
        return false;
    }
}

// ── The editing session ─────────────────────────────────────────────────────
//
// Module-private on purpose (CLAUDE.md convention 4): scratch for one visit,
// not cross-cutting state. It holds the engine being edited so that stepping
// out to an add-on page and back does not discard unsaved engine edits — that
// round trip is the whole point of the two-door layout, and losing work on it
// would make the navigation actively hostile.
//
const session = {
    engine: null,       // { modeData, isNew, returnTo }
    expanded: new Set(),
    showAuto: false,
};

// There was a PRESENT_TRIGGERS set here that flagged any slot whose tag was not
// in an enabled card as "Not in preset". It is gone deliberately.
//
// It was wrong twice in a row. First it accused [[COT]] of going nowhere, when
// the CoT is wrapped and delivered inside [[THINK]] and always was. Then it
// called [[prefill]] missing right after the tag had been added, because it
// reads the exported preset; then, once exported, it called the same slot
// broken because the message holding it is switched off on purpose.
//
// The pattern behind all three: the preset ships fixed and one person edits it,
// so where a tag sits and whether its message is on are that person's settled
// decisions — not defects to report to whoever is typing in the box. A field
// badge now says what is IN the field, and nothing about the preset.
// The preset as drawn: a section slot ([[thinking]], [[reminder]]...) is shown
// as the parts it is made of, so each editable part sits where it is sent.
const SKELETON = PRESET_SKELETON.map(card => ({ ...card, content: expandPresetSections(card.content) }));
const SKELETON_V11 = PRESET_SKELETON.map(card => ({ ...card, content: expandPresetSections(card.content, { frame: "v11" }) }));

const CHAT_HISTORY_INDEX = SKELETON.findIndex(c => c.id === "chatHistory");

// Some slots reach the model without ever appearing under their own tag.
// Saying "not in preset" about one of those is a false alarm, and it is a
// convincing one -- the tag genuinely is absent from every message.
//
//   blocks  registry.js reads dict[b.source] when assembling <Blocks>
//   think   buildBaseDict wraps [[COT]] and delivers it inside [[THINK]]
//
const CARRIERS = {
    blocks: {
        tag: "[[blocks]]",
        text: "Sent inside the <b>Blocks</b> section at the very end of the prompt, together with the other output blocks.",
    },
    think: {
        tag: "[[THINK]]",
        text: "Wrapped in think tags and sent inside <b>Thinking Tags</b> — that is the tag your preset carries. "
            + "Whatever you write here lands where that add-on's <code>{Thinking}</code> marker sits.",
    },
};

const SCOPE_META = {
    engine: { cls: "scope-engine", label: "This engine", icon: "fa-microchip" },
    shared: { cls: "scope-shared", label: "Add-on", icon: "fa-puzzle-piece" },
    auto: { cls: "scope-auto", label: "Automatic", icon: "fa-wand-magic-sparkles" },
};

function onelineOf(value) {
    const flat = String(value || "").replace(/\s+/g, " ").trim();
    if (!flat) return "";
    return flat.length > 110 ? flat.slice(0, 110) + "…" : flat;
}

function statusOf(slot, modeData) {
    if (!meguminSlotIsLive(slot, localProfile)) return { text: "Off", cls: "st-off" };
    if (slot.scope === "auto" && !slot.overridable) return { text: "Automatic", cls: "st-auto" };
    const { source, value } = resolveSlot(slot, modeData);
    if (source !== "builtin") return { text: "Edited", cls: "st-custom" };
    return value ? { text: "Using default", cls: "st-default" } : { text: "Empty", cls: "st-empty" };
}

// ────────────────────────────────────────────────────────────────────────────
// PLACEMENT — "where does this actually go?"
// ────────────────────────────────────────────────────────────────────────────

// Every card in the preset counts, switched on or not. Whether a message is
// enabled is the preset author's business and changes from one day to the next;
// the editor's job is to show where the text sits, not to audit that choice.
function findPlacement(trigger, slot) {
    // A carried slot has no position of its own; it inherits its carrier's.
    if (slot && slot.carrier && CARRIERS[slot.carrier]) {
        trigger = CARRIERS[slot.carrier].tag;
    }
    for (let i = 0; i < SKELETON.length; i++) {
        const card = SKELETON[i];
        if (card.marker) continue;
        const tags = card.content.match(/\[\[[^\]\n]+\]\]/g) || [];
        const idx = tags.indexOf(trigger);
        if (idx > -1) return { card, cardIndex: i, tags, idx };
    }
    return null;
}

/** One sentence a non-technical reader can act on. */
function describePlacement(slot) {
    const carried = slot.carrier ? CARRIERS[slot.carrier] : null;
    const p = findPlacement(slot.trigger, slot);
    if (carried) {
        const where = p
            ? ` It goes out in the <b>${esc(p.card.name)}</b> message`
              + (CHAT_HISTORY_INDEX > -1 && p.cardIndex > CHAT_HISTORY_INDEX
                  ? ", after the whole chat history." : ".")
            : "";
        return carried.text + where;
    }
    if (!p) {
        // The tag may still be in the preset, in a message that is switched
        // off. Either way this is a statement about where the text goes, not a
        // complaint: the preset ships fixed and its author knows what is in it.
        return `Placed wherever your preset puts <code>${esc(slot.trigger)}</code>.`;
    }
    const when = CHAT_HISTORY_INDEX > -1
        ? (p.cardIndex > CHAT_HISTORY_INDEX
            ? "after the whole chat history — one of the last things the model reads"
            : "before the chat history")
        : "";
    const before = p.tags[p.idx - 1];
    const after = p.tags[p.idx + 1];
    const neighbours = [
        before ? `after <code>${esc(before)}</code>` : null,
        after ? `before <code>${esc(after)}</code>` : null,
    ].filter(Boolean).join(", ");

    return `Sent in the <b>${esc(p.card.name)}</b> message`
         + (when ? `, which goes ${when}` : "")
         + (neighbours ? `. Sits ${neighbours}` : "")
         + ".";
}

/** A little map of the outgoing messages with this slot's position marked. */
function renderPlacementMap(slot) {
    const p = findPlacement(slot.trigger, slot);
    const $map = $(`<div class="dev-map"></div>`);

    SKELETON.forEach((card, i) => {
        const isHit = p && i === p.cardIndex;
        const $row = $(`
            <div class="dev-map-row ${isHit ? "is-hit" : ""} ${card.marker ? "is-st" : ""}">
                <span class="dev-map-name">${esc(card.name)}</span>
                <span class="dev-map-role">${esc(card.role)}</span>
            </div>
        `);
        $map.append($row);

        if (!isHit) return;
        const $tags = $(`<div class="dev-map-tags"></div>`);
        const ownTag = slot.carrier && CARRIERS[slot.carrier] ? CARRIERS[slot.carrier].tag : slot.trigger;
        p.tags.forEach((t, ti) => {
            const known = meguminSlotByTrigger(t);
            if (t === ownTag) ti = p.idx;
            $tags.append(`
                <span class="dev-map-tag ${ti === p.idx ? "is-target" : ""}">
                    ${esc(known ? known.label : t)}
                </span>
            `);
        });
        $map.append($tags);
    });

    return $map;
}

// ────────────────────────────────────────────────────────────────────────────
// THE EDITING SURFACE for one slot
// ────────────────────────────────────────────────────────────────────────────

function renderSlotEditor(slot, modeData, onChanged) {
    const $wrap = $(`<div class="dev-editor"></div>`);
    const live = meguminSlotIsLive(slot, localProfile);
    const { value, source } = resolveSlot(slot, modeData);
    const shadowed = engineShadowsShared(slot, modeData);

    if (slot.hint) $wrap.append(`<div class="dev-slot-hint">${esc(slot.hint)}</div>`);

    if (!live && slot.gate) {
        $wrap.append(`
            <div class="dev-note dev-note-off">
                <i class="fa-solid fa-plug-circle-xmark"></i>
                <span>This is switched off right now, so anything you write here will not be sent.
                Turn on <b>${esc(slot.gate.label || slot.label)}</b> in the
                <b>${esc(slot.gate.where)}</b> tab to use it.</span>
            </div>
        `);
    }

    if (slot.scope === "shared") {
        $wrap.append(`
            <div class="dev-note dev-note-shared">
                <i class="fa-solid fa-globe"></i>
                <span><b>This is shared.</b> No engine holds a copy of it — every engine leaves the
                slot open for whatever is here. Editing it changes it for every engine and every
                character, and it saves on its own as soon as you click away.</span>
            </div>
        `);
    }

    if (slot.scope === "auto" && slot.overridable) {
        $wrap.append(`
            <div class="dev-note dev-note-auto">
                <i class="fa-solid fa-sliders"></i>
                <span>Normally built from your settings${slot.where ? ` in the <b>${esc(slot.where)}</b> tab` : ""}.
                Anything you type here replaces that. Leave it empty to keep the automatic version.</span>
            </div>
        `);
    }

    if (shadowed) {
        $wrap.append(`
            <div class="dev-note dev-note-warn">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>The engine you have open carries its own copy of this, so it is ignoring the
                shared version. That only happens with engines made before add-ons were shared.</span>
                <button class="ps-modern-btn secondary dev-unshadow">Use the shared version</button>
            </div>
        `);
    }

    // The box opens holding the built-in text rather than empty.
    //
    // An empty box next to the words "using default" asked the reader to invent
    // the default from nothing, or to copy it out of a collapsed <details> by
    // hand, just to change one line of it. Editing is the reason they are here.
    //
    // The cost is that "unedited" can no longer mean "box is empty", so commit
    // compares against the built-in and clears the stored fragment when they
    // match. That keeps storage sparse and keeps the badge honest: retyping the
    // default character for character still reads as "Using default", and a
    // later improvement to the shipped text still reaches them.
    let builtin = "";
    try { builtin = (typeof slot.fallback === "function" ? slot.fallback(localProfile) : "") || ""; }
    catch { builtin = ""; }

    const editable = source === "builtin" ? builtin : value;

    $wrap.append(`
        <textarea class="ps-modern-input dev-slot-input" spellcheck="false"
            placeholder="Empty — nothing is added at this point in the prompt.">${esc(editable)}</textarea>
    `);

    // A picker is a long list -- 43 chain-of-thought scripts -- so it is a
    // dropdown rather than the row of preset buttons. Choosing one fills the
    // box; it is a starting point to edit, not a live link to that script.
    if (slot.picker) {
        let opts = [];
        try { opts = slot.picker.options() || []; } catch { opts = []; }
        if (opts.length) {
            const $pick = $(`
                <div class="dev-picker">
                    <label>${esc(slot.picker.label)}</label>
                    <select class="ps-modern-input">
                        <option value="">Choose one…</option>
                        ${opts.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join("")}
                    </select>
                </div>
            `);
            $pick.find("select").on("change", function () {
                const i = $(this).val();
                if (i === "") return;
                $wrap.find(".dev-slot-input").val(opts[Number(i)].value).trigger("change");
                $(this).val("");
            });
            $wrap.append($pick);
        }
    }

    const $tools = $(`<div class="dev-slot-tools"></div>`);
    const presets = slot.presets || (slot.fallback ? [{ label: "Built-in default", value: slot.fallback }] : []);
    presets.forEach(pr => {
        const $b = $(`<button class="ps-modern-btn secondary">${esc(pr.label)}</button>`);
        $b.on("click", () => {
            let v = "";
            try { v = (typeof pr.value === "function" ? pr.value() : pr.value) || ""; } catch { v = ""; }
            $wrap.find(".dev-slot-input").val(v).trigger("change");
        });
        $tools.append($b);
    });
    if (source !== "builtin" && builtin) {
        const $r = $(`<button class="ps-modern-btn secondary"><i class="fa-solid fa-rotate-left"></i> Reset to default</button>`);
        $r.on("click", () => $wrap.find(".dev-slot-input").val(builtin).trigger("change"));
        $tools.append($r);
    }
    if (builtin) {
        const $e = $(`<button class="ps-modern-btn secondary"><i class="fa-solid fa-eraser"></i> Clear</button>`);
        $e.on("click", () => $wrap.find(".dev-slot-input").val("").trigger("change"));
        $tools.append($e);
    }
    if ($tools.children().length) $wrap.append($tools);

    const $input = $wrap.find(".dev-slot-input");
    $input.on("change blur", () => {
        let v = $input.val();
        // Identical to the shipped text means "no override", not "an override
        // that happens to match". Storing it would freeze this reader on
        // today's wording forever.
        if (builtin && v.trim() === builtin.trim()) v = "";
        if (slot.scope === "shared" || (slot.scope === "auto" && slot.overridable)) {
            const had = getSharedFragment(slot.key).trim() !== "";
            setSharedFragment(slot.key, v);
            if (v) toastr.success(`${slot.label} saved for every engine.`);
            else if (had) toastr.info(`${slot.label} is back to the built-in version.`);
        } else if (modeData) {
            modeData[slot.key] = v;
            setDevEngineDirty(true);
        }
        if (onChanged) onChanged();
    });
    $input.on("input", () => { if (slot.scope === "engine") setDevEngineDirty(true); });

    $wrap.find(".dev-unshadow").on("click", () => {
        if (modeData) delete modeData[slot.key];
        setDevEngineDirty(true);
        if (onChanged) onChanged();
    });

    return $wrap;
}

// ────────────────────────────────────────────────────────────────────────────
// CUSTOM MODULES — your own text bolted onto an engine prompt
// ────────────────────────────────────────────────────────────────────────────

async function promptForModule(existing) {
    const m = existing || { name: "", location: "settings", content: "" };
    const $p = $(`
        <div class="dev-modal">
            <label>What should this be called?</label>
            <input type="text" id="m_n" class="ps-modern-input" value="${esc(m.name)}" placeholder="e.g. Extra combat detail" />
            <label>Which tab should its on/off switch live in?</label>
            <select id="m_l" class="ps-modern-input">
                <option value="settings" ${m.location === "settings" ? "selected" : ""}>Add-ons tab</option>
                <option value="addons" ${m.location === "addons" ? "selected" : ""}>Global tab</option>
            </select>
            <label>The text to add</label>
            <textarea id="m_c" class="ps-modern-input" style="height:170px;">${esc(m.content)}</textarea>
        </div>
    `);
    const ok = await new Popup($p, POPUP_TYPE.CONFIRM, existing ? "Edit module" : "Add module",
        { okButton: "Save", cancelButton: "Cancel", wide: true }).show();
    if (!ok) return null;
    const content = $p.find("#m_c").val();
    if (!content || !content.trim()) {
        toastr.warning("A module with no text would do nothing, so it was not added.");
        return null;
    }
    return { name: $p.find("#m_n").val() || "Module", location: $p.find("#m_l").val(), content };
}

function renderModulesFor(slot, modeData, rerender) {
    if (!modeData) return null;
    // Only the engine's own prompt bodies take modules. Appending to a shared
    // add-on would push engine-specific text into a value every other engine
    // reads; appending to an automatic slot would be overwritten on rebuild.
    if (!/^\[\[prompt[1-6]\]\]$/.test(slot.trigger)) return null;

    const $wrap = $(`<div class="dev-modules"></div>`);
    (modeData.customToggles || [])
        .filter(t => meguminModuleTrigger(t.attachPoint) === slot.trigger)
        .forEach(mod => {
            const $m = $(`
                <div class="dev-module">
                    <div class="dev-module-head">
                        <i class="fa-solid fa-puzzle-piece"></i>
                        <span class="dev-module-name">${esc(mod.name)}</span>
                        <span class="dev-module-where">switch in ${mod.location === "addons" ? "Global" : "Add-ons"}</span>
                        <i class="dev-module-edit fa-solid fa-pen-to-square" title="Edit"></i>
                        <i class="dev-module-del fa-solid fa-trash" title="Remove"></i>
                    </div>
                    <div class="dev-module-body">${esc(onelineOf(mod.content))}</div>
                </div>
            `);
            $m.find(".dev-module-edit").on("click", async () => {
                const next = await promptForModule(mod);
                if (!next) return;
                Object.assign(mod, next);
                setDevEngineDirty(true);
                rerender();
            });
            $m.find(".dev-module-del").on("click", async () => {
                const ok = await new Popup($(`<div>Remove <b>${esc(mod.name)}</b> from this engine?</div>`),
                    POPUP_TYPE.CONFIRM, "Remove module", { okButton: "Remove", cancelButton: "Keep" }).show();
                if (!ok) return;
                modeData.customToggles = modeData.customToggles.filter(x => x.id !== mod.id);
                setDevEngineDirty(true);
                rerender();
            });
            $wrap.append($m);
        });

    const $add = $(`<button class="dev-module-add"><i class="fa-solid fa-plus"></i> Add your own text here</button>`);
    $add.on("click", async () => {
        const next = await promptForModule(null);
        if (!next) return;
        if (!modeData.customToggles) modeData.customToggles = [];
        modeData.customToggles.push({ id: "mod_" + Date.now(), attachPoint: slot.trigger, ...next });
        setDevEngineDirty(true);
        rerender();
    });
    $wrap.append($add);
    return $wrap;
}

// ────────────────────────────────────────────────────────────────────────────
// VIEW: landing — the two doors
// ────────────────────────────────────────────────────────────────────────────

function renderLanding(c) {
    setDevEngineDirty(false);
    session.engine = null;
    session.expanded.clear();
    $("#ps_stage_sub").text("Change what the AI is told, and see exactly where each piece lands.");

    if (isCacheFriendlyPreset()) {
        c.append(`
            <div class="dev-note dev-note-warn">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span><b>You're running a Cache Friendly preset.</b> The Engines document shows the
                standard card order. Several tags sit further down in Output RULES in this preset.
                Don't worry &mdash; editing works exactly the same.</span>
            </div>
        `);
    }

    const changed = meguminAddonSlots().filter(s => getSharedFragment(s.key).trim() !== "").length;
    const engines = (extension_settings[extensionName].customModes || []).length;

    const $doors = $(`
        <div class="dev-doors">
            <div class="dev-door dev-door-addons" id="dev_door_addons">
                <div class="dev-door-icon"><i class="fa-solid fa-puzzle-piece"></i></div>
                <div class="dev-door-title">Add-ons</div>
                <div class="dev-door-desc">
                    The pieces every engine shares — thinking steps, MVU, the ban list,
                    death and combat, the output blocks.
                    <b>Change one here and every engine uses it.</b>
                </div>
                <div class="dev-door-meta">${changed
                    ? `${changed} changed`
                    : `${meguminAddonSlots().length} to choose from`}</div>
                <div class="dev-door-go">Open <i class="fa-solid fa-arrow-right"></i></div>
            </div>
            <div class="dev-door dev-door-engines" id="dev_door_engines">
                <div class="dev-door-icon"><i class="fa-solid fa-microchip"></i></div>
                <div class="dev-door-title">Engines</div>
                <div class="dev-door-desc">
                    The rules that make one engine write differently from another.
                    Shown as the real prompt, in the real order, with your add-ons marked
                    where they land.
                </div>
                <div class="dev-door-meta">${engines
                    ? `${engines} of your own`
                    : "start from a built-in one"}</div>
                <div class="dev-door-go">Open <i class="fa-solid fa-arrow-right"></i></div>
            </div>
        </div>
        <div class="dev-door-hint">
            <i class="fa-solid fa-circle-info"></i>
            Not sure? Almost everything people want to change lives in <b>Add-ons</b>.
            You only need an engine to rewrite how the AI is told to write.
        </div>
    `);
    c.append($doors);

    $doors.find("#dev_door_addons").on("click", () => renderDevMode("addons"));
    $doors.find("#dev_door_engines").on("click", () => renderDevMode("engines"));
}

// ────────────────────────────────────────────────────────────────────────────
// VIEW: the add-on list
// ────────────────────────────────────────────────────────────────────────────

function renderAddonsList(c) {
    $("#ps_stage_sub").text("Shared by every engine. Pick one to edit it and see where it goes.");
    c.append(backBar("Add-ons", () => renderDevMode("landing")));

    const slots = meguminAddonSlots();

    SLOT_GROUPS.forEach(group => {
        const mine = slots.filter(s => s.group === group.id);
        if (!mine.length) return;

        c.append(`
            <div class="dev-group-head">
                <span>${esc(group.label)}</span>
                ${group.hint ? `<small>${esc(group.hint)}</small>` : ""}
            </div>
        `);
        const $list = $(`<div class="dev-group"></div>`);

        mine.forEach(slot => {
            const status = statusOf(slot, session.engine?.modeData || null);
            const { value } = resolveSlot(slot, session.engine?.modeData || null);
            const edited = status.cls === "st-custom";
            const $row = $(`
                <div class="dev-addon-row ${status.cls === "st-off" ? "is-off" : ""} ${edited ? "is-edited" : ""}">
                    <div class="dev-addon-main">
                        <span class="dev-addon-name">${esc(slot.label)}</span>
                        <span class="dev-slot-status ${status.cls}">${esc(status.text)}</span>
                        ${edited ? `<span class="dev-edited-flag"><i class="fa-solid fa-check"></i> your version</span>` : ""}
                    </div>
                    <div class="dev-addon-desc">${esc(slot.hint || "")}</div>
                    <div class="dev-addon-oneline">${esc(onelineOf(value))}</div>
                    <div class="dev-addon-go"><i class="fa-solid fa-chevron-right"></i></div>
                </div>
            `);
            $row.on("click", () => renderDevMode("addon", slot.key));
            $list.append($row);
        });

        c.append($list);
    });
}

// ────────────────────────────────────────────────────────────────────────────
// VIEW: one add-on
// ────────────────────────────────────────────────────────────────────────────

function renderAddonEditor(c, key) {
    const slot = meguminSlotByKey(key);
    if (!slot) {
        c.append(`<div class="dev-empty">That add-on no longer exists.</div>`);
        return;
    }

    // Coming from an engine? Go back to it, with its unsaved edits intact.
    const cameFromEngine = !!session.engine;
    const back = () => cameFromEngine ? renderDevMode("editor") : renderDevMode("addons");

    $("#ps_stage_sub").text(cameFromEngine
        ? `Add-on — shared by every engine, including ${session.engine.modeData.label}.`
        : "Shared by every engine.");

    c.append(backBar(slot.label, back, cameFromEngine ? "Back to engine" : "All add-ons"));

    const $cols = $(`<div class="dev-cols"></div>`);
    const $left = $(`<div class="dev-col-main"></div>`);
    const $right = $(`<div class="dev-col-side"></div>`);

    $left.append(renderSlotEditor(slot, session.engine?.modeData || null,
        () => renderDevMode("addon", key)));

    $right.append(`<div class="dev-side-head"><i class="fa-solid fa-location-dot"></i> Where this goes</div>`);
    $right.append(`<div class="dev-side-text">${describePlacement(slot)}</div>`);
    if (isCacheFriendlyPreset()) {
        // Provenance, not an alert: this says where the MAP comes from, and does
        // not claim this particular slot is one of the ones that moved. Only
        // [[dice]] actually relocates among the add-ons, and there is no shipped
        // skeleton for the Cache Friendly layout to check a slot against -- so a
        // per-slot claim would either need a hand-written list or would cry wolf
        // on a dozen slots whose position is perfectly correct.
        $right.append(`
            <div class="dev-note dev-note-auto">
                <i class="fa-solid fa-circle-info"></i>
                <span>Positions shown come from the standard preset. On Cache Friendly a few tags
                sit further down, in Output RULES.</span>
            </div>
        `);
    }
    $right.append(renderPlacementMap(slot));

    $cols.append($left, $right);
    c.append($cols);
}

// ────────────────────────────────────────────────────────────────────────────
// VIEW: the engine list
// ────────────────────────────────────────────────────────────────────────────

function renderEnginesList(c) {
    session.engine = null;
    setDevEngineDirty(false);
    $("#ps_stage_sub").text("An engine is the set of rules telling the AI how to write.");
    c.append(backBar("Engines", () => renderDevMode("landing")));

    c.append(`
        <div class="dev-actions">
            <button id="dev_btn_new" class="ps-modern-btn primary"><i class="fa-solid fa-wand-magic-sparkles"></i> Create Blank Engine</button>
            <button id="dev_btn_import" class="ps-modern-btn secondary"><i class="fa-solid fa-file-import"></i> Import Engine (JSON)</button>
            <input type="file" id="dev_import_file" accept=".json" style="display:none;" />
        </div>
    `);

    $("#dev_btn_new").on("click", () => renderDevMode("editor", "NEW"));
    $("#dev_btn_import").on("click", () => $("#dev_import_file").click());
    $("#dev_import_file").on("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                const imported = JSON.parse(ev.target.result);
                imported.id = "custom_" + Date.now();
                extension_settings[extensionName].customModes.push(imported);
                saveSettingsDebounced();
                toastr.success(`Imported ${imported.label}!`);
                renderDevMode("engines");
            } catch { toastr.error("Invalid JSON file."); }
        };
        reader.readAsText(file);
    });

    const customModes = extension_settings[extensionName].customModes || [];
    c.append(`<div class="ps-rule-title dev-rule green"><i class="fa-solid fa-microchip"></i> Your Engines</div>`);

    if (!customModes.length) {
        c.append(`<div class="dev-empty">None yet. Pick a built-in one below to start from.</div>`);
    } else {
        const grid = $(`<div class="ps-grid dev-grid"></div>`);
        customModes.forEach(m => {
            const card = $(`
                <div class="ps-card dev-card-custom">
                    <div style="width:100%;">
                        <div class="ps-card-title"><span style="color:#10b981;">${esc(m.label)}</span></div>
                        <div class="ps-card-desc">${m.parentId ? `Copy of ${esc(m.parentId)}` : "Your own engine"}</div>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:20px; width:100%;">
                        <button class="ps-modern-btn secondary dev-export" title="Export"><i class="fa-solid fa-download"></i></button>
                        <button class="ps-modern-btn primary dev-edit" style="flex:2;"><i class="fa-solid fa-pen"></i> Edit</button>
                        <button class="ps-modern-btn secondary dev-delete" title="Delete" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `);
            card.find(".dev-edit").on("click", () => renderDevMode("editor", m.id));
            card.find(".dev-export").on("click", () => {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(m));
                const a = document.createElement("a");
                a.setAttribute("href", dataStr);
                a.setAttribute("download", m.label.replace(/\s+/g, "_") + ".json");
                document.body.appendChild(a);
                a.click();
                a.remove();
            });
            card.find(".dev-delete").on("click", async () => {
                const ok = await new Popup(
                    $(`<div>Delete <b>${esc(m.label)}</b>? This cannot be undone.<br><br>Your add-ons are not affected.</div>`),
                    POPUP_TYPE.CONFIRM, "Delete engine", { okButton: "Delete", cancelButton: "Keep" }).show();
                if (!ok) return;
                extension_settings[extensionName].customModes =
                    extension_settings[extensionName].customModes.filter(x => x.id !== m.id);
                saveSettingsDebounced();
                renderDevMode("engines");
            });
            grid.append(card);
        });
        c.append(grid);
    }

    c.append(`<div class="ps-rule-title dev-rule gold"><i class="fa-solid fa-cube"></i> Start From A Built-In Engine</div>`);
    const coreGrid = $(`<div class="ps-grid dev-grid"></div>`);
    hardcodedLogic.modes.filter(meguminIsDevEditableMode).forEach(m => {
        const card = $(`
            <div class="ps-card">
                <div style="width:100%;">
                    <div class="ps-card-title"><span>${esc(m.label)}</span></div>
                    <div class="ps-card-desc">Built in. Makes you an editable copy.</div>
                </div>
                <div style="width:100%; margin-top:20px;">
                    <button class="ps-modern-btn secondary dev-clone"><i class="fa-solid fa-copy"></i> Make A Copy</button>
                </div>
            </div>
        `);
        card.find(".dev-clone").on("click", () => renderDevMode("editor", m.id));
        coreGrid.append(card);
    });
    c.append(coreGrid);
}

// ────────────────────────────────────────────────────────────────────────────
// VIEW: the engine editor — the document
// ────────────────────────────────────────────────────────────────────────────

function segmentCard(content) {
    const out = [];
    const re = /\[\[[^\]\n]+\]\]/g;
    let last = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
        if (m.index > last) out.push({ type: "text", text: content.slice(last, m.index) });
        out.push({ type: "slot", trigger: m[0] });
        last = m.index + m[0].length;
    }
    if (last < content.length) out.push({ type: "text", text: content.slice(last) });
    return out;
}

/** An add-on, seen from inside the engine document: a signpost, not an editor. */
function renderAddonChip(slot, modeData) {
    const status = statusOf(slot, modeData);
    const { value } = resolveSlot(slot, modeData);
    const $chip = $(`
        <div class="dev-chip scope-shared ${status.cls === "st-off" ? "is-off" : ""}">
            <i class="fa-solid fa-puzzle-piece"></i>
            <span class="dev-chip-name">${esc(slot.label)}</span>
            <span class="dev-slot-status ${status.cls}">${esc(status.text)}</span>
            <span class="dev-chip-oneline">${esc(onelineOf(value))}</span>
            <span class="dev-chip-go">Edit <i class="fa-solid fa-arrow-right"></i></span>
        </div>
    `);
    $chip.on("click", () => renderDevMode("addon", slot.key));
    return $chip;
}

function renderAutoChip(slot) {
    return $(`
        <div class="dev-chip scope-auto is-static">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span class="dev-chip-name">${esc(slot.label)}</span>
            <span class="dev-slot-status st-auto">Automatic</span>
            <span class="dev-chip-oneline">${esc(slot.hint || "")}</span>
        </div>
    `);
}

function renderEngineSlot(slot, modeData, rerender) {
    const status = statusOf(slot, modeData);
    const { value } = resolveSlot(slot, modeData);
    const isOpen = session.expanded.has(slot.trigger);

    const $panel = $(`
        <div class="dev-slot scope-engine ${isOpen ? "is-open" : ""}">
            <div class="dev-slot-head">
                <i class="dev-slot-caret fa-solid fa-chevron-${isOpen ? "down" : "right"}"></i>
                <span class="dev-slot-label">${esc(slot.label)}</span>
                <span class="dev-slot-badge"><i class="fa-solid fa-microchip"></i> This engine</span>
                <span class="dev-slot-status ${status.cls}">${esc(status.text)}</span>
                <span class="dev-slot-oneline">${esc(onelineOf(value))}</span>
            </div>
        </div>
    `);

    $panel.find(".dev-slot-head").on("click", () => {
        if (isOpen) session.expanded.delete(slot.trigger);
        else session.expanded.add(slot.trigger);
        rerender();
    });

    if (isOpen) {
        const $body = $(`<div class="dev-slot-body"></div>`);
        $body.append(renderSlotEditor(slot, modeData, null));
        $panel.append($body);
    }
    return $panel;
}

function renderEngineDocument(c, modeData, rerender) {
    const $doc = $(`<div class="dev-doc"></div>`);

    if (isCacheFriendlyPreset()) {
        $doc.append(`
            <div class="dev-note dev-note-warn">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span><b>You're running a Cache Friendly preset.</b> The layout below shows the
                standard card order. Several tags sit further down in Output RULES in this preset.
                Don't worry &mdash; editing works exactly the same.</span>
            </div>
        `);
    }
    const drawn = new Set();

    // V11 Тайна sends its own tags around the turn (plan 018), so draw those.
    (modeData && modeData.turnFrame === "v11" ? SKELETON_V11 : SKELETON).forEach(card => {
        if (card.marker) {
            $doc.append(`
                <div class="dev-card dev-card-st">
                    <div class="dev-card-head">
                        <span class="dev-card-name">${esc(card.name)}</span>
                        <span class="dev-card-role">${esc(card.role)}</span>
                        <span class="dev-card-owner">SillyTavern fills this in</span>
                    </div>
                </div>
            `);
            return;
        }

        const $card = $(`
            <div class="dev-card">
                <div class="dev-card-head">
                    <span class="dev-card-name">${esc(card.name)}</span>
                    <span class="dev-card-role">${esc(card.role)}</span>
                </div>
            </div>
        `);
        const $inner = $(`<div class="dev-card-body"></div>`);
        let painted = 0;

        segmentCard(card.content).forEach(seg => {
            if (seg.type === "text") {
                if (!seg.text.trim()) return;
                $inner.append(`<pre class="dev-literal">${esc(seg.text.replace(/^\n+|\n+$/g, ""))}</pre>`);
                painted++;
                return;
            }
            const slot = meguminSlotByTrigger(seg.trigger);
            if (!slot) {
                $inner.append(`
                    <div class="dev-chip dev-chip-unknown is-static">
                        <i class="fa-solid fa-circle-question"></i>
                        <span class="dev-chip-name">Unrecognised slot</span>
                        <span class="dev-chip-oneline">The preset asks for ${esc(seg.trigger)}, but the extension has no entry for it.</span>
                    </div>
                `);
                painted++;
                return;
            }
            if (slot.hidden) return;

            drawn.add(slot.trigger);
            if (slot.scope === "engine") {
                $inner.append(renderEngineSlot(slot, modeData, rerender));
                const $mods = renderModulesFor(slot, modeData, rerender);
                if ($mods) $inner.append($mods);
            } else if (slot.scope === "shared") {
                $inner.append(renderAddonChip(slot, modeData));
                // Anything this add-on carries is drawn nested beneath it. The
                // engine's Chain of Thought rides inside Thinking Tags, so this
                // is its real position in the document -- putting it in a
                // leftovers pile at the bottom would misplace the single most
                // important thing an engine owns.
                MEGUMIN_SLOT_REGISTRY
                    .filter(car => !car.hidden && car.scope === "engine"
                        && car.carrier && CARRIERS[car.carrier]
                        && CARRIERS[car.carrier].tag === slot.trigger)
                    .forEach(car => {
                        drawn.add(car.trigger);
                        const $nest = $(`<div class="dev-carried"></div>`);
                        $nest.append(renderEngineSlot(car, modeData, rerender));
                        $inner.append($nest);
                    });
            } else {
                if (!session.showAuto) return;
                $inner.append(renderAutoChip(slot));
            }
            painted++;
        });

        if (!painted) return;
        $card.append($inner);
        $doc.append($card);
    });

    // A safety net, not a verdict. Anything the skeleton walk did not place
    // still gets an editable box, so a slot can never silently vanish from the
    // editor just because the preset moved a tag around. It is labelled
    // neutrally on purpose: where the preset puts a tag, and whether the
    // message holding it is switched on, are the author's decisions, not
    // problems to flag at whoever is typing in the box.
    const orphans = meguminEngineSlots().filter(s => !drawn.has(s.trigger));
    if (orphans.length) {
        const $card = $(`
            <div class="dev-card dev-card-orphan">
                <div class="dev-card-head">
                    <span class="dev-card-name">Other engine settings</span>
                </div>
            </div>
        `);
        const $inner = $(`<div class="dev-card-body"></div>`);
        orphans.forEach(slot => {
            $inner.append(renderEngineSlot(slot, modeData, rerender));
        });
        $card.append($inner);
        $doc.append($card);
    }

    c.append($doc);
}

function renderEngineEditor(c) {
    const { modeData, isNew, returnTo } = session.engine;
    const rerender = () => renderDevMode("editor");

    $("#ps_stage_sub").text("The real prompt, in the real order. Gold panels belong to this engine; green ones are shared add-ons.");

    const $bar = $(`
        <div class="dev-bar">
            <button id="dev_back_list" class="ps-modern-btn secondary"><i class="fa-solid fa-arrow-left"></i> Back</button>
            <input type="text" id="dev_mode_name" class="ps-modern-input dev-bar-name" value="${esc(modeData.label)}" />
            <label class="dev-toggle-auto">
                <input type="checkbox" ${session.showAuto ? "checked" : ""} /> Show automatic parts
            </label>
            <button id="dev_save_mode" class="ps-modern-btn primary dev-save"><i class="fa-solid fa-floppy-disk"></i> Save Engine</button>
        </div>
    `);
    c.append($bar);

    $bar.find(".dev-toggle-auto input").on("change", function () {
        session.showAuto = $(this).is(":checked");
        rerender();
    });

    c.append(`
        <div class="dev-legend">
            <span class="dev-key scope-engine"><i class="fa-solid fa-microchip"></i> This engine — needs Save</span>
            <span class="dev-key scope-shared"><i class="fa-solid fa-puzzle-piece"></i> Add-on — click to edit, shared by all</span>
            <span class="dev-key scope-auto"><i class="fa-solid fa-wand-magic-sparkles"></i> Automatic — filled in for you</span>
        </div>
    `);

    renderEngineDocument(c, modeData, rerender);

    $("#dev_mode_name").on("input", function () {
        modeData.label = $(this).val();
        setDevEngineDirty(true);
    });

    $("#dev_back_list").on("click", async () => {
        if (isDevEngineDirty) {
            const ok = await new Popup(
                $(`<div>This engine has changes you have not saved. Leave anyway?<br><br>
                   Add-ons are already saved — only this engine's own gold panels would be lost.</div>`),
                POPUP_TYPE.CONFIRM, "Unsaved changes", { okButton: "Discard", cancelButton: "Stay" }).show();
            if (!ok) return;
        }
        setDevEngineDirty(false);
        session.engine = null;
        session.expanded.clear();
        if (returnTo === "tab") { $(".ps-sidebar").show(); fireRefreshHook(REFRESH.SWITCH_TAB, "preset"); }
        else renderDevMode("engines");
    });

    $("#dev_save_mode").on("click", () => {
        modeData.label = $("#dev_mode_name").val() || modeData.label;
        setDevEngineDirty(false);
        const all = extension_settings[extensionName].customModes;
        if (isNew && !all.some(m => m.id === modeData.id)) all.push(modeData);
        else {
            const i = all.findIndex(m => m.id === modeData.id);
            if (i > -1) all[i] = modeData; else all.push(modeData);
        }
        session.engine.isNew = false;
        saveSettingsDebounced();
        toastr.success("Engine saved.");
        if (returnTo === "tab") { $(".ps-sidebar").show(); fireRefreshHook(REFRESH.SWITCH_TAB, "preset"); }
        else renderDevMode("engines");
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Shared chrome
// ────────────────────────────────────────────────────────────────────────────

function backBar(title, onBack, backLabel) {
    const $bar = $(`
        <div class="dev-bar">
            <button class="ps-modern-btn secondary dev-back">
                <i class="fa-solid fa-arrow-left"></i> ${esc(backLabel || "Back")}
            </button>
            <div class="dev-bar-title">${esc(title)}</div>
        </div>
    `);
    $bar.find(".dev-back").on("click", onBack);
    return $bar;
}

// ────────────────────────────────────────────────────────────────────────────
// ROUTER
// ────────────────────────────────────────────────────────────────────────────

export function renderDevMode(view = "landing", arg = null, passedModeData = null, returnTo = "landing") {
    const c = $("#ps_stage_content");
    c.empty();

    $(".dock").hide();
    $("#btn_apply_tab_all").hide();
    $("#ps_btn_save_close").hide();
    $("#ps_btn_dev_mode")
        .html(`<i class="fa-solid fa-right-from-bracket"></i> Exit Dev`)
        .css("color", "#10b981");

    if (!extension_settings[extensionName].customModes) extension_settings[extensionName].customModes = [];

    if (view === "landing") return renderLanding(c);
    if (view === "engines") return renderEnginesList(c);
    if (view === "addons") return renderAddonsList(c);
    if (view === "addon") return renderAddonEditor(c, arg);

    if (view !== "editor") return renderLanding(c);

    // ── editor ──────────────────────────────────────────────────────────────
    // Called with no argument to redraw whatever is already open — that is how
    // returning from an add-on page keeps unsaved engine edits.
    if (arg !== null || passedModeData) {
        let modeData;
        let isNew = false;

        if (passedModeData) {
            modeData = passedModeData;
        } else if (arg === "NEW") {
            isNew = true;
            modeData = {
                id: "custom_" + Date.now(),
                label: "New Custom Engine",
                isCoreClone: false,
                isV7: false,
                p1: "", p3: "", p4: "", p5: "", p6: "",
                cot: "", prefill: "",
                customToggles: [],
            };
        } else {
            const core = hardcodedLogic.modes.find(m => m.id === arg);
            if (core) {
                isNew = true;
                modeData = JSON.parse(JSON.stringify(core));
                modeData.id = "custom_" + Date.now();
                modeData.label = core.label + " (Copy)";
                modeData.isCoreClone = true;
                modeData.isV7 = core.id.startsWith("v7");
                // Remember the parent. Clones used to forget it the moment they
                // were made, so "what did I actually change?" had no answer.
                modeData.parentId = core.id;

                // Fill in the reasoning the engine is written for.
                //
                // No built-in engine carries its own cot/prefill -- they all
                // leave the slot open and take whatever the CoT tab has
                // selected. That is fine for a stock engine, but a copy opened
                // in Dev Mode then showed two empty boxes for the single most
                // important thing it does, with no hint of what belongs there.
                //
                // Filling them makes the copy self-contained: it now pins the
                // reasoning it shipped with instead of following the CoT tab.
                // Clearing either box restores the old behaviour.
                const cotEntry = meguminCotEntryForMode(
                    core.id,
                    (localProfile.model && localProfile.model.includes("-"))
                        ? localProfile.model.split("-").pop() : "english"
                );
                if (cotEntry) {
                    if (!modeData.cot) modeData.cot = cotEntry.content || "";
                    if (!modeData.prefill) modeData.prefill = cotEntry.prefill || "";
                }
            } else {
                modeData = extension_settings[extensionName].customModes.find(m => m.id === arg);
            }
        }

        if (!modeData) {
            c.append(`<div class="dev-empty">That engine no longer exists.</div>`);
            return;
        }
        if (!modeData.customToggles) modeData.customToggles = [];
        session.engine = { modeData, isNew, returnTo };
        session.expanded.clear();
    }

    if (!session.engine) return renderEnginesList(c);
    return renderEngineEditor(c);
}
