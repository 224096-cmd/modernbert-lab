"""讀懃ｴ｢繧ｨ繝ｳ繧ｸ繝ｳ莉･螟悶・蜈ｬ髢区ュ蝣ｱ貅撰ｼ育┌譁吶・骰ｵ縺ｪ縺暦ｼ峨Ｔearch(query, n) -> [item]

  hatena    縺ｯ縺ｦ縺ｪ繝悶ャ繧ｯ繝槭・繧ｯ・郁ｩｱ鬘後・繧ｨ繝ｳ繝医Μ讀懃ｴ｢繝ｻ繝悶け繝樊焚・晏渚蠢懊・驥擾ｼ・  reddit    Reddit 讀懃ｴ｢・亥・髢・JSON・・  mastodon  Mastodon・・stdn.jp 縺ｪ縺ｩ・峨ワ繝・す繝･繧ｿ繧ｰ蜈ｬ髢九ち繧､繝繝ｩ繧､繝ｳ
  bluesky   Bluesky 蜈ｬ髢区､懃ｴ｢ API
  gdelt     GDELT DOC API・井ｸ也阜縺ｮ繝九Η繝ｼ繧ｹ縲∵律譛ｬ隱槫ｯｾ蠢懶ｼ・  qiita     Qiita 險倅ｺ区､懃ｴ｢
  github    GitHub 繝ｪ繝昴ず繝医Μ・終ssue 讀懃ｴ｢
  nhk       NHK 繝九Η繝ｼ繧ｹ RSS・医け繧ｨ繝ｪ縺ｧ邨槭ｊ霎ｼ縺ｿ・・  wayback   Wayback Machine 縺ｮ CDX・・RL 縺ｮ螻･豁ｴ・・  crossref  Crossref・亥ｭｦ陦楢ｫ匁枚・・  openalex  OpenAlex・亥ｭｦ陦楢ｫ匁枚・・"""
import re, html, json, urllib.parse, datetime
from . import http
from .engines import _item, ENGINES, engine, _clean

SOURCES = {}


def source(name, label, note=""):
    def deco(fn):
        SOURCES[name] = {"fn": fn, "label": label, "note": note}
        return fn
    return deco


@source("hatena", "縺ｯ縺ｦ縺ｪ繝悶ャ繧ｯ繝槭・繧ｯ", "讀懃ｴ｢ RSS縲ゅヶ繧ｯ繝樊焚縺ｯ蜿榊ｿ懊・驥上・逶ｮ螳・)
def hatena(query, n=10, **_):
    s, t, _u = http.text(f"https://b.hatena.ne.jp/search/text?q={urllib.parse.quote(query)}&mode=rss&sort=recent")
    if s != 200:
        return []
    out = []
    for m in re.finditer(r"<item[^>]*>(.*?)</item>", t, re.S):
        it = m.group(1)
        g = lambda tag: re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", it, re.S)
        ti, li, de, dt, bc = g("title"), g("link"), g("description"), g("dc:date"), g("hatena:bookmarkcount")
        if not (ti and li):
            continue
        x = _item(li.group(1).strip(), ti.group(1), de.group(1) if de else "", "hatena", query, len(out) + 1, dt.group(1)[:10] if dt else None)
        x["reactions"] = int(bc.group(1)) if bc else 0
        out.append(x)
    return out[:n]


@source("reddit", "Reddit", "蜈ｬ髢・JSON 讀懃ｴ｢")
def reddit(query, n=10, **_):
    d = http.json_get(f"https://www.reddit.com/search.json?q={urllib.parse.quote(query)}&limit={n}&sort=new", headers={"User-Agent": "modernbert-lab/1.0"})
    out = []
    for c in (d or {}).get("data", {}).get("children", []):
        p = c.get("data", {})
        x = _item("https://www.reddit.com" + p.get("permalink", ""), p.get("title", ""), (p.get("selftext") or "")[:300], "reddit", query, len(out) + 1,
                  datetime.datetime.utcfromtimestamp(p.get("created_utc", 0)).strftime("%Y-%m-%d") if p.get("created_utc") else None)
        x["reactions"] = p.get("score", 0); x["author"] = p.get("author"); x["ext_url"] = p.get("url")
        out.append(x)
    return out


@source("mastodon", "Mastodon (mstdn.jp)", "繝上ャ繧ｷ繝･繧ｿ繧ｰ縺ｮ蜈ｬ髢九ち繧､繝繝ｩ繧､繝ｳ・郁ｪ崎ｨｼ荳崎ｦ・ｼ・)
def mastodon(query, n=10, instance="mstdn.jp", **_):
    tag = re.sub(r"[\s#]+", "", query.split()[0]) if query.strip() else ""
    if not tag:
        return []
    d = http.json_get(f"https://{instance}/api/v1/timelines/tag/{urllib.parse.quote(tag)}?limit={n}")
    out = []
    for p in d or []:
        txt = _clean(p.get("content", ""))
        x = _item(p.get("url") or p.get("uri", ""), txt[:80], txt, "mastodon", query, len(out) + 1, (p.get("created_at") or "")[:10])
        x["author"] = (p.get("account") or {}).get("acct"); x["reactions"] = (p.get("reblogs_count", 0) + p.get("favourites_count", 0))
        out.append(x)
    return out


@source("bluesky", "Bluesky", "蜈ｬ髢区､懃ｴ｢ API・郁ｪ崎ｨｼ荳崎ｦ・ｼ・)
def bluesky(query, n=10, **_):
    d = http.json_get(f"https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q={urllib.parse.quote(query)}&limit={n}&sort=latest")
    out = []
    for p in (d or {}).get("posts", []):
        rec = p.get("record", {}); handle = p.get("author", {}).get("handle", "")
        rk = p.get("uri", "").split("/")[-1]
        x = _item(f"https://bsky.app/profile/{handle}/post/{rk}", rec.get("text", "")[:80], rec.get("text", ""), "bluesky", query, len(out) + 1, (rec.get("createdAt") or "")[:10])
        x["author"] = handle; x["reactions"] = p.get("likeCount", 0) + p.get("repostCount", 0)
        out.append(x)
    return out


@source("gdelt", "GDELT", "荳也阜縺ｮ繝九Η繝ｼ繧ｹ險倅ｺ九ョ繝ｼ繧ｿ繝吶・繧ｹ・・OC API・・)
def gdelt(query, n=15, days=30, **_):
    d = http.json_get(f"https://api.gdeltproject.org/api/v2/doc/doc?query={urllib.parse.quote(query + ' sourcelang:jpn')}&mode=artlist&maxrecords={n}&format=json&timespan={days}d", timeout=40)
    out = []
    for a in (d or {}).get("articles", []):
        x = _item(a.get("url", ""), a.get("title", ""), "", "gdelt", query, len(out) + 1, (a.get("seendate") or "")[:8] and f"{a['seendate'][:4]}-{a['seendate'][4:6]}-{a['seendate'][6:8]}")
        x["site"] = a.get("domain")
        out.append(x)
    return out


@source("qiita", "Qiita", "謚陦楢ｨ倅ｺ区､懃ｴ｢")
def qiita(query, n=10, **_):
    d = http.json_get(f"https://qiita.com/api/v2/items?query={urllib.parse.quote(query)}&per_page={n}")
    out = []
    for a in d or []:
        x = _item(a.get("url", ""), a.get("title", ""), (a.get("body") or "")[:300], "qiita", query, len(out) + 1, (a.get("created_at") or "")[:10])
        x["author"] = (a.get("user") or {}).get("id"); x["reactions"] = a.get("likes_count", 0)
        out.append(x)
    return out


@source("github", "GitHub", "繝ｪ繝昴ず繝医Μ讀懃ｴ｢・郁ｪ崎ｨｼ縺ｪ縺・10 蝗・蛻・ｼ・)
def github(query, n=10, **_):
    d = http.json_get(f"https://api.github.com/search/repositories?q={urllib.parse.quote(query)}&per_page={n}&sort=updated")
    out = []
    for a in (d or {}).get("items", []):
        x = _item(a.get("html_url", ""), a.get("full_name", ""), a.get("description") or "", "github", query, len(out) + 1, (a.get("updated_at") or "")[:10])
        x["reactions"] = a.get("stargazers_count", 0)
        out.append(x)
    return out


@source("nhk", "NHK 繝九Η繝ｼ繧ｹ (RSS)", "荳ｻ隕√・遉ｾ莨壹・遘大ｭｦ縺ｮ RSS 繧偵け繧ｨ繝ｪ縺ｧ邨槭ｊ霎ｼ縺ｿ")
def nhk(query, n=10, **_):
    out = []
    words = [w for w in re.split(r"\s+", query) if w and not w.startswith("-") and ":" not in w]
    for feed in ("cat0", "cat1", "cat3", "cat6"):
        s, t, _u = http.text(f"https://www.nhk.or.jp/rss/news/{feed}.xml")
        if s != 200:
            continue
        for m in re.finditer(r"<item>(.*?)</item>", t, re.S):
            it = m.group(1)
            g = lambda tag: re.search(rf"<{tag}>(.*?)</{tag}>", it, re.S)
            ti, li, de, pd = g("title"), g("link"), g("description"), g("pubDate")
            if not (ti and li):
                continue
            body = (ti.group(1) + " " + (de.group(1) if de else ""))
            if words and not all(w.strip('"') in body for w in words):
                continue
            d = None
            try:
                d = datetime.datetime.strptime(pd.group(1).strip(), "%a, %d %b %Y %H:%M:%S %z").strftime("%Y-%m-%d") if pd else None
            except Exception:
                pass
            out.append(_item(li.group(1).strip(), ti.group(1), de.group(1) if de else "", "nhk", query, len(out) + 1, d))
    return out[:n]


@source("wayback", "Wayback Machine", "URL 縺ｮ菫晏ｭ伜ｱ･豁ｴ・・DX API・・)
def wayback(query, n=10, **_):
    if not re.match(r"^https?://|^[\w.-]+\.[a-z]{2,}", query.strip()):
        return []
    d = http.json_get(f"https://web.archive.org/cdx/search/cdx?url={urllib.parse.quote(query.strip())}&output=json&limit=-{n}&filter=statuscode:200&collapse=digest", timeout=40)
    out = []
    for row in (d or [])[1:]:
        ts, orig = row[1], row[2]
        out.append(_item(f"https://web.archive.org/web/{ts}/{orig}", f"菫晏ｭ・{ts[:4]}-{ts[4:6]}-{ts[6:8]}", orig, "wayback", query, len(out) + 1, f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"))
    return out


@source("crossref", "Crossref・郁ｫ匁枚・・, "DOI 縺､縺榊ｭｦ陦捺枚迪ｮ")
def crossref(query, n=5, **_):
    d = http.json_get(f"https://api.crossref.org/works?query={urllib.parse.quote(query)}&rows={n}&select=DOI,title,issued,container-title,author")
    out = []
    for w in (d or {}).get("message", {}).get("items", []):
        y = (w.get("issued", {}).get("date-parts") or [[None]])[0]
        x = _item("https://doi.org/" + w.get("DOI", ""), (w.get("title") or [""])[0], (w.get("container-title") or [""])[0], "crossref", query, len(out) + 1, "-".join(f"{p:02d}" if i else str(p) for i, p in enumerate(y) if p) or None)
        out.append(x)
    return out


@source("openalex", "OpenAlex・郁ｫ匁枚・・, "繧ｪ繝ｼ繝励Φ縺ｪ蟄ｦ陦薙ョ繝ｼ繧ｿ繝吶・繧ｹ")
def openalex(query, n=5, **_):
    d = http.json_get(f"https://api.openalex.org/works?search={urllib.parse.quote(query)}&per-page={n}&select=id,title,publication_date,doi,primary_location,cited_by_count")
    out = []
    for w in (d or {}).get("results", []):
        x = _item(w.get("doi") or w.get("id", ""), w.get("title") or "", ((w.get("primary_location") or {}).get("source") or {}).get("display_name", ""), "openalex", query, len(out) + 1, w.get("publication_date"))
        x["reactions"] = w.get("cited_by_count", 0)
        out.append(x)
    return out


ALL = {**{k: dict(v, kind="engine") for k, v in ENGINES.items()}, **{k: dict(v, kind="source") for k, v in SOURCES.items()}}


def run(name, query, n=10, **opt):
    fn = (ENGINES.get(name) or SOURCES.get(name) or {}).get("fn")
    if not fn:
        return []
    try:
        return fn(query, n=n, **opt)
    except Exception as ex:
        http.LOG.append({"source": name, "err": str(ex)[:160]})
        return []
