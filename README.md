# 💥 Megumin Suite V5 for SillyTavern

**The Ultimate Automated Prompt Management & Roleplay Configuration Engine.**

Megumin Suite completely revolutionizes how you manage your preset prompts, writing styles, and AI behavior in SillyTavern. No more manually toggling prompts on and off every time you switch from a gritty dark fantasy to a lighthearted romance. The engine automatically generates optimized rules tailored to your exact preferences, applying them dynamically on a **per-character basis**.

---

## 🤔 Why Do You Need Megumin Suite?

Before Megumin Suite, changing how the AI writes — its length, its tone, the narrator's perspective — meant manually editing text boxes and swapping presets every single time. Megumin Suite automates all of that through a sleek wizard GUI.

* **Global Defaults vs. Custom Profiles:** Set a "Global Default" configuration for all new chats. The moment you tweak a setting inside a specific character's chat, the ext creates an isolated **Custom Character Profile** that only affects *that* character, leaving your other roleplays untouched.

---

## ✨ The Big Three: What Makes V5 Different

### V5 Slice of Reality Mode

This is the headline feature and the philosophy behind V5. Previous modes (V4 Balance, V4 Cinematic, V4 Dark) all worked well, but they still had a tendency to lean into AI clichés: NPCs that simp for you, consequences that don't stick, and scenarios where you magically end up with a villa and all the money in the world. **V5 Slice of Reality kills that.**

The goal isn't to make the story miserable or dramatic for the sake of it — it's to keep things **real** while preserving writing flavor and just enough drama to keep things interesting. It's the perfect balance.

Here's how it works under the hood:

(the result may very depending on the model the smarter the better.)

#### The "Hands Off" Rule
The user character (PC) is the only entity the AI doesn't control. It never narrates what you're thinking or feeling. It only controls how the **world and NPCs react** to your observable actions. Your thoughts are invisible. NPCs respond to what they *see* you do and *hear* you say — nothing more.

#### The World Keeps Turning
Time doesn't freeze when you stop typing. NPCs have jobs, secrets, and messy lives that continue off-screen. The engine fills silence with the texture of real life — a distant siren, a neighbor arguing. When an NPC's off-screen life bleeds into the current scene (a phone call they hang up quickly, an unexplained bad mood), the engine lets it happen without explaining it. The user gets to wonder.

#### NPCs Are People, Not Quest-Givers
This is where V5 really shines. NPCs operate on a **priority stack**:
1. **The Hidden Layer** — What are they *actually* feeling deep down?
2. **The History** — Do they trust the person in front of them?
3. **The Pressure** — Is the environment making them act out?
4. **The Goal** — What do they want and what are they aiming for?

They run on **subtext**: nobody says exactly what they mean. If someone is hurt, they might get quiet instead of yelling. Emotions have **inertia** — you can't just say "sorry" and have everything reset. NPCs can lie, walk away, or shut down if they've had enough. They don't need the PC's permission to leave a room.

#### The Information Firewall
NPCs only know what they have **witnessed** or been **told**. They cannot read minds. They can be *completely wrong* about things and act on those wrong assumptions with full confidence. This single rule eliminates 90% of the "omniscient NPC" problem that plagues most AI roleplay.

#### Physical Reality
Bodies are fragile. If someone's cold, they shiver. If they're terrified, their hands shake. Violence is never "cool" — it's clumsy, scary, and leaves scars. When words fail, the engine uses raw vocalizations: gasps, stammered half-words, and the kind of involuntary sounds that people actually make under stress.

#### The Never-Ending Scene
V5 never cuts a scene just because your turn is done. It asks: *"What would this person do next?"* If an NPC is angry, maybe they slam the door. If they're worried, maybe they follow you. If you go to sleep, V5 shows what happened while you were out. Every response ends on a **hook**.

> **TL;DR:** V5 Slice of Reality treats roleplay like a documentary instead of a Hollywood movie. NPCs have real emotions, real limitations, and real agency. The world doesn't revolve around you — and that's what makes the story feel *alive*.

---

### 🧠 Chain of Thought V2

Chain of Thought (CoT) forces the AI to **think before it writes**. Before generating any response, the model goes through a structured reasoning process inside `<think>` tags. V1 was the original 8-step framework that focused heavily on NPC emotional landscapes. **V2 is a complete redesign** built around catching the AI's worst habits in real-time.

#### How CoT V2 Works (The 7 Steps)

1. **Reality Check (The "No-Go" Zones)**
   * *Am I narrating the user's thoughts?* → Stop immediately.
   * *Is this too convenient? Is the NPC acting like an information dump instead of a real person?* → The "Script Trap" detector catches when the AI is writing fan-fiction instead of believable behavior.

2. **The Information Audit (Knowledge Check)**
   * For each NPC, the AI must list what they *actually* know based on: what they saw with their own eyes, what someone else told them (reliably or not), and what they can reasonably guess from their personality.
   * It then identifies the **gap** (what they *don't* know) and the **error** (are they acting on a wrong assumption?). Example: *"They saw the PC holding a knife, so they assume the PC is the killer, even though the PC was just picking it up."*

3. **NPCs Move**
   * Every NPC must have a clear next move that serves *their own goal* — not the plot, not the user's expectations.

4. **The Off-Screen Pulse**
   * What happened in the background while the PC was busy? The clock never stops.

5. **The Subtext Map (Author's View)**
   * Surface vs. Undercurrent: What are they *saying* vs. what do they actually *want*?
   * Physical Leak: How does the inner tension show in their body? (A clenched jaw, a barely hidden flinch, fingers tapping too fast.)

6. **Writing Style & Pace Check**
   * Did the AI actually follow the writing style rules you configured in Stage 3? This step forces self-compliance.

7. **The Beat & The Hook**
   * What is the specific "Pivot Point" the response ends on to force the user to respond? No more NPCs politely waiting in silence.

#### Multilingual Support
Both V1 and V2 support thinking in **8 languages**: English, Arabic, Spanish, French, Mandarin Chinese, Russian, Japanese, and Portuguese. The CoT process runs in your chosen language, but the final output respects your Language Output setting (defaults to English if left blank, which also prevents thinking-language leaking into the narrative).

> **TL;DR:** CoT V2 is a bullshit detector for the AI. It forces the model to audit its own knowledge, check for convenience-writing, plan NPC actions around their own goals, and always end on a hook. The result is smarter, more consistent, and dramatically more believable roleplay.

---

### 🚫 Dynamic Ban List — *"Kill the Dead Language"*

Every AI model has crutch phrases — those overused clichés it falls back on no matter what you do. *"A shiver ran down their spine." "They released a breath they didn't know they were holding." "Their eyes widened imperceptibly."* You know them. You hate them. The Dynamic Ban List Try to kill them.

#### How It Works

1. **Hit "Analyze Chat History"** — The engine pulls the last **50 AI messages** from your current chat, strips out all thinking blocks, summary blocks, and HTML formatting, and feeds the cleaned narrative text to the AI as a dedicated analysis task.

2. **AI-Powered Pattern Detection** — Instead of just matching exact phrases, the engine asks the AI to act as a **literary critique** and identify the 5 most repetitive stylistic patterns or crutch phrases. The AI returns *generalized rules* — not just "she let out a breath" but **"Characters releasing breaths they didn't know they were holding"** as a pattern to ban.

3. **Injected as Hard Rules** — Every banned phrase gets compiled into a `[BAN LIST]` block that's injected directly into the system prompt with the instruction: *"Never rely on these clichés, tropes, or repetitive patterns. They are dead language."* The AI sees this ban list on every single generation.

4. **Manual Control** — You can also manually type and add any phrase or pattern you want banned. Each entry shows up as a red tag you can click to remove. Clear the whole list with one button if you want a fresh start.

---

### 🎨 Complete Writing Style Overhaul — *"Your Personal Author's Room"*

Stage 3 has been completely rebuilt from the ground up. Gone is the old single-config screen. In its place is a full **Style Library** — a system for creating, saving, managing, and hot-swapping multiple writing style profiles.

#### The Style Library
The new UI is a clean, full-width vertical list that shows all your styles at a glance. Each style card shows:
* The style name and a preview of its generated rule
* Quick-action buttons: **Redo** (regenerate the rule), **Edit** (open the full editor), **Delete**

#### 8 Pre-Configured Templates
Don't want to start from scratch? Pick from the built-in template library and generate a complete writing style rule with a single click:

| Template | Inspiration | Vibe |
|---|---|---|
| **The Backseat Narrator** | Lemony Snicket, Terry Pratchett | Opinionated narrator who pauses to editorialize |
| **Overthinking Everything** | Dostoevsky | Deep internal monologue and moral spiraling |
| **The Snarky Observer** | The Stanley Parable, GLaDOS | Dry, sarcastic narrator who mocks your choices |
| **Thrones & Consequences** | George R.R. Martin | Political intrigue, mud, blood, and no plot armor |
| **Something's Off** | Stephen King | Mundane details that slowly turn into creeping dread |
| **Sweet Like Sugar** | — | Wholesome, warm, openly rooting for a happy ending |
| **Simple and Plain** | — | No flowery prose. Straight to the point. |
| **Popcorn Mode** | — | High-octane action, punchy sentences, nonstop tension |

---

### 🛠️ Bug Fixes, Dev Tools & Quality of Life

* **Critical Bug Fix — Forbid Overrides:** Fixed a stupid error on my end where `Forbid Overrides` was left disabled. This meant some character cards were silently overwriting the main system prompts and ruining the output. Now locked down properly. use the new json files.
* **chat group:** added chat group support.
* **MVU Compatibility:** Added support for [MVU Game Maker](https://github.com/KritBlade/MVU_Game_Maker). Enable it as a block in Stage 5.
* **Draggable Button:** The main extension button is now draggable. WOW.
* **Global Dev Mode Toggle:** Introduced a global override switch. When enabled, saving or restoring a prompt override applies the change across **all profiles** (Characters, Groups, and Defaults) simultaneously.

---

## 🤖 Recommended AI Models

For the best experience, use models with strong instruction-following and reasoning:

*  **Gemini 3.1 pro**
*  **Claude opus 4.6**
*  **GLM 5 and 4.7**
*  **Kimi k2.5** (Tested lightly, performs well)

*Megumin Suite is flexible, but weaker models may struggle with the complex system rules the engine generates.*

---

## Install:
 https://www.youtube.com/watch?v=Q-iaz9mBFrA

---

## ⚠️ Troubleshooting & Tips

* **Thinking Block Won't Close:** If `<think>` tags bleed into the chat, enable the **Think Bug Toggle** in your settings.
* **Generation Hanging / Formatting Issues:** Try **disabling "Prefill"** in your SillyTavern API settings.
* **Does this extension mess with my other presets?** No — your other presets will work just fine. Megumin Suite only injects its rules into its own designated preset (`Megumin Suite`). Your existing presets remain completely untouched.
* **Old Versions:** Legacy docs are here: [Megumin Suite Legacy Readme](https://github.com/Arif-salah/Megumin-Suite)

---
* [Ko-fi (Buy me a coffee)](https://ko-fi.com/kasumaoniisan)
* **Crypto (LTC)**: `LSjf1DczHxs3GEbkoMmi1UWH2GikmXDtis`

**Enjoy the ultimate SillyTavern roleplay experience with Megumin Suite V5.**