// ────────────────────────────────────────────────────────────────────────────
// Images tab — When & how page (both versions): when an image is made, where
// it goes, how many, what it looks like, then Advanced (folded).
// "What it looks like" and Advanced differ by version: Version 2 has shot and
// style; Classic keeps its own template and prompts (classic/ui.js).
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../../core/state.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../../core/profile.js";
import { toggleQuickGenButton } from "../comfy.js";
import { prefixForStyle } from "../qualityPrefix.js";
import { v2Settings } from "../v2/index.js";
import { renderClassicLook, renderClassicAdvanced } from "../classic/ui.js";
import { card, tiles, segmented, switchRow, field, esc } from "../../../ui/controls.js";

// The Advanced fold stays open across redraws once opened.
let advancedOpen = false;

const WHEN = [
    { id: "always", label: "Every reply", desc: "A new image with each reply." },
    { id: "frequency", label: "Every few replies", desc: "You pick how often." },
    { id: "conditional", label: "When a character sends a picture", desc: "Only when the story calls for one." },
    { id: "manual", label: "Only when I ask", desc: "Use the image button." }
];
const WHERE = [
    { id: "inline", label: "Inside the reply", desc: "The image sits in the story text." },
    { id: "new_msg", label: "As a new message", desc: "Each image is its own message, like a gallery." }
];
const SHOTS = [
    { id: "cinematic", label: "Cinematic", desc: "A film still of the moment." },
    { id: "pov", label: "Through your eyes", desc: "What your character sees." },
    { id: "portrait", label: "Portrait", desc: "One character, head and shoulders." }
];
const STYLES = [
    { id: "tags", label: "Tags", desc: "Illustrious, Pony, SDXL anime models." },
    { id: "natural", label: "Plain sentences", desc: "Flux, Z Image." }
];
const METHOD_DESC = {
    placeholders: "The model writes @Name, and each saved look and outfit goes in word for word.",
    reference: "Experimental: the model changes the previous image prompt as little as it can."
};

/**
 * @param engine  "v2" | "classic" (the version picked)
 * @param redraw  draws this page again
 */
export function renderWhenHow(c, { engine, redraw }) {
    const s = localProfile.imageGen;

    // ── When ──
    const when = card("When to make an image");
    const $freq = field("Every how many replies", "",
        $(`<input type="number" id="ig_auto_freq" class="ps-modern-input igx-tiny" min="1" value="${esc(s.autoGenFreq)}" />`));
    $freq.toggle(s.triggerMode === "frequency");
    when.append(tiles(WHEN, s.triggerMode || "always", id => {
        s.triggerMode = id;
        saveProfileToMemory();
        toggleQuickGenButton();
        $freq.toggle(id === "frequency");
    }));
    when.append($freq);
    $freq.find("input").on("input", e => { let v = parseInt($(e.target).val()); if (!(v >= 1)) v = 1; s.autoGenFreq = v; saveProfileDebounced(); });
    c.append(when);

    // ── Where ──
    const where = card("Where it appears");
    const $place = field("Place in the reply", "For the images Chomusuke makes",
        segmented([{ id: "end", label: "At the end" }, { id: "random", label: "A random paragraph" }],
            s.autoPlacement === "random" ? "random" : "end",
            id => { s.autoPlacement = id; saveProfileToMemory(); }));
    $place.toggle(s.injectMode === "inline");
    where.append(tiles(WHERE, s.injectMode === "inline" ? "inline" : "new_msg", id => {
        s.injectMode = id;
        saveProfileToMemory();
        $place.toggle(id === "inline");
    }));
    const $row = $(`<div class="igx-row"></div>`);
    $row.append($place);
    $row.append(field("Images each time", "",
        segmented([1, 2, 3, 4].map(n => ({ id: n, label: String(n) })), s.imageCount || 1,
            id => { s.imageCount = parseInt(id); saveProfileToMemory(); })));
    where.append($row);
    c.append(where);

    // ── What it looks like ──
    const look = card("What the image looks like");
    if (engine === "v2") {
        const cfg = v2Settings();
        const setCfg = patch => { s.v2 = { ...v2Settings(), ...patch }; };
        look.append(field("Shot", "", tiles(SHOTS, cfg.shot, id => { setCfg({ shot: id }); saveProfileToMemory(); })));
        look.append(field("Prompt style", "Match it to your image model", tiles(STYLES, cfg.style, id => {
            setCfg({ style: id });
            s.promptPrefix = prefixForStyle(id, s.promptPrefix);
            saveProfileToMemory();
            // The style changes what the characters' popup and Advanced show.
            redraw();
        })));
        const $extra = $(`<input type="text" id="ig2_extra" class="ps-modern-input" value="${esc(cfg.extra)}" placeholder="soft film grain, moody lighting…" />`);
        $extra.on("input", e => { setCfg({ extra: String($(e.target).val() || "") }); saveProfileDebounced(); });
        look.append(field("Extra instructions", "Added to every image", $extra));
    } else {
        renderClassicLook(look);
    }
    look.append(switchRow({
        label: "Show me the prompt before it's sent",
        desc: "You can read and change it first.",
        on: Boolean(s.previewPrompt),
        onChange: on => { s.previewPrompt = on; saveProfileToMemory(); }
    }));
    c.append(look);

    // ── Advanced ──
    const adv = card();
    const $fold = $(`<button type="button" class="igx-fold"><i class="fa-solid fa-chevron-${advancedOpen ? "down" : "right"}"></i> Advanced</button>`);
    const $box = $(`<div class="igx-stack" style="display:${advancedOpen ? "flex" : "none"};"></div>`);
    $fold.on("click", () => {
        advancedOpen = !advancedOpen;
        $box.css("display", advancedOpen ? "flex" : "none");
        $fold.find("i").attr("class", `fa-solid fa-chevron-${advancedOpen ? "down" : "right"}`);
    });
    adv.append($fold).append($box);
    if (engine === "v2") renderV2Advanced($box, redraw);
    else renderClassicAdvanced($box);
    c.append(adv);
}

function renderV2Advanced(box, redraw) {
    const s = localProfile.imageGen;
    const cfg = v2Settings();
    const setCfg = patch => { s.v2 = { ...v2Settings(), ...patch }; saveProfileToMemory(); };

    box.append(field("Characters with their own look in one image",
        "The rest are drawn in the background. Past 2 or 3, local models start to mix looks up.",
        segmented([{ id: "2", label: "2" }, { id: "3", label: "3" }, { id: "4", label: "4" }, { id: "all", label: "All" }],
            String(cfg.focus || "3"), id => setCfg({ focus: id }))));

    const $methodDesc = $(`<div class="igx-note">${METHOD_DESC[cfg.method === "reference" ? "reference" : "placeholders"]}</div>`);
    box.append(field("How the prompt is written", "",
        segmented([{ id: "placeholders", label: "Fill in saved looks" }, { id: "reference", label: "Edit the last prompt (experimental)" }],
            cfg.method === "reference" ? "reference" : "placeholders",
            id => { setCfg({ method: id }); $methodDesc.text(METHOD_DESC[id]); })).append($methodDesc));

    const tagsStyle = cfg.style === "tags";
    box.append(switchRow({
        label: "Detailed outfit tags",
        desc: tagsStyle
            ? "Turns each outfit from the story into exact tags, once each time it changes."
            : "Only for the Tags prompt style. Plain sentences use the outfit as the story wrote it.",
        on: Boolean(cfg.outfitTags) && tagsStyle,
        disabled: !tagsStyle,
        onChange: on => setCfg({ outfitTags: on })
    }));
    box.append(switchRow({
        label: "Give new characters a look automatically",
        desc: "Read from the chat when someone new enters the scene without one.",
        on: cfg.autoLooks !== false,
        onChange: on => setCfg({ autoLooks: on })
    }));

    if (localProfile.npcBank && localProfile.npcBank.enabled) {
        const $prio = $(`<select id="ig2_look_priority" class="ps-modern-input igx-narrow">
            <option value="v2" ${cfg.lookPriority !== "npc" ? "selected" : ""}>Use the look saved here</option>
            <option value="npc" ${cfg.lookPriority === "npc" ? "selected" : ""}>Use the NPC Bank tags</option>
        </select>`);
        $prio.on("change", e => { setCfg({ lookPriority: $(e.target).val() }); redraw(); });
        box.append(field("When the NPC Bank also has image tags", "", $prio));
    }
}
