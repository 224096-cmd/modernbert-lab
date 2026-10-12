"""通し検証（検索 → 照合 → 判定）用の正解つき主張リストを作る。JAD-AFC のテスト分割から claim・正解・記事 URL・分野を取り、
サイトの「一括検証（研究用）」に読み込ませる jsonl にする。NEI（情報不足）は 1 件しかないので除く。

  python research/e2e_make.py --data data/afc_test_rationale.jsonl --out results/e2e_claims.jsonl
"""
import argparse, json, os


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data", default="data/afc_test_rationale.jsonl"); ap.add_argument("--out", default="results/e2e_claims.jsonl"); ap.add_argument("--keep_nei", action="store_true")
    a = ap.parse_args(); rows = [json.loads(l) for l in open(a.data, encoding="utf-8")]
    out = [{"claim": r["hypothesis"], "label": r["label"], "rating": r.get("rating"), "category": r.get("category"), "article": r.get("article"), "date": r.get("date")} for r in rows if a.keep_nei or r["label"] != 1]
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        for r in out: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"{a.out}: {len(out)} 件（True {sum(r['label']==0 for r in out)} / False {sum(r['label']==2 for r in out)}）")


if __name__ == "__main__":
    main()
