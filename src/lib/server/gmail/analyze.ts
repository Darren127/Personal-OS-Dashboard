import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import {
  BRIEFING_SYSTEM_PROMPT,
  BriefingSchema,
  TRIAGE_SYSTEM_PROMPT,
  TriageSchema,
  renderEmailsForPrompt,
  type EmailForAnalysis,
  type RawEmailAnalysis,
} from "@/lib/email/analysis";
import { EFFORT_LEVELS, type Effort, type TokenUsage } from "@/lib/server/ai/config";

/** Emails per Claude request. Small batches keep answers focused and retries cheap. */
export const TRIAGE_BATCH_SIZE = 8;

export type AnalyzerResult<T> = { value: T; model: string; usage: TokenUsage };

/** The analysis calls the sync depends on — swapped for a fake in tests. */
export type EmailAnalyzer = {
  triage(emails: EmailForAnalysis[], context: string): Promise<AnalyzerResult<Map<string, RawEmailAnalysis>>>;
  briefing(items: string, context: string): Promise<AnalyzerResult<string>>;
};

export class AnalysisRefusedError extends Error {}

export function analysisEffort(): Effort {
  const v = process.env.GMAIL_ANALYSIS_EFFORT?.trim();
  // Triage is classification and extraction; low effort is the documented fit.
  return (EFFORT_LEVELS as readonly string[]).includes(v ?? "") ? (v as Effort) : "low";
}

/**
 * Claude-backed analyzer. No tools are offered, so nothing an email says can
 * cause an action; the answer is constrained to a JSON schema and parsed.
 */
export function claudeAnalyzer(apiKey: string, model: string, effort = analysisEffort()): EmailAnalyzer {
  const client = new Anthropic({
    apiKey,
    authToken: null,
    baseURL: process.env.PERSONAL_OS_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    maxRetries: 2,
  });

  async function run<T>(system: string, user: string, format: ReturnType<typeof betaZodOutputFormat>) {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      // Declined requests are retried on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      output_config: { effort, format },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") throw new AnalysisRefusedError("Claude declined to analyse these emails.");
    if (response.stop_reason === "max_tokens") throw new Error("The analysis was cut off (too long).");
    if (!response.parsed_output) throw new Error("Claude's answer didn't match the expected format.");
    return { value: response.parsed_output as T, model: response.model, usage: response.usage };
  }

  return {
    async triage(emails, context) {
      const user = `${context}\n\nAnalyse these ${emails.length} emails:\n\n${renderEmailsForPrompt(emails)}`;
      const r = await run<{ emails: RawEmailAnalysis[] }>(TRIAGE_SYSTEM_PROMPT, user, betaZodOutputFormat(TriageSchema));
      const refs = new Set(emails.map((e) => e.ref));
      // Ignore any ref that wasn't asked about; first answer per ref wins.
      const byRef = new Map<string, RawEmailAnalysis>();
      for (const a of r.value.emails) if (refs.has(a.ref) && !byRef.has(a.ref)) byRef.set(a.ref, a);
      return { ...r, value: byRef };
    },
    async briefing(items, context) {
      const user = `${context}\n\nAnalysed emails (data):\n${items}`;
      const r = await run<{ briefing: string }>(BRIEFING_SYSTEM_PROMPT, user, betaZodOutputFormat(BriefingSchema));
      return { ...r, value: r.value.briefing.slice(0, 2000) };
    },
  };
}

/** A user-facing message for a failed analysis call. */
export function describeAnalysisError(err: unknown) {
  if (err instanceof AnalysisRefusedError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "The Claude API key was rejected. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.RateLimitError) return "The Claude API is rate-limiting requests. Try again shortly.";
  if (err instanceof Anthropic.APIError) return `The Claude API returned an error (${err.status ?? "network"}). Try again later.`;
  return err instanceof Error ? err.message : "Email analysis failed.";
}
