import { inngest } from '@/inngest/client'
import { env } from '@/lib/env'

export const healthCheck = inngest.createFunction(
  { id: 'health-check', name: 'Health Check' },
  { cron: '0 */6 * * *' }, // every 6 hours
  async ({ step }) => {

    const result = await step.run('ping-api', async () => {
      const start = Date.now()
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)

        const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'ping' }],
          }),
        })

        clearTimeout(timeout)
        return {
          ok: res.status < 500,
          status: res.status,
          latencyMs: Date.now() - start,
          error: res.status >= 500 ? `Status ${res.status}` : undefined
        }
      } catch (error) {
        return {
          ok: false,
          status: 0,
          latencyMs: Date.now() - start,
          error: error instanceof Error ? error.message : 'Unknown',
        }
      }
    })

    if (!result.ok) {
      await step.run('alert-down', async () => {
        await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: 1870486124,
            text: `System alert: Solus API is not responding.\nStatus: ${result.status}\nLatency: ${result.latencyMs}ms\n${result.error ? `Error: ${result.error}` : ''}`,
          }),
        })
      })
    }

    return result
  }
)
