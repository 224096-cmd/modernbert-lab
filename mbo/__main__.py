"""コマンド:
  python -m mbo collect "トピック" [--engines ddg,bing,...] [--dorks exact,pdf,...] [--read 24]
  python -m mbo verify  "主張"
  python -m mbo recon   example.com
  python -m mbo watch   [watch.yaml]         # 定期実行（GitHub Actions が呼ぶ）
  python -m mbo search  "検索式" [--engines ...]   # 収集だけ（判定なし、確認用）
  python -m mbo sources                       # 使える情報源の一覧
  python -m mbo rescore                       # 保存済み結果を再判定（パラメータ・モデル変更後）
"""
import sys, json, argparse
from . import pipeline, sources, engines, http


def main(argv=None):
    ap = argparse.ArgumentParser(prog="mbo")
    sub = ap.add_subparsers(dest="cmd")
    c = sub.add_parser("collect"); c.add_argument("topic"); c.add_argument("--engines"); c.add_argument("--dorks"); c.add_argument("--read", type=int); c.add_argument("--per", type=int); c.add_argument("--domain")
    v = sub.add_parser("verify"); v.add_argument("claim"); v.add_argument("--engines"); v.add_argument("--read", type=int)
    r = sub.add_parser("recon"); r.add_argument("target")
    w = sub.add_parser("watch"); w.add_argument("path", nargs="?")
    s = sub.add_parser("search"); s.add_argument("query"); s.add_argument("--engines", default="ddg,bing,yahoo,gnews"); s.add_argument("--n", type=int, default=8)
    sub.add_parser("sources")
    sub.add_parser("rescore", help="保存済みトピックを現在のパラメータ・モデルで再判定")
    a = ap.parse_args(argv)
    if a.cmd == "collect":
        opt = {"engines": a.engines.split(",") if a.engines else None, "dorks": a.dorks.split(",") if a.dorks else None, "read_bodies": a.read, "per_engine": a.per, "domain": a.domain}
        pipeline.run_topic(a.topic, {k: v for k, v in opt.items() if v is not None})
    elif a.cmd == "verify":
        opt = {"engines": a.engines.split(",") if a.engines else None, "read_bodies": a.read}
        pipeline.run_verify(a.claim, {k: v for k, v in opt.items() if v is not None})
    elif a.cmd == "recon":
        pipeline.run_recon(a.target)
    elif a.cmd == "watch":
        pipeline.run_watch(a.path)
    elif a.cmd == "search":
        for e in a.engines.split(","):
            rs = sources.run(e, a.query, n=a.n)
            print(f"== {e} ({len(rs)})")
            for x in rs:
                print(f"  {x.get('published') or '----------'}  {x['title'][:50]}\n      {x['url'][:100]}")
    elif a.cmd == "rescore":
        pipeline.rescore()
    elif a.cmd == "sources":
        for k, v in sources.ALL.items():
            print(f"{k:10s} {v['kind']:7s} {v['label']:22s} {v['note']}")
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
