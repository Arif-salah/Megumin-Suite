

# Megumin Suite for SillyTavern

---

**Hello. Kazuma here.**

So, you know how every single time you switch between RPs in SillyTavern, you spend like 10 minutes fiddling with your system prompt, toggles. just to download new card and start the process again.
And let's be real General presets are so limited telling the ai a tag or a genre is not the same as building a full prompt Specifically for that RP. I got so unbelievably tired of that I built an entire extension to never deal with it again.

Introducing **Megumin Suite** — the first SillyTavern preset that basically configures itself. You open a chat, click a button, pick some stuff from a pretty menu, and the Suite does the rest. Every character gets their own saved profile. Switch between your gritty dark fantasy campaign and your cozy slice-of-life RP? Boom. Already configured. Both of them. Separately. Without you touching a single prompt.

Your time should go into the Story, not into menu hell. I did the boring nerd stuff so you don't have to. You're welcome btw.

---

## Table of Contents

- [What is "Megumin Secret Sauce v4"?](#what-is-megumin-secret-sauce-v4)
- [Core Features](#core-features)
- [Installation](#installation)
- [How to Use It (Read This. Seriously.)](#how-to-use-it)
  - [Stage 1: System Mode](#stage-1-system-mode)
  - [Stage 2: Personality & Toggles](#stage-2-personality--toggles)
  - [Stage 3: Writing Style (The Magic Step)](#stage-3-writing-style-the-magic-step)
  - [Stage 4: Add-ons](#stage-4-add-ons)
  - [Stage 5: Format Blocks](#stage-5-format-blocks)
  - [Stage 6: AI Model](#stage-6-ai-model)
- [Global Defaults vs Character Profiles](#global-defaults-vs-character-profiles)
- [FAQ (Frequently Annoying Questions)](#faq)
- [Credits](#credits)

---

## What is "Megumin Secret Sauce v4"?

Okay let's talk about the AI "Yes Man" problem real quick because if you've used LLMs for RP for more than like 3 days you already know exactly what I'm talking about.

LLMs are **massive simps** out of the box. Every NPC agrees with you. Every character thinks your plan is brilliant. Everyone falls in love with you after two messages. The whole world bends over backwards to make sure you're having a great time and honestly it gets *boring*.

So you try to fix it. You write a prompt telling the AI to "stop being so agreeable" or "make NPCs more realistic." And what happens? The AI *overcompensates*. Suddenly every NPC is an edgy jerk who hates you for absolutely no reason. The shopkeeper insults you. Your party member betrays you on day one. A random child NPC threatens to stab you. Cool. Very realistic. Thanks.

**I didn't want a Yes Man. I didn't want an aggressive psychopath. I just wanted NPCs that have a spine.**

Secret Sauce v4 (which is the **Balance** mode in the Suite) fixes this by forcing the AI to tie every NPC reaction directly to their background, their context, their personal agenda, and their relationship with you. Here's what that actually looks like in practice:

- You do something genuinely kind? The character appreciates it. Like a normal person.
- You do something incredibly stupid? They look at you like you're an idiot. Like a normal person.
- They have their own lives, their own problems, their own opinions.
- They can disagree with you. They can argue with you. They can literally just walk away from you if they're fed up.
- The world does **not** revolve around you anymore.
- But it's not artificially harsh either. It's just... *real*.

That's the whole philosophy. Truth in human behavior. Not misery. Not comfort. Truth.

---

## Core Features

Here's what you're actually getting:

###  Per-Character Auto-Configuration
Every character/RP you open gets its own saved profile. The Suite remembers what you picked for each one. Open a chat you haven't touched in weeks? Still configured exactly how you left it. You don't have to do anything, like the Great Todd Howard said "it just works". Revolutionary concept, I know.

###  AI-Generated Writing Rules
This is the fun part. Pick some style tags (like "Gothic" + "Slow-Burn" + "Introspective"), click a button, and the Suite will use a secondary AI call to write you a complete, custom writing style prompt. You can also hit "Generate Insights" and it'll read your character card and brainstorm authors and tags that fit. It does the work for you basically.

###  Auto-Summary (No Extra Extension Required)
The Suite has a built-in summary system that works through Regex. No extra extensions needed. No manual input. It just... summarizes. At the end of each response. Automatically. Like it should've been doing this whole time.

###  Info Block
Clean status blocks at the end of each message showing date/time, location, weather, character outfits, positions. Keeps the AI From Forgetting its Wednesday.

###  Improved Chain of Thought (COT)
The Suite injects a structured thinking process that forces the AI custom thinking Process. It checks proportionality, subtext, dialogue realism, physical world state — all before generating a single word of the actual response. Supports Gemini, Claude, and GLM with model-specific formatting.

---

## Installation

1. Open SillyTavern
2. Go to **Extensions** → **Install Extension**
3. Paste the repo URL and install
4. Load the two provided presets: **`Megumin Suite`** and **`Megumin Engine`** [View Presets](https://github.com/Arif-salah/Megumin-Suite-Ext/tree/main/Presets)
5. For each preset, select your preferred API and **don't forget to save them, dummy**
6. Open any chat
7. Click the floating Megumin Suite button on your screen
8. You're done. That's it. Go RP.

> ⚠️ **Seriously** — load BOTH presets. The Suite preset is your main one. The Engine preset is what the Suite uses internally to generate writing rules and insights. If you skip the Engine preset, the AI generation features won't work and you'll come complain to me about it and I'll just link you back to this paragraph.

---

## How to Use It

Click the floating Megumin Suite button → a 6-stage wizard pops up. Pick your stuff. It autosaves as you go (yes rly, you don't even have to hit save, but there's a save button too if it makes you feel better).

Whatever you configure here is automatically tied to the specific character you're currently chatting with. Different character = different profile. No cross-contamination.

---

### Stage 1: System Mode

This is the core brain that drives how the entire RP behaves. You get three options:

| Mode | What It Does | Vibe |
|------|-------------|------|
| **V4 Balance** ⭐ | The original Secret Sauce v4. Truth in human behavior. NPCs react proportionally to what you actually do. | "The real world but with magic" |
| **V4 Cinematic** | Same foundation but the AI gets narrative authority to actively push the plot, introduce conflicts, and drive drama. Think Hollywood energy. | "The AI is the director now" |
| **V4 Dark** | Balance but harsher. The AI is a strict reality simulator. No narrative protection. No dramatic safety net. Things happen because they would happen. | "You asked for this" |

The ⭐ means recommended btw. You'll see those throughout the UI. Or you can ignore my recommendations. I'm not your mom.

---

### Stage 2: Personality & Toggles

**Persona:** Pick who the system "is."

- **Engine** ⭐ — Neutral. Just runs the world. No personality, no flavor, pure function. This is what you want 90% of the time.
- **Director** — The system thinks of itself as "the Director." Same rules, slightly different framing.
- **Megumin** — The system IS Megumin. Arrogant, condescending, and openly annoyed at Kazuma (that's you rn). Look I added this as a joke but some of you weirdos actually like it so it stays.

**Extra Toggles:**

- **OOC Commentary** — Lets the AI break the fourth wall and talk to you directly between `[]` brackets to comment on the story. Useful sometimes. Annoying other times.
- **Stop the AI from Controlling User** — Prevents the AI from writing dialogue or actions for your character. **Keep this OFF for best results** unless the AI is being *really* grabby with your character. V4 already handles this pretty well on its own.

---

### Stage 3: Writing Style (The Magic Step)

Ok this is where the Suite earns its keep so pay attention.

**Step 1: Pick Tags**

You'll see a grid of style tags organized into categories:

- **Genre & Tone** — Dark, Gritty, Horror, Romantic, Comedy, Slice-of-Life, etc.
- **Narration** — Purple Prose, Minimalist, Dialogue-Heavy, Show-Don't-Tell, etc.
- **Pacing** — Slow-Burn, Fast-Paced, Episodic, Dynamic, etc.
- **POV** — First-Person, Second-Person, Third-Person Limited/Omniscient

Click the tags that match the vibe you want. Hover over them for hints if you're not sure what they mean (yes I wrote a tooltip for every single one, you're welcome).

**Step 2: Generate Insights (Optional but Cool)**

Feeling lazy? Same. Click **"Generate Insights"** and the Suite will read your character card and brainstorm author names and style tags that fit. It'll suggest stuff like "Edgar Allan Poe" or "Dark Fantasy Author" or whatever matches your character. You can then click those suggestions to add them to your selected tags.

**Step 3: Custom Directives (Optional)**

There's a text box where you can type any additional notes you want, like:
- "Focus heavily on inner monologues"
- "Keep dialogue snappy and sarcastic"
- "More environmental description"
- "Make the romance slow and painful" (I don't judge)

**Step 4: Generate Writing Rule**

Click **"Generate Writing Rule"** and the Suite fires off an AI call that takes ALL your selected tags + your custom notes and compiles them into a single, cohesive writing style prompt. This gets injected into your system prompt automatically. You can read it, edit it, or just trust the process. Up to you.

> 💡 **Protip:** You can also just type/paste a writing rule directly into the Final Rule box if you already have one you like. The Suite won't judge you. *I* might though.

---

### Stage 4: Add-ons

Toggle on advanced mechanics. These are independent modules that stack on top of whatever mode you picked.

| Add-on | What It Does |
|--------|-------------|
| **Death System** | If something would realistically kill you, you die. No plot armor. After death, you get two choices: narrative survival (with consequences) or take over a different character. The death stays canon. *Yes really.* |
| **Combat System** | Turn-by-turn combat that respects physics. Size, skill, numbers, and weapons matter. A regular human fighting a dragon will lose unless you have a *very* good plan. |
| **Direct Language** | Makes the AI use direct anatomical terms instead of flowery euphemisms. You know what this is for. I'm not elaborating. |
| **Dialogue Colors** ⭐ | Assigns each character a unique hex color for their dialogue so you can visually tell who's talking. Genuinely useful and looks pretty. Recommended. |

**Extra Section:**

At the bottom of this stage there's a bonus panel:

- **Language Output** — Type a language (Arabic, Spanish, French, whatever) and the AI will write its entire response in that language. Leave empty for English. This was requested by a friend so here you go.
- **User Gender** — Force the AI to use the correct pronouns for you. Select Male (He/Him) or Female (She/Her) so the AI stops misgendering you every other paragraph. **I especially got you, my female audience.** I know the AI defaults to "he" for everyone. Fixed.

---

### Stage 5: Format Blocks

Pick what gets appended to the end of the AI's messages:

| Block | What It Generates |
|-------|------------------|
| **Info Block** ⭐ | A clean collapsible status panel: date/time, location, weather, character outfits and positions. Keeps everything Saved. |
| **Summary Block** ⭐ | A rolling collapsible summary of what just happened (max 100 words, no interpretation). Helps the AI remember things without you installing a separate memory extension. |
| **CYOA Block** | A "Choose Your Own Adventure" panel with 4 suggested actions you can take. Nice if you're stuck or just want options laid out for you. |

Both Info Block and Summary Block are recommended. The CYOA one is totally optional — some people love it, some people like me find it annoying. Try it and see.

---

### Stage 6: AI Model

Just tell the Suite what LLM you're currently using so it formats the Chain of Thought correctly:

| Option | When to Use |
|--------|------------|
| **Gemini** | You're using Google Gemini |
| **Gemini-ara** ⭐ | Gemini but the thinking process is in Arabic. It is better because it Separate thinking process from narration process. Sounds weird but it actually works better for some reason. Don't ask me why. |
| **Claude** | You're using Anthropic Claude |
| **GLM** | You're using GLM |

Pick the one that matches your API. If you pick the wrong one it won't explode or anything but the COT formatting might look weird to the model.
for any Model Except Gemini Disable "Enable only for Gemini" in the preset Toggles

---

## Global Defaults vs Character Profiles

Here's how the profile system works (it's simple I promise):

1. **If you open the Suite WITHOUT a character selected** → you're editing the **Global Default**. Any new character you start chatting with will automatically inherit whatever you set here.

2. **If you open the Suite WITH a character selected** → you're editing **that specific character's profile**. Changes only apply to them.

3. **If a character doesn't have a custom profile yet** → it uses the Global Default until you change something for them.

The header of the Suite tells you what you're editing rn:
- 🟢 Green = Custom character profile loaded
- 🟡 Yellow = Using system default (no custom profile yet)
- 🟣 Purple = Editing the global default

There's also a **Reset** button if you completely brick a profile and want to start over. It'll ask you to confirm first because I'm not a monster.

---

## FAQ

**Q: Do I need both presets?**
Yes. Read the installation section again. I literally warned you about this.

**Q: Can I edit the generated writing rule after it's made?**
Yep. It's just a text box. Edit it however you want. The Suite doesn't care.

**Q: Does this work with group chats?**
It's designed for 1-on-1 character/RP chats rn. Group chat support might come later if enough people yell at me about it.

**Q: The AI is still being a simp even with Balance mode.**
Make sure you actually saved and closed the Suite, and make sure the **Megumin Suite** preset is the active one. If the preset isn't selected, the injection doesn't run. Also some models are just... like that. Gemini 2.5 and Claude respond to V4 the best in my experience.

**Q: I clicked Generate Writing Rule and nothing happened.**
You need tags selected first. Go back to Stage 3, pick some tags, then click the button. Also make sure the **Megumin Engine** preset is imported in your preset list (you don't need to select it — the Suite switches to it automatically in the background).

**Q: Why is it called Megumin Suite?**
Because Megumin is the best girl and I will not be taking questions on this. Next.

**Q: Does this work with [insert Model here]?**
The Suite itself doesn't care what API you're running — it just injects text into your prompt pipeline, so as long as SillyTavern talks to it, the Suite rides along. However, the Chain of Thought stuff in Stage 6 is specifically built for Gemini, Claude, and GLM. If you're using something else, everything will still work, you just won't get the fancy structured thinking process. Pick whichever one is closest to your model and pray, I guess.

**Q: I found a bug.**
Cool. Open an issue and describe what happened, what you expected to happen, and what model/API you're using. Screenshots help. "It's broken" with zero context does not help. Please don't be that person.

---

## Credits

- **Kazuma** (me, hi) — Built the whole thing. The extension, the prompts, the UI, the presets, this README, all of it. I need to go outside.
- **Megumin** — Moral support (unwilling). Also the mascot. Also the reason the floating button exists.
- **SillyTavern** — For being the platform that makes all of this possible.
- **You** — For actually reading this far. Genuinely impressed ngl. Most people stop after the installation section. Gold star for you. ⭐

---

*Now go RP. Stop reading READMEs. Shoo.*
