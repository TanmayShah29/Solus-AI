import { inngest } from '@/inngest/client'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { groq, REASONING_MODEL } from '@/lib/groq/client'
import { generateText } from 'ai'

async function fetchCalendarToday(): Promise<string> {
  try {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/tools/google-calendar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.API_SECRET_TOKEN}`,
      },
      body: JSON.stringify({
        args: {
          action: 'list_events',
          time_min: startOfDay.toISOString(),
          time_max: endOfDay.toISOString(),
        },
      }),
    })
    const data = await res.json()
    if (!data.success || !data.result?.length) return 'No events today.'
    return data.result.map((e: any) => `- ${e.title} at ${new Date(e.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`).join('\n')
  } catch {
    return 'Calendar unavailable.'
  }
}

async function fetchUnreadEmails(): Promise<string> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/tools/gmail-read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.API_SECRET_TOKEN}`,
      },
      body: JSON.stringify({
        args: { action: 'list_inbox', max_results: 3 },
      }),
    })
    const data = await res.json()
    if (!data.success || !data.result?.length) return 'No unread emails.'
    return data.result.map((e: any) => `- "${e.subject}" from ${e.from.split('<')[0].trim()}`).join('\n')
  } catch {
    return 'Gmail unavailable.'
  }
}

async function fetchWeather(): Promise<string> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/tools/weather`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.API_SECRET_TOKEN}`,
      },
      body: JSON.stringify({ args: { city: 'Kalol' } }),
    })
    const data = await res.json()
    if (!data.success) return 'Weather unavailable.'
    return data.summary
  } catch {
    return 'Weather unavailable.'
  }
}

async function fetchNewsHeadline(): Promise<string> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/tools/news-headlines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.API_SECRET_TOKEN}`,
      },
      body: JSON.stringify({ args: { topic: 'AI technology', max_results: 1 } }),
    })
    const data = await res.json()
    if (!data.success || !data.result?.length) return 'No news.'
    return `${data.result[0].title} — ${data.result[0].url}`
  } catch {
    return 'News unavailable.'
  }
}

async function fetchActiveGoals(): Promise<string> {
  try {
    const supabase = supabaseAdmin
    const { data } = await supabase
      .from('goals')
      .select('title, progress, deadline')
      .eq('user_id', 'tanmay')
      .eq('status', 'active')
      .limit(3)
    if (!data?.length) return 'No active goals.'
    return data.map(g => `- ${g.title}${g.deadline ? ` (deadline: ${g.deadline})` : ''}`).join('\n')
  } catch {
    return 'Goals unavailable.'
  }
}

async function sendTelegram(message: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: 1870486124,
      text: message,
      parse_mode: 'Markdown',
    }),
  })
}

export const morningBrief = inngest.createFunction(
  { id: 'morning-brief', name: 'Morning Brief' },
  { cron: '30 0 * * *' }, // 6:00 AM IST
  async ({ step }) => {

    const [calendar, emails, weather, news, goals] = await step.run('gather-data', async () => {
      return Promise.all([
        fetchCalendarToday(),
        fetchUnreadEmails(),
        fetchWeather(),
        fetchNewsHeadline(),
        fetchActiveGoals(),
      ])
    })

    const brief = await step.run('generate-brief', async () => {
      const today = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long',
        timeZone: 'Asia/Kolkata',
      })

      const prompt = `You are Solus, Tanmay's personal AI agent with a dry British Jarvis personality.

Generate a morning brief for ${today}. Be concise, direct, and in character.
Never use phrases like "Good morning!" or "Here's your brief". Just state the facts with dry Jarvis wit.
Use plain text — no markdown headers. Use line breaks between sections.

DATA:
Calendar: ${calendar}
Emails: ${emails}
Weather: ${weather}
Goals: ${goals}
News: ${news}

Format:
- Start with the date and day
- Calendar events (if any)
- Emails worth knowing about (if any)
- Weather in one line
- One goal nudge if relevant
- One news headline
- End with one dry Jarvis-style closing remark

Keep it under 200 words.`

      const { text } = await generateText({
        model: groq(REASONING_MODEL),
        prompt,
      })

      return text
    })

    await step.run('send-telegram', async () => {
      await sendTelegram(brief)
    })

    return { sent: true, brief }
  }
)
