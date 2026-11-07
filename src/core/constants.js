// Identity constants. Kept apart from state.js because these never change at
// runtime, and because almost every module wants extensionName for the
// extension_settings lookup — importing that shouldn't drag mutable state along.

export const extensionName = "Megumin-Suite-Beta";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
export const TARGET_PRESET_NAME = "Megumin Engine";
