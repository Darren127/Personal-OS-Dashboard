import { runGmailSync } from "@/lib/server/gmail/service";
import { createClient, getSupabaseConfig } from "@/lib/supabase/server";

// Fetching and analysing up to a few dozen emails can take a minute or two.
export const maxDuration = 300;

/**
 * "Refresh" on the Email Intelligence card. POST only, same-origin only:
 * it spends API credit, so another site must not be able to trigger it.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-site requests aren't allowed." }, { status: 403 });
  }
  if (!getSupabaseConfig()) return Response.json({ error: "The database isn't configured." }, { status: 503 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return Response.json({ error: "Please sign in again." }, { status: 401 });

  try {
    const result = await runGmailSync(supabase, userId);
    return Response.json(result, { status: result.ok ? 200 : result.reason === "gmail_error" ? 502 : 409 });
  } catch (err) {
    console.error("[gmail sync]", err instanceof Error ? err.message : "unknown error");
    return Response.json({ ok: false, reason: "gmail_error", message: "The sync failed unexpectedly. Try again." }, { status: 500 });
  }
}
