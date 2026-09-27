"""Dorks（検索演算子を組み合わせた検索式）の自動生成。

Google に限らず DuckDuckGo / Bing / Yahoo! JAPAN が解釈する演算子だけを使う：
  "…"（完全一致） site: -site: filetype: intitle: inurl: OR -語
Google 固有（after: before: AROUND()）は使わない。動画で紹介される「Google Hacking」の使い方のうち、
公開情報の収集・検証に役立つものだけをテンプレート化している（パスワードや個人情報を探す式は含めない）。
"""
import re

TEMPLATES = {
    # 名前: (説明, 式のテンプレ, 既定で使うか)
    "official_jp": ("公的機関・大学の発表", '{q} (site:go.jp OR site:lg.jp OR site:ac.jp)', True),
    "news_pr": ("報道・プレスリリース", '{q} (site:prtimes.jp OR site:nhk.or.jp OR site:nikkei.com OR site:asahi.com OR site:yomiuri.co.jp OR site:mainichi.jp)', True),
    "pdf": ("PDF 文書（報告書・通知）", '{q} filetype:pdf', True),
    "title": ("見出しに語を含むページ", 'intitle:"{q}"', False),
    "exact": ("完全一致", '"{q}"', True),
    "factcheck": ("ファクトチェック記事", '{q} (site:fij.info OR site:factcheckcenter.jp OR site:infact.press OR site:litera.com OR "ファクトチェック")', True),
    "deny": ("否定・訂正・デマ指摘", '{q} (デマ OR 誤り OR 訂正 OR 事実無根 OR "根拠がない")', True),
    "primary": ("一次資料（資料・統計・議事録）", '{q} (統計 OR 議事録 OR 報告書 OR 公示 OR 告示) (site:go.jp OR site:lg.jp OR filetype:pdf OR filetype:xlsx)', False),
    "sns": ("SNS・掲示板の反応", '{q} (site:x.com OR site:twitter.com OR site:bsky.app OR site:mstdn.jp OR site:reddit.com OR site:5ch.net)', False),
    "blog": ("個人ブログ・まとめ", '{q} (site:note.com OR site:hatenablog.com OR site:ameblo.jp OR site:togetter.com)', False),
    "video": ("動画", '{q} (site:youtube.com OR site:nicovideo.jp)', False),
    "academic": ("学術（論文・学会）", '{q} (site:jstage.jst.go.jp OR site:cir.nii.ac.jp OR site:researchmap.jp OR filetype:pdf 論文)', False),
    "exclude_noise": ("ノイズ除去（まとめ・広告）", '{q} -site:matome.naver.jp -site:togetter.com -"PR" -広告', False),
    "domain_docs": ("特定ドメインの文書一覧", 'site:{domain} (filetype:pdf OR filetype:doc OR filetype:docx OR filetype:xlsx OR filetype:pptx)', False),
    "domain_pages": ("特定ドメインのページ", 'site:{domain} {q}', False),
    "domain_mentions": ("他サイトからの言及", '"{domain}" -site:{domain}', False),
    "domain_subs": ("サブドメイン探索", 'site:*.{domain} -site:www.{domain}', False),
}


def build(q, names=None, domain=None):
    """トピック q（とドメイン）から Dorks の一覧 [{name,label,query}] を作る。"""
    q = q.strip()
    out = []
    for name, (label, tpl, default) in TEMPLATES.items():
        if names is not None and name not in names:
            continue
        if names is None and not default:
            continue
        if "{domain}" in tpl and not domain:
            continue
        if "{q}" in tpl and not q:
            continue
        out.append({"name": name, "label": label, "query": tpl.replace("{q}", q).replace("{domain}", domain or "")})
    return out


def parse(query):
    """検索式を分解して表示用に返す（演算子ごとの説明）。"""
    parts = []
    for tok in re.findall(r'"[^"]+"|\S+', query):
        kind = "語"
        if tok.startswith("site:"): kind = "サイト限定"
        elif tok.startswith("-site:"): kind = "サイト除外"
        elif tok.startswith("filetype:"): kind = "ファイル種別"
        elif tok.startswith("intitle:"): kind = "見出し"
        elif tok.startswith("inurl:"): kind = "URL"
        elif tok.startswith("-"): kind = "除外"
        elif tok.startswith('"'): kind = "完全一致"
        elif tok == "OR": kind = "または"
        parts.append({"token": tok, "kind": kind})
    return parts


def normalize_for(engine, query):
    """エンジンごとの癖を吸収（DDG は after:/before: 非対応など）。"""
    q = re.sub(r"\s(after|before):\S+", "", query)
    if engine == "ddg":
        q = re.sub(r"\(|\)", "", q)  # DDG は括弧を無視するため取り除く
    return q.strip()
