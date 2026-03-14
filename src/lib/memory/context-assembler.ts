import { retrieveMemories, type Memory } from "@/lib/memory/retrieve";
import { redis, TTL } from '@/lib/redis/client'
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export type Task = {
    title: string;
    status: string;
    priority?: number;
    deadline?: string;
};

export type Person = {
    name: string;
    relationship?: string;
    notes?: string;
};

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

export async function getContextBlock(query: string): Promise<{
    memories: Memory[],
    activeTasks: Task[],
    relevantPeople: Person[]
}> {
    // 1. Fetch boosted memories
    const memories = await retrieveMemories(query, 5);

    // 2. Fetch active tasks
    const { data: tasks } = await supabaseAdmin
        .from('tasks')
        .select('title, status, priority, deadline')
        .eq('user_id', env.MY_USER_ID)
        .in('status', ['pending', 'in_progress'])
        .order('priority', { ascending: false });

    // 3. Scan for people
    const { data: allPeople } = await supabaseAdmin
        .from('people')
        .select('name, relationship, notes')
        .eq('user_id', env.MY_USER_ID);

    const relevantPeople = (allPeople || []).filter(p =>
        query.toLowerCase().includes(p.name.toLowerCase())
    );

    return {
        memories,
        activeTasks: (tasks || []) as Task[],
        relevantPeople: relevantPeople as Person[]
    };
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
