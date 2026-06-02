<div align="center">

<!-- Replace with your actual banner image -->
<img src="Screenshots/banner.png" alt="Megumin Suite Banner" width="100%">

[![SillyTavern](https://img.shields.io/badge/SillyTavern-1.12%2B-blue.svg?style=for-the-badge&logo=codeigniter)](https://github.com/SillyTavern/SillyTavern)
[![Version](https://img.shields.io/badge/Version-V7-green.svg?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-purple.svg?style=for-the-badge)](https://creativecommons.org/licenses/by-nc-nd/4.0/)

> *"Everything your preset should have been: persistent memory, chain-of-thought reasoning, automated NPC tracking, and ComfyUI image generation in a single install."*

**Megumin Suite** is a full-stack overhaul to how SillyTavern presets work. It replaces your prompt engineering, your memory system, your NPC management, and your image pipeline — all in one extension. V7 adds advanced **Vector Memory**, automated **NPC Tracking**, and a strict **5-Phase Chain of Thought** reasoning framework.

[Features](#-core-features) • [Installation](#%EF%B8%8F-installation) • [The V7 Engine](#the-v7-engines) • [Memory Core](#-memory-core-3-tier-context) • [Image Gen](#image-gen-kazuma-comfyui)

</div>

---

## 🚀 What's New in V7?

The V7 update is a ground-up rewrite featuring a  massive token savings, and advanced contextual awareness.

*    **V7 CoT Framework:** A structured 5-phase reasoning system that makes the AI build ground truth, map NPC knowledge, and self-correct before writing a single word.
*    **Memory Core (3-Tier Context):** Automatically summarizes old messages and pushes them into a Vector Database (LanceDB). Intercepts and scrubs them from the prompt payload to save massive amounts of tokens.
*    **Automated NPC Bank:** The AI detects new characters, writes dossiers on them, saves them, and injects them back into the prompt only when relevant. It even auto-generates ComfyUI portraits for them!
*    **Modular Engine Toggles:** Turn off specific engine behaviors (like Cultural Anchoring or OOC protocols) without breaking the core logic.

---

## 🌟 Core Features

###  The V7 Engines
Choose the core ruleset that drives your world's logic and tone.
*   **V7 Core:** Grounded, cinematic, and patient. Scales with scene density and matches prose to content. The perfect middle ground.
*   **V7 Reality:** Full simulation mode. No plot armor. Strict physical laws. Consequences are real and persistent.
*   **V7 Gentle:** A softer, quieter, and more atmospheric pacing. Focuses on immersion, mood, and lingering emotions.

###  Memory Core (3-Tier Context)
Never lose track of the story, and stop wasting tokens on massive context windows.
*   **Working Memory:** The immediate chat history.
*   **Short-Term Memory:** Background-generated AI summaries of previous chunks.
*   **Long-Term Vault (Vector DB):** Uses **TF-IDF Keyword Matching** or **Native SillyTavern Semantic Embeddings** to silently fetch archived memories and inject them into the prompt only when relevant.
*   **Prompt Interceptor:** Physically wipes archived messages from the prompt payload saving thousands of tokens.

###  Automated NPC Bank
A persistent character database that tracks every NPC accurately across sessions.
*   **Auto-Extraction:** When a significant NPC is introduced, the AI writes a "dossier" (Name, Appearance, Inner Circle, Hidden Layers, Agenda) and saves it to the bank.
*   **Dynamic Injection:** Scans your last 4 messages and injects relevant NPC dossiers into the prompt so the AI remembers them accurately.
*   **AI Portrait Studio:** Click a button to have ComfyUI automatically generate a character portrait based purely on the AI's physical description of them.

###  Advanced Chain of Thought (CoT)
Control the AI's internal reasoning process before it outputs text.
*   **The 5-Phase Audit:** *Ground Truth ➔ Plot Engine ➔ Scene Design ➔ Active Draft ➔ Correction Loop*.
*   **Knowledge Firewall:** Forces the AI to trace *how* an NPC knows something, preventing them from mind-reading the user's internal narration.
*   **Gemini Thinking:** A special toggle that injects triple `<think>` tags to bypass Google's strict reasoning refusal filters.
> ⚠️ **Note:** if you enable Gemini Thinking navigate to 'AI Response Formatting', 'Reasoning', activate 'Auto-Parse', and set the Prefix to `<think>` and Suffix to `</think>`.

###  Image Gen Kazuma (ComfyUI)
Seamlessly wire up your local ComfyUI server to generate images while you play.
*   **Auto-Trigger:** The AI decides when a moment is "picture-worthy" and outputs a hidden image tag, triggering ComfyUI in the background.
*   **Overswipe Regeneration:** Simply swipe right on the last image in a gallery to instantly regenerate the prompt.
*   **LoRA Lab & Parameters:** Full control over Steps, CFG, Denoise, and 4 LoRA slots directly inside SillyTavern.

###  Dynamic Ban List (AI Slop Detector)
Tired of the AI saying *"a shiver ran down your spine"* or *"testament to..."*?
*   Click **Analyze Chat** to have the AI scan your last 50 messages and identify the top 5 repetitive crutch phrases it's using.
*   Automatically converts them into strict negative rules and bans them from future generations.

###  Story Planner &  Blocks
*   **Story Planner:** Brainstorms and tracks 10+ future plot milestones in the background.
*   **World State Tracker:** Injects a collapsible dashboard tracking the date, weather, PC's physical state, and NPC agendas.
*   **NPC Inner Chatter:** Forces the AI to output a hidden block of dialogue showing what the NPCs are *actually* thinking behind their masks.

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
6. Download the JSONs files from this repo: https://github.com/Arif-salah/Megumin-Suite/tree/main/Presets
> ⚠️ **Note:** If you download these on your phone and your browser renames them to `.json.txt`, you **must** use a file manager to rename them and delete the `.txt` part. Furthermore, make sure the Engine file is named EXACTLY `Megumin Engine.json` before you import it. The Suite file's name doesn't matter, but the Engine must be exact.
7. Open SillyTavern, go to the **Ai  Response configuration** tab.
8. Click the **Import Preset** button (the little folder with an arrow) and upload the json files.
9. Once imported, open your preset dropdown and **make sure "Megumin Suite" is the active preset.** The extension handles the Engine silently in the background.


or just watch the **Install video:** [youtube Video](https://www.youtube.com/watch?v=Q-iaz9mBFrA) 


> **💡 Pro Tip:** - Megumin Suite V7 DS4 is for Deepseek or GLM and Similar models.
                      - Megumin Suite V7 Gemini is for gemini models.
if you have model not here just try.

> ⚠️ **Important:** Megumin Suite ships with several **Regex scripts** that clean and format messages before they're sent to the AI. After installing, go to the **Extensions → Regex** panel and **make sure all Megumin-related regex entries are enabled**.

---

## 🕹️ Quick Start Guide

<div align="center">
  <img src="Screenshots/Screenshot1.png" alt="Screenshot 1" width="200">
  <img src="Screenshots/Screenshot2.png" alt="Screenshot 2" width="200">
  <img src="Screenshots/Screenshot3.png" alt="Screenshot 3" width="200">
  <img src="Screenshots/Screenshot4.png" alt="Screenshot 4" width="200">
</div>

1. **Select an Engine:** Open the Megumin Suite menu (wand icon) and pick a Core Engine (e.g., **V7 Core**).
2. **Set your Style:** Go to the Writing Style tab. Choose a precooked style like *Sensory-Rich* or use the AI to generate a custom one.
3. **Enable CoT:** Go to the Chain of Thought tab and select **V7 CoT** (highly recommended for complex logic).
4. **Enable Memory Core (Optional but Recommended):** Go to Tab 10, enable the Memory Core, and click **Apply & Extract Pending**.
5. **Chat!** The extension will handle all prompt injection, formatting, and memory management silently in the background.

> **💡 Pro Tip:** If you want to see exactly what Megumin Suite is sending to the AI under the hood, enable **Prompt Payload Preview** in the Global Settings tab.

---

## 🛠️ Troubleshooting & Tips


*   **LLMs:** Designed for highly capable instruction-following models (Claude 4.6 Sonnet/Opus, DeepSeek v4, Gemini 3.1 pro/flash, GLM 5.1). Smaller local models may struggle with the strict V7 CoT instructions.
*  **Does this extension mess with my other presets?** No — your other presets will work just fine. Megumin Suite only injects its rules into its own designated preset (Megumin Suite). Your existing presets remain completely untouched.
* **Vector Storage (Optional):** if you using Semantic Embeddings in the Memory Core, you can change the model its  Cohee/jina-embeddings-v2-base-en by default if it heavy for your pc use Xenova/all-MiniLM-L6-v2 you can change it inside  "sillytavern\config.yaml"
* **Old Versions:** Legacy docs are here: [Megumin Suite v4 Legacy Readme](https://github.com/Arif-salah/Megumin-Suite/tree/V4.1)  [Megumin Suite v5 Legacy Readme](https://github.com/Arif-salah/Megumin-Suite/tree/V5) [Megumin Suite v6 Legacy Readme](https://github.com/Arif-salah/Megumin-Suite/tree/V6)

---

## 🤝 Credits & Acknowledgements

*   Built natively for the [SillyTavern](https://github.com/SillyTavern/SillyTavern).
*   MVU Compatibility integration inspired by [KritBlade's MVU Game Maker](https://github.com/KritBlade/MVU_Game_Maker).

---

<div align="center">

### 💜 Support the Project

Megumin Suite is free and always will be. If it saved you hours of prompt engineering or made your sessions better, consider tossing a few bucks it keeps development alive and the updates coming.

🪙 **Crypto (LTC):** `LSjf1DczHxs3GEbkoMmi1UWH2GikmXDtis`

⭐ *Not in a position to donate? Starring the repo and sharing it helps just as much.*

</div>
