#!/usr/bin/env python3
import argparse
import json
import math
from pathlib import Path

from sentence_transformers import SentenceTransformer


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate normalized Library embeddings")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--input-json", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--mode", choices=("query", "document"), required=True)
    args = parser.parse_args()

    payload = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
    texts = payload.get("texts")
    if not isinstance(texts, list) or not texts or not all(isinstance(item, str) for item in texts):
        raise RuntimeError("embedding input must contain non-empty texts")

    model = SentenceTransformer(args.model_dir, device="cpu")
    options = {"normalize_embeddings": True, "batch_size": 16, "show_progress_bar": False}
    if args.mode == "query":
        options["prompt_name"] = "query"
    embeddings = model.encode(texts, **options)
    vectors = embeddings.tolist()
    if not vectors or any(not all(math.isfinite(value) for value in vector) for vector in vectors):
        raise RuntimeError("embedding model returned invalid vectors")
    output = {"dimensions": len(vectors[0]), "embeddings": vectors}
    Path(args.output_json).write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
