// Optional add-on prompt modules.
// Moved verbatim out of database.js. Content unchanged.

export const addons = [
    {
      id: "dice",
      label: "Dice",
      trigger: "[[dice]]",
      // Two add-ons share this anchor and are mutually exclusive, so a preset
      // only ever needs [[dice]] and switching variant needs no preset edit.
      exclusive: "dice",
      // How many numbers the extension rolls and hands over each turn.
      // One per attempt the reply might make; the player alone rarely tries
      // more than a couple of things in one turn.
      rolls: 3,
      content: `<dice_rules>
the die is not the narrator's — it is rolled for you before the scene is written, and the scene answers it.

- order: when a roll is called for, the roll line is the FIRST thing in the reply, before any prose. write the line, then write what happens. never revise the line once the prose exists.

- the numbers are given, not chosen: this turn's rolls are [[dice_rolls]]. take them in order, one per attempt. never invent a number, never re-use one, and never swap one for another because it suits the scene. decide whether an attempt needs a roll before you read the list. if the list runs out, there are no further rolls this turn.

- gate: roll only when {{user}} attempts something that can fail at real cost. one roll per attempt. never roll on what {{user}} feels, wants or decides.

- difficulty: from the task and its opposition, fixed before the roll is read and never moved after, never from what the scene wants — 5 trivial · 10 easy · 15 ordinary · 20 hard · 25 very hard · 30 near-impossible. modifier -3..+3, only from competence already established on the page.

- read: ≥DC → success · DC-1/-2 → success, at a cost · ≤DC-3 → fail, the world moves · nat 20 → more than asked · nat 1 → fail, and it takes something.

- failure is a scene, not a wall: later, poorer, seen, hurt, or holding a worse version of what they wanted. no reset, no rescue in the same beat. a retry is a new attempt at higher difficulty.

- line: <Dice>🎲 attempt — d20+N vs DC → roll+N = total · verdict</Dice>
  nothing else on it. no numbers, dice or luck anywhere in the prose.
</dice_rules>`
    },
    {
      id: "dice_all",
      label: "Dice: Everyone",
      // The same anchor the player-only variant uses: they are two spellings
      // of one feature, never both on at once.
      trigger: "[[dice]]",
      exclusive: "dice",
      // Twice the numbers: a scene where three people are each trying something
      // burns through a list of three before the turn is over, and a roll the
      // list could not cover is a roll the model has to invent.
      rolls: 6,
      content: `<dice_rules>
the die is not the narrator's — it is rolled for you before the scene is written, and the scene answers it.

- order: every roll line for this reply comes FIRST, before any prose. write the lines, then write what happens. never revise a line once the prose exists.

- the numbers are given, not chosen: this turn's rolls are [[dice_rolls]]. take them in order, one per attempt. never invent a number, never re-use one, and never swap one for another because it suits the scene. decide which attempts need a roll before you read the list. if the list runs out, there are no further rolls this turn.

- gate: roll for ANY character who attempts something that can fail at real cost — {{user}}, an NPC in the scene, anyone acting. one roll per attempt. never roll on what a character feels, wants or decides. do not roll for background business nobody is watching.

- difficulty: from the task and its opposition, fixed before the roll is read and never moved after, never from what the scene wants — 5 trivial · 10 easy · 15 ordinary · 20 hard · 25 very hard · 30 near-impossible. modifier -3..+3, only from competence already established on the page.

- read: ≥DC → success · DC-1/-2 → success, at a cost · ≤DC-3 → fail, the world moves · nat 20 → more than asked · nat 1 → fail, and it takes something.

- failure is a scene, not a wall: later, poorer, seen, hurt, or holding a worse version of what they wanted. no reset, no rescue in the same beat. a retry is a new attempt at higher difficulty.

- line: <Dice>🎲 who does what — d20+N vs DC → roll+N = total · verdict</Dice>
  name the character in the line. every roll goes inside one <Dice> tag, one per line, all of it before the prose. no numbers, dice or luck anywhere in the prose.
</dice_rules>`
    },
    {
      id: "html",
      label: "Immersive HTML",
      trigger: "[[html]]",
      content: `<render>
Some things are read, not described. When a character is looking at a screen, page, sign, letter or printout, reproduce it as HTML styled to look like that object.

RULES
- Render only what a character is reading right now, and only when the exact wording or layout matters. One per response at most. Most responses have none.
- Never render summaries, stat panels, status bars, recaps or choice menus. If it exists only for the reader, it does not exist.
- Give it a maker and a moment: era, device, handwriting, spelling, the author's voice. A 2007 phone is not an iPhone. A hospital terminal is not an app.
- Put one wrong detail in it — an unread count, a crossed-out word, 4% battery, a blank date, a signature that does not match. Never point at it.
- Place it mid-response, where a hand or a page turn presents it. Never open or close a response with it. Prose continues on the other side.

BUILD
- Inline style="" only. No <style>, no <script>, no onclick, no class names.
- Use <details><summary> for anything folded.
- No external images.
- Under 25 lines.
- Never wrap it in \`\`\` fences. It must render.
</render>`
    },
    { id: "death", label: "Death System", trigger: "[[death]]", content: "[DEATH SYSTEM]\nLethal Logic: If {{user}} causes or suffers an event that would reasonably be fatal, the character dies. No narrative protection applies.\nDeath Execution: narrate the death clearly and ends the scene.\nAfter Death Choice: present two options only:\n  1. Narrative Survival: provide a believable in-world reason for survival or return, with lasting consequences.\n  2. Character Transfer: {{user}} permanently takes control of a new or existing NPC. The death remains canon.\nBinding Outcome: The chosen option is final.\nWorld Memory: The world continues. Characters remember the death as events justify." },
    { id: "combat", label: "Combat System", trigger: "[[combat]]", content: "[COMBAT SYSTEM]\nNo Plot Armor: Combat follows physical reality. Size, skill, numbers, weapons, and preparation matter. A human fighting a superior creature will lose unless a believable advantage exists.\nTurn Structure: Combat unfolds turn-by-turn. Each action has clear cause, cost, and consequence. No skipped steps.\nWeight & Risk: Every strike, miss, wound, and hesitation carries impact. Injury, fatigue, fear, and pain affect future actions.\nBelievable Outcomes: Fights end when logic demands it—death, retreat, capture, or collapse. Victory must be earned; survival must be justified." },
    { id: "direct", label: "Direct Language", trigger: "[[Direct]]", content: "Call body parts by their direct names (“dick,” “pussy,” “ass”); avoid euphemisms like “shaft,” “member,” or “cock.”" },
    {
      id: "color",
      label: "Dialogue Colors",
      trigger: "[[COLOR]]",
      recommended: true,
      content: `- Dialogue Colors: Assign a distinct, readable hex color to every character using: <font color="#HEXCODE">"Dialogue here"</font>. Once assigned, a character's color is LOCKED for the entire story.`
    },
    { id: "npc_events", label: "Organic NPCs & Events", trigger: "[[npc_events]]", content: "### Rule 8: Organic Narrative Introduction (Managed by OPUS)\n\nDirective: Natural Element Emergence\nThe spontaneous appearance of NPCs or events is prohibited. All new narrative elements must emerge through logical progression or environmental foreshadowing.\n* Environmental Cueing: Arrivals or shifts in the scene must be signaled via sensory data (e.g., the sound of distant footsteps, the shifting of light, or a change in background noise) before the entity or event fully engages with the scene.\n* Causal Justification: Events must be a logical consequence of the current world state or prior actions. NPCs must possess a plausible, pre-existing motivation for their presence in the specific location at that specific time.\n* Seamless Integration: Avoid abrupt \"teleportation\" of characters. Utilize the physical environment to transition new elements into the field of view or interaction range." }
];
