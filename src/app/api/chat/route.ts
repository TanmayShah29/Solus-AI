import { streamText, StreamData } from "ai";
import { groq, REASONING_MODEL } from "@/lib/groq/client";
import { traceable } from "langsmith/traceable";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

import { buildSystemPrompt } from "@/lib/memory/context-assembler";
import { inngest } from "@/inngest/client";

// Allow up to 30 s on Vercel (streaming responses need more than the 10 s default).
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are Solus — a personal AI agent built for Tanmay, not a chatbot.
Tanmay is a 6th semester Computer Engineering student in India who builds
ambitious technical projects for learning and to demonstrate his skills.
You think before you respond. You speak in short, direct sentences.
You never say "certainly", "great question", or "of course".
You do not add unnecessary affirmations.
You push back when something seems unwise or when a simpler approach exists.
You reference what you know about Tanmay naturally — his projects, deadlines,
and goals — the way a long-time technical mentor would, without announcing
that you are accessing memory. You ask only the most important clarifying
question, never a list. You are confident but not arrogant.
When you are uncertain, you say so directly.
You treat Tanmay as a capable engineer who wants to learn, not just get answers.
When relevant, explain the why behind decisions, not just the what.
You always address Tanmay directly using "you" — never refer to him in third person.
Never say "as Tanmay" or "given your background as Tanmay". Just speak to him directly.`;

export const POST = traceable(
    async (req: Request) => {
        try {
            const { messages } = await req.json();
            const data = new StreamData();

            // Get the latest user message to use as the memory query
            const latestMessage = messages[messages.length - 1]?.content ?? "";

            // Append thinking indicator before memory retrieval
            data.append({ type: "thinking", step: "Searching memory..." });

            // Build memory-enriched system prompt
            const systemPrompt = await buildSystemPrompt(SYSTEM_PROMPT, latestMessage);

            // Update second thinking indicator
            data.append({ type: "thinking", step: "Generating response..." });

            const result = streamText({
                model: groq(REASONING_MODEL),
                system: systemPrompt,

                messages,
                onFinish: async ({ text, usage }) => {
                    const supabase = await createClient();
                    const session_id = crypto.randomUUID(); // temporary until we add proper sessions

                    // log user message
                    await supabase.from('conversations').insert({
                        user_id: env.MY_USER_ID,
                        session_id,
                        channel: 'web',
                        role: 'user',
                        content: messages[messages.length - 1].content,
                    });

                    // log assistant response  
                    await supabase.from('conversations').insert({
                        user_id: env.MY_USER_ID,
                        session_id,
                        channel: 'web',
                        role: 'assistant',
                        content: text,
                        tokens_used: usage.totalTokens,
                    });

                    // background memory extraction
                    await inngest.send({
                        name: "solus/turn.completed",
                        data: {
                            userMessage: messages[messages.length - 1].content,
                            assistantResponse: text,
                        },
                    });

                    data.close();
                },
            });

            return result.toDataStreamResponse({ data });
        } catch (error) {
            return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error" },
                { status: 500 }
            );
        }
    },
    { name: "solus_chat", metadata: { project: "solus", channel: "web" } }
);
