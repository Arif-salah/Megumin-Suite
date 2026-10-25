// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 — waiting for what an image needs before it goes to ComfyUI.
//
// When the story model writes the image in its reply, the World State read and
// the looks for new characters are still running. The image waits for them, up
// to a limit so a stuck model can't hold it forever. Time the user spends on a
// background prompt preview doesn't count: that wait is theirs.
//
// Pure: no SillyTavern, testable under node.
// ────────────────────────────────────────────────────────────────────────────

/**
 * @param {Promise<any>} work
 * @param {{ limitMs?: number, tickMs?: number, isPaused?: () => boolean }} [opts]
 * @returns {Promise<"done"|"gave-up">}
 */
export async function waitUnlessStuck(work, { limitMs = 60000, tickMs = 1000, isPaused = () => false } = {}) {
    let finished = false;
    const done = Promise.resolve(work).then(() => { finished = true; }, () => { finished = true; });
    let waited = 0;
    while (!finished) {
        let timer = null;
        await Promise.race([done, new Promise(r => { timer = setTimeout(r, tickMs); })]);
        clearTimeout(timer);
        if (finished) break;
        if (!isPaused()) waited += tickMs;
        if (waited >= limitMs) return "gave-up";
    }
    return "done";
}
