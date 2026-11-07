// ────────────────────────────────────────────────────────────────────────────
// The setup checklist's logic (plan 020, phase 4), pure so it is tested. The
// drawing is in ui/checklist.js.
// ────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ done: boolean, optional?: boolean }[]} steps
 * @returns {{ done: number, total: number, allDone: boolean, next: number }}
 *          next = the first step not done (-1 when all are), the one to open.
 */
export function checklistState(steps) {
    const list = Array.isArray(steps) ? steps : [];
    const done = list.filter(s => s && s.done).length;
    const next = list.findIndex(s => !s || !s.done);
    return { done, total: list.length, allDone: list.length > 0 && next === -1, next };
}
