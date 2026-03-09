import { inngest } from "@/inngest/client";
import { env } from "@/lib/env";
import { groq, REASONING_MODEL } from "@/lib/groq/client";
import { generateText } from "ai";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const goalNudge = inngest.createFunction(
    { id: "goal-nudge" },
    { cron: "0 13 * * 0" }, // 13:00 UTC = 6:30 PM IST Sunday
    async ({ step }) => {
        const goals = await step.run("fetch-goals", async () => {
            const { data } = await supabaseAdmin
                .from("goals")
                .select("title, description, progress, deadline, created_at")
                .eq("user_id", env.MY_USER_ID)
                .eq("status", "active");
            return data ?? [];
        });

        if (!goals.length) return { status: "skipped", reason: "no active goals" };

        const { text } = await step.run("generate-nudge", async () => {
            return generateText({
                model: groq(REASONING_MODEL),
                prompt: `You are Solus. Generate a weekly goal check-in for Tanmay.
Be direct and honest. If progress is low, say so calmly. If on track, acknowledge it briefly.
One paragraph max. No fluff. Jarvis tone.

Goals: ${JSON.stringify(goals)}`,
            });
        });

        await step.run("send-nudge", async () => {
            await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: env.MY_TELEGRAM_ID,
                    text: `📊 *Weekly Goal Check-in*\n\n${text}`,
                    parse_mode: "Markdown",
                }),
            });
        });

        return { status: "sent" };
    }
);
