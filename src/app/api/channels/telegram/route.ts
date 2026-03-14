import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { groq, REASONING_MODEL } from '@/lib/groq/client'
import { streamText, type CoreMessage } from 'ai'
import { assembleContext } from '@/lib/memory/context-assembler'
import { inngest } from '@/inngest/client'
import { buildSystemPrompt } from '@/lib/kernel'
import { loadSkills } from '@/lib/skills/loader'
import { getErrorMessage } from '@/lib/errors/messages'

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
        body: JSON.stringify({
            chat_id: chatId,
            action: 'typing',
        }),
    }).catch(() => { }) // never let this crash the main flow
}

async function sendReaction(chatId: number, messageId: number, emoji: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMessageReaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            reaction: [{ type: 'emoji', emoji }],
        }),
    }).catch(() => { })
}

async function getTelegramHistory(chatId: number, limit = 10): Promise<CoreMessage[]> {
    const sessionId = `telegram_${chatId}`
    const supabase = supabaseAdmin;

    const { data, error } = await supabase
        .from('conversations')
        .select('role, content')
        .eq('user_id', 'tanmay')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error || !data) return []

    // Reverse to get chronological order
    return data.reverse().map(row => ({
        role: row.role as 'user' | 'assistant',
        content: row.content,
    })) as CoreMessage[]
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
    const messageId = message.message_id
    const telegramUserId = message.from.id.toString()

    // Only respond to Tanmay
    if (telegramUserId !== env.MY_TELEGRAM_ID) {
        await sendTelegramMessage(chatId, "I only respond to Tanmay.")
        return Response.json({ ok: true })
    }

    const sessionId = `telegram_${chatId}`
    await sendTypingIndicator(chatId)
    const typingInterval = setInterval(() => sendTypingIndicator(chatId), 4000)

    try {
        // Extract message content — handle text, voice, and photos
        let userMessage: string | null = null
        let imageBase64: string | null = null
        const imageMimeType = 'image/jpeg'

        if (message.text) {
            userMessage = message.text
        } else if (message.photo) {
            const photo = message.photo[message.photo.length - 1]
            const fileRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${photo.file_id}`)
            const fileData = await fileRes.json()
            const filePath = fileData.result?.file_path
            if (filePath) {
                const imageRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`)
                const imageBuffer = await imageRes.arrayBuffer()
                imageBase64 = Buffer.from(imageBuffer).toString('base64')
                userMessage = message.caption || 'Explain this image.'
            }
        } else if (message.voice) {
            const fileRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${message.voice.file_id}`)
            const fileData = await fileRes.json()
            const filePath = fileData.result?.file_path
            if (filePath) {
                const audioRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`)
                const audioBuffer = await audioRes.arrayBuffer()
                const formData = new FormData()
                formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg; codecs=opus' }), 'voice.ogg')
                formData.append('model', 'whisper-large-v3')
                formData.append('language', 'en')
                const transcribeRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
                    body: formData,
                })
                if (transcribeRes.ok) {
                    const transcribeData = await transcribeRes.json()
                    userMessage = transcribeData.text
                }
            }
        }

        if (!userMessage && !imageBase64) {
            clearInterval(typingInterval)
            return Response.json({ ok: true })
        }

        // Load history and context
        const [history, context] = await Promise.all([
            getTelegramHistory(chatId),
            assembleContext(env.MY_USER_ID, userMessage || "Explain this image.")
        ])

        const systemPrompt = buildSystemPrompt(context) + `

## Vision

When Tanmay shares an image:
- Describe what you see concisely and relevantly
- If it's code: identify the language, spot issues, suggest improvements
- If it's a screenshot: describe what's happening on screen
- If it's a document: extract the key information
- If it's a photo: describe it naturally
- Never say "I can see an image" — just respond to what's in it`;

        const tools = loadSkills(null);
        const hasImage = !!imageBase64
        const VISION_MODEL = 'llama-3.2-90b-vision-preview'

        const userContent: any = imageBase64
            ? [
                { type: 'image' as const, image: imageBase64, mimeType: imageMimeType },
                { type: 'text' as const, text: userMessage || 'Explain this image.' },
            ]
            : userMessage!;

        const messages: CoreMessage[] = [...history, { role: 'user' as const, content: userContent }]

        // Send placeholder
        const placeholderRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: '...', parse_mode: 'Markdown' }),
        })
        const placeholderData = await placeholderRes.json()
        const botMessageId = placeholderData.result?.message_id

        let fullText = ''
        let lastEditTime = 0
        let toolUsed = false
        const EDIT_INTERVAL = 1000

        const result = streamText({
            model: groq(hasImage ? VISION_MODEL : REASONING_MODEL),
            system: systemPrompt,
            messages,
            tools,
            maxSteps: 8,
            onChunk: async ({ chunk }) => {
                if (chunk.type === 'text-delta') {
                    fullText += chunk.textDelta
                    const now = Date.now()
                    if (now - lastEditTime > EDIT_INTERVAL && fullText.trim()) {
                        lastEditTime = now
                        await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                message_id: botMessageId,
                                text: fullText + ' ▌',
                                parse_mode: 'Markdown',
                            }),
                        }).catch(() => { })
                    }
                } else if (chunk.type === 'tool-call' && !toolUsed) {
                    toolUsed = true
                    await sendReaction(chatId, messageId, '🔍')
                }
            },
            onFinish: async ({ text }) => {
                fullText = text
            },
        })

        await result.text
        clearInterval(typingInterval)

        // Final edit
        if (botMessageId && fullText.trim()) {
            await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: botMessageId,
                    text: fullText,
                    parse_mode: 'Markdown',
                }),
            })
            await sendReaction(chatId, messageId, '✅')
        }

        // Save conversation history and trigger memory extraction
        const supabase = supabaseAdmin
        await Promise.all([
            supabase.from('conversations').insert([
                { user_id: env.MY_USER_ID, session_id: sessionId, channel: 'telegram', role: 'user', content: userMessage || "[Image]" },
                { user_id: env.MY_USER_ID, session_id: sessionId, channel: 'telegram', role: 'assistant', content: fullText }
            ]),
            inngest.send({
                name: 'solus/turn.completed',
                data: { userId: env.MY_USER_ID, userMessage: userMessage || "[Image]", assistantResponse: fullText },
            })
        ])

        return Response.json({ ok: true })
    } catch (error: any) {
        clearInterval(typingInterval)
        await sendReaction(chatId, messageId, '⚡')
        console.error('Telegram webhook error:', error)
        const errorMessage = getErrorMessage(error)
        await sendTelegramMessage(chatId, errorMessage)
        return Response.json({ ok: true })
    }
}

export async function GET() {
    return Response.json({ status: 'Solus Telegram webhook active' })
}
