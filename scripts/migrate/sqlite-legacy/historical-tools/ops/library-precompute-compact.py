#!/usr/bin/env python3
"""Precompute preview PDF + Markdown/layout without mutating the Library DB.

This is an operational staging command for hosts that still run the pre-artifact
schema. Outputs are resumable and can be imported by a later formal migration.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any


PREVIEWABLE = {
    "pdf", "png", "jpg", "jpeg", "tif", "tiff", "webp",
    "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
    "rtf", "csv", "tsv", "txt", "md", "html", "htm",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_file(root: Path, relative_path: str) -> Path:
    resolved = (root / relative_path).resolve()
    if root != resolved and root not in resolved.parents:
        raise ValueError(f"unsafe storage path: {relative_path}")
    if not resolved.is_file():
        raise FileNotFoundError(f"version file missing: {relative_path}")
    return resolved


def read_valid_result(output_dir: Path) -> dict[str, Any] | None:
    result_path = output_dir / "result.json"
    if not result_path.is_file():
        return None
    try:
        result = json.loads(result_path.read_text(encoding="utf-8"))
        for artifact in result.get("artifacts", []):
            artifact_path = output_dir / artifact["fileName"]
            if not artifact_path.is_file():
                return None
            if artifact_path.stat().st_size != int(artifact["fileSizeBytes"]):
                return None
            if sha256(artifact_path) != artifact["checksumSha256"]:
                return None
        return result
    except (KeyError, OSError, ValueError, json.JSONDecodeError):
        return None


def run_worker(command: list[str], timeout_seconds: int) -> None:
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "worker failed").strip()
        raise RuntimeError(detail[-2000:])


def load_versions(db_path: Path, limit: int) -> list[dict[str, Any]]:
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    sql = """
      SELECT d.id AS documentId, d.documentUid, d.docId, d.fileName,
             v.id AS versionId, v.versionUid, v.storagePath, v.checksumSha256,
             lower(COALESCE(v.extension, '')) AS extension
      FROM LibraryDocument d
      JOIN LibraryDocumentVersion v ON v.id = d.currentVersionId
      WHERE d.status = 'active'
      ORDER BY d.docId
    """
    rows = [dict(row) for row in db.execute(sql)]
    db.close()
    return rows[:limit] if limit > 0 else rows


def process_one(
    row: dict[str, Any],
    root: Path,
    output_root: Path,
    python: Path,
    preview_worker: Path,
    process_worker: Path,
) -> dict[str, Any]:
    started = time.monotonic()
    extension = str(row["extension"] or "").lower()
    base = {
        "documentId": row["documentId"],
        "documentUid": row["documentUid"],
        "docId": row["docId"],
        "versionId": row["versionId"],
        "versionUid": row["versionUid"],
        "fileName": row["fileName"],
        "extension": extension,
    }
    if extension not in PREVIEWABLE:
        return {**base, "status": "retained-unsupported", "elapsedSeconds": 0}
    try:
        input_path = safe_file(root, row["storagePath"])
        if not row["checksumSha256"]:
            raise ValueError("version checksum missing")
        if sha256(input_path) != row["checksumSha256"]:
            raise ValueError("version checksum mismatch")

        version_root = output_root / row["documentUid"] / row["versionUid"]
        preview_dir = version_root / "preview-v2-compressed"
        preview = read_valid_result(preview_dir)
        if preview is None:
            shutil.rmtree(preview_dir, ignore_errors=True)
            run_worker([
                str(python), str(preview_worker),
                "--input", str(input_path),
                "--output-dir", str(preview_dir),
                "--input-checksum", row["checksumSha256"],
                "--preview-version", "v2-compressed",
                "--skip-thumbnail",
            ], 30 * 60)
            preview = read_valid_result(preview_dir)
        if preview is None:
            raise RuntimeError("preview result validation failed")
        preview_pdf = next(
            (item for item in preview["artifacts"] if item["kind"] == "preview-pdf"),
            None,
        )
        if preview_pdf is None:
            raise RuntimeError("preview PDF missing from worker result")
        preview_path = preview_dir / preview_pdf["fileName"]

        extract_dir = version_root / "extract-v1.0.1"
        extracted = read_valid_result(extract_dir)
        if extracted is None:
            shutil.rmtree(extract_dir, ignore_errors=True)
            run_worker([
                str(python), str(process_worker),
                "--input", str(preview_path),
                "--output-dir", str(extract_dir),
                "--document-uid", row["documentUid"],
                "--version-uid", row["versionUid"],
                "--input-checksum", preview_pdf["checksumSha256"],
                "--pipeline-version", "v1.0.1",
            ], 30 * 60)
            extracted = read_valid_result(extract_dir)
        if extracted is None:
            raise RuntimeError("Markdown result validation failed")
        kinds = {item["kind"] for item in extracted["artifacts"]}
        if not {"markdown", "layout-json"}.issubset(kinds):
            raise RuntimeError("Markdown/layout artifact missing from worker result")
        return {
            **base,
            "status": "ready",
            "previewBytes": preview_pdf["fileSizeBytes"],
            "markdownBytes": next(item["fileSizeBytes"] for item in extracted["artifacts"] if item["kind"] == "markdown"),
            "elapsedSeconds": round(time.monotonic() - started, 3),
        }
    except Exception as error:  # noqa: BLE001 - batch records per-file failures
        return {
            **base,
            "status": "failed",
            "error": str(error)[-2000:],
            "elapsedSeconds": round(time.monotonic() - started, 3),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--worker-dir", required=True, type=Path)
    parser.add_argument("--python", required=True, type=Path)
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    if args.concurrency < 1 or args.concurrency > 3:
        raise ValueError("--concurrency must be 1..3")
    if args.limit < 0:
        raise ValueError("--limit must be non-negative")

    root = args.root.resolve()
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    preview_worker = args.worker_dir / "library-preview-document.py"
    process_worker = args.worker_dir / "library-process-document.py"
    for required in (args.db, args.python, preview_worker, process_worker):
        if not required.exists():
            raise FileNotFoundError(str(required))

    versions = load_versions(args.db, args.limit)
    progress_path = output_root / "progress.ndjson"
    results: list[dict[str, Any]] = []
    lock = threading.Lock()
    print(json.dumps({"total": len(versions), "concurrency": args.concurrency}, ensure_ascii=False), flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        future_rows = {
            executor.submit(
                process_one,
                row,
                root,
                output_root,
                args.python,
                preview_worker,
                process_worker,
            ): row
            for row in versions
        }
        completed = 0
        for future in concurrent.futures.as_completed(future_rows):
            result = future.result()
            with lock:
                completed += 1
                results.append(result)
                with progress_path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(result, ensure_ascii=False) + "\n")
                print(
                    f"[{completed}/{len(versions)}] {result['status']} {result['fileName']}",
                    flush=True,
                )

    summary = {
        "total": len(results),
        "ready": sum(item["status"] == "ready" for item in results),
        "retainedUnsupported": sum(item["status"] == "retained-unsupported" for item in results),
        "failed": sum(item["status"] == "failed" for item in results),
        "previewBytes": sum(int(item.get("previewBytes", 0)) for item in results),
        "markdownBytes": sum(int(item.get("markdownBytes", 0)) for item in results),
        "finishedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    (output_root / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
