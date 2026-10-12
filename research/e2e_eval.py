"""通し検証の集計。サイトの「一括検証（研究用）」が書き出した JSON（複数可）を読み、
  - 判定の正解率（システムの 5 段階 → True/False に丸める。根拠不明・判定留保は「保留」）
  - 保留率（判定を出さなかった割合）と、判定を出した中での正解率
  - 証拠の発見率（支持または否定の段落が 1 つでも見つかった割合）
  - ファクトチェック機関のページに頼った割合（除外せずに回したとき）
  - 1 件あたりの時間
を条件（含意モデル × 除外あり/なし × 根拠ページ付与）ごとに表にして results/e2e_summary.md に書く。

  python research/e2e_eval.py results/e2e_*.json
"""
import argparse, json, os, collections

TO_BIN = {"accurate": 0, "mostly": 0, "inaccurate": 2, "false_": 2, "unfounded": None, "hold": None}


def summarize(path):
    d = json.load(open(path, encoding="utf-8")); c = d["config"]; rs = [r for r in d["results"] if "error" not in r]; errs = len(d["results"]) - len(rs)
    dec = [r for r in rs if TO_BIN.get(r["rating"]) is not None]; ok = sum(1 for r in dec if TO_BIN[r["rating"]] == r["gold"])
    strict = sum(1 for r in rs if TO_BIN.get(r["rating"]) == r["gold"])  # 保留は不正解扱い
    found = sum(1 for r in rs if r.get("verdict") in ("supported", "refuted", "mixed"))
    fc_dep = sum(1 for r in rs if r.get("n_fc_sites", 0) > 0)
    per_cat = collections.defaultdict(lambda: [0, 0])
    for r in rs: per_cat[r.get("category", "-")][1] += 1; per_cat[r.get("category", "-")][0] += TO_BIN.get(r["rating"]) == r["gold"]
    conf = collections.Counter((["True", "NEI", "False"][r["gold"]], r["rating"]) for r in rs)
    return {"file": os.path.basename(path), "nli": c.get("nli"), "embed": c.get("embed"), "cond": "根拠ページ付与" if c.get("oracle") else ("FC 機関除外" if c.get("nofc") else "すべて"), "n": len(rs), "errors": errs,
            "acc_strict": strict / max(1, len(rs)), "abstain": 1 - len(dec) / max(1, len(rs)), "acc_decided": ok / max(1, len(dec)), "found": found / max(1, len(rs)), "fc_dep": fc_dep / max(1, len(rs)),
            "sec": sum(r.get("sec", 0) for r in rs) / max(1, len(rs)), "items": sum(r.get("n_items", 0) for r in rs) / max(1, len(rs)), "per_cat": {k: v[0] / v[1] for k, v in per_cat.items()}, "conf": conf}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("files", nargs="+"); ap.add_argument("--out", default="results/e2e_summary.md"); a = ap.parse_args()
    S = [summarize(f) for f in a.files]; L = ["# 通し検証（検索 → 照合 → 判定）の集計\n", "判定の丸め：正確・ほぼ正確 → True、不正確・誤り → False、根拠不明・判定留保 → 保留。「正解率（厳密）」は保留を不正解と数える。\n",
         "| 含意モデル | 条件 | 件数 | 正解率（厳密） | 保留率 | 判定した中の正解率 | 証拠発見率 | FC 機関のページを含む | 1 件の秒数 | 根拠件数/件 |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for s in S: L.append(f"| {s['nli']} | {s['cond']} | {s['n']}{'（エラー ' + str(s['errors']) + '）' if s['errors'] else ''} | {s['acc_strict']:.3f} | {s['abstain']:.3f} | {s['acc_decided']:.3f} | {s['found']:.3f} | {s['fc_dep']:.3f} | {s['sec']:.1f} | {s['items']:.1f} |")
    L.append("")
    for s in S:
        L.append(f"## {s['nli']} / {s['cond']}（{s['file']}）\n"); L.append("分野別の正解率（厳密）：" + "、".join(f"{k} {v:.2f}" for k, v in sorted(s["per_cat"].items())) + "\n")
        L.append("| 正解 \\ システム | 正確 | ほぼ正確 | 不正確 | 誤り | 根拠不明 | 判定留保 |"); L.append("| --- | --- | --- | --- | --- | --- | --- |")
        for g in ("True", "False"): L.append(f"| {g} | " + " | ".join(str(s["conf"].get((g, k), 0)) for k in ("accurate", "mostly", "inaccurate", "false_", "unfounded", "hold")) + " |")
        L.append("")
    os.makedirs(os.path.dirname(a.out), exist_ok=True); open(a.out, "w", encoding="utf-8").write("\n".join(L) + "\n"); print("\n".join(L[:4 + len(S)])); print("wrote", a.out)


if __name__ == "__main__":
    main()
