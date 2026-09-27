"""検索エンジン以外の公開情報源（無料・鍵なし）。search(query, n) -> [item]

  hatena    はてなブックマーク（話題のエントリ検索・ブクマ数＝反応の量）
  reddit    Reddit 検索（公開 JSON）
  mastodon  Mastodon（mstdn.jp など）ハッシュタグ公開タイムライン
  bluesky   Bluesky 公開検索 API
  gdelt     GDELT DOC API（世界のニュース、日本語対応）
  qiita     Qiita 記事検索
  github    GitHub リポジトリ／Issue 検索
  nhk       NHK ニュース RSS（クエリで絞り込み）
  wayback   Wayback Machine の CDX（URL の履歴）
  crossref  Crossref（学術論文）
  openalex  OpenAlex（学術論文）
"""
import re, html, json, urllib.parse, datetime
from . import http
from .engines import _item, ENGINES, engine, _clean

SOURCES = {}


def source(name, label, note=""):
    def deco(fn):
        SOURCES[name] = {"fn": fn, "label": label, "note": note}
        return fn
    return deco


@source("hatena", "はてなブックマーク", "検索 RSS。ブクマ数は反応の量の目安")
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


@source("reddit", "Reddit", "公開 JSON 検索")
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


@source("mastodon", "Mastodon (mstdn.jp)", "ハッシュタグの公開タイムライン（認証不要）")
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


@source("bluesky", "Bluesky", "公開検索 API（認証不要）")
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


@source("gdelt", "GDELT", "世界のニュース記事データベース（DOC API）")
def gdelt(query, n=15, days=30, **_):
    d = http.json_get(f"https://api.gdeltproject.org/api/v2/doc/doc?query={urllib.parse.quote(query + ' sourcelang:jpn')}&mode=artlist&maxrecords={n}&format=json&timespan={days}d", timeout=40)
    out = []
    for a in (d or {}).get("articles", []):
        x = _item(a.get("url", ""), a.get("title", ""), "", "gdelt", query, len(out) + 1, (a.get("seendate") or "")[:8] and f"{a['seendate'][:4]}-{a['seendate'][4:6]}-{a['seendate'][6:8]}")
        x["site"] = a.get("domain")
        out.append(x)
    return out


@source("qiita", "Qiita", "技術記事検索")
def qiita(query, n=10, **_):
    d = http.json_get(f"https://qiita.com/api/v2/items?query={urllib.parse.quote(query)}&per_page={n}")
    out = []
    for a in d or []:
        x = _item(a.get("url", ""), a.get("title", ""), (a.get("body") or "")[:300], "qiita", query, len(out) + 1, (a.get("created_at") or "")[:10])
        x["author"] = (a.get("user") or {}).get("id"); x["reactions"] = a.get("likes_count", 0)
        out.append(x)
    return out


@source("github", "GitHub", "リポジトリ検索（認証なし 10 回/分）")
def github(query, n=10, **_):
    d = http.json_get(f"https://api.github.com/search/repositories?q={urllib.parse.quote(query)}&per_page={n}&sort=updated")
    out = []
    for a in (d or {}).get("items", []):
        x = _item(a.get("html_url", ""), a.get("full_name", ""), a.get("description") or "", "github", query, len(out) + 1, (a.get("updated_at") or "")[:10])
        x["reactions"] = a.get("stargazers_count", 0)
        out.append(x)
    return out


@source("nhk", "NHK ニュース (RSS)", "主要・社会・科学の RSS をクエリで絞り込み")
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


@source("wayback", "Wayback Machine", "URL の保存履歴（CDX API）")
def wayback(query, n=10, **_):
    if not re.match(r"^https?://|^[\w.-]+\.[a-z]{2,}", query.strip()):
        return []
    d = http.json_get(f"https://web.archive.org/cdx/search/cdx?url={urllib.parse.quote(query.strip())}&output=json&limit=-{n}&filter=statuscode:200&collapse=digest", timeout=40)
    out = []
    for row in (d or [])[1:]:
        ts, orig = row[1], row[2]
        out.append(_item(f"https://web.archive.org/web/{ts}/{orig}", f"保存 {ts[:4]}-{ts[4:6]}-{ts[6:8]}", orig, "wayback", query, len(out) + 1, f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"))
    return out


@source("crossref", "Crossref（論文）", "DOI つき学術文献")
def crossref(query, n=5, **_):
    d = http.json_get(f"https://api.crossref.org/works?query={urllib.parse.quote(query)}&rows={n}&select=DOI,title,issued,container-title,author")
    out = []
    for w in (d or {}).get("message", {}).get("items", []):
        y = (w.get("issued", {}).get("date-parts") or [[None]])[0]
        x = _item("https://doi.org/" + w.get("DOI", ""), (w.get("title") or [""])[0], (w.get("container-title") or [""])[0], "crossref", query, len(out) + 1, "-".join(f"{p:02d}" if i else str(p) for i, p in enumerate(y) if p) or None)
        out.append(x)
    return out


@source("openalex", "OpenAlex（論文）", "オープンな学術データベース")
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
