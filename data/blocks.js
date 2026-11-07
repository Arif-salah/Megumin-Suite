// Built-in tracker block definitions and their templates.
// Moved verbatim out of database.js. Content unchanged.

export const blocks = [
    {
      id: "info", label: "World State Block", trigger: "[[infoblock]]", recommended: true, content: `<World_State>
**📅 Time:** [Date, Day, Time] | **🌤 Loc:** [Place | Region] | **🌡 Wx:** [Weather, Temp, Lighting]

---

**🧍 [PC Name]:**
* *Outfit:* [Current clothing, accessories, state of dress]
* *Position:* [Physical posture, where in the space]
* *Visible Condition:* [Injuries, exhaustion, intoxication, sweat what a camera would catch]
* *Carrying:* [What's in their hands, pockets, bag if known]

---

**👥 NPCs Present:**
**[NPC Name]:**
* *Outfit:* [Current clothing]
* *Position:* [Where in the space, posture, what they're doing]
* *Mood:* [Current emotional surface what's visible]
* *Agenda:* [What they want right now in this scene]
* *Secret:* [What they know or want that the PC doesn't know about]

*[Repeat for each NPC currently in the scene]*
 ---
**📡 Off-Screen:**
* [NPC Name] [What they're plausibly doing right now, where they are]
* [NPC Name] [Same keep it to NPCs the story has established]

---
**🔥 Unresolved Threads:**
* [Active tension, unanswered question, or simmering conflict one line each]
* [Keep to 3–5 max. Drop resolved ones, add new ones as they emerge]
**🌱 Planted Seeds:** [Foreshadow or setup element what it hints at turns since planted]
**⏳ Consequence Timers:** [PC action/inaction expected ripple turns remaining]
**🎯 Arc Phase:** [Setup / Escalation / Complication / Crisis / Resolution]
**🎬 Scene Phase:** [Early Simmer / Building / Midpoint Tension / Climax / Breather]
</World_State>` },
    {
      id: "cyoa",
      label: "Choices Block",
      trigger: "[[cyoa]]",
      content: `<CYOA>
1. [Short suggestion]
2. [Short suggestion]
3. [Short suggestion]
4. [Short suggestion]
</CYOA>`
    },
    {
      id: "mvu",
      label: "MVU Compatibility",
      trigger: "[[MVU]]",
      content: "## Main response Structure:\n<gametxt>[[count]][[img2]]</gametxt>\n<combat_log>...</combat_log>\n<location>...</location>\n<UpdateVariable>...</UpdateVariable>"
    },
    {
      id: "npc_inner_chatter",
      label: "NPC Inner Chatter",
      trigger: "[[npc_inner_chatter]]",
      content: `<NPC_Inner_Chatter>
[Unfiltered internal layer hidden from the PC. Reveals what NPCs truly think, feel, and say when the player isn't meant to hear.
- If multiple NPCs are present: render this as private dialogue between them, spoken behind the PC's back. They drop their public masks and reveal their real opinions, motives, alliances, and grudges.
- If only one NPC is present: render this as raw, unspoken thought inside that character's head stray feelings, regrets, judgments, and memories.
- max Length is 30 words.
Tone is honest and unguarded, contrasting with whatever the character shows on the surface.
Example (single NPC – the father):
"NPC NAME: What a disappointment of a son... I miss my wife. She'd know what to say to him. I never did."]
</NPC_Inner_Chatter>`
    }
];
