/**
 * src/lib/groq/client.ts
 *
 * Shared Groq client and model name constants for SOLUS.
 * Import `groq` here — never instantiate createGroq elsewhere.
 */

import { createGroq } from "@ai-sdk/groq";
import { env } from "@/lib/env";

export const groq = createGroq({ apiKey: env.GROQ_API_KEY });

// 70B — reasoning + final response for all standard kernel paths.
export const REASONING_MODEL = "llama-3.3-70b-versatile" as const;

// 8B — context loading, fact extraction, entity resolution, and Alexa fast-track.
export const FAST_MODEL = "llama-3.1-8b-instant" as const;
