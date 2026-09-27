"""ネットに出ない動作確認：モデルの読み込みと判定関数。  python tests_smoke.py"""
import numpy as np
from mbo import models, judge, dorks
e = models.embedder(); n = models.nli()
v = e.encode(["三重県で地震があった", "三重県で地震が発生した", "今日はカレー"], "")
assert v[0] @ v[1] > v[0] @ v[2], "埋め込みの類似が不自然"
p = n.predict(["三重大学は津市にある。", "ピッツァが4等分されて置いてある。"], ["三重大学は三重県にある。", "ピッツァが飛んでいる。"])
print("nli", np.round(p, 2))
assert p[1].argmax() == 2, "矛盾を検出できない"
items = [{"url": "https://www.jma.go.jp/x", "title": "気象庁は臨時情報を発表した", "snippet": "気象庁は27日、南海トラフ地震臨時情報（調査中）を発表した。", "text": "気象庁は27日、南海トラフ地震臨時情報（調査中）を発表した。"},
         {"url": "https://example.com/y", "title": "臨時情報が出た", "snippet": "27日、気象庁から南海トラフ地震臨時情報が発表された。", "text": "27日、気象庁から南海トラフ地震臨時情報が発表された。"}]
judge.score_items(items, {}, emb=e, nli=n)
print([(i["grade"], i["reliability"], i["s_corr"]) for i in items])
print(dorks.build("テスト")[:2])
print("ok")
