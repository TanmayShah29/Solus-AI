/**
 * src/lib/groq/client.ts
 *
 * Shared Groq client and model name constants for SOLUS.
 * Includes fallback to Google Gemini when Groq rate limits are hit.
 */

import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis/client";

export const groq = createGroq({ apiKey: env.GROQ_API_KEY });
export const google = env.GOOGLE_GEMINI_API_KEY
    ? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GEMINI_API_KEY })
    : null;

const GROQ_LIMIT_KEY = 'groq:limit_hit';

export async function isGroqLimited(): Promise<boolean> {
    try {
        const limited = await redis.get(GROQ_LIMIT_KEY);
        return !!limited;
    } catch {
        return false;
    }
}

export async function markGroqLimited(): Promise<void> {
    try {
        // Mark as limited until midnight IST
        const now = new Date();
        const midnight = new Date();
        midnight.setHours(24, 0, 0, 0);
        const secondsUntilMidnight = Math.floor((midnight.getTime() - now.getTime()) / 1000);
        await redis.set(GROQ_LIMIT_KEY, '1', { ex: secondsUntilMidnight });
    } catch { }
}

export async function clearGroqLimit(): Promise<void> {
    try {
        await redis.del(GROQ_LIMIT_KEY);
    } catch { }
}

export function getModel(modelName: string, forceGroq = false) {
    // If Groq is limited and Gemini is available, use Gemini
    // Using a manual check outside this function for more granular control in handlers
    return groq(modelName);
}

// 70B — reasoning + final response for all standard kernel paths.
export const REASONING_MODEL = "llama-3.3-70b-versatile" as const;

// 8B — context loading, fact extraction, entity resolution, and Alexa fast-track.
export const FAST_MODEL = "llama-3.1-8b-instant" as const;

// Vision — Llama 3.2 90B
export const VISION_MODEL = "llama-3.2-90b-vision-preview" as const;

// Gemini Fallback
export const GEMINI_MODEL = "gemini-1.5-flash" as const;
