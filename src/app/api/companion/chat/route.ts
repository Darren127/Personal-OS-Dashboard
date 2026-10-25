import { z } from "zod";

import { getAiConfig } from "@/lib/server/ai/config";
import { runCompanionTurn, type ChatEvent } from "@/lib/server/ai/engine";
import { anthropicStreamer } from "@/lib/server/ai/model";
import { loadCompanionPrefs } from "@/lib/server/companion";
import { createClient, getSupabaseConfig } from "@/lib/supabase/server";

// A turn with several tool rounds can take a while.
export const maxDuration = 300;

const bodySchema = z.object({
  conversationId: z.uuid().nullable().optional(),
  message: z.string().trim().min(1, "Type a message first.").max(8000, "That message is too long."),
});

/**
 * Streams one Companion turn as newline-delimited JSON events (see ChatEvent).
 * The API key never leaves the server.
 */
export async function POST(request: Request) {
  const config = getAiConfig();
  if (!config.configured || !config.apiKey) {
    return Response.json({ error: "The AI Companion isn't set up: ANTHROPIC_API_KEY is missing." }, { status: 503 });
  }
  if (!getSupabaseConfig()) {
    return Response.json({ error: "The database isn't configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const prefs = await loadCompanionPrefs(supabase);
  const streamer = anthropicStreamer(config.apiKey);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: ChatEvent) => {
        if (!open) return; // the browser went away; keep running so the turn is stored
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        await runCompanionTurn({
          supabase,
          config,
          streamer,
          prefs,
          conversationId: parsed.data.conversationId ?? null,
          userText: parsed.data.message,
          emit,
        });
      } catch (err) {
        console.error("[companion] turn failed", err);
        emit({ type: "notice", level: "error", message: "Something went wrong on the server. Your conversation so far is saved." });
        emit({ type: "done", costUsd: 0 });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
