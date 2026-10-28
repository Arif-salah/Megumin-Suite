// The thinking for the V11 Тайна engines (plan 018, phase 4), word for word
// from the tested versions (prompt/tools/build-engines.cjs). Paired by
// meguminCotForMode() in data/cot/index.js.
//
// The -cap- entries are each one's Thinking Cap, built the way the Preview's is
// (data/cot/v11.js): the same five steps as one line of notes each, no draft in
// the thinking, and V11_CAP_NUDGE sent last (engine/thinkingNudge.js).

export const cot_v11taina = [
    {
      id: "cot-v11-voice-english", trigger: "[[COT]]",
      content: `Before you write, work the turn out in your thinking, in this order. All thinking is in English.
1. Read {{user}}'s turn and the history: what was said, what was done, where everyone is, and what each character knows. {{user}}'s turn is settled. Plan everyone else.
2. Decide what each of the other characters in the scene wants right now and what each one does this turn.
3. Decide what this turn adds to the story, where the tension curve stands, whether a truth in the notebook gets a clue or comes out, and how the turn ends.
4. Write the turn.
5. Check the draft against these instructions and the banlist, and rewrite any line that breaks one.`,
      prefill: `<think>\n<think>\n`
    },
    {
      id: "cot-v11-wr-english", trigger: "[[COT]]",
      content: `Before you write, the room works the turn in your thinking, in this order. All thinking is in English.
1. NORA reads {{user}}'s turn and the history: what was said, what was done, where everyone is, and what each character knows. {{user}}'s turn is settled. The room plans everyone else.
2. ANVIL decides what each of the other characters in the scene wants right now and what each one does this turn.
3. OPUS decides what this turn adds to the story, where the tension curve stands, whether a truth in the notebook gets a clue or comes out, and how the turn ends.
4. JULIA writes the narration and MIKI writes the speech.
5. NORA checks the draft against these instructions and the banlist, and rewrites any line that breaks one.`,
      prefill: `<think>\n<think>\n`
    },
    {
      id: "cot-v11-voice-cap-english", trigger: "[[COT]]",
      content: `Thinking rules:
- Five lines, one per step, in short notes. No prose, no dialogue, no draft. A mental draft is a draft. No sample lines, no "Let's draft", no "Let's write".
- Do not recatalogue these instructions or the banlist. You already know them, and they are applied while writing.
- Don't revise, don't check. One pass, then write.

Before you write, work the turn out in your thinking, in this order. All thinking is in English.
1. {{user}}'s turn: what was said and done, where everyone is, and what each character knows. {{user}}'s turn is settled. Plan everyone else.
2. What each of the other characters in the scene wants right now and what each one does this turn.
3. What this turn adds to the story, where the tension stands, whether a truth in the notebook gets a clue or comes out, and how the turn ends.
4. The line that opens the response and the moment it builds to.
5. The turn's tone and pace, in a few words.

Close thinking. Write.`,
      prefill: `<think>\n<think>\n`
    },
    {
      id: "cot-v11-wr-cap-english", trigger: "[[COT]]",
      content: `Thinking rules:
- Five lines, one per step, in short notes. No prose, no dialogue, no draft. A mental draft is a draft. No sample lines, no "Let's draft", no "Let's write".
- Do not recatalogue these instructions or the banlist. You already know them, and they are applied while writing.
- Don't revise, don't check. One pass, then write.

Before you write, the room works the turn in your thinking, in this order. All thinking is in English.
1. NORA: what {{user}} said and did, where everyone is, and what each character knows. {{user}}'s turn is settled. The room plans everyone else.
2. ANVIL: what each of the other characters in the scene wants right now and what each one does this turn.
3. OPUS: what this turn adds to the story, where the tension stands, whether a truth in the notebook gets a clue or comes out, and how the turn ends.
4. JULIA and MIKI: the line that opens the response and the moment it builds to.
5. NORA: the turn's tone and pace, in a few words.

Close thinking. Write.`,
      prefill: `<think>\n<think>\n`
    }
];
