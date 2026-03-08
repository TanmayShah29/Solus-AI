import { inngest } from "@/inngest/client";
import { storeMemory } from "@/lib/memory/retrieve";
import { groq, FAST_MODEL } from "@/lib/groq/client";
import { generateText } from "ai";

export const extractMemory = inngest.createFunction(
    { id: "extract-memory" },
    { event: "solus/turn.completed" },
    async ({ event, step }) => {
        const { userMessage, assistantResponse } = event.data;

        // Step 1: Extract facts using LLM
        const extractionResult = await step.run("extract-facts", async () => {
            const prompt = `Extract 1-3 key facts worth remembering from this conversation turn.
Only extract facts that would be useful context in future conversations.
Return each fact on its own line starting with "FACT:".
If nothing is worth remembering, return "NONE".

User: ${userMessage}
Assistant: ${assistantResponse}`;

            const { text } = await generateText({
                model: groq(FAST_MODEL),
                prompt,
            });

            return text;
        });

        // Step 2: Parse and store facts
        await step.run("store-facts", async () => {
            if (!extractionResult || extractionResult.trim().toUpperCase() === "NONE") {
                return;
            }

            const lines = extractionResult.split("\n");
            const facts = lines
                .filter((line: string) => line.trim().startsWith("FACT:"))
                .map((line: string) => line.replace("FACT:", "").trim())
                .filter(Boolean);

            for (const fact of facts) {
                await storeMemory(fact, "conversation");
            }
        });
    }
);
