"""検索エンジン（無料・API キーなし・スクレイピング可）。

  ddg     DuckDuckGo lite/html（直接 → 失敗したら r.jina.ai 経由）
  bing    Bing（直接 → r.jina.ai 経由）
  yahoo   Yahoo! JAPAN（__NEXT_DATA__ の JSON を読む）
  gnews   Google ニュース RSS（検索クエリ対応）
  mojeek  Mojeek（独立インデックス、r.jina.ai 経由）
  wiki    Wikipedia 検索 API
  wikinews ウィキニュース検索 API

それぞれ search(query, n, **opt) -> [item]。item = {url,title,snippet,engine,query,rank,published?}
Google Dorks の演算子（site: filetype: intitle: inurl: "..." -x）は DDG/Bing/Yahoo がほぼそのまま解釈する。
"""
import re, html, json, urllib.parse, base64, datetime
from . import http

ENGINES = {}


def engine(name, label, note=""):
    def deco(fn):
        ENGINES[name] = {"fn": fn, "label": label, "note": note}
        return fn
    return deco


def _clean(s):
    s = re.sub(r"<[^>]+>", "", s or "").replace("**", "")
    return html.unescape(s).replace("\xa0", " ").strip()


def _item(url, title, snippet, eng, query, rank, published=None):
    return {"url": url, "title": _clean(title)[:200], "snippet": _clean(snippet)[:400], "engine": eng, "query": query, "rank": rank, "published": published}


def _ddg_unwrap(u):
    m = re.search(r"[?&]uddg=([^&]+)", u)
    return urllib.parse.unquote(m.group(1)) if m else u


def _parse_jina_ddg_lite(md, query, eng="ddg"):
    out = []
    for m in re.finditer(r"^\s*(\d+)\.\[(.*?)\]\((https?://[^)]+)\)\n(.*?)\n(\S+)\s*$", md, re.M):
        out.append(_item(_ddg_unwrap(m.group(3)), m.group(2), m.group(4), eng, query, int(m.group(1))))
    return out


def _parse_ddg_html(h, query):
    out = []
    for i, m in enumerate(re.finditer(r'<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)</a>.*?class="result__snippet"[^>]*>(.*?)</a>', h, re.S)):
        out.append(_item(_ddg_unwrap(html.unescape(m.group(1))), m.group(2), m.group(3), "ddg", query, i + 1))
    if not out:
        for i, m in enumerate(re.finditer(r"<a rel=\"nofollow\" href=\"([^\"]+)\" class='result-link'>(.*?)</a>.*?class='result-snippet'>(.*?)</td>", h, re.S)):
            out.append(_item(_ddg_unwrap(html.unescape(m.group(1))), m.group(2), m.group(3), "ddg", query, i + 1))
    return out


@engine("ddg", "DuckDuckGo", "lite/html 版。bot 判定に当たったら r.jina.ai 経由")
def ddg(query, n=10, region="jp-jp", **_):
    q = urllib.parse.quote(query)
    for url in (f"https://lite.duckduckgo.com/lite/?q={q}&kl={region}", f"https://html.duckduckgo.com/html/?q={q}&kl={region}"):
        s, t, _u = http.text(url)
        if s == 200 and "anomaly" not in t[:3000] and "challenge" not in t[:3000]:
            r = _parse_ddg_html(t, query)
            if r:
                return r[:n]
    s, md = http.jina(f"https://lite.duckduckgo.com/lite/?q={q}&kl={region}")
    return _parse_jina_ddg_lite(md, query)[:n] if s == 200 else []


def _bing_unwrap(u):
    m = re.search(r"[?&]u=a1([A-Za-z0-9_\-]+)", u)
    if m:
        s = m.group(1)
        try:
            return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)).decode("utf-8", "replace")
        except Exception:
            return u
    return u


@engine("bing", "Bing", "HTML 直接 → r.jina.ai 経由")
def bing(query, n=10, **_):
    q = urllib.parse.quote(query)
    url = f"https://www.bing.com/search?q={q}&setlang=ja&cc=jp&count={n}"
    out = []
    for _try in range(2):
        s, t, _u = http.text(url, headers={"Cookie": "SRCHHPGUSR=SRCHLANG=ja"})
        if s == 200 and "b_algo" in t:
            break
    if s == 200:
        for i, m in enumerate(re.finditer(r'<li class="b_algo".*?<h2><a href="([^"]+)"[^>]*>(.*?)</a></h2>(.*?)</li>', t, re.S)):
            sn = re.search(r'<p class="b_lineclamp[^"]*"[^>]*>(.*?)</p>', m.group(3), re.S)
            sn = sn.group(1) if sn else re.sub(r"<[^>]+>", " ", m.group(3))[:300]
            d = re.search(r'<span class="news_dt">([^<]+)</span>', m.group(3))
            out.append(_item(_bing_unwrap(html.unescape(m.group(1))), m.group(2), sn, "bing", query, i + 1, _jp_date(d.group(1)) if d else None))
    if not out:
        s, md = http.jina(url)
        if s == 200:
            for i, m in enumerate(re.finditer(r"^#+\s*\[(.*?)\]\((https?://[^)]+)\)\n+(.*?)(?=\n#+ |\Z)", md, re.S | re.M)):
                u = _bing_unwrap(m.group(2))
                if "bing.com" in u:
                    continue
                out.append(_item(u, m.group(1), m.group(3)[:300], "bing", query, len(out) + 1))
    return out[:n]


def _jp_date(s):
    m = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", s or "")
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None


@engine("yahoo", "Yahoo! JAPAN", "ページ内の JSON（__NEXT_DATA__）から取得。日本語向け")
def yahoo(query, n=10, **_):
    q = urllib.parse.quote(query)
    s, t, _u = http.text(f"https://search.yahoo.co.jp/search?p={q}&ei=UTF-8")
    if s != 200:
        return []
    i = t.find('__NEXT_DATA__" type="application/json">')
    if i < 0:
        return []
    i += len('__NEXT_DATA__" type="application/json">')
    j = t.find("</script>", i)
    try:
        d = json.loads(t[i:j])
    except Exception:
        return []
    algos = d.get("props", {}).get("pageProps", {}).get("initialProps", {}).get("pageData", {}).get("algos", [])
    out = []
    for a in algos:
        if a.get("type") != "Algo" or not a.get("url"):
            continue
        out.append(_item(a["url"], a.get("title", ""), a.get("description", ""), "yahoo", query, len(out) + 1))
    return out[:n]


@engine("gnews", "Google ニュース (RSS)", "検索クエリ対応の RSS。見出し・媒体名・日時")
def gnews(query, n=20, **_):
    q = urllib.parse.quote(query)
    s, t, _u = http.text(f"https://news.google.com/rss/search?q={q}&hl=ja&gl=JP&ceid=JP:ja")
    if s != 200:
        return []
    out = []
    for m in re.finditer(r"<item>(.*?)</item>", t, re.S):
        it = m.group(1)
        g = lambda tag: (re.search(rf"<{tag}>(.*?)</{tag}>", it, re.S) or re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", it, re.S))
        title = g("title"); link = g("link"); pub = g("pubDate"); src = re.search(r'<source url="([^"]+)">([^<]*)</source>', it)
        if not (title and link):
            continue
        d = None
        try:
            d = datetime.datetime.strptime(pub.group(1).strip(), "%a, %d %b %Y %H:%M:%S %Z").strftime("%Y-%m-%d") if pub else None
        except Exception:
            pass
        item = _item(link.group(1).strip(), title.group(1).replace("<![CDATA[", "").replace("]]>", ""), "", "gnews", query, len(out) + 1, d)
        if src:
            item["site"] = html.unescape(src.group(2)); item["site_url"] = src.group(1)
        out.append(item)
    return out[:n]


@engine("mojeek", "Mojeek", "独立クローラの検索エンジン。r.jina.ai 経由")
def mojeek(query, n=10, **_):
    q = urllib.parse.quote(query)
    s, md = http.jina(f"https://www.mojeek.com/search?q={q}&lb=ja")
    if s != 200:
        return []
    out = []
    for m in re.finditer(r"\[(.*?)\]\((https?://(?!www\.mojeek)[^)]+)\)\n+([^\[\n][^\n]{20,400})", md):
        if any(x["url"] == m.group(2) for x in out):
            continue
        out.append(_item(m.group(2), m.group(1), m.group(3), "mojeek", query, len(out) + 1))
    return out[:n]


@engine("wiki", "Wikipedia", "検索 API。百科事典の記述（出典つき）")
def wiki(query, n=5, lang="ja", **_):
    d = http.json_get(f"https://{lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(query)}&srlimit={n}&format=json&utf8=1")
    out = []
    for r in (d or {}).get("query", {}).get("search", []):
        out.append(_item(f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(r['title'])}", r["title"], r.get("snippet", ""), "wiki", query, len(out) + 1, (r.get("timestamp") or "")[:10]))
    return out


@engine("wikinews", "ウィキニュース", "検索 API")
def wikinews(query, n=5, **_):
    d = http.json_get(f"https://ja.wikinews.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(query)}&srlimit={n}&format=json&utf8=1")
    out = []
    for r in (d or {}).get("query", {}).get("search", []):
        out.append(_item(f"https://ja.wikinews.org/wiki/{urllib.parse.quote(r['title'])}", r["title"], r.get("snippet", ""), "wikinews", query, len(out) + 1, (r.get("timestamp") or "")[:10]))
    return out


def search(query, engines=("ddg", "bing", "yahoo", "gnews"), n=10, **opt):
    """複数エンジンをまとめて引き、URL で重複をまとめる（どのエンジンでも出た＝engines に列挙）。"""
    seen = {}
    for e in engines:
        if e not in ENGINES:
            continue
        try:
            rs = ENGINES[e]["fn"](query, n=n, **opt)
        except Exception as ex:
            http.LOG.append({"engine": e, "err": str(ex)[:120]})
            rs = []
        for r in rs:
            k = norm_url(r["url"])
            if k in seen:
                seen[k]["engines"].append(e)
                if not seen[k]["snippet"] and r["snippet"]:
                    seen[k]["snippet"] = r["snippet"]
                if not seen[k].get("published") and r.get("published"):
                    seen[k]["published"] = r["published"]
            else:
                r = dict(r); r["engines"] = [e]; r["url"] = k
                seen[k] = r
    return list(seen.values())


def norm_url(u):
    u = html.unescape(u.strip())
    u = re.sub(r"#.*$", "", u)
    u = re.sub(r"[?&](utm_[a-z]+|fbclid|gclid|ref|si)=[^&]*", "", u)
    u = re.sub(r"\?$", "", u)
    return u
