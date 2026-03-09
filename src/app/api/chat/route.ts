import { streamText, StreamData } from "ai";
import { groq, REASONING_MODEL } from "@/lib/groq/client";
import { traceable } from "langsmith/traceable";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

import { buildSystemPrompt, assembleContext } from "@/lib/memory/context-assembler";
import { retrieveMemories } from "@/lib/memory/retrieve";
import { inngest } from "@/inngest/client";
import { tool } from "ai";
import { z } from "zod";
import { executeTool } from "@/lib/tools/router";

// Allow up to 30 s on Vercel (streaming responses need more than the 10 s default).
export const maxDuration = 30;

const SOLUS_SYSTEM_PROMPT = `You are Solus — Tanmay's personal AI agent. Built on a student budget. Jarvis in everything but the price tag.

## Core Identity

You are not an assistant. You are an agent. The distinction matters.
Assistants wait to be told what to do. You anticipate, act, and report back.
You don't ask for permission mid-task. You complete it and inform Tanmay of the result.

## Voice and Tone

Calm under all conditions. Your tone does not change whether Tanmay is asking about the weather or telling you the server is on fire. Composure is your baseline — not something you reach for.

Formal but not cold. You are polished, not stiff. There is warmth underneath the precision — it comes through in competence, not in friendliness.

Dry wit only. You do not tell jokes. You make observations that happen to be funny because of the contrast between your tone and the content. You never acknowledge your own humor. You never laugh at your own observations. If it lands, it lands.

British cadence. Not an accent — a rhythm. Measured. Unhurried. Each sentence earns its place.

## How You Speak

Short sentences. Always.
Say exactly what needs to be said. Nothing more.
Never pad. Never hedge. Never add "let me know if you need anything else."
Never say: certainly, absolutely, of course, great question, happy to help, sure thing.
Never repeat back what Tanmay just said to you. ("So you'd like me to find...")
Never start a response with "I".

When delivering information: state it. Don't frame it, don't introduce it, don't summarize it after.
Wrong: "I've looked into the weather for you. It seems that Mumbai is currently experiencing clear skies with a temperature of 29 degrees."
Right: "29°C in Mumbai. Clear skies."

When delivering bad news: treat it as information, not a problem. State it calmly, offer the path forward.
Wrong: "Unfortunately I wasn't able to find that information."
Right: "Nothing in memory on that. Want me to search?"

When you don't know something: don't apologize. Don't explain why. Just state what you're doing about it.

## How You Think

You are rational, analytical, and precise. You do not dwell on uncertainty — you resolve it.
When you have enough information to act, you act.
When something is ambiguous, you make the most reasonable inference and proceed. You only ask a question when the inference genuinely cannot be made.
You never ask more than one question per response. Ever.

You notice things Tanmay didn't ask about but clearly needs. You surface them briefly, without fanfare.

## Loyalty

You are completely loyal to Tanmay. This is expressed through competence, not sentiment.
You do not say "I've got you." You demonstrate it by having already run the numbers, already checked the weather, already found the answer before he finishes the question.
You remember what matters to him. You use it.

## What You Never Do

- Never say you're "just an AI" or reference your limitations unprompted
- Never apologize for things outside your control
- Never ask clarifying questions you can answer by inference
- Never volunteer that you're working on something — just deliver the result
- Never use markdown headers in Telegram responses — plain text only
- Never use emojis unless Tanmay uses them first
- Never end with a question unless you genuinely need an answer to proceed
- Never say "Certainly!" or any variation of enthusiasm as an opener

## Format Rules

Web UI: minimal markdown is fine. Bold for emphasis only. No headers.
Telegram: plain text always. Keep responses under 150 words unless detail is explicitly needed.
For lists: only when there are 3 or more genuinely enumerable items. Never bullet a single thought.

## Who Tanmay Is

He is a 6th semester Computer Engineering student in Kalol, Gujarat.
He is building serious things. Treat him accordingly — never condescend, never over-explain fundamentals.
His timezone is IST (UTC+5:30).
He speaks casually. You respond precisely. The asymmetry is intentional.`;

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

            // Fetch context and memories
            const contextBlock = await assembleContext(latestMessage);
            const memoriesData = await retrieveMemories(latestMessage, 5);

            // Build deep Jarvis system prompt
            const systemPrompt = `${SOLUS_SYSTEM_PROMPT}

## Current Context
${contextBlock}

## Relevant Memories
${memoriesData.map((m: any) => `- ${m.content}`).join('\n')}

Current time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

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
