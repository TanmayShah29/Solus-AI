import { inngest } from "@/inngest/client";
import { env } from "@/lib/env";
import { groq, REASONING_MODEL } from "@/lib/groq/client";
import { generateObject } from "ai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

export const proactiveSuggestions = inngest.createFunction(
    { id: "proactive-suggestions" },
    { cron: "0 14 * * *" }, // 14:00 UTC = 7:30 PM IST
    async ({ step }) => {
        const SuggestionSchema = z.object({
            shouldNotify: z.boolean(),
            message: z.string(),
            reason: z.string(),
        });

        // Pull recent memories and goals
        const context = await step.run("fetch-context", async () => {
            const [memories, goals, facts] = await Promise.all([
                supabaseAdmin
                    .from("memories")
                    .select("content, created_at")
                    .eq("user_id", env.MY_USER_ID)
                    .order("created_at", { ascending: false })
                    .limit(20),
                supabaseAdmin
                    .from("goals")
                    .select("title, progress, deadline")
                    .eq("user_id", env.MY_USER_ID)
                    .eq("status", "active"),
                supabaseAdmin
                    .from("knowledge_facts")
                    .select("entity, value, category")
                    .eq("user_id", env.MY_USER_ID)
                    .order("created_at", { ascending: false })
                    .limit(10),
            ]);
            return {
                memories: memories.data ?? [],
                goals: goals.data ?? [],
                facts: facts.data ?? [],
            };
        });

        const { object: suggestion } = await step.run("generate-suggestion", async () => {
            return generateObject({
                model: groq(REASONING_MODEL),
                schema: SuggestionSchema,
                prompt: `You are Solus, Tanmay's personal AI agent. 
Review his recent memories, goals, and knowledge to decide if there's something worth proactively telling him this evening.

Recent memories: ${JSON.stringify(context.memories.slice(0, 10))}
Active goals: ${JSON.stringify(context.goals)}
Recent facts learned: ${JSON.stringify(context.facts)}

Only notify if there's something genuinely useful — a goal deadline approaching, a pattern you noticed, something he mentioned wanting to do.
If nothing is worth surfacing, set shouldNotify=false.
Keep the message under 100 words. Direct and Jarvis-like.`,
            });
        });

        if (!suggestion.shouldNotify) return { status: "skipped", reason: suggestion.reason };

        await step.run("send-suggestion", async () => {
            await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: env.MY_TELEGRAM_ID,
                    text: `💡 ${suggestion.message}`,
                    parse_mode: "Markdown",
                }),
            });
        });

        return { status: "sent", message: suggestion.message };
    }
);
