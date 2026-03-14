/**
 * src/lib/supabase/client.ts
 *
 * Browser Supabase client — use in Client Components ("use client").
 * Uses the publishable anon key; RLS governs what data is accessible.
 */

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

// Call once per render / hook; @supabase/ssr deduplicates internally.
export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}
