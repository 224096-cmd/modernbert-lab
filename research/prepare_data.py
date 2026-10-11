"""学習・評価データを data/ に揃える（すべて無料公開・API キー不要）。

  python research/prepare_data.py --out data            # 全部
  python research/prepare_data.py --out data --only afc  # 一部だけ（afc / nli / obj / pairs / livedoor / wiki）

作るもの（jsonl）
  afc_train / afc_dev / afc_test : JAD-AFC（日本ファクトチェックセンターの検証記事から作られた主張・証拠・真偽。Fujitsu Research, Apache-2.0）
                                   premise=証拠説明文, hypothesis=クレーム, label 0=含意(True) 1=中立(NEI) 2=矛盾(False)。記事単位で 70/15/15 に分割（逆クレームの漏れ防止）
  nli_train / nli_dev            : JNLI + JaNLI + JSICK（汎用の含意データ。AFC と混ぜて学習に使う）
  obj_train / obj_test           : 客観文（livedoor ニュース・Wikipedia 本文）= 1、主観文（WRIME 投稿）= 0。文の客観性の評価・対照学習用
  pairs_stage2                   : 対照学習用（anchor, positive, negative）。同じ記事の隣接段落を正例、主観文を負例。JSTS の高類似ペアも正例に
"""
import argparse, csv, io, json, os, random, re, tarfile, urllib.request, hashlib
random.seed(0)
AFC_URL = "https://raw.githubusercontent.com/FujitsuResearch/japanese-dataset-for-automated-fact-checking/main/data/japanese-dataset-for-automated-fact-checking.csv"
LIVEDOOR_URL = "https://www.rondhuit.com/download/ldcc-20140209.tar.gz"
LAB = {"True": 0, "NEI": 1, "False": 2}


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


def do_obj(out, cache):
    from datasets import load_dataset
    ld = do_livedoor(out, cache) if not os.path.exists(f"{out}/livedoor.jsonl") else [json.loads(l) for l in open(f"{out}/livedoor.jsonl", encoding="utf-8")]
    wk = do_wiki(out, 5000) if not os.path.exists(f"{out}/wiki.jsonl") else [json.loads(l) for l in open(f"{out}/wiki.jsonl", encoding="utf-8")][:5000]
    pos = []
    for d in ld: pos += [{"text": p, "label": 1, "src": "livedoor"} for p in paragraphs(d["text"])[:3]]
    for d in wk: pos += [{"text": p, "label": 1, "src": "wikipedia"} for p in paragraphs(d["text"])[:2]]
    neg = []
    try:  # WRIME ver.2（GitHub の TSV。研究目的での利用可）
        import csv as _csv
        rows = list(_csv.DictReader(open(fetch("https://raw.githubusercontent.com/ids-cv/wrime/master/wrime-ver2.tsv", f"{cache}/wrime.tsv"), encoding="utf-8"), delimiter="\t"))
        for x in rows:
            t = clean(x["Sentence"])
            if 20 <= len(t) <= 400 and not re.search(r"https?://|@", t): neg.append({"text": t, "label": 0, "src": "wrime"})
        print("WRIME", len(rows))
    except Exception as e: print("WRIME skip:", str(e)[:160])
    random.shuffle(pos); random.shuffle(neg); k = min(len(pos), len(neg), 12000)
    allx = pos[:k] + neg[:k]; random.shuffle(allx); cut = int(len(allx) * 0.85)
    w(f"{out}/obj_train.jsonl", allx[:cut]); w(f"{out}/obj_test.jsonl", allx[cut:])
    return allx


def do_pairs(out, cache):
    ld = [json.loads(l) for l in open(f"{out}/livedoor.jsonl", encoding="utf-8")] if os.path.exists(f"{out}/livedoor.jsonl") else do_livedoor(out, cache)
    neg = [json.loads(l) for l in open(f"{out}/obj_train.jsonl", encoding="utf-8")] if os.path.exists(f"{out}/obj_train.jsonl") else do_obj(out, cache)
    neg = [x["text"] for x in neg if x["label"] == 0]
    pairs = []
    for d in ld:
        ps = paragraphs(d["text"])
        for i in range(len(ps) - 1): pairs.append({"anchor": ps[i], "positive": ps[i + 1], "negative": random.choice(neg) if neg else ""})
    try:
        from datasets import load_dataset
        js = load_dataset("zenless-lab/jsts")["train"]
        for x in js:
            if x["label"] >= 4.0: pairs.append({"anchor": clean(x["sentence1"]), "positive": clean(x["sentence2"]), "negative": random.choice(neg) if neg else ""})
    except Exception as e: print("JSTS skip:", str(e)[:120])
    random.shuffle(pairs); w(f"{out}/pairs_stage2.jsonl", pairs[:60000])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default="data"); ap.add_argument("--only", default="all"); ap.add_argument("--cache", default="data/_cache"); ap.add_argument("--seed", type=int, default=0, help="記事単位の分割の乱数（交差検証では 0〜4 を回す）"); a = ap.parse_args(); random.seed(a.seed)
    os.makedirs(a.out, exist_ok=True)
    steps = {"afc": lambda: do_afc(a.out, a.cache), "nli": lambda: do_nli(a.out, a.cache), "livedoor": lambda: do_livedoor(a.out, a.cache), "wiki": lambda: do_wiki(a.out), "obj": lambda: do_obj(a.out, a.cache), "pairs": lambda: do_pairs(a.out, a.cache)}
    for k, f in steps.items():
        if a.only in ("all", k):
            print("==", k); f()


if __name__ == "__main__":
    main()
