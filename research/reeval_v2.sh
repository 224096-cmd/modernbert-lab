#!/usr/bin/env bash
# 学習し直さずに第2版の評価だけやり直す（極性一貫性を記事単位の対で集計）。数分で終わる
set -e
OUT=${OUT:-$HOME/fcb}
for d in fcb-nli-30m fcb-nli-30m-nlionly fcb-nli-30m-afconly; do
  python research/eval_nli.py --model "$OUT/$d" --name "$d" --data data/afc_test_rationale.jsonl --note "v2r finetuned"
  python research/eval_nli.py --model "$OUT/$d" --name "$d-noisy" --data data/afc_test_noisy.jsonl --note "v2r finetuned 雑音つき"
  python research/eval_nli.py --model "$OUT/$d" --name "$d-evidence" --data data/afc_test.jsonl --note "v2r finetuned 証拠説明文版（副）"
done
for m in "MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli minilm-l6-xnli" "sbintuitions/modernbert-ja-30m modernbert-ja-30m-untrained"; do
  set -- $m
  python research/eval_nli.py --model "$1" --name "$2" --data data/afc_test_rationale.jsonl --note "v2r baseline" || true
  python research/eval_nli.py --model "$1" --name "$2-noisy" --data data/afc_test_noisy.jsonl --note "v2r baseline 雑音つき" || true
done
for s in 1 2 3 4; do
  python research/eval_nli.py --model "$OUT/cv$s" --name fcb-nli-30m-cv$s --data data_s$s/afc_test_rationale.jsonl --note "v2r cv"
  python research/eval_nli.py --model "$OUT/cv$s" --name fcb-nli-30m-cv$s-noisy --data data_s$s/afc_test_noisy.jsonl --note "v2r cv 雑音つき"
  python research/eval_nli.py --model "$OUT/cv${s}-nlionly" --name fcb-nli-30m-nlionly-cv$s --data data_s$s/afc_test_rationale.jsonl --note "v2r cv"
done
python - <<'PY'
import json, statistics as st
R = {}
for l in open("results/nli_eval.jsonl", encoding="utf-8"):
    r = json.loads(l)
    if r.get("note", "").startswith("v2r"): R[r["name"]] = r
def row(n):
    r = R.get(n); 
    return f'{n:34s} acc={r["acc"]:.3f} TF={r["binary_acc_true_false"]:.3f} contraF1={r["f1_entail_neutral_contra"][2]:.3f} polarity={r["polarity_consistency"]} (pairs {r["polarity_pairs"]})' if r else f"{n}: なし"
print("== 単発（seed 0）"); [print(row(n)) for n in ["modernbert-ja-30m-untrained","minilm-l6-xnli","fcb-nli-30m-nlionly","fcb-nli-30m-afconly","fcb-nli-30m","fcb-nli-30m-noisy","fcb-nli-30m-evidence"]]
print("== 5 分割交差検証（seed 0 の fcb-nli-30m を含む平均±標準偏差）")
for lab, names in (("fcb-nli-30m", ["fcb-nli-30m"] + [f"fcb-nli-30m-cv{s}" for s in range(1, 5)]), ("fcb-nli-30m 雑音つき", ["fcb-nli-30m-noisy"] + [f"fcb-nli-30m-cv{s}-noisy" for s in range(1, 5)]), ("nlionly", ["fcb-nli-30m-nlionly"] + [f"fcb-nli-30m-nlionly-cv{s}" for s in range(1, 5)])):
    xs = [R[n] for n in names if n in R]
    if not xs: continue
    def ms(k, f=lambda r, k: r[k]):
        v = [f(r, k) for r in xs if f(r, k) is not None]; return f"{st.mean(v):.3f}±{st.pstdev(v):.3f}" if v else "-"
    print(f'{lab:22s} n={len(xs)} acc={ms("acc")} TF={ms("binary_acc_true_false")} contraF1={ms("f1_entail_neutral_contra", lambda r,k: r[k][2])} polarity={ms("polarity_consistency")}')
PY
