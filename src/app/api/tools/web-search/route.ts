/**
 * src/app/api/tools/web-search/route.ts
 *
 * Web search tool using Tavily.
 */

import { env } from "@/lib/env";
import { tavily } from "@tavily/core";
import { traceable } from "langsmith/traceable";

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

        const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
        const response = await client.search(query, {
            maxResults: max_results ?? 5,
            searchDepth: "basic",
        });

        return Response.json({
            success: true,
            result: response.results.map((r) => ({
                title: r.title,
                url: r.url,
                content: r.content,
                score: r.score,
            })),
            summary: `Found ${response.results.length} results for "${query}". Top result: ${response.results[0]?.title ?? "none"}`,
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
