# Solus — Tools & Integrations

## Active Tools (11 registered in Supabase)

| Tool | Category | Route | Auto-approve |
|---|---|---|---|
| web_search | research | /api/tools/web-search | ✅ |
| read_url | research | /api/tools/read-url | ✅ |
| weather | personal | /api/tools/weather | ✅ |
| news_headlines | research | /api/tools/news-headlines | ✅ |
| youtube_summary | research | /api/tools/youtube-summary | ✅ |
| currency_convert | personal | /api/tools/currency-convert | ✅ |
| telegram_send | communication | /api/tools/telegram-send | ❌ |
| set_reminder | personal | /api/tools/set-reminder | ✅ |
| google_calendar | productivity | /api/tools/google-calendar | ✅ |
| gmail_read | productivity | /api/tools/gmail-read | ✅ |
| google_drive | productivity | /api/tools/google-drive | ✅ |

## APIs & Services

### Groq
- Models: Llama 3.3 70B (reasoning), Llama 3.1 8B (fast tasks)
- Also used for: Whisper Large v3 (voice transcription)
- Free tier: 100k tokens/day

### Supabase
- PostgreSQL + pgvector (384 dimensions, HNSW index)
- Edge Function: embed (all-MiniLM-L6-v2)
- 10 tables: conversations, memories, knowledge_facts, proposed_facts, people, goals, tasks, tools, tool_executions, oauth_tokens

### Tavily
- Used for: web_search, news_headlines
- Use process.env.TAVILY_API_KEY directly (not env.ts) due to Edge runtime

### Open-Meteo
- Used for: weather tool
- Free, no API key required
- Geocoding fallback: if "City, Region" fails, retry with city name only

### Upstash Redis
- Rate limiting: slidingWindow(20, "1m") for tools
- Token budget: fixedWindow(100_000, "1d")

### Inngest
- Background jobs: extract-memory, task-runner, reminder, morning-brief, proactive-suggestions, goal-nudge
- Dev UI: http://localhost:8288
- App ID: solus

### LangSmith
- Project: solus
- 248+ traces recorded
- Wraps all route handlers with traceable()

### Telegram
- Bot: @SolusAIbot
- Webhook: https://solus-ai.vercel.app/api/channels/telegram
- Security: x-telegram-bot-api-secret-token header
- Whitelist: only accepts messages from user ID 1870486124
- Supports: text + voice notes (Whisper transcription)

### Google (Phase 8)
- Calendar: read events, create events, check free/busy
- Gmail: list inbox, search emails, read threads
- Drive: search files, read Google Docs
- Scopes: calendar, gmail.readonly, drive.readonly, tasks, contacts.readonly, youtube.readonly, documents.readonly
- Token refresh: automatic via src/lib/google/client.ts

## Planned / Not Yet Built

- Google Tasks tool (API enabled, tool not built)
- Google Contacts tool (API enabled, tool not built)
- stock_price tool (needs ALPHA_VANTAGE_API_KEY)
- Gmail Send tool

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GROQ_API_KEY
TAVILY_API_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
LANGCHAIN_API_KEY
API_SECRET_TOKEN
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_ACCESS_TOKEN
GOOGLE_REFRESH_TOKEN
INNGEST_SIGNING_KEY
INNGEST_EVENT_KEY
NEXT_PUBLIC_APP_URL
```