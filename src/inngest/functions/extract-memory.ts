import { inngest } from "@/inngest/client";
import { storeMemory } from "@/lib/memory/retrieve";
import { groq, FAST_MODEL } from "@/lib/groq/client";
import { generateText } from "ai";

interface ExtractionResult {
    facts: string[];
}

export const extractMemory = inngest.createFunction(
    { id: "extract-memory" },
    { event: "solus/turn.completed" },
    async ({ event, step }) => {
        const { userMessage, assistantResponse } = event.data;
        const userId = (event.data.userId as string) || "tanmay";
        console.log(`[Inngest] Starting extraction for user: ${userId}`);

        // Step 1: Extract facts using LLM
        const extractionResultText = await step.run("extract-facts", async () => {
            console.log("[Inngest] Extracting facts from LLM...");
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

            console.log(`[Inngest] LLM returned: ${text}`);
            return text;
        });

        // Step 2: Parse and store facts
        const extractedFacts = await step.run("store-facts", async () => {
            if (!extractionResultText || extractionResultText.trim().toUpperCase() === "NONE") {
                console.log("[Inngest] No facts to store.");
                return [];
            }

            const lines = extractionResultText.split("\n");
            const facts = lines
                .filter((line: string) => line.trim().startsWith("FACT:"))
                .map((line: string) => line.replace("FACT:", "").trim())
                .filter(Boolean);

            console.log(`[Inngest] Storing ${facts.length} facts in memories table...`);
            for (const fact of facts) {
                await storeMemory(fact, "conversation");
            }

            return facts;
        });

        const conversationText = `User: ${userMessage}\nAssistant: ${assistantResponse}`;

        // Step 3: Judge each extracted fact
        await step.run("judge-facts", async () => {
            console.log(`[Inngest] Judging ${extractedFacts.length} facts...`);
            const { judgeFact } = await import("@/lib/reflection/judge");
            const { promoteToKnowledge } = await import("@/lib/reflection/promote-knowledge");
            const { supabaseAdmin: supabase } = await import("@/lib/supabase/admin");

            for (const fact of extractedFacts) {
                const judgment = await judgeFact(fact, conversationText);
                console.log(`[Inngest] Judgment for "${fact}": score=${judgment.score}, keep=${judgment.keep}`);

                // Store in proposed_facts with judge score
                const { error: proposedError } = await supabase.from("proposed_facts").insert({
                    user_id: userId,
                    entity: judgment.entity ?? "unknown",
                    value: judgment.value ?? fact,
                    category: judgment.category,
                    judge_score: judgment.score,
                    status: judgment.keep ? "approved" : "rejected",
                });

                if (proposedError) console.error("[Inngest] proposed_facts insert error:", proposedError);

                // Promote high-confidence facts to knowledge
                if (judgment.keep && judgment.entity && judgment.value) {
                    console.log(`[Inngest] Promoting knowledge: ${judgment.entity}`);
                    await promoteToKnowledge(
                        judgment.entity,
                        judgment.value,
                        judgment.category,
                        judgment.score / 10,
                        userId
                    );
                }
            }
        });

        // Step 4: Extract people from conversation
        await step.run("extract-people", async () => {
            console.log("[Inngest] Extracting people...");
            const { extractAndStorePerson } = await import("@/lib/reflection/people-graph");
            await extractAndStorePerson(conversationText, userId);
            console.log("[Inngest] Finished extract-people step.");
        });
    }
);
