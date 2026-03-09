import { streamText, StreamData } from "ai";
import { groq, REASONING_MODEL } from "@/lib/groq/client";
import { traceable } from "langsmith/traceable";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

import { assembleContext } from "@/lib/memory/context-assembler";
import { retrieveMemories } from "@/lib/memory/retrieve";
import { inngest } from "@/inngest/client";
import { getSolusTools, buildSystemPrompt, type ContextBlock } from "@/lib/kernel";

// Allow up to 30 s on Vercel (streaming responses need more than the 10 s default).
export const maxDuration = 30;

export const POST = traceable(
    async (req: Request) => {
        try {
            const { messages } = await req.json();
            const data = new StreamData();

            const tools = getSolusTools(data);

            // Get the latest user message to use as the memory query
            const latestMessage = messages[messages.length - 1]?.content ?? "";

            // Append thinking indicator before memory retrieval
            data.append({ type: "thinking", step: "Searching memory..." });

            // Fetch context and memories
            const contextData = await assembleContext(latestMessage);
            const memoriesData = await retrieveMemories(latestMessage, 5);

            const context: ContextBlock = {
                memories: memoriesData,
                currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                // activeTasks and relevantPeople will be added in Section B
            };

            const systemPrompt = buildSystemPrompt(context);

            // Update second thinking indicator
            data.append({ type: "thinking", step: "Generating response..." });

            const result = streamText({
                model: groq(REASONING_MODEL),
                system: systemPrompt,
                messages,
                tools,
                maxSteps: 5,
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
                            userId: env.MY_USER_ID,
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
