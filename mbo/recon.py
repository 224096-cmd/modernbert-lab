"""ドメイン調査（動画で紹介される whois / DNS / Shodan / theHarvester / Wayback の「無料・鍵なし」代替）。

  dns        Google DNS over HTTPS（A / AAAA / MX / NS / TXT）
  rdap       RDAP（whois の後継、JSON）。.jp は JPRS whois を r.jina.ai 経由で読む
  crtsh      証明書透明性ログ（サブドメインの列挙）
  hackertarget  ホスト検索・逆引き・GeoIP（無料枠 50 回/日）
  wayback    Wayback Machine 最古／最新スナップショット（ドメインの年齢）
  urlscan    urlscan.io 公開スキャン検索
  wiki_cites Wikipedia でそのドメインが出典に使われている回数
  headers    セキュリティヘッダ／サーバ種別（自サイトの点検用）
  robots     robots.txt / sitemap の有無
profile(domain) -> dict
"""
import re, json, urllib.parse, datetime
from . import http

GOV = (".go.jp", ".lg.jp", ".gov", ".gov.uk", ".europa.eu", ".un.org", ".who.int")
EDU = (".ac.jp", ".ed.jp", ".edu")
ORG = (".or.jp", ".org", ".gr.jp")
NEWS = ("nhk.or.jp", "nikkei.com", "asahi.com", "yomiuri.co.jp", "mainichi.jp", "sankei.com", "jiji.com", "kyodo.co.jp", "47news.jp", "tokyo-np.jp", "chunichi.co.jp", "reuters.com", "bloomberg.co.jp", "bbc.com", "afpbb.com", "nikkansports.com", "itmedia.co.jp", "impress.co.jp", "cnn.co.jp", "newsweekjapan.jp", "toyokeizai.net", "diamond.jp", "prtimes.jp", "kyodonews.jp", "sponichi.co.jp", "hochi.news", "fnn.jp", "news.tv-asahi.co.jp", "tbs.co.jp", "ntv.co.jp", "japantimes.co.jp")
WIKI = ("wikipedia.org", "wikinews.org", "wikidata.org")
BLOG = ("note.com", "hatenablog.com", "hatenablog.jp", "ameblo.jp", "fc2.com", "livedoor.jp", "blog.jp", "seesaa.net", "exblog.jp", "medium.com", "wordpress.com", "blogspot.com", "goo.ne.jp", "togetter.com", "matome.eternalcollegest.com")
SNS = ("x.com", "twitter.com", "bsky.app", "mstdn.jp", "fedibird.com", "reddit.com", "5ch.net", "2ch.sc", "facebook.com", "instagram.com", "threads.net", "tiktok.com", "youtube.com", "nicovideo.jp", "girlschannel.net", "yahoo.co.jp/chiebukuro", "chiebukuro.yahoo.co.jp")
ACADEMIC = ("jstage.jst.go.jp", "cir.nii.ac.jp", "doi.org", "arxiv.org", "pubmed.ncbi.nlm.nih.gov", "researchmap.jp", "nature.com", "science.org")


def host_of(url):
    try:
        h = urllib.parse.urlsplit(url if "://" in url else "http://" + url).hostname or ""
    except Exception:
        h = ""
    return h.lower()


def registrable(host):
    """登録可能ドメイン（example.co.jp / example.com）。二段 TLD を簡易に扱う。"""
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in ("co", "or", "ne", "ac", "ad", "ed", "go", "gr", "lg", "com", "net", "org", "gov", "edu") and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def domain_class(host):
    h = host.lower()
    if any(h == n or h.endswith("." + n) for n in NEWS):
        return "news"
    if any(h.endswith(x) for x in GOV) or re.search(r"(^|\.)(pref|city|town|vill|metro)\.[\w-]+(\.[\w-]+)?\.jp$", h):
        return "gov"
    if any(h.endswith(x) for x in EDU):
        return "edu"
    if any(h == n or h.endswith("." + n) for n in WIKI):
        return "wiki"
    if any(h == n or h.endswith("." + n) for n in ACADEMIC):
        return "academic"
    if any(h == n or h.endswith("." + n) for n in SNS):
        return "sns"
    if any(h == n or h.endswith("." + n) for n in BLOG):
        return "blog"
    if any(h.endswith(x) for x in ORG):
        return "org"
    if h.endswith(".co.jp") or h.endswith(".jp") or h.endswith(".com") or h.endswith(".net"):
        return "corp"
    return "other"


def dns(host):
    out = {}
    for t in ("A", "AAAA", "MX", "NS", "TXT"):
        d = http.json_get(f"https://dns.google/resolve?name={host}&type={t}", timeout=15)
        out[t] = [a.get("data") for a in (d or {}).get("Answer", []) if a.get("type") in (1, 28, 15, 2, 16)]
    return out


def rdap(domain):
    d = http.json_get(f"https://rdap.org/domain/{domain}", timeout=20)
    if d and d.get("objectClassName") == "domain":
        ev = {e.get("eventAction"): e.get("eventDate") for e in d.get("events", [])}
        reg = None
        for ent in d.get("entities", []):
            if "registrar" in (ent.get("roles") or []):
                for v in (ent.get("vcardArray") or [None, []])[1]:
                    if v and v[0] == "fn":
                        reg = v[3]
        return {"source": "rdap", "registered": ev.get("registration"), "expires": ev.get("expiration"), "updated": ev.get("last changed"), "registrar": reg, "status": d.get("status"), "nameservers": [n.get("ldhName") for n in d.get("nameservers", [])]}
    if domain.endswith(".jp"):
        s, md = http.jina(f"https://whois.jprs.jp/?key={urllib.parse.quote(domain)}&type=DOM")
        if s == 200:
            g = lambda k: ((re.search(rf"\[{k}\][ \t]*([^\n]+)", md) or [None, None])[1] or "").strip() or None
            return {"source": "jprs", "registered": g("登録年月日") or g("Registered Date") or g("接続年月日") or g("Connected Date"), "updated": g("最終更新") or g("Last Update"), "registrant": g("Registrant") or g("組織名") or g("Organization"), "status": g("状態") or g("State"), "nameservers": [re.sub(r"\[([^\]]+)\]\(.*?\)", r"\1", x) for x in re.findall(r"\[(?:Name Server|ネームサーバ)\][ \t]*(\S+)", md)]}
    return {"source": None}


def crtsh(domain, n=50):
    d = http.json_get(f"https://crt.sh/?q=%25.{domain}&output=json", timeout=40)
    names = set()
    for r in d or []:
        for nm in (r.get("name_value") or "").split("\n"):
            nm = nm.strip().lower()
            if nm and not nm.startswith("*") and nm.endswith(domain):
                names.add(nm)
    return sorted(names)[:n]


def hackertarget(domain):
    out = {}
    s, t, _u = http.text(f"https://api.hackertarget.com/hostsearch/?q={domain}", timeout=20)
    out["hosts"] = [l.split(",")[0] for l in t.splitlines() if "," in l and "error" not in l.lower()][:50] if s == 200 else []
    s, t, _u = http.text(f"https://api.hackertarget.com/geoip/?q={domain}", timeout=20)
    if s == 200 and "error" not in t.lower():
        out["geoip"] = dict(re.findall(r"(\w+): ([^\n]+)", t))
    return out


def wayback(host):
    out = {}
    d = http.json_get(f"https://archive.org/wayback/available?url={host}&timestamp=19960101", timeout=20)
    c = (d or {}).get("archived_snapshots", {}).get("closest", {})
    if c.get("timestamp"):
        out["first"] = c["timestamp"][:8]; out["first_url"] = c.get("url")
    d = http.json_get(f"https://archive.org/wayback/available?url={host}", timeout=20)
    c = (d or {}).get("archived_snapshots", {}).get("closest", {})
    if c.get("timestamp"):
        out["last"] = c["timestamp"][:8]; out["last_url"] = c.get("url")
    if out.get("first"):
        y = int(out["first"][:4]); m = int(out["first"][4:6]); dd = int(out["first"][6:8])
        out["age_days"] = (datetime.date.today() - datetime.date(y, m, dd)).days
    return out


def urlscan(domain, n=5):
    d = http.json_get(f"https://urlscan.io/api/v1/search/?q=domain:{domain}&size={n}", timeout=20)
    return [{"url": r.get("page", {}).get("url"), "time": r.get("task", {}).get("time"), "ip": r.get("page", {}).get("ip"), "server": r.get("page", {}).get("server"), "result": r.get("result")} for r in (d or {}).get("results", [])]


def wiki_cites(domain, lang="ja"):
    d = http.json_get(f"https://{lang}.wikipedia.org/w/api.php?action=query&list=exturlusage&euquery={domain}&euprotocol=https&eulimit=500&format=json&eunamespace=0", timeout=12, retries=0)
    n = len((d or {}).get("query", {}).get("exturlusage", []))
    d2 = http.json_get(f"https://{lang}.wikipedia.org/w/api.php?action=query&list=exturlusage&euquery={domain}&euprotocol=http&eulimit=500&format=json&eunamespace=0", timeout=12, retries=0) if d is not None else None
    n += len((d2 or {}).get("query", {}).get("exturlusage", []))
    return n if (d or d2) else None


def headers(host):
    s, b, u, h = http.get(f"https://{host}/", timeout=15)
    hl = {k.lower(): v for k, v in h.items()}
    keys = ("server", "strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy")
    return {"status": s, "https": s > 0, "final_url": u, **{k: hl.get(k) for k in keys}, "security_score": sum(1 for k in keys[1:] if hl.get(k))}


def robots(host):
    s, t, _u = http.text(f"https://{host}/robots.txt", timeout=10)
    sm = re.findall(r"(?i)^sitemap:\s*(\S+)", t, re.M) if s == 200 else []
    dis = len(re.findall(r"(?i)^disallow:", t, re.M)) if s == 200 else 0
    return {"exists": s == 200, "sitemaps": sm[:10], "disallow_rules": dis}


def profile(target, parts=("dns", "rdap", "crtsh", "hackertarget", "wayback", "urlscan", "wiki_cites", "headers", "robots")):
    host = host_of(target)
    dom = registrable(host)
    bare = host[4:] if host.startswith("www.") else host
    out = {"host": host, "domain": dom, "class": domain_class(bare), "checked": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"}
    fns = {"dns": lambda: dns(host), "rdap": lambda: rdap(dom), "crtsh": lambda: crtsh(dom), "hackertarget": lambda: hackertarget(dom), "wayback": lambda: wayback(bare),
           "urlscan": lambda: urlscan(dom), "wiki_cites": lambda: wiki_cites(dom), "headers": lambda: headers(host), "robots": lambda: robots(host)}
    for p in parts:
        try:
            out[p] = fns[p]()
        except Exception as e:
            out[p] = {"error": str(e)[:120]}
    return out
