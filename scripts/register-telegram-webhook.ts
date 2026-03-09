import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const token = process.env.TELEGRAM_BOT_TOKEN
const secret = process.env.TELEGRAM_SECRET_TOKEN
const appUrl = process.env.NEXT_PUBLIC_APP_URL

async function registerWebhook() {
    const webhookUrl = `${appUrl}/api/channels/telegram`

    console.log(`Registering webhook: ${webhookUrl}`)

    const response = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                secret_token: secret,
                allowed_updates: ['message'],
                drop_pending_updates: true,
            }),
        }
    )

    const data = await response.json()
    console.log('Webhook registration result:', JSON.stringify(data, null, 2))

    // Verify
    const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const infoData = await info.json()
    console.log('Webhook info:', JSON.stringify(infoData, null, 2))
}

registerWebhook()
