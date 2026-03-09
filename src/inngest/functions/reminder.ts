import { inngest } from '@/inngest/client'
import { env } from '@/lib/env'

export const reminderJob = inngest.createFunction(
    { id: 'reminder-job' },
    { event: 'solus/reminder.created' },
    async ({ event, step }) => {
        const { message, delayMs, reminderId } = event.data

        // Sleep for the specified duration
        await step.sleep('wait-for-reminder', delayMs)

        // Send Telegram message
        await step.run('send-reminder', async () => {
            const response = await fetch(
                `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: env.MY_TELEGRAM_ID,
                        text: `⏰ *Reminder*\n\n${message}`,
                        parse_mode: 'Markdown',
                    }),
                }
            )
            if (!response.ok) throw new Error('Telegram send failed')
            return { sent: true, message }
        })

        return { reminderId, message, status: 'delivered' }
    }
)
