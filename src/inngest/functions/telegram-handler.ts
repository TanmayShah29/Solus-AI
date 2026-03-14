import { inngest } from '@/inngest/client'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { groq, REASONING_MODEL } from '@/lib/groq/client'
import { streamText, type CoreMessage } from 'ai'
import { assembleContext } from '@/lib/memory/context-assembler'
import { buildSystemPrompt } from '@/lib/kernel'
import { loadSkills } from '@/lib/skills/loader'

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
    }).catch(() => { })
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
    const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('role, content')
        .eq('user_id', 'tanmay')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error || !data) return []

    return data.reverse().map(row => ({
        role: row.role as 'user' | 'assistant',
        content: row.content,
    })) as CoreMessage[]
}

export const telegramHandler = inngest.createFunction(
    { id: "telegram-handler", concurrency: 1 },
    { event: "telegram/message.received" },
    async ({ event, step }) => {
        const { message, chatId, messageId, telegramUserId } = event.data

        const typingInterval = setInterval(() => sendTypingIndicator(chatId), 4000)

        try {
            let userMessage = message.text || message.caption || ''
            let imageBase64 = null
            const imageMimeType = 'image/jpeg'

            if (message.photo) {
                imageBase64 = await step.run("download-photo", async () => {
                    const photo = message.photo[message.photo.length - 1]
                    const fileRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${photo.file_id}`)
                    const fileData = await fileRes.json()
                    const filePath = fileData.result?.file_path
                    if (!filePath) return null
                    
                    const imageRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`)
                    const imageBuffer = await imageRes.arrayBuffer()
                    return Buffer.from(imageBuffer).toString('base64')
                })
                userMessage = userMessage || 'Explain this image.'
            }

            if (message.voice) {
                userMessage = await step.run("transcribe-voice", async () => {
                    const fileRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${message.voice.file_id}`)
                    const fileData = await fileRes.json()
                    const filePath = fileData.result?.file_path
                    if (!filePath) return null

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
                        return transcribeData.text
                    }
                    return null
                })
            }

            if (!userMessage && !imageBase64) {
                clearInterval(typingInterval)
                return { ok: true }
            }

            const context = await step.run("assemble-context", async () => {
                return assembleContext(env.MY_USER_ID, userMessage || "Explain this image.")
            })

            const history = await step.run("get-history", async () => {
                return getTelegramHistory(chatId)
            })

            const systemPrompt = buildSystemPrompt(context) + `

## Vision
When Tanmay shares an image:
- Describe what you see concisely and relevantly
- Never say "I can see an image" — just respond to what's in it`;

            const tools = loadSkills(null)
            const VISION_MODEL = 'llama-3.2-90b-vision-preview'
            
            const historyMessages = (history as any[]).map(m => ({
                role: m.role,
                content: m.content
            }))

            const userContentPart: any = imageBase64
                ? [
                    { type: 'image' as const, image: imageBase64, mimeType: imageMimeType },
                    { type: 'text' as const, text: userMessage },
                ]
                : userMessage;

            const messages: CoreMessage[] = [
                ...historyMessages,
                { role: 'user', content: userContentPart }
            ] as any[];

            let toolUsed = false
            const result = streamText({
                model: groq(imageBase64 ? VISION_MODEL : REASONING_MODEL),
                system: systemPrompt,
                messages: messages as any,
                tools,
                maxSteps: 8,
                onChunk: async ({ chunk }) => {
                    if (chunk.type === 'tool-call' && !toolUsed) {
                        toolUsed = true
                        await sendReaction(chatId, messageId, '🔍')
                    }
                },
            })

            const text = await result.text;
            clearInterval(typingInterval)

            // Send response
            await step.run("send-response", async () => {
                if (text.trim()) {
                    await sendTelegramMessage(chatId, text)
                    await sendReaction(chatId, messageId, '✅')
                }
            })

            // Save history & trigger memory extraction
            await step.run("save-and-extract", async () => {
                const sessionId = `telegram_${chatId}`
                await Promise.all([
                    supabaseAdmin.from('conversations').insert([
                        { user_id: env.MY_USER_ID, session_id: sessionId, channel: 'telegram', role: 'user', content: userMessage || "[Image]" },
                        { user_id: env.MY_USER_ID, session_id: sessionId, channel: 'telegram', role: 'assistant', content: text }
                    ]),
                    inngest.send({
                        name: 'solus/turn.completed',
                        data: { userId: env.MY_USER_ID, userMessage: userMessage || "[Image]", assistantResponse: text },
                    })
                ])
            })

            return { ok: true }
        } catch (error) {
            clearInterval(typingInterval)
            await sendReaction(chatId, messageId, '⚡')
            throw error
        }
    }
)
