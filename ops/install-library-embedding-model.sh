#!/usr/bin/env bash
set -euo pipefail

MODEL_ID="${LIBRARY_EMBEDDING_MODEL:-Qwen/Qwen3-Embedding-0.6B}"
MODEL_REVISION="${LIBRARY_EMBEDDING_MODEL_REVISION:-master}"
VENV_DIR="${LIBRARY_WORKER_VENV_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/workspace-library/venv}"
MODEL_DIR="${LIBRARY_EMBEDDING_MODEL_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/workspace-library/models/Qwen3-Embedding-0.6B}"
MODE="install"

usage() {
  cat <<'EOF'
Usage: ops/install-library-embedding-model.sh [--check] [--venv DIR] [--model-dir DIR]

Installs the pinned Qwen3 embedding runtime and model, then runs a Chinese
semantic-similarity smoke test. Re-running the command reuses existing files.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --venv) shift; VENV_DIR="${1:?--venv requires a directory}" ;;
    --model-dir) shift; MODEL_DIR="${1:?--model-dir requires a directory}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[error] unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

PYTHON="$VENV_DIR/bin/python"
if [ ! -x "$PYTHON" ]; then
  echo "[error] missing library worker venv: $VENV_DIR"
  exit 1
fi

if [ "$MODE" = "install" ]; then
  echo "==> Installing Qwen embedding Python runtime"
  PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_INPUT=1 "$PYTHON" -m pip install \
    "sentence-transformers==5.6.0" \
    "modelscope==1.38.1"
  mkdir -p "$MODEL_DIR"
  echo "==> Downloading $MODEL_ID@$MODEL_REVISION to $MODEL_DIR"
  MODEL_ID="$MODEL_ID" MODEL_REVISION="$MODEL_REVISION" MODEL_DIR="$MODEL_DIR" \
    "$PYTHON" - <<'PY'
import os
from modelscope.hub.snapshot_download import snapshot_download

snapshot_download(
    model_id=os.environ["MODEL_ID"],
    revision=os.environ["MODEL_REVISION"],
    local_dir=os.environ["MODEL_DIR"],
)
PY
fi

echo "==> Checking Qwen embedding model on CPU"
MODEL_DIR="$MODEL_DIR" MODEL_ID="$MODEL_ID" MODEL_REVISION="$MODEL_REVISION" \
  "$PYTHON" - <<'PY'
import json
import os
import numpy as np
from sentence_transformers import SentenceTransformer

model_dir = os.environ["MODEL_DIR"]
model = SentenceTransformer(model_dir, device="cpu")
query = model.encode(
    ["检索与药品生产质量管理相关的资料"],
    prompt_name="query",
    normalize_embeddings=True,
)
documents = model.encode(
    ["药品生产质量管理规范及质量控制要求", "员工食堂每周菜单"],
    normalize_embeddings=True,
)
scores = (query @ documents.T)[0]
if query.shape != (1, 1024):
    raise RuntimeError(f"unexpected embedding shape: {query.shape}")
if not np.isfinite(query).all() or float(scores[0]) <= float(scores[1]):
    raise RuntimeError(f"semantic smoke test failed: {scores.tolist()}")
print(json.dumps({
    "model": os.environ["MODEL_ID"],
    "revision": os.environ["MODEL_REVISION"],
    "device": "cpu",
    "dimensions": int(query.shape[1]),
    "relevant_score": round(float(scores[0]), 4),
    "irrelevant_score": round(float(scores[1]), 4),
}, ensure_ascii=False))
PY

du -sh "$MODEL_DIR"
