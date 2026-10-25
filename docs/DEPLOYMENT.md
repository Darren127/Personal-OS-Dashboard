# Deploying Personal OS

This guide puts Personal OS online with **Vercel** (runs the app) and a
**hosted Supabase project** (database and login). Both have free tiers that
are enough for one person. The only paid part is the optional AI Companion,
which uses pay-as-you-go Claude API billing — separate from a Claude Pro
subscription.

> Status: this guide has been checked against the code and the local setup,
> but a real deployment hasn't been done yet (the build environment couldn't
> reach supabase.com or Vercel). Follow it step by step and check each
> "Verify" line.

## 1. Put the code on GitHub

Vercel deploys from a GitHub repository. Never commit `.env.local` — it is
already git-ignored, and `.env.example` contains placeholders only.

**Verify:** `git ls-files | grep env` lists only `.env.example`.

## 2. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) → **New project**. Pick the
   region closest to you and save the database password in a password manager.
2. Apply this repo's schema. **Easiest (no terminal):** add three repository
   secrets on GitHub (Settings → Secrets and variables → Actions →
   New repository secret): `SUPABASE_ACCESS_TOKEN` (supabase.com → Account →
   Access Tokens), `SUPABASE_PROJECT_REF` (Project Settings → General → Project ID: 20 lowercase letters)
   and `SUPABASE_DB_PASSWORD`. Then Actions → **Set up database** → Run workflow.
   **Or, from a terminal** (Node.js and the repo needed; Docker is not):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>   # from the project URL
   npx supabase db push                                 # applies supabase/migrations/
   ```
   `db push` only adds migrations that haven't been applied yet; it never
   resets or deletes data. Never edit tables by hand in the dashboard — add a
   new migration file instead, so local and hosted stay identical.
3. **Authentication → Sign In / Providers:** turn **off** "Allow new users to
   sign up". (Locally this is already off in `supabase/config.toml`.)
4. **Authentication → URL Configuration:** set **Site URL** to your Vercel
   address (e.g. `https://personal-os-you.vercel.app`) once you have it (step 3).
5. **Project Settings → API Keys:** note the project URL, the **publishable**
   key, and the **secret** key.

**Verify:** in the dashboard's Table Editor every table shows "RLS enabled".
`npx supabase db lint --linked` reports no errors.

## 3. Deploy to Vercel

1. At [vercel.com](https://vercel.com) → **Add New → Project** → import the
   GitHub repository. Vercel detects Next.js; keep the default build settings.
2. Add these **Environment Variables** (Production):

   | Name | Value | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Public by design |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Public by design; RLS protects data |
   | `ANTHROPIC_API_KEY` | `sk-ant-…` | Optional; only for the AI Companion. **Secret** |
   | `AI_MONTHLY_BUDGET_USD` | e.g. `10` | Optional; the Companion stops at this estimated spend |
   | `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` | leave empty | Optional overrides |

   **Do not add `SUPABASE_SECRET_KEY` to Vercel.** The app never uses it; only
   the `create-user` script on your own computer does.
3. Deploy. Then go back to Supabase step 2.4 and set the Site URL.

**Verify:** `https://<your-app>/api/health` returns `{"ok":true,"time":"…"}`.
Signed out, it shows nothing else.

## 4. Create your login

Sign-up is disabled, so create your one account yourself. **Easiest:**
Supabase dashboard → Authentication → Users → **Add user → Create new user**,
enter your email and a password (10+ characters), and tick **Auto Confirm User**.

Or from a terminal, with the hosted project's `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SECRET_KEY` in `.env.local`:

```bash
npm run create-user -- you@example.com   # prompts for a password, min 10 characters
```

**Verify:** sign in on the deployed site. Settings → "Connections" shows
Supabase as configured. Visiting `/api/health` while signed in shows which
integrations are configured (true/false only — never the keys).

## 5. Turn on the AI Companion (optional)

1. Create a key at [console.anthropic.com](https://console.anthropic.com) →
   API Keys. This is billed per use; a Claude Pro subscription does not cover it.
2. In the Console, set a **monthly spend limit** (Billing → Limits). This is
   the hard limit; `AI_MONTHLY_BUDGET_USD` is an extra soft limit in the app.
3. Add `ANTHROPIC_API_KEY` (and optionally `AI_MONTHLY_BUDGET_USD`) in Vercel
   and redeploy.

**Verify:** send "What should I focus on today?" in the Companion. It should
answer using your real tasks. Ask it to add a task: it must show **Needs your
approval**, and the task appears only after you click Approve. Settings shows
the estimated spend this month.

Long Companion answers can take up to a minute; the chat route allows up to
300 seconds (`maxDuration`). On Vercel's free plan the limit may be lower — if
long replies are cut off, lower `ANTHROPIC_EFFORT` to `low`.

## 6. Turn on Gmail Intelligence (optional)

Follow [`GMAIL_SETUP.md`](GMAIL_SETUP.md). On Vercel, set `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
(`https://<your-app>.vercel.app/api/gmail/callback`, registered in Google
Cloud) and `GOOGLE_TOKEN_ENCRYPTION_KEY`, then redeploy.

## Security checklist

- [ ] Sign-ups disabled in Supabase.
- [ ] `SUPABASE_SECRET_KEY` is **not** in Vercel.
- [ ] Nothing secret starts with `NEXT_PUBLIC_`.
- [ ] Anthropic Console spend limit set.
- [ ] If Gmail is enabled: `GOOGLE_CLIENT_SECRET` and `GOOGLE_TOKEN_ENCRYPTION_KEY` set only in Vercel (never `NEXT_PUBLIC_`), and the Google consent screen requests only `gmail.readonly`.
- [ ] `/api/health` signed out shows only `ok` and `time`.
- [ ] Responses carry `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`
      (browser dev tools → Network → any request → Headers).

## Updating later

- **Code:** push to GitHub; Vercel redeploys. CI (`.github/workflows/ci.yml`)
  runs all tests on each push.
- **Schema:** add a file in `supabase/migrations/`, test locally
  (`npm run db:test`), then `npx supabase db push`.
- **Backups:** Supabase's free plan has limited backups. Export your data
  regularly (Dashboard → Database → Backups, or `npx supabase db dump --data-only`).
