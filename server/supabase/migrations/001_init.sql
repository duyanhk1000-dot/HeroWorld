-- 001_init.sql — Đấu Trường Nhân Quả (SRS v2.1 §11.3, §2.2)
-- Run in the Supabase SQL Editor, in order: 001 → 002 → 003.
-- Supabase = the single source of truth for cross-save (SRS §11.3).
-- No real data is seeded here. MMR starts at 1000 (SRS §11.2).

-- ---------------------------------------------------------------- profiles
-- One row per Supabase Auth user. Created by trigger on auth.users insert,
-- so a player always has a profile the moment they sign up.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  -- MMR / progression (SRS §11.2/§11.3)
  mmr integer not null default 1000 check (mmr >= 0),
  account_level integer not null default 1 check (account_level >= 1),
  account_xp integer not null default 0 check (account_xp >= 0),
  soft_currency integer not null default 0 check (soft_currency >= 0),
  matches_played integer not null default 0 check (matches_played >= 0),
  tutorial_done boolean not null default false,
  -- Guest merge (SRS §11.3): a guest's device id, cleared once merged.
  guest_device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Player'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- matches
create table if not exists public.matches (
  id text primary key, -- Colyseus roomId
  mode text not null check (mode in ('RANKED', 'CASUAL')),
  bot_fill boolean not null default false,
  -- Every round's seed, so any round can be replayed (SRS §5.1/§9.4).
  round_seeds integer[] not null default '{}',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ------------------------------------------------------------ match_players
create table if not exists public.match_players (
  id bigint generated always as identity primary key,
  match_id text not null references public.matches (id) on delete cascade,
  player_id uuid references public.profiles (id) on delete set null,
  -- Bots have no profile: player_id is null and is_bot is true.
  is_bot boolean not null default false,
  placement integer not null check (placement between 1 and 8),
  mmr_delta integer not null default 0,
  hp_remaining integer not null default 0 check (hp_remaining >= 0),
  unique (match_id, player_id),
  unique (match_id, placement)
);
create index if not exists match_players_player_idx on public.match_players (player_id, placement);

-- -------------------------------------------------------------- mmr_history
create table if not exists public.mmr_history (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles (id) on delete cascade,
  match_id text references public.matches (id) on delete set null,
  delta integer not null,
  mmr_after integer not null,
  created_at timestamptz not null default now()
);
create index if not exists mmr_history_player_idx on public.mmr_history (player_id, created_at desc);

-- ------------------------------------------------------- player_inventory
-- Soft-currency items / cosmetics (M2: items from §8; M3: full catalogue).
-- Items a player owns; in-match item instances live only in the room.
create table if not exists public.player_inventory (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null,
  quantity integer not null default 1 check (quantity >= 0),
  unique (player_id, item_id)
);

-- ---------------------------------------------------------- telemetry_events
-- SRS §11.4: event log only, anonymised account id, no other personal data.
create table if not exists public.telemetry_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  player_id text not null,
  match_id text,
  round_id integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists telemetry_events_name_idx on public.telemetry_events (event_name, created_at desc);

-- ------------------------------------------------- MMR apply (server only)
-- Called by the game server with the SERVICE ROLE key (bypasses RLS).
-- Applies one placement delta, bumps matches_played, logs history.
create or replace function public.apply_mmr_delta(
  p_player_id uuid,
  p_delta integer,
  p_match_id text
)
returns integer
language plpgsql
security definer
as $$
declare
  v_new_mmr integer;
begin
  update public.profiles
     set mmr = greatest(0, mmr + p_delta),
         matches_played = matches_played + 1
   where id = p_player_id
  returning mmr into v_new_mmr;

  if v_new_mmr is null then
    raise exception 'profile not found: %', p_player_id;
  end if;

  insert into public.mmr_history (player_id, match_id, delta, mmr_after)
  values (p_player_id, p_delta, p_delta, v_new_mmr);

  return v_new_mmr;
end;
$$;
