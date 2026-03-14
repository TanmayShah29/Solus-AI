import { inngest } from '@/inngest/client'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { groq, REASONING_MODEL } from '@/lib/groq/client'
import { generateText } from 'ai'

async function sendTelegram(message: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: 1870486124,
      text: message,
    }),
  })
}

export const proactiveMonitor = inngest.createFunction(
  { id: 'proactive-monitor', name: 'Proactive Monitor' },
  { cron: '0 * * * *' }, // every hour
  async ({ step }) => {

    const istHour = new Date().toLocaleString('en-IN', {
      hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata'
    })
    const hour = parseInt(istHour)

    // Only run between 8 AM and 11 PM IST — don't disturb sleep
    if (hour < 8 || hour >= 23) return { skipped: 'outside active hours' }

    const supabase = supabaseAdmin

    // Check 1 — any unread emails from important senders
    await step.run('check-important-emails', async () => {
      try {
        const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/tools/gmail-read`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.API_SECRET_TOKEN}`,
          },
          body: JSON.stringify({
            args: {
              action: 'search_emails',
              query: 'is:unread (from:github.com OR from:vercel.com OR subject:assignment OR subject:exam OR subject:urgent)',
              max_results: 3,
            },
          }),
        })
        const data = await res.json()
        if (data.success && data.result?.length > 0) {
          const subjects = data.result.map((e: any) => `"${e.subject}"`).join(', ')
          await sendTelegram(`Unread: ${subjects}`)
        }
      } catch {
        // best effort
      }
    })

    // Check 2 — upcoming calendar event in next 30 minutes
    await step.run('check-upcoming-events', async () => {
      try {
        const now = new Date()
        const in30 = new Date(now.getTime() + 30 * 60 * 1000)

        const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/tools/google-calendar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.API_SECRET_TOKEN}`,
          },
          body: JSON.stringify({
            args: {
              action: 'list_events',
              time_min: now.toISOString(),
              time_max: in30.toISOString(),
            },
          }),
        })
        const data = await res.json()
        if (data.success && data.result?.length > 0) {
          const event = data.result[0]
          const startTime = new Date(event.start).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
          })
          await sendTelegram(`${event.title} starts at ${startTime}.`)
        }
      } catch {
        // best effort
      }
    })

    // Check 3 — goal stale for 7+ days
    await step.run('check-stale-goals', async () => {
      // Only run this check once a day at 7 PM IST
      if (hour !== 19) return

      const { data: goals } = await supabase
        .from('goals')
        .select('id, title, created_at')
        .eq('user_id', 'tanmay')
        .eq('status', 'active')

      if (!goals?.length) return

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      for (const goal of goals) {
        // Check if this goal has been mentioned in memories recently
        const { data: mentions } = await supabase
          .from('memories')
          .select('id')
          .eq('user_id', 'tanmay')
          .ilike('content', `%${goal.title.split(' ')[0]}%`)
          .gte('created_at', sevenDaysAgo)
          .limit(1)

        if (!mentions?.length) {
          await sendTelegram(`"${goal.title}" hasn't come up in a week. Still on?`)
          break // only one nudge per check
        }
      }
    })

    return { checked: true, hour }
  }
)
