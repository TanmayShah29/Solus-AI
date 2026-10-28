# Solus

**A personal AI agent that runs all the time and lives in Telegram.** You message it like a person. It can read your Gmail, check your Calendar and Drive, search the web, set reminders that survive restarts, and remember what matters about you from one conversation to the next.

I built it for myself, on free tiers, and I use it every day.

## What it can do

| Ask it… | What happens |
|---|---|
| "What's on my calendar tomorrow?" | Reads Google Calendar through OAuth |
| "Any email from the internship people?" | Searches and reads Gmail |
| "Find my resume in Drive" | Searches Google Drive |
| "Remind me at 9 to submit the form" | Starts a durable Inngest job that messages you on Telegram at that time |
| *sends a voice note* | Transcribes it, then handles it like text |
| *pastes a YouTube or article link* | Summarises the transcript or the page |
| Weather, news, currency, web search | Open-Meteo, Tavily, ExchangeRate API |

There are 13 tools in total. Each one is declared in [`src/skills/`](src/skills) as JSON and served by its own API route under [`src/app/api/tools/`](src/app/api/tools).

## How it works

```
Telegram ──webhook──▶ /api/channels/telegram ──event──▶ Inngest: telegram-handler
                       (replies 200 at once)                │
                                                            ▼
                         context assembler: memories (pgvector) + facts + tasks
                                                            │
                                                            ▼
                         LLM: Groq Llama 3.3 70B ──fails──▶ Gemini (fallback)
                                                            │ tool calls
                                                            ▼
                         tool router ──▶ Gmail / Calendar / Drive / search / reminders…
                                                            │
                                                            ▼
                         reply on Telegram ──▶ extract-memory job (runs after the reply)
```

**Messages are handled in the background.** Telegram retries any webhook that takes too long, which caused duplicate replies. Now the webhook returns at once and an Inngest job does the work.

**If one model provider fails, it switches to the other.** When Groq hits its daily token limit or errors, the provider is marked down in Redis (until midnight for quota errors, 5 minutes for anything else). Calls then go to Gemini automatically.

**Memory has three layers:**
1. **Episodic:** every message is stored in Supabase.
2. **Semantic:** messages are embedded and retrieved by similarity with pgvector before each reply.
3. **Knowledge facts:** after each conversation, an LLM judge scores each extracted fact from 1 to 10. Only facts scoring 7 or more are kept as permanent knowledge. Separately, it maintains a graph of the people you mention.

**Approval for risky actions:** long-running tasks pause and wait for your approval (`/api/hitl/approve`) before doing anything irreversible.

**Limits and tracing:** Upstash Redis caps tool calls at 20 per minute and tokens at 100k per day. Every LLM call is traced in LangSmith.

**Dashboard:** a Next.js web app with pages for memory, people, tasks, tools and traces.

## Stack

Next.js 16 · TypeScript · Vercel AI SDK · Groq (Llama 3.3 70B / 3.1 8B) · Gemini · Supabase + pgvector · Inngest · Upstash Redis · LangSmith · Telegram Bot API · Google APIs (OAuth) · Tavily

## Running it yourself

You'll need free accounts for: Groq, Supabase, Inngest, Upstash, a Telegram bot (from @BotFather), and a Google Cloud OAuth client.

```bash
git clone https://github.com/TanmayShah29/Solus-AI.git
cd Solus-AI
npm install
# create .env.local with the variables listed in src/lib/env.ts
# GITHUB_REPO must point at a PRIVATE repo: that's where memory.md is kept
npm run dev                  # starts Next.js and the Inngest dev server together
npm run register-webhook     # points your Telegram bot at the app
```

Then open `/api/auth/google` once to connect your Google account.

**Access:** every page and API route sits behind one login (`src/proxy.ts`). Your browser asks for `SOLUS_DASHBOARD_PASSWORD` the first time, and server-to-server calls use `API_SECRET_TOKEN`. The secret never reaches the browser. Only the Telegram and Inngest webhooks skip the gate, because they verify their own signatures.

## Status

- **Working:** Telegram chat and voice notes, the 13 tools, memory and fact extraction, reminders, Groq → Gemini fallback, the dashboard.
- **Turned off for now:** the scheduled messages it sends on its own (morning brief, hourly monitor, weekly goal review). They used up the free-tier token budget too quickly.
- **Known gaps:** there are no automated tests yet, and the Supabase table schema isn't in the repo yet, so setting it up yourself takes some guesswork.

## Why I built it

I wanted something like Jarvis on a student budget. Building it taught me more about running LLM software for real than any tutorial: webhook retries, provider rate limits, background jobs that must survive restarts, and deciding what an agent should remember.
