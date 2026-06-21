-- Offshore Tactics — Supabase schema
-- Run this in the Supabase SQL editor (or via the CLI) for your project.
--
-- Two tables:
--   * saves        — one row per user holding their serialized game state.
--   * leaderboard  — one row per finished/retired race for the global board.
--
-- Display names are read from the user's auth metadata (display_name) and
-- denormalized into the leaderboard so reads need no joins.

-- =====================================================================
-- saves: per-user cloud save
-- =====================================================================
create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

drop policy if exists "saves are readable by owner" on public.saves;
create policy "saves are readable by owner"
  on public.saves for select
  using (auth.uid() = user_id);

drop policy if exists "saves are insertable by owner" on public.saves;
create policy "saves are insertable by owner"
  on public.saves for insert
  with check (auth.uid() = user_id);

drop policy if exists "saves are updatable by owner" on public.saves;
create policy "saves are updatable by owner"
  on public.saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "saves are deletable by owner" on public.saves;
create policy "saves are deletable by owner"
  on public.saves for delete
  using (auth.uid() = user_id);

-- =====================================================================
-- leaderboard: global race results
-- =====================================================================
create table if not exists public.leaderboard (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  display_name  text not null,
  race_id       text not null,
  race_name     text not null,
  position      integer not null,
  fleet_size    integer not null,
  elapsed_hours numeric not null,
  prize_money   integer not null default 0,
  retired       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists leaderboard_race_time_idx
  on public.leaderboard (race_id, elapsed_hours);

alter table public.leaderboard enable row level security;

-- Anyone (including anonymous visitors) can read the global board.
drop policy if exists "leaderboard is readable by everyone" on public.leaderboard;
create policy "leaderboard is readable by everyone"
  on public.leaderboard for select
  using (true);

-- Signed-in users may only submit rows for themselves.
drop policy if exists "leaderboard is insertable by owner" on public.leaderboard;
create policy "leaderboard is insertable by owner"
  on public.leaderboard for insert
  with check (auth.uid() = user_id);
