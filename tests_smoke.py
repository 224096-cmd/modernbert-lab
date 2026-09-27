"""ネットに出ない動作確認：モデルの読み込みと判定関数。  python tests_smoke.py"""
import numpy as np
from mbo import models, judge, dorks
e = models.embedder(); n = models.nli()
v = e.encode(["関東地方で地震があった", "関東地方で地震が発生した", "今日はカレー"], "")
assert v[0] @ v[1] > v[0] @ v[2], "埋め込みの類似が不自然"
p = n.predict(["東京タワーは港区にある。", "ピッツァが4等分されて置いてある。"], ["東京タワーは東京都にある。", "ピッツァが飛んでいる。"])
print("nli", np.round(p, 2))
assert p[1].argmax() == 2, "矛盾を検出できない"
items = [{"url": "https://www.mhlw.go.jp/x", "title": "厚生労働省が熱中症対策の指針を公表した", "snippet": "厚生労働省は27日、職場での熱中症対策に関する指針を公表した。", "text": "厚生労働省は27日、職場での熱中症対策に関する指針を公表した。"},
         {"url": "https://example.com/y", "title": "熱中症対策の指針が出た", "snippet": "27日、厚労省から職場の熱中症対策指針が公表された。", "text": "27日、厚労省から職場の熱中症対策指針が公表された。"}]
judge.score_items(items, {}, emb=e, nli=n)
print([(i["grade"], i["reliability"], i["s_corr"]) for i in items])
print(dorks.build("テスト")[:2])
print("ok")
