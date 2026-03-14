import { inngest } from '@/inngest/client'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { groq, google, REASONING_MODEL, FAST_MODEL, GEMINI_MODEL, isGroqLimited, markGroqLimited } from '@/lib/groq/client'
import { generateText, type CoreMessage } from 'ai'
import { getErrorMessage } from '@/lib/errors/messages'
import { assembleContext } from '@/lib/memory/context-assembler'
import { buildSystemPrompt } from '@/lib/kernel/index'
import { loadSkills } from '@/lib/skills/loader'
import { dailyBudget } from '@/lib/redis/client'

const VISION_MODEL = 'llama-3.2-90b-vision-preview'

const isSimpleMessage = (text: string) => {
  const words = text.trim().split(' ').length
  const hasComplexity = /\?|search|find|check|calendar|email|weather|remind|remember|news|tell me|what is|how to/i.test(text)
  return words < 20 && !hasComplexity
}

async function sendTyping(chatId: number) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  }).catch(() => {})
}

async function sendMessage(chatId: number, text: string): Promise<number | null> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text || '...',
      parse_mode: 'Markdown',
    }),
  })
  const data = await res.json()
  return data.result?.message_id ?? null
}

async function editMessage(chatId: number, messageId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text || '...',
      parse_mode: 'Markdown',
    }),
  }).catch(() => {})
}

async function sendReaction(chatId: number, messageId: number, emoji: string) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMessageReaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji }],
    }),
  }).catch(() => {})
}

async function getTelegramHistory(chatId: number, limit = 10): Promise<CoreMessage[]> {
  const sessionId = `telegram_${chatId}`
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('role, content')
    .eq('user_id', 'tanmay')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (!data) return []
  
  return data.reverse().map(row => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
  })) as CoreMessage[]
}

export const telegramHandler = inngest.createFunction(
  { 
    id: 'telegram-handler',
    name: 'Telegram Message Handler',
    retries: 1,
    concurrency: 1, // Sequential processing per bot
  },
  { event: 'solus/telegram.message' },
  async ({ event, step }: { event: any, step: any }) => {
    const { message } = event.data
    const chatId = message.chat.id
    const messageId = message.message_id
    const sessionId = `telegram_${chatId}`

    // 0. Check if Groq is already known to be limited
    const groqLimited = await isGroqLimited();

    // 1. Token budget check
    const budget = await dailyBudget.limit(`tokens:tanmay`)
    if (!budget.success && !groqLimited) {
      await sendMessage(chatId, "Daily token budget exhausted. We must wait for the next cycle, sir.")
      return { error: 'Budget exhausted' }
    }

    if (groqLimited && !google) {
      await sendMessage(chatId, "Daily token limit hit. Resets at midnight IST.")
      return { error: 'Groq limited, no fallback' }
    }

    // Start typing indicator
    await sendTyping(chatId)

    // Keep typing alive during processing
    const typingInterval = setInterval(() => sendTyping(chatId), 4000)

    try {
      // Handle content extraction
      let messageText = message.text ?? message.caption ?? ''
      let imageBase64: string | null = null

      // Handle photos
      if (message.photo) {
        imageBase64 = await step.run("download-photo", async () => {
          const photo = message.photo[message.photo.length - 1]
          const fileRes = await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${photo.file_id}`
          )
          const fileData = await fileRes.json()
          const filePath = fileData.result?.file_path
          if (!filePath) return null
          
          const imageRes = await fetch(
            `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`
          )
          const imageBuffer = await imageRes.arrayBuffer()
          return Buffer.from(imageBuffer).toString('base64')
        })
        if (!messageText) messageText = 'Explain this image.'
      }

      // Handle voice notes
      if (message.voice) {
        messageText = await step.run("transcribe-voice", async () => {
          const fileRes = await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${message.voice.file_id}`
          )
          const fileData = await fileRes.json()
          const filePath = fileData.result?.file_path
          if (!filePath) return null

          const voiceRes = await fetch(
            `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`
          )
          const voiceBuffer = await voiceRes.arrayBuffer()
          const formData = new FormData()
          formData.append('file', new Blob([voiceBuffer], { type: 'audio/ogg' }), 'voice.oga')
          formData.append('model', 'whisper-large-v3')

          const transcribeRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
            body: formData,
          })
          const transcribeData = await transcribeRes.json()
          return transcribeData.text ?? ''
        })
      }

      if (!messageText && !imageBase64) {
        clearInterval(typingInterval)
        return { skipped: 'no content' }
      }

      // Assemble context
      const context = await step.run("assemble-context", async () => {
        return assembleContext('tanmay', messageText)
      })

      // Load conversation history
      const history = await step.run("get-history", async () => {
        return getTelegramHistory(chatId, 5)
      })

      // Build system prompt and tools
      const systemPrompt = buildSystemPrompt(context)
      const tools = loadSkills(null)

      // Build messages
      const userContentPart: any = imageBase64
        ? [
            { type: 'image' as const, image: imageBase64, mimeType: 'image/jpeg' },
            { type: 'text' as const, text: messageText },
          ]
        : messageText

      const messages: any[] = [
        ...(history as any[]).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContentPart },
      ]

      // Initial visual feedback
      await sendReaction(chatId, messageId, '🔍')
      const placeholderMessageId = await step.run("send-placeholder", async () => {
        return sendMessage(chatId, '...')
      })

      // Generate response
      const result = await step.run("generate-response", async () => {
        const modelSelection = imageBase64 
          ? VISION_MODEL 
          : (isSimpleMessage(messageText) ? FAST_MODEL : REASONING_MODEL);

        const model = (groqLimited && google)
          ? google(GEMINI_MODEL)
          : groq(modelSelection);

        const { text } = await generateText({
          model: model as any,
          system: systemPrompt,
          messages,
          tools,
          maxSteps: 5,
        })
        return text
      })

      const fullText = result

      // Edit placeholder with final response
      await step.run("deliver-response", async () => {
        if (placeholderMessageId && fullText.trim()) {
          await editMessage(chatId, placeholderMessageId, fullText)
        } else if (fullText.trim()) {
          await sendMessage(chatId, fullText)
        }
        await sendReaction(chatId, messageId, '✅')
      })

      // Save to conversation history
      await step.run("persist-history", async () => {
        await Promise.all([
          supabaseAdmin.from('conversations').insert({
            user_id: 'tanmay',
            session_id: sessionId,
            channel: 'telegram',
            role: 'user',
            content: messageText || "[Image]",
          }),
          supabaseAdmin.from('conversations').insert({
            user_id: 'tanmay',
            session_id: sessionId,
            channel: 'telegram',
            role: 'assistant',
            content: fullText,
          }),
        ])
      })

      // Fire memory extraction
      await inngest.send({
        name: 'solus/turn.completed',
        data: {
          userId: 'tanmay',
          userMessage: messageText || "[Image]",
          assistantResponse: fullText,
        },
      })

      clearInterval(typingInterval)
      return { success: true, messageLength: fullText.length }

    } catch (error) {
      clearInterval(typingInterval)
      console.error('Telegram handler error:', error)

      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('rate_limit') || message.includes('429') || message.includes('quota')) {
        await markGroqLimited();
      }

      await sendReaction(chatId, messageId, '⚡')
      await sendMessage(chatId, getErrorMessage(error))
      throw error // Let Inngest handle the retry
    }
  }
)
