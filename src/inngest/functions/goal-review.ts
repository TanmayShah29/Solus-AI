import { inngest } from '@/inngest/client'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { groq, REASONING_MODEL } from '@/lib/groq/client'
import { generateText } from 'ai'

export const goalReview = inngest.createFunction(
  { id: 'goal-review', name: 'Weekly Goal Review' },
  { cron: '30 13 * * 0' }, // Sunday 7 PM IST (13:30 UTC)
  async ({ step }) => {

    const supabase = supabaseAdmin

    const goals = await step.run('fetch-goals', async () => {
      const { data } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', 'tanmay')
        .eq('status', 'active')
      return data ?? []
    })

    if (!goals.length) return { skipped: 'no active goals' }

    const recentMemories = await step.run('fetch-memories', async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('memories')
        .select('content, created_at')
        .eq('user_id', 'tanmay')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(30)
      return data ?? []
    })

    const review = await step.run('generate-review', async () => {
      const prompt = `You are Solus, Tanmay's personal AI agent. Dry, direct, Jarvis-like.

Active goals:
${goals.map(g => `- ${g.title}: ${g.description ?? 'no description'}${g.deadline ? ` (deadline: ${g.deadline})` : ''}`).join('\n')}

What happened this week (from memory):
${recentMemories.map(m => `- ${m.content}`).join('\n') || 'Nothing recorded this week.'}

Write a weekly goal review in plain text. For each goal:
- State if there was progress this week or not
- Give one specific next action
- Be direct and brief — max 2 sentences per goal

End with one overall observation about the week. Keep it under 150 words total.
No headers. No bullet points for the goals — write in short paragraphs.`

      const { text } = await generateText({
        model: groq(REASONING_MODEL),
        prompt,
      })
      return text
    })

    await step.run('send-review', async () => {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: 1870486124,
          text: `*Weekly Review — ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}*\n\n${review}`,
          parse_mode: 'Markdown',
        }),
      })
    })

    return { sent: true, goalsReviewed: goals.length }
  }
)
