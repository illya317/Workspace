#!/usr/bin/env python3
"""Generate one size-optimized preview PDF plus its thumbnail."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def run(command: list[str]) -> None:
    subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def qpdf_check(pdf_path: Path) -> bool:
    result = subprocess.run(
        ["qpdf", "--check", str(pdf_path)],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode == 2:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"qpdf check failed: {detail}")
    if result.returncode not in {0, 3}:
        raise RuntimeError(f"qpdf check returned unexpected status {result.returncode}")
    return result.returncode == 3


def qpdf_linearize(source: Path, output: Path) -> bool:
    result = subprocess.run(
        ["qpdf", "--linearize", str(source), str(output)],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode == 2 or not output.is_file():
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"qpdf linearize failed: {detail}")
    if result.returncode not in {0, 3}:
        raise RuntimeError(f"qpdf linearize returned unexpected status {result.returncode}")
    return result.returncode == 3


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def artifact(path: Path, kind: str, mime_type: str, page_count: int | None = None) -> dict[str, Any]:
    return {
        "kind": kind,
        "fileName": path.name,
        "mimeType": mime_type,
        "fileSizeBytes": path.stat().st_size,
        "checksumSha256": sha256(path),
        "pageCount": page_count,
    }


def to_pdf(input_path: Path, work_dir: Path) -> Path:
    suffix = input_path.suffix.lower()
    if suffix == ".pdf":
        return input_path
    if suffix in {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"}:
        from PIL import Image

        output = work_dir / "source-converted.pdf"
        with Image.open(input_path) as image:
            image.convert("RGB").save(output, "PDF", resolution=150.0)
        return output
    office_input = input_path
    if suffix == ".md":
        office_input = work_dir / f"{input_path.stem}.txt"
        office_input.write_text(input_path.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
        suffix = ".txt"
    if suffix in {".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf", ".csv", ".tsv", ".txt", ".html", ".htm"}:
        converted_dir = work_dir / "libreoffice"
        converted_dir.mkdir()
        run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(converted_dir), str(office_input)])
        candidates = list(converted_dir.glob("*.pdf"))
        if len(candidates) != 1:
            raise RuntimeError("LibreOffice did not produce exactly one PDF")
        return candidates[0]
    raise ValueError(f"preview unsupported for extension: {suffix or '(none)'}")


def page_count(pdf_path: Path) -> int:
    from pypdf import PdfReader

    return len(PdfReader(str(pdf_path)).pages)


def visual_rms(original: Path, candidate: Path) -> float:
    import fitz
    from PIL import Image, ImageChops, ImageStat

    original_doc = fitz.open(original)
    candidate_doc = fitz.open(candidate)
    indexes = sorted({0, max(0, len(original_doc) // 2), max(0, len(original_doc) - 1)})
    values: list[float] = []
    matrix = fitz.Matrix(100 / 72, 100 / 72)
    for index in indexes:
        left_pix = original_doc[index].get_pixmap(matrix=matrix, alpha=False)
        right_pix = candidate_doc[index].get_pixmap(matrix=matrix, alpha=False)
        left = Image.frombytes("RGB", (left_pix.width, left_pix.height), left_pix.samples)
        right = Image.frombytes("RGB", (right_pix.width, right_pix.height), right_pix.samples)
        if left.size != right.size:
            return 255.0
        stat = ImageStat.Stat(ImageChops.difference(left, right))
        values.append(sum(value * value for value in stat.rms) ** 0.5 / len(stat.rms))
    return sum(values) / len(values)


def make_thumbnail(preview_pdf: Path, output_path: Path) -> None:
    prefix = output_path.with_suffix("")
    run(["pdftoppm", "-f", "1", "-singlefile", "-png", "-r", "120", str(preview_pdf), str(prefix)])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--input-checksum", required=True)
    parser.add_argument("--preview-version", default="v1")
    parser.add_argument("--skip-compression", action="store_true")
    parser.add_argument("--skip-thumbnail", action="store_true")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    if not input_path.is_file() or sha256(input_path) != args.input_checksum:
        raise ValueError("input missing or checksum mismatch")
    if output_dir.exists():
        raise FileExistsError(f"output directory already exists: {output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    temporary_dir = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}-", dir=output_dir.parent))
    try:
        source_pdf = to_pdf(input_path, temporary_dir)
        preview_path = temporary_dir / "preview.pdf"
        linearize_warning = qpdf_linearize(source_pdf, preview_path)
        preview_warning = qpdf_check(preview_path) or linearize_warning
        pages = page_count(preview_path)
        warnings: list[str] = []
        if preview_warning:
            warnings.append("preview_qpdf_warning")
        candidate_path = temporary_dir / "compressed-candidate.pdf"
        if args.skip_compression:
            candidate_warning = False
            savings_ratio = 0.0
            rms = 0.0
            text_matches = True
            compression_retained = False
            warnings.append("compression_skipped")
        else:
            run([
                "gs", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.7", "-dPDFSETTINGS=/ebook",
                "-dDetectDuplicateImages=true", "-dNOPAUSE", "-dQUIET", "-dBATCH",
                f"-sOutputFile={candidate_path}", str(source_pdf),
            ])
            candidate_warning = qpdf_check(candidate_path)
            savings_ratio = 1 - candidate_path.stat().st_size / source_pdf.stat().st_size
            candidate_pages = page_count(candidate_path)
            passes_fast_gate = not candidate_warning and pages == candidate_pages and savings_ratio >= 0.10
            # The preview is a human-reading derivative. Search/RAG Markdown is
            # extracted from the electronic raw before that temporary input is
            # deleted, so preview retention must not depend on its text layer.
            text_matches = None
            rms = visual_rms(source_pdf, candidate_path) if passes_fast_gate else 255.0
            compression_retained = passes_fast_gate and rms <= 18
            if candidate_warning:
                warnings.append("compression_qpdf_warning")
        if compression_retained:
            preview_path.unlink()
            candidate_path.rename(preview_path)
        elif candidate_path.exists():
            candidate_path.unlink(missing_ok=True)
            warnings.append("compression_not_retained")

        if source_pdf != input_path and source_pdf != preview_path:
            source_pdf.unlink(missing_ok=True)
        shutil.rmtree(temporary_dir / "libreoffice", ignore_errors=True)

        artifacts = [artifact(preview_path, "preview-pdf", "application/pdf", pages)]
        if not args.skip_thumbnail:
            thumbnail_path = temporary_dir / "thumbnail.png"
            make_thumbnail(preview_path, thumbnail_path)
            artifacts.append(artifact(thumbnail_path, "thumbnail", "image/png", 1))
        result = {
            "status": "succeeded",
            "pageCount": pages,
            "compressionRetained": compression_retained,
            "compressionSavingsRatio": savings_ratio,
            "visualRms": rms,
            "textLayerMatches": text_matches,
            "artifacts": artifacts,
            "warnings": warnings,
        }
        (temporary_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary_dir.rename(output_dir)
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        shutil.rmtree(temporary_dir, ignore_errors=True)
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"status": "failed", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise
