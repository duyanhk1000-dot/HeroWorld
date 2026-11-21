#!/usr/bin/env python3
"""M4 duel analysis: 1v1 round-robin -> hero combat power, plus bond/synergy ON-vs-OFF."""
import json, math
from collections import defaultdict

def norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))

units = {u["unit_id"]: u for u in json.load(open("/home/hatch/workspace/co-nhan-pham-godot/data/units.json"))["units"]}
rows = [json.loads(l) for l in open("/tmp/m4_duel_post.jsonl")]

# ---- duels ----
wins = defaultdict(int); games = defaultdict(int)
pair_results = defaultdict(lambda: defaultdict(int))  # a -> b -> wins of a
for r in rows:
    if r["kind"] != "duel":
        continue
    a, b, w = r["a"], r["b"], r["winner"]
    games[a] += 1; games[b] += 1
    if w == 0:
        wins[a] += 1; pair_results[a][b] += 1
    elif w == 1:
        wins[b] += 1; pair_results[b][a] += 1

hero_rows = []
for uid, u in units.items():
    n = games[uid]; w = wins[uid]
    wr = w / n if n else 0
    # within-cost win rate
    same_cost = [o for o in units if units[o]["cost"] == u["cost"] and o != uid]
    sw = sum(pair_results[uid][o] for o in same_cost)
    sn = sum(3 for o in same_cost)  # 3 seeds per pair
    hero_rows.append({
        "uid": uid, "name": u["name"], "nation": u["nation_id"], "class": u["class_id"],
        "cost": u["cost"], "n": n, "wins": w, "win_rate": round(wr, 3),
        "same_cost_wr": round(sw / sn, 3) if sn else 0.0,
        "same_cost_n": sn,
    })

# z vs 0.5 within cost tier (null: equal strength)
for r in hero_rows:
    n = r["same_cost_n"]; k = round(r["same_cost_wr"] * n)
    z = (k - n * 0.5) / math.sqrt(n * 0.25) if n else 0.0
    r["z_same_cost"] = round(z, 2)
    r["p_same_cost"] = round(2 * (1 - norm_cdf(abs(z))), 3)

print("== DUEL: overall win rate (1v1, 1 star, 3 seeds/pair, 48 opponents) ==")
print(f"{'hero':28s} {'cost':>4} {'wr':>6} {'same-cost wr':>13} {'z':>6}  n")
for r in sorted(hero_rows, key=lambda x: -x["win_rate"])[:12]:
    print(f"{r['name'][:28]:28s} {r['cost']:4d} {r['win_rate']:6.3f} {r['same_cost_wr']:13.3f} {r['z_same_cost']:6.2f}  {r['n']}")
print("... bottom ...")
for r in sorted(hero_rows, key=lambda x: -x["win_rate"])[-12:]:
    print(f"{r['name'][:28]:28s} {r['cost']:4d} {r['win_rate']:6.3f} {r['same_cost_wr']:13.3f} {r['z_same_cost']:6.2f}  {r['n']}")

print("\n== DUEL: within-cost-tier outliers (|z|>=2, n>=30 duels in tier) ==")
for r in sorted(hero_rows, key=lambda x: -x["z_same_cost"]):
    if abs(r["z_same_cost"]) >= 2.0:
        print(f"  {r['name']} ({r['nation']}/{r['class']}/{r['cost']}g): same-cost wr={r['same_cost_wr']} z={r['z_same_cost']} p={r['p_same_cost']}")

# cost-tier means: average duel win rate per cost (expect higher cost -> higher wr)
print("\n== mean duel win rate by cost tier ==")
for c in range(1, 6):
    rs = [r["win_rate"] for r in hero_rows if r["cost"] == c]
    print(f"  {c}g: mean wr={sum(rs)/len(rs):.3f}  min={min(rs):.3f} max={max(rs):.3f}")
print("== mean duel win rate by class ==")
for cl in sorted({r['class'] for r in hero_rows}):
    rs = [r["win_rate"] for r in hero_rows if r["class"] == cl]
    print(f"  {cl}: mean wr={sum(rs)/len(rs):.3f}  min={min(rs):.3f} max={max(rs):.3f}")
print("== mean duel win rate by nation ==")
for nat in sorted({r['nation'] for r in hero_rows}):
    rs = [r["win_rate"] for r in hero_rows if r["nation"] == nat]
    print(f"  {nat}: mean wr={sum(rs)/len(rs):.3f}  min={min(rs):.3f} max={max(rs):.3f}")

# ---- bond / synergy ON-vs-OFF ----
print("\n== BOND ON vs OFF (mirror, 3 seeds; ON wins /3) ==")
agg = defaultdict(lambda: [0, 0])
for r in rows:
    if r["kind"] == "bond":
        agg[r["bond"]][0] += (1 if r["winner"] == 0 else 0)
        agg[r["bond"]][1] += 1
for b, (w, n) in sorted(agg.items()):
    print(f"  {b}: ON wins {w}/{n}")
print("\n== SYNERGY ON vs OFF (mirror, 3 seeds; ON wins /3) ==")
agg2 = defaultdict(lambda: [0, 0])
for r in rows:
    if r["kind"] in ("syn_nation", "syn_class"):
        agg2[(r["kind"], r["key"])][0] += (1 if r["winner"] == 0 else 0)
        agg2[(r["kind"], r["key"])][1] += 1
for (k, key), (w, n) in sorted(agg2.items()):
    print(f"  {k} {key}: ON wins {w}/{n}")

json.dump({"heroes": hero_rows}, open("/tmp/m4_duel_post_analysis.json", "w"), ensure_ascii=False, indent=1)
