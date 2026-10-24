import "server-only";

import { z } from "zod";

/**
 * Server-side environment configuration.
 *
 * `server-only` makes the build fail if this file is ever imported into code
 * that runs in the browser, so secrets here can never leak to the client.
 *
 * Every variable is optional at this stage so the app can run before any
 * credentials are configured; features check `isConfigured` before use.
 */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalString.pipe(z.url().optional()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  SUPABASE_SECRET_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: optionalString,
  AI_MONTHLY_BUDGET_USD: optionalString
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .pipe(z.number().positive().optional()),
});

export type ServerEnv = z.infer<typeof envSchema>;

export type EnvStatus = {
  ok: boolean;
  env: ServerEnv;
  /** Human-readable problems, e.g. a malformed URL. Never contains values. */
  problems: string[];
};

export function readServerEnv(): EnvStatus {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) return { ok: true, env: parsed.data, problems: [] };
  return {
    ok: false,
    env: {} as ServerEnv,
    problems: parsed.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    ),
  };
}

/** Which integrations have credentials present. Booleans only — safe to show. */
export function getIntegrationStatus() {
  const { env, problems } = readServerEnv();
  return {
    supabase: {
      url: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
      publishableKey: Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      secretKey: Boolean(env.SUPABASE_SECRET_KEY),
    },
    anthropic: {
      apiKey: Boolean(env.ANTHROPIC_API_KEY),
      model: env.ANTHROPIC_MODEL ?? null,
      monthlyBudgetUsd: env.AI_MONTHLY_BUDGET_USD ?? null,
    },
    scheduler: { configured: false },
    problems,
  };
}
