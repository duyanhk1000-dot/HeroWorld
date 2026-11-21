/**
 * Shared game rules — single source of truth for numbers.
 *
 * SOURCE: ../data/balance_config.json (config_version 2.1.0, SRS v2.1).
 * The server loads that JSON at startup so server and M1 Godot client can
 * never drift apart silently. If the file is missing (e.g. a Render deploy
 * that only ships server/), the fallback below mirrors the same values and
 * the server logs a loud warning — fix the deploy, do not edit the fallback
 * as a way to "balance" the game.
 */
import { readFileSync } from "fs";
import { join } from "path";

export interface BalanceConfig {
  config_version: string;
  protocol_version: number;
  star_multiplier: number;
  tick_hz: number;
  prep_seconds: number;
  combat_seconds: number;
  interest_per_10_gold: number;
  interest_cap: number;
  reroll_cost: number;
  xp_buy_cost: number;
  xp_buy_amount: number;
  xp_table_cumulative: number[];
  level_cap: number;
  start_gold: number;
  start_level: number;
  start_hp: number;
  base_gold_per_round: number;
  pvp_win_gold: number;
  streak_bonus: Record<string, number>;
  crit_chance_base: number;
  crit_damage_base: number;
  dodge_cap: number;
  mana_on_hit: number;
  mana_on_being_hit: number;
  mana_on_being_hit_cap_per_sec: number;
  synergy_thresholds: number[];
  shop_odds_by_level: Record<string, number[]>;
  pool_by_cost: Record<string, number>;
  loser_base_damage_by_stage: Record<string, number>;
  overtime_after_ticks: number;
  move_ticks_per_hex: number;
}

const FALLBACK: BalanceConfig = {
  config_version: "2.1.0",
  protocol_version: 1,
  star_multiplier: 1.8,
  tick_hz: 20,
  prep_seconds: 30,
  combat_seconds: 45,
  interest_per_10_gold: 1,
  interest_cap: 5,
  reroll_cost: 2,
  xp_buy_cost: 4,
  xp_buy_amount: 4,
  xp_table_cumulative: [0, 2, 6, 10, 20, 36, 56, 80, 108],
  level_cap: 9,
  start_gold: 5,
  start_level: 1,
  start_hp: 100,
  base_gold_per_round: 5,
  pvp_win_gold: 1,
  streak_bonus: { "2": 1, "3": 1, "4": 2, "5": 3 },
  crit_chance_base: 0.25,
  crit_damage_base: 1.4,
  dodge_cap: 0.35,
  mana_on_hit: 10,
  mana_on_being_hit: 7,
  mana_on_being_hit_cap_per_sec: 25,
  synergy_thresholds: [2, 4, 6],
  shop_odds_by_level: {
    "1": [100, 0, 0, 0, 0], "2": [100, 0, 0, 0, 0], "3": [75, 25, 0, 0, 0],
    "4": [55, 30, 15, 0, 0], "5": [45, 33, 20, 2, 0], "6": [30, 40, 25, 5, 0],
    "7": [19, 35, 35, 10, 1], "8": [15, 25, 35, 20, 5], "9": [10, 15, 30, 30, 15],
  },
  pool_by_cost: { "1": 22, "2": 20, "3": 17, "4": 12, "5": 9 },
  loser_base_damage_by_stage: { "1": 0, "2": 2, "3": 4, "4": 6, "5": 9, "6": 12, "7": 15 },
  overtime_after_ticks: 900,
  move_ticks_per_hex: 10,
};

export function loadBalanceConfig(): BalanceConfig {
  // Repo layout: server/src/config.ts -> ../../data/balance_config.json
  const candidates = [
    join(__dirname, "..", "..", "data", "balance_config.json"),
    join(process.cwd(), "data", "balance_config.json"),
    join(process.cwd(), "..", "data", "balance_config.json"),
  ];
  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as BalanceConfig;
      if (parsed.config_version !== "2.1.0" || parsed.protocol_version !== 1) {
        console.warn(`[config] ${path} has unexpected version ${parsed.config_version}/${parsed.protocol_version}`);
      }
      console.log(`[config] balance loaded from ${path} (v${parsed.config_version})`);
      return parsed;
    } catch {
      /* try next candidate */
    }
  }
  console.warn("[config] WARNING: data/balance_config.json not found — using built-in fallback (SRS v2.1 values). Ship data/ with the server to remove this warning.");
  return FALLBACK;
}

export interface ServerEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  port: number;
  allowedOrigins: string[];
}

export function loadEnv(): ServerEnv {
  const port = Number(process.env.PORT ?? process.env.COLYSEUS_PORT ?? 2567);
  return {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    port: Number.isFinite(port) ? port : 2567,
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** MMR placement deltas, SRS §11.2 (rank 1..8). */
export const MMR_DELTAS = [40, 25, 12, 4, -6, -14, -24, -36];
/** Bot-filled matches count less: SRS §11.1/§11.2. */
export const BOT_FILL_MMR_FACTOR = 0.5;
export const MMR_START = 1000;
