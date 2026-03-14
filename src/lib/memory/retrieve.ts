import { embedText } from "@/lib/memory/embed";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { invalidateContextCache } from "@/lib/memory/context-assembler";

export type Memory = {
    content: string;
    created_at: string;
    confidence: number;
    score?: number;
};

export async function retrieveMemories(
    query: string,
    userId: string,
    limit = 5
): Promise<Memory[]> {
    const embedding = await embedText(query);

    // Get more candidates than needed so we can rerank
    const { data, error } = await supabaseAdmin.rpc("match_memories", {
        query_embedding: embedding,
        match_user_id: userId,
        match_limit: limit * 3,
    });

    if (error) {
        console.error("Match memories RPC error:", error);
        return [];
    }

    if (!data?.length) return [];

    const now = Date.now();

    // Rerank with recency boost
    const reranked = (data as any[]).map((memory: Memory) => {
        const ageMs = now - new Date(memory.created_at).getTime();
        const ageHours = ageMs / (1000 * 60 * 60);
        const ageDays = ageHours / 24;

        let recencyBoost = 0;
        if (ageHours < 1) recencyBoost = 0.3;      // last hour
        else if (ageHours < 24) recencyBoost = 0.2;  // today
        else if (ageDays < 7) recencyBoost = 0.1;    // this week
        else if (ageDays > 30) recencyBoost = -0.05; // older than a month

        // Penalize [CONTINUITY] memories slightly — they're supplementary
        const continuityPenalty = memory.content.startsWith("[CONTINUITY]") ? -0.05 : 0;

        return {
            ...memory,
            score: (memory.confidence ?? 0.8) + recencyBoost + continuityPenalty,
        };
    });

    // Sort by adjusted score and return top limit
    return reranked
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit) as Memory[];
}

export async function storeMemory(
    content: string,
    source: "conversation" | "task" | "document",
    sourceId?: string
): Promise<void> {
    try {
        const embedding = await embedText(content);

        const { error } = await supabaseAdmin.from("memories").insert({
            user_id: env.MY_USER_ID,
            content,
            embedding,
            source,
            source_id: sourceId || null,
        });

        if (error) {
            console.error("Failed to insert memory row:", error);
        } else {
            // Invalidate context cache so next request gets fresh data
            await invalidateContextCache();
        }
    } catch (error) {
        console.error("Store memory failed during embedding or client setup:", error);
    }
}
