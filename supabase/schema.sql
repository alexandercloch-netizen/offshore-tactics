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
-- account deletion (GDPR / app-store requirement)
-- =====================================================================
-- Lets a signed-in user delete their own account. Removing the auth user
-- cascades to their saves, profile and leaderboard rows via the on-delete
-- cascade foreign keys. SECURITY DEFINER so it can touch auth.users, but scoped
-- to auth.uid() so a caller can only ever delete themselves.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_account() to authenticated;

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

-- Owners may improve or remove their own entries, so the client can keep only a
-- player's best time per race (update-in-place / cleanup) rather than piling up
-- duplicate rows. Still scoped to auth.uid(), so no one can touch another's rows.
drop policy if exists "leaderboard is updatable by owner" on public.leaderboard;
create policy "leaderboard is updatable by owner"
  on public.leaderboard for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "leaderboard is deletable by owner" on public.leaderboard;
create policy "leaderboard is deletable by owner"
  on public.leaderboard for delete
  using (auth.uid() = user_id);

-- Keep at most one row per (user, race): the player's best. Idempotent and
-- non-fatal — first prune any pre-existing duplicates (keeping the fastest), then
-- add the unique constraint if it isn't there. Wrapped so a re-run (or leftover
-- dupes) can't abort the rest of the schema; the client also dedupes defensively,
-- so it degrades gracefully whether or not this constraint is present.
do $$
begin
  delete from public.leaderboard l
  using public.leaderboard keep
  where l.user_id = keep.user_id
    and l.race_id = keep.race_id
    and (keep.elapsed_hours < l.elapsed_hours
         or (keep.elapsed_hours = l.elapsed_hours and keep.ctid < l.ctid));

  if not exists (
    select 1 from pg_constraint where conname = 'leaderboard_user_race_unique'
  ) then
    alter table public.leaderboard
      add constraint leaderboard_user_race_unique unique (user_id, race_id);
  end if;
exception when others then
  raise notice 'leaderboard dedupe constraint not applied: %', sqlerrm;
end $$;

-- =====================================================================
-- feedback: the Notice Board — a message to the Race Committee
-- =====================================================================
-- Player-submitted suggestions, bug reports and content requests. Insert-only
-- for everyone (guests included) — the app never lets the player read the board.
-- Until this table exists (or with no Supabase env at all) the client saves each
-- note to a local AsyncStorage queue and posts it opportunistically once the
-- schema is re-run / the app is back online, so nothing is ever lost.
--
-- The open anon insert mirrors the leaderboard's open authed insert; a signed-in
-- user may only stamp their OWN id (never someone else's). Future follow-up:
-- add rate-limiting (e.g. a per-ip/per-uid throttle) — deliberately not built here.
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,  -- NULL for guests
  kind       text not null check (kind in ('race_suggestion','bug','content_request','other')),
  message    text not null check (char_length(message) between 1 and 4000),
  subject    text,                                  -- "which race", "what you expected", etc.
  context    jsonb not null default '{}'::jsonb,    -- platform/appVersion/screen/locale/signedIn
  reply_ok   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Insert-only for everyone incl. anon; a signed-in user may only stamp their own id.
drop policy if exists "feedback insertable by anyone" on public.feedback;
create policy "feedback insertable by anyone"
  on public.feedback for insert
  with check (user_id is null or auth.uid() = user_id);

-- No one reads another's feedback; an owner may read their own.
drop policy if exists "feedback readable by owner" on public.feedback;
create policy "feedback readable by owner"
  on public.feedback for select using (auth.uid() = user_id);

grant insert on public.feedback to anon, authenticated;
