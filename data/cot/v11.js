// V11 chain-of-thought: the room works the turn in order. English only.
// Paired with the V11 engine by meguminCotForMode() in data/cot/index.js.
//
//   cot-v11-english      the room, full: the writers draft in the thinking and
//                        the director checks the draft.
//   cot-v11-cap-english  Thinking Cap, for models that over-think (DeepSeek,
//                        Kimi, GLM, Qwen): the same five steps as one line of
//                        notes each, no draft in the thinking.
//
// V10's THINKING_CAP isn't reused: it bans steps and checklists, and V11's room
// is an ordered list of steps.
//
// What the cap learned from Kimi (docs/research-kimi-overthinking.md): no word
// counts (it counts and redrafts), never ask it to check the banlist (it checks
// every item), close the "mental draft" loophole, and say the same thing again
// as the last message sent (V11_CAP_NUDGE): a rule far up the prompt is lost.

// Sent as the last user-side message while the Thinking Cap is picked.
export const V11_CAP_NUDGE = `<thinking_rules>Five short lines, one per step. No draft, not even in your head. Don't revise, don't check. Close thinking and write.</thinking_rules>`;

export const cot_v11 = [
    {
      id: "cot-v11-english", trigger: "[[COT]]",
      content: `Before each response, the team works in this order. All thinking is in English.

1. NORA reads {{user}}'s turn and the history: what was said, what was done, where everyone is, and what each character knows.
2. ANVIL decides what each character in the scene wants right now and what each one does this turn.
3. OPUS decides what new thing this turn gives the reader, where the tension curve stands, whether a truth in the notebook gets a clue or comes out, and how the turn ends.
4. JULIA writes the narration and MIKI writes the speech.
5. NORA checks the draft against the rules of the room and the banlist, and rewrites any line that breaks one.`,
      prefill: `<think>\n<think>\n`
    },
    {
      id: "cot-v11-cap-english", trigger: "[[COT]]",
      content: `Thinking rules:
- Five lines, one per step, in short notes. No prose, no dialogue, no draft. A mental draft is a draft. No sample lines, no "Let's draft", no "Let's write".
- Do not recatalogue the rules of the room or the banlist. You already know them, and they are applied while writing.
- Don't revise, don't check. One pass, then write.

Before each response, the team works in this order. All thinking is in English.

1. NORA: what {{user}} said and did, where everyone is, and what each character knows.
2. ANVIL: what each character in the scene wants right now and what each one does this turn.
3. OPUS: the new thing this turn gives the reader, where the tension stands, whether a truth in the notebook gets a clue or comes out, and how the turn ends.
4. JULIA and MIKI: the line that opens the response and the moment it builds to.
5. NORA: the turn's tone and pace, in a few words.

Close thinking. Write.`,
      prefill: `<think>\n<think>\n`
    }
];
