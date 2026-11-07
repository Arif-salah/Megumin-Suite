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
import { v2Settings, v2StoredSettings } from "../v2/index.js";
import { imageViaChomusuke } from "../auto.js";
import { QWEN_ART_STYLES } from "../../../prompts/imageGenV2.js";
import { renderClassicLook, renderClassicAdvanced } from "../classic/ui.js";
import { card, tiles, segmented, switchRow, field, esc } from "../../../ui/controls.js";

// The Advanced fold stays open across redraws once opened.
let advancedOpen = false;

const WHEN = [
    { id: "always", label: "Every reply", desc: "A new image with each reply." },
    { id: "frequency", label: "Every few replies", desc: "You pick how often." },
    { id: "conditional", label: "When a character sends a picture", desc: "Only when the story calls for one." },
    { id: "manual", label: "Only when I ask", desc: "With the Draw button next to the send button." }
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
    { id: "natural", label: "Plain sentences", desc: "Flux, Z Image." },
    { id: "qwen", label: "Qwen Image", desc: "Qwen Image 2.1: one long, detailed paragraph." },
    { id: "krea", label: "Krea 2 / Moss", desc: "Krea 2 and Moss Image: a short paragraph, each face's expression first." }
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
    when.append(`<div class="igx-note"><i class="fa-solid fa-image"></i> In every mode, the Draw button next to the send button draws the scene when you want one.</div>`);
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
        const setCfg = patch => { s.v2 = { ...v2StoredSettings(), ...patch }; };
        look.append(field("Shot", "", tiles(SHOTS, cfg.shot, id => { setCfg({ shot: id }); saveProfileToMemory(); })));
        look.append(field("Prompt style", "Match it to your image model", tiles(STYLES, cfg.style, id => {
            setCfg({ style: id });
            s.promptPrefix = prefixForStyle(id, s.promptPrefix);
            saveProfileToMemory();
            // The style changes what the characters' popup and Advanced show.
            redraw();
        })));
        if (cfg.style === "qwen") renderQwenStyle(look, cfg, setCfg, s);
        if (cfg.style === "qwen" || cfg.style === "krea") look.append(switchRow({
            label: "Text in images",
            desc: "Speech bubbles, signs, phone screens or sound effects, in English, when the moment has a short line worth showing.",
            on: cfg.textInImages === true,
            onChange: on => { setCfg({ textInImages: on }); saveProfileToMemory(); }
        }));
        if (cfg.style === "krea") look.append(`<div class="igx-note"><i class="fa-solid fa-palette"></i> The prompt names no art style: Krea and Moss draw it from your LoRA and the Positive Prefix (SillyTavern's own prefix when SillyTavern makes the images). Put the style you want there. With Moss Image, a style LoRA is recommended: it keeps the look the same from one image to the next.</div>`);
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

// Qwen Image (plan 026): the art style, and who writes the prompt.
function renderQwenStyle(look, cfg, setCfg, s) {
    const custom = cfg.artStyle === "custom";
    const pick = QWEN_ART_STYLES.find(x => x.id === cfg.artStyle) || QWEN_ART_STYLES[0];
    const $sel = $(`<select id="ig2_art_style" class="ps-modern-input igx-narrow"></select>`);
    QWEN_ART_STYLES.forEach(x => $sel.append(`<option value="${esc(x.id)}" ${x.id === pick.id ? "selected" : ""}>${esc(x.label)}</option>`));
    const $sent = $(`<div class="igx-note"></div>`);
    const $own = $(`<textarea id="ig2_art_style_custom" class="ps-modern-input" rows="2" placeholder="ink wash painting on rice paper, loose black brush strokes, muted washes of grey and indigo">${esc(cfg.artStyleCustom)}</textarea>`);
    const show = id => {
        const st = QWEN_ART_STYLES.find(x => x.id === id) || QWEN_ART_STYLES[0];
        $own.toggle(id === "custom");
        $sent.toggle(id !== "custom").html(`<i class="fa-solid fa-palette"></i> Qwen is told: ${esc(st.text)}`);
    };
    $sel.on("change", e => { const id = String($(e.target).val()); setCfg({ artStyle: id }); saveProfileToMemory(); show(id); });
    $own.on("input", e => { setCfg({ artStyleCustom: String($(e.target).val() || "") }); saveProfileDebounced(); });
    show(custom ? "custom" : pick.id);
    look.append(field("Art style", "How the picture is drawn. Pick Your own to write it yourself.", $sel).append($sent).append($own));

    // The story model never writes a Qwen prompt: automatic images need Chomusuke.
    if (!imageViaChomusuke() && s.triggerMode !== "manual") {
        look.append(`<div class="mtab-callout gold"><i class="fa-solid fa-triangle-exclamation"></i><span><b>Automatic images need Chomusuke with Qwen Image.</b> Qwen needs a long, detailed prompt, so the story doesn't write it in its reply. Turn on Chomusuke's images in the Chomusuke tab, or use the Draw button next to the send button.</span></div>`);
    } else {
        look.append(`<div class="igx-note"><i class="fa-solid fa-circle-info"></i> Qwen needs a long, detailed prompt, so Chomusuke or the Draw button writes it, never the story.</div>`);
    }
}

function renderV2Advanced(box, redraw) {
    const s = localProfile.imageGen;
    const cfg = v2Settings();
    const setCfg = patch => { s.v2 = { ...v2StoredSettings(), ...patch }; saveProfileToMemory(); };

    box.append(field("Characters with their own look in one image",
        "The rest are drawn in the background. Past 2 or 3, local models start to mix looks up.",
        segmented([{ id: "2", label: "2" }, { id: "3", label: "3" }, { id: "4", label: "4" }, { id: "all", label: "All" }],
            String(cfg.focus || "3"), id => setCfg({ focus: id }))));

    // Qwen Image and Krea 2 always write their prompt fresh, with the saved looks filled in.
    if (cfg.style !== "qwen" && cfg.style !== "krea") {
        const $methodDesc = $(`<div class="igx-note">${METHOD_DESC[cfg.method === "reference" ? "reference" : "placeholders"]}</div>`);
        box.append(field("How the prompt is written", "",
            segmented([{ id: "placeholders", label: "Fill in saved looks" }, { id: "reference", label: "Edit the last prompt (experimental)" }],
                cfg.method === "reference" ? "reference" : "placeholders",
                id => { setCfg({ method: id }); $methodDesc.text(METHOD_DESC[id]); })).append($methodDesc));
    }

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
