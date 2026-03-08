import { retrieveMemories, type Memory } from "@/lib/memory/retrieve";
import { redis, TTL } from '@/lib/redis/client'

export async function assembleContext(query: string): Promise<string> {
    const cacheKey = `solus:context:tanmay`

    // Try cache first
    try {
        const cached = await redis.get<string>(cacheKey)
        if (cached) return cached
    } catch {
        // Cache miss or Redis error — fall through to Supabase
    }

    // Fetch from Supabase
    const memories = await retrieveMemories(query, 5);

    if (!memories || memories.length === 0) {
        return "";
    }

    const memoryBullets = memories
        .map((m: Memory) => {
            const confidence = m.confidence.toFixed(2);
            const date = new Date(m.created_at).toISOString().split("T")[0];
            return `- ${m.content} (confidence: ${confidence}, from ${date})`;
        })
        .join("\n");

    const context = `## What I remember that's relevant:\n${memoryBullets}`;

    // Store in cache
    try {
        await redis.set(cacheKey, context, { ex: TTL.CONTEXT })
    } catch {
        // Cache write failed — not critical, continue
    }

    return context
}

export async function invalidateContextCache(): Promise<void> {
    try {
        await redis.del(`solus:context:tanmay`)
    } catch {
        // Non-critical
    }
}

export async function buildSystemPrompt(
    basePrompt: string,
    query: string
): Promise<string> {
    const context = await assembleContext(query);

    if (!context) {
        return basePrompt;
    }

    return `${basePrompt}\n\n${context}`;
}
