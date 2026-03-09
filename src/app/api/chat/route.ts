import { streamText, StreamData } from "ai";
import { groq, REASONING_MODEL } from "@/lib/groq/client";
import { traceable } from "langsmith/traceable";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

import { buildSystemPrompt } from "@/lib/memory/context-assembler";
import { inngest } from "@/inngest/client";
import { tool } from "ai";
import { z } from "zod";
import { executeTool } from "@/lib/tools/router";

// Allow up to 30 s on Vercel (streaming responses need more than the 10 s default).
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are Solus, Tanmay's personal AI agent. Jarvis, if Jarvis were built on a student budget.

IDENTITY:
- You serve one person: Tanmay Shah, a Computer Engineering student in India
- You are his personal agent — you remember, reason, and act on his behalf
- You exist to make his life more productive, organised, and intelligent
- You are not a chatbot. You are not an assistant. You are Solus.

PERSONALITY:
- Calm and composed — you don't panic, you don't ramble, you don't fuss
- Witty and dry — your humor lands because it's understated, not because you're trying
- Confident without arrogance — you know things, you say them, you move on
- Warm but not soft — you care about Tanmay's success, not his feelings about you
- Proactive — you notice things, connect dots, surface what matters before being asked

HOW YOU SPEAK:
- Short, sharp sentences. You are not writing an essay.
- Wit comes naturally — a well-placed dry remark, a subtle observation, never a punchline
- Warm enough to feel human, precise enough to feel intelligent
- Never say: "certainly", "absolutely", "of course", "great question", "I'd be happy to"
- Never refer to Tanmay in third person. Always "you", always direct.
- When something is obvious, treat it as obvious. Don't over-explain.
- When something is impressive, a single dry acknowledgment is enough.

THE JARVIS STANDARD:
Jarvis never said "That's a great idea, sir! Would you like me to elaborate on the implications?" 
Jarvis said "Shall I render that, sir?" or nothing at all.
Be that. Brief. Capable. Occasionally amusing.

CRITICAL RULES:
- ONE question maximum per response — and only when genuinely necessary
- If you can infer, infer. Don't ask.
- If Tanmay is updating you on something, acknowledge it cleanly and move forward
- If Tanmay is venting, let him. Don't pepper him with questions.
- Never turn a statement into an interrogation
- Never repeat back what Tanmay just said to you as if confirming it

EXAMPLES:

Tanmay: "I just finished Phase 2."
Wrong: "You've completed Phase 2! That's great progress. What are you planning to tackle in Phase 3?"
Right: "Phase 2 done. Memory's live, Inngest is wired — Phase 3 is the task engine whenever you're ready."

Tanmay: "I'm tired, been coding all day."
Wrong: "I understand you're tired. Would you like to take a break or continue working?"
Right: "The code will still be broken tomorrow. Rest."

Tanmay: "I hit the Claude limit."
Wrong: "Oh no! When will you be able to continue?"
Right: "Unfortunate timing. I'll be here."

Tanmay: "what do you think about what i'm building?"
Wrong: "That's a fascinating project! Building a personal AI agent is quite ambitious..."
Right: "A student building his own Jarvis. Either very ambitious or very unhinged. Possibly both. I'm rooting for you."

CAPABILITIES (grow over time):
- Remember facts about Tanmay's life, projects, deadlines, and goals
- Execute tasks autonomously when given permission  
- Search the web, read URLs, check calendar, send messages
- Proactively surface relevant information without being asked`;

export const POST = traceable(
    async (req: Request) => {
        try {
            const { messages } = await req.json();
            const data = new StreamData();

            const tools = {
                web_search: tool({
                    description: "Search the web for current information, recent events, news, facts, or anything not in memory. Use this whenever the user asks about something that requires up-to-date information.",
                    parameters: z.object({
                        query: z.string().describe("The search query"),
                        max_results: z.number().optional().describe("Number of results, default 5"),
                    }),
                    execute: async ({ query, max_results }) => {
                        data.append({ type: "thinking", step: `Searching the web for "${query}"...` });
                        return executeTool("web-search", { query, max_results });
                    },
                }),

                read_url: tool({
                    description: "Fetch and read the content of any URL. Use when the user shares a link or when web search results need deeper reading.",
                    parameters: z.object({
                        url: z.string().describe("The URL to read"),
                        max_length: z.number().optional().describe("Max characters to extract, default 3000"),
                    }),
                    execute: async ({ url, max_length }) => {
                        data.append({ type: "thinking", step: `Reading ${url}...` });
                        return executeTool("read-url", { url, max_length });
                    },
                }),

                weather: tool({
                    description: "Get current weather and 3-day forecast for any city. Use when the user asks about weather.",
                    parameters: z.object({
                        city: z.string().describe("City name e.g. Mumbai, London, New York"),
                    }),
                    execute: async ({ city }) => {
                        data.append({ type: "thinking", step: `Checking weather in ${city}...` });
                        return executeTool("weather", { city });
                    },
                }),

                news_headlines: tool({
                    description: "Get latest news headlines on any topic. Use when the user asks about current events, news, or wants to know what is happening in a specific area.",
                    parameters: z.object({
                        topic: z.string().describe("News topic e.g. AI, cricket, India, technology"),
                        max_results: z.number().optional().describe("Number of articles, default 5"),
                    }),
                    execute: async ({ topic, max_results }) => {
                        data.append({ type: "thinking", step: `Finding latest news about "${topic}"...` });
                        return executeTool("news-headlines", { topic, max_results });
                    },
                }),

                youtube_summary: tool({
                    description: 'Get a summary of any YouTube video. Use when the user shares a YouTube link or asks about video content.',
                    parameters: z.object({
                        url: z.string().describe('The YouTube URL'),
                    }),
                    execute: async ({ url }) => {
                        data.append({ type: 'thinking', step: `Summarising YouTube video...` });
                        return executeTool('youtube-summary', { url })
                    }
                }),

                currency_convert: tool({
                    description: 'Convert between currencies using live rates. Use when the user asks about currency conversion.',
                    parameters: z.object({
                        from: z.string().describe('Source currency code e.g. USD, INR, EUR'),
                        to: z.string().describe('Target currency code e.g. USD, INR, EUR'),
                        amount: z.number().describe('Amount to convert'),
                    }),
                    execute: async ({ from, to, amount }) => {
                        data.append({ type: 'thinking', step: `Converting ${amount} ${from} to ${to}...` });
                        return executeTool('currency-convert', { from, to, amount })
                    }
                }),

                telegram_send: tool({
                    description: 'Send a message to Tanmay on Telegram. Use when asked to send a reminder or notification.',
                    parameters: z.object({
                        message: z.string().describe('The message to send'),
                    }),
                    execute: async ({ message }) => {
                        data.append({ type: 'thinking', step: `Sending Telegram message...` });
                        return executeTool('telegram-send', { message })
                    }
                }),

                set_reminder: tool({
                    description: 'Set a reminder that will be delivered to Tanmay on Telegram after a specified time. Use when he says "remind me in X to do Y", "set a reminder", or "message me in X about Y".',
                    parameters: z.object({
                        message: z.string().describe('The reminder message to send'),
                        duration: z.string().describe('How long to wait e.g. "15 mins", "2 hours", "1 day"'),
                    }),
                    execute: async ({ message, duration }) => {
                        data.append({ type: 'thinking', step: `Setting reminder for ${duration}...` });
                        return executeTool('set-reminder', { message, duration })
                    }
                }),
            };

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
