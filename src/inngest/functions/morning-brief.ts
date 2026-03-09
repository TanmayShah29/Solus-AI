import { inngest } from "@/inngest/client";
import { env } from "@/lib/env";
import { groq, REASONING_MODEL } from "@/lib/groq/client";
import { generateText } from "ai";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const morningBrief = inngest.createFunction(
    { id: "morning-brief" },
    { cron: env.MORNING_BRIEF_CRON }, // 30 0 * * * = 6:00 AM IST
    async ({ step }) => {
        // Fetch all context in parallel
        const [weather, news, tasks, goals] = await Promise.all([
            step.run("fetch-weather", async () => {
                const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/tools/weather`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${env.API_SECRET_TOKEN}`,
                    },
                    body: JSON.stringify({ args: { city: "Kalol" } }),
                });
                return res.json();
            }),

            step.run("fetch-news", async () => {
                const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/tools/news-headlines`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${env.API_SECRET_TOKEN}`,
                    },
                    body: JSON.stringify({ args: { topic: "India technology AI", max_results: 3 } }),
                });
                return res.json();
            }),

            step.run("fetch-tasks", async () => {
                const { data } = await supabaseAdmin
                    .from("tasks")
                    .select("title, status, deadline")
                    .eq("user_id", env.MY_USER_ID)
                    .in("status", ["pending", "running"])
                    .limit(5);
                return data ?? [];
            }),

            step.run("fetch-goals", async () => {
                const { data } = await supabaseAdmin
                    .from("goals")
                    .select("title, progress, deadline")
                    .eq("user_id", env.MY_USER_ID)
                    .eq("status", "active")
                    .limit(3);
                return data ?? [];
            }),
        ]);

        // Generate brief with Groq
        const { text: brief } = await step.run("generate-brief", async () => {
            return generateText({
                model: groq(REASONING_MODEL),
                prompt: `You are Solus, Tanmay's personal AI agent. Generate a concise morning brief for him.
Tone: calm, direct, Jarvis-like. No fluff. Address him as "you".

Weather: ${JSON.stringify(weather?.result)}
Top news: ${JSON.stringify(news?.result?.slice(0, 3))}
Active tasks: ${JSON.stringify(tasks)}
Goals: ${JSON.stringify(goals)}

Format:
- One line weather summary
- 2-3 news headlines worth knowing
- Any pending tasks due soon
- One goal nudge if relevant
- One sharp closing line

Keep it under 200 words. No markdown in the Telegram message.`,
            });
        });

        // Send to Telegram
        await step.run("send-telegram", async () => {
            await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: env.MY_TELEGRAM_ID,
                    text: `🌅 Good morning, Tanmay.\n\n${brief}`,
                    parse_mode: "Markdown",
                }),
            });
        });

        return { status: "sent", brief };
    }
);
