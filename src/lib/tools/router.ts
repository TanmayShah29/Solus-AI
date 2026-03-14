/**
 * src/lib/tools/router.ts
 *
 * Central dispatcher for all Solus tools.
 * Routes tool calls to Next.js API route handlers.
 */

import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type ToolResult = {
    success: boolean;
    result: unknown;
    summary: string;
    error?: string;
    executionMs: number;
    retry_suggestion?: string;
    args_used?: Record<string, unknown>;
};

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

/**
 * Executes a single tool by calling its Next.js API route.
 * Logs the execution to Supabase for auditing.
 */
export async function executeTool(
    toolName: string,
    args: Record<string, unknown>,
    retryCount = 0
): Promise<ToolResult> {
    const MAX_RETRIES = 2;
    const startTime = Date.now();
    const toolUrl = `${BASE_URL}/api/tools/${toolName.replace(/_/g, "-")}`;

    try {
        const response = await fetch(toolUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.API_SECRET_TOKEN}`,
            },
            body: JSON.stringify({
                args,
                user_id: env.MY_USER_ID,
            }),
        });

        const data = await response.json();
        const duration_ms = Date.now() - startTime;

        const success = response.ok && data.success !== false;

        const result: ToolResult = {
            success,
            result: data.result ?? data,
            summary: data.summary ?? (response.ok ? "Tool executed successfully" : "Tool failed"),
            error: data.error,
            executionMs: duration_ms,
        };

        // If tool failed and we haven't exhausted retries, return error with context
        // so the LLM kernel can self-correct and retry
        if (!success && retryCount < MAX_RETRIES) {
            result.retry_suggestion = `Tool ${toolName} failed with: "${data.error || 'Unknown error'}". Analyze the error, correct the arguments, and try again.`;
            result.args_used = args;
        }

        // Log to Supabase (Fire and forget, don't block response)
        logToolExecution(toolName, args, result).catch(console.error);

        return result;
    } catch (error: unknown) {
        const duration_ms = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);

        const result: ToolResult = {
            success: false,
            result: null,
            summary: "Tool failed",
            error: message,
            executionMs: duration_ms,
        };

        if (retryCount < MAX_RETRIES) {
            result.retry_suggestion = `Tool ${toolName} threw: "${message}". Check the arguments and retry.`;
            result.args_used = args;
        }

        logToolExecution(toolName, args, result).catch(console.error);
        return result;
    }
}

/**
 * Dispatches multiple tool calls in parallel.
 */
export async function executeTools(
    toolCalls: Array<{ toolName: string; args: Record<string, unknown> }>
): Promise<ToolResult[]> {
    return Promise.all(
        toolCalls.map(({ toolName, args }) => executeTool(toolName, args))
    );
}

/**
 * Logs tool execution details to the database.
 */
async function logToolExecution(
    toolName: string,
    args: Record<string, unknown>,
    result: ToolResult
) {
    const supabase = await createClient();
    await supabase.from("tool_executions").insert({
        user_id: env.MY_USER_ID,
        tool_name: toolName,
        action: "execute",
        args,
        result: result.result,
        success: result.success,
        duration_ms: result.executionMs,
    });
}
