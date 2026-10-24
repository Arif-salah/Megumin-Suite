// ──────────────────────────────────────────────────────────────────────────────
// Story Director — the tab, the genre/flavour vocabulary, and the generation call.
// ──────────────────────────────────────────────────────────────────────────────

import { generateQuietPrompt, getContext } from "../../st.js";
import { extensionName } from "../../core/constants.js";
import { localProfile } from "../../core/state.js";
import { meguminActiveDataIdentity } from "../../core/keys.js";
import { syncPromptsGlobally } from "../../core/sync.js";
import { setActiveStoryPlanRequest } from "../../core/activeRequests.js";
import { saveProfileToMemory, saveProfileDebounced } from "../../core/profile.js";
import { DEFAULT_PROMPTS } from "../../prompts/index.js";
import { renderPromptEditor } from "../../ui/promptEditor.js";
import { cleanAIOutput, getChatForStoryDirector } from "../../engine/chatText.js";
import { escapeHtmlAttr } from "../../utils/html.js";
import { runWithChomusuke } from "../../engine/tasks.js";

// -------------------------------------------------------------

// -------------------------------------------------------------
// STAGE 7.5: STORY DIRECTOR
// -------------------------------------------------------------

export const SD_GENRES = {
    "slice-of-life": { label: "Slice of Life", desc: "Daily rhythms, small moments, character-driven warmth." },
    "drama": { label: "Drama", desc: "Emotional conflict, relationship tension, high stakes feelings." },
    "romance": { label: "Romance", desc: "Love as the central engine — pursuit, longing, devotion." },
    "action": { label: "Action / Adventure", desc: "Physical danger, quests, combat, exploration." },
    "mystery": { label: "Mystery / Thriller", desc: "Secrets, investigation, paranoia, carefully timed reveals." },
    "fantasy": { label: "Fantasy / RPG", desc: "Magic systems, world-building, quests, power progression." },
    "horror": { label: "Horror / Dark", desc: "Dread, survival, psychological terror, body horror." },
    "scifi": { label: "Sci-Fi", desc: "Technology, space, dystopia, transhumanism." },
    "comedy": { label: "Comedy", desc: "Humor-driven, absurdist, sitcom energy, comedic timing." },
    // Added from reader answers. Deliberately only the ones the nine above do not
    // already cover: Thriller lives inside Mystery, Adventure inside Action and
    // RPG inside Fantasy, so adding them again would be three ways to say the
    // same thing in one dropdown.
    "anime": { label: "Anime / Light Novel", desc: "Genre-savvy tropes, ensemble cast, escalating arcs, tonal swings played straight." },
    "tabletop": { label: "Tabletop RPG", desc: "D&D, Delta Green, Call of Cthulhu — a party, a table, and a world that answers to rules." },
    "psychological": { label: "Psychological", desc: "Interior pressure, unreliable perception, obsession, a slow unravelling." },
    "freeform": { label: "Free-form", desc: "No genre conventions imposed. The story goes wherever the scene takes it." }
};

// The select value that means "the reader typed their own". Not a key in
// SD_GENRES: that map is the vocabulary, and this is a UI state.
export const SD_CUSTOM_GENRE = "custom";

// What the Director is actually told the genre is.
//
// The tab and the prompt builder both need this answer and they must not work it
// out separately — the reader would end up seeing one genre on screen while the
// model was sent another. An empty custom box falls back to the shipped default
// rather than sending a blank line.
export function sdGenreLabel(sp) {
    if (!sp) return "Drama";
    if (sp.primaryGenre === SD_CUSTOM_GENRE) {
        const typed = String(sp.customGenre || "").trim();
        return typed || "Drama";
    }
    return SD_GENRES[sp.primaryGenre]?.label || "Drama";
}

// Sent to the model verbatim, so a tag has to read as an instruction on its own —
// "Cozy" tells it something; "Interesting" does not.
//
// Kept free of anything the list already says another way. The most-asked tag was
// "lighthearted", named as the opposite of grimdark, so both ends of that dial are
// here rather than only the dark one the engines already lean toward.
export const SD_FLAVORS = [
    // Relationship Dynamics
    "Rivals to Lovers", "Forbidden Love", "Found Family", "Toxic Attachment", "Slow Burn Romance", "Love Triangle",
    "Enemies to Lovers", "Unrequited Love", "Second Chance", "Mentor & Student",
    // Plot Structure
    "Heist", "Revenge", "Redemption Arc", "Secret Identity", "Mystery & Deception", "Tournament Arc",
    "Conspiracy", "Rescue", "Escape",
    // Tone & Mood
    "Dark Comedy", "Gothic", "Bittersweet", "Tragic", "Horror-Comedy", "Noir",
    "Lighthearted", "Cozy", "Grimdark", "Whimsical",
    // Setting & World
    "Urban Fantasy", "Historical", "Survival", "Post-Apocalyptic", "Victorian Gothic", "Cyberpunk",
    "Space Opera", "Wuxia / Xianxia", "Academy", "Military", "Small Town",
    // Character & Theme
    "Coming of Age", "Identity", "Cognitive Dissonance", "Moral Ambiguity", "Corruption Arc",
    "Obsession", "Grief", "Betrayal",
    // Special & Niche
    "Slice of Life", "Body Horror", "Fish Out of Water", "Fish In Water", "Political Intrigue",
    "War", "Isekai", "Harem", "Monster", "Mind Control", "Memory Loss", "Time Loop",
    "Vampire", "Ghost Story", "Oblique Horror"
];

export function renderStoryPlanner(c) {
    c.empty();
    const sp = localProfile.storyPlan;

    // Build genre options
    let genreOptions = '';
    Object.entries(SD_GENRES).forEach(([id, g]) => {
        genreOptions += `<option value="${id}" ${sp.primaryGenre === id ? 'selected' : ''}>${g.label}</option>`;
    });
    // Appended rather than added to SD_GENRES: that map is the vocabulary the
    // Director is told about, and "Custom…" is a UI affordance, not a genre.
    genreOptions += `<option value="${SD_CUSTOM_GENRE}" ${sp.primaryGenre === SD_CUSTOM_GENRE ? 'selected' : ''}>Custom…</option>`;
    const isCustomGenre = sp.primaryGenre === SD_CUSTOM_GENRE;

    // Build flavor chips
    let flavorChips = '';
    SD_FLAVORS.forEach(f => {
        const isActive = sp.flavorTags && sp.flavorTags.includes(f);
        flavorChips += `<button class="sd-chip ${isActive ? 'active' : ''}" data-flavor="${f}">${f}</button>`;
    });

    c.append(`
        <!-- HEADER -->
        <div class="mtab-header">
            <div class="mtab-header-left">
                <div class="mtab-header-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                    <i class="fa-solid fa-clapperboard"></i>
                </div>
                <div>
                    <h2>Story Director</h2>
                    <p>Direct the narrative. Shape what happens next.</p>
                </div>
            </div>
            <div id="sd_header_badge" class="mtab-header-badge" style="background: ${sp.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)'}; color: ${sp.enabled ? '#10b981' : 'var(--text-muted)'}; border: 1px solid ${sp.enabled ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'};">
                <i class="fa-solid fa-${sp.enabled ? 'circle-check' : 'circle-xmark'}" style="font-size:0.6rem;"></i> ${sp.enabled ? 'Enabled' : 'Disabled'}
            </div>
        </div>

        <div class="mtab-callout gold" style="margin-bottom: 16px;">
            <i class="fa-solid fa-circle-info"></i>
            <span><strong>V10 does not really need this.</strong> Its engine already drives the plot
            forward on its own, so the Director is optional rather than recommended there. Switch it
            on if you want a hand on the wheel &mdash; a specific arc, a pace change, a beat you want
            reached &mdash; and leave it off otherwise.</span>
        </div>

        <!-- MASTER TOGGLE -->
        <div class="mtab-toggle-row ${sp.enabled ? 'active' : ''}" id="sd_enable_card" style="margin-bottom: 20px;">
            <div class="toggle-info">
                <div class="toggle-label"><i class="fa-solid fa-clapperboard" style="color:var(--gold);"></i> Enable Story Director</div>
                <div class="toggle-desc">Analyze your RP and generate narrative directives that steer the plot forward.</div>
            </div>
            <div class="ps-switch"></div>
        </div>

        <div id="sd_main_content" style="display: ${sp.enabled ? 'block' : 'none'};">

            <!-- DIRECTOR'S CONSOLE -->
            <div class="mtab-panel">
                <div class="mtab-panel-title gold"><i class="fa-solid fa-sliders"></i> Director's Console</div>

                <!-- Content Rating -->
                <div class="sd-setting-group">
                    <div class="sd-setting-label">Content Rating</div>
                    <div class="sd-rating-pills">
                        <button class="sd-pill ${sp.contentRating === 'none' ? 'active' : ''}" data-rating="none">
                            <i class="fa-solid fa-infinity"></i> No Limit
                        </button>
                        <button class="sd-pill ${sp.contentRating === 'sfw' ? 'active' : ''}" data-rating="sfw">
                            <i class="fa-solid fa-shield-halved"></i> SFW
                        </button>
                        <button class="sd-pill ${sp.contentRating === 'nsfw' ? 'active' : ''}" data-rating="nsfw">
                            <i class="fa-solid fa-fire"></i> NSFW
                        </button>
                    </div>
                </div>

                <!-- Pacing -->
                <div class="sd-setting-group">
                    <div class="sd-setting-label">Pacing</div>
                    <div class="sd-pacing-selector">
                        <button class="sd-pacing-btn ${sp.pacing === 'slowburn' ? 'active' : ''}" data-pacing="slowburn">
                            <i class="fa-solid fa-moon"></i>
                            <span class="sd-pacing-name">Slow Burn</span>
                            <span class="sd-pacing-desc">Character moments, no rush</span>
                        </button>
                        <button class="sd-pacing-btn ${sp.pacing === 'natural' ? 'active' : ''}" data-pacing="natural">
                            <i class="fa-solid fa-wind"></i>
                            <span class="sd-pacing-name">Natural</span>
                            <span class="sd-pacing-desc">Organic flow, balanced</span>
                        </button>
                        <button class="sd-pacing-btn ${sp.pacing === 'accelerate' ? 'active' : ''}" data-pacing="accelerate">
                            <i class="fa-solid fa-forward-fast"></i>
                            <span class="sd-pacing-name">Accelerate</span>
                            <span class="sd-pacing-desc">Push forward, big moves</span>
                        </button>
                    </div>
                </div>

                <!-- Primary Genre -->
                <div class="sd-setting-group">
                    <div class="sd-setting-label">Primary Genre</div>
                    <select id="sd_genre" class="ps-modern-input" style="width: 100%; cursor: pointer;">
                        ${genreOptions}
                    </select>
                    <input type="text" id="sd_genre_custom" class="ps-modern-input"
                           style="width: 100%; margin-top: 8px; display: ${isCustomGenre ? 'block' : 'none'};"
                           placeholder="e.g. cosmic horror western, courtroom drama"
                           value="${escapeHtmlAttr(sp.customGenre || '')}">
                    <div class="sd-genre-desc" id="sd_genre_desc">${isCustomGenre
                        ? 'Type the genre and the conventions that come with it. Sent to the Director exactly as written.'
                        : (SD_GENRES[sp.primaryGenre]?.desc || '')}</div>
                </div>

                <!-- Flavor Tags -->
                <div class="sd-setting-group" style="margin-bottom: 0;">
                    <div class="sd-setting-label">Flavor Tags <span class="sd-label-hint">(pick up to 3)</span></div>
                    <div class="sd-chip-container" id="sd_flavor_chips">
                        ${flavorChips}
                    </div>
                </div>
            </div>

            <!-- UNRESTRICTED CONTENT TOGGLE -->
            <div class="mtab-toggle-row ${sp.unrestrictedContent ? 'active' : ''}" id="sd_unrestricted_card">
                <div class="toggle-info">
                    <div class="toggle-label"><i class="fa-solid fa-lock-open" style="color:#ef4444;"></i> Unrestricted Content</div>
                    <div class="toggle-desc">Inject a content policy override into the story context. Enables darker, more explicit narrative directions without AI refusals.</div>
                </div>
                <div class="ps-switch"></div>
            </div>

            <!-- DIRECTOR'S NOTE -->
            <div class="mtab-panel">
                <div class="mtab-panel-title gold"><i class="fa-solid fa-pen-fancy"></i> Director's Note</div>
                <div class="sd-directors-note-hint">
                    <i class="fa-solid fa-lightbulb"></i>
                    Tell the AI what you want to happen. It will weave your instruction into a long-term plot — not a hard cut. Leave empty to let the AI decide freely.
                </div>
                <textarea id="sd_directors_note" class="ps-modern-input sd-directors-note-input" placeholder="e.g. &quot;I want the maid from my past to show up again&quot; or &quot;make the rival discover the secret&quot; or &quot;I want this NPC to betray me&quot;">${sp.directorsNote || ""}</textarea>
            </div>

            <!-- CURRENT DIRECTIVE -->
            <div class="mtab-panel">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                    <div class="mtab-panel-title gold" style="margin-bottom:0;"><i class="fa-solid fa-scroll"></i> Current Directive</div>
                    <div style="display: flex; gap: 8px;">
                        <button id="sd_btn_generate" class="wstyle-gen-btn" style="padding: 8px 18px; font-size: 0.78rem;"><i class="fa-solid fa-bolt"></i> Generate Directive</button>
                        <button id="sd_btn_evolve" class="wstyle-gen-btn" style="padding: 8px 18px; font-size: 0.78rem; background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.3);" ${sp.currentPlan ? '' : 'disabled'}><i class="fa-solid fa-arrows-rotate"></i> Evolve</button>
                    </div>
                </div>
                <textarea id="sd_current_plan" class="ps-modern-input sd-directive-output" placeholder="Your narrative directive will appear here after generation.">${sp.currentPlan || ""}</textarea>
                <div class="mtab-callout">
                    <i class="fa-solid fa-circle-info"></i>
                    <span>This directive is injected via <code>[[storyplan]]</code>. A feedback tracker is appended via <code>[[storytracker]]</code>.</span>
                </div>
            </div>

            <!-- ENGINE SETTINGS -->
            <div class="mtab-panel">
                <div class="mtab-panel-title gold"><i class="fa-solid fa-gears"></i> Engine Settings</div>
                <div class="mtab-setting-row">
                    <div class="set-info">
                        <div class="set-label"><i class="fa-solid fa-cat" style="color: #f43f5e; margin-right: 6px;"></i> Background Worker</div>
                        <div class="set-desc">Managed by the <b>Chomusuke</b> tab. Configure Chomusuke to offload story directive evolution to a dedicated worker LLM.</div>
                    </div>
                </div>
                <div class="mtab-setting-row">
                    <div class="set-info">
                        <div class="set-label">Context Limit</div>
                        <div class="set-desc">How much chat history the Director reads to analyze the plot.</div>
                    </div>
                    <select id="sd_context_limit" class="ps-modern-input" style="width: 220px; cursor: pointer;">
                        <option value="100" ${sp.contextLimit === 100 ? 'selected' : ''}>Last 100 Messages</option>
                        <option value="0" ${sp.contextLimit === 0 ? 'selected' : ''}>Full Chat History</option>
                    </select>
                </div>
                <div class="mtab-setting-row">
                    <div class="set-info">
                        <div class="set-label">Auto-Trigger Mode</div>
                        <div class="set-desc">When should the Director evolve the story?</div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <select id="sd_trigger" class="ps-modern-input" style="width: 170px; cursor: pointer;">
                            <option value="manual" ${sp.triggerMode === 'manual' ? 'selected' : ''}>Manual Only</option>
                            <option value="auto" ${sp.triggerMode === 'auto' ? 'selected' : ''}>Auto (Smart Status)</option>
                            <option value="frequency" ${sp.triggerMode === 'frequency' ? 'selected' : ''}>Every X Replies (Safety Net)</option>
                        </select>
                        <input type="number" id="sd_freq" class="ps-modern-input" value="${sp.autoFreq}" min="1" style="width: 60px; text-align: center; display: ${sp.triggerMode === 'frequency' ? 'block' : 'none'};" title="Fallback safety net interval" />
                    </div>
                </div>
            </div>
        </div>
    `);

    // --- PROMPT EDITOR UI ---
    const spEditor = renderPromptEditor({
        id: "sd_prompt_editor",
        title: "Advanced: Edit Prompts",
        defaultData: DEFAULT_PROMPTS.storyPlan,
        currentData: sp.customPrompts,
        enabled: sp.customPromptsEnabled,
        onToggle: (val) => { 
            sp.customPromptsEnabled = val; 
            syncPromptsGlobally('storyPlan', 'customPromptsEnabled', val);
            saveProfileToMemory(); 
        },
        fields: [
            { key: "systemPrompt", label: "System Prompt (Manifesto)", hint: "Tokens: <code>{{charLore}}</code>, <code>{{userPersona}}</code>, <code>{{chatHistory}}</code>, <code>{{user}}</code>" },
            { key: "userPrompt", label: "User Task Prompt", hint: "Tokens: <code>{{user}}</code>, <code>{{directorSettings}}</code>" },
            { key: "thinkingPrompt", label: "Thinking Instructions", hint: "Must include output ordering instructions with <code>&lt;directive&gt;</code> tags." },
            { key: "injectionTemplate", label: "Directive Injection Template", hint: "Tokens: <code>{{planText}}</code>" },
            { key: "trackerTemplate", label: "Story Tracker Template", hint: "Tokens: <code>{{user}}</code>" }
        ],
        onSave: (val, key) => {
            if (!sp.customPrompts) sp.customPrompts = JSON.parse(JSON.stringify(DEFAULT_PROMPTS.storyPlan));
            sp.customPrompts[key] = val;
            syncPromptsGlobally('storyPlan', 'customPrompts', sp.customPrompts);
            saveProfileDebounced();
            return sp.customPrompts;
        },
        onReset: () => {
            sp.customPrompts = null;
            syncPromptsGlobally('storyPlan', 'customPrompts', null);
            saveProfileToMemory();
        }
    });
    c.find('#sd_main_content').append(spEditor);

    // === EVENT LISTENERS ===

    // Master toggle
    $("#sd_enable_card").on("click", function () {
        sp.enabled = !sp.enabled; saveProfileToMemory();
        if (sp.enabled) {
            $(this).addClass("active");
            $("#sd_main_content").slideDown(200);
            $("#sd_header_badge").css({ background: 'rgba(16,185,129,0.12)', color: '#10b981', 'border-color': 'rgba(16,185,129,0.25)' }).html(`<i class="fa-solid fa-circle-check" style="font-size:0.6rem;"></i> Enabled`);
        } else {
            $(this).removeClass("active");
            $("#sd_main_content").slideUp(200);
            $("#sd_header_badge").css({ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', 'border-color': 'var(--border-color)' }).html(`<i class="fa-solid fa-circle-xmark" style="font-size:0.6rem;"></i> Disabled`);
        }
    });

    // Content Rating pills
    $(".sd-pill").on("click", function () {
        $(".sd-pill").removeClass("active");
        $(this).addClass("active");
        sp.contentRating = $(this).data("rating");
        saveProfileToMemory();
    });

    // Pacing buttons
    $(".sd-pacing-btn").on("click", function () {
        $(".sd-pacing-btn").removeClass("active");
        $(this).addClass("active");
        sp.pacing = $(this).data("pacing");
        saveProfileToMemory();
    });

    // Genre select
    $("#sd_genre").on("change", function () {
        sp.primaryGenre = $(this).val();
        const custom = sp.primaryGenre === SD_CUSTOM_GENRE;
        $("#sd_genre_custom").toggle(custom);
        $("#sd_genre_desc").text(custom
            ? 'Type the genre and the conventions that come with it. Sent to the Director exactly as written.'
            : (SD_GENRES[sp.primaryGenre]?.desc || ''));
        // Focus on arrival: picking Custom is a statement of intent to type, and
        // an empty box that does nothing until you find it is a dead end.
        if (custom) $("#sd_genre_custom").trigger("focus");
        saveProfileToMemory();
    });

    // Debounced, not saved per keystroke — this is a free-text field and the
    // profile write is the expensive half.
    $("#sd_genre_custom").on("input", function () {
        sp.customGenre = $(this).val();
        saveProfileDebounced();
    });

    // Flavor chips
    $("#sd_flavor_chips").on("click", ".sd-chip", function () {
        const flavor = $(this).data("flavor");
        if (!sp.flavorTags) sp.flavorTags = [];

        if ($(this).hasClass("active")) {
            sp.flavorTags = sp.flavorTags.filter(f => f !== flavor);
            $(this).removeClass("active");
        } else {
            if (sp.flavorTags.length >= 3) {
                toastr.warning("Maximum 3 flavor tags allowed.");
                return;
            }
            sp.flavorTags.push(flavor);
            $(this).addClass("active");
        }
        saveProfileToMemory();
    });

    // Unrestricted Content toggle
    $("#sd_unrestricted_card").on("click", function () {
        sp.unrestrictedContent = !sp.unrestrictedContent;
        saveProfileToMemory();
        if (sp.unrestrictedContent) {
            $(this).addClass("active");
        } else {
            $(this).removeClass("active");
        }
    });

    // Director's Note
    $("#sd_directors_note").on("input", e => { sp.directorsNote = $(e.target).val(); saveProfileDebounced(); });

    // Current Plan textarea
    $("#sd_current_plan").on("input", e => { sp.currentPlan = $(e.target).val(); sp.planMessageIndex = (getContext().chat?.length || 1) - 1; saveProfileDebounced(); });

    // Context Limit
    $("#sd_context_limit").on("change", e => { sp.contextLimit = parseInt($(e.target).val(), 10); saveProfileToMemory(); });

    // Trigger
    $("#sd_trigger").on("change", e => {
        sp.triggerMode = $(e.target).val(); saveProfileToMemory();
        if (sp.triggerMode === 'frequency') $("#sd_freq").show(); else $("#sd_freq").hide();
    });
    $("#sd_freq").on("input", e => { sp.autoFreq = Math.max(1, parseInt($(e.target).val()) || 10); saveProfileDebounced(); });

    // Generate button
    $("#sd_btn_generate").on("click", async function () {
        await handleDirectiveGeneration(sp, $(this), false);
    });

    // Evolve button
    $("#sd_btn_evolve").on("click", async function () {
        await handleDirectiveGeneration(sp, $(this), true);
    });
}

export async function handleDirectiveGeneration(sp, btn, isEvolve) {
    const chatText = getChatForStoryDirector();
    if (chatText.length < 100) return toastr.warning("Not enough chat history to generate a directive.");

    // `sp` was captured when the Story Director tab was rendered, so it can already be a
    // couple of chats old, and the generation below takes seconds on top of that. Stamp
    // the chat the directive is being written FOR and re-check it before storing.
    const sdIdentity = meguminActiveDataIdentity();

    const originalHtml = btn.html();
    btn.prop("disabled", true).html(`<i class="fa-solid fa-spinner fa-spin"></i> ${isEvolve ? 'Evolving...' : 'Directing...'}`);

    try {
        let output = await runWithChomusuke("storyPlan", () => generateStoryPlanLogic(chatText));

        if (output) {
            // Writing now would put this chat's directive into the old one, and
            // planMessageIndex would be counted against the wrong chat's length.
            if (meguminActiveDataIdentity() !== sdIdentity) {
                console.debug(`[Megumin-Suite] Story Director ${isEvolve ? 'evolve' : 'generate'} declined: it started on "${sdIdentity}" but "${meguminActiveDataIdentity()}" is active now. The new directive was discarded, not applied.`);
                toastr.info("Chat changed while the directive was generating. It was discarded.", "Story Director");
                return;
            }
            // Try <directive> tags first, fall back to <plot> for backward compat
            const directiveMatch = output.match(/<directive>([\s\S]*?)<\/directive>/i) || output.match(/<plot>([\s\S]*?)<\/plot>/i);
            if (directiveMatch) {
                sp.currentPlan = directiveMatch[1].trim();
                sp.planMessageIndex = (getContext().chat?.length || 1) - 1;
                $("#sd_current_plan").val(sp.currentPlan);
                $("#sd_btn_evolve").prop("disabled", false);
                saveProfileToMemory();
                toastr.success(isEvolve ? "Directive Evolved!" : "Directive Generated!");
            } else {
                toastr.warning("AI failed to format the directive correctly. Try again.");
            }
        }
    } catch (e) {
        toastr.error("Failed to generate directive.");
        console.error("[Megumin Suite] Story Director error:", e);
    } finally {
        btn.prop("disabled", false).html(originalHtml);
    }
}

export async function generateStoryPlanLogic(chatText) {
    setActiveStoryPlanRequest(chatText);
    try {
        let rawOutput = await generateQuietPrompt({ prompt: "___PS_STORY_PLAN___", quietPrompt: "___PS_STORY_PLAN___" });
        return rawOutput;
    } finally {
        setActiveStoryPlanRequest(null);
    }
}
