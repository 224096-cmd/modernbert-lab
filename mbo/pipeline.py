"""収集 → 本文 → 判定 → 保存 の一連の流れ。GitHub Actions からは `python -m mbo watch` で呼ぶ。

docs/data/
  index.json              トピック一覧・最終実行・件数
  latest.json             全トピックの新着（信頼性つき）
  topics/<slug>.json      トピックごとの結果（items, clusters, queries, http ログ要約）
  verify/<id>.json        主張の検証結果
  domains/<host>.json     ドメイン調査
  domains_cache.json      ドメインの年齢・Wikipedia 出典回数（30 日キャッシュ）
"""
import os, re, json, time, hashlib, datetime, unicodedata
from . import engines, sources, dorks, fetch, recon, judge, models, http

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "docs", "data")


def slug(s):
    s = unicodedata.normalize("NFKC", s).strip()
    h = hashlib.md5(s.encode()).hexdigest()[:6]
    return re.sub(r"[^\w一-龥ぁ-んァ-ヶー]+", "-", s)[:40].strip("-") + "-" + h


def now():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(timespec="seconds")


def load_json(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return default


def save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(obj, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)


# ---------- ドメイン情報（安い項目だけ、キャッシュ） ----------
def domain_infos(hosts, max_new=25, ttl_days=30, budget=150, log=None):
    path = os.path.join(DATA, "domains_cache.json")
    cache = load_json(path, {})
    today = datetime.date.today().isoformat(); n = 0; t0 = time.time()
    for h in hosts:
        if time.time() - t0 > budget:
            break
        bare = h[4:] if h.startswith("www.") else h
        c = cache.get(bare)
        if c and (datetime.date.today() - datetime.date.fromisoformat(c["checked"])).days < ttl_days:
            continue
        if n >= max_new:
            continue
        n += 1
        if log:
            log(f"  ドメイン情報 {n}: {bare}")
        info = {"checked": today}
        try:
            info["wayback"] = recon.wayback(bare)
        except Exception:
            info["wayback"] = {}
        try:
            info["wiki_cites"] = recon.wiki_cites(recon.registrable(bare))
        except Exception:
            info["wiki_cites"] = None
        cache[bare] = info
    save_json(path, cache)
    return {h: cache.get(h[4:] if h.startswith("www.") else h, {}) for h in hosts}


# ---------- 収集 ----------
def collect(topic, opt=None, log=print):
    P = judge.P["collect"]; opt = opt or {}
    eng_names = opt.get("engines") or P["engines"]
    dork_names = opt.get("dorks") if opt.get("dorks") is not None else P["dorks"]
    per = int(opt.get("per_engine") or P["per_engine"])
    queries = [{"name": "topic", "label": "そのまま", "query": topic}] + dorks.build(topic, names=dork_names, domain=opt.get("domain"))
    items, seen = [], {}
    t0 = time.time(); budget = float(opt.get("budget") or os.environ.get("MBO_BUDGET", 900))
    for q in queries:
        for e in eng_names:
            if time.time() - t0 > budget * 0.6:
                log("  時間切れ（検索）"); break
            qq = dorks.normalize_for(e, q["query"])
            if e in sources.SOURCES and q["name"] != "topic":
                continue  # API 系情報源は演算子を解釈しないので素のトピックだけ
            rs = sources.run(e, qq, n=per)
            log(f"  {e:9s} {q['name']:12s} {len(rs):3d} 件  {qq[:60]}")
            for r in rs:
                k = engines.norm_url(r["url"])
                if not k.startswith("http"):
                    continue
                if k in seen:
                    it = seen[k]; it["engines"] = sorted(set(it["engines"]) | {e}); it["dorks"] = sorted(set(it["dorks"]) | {q["name"]})
                    for f in ("snippet", "published", "author", "site", "reactions"):
                        if not it.get(f) and r.get(f):
                            it[f] = r[f]
                else:
                    it = {"id": hashlib.md5(k.encode()).hexdigest()[:10], "url": k, "title": r.get("title") or "", "snippet": r.get("snippet") or "", "published": r.get("published"),
                          "author": r.get("author"), "site": r.get("site"), "site_url": r.get("site_url"), "reactions": r.get("reactions"), "engines": [e], "dorks": [q["name"]], "query": q["query"], "text": "", "topic": topic}
                    seen[k] = it; items.append(it)
    log(f"  収集 {len(items)} 件 ({time.time() - t0:.0f}s)")
    # 優先度: 複数エンジンで出た・公的/報道・Dorks 経由
    def prio(it):
        cls = recon.domain_class(recon.host_of(it["url"]))
        return (len(it["engines"]) * 2 + len(it["dorks"]) + {"gov": 3, "news": 3, "edu": 2, "academic": 2, "wiki": 1}.get(cls, 0) + (1 if it.get("reactions") else 0))
    items.sort(key=lambda it: -prio(it))
    items = items[: int(opt.get("max_items") or P["max_items"])]
    # 本文
    nread = int(opt.get("read_bodies") if opt.get("read_bodies") is not None else P["read_bodies"])
    for it in items[:nread]:
        if time.time() - t0 > budget:
            log("  時間切れ（本文）"); break
        r = fetch.read(it["url"])
        if r.get("final_url") and r["final_url"].startswith("http") and recon.host_of(r["final_url"]) not in ("news.google.com", recon.host_of(it["url"])):
            it["orig_url"] = it["url"]; it["url"] = engines.norm_url(r["final_url"])  # 転送先（Google ニュース → 媒体）
        it["text"] = r["text"][:6000]; it["via"] = r["via"]; it["status"] = r["status"]
        it["title"] = it["title"] or r["title"] or ""; it["author"] = it.get("author") or r["author"]; it["published"] = it.get("published") or r["date"]
        it["site"] = it.get("site") or r["sitename"]; it["lang"] = r["lang"]; it["n_links"] = len(r["links"])
    log(f"  本文 {sum(1 for it in items if it.get('text'))} 件 ({time.time() - t0:.0f}s)")
    return items, queries


def _log(msg):
    print(msg, flush=True)


def run_topic(topic, opt=None, log=_log):
    log(f"[topic] {topic}")
    items, queries = collect(topic, opt, log)
    hosts = sorted({recon.host_of(it["url"]) for it in items})
    dinfo = domain_infos(hosts, log=log)
    log("  ModernBERT で判定中")
    emb, nli = models.embedder(), models.nli()
    judge.score_items(items, dinfo, emb=emb, nli=nli)
    clusters = judge.cluster(items, emb)
    items.sort(key=lambda it: -it["reliability"])
    res = {"topic": topic, "slug": slug(topic), "run_at": now(), "n": len(items), "queries": queries, "items": items, "clusters": clusters,
           "engines": judge.P["collect"]["engines"] if not (opt or {}).get("engines") else opt["engines"],
           "http": {"requests": len(http.LOG), "errors": sum(1 for l in http.LOG if l.get("status") not in (200, 202))},
           "summary": summarize(items, clusters)}
    save_json(os.path.join(DATA, "topics", res["slug"] + ".json"), res)
    update_index(res)
    log(f"  保存 docs/data/topics/{res['slug']}.json  平均信頼性 {res['summary']['mean']}  A:{res['summary']['grades'].get('A', 0)} B:{res['summary']['grades'].get('B', 0)} C:{res['summary']['grades'].get('C', 0)} D:{res['summary']['grades'].get('D', 0)}")
    return res


def summarize(items, clusters):
    g = {}
    for it in items:
        g[it["grade"]] = g.get(it["grade"], 0) + 1
    cls = {}
    for it in items:
        cls[it["source_class"]] = cls.get(it["source_class"], 0) + 1
    return {"mean": int(sum(it["reliability"] for it in items) / len(items)) if items else 0, "grades": g, "classes": cls, "clusters": len(clusters),
            "domains": len({recon.host_of(it["url"]) for it in items}), "dated": sum(1 for it in items if it.get("published"))}


def update_index(res):
    path = os.path.join(DATA, "index.json")
    idx = load_json(path, {"topics": [], "verify": [], "domains": []})
    idx["topics"] = [t for t in idx["topics"] if t["slug"] != res["slug"]]
    hist = [h for h in (next((t for t in load_json(path, {}).get("topics", []) if t["slug"] == res["slug"]), {}) or {}).get("history", [])][-30:]
    hist.append({"run_at": res["run_at"], "n": res["n"], "mean": res["summary"]["mean"]})
    idx["topics"].insert(0, {"topic": res["topic"], "slug": res["slug"], "run_at": res["run_at"], "n": res["n"], "summary": res["summary"], "history": hist})
    idx["updated"] = now()
    save_json(path, idx)
    # latest
    lat = load_json(os.path.join(DATA, "latest.json"), {"items": []})
    keep = [it for it in lat["items"] if it.get("topic") != res["topic"]]
    new = [{k: it.get(k) for k in ("id", "url", "title", "snippet", "published", "site", "engines", "reliability", "grade", "source_class", "topic", "cluster")} for it in res["items"][:40]]
    lat["items"] = sorted(keep + new, key=lambda x: (x.get("published") or "0000"), reverse=True)[:300]
    lat["updated"] = now()
    save_json(os.path.join(DATA, "latest.json"), lat)


def run_verify(claim, opt=None, log=_log):
    log(f"[verify] {claim}")
    opt = dict(opt or {}); opt.setdefault("dorks", ["exact", "official_jp", "news_pr", "factcheck", "deny"])
    items, queries = collect(claim, opt, log)
    hosts = sorted({recon.host_of(it["url"]) for it in items})
    dinfo = domain_infos(hosts, log=log)
    log("  ModernBERT で判定中")
    emb, nli = models.embedder(), models.nli()
    judge.score_items(items, dinfo, emb=emb, nli=nli)
    v = judge.verify(claim, items, emb, nli)
    v.update({"run_at": now(), "id": slug(claim), "queries": queries, "n_items": len(items), "items": [{k: it.get(k) for k in ("id", "url", "title", "published", "reliability", "grade", "source_class")} for it in items]})
    save_json(os.path.join(DATA, "verify", v["id"] + ".json"), v)
    idx = load_json(os.path.join(DATA, "index.json"), {"topics": [], "verify": [], "domains": []})
    idx["verify"] = [x for x in idx.get("verify", []) if x["id"] != v["id"]]
    idx["verify"].insert(0, {"id": v["id"], "claim": claim, "verdict": v["verdict"], "support": v["support"], "refute": v["refute"], "run_at": v["run_at"]})
    idx["updated"] = now(); save_json(os.path.join(DATA, "index.json"), idx)
    log(f"  判定 {v['verdict']}  支持 {v['support']} 反証 {v['refute']}  根拠 {len(v['evidence'])}")
    return v


def run_recon(target, log=_log):
    log(f"[recon] {target}")
    p = recon.profile(target)
    p["run_at"] = now()
    save_json(os.path.join(DATA, "domains", p["host"] + ".json"), p)
    idx = load_json(os.path.join(DATA, "index.json"), {"topics": [], "verify": [], "domains": []})
    idx["domains"] = [x for x in idx.get("domains", []) if x["host"] != p["host"]]
    idx["domains"].insert(0, {"host": p["host"], "class": p["class"], "run_at": p["run_at"], "first": (p.get("wayback") or {}).get("first"), "wiki_cites": p.get("wiki_cites"), "subdomains": len(p.get("crtsh") or []) + len((p.get("hackertarget") or {}).get("hosts", []))})
    idx["updated"] = now(); save_json(os.path.join(DATA, "index.json"), idx)
    log(f"  {p['class']} 初出 {(p.get('wayback') or {}).get('first')} Wikipedia出典 {p.get('wiki_cites')} サブドメイン {len(p.get('crtsh') or [])}")
    return p


def run_watch(path=None, log=_log):
    import yaml
    path = path or os.path.join(ROOT, "watch.yaml")
    w = yaml.safe_load(open(path, encoding="utf-8")) or {}
    for t in w.get("topics", []) or []:
        if isinstance(t, str):
            t = {"topic": t}
        try:
            run_topic(t["topic"], {k: v for k, v in t.items() if k != "topic"}, log)
        except Exception as e:
            log(f"  ERROR {e}")
    for c in w.get("claims", []) or []:
        try:
            run_verify(c if isinstance(c, str) else c["claim"], None if isinstance(c, str) else c, log)
        except Exception as e:
            log(f"  ERROR {e}")
    for d in w.get("domains", []) or []:
        try:
            run_recon(d, log)
        except Exception as e:
            log(f"  ERROR {e}")
    save_json(os.path.join(DATA, "last_run.json"), {"run_at": now(), "requests": len(http.LOG), "errors": [l for l in http.LOG if l.get("status") not in (200, 202)][-50:]})


def rescore(log=_log):
    """収集し直さずに、保存済みのトピック結果を現在のパラメータ・モデルで再判定する（params.json やモデルを変えたとき用）。"""
    import glob
    emb, nli = models.embedder(), models.nli()
    for f in sorted(glob.glob(os.path.join(DATA, "topics", "*.json"))):
        res = load_json(f, None)
        if not res:
            continue
        items = res["items"]
        for it in items:
            for k in ("s_source", "s_content", "s_corr", "s_time", "reliability", "grade", "corr", "claim", "style", "specificity", "source_why", "cluster"):
                it.pop(k, None)
        hosts = sorted({recon.host_of(it["url"]) for it in items})
        dinfo = domain_infos(hosts, max_new=0)
        judge.score_items(items, dinfo, emb=emb, nli=nli)
        res["clusters"] = judge.cluster(items, emb); items.sort(key=lambda it: -it["reliability"])
        res["summary"] = summarize(items, res["clusters"]); res["rescored_at"] = now(); res["nli"] = getattr(nli, "meta", {}).get("source")
        save_json(f, res); update_index(res)
        log(f"  再判定 {res['topic']}  平均 {res['summary']['mean']}  {res['summary']['grades']}")
