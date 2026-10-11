"""環境確認：GPU・ライブラリ・小さな学習ステップ。失敗箇所がそのまま直すべき場所。  python research/env_check.py"""
import sys, time, importlib
print("python", sys.version.split()[0])
for name in ["torch", "transformers", "datasets", "sentence_transformers", "onnx", "onnxruntime", "accelerate"]:
    try: print(f"{name:22s}", importlib.import_module(name).__version__)
    except Exception as e: print(f"{name:22s} NG  {str(e)[:60]}")
import torch
print("cuda available:", torch.cuda.is_available())
if torch.cuda.is_available():
    p = torch.cuda.get_device_properties(0); print("gpu:", p.name, f"{p.total_memory / 2**30:.1f} GB", "bf16:", torch.cuda.is_bf16_supported(), "cuda", torch.version.cuda)
    x = torch.randn(4096, 4096, device="cuda"); torch.cuda.synchronize(); t = time.time(); [x @ x for _ in range(10)]; torch.cuda.synchronize(); print(f"matmul 4096x4096 x10: {time.time() - t:.2f}s")
from transformers import AutoTokenizer, AutoModelForSequenceClassification
tok = AutoTokenizer.from_pretrained("sbintuitions/modernbert-ja-30m"); m = AutoModelForSequenceClassification.from_pretrained("sbintuitions/modernbert-ja-30m", num_labels=3)
dev = "cuda" if torch.cuda.is_available() else "cpu"; m.to(dev)
e = tok(["総務省は人口推計を公表した。"] * 8, ["人口推計が公表された。"] * 8, padding=True, return_tensors="pt").to(dev); e["labels"] = torch.zeros(8, dtype=torch.long, device=dev)
t = time.time(); out = m(**e); out.loss.backward(); print(f"1 step (bs=8) on {dev}: {time.time() - t:.2f}s  loss {out.loss.item():.3f}")
print("OK")
