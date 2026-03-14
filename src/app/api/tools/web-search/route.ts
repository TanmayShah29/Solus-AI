/**
 * src/app/api/tools/web-search/route.ts
 *
 * Web search tool using Tavily.
 */

import { env } from "@/lib/env";
import { tavily } from "@tavily/core";
import { traceable } from "langsmith/traceable";
import { getCached, setCached } from '@/lib/redis/client';

// Standard tool results formatting
const POST_HANDLER = async (req: Request) => {
    const start = Date.now();

    try {
        // Auth check
        const authHeader = req.headers.get("authorization");
        if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { args } = await req.json();
        const { query, max_results } = args || {};

        if (!query) {
            return Response.json(
                { success: false, summary: "Missing query parameter", error: "Bad Request" },
                { status: 400 }
            );
        }

        const cacheKey = `search:${query.toLowerCase()}:${max_results ?? 5}`;
        const cached = await getCached<any>(cacheKey);
        if (cached) {
            return Response.json({ ...cached, cached: true, duration_ms: Date.now() - start });
        }

        const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
        const response = await client.search(query, {
            maxResults: max_results ?? 5,
            searchDepth: "basic",
        });

        const result = {
            success: true,
            result: response.results.map((r) => ({
                title: r.title,
                url: r.url,
                content: r.content,
                score: r.score,
            })),
            summary: `Found ${response.results.length} results for "${query}". Top result: ${response.results[0]?.title ?? "none"}`,
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
            summary: `Tool failed: ${error.message}`,
            error: error.message,
            duration_ms: Date.now() - start,
        });
    }
};

export const POST = traceable(POST_HANDLER, { name: "tool_web_search" });
