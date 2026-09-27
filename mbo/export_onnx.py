"""ModernBERT 系モデルを ONNX（int8 動的量子化）に変換する。GitHub Actions（onnxruntime）とブラウザ（onnxruntime-web）で共用。

  python -m mbo.export_onnx --embed cl-nagoya/ruri-v3-30m --out models/ruri-v3-30m
  python -m mbo.export_onnx --nli models/nli-ja-30m --out models/nli-ja-30m-onnx

出力: model.onnx（fp32）, model_int8.onnx, tokenizer.json, config.json, meta.json
"""
import argparse, json, os, shutil
import torch
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification


class EmbedWrap(torch.nn.Module):
    def __init__(self, m):
        super().__init__(); self.m = m

    def forward(self, input_ids, attention_mask):
        h = self.m(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        mask = attention_mask.unsqueeze(-1).to(h.dtype)
        emb = (h * mask).sum(1) / mask.sum(1).clamp(min=1e-6)
        return torch.nn.functional.normalize(emb, dim=-1)


class ClsWrap(torch.nn.Module):
    def __init__(self, m):
        super().__init__(); self.m = m

    def forward(self, input_ids, attention_mask):
        return self.m(input_ids=input_ids, attention_mask=attention_mask).logits


def quantize_embeddings(path, min_rows=5000):
    """大きな行列（語彙埋め込みなど）を行ごとの int8 + DequantizeLinear に置き換える。30M モデルの 100MB → 30MB。"""
    import onnx, numpy as np
    from onnx import numpy_helper, helper, TensorProto
    m = onnx.load(path)
    g = m.graph
    new_inits, new_nodes, n_done = [], [], 0
    for init in list(g.initializer):
        arr = numpy_helper.to_array(init)
        if arr.dtype != np.float32 or arr.ndim != 2 or arr.shape[0] < min_rows:
            continue
        scale = np.abs(arr).max(axis=1, keepdims=True) / 127.0
        scale[scale == 0] = 1.0
        q = np.clip(np.round(arr / scale), -127, 127).astype(np.int8)
        name = init.name
        g.initializer.remove(init)
        new_inits.append(numpy_helper.from_array(q, name + "_q8"))
        new_inits.append(numpy_helper.from_array(scale.reshape(-1).astype(np.float32), name + "_scale"))
        new_inits.append(numpy_helper.from_array(np.zeros(arr.shape[0], dtype=np.int8), name + "_zp"))
        new_nodes.append(helper.make_node("DequantizeLinear", [name + "_q8", name + "_scale", name + "_zp"], [name], axis=0, name=name + "_dq"))
        n_done += 1
    g.initializer.extend(new_inits)
    for nd in reversed(new_nodes):
        g.node.insert(0, nd)
    onnx.save(m, path)
    print("int8 embeddings:", n_done)


def export(src, out, kind, seq=256):
    os.makedirs(out, exist_ok=True)
    tok = AutoTokenizer.from_pretrained(src)
    if kind == "embed":
        m = AutoModel.from_pretrained(src, attn_implementation="eager"); w = EmbedWrap(m); outname = "embedding"
    else:
        m = AutoModelForSequenceClassification.from_pretrained(src, attn_implementation="eager"); w = ClsWrap(m); outname = "logits"
    m.eval()
    enc = tok(["東京は日本の首都である。", "ModernBERT は長い文脈を速く読める双方向のエンコーダである。"], padding=True, return_tensors="pt")
    with torch.no_grad():
        ref = w(enc["input_ids"], enc["attention_mask"])
    torch.onnx.export(w, (enc["input_ids"], enc["attention_mask"]), os.path.join(out, "model.onnx"), input_names=["input_ids", "attention_mask"], output_names=[outname],
                      dynamic_axes={"input_ids": {0: "b", 1: "s"}, "attention_mask": {0: "b", 1: "s"}, outname: {0: "b"}}, opset_version=17, do_constant_folding=True, dynamo=False)
    from onnxruntime.quantization import quantize_dynamic, QuantType
    import onnx
    g = onnx.load(os.path.join(out, "model.onnx")).graph
    excl = [n.name for n in g.node if n.op_type == "MatMul" and ("head" in n.name or "classifier" in n.name)]  # 分類ヘッドは int8 にすると logits が崩れるので除外
    quantize_dynamic(os.path.join(out, "model.onnx"), os.path.join(out, "model_int8.onnx"), weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul"], per_channel=True, nodes_to_exclude=excl)
    quantize_embeddings(os.path.join(out, "model_int8.onnx"))
    import onnxruntime as ort, numpy as np
    for f in ("model.onnx", "model_int8.onnx"):
        s = ort.InferenceSession(os.path.join(out, f), providers=["CPUExecutionProvider"])
        y = s.run(None, {"input_ids": enc["input_ids"].numpy(), "attention_mask": enc["attention_mask"].numpy()})[0]
        print(f, os.path.getsize(os.path.join(out, f)) // 1024, "KB  max|diff| vs torch:", float(np.abs(y - ref.numpy()).max()))
    tok.save_pretrained(out)
    for f in ("config.json",):
        try:
            m.config.to_json_file(os.path.join(out, f))
        except Exception:
            pass
    meta = {"kind": kind, "source": src, "output": outname, "pooling": "mean+l2norm" if kind == "embed" else "cls",
            "labels": getattr(m.config, "id2label", None) if kind != "embed" else None, "max_seq": seq,
            "prefixes": {"query": "検索クエリ: ", "doc": "検索文書: ", "topic": "トピック: "} if kind == "embed" else None}
    json.dump(meta, open(os.path.join(out, "meta.json"), "w"), ensure_ascii=False, indent=1)
    os.remove(os.path.join(out, "model.onnx"))  # fp32 は大きい（100MB 超）ので int8 だけ残す
    print("done", out, os.listdir(out))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--embed"); ap.add_argument("--nli"); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    if a.embed:
        export(a.embed, a.out, "embed")
    if a.nli:
        export(a.nli, a.out, "nli")
