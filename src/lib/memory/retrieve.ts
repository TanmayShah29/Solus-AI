import { embedText } from "@/lib/memory/embed";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { invalidateContextCache } from "@/lib/memory/context-assembler";

export type Memory = {
    content: string;
    created_at: string;
    confidence: number;
};

export async function retrieveMemories(
    query: string,
    limit = 5
): Promise<Memory[]> {
    try {
        const embedding = await embedText(query);

        const { data, error } = await supabaseAdmin.rpc("match_memories", {
            query_embedding: embedding,
            match_user_id: env.MY_USER_ID,
            match_limit: limit,
        });

        if (error) {
            console.error("Match memories RPC error:", error);
            return [];
        }

        const rawData = data as { content: string; created_at: string; confidence: number }[];

        const scoredMemories = rawData.map(m => {
            let score = m.confidence;
            const createdAt = new Date(m.created_at);
            const now = new Date();
            const diffMs = now.getTime() - createdAt.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            if (diffDays <= 1) {
                score += 0.15; // 24h boost
            } else if (diffDays > 30) {
                score -= 0.05; // >30d penalty
            }

            return {
                ...m,
                confidence: Math.min(1, Math.max(0, score))
            };
        });

        // Re-sort by boosted confidence
        return scoredMemories.sort((a, b) => b.confidence - a.confidence) as Memory[];
    } catch (error) {
        console.error("Failed to retrieve memories:", error);
        return []; // Return empty array on failure instead of throwing
    }
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
