import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Supabase Admin client for background tasks.
 * Bypasses RLS and doesn't require a request context (no cookies).
 */
export const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);
