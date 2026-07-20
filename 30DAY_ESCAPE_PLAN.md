# 30-Day McDonald's Escape Plan
**Start Date:** July 7, 2026 | **Goal:** First job interview OR first $50 income by Day 30
**The Rule:** Every single task either builds your portfolio, earns money, or gets you in front of a hiring manager. Nothing else exists.

---

> [!IMPORTANT]
> You have one weapon: the AI tooling architecture (ToolRegistry + WorkflowManager + PermissionGate + agent-loop). That is what companies pay $70-120k+ for. Every day of this plan points at that weapon.

---

## The Two Exit Doors

**Door 1 — Get Hired:** Target roles: Junior Tools Programmer, AI Tools Developer, Junior Game Developer, Frontend Dev with portfolio. Timeline: first interview by Day 25.

**Door 2 — First Income:** Itch.io shader pack + tool listing. Timeline: first sale by Day 14.

Both doors are open simultaneously. You pursue both. Whichever opens first, you walk through it.

---

## What You Will NOT Touch for 30 Days

This is not optional. These are banned from your schedule:

- The DAW. Do not open it.
- The 3D editors. Do not touch them.
- The campaign/cutscene/dialogue editors. Frozen.
- Mobile builds (iOS/Android). They do not exist.
- New features of any kind. Zero new features.
- The `website/` directory. Ignore it.
- Redesigning the UI. It already looks good.
- Refactoring the EventBus. Not now.
- Adding a new engine. Hard no.

If you catch yourself doing any of the above, stop. Come back to the plan.

---

## Week 1 — Build the Proof (Days 1–7)
### Goal: Create the artifacts that prove you built something real. Without proof, nothing else works.

---

### Day 1 — Monday: Fix the Engine, Take the Screenshots

**Morning (2 hours):**
- Open `public/iso_play.html` and `public/engines/iso-pixel/main.js`
- Fix the IsoCombatSystem/IsoEntity load order crash (ensure both script tags appear before IsoGame is instantiated)
- Verify the IsoPixel engine boots without console errors

**Afternoon (2 hours):**
- Load the most visually impressive IsoPixel map you have
- Enable the day/night cycle and a shader effect (bloom or vignette from `shaderSystem.js`)
- Take 5 clean screenshots: (1) dashboard, (2) map editor wide view, (3) NPC placement, (4) shader preview, (5) play mode
- Save them to a folder called `portfolio-screenshots/`

**Evening (1 hour):**
- Write down in plain text: "I built an AI-native isometric game studio in JavaScript with a local LLM that understands my project." — this is your elevator pitch. Memorize it.

**Skip today:** Anything not on this list.

---

### Day 2 — Tuesday: Record the Demo Video

**This is the most important day of the 30 days. Do not skip it.**

**Morning (1 hour):**
- Install OBS or use QuickTime screen recording (free, already on your Mac)
- Plan the 3-minute script:
  - 0:00–0:20 — Dashboard overview. Say what it is.
  - 0:20–1:00 — Open the IsoPixel map editor. Paint some tiles. Show the day/night cycle.
  - 1:00–1:40 — Open the AI chat. Type: "Place 2 NPCs on the map." Show the result.
  - 1:40–2:20 — Open the Shader Lab. Apply a preset. Show the visual change.
  - 2:20–3:00 — Play-test mode. Walk around the map. Say "this runs locally, no API costs."

**Afternoon (2 hours):**
- Record the video. Do it in one take if possible. Imperfect is fine. Missing is fatal.
- Do not spend more than 2 hours on recording. The first usable take wins.

**Evening (1 hour):**
- Upload to YouTube as Unlisted (not Private — you need the link)
- Title: "RedGlitch — AI-native isometric game studio (local LLM, no API costs)"
- Save the link somewhere safe

---

### Day 3 — Wednesday: Write the README for a Stranger

**The current README is written for you. Rewrite it for a stranger who has 60 seconds.**

**Full day (4 hours total, breaks included):**

Write the README with exactly these sections in this order:

```
# RedGlitch — AI-Native Isometric Game Studio

> Build isometric games with a local AI that actually reads your project code.

[GIF or screenshot here]

## What Is This?
One paragraph. Plain English. No jargon.

## What Can I Make?
- Isometric 2D/2.5D games with NPC AI
- Pixel-art worlds with dynamic day/night and weather
- Games with AI-assisted level generation (runs 100% offline)

## Install (3 steps)
1. git clone ...
2. npm install
3. npm run server → open http://localhost:3000

## Features That Work Right Now
| Feature | Status |
|---|---|
| IsoPixel 2.5D map editor | Working |
| Local AI assistant (IRAB) | Working (requires model) |
| GLSL Shader Lab | Working |
| NPC placement | Working |
| Play-test mode | Working |

## Demo Video
[Watch 3-minute demo](your YouTube link)

## Architecture (for the technical)
[Brief diagram or description of EventBus → ToolRegistry → AI pipeline]
```

- Commit and push to GitHub.
- If the repo is private, make it public today.

---

### Day 4 — Thursday: Build the Shader Pack for Itch.io

**This is Door 2 — your first potential income. It requires zero new code.**

**Morning (2 hours):**
- Open `public/shader_lab.html`
- Find your 5 best-looking GLSL shaders (bloom, vignette, chromatic aberration, film grain, color grade)
- For each one: apply it, screenshot the result with an interesting IsoPixel scene in the background
- Save screenshots with names like: `shader_bloom_preview.png`, `shader_vignette_preview.png`

**Afternoon (2 hours):**
- Create an Itch.io account if you don't have one: itch.io/register
- Create a new "Tool" listing: "RedGlitch GLSL Shader Presets - 5 Isometric Game Shaders"
- Price: $4.99
- Description (copy and adapt this):
  > "5 hand-crafted GLSL shader presets for isometric pixel art games. Includes bloom, vignette, chromatic aberration, film grain, and color grading. Plug directly into any WebGL pipeline. Previewed with the RedGlitch Engine."
- Upload a `.zip` containing the 5 `.glsl` files from your Shader Lab exports
- Upload your 5 preview screenshots
- Set to "In Development" until tomorrow

**Evening (30 min):**
- Double-check the listing looks professional. Fix any obvious typos.

---

### Day 5 — Friday: Publish the Shader Pack + First LinkedIn Post

**Morning (1 hour):**
- Set the Itch.io listing to Published. It is now live. It can now earn money.
- Share the link with yourself. You are now a developer with a product on the market.

**Afternoon (2 hours):**
Write your first LinkedIn post. Use this exact structure:

```
I've been building a local-first, AI-native isometric game studio for the past [X] months.

Here's what makes it different from every other game tool out there:

The AI assistant runs 100% on your machine. No API keys. No monthly fees.
It reads your actual project files and uses RAG to understand your game's context.
When you ask it to place NPCs, it calls a typed tool registry that validates permissions
before touching any file.

I built a transactional agentic workflow system with rollback — if the AI fails mid-task,
it undoes its own changes.

Tech used: Node.js, Electron, Python (FastAPI + llama.cpp), Transformers.js, GLSL/WebGL,
Canvas 2D, Monaco Editor, Orama vector search.

This is what 82,000 lines of solo development looks like.

[Link to demo video]
[Link to GitHub]

#gamedev #ai #electronjs #javascript #tools #buildinpublic
```

Post it. Do not edit it for 10 minutes after posting. Post it and close the tab.

**Evening (1 hour):**
- Share the same post text on X/Twitter if you have an account
- Post the demo video link on Reddit: r/gamedev and r/javascript — title: "I built a local-first AI game studio with its own agentic tool system — demo inside"

---

### Day 6 — Saturday: Research Target Jobs (2 hours max)

**This is the start of Door 1.**

Search for these exact job titles on LinkedIn, Indeed, and Remote.co:
- "Junior Tools Programmer"
- "Game Tools Developer"
- "AI Developer tools"
- "Frontend Developer game"
- "Junior Game Developer JavaScript"
- "Tools Engineer indie"

For each job you find that looks possible, paste it into a spreadsheet with: Company | Role | Link | Required Skills | Fit Score (1-5).

Find 20 jobs. Score them. Identify the top 5.

**You are not applying today.** You are building a target list. Applications start Day 15.

**Rest of the day:** Actual rest. You need it.

---

### Day 7 — Sunday: Write the Case Study (most important document for getting hired)

A case study is not a README. A case study is the document that makes a hiring manager say "I want to meet this person."

Create a file called `CASE_STUDY.md` in the repo root. Write this:

```
# Building an Agentic AI Tool System from Scratch

## The Problem I Was Solving
[Write 2 sentences about why you built this]

## The Architecture Decision That Mattered Most
I needed AI to safely modify game project files without corrupting the engine.
Solution: A Permission Gate with a file blacklist + a transactional WorkflowManager
that rolls back on failure.

## How the Agent Loop Works
[3-paragraph explanation of: tool call parsing → permission check → execution → rollback]

## The Hardest Technical Problem
[Write about the real hardest thing — the Python heartbeat, the EventBus race condition,
the CSP issue, whatever actually hurt you]

## What I Would Do Differently
[Be honest. Mention the scope problem. Mention what you'd cut.]

## Results
- 82,000+ lines of solo-developed code
- Full test suite for AI subsystems, server routes, and engine physics
- Working local AI with RAG, agentic loop, and permission system
- Live Itch.io product: [link]
- Demo video: [link]
```

This document will be linked directly in job applications. It is more valuable than a resume for technical roles.

---

## Week 2 — Get Visible (Days 8–14)
### Goal: Real humans outside your circle see your work. First sale happens.

---

### Day 8 — Monday: GitHub Polish

**2 hours, nothing more:**
- Add GitHub topics to your repo: `game-engine`, `ai-tools`, `electron`, `isometric`, `local-llm`, `javascript`, `webgl`, `game-dev`
- Add a proper repo description: "AI-native isometric game studio with local LLM, agentic tool use, and GLSL shader lab."
- Pin the demo video link in the About section
- Add the Itch.io link to the repo About section
- Make sure the README renders correctly on GitHub (check it in browser)
- Check your contributor graph — make sure recent commits are visible

**That is it for GitHub today. Do not refactor anything.**

---

### Day 9 — Tuesday: Second Itch.io Product

**The shader pack is live. Now add a second product: a standalone IsoPixel map template.**

**3 hours:**
- Take your best-looking IsoPixel map (the one from the screenshots)
- Export the map data as a `.json` file (use your existing export system)
- Create an Itch.io listing: "IsoPixel Starter Map Pack — 3 Isometric Game Maps"
- Price: $2.99
- Include: 3 different map JSONs (village, dungeon, outdoor/forest if you have them)
- Screenshots: show each map in the IsoPixel editor AND in play mode
- Publish it

You now have 2 products on Itch.io. You are officially selling things.

---

### Day 10 — Wednesday: Post to Hacker News

**This is the highest-leverage post you can make. Do not skip it.**

Go to news.ycombinator.com. Create an account if you don't have one.

Submit to "Show HN":
```
Title: Show HN: I built a local-first AI game studio where the LLM reads your project files

URL: [your GitHub link]

Comment (write this in the submission text box):
RedGlitch is an isometric game development studio I've been building solo.
The AI assistant (IRAB) runs locally via llama.cpp/DeepSeek-Coder and uses RAG 
on your actual project JSON files — so it knows your map, your NPCs, your logic.

The part I'm most proud of: the agentic tool system. When the AI wants to modify 
a file, it goes through a PermissionGate (file blacklist + user confirmation), 
executes via a WorkflowManager with transactional rollback, and uses a typed 
ToolRegistry. If anything fails mid-task, it undoes its own changes.

Tech: Node.js + Electron, Python FastAPI + llama.cpp, Transformers.js, 
Orama vector search, GLSL/WebGL, Canvas 2D, Monaco Editor.

Demo video: [link]
Live on Itch.io: [link]

Happy to answer questions about the agentic architecture.
```

Post it between 9am–12pm EST (best visibility window). Then leave it alone for 24 hours. Do not obsess over upvotes. Just leave the link up.

---

### Day 11 — Thursday: Reddit Push

Post to 3 subreddits today. One post, adapted for each:

**r/gamedev** — Title: "I built an isometric game studio with a local AI that reads your project files (demo video inside)"

**r/javascript** — Title: "Building an agentic AI tool system in vanilla JS — ToolRegistry with transactional rollback and a permission gate [Show and Tell]"

**r/learnmachinelearning** — Title: "I built a local RAG system for game development — the LLM reads your actual game files for context"

For each post, link the demo video first. GitHub second. Write 2 sentences about what's impressive. Ask one question to invite comments.

**Expected result:** Some engagement, maybe some follows, possible traffic to Itch.io. The goal is not viral — the goal is leaving footprints across the internet that hiring managers find when they Google your name.

---

### Day 12 — Friday: Start the Portfolio Page

You need a single webpage that is not GitHub and not Itch.io. It needs to exist when a recruiter Googles your name.

**Options (pick one):**
- GitHub Pages (free, fast): create `username.github.io`
- Carrd.co (free tier, beautiful): carrd.co

**What goes on it (keep it simple):**
```
[Your Name] — Tools Developer / AI Systems
[Short bio: 2 sentences]

Featured Project: RedGlitch
[Screenshot]
[3-bullet description]
[Demo Video link] [GitHub link] [Itch.io link]

Skills: JavaScript, Node.js, Python, Electron, WebGL/GLSL, 
        AI/LLM integration, Game Engine Architecture, 
        Monaco Editor, RAG Systems

Contact: [email] [LinkedIn]
```

That is the entire page. Do not add more. Make it exist. Publish it.

---

### Day 13 — Saturday: Check Your Numbers + First Application Prep

**Morning (1 hour):**
- Check Itch.io: any sales? Any views? Write down the numbers.
- Check YouTube: any views? Write down.
- Check LinkedIn post: any impressions, comments, profile views?
- Check GitHub: any stars, forks?

Do not panic if the numbers are low. This is data, not judgment.

**Afternoon (2 hours):**
- Write your updated resume. It now has ONE featured project:

```
REDGLITCH ENGINE — Solo Developer | 2025–2026
github.com/[your-username]/redglitch-engine | itch.io/[your-link]

- Built a 82,000-line local-first AI game studio with Electron + Node.js
- Designed an agentic tool system with typed ToolRegistry, PermissionGate
  (file blacklist + audit log), and transactional WorkflowManager with rollback
- Implemented RAG pipeline using Orama + Transformers.js for project-context AI
- Built IsoPixel 2.5D engine with WebGL post-processing, particle FX, and 
  fixed-timestep physics
- Full test suite: AI subsystems, server routes, engine physics, serialization
Tech: JavaScript, Node.js, Electron, Python, FastAPI, llama.cpp, WebGL/GLSL, 
      Monaco Editor, Canvas 2D, WebSockets, Chokidar
```

---

### Day 14 — Sunday: Rest + Reflect

Check your Itch.io sales. If you have even one sale, that is real validation. Screenshot it.

Write 3 sentences about what you've shipped in the last 14 days:
- Demo video: exists
- GitHub: public and documented
- Itch.io: 2 products live
- LinkedIn: posted
- Hacker News: posted
- Reddit: posted
- Portfolio page: exists
- Resume: updated

This is more than most developers do in 6 months. It happened in 2 weeks. Keep going.

---

## Week 3 — Apply for Jobs (Days 15–21)
### Goal: 20 job applications submitted. At least 1 response.

---

### Day 15 — Monday: Apply to Jobs 1–4

From your Day 6 spreadsheet, take the top 4 jobs.

**For each application:**
- Cover letter template (adapt this per job, do not send it identically):

```
Subject: Application — [Role Title]

I'm a self-taught developer who has spent the last [X] months building 
RedGlitch, a local-first AI game studio with an agentic tool system.

The part most relevant to your [role] opening:

I designed a ToolRegistry + WorkflowManager system where an AI agent can 
execute multi-step tasks (file edits, NPC placement, shader configuration) 
with typed permissions and transactional rollback. If a task fails at step 3, 
steps 1 and 2 are undone automatically. I built this solo, without a team, 
without a spec.

I also built the IsoPixel 2.5D engine it runs on: Canvas 2D renderer with 
WebGL post-processing, chunk caching, a fixed-timestep physics loop, and a 
day/night lighting system.

Tech: JavaScript, Node.js, Electron, Python FastAPI, llama.cpp, GLSL/WebGL.

Demo: [YouTube link]
GitHub: [repo link]
Case study: [CASE_STUDY.md link or portfolio link]

I'd welcome the chance to talk about the architecture. No recruiters, no 
middlemen — just direct contact.

[Your name]
[Email]
```

Apply to 4 jobs today. Send the applications. Do not perfect them forever.

---

### Day 16 — Tuesday: Apply to Jobs 5–8

Same process. 4 more applications. Adapt the cover letter for each role.
Keep the spreadsheet updated: who you applied to, when, what you said.

---

### Day 17 — Wednesday: Apply to Jobs 9–12

4 more applications.

**Also today:** Find 10 more jobs to add to your list. Your original 20 may have gaps.
New search terms to try:
- "agentic AI developer"
- "LLM tooling engineer"
- "developer tools engineer"
- "game engine developer"

---

### Day 18 — Thursday: Apply to Jobs 13–16 + Cold Email

4 more applications.

**Cold email (1 hour):**
Find 3 indie game studios or dev tool companies on Twitter/X or GitHub that you respect. Find their founder or CTO on LinkedIn. Send this message (adapt it):

```
Hi [Name],

I've been following [Company]'s work on [specific thing].

I built an AI-native game studio solo — the part I'm most proud of is the 
agentic tool system: typed ToolRegistry, permission-gated file access, 
transactional workflow execution with rollback. It's JavaScript + Python, 
fully local, no API costs.

Demo: [link]. GitHub: [link].

Not sure if you're hiring, but I'd welcome any feedback on the architecture 
or a brief conversation.

[Name]
```

Send to 3 people. Expect 0–1 responses. That is fine. The goal is planting seeds.

---

### Day 19 — Friday: Apply to Jobs 17–20

4 more applications. You have now sent 20 applications.

**Today also:** Follow up on any LinkedIn comments, HN comments, or Reddit replies from your posts. Respond to every single one. Even "thanks for checking it out" is better than silence.

---

### Day 20 — Saturday: Third Itch.io Product

**You now have 2 weeks of market data. What got clicks? What got ignored?**

Add a third product based on what you know:
- If shaders got views → add a "Shader Lab Tutorial" PDF ($1.99)
- If the map pack got views → add a "IsoPixel NPC Pack" (exported NPC definitions, $2.99)
- If neither got views → add a free "RedGlitch Lite" version (the engine with 1 demo map, free)

A free product drives traffic and trust for your paid products. Seriously consider adding one.

---

### Day 21 — Sunday: Portfolio Video #2

Record a second video. 5 minutes this time. Different angle:

**Title:** "How I built an agentic AI tool system that rolls back its own mistakes"

**Content:**
- Show the code: `agent-loop.mjs`, `workflow-manager.js`, `permission-gate.js`
- Explain in plain English: "If the AI edits 3 files and the 3rd one fails, it undoes files 1 and 2 automatically"
- Show the file blacklist: "The AI can never touch the engine core, the server, or its own permission system"
- Show a live demo of the AI being asked to do something and the PermissionGate firing a confirmation modal

This video gets you hired at AI companies. It demonstrates systems thinking.

Upload to YouTube. Add it to your portfolio page. Add it to LinkedIn. Done.

---

## Week 4 — Convert (Days 22–30)
### Goal: First interview scheduled OR first sale made. Both if possible.

---

### Day 22 — Monday: Follow Up on All Applications

For every application sent in Week 3 with no response:
- Send a follow-up email (just one, not multiple):

```
Subject: Follow-up — [Role] Application

Hi [Name],

I applied for [role] last week and wanted to follow up briefly.

Since my application, I've published two tools on Itch.io and recorded a 
technical deep-dive on the agentic workflow system I built. Both links 
are in my case study: [link].

Still very interested in the role. Happy to do a technical call at your 
convenience.

[Name]
```

---

### Day 23 — Tuesday: Write the Dev.to Article

Dev.to is free. Posts there rank on Google. A technical article gets you traffic for months.

**Title:** "I built a local AI that modifies game files safely — here's the permission system"

**Content:** 3-5 code snippets from `permission-gate.js` and `workflow-manager.js`. Plain English explanation of why you built it this way. What went wrong before you had it. What it looks like when it works.

Publish it on Dev.to. Cross-post to Hashnode. Both are free and both rank on Google for developer searches.

---

### Day 24 — Wednesday: Apply to 5 More Jobs

Your list may have grown from the new searches. Apply to 5 more.

This time, look specifically at:
- Small AI startup job boards (wellfound.com, ycombinator.com/jobs)
- Game tool companies (Tiled map editor, LDtk, GameMaker hiring?)
- Remote-first companies on remote.co and remoteok.io

---

### Day 25 — Thursday: Build the "AI Demo" That Gets You Into Any Interview

If you have not had a response yet, this is why: they cannot imagine what you built from a README. Fix that.

**Create a 1-page PDF called `redglitch_technical_overview.pdf`:**

```
RedGlitch AI Architecture — Technical Overview
[Your Name] | [Email] | [GitHub] | [Demo Video]

SYSTEM: Local-first AI assistant for game development
- LLM: DeepSeek-Coder-1.3B via llama.cpp (Python FastAPI backend)
- RAG: Orama vector DB + Transformers.js embeddings (IndexedDB persistent)
- Context: Project JSON files auto-indexed at file-change events

AGENTIC LOOP (agent-loop.mjs):
- Max 8 turns per session
- Parse LLM output for tool calls (```tool blocks)
- Execute via WorkflowManager (transactional, rollback on failure)
- Feed results back as next-turn context
- Cancel at any step

TOOL REGISTRY (tool-registry.js — 540 lines):
- Typed tool definitions with JSON schema validation
- In-flight request tracking (no duplicate execution)
- EventBus integration for cross-tab tool announcements
- Backend sync with Python server

PERMISSION GATE (permission-gate.js — 351 lines):
- Static file blacklist (engine core, server, self-modification blocked)
- User confirmation modal for write/delete operations
- Audit log (last 1,000 actions)
- AI-specific undo stack

WHAT MAKES THIS DIFFERENT:
The AI cannot modify its own permission system. It cannot touch the server.
It cannot loop infinitely. Every action is audited. Failed multi-step tasks
rollback automatically. This is production-grade safety for a local AI tool.
```

Attach this PDF to every future job application and cold email.

---

### Day 26 — Friday: Check All Numbers + Adjust

Sit down with your spreadsheet.

**Income check:**
- Total Itch.io revenue: ___
- Total views across products: ___
- Most popular product: ___

**Job search check:**
- Applications sent: ___
- Responses received: ___
- Interviews scheduled: ___

**If 0 responses on jobs:** Your cover letter or resume needs work. Ask someone in r/cscareerquestions to review your resume. Post it (redacted) and get feedback.

**If 0 Itch.io sales:** Your product descriptions need work. Look at the top-selling tools on Itch.io and compare your listing to theirs. Adapt.

**If you have ANY responses or sales:** You are doing it right. Keep going.

---

### Day 27 — Saturday: YouTube Video #3 — The "Build a Game" Video

This is the video that converts viewers into Itch.io buyers.

**Record:** Build a tiny game from scratch using RedGlitch. 5 minutes. Real-time.
- Open the IsoPixel editor
- Paint a 10x10 map
- Place 1 NPC
- Ask the AI to add a fog shader
- Play-test it
- Show the play mode

Upload it. Title: "Making a game in 5 minutes with RedGlitch [local AI game studio]"

This video answers the question every viewer has: "But does it actually work?"

---

### Day 28 — Sunday: Update LinkedIn Profile

Your LinkedIn profile should now say:

**Headline:** Tools Developer | AI Systems | Game Engine Architecture | Electron + JavaScript

**About section (write this):**
```
I build developer tools and AI systems.

For the past [X] months I've been building RedGlitch — a local-first AI game studio 
where the assistant runs entirely on-device (no API costs) and uses RAG to understand 
your actual project files.

The architecture I'm most proud of: a typed ToolRegistry + PermissionGate + transactional 
WorkflowManager that lets an AI agent safely modify game files with user-confirmed 
permissions and automatic rollback on failure.

I'm looking for roles in: Tools Programming | AI Developer Tooling | Game Development | 
Frontend (React/Electron)

Demo: [link] | GitHub: [link] | Itch.io: [link]
```

Add your 3 YouTube videos to the Featured section on LinkedIn. Recruiters watch those.

---

### Day 29 — Monday: 5 More Cold Messages to Indie Devs / Founders

Go to itch.io. Find the top 20 most popular open-source game tools. Find the creators on Twitter/X or GitHub.

Send 5 messages (adapt the template from Day 18). Focus on tools devs, not game devs. Tools devs understand what you built.

Also: check if any of your Reddit/HN posts had late comments. Reply to all of them.

---

### Day 30 — Tuesday: The Audit

Sit down. Write the numbers. Be honest.

| Metric | Target | Actual |
|---|---|---|
| Itch.io products live | 3 | ___ |
| Itch.io total revenue | $1+ | ___ |
| GitHub repo public | Yes | ___ |
| Demo video exists | Yes | ___ |
| YouTube videos | 3 | ___ |
| LinkedIn post | Yes | ___ |
| HN post | Yes | ___ |
| Reddit posts | Yes | ___ |
| Portfolio page | Yes | ___ |
| Resume updated | Yes | ___ |
| Job applications sent | 25+ | ___ |
| Job responses | 1+ | ___ |
| Interviews scheduled | 1 | ___ |
| Dev.to article | 1 | ___ |
| Cold emails sent | 8+ | ___ |

### If You Got an Interview

Prepare for it using this framing: you are not a junior who made a toy. You are a self-taught engineer who designed a production-grade AI safety system for a real software tool. Describe the PermissionGate, the WorkflowManager rollback, the agent loop. Use those words. That is your story.

### If You Did Not Get an Interview

That is not failure. That is data. It means one of three things:
1. Your applications landed in the wrong inboxes — expand your target list
2. Your cover letter is not landing — rewrite it based on the job postings that got zero response
3. Your portfolio needs a visible project outside RedGlitch — spend Day 31+ building a small 1-week project that demonstrates a specific skill gap

### If You Got a Sale

Screenshot it. Frame it. It means a stranger looked at your work and decided it was worth money. That is real. That is proof. That is the first brick of the wall between you and McDonald's.

---

## The Rule That Overrides Everything

Every morning before you open your laptop, ask one question:

**"Does what I'm about to do today either get me in front of a hiring manager or earn me money?"**

If the answer is no, do not do it.

That is the only rule that matters.

---

*Plan generated July 6, 2026. Based on direct codebase audit of RedGlitch Engine v7.0.1.*
*Every recommendation is grounded in what already exists in your codebase — no new features required.*
