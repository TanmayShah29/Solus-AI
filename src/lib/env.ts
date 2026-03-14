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

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
    // ── Phase 1 required — will throw if missing ─────────────────────────────

    // Groq
    GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
    GOOGLE_GEMINI_API_KEY: z.string().optional(),

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
    LANGSMITH_API_KEY: z.string().optional(),

    // SOLUS identity
    MY_USER_ID: z.string().default('tanmay'),
    MY_TELEGRAM_ID: z.string().default('1870486124'),
    MY_TIMEZONE: z.string().default('Asia/Kolkata'),

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
    NEXT_PUBLIC_API_SECRET_TOKEN: z.string().optional(),
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
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

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
// Type export
// ─────────────────────────────────────────────────────────────────────────────

export type Env = z.infer<typeof envSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateEnv(): Env {
    const isServer = typeof window === 'undefined';

    if (!isServer) {
        // In the browser, Next.js performs static replacement of process.env.NEXT_PUBLIC_...
        // We MUST use the full process.env.NEXT_PUBLIC_NAME string for replacement to work.
        return {
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL!,
            NEXT_PUBLIC_API_SECRET_TOKEN: process.env.NEXT_PUBLIC_API_SECRET_TOKEN!,
        } as Env;
    }

    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
        const missing = parsed.error.issues.map(
            (issue) => `  • ${String(issue.path[0] ?? "(unknown)")}: ${issue.message}`
        );

        const errorMsg = [
            "",
            "❌  SOLUS startup failed — missing or invalid environment variables:",
            ...missing,
            "",
            "Copy .env.example to .env.local and fill in the required values.",
            "",
        ].join("\n");

        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    return parsed.data;
}

export const env = validateEnv();

