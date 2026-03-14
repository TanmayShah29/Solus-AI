import { retrieveMemories, type Memory } from "@/lib/memory/retrieve";
import { redis, TTL } from '@/lib/redis/client'
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getMemoryFile } from '@/lib/github/client'
import { type ContextBlock } from "@/lib/kernel";

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

export async function assembleContext(userId: string, query: string): Promise<ContextBlock> {
    const results = await Promise.allSettled([
        retrieveMemories(query, userId),
        getKnowledgeFacts(userId),
        getActiveTasks(userId),
        getMemoryFile(),
    ]);

    const memories = results[0].status === 'fulfilled' ? results[0].value : [];
    const knowledgeFacts = results[1].status === 'fulfilled' ? results[1].value : [];
    const activeTasks = results[2].status === 'fulfilled' ? (results[2].value as Task[]) : [];
    const memoryFile = results[3].status === 'fulfilled' ? results[3].value : '';

    return {
        memories,
        knowledgeFacts,
        activeTasks,
        memoryFile,
        currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    };
}

async function getKnowledgeFacts(userId: string): Promise<any[]> {
    try {
        const { data } = await supabaseAdmin
            .from('knowledge_facts')
            .select('entity, value')
            .eq('user_id', userId);
        return data || [];
    } catch {
        return [];
    }
}

async function getActiveTasks(userId: string): Promise<Task[]> {
    try {
        const { data } = await supabaseAdmin
            .from('tasks')
            .select('title, status, priority, deadline')
            .eq('user_id', userId)
            .in('status', ['pending', 'in_progress'])
            .order('priority', { ascending: false });
        return (data || []) as Task[];
    } catch {
        return [];
    }
}

export async function invalidateContextCache(): Promise<void> {
    try {
        await redis.del(`solus:context:tanmay`)
    } catch {
        // Non-critical
    }
}
