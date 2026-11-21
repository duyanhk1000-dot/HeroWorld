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
    data.ts                    — loads data/units.json + data/pve.json
    hex.ts                     — hex grid (row*7+col, offset↔axial, BFS step)
    synergy.ts                 — nation/class synergy 2/4/6 (incl. GUARDIAN quirks)
    economy.ts                 — shared pool, shop, buy/sell/reroll/XP, board moves
    bot.ts                     — M1 Medium bot prep turn
    sim.ts                     — M1 combat sim ported to TS (PairCombat, 20 Hz)
    matchWorker.ts             — MatchQueue → matchMaker.createRoom("battle")
    __tests__/
      smoke.ts                 — unit smoke tests (npm test)
      e2e.ts                   — real-server e2e with 8 colyseus.js clients (npm run test:e2e)
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

## Build / typecheck / test

```sh
npm run typecheck
npm run build   # -> dist/, start with npm start
npm test        # unit smoke tests (sim determinism, damage, star scaling,
                # loser damage, economy gold math, queue + bot-fill)
npm run test:e2e  # boots the real server (PORT 2568, M2_FAST=1), 8 real
                # clients queue → join → buy/place → combat; checks combat
                # events only reach the right pair. Needs ~40 s.
```

## Queue flow (M2)

```
POST /queue   {playerId, displayName?, mmr?, matchesPlayed?, mode, platform, isGuest}
              → 200 {status:"queued"} | 400 guest+ranked (SRS §11.3)
GET  /queue/:playerId → {status:"waiting"} | {status:"matched", roomId} | 404 unknown
DELETE /queue/:playerId → leave the queue
```

The MatchWorker ticks every 1 s; when `MatchQueue.tryFormMatch` forms a
group it creates a `battle` room via `matchMaker.createRoom` with the 8
seats (humans + bot fill: Bot An/Bình/Chi/Dũng/Hà/Khang/Linh) and records
playerId → roomId. Clients then `joinById(roomId, {protocol_version: 1,
playerId})` (or `{token}` for a Supabase JWT, verified in
`BattleRoom.onAuth`). The room starts when all human seats connect, or
after a 30 s fallback (3 s with `M2_FAST=1`).

## Combat sim (M2, ported from M1)

`src/sim.ts` is a faithful port of `scripts/m1_sim.gd` — same formulas,
same RNG draw order, same events (SRS §5): 20 Hz tick, damage
raw×100/(100+armor/MR), crit 25% ×1.40, dodge draw always consumed, mana
+10 on hit / +7 when hit (25/s cap), star ×1.8^(star−1), synergy 2/4/6,
nearest-hex targeting (tie → smallest index), ASSASSIN back-row jump at
tick 0, per-round `round_seed`, mulberry32 only (no `Math.random` in the
sim path). Determinism is guaranteed **within the server sim** (same seed
+ same boards → same events); cross-engine replay vs Godot is NOT claimed
because Godot's RandomNumberGenerator uses a different algorithm than
mulberry32. Any formula change must land in both `m1_sim.gd` and `sim.ts`
(`src/combat.ts` header rule).

## What is NOT done yet (honest TODOs, marked in code)

1. ~~**Shared sim**~~ — **done (M2)**: `src/sim.ts` ports the M1 sim;
   `BattleRoom` steps one `PairCombat` per pair at 20 Hz.
2. ~~**Prep-action mutations**~~ — **done (M2)**: `handlePrepAction()`
   mutates real economy state via `src/economy.ts` (M1 rules: cost, pool,
   shop odds by level, interest, sell price, board cap = level); invalid
   actions change nothing and get `s2c_error`. `c2s_equip_item` is rejected
   with `NOT_SUPPORTED` — items are not in the M1 scope.
3. ~~**Per-pair event routing**~~ — **done (M2)**: combat events are sent
   only to the two players of a pair (1 player for PvE/ghost); reconnect
   re-sends only the last 2 s of the player's own pair events.
4. ~~**Matchmaking worker**~~ — **done (M2)**: `MatchWorker` + `POST/GET/
   DELETE /queue` (see above); 8 players → room, bot-fill after 60 s
   casual / 90 s ranked, guest cannot join ranked.
5. **Godot web export** — static site in `render.yaml` stays commented out
   until export templates are installed and the export is built.

## Ghi chú kỹ thuật (21/11/2026)

- `tsconfig.json` phải có `"useDefineForClassFields": false` — nếu không, class field của `BattleRoomState` vượt qua setter của decorator `@type` (@colyseus/schema), state gửi về client luôn rỗng và shop không đọc được. Đã kiểm chứng: sau khi sửa, client Godot nhận `ROOM_STATE full, shop known: true`.
