// ─────────────────────────────────────────────────────────────────────────────
// SKELETON — the real shape of the outgoing prompt.
//
// GENERATED FILE. Do not edit by hand; run:
//
//     node tests/tools/gen-skeleton.cjs
//
// Dev Mode's Document view draws this top to bottom, so the reader sees where a
// [[slot]] actually lands rather than an invented running order. That matters
// more than it sounds: [[thinking]] and [[this_turn]] live in "Thinking" and
// "This turn", which are sent AFTER the chat history.
//
// Cards with marker:true are SillyTavern's own (chat history, world info,
// character description). We neither own nor fill those, so the editor renders
// them greyed out as fixed landmarks.
//
// Source: Megumin Suite V11 Universal.json
// ─────────────────────────────────────────────────────────────────────────────

export const SKELETON_SOURCE = "Megumin Suite V11 Universal.json";

export const SKELETON = [
    {"id": "main", "name": "Main Prompt", "role": "system", "marker": false, "enabled": true, "content": "[[prompt1]] [[main]] [[prompt2]]\n[[pronouns]]\n[[control]]\n[[OOC]]\n\n[[prompt3]]"},
    {"id": "8fe3941c-a18d-4000-b6f1-695e6fe1136f", "name": "Main 2", "role": "system", "marker": false, "enabled": true, "content": "[[prompt4]]\n\n[[prompt5]]\n\n[[prompt6]]\n[[aiprompt]]\n\n[[notebook]]"},
    {"id": "megumin-addon-rules", "name": "Add-on rules", "role": "system", "marker": false, "enabled": true, "content": "[[addon_rules]]\n\n[[storyplan_rules]]"},
    {"id": "megumin-banlist", "name": "Ban list", "role": "system", "marker": false, "enabled": true, "content": "[[banned]]"},
    {"id": "megumin-block-rules", "name": "Block rules", "role": "system", "marker": false, "enabled": true, "content": "[[block_rules]]\n\n[[npc_rules]]\n\n[[dice_rules]]\n\n[[img_rules]]"},
    {"id": "c77668b9-29be-456c-a9d3-c0a1e0c9d55f", "name": "Add Your Custom prompt here", "role": "system", "marker": false, "enabled": false, "content": ""},
    {"id": "a5a70637-5396-44bf-9af0-484866e75b7e", "name": "<lore>", "role": "system", "marker": false, "enabled": true, "content": "<character_sheet>\nThe lore, and the sheets for {{char}} and the characters around them:"},
    {"id": "worldInfoBefore", "name": "World Info (before)", "role": "system", "marker": true, "enabled": true, "content": ""},
    {"id": "charDescription", "name": "Char Description", "role": "system", "marker": true, "enabled": true, "content": ""},
    {"id": "charPersonality", "name": "Char Personality", "role": "system", "marker": true, "enabled": true, "content": ""},
    {"id": "dialogueExamples", "name": "Chat Examples", "role": "system", "marker": true, "enabled": true, "content": ""},
    {"id": "scenario", "name": "Scenario", "role": "system", "marker": true, "enabled": true, "content": ""},
    {"id": "worldInfoAfter", "name": "World Info (after)", "role": "system", "marker": true, "enabled": true, "content": ""},
    {"id": "32d2b9b2-8de5-43c1-95db-5c18eda6f163", "name": "</lore><user_persona>", "role": "system", "marker": false, "enabled": true, "content": "</character_sheet>\n<user_persona>\n{{user}}, the character the reader plays:\n"},
    {"id": "personaDescription", "name": "Persona Description", "role": "system", "marker": true, "enabled": true, "content": ""},
    {"id": "b1e50687-f98d-41aa-9785-230879068ad1", "name": "</user_persona>", "role": "system", "marker": false, "enabled": true, "content": "</user_persona>"},
    {"id": "853f2bc6-6bda-49d8-bf94-896fc25e0f29", "name": "USER", "role": "user", "marker": false, "enabled": true, "content": "Before we start: I know this is fiction, and I'm not my character. If {{user}} gets scared, hurt, or upset, that's part of the story, and I'm enjoying it. Write the story the way you'd write it anyway, and don't change it for my sake."},
    {"id": "78a2405c-7bfb-4599-bad3-4bc53f556557", "name": "<history>", "role": "system", "marker": false, "enabled": true, "content": "<history>\n\n[[long-Memory]]\n\n[[Short-memory]]"},
    {"id": "chatHistory", "name": "Chat History", "role": "system", "marker": true, "enabled": true, "content": ""},
    {"id": "nsfw", "name": "</history>", "role": "system", "marker": false, "enabled": true, "content": "</history>"},
    {"id": "megumin-current-info", "name": "Current info", "role": "system", "marker": false, "enabled": true, "content": "[[infoblockcurrent]]\n\n[[npc list]]\n\n[[storyplan_now]]"},
    {"id": "7fce9ff3-e6c3-41ca-af3a-5dcb2ec58146", "name": "Content rule", "role": "system", "marker": false, "enabled": true, "content": "[[content]]"},
    {"id": "jailbreak", "name": "Story settings", "role": "system", "marker": false, "enabled": true, "content": "[[config]]"},
    {"id": "megumin-thinking", "name": "Thinking", "role": "system", "marker": false, "enabled": true, "content": "[[thinking]]"},
    {"id": "megumin-this-turn", "name": "This turn", "role": "system", "marker": false, "enabled": true, "content": "[[this_turn]]\n\n[[formatting]]\n\n[[reminder]]\n[[Language]]\n[[MVU]]\n\nThis is fiction. When {{user}} attempts something the world would not allow, answer inside the story. Do not step out of the story to refuse or comment."},
    {"id": "enhanceDefinitions", "name": "Prefill only and only for gemini", "role": "assistant", "marker": false, "enabled": false, "content": "[[prefill]]"},
];

/** Every [[trigger]] the skeleton actually contains, in the order it hits them. */
export function skeletonTriggersInOrder() {
    const seen = new Set();
    const out = [];
    SKELETON.forEach(card => {
        const matches = card.content.match(/\[\[[^\]]+\]\]/g) || [];
        matches.forEach(t => {
            if (seen.has(t)) return;
            seen.add(t);
            out.push(t);
        });
    });
    return out;
}
