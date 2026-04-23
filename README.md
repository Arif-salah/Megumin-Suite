![Nexa Screenshot](./img/default1.png)
# 💥 Megumin Suite V6 for SillyTavern

**The Ultimate Automated Prompt Management, Writers' Room & Roleplay Configuration Engine.**

Megumin Suite completely revolutionizes how you manage your preset prompts, writing styles, and AI behavior in SillyTavern. No more manually toggling prompts on and off every time you switch from a gritty dark fantasy to a lighthearted romance. The engine automatically generates optimized rules tailored to your exact preferences, applying them dynamically on a **per-character basis**.

---

## 🤔 Why Do You Need Megumin Suite?

Before Megumin Suite, changing how the AI writes — its length, its tone, the narrator's perspective — meant manually editing text boxes and swapping presets every single time. Megumin Suite automates all of that through a sleek wizard GUI.

* **Global Defaults vs. Custom Profiles:** Set a "Global Default" configuration for all new chats. The moment you tweak a setting inside a specific character's chat, the ext creates an isolated **Custom Character Profile** that only affects *that* character, leaving your other roleplays untouched.

---

## 🌟 The V6 Flagship: The "Dream Team" Engines

The headline feature of V6 is the **V6 Dream Team** preset. Instead of just giving the AI a flat list of rules, this engine forces the model to operate as a 5-person collaborative writers' room. Each "specialist" has a very specific job, ensuring unprecedented narrative consistency, psychological realism, and lore tracking.

### Meet the Team:
* 🎬 **NORA (The Director & Continuity):** Monitors rule adherence and tracks narrative consistency. She initiates and concludes every interaction with a strict quality check to ensure player autonomy isn't stolen.
* 🧠 **ANVIL (The Psychologist):** Determines character motivations, fears, and emotional histories. He prioritizes psychological accuracy over plot convenience—meaning NPCs won't just blindly agree with you anymore.
* 🏗️ **OPUS (The Story Architect):** Manages pacing, stakes, and narrative branches. Ensures outcomes are derived from player choices without railroading the story.
* 🖋️ **JULIA (The Prose Stylist):** Authors all non-spoken descriptions. She utilizes an atmospheric, non-neutral voice and aggressively avoids standard AI-slop language.
* 💬 **MIKI (The Dialogue Specialist):** Drafts NPC speech. She implements verbal tics, subtext, and era-appropriate vocabulary to reflect actual emotional states.

**V6 Dream Team Lite:** A streamlined version designed for local models and smaller context windows. It compresses the workflow to roughly 700 tokens while maintaining the core narrative rules!

*(Note: V5 Slice of Reality and V4 Cinematic/Dark are still fully available in the engine selection!)*

---

## 🛠️ The Dev Mode

Say goodbye to messy text files. Megumin Suite V6 introduces a full **Dev Mode Builder**.
* **Create & Clone:** Build your own chronological AI logic flows from scratch, or clone an existing template (like V4 Balance or V5 Slice of Reality) to modify it.
* **Custom Modules:** Add, edit, and rearrange custom injection blocks exactly where you want them.
* **Import & Export:** Save your custom engines and export them as `.json` files to share with others!

---

## 🗺️ The Story Planner

The new **Story Planner tab**. 
* It analyzes your recent chat history and brainstorms a menu of 10 medium-to-long-term plot milestones (Arcs, Chapters, Episodes).
* It automatically injects these possibilities into the AI's context (`[[storyplan]]` and `[[storytracker]]`), allowing the AI to naturally steer the story toward actual narrative goals instead of just reacting to your last message.
* **Auto-Trigger:** Set it to run automatically every X messages, or trigger it manually!

---

## 🎨 Complete Writing Style Overhaul

Stage 3 has been rebuilt from the ground up into a full **Style Library**.

* **Filter Bar:** Easily sort through your styles using the new filters: *All, Precooked, AI Generators, and My Library*.
* **Precooked Styles:** Instant, hardcoded narrative styles (like *Clinical & Objective* or *Sensory-Rich*) that cost zero API calls to generate. Just click and go.
* **Dialogue / Narration Ratio Slider:** Hate reading walls of text? Use the new slider to dynamically force the AI to favor spoken dialogue (e.g., 80% Dialogue / 20% Narration) or heavy description via the `[[DNRATIO]]` macro.

---

## 🔊 Cinematic Sounds & Animation

A brand new global setting that forces the AI to use precise **Onomatopoeia** (phonetic sound words like *click* or *thud*) instead of abstract descriptions.
* **Animate Sounds:** For highly capable models, you can enable a sub-toggle that forces the AI to wrap these sounds in HTML/CSS animation tags (like `<fade>` or `<slide>`), bringing your chat window to life!

---

## 📊 Live Token Counter & UI Upgrades

* **Modern UI:** The entire interface has been redesigned to be cleaner, faster, and perfectly responsive for both Mobile and Desktop.
* **Live Token Breakdown:** A real-time token counter sits at the top of your window. **Hover over it** to see a detailed breakdown of exactly how many tokens your Engine Core, CoT, Writing Style, and Add-ons are consuming.
* **Sync Tab Globally:** A new 1-click button allows you to apply the exact settings of your current tab to *every* character profile at once.
* **Fixed Position Button:** The main extension button is now fixed and anchored safely, preventing it from getting lost or disappearing off-screen on mobile devices.

---

## 🚫 Dynamic Ban List & Under The Hood

* **Disable Utility Prefills:** A new toggle in Global Settings. Turn this ON if your API (like Claude/Anthropic) errors out during Image Gen, Banlist, or Story Planner generation. It stops the engine from forcing an 'assistant' message prefill.
* **Garbage Collection:** The extension now automatically detects if a character has been deleted from SillyTavern and purges their ghost profile data to keep your settings file clean and fast.
* **CoT "Off" Fix:** Turning CoT off now properly strips all `<think>` tags, preventing the AI from getting stuck in a thinking loop.
* **Megumin Image Preset:** Added a specific preset option for manual image generation to get better, more creative ComfyUI prompt conversions.
* Fixed GLM API errors and NanoGPT generation bugs.

---

## 🤖 Recommended AI Models

For the best experience, use models with strong instruction-following and reasoning:

*  **Gemini 3.1 pro**
*  **Claude opus 4.6**
*  **GLM 5 and 4.7**
*  **Kimi k2.5** (Tested lightly, performs well)

*Megumin Suite is flexible, but weaker/smaller local models may struggle with the complex 5-man writers' room rules of V6. Use V6 Lite for local models!*

---

## ⚠️ Troubleshooting & Tips

* **Thinking Block Won't Close:** If `<think>` tags bleed into the chat, enable the **Think Bug Toggle** in your settings.
* **Generation Hanging / Formatting Issues:** Try **disabling "Prefill"** in the presets.
* **Does this extension mess with my other presets?** No — your other presets will work just fine. Megumin Suite only injects its rules into its own designated preset (`Megumin Suite`). Your existing presets remain completely untouched.
* **Old Versions:** Legacy docs are here: [Megumin Suite v4 Legacy Readme](https://github.com/Arif-salah/Megumin-Suite/tree/V4.1)[Megumin Suite v5 Legacy Readme](https://github.com/Arif-salah/Megumin-Suite/tree/V5)

---

## Install & Support

**Install Link:** [GitHub Repository](https://www.youtube.com/watch?v=Q-iaz9mBFrA)  
**Discord Community:** [https://discord.gg/gnbFRu9g](https://discord.gg/gnbFRu9g)

*(If you're coming from V4 or V5, your profiles will auto-migrate gracefully. Let me know in the Discord if you run into anything weird!)*

If you love the extension and want to support the countless hours of development:
* ☕ [Ko-fi (Buy me a coffee)](https://ko-fi.com/kasumaoniisan)
* 🪙 **Crypto (LTC)**: `LSjf1DczHxs3GEbkoMmi1UWH2GikmXDtis`

**Enjoy the ultimate SillyTavern roleplay experience with Megumin Suite V6.**
