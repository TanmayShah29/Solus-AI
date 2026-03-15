import { createGroq } from '@ai-sdk/groq'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { env } from '@/lib/env'
import { redis } from '@/lib/redis/client'

const groq = createGroq({ apiKey: env.GROQ_API_KEY })
const google = env.GOOGLE_GEMINI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GEMINI_API_KEY })
  : null

// Model configurations
export const MODELS = {
  reasoning: {
    groq: 'llama-3.3-70b-versatile',
    gemini: 'gemini-1.5-flash',
  },
  fast: {
    groq: 'llama-3.1-8b-instant',
    gemini: 'gemini-1.5-flash',
  },
  vision: {
    groq: 'llama-3.2-90b-vision-preview',
    gemini: 'gemini-1.5-flash',
  },
}

export type ModelType = 'reasoning' | 'fast' | 'vision'
export type Provider = 'groq' | 'gemini'

// Redis keys for provider health
const PROVIDER_DOWN_KEY = (provider: Provider) => `llm:down:${provider}`

export async function markProviderDown(provider: Provider, reason: string): Promise<void> {
  try {
    const now = new Date()
    const midnight = new Date()
    midnight.setHours(24, 0, 0, 0)
    const secondsUntilMidnight = Math.floor((midnight.getTime() - now.getTime()) / 1000)

    // Token/quota errors reset at midnight — other errors reset after 5 minutes
    const isQuotaError = reason.includes('quota') || reason.includes('429') || reason.includes('rate_limit') || reason.includes('token')
    const ttl = isQuotaError ? secondsUntilMidnight : 300

    await redis.set(PROVIDER_DOWN_KEY(provider), reason, { ex: ttl })
    console.log(`[LLM] Marked ${provider} as down: ${reason} (TTL: ${ttl}s)`)
  } catch {}
}

export async function isProviderDown(provider: Provider): Promise<boolean> {
  try {
    const down = await redis.get(PROVIDER_DOWN_KEY(provider))
    return !!down
  } catch {
    return false
  }
}

export async function markProviderUp(provider: Provider): Promise<void> {
  try {
    await redis.del(PROVIDER_DOWN_KEY(provider))
  } catch {}
}

export async function clearGroqLimit(): Promise<void> {
  return markProviderUp('groq');
}

export async function getProviderStatus(): Promise<Record<Provider, boolean>> {
  const [groqDown, geminiDown] = await Promise.all([
    isProviderDown('groq'),
    isProviderDown('gemini'),
  ])
  return {
    groq: !groqDown,
    gemini: !geminiDown,
  }
}

export function getProviderModel(provider: Provider, modelType: ModelType) {
  if (provider === 'groq') {
    return groq(MODELS[modelType].groq)
  }
  if (provider === 'gemini' && google) {
    return google(MODELS[modelType].gemini)
  }
  throw new Error(`Provider ${provider} not available`)
}

export function isProviderError(error: unknown, attemptedProvider?: Provider): { isProviderError: boolean; provider: Provider | null; reason: string } {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  const isDownError = 
    message.includes('rate_limit') ||
    message.includes('429') ||
    message.includes('quota') ||
    message.includes('capacity') ||
    message.includes('overloaded') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504');

  if (!isDownError) {
    return { isProviderError: false, provider: null, reason: message }
  }

  let provider: Provider | null = attemptedProvider || null;
  if (!provider) {
    if (message.includes('gemini') || message.includes('google')) {
      provider = 'gemini'
    } else if (message.includes('groq')) {
      provider = 'groq'
    }
  }

  return { isProviderError: true, provider, reason: message }
}
