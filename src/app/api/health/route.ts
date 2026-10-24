import { connection } from "next/server";

import { getIntegrationStatus } from "@/lib/server/env";

/** Liveness check plus which integrations are configured (booleans only). */
export async function GET() {
  await connection();
  const s = getIntegrationStatus();
  return Response.json({
    ok: true,
    time: new Date().toISOString(),
    integrations: {
      supabase: s.supabase.url && s.supabase.publishableKey,
      anthropic: s.anthropic.apiKey,
      scheduler: s.scheduler.configured,
    },
    configProblems: s.problems.length,
  });
}
