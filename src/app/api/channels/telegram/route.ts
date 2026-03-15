import { env } from '@/lib/env'
import { inngest } from '@/inngest/client'
import { redis } from '@/lib/redis/client'

export async function POST(req: Request) {
  try {
    // 1. Security check — must happen before anything else
    const secret = req.headers.get('x-telegram-bot-api-secret-token')
    if (secret !== env.TELEGRAM_SECRET_TOKEN) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await req.json()
    const message = body.message

    // Ignore non-message updates
    if (!message) return Response.json({ ok: true })

    // 2. Deduplication — ignore messages we've already processed
    const messageId = message.message_id
    if (messageId) {
      const dedupeKey = `telegram:processed:${messageId}`
      const alreadyProcessed = await redis.get(dedupeKey)
      if (alreadyProcessed) {
        console.log(`[Telegram] Duplicate message ${messageId} — skipping`)
        return Response.json({ ok: true })
      }
      // Mark as processed for 24 hours
      await redis.set(dedupeKey, '1', { ex: 86400 })
    }

    // 3. Whitelist check
    if (message.from?.id.toString() !== env.MY_TELEGRAM_ID) {
      return Response.json({ ok: true })
    }

    // 4. Fire and forget — send to Inngest for async processing
    // This acknowledges the request to Telegram within milliseconds, preventing retries.
    await inngest.send({
      name: 'solus/telegram.message',
      data: { message },
    })

    // 5. Respond to Telegram immediately — within milliseconds
    return Response.json({ ok: true })

  } catch (error) {
    console.error('Telegram webhook error:', error)
    // Always return 200 to Telegram to stop retries on malformed JSON or other early errors
    return Response.json({ ok: true })
  }
}

export async function GET() {
  return Response.json({ status: 'Solus Telegram webhook active' })
}
