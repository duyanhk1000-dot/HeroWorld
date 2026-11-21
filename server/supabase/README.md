# Supabase — Đấu Trường Nhân Quả (M2)

Migrations for the Supabase Postgres project. No accounts, keys or real
data exist yet — run these only after creating the project (see
`docs/online-architecture.md` §7 checklist).

## Files

| File | What it creates |
|---|---|
| `migrations/001_init.sql` | `profiles`, `matches`, `match_players`, `mmr_history`, `player_inventory`, `telemetry_events`, `apply_mmr_delta()` RPC, `handle_new_user()` trigger |
| `migrations/002_rls.sql` | Row Level Security: clients read their own data; only the server (service role) writes MMR/matches |
| `migrations/003_storage.sql` | Public `portraits` + `audio` buckets, naming convention matching `data/units.json` |

## How to run

1. Supabase Dashboard → your project → SQL Editor → New query.
2. Paste `001_init.sql`, run. Then `002_rls.sql`, then `003_storage.sql`.
3. Verify: Table Editor shows the 6 tables; Authentication → Users shows the
   `on_auth_user_created` trigger effect after the first sign-up.

## Auth providers (enable in Dashboard → Authentication → Providers)

- Email (on by default), Google, Apple — SRS §11.3.
- Guest play is device-scoped and casual-only; it never creates an
  `auth.users` row, so it never gets a `profiles` row until sign-up merges it.

## Notes

- The game server connects with the **service role key** (server only) and
  the **anon key** (token verification). Neither key belongs in git or in
  the Godot client — see `server/.env.example`.
- Cross-save = `profiles` + `player_inventory` + `match_players` history.
  The client keeps no progression locally beyond a display cache (SRS §11.3).
