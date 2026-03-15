/**
 * src/lib/groq/client.ts
 *
 * Wrapper around the multi-provider system for backward compatibility.
 * New code should prefer importing from @/lib/llm/providers.
 */

import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { env } from "@/lib/env";
import { isProviderDown, markProviderDown, clearGroqLimit as clearLimit } from "@/lib/llm/providers";

export const groq = createGroq({ apiKey: env.GROQ_API_KEY });
export const google = env.GOOGLE_GEMINI_API_KEY
    ? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GEMINI_API_KEY })
    : null;

export const isGroqLimited = () => isProviderDown('groq');
export const markGroqLimited = () => markProviderDown('groq', 'rate_limit');
export const clearGroqLimit = () => clearLimit();

// Model constants
export const REASONING_MODEL = "llama-3.3-70b-versatile" as const;
export const FAST_MODEL = "llama-3.1-8b-instant" as const;
export const VISION_MODEL = "llama-3.2-90b-vision-preview" as const;
export const GEMINI_MODEL = "gemini-1.5-flash" as const;
