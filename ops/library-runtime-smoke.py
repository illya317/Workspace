#!/usr/bin/env python3
from __future__ import annotations

import importlib
import importlib.metadata
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

import pymupdf


REQUIRED_MODULES = {
    "docling": "docling",
    "paddleocr": "paddleocr",
    "paddle": "paddlepaddle",
    "pdfplumber": "pdfplumber",
    "pypdf": "pypdf",
    "pymupdf": "pymupdf",
}


def require_command(name: str) -> str:
    command = shutil.which(name)
    if command is None:
        raise RuntimeError(f"missing command: {name}")
    return command


def run(*args: str, capture: bool = False) -> str:
    result = subprocess.run(
        args,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
        env={**os.environ, "PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK": "True"},
    )
    return result.stdout or ""


def verify_python_modules() -> None:
    for module_name, distribution_name in REQUIRED_MODULES.items():
        importlib.import_module(module_name)
        print(f"{distribution_name}={importlib.metadata.version(distribution_name)}")


def create_image_only_pdf(path: Path) -> None:
    source = pymupdf.open()
    page = source.new_page(width=612, height=792)
    page.insert_textbox(
        pymupdf.Rect(72, 96, 540, 420),
        "Workspace OCR smoke 123\n"
        "Document processing runtime validation\n"
        "Searchable PDF text layer verification\n"
        "Tesseract English recognition sample\n"
        "Page orientation and deskew check",
        fontsize=24,
        lineheight=1.5,
    )
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(3, 3), alpha=False)

    scan = pymupdf.open()
    scan_page = scan.new_page(width=612, height=792)
    scan_page.insert_image(scan_page.rect, pixmap=pixmap)
    scan.save(path)
    scan.close()
    source.close()


def main() -> None:
    verify_python_modules()
    ocrmypdf = require_command("ocrmypdf")
    qpdf = require_command("qpdf")
    require_command("gs")
    pdftotext = require_command("pdftotext")
    require_command("pdfinfo")

    with tempfile.TemporaryDirectory(prefix="workspace-library-smoke-") as temp_dir:
        root = Path(temp_dir)
        scan_pdf = root / "scan.pdf"
        searchable_pdf = root / "searchable.pdf"
        text_path = root / "searchable.txt"
        create_image_only_pdf(scan_pdf)

        run(
            ocrmypdf,
            "--output-type",
            "pdf",
            "--language",
            "eng",
            "--rotate-pages",
            "--deskew",
            str(scan_pdf),
            str(searchable_pdf),
        )
        run(qpdf, "--check", str(searchable_pdf))
        run(pdftotext, str(searchable_pdf), str(text_path))
        extracted = " ".join(text_path.read_text(errors="replace").split()).lower()
        if "workspace" not in extracted or "123" not in extracted:
            raise RuntimeError(f"OCR smoke text mismatch: {extracted!r}")
        page_info = run("pdfinfo", str(searchable_pdf), capture=True)
        if "Pages:" not in page_info:
            raise RuntimeError("pdfinfo did not report a page count")

    print("Library OCR/PDF runtime smoke passed.")


if __name__ == "__main__":
    main()
