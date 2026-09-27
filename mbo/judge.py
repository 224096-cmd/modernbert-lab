"""信頼性判定・主張検証・話題クラスタ（ModernBERT: Ruri 埋め込み + JNLI 含意）。

信頼性スコア R（0–100）= 100 × Σ_k w_k · s_k、k ∈ {source, content, corroboration, time}
  source        : ドメイン種別（go.jp/ac.jp/報道/…）＋ HTTPS・ドメイン年齢・Wikipedia 出典回数・著者/日付の有無
  content       : 本文の長さ・具体性（数値/日付/引用/固有名詞）・ゼロショット文体（煽り/報告/意見/宣伝）
  corroboration : 他ドメインの段落が「見出し＋要旨」を含意する重み付き件数（飽和関数）－ 矛盾
  time          : 日付の新しさ（半減期）。日付なしは固定値
式とパラメータは docs/params.json（サイトの「仕組み」タブで変更可）。
"""
import re, math, json, os, datetime, numpy as np
from . import models
from .recon import host_of, domain_class

P = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "params.json"), encoding="utf-8"))


def set_params(p):
    global P
    P = p


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


# ---------- 出所 ----------
def source_score(item, dom_info=None):
    host = host_of(item.get("site_url") or item["url"])
    cls = "news" if host == "news.google.com" else domain_class(host[4:] if host.startswith("www.") else host)
    s = P["source_class"].get(cls, 0.45)
    b = P["source_bonus"]; why = [f"種別 {cls} → {s:.2f}"]
    if item["url"].startswith("https://"):
        s += b["https"]; why.append("HTTPS")
    age = (dom_info or {}).get("wayback", {}).get("age_days")
    if age is not None:
        if age > 365 * 5: s += b["age_5y"]; why.append(f"ドメイン {age // 365} 年")
        elif age > 365: s += b["age_1y"]; why.append(f"ドメイン {age // 365} 年")
        elif age < 90: s += b["age_lt_90d"]; why.append(f"ドメイン {age} 日（新しい）")
    wc = (dom_info or {}).get("wiki_cites")
    if isinstance(wc, int):
        if wc >= 50: s += b["wiki_cites_50"]; why.append(f"Wikipedia 出典 {wc} 件")
        elif wc >= 5: s += b["wiki_cites_5"]; why.append(f"Wikipedia 出典 {wc} 件")
    if item.get("author"): s += b["author"]; why.append("著者あり")
    if item.get("published"): s += b["date"]; why.append("日付あり")
    return clamp(s), cls, why


# ---------- 内容 ----------
def specificity(text):
    t = text or ""
    c = P["content"]["specificity_targets"]
    n = {"numbers": len(re.findall(r"\d+(?:[.,]\d+)?\s*(?:%|人|件|円|km|m|℃|kg|年|月|日|時|分|回|倍|万|億)", t)),
         "dates": len(re.findall(r"\d{4}年|\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}", t)),
         "quotes": len(re.findall(r"「[^」]{4,}」|によると|と述べ|と発表", t)),
         "proper": len(set(re.findall(r"[一-龥]{2,}(?:省|庁|大学|市|県|町|村|社|協会|研究所|委員会|病院|署|局)", t)))}
    return clamp(sum(min(n[k] / c[k], 1.0) for k in c) / len(c)), n


def content_scores(items, emb=None):
    """items に content スコアを付ける（まとめて埋め込み計算）。"""
    texts = [(it.get("title") or "") + "。" + ((it.get("text") or it.get("snippet") or "")[:600]) for it in items]
    zs = models.zero_shot(texts, P["content"]["zero_shot_labels"], emb) if items else []
    out = []
    for it, z in zip(items, zs):
        body = it.get("text") or it.get("snippet") or ""
        length = clamp(len(body) / P["content"]["min_chars_full"])
        spec, n = specificity(body)
        style = sum(P["content"]["zero_shot_weight"].get(k, 0) * v for k, v in z.items())
        s = clamp(0.35 * length + 0.4 * spec + 0.25 + style)
        it["style"] = {k: round(v, 3) for k, v in z.items()}
        it["specificity"] = n
        it["s_content"] = round(s, 3)
        out.append(s)
    return out


# ---------- 裏取り（他ドメインとの整合） ----------
def key_claim(it):
    """要旨＝本文（または抜粋）の最初の命題らしい 1 文。無ければ見出し。含意判定の仮説に使うので短い命題にする"""
    t = re.sub(r"\s*[-|｜].{0,30}$", "", (it.get("title") or "").strip())
    body = (it.get("text") or it.get("snippet") or "").strip()
    lead = next((x.strip() for x in re.split(r"(?<=[。．！？!?])|\n+", body) if 15 <= len(x.strip()) <= 200 and is_prop(x.strip())), "")
    return lead if lead else (t[:120] if is_prop(t) else "")


PROP = re.compile(r"(です|ます|でした|ました|した|する|される|された|れた|られた|である|だった|ている|ていた|ない|なった|なる|ある|いる|発表|発生|決定|開始|開催|予定|判明|確認|見込み|とみられ|という)[。．!！?？」]?$")


def is_prop(s):
    """命題らしい文か（述語で終わる）。見出し語やナビ文字列は含意判定の仮説にしない"""
    s = s.strip()
    return bool(s) and bool(PROP.search(s)) and not re.match(r"^(グローバル|本文へ|メニュー|ナビ|ホーム|トップ|\||・|\d+\.)", s)


def corroborate(items, passages, emb, nli):
    """passages: [{text, url, domain, s_source}]。各 item の要旨を他ドメインの段落が含意/矛盾するか。"""
    C = P["corroboration"]
    if not items or not passages:
        for it in items:
            it["s_corr"] = 0.0; it["corr"] = {"support": 0, "contra": 0, "evidence": []}
        return
    claims = [key_claim(it) for it in items]
    Q = emb.encode([c or "。" for c in claims], "query"); D = emb.encode([p["text"] for p in passages], "doc")
    S = Q @ D.T
    pairs, meta = [], []
    for i, it in enumerate(items):
        if not claims[i]:
            continue  # 命題が取れないページは裏取りしない（中立の既定値）
        dom = host_of(it["url"])
        idx = np.argsort(-S[i])[:C["top_k"]]
        for j in idx:
            if S[i, j] < C["min_sim"] or passages[j]["domain"] == dom:
                continue
            pairs.append((passages[j]["text"], claims[i])); meta.append((i, int(j), float(S[i, j])))
    if len(pairs) > C.get("max_pairs", 600):  # 含意判定の総数を抑える（類似度の高い順）
        order = sorted(range(len(pairs)), key=lambda k: -meta[k][2])[: C["max_pairs"]]
        pairs = [pairs[k] for k in order]; meta = [meta[k] for k in order]
    probs = nli.predict([p[0] for p in pairs], [p[1] for p in pairs]) if pairs else []
    acc = {i: {"support": 0.0, "contra": 0.0, "evidence": [], "doms": set()} for i in range(len(items))}
    alpha = C.get("topical_alpha", 0.5)
    for (i, j, sim), pr in zip(meta, probs):
        w = passages[j].get("s_source", 0.5)
        e, n, c = map(float, pr)
        a = acc[i]
        rel = (sim - C["min_sim"]) / max(1e-6, 1 - C["min_sim"])  # 類似度の余裕（0〜1）
        if e >= C["entail_min"]:
            a["support"] += w * e; a["doms"].add(passages[j]["domain"])
            a["evidence"].append({"url": passages[j]["url"], "text": passages[j]["text"][:200], "p": round(e, 3), "kind": "support", "sim": round(sim, 3)})
        elif c < C["contra_min"]:
            # 含意とまでは言えないが同趣旨の記述（中立・高類似）は部分点：同じ話題を他ドメインも扱っている
            a["support"] += w * alpha * rel * n; a["doms"].add(passages[j]["domain"])
            if rel > 0.5:
                a["evidence"].append({"url": passages[j]["url"], "text": passages[j]["text"][:200], "p": round(n, 3), "kind": "related", "sim": round(sim, 3)})
        if c >= C["contra_min"]:
            a["contra"] += w * c
            a["evidence"].append({"url": passages[j]["url"], "text": passages[j]["text"][:200], "p": round(c, 3), "kind": "contra", "sim": round(sim, 3)})
    for i, it in enumerate(items):
        a = acc[i]
        sup = 1 - math.exp(-a["support"] / C["saturation"]); con = 1 - math.exp(-a["contra"] / C["saturation"])
        it["s_corr"] = round(clamp(0.15 + 0.85 * sup - 0.6 * con), 3)
        a["evidence"].sort(key=lambda e: -e["p"])
        it["corr"] = {"support": round(a["support"], 2), "contra": round(a["contra"], 2), "domains": sorted(a["doms"]), "evidence": a["evidence"][:6]}
        it["claim"] = claims[i]


# ---------- 時間 ----------
def time_score(item, now=None):
    d = item.get("published")
    if not d:
        return P["time"]["undated"]
    try:
        dt = datetime.date.fromisoformat(d[:10])
    except Exception:
        return P["time"]["undated"]
    days = max(0, ((now or datetime.date.today()) - dt).days)
    return clamp(0.5 ** (days / P["time"]["half_life_days"]) * 0.8 + 0.2)


# ---------- 総合 ----------
def score_items(items, dom_infos=None, passages=None, emb=None, nli=None):
    emb = emb or models.embedder(); nli = nli or models.nli()
    dom_infos = dom_infos or {}
    for it in items:
        s, cls, why = source_score(it, dom_infos.get(host_of(it["url"])))
        it["s_source"] = round(s, 3); it["source_class"] = cls; it["source_why"] = why
    content_scores(items, emb)
    if passages is None:
        passages = build_passages(items)
    corroborate(items, passages, emb, nli)
    W = P["weights"]
    for it in items:
        it["s_time"] = round(time_score(it), 3)
        r = W["source"] * it["s_source"] + W["content"] * it["s_content"] + W["corroboration"] * it["s_corr"] + W["time"] * it["s_time"]
        it["reliability"] = int(round(100 * clamp(r)))
        it["grade"] = "A" if it["reliability"] >= 75 else "B" if it["reliability"] >= 60 else "C" if it["reliability"] >= 45 else "D"
    return items


def build_passages(items, max_per_item=12):
    from .fetch import split_passages
    out = []
    for it in items:
        dom = host_of(it["url"])
        txt = it.get("text") or it.get("snippet") or ""
        for p in split_passages(txt)[:max_per_item] or ([txt] if len(txt) >= 20 else []):
            out.append({"text": p, "url": it["url"], "domain": dom, "s_source": it.get("s_source", 0.5), "published": it.get("published")})
    return out


# ---------- 主張の検証 ----------
def verify(claim, items, emb=None, nli=None, passages=None):
    """主張 → 関連段落を検索 → 含意/矛盾 → 判定。返り値 {verdict, support, refute, evidence[]}"""
    emb = emb or models.embedder(); nli = nli or models.nli()
    V = P["verify"]
    passages = passages if passages is not None else build_passages(items)
    if not passages:
        return {"claim": claim, "verdict": "insufficient", "support": 0, "refute": 0, "evidence": []}
    q = emb.encode([claim], "query"); D = emb.encode([p["text"] for p in passages], "doc")
    sims = (q @ D.T)[0]
    idx = [int(i) for i in np.argsort(-sims)[:V["top_k"]] if sims[i] >= V["min_sim"]]
    if not idx:
        return {"claim": claim, "verdict": "insufficient", "support": 0, "refute": 0, "evidence": []}
    pr = nli.predict([passages[i]["text"] for i in idx], [claim] * len(idx))
    ev, sup, ref, doms_s, doms_r = [], 0.0, 0.0, set(), set()
    for i, p in zip(idx, pr):
        e, n, c = map(float, p); w = passages[i].get("s_source", 0.5)
        kind = "support" if e >= V["support_min"] else "refute" if c >= V["refute_min"] else "neutral"
        if kind == "support": sup += w * e; doms_s.add(passages[i]["domain"])
        if kind == "refute": ref += w * c; doms_r.add(passages[i]["domain"])
        ev.append({"url": passages[i]["url"], "domain": passages[i]["domain"], "text": passages[i]["text"][:240], "sim": round(float(sims[i]), 3), "entail": round(e, 3), "neutral": round(n, 3), "contra": round(c, 3), "kind": kind, "published": passages[i].get("published")})
    T = V["verdict"]
    if sup >= T["supported"] and ref < sup * T["mixed_ratio"]: verdict = "supported"
    elif ref >= T["refuted"] and sup < ref * T["mixed_ratio"]: verdict = "refuted"
    elif sup + ref >= 1.0: verdict = "mixed"
    else: verdict = "insufficient"
    ev.sort(key=lambda e: -(max(e["entail"], e["contra"]) if e["kind"] != "neutral" else 0))
    return {"claim": claim, "verdict": verdict, "support": round(sup, 2), "refute": round(ref, 2), "support_domains": sorted(doms_s), "refute_domains": sorted(doms_r), "evidence": ev[:12], "n_passages": len(passages)}


# ---------- 話題クラスタ ----------
def cluster(items, emb=None):
    emb = emb or models.embedder()
    if not items:
        return []
    X = emb.encode([(it.get("title") or "") + " " + (it.get("snippet") or "")[:200] for it in items], "topic")
    th = P["cluster"]["threshold"]
    labels = [-1] * len(items); cid = 0
    for i in range(len(items)):
        if labels[i] >= 0:
            continue
        labels[i] = cid
        for j in range(i + 1, len(items)):
            if labels[j] < 0 and float(X[i] @ X[j]) >= th:
                labels[j] = cid
        cid += 1
    groups = {}
    for it, l in zip(items, labels):
        it["cluster"] = l; groups.setdefault(l, []).append(it)
    out = []
    for l, g in groups.items():
        g.sort(key=lambda x: (x.get("published") or "9999"))
        doms = sorted({host_of(x["url"]) for x in g})
        out.append({"id": l, "size": len(g), "domains": doms, "first": g[0].get("published"), "first_url": g[0]["url"], "title": max(g, key=lambda x: x.get("reliability", 0)).get("title"),
                    "reliability": int(np.mean([x.get("reliability", 0) for x in g])), "classes": sorted({x.get("source_class", "") for x in g})})
    out.sort(key=lambda c: -c["size"])
    return out
