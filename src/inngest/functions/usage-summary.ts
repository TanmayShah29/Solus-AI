import { inngest } from '@/inngest/client'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const usageSummary = inngest.createFunction(
  { id: 'usage-summary', name: 'Daily Usage Summary' },
  { cron: '30 17 * * *' }, // 11 PM IST (17:30 UTC)
  async ({ step }) => {
    const supabase = supabaseAdmin
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const summary = await step.run('compile-summary', async () => {
      const [conversations, toolExecutions, memories] = await Promise.all([
        supabase
          .from('conversations')
          .select('role', { count: 'exact' })
          .eq('user_id', 'tanmay')
          .gte('created_at', today.toISOString()),

        supabase
          .from('tool_executions')
          .select('tool_name, success, duration_ms')
          .eq('user_id', 'tanmay')
          .gte('created_at', today.toISOString()),

        supabase
          .from('memories')
          .select('id', { count: 'exact' })
          .eq('user_id', 'tanmay')
          .gte('created_at', today.toISOString()),
      ])

      const messageCount = conversations.count ?? 0
      const tools = toolExecutions.data ?? []
      const toolCount = tools.length
      const failedTools = tools.filter(t => !t.success).length
      const avgLatency = tools.length
        ? Math.round(tools.reduce((a, b) => a + (b.duration_ms ?? 0), 0) / tools.length)
        : 0
      const memoryCount = memories.count ?? 0

      const topTools = Object.entries(
        tools.reduce((acc: Record<string, number>, t) => {
          acc[t.tool_name] = (acc[t.tool_name] ?? 0) + 1
          return acc
        }, {})
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => `${name} (${count}x)`)
        .join(', ')

      return { messageCount, toolCount, failedTools, avgLatency, memoryCount, topTools }
    })

    // Only send if there was activity today
    if (summary.messageCount === 0) return { skipped: 'no activity today' }

    await step.run('send-summary', async () => {
      const text = [
        `Day summary:`,
        `${summary.messageCount} messages, ${summary.toolCount} tool calls${summary.failedTools > 0 ? ` (${summary.failedTools} failed)` : ''}.`,
        summary.topTools ? `Most used: ${summary.topTools}.` : '',
        summary.avgLatency ? `Avg tool latency: ${summary.avgLatency}ms.` : '',
        `${summary.memoryCount} new memories stored.`,
      ].filter(Boolean).join(' ')

      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: 1870486124,
          text,
        }),
      })
    })

    return summary
  }
)
