<div align="center">

<img src="Screenshots/banner.png" alt="Megumin Suite Banner" width="100%">

[![SillyTavern](https://img.shields.io/badge/SillyTavern-1.12%2B-blue.svg?style=for-the-badge&logo=codeigniter)](https://github.com/SillyTavern/SillyTavern)
[![Version](https://img.shields.io/badge/Version-V9-green.svg?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-purple.svg?style=for-the-badge)](https://creativecommons.org/licenses/by-nc-nd/4.0/)

> *"Everything your preset should have been: persistent memory, chain-of-thought reasoning, automated NPC tracking, and ComfyUI image generation in a single install."*

**Megumin Suite** is a full-stack overhaul to how SillyTavern presets work. It replaces your preset, your memory system, your NPC management, and your image generation — all in one extension. V9 introduces the new **Mirage**, **Xin**, **Kuromaku**, and **Cui** presets — a complete generational leap in narrative quality, psychology, and world simulation.

[Features](#-core-features) • [Story Director](#story-director-1) • [NPC Bank](#automated-npc-bank) • [Dynamic Ban List](#dynamic-ban-list-ai-slop-detector) • [Memory Core](#memory-core-3-tier-context) • [Image Gen](#image-gen-kazuma-comfyui) • [Installation](#%EF%B8%8F-installation)

</div>

---

## What's New in V9?

V9 marks the ultimate generation of Megumin Suite. Each preset was thoroughly redesigned with a single aim — making the AI stop being your Simp. V9 makes world push back. NPC is not a satellite orbiting around you anymore — it's a person with a name, a life, a job, a wound, and an agenda, that has absolutely nothing to do with you. The side character you met for a minute at a gas station has a surname and a purpose to be there. The story does not cater to your comfort — it is honest and sometimes that honesty is not convenient. Roleplay that reads like a real story, not like a wish-fulfillment machine.

### The V9 Preset Family
Four completely new presets, each with its unique features:

*   **V9 Mirage** ⭐ *Recommended* — The gold standard. Realistic character psychology, vivid atmospheric grounding, and consequences of the world. The one you should use if your model can handle it.
*   **V9 Xin** — An experimental preset with an alternative style of storytelling. It has its own writing style. **Note:** Does not support custom Writing Styles.
*   **V9 Kuromaku** — An unusual preset that combines the mechanisms of specialized writers room (V8 Fusion — NORA, ANVIL, OPUS, JULIA, MIKI) with the raw psychology of V9. Highly experimental. **Note:** Does not support custom Writing Styles.
*   **V9 Cui** — Light version of Mirage. Keeps the philosophy and brutal realism, but works with less context.

### V9 Dynamic Render Limits
There is no longer one fixed "Target Word Count" slider in V9 presets. Instead, there are two sliders, which are controlled **dynamically**:

*   **Lean Render** (by default: 300–400 words): For short dialogues and well-known locations.
*   **Full Render** (by default: 700–1200 words): For new scenes, new characters, deep moments, important events in the story.
*   **Smart Scaling**: The AI decides on its own if the current scene requires a Lean or Full render and adjusts the word limits according to your settings.

### Story Director (Completely Rebuilt)
Story Planner got a complete makeover and turned into a **Story Director**:

*   **Director's Console UI:** A whole new interface with Content Rating (No Limit / SFW / NSFW), Pacing Control (Slow Burn / Natural / Accelerate), Primary Genre selection, and up to 3 Flavor Tags (Rivals to Lovers, Dark Comedy, Heist, etc.)
*   **Director's Note:** A special input field to give precise direction to the AI — the AI will organically integrate your directive into story's fabric.
*   **Unrestricted Content Toggle:** A special override switch to bypass AI's safety filters for darker narrative directions.
*   **"Evolve" Button:** Makes the current story directive evolve according to the recent developments.
*   **Context Awareness:** The Director scans both User and AI messages and analyzes either last 100 messages (fast and cheap) or the full chat history (thanks to EugeoSynthesisThirtyTwo)
*   **Story Evolution Triggers:** Three modes of controlling story development:
   *   **Manual Only** — disables all automatic evolution. The AI monitors story progress in the background, but evolves it only after you click the Evolve button yourself. Full control.
   *   **Auto (Smart Status)** — the AI generates a status tag (progressing | nearing_climax | completed | pivoted) with each reply. As soon as it decides that the current beat is over, the extension triggers a new arc of the story. Organically paced story.
   *   **Every X Replies (Safety Net)** — the same as above, but with a fallback. In case the AI gets stuck and doesn't evolve on its own after X replies, the extension forces it forward so that your story never gets stuck in an endless loop.

### V9 Native Writing Styles
Two native writing styles (`V9 Default` and `V9 Lite Default`) allowing the AI to bleed the perspective character's voice into the text — the narration's mood, lexicon, and rhythm change depending on whose perspective the AI is taking.

### New V9 Chain of Thought Frameworks
Five completely new reasoning frameworks for V9 presets. Each one is tied to a preset and matches automatically when you choose the V9 preset.

### Image Generation Upgrades
*   **Positive Prefix Box:** Insert global tags (such as `score_9`, `masterpiece`) at the beginning of your prompt before ComfyUI takes over.
*   **Smart LoRA Trigger Words:** Trigger words memorization for each of the 4 LoRA slots — selecting a LoRA will populate its trigger words.
*   **Random Seed Button:** A dice symbol near the Seed input that sets it to -1 (random).

### NPCs Bank Improvements
*   **Ignore List:** Names that you don't want the AI to extract or create dossiers of.
*   **Max Injection Limit:** A slider that caps the number of NPCs that the extension will inject at once (by default: 3) to avoid bloating the context in busy scenes.
*   **Custom Injection Thresholds & Dynamic Blacklisting.**

### Side Panel
*   The Side Panel collects all of your active trackers — World State, NPC presence, story progress — and displays them in a neat sidebar panel next to your actual chat to keep it uncluttered. 

### Per-Chat Settings & Smart Branching
Your settings are now saved **per-chat**, not per-character — so the conversation with the same character can have completely different configuration. And if you travel back in your chat history, regenerate a message, or branch off to some point in the past, the extension cleans itself up automatically:
*   **Memory Pruning:** Future summaries that didn't happen yet will be cleared.
*   **NPC Cleanup:** The characters introduced in the future timeline will be removed from the NPC Bank.
*   **Story Director Reset:** Traveling to the past before creating a story plan will reset the director's settings to make it create a new one.
*   **Branch Inheritance:** New branch inherits all the settings from the parent chat automatically.

### UI
*   **Mobile Drawer System:** A hamburger menu and a sliding drawer for mobile users.
*   **Global Settings Menu:** Prompt Payload Preview and Disable Utility Prefills moved to a dedicated gear icon in the top action bar.
*   **Precooked Styles Edit:** You can edit the precooked styles now.
*   **Compact World State:** Compact Mode will make the AI generate only a micro-dash of lore (Time, Location, Clothes, Posture) with every reply, except once in X.
*   **Export/Import** for NPC Bank and Memory Core.

### Under the Hood
*   **Future Data Pruning:** Traveling back in the chat will prune future data from Memory Core, NPC Bank, and Story Director.
*   **TF-IDF Caching:** The keywords are calculated once per turn and reused in Memory Vault, NPC Bank, and Image Generator — huge performance boost.
*   **O(K×V) Vector Math Optimization:** Document frequency calculations done in a single pass instead of nested loops.
*   **Direct-to-Vault Bypass:** Old messages that were not summarized will bypass the AI summary step and save straight to Vault — saving thousands of tokens.
*   **Memory Core Optimization:** 100 times faster than previous generations. Will save inside chat file now instead of `settings.json` (fixes lag on weaker hardware).

---

## 🌟 Core Features

### The V9 Presets
The V9 preset family represents the peak of the narrative presets' development in the history of Megumin Suite. Each preset was redesigned from the ground up with the philosophy of brutal realism, advanced character psychology, and a world that does not revolve around the player.

*   **V9 Mirage** ⭐ — The gold standard. Provides realistic character psychology, dynamic scene modes (Storytelling, Tension, Harsh Reality, Intimacy, Mundane, Comedy, NSFW), the narrator that lives inside the characters, and the rules of world-building that value specificity over vagueness. Every NPC has a life, a history, a wound, and an agenda. The world says no when it should.
*   **V9 Xin** — A stylistic alternative preset with its own style of voice and rhythm. For those who want something else. Covers all of the above in a different storytelling style.
*   **V9 Kuromaku** — A hybrid writer-room preset. Six specialists (NORA, ANVIL, OPUS, JULIA, MIKI) each do their job — continuity, psychology, plot architecture, prose, and dialogue — with the V9 philosophy driving the creative process. Has a built-in Story Engine with arc structures, event generation, foreshadowing, and NPC agendas as plot fuel.
*   **V9 Cui** — A light version of Mirage. Same philosophy, same scene modes, same narrator philosophy — but works with less context.

> 📝 **Note:** V9 Xin and V9 Kuromaku come with their own writing styles and **do not support** custom Writing Styles. V9 Mirage and V9 Cui support all Writing Styles.

> 📝 **Note:** V8 presets (Obsidian, Spark, Fusion) are still available in the extension for those who prefer them. V9 is just the new generation of presets.

### Automated NPC Bank
A persistent character database that tracks every NPC accurately across sessions.
*   **Auto-Extraction:** When a significant NPC is introduced, the AI writes a detailed dossier and saves it to the bank.
*   **Detailed Dossier Template:** NPCs include **Role**, **Where to Find Them**, **Voice** (how they speak), **Image Tags** (Booru tags for ComfyUI), **Read on the PC** (what the NPC thinks of the player), **Tiered Secrets** (semi-public → private → buried), and **Canon Lock** (immutable facts). Strict trigger conditions ensure dossiers are only generated for characters who are Named, Voiced, and Staked.
*   **Dynamic Injection:** Scans your last 4 messages and injects relevant NPC dossiers into the prompt.
*   **Ignore List & Max Injection Limit:** Blacklist names and cap injected NPCs to prevent bloat.
*   **Image Tags Only Mode:** Per-NPC toggle to hide the text dossier (saving tokens) while keeping Booru tags available for ComfyUI.
*   **OOC Trigger:** Only injects the blank dossier template when you mention "NPC" or "dossier" in your message.
*   **Scan Story:** Manually scan your entire chat history and extract all significant NPCs at once.
*   **AI Portrait Studio:** Have ComfyUI auto-generate a character portrait based on the AI's physical description.
*   **Export/Import:** Transfer your NPC data between chats.

### Advanced Chain of Thought (CoT)
Manually control the AI's internal reasoning before text generation.
*   **Master Toggle:** Enable/Disable CoT.
*   **Auto-matching:** Selecting any V9 preset automatically sets your CoT to the matching V9 framework.
*   **5 New V9 CoT Frameworks:** Purpose-built reasoning chains for each V9 preset (Core, Lite, Director, Immersion, and a Hybrid variant).
*   **Legacy CoT:** V7, V7.5, V8, and V8 Fusion CoT frameworks are still available.

### Image Gen Kazuma (ComfyUI)
Hook up your own ComfyUI instance to generate images on the fly during roleplay.
*   **Inline Mode:** Images displayed directly in text with individual retry buttons.
*   **Gallery Mode:** Images appear as individual galleries (the default).
*   **Prompt Templates:** 6 templates (Illustrious/Z Image × POV/Cinematic/Portrait) with full rules and examples.
*   **Positive Prefix Box:** Insert global tags at the start of every prompt.
*   **Smart LoRA Trigger Words:** Saved trigger words auto-populate when you select a LoRA.
*   **Multi-Image Creation:** 1–4 images per AI reply.
*   **Inject NPC Tags:** Auto-insert saved NPC Booru tags when relevant NPCs are in the scene.
*   **LoRA Lab & Parameters:** Fine-tune Steps, CFG, Denoise, and 4 LoRA slots.

> 📖 **New to ComfyUI?** Follow this step-by-step setup guide: [How to Setup Inline Image Generation in Megumin Suite](https://www.reddit.com/r/SillyTavernAI/comments/1u87agq/tutorial_how_to_setup_inline_image_generation_in/)

### Dynamic Ban List (AI Slop Detector)
Fed up with the AI repeating the same tired phrases?
*   **Analyze Chat:** Let the AI scan your last 50 messages and find the most common crutch phrases.
*   Turns them into hard bans automatically.
*   **Import/Export** ban list as JSON.

### Story Director
*   **Director's Console:** Full UI with Content Rating, Pacing, Genre, Flavor Tags, Director's Notes, and Unrestricted Content toggle.
*   **Auto-Evolution:** The AI secretly evaluates story progress and evolves the plot forward when the current beat concludes naturally.
*   **Evolve Button:** Manually evolve the current story directive based on recent events.
*   **Context Awareness:** Reads both User and AI messages with configurable analysis depth (Last 100 Messages or Full Chat History).
*   **World State Tracker:** Dynamic collapsible panel with Compact Mode option — full lore block every X replies, 30-token Micro-Dash the rest of the time.

### Memory Core (3-Tier Context)
Keep track of the story without burning tokens on bloated context windows.
*   **Working Memory:** The most recent conversation logs.
*   **Short-Term Memory:** Auto-generated summaries of previous message chunks.
*   **Long-Term Vault (Vector DB):** Uses **TF-IDF Keyword Matching** or **SillyTavern's Semantic Embeddings** to retrieve relevant archived memories.
*   **Prompt Interceptor:** Automatically strips archived messages from the prompt, saving thousands of tokens.
*   **Configurable Chunk Size:** 10–40 messages per chunk.
*   **"Every Reply" Auto-Trigger:** Enable automatic memory retrieval on each AI reply.
*   **Export/Import:** Transfer memory data between chats.
*   **100x Faster:** Completely rewritten for performance. Saves inside chat files instead of `settings.json`.

### Fully Editable Prompts
Every subsystem includes an **"Advanced: Edit Prompts"** panel:
*   Customize system prompts, user task prompts, thinking instructions, and injection templates for **Story Director**, **Ban List**, **Image Generation**, **Memory Core**, and **NPC Bank**.
*   Each editor has an enable/disable toggle — disabled means defaults are used.
*   Custom prompts are saved per-character/per-group profile.

---

## ⚙️ Installation

1. Open SillyTavern.
2. Go to the **Extensions** menu (the block icon).
3. Click **Install Extension**.
4. Paste the repository URL:
   ```text
   https://github.com/Arif-salah/Megumin-Suite
   ```
5. Refresh SillyTavern.
6. Download the JSON files from this repo: https://github.com/Arif-salah/Megumin-Suite/tree/main/Presets
> ⚠️ **Note:** If you download these on your phone and your browser renames them to `.json.txt`, you **must** use a file manager to rename them and delete the `.txt` part. Furthermore, make sure the Engine file is named EXACTLY `Megumin Engine.json` before you import it. The Suite file's name doesn't matter, but the Engine must be exact.
7. Open SillyTavern, go to the **AI Response Configuration** tab.
8. Click the **Import Preset** button (the little folder with an arrow) and upload the JSON files.
9. Once imported, open your preset dropdown and **make sure "Megumin Suite" is the active preset.** The extension handles the Engine silently in the background.

Or just watch the **Install video:** [YouTube Video](https://www.youtube.com/watch?v=Q-iaz9mBFrA)

> **💡 Pro Tip:** V9 ships with a **universal preset** that works across all major models — Claude, Gemini, DeepSeek, GLM, Gemma you name it. Just use the default one and you're good to go. There is a separate **V9 Gemini** preset available, but it's only recommended if you're running into specific issues with Gemini. The universal preset is still the recommended choice even for Gemini.

> ⚠️ **Important:** Megumin Suite ships with several **Regex scripts** that clean and format messages before they're sent to the AI. After installing, go to the **Extensions → Regex** panel and **make sure all Megumin-related regex entries are enabled**.

---

## 🕹️ Quick Start Guide

<div align="center">
  <img src="Screenshots/Screenshot1.png" alt="Screenshot 1" width="200">
  <img src="Screenshots/Screenshot2.png" alt="Screenshot 2" width="200">
  <img src="Screenshots/Screenshot3.png" alt="Screenshot 3" width="200">
  <img src="Screenshots/Screenshot4.png" alt="Screenshot 4" width="200">
</div>

1. **Pick a Preset:** Open the Megumin Suite menu (wand icon) and choose a preset. **V9 Mirage** is the recommended choice for the best experience.
2. **Set your Style:** Go to the Writing Style tab. V9 Default is applied automatically for Mirage and Cui. Customize it or pick from precooked styles.
3. **Enable CoT:** Go to the Chain of Thought tab — it's enabled by default and auto-matches your preset.
4. **Chat!** The extension handles all prompt injection, formatting, and memory management silently in the background.

> **💡 Pro Tip:** If you want to see exactly what Megumin Suite is sending to the AI under the hood, enable **Prompt Payload Preview** in the Global Settings menu (gear icon in the top action bar).

---

## 🛠️ Troubleshooting & Tips

*   **Does this extension mess with my other presets?** No — your other presets work just fine. Megumin Suite only injects its rules into its own designated preset. Your existing presets remain completely untouched.
*   **Vector Storage (Optional):** If you're using Semantic Embeddings in the Memory Core, you can change the model — it's `Cohee/jina-embeddings-v2-base-en` by default. If that's too heavy for your PC, use `Xenova/all-MiniLM-L6-v2`. Change it inside `sillytavern/config.yaml`.
*   **Old Versions:** Legacy docs are available here: [V4](https://github.com/Arif-salah/Megumin-Suite/tree/V4.1) • [V5](https://github.com/Arif-salah/Megumin-Suite/tree/V5) • [V6](https://github.com/Arif-salah/Megumin-Suite/tree/V6) • [V7](https://github.com/Arif-salah/Megumin-Suite/tree/V7)

---

## 🤝 Credits & Acknowledgements

*   Built natively for [SillyTavern](https://github.com/SillyTavern/SillyTavern).
*   MVU Compatibility integration inspired by [KritBlade's MVU Game Maker](https://github.com/KritBlade/MVU_Game_Maker).
*   Side Panel implementation thanks to **Luka**.

---

## 💜 Donators — Thank You!

Megumin Suite is free and always will be. These amazing people chose to support the project and help keep it going. Every bit of support genuinely means the world — thank you. 🙏

| | Name |
|---|---|
| 🛡️ | **ILLOGICAL** |
| 🛡️ | **Antivash** |
| 🛡️ | **KritBlade** |
| 🛡️ | **Luka** |
| 🛡️ | **Rokubi No Kitsune** |

Every dollar helps keep updates coming and the coffee flowing. You all are legends.

---

<div align="center">

### 💜 Support the Project

Megumin Suite is free and always will be. If it saved you hours of prompt engineering or made your sessions better, consider tossing a few bucks — it keeps development alive and the updates coming.

💳 **PayPal:** `arifsalah10@gmail.com`
🪙 **Crypto (LTC):** `LSjf1DczHxs3GEbkoMmi1UWH2GikmXDtis`

⭐ *Not in a position to donate? Starring the repo and sharing it helps just as much.*

</div>
