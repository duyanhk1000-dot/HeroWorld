# Server — Đấu Trường Nhân Quả (M2 online)

Colyseus game server (Node.js + TypeScript) for online play. M1 (Godot,
offline, 1 vs 7 bots) does not use this server; M2 adds it.

## Layout

```
server/
  package.json / tsconfig.json   — Colyseus 0.15, @supabase/supabase-js 2.x
  render.yaml                    — Render Blueprint (web service; static site commented out)
  .env.example                   — env vars, all empty placeholders
  src/
    index.ts                     — entry: HTTP /health + Colyseus "battle" room
    config.ts                    — loads data/balance_config.json (single source of truth)
    rng.ts                       — mulberry32 seeded RNG (no Math.random in sim)
    combat.ts                    — SRS §5 formulas + SINGLE-SIM adapter rule
    protocol.ts                  — c2s/s2c message names/fields (SRS §10)
    matchmaking.ts               — MMR queue, bot fill, placement deltas
    auth.ts                      — Supabase JWT verify + guest identity
    supabase.ts                  — anon/service clients + recordMatchResult()
    telemetry.ts                 — SRS §11.4 event log (batched, fire-and-forget)
    rooms/
      BattleRoomState.ts         — @colyseus/schema synchronised state
      BattleRoom.ts              — 8-player room: phases, pairings, ghost rule, reconnect
  supabase/
    README.md
    migrations/001_init.sql     — profiles/matches/match_players/mmr_history/inventory/telemetry
    migrations/002_rls.sql      — RLS policies
    migrations/003_storage.sql  — portraits + audio buckets
```

## Run locally (no accounts needed for the room loop)

```sh
cd server
npm install
cp .env.example .env   # leave Supabase vars empty: persistence is disabled, rooms still run
npm run dev            # ts-node, port 2567 (or $PORT)
```

With empty Supabase vars the server logs a warning and skips persistence;
matchmaking, rooms, the 20 Hz loop and reconnect still work.

## Build / typecheck

```sh
npm run typecheck
npm run build   # -> dist/, start with npm start
```

## What is NOT done yet (honest TODOs, marked in code)

1. **Shared sim** — `BattleRoom.runCombatTick()` is a loop stub. The full
   per-unit sim (movement, mana, skills, crit/dodge) must be the M1 Godot
   sim ported/shared, not a second implementation (`src/combat.ts` header).
2. **Prep-action mutations** — `handlePrepAction()` validates phase/round
   and acknowledges; buy/sell/reroll/XP/equip mutations must reuse the M1
   economy rules (`scripts/m1_economy.gd`).
3. **Per-pair event routing** — events currently broadcast to the room;
   they must go only to the two players of each pair (SRS §2.3, 5 KB/s).
4. **Matchmaking worker** — `MatchQueue` exists; nothing creates rooms from
   it yet. Wire it when the lobby is built (see `docs/online-architecture.md` §5).
5. **Godot web export** — static site in `render.yaml` stays commented out
   until export templates are installed and the export is built.
