"""変換後の meta.json に、ブラウザ側が使う情報（文脈長・prefix・表示名）を書き足す。 python scripts/fix_meta.py"""
import json, os
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
FIX = {
 "ruri-v3-30m": {"max_position": 8192, "prefixes": {"query": "検索クエリ: ", "doc": "検索文書: ", "topic": "トピック: ", "": ""}, "max_seq_browser": 2048, "lang": "ja"},
 "ruri-v3-70m": {"max_position": 8192, "prefixes": {"query": "検索クエリ: ", "doc": "検索文書: ", "topic": "トピック: ", "": ""}, "max_seq_browser": 2048, "lang": "ja"},
 "multilingual-e5-small": {"max_position": 512, "prefixes": {"query": "query: ", "doc": "passage: ", "topic": "query: ", "": "query: "}, "max_seq_browser": 512, "lang": "multi"},
 "nli-ja-30m": {"max_position": 8192, "max_seq_browser": 1024, "lang": "ja", "label_order": [0, 1, 2]},
 "minilm-l6-xnli": {"max_position": 512, "max_seq_browser": 512, "lang": "multi", "label_order": [0, 1, 2]},
 "reranker-ja-xsmall-v2": {"max_position": 8192, "max_seq_browser": 2048, "lang": "ja"},
 "reranker-xsmall-v1": {"max_position": 512, "max_seq_browser": 512, "lang": "multi"},
 "ruri-v3-pt-30m": {"max_position": 8192, "prefixes": {"query": "検索クエリ: ", "doc": "検索文書: ", "topic": "トピック: ", "": ""}, "max_seq_browser": 2048, "lang": "ja"},
 "modernbert-ja-30m-embed": {"max_position": 8192, "prefixes": {"query": "", "doc": "", "topic": "", "": ""}, "max_seq_browser": 2048, "lang": "ja"},
 "nli-ja-70m": {"max_position": 8192, "max_seq_browser": 1024, "lang": "ja", "label_order": [0, 1, 2]},
 "fcb-nli-30m": {"max_position": 8192, "max_seq_browser": 1024, "lang": "ja", "label_order": [0, 1, 2], "display": "FactCheck-BERT（分類型）"},
 "fcb-embed-30m": {"max_position": 8192, "prefixes": {"query": "検索クエリ: ", "doc": "検索文書: ", "topic": "トピック: ", "": ""}, "max_seq_browser": 2048, "lang": "ja", "display": "FactCheck-BERT（埋め込み型）"},
}
for name, fix in FIX.items():
    p = os.path.join(ROOT, name, "meta.json")
    if not os.path.exists(p):
        continue
    m = json.load(open(p, encoding="utf-8")); m.update(fix); m["size_mb"] = round(os.path.getsize(os.path.join(ROOT, name, "model_int8.onnx")) / 1048576, 1)
    json.dump(m, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1); print(name, m["size_mb"], "MB")

# models/<name> をサイトが読む docs/models/<name> に同期する（GitHub Pages は docs/ を配信する）
import shutil
DOCS = os.path.join(os.path.dirname(ROOT), "docs", "models")
for name in FIX:
    src = os.path.join(ROOT, name); dst = os.path.join(DOCS, name)
    if not os.path.isdir(src): continue
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(src):
        a = os.path.join(src, f); b = os.path.join(dst, f)
        if os.path.isfile(a) and (not os.path.exists(b) or os.path.getmtime(a) > os.path.getmtime(b) or os.path.getsize(a) != os.path.getsize(b)):
            shutil.copy2(a, b); print("sync", name, f)

# registry.json もサイト側へコピー（docs/registry.json は実体ファイル）
_src = os.path.join(ROOT, "registry.json"); _dst = os.path.join(os.path.dirname(ROOT), "docs", "registry.json")
if os.path.exists(_src):
    if os.path.islink(_dst): os.remove(_dst)
    shutil.copy2(_src, _dst); print("sync registry.json")
