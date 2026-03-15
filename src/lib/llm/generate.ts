import { generateText, streamText, CoreMessage, StreamData } from 'ai'
import { getProviderModel, markProviderDown, markProviderUp, isProviderDown, isProviderError, type ModelType, google } from './providers'

interface GenerateOptions {
  modelType: ModelType
  system: string
  messages: CoreMessage[]
  tools?: Record<string, any>
  maxSteps?: number
}

// Provider priority order
const PROVIDER_ORDER = ['groq', 'gemini'] as const

export async function generateWithFallback(options: GenerateOptions): Promise<string> {
  const { modelType, system, messages, tools, maxSteps = 5 } = options

  console.log('[LLM] generateWithFallback called')
  console.log('[LLM] google client available:', !!google)
  console.log('[LLM] PROVIDER_ORDER:', PROVIDER_ORDER)

  for (const provider of PROVIDER_ORDER) {
    const down = await isProviderDown(provider)
    console.log(`[LLM] ${provider} down:`, down)
  }

  let lastError: unknown = null

  for (const provider of PROVIDER_ORDER) {
    // Skip if provider is known to be down
    if (await isProviderDown(provider)) {
      console.log(`[LLM] Skipping ${provider} — marked as down`)
      continue
    }

    try {
      console.log(`[LLM] Attempting ${provider} (${modelType})`)
      const model = getProviderModel(provider, modelType)

      const result = await generateText({
        model: model as any,
        system,
        messages,
        tools,
        maxSteps,
      })

      // Success — mark provider as up
      await markProviderUp(provider)
      console.log(`[LLM] ${provider} succeeded`)
      return result.text

    } catch (error) {
      lastError = error
      console.error(`[LLM] ${provider} failed:`, error)

      const { isProviderError: isProvErr, reason } = isProviderError(error, provider)
      if (isProvErr) {
        await markProviderDown(provider, reason)
        console.log(`[LLM] Marked ${provider} as down, trying next provider`)
        continue
      }

      // Non-provider error (bad request, etc) — don't retry other providers
      throw error
    }
  }

  // All providers failed
  throw lastError ?? new Error('All LLM providers failed')
}

export async function streamWithFallback(
  options: GenerateOptions & { data: StreamData; onChunk?: (text: string) => void }
): Promise<string> {
  const { modelType, system, messages, tools, maxSteps = 5, data, onChunk } = options

  console.log('[LLM] streamWithFallback called')
  console.log('[LLM] google client available:', !!google)
  console.log('[LLM] PROVIDER_ORDER:', PROVIDER_ORDER)

  for (const provider of PROVIDER_ORDER) {
    const down = await isProviderDown(provider)
    console.log(`[LLM] ${provider} down:`, down)
  }

  let lastError: unknown = null

  for (const provider of PROVIDER_ORDER) {
    if (await isProviderDown(provider)) {
      console.log(`[LLM] Skipping ${provider} — marked as down`)
      continue
    }

    try {
      console.log(`[LLM] Streaming with ${provider} (${modelType})`)
      const model = getProviderModel(provider, modelType)

      const result = streamText({
        model: model as any,
        system,
        messages,
        tools,
        maxSteps,
        onFinish: async () => {
          await markProviderUp(provider)
        },
      })

      // Collect full text while streaming
      let fullText = ''
      for await (const chunk of result.textStream) {
        fullText += chunk
        onChunk?.(chunk)
      }

      return fullText

    } catch (error) {
      lastError = error
      console.error(`[LLM] Stream ${provider} failed:`, error)

      const { isProviderError: isProvErr, reason } = isProviderError(error, provider)
      if (isProvErr) {
        await markProviderDown(provider, reason)
        continue
      }

      throw error
    }
  }

  throw lastError ?? new Error('All LLM providers failed')
}
