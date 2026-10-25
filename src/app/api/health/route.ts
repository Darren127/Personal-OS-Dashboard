import { connection } from "next/server";

import { getIntegrationStatus } from "@/lib/server/env";
import { createClient, getSupabaseConfig } from "@/lib/supabase/server";

/**
 * Liveness check. Anyone gets `{ ok, time }`; which integrations are
 * configured (booleans only, never values) is shown only to a signed-in user,
 * or before Supabase is set up, when there is no login to protect yet.
 */
export async function GET() {
  await connection();
  const basic = { ok: true, time: new Date().toISOString() };

  if (getSupabaseConfig()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) return Response.json(basic);
  }

  const s = getIntegrationStatus();
  return Response.json({
    ...basic,
    integrations: {
      supabase: s.supabase.url && s.supabase.publishableKey,
      anthropic: s.anthropic.apiKey,
      scheduler: s.scheduler.configured,
    },
    configProblems: s.problems.length,
  });
}
