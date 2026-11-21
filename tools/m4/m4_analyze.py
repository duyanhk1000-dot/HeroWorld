#!/usr/bin/env python3
"""M4 balance analysis: bot-vs-bot batch results -> outlier tables.

Method (see docs/m4-balance-report.md):
- Each match contributes 8 final comps (winner's last fought board + the
  last fought board of every eliminated player).
- Neutrality null: a hero/bond present in n final comps is expected in
  n*p1 top-1 comps and n*p4 top-4 comps, where p1/p4 are the SHARES OF
  UNIT SLOTS in rank-1 / top-4 comps (slot-weighted, because winner
  boards are bigger — plain 1/8 and 1/2 would over-flag strong heroes).
  z = (obs - exp) / sqrt(n*p*(1-p)).
- Flag |z| >= 2.0 AND n >= 20 as outlier (n < 20 = low power, noted only).
- Same test for nations/classes (presence = >=1 member on board) and bonds.
"""
import json, math, sys
from collections import Counter, defaultdict

def norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))

def ztest(obs, n, p):
    if n == 0:
        return 0.0, 1.0, 0.0
    exp = n * p
    var = n * p * (1 - p)
    z = (obs - exp) / math.sqrt(var) if var > 0 else 0.0
    pval = 2 * (1 - norm_cdf(abs(z)))
    return z, pval, exp

def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    ph = k / n
    d = 1 + z * z / n
    c = ph + z * z / (2 * n)
    m = z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))
    return ((c - m) / d, (c + m) / d)

def main(path):
    matches = [json.loads(l) for l in open(path) if l.strip()]
    n_match = len(matches)
    n_comp = sum(len(m["players"]) for m in matches)
    units = json.load(open("/home/hatch/workspace/co-nhan-pham-godot/data/units.json"))["units"]
    umap = {u["unit_id"]: u for u in units}
    bonds = json.load(open("/home/hatch/workspace/co-nhan-pham-godot/data/karma_bonds.json"))["bonds"]
    bond_ids = [b["bond_id"] for b in bonds]

    # ---- per-hero aggregates ----
    hero = defaultdict(lambda: {"n": 0, "top1": 0, "top4": 0, "ranksum": 0, "starsum": 0, "star_n": 0})
    nation = defaultdict(lambda: {"n": 0, "top1": 0, "top4": 0, "ranksum": 0})
    klass = defaultdict(lambda: {"n": 0, "top1": 0, "top4": 0, "ranksum": 0})
    bond = defaultdict(lambda: {"n": 0, "top1": 0, "top4": 0, "ranksum": 0})
    cost = defaultdict(lambda: {"n": 0, "top1": 0, "top4": 0, "ranksum": 0})
    seat_wins = Counter()
    rounds = []
    slots_total = 0
    slots_top1 = 0
    slots_top4 = 0
    for m in matches:
        rounds.append(m["rounds"])
        for p in m["players"]:
            rank = p["rank"]
            comp = p.get("comp", {})
            nslots = len(comp.get("units", []))
            slots_total += nslots
            if rank == 1:
                slots_top1 += nslots
            if rank <= 4:
                slots_top4 += nslots
            if rank == 1:
                seat_wins[p["name"]] += 1
            seen = set()
            for u in comp.get("units", []):
                uid = u["unit_id"]
                if uid in seen:
                    continue
                seen.add(uid)
                h = hero[uid]
                h["n"] += 1
                h["ranksum"] += rank
                h["starsum"] += u.get("star", 1)
                h["star_n"] += 1
                if rank == 1:
                    h["top1"] += 1
                if rank <= 4:
                    h["top4"] += 1
            for nat, cnt in comp.get("nations", {}).items():
                if cnt >= 1:
                    g = nation[nat]
                    g["n"] += 1; g["ranksum"] += rank
                    if rank == 1: g["top1"] += 1
                    if rank <= 4: g["top4"] += 1
            for cl, cnt in comp.get("classes", {}).items():
                if cnt >= 1:
                    g = klass[cl]
                    g["n"] += 1; g["ranksum"] += rank
                    if rank == 1: g["top1"] += 1
                    if rank <= 4: g["top4"] += 1
            seen_cost = set()
            for u in comp.get("units", []):
                uid = u["unit_id"]
                cst = str(umap[uid]["cost"])
                if cst not in seen_cost:
                    seen_cost.add(cst)
                    g = cost[cst]
                    g["n"] += 1; g["ranksum"] += rank
                    if rank == 1: g["top1"] += 1
                    if rank <= 4: g["top4"] += 1
            for b in comp.get("bonds", []):
                g = bond[b]
                g["n"] += 1; g["ranksum"] += rank
                if rank == 1: g["top1"] += 1
                if rank <= 4: g["top4"] += 1

    # Slot-weighted null: winner boards are bigger, so a hero is more likely
    # to sit in a top-1 comp by board size alone. Expected top-1 share is the
    # share of all unit slots that sit in rank-1 (resp. top-4) comps.
    p1_slot = slots_top1 / slots_total if slots_total else 1 / 8
    p4_slot = slots_top4 / slots_total if slots_total else 1 / 2

    def table(agg, label_fn, sort_key="z1"):
        rows = []
        for key, g in agg.items():
            n, t1, t4 = g["n"], g["top1"], g["top4"]
            z1, p1, e1 = ztest(t1, n, p1_slot)
            z4, p4, e4 = ztest(t4, n, p4_slot)
            lo, hi = wilson(t1, n) if n else (0, 0)
            rows.append({
                "key": key, "label": label_fn(key), "n": n, "top1": t1, "top4": t4,
                "exp1": round(e1, 1), "exp4": round(e4, 1),
                "z1": round(z1, 2), "p1": round(p1, 3), "z4": round(z4, 2), "p4": round(p4, 3),
                "win_when_present": round(t1 / n, 3) if n else 0.0,
                "ci_lo": round(lo, 3), "ci_hi": round(hi, 3),
                "avg_rank": round(g["ranksum"] / n, 2) if n else 0.0,
                "outlier": (abs(z1) >= 2.0 or abs(z4) >= 2.0) and n >= 20,
                "low_power": n < 20,
            })
        rows.sort(key=lambda r: r[sort_key], reverse=True)
        return rows

    hero_rows = table(hero, lambda k: f"{umap[k]['name']} ({umap[k]['nation_id']}/{umap[k]['class_id']}/{umap[k]['cost']}g)")
    # add avg star
    for r in hero_rows:
        h = hero[r["key"]]
        r["avg_star"] = round(h["starsum"] / h["star_n"], 2) if h["star_n"] else 0.0
    nation_rows = table(nation, lambda k: k)
    class_rows = table(klass, lambda k: k)
    cost_rows = table(cost, lambda k: f"{k}g")
    bond_rows = table(bond, lambda k: k)
    # ensure all 10 bonds appear even with n=0
    seen_b = {r["key"] for r in bond_rows}
    for b in bond_ids:
        if b not in seen_b:
            bond_rows.append({"key": b, "label": b, "n": 0, "top1": 0, "top4": 0, "exp1": 0.0,
                              "exp4": 0.0, "z1": 0.0, "p1": 1.0, "z4": 0.0, "p4": 1.0,
                              "win_when_present": 0.0, "ci_lo": 0.0, "ci_hi": 0.0,
                              "avg_rank": 0.0, "outlier": False, "low_power": True})

    out = {
        "matches": n_match, "comps": n_comp,
        "slots": {"total": slots_total, "top1": slots_top1, "top4": slots_top4,
                  "p1": round(p1_slot, 3), "p4": round(p4_slot, 3)},
        "rounds": {"mean": round(sum(rounds) / len(rounds), 1), "min": min(rounds), "max": max(rounds)},
        "seat_top1": dict(seat_wins),
        "heroes": hero_rows, "nations": nation_rows, "classes": class_rows, "bonds": bond_rows,
        "costs": cost_rows,
    }
    json.dump(out, open(path.replace(".jsonl", "_analysis.json"), "w"), ensure_ascii=False, indent=1)

    print(f"matches={n_match} comps={n_comp} rounds mean={out['rounds']['mean']} min={out['rounds']['min']} max={out['rounds']['max']}")
    print("seat top1 (expect ~%.1f each): %s" % (n_match / 8, dict(seat_wins)))
    def show(title, rows, top=8):
        print(f"\n== {title} (top by z1) ==")
        print(f"{'label':38s} {'n':>4} {'t1':>3} {'exp':>5} {'z1':>6} {'t4':>3} {'exp':>5} {'z4':>6} {'avgRk':>5} {'out':>3}")
        for r in rows[:top]:
            print(f"{r['label'][:38]:38s} {r['n']:4d} {r['top1']:3d} {r['exp1']:5.1f} {r['z1']:6.2f} {r['top4']:3d} {r['exp4']:5.1f} {r['z4']:6.2f} {r['avg_rank']:5.2f} {'Y' if r['outlier'] else '':>3}")
        print(f"-- bottom by z1 --")
        for r in rows[-top:]:
            print(f"{r['label'][:38]:38s} {r['n']:4d} {r['top1']:3d} {r['exp1']:5.1f} {r['z1']:6.2f} {r['top4']:3d} {r['exp4']:5.1f} {r['z4']:6.2f} {r['avg_rank']:5.2f} {'Y' if r['outlier'] else '':>3}")
    show("HEROES", hero_rows)
    show("NATIONS", nation_rows, top=7)
    show("CLASSES", class_rows, top=7)
    show("COSTS", cost_rows, top=5)
    show("BONDS", bond_rows, top=10)
    print("\nOUTLIERS (|z|>=2, n>=20):")
    for r in hero_rows + nation_rows + class_rows + bond_rows + cost_rows:
        if r["outlier"]:
            print(f"  {r['label']}: n={r['n']} top1={r['top1']} (exp {r['exp1']}) z1={r['z1']} top4={r['top4']} (exp {r['exp4']}) z4={r['z4']}")

if __name__ == "__main__":
    main(sys.argv[1])
