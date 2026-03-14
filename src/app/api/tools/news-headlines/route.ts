/**
 * src/app/api/tools/news-headlines/route.ts
 *
 * News headlines tool using Tavily (news topic).
 */

import { env } from "@/lib/env";
import { tavily } from "@tavily/core";
import { traceable } from "langsmith/traceable";
import { getCached, setCached } from '@/lib/redis/client';

const POST_HANDLER = async (req: Request) => {
    const start = Date.now();

    try {
        // Auth check
        const authHeader = req.headers.get("authorization");
        if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { args } = await req.json();
        const { topic, max_results } = args || {};

        if (!topic) {
            return Response.json(
                { success: false, summary: "Missing topic parameter", error: "Bad Request" },
                { status: 400 }
            );
        }

        const cacheKey = `news:${topic.toLowerCase()}:${max_results ?? 5}`;
        const cached = await getCached<any>(cacheKey);
        if (cached) {
            return Response.json({ ...cached, cached: true, duration_ms: Date.now() - start });
        }

        const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
        const response = await client.search(`latest news ${topic}`, {
            maxResults: max_results ?? 5,
            searchDepth: "basic",
            topic: "news",
        });

        const result = {
            success: true,
            result: response.results.map((r: any) => ({
                title: r.title,
                url: r.url,
                content: r.content,
                published_date: r.publishedDate,
            })),
            summary: `Found ${response.results.length} news articles about "${topic}". Latest: ${response.results[0]?.title ?? "none"}`,
        };

        await setCached(cacheKey, result, 60 * 60); // 1 hour TTL

        return Response.json({
            ...result,
            duration_ms: Date.now() - start,
        });
    } catch (error: any) {
        return Response.json({
            success: false,
            result: null,
            summary: `News tool failed: ${error.message}`,
            error: error.message,
            duration_ms: Date.now() - start,
        });
    }
};

export const POST = traceable(POST_HANDLER, { name: "tool_news_headlines" });
