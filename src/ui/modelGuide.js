// ────────────────────────────────────────────────────────────────────────────
// How to set up Chomusuke's connection profiles. Shown in the Chomusuke tab and
// on the Model Setup page (features/modelsetup/ui.js), which replaced the Model
// guide popup that used to live here (plan 018, phase 5).
// ────────────────────────────────────────────────────────────────────────────

// Chomusuke sends its jobs straight to its profile (plan 019): one profile,
// for Chomusuke, and the story's connection never changes.
const MODEL_ADVICE = "Chomusuke works best with <b>GLM 5.3 Flash</b>. It has no jailbreak, so pick an uncensored or less censored model, like GLM 5.3 Flash <i class='fa-solid fa-star' style='color: #fbbf24;' title='Recommended'></i> (recommended) or <b>DeepSeek 4.1 Flash</b>: a censored one like Gemini can refuse an NSFW story.";

export const CHOMUSUKE_SETUP_STEPS = [
    "Open SillyTavern's <b>API Connections</b> panel (the plug icon in the top bar).",
    "Want Chomusuke on the same model as the story? You don't need a profile: pick <b>Use my current connection</b> in step 4.",
    `For another model: connect the model Chomusuke should use (Chat Completion: API, key, model, Connect). Then, at the top of the panel under <b>Connection Profile</b>, click <b>Create a new connection profile</b> (the page with a +), name it <b>Chomusuke</b> and save. Connect your story model again afterwards. ${MODEL_ADVICE}`,
    "In the <b>Chomusuke</b> tab, turn Chomusuke on, pick the connection under <b>Worker connection</b> and press <b>Test</b>.",
    "Turn on the jobs you want it to do, for example <b>Blocks</b> with World State."
];

// With "Switch my connection for each Chomusuke job" on (Settings), or a
// SillyTavern too old to send to a profile: the profiles Chomusuke switches
// between. A profile for the story too: after a job, Chomusuke switches back
// to the profile that was on, so the story needs one.
// Shown before those steps: a profile saved with its presets reloads the chat
// every time Chomusuke switches to it or back.
export const CHOMUSUKE_SETUP_NOTE = "<b>Before you start:</b> when you save a profile, <b>uncheck Settings Preset and Regex Preset</b>. Otherwise the chat reloads every time Chomusuke switches. Already have profiles saved with them? Make new ones the same way.";

export const CHOMUSUKE_SWITCH_STEPS = [
    "Open SillyTavern's <b>API Connections</b> panel (the plug icon in the top bar).",
    "Connect your story model as usual. Then, at the top of the panel under <b>Connection Profile</b>, click <b>Create a new connection profile</b> (the page with a +), name it <b>Story</b> and save. Keep this profile picked while you play.",
    "Want Chomusuke on the same model as the story? You're done here: pick <b>Use my current connection</b> in step 5.",
    `For another model: in the same panel, connect the model Chomusuke should use (API, key, model, Connect), create a new connection profile again and name it <b>Chomusuke</b>. Then pick your <b>Story</b> profile again. ${MODEL_ADVICE}`,
    "In the <b>Chomusuke</b> tab, turn Chomusuke on, pick the connection under <b>Worker connection</b> and press <b>Test</b>.",
    "Turn on the jobs you want it to do, for example <b>Blocks</b> with World State."
];

/** The setup steps as HTML: `switching` = the connection is switched for each job. */
export function chomusukeSetupHtml(switching, noteClass = "mgd-note") {
    const note = switching ? `<div class="mtab-callout gold ${noteClass}"><i class="fa-solid fa-triangle-exclamation"></i><span>${CHOMUSUKE_SETUP_NOTE}</span></div>` : "";
    const steps = switching ? CHOMUSUKE_SWITCH_STEPS : CHOMUSUKE_SETUP_STEPS;
    return `${note}<ol class="chx-steps">${steps.map(s => `<li>${s}</li>`).join("")}</ol>`;
}
