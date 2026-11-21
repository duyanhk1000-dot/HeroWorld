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
                # loser damage, economy gold math, queue + bot-fill) +
                # anti-cheat unit tests (rate limit, validation, replay
                # verification, telemetry aggregation) — 52 + 66 checks
npm run test:anticheat  # only the M4 anti-cheat unit tests
npm run test:e2e  # boots the real server (PORT 2568, M2_FAST=1), 8 real
                # clients queue → join → buy/place → combat; checks combat
                # events only reach the right pair, plus M4 wire checks
                # (rate-limit trip + lock + disconnect, replay re-verify,
                # telemetry counts, report script). Needs ~60 s.
npm run telemetry:report -- [logfile]  # meta report from a JSONL
                # telemetry log (server must run with TELEMETRY_LOG_PATH set)
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

## M4 — Anti-cheat + telemetry (SRS §13.2, §11.4)

### Rate-limit (`src/rateLimit.ts`, wired in `BattleRoom`)
- Per player, sliding 1 s window: **10 actions/s in PREP_PHASE,
  2/s in any other phase**. A human client sends a few actions per
  second; anything above that is automation or a broken client.
- A trip → `s2c_error` `RATE_LIMITED`, the action is dropped, and the
  player's prep actions are **locked until the end of the current
  round** (SRS §13.2). Trips are logged (`rate_limited` telemetry).
- **5 trips in one match → the session is dropped**
  (`rate_limit_disconnect` + `cheat_suspect` reason
  `rate_limit_exceeded`). There is deliberately no account-ban system
  yet — a ban needs a persistent store + an appeal flow; see §9 of
  `docs/online-architecture.md`.
- SRS names Redis as the rate-limit store; this server runs as a single
  worker (Render free tier), so the limiter is in-memory per process.
  Multi-worker deploys must move it to Redis (same algorithm, keyed by
  account id).

### Validation hardening (`src/validate.ts`, `src/economy.ts`)
- `round_id` is now **required** (missing used to be silently
  accepted), must be an integer equal to the current round.
- All indices must be integers in range (shop 0–4, board 0–55, bench
  0–8). NaN/float/out-of-range values are rejected — without this,
  `board[NaN]` would write a junk property onto the board array.
- Optional client `action_id` (protocol, backward compatible): a repeat
  of the same id in the same round is rejected as `DUPLICATE_ACTION`.
- Buys return a machine-readable reason (`buyShopSlotDetailed`:
  `empty_slot` / `insufficient_gold` / `pool_empty` / `bench_full` /
  `bad_slot` / `no_unit`) instead of a generic `BUY_FAILED`.
- Every rejection logs `action_rejected` + `cheat_suspect` telemetry
  with the exact reason. `cheat_suspect` is an AUDIT event, not an
  automatic ban: benign reasons (`insufficient_gold`, `empty_slot`)
  and abuse patterns (`duplicate_action`, `stale_round`,
  `rate_limit_exceeded`, `replay_mismatch`) are distinguished by the
  `reason` field.
- Post-action invariant check (gold ≥ 0, bench ≤ 9, board ≤ level):
  a violation is logged as `cheat_suspect` reason
  `invariant_violation` — it should never fire; if it does, it is a
  server bug or tampering, never a client crash.

### Replay verification (`src/replay.ts`, `src/replayStore.ts`)
- The sim is deterministic, so every pair's combat can be re-run after
  the fact: BattleRoom records the replay input per pair when combat is
  built (boards, pair seed, iid starts, kind, stage/round) and the live
  result at round resolve (SHA-256 of the SimEvent JSON, winner, ticks).
- Verification re-builds both sides, steps exactly as many ticks as the
  live combat ran, force-decides by HP fraction at the cap (same rule
  as the room), and compares hash + winner + ticks. A mismatch logs
  `replay_mismatch` + `cheat_suspect` reason `replay_mismatch`.
- Verification never runs in the 20 Hz loop: it is scheduled with
  `setImmediate` after the round resolves, and can be re-run on demand
  via `GET /debug/replay/:matchId` (SRS §13.2 "replay công khai sau
  trận"). Records are kept in memory (last 20 matches, 60 rounds
  each); durable public replays (persist to Supabase) are future work.
- The round seed stays server-side until the round ends — replay
  inputs are recorded at combat build time and never sent to clients.

### Telemetry aggregation (`src/telemetry.ts`, `src/telemetryAggregate.ts`)
- New events: `round_lineup` (end-of-round board + nations/classes/
  bonds), per-player `round_result` with the same lineup summary,
  `bond_trigger` (counted per bond per round), `match_summary`
  (standings), `action_rejected`, `cheat_suspect`, `rate_limited`,
  `rate_limit_disconnect`, `replay_verified`, `replay_mismatch`.
- Reports (SRS §11.4 meta): hero pick counts + share by nation/class,
  round win rate by nation / class / bond, bond trigger counts,
  rejected actions by code, rate-limit trips/disconnects, cheat
  suspects by reason, replay results, per-player round W/L.
- Live reports: `GET /debug/telemetry` (all stored matches) and
  `GET /debug/telemetry/:matchId` (in-memory store, no DB needed).
- Offline reports: run the server with `TELEMETRY_LOG_PATH` set to
  write a JSONL log, then
  `npm run telemetry:report -- <logfile> [--match <matchId>]`.
  The e2e test does exactly this and asserts real numbers (buys ≥ 8).
- Debug endpoints are guarded by `ADMIN_TOKEN` when set (`x-admin-token`
  header or `?token=`); when unset they are open — local dev only,
  never on a public instance.

## Ghi chú kỹ thuật (21/11/2026)

- `tsconfig.json` phải có `"useDefineForClassFields": false` — nếu không, class field của `BattleRoomState` vượt qua setter của decorator `@type` (@colyseus/schema), state gửi về client luôn rỗng và shop không đọc được. Đã kiểm chứng: sau khi sửa, client Godot nhận `ROOM_STATE full, shop known: true`.
