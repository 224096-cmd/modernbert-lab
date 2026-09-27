"""HTTP 蜈ｱ騾夲ｼ壹ヶ繝ｩ繧ｦ繧ｶ逶ｸ蠖薙・ UA縲√・繧ｹ繝医＃縺ｨ縺ｮ髢馴囈縲√Μ繝医Λ繧､縲〉.jina.ai 邨檎罰縺ｮ隱ｭ縺ｿ蜿悶ｊ莉｣譖ｿ縲・
縺吶∋縺ｦ辟｡譁吶・API 繧ｭ繝ｼ縺ｪ縺励ら嶌謇九し繧､繝医・雋闕ｷ縺ｫ縺ｪ繧峨↑縺・ｈ縺・∝酔荳繝帙せ繝医∈縺ｯ MIN_GAP 遘剃ｻ･荳翫≠縺代ｋ縲・"""
import time, random, urllib.parse, urllib.request, urllib.error, gzip, io, json, re, os

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MIN_GAP = float(os.environ.get("MBO_MIN_GAP", "1.2"))
TIMEOUT = float(os.environ.get("MBO_TIMEOUT", "15"))
JINA = "https://r.jina.ai/"
_last = {}
LOG = []


def _wait(host):
    t = _last.get(host, 0)
    d = MIN_GAP - (time.time() - t)
    if d > 0:
        time.sleep(d + random.random() * 0.3)
    _last[host] = time.time()


def get(url, headers=None, timeout=None, retries=1, data=None, accept=None):
    """GET/POST縲・status, bytes, final_url, headers) 繧定ｿ斐☆縲ょ､ｱ謨玲凾縺ｯ status=0縲・""
    host = urllib.parse.urlsplit(url).hostname or ""
    h = {"User-Agent": UA, "Accept": accept or "text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
         "Accept-Language": "ja,en;q=0.8", "Accept-Encoding": "gzip"}
    if headers:
        h.update(headers)
    for attempt in range(retries + 1):
        _wait(host)
        t0 = time.time()
        try:
            req = urllib.request.Request(url, headers=h, data=data, method="POST" if data else "GET")
            with urllib.request.urlopen(req, timeout=timeout or TIMEOUT) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
                LOG.append({"url": url[:200], "status": r.status, "ms": int((time.time() - t0) * 1000)})
                return r.status, raw, r.geturl(), dict(r.headers)
        except urllib.error.HTTPError as e:
            LOG.append({"url": url[:200], "status": e.code, "ms": int((time.time() - t0) * 1000)})
            try:
                body = e.read()
            except Exception:
                body = b""
            if e.code in (429, 503) and attempt < retries:
                time.sleep(3 + attempt * 3)
                continue
            return e.code, body, url, dict(e.headers or {})
        except Exception as e:
            LOG.append({"url": url[:200], "status": 0, "err": str(e)[:100], "ms": int((time.time() - t0) * 1000)})
            if attempt < retries:
                time.sleep(2)
                continue
            return 0, b"", url, {}
    return 0, b"", url, {}


def text(url, **kw):
    s, b, u, h = get(url, **kw)
    return s, decode(b, h), u


def decode(b, headers=None):
    ct = (headers or {}).get("Content-Type", "")
    m = re.search(r"charset=([\w-]+)", ct, re.I)
    for enc in ([m.group(1)] if m else []) + ["utf-8", "cp932", "euc-jp"]:
        try:
            return b.decode(enc)
        except Exception:
            continue
    return b.decode("utf-8", "replace")


def jina(url, timeout=45):
    """r.jina.ai 繝ｪ繝ｼ繝繝ｼ・育┌譁吶・骰ｵ縺ｪ縺暦ｼ峨〒譛ｬ譁・ｒ Markdown 縺ｨ縺励※蜿門ｾ励ゅヶ繝ｩ繧ｦ繧ｶ蛛ｴ縺ｨ蜷後§邨瑚ｷｯ縲・""
    s, b, u, h = get(JINA + url, headers={"Accept": "text/plain", "User-Agent": "curl/8.6.0"}, timeout=timeout)
    return s, decode(b, h)


WIKI_UA = "modernbert-lab/1.0 (https://github.com/224096-cmd/modernbert-lab; research bot)"


def json_get(url, **kw):
    if "wikipedia.org" in url or "wikinews.org" in url or "wikidata.org" in url or "wikimedia.org" in url:
        kw.setdefault("headers", {})["User-Agent"] = WIKI_UA
        kw.setdefault("retries", 2)
    s, b, u, h = get(url, accept="application/json", **kw)
    if s != 200:
        return None
    try:
        return json.loads(b.decode("utf-8", "replace"))
    except Exception:
        return None
