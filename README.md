

# 💥 Megumin Suite v4.1 - Dev Mode And Bug fixes

---

**Hello. Kazuma here.**

So, you know how every single time you switch between RPs in SillyTavern, you spend like 10 minutes fiddling with your system prompt, toggles. just to download new card and start the process again. And let's be real General presets are so limited telling the ai a tag or a genre is not the same as building a full prompt Specifically for that RP. I got so unbelievably tired of that I built an entire extension to never deal with it again.

Introducing Megumin Suite — the first SillyTavern preset that basically configures itself. You open a chat, click a button, pick some stuff from a pretty menu, and the Suite does the rest. Every character gets their own saved profile. Switch between your gritty dark fantasy campaign and your cozy slice-of-life RP? Boom. Already configured. Both of them. Separately. Without you touching a single prompt.

Your time should go into the Story, not into menu hell. I did the boring nerd stuff so you don't have to. You're welcome btw.

---

## 🚀 What's New in v4.1?
*   **Mobile UI Overhaul:** Mobile users, your UI is fixed. No more cut-off menus at the bottom of your screen. The sidebar is now a sleek, horizontally scrollable top bar that perfectly fits your phone.
*   **Developer Mode:** Added a purple "Dev" button that lets you view and edit the raw prompt blocks on a per-character basis.
*   **Lorebook Integration:** The Megumin Engine now reads active Lorebooks! If your character relies heavily on lore instead of their main description, the "Generate Insights" button will now actually see it and generate accurate style tags.
*   **Insight Bug Dead:** Fixed the issue where clicking "Generate Insights" would rudely reply *"give me character description"* instead of working.
*   **Language-Based CoT:** Chain of Thought is no longer locked to specific model names. It is now categorized by Language (English, Arabic, Spanish, etc.), which completely fixes the Arabic thinking translation issue.
*   **Thinking Hide Script:** Added a toggle in Regex to completely hide the AI's thinking process from your screen if you don't even want it in a collapsible box.

---

## 📥 Installation

1. Go to SillyTavern **Extensions** → **Install Extension** → Paste this repo URL.
2. Download the two JSON files from this repo: `Megumin Suite V4.json` and `Megumin Engine.json`.
https://github.com/Arif-salah/Megumin-Suite/tree/main/Presets

![Screenshot 1: The Files](./Screenshots/1.png)

> ⚠️ **MOBILE USERS CRITICAL STEP:** If you download these on your phone and your browser renames them to `.json.txt`, you **must** use a file manager to rename them and delete the `.txt` part. Furthermore, make sure the Engine file is named EXACTLY `Megumin Engine.json` before you import it. The Suite file's name doesn't matter, but the Engine must be exact.

3. Open SillyTavern, go to the **API Connections** tab (the plug/sliders icon).
4. Click the **Import Preset** button (the little folder with an arrow) and upload BOTH files.

![Screenshot 2: Import Button](./Screenshots/3.png)

5. Once imported, open your preset dropdown and **make sure "Megumin Suite V4" is the active preset.** The extension handles the Engine silently in the background.

![Screenshot 3: Active Preset](./Screenshots/4.png)

---

## 🪄 How to Use It (The Magic Wand)

Open any chat and look in the top right corner. See the magic wand? Click it.

![Screenshot 7: Magic Wand](./Screenshots/6.png)

This opens the Workflow Builder. It autosaves per-character. A few important notes on using it:

### Stage 1: System Mode
*   **V4 Balance ⭐** — Truth in human behavior. NPCs react proportionally. No simping, no needless hostility.
*   **V4 Cinematic** — The AI is the director. It pushes the plot and introduces drama.
*   **V4 Dark** — Balance but harsher. No narrative protection.

### Stage 2: Personality & Toggles
*   Pick the **Engine (Recommended)** for pure mechanical precision, or the Director/Megumin if you want the system to have a personality.
*   Toggle OOC commentary or User Control restrictions.

### Stage 3: Writing Style
*   Select tags (Gothic, Slow-Burn, Purple Prose, etc.).
*   Click **Generate Insights** to have the AI scan your character card (and lorebooks!) to suggest the perfect tags.
*   Click **Generate Writing Rule** to compile them into a permanent prompt directive.

### Stage 4: Add-ons & Language
*   Toggle lethal combat, permanent death systems, and dialogue colors.
*   **Language Output:** Type a language here if you want the AI to narrate the story in a specific language (Arabic, Spanish, French, etc.).
*   **User Gender:** Force the AI to use your proper pronouns.

### Stage 5: Format Blocks & Auto-Summary
Pick what gets appended to the end of the AI's messages (Info block, Summary block, CYOA).

> 💾 **How to Configure the Summary Block Depth:**
> If you want to change how often the summary updates or how deep into the chat it reads:
> 1. Go to the **Extensions** tab -> **Regex**.
> 2. Find the `summary cleanup` script.
> 3. Edit the **Min Depth** and **Max Depth** sliders.
> 
<p align="center">
  <img src="./Screenshots/5.png" width="32%" />
  <img src="./Screenshots/5.1.png" width="32%" />
  <img src="./Screenshots/5.2.png" width="32%" />
</p>

### Stage 6: Chain of Thought (CoT) Language
Select what language the AI uses *inside its hidden `<think>` tags*. 

> 🗣️ **The "Two Languages" Rule:**
> Setting Stage 6 to Spanish *only* makes the AI think in Spanish. If you want the AI to actually narrate the story to you in Spanish, you **must** also set the Language Output in Stage 4!

---

## 💻 Developer Mode & Custom Prompts

### 1. The Dev Mode UI
At the bottom of the Suite, there is a purple **Dev** button. Clicking this exposes the raw prompt code for the entire profile. 

![Screenshot 9: Dev Mode UI](./Screenshots/8.png)

*   You can rewrite any block of the prompt manually. 
*   **You must click "Save Override"** to lock in your changes. The box will glow Gold and say "MODIFIED".
*   If you mess up, click **"Restore Default"** to wipe your custom edit and pull the original pristine prompt back.
*   **Saves Per Character:** If you do this while chatting with a character, it *only* applies to them. If you do this with no character selected (Modifying Global Default), every *new* character you talk to will inherit your custom code.

### 2. Injecting Global "House Rules" (Add Your Custom Prompt Here)
If you have global lore, formatting rules, or "House Rules" that you want injected into *every single chat* without having to mess with the UI or Dev Mode, I left a specific spot for you.

1. Go to the SillyTavern **API Connections** tab.
2. Select the **Megumin Suite V4** preset.
3. Scroll down through the prompt blocks until you see the toggle: 
   `<!-- Add Your Customer prompt here -->`
4. Paste your rules directly below that line. They will safely inject into every RP without breaking the Suite's formatting.

---

## ⚠️ FAQ & Troubleshooting

**Q: I'm getting a "Chat Completion API Error" / Provider Returned Error.**
I test exclusively on Official APIs. Some models (like Gemini) need "Prefill" enabled. Some models (like Claude) **hate it** and will throw an error if you leave it on. If you are using local OpenAI-compatible APIs (like Ollama), disabling Prefill is usually required. Look for the Prefill toggle in your preset settings and flip it!
![Screenshot 8: Prefill Toggle](./Screenshots/7.png)

**Q: Global Defaults vs Character Profiles?**
If you open the Suite WITHOUT a character selected, you're editing the **Global Default**. Any new character you start chatting with inherits this. If you open the Suite WITH a character selected, you're editing **that specific character's profile**. 

**Q: Does this work with group chats?**
It is heavily optimized for 1-on-1 RP right now. Group chat support is planned for the future.

---

**Need more help?**
Drop into my Discord server: https://discord.gg/wynRvhYx

*Now go RP. Stop reading READMEs. Shoo.*
