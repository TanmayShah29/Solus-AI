import { env } from '@/lib/env'
import { traceable } from 'langsmith/traceable'

export const POST = traceable(async (req: Request) => {
    const start = Date.now()
    try {
        const secret = req.headers.get('authorization')
        if (secret !== `Bearer ${env.API_SECRET_TOKEN}`) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { args } = await req.json()
        if (!args?.message) {
            return Response.json({ error: 'message required' }, { status: 400 })
        }

        const response = await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: env.MY_TELEGRAM_ID,
                    text: args.message,
                    parse_mode: 'Markdown',
                }),
            }
        )

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Telegram API Error:', errorData);
            throw new Error(`Telegram send failed: ${errorData.description || response.statusText}`);
        }
        const data = await response.json()

        return Response.json({
            success: true,
            result: { message_id: data.result.message_id },
            summary: `Sent Telegram message to Tanmay: "${args.message.slice(0, 50)}..."`,
            duration_ms: Date.now() - start,
        })
    } catch (error) {
        return Response.json({
            success: false,
            result: null,
            summary: `Tool failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            duration_ms: Date.now() - start,
        }, { status: 500 })
    }
}, { name: 'tool_telegram_send' })
