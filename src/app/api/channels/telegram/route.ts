import { env } from '@/lib/env'
import { inngest } from '@/inngest/client'

// Verify request is from Telegram
function verifyTelegram(req: Request): boolean {
    const secret = req.headers.get('x-telegram-bot-api-secret-token')
    return secret === env.TELEGRAM_SECRET_TOKEN
}

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
        }),
    })
}

export async function POST(req: Request) {
    // 1. Immediate verification
    if (!verifyTelegram(req)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const update = await req.json()
        const message = update.message
        
        // If not a message (e.g. edited_message, callback_query), just acknowledge
        if (!message) return Response.json({ ok: true })

        const chatId = message.chat.id
        const messageId = message.message_id
        const telegramUserId = message.from.id.toString()

        // 2. Whitelist check
        if (telegramUserId !== env.MY_TELEGRAM_ID) {
            // No need to even send a message back if it's not you, but for UX we can
            await sendTelegramMessage(chatId, "I only respond to Tanmay.")
            return Response.json({ ok: true })
        }

        // 3. Delegate to Inngest for background processing
        // This acknowledges the request to Telegram within milliseconds, preventing retries.
        await inngest.send({
            name: "telegram/message.received",
            data: {
                message,
                chatId,
                messageId,
                telegramUserId
            }
        })

        // 4. Return 200 OK immediately
        return Response.json({ ok: true })
    } catch (error) {
        console.error('Telegram webhook entry error:', error)
        // Still return 200 to Telegram to stop retries on malformed JSON or other early errors
        return Response.json({ ok: true })
    }
}

export async function GET() {
    return Response.json({ status: 'Solus Telegram webhook active' })
}
