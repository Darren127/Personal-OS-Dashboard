import "server-only";

import { readServerEnv } from "@/lib/server/env";

/**
 * AI Companion configuration. Everything that costs money is configured here
 * and through environment variables, never hard-wired into features.
 */

export const DEFAULT_MODEL = "claude-opus-5-5";

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

/** Maximum model calls per user message (each tool round is one call). */
export const MAX_STEPS_PER_TURN = 8;

/**
 * Beta features this app relies on:
 * - server-side-fallback: a request declined by a safety filter is retried
 *   on Anthropic's recommended fallback model instead of failing outright.
 * - thinking-binding-controls: lets us set `prefix_mismatch_behavior`, so a
 *   conversation started under an older version of the system prompt drops
 *   stale reasoning instead of erroring.
 * - thinking-display-updates: returns the model's short progress notes
 *   between tool calls so the chat doesn't go silent.
 */
export const BETAS = [
  "server-side-fallback-2026-07-01",
  "thinking-binding-controls-2026-08-01",
  "thinking-display-updates-2026-08-18",
] as const;

/** US$ per million tokens. Estimates for the spending guard — check current pricing. */
type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };
const PRICING: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};
// Unknown models are priced at the most expensive known rate, so the guard errs safe.
const FALLBACK_PRICE: Price = PRICING["claude-fable-5-1"];

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function estimateCostUsd(model: string, u: TokenUsage) {
  const p = PRICING[model] ?? FALLBACK_PRICE;
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000
  );
}

export type AiConfig = {
  configured: boolean;
  apiKey: string | undefined;
  model: string;
  effort: Effort;
  monthlyBudgetUsd: number | null;
};

export function getAiConfig(): AiConfig {
  const { env } = readServerEnv();
  const effortRaw = process.env.ANTHROPIC_EFFORT?.trim();
  const effort = (EFFORT_LEVELS as readonly string[]).includes(effortRaw ?? "")
    ? (effortRaw as Effort)
    : "medium";
  return {
    configured: Boolean(env.ANTHROPIC_API_KEY),
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    effort,
    monthlyBudgetUsd: env.AI_MONTHLY_BUDGET_USD ?? null,
  };
}
