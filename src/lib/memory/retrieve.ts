import { embedText } from "@/lib/memory/embed";
import { createClient } from "@/lib/supabase/server";
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
        const supabase = await createClient();

        const { data, error } = await supabase.rpc("match_memories", {
            query_embedding: embedding,
            match_user_id: env.MY_USER_ID,
            match_limit: limit,
        });

        if (error) {
            console.error("Match memories RPC error:", error);
            return [];
        }

        return data as Memory[];
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
        const supabase = await createClient();

        const { error } = await supabase.from("memories").insert({
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
