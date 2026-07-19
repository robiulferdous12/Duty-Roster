-- ─────────────────────────────────────────────────────────────
-- Duty Roster — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run
-- ─────────────────────────────────────────────────────────────

-- Single-row table holding the entire MonthlyRoster object as JSON.
-- This mirrors the app's existing LocalStorage shape 1:1, so no changes
-- were needed to the page components — only to storage.ts/AppContext.tsx.
create table if not exists public.roster_state (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint roster_state_singleton check (id = 1)
);

-- Keep updated_at fresh automatically
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists roster_state_set_updated_at on public.roster_state;
create trigger roster_state_set_updated_at
  before update on public.roster_state
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
-- This app has no login screen, so it talks to Supabase with the
-- public "anon" key. The policies below allow ANYONE who has your
-- Supabase URL + anon key to read and write the roster data.
--
-- That's fine for a private/internal tool where the URL isn't shared
-- publicly, but it is NOT safe for a public-facing app. If you later
-- add authentication, tighten these policies to check auth.uid().
-- ─────────────────────────────────────────────────────────────
alter table public.roster_state enable row level security;

drop policy if exists "public read" on public.roster_state;
create policy "public read"
  on public.roster_state for select
  using (true);

drop policy if exists "public insert" on public.roster_state;
create policy "public insert"
  on public.roster_state for insert
  with check (true);

drop policy if exists "public update" on public.roster_state;
create policy "public update"
  on public.roster_state for update
  using (true);
