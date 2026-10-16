import json, statistics as st
R = {}
for l in open("results/nli_eval.jsonl", encoding="utf-8"):
    l = l.strip()
    if not l: continue
    try: r = json.loads(l)
    except Exception: continue
    if r.get("note", "").startswith(__import__("sys").argv[1] if len(__import__("sys").argv) > 1 else "v2r"): R[r["name"]] = r
def row(n):
    r = R.get(n)
    return f'{n:34s} acc={r["acc"]:.3f} TF={r["binary_acc_true_false"]:.3f} contraF1={r["f1_entail_neutral_contra"][2]:.3f} polarity={r["polarity_consistency"]} (pairs {r["polarity_pairs"]})' if r else f"{n}: なし"
print("== 単発（seed 0）")
for n in ["modernbert-ja-30m-untrained", "minilm-l6-xnli", "fcb-nli-30m-nlionly", "fcb-nli-30m-afconly", "fcb-nli-30m", "fcb-nli-30m-noisy", "fcb-nli-30m-evidence"]: print(row(n))
print("== 5 分割交差検証（平均±標準偏差）")
def ms(xs, f):
    v = [f(r) for r in xs if f(r) is not None]; return f"{st.mean(v):.3f}±{st.pstdev(v):.3f}" if v else "-"
for lab, names in (("fcb-nli-30m", ["fcb-nli-30m"] + [f"fcb-nli-30m-cv{s}" for s in range(1, 5)]), ("fcb-nli-30m 雑音つき", ["fcb-nli-30m-noisy"] + [f"fcb-nli-30m-cv{s}-noisy" for s in range(1, 5)]), ("nlionly", ["fcb-nli-30m-nlionly"] + [f"fcb-nli-30m-nlionly-cv{s}" for s in range(1, 5)])):
    xs = [R[n] for n in names if n in R]
    if xs: print(f'{lab:22s} n={len(xs)} acc={ms(xs, lambda r: r["acc"])} TF={ms(xs, lambda r: r["binary_acc_true_false"])} contraF1={ms(xs, lambda r: r["f1_entail_neutral_contra"][2])} polarity={ms(xs, lambda r: r["polarity_consistency"])}')
