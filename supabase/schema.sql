-- Offshore Tactics — Supabase schema
-- Run this in the Supabase SQL editor (or via the CLI) for your project. It is
-- idempotent: safe to re-run after the original schema.
--
-- Tables:
--   * profiles     — one row per user; editable display name, public-readable.
--   * saves        — one row per user holding their serialized game state.
--   * leaderboard  — one row per finished/retired race for the global board.
--
-- Sync model: saves are reconciled newest-wins. The save_game() RPC performs a
-- server-guarded conditional upsert so a stale device can never clobber a newer
-- cloud save, and the saves table is published to Realtime so other signed-in
-- devices adopt updates live.

-- =====================================================================
-- profiles: public, editable display names
-- =====================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Sailor',
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "profiles are insertable by owner" on public.profiles;
create policy "profiles are insertable by owner"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles are updatable by owner" on public.profiles;
create policy "profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Seed a profile whenever a new auth user is created, taking the display name
-- from sign-up metadata (falling back to the email local-part).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1),
      'Sailor'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that signed up before this table existed.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    split_part(u.email, '@', 1),
    'Sailor'
  )
from auth.users u
on conflict (id) do nothing;

-- =====================================================================
-- saves: per-user cloud save, reconciled newest-wins
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

-- Conditional upsert: write only when the incoming save is newer than the
-- stored one, so a stale device cannot overwrite newer cloud data. Always
-- returns the winning (current) row. Keyed on auth.uid(), so a caller can only
-- ever write their own save.
create or replace function public.save_game(
  p_state jsonb,
  p_client_updated_at timestamptz
)
returns public.saves
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.saves;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.saves (user_id, state, updated_at)
  values (auth.uid(), p_state, p_client_updated_at)
  on conflict (user_id) do update
    set state = excluded.state,
        updated_at = excluded.updated_at
    where excluded.updated_at > public.saves.updated_at
  returning * into result;

  -- The guard rejected the write (incoming not newer): return the current row.
  if result is null then
    select * into result from public.saves where user_id = auth.uid();
  end if;

  return result;
end;
$$;

grant execute on function public.save_game(jsonb, timestamptz) to authenticated;

-- Deliver the full new row to Realtime subscribers (not just the primary key).
alter table public.saves replica identity full;

-- Publish saves to Realtime so other signed-in devices receive updates live.
-- RLS still applies, so users only ever receive their own rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'saves'
  ) then
    alter publication supabase_realtime add table public.saves;
  end if;
end $$;

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

-- Link rows to profiles so the board can embed each sailor's live display name
-- (in addition to the name denormalized at submit time, kept as a fallback).
alter table public.leaderboard
  drop constraint if exists leaderboard_user_id_profiles_fkey;
alter table public.leaderboard
  add constraint leaderboard_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

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
