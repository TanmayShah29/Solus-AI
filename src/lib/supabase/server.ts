/**
 * src/lib/supabase/server.ts
 *
 * Server-side Supabase client — use in Server Components, API routes,
 * Route Handlers, and Middleware.
 *
 * Uses the service-role key so it bypasses RLS. Never expose this client
 * to the browser; it must only ever run on the server.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // setAll is called from Server Components where cookies are
                        // read-only. Safe to ignore — middleware handles refresh.
                    }
                },
            },
        }
    );
}
