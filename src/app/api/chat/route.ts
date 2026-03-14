import { streamText, StreamData } from "ai";
import { groq, REASONING_MODEL } from "@/lib/groq/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { toolRatelimit } from "@/lib/redis/client";

import { getContextBlock } from "@/lib/memory/context-assembler";
import { inngest } from "@/inngest/client";
import { getSolusTools, buildSystemPrompt, type ContextBlock } from "@/lib/kernel";

// Allow up to 30 s on Vercel (streaming responses need more than the 10 s default).
export const maxDuration = 30;

export async function POST(req: Request) {
    try {
        // 1. Rate limiting check
        const identifier = `chat:tanmay`;
        const { success, limit, remaining, reset } = await toolRatelimit.limit(identifier);

        if (!success) {
            return new Response(
                JSON.stringify({
                    error: "Rate limit exceeded. Give me a moment, sir.",
                    reset: new Date(reset).toISOString(),
                }),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "X-RateLimit-Limit": String(limit),
                        "X-RateLimit-Remaining": String(remaining),
                        "X-RateLimit-Reset": String(reset),
                    },
                }
            );
        }

        const { messages } = await req.json();
        const data = new StreamData();

        // Get the latest user message to use as the memory query
        const latestMessage = messages[messages.length - 1]?.content ?? "";

        // Fetch context data (memories, tasks, people)
        const { memories, activeTasks, relevantPeople } = await getContextBlock(latestMessage);

        const context: ContextBlock = {
            memories,
            activeTasks,
            relevantPeople,
            currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        };

        const systemPrompt = buildSystemPrompt(context);
        const tools = getSolusTools(data);

        const result = streamText({
            model: groq(REASONING_MODEL),
            system: systemPrompt,
            messages,
            tools,
            maxSteps: 5,
            onFinish: async ({ text, usage }) => {
                try {
                    const session_id = crypto.randomUUID(); // temporary until we add proper sessions

                    // log user message
                    await supabaseAdmin.from('conversations').insert({
                        user_id: env.MY_USER_ID,
                        session_id,
                        channel: 'web',
                        role: 'user',
                        content: messages[messages.length - 1].content,
                    });

                    // log assistant response  
                    await supabaseAdmin.from('conversations').insert({
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
                            userId: env.MY_USER_ID,
                        },
                    });
                } catch (e) {
                    console.error("onFinish error:", e);
                } finally {
                    data.close();
                }
            },
        });

        return result.toDataStreamResponse({
            data,
            headers: {
                'X-RateLimit-Limit': String(limit),
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(reset),
            },
        });
    } catch (error) {
        console.error("Chat API Error:", error);
        return Response.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
