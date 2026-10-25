import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import type { Database } from "@/lib/supabase/database.types";

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "(locally in .env.local; on Vercel in Project Settings → Environment Variables, then redeploy).",
    );
  }
}

/**
 * Supabase client acting as the signed-in user (via their session cookie).
 * Every query runs under Row Level Security as that user.
 * Create a fresh one per request — never share across requests.
 */
export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new SupabaseNotConfiguredError();
  // Personal data is always rendered at request time, never prerendered.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

export type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Verifies the session with Supabase Auth and returns the client plus the
 * user's ID. Redirects to /login when signed out. Cached per request.
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login");
  return {
    supabase,
    userId,
    email: (data.claims.email as string | undefined) ?? null,
  };
});
