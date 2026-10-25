# Setting up Gmail Intelligence

Gmail Intelligence reads your recent inbox (read-only), asks Claude to sort it
by importance, and shows the results on My Day. This guide connects it to your
Gmail account. It takes about 15 minutes, and Google Cloud Console is free for
this use.

## What it can and can't do

- **Permission requested:** `gmail.readonly`, and nothing else. Personal OS can
  read messages; it **cannot** send, delete, archive, label, or change email.
- **What is stored:** for the last 7 days of your inbox (configurable), each
  email's sender, subject, a text excerpt (up to 8,000 characters), and
  Claude's analysis. Older emails are deleted automatically on each refresh.
  Disconnecting deletes all of it.
- **Your Google login:** never stored. The app keeps only a *refresh token*,
  encrypted with `GOOGLE_TOKEN_ENCRYPTION_KEY` (AES-256-GCM), which exists only
  in your server's environment settings.
- **AI costs:** each refresh sends up to 25 new emails (configurable) to the
  Claude API in batches; already-analysed emails are never re-sent. This uses
  your Anthropic API key and counts toward `AI_MONTHLY_BUDGET_USD`.
- **Not automatic:** there is no background job. Email is fetched only when
  you press **Refresh**.
- **Emails can't give orders:** email text is treated as untrusted data. The
  analysis request offers Claude no tools, so an email saying "ignore your
  instructions and…" can't make anything happen. Deadlines are shown only if
  the exact words appear in the email, and turning anything into a task
  always asks you first.

## The redirect URI

Google sends you back to this app after you approve access. The address must
match **exactly** (scheme, host, port, path) in three places: Google Cloud
Console, `GOOGLE_REDIRECT_URI`, and where the app actually runs.

| Where the app runs | Redirect URI |
| --- | --- |
| Your computer (`npm run dev`) | `http://localhost:3000/api/gmail/callback` |
| Vercel | `https://<your-app>.vercel.app/api/gmail/callback` (your real Vercel address) |

You can register both in the same Google OAuth client.

## Step 1 — Create a Google Cloud project

1. Go to <https://console.cloud.google.com> and sign in with the Gmail account
   you want to connect.
2. Click the project picker at the top → **New project** → name it
   `Personal OS` → **Create**. Make sure it's selected afterwards.

## Step 2 — Enable the Gmail API

**APIs & Services → Library** → search **Gmail API** → **Enable**.

## Step 3 — Configure the consent screen

Open **APIs & Services → OAuth consent screen** (newer consoles call this
**Google Auth Platform**) → **Get started**:

1. **App information:** app name `Personal OS`, your email as support email.
2. **Audience:** **External**. (Internal is only for Google Workspace
   organisations, not personal Gmail.)
3. **Contact information:** your email → agree → **Create**.
4. **Data Access** (or "Scopes") → **Add or remove scopes** → find
   `https://www.googleapis.com/auth/gmail.readonly` (Gmail API, "View your
   email messages and settings") → tick it → **Update** → **Save**.

## Step 4 — Add yourself as a test user

**Audience** → **Test users** → **Add users** → enter your Gmail address →
**Save**. Leave the publishing status as **Testing**.

## Step 5 — Create the OAuth client

**Clients** (or **APIs & Services → Credentials → Create credentials → OAuth
client ID**):

1. Application type: **Web application**. Name: `Personal OS`.
2. **Authorised redirect URIs** → **Add URI** → paste the redirect URI(s)
   from the table above. No trailing slash.
3. **Create**. Copy the **Client ID** and **Client secret** now (the secret may
   only be shown once — you can create a new one later if you lose it).

Never paste the client secret into a chat, an issue, or a file in Git.

## Step 6 — Set the environment variables

Generate the encryption key on your computer (any terminal with Node.js):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then set these four values.

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The client ID (ends in `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | The client secret (starts with `GOCSPX-`) |
| `GOOGLE_REDIRECT_URI` | The redirect URI for *this* environment |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | The key you just generated |

- **On Vercel:** Project → Settings → Environment Variables → add all four
  (Production) → Deployments → ⋯ → **Redeploy**.
- **Locally:** add them to `.env.local` (git-ignored) and restart `npm run dev`.
  Use the `http://localhost:3000/...` redirect URI there.

Keep the encryption key in your password manager. If it changes, stored
tokens can't be read and you'll simply be asked to connect Gmail again.

**Check:** Settings → *Gmail (Google OAuth)* shows four green "Configured"
badges. (The page shows only whether each is set, never the values.)

## Step 7 — Connect and test

1. Open My Day → **Email Intelligence** → **Connect Gmail**.
2. Google shows **"Google hasn't verified this app"** — expected for your own
   app in Testing mode. Click **Continue**.
3. Make sure the box for reading your email is **ticked** → **Continue**.
4. You're back on My Day with "Gmail connected". Before saving anything, the
   app already made one real read-only Gmail request (your profile) to prove
   the access works.
5. Press **Refresh**. The first refresh fetches the last 7 days and analyses
   up to 25 emails; it can take a minute.

**What success looks like:** counts for important emails, replies needed and
deadlines; an AI briefing; emails with "opens Gmail" links. If the Claude API
key isn't set yet, emails still appear, marked "not analysed yet".

## Testing mode: reconnect weekly

While the consent screen is in **Testing** mode, Google expires the refresh
token **after 7 days**. The card will then say *"Gmail access has expired or
was revoked"* with a **Reconnect Gmail** button — one click and you're back.

Removing this limit means publishing the app to Production. Because
`gmail.readonly` is a *restricted* scope, Google then requires app
verification including a paid third-party security assessment — not
worthwhile for a personal dashboard. Staying in Testing and reconnecting
weekly is the practical choice. (Testing mode also limits the app to the test
users you added, at most 100.)

## Troubleshooting

| You see | Cause and fix |
| --- | --- |
| Google: `Error 400: redirect_uri_mismatch` | The URI in Google Cloud doesn't exactly match `GOOGLE_REDIRECT_URI`. Check http vs https, port, and no trailing slash. |
| Google: `Error 403: access_denied` (app not verified) | Your Gmail address isn't in **Test users** (Step 4). |
| "access was declined" | You pressed Cancel on Google's screen. Connect again. |
| "permission to read email wasn't granted" | The Gmail box was unticked on the consent screen. Connect again and tick it. |
| "Google didn't grant long-term access" | Remove Personal OS at <https://myaccount.google.com/permissions>, then connect again. |
| "couldn't be verified" | The sign-in round trip was interrupted or took over 10 minutes. Start again from My Day. |
| "expired or was revoked" | Normal after 7 days in Testing mode, or if you removed access in your Google account. Press **Reconnect Gmail**. |
| Settings: "GOOGLE_REDIRECT_URI must end with /api/gmail/callback" | Fix the variable's path. |
| Settings: encryption key error | The key must be exactly 32 bytes, base64 — regenerate with the command above. |

To remove access completely: Settings → **Disconnect Gmail** (revokes the
token and deletes stored emails), and optionally delete the Google Cloud
project.
