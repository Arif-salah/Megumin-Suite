<div align="center">

<img src="Screenshots/banner.png" alt="Megumin Suite Banner" width="100%">

[![SillyTavern](https://img.shields.io/badge/SillyTavern-1.12%2B-blue.svg?style=for-the-badge&logo=codeigniter)](https://github.com/SillyTavern/SillyTavern)
[![Version](https://img.shields.io/badge/Version-V10-green.svg?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-purple.svg?style=for-the-badge)](https://creativecommons.org/licenses/by-nc-nd/4.0/)

> *"Everything your preset should have been: persistent memory, chain-of-thought reasoning, automated NPC tracking, and ComfyUI image generation in a single install."*

**Megumin Suite** is a full-stack overhaul to how SillyTavern presets work. It replaces your preset, your memory system, your NPC management, and your image generation — all in one extension.

V10 is based on the following principle: **there are no villains and there are no good guys.** Every action of every character is based on their morals and they believe they are the ones who are right, thus leaving the decision of whose side to be on not to the plot but to the characters' actions. Conflict arises because of conflicting interests, not the villain being evil. In addition, the world is **alive**: it goes on and does not wait for you. Hours pass, people perform their everyday deeds, something happens beyond your view and when you least expect it, comes back to haunt you.

This feature is present in both V10 engines. They just describe it differently. But in addition to it, V10 provides **Story Config** tab, where you can control the style of your story, and **Blocks**: every tracker in one single card below the reply.

[Features](#-core-features) • [Installation](#%EF%B8%8F-installation) • [The V10 Engines](#the-v10-engines) • [Blocks](#blocks) • [Memory Core](#memory-core-3-tier-context) • [Donate](#-support-the-project)

</div>

---

## What's New in V10?

### Two engines this time

V10 comes with two engines, not one. Two different kinds of writing, that's the whole difference. Neither of them is the lite version of the other. Test a few scenes in both and go with whichever one you like.

*   **V10 Ukiyo** – the storyteller. The one with less Restriction on the AI making it more Creative but may contain some ai-isms in it. That's the one I personally like.
*   **V10 Shura** – the director's cut. It cuts a little bit from the creativity but the writing is amazing. No slop, no ai telling.

**Co-writer version for both of them.** Same engine except the AI co-stars in your story as well. It analyses how *you* write and mimics your voice. Anything written by you remains canon and will never be rewritten, it won't create your backstory – the acting only.

**Enhanced Dialogue.** A feature available on the V10 engine card. Both engines know what good dialogue should be like and let the model take care of it, however, some models consider it a recommendation. The switch replaces it with the Strict one – an absolute rule to stop bad Dialogue.

**4 new CoT for V10.** One for each engine, plus a **Thinking Cap** version of each one for models that overthink everything. Same CoT but with a time limit on how long it thinks before it starts writing.

### Two presets now

*   **Megumin Suite V10 Universal** — the standard preset. Works with Claude, Gemini, DeepSeek, GLM, Gemma, or whichever AI you use. This is the recommended preset if you do not care about cache.
*   **Megumin Suite V10 Universal Cache Friendly** — the same content, but arranged in a way that allows your API to cache most of the prompt instead of re-analyzing the entire thing each time. Use this preset if your API gives you a discount for cached inputs (Claude, Gemini, and DeepSeek do). It will save you some tokens.

Both are packed together. Import the one you need and proceed.

> ⚡ **Faster too**. The regex was unoptimized and caused heavy lag in large stories. In the V10 version, the regex is optimized for maximum performance. Nothing has been changed in what it cleans, but it does its job faster.

### Story Configuration

It lives on the **Presets & CoT** tab.

Here you can adjust **how your AI behaves**. Do you want the fan-service scenario, where everybody loves you and everything goes perfectly? Then lower the difficulty, friction, NPC disposition — and here it is. Do you want it gritty, where people hate you because you exist? Adjust it accordingly. It is your choice and one dropdown menu away.

These are also your preferences. How long you want the response to be, what pace the story develops at, how explicit it is, how people interact with you. This is the ultimate configuration setting: set it once and use for the whole story.

All options available: **Genre**, **Culture &amp; Setting**, **Era**, **Point of View**, **Focus**, **Narration Tone**, **Narrator Presence**, **NPC Speech Style**, **NPC Disposition**, **Difficulty**, **Friction**, **Explicitness**, **Pace**, **Length**, and a free notes block. Leave empty for defaults.

*   **POV, Length and Pace are always included**. They come predefined (third person limited, flexible, steady) since every story has them. You can change it in the tab.

### Blocks

Before, every tracker was a separate block with its own tags and rules, and AI had to generate all of them one by one. This was a lot of unnecessary processing and token spend.

Now, the AI generates **a single giant block**. The extension takes that block, splits it into parts, and draws the entire UI itself: the tabs, cards, meters, colors, everything. **No UI drawing is happening on the AI side anymore.** So now you have a nicer-looking thing for fewer tokens.

**New BLOCKS tab** is where you set which blocks are included in the block stack, the order of them, and if each is **visible** or **hidden**. Hidden blocks still get generated by the AI and parsed and sent to the AI, but do not show up in the card. You can also create your **custom blocks** with your own tags and templates.

**Blocks are actual blocks now:**

*   **CYOA are buttons.** No more retyping the numbered list. Click the choice and it will drop into the message box for editing — *"Follow her out"* becomes *"Follow her out, but hang back at the door"* or just shift-click to send it as is.
*   **World State is a scene board.** Time, place, and weather on chips at the top, then cards with people on them with their outfit, positions and agendas. Mood is a colored pill, your own card is marked, and the threads, seeds and timers are below it along with the Arc and Scene phase.
*   **Secrets remain secret.** A Secret is something your character do not know, so it gets blurred until you hover or click it. Previously, all secrets were spoiled in plain sight.

**Two new blocks:**

*   **Bonds** — what every NPC feels about you: Mood, Affection, Trust, Desire with a reason attached whenever a number changes. One line per NPC.
*   **Character Sheet** — what your character carries and knows: HP, Stamina, Gold, Status, Skills, Inventory.
*   **Fields are yours.** Add any: Jealousy, Mana, Reputation, anything you want. Four field types — **meter** (rendered as a bar), **number**, **text**, **list**. Field packs (Romance, Rivalry, Social, RPG, Survival) **merge** your field list instead of replacing it to allow running multiple of them at the same time.

### True random dice

This is true random dice unlike the other presets, this one does not ask the AI to invent a number; **the extension rolls the die with a true random algorithm and sends the result into the prompt.**

*   **The roll comes before the Reply.** So the AI cannot choose a result that fits the story it already created.
*   **The numbers are checked.** If they do not match, the dice card will not be drawn.
*   **The dice gets its own tab** on the block card, with the rolling die showing the number.
*   **Dice: Everyone** — the same thing, but also rolls for NPCs. Everybody who tries something that can fail gets a dice, all of them listed before the reply start.

### Immersive HTML

When a character reads something — a phone screen, a letter, a sign, a receipt — the AI **renders the actual thing** instead of describing it.

### Npc bank auto update

NPC bank can update it self now and you can Customize it.


---

## 🌟 Core Features

### The V10 Engines

Two engines, two styles. Pick the one that sound like the story you want to read.

*   **V10 Ukiyo** ⭐ — The storyteller. Less Restriction on the AI so it get more Creative and it will surprise you more, but it may have some ai-ism on it. My personal pick.
*   **V10 Shura** ⭐ — The director's cut. It cut a little bit on the creativity but the writing is so good. Characters dont explain themselves, emotion break the speech, and every voice sound like its own person.
*   **V10 Ukiyo Co-writer** / **V10 Shura Co-writer** — Same engines with one line moved: the AI write your character too, matching how you actually write instead of only what your persona card say. Your own writing never get overwritten and your backstory stay yours.

> 📝 **The old engines are still there.** V9, V8, V7, V6 and the V4/V5 legacy ones are all still in the PRESETS tab, untouched. V10 is just the new generation.

### Blocks
Every tracker in one card under the reply with a tab for each one — World State, CYOA, NPC Inner Chatter, Bonds, Character Sheet, Story Tracker, New NPC dossiers, NPC updates and Dice. Pick which ones ride along, what order they come in, and if each one is shown or hidden, all in the **BLOCKS** tab. You can add your own with a custom tag and template.

> 📝 **Note (this fork):** The **Side Panel** is maintained by LukaTheHero. Every block the chat card can draw — including Bonds, Character Sheet, Choices, Dice, NPC updates and custom blocks — gets its own panel section, rendered by the same code as the card, so new blocks appear in the panel automatically.

### Automated NPC Bank
A persistent character database that tracks every NPC accurately across sessions.
*   **Auto-Extraction:** When a significant NPC is introduced, the AI writes a detailed dossier and saves it to the bank.
*   **Detailed Dossier Template:** NPCs include **Role**, **Where to Find Them**, **Voice** (how they speak), **Image Tags** (Booru tags for ComfyUI), **Read on the PC** (what the NPC thinks of the player), **Tiered Secrets** (semi-public → private → buried), and **Canon Lock** (immutable facts). Strict trigger conditions ensure dossiers are only generated for characters who are Named, Voiced, and Staked.
*   **Dossiers keep up with the story now.** Role, Read on the PC, Agenda and Secrets move as things happen, and only the change get sent, not a rewrite of the whole file. Appearance, Voice, Background and Canon Lock are written once and locked.
*   **Undo is on the card.** When a reply change an NPC that message get an **NPC Update** tab showing who changed, which field and how, and every line have its own undo.
*   **Make your own dossier fields.** Rename them, reorder them, change what the AI is told to put in them, or add your own. Removing a field never delete the text your NPCs already have under it.
*   **Dynamic Injection:** Scans your last 4 messages and injects relevant NPC dossiers into the prompt.
*   **Ignore List & Max Injection Limit:** Blacklist names and cap injected NPCs to prevent bloat.
*   **Image Tags Only Mode:** Per-NPC toggle to hide the text dossier (saving tokens) while keeping Booru tags available for ComfyUI.
*   **Scan Story:** Manually scan your entire chat history and extract all significant NPCs at once.
*   **AI Portrait Studio:** Have ComfyUI auto-generate a character portrait based on the AI's physical description.
*   **Export/Import:** Transfer your NPC data between chats.

### Advanced Chain of Thought (CoT)
Manually control the AI's internal reasoning before text generation.
*   **Master Toggle:** Enable/Disable CoT.
*   **Auto-matching:** Picking an engine set the matching CoT for you.
*   **4 V10 frameworks:** one per engine, each with a **Thinking Cap** version that cap how long the model think before it write.
*   **Legacy CoT:** V9, V8, V8 Fusion, V7.5 and V7 frameworks are all still there.

### Image Gen Kazuma (ComfyUI)
Hook up your own ComfyUI instance to generate images on the fly during roleplay.
*   **Inline Mode:** Images displayed directly in text with individual retry buttons.
*   **Gallery Mode:** Images appear as individual galleries (the default).
*   **The progress bar is real now.** It read the actual step count from ComfyUI — *Rendering Image... 17/40 (43%)*. Before it was just an animation that looked the same at step 1, at step 39, and when the server was dead.
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

> 📝 **On V10 you probably dont need it.** The engine drive the plot by itself. Turn the Director on when you want a hand on the wheel.

### Memory Core (3-Tier Context)
Keep track of the story without burning tokens on bloated context windows.
*   **Working Memory:** The most recent conversation logs.
*   **Short-Term Memory:** Auto-generated summaries of previous message chunks.
*   **Long-Term Vault (Vector DB):** Uses **TF-IDF Keyword Matching** or **SillyTavern's Semantic Embeddings** to retrieve relevant archived memories.
*   **Prompt Interceptor:** Automatically strips archived messages from the prompt, saving thousands of tokens.
*   **Configurable Chunk Size:** 10–40 messages per chunk.
*   **Export/Import:** Transfer memory data between chats.

> 📝 **Two things:** Memory Core is not cache friendly, so if you took the Cache Friendly preset for the billing this work against it. And use **Semantic Embeddings** with it, not TF-IDF.

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

> **💡 Which preset do i take?** V10 ship two and they are interchangeable. **V10 Universal** is the normal one and work on every model. **V10 Universal Cache Friendly** is the same thing reordered so your API can cache the prompt between turns — take this one if your API charge less for cached input, Claude and Gemini and DeepSeek all do. If you dont know or dont care, just take the normal one.

> ⚠️ **Important:** Megumin Suite ships with several **Regex scripts** that clean and format messages before they're sent to the AI. After installing, go to the **Extensions → Regex** panel and **make sure all Megumin-related regex entries are enabled**. If you are coming from V9 you **have to re-import the preset**, V10 ship a new regex that the block card need.

---

## 🕹️ Quick Start Guide

<div align="center">
  <img src="Screenshots/Screenshot1.png" alt="Screenshot 1" width="200">
  <img src="Screenshots/Screenshot2.png" alt="Screenshot 2" width="200">
  <img src="Screenshots/Screenshot3.png" alt="Screenshot 3" width="200">
  <img src="Screenshots/Screenshot4.png" alt="Screenshot 4" width="200">
</div>

1. **Pick an engine.** Open the Megumin Suite menu (wand icon) and pick one in the **PRESETS & COT** tab. **V10 Ukiyo** or **V10 Shura**, try both. The writing style and the CoT load with it automatically.
2. **Set your story rules.** Story Config is on the same tab. Genre, tone, POV, pace, explicitness, how hard the world push back. Anything you leave on *Preset default* just dont get sent.
3. **Pick your blocks.** In the **BLOCKS** tab, choose which trackers ride along and in what order. Start with 2 or 3.
4. **Chat!** The extension handles all prompt injection, formatting, and memory management silently in the background.

> **💡 Dont turn everything on.** Every add-on and every block cost the AI attention. Past 3 or 4 of them the prose get thin because the model is busy doing bookkeeping instead of writing. Pick the ones you actually read.

> **💡 Pro Tip:** If you want to see exactly what Megumin Suite is sending to the AI under the hood, enable **Prompt Payload Preview** in the Global Settings menu (gear icon in the top action bar).

---

## 🛠️ Troubleshooting & Tips

*   **Does this extension mess with my other presets?** No — your other presets work just fine. Megumin Suite only injects its rules into its own designated preset. Your existing presets remain completely untouched.
*   **Image Gen or Ban List or Story Director doing nothing on Claude?** Check **Utility Prefills** in Global Settings and turn it off. Thats the setting that break all three of them on Claude and few other APIs. It's off by default now but an old install can still have it on.
*   **Vector Storage (Optional):** If you're using Semantic Embeddings in the Memory Core, you can change the model — it's `Cohee/jina-embeddings-v2-base-en` by default. If that's too heavy for your PC, use `Xenova/all-MiniLM-L6-v2`. Change it inside `sillytavern/config.yaml`.
*   **Old Versions:** Legacy docs are available here: [V4](https://github.com/Arif-salah/Megumin-Suite/tree/V4.1) • [V5](https://github.com/Arif-salah/Megumin-Suite/tree/V5) • [V6](https://github.com/Arif-salah/Megumin-Suite/tree/V6) • [V7](https://github.com/Arif-salah/Megumin-Suite/tree/V7) • [V8](https://github.com/Arif-salah/Megumin-Suite/tree/V8) • [V9.1](https://github.com/Arif-salah/Megumin-Suite/tree/V9.1)

---

## 🤝 Credits & Acknowledgements

*   Built natively for [SillyTavern](https://github.com/SillyTavern/SillyTavern).
*   MVU Compatibility integration inspired by [KritBlade's MVU Game Maker](https://github.com/KritBlade/MVU_Game_Maker).
*   Side Panel implementation thanks to **Luka**.

---

## 💜 Donators — Thank You!

Megumin Suite is free and always will be. These amazing people chose to support the project and help keep it going. Every bit of support genuinely means the world — thank you. 🙏

<table>
  <tr>
    <td align="center" width="150">
      <img src="Screenshots/donators/antivash.png" width="90" height="90" alt="Antivash"><br>
      <sub><b>Antivash</b></sub>
    </td>
    <td align="center" width="150">
      <img src="Screenshots/donators/hibiki.png" width="90" height="90" alt="Hibiki"><br>
      <sub><b>Hibiki</b></sub>
    </td>
    <td align="center" width="150">
      <img src="Screenshots/donators/illogical.png" width="90" height="90" alt="ILLOGICAL"><br>
      <sub><b>ILLOGICAL</b></sub>
    </td>
    <td align="center" width="150">
      <img src="Screenshots/donators/kritblade.png" width="90" height="90" alt="KritBlade"><br>
      <sub><b>KritBlade</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="150">
      <img src="Screenshots/donators/larlya.png" width="90" height="90" alt="Larlya"><br>
      <sub><b>Larlya</b></sub>
    </td>
    <td align="center" width="150">
      <img src="Screenshots/donators/luka.png" width="90" height="90" alt="Luka"><br>
      <sub><b>Luka</b></sub>
    </td>
    <td align="center" width="150">
      <img src="Screenshots/donators/rokubi.png" width="90" height="90" alt="Rokubi No Kitsune"><br>
      <sub><b>Rokubi No Kitsune</b></sub>
    </td>
  </tr>
</table>

Every dollar helps keep updates coming and the coffee flowing. You all are legends.

---

<div align="center">

### 💜 Support the Project

Megumin Suite is free and always will be. If it saved you hours of prompt engineering or made your sessions better, consider tossing a few bucks — it keeps development alive and the updates coming.

💳 **PayPal:** `arifsalah10@gmail.com`
🪙 **Crypto (LTC):** `LSjf1DczHxs3GEbkoMmi1UWH2GikmXDtis`

⭐ *Not in a position to donate? Starring the repo and sharing it helps just as much.*

</div>
