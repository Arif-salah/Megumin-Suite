// ────────────────────────────────────────────────────────────────────────────
// Images — Classic's own prompt controls, drawn on the When & how page.
// Classic keeps its own prompts: its template list (model + shot), its own
// extra instructions, examples / booru tags / NPC Bank tags, and its prompt
// editor. It never uses Version 2's shot and style.
// ────────────────────────────────────────────────────────────────────────────

import { localProfile } from "../../../core/state.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../../core/profile.js";
import { syncPromptsGlobally } from "../../../core/sync.js";
import { DEFAULT_PROMPTS } from "../../../prompts/index.js";
import { renderPromptEditor } from "../../../ui/promptEditor.js";
import { prefixForStyle, styleOfTemplate } from "../qualityPrefix.js";
import { field, switchRow, esc } from "../../../ui/controls.js";

const TEMPLATES = [
    ["illus_cinematic", "Illustrious/Anima + Cinematic"],
    ["sdxl_cinematic", "Z Image + Cinematic"],
    ["illus_pov", "Illustrious/Anima + POV"],
    ["sdxl_pov", "Z Image + POV"],
    ["illus_portrait", "Illustrious/Anima + Portrait"],
    ["sdxl_portrait", "Z Image + Portrait"]
];

/** Template + extra instructions, into the "What the image looks like" card. */
export function renderClassicLook(card) {
    const s = localProfile.imageGen;
    const $tpl = $(`<select id="ig_template" class="ps-modern-input igx-narrow">
        ${TEMPLATES.map(([id, label]) => `<option value="${id}" ${s.promptTemplate === id ? "selected" : ""}>${label}</option>`).join("")}
    </select>`);
    $tpl.on("change", e => {
        s.promptTemplate = $(e.target).val();
        s.promptPrefix = prefixForStyle(styleOfTemplate(s.promptTemplate), s.promptPrefix);
        $("#ig_prefix").val(s.promptPrefix);
        saveProfileToMemory();
    });
    card.append(field("Prompt template", "Your image model + the kind of shot", $tpl));

    const $extra = $(`<input type="text" id="ig_extra" class="ps-modern-input" value="${esc(s.promptExtra)}" placeholder="moody lighting, dark atmosphere…" />`);
    $extra.on("input", e => { s.promptExtra = $(e.target).val(); saveProfileDebounced(); });
    card.append(field("Extra instructions", "Added to every image", $extra));
}

/** Classic's switches and its prompt editor, into the Advanced fold. */
export function renderClassicAdvanced(box) {
    const s = localProfile.imageGen;
    const flip = key => on => { s[key] = on; saveProfileToMemory(); };
    box.append(switchRow({ label: "Show the model examples", desc: "Better image prompts, but more tokens are sent.", on: Boolean(s.includeExamples), onChange: flip("includeExamples") }));
    box.append(switchRow({ label: "Better booru tags", desc: "Asks for exact booru tags only. Can make empty answers more likely.", on: Boolean(s.directLanguage), onChange: flip("directLanguage") }));
    box.append(switchRow({ label: "Add NPC Bank tags", desc: "Adds a character's saved image tags when they are in the scene.", on: Boolean(s.injectNpcTags), onChange: flip("injectNpcTags") }));

    box.append(renderPromptEditor({
        id: "ig_prompt_editor",
        title: "Edit the image prompts",
        defaultData: DEFAULT_PROMPTS.imageGen,
        currentData: s.customPrompts,
        enabled: s.customPromptsEnabled,
        onToggle: val => {
            s.customPromptsEnabled = val;
            syncPromptsGlobally("imageGen", "customPromptsEnabled", val);
            saveProfileToMemory();
        },
        fields: [
            { key: "systemPrompt", label: "System Prompt", hint: "AI role definition." },
            { key: "userPrompt", label: "User Task Prompt", hint: "Tokens: <code>{{chatHistory}}</code>, <code>{{templateRules}}</code>, <code>{{extraStr}}</code>, <code>{{directLanguage}}</code>, <code>{{npcImageTags}}</code>, <code>{{templateExamples}}</code>" },
            { key: "thinkingPrompt", label: "Thinking Instructions", hint: "Must include output ordering instructions." },
            { key: "injectionTemplate", label: "Image Injection Template", hint: "Tokens: <code>{{conditionalText}}</code>, <code>{{templateRules}}</code>, <code>{{promptExtra}}</code>, <code>{{directLanguage}}</code>, <code>{{npcImageTags}}</code>, <code>{{templateExamples}}</code>" },
            { key: "rulesIllusPov", label: "Rules: Illustrious + POV", hint: "" },
            { key: "examplesIllusPov", label: "Examples: Illustrious + POV", hint: "" },
            { key: "rulesSdxlPov", label: "Rules: Z Image + POV", hint: "" },
            { key: "examplesSdxlPov", label: "Examples: Z Image + POV", hint: "" },
            { key: "rulesIllusCinematic", label: "Rules: Illustrious + Cinematic", hint: "" },
            { key: "examplesIllusCinematic", label: "Examples: Illustrious + Cinematic", hint: "" },
            { key: "rulesSdxlCinematic", label: "Rules: Z Image + Cinematic", hint: "" },
            { key: "examplesSdxlCinematic", label: "Examples: Z Image + Cinematic", hint: "" },
            { key: "rulesIllusPortrait", label: "Rules: Illustrious + Portrait", hint: "" },
            { key: "examplesIllusPortrait", label: "Examples: Illustrious + Portrait", hint: "" },
            { key: "rulesSdxlPortrait", label: "Rules: Z Image + Portrait", hint: "" },
            { key: "examplesSdxlPortrait", label: "Examples: Z Image + Portrait", hint: "" }
        ],
        onSave: (val, key) => {
            if (!s.customPrompts) s.customPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.imageGen));
            s.customPrompts[key] = val;
            syncPromptsGlobally("imageGen", "customPrompts", s.customPrompts);
            saveProfileDebounced();
            return s.customPrompts;
        },
        onReset: () => {
            s.customPrompts = null;
            syncPromptsGlobally("imageGen", "customPrompts", null);
            saveProfileToMemory();
        }
    }));
}
