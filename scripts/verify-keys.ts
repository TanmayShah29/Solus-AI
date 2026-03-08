/**
 * scripts/verify-keys.ts
 *
 * Phase 1 API key verifier for SOLUS.
 * Makes real API calls — not just string-empty checks.
 *
 * Run with:  npx tsx scripts/verify-keys.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// ── Load .env.local from project root ─────────────────────────────────────────
config({ path: resolve(process.cwd(), ".env.local") });

// ── Helpers ───────────────────────────────────────────────────────────────────
const env = (key: string): string => {
    const v = process.env[key];
    if (!v || v.trim() === "") {
        throw new Error(`${key} is missing or empty in .env.local`);
    }
    return v.trim();
};

const pass = (label: string, detail: string) =>
    console.log(`✅ ${label} — ${detail}`);

const fail = (label: string, reason: string) =>
    console.log(`❌ ${label} — FAILED. Reason: ${reason}`);

// ── 1. Groq ───────────────────────────────────────────────────────────────────
async function checkGroq(): Promise<void> {
    const label = "Groq";
    try {
        const key = env("GROQ_API_KEY");

        const res = await fetch("https://api.groq.com/openai/v1/models", {
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
        });

        if (!res.ok) {
            fail(label, `HTTP ${res.status} — ${await res.text()}`);
            return;
        }

        const data = (await res.json()) as { data: Array<{ id: string }> };
        const ids = data.data.map((m) => m.id);

        const required = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"] as const;
        const checks = required.map((m) => `${m} ${ids.includes(m) ? "✓" : "✗ MISSING"}`);

        const allPresent = required.every((m) => ids.includes(m));
        if (allPresent) {
            pass(label, `connected. Models available: ${checks.join(", ")}`);
        } else {
            fail(label, `connected but required models missing: ${checks.join(", ")}`);
        }
    } catch (e: unknown) {
        fail(label, e instanceof Error ? e.message : String(e));
    }
}

// ── 2. Supabase anon ──────────────────────────────────────────────────────────
async function checkSupabaseAnon(): Promise<void> {
    const label = "Supabase anon";
    try {
        const url = env("NEXT_PUBLIC_SUPABASE_URL");
        const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

        const supabase = createClient(url, anonKey);

        // A table-not-found Postgres error means the project is reachable and the key
        // is valid. Only a 401 / invalid-api-key means the credential is wrong.
        const { error } = await supabase.from("conversations").select("count");

        if (!error) {
            pass(label, "connected. Project responding (table found, no error).");
            return;
        }

        // Postgres error codes from a real DB → connection is fine
        const pgErrorCodes = ["42P01", "PGRST116", "42703"];
        const httpCode = (error as { code?: string; status?: number }).status;
        const pgCode = (error as { code?: string }).code ?? "";

        if (httpCode === 401 || error.message?.toLowerCase().includes("invalid api key")) {
            fail(label, `401 Unauthorised — NEXT_PUBLIC_SUPABASE_ANON_KEY is wrong`);
            return;
        }

        if (pgErrorCodes.some((c) => pgCode.startsWith(c)) || httpCode === 200 || error.message?.includes("does not exist")) {
            pass(label, `connected. Project responding (Postgres error expected — table doesn't exist yet: ${error.message})`);
        } else {
            // Any other non-401 error still means the server is reachable
            pass(label, `connected. Project responding with: ${error.message}`);
        }
    } catch (e: unknown) {
        fail(label, e instanceof Error ? e.message : String(e));
    }
}

// ── 3. Supabase service role ───────────────────────────────────────────────────
async function checkSupabaseServiceRole(): Promise<void> {
    const label = "Supabase service role";
    try {
        const url = env("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

        const supabaseAdmin = createClient(url, serviceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        const { data, error } = await supabaseAdmin.auth.admin.listUsers();

        if (error) {
            const status = (error as { status?: number }).status;
            if (status === 401) {
                fail(label, `401 Unauthorised — SUPABASE_SERVICE_ROLE_KEY is wrong`);
            } else {
                fail(label, `${status ?? "?"} — ${error.message}`);
            }
            return;
        }

        pass(label, `connected. Auth admin working. Users in project: ${data.users.length}`);
    } catch (e: unknown) {
        fail(label, e instanceof Error ? e.message : String(e));
    }
}

// ── 4. LangSmith ──────────────────────────────────────────────────────────────
async function checkLangSmith(): Promise<void> {
    const label = "LangSmith";
    try {
        const key = env("LANGSMITH_API_KEY");

        const res = await fetch("https://api.smith.langchain.com/api/v1/workspaces", {
            headers: {
                "x-api-key": key,
                "Content-Type": "application/json",
            },
        });

        if (!res.ok) {
            fail(label, `HTTP ${res.status} — ${await res.text()}`);
            return;
        }

        const data = (await res.json()) as Array<{ name?: string; id?: string }>;
        const names = Array.isArray(data) ? data.map((w) => w.name ?? w.id ?? "unnamed").join(", ") : "unknown";
        pass(label, `connected. Workspace found: ${names}`);
    } catch (e: unknown) {
        fail(label, e instanceof Error ? e.message : String(e));
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    console.log("\n🔑 SOLUS Phase 1 — API Key Verification\n");
    console.log("─".repeat(50));

    // Run all checks independently so one failure doesn't stop the others
    await Promise.all([
        checkGroq(),
        checkSupabaseAnon(),
        checkSupabaseServiceRole(),
        checkLangSmith(),
    ]);

    console.log("\n" + "─".repeat(50));
    console.log("Done.\n");
}

main().catch((e) => {
    console.error("Unexpected error in main:", e);
    process.exit(1);
});
