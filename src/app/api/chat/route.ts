import { streamText, StreamData } from "ai";
import { groq, REASONING_MODEL, FAST_MODEL } from "@/lib/groq/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { toolRatelimit, dailyBudget } from "@/lib/redis/client";

import { assembleContext } from "@/lib/memory/context-assembler";
import { inngest } from "@/inngest/client";
import { buildSystemPrompt, SOLUS_SYSTEM_PROMPT } from "@/lib/kernel";
import { loadSkills } from "@/lib/skills/loader";
import { getErrorMessage } from "@/lib/errors/messages";

// Allow up to 30 s on Vercel (streaming responses need more than the 10 s default).
export const maxDuration = 30;
export const runtime = 'nodejs';

async function isFirstConversation(userId: string): Promise<boolean> {
    const { count } = await supabaseAdmin
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
    return (count ?? 0) === 0
}

const isSimpleMessage = (text: string) => {
    const words = text.trim().split(' ').length
    const hasComplexity = /\?|search|find|check|calendar|email|weather|remind|remember|news|tell me|what is|how to/i.test(text)
    return words < 20 && !hasComplexity
}

export async function POST(req: Request) {
    const data = new StreamData();
    try {
        // 0. Token budget check
        const budgetIdentifier = `tokens:tanmay`;
        const budget = await dailyBudget.limit(budgetIdentifier);
        if (!budget.success) {
            return new Response(
                JSON.stringify({
                    error: "Daily token budget exhausted. We must wait for the next cycle, sir.",
                }),
                { status: 429, headers: { "Content-Type": "application/json" } }
            );
        }

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

        const { messages: rawMessages } = await req.json();

        // Load maximum 5 conversation history messages
        const messages = rawMessages.slice(-5);

        // Get the latest user message to use as the memory query
        const latestMessage = messages[messages.length - 1]?.content ?? "";

        // Fetch context data (memories, tasks, facts, memory.md)
        const context = await assembleContext(env.MY_USER_ID, latestMessage);

        const firstTime = await isFirstConversation(env.MY_USER_ID);

        const systemPrompt = firstTime
            ? `${SOLUS_SYSTEM_PROMPT}

## Onboarding
This is your first conversation with Tanmay. You don't know him yet.
Ask him ONE question to start building context. Keep it natural — not a form.
Good: "What are you working on right now?"
Bad: "Please tell me your name, goals, and preferences."
After he answers, ask one more follow-up. Then introduce yourself briefly and get to work.
Save everything he tells you using the update_memory tool.`
            : buildSystemPrompt(context) + `

## Vision

When Tanmay shares an image:
- Describe what you see concisely and relevantly
- If it's code: identify the language, spot issues, suggest improvements
- If it's a screenshot: describe what's happening on screen
- If it's a document: extract the key information
- If it's a photo: describe it naturally
- Never say "I can see an image" — just respond to what's in it`;

        const tools = loadSkills(data);

        const hasImages = messages.some((m: any) =>
            Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image')
        ) || messages.some((m: any) => m.experimental_attachments?.some((a: any) => a.contentType.startsWith('image/')));

        const VISION_MODEL = 'llama-3.2-90b-vision-preview';

        const model = hasImages 
            ? VISION_MODEL 
            : (isSimpleMessage(latestMessage) ? FAST_MODEL : REASONING_MODEL);

        const result = streamText({
            model: groq(model),
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

                    // Fire quality scoring in background
                    await inngest.send({
                        name: 'solus/response.generated',
                        data: {
                            userMessage: messages[messages.length - 1]?.content ?? '',
                            assistantResponse: text,
                            sessionId: session_id,
                        },
                    })

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
        console.error("Chat route catastrophic error:", error);
        data.close();
        // Return a valid stream with error message so the UI doesn't hang
        return new Response(
            `data: ${JSON.stringify({ type: 'text', text: getErrorMessage(error) })}\n\ndata: [DONE]\n\n`,
            {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            }
        );
    }
}
