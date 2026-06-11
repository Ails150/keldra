# Keldra — Sign-up + Email Threading: Setup & Acceptance Runbook

Everything you need to take the new self-serve sign-up and per-task email
threading live, in order. Follow top to bottom.

> **Why local AND Netlify:** secrets in `.env.local` only affect your machine.
> Production runs on Netlify, which reads **its own** env vars. If you set a
> secret in one place and not the other, local works while production breaks
> (or vice-versa). Always set each secret in **both**.

---

## 0. Pre-flight (do this first)

1. Confirm secrets will never be committed. `.gitignore` already contains
   `.env*` (line 34), so `.env.local` is ignored. Verify:
   - Open `.gitignore`, confirm the `.env*` line is present.
   - Run `git status` — `.env.local` must **not** appear under "Changes" or
     "Untracked files". (It won't, because it's ignored.)
2. Never paste a real secret into any file that gets committed — not even a
   placeholder that looks real. Secrets go **only** into `.env.local` (local)
   and the Netlify dashboard (production).

---

## 1. Obtain the secrets

See the **Secrets summary** at the bottom for the exact dashboard click-paths.
You need four new values:

| Env var | Where it comes from |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` secret |
| `RESEND_API_KEY` | Resend → API Keys → Create API Key |
| `RESEND_WEBHOOK_SECRET` | Resend → Webhooks → (your inbound endpoint) → Signing Secret (`whsec_…`) |
| `NEXT_PUBLIC_SITE_URL` *(optional)* | Your production URL, e.g. `https://app.keldra.io` |

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` already exist.

---

## 2. Put secrets in `.env.local` (local dev)

Open `C:\keldra-web\.env.local` and add (alongside the existing keys):

```
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key>
RESEND_API_KEY=<paste resend api key>
RESEND_WEBHOOK_SECRET=<paste whsec_… signing secret>
```

Save. Restart `npm run dev` so the new vars load.

---

## 3. Put the SAME secrets in Netlify (production)

1. Go to **app.netlify.com** → your Keldra site.
2. **Site configuration → Environment variables → Add a variable** (or
   "Add a single variable").
3. Add each of these with the identical values you used locally:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `RESEND_WEBHOOK_SECRET`
   - (the `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` should
     already be set here from before — confirm they are.)
4. Set scope to **All deploy contexts** (Production at minimum).
5. **Trigger a redeploy** (Deploys → Trigger deploy → Deploy site) so the new
   env vars are baked into the running site.

---

## 4. Apply the database migrations (Supabase SQL editor)

Supabase → your project (`fmeixgnxkcapxyhrjhvm`) → **SQL Editor → New query**.
Paste and **Run** each file **in this exact order**. All are idempotent
(safe to re-run).

1. `supabase-org-model.sql` — *(already applied previously; re-run only if
   unsure. It creates organisations/users and the Ardmac seed.)*
2. **`supabase-signup.sql`** — token invites table `org_invite_links`,
   `auth_role()` helper, `claim_org_invite()`, RLS.
3. **`supabase-email.sql`** — `task_threads`, `task_emails`,
   `task_email_attachments`, `inbound_unmatched`, the private storage bucket,
   RLS, and `user_id_by_email()`.
4. **`supabase-health.sql`** — `setup_health()` for the health check below.

Each file ends with a sanity `SELECT` — check it returns without error.

---

## 5. Configure Supabase Auth redirect URLs

Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://app.keldra.io`
- **Redirect URLs:** add both
  - `https://app.keldra.io/auth/callback`
  - `http://localhost:3000/auth/callback` (for local testing)

Confirm **Authentication → Providers → Email** has **"Confirm email" ON**
(this is what sends the confirmation email on sign-up).

---

## 6. Configure Resend (for the email feature)

You said these are already done — just confirm:
- Sending+receiving domain **reply.keldra.io** is verified (sending AND receiving).
- Inbound route is configured so mail to `*@reply.keldra.io` is delivered to a
  webhook of event type **`email.received`** pointing at:
  `https://app.keldra.io/api/email/inbound`
- The webhook's **Signing Secret** is the `RESEND_WEBHOOK_SECRET` from step 1.

> **Note:** we send **from** the per-thread address on `reply.keldra.io`
> (display name `Keldra · <TASKCODE>`) and replies come straight back to it —
> there is no separate `notifications@keldra.io` sender. `keldra.io` is **not**
> used for sending.

---

## 7. Verify with the health check (green ticks, not guessing)

1. Sign in as the superadmin (`ailsdoherty00@gmail.com`).
2. Visit **`/api/health/setup`** (e.g. `https://app.keldra.io/api/health/setup`).
3. You should get JSON with `"ok": true` and every check `"✅"`:
   - secrets present (service key, Resend key, webhook secret, supabase url/anon)
   - tables: `org_invite_links`, `task_threads`, `task_emails`,
     `task_email_attachments`, `inbound_unmatched`
   - RLS on each of those tables
   - functions: `auth_role`, `is_superadmin`, `claim_org_invite`,
     `user_id_by_email`
   - storage bucket `task-email-attachments`
4. Any `❌` tells you exactly what to fix (missing secret → step 2/3;
   missing table/function → re-run the matching SQL file in step 4).

If you're not superadmin you'll get `403 Superadmin only.` (by design).

---

## 8. Acceptance tests

Run these end-to-end. Use throwaway addresses like `fieldtest+1@keldra.io`.

### 8a. Invite → join → sees Ardmac data
1. **Action:** Sign in as superadmin. On the dashboard header click
   **"Invite people"** → leave role "Member" → **Generate link**. The link is
   copied to your clipboard (form: `https://app.keldra.io/join/<token>`).
   **Expected:** the new invite appears in the list, "0 used", "Active".
2. **Action:** Open the link in a private window. **Expected:** page reads
   *"Join Ardmac on Keldra"* with a name/email/password form.
3. **Action:** Sign up with `fieldtest+1@keldra.io`. **Expected:** *"Check your
   email"* screen.
4. **Action:** Open the confirmation email → click the link. **Expected:** you
   land authenticated; redirected to `/dashboard`.
5. **Action:** Sign in as `fieldtest+1@keldra.io`. **Expected:** you see the
   **Ardmac (MER/COLO) dashboard** with the seeded data, org badge "Ardmac".
6. **Action:** Back in the superadmin invite panel, refresh. **Expected:** that
   invite now shows "1 used".

### 8b. Fresh org is empty + isolated
1. **Action:** Open `/signup` (or login page → "Create your organisation").
   Fill name / `fieldtest+2@keldra.io` / password / company "Test Co 2".
   **Expected:** *"Check your email"* screen.
2. **Action:** Confirm the email, then sign in as `fieldtest+2@keldra.io`.
   **Expected:** the dashboard is the **empty state** ("No project yet") with
   org badge "Test Co 2" — **no Ardmac/MER data at all**. This proves
   isolation.
   > *Interpretation note:* the dashboard's seeded MER/COLO data is a demo that
   > renders only for **anonymous visitors** and the **Ardmac** org. Any other
   > real org gets the clean empty state. Real data isolation (users,
   > organisations, task emails, field events) is enforced by Postgres RLS.

### 8c. Tampered token → dead-letter only (after email setup)
1. **Action:** From an Ardmac-signed-in session, open a task (e.g.
   `ELE-COLO-1030`) → **"✉ Email update"** → send to a real external inbox
   (e.g. your Gmail). **Expected:** toast *"Email sent…"*; an outbound entry
   appears on the task's Activity trail with a **"via email"** badge; the email
   arrives from **`Keldra · ELE-COLO-1030`**.
2. **Action:** Reply to that email from Gmail, **attach a file**.
   **Expected:** within ~1 minute the reply appears on the **same task's**
   Activity trail with a "via email" badge, the quoted chain stripped, and the
   attachment downloadable. It's scoped to Ardmac (only Ardmac users see it).
3. **Action:** Now reply again but first **edit the To-address token** (change
   a character in the `task-…-…@reply.keldra.io` address) and send.
   **Expected:** it does **not** appear on any task. As superadmin, open
   **`/dashboard/admin/unmatched`** — the tampered message is listed with
   reason "token mismatch / unknown thread".

### 8d. Finish-setup guardrail
- **Action:** (Edge case) If an auth user ever exists with no `public.users`
  row, signing in routes them to **`/finish-setup`** with options to create an
  org or use an invite — **not** a crash.

---

## 9. Clean up

- Delete throwaway test users in Supabase → Authentication → Users when done.
- The QA invite (`fieldtest@keldra.io`) seeded in `supabase-org-model.sql` can
  be removed from `public.org_invites` once testing is complete.

---

## Secrets summary — what to get and where

| Secret | Get it from (click-path) | Goes in |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Project Settings → API** → "Project API keys" → reveal **`service_role`** → copy | `.env.local` **and** Netlify |
| `RESEND_API_KEY` | Resend → **API Keys** → **Create API Key** (Full access or Sending) → copy once | `.env.local` **and** Netlify |
| `RESEND_WEBHOOK_SECRET` | Resend → **Webhooks** → open your inbound (`email.received`) endpoint → **Signing Secret** (`whsec_…`) → copy | `.env.local` **and** Netlify |
| `NEXT_PUBLIC_SITE_URL` *(optional)* | Your production URL, `https://app.keldra.io` | `.env.local` **and** Netlify |
| `NEXT_PUBLIC_SUPABASE_URL` *(exists)* | Supabase → Project Settings → API → Project URL | already set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` *(exists)* | Supabase → Project Settings → API → `anon` `public` key | already set |

> The `service_role` key bypasses RLS — treat it like a root password. It is
> only ever read server-side (the `server-only` guard makes the build fail if
> it's imported into client code). Never expose it with a `NEXT_PUBLIC_` prefix.

---

## What changed vs. the original specs (decisions made)

- **Invites table named `org_invite_links`** (not `org_invites`) — the existing
  `org_invites` is email-keyed and used by the `handle_new_user` trigger; a new
  parallel token table avoids breaking it. (Your choice: "Add parallel token
  table".)
- **Email threads anchored by `task_threads(org_id, task_code)`** — there is no
  persisted `tasks` table (tasks are client-side seed data), so the thread +
  `email_token` live here. (Your choice: "Lightweight thread table".)
- **Reply-to address is hex-encoded** `task-{threadHex}-{token}@reply.keldra.io`
  because task codes contain hyphens; hex avoids delimiter collisions.
- **Send from the thread address** on `reply.keldra.io` (no `reply_to`,
  no `notifications@keldra.io`) per your correction.
- **Quoted-reply stripping** uses a compact built-in heuristic (no extra
  dependency); swap in `email-reply-parser` later if you want.
```
