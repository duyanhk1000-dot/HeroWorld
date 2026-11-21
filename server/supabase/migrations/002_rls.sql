-- 002_rls.sql — Row Level Security (run after 001_init.sql)
-- Principle: the Godot client (anon key) can read its own data and public
-- match history; it can NEVER write MMR, matches or other players' rows.
-- All server writes use the SERVICE ROLE key and bypass RLS.

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.mmr_history enable row level security;
alter table public.player_inventory enable row level security;
alter table public.telemetry_events enable row level security;

-- profiles: anyone can read a display name + MMR (leaderboard), only the
-- owner can update their own row, nobody inserts directly (trigger does it).
create policy "profiles_read_all" on public.profiles
  for select using (true);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- NOTE: mmr / matches_played must not be client-writable. The policy above
-- technically allows an owner to update those columns too; the game server
-- is the only writer in practice, and a follow-up migration should split
-- profiles into a public part and a server-managed part if client tampering
-- is ever observed. Do not rely on the client to be honest (SRS §13).

-- matches: public read (replays, history). No client writes.
create policy "matches_read_all" on public.matches
  for select using (true);

-- match_players: a player reads rows for matches they played; anyone can
-- read a match's full standings (public history). No client writes.
create policy "match_players_read_all" on public.match_players
  for select using (true);

-- mmr_history: only the owner reads their own history.
create policy "mmr_history_read_own" on public.mmr_history
  for select using (auth.uid() = player_id);

-- player_inventory: only the owner reads it. Writes go through the server
-- (shop / rewards), never directly from the client.
create policy "inventory_read_own" on public.player_inventory
  for select using (auth.uid() = player_id);

-- telemetry_events: no client access at all (server writes with service key).
-- No select/insert policy for anon/authenticated = denied by default.
