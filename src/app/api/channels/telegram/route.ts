import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { groq, REASONING_MODEL } from '@/lib/groq/client'
import { generateText } from 'ai'
import { retrieveMemories } from '@/lib/memory/retrieve'
import { getContextBlock } from '@/lib/memory/context-assembler'
import { inngest } from '@/inngest/client'
import { buildSystemPrompt, type ContextBlock } from '@/lib/kernel'
import { loadSkills } from '@/lib/skills/loader'

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
                throw new Error(`Telegram getFile failed: ` + fileData.description)
            }
            const filePath = fileData.result.file_path

            console.log('Voice file path:', filePath)

            // Download the audio file
            const audioRes = await fetch(
                `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/` + filePath
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
                headers: { 'Authorization': `Bearer ` + env.GROQ_API_KEY },
                body: formData,
            })

            if (!transcribeRes.ok) {
                const errorBody = await transcribeRes.text()
                console.error('Groq transcription failed:', transcribeRes.status, errorBody)
                throw new Error(`Groq transcription failed: ` + transcribeRes.status + ` ` + errorBody)
            }

            const transcribeData = await transcribeRes.json()
            userMessage = transcribeData.text
        }

        if (!userMessage) return Response.json({ ok: true })

        // Send typing indicator
        await sendTypingIndicator(chatId)

        const userId = env.MY_USER_ID

        // Retrieve relevant context (memories, tasks, people)
        const { memories, activeTasks, relevantPeople } = await getContextBlock(userMessage)

        const context: ContextBlock = {
            memories,
            activeTasks,
            relevantPeople,
            currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        };

        const systemPrompt = buildSystemPrompt(context);

        // Define tools — same as web UI
        const tools = loadSkills(null);

        // Generate response
        const { text } = await generateText({
            model: groq(REASONING_MODEL),
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            tools,
            maxSteps: 8,
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
        const message = error instanceof Error ? error.message : String(error)

        let recoveryMessage = "Something went wrong, sir. I'm looking into it."

        if (message.includes('rate_limit') || message.includes('429')) {
            recoveryMessage = "Groq is rate-limiting us. Give me ten minutes."
        } else if (message.includes('ECONNREFUSED') || message.includes('fetch')) {
            recoveryMessage = "Can't reach the server right now. Try again in a moment."
        } else if (message.includes('quota') || message.includes('100k')) {
            recoveryMessage = "Daily token limit hit. Resets at midnight IST."
        } else if (message.includes('whisper') || message.includes('transcri')) {
            recoveryMessage = "Couldn't process the voice note. Send it as text and I'll handle it."
        }

        await sendTelegramMessage(chatId, recoveryMessage)
        return Response.json({ ok: true })
    }
}

export async function GET() {
    return Response.json({ status: 'Solus Telegram webhook active' })
}
