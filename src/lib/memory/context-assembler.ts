import { retrieveMemories, type Memory } from "@/lib/memory/retrieve";

export async function assembleContext(query: string): Promise<string> {
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

    return `## What I remember that's relevant:\n${memoryBullets}`;
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
