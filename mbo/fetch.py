"""ページ本文の取得と抽出（trafilatura）。robots.txt を尊重し、失敗時は r.jina.ai リーダーに切り替える。

read(url) -> {url, final_url, status, title, text, author, date, sitename, description, lang, links, headers, via}
"""
import re, urllib.parse, urllib.robotparser, json, datetime
from . import http

try:
    import trafilatura
except Exception:  # pragma: no cover
    trafilatura = None

_robots = {}
SKIP_EXT = (".zip", ".exe", ".dmg", ".mp4", ".mp3", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js")
MAX_CHARS = 20000


def allowed(url):
    p = urllib.parse.urlsplit(url)
    base = f"{p.scheme}://{p.netloc}"
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        s, t, _u = http.text(base + "/robots.txt", timeout=10)
        try:
            rp.parse(t.splitlines() if s == 200 else [])
        except Exception:
            rp.parse([])
        _robots[base] = rp
    try:
        return _robots[base].can_fetch("*", url)
    except Exception:
        return True


def _meta(html, name):
    m = re.search(rf'<meta[^>]+(?:property|name)=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)', html, re.I) or \
        re.search(rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(name)}["\']', html, re.I)
    return m.group(1).strip() if m else None


def read(url, use_jina_fallback=True, respect_robots=True):
    out = {"url": url, "final_url": url, "status": 0, "title": None, "text": "", "author": None, "date": None, "sitename": None,
           "description": None, "lang": None, "links": [], "headers": {}, "via": "direct", "fetched": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"}
    if url.lower().split("?")[0].endswith(SKIP_EXT):
        out["via"] = "skipped"; return out
    if respect_robots and not allowed(url):
        out["via"] = "robots";
        if not use_jina_fallback:
            return out
    else:
        s, b, fu, h = http.get(url, timeout=25)
        out["status"] = s; out["final_url"] = fu
        out["headers"] = {k.lower(): v for k, v in h.items() if k.lower() in ("content-type", "last-modified", "server", "strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy")}
        ct = out["headers"].get("content-type", "")
        if s == 200 and b and ("html" in ct or "xml" in ct or not ct):
            html = http.decode(b, h)
            _extract_html(html, out)
            if len(out["text"]) > 200:
                return out
        elif s == 200 and "pdf" in ct:
            out["via"] = "pdf"
    if use_jina_fallback:
        s, md = http.jina(url)
        if s == 200 and md:
            out["via"] = "jina" if out["via"] in ("direct", "robots") else out["via"] + "+jina"
            t = re.search(r"^Title:\s*(.*)$", md, re.M)
            if t and not out["title"]:
                out["title"] = t.group(1).strip()
            body = re.split(r"^Markdown Content:\s*$", md, 1, flags=re.M)
            body = body[1] if len(body) > 1 else md
            out["text"] = md_to_text(body)[:MAX_CHARS]
            out["status"] = out["status"] or 200
    return out


def _extract_html(html, out):
    out["title"] = _meta(html, "og:title") or (re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I) or [None, None])[1]
    if out["title"]:
        out["title"] = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", out["title"])).strip()[:200]
    out["description"] = _meta(html, "og:description") or _meta(html, "description")
    out["sitename"] = _meta(html, "og:site_name")
    out["date"] = _meta(html, "article:published_time") or _meta(html, "datePublished") or _meta(html, "date") or _meta(html, "pubdate")
    out["author"] = _meta(html, "author") or _meta(html, "article:author")
    lm = re.search(r'<html[^>]+lang=["\']([\w-]+)', html, re.I)
    out["lang"] = lm.group(1) if lm else None
    # JSON-LD
    for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            d = json.loads(m.group(1))
        except Exception:
            continue
        for node in (d if isinstance(d, list) else [d]):
            if not isinstance(node, dict):
                continue
            g = node.get("@graph")
            for n in ([node] + (g if isinstance(g, list) else [])):
                if not isinstance(n, dict):
                    continue
                out["date"] = out["date"] or n.get("datePublished")
                a = n.get("author")
                if a and not out["author"]:
                    out["author"] = a.get("name") if isinstance(a, dict) else (a[0].get("name") if isinstance(a, list) and a and isinstance(a[0], dict) else (a if isinstance(a, str) else None))
                p = n.get("publisher")
                if p and not out["sitename"] and isinstance(p, dict):
                    out["sitename"] = p.get("name")
    if trafilatura:
        try:
            txt = trafilatura.extract(html, include_comments=False, include_tables=True, favor_recall=True, deduplicate=True)
            md = trafilatura.extract_metadata(html)
            if md:
                out["title"] = out["title"] or md.title
                out["author"] = out["author"] or md.author
                out["date"] = out["date"] or md.date
                out["sitename"] = out["sitename"] or md.sitename
        except Exception:
            txt = None
    else:
        txt = None
    if not txt:
        body = re.sub(r"<(script|style|nav|footer|header|aside)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
        txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body))
    out["text"] = (txt or "").strip()[:MAX_CHARS]
    if out["date"]:
        out["date"] = norm_date(out["date"])
    out["links"] = list(dict.fromkeys(re.findall(r'href=["\'](https?://[^"\'#]+)', html)))[:200]


def md_to_text(md):
    md = re.sub(r"\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)", "", md)  # [![alt](img)](link)
    md = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", md)
    md = re.sub(r"\[!\[[^\n]*", "", md)  # 途中で切れた画像リンク
    md = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", md)
    md = re.sub(r"^\s*[-*|#>]+\s*", "", md, flags=re.M)
    md = re.sub(r"[ \t]+", " ", md)
    return re.sub(r"\n{3,}", "\n\n", md).strip()


def norm_date(s):
    if not s:
        return None
    m = re.search(r"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})", str(s))
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.search(r"(\d{4})-(\d{2})", str(s))
    return f"{m.group(1)}-{m.group(2)}-01" if m else None


def split_passages(text, max_chars=280):
    """本文を文単位でまとめた「段落」に分ける（NLI・埋め込みの単位）。"""
    text = re.sub(r"\s+", " ", text or "").strip()
    sents = re.split(r"(?<=[。．！？!?])\s*", text)
    out, cur = [], ""
    for s in sents:
        if not s:
            continue
        if len(cur) + len(s) > max_chars and cur:
            out.append(cur); cur = s
        else:
            cur += s
    if cur:
        out.append(cur)
    return [p for p in out if len(p) >= 20]
