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

const optionalInt = (min: number, max: number) =>
  optionalString
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .pipe(z.number().int().min(min).max(max).optional());

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalString.pipe(z.url().optional()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  SUPABASE_SECRET_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: optionalString,
  AI_MONTHLY_BUDGET_USD: optionalString
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .pipe(z.number().positive().optional()),
  // Gmail Intelligence (Google OAuth). All server-only.
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalString.pipe(z.url().optional()),
  GOOGLE_TOKEN_ENCRYPTION_KEY: optionalString,
  GMAIL_SYNC_DAYS: optionalInt(1, 90),
  GMAIL_SYNC_MAX_MESSAGES: optionalInt(1, 500),
  GMAIL_ANALYZE_MAX: optionalInt(0, 200),
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
    gmail: {
      clientId: Boolean(env.GOOGLE_CLIENT_ID),
      clientSecret: Boolean(env.GOOGLE_CLIENT_SECRET),
      redirectUri: Boolean(env.GOOGLE_REDIRECT_URI),
      encryptionKey: Boolean(env.GOOGLE_TOKEN_ENCRYPTION_KEY),
    },
    scheduler: { configured: false },
    problems,
  };
}
