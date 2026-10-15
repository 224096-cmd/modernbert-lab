"""データの量・質・漏れ（リーク）の点検。data/ の jsonl を読み、件数・ラベル分布・文長・train/test の重複・実例を
results/data_report.md に書く（GitHub でそのまま読める）。

  python research/data_report.py --data data --out results/data_report.md
"""
import argparse, json, os, collections, statistics, random
random.seed(0)


def load(p):
    return [json.loads(l) for l in open(p, encoding="utf-8")] if os.path.exists(p) else []


def md_row(cells): return "| " + " | ".join(str(c).replace("|", "｜").replace("\n", " ") for c in cells) + " |"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data", default="data"); ap.add_argument("--out", default="results/data_report.md"); ap.add_argument("--examples", type=int, default=3)
    a = ap.parse_args(); D = a.data; L = []; P = L.append
    P("# データ点検レポート（自動生成：`python research/data_report.py`）\n")
    P("各データの出どころ・ライセンス・使い方は `research/DATASETS.md`。ここでは実際に `data/` に作られたファイルの量・ラベル分布・train/test の重複・実例を示す。\n")
    LAB = {0: "含意(True)", 1: "中立(NEI)", 2: "矛盾(False)"}
    # ---- JAD-AFC ----
    afc = {k: load(f"{D}/afc_{k}.jsonl") for k in ("train", "dev", "test")}
    if any(afc.values()):
        P("## JAD-AFC（含意：主張 × 証拠 → 一致／矛盾／無関係）\n")
        P(md_row(["分割", "件数", "記事数", "含意(True)", "中立(NEI)", "矛盾(False)", "逆クレーム", "証拠文の長さ(中央値)", "主張の長さ(中央値)"])); P(md_row(["---"] * 9))
        for k, rows in afc.items():
            if not rows: continue
            c = collections.Counter(r["label"] for r in rows)
            P(md_row([k, len(rows), len({r["article"] for r in rows}), c[0], c[1], c[2], sum(1 for r in rows if r.get("reverse")), int(statistics.median(len(r["premise"]) for r in rows)), int(statistics.median(len(r["hypothesis"]) for r in rows))]))
        P("")
        tr, te, dv = afc["train"], afc["test"], afc["dev"]
        arts = {r["article"] for r in tr} & {r["article"] for r in te}; arts2 = {r["article"] for r in tr} & {r["article"] for r in dv}
        hyp = {r["hypothesis"] for r in tr} & {r["hypothesis"] for r in te}; prem = {r["premise"] for r in tr} & {r["premise"] for r in te}
        P(f"- 漏れ点検：train と test で同じ記事 **{len(arts)} 件**、同じ主張文 **{len(hyp)} 件**、同じ証拠文 **{len(prem)} 件**（train と dev の同じ記事 {len(arts2)} 件）。いずれも 0 が正常。")
        cat = collections.Counter(r["category"] for r in te); P(f"- test の分野：{dict(cat)}")
        P(f"- 分割は記事 URL 単位（`prepare_data.py --seed` で変えられる。交差検証では seed 0〜4）\n")
        P("実例（test から）：\n"); P(md_row(["主張（hypothesis）", "証拠説明文（premise）", "正解", "分野"])); P(md_row(["---"] * 4))
        for lab in (0, 2, 1):
            for r in [x for x in te if x["label"] == lab][:1]: P(md_row([r["hypothesis"], r["premise"][:160] + ("…" if len(r["premise"]) > 160 else ""), LAB[lab], r["category"]]))
        P("")
    # ---- 汎用 NLI ----
    ntr, ndv = load(f"{D}/nli_train.jsonl"), load(f"{D}/nli_dev.jsonl")
    if ntr:
        P("## 汎用 NLI（JNLI ＋ JaNLI ＋ JSICK ＋ JSNLI）\n")
        c = collections.Counter(r["label"] for r in ntr); c2 = collections.Counter(r["label"] for r in ndv)
        P(md_row(["分割", "件数", "含意", "中立", "矛盾"])); P(md_row(["---"] * 5)); P(md_row(["train（学習に使う）", len(ntr), c[0], c[1], c[2]])); P(md_row(["dev（各データの公式 test/valid。汎用性能の確認用）", len(ndv), c2[0], c2[1], c2[2]]))
        ov = {(r["premise"], r["hypothesis"]) for r in ntr} & {(r["premise"], r["hypothesis"]) for r in ndv}
        P(f"\n- 漏れ点検：train と dev で同じ (前提, 仮説) の対 **{len(ov)} 件**（0 が正常）")
        afc_te_h = {r["hypothesis"] for r in afc["test"]}; P(f"- 汎用 NLI の train に JAD-AFC test の主張文が含まれる件数：**{sum(1 for r in ntr if r['hypothesis'] in afc_te_h or r['premise'] in afc_te_h)}**（0 が正常）\n")
        P("実例（train から）：\n"); P(md_row(["前提", "仮説", "正解"])); P(md_row(["---"] * 3))
        for r in random.sample(ntr, min(a.examples, len(ntr))): P(md_row([r["premise"], r["hypothesis"], LAB[r["label"]]]))
        P("")
    # ---- AFC 拡張セット（第2版の学習用）----
    aug, nz = load(f"{D}/afc_train_aug.jsonl"), load(f"{D}/afc_test_noisy.jsonl")
    if aug:
        P("## JAD-AFC 拡張セット（第2版の学習用：証拠版＋正当性版＋極性ペア＋雑音つき前提）\n")
        c = collections.Counter(r.get("src", "afc") for r in aug); lab = collections.Counter(r["label"] for r in aug)
        P(md_row(["内訳", "件数", "説明"])); P(md_row(["---"] * 3))
        P(md_row(["afc", c["afc"], "JAD-AFC train の証拠説明文版と正当性説明文版をそのまま"]))
        P(md_row(["afc-polarity", c["afc-polarity"], "同じ記事の表クレームと逆クレームを同じ前提に当てた対（主張の向きの学習）"]))
        P(md_row(["afc-noise", c["afc-noise"], "前提の前後に無関係なニュース段落を足したもの（Web ページの段落を模す。ラベルは不変）"]))
        P(md_row(["合計", len(aug), f"含意 {lab[0]} ／ 中立 {lab[1]} ／ 矛盾 {lab[2]}"]))
        te_h = {r["hypothesis"] for r in afc["test"]} | {r["premise"] for r in afc["test"]}
        P(f"\n- 漏れ点検：拡張セットに JAD-AFC test の主張文・前提文を含む行 **{sum(1 for r in aug if r['hypothesis'] in te_h or any(h in r['premise'] for h in te_h if len(h) > 20))} 件**（0 が正常）")
        P(f"- 雑音つきテスト `afc_test_noisy.jsonl`：{len(nz)} 件（test と同じ主張・正解、前提の前後に test 側記事の段落を付加）\n")
        P("実例：\n"); P(md_row(["内訳", "前提", "主張", "正解"])); P(md_row(["---"] * 4))
        for k in ("afc-polarity", "afc-noise"):
            xs = [r for r in aug if r.get("src") == k]
            for r in random.sample(xs, min(2, len(xs))): P(md_row([k, r["premise"], r["hypothesis"], LAB[r["label"]]]))
        P("")
    # ---- 客観 / 主観 ----
    otr, ote = load(f"{D}/obj_train.jsonl"), load(f"{D}/obj_test.jsonl")
    if otr:
        P("## 客観／主観（livedoor・Wikipedia ＝ 客観 1、WRIME ＝ 主観 0）\n")
        P(md_row(["分割", "件数", "客観", "主観", "livedoor", "wikipedia", "wrime", "文書数(記事/投稿者)"])); P(md_row(["---"] * 8))
        for k, rows in (("train", otr), ("test", ote)):
            s = collections.Counter(r["src"] for r in rows); P(md_row([k, len(rows), sum(r["label"] == 1 for r in rows), sum(r["label"] == 0 for r in rows), s["livedoor"], s["wikipedia"], s["wrime"], len({r.get("doc") for r in rows})]))
        docs = {r.get("doc") for r in otr} & {r.get("doc") for r in ote}; txt = {r["text"] for r in otr} & {r["text"] for r in ote}
        P(f"\n- 漏れ点検：train と test で同じ記事/投稿者 **{len(docs)} 件**、同じ文 **{len(txt)} 件**（0 が正常。記事 URL・投稿者 ID のハッシュで分割）")
        pairs = load(f"{D}/pairs_stage2.jsonl")
        if pairs:
            tt = {r["text"] for r in ote}; leak = sum(1 for p in pairs if p["anchor"] in tt or p["positive"] in tt or p["negative"] in tt)
            P(f"- 対照学習ペア {len(pairs)} 件のうち、obj_test の文を含むもの **{leak} 件**（0 が正常）")
        P("")
        P("実例（test から）：\n"); P(md_row(["文", "正解", "出どころ"])); P(md_row(["---"] * 3))
        for lab, name in ((1, "客観"), (0, "主観")):
            for r in [x for x in ote if x["label"] == lab][:2]: P(md_row([r["text"][:140] + ("…" if len(r["text"]) > 140 else ""), name, r["src"]]))
        P("")
    pairs = load(f"{D}/pairs_stage2.jsonl")
    if pairs:
        P("## 対照学習ペア（pairs_stage2）\n")
        s = collections.Counter(p.get("src", "livedoor") for p in pairs); P(f"- {len(pairs)} 件（{dict(s)}）。anchor と positive は同じ記事の隣接段落（または JSTS train の高類似文対）、negative は obj_train の主観文\n")
        P(md_row(["anchor", "positive", "negative"])); P(md_row(["---"] * 3))
        for p in pairs[:2]: P(md_row([p["anchor"][:100] + "…", p["positive"][:100] + "…", p["negative"][:80] + "…"]))
        P("")
    P("## 評価で守っていること\n")
    P("- 学習に使うのは `*_train`、エポック選びは `afc_dev`、報告する数値は `afc_test`・`obj_test` だけ（test は学習にもエポック選びにも使わない）")
    P("- JAD-AFC の分割は記事単位。交差検証は seed を変えて記事の分け方を 5 通り作り、平均±標準偏差を報告")
    P("- 既存モデルも同じ test・同じスクリプト（`research/eval_*.py`）で測る")
    P("- Wikipedia 本文は土台モデルの事前学習に含まれうるため、客観性は Wikipedia を除いた数値（`--no_wiki`）も併記")
    os.makedirs(os.path.dirname(a.out), exist_ok=True); open(a.out, "w", encoding="utf-8").write("\n".join(L) + "\n"); print("wrote", a.out)


if __name__ == "__main__":
    main()
