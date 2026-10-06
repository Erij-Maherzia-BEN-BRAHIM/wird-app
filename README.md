# ورد البقرة: the group's daily wird app

Each girl opens the link, picks her name, enters her 4-digit PIN and taps **"I finished"**.
Streaks, the progress bar and the Instagram text update automatically.
When someone finishes, the girls who haven't finished yet get a push notification, and everyone who hasn't finished gets a reminder at 21:00 (Tunis time).

```
web/        installable web app (PWA), plain HTML/CSS/JS, no build step
supabase/   database schema, seed (the 15 members), and 2 Edge Functions (api, reminder)
```

## Deploy (about 20 minutes, free tier)

### 1. Supabase project
Create a project at supabase.com, then in this folder:

```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push                      # creates the tables
```
Open **SQL Editor**, paste the content of `supabase/seed.sql` and run it (adds the 15 members and Meriem's ✅ for 6 Oct).

### 2. Keys and secrets
```bash
npx web-push generate-vapid-keys      # prints a public and a private key

supabase secrets set \
  TOKEN_SECRET=$(openssl rand -hex 32) \
  ADMIN_KEY="choose-a-long-random-admin-key" \
  CRON_SECRET=$(openssl rand -hex 24) \
  VAPID_PUBLIC_KEY="..." \
  VAPID_PRIVATE_KEY="..." \
  VAPID_SUBJECT="mailto:you@example.com"
```

### 3. Functions
```bash
supabase functions deploy api --no-verify-jwt
supabase functions deploy reminder --no-verify-jwt
```

### 4. Daily reminder at 21:00 Tunis (20:00 UTC)
In the SQL Editor (replace the two placeholders):
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('wird-reminder', '0 20 * * *', $$
  select net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/reminder',
    headers := '{"content-type":"application/json","x-cron-secret":"YOUR_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb
  )
$$);
```

### 5. The web app
Edit `web/config.js`:
```js
export const API_URL = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/api';
export const VAPID_PUBLIC_KEY = 'the public key from step 2';
```
Upload the `web/` folder to any HTTPS static host (Cloudflare Pages, Netlify, GitHub Pages). HTTPS is required for notifications. Share the link in the Instagram group.

## First use
1. Each girl opens the link, picks her @name, chooses a PIN (first time only).
2. She taps **"تفعّلي التنبيهات"** to receive friends' notifications.
   - **Android**: works in the browser right away.
   - **iPhone** (iOS 16.4+): open in Safari, Share, "Add to Home Screen", then open the app from the home screen and enable notifications.
3. You (admin): open the app, tap **الأدمين**, enter `ADMIN_KEY`. There you can:
   - set the start date and the verse range of each day (only day 1 = 1 to 95 is filled in; add days 2 and 3),
   - add or remove members, and "فتح" (reset) a forgotten PIN,
   - mark a day manually (✅, then ❄︎ rest day that keeps the streak).

## How it behaves
- **Streak**: +1 for each finished day; a rest day (❄︎, admin only) keeps it alive without adding. A streak stays alive until the day ends, then breaks if the day wasn't finished. Girls can only mark **today**; the admin fixes past days.
- **Friend notifications**: sent when someone finishes, to those who haven't, at most one per device per hour (so 14 finishes don't mean 14 buzzes).
- **PIN safety**: PINs are stored salted and hashed; 5 wrong tries lock the name for 10 minutes. A 4-digit PIN is light protection, fine for a friends' group. Anyone who knows the link can claim an unclaimed name first, so ask the girls to log in soon after you share it.
- **Instagram text**: the "نص لمجموعة إنستغرام" card still generates the daily list in the usual format, ready to copy.

## Run the UI locally
```bash
cd web && npx serve .
```

## CI/CD (GitHub Actions)

Every push to `main` deploys the site (`web/` → Netlify) and the edge functions (→ Supabase).
One-time setup in the GitHub repo → Settings → Secrets and variables → Actions:

- `NETLIFY_AUTH_TOKEN`: Netlify → User settings → Applications → Personal access tokens
- `SUPABASE_ACCESS_TOKEN`: https://supabase.com/dashboard/account/tokens

Database migrations are not run by the pipeline; apply them manually.
