"""学習・評価データを data/ に揃える（すべて無料公開・API キー不要）。

  python research/prepare_data.py --out data            # 全部
  python research/prepare_data.py --out data --only afc,aug  # 一部だけ（afc / nli / obj / pairs / livedoor / wiki / aug、コンマ区切り）

作るもの（jsonl）
  afc_train / afc_dev / afc_test : JAD-AFC（日本ファクトチェックセンターの検証記事から作られた主張・証拠・真偽。Fujitsu Research, Apache-2.0）
                                   premise=証拠説明文, hypothesis=クレーム, label 0=含意(True) 1=中立(NEI) 2=矛盾(False)。記事単位で 70/15/15 に分割（逆クレームの漏れ防止）
  nli_train / nli_dev            : JNLI + JaNLI + JSICK + JSNLI（汎用の含意データ。AFC と混ぜて学習に使う。JSNLI は --jsnli 件を抽出）
  afc_train_aug.jsonl            : 第 2 版用の学習セット。AFC の「正当性説明文」版と「証拠説明文」版の両方＋
                                   (a) 主張と逆主張を同じ前提で対にする極性ペア、(b) 前提の前後に無関係な livedoor 文を足した「雑音つき」版
                                   （実際の Web 段落は主張と無関係な文を含むため）
  obj_train / obj_test           : 客観文（livedoor ニュース・Wikipedia 本文）= 1、主観文（WRIME 投稿）= 0。文の客観性の評価・対照学習用。分割は記事単位・投稿者単位
  pairs_stage2                   : 対照学習用（anchor, positive, negative）。train 側の記事の隣接段落を正例、obj_train の主観文を負例。JSTS（train 分割）の高類似ペアも正例に

漏れ（リーク）防止の決まり
  - JAD-AFC は記事 URL 単位で分割（同じ記事の表クレーム・逆クレームが train と test に分かれない）
  - 客観/主観は記事 URL・投稿者 ID のハッシュで分割し、対照学習のペアは train 側の記事からだけ作る
  - 汎用 NLI は各データの公式 train を学習、公式 test/valid を nli_dev に。JSTS は train をペアに、評価は別分割（JMTEB test）
  - 分割後に train と test の同一文を検査する: python research/data_report.py
"""
import argparse, csv, io, json, os, random, re, tarfile, urllib.request, hashlib
random.seed(0)
AFC_URL = "https://raw.githubusercontent.com/FujitsuResearch/japanese-dataset-for-automated-fact-checking/main/data/japanese-dataset-for-automated-fact-checking.csv"
LIVEDOOR_URL = "https://www.rondhuit.com/download/ldcc-20140209.tar.gz"
LAB = {"True": 0, "NEI": 1, "False": 2}
JSNLI_N = int(os.environ.get("JSNLI_N", 60000))  # 環境変数で抽出数を変えられる（0 で JSNLI なし）


def w(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"{path}: {len(rows)}")


def fetch(url, cache):
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    if not os.path.exists(cache):
        print("download", url); urllib.request.urlretrieve(url, cache)
    return cache


def clean(t): return re.sub(r"\s+", " ", (t or "")).strip()


def paragraphs(text, lo=60, hi=400):
    out = []
    for p in re.split(r"\n\s*\n|\n", text):
        p = clean(p)
        if lo <= len(p) <= hi and not re.search(r"https?://|@|＠", p): out.append(p)
    return out


# ---------- JAD-AFC ----------
def do_afc(out, cache):
    rows = list(csv.DictReader(open(fetch(AFC_URL, f"{cache}/afc.csv"), encoding="utf-8-sig")))
    arts = sorted({r["記事URL"] for r in rows}); random.shuffle(arts)
    n = len(arts); split = {a: ("train" if i < n * 0.7 else "dev" if i < n * 0.85 else "test") for i, a in enumerate(arts)}
    buckets = {"train": [], "dev": [], "test": []}
    for r in rows:
        if r["真実性ラベル"] not in LAB or not clean(r["証拠説明文"]) or not clean(r["クレーム"]): continue
        buckets[split[r["記事URL"]]].append({"premise": clean(r["証拠説明文"]), "hypothesis": clean(r["クレーム"]), "label": LAB[r["真実性ラベル"]], "rationale": clean(r["正当性説明文"]), "rating": r["記事レーティング"], "category": r["記事カテゴリ"], "reverse": r["逆クレームラベル"] == "True", "article": r["記事URL"], "date": r["記事公開日"]})
    for k, v in buckets.items(): w(f"{out}/afc_{k}.jsonl", v)
    # 正当性説明文を前提にした版（より長い根拠）
    for k, v in buckets.items(): w(f"{out}/afc_{k}_rationale.jsonl", [{**x, "premise": x["rationale"] or x["premise"]} for x in v])


# ---------- 第 2 版の学習セット（AFC 両版 ＋ 極性ペア ＋ 雑音つき） ----------
def do_aug(out, cache):
    tr = [json.loads(l) for l in open(f"{out}/afc_train.jsonl", encoding="utf-8")]; tr_r = [json.loads(l) for l in open(f"{out}/afc_train_rationale.jsonl", encoding="utf-8")]
    ldp = next((q for q in (f"{out}/livedoor.jsonl", "data/livedoor.jsonl") if os.path.exists(q)), None)
    ld = [json.loads(l) for l in open(ldp, encoding="utf-8")] if ldp else do_livedoor(out, cache)
    noise = [p for d in ld if doc_split(d["url"]) == "train" for p in paragraphs(d["text"], 30, 160)][:20000]; random.shuffle(noise)
    rows = []
    for x in tr + tr_r: rows.append({"premise": x["premise"], "hypothesis": x["hypothesis"], "label": x["label"], "src": "afc"})
    # 極性ペア：同じ記事の表クレームと逆クレームは同じ前提を持つ → 前提は同じで主張だけ逆、ラベルも逆（True↔False）
    by = {}
    for x in tr_r: by.setdefault(x["article"], []).append(x)
    for arts in by.values():
        for x in arts:
            for y in arts:
                if x is y or x["label"] == 1 or y["label"] == 1 or x["label"] == y["label"]: continue
                rows.append({"premise": x["premise"], "hypothesis": y["hypothesis"], "label": y["label"], "src": "afc-polarity"})
    # 雑音つき：前提の前後に無関係な文を足す（Web の段落を模す）。ラベルは変えない
    aug = []
    for x in rows:
        if x["src"] != "afc" or not noise: continue
        a, b = random.choice(noise), random.choice(noise)
        aug.append({"premise": f"{a} {x['premise']} {b}", "hypothesis": x["hypothesis"], "label": x["label"], "src": "afc-noise"})
    rows += aug; random.shuffle(rows); w(f"{out}/afc_train_aug.jsonl", rows)
    # 評価用：テストの雑音つき版（Web 段落での頑健さを見る）と極性ペア
    te = [json.loads(l) for l in open(f"{out}/afc_test_rationale.jsonl", encoding="utf-8")]; tn = [p for d in ld if doc_split(d["url"]) == "test" for p in paragraphs(d["text"], 30, 160)]; random.shuffle(tn)
    w(f"{out}/afc_test_noisy.jsonl", [{**x, "premise": f"{random.choice(tn)} {x['premise']} {random.choice(tn)}"} for x in te] if tn else te)


# ---------- 汎用 NLI ----------
def do_nli(out, cache):
    from datasets import load_dataset
    def norm(ds, p, h, l, lab):
        return [{"premise": clean(x[p]), "hypothesis": clean(x[h]), "label": lab(x[l])} for x in ds if clean(x[p]) and clean(x[h])]
    tr, dv = [], []
    jnli = load_dataset("zenless-lab/jnli"); tr += norm(jnli["train"], "premise", "hypothesis", "label", int); dv += norm(jnli["test"], "premise", "hypothesis", "label", int)
    # JaNLI / JSICK は GitHub の TSV（CC BY-SA 4.0）
    try:
        import csv as _csv
        rows = list(_csv.DictReader(open(fetch("https://raw.githubusercontent.com/verypluming/JaNLI/main/janli.tsv", f"{cache}/janli.tsv"), encoding="utf-8"), delimiter="\t"))
        m = {"entailment": 0, "non-entailment": 1}
        for x in rows:
            r = {"premise": clean(x["sentence_A_Ja"]), "hypothesis": clean(x["sentence_B_Ja"]), "label": m.get(x["entailment_label_Ja"], 1)}
            (tr if x["split"] == "train" else dv).append(r)
        print("JaNLI", len(rows))
    except Exception as e: print("JaNLI skip:", str(e)[:120])
    try:
        import csv as _csv
        rows = list(_csv.DictReader(open(fetch("https://raw.githubusercontent.com/verypluming/JSICK/main/jsick/jsick.tsv", f"{cache}/jsick.tsv"), encoding="utf-8"), delimiter="\t"))
        m = {"entailment": 0, "neutral": 1, "contradiction": 2}
        for x in rows:
            if x["entailment_label_Ja"] not in m: continue
            r = {"premise": clean(x["sentence_A_Ja"]), "hypothesis": clean(x["sentence_B_Ja"]), "label": m[x["entailment_label_Ja"]]}
            (tr if x["data"] == "train" else dv).append(r)
        print("JSICK", len(rows))
    except Exception as e: print("JSICK skip:", str(e)[:120])
    # JSNLI（京大・SNLI の日本語訳 53 万対、CC BY-SA 4.0）：大きいので抽出して使う。否定・言い換えの対が豊富で、主張の向きを読む学習に効く
    try:
        import zipfile
        zp = fetch("https://nlp.ist.i.kyoto-u.ac.jp/DLcounter/lime.cgi?down=https://nlp.ist.i.kyoto-u.ac.jp/nl-resource/JSNLI/jsnli_1.1.zip&name=JSNLI.zip", f"{cache}/jsnli.zip")
        m = {"entailment": 0, "neutral": 1, "contradiction": 2}; js_tr, js_dv = [], []
        with zipfile.ZipFile(zp) as z:
            for name in z.namelist():
                if not name.endswith(".tsv"): continue
                rows = z.read(name).decode("utf-8").split("\n"); dst = js_dv if "dev" in name else js_tr
                for line in rows:
                    c = line.rstrip("\n").split("\t")
                    if len(c) < 3 or c[0] not in m: continue
                    dst.append({"premise": clean(c[1].replace(" ", "")), "hypothesis": clean(c[2].replace(" ", "")), "label": m[c[0]]})
        random.shuffle(js_tr); tr += js_tr[:JSNLI_N]; dv += js_dv[:2000]; print("JSNLI", len(js_tr), "->", min(JSNLI_N, len(js_tr)))
    except Exception as e: print("JSNLI skip:", str(e)[:160])
    random.shuffle(tr); w(f"{out}/nli_train.jsonl", tr); w(f"{out}/nli_dev.jsonl", dv)


# ---------- 客観 / 主観 ----------
def do_livedoor(out, cache):
    tgz = fetch(LIVEDOOR_URL, f"{cache}/ldcc.tar.gz"); docs = []
    with tarfile.open(tgz) as t:
        for m in t.getmembers():
            if not m.isfile() or not m.name.endswith(".txt") or "LICENSE" in m.name: continue
            lines = t.extractfile(m).read().decode("utf-8").split("\n")
            if len(lines) < 4: continue
            docs.append({"category": m.name.split("/")[1], "title": lines[2].strip(), "text": "\n".join(lines[3:]), "url": lines[0].strip(), "date": lines[1].strip()[:10]})
    w(f"{out}/livedoor.jsonl", docs); return docs


def do_wiki(out, n=20000):
    from datasets import load_dataset
    ds = load_dataset("wikimedia/wikipedia", "20231101.ja", split="train", streaming=True)
    docs = []
    for x in ds:
        if len(x["text"]) < 400: continue
        docs.append({"title": x["title"], "text": x["text"][:4000], "url": x["url"]})
        if len(docs) >= n: break
    w(f"{out}/wiki.jsonl", docs); return docs


def doc_split(key, train=85):
    """文書単位の train/test 割り当て（URL やユーザー ID のハッシュで決める。乱数に依存せず再現できる）"""
    return "train" if int(hashlib.md5(key.encode("utf-8")).hexdigest(), 16) % 100 < train else "test"


def do_obj(out, cache):
    from datasets import load_dataset
    ld = do_livedoor(out, cache) if not os.path.exists(f"{out}/livedoor.jsonl") else [json.loads(l) for l in open(f"{out}/livedoor.jsonl", encoding="utf-8")]
    wk = do_wiki(out, 5000) if not os.path.exists(f"{out}/wiki.jsonl") else [json.loads(l) for l in open(f"{out}/wiki.jsonl", encoding="utf-8")][:5000]
    # 客観文：livedoor・Wikipedia の段落。分割は「文書単位」（同じ記事の段落が train と test に分かれない）
    pos = []
    for d in ld: pos += [{"text": p, "label": 1, "src": "livedoor", "doc": d["url"], "split": doc_split(d["url"])} for p in paragraphs(d["text"])[:3]]
    for d in wk: pos += [{"text": p, "label": 1, "src": "wikipedia", "doc": d["url"], "split": doc_split(d["url"])} for p in paragraphs(d["text"])[:2]]
    neg = []
    try:  # WRIME ver.2（GitHub の TSV。研究目的での利用可）。分割は「投稿者単位」
        import csv as _csv
        rows = list(_csv.DictReader(open(fetch("https://raw.githubusercontent.com/ids-cv/wrime/master/wrime-ver2.tsv", f"{cache}/wrime.tsv"), encoding="utf-8"), delimiter="\t"))
        for x in rows:
            t = clean(x["Sentence"]); uid = x.get("UserID") or x.get("User ID") or t
            if 20 <= len(t) <= 400 and not re.search(r"https?://|@", t): neg.append({"text": t, "label": 0, "src": "wrime", "doc": f"wrime-user-{uid}", "split": doc_split(f"wrime-user-{uid}")})
        print("WRIME", len(rows))
    except Exception as e: print("WRIME skip:", str(e)[:160])
    random.shuffle(pos); random.shuffle(neg); outrows = {"train": [], "test": []}
    for sp, cap in (("train", 10200), ("test", 1800)):
        P = [x for x in pos if x["split"] == sp]; N = [x for x in neg if x["split"] == sp]; k = min(len(P), len(N), cap)
        outrows[sp] = P[:k] + N[:k]; random.shuffle(outrows[sp])
    seen = {x["text"] for x in outrows["test"]}; outrows["train"] = [x for x in outrows["train"] if x["text"] not in seen]   # 同一文の重複を念のため除く
    w(f"{out}/obj_train.jsonl", outrows["train"]); w(f"{out}/obj_test.jsonl", outrows["test"])
    return outrows["train"] + outrows["test"]


def do_pairs(out, cache):
    ldp = next((q for q in (f"{out}/livedoor.jsonl", "data/livedoor.jsonl") if os.path.exists(q)), None)
    ld = [json.loads(l) for l in open(ldp, encoding="utf-8")] if ldp else do_livedoor(out, cache)
    if not os.path.exists(f"{out}/obj_train.jsonl"): do_obj(out, cache)
    # obj_train の主観文だけを負例に使う（obj_test の文は使わない）
    neg = [x["text"] for x in (json.loads(l) for l in open(f"{out}/obj_train.jsonl", encoding="utf-8")) if x["label"] == 0]
    test_texts = {json.loads(l)["text"] for l in open(f"{out}/obj_test.jsonl", encoding="utf-8")}
    pairs = []
    for d in ld:
        if doc_split(d["url"]) != "train": continue   # test 側の記事は対照学習に使わない
        ps = [p for p in paragraphs(d["text"]) if p not in test_texts]
        for i in range(len(ps) - 1): pairs.append({"anchor": ps[i], "positive": ps[i + 1], "negative": random.choice(neg) if neg else "", "src": "livedoor"})
    try:
        from datasets import load_dataset
        js = load_dataset("zenless-lab/jsts")["train"]   # JSTS の train 分割だけ（評価は JMTEB の test 分割で行う）
        for x in js:
            if x["label"] >= 4.0: pairs.append({"anchor": clean(x["sentence1"]), "positive": clean(x["sentence2"]), "negative": random.choice(neg) if neg else "", "src": "jsts"})
    except Exception as e: print("JSTS skip:", str(e)[:120])
    random.shuffle(pairs); w(f"{out}/pairs_stage2.jsonl", pairs[:60000])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default="data"); ap.add_argument("--only", default="all"); ap.add_argument("--cache", default="data/_cache"); ap.add_argument("--seed", type=int, default=0, help="記事単位の分割の乱数（交差検証では 0〜4 を回す）"); a = ap.parse_args(); random.seed(a.seed)
    os.makedirs(a.out, exist_ok=True)
    steps = {"afc": lambda: do_afc(a.out, a.cache), "nli": lambda: do_nli(a.out, a.cache), "livedoor": lambda: do_livedoor(a.out, a.cache), "wiki": lambda: do_wiki(a.out), "obj": lambda: do_obj(a.out, a.cache), "pairs": lambda: do_pairs(a.out, a.cache), "aug": lambda: do_aug(a.out, a.cache)}
    for k, f in steps.items():
        if a.only == "all" or k in a.only.split(","):
            print("==", k); f()


if __name__ == "__main__":
    main()
