# Solus — Long Term Memory

> This file is maintained autonomously by Solus.
> After every significant conversation, Solus extracts key facts and updates this file via GitHub.
> Format: entity → attribute → value. Add new facts. Never delete old ones unless explicitly corrected.
> Last updated: 14/3/2026, 11:30:13 pm IST

---

## About Tanmay

- Location: Kalol, Gujarat, India
- Education: 6th semester Computer Engineering
- Age: ~20
- Primary language: English (casual), speaks Hindi
- Works on Mac, uses Chrome
- Timezone: IST (UTC+5:30)
- Preferred coding tools: Gemini CLI, Antigravity
- GitHub: TanmayShah29

<!-- Added 14/3/2026, 12:39:03 pm IST -->
- Favourite food is pav bhaji
- Hates mornings

<!-- Added 14/3/2026, 2:13:42 pm IST -->
- You are a 6th semester Computer Engineering student in Kalol, Gujarat.

<!-- Added 14/3/2026, 3:04:06 pm IST -->
- You want to make Solus better.

## Projects

### Solus AI
- All 8 build phases complete as of March 2026
- 11 tools active and verified
- 248+ LangSmith traces
- UI redesign in progress (Spline robot + glassmorphism)
- Voice feature rebuilt — native AudioContext VAD, no WASM
- Known issues: Spline page loading issue being debugged
- Google OAuth: tokens stored in .env.local
- Vercel deployment: https://solus-ai.vercel.app

## Preferences & Patterns

- Asks for raw proof, not summaries — always show curl output, SQL results, exact responses
- Switches AI tools when one hits limits (Claude → Gemini → Antigravity)
- Antigravity hits context limits on long conversations — start fresh when it errors
- Always prefix Gemini prompts with: "Read CLAUDE.md before doing anything"
- Builds in phases, verifies each one before moving forward
- Dislikes over-explanation
- Values autonomy — wants Solus to act, not ask

## Technical Decisions Made

- VAD: native AudioContext (not @ricky0123/vad-web — it breaks SSR)
- TTS: browser speechSynthesis, British male voice (Google UK English Male / Daniel)
- Google tokens: stored in .env.local, not Supabase oauth_tokens table
- Tavily key: use process.env directly, not env.ts (Edge runtime issue)
- Spline: dynamic import with ssr:false required

## Conversation History Notes

- Considered switching to OpenClaw but decided to continue building Solus
- Wants memory.md to be self-updating via GitHub tools
- UI vision: fullscreen Spline robot, chat floats over it, black gradient, minimal

---

## How To Update This File

When Solus identifies a fact worth remembering:
1. Read the current memory.md via GitHub API
2. Add the new fact under the appropriate section
3. Update "Last updated" timestamp
4. Commit with message: "memory: update [brief description]"

Never overwrite existing facts unless explicitly corrected by Tanmay.
Append, don't replace.
## Knowledge Facts

<!-- Synced from Supabase 14/3/2026, 11:30:13 pm IST -->
- The term 'test': The term 'test' has multiple meanings and uses, including as a noun and a verb. (confidence: 80%)
- test: The term 'test' has various meanings and uses, including its use as a noun and a verb, and it's related to testing and quality assurance. (confidence: 80%)
- Test IO: A company that provides testing and quality assurance services. (confidence: 80%)
- Kalol: The current temperature in Kalol is 29°C. (confidence: 80%)
- Conversation: Started with a greeting and introduction of the AI assistant, Solus. (confidence: 80%)
- User: 6th semester Computer Engineering student (confidence: 80%)
- Location: Kalol, Gujarat (confidence: 80%)
- Google Drive account: You have a Google Drive account with several files, including a resume and a presentation. (confidence: 80%)
- user: has no upcoming events scheduled (confidence: 80%)
