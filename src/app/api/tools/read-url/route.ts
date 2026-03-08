/**
 * src/app/api/tools/read-url/route.ts
 *
 * Tool to fetch a URL and extract clean readable text using cheerio.
 */

import { env } from "@/lib/env";
import * as cheerio from "cheerio";
import { traceable } from "langsmith/traceable";

const POST_HANDLER = async (req: Request) => {
    const start = Date.now();

    try {
        // Auth check
        const authHeader = req.headers.get("authorization");
        if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { args } = await req.json();
        const { url, max_length } = args || {};

        if (!url || !url.startsWith("http")) {
            return Response.json(
                { success: false, summary: "Missing or invalid URL", error: "Bad Request" },
                { status: 400 }
            );
        }

        const response = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; Solus/1.0)" },
        });

        if (!response.ok) {
            return Response.json({
                success: false,
                summary: `Failed to fetch URL: ${response.statusText}`,
                error: `HTTP ${response.status}`,
                duration_ms: Date.now() - start,
            });
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Remove noise
        $("script, style, nav, footer, header, aside, iframe, noscript").remove();

        // Extract title and body text
        const title = $("title").text().trim() || "Untitled";
        const body = $("body")
            .text()
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, max_length ?? 3000);

        return Response.json({
            success: true,
            result: { title, content: body, url },
            summary: `Read "${title}" from ${url}. Extracted ${body.length} characters.`,
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

export const POST = traceable(POST_HANDLER, { name: "tool_read_url" });
