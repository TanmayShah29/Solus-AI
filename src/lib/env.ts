// All environment access goes through this file. Never use process.env directly.

/**
 * src/lib/env.ts
 *
 * Single source of truth for all environment variables in the SOLUS project.
 * Validated at startup — if any Phase 1 required variable is missing the
 * process throws immediately with a human-readable list of what's wrong.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   const key = env.GROQ_API_KEY;
 */

import "dotenv/config";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
    // ── Phase 1 required — will throw if missing ─────────────────────────────

    // Groq
    GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),

    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: z
        .string()
        .min(1, "NEXT_PUBLIC_SUPABASE_URL is required")
        .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z
        .string()
        .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
    SUPABASE_SERVICE_ROLE_KEY: z
        .string()
        .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

    // LangSmith
    LANGSMITH_API_KEY: z.string().min(1, "LANGSMITH_API_KEY is required"),

    // SOLUS identity
    MY_USER_ID: z.string().min(1, "MY_USER_ID is required"),
    MY_TELEGRAM_ID: z.string().min(1, "MY_TELEGRAM_ID is required"),
    MY_TIMEZONE: z.string().min(1, "MY_TIMEZONE is required"),

    // Security
    API_SECRET_TOKEN: z.string().min(1, "API_SECRET_TOKEN is required"),

    // ── Phase 1 with defaults — will not throw ───────────────────────────────

    LANGCHAIN_TRACING_V2: z
        .string()
        .refine((v) => v === "true" || v === "false", {
            message: 'LANGCHAIN_TRACING_V2 must be "true" or "false"',
        })
        .default("true"),
    LANGCHAIN_PROJECT: z.string().min(1).default("solus"),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    MORNING_BRIEF_CRON: z.string().min(1).default("30 0 * * *"),

    // ── Future phases — optional, will not throw ─────────────────────────────

    // Inngest (Phase 2)
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),

    // Upstash Redis (Phase 2)
    UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal("")),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    // Tavily (Phase 4)
    TAVILY_API_KEY: z.string().optional(),

    // Telegram (Phase 5)
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_SECRET_TOKEN: z.string().optional(),

    // Google OAuth (Phase 8)
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_REDIRECT_URI: z.string().url(),
    GOOGLE_ACCESS_TOKEN: z.string().optional(),
    GOOGLE_REFRESH_TOKEN: z.string().optional(),

    // GitHub (Long Term Memory)
    GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),
    GITHUB_REPO: z.string().min(1, "GITHUB_REPO is required"), // format: "TanmayShah29/Solus-AI"
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateEnv() {
    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
        // Produce a clean, readable list — not a raw Zod dump.
        const missing = parsed.error.issues.map(
            (issue) => `  • ${String(issue.path[0] ?? "(unknown)")}: ${issue.message}`
        );

        throw new Error(
            [
                "",
                "❌  SOLUS startup failed — missing or invalid environment variables:",
                ...missing,
                "",
                "Copy .env.example to .env.local and fill in the required values.",
                "",
            ].join("\n")
        );
    }

    return parsed.data;
}

// Validate once at module load time (server-side only).
// Next.js client bundles never import this file — only NEXT_PUBLIC_* vars.
export const env = validateEnv();

// ─────────────────────────────────────────────────────────────────────────────
// Type export
// ─────────────────────────────────────────────────────────────────────────────

export type Env = z.infer<typeof envSchema>;
