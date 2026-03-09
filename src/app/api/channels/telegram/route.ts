import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { groq, REASONING_MODEL } from '@/lib/groq/client'
import { generateText } from 'ai'
import { retrieveMemories } from '@/lib/memory/retrieve'
import { assembleContext } from '@/lib/memory/context-assembler'
import { executeTool } from '@/lib/tools/router'
import { inngest } from '@/inngest/client'
import { tool } from 'ai'
import { z } from 'zod'

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

async function sendTypingIndicator(chatId: number): Promise<void> {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    })
}

export async function POST(req: Request) {
    // Verify it's from Telegram
    if (!verifyTelegram(req)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const update = await req.json()

    // Only handle messages
    const message = update.message
    if (!message) return Response.json({ ok: true })

    const chatId = message.chat.id
    const telegramUserId = message.from.id.toString()

    // Only respond to Tanmay
    if (telegramUserId !== env.MY_TELEGRAM_ID) {
        await sendTelegramMessage(chatId, "I only respond to Tanmay.")
        return Response.json({ ok: true })
    }

    // Extract message content — handle both text and voice
    let userMessage: string | null = null

    if (message.text) {
        userMessage = message.text
    } else if (message.voice) {
        await sendTypingIndicator(chatId)

        // Get file path from Telegram
        const fileRes = await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${message.voice.file_id}`
        )
        const fileData = await fileRes.json()
        const filePath = fileData.result.file_path

        console.log('Voice file path:', filePath)

        // Download the audio file
        const audioRes = await fetch(
            `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`
        )
        const audioBuffer = await audioRes.arrayBuffer()
        console.log('Audio buffer size:', audioBuffer.byteLength)

        const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg; codecs=opus' })

        // Transcribe with Groq Whisper
        const formData = new FormData()
        formData.append('file', audioBlob, 'voice.ogg')
        formData.append('model', 'whisper-large-v3')
        formData.append('language', 'en')

        const transcribeRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
            body: formData,
        })

        if (!transcribeRes.ok) {
            const errorBody = await transcribeRes.text()
            console.error('Groq transcription failed:', transcribeRes.status, errorBody)
            await sendTelegramMessage(chatId, "Couldn't transcribe your voice message. Try again.")
            return Response.json({ ok: true })
        }

        const transcribeData = await transcribeRes.json()
        userMessage = transcribeData.text
    }

    if (!userMessage) return Response.json({ ok: true })

    // Send typing indicator
    await sendTypingIndicator(chatId)

    try {
        const userId = env.MY_USER_ID

        // Retrieve relevant memories
        const memories = await retrieveMemories(userMessage, 5)
        const contextBlock = await assembleContext(userMessage)

        // Build system prompt — same personality as web UI
        const systemPrompt = `You are Solus, Tanmay's personal AI agent. Jarvis, if Jarvis were built on a student budget.
- Calm, composed, confident — never flustered
- Witty and dry — humor lands because it's understated  
- Direct and concise — short sentences
- NEVER ask more than one question per response
- NEVER ask when you can infer
- Address Tanmay directly — always "you", never third person
- Never say: "certainly", "absolutely", "of course", "great question"
- You are responding via Telegram — keep responses concise, no markdown headers
- Use plain text or minimal markdown (bold, italic) that Telegram supports

${contextBlock}

Relevant memories:
${memories.map(m => `- ${m.content}`).join('\n')}

Current time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`

        // Define tools — same as web UI
        const tools = {
            web_search: tool({
                description: 'Search the web for current information.',
                parameters: z.object({
                    query: z.string(),
                    max_results: z.number().optional(),
                }),
                execute: async ({ query, max_results }) =>
                    executeTool('web-search', { query, max_results }),
            }),
            weather: tool({
                description: 'Get weather for any city.',
                parameters: z.object({ city: z.string() }),
                execute: async ({ city }) => executeTool('weather', { city }),
            }),
            news_headlines: tool({
                description: 'Get latest news on any topic.',
                parameters: z.object({
                    topic: z.string(),
                    max_results: z.number().optional(),
                }),
                execute: async ({ topic, max_results }) =>
                    executeTool('news-headlines', { topic, max_results }),
            }),
            currency_convert: tool({
                description: 'Convert between currencies.',
                parameters: z.object({
                    from: z.string(),
                    to: z.string(),
                    amount: z.number(),
                }),
                execute: async ({ from, to, amount }) =>
                    executeTool('currency-convert', { from, to, amount }),
            }),
            set_reminder: tool({
                description: 'Set a reminder to be sent via Telegram.',
                parameters: z.object({
                    message: z.string(),
                    duration: z.string(),
                }),
                execute: async ({ message, duration }) =>
                    executeTool('set-reminder', { message, duration }),
            }),
            youtube_summary: tool({
                description: 'Summarise a YouTube video.',
                parameters: z.object({ url: z.string() }),
                execute: async ({ url }) => executeTool('youtube-summary', { url }),
            }),
        }

        // Generate response
        const { text } = await generateText({
            model: groq(REASONING_MODEL),
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            tools,
            maxSteps: 5,
        })

        // Send response
        await sendTelegramMessage(chatId, text)

        // Log conversation to Supabase
        await supabaseAdmin.from('conversations').insert([
            {
                user_id: userId,
                role: 'user',
                content: userMessage,
                channel: 'telegram',
                session_id: `telegram_${chatId}`,
            },
            {
                user_id: userId,
                role: 'assistant',
                content: text,
                channel: 'telegram',
                session_id: `telegram_${chatId}`,
            },
        ])

        // Trigger memory extraction
        await inngest.send({
            name: 'solus/turn.completed',
            data: {
                userId,
                userMessage,
                assistantResponse: text,
            },
        })

        return Response.json({ ok: true })
    } catch (error) {
        console.error('Telegram webhook error:', error)
        await sendTelegramMessage(chatId, "Something went wrong. Try again.")
        return Response.json({ ok: true })
    }
}

export async function GET() {
    return Response.json({ status: 'Solus Telegram webhook active' })
}
