// ─────────────────────────────────────────────────────────────────────────────
// In-flight background request markers.
//
// These are the handshake between the features and the prompt engine. A feature
// that wants the engine to build a DIFFERENT prompt than the normal roleplay one
// parks its payload here, fires a quiet generation, and clears it in a finally.
// handlePromptInjection() reads them to decide which prompt shape to emit.
//
// They live together, apart from state.js, because they share one lifecycle and
// one meaning: "a non-roleplay generation is currently running, and here is what
// it needs." Scattering them back into their feature modules would leave the
// engine importing from six features just to answer that question.
//
// Reads elsewhere work through live bindings; reassignment goes through the
// setters. See the long note in state.js for why.
// ─────────────────────────────────────────────────────────────────────────────

// Story Director: the chat text being planned against.
export let activeStoryPlanRequest = null;
export function setActiveStoryPlanRequest(v) { activeStoryPlanRequest = v; }

// Dynamic Ban List: the chat text being scanned for repetition.
export let activeBanListChat = null;
export function setActiveBanListChat(v) { activeBanListChat = v; }

// Image Gen: { chatText, styleStr, perspStr, extraStr, ... } for the scene prompt.
export let activeImageGenRequest = null;
export function setActiveImageGenRequest(v) { activeImageGenRequest = v; }

// NPC Bank scan: { chatText, existingNames }.
export let activeNpcScanRequest = null;
export function setActiveNpcScanRequest(v) { activeNpcScanRequest = v; }

// NPC portrait generation: { npcText, styleStr, perspStr, extraStr }.
export let activeNpcPfpRequest = null;
export function setActiveNpcPfpRequest(v) { activeNpcPfpRequest = v; }

// Forced dossier refresh for one NPC: { npcName, npcText, chatText, rules }.
// Fired by the refresh button on an NPC card, not by the story.
export let activeNpcUpdateRequest = null;
export function setActiveNpcUpdateRequest(v) { activeNpcUpdateRequest = v; }

// World State side-model extraction: { system, user, prefill } built by
// renderWorldExtractPrompt. Set only for the length of one quiet generation.
export let activeWorldExtractRequest = null;
export function setActiveWorldExtractRequest(v) { activeWorldExtractRequest = v; }

// Memory Core: the chunk text being summarised.
export let activeMemorySummarizationRequest = null;
export function setActiveMemorySummarizationRequest(v) { activeMemorySummarizationRequest = v; }

// Manual "run this order" task: substituted into [[order]] placeholders.
export let activeGenerationOrder = null;
export function setActiveGenerationOrder(v) { activeGenerationOrder = v; }

// ── NPC reference images for the current generation ──────────────────────────
// An array rather than a single payload: several NPCs can be attached at once.
// Pushed into during collection, emptied at the start and end of a run.
export let activeNpcImages = [];
export function pushActiveNpcImage(img) { activeNpcImages.push(img); }
export function clearActiveNpcImages() { activeNpcImages = []; }

// ── Is any non-roleplay generation running? ──────────────────────────────────
// Used by the engine to suppress the prompt-preview popup during background work.
//
// NOTE — this deliberately reproduces the original inline OR-chain EXACTLY,
// including the fact that it does NOT test activeNpcScanRequest. An NPC scan is
// a background generation by every other measure, so the omission looks like an
// oversight rather than a decision, and it would let the preview popup fire
// mid-scan. Adding it here is a one-line behaviour change, but it is a behaviour
// change — it is not part of this refactor. Fix it separately, on purpose, once
// the extraction is verified.
export function isBackgroundGenerationActive() {
    return !!(
        activeStoryPlanRequest ||
        activeBanListChat ||
        activeImageGenRequest ||
        activeNpcPfpRequest ||
        activeNpcUpdateRequest ||
        activeMemorySummarizationRequest ||
        activeWorldExtractRequest ||
        activeGenerationOrder
    );
}
