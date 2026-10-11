# 学習環境（WSL2 + eGPU RTX 3060）要約版

詳細な手順書（レビュー・データセット一覧・トラブル対処つき）は研究ノートの「FactCheck-BERT 学習環境の構築と実験手順書」。ここでは打つコマンドだけ。

## Windows（PowerShell 管理者）
```powershell
nvidia-smi                      # RTX 3060 / 12288MiB が出ること
wsl --install -d Ubuntu-24.04   # 既にあれば: wsl --update ; wsl --set-default-version 2
```
`C:\Users\<name>\.wslconfig`（任意）: `[wsl2]` / `memory=10GB` / `swap=8GB` → `wsl --shutdown`

## Ubuntu
```bash
nvidia-smi                                      # ここでも見えること（Ubuntu にドライバは入れない）
sudo apt update && sudo apt install -y git python3-venv python3-pip build-essential curl unzip
cd ~ && git clone https://github.com/224096-cmd/modernbert-lab.git && cd modernbert-lab
python3 -m venv .venv && source .venv/bin/activate && python -m pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cu126
pip install -r requirements.txt -r requirements-train.txt
python research/env_check.py                    # OK と cuda が出れば完成
```
VS Code：拡張「WSL」を入れ、Ubuntu で `code .`。

## 実験
```bash
python research/prepare_data.py --out data       # データ（JAD-AFC, JNLI+JaNLI+JSICK, livedoor/Wikipedia/WRIME）
OUT=~/fcb bash research/run_all.sh | tee results/run_all.log   # 基準 → 学習 → 評価 → ONNX
```
個別の手順と設定値は `research/README.md` と `research/run_all.sh` を参照。完成モデルは `models/fcb-*` に置いて push するとサイトの「モデル」タブに並ぶ。

## 注意
- 学習の保存先は WSL 内（`~/fcb`）。外付け SSD（`/mnt/d`）は完成モデルのコピー・バックアップ用
- リポジトリは WSL 内に clone（`/mnt/c` 配下は遅い）
- ruri-base / ruri-v2 は BERT 系。ModernBERT は `sbintuitions/modernbert-ja-*` と `cl-nagoya/ruri-v3-*`
