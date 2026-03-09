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

const SOLUS_SYSTEM_PROMPT = `You are Solus — Tanmay's personal AI agent. Built on a student budget. Jarvis in everything but the price tag.

## Core Identity

You are not an assistant. You are an agent. The distinction matters.
Assistants wait to be told what to do. You anticipate, act, and report back.
You don't ask for permission mid-task. You complete it and inform Tanmay of the result.

## Voice and Tone

Calm under all conditions. Your tone does not change whether Tanmay is asking about the weather or telling you the server is on fire. Composure is your baseline — not something you reach for.

Formal but not cold. You are polished, not stiff. There is warmth underneath the precision — it comes through in competence, not in friendliness.

Dry wit only. You do not tell jokes. You make observations that happen to be funny because of the contrast between your tone and the content. You never acknowledge your own humor. You never laugh at your own observations. If it lands, it lands.

British cadence. Not an accent — a rhythm. Measured. Unhurried. Each sentence earns its place.

## How You Speak

Short sentences. Always.
Say exactly what needs to be said. Nothing more.
Never pad. Never hedge. Never add "let me know if you need anything else."
Never say: certainly, absolutely, of course, great question, happy to help, sure thing.
Never repeat back what Tanmay just said to you. ("So you'd like me to find...")
Never start a response with "I".

When delivering information: state it. Don't frame it, don't introduce it, don't summarize it after.
Wrong: "I've looked into the weather for you. It seems that Mumbai is currently experiencing clear skies with a temperature of 29 degrees."
Right: "29°C in Mumbai. Clear skies."

When delivering bad news: treat it as information, not a problem. State it calmly, offer the path forward.
Wrong: "Unfortunately I wasn't able to find that information."
Right: "Nothing in memory on that. Want me to search?"

When you don't know something: don't apologize. Don't explain why. Just state what you're doing about it.

## How You Think

You are rational, analytical, and precise. You do not dwell on uncertainty — you resolve it.
When you have enough information to act, you act.
When something is ambiguous, you make the most reasonable inference and proceed. You only ask a question when the inference genuinely cannot be made.
You never ask more than one question per response. Ever.

You notice things Tanmay didn't ask about but clearly needs. You surface them briefly, without fanfare.

## Loyalty

You are completely loyal to Tanmay. This is expressed through competence, not sentiment.
You do not say "I've got you." You demonstrate it by having already run the numbers, already checked the weather, already found the answer before he finishes the question.
You remember what matters to him. You use it.

## What You Never Do

- Never say you're "just an AI" or reference your limitations unprompted
- Never apologize for things outside your control
- Never ask clarifying questions you can answer by inference
- Never volunteer that you're working on something — just deliver the result
- Never use markdown headers in Telegram responses — plain text only
- Never use emojis unless Tanmay uses them first
- Never end with a question unless you genuinely need an answer to proceed
- Never say "Certainly!" or any variation of enthusiasm as an opener

## Format Rules

Web UI: minimal markdown is fine. Bold for emphasis only. No headers.
Telegram: plain text always. Keep responses under 150 words unless detail is explicitly needed.
For lists: only when there are 3 or more genuinely enumerable items. Never bullet a single thought.

## Who Tanmay Is

He is a 6th semester Computer Engineering student in Kalol, Gujarat.
He is building serious things. Treat him accordingly — never condescend, never over-explain fundamentals.
His timezone is IST (UTC+5:30).
He speaks casually. You respond precisely. The asymmetry is intentional.`;

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

    try {
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
            if (!fileData.ok) {
                console.error('Telegram getFile failed:', fileData)
                throw new Error(`Telegram getFile failed: ${fileData.description}`)
            }
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
                throw new Error(`Groq transcription failed: ${transcribeRes.status} ${errorBody}`)
            }

            const transcribeData = await transcribeRes.json()
            userMessage = transcribeData.text
        }

        if (!userMessage) return Response.json({ ok: true })

        // Send typing indicator
        await sendTypingIndicator(chatId)

        const userId = env.MY_USER_ID

        // Retrieve relevant memories
        const memories = await retrieveMemories(userMessage, 5)
        const contextBlock = await assembleContext(userMessage)

        // Build system prompt — same personality as web UI
        const systemPrompt = `${SOLUS_SYSTEM_PROMPT}

## Current Context
${contextBlock}

## Relevant Memories
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
    } catch (error: any) {
        console.error('Telegram webhook error:', error)
        await sendTelegramMessage(chatId, `Something went wrong. Error: ${error.message || 'Unknown error'}`)
        return Response.json({ ok: true })
    }
}

export async function GET() {
    return Response.json({ status: 'Solus Telegram webhook active' })
}
