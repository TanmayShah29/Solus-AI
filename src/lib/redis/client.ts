// All Redis access goes through this file.
// @upstash/redis works natively in Vercel Edge Runtime — no special import needed.
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { env } from '@/lib/env'

// Single Redis instance — reused across all calls
export const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL!,
    token: env.UPSTASH_REDIS_REST_TOKEN!,
})

// 20 tool calls per minute per user
export const toolRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 m'),
    prefix: 'solus:tools',
})

// 100k tokens per day
export const dailyBudget = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(100_000, '1 d'),
    prefix: 'solus:tokens',
})

// Cache TTLs in seconds
export const TTL = {
    CONTEXT: 30 * 60,      // 30 minutes — Living Context Block
    SESSION: 60 * 60,     // 1 hour — session data
    TOOL: 5 * 60,      // 5 minutes — tool results
} as const

export async function getCached<T>(key: string): Promise<T | null> {
    try {
        return await redis.get<T>(key)
    } catch {
        return null
    }
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
        await redis.set(key, value, { ex: ttlSeconds })
    } catch {
        // cache miss is acceptable — never crash for caching
    }
}
