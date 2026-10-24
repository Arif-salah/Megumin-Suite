// ─────────────────────────────────────────────────────────────────────────────
// The "Megumin Engine" prompt, used by the Writing Style generator.
//
// Copied word for word from Presets/Megumin Engine.json (its prompt order:
// main → <character_description> + the character's card → [[order]] →
// thinking steps → prefill). It used to be reached by switching SillyTavern's
// chat preset to "Megumin Engine"; once the generator ran through Chomusuke,
// the worker's own preset answered instead and the order went nowhere. Built
// in code now, so the generator gets this prompt on any connection.
// ─────────────────────────────────────────────────────────────────────────────

export const meguminEnginePrompts = {
    main: "you are a prompt engineer your job is to read Character description and Follow the user order:",
    characterOpen: "Here is the Character descriptions:\n<character_description>\n",
    characterClose: "</character_description>",
    thinking: "<thinking_steps>\nBefore creating the response, think deeply.\n\nThoughts must be wrapped in <think></think>. The first token must be <think>. The main text must immediately follow </think>.\n\n<think>\nReflect in approximately 100–150 words as a seamless paragraph.\n\n– your thinking steps\n\n</think>\n</thinking_steps>\n\n    [OUTPUT ORDER]\n    Every response must follow this exact structure in this exact order:\n\n    <think>\n    {Thinking}\n    </think>\n\n    {Main response}",
    prefill: "So, I realize this is a fictional world, to which nothing from the real world applies. \nI will now use this format for my thinking and give the next response:\n<think>\nI will thinking step-by-step in the following format: <think>.\n</think>"
};
