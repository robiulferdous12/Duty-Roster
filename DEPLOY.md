# Deploying Duty Roster (Supabase + Vercel)

## 1. Create the Supabase project & relational tables
1. Go to [supabase.com](https://supabase.com) → New project.
2. Once it's provisioned, open **SQL Editor → New query**.
3. Paste the contents of `supabase/schema.sql` and click **Run**.
   This creates individual relational tables for each field/entity:
   - `app_settings` (active year/month)
   - `employees` (employee profiles & team assignments)
   - `roster_entries` (daily shifts, leave codes, short leave hours per employee per date)
   - `public_holidays` (company holidays)
   - `cep_directory` (contact & emergency personnel)
   - `overtime_entries` (overtime records)
   - `short_leave_entries` (clock-time short leave logs)
   
   Along with automatic `updated_at` triggers, foreign key constraints, indexes, Row Level Security (RLS) policies, and default employee seed data.
4. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Configure environment variables locally
```bash
cp .env.example .env
```
Paste your Project URL and anon key into `.env`. This file is git-ignored — never commit real keys.

```bash
npm install
npm run dev
```
The app will connect to Supabase, query the relational tables, and synchronize updates in real-time with offline LocalStorage fallback.

## 3. Push to GitHub
```bash
git add -A
git commit -m "Migrate to normalized Supabase relational schema"
git push
```

## 4. Deploy on Vercel
1. [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo.
2. Framework preset: **Vite** (auto-detected). Build command `npm run build`, output directory `dist` — Vercel should fill these in automatically.
3. Under **Environment Variables**, add:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |
4. Deploy.

`vercel.json` (already in the repo) rewrites all routes to `/index.html`, which is required because this app uses `react-router-dom`'s `BrowserRouter` — without it, refreshing on `/leave`, `/overtime`, etc. would 404 on Vercel.

## Note on security
The `anon` key is public by design (it ships in the browser bundle), and the RLS policies in `schema.sql` allow anyone with that key to read/write the roster. That's the tradeoff for having no login screen. If this ever needs to be restricted to specific people, add Supabase Auth and tighten the policies in `schema.sql` to check `auth.uid()`.
