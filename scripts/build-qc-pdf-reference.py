#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

try:
    import fitz
except ModuleNotFoundError as exc:
    raise SystemExit(
        "Missing PyMuPDF (fitz). Please run this script with a Python environment "
        "that has pymupdf installed, or install it with: pip install pymupdf"
    ) from exc

fitz.TOOLS.mupdf_display_errors(False)

HEADING_RE = re.compile(r"^\s*(\d+(?:\.\d+){2,})\s*(.+?)\s*$")
STAGE_RE = re.compile(r"^\s*[一二三四五六七八九十]\s*[、，. ]+\s*(.+?)\s*$")
TOC_STAGE_RE = re.compile(r"^\s*([123])\s+(.+?)[.·]{3,}\s*(\d+)\s*$")
STAGE_KEYWORDS = ("中间体", "待包装品", "成品")
DEFAULT_SCALE = 2.5
DEFAULT_CONTINUATION_TOP = 0.0
DEFAULT_FOOTER_MARGIN = 0.0


@dataclass
class Heading:
    number: str
    title: str
    page_index: int
    y0: float


@dataclass
class Stage:
    product: str
    status: str
    label: str
    page_index: int
    y0: float
    toc_page: int | None = None


@dataclass
class Boundary:
    page_index: int
    y0: float


def default_workspace_dir() -> Path:
    cwd = Path.cwd().resolve()
    for candidate in [cwd, *cwd.parents]:
        sibling = candidate / ".workspace"
        if (sibling / "pdf" / "raw").exists():
            return sibling
    return cwd.parent / ".workspace"


def safe_name(value: str, max_len: int = 120) -> str:
    value = re.sub(r"[\\/:*?\"<>|\s]+", "_", value.strip())
    value = re.sub(r"_+", "_", value).strip("._")
    return value[:max_len] or "untitled"


def clean_generated_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def run_soffice(raw_dir: Path, pdf_dir: Path) -> None:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise SystemExit("Missing soffice/libreoffice; cannot convert docx to PDF.")
    pdf_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(raw_dir.glob("*.docx"))
    if not files:
        raise SystemExit(f"No .docx files found in {raw_dir}")
    cmd = [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(pdf_dir), *map(str, files)]
    subprocess.run(cmd, check=True)


def run_word_pdf_export(raw_dir: Path, pdf_dir: Path) -> None:
    word_app = Path("/Applications/Microsoft Word.app")
    if not word_app.exists():
        raise SystemExit("Missing Microsoft Word.app; use --converter libreoffice if Word is unavailable.")
    files = sorted(raw_dir.glob("*.docx"))
    if not files:
        raise SystemExit(f"No .docx files found in {raw_dir}")
    pdf_dir.mkdir(parents=True, exist_ok=True)
    script = """
on run argv
    set inputPath to item 1 of argv
    set outputPath to item 2 of argv
    tell application "Microsoft Word"
        open POSIX file inputPath
        set theDoc to active document
        save as theDoc file name outputPath file format format PDF
        close theDoc saving no
    end tell
end run
"""
    for source in files:
        output = pdf_dir / f"{source.stem}.pdf"
        temp_output = pdf_dir / f".{source.stem}.word-export.tmp.pdf"
        if temp_output.exists():
            temp_output.unlink()
        subprocess.run(["osascript", "-e", script, str(source), str(temp_output)], check=True)
        temp_output.replace(output)


def convert_docx_to_pdf(raw_dir: Path, pdf_dir: Path, converter: str) -> None:
    if converter == "word":
        run_word_pdf_export(raw_dir, pdf_dir)
        return
    if converter == "libreoffice":
        run_soffice(raw_dir, pdf_dir)
        return
    raise SystemExit(f"Unknown converter: {converter}")


def stage_parts(label: str, fallback_product: str) -> tuple[str, str]:
    compact = re.sub(r"\s+", "", label)
    for status in STAGE_KEYWORDS:
        if status not in compact:
            continue
        product = re.sub(rf"[（(]?\s*{re.escape(status)}\s*[）)]?", "", compact)
        product = product or fallback_product
        return product, status
    return fallback_product, "未分阶段"


def extract_stages(doc: fitz.Document, fallback_product: str) -> list[Stage]:
    stages: list[Stage] = []
    for page_index, page in enumerate(doc):
        for block in page.get_text("blocks"):
            text = " ".join(str(block[4]).split())
            match = STAGE_RE.match(text)
            if not match or not any(keyword in text for keyword in STAGE_KEYWORDS):
                continue
            label = match.group(1)
            product, status = stage_parts(label, fallback_product)
            stages.append(Stage(product=product, status=status, label=label, page_index=page_index, y0=float(block[1])))
    return infer_missing_stages_from_toc(doc, stages, fallback_product=fallback_product)


def extract_toc_stages(doc: fitz.Document, fallback_product: str) -> list[Stage]:
    toc_stages: list[Stage] = []
    for page in list(doc)[:3]:
        for line in (line.strip() for line in page.get_text().splitlines() if line.strip()):
            match = TOC_STAGE_RE.match(line)
            if not match:
                continue
            _, label, toc_page = match.groups()
            if not any(keyword in label for keyword in STAGE_KEYWORDS):
                continue
            product, status = stage_parts(label, fallback_product)
            toc_stages.append(Stage(
                product=product,
                status=status,
                label=label,
                page_index=0,
                y0=0,
                toc_page=int(toc_page),
            ))
    return toc_stages


def infer_missing_stages_from_toc(doc: fitz.Document, stages: list[Stage], fallback_product: str) -> list[Stage]:
    toc_stages = extract_toc_stages(doc, fallback_product=fallback_product)
    if not toc_stages:
        return sorted(stages, key=lambda item: (item.page_index, item.y0))
    by_status = {stage.status: stage for stage in stages}
    known_by_status = {stage.status: stage for stage in stages}
    for toc_stage in toc_stages:
        if toc_stage.status in by_status or toc_stage.toc_page is None:
            continue
        previous_candidates = [
            item for item in toc_stages
            if item.toc_page is not None and item.toc_page < toc_stage.toc_page and item.status in known_by_status
        ]
        if not previous_candidates:
            continue
        previous_toc = max(previous_candidates, key=lambda item: item.toc_page or 0)
        previous_actual = known_by_status[previous_toc.status]
        inferred_page = previous_actual.page_index + (toc_stage.toc_page - (previous_toc.toc_page or toc_stage.toc_page)) - 1
        inferred_page = max(0, min(len(doc) - 1, inferred_page))
        inferred = Stage(
            product=toc_stage.product,
            status=toc_stage.status,
            label=toc_stage.label,
            page_index=inferred_page,
            y0=0,
            toc_page=toc_stage.toc_page,
        )
        by_status[toc_stage.status] = inferred
        known_by_status[toc_stage.status] = inferred
        stages.append(inferred)
    return sorted(stages, key=lambda item: (item.page_index, item.y0))


def extract_headings(doc: fitz.Document, min_depth: int) -> list[Heading]:
    headings: list[Heading] = []
    for page_index, page in enumerate(doc):
        for block in page.get_text("blocks"):
            text = " ".join(str(block[4]).split())
            match = HEADING_RE.match(text)
            if not match:
                continue
            number, title = match.groups()
            if number.count(".") + 1 < min_depth:
                continue
            headings.append(Heading(number=number, title=title, page_index=page_index, y0=float(block[1])))
    return headings


def stage_for_heading(stages: list[Stage], heading: Heading, fallback_product: str) -> Stage:
    current: Stage | None = None
    for stage in stages:
        if (stage.page_index, stage.y0) <= (heading.page_index, heading.y0):
            current = stage
        else:
            break
    return current or Stage(
        product=fallback_product,
        status="未分阶段",
        label=fallback_product,
        page_index=heading.page_index,
        y0=0,
    )


def next_boundary_for(heading: Heading, boundary_headings: list[Heading], stages: list[Stage]) -> Boundary | None:
    candidates: list[Boundary] = []
    start = (heading.page_index, heading.y0 + 1)
    for item in boundary_headings:
        if (item.page_index, item.y0) > start:
            candidates.append(Boundary(page_index=item.page_index, y0=item.y0))
    for stage in stages:
        if (stage.page_index, stage.y0) > start:
            candidates.append(Boundary(page_index=stage.page_index, y0=stage.y0))
    if not candidates:
        return None
    return min(candidates, key=lambda item: (item.page_index, item.y0))


def render_clip(page: fitz.Page, clip: fitz.Rect, output: Path, scale: float) -> None:
    matrix = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=matrix, clip=clip, alpha=False)
    output.parent.mkdir(parents=True, exist_ok=True)
    pix.save(output)


def section_clips(
    doc: fitz.Document,
    heading: Heading,
    next_boundary: Boundary | None,
    margin: float,
    continuation_top: float,
    footer_margin: float,
) -> list[tuple[int, fitz.Rect]]:
    clips: list[tuple[int, fitz.Rect]] = []
    end_page = next_boundary.page_index if next_boundary else heading.page_index
    for page_index in range(heading.page_index, end_page + 1):
        page = doc[page_index]
        rect = page.rect
        top = continuation_top if page_index != heading.page_index else max(0, heading.y0 - margin)
        bottom = rect.height - footer_margin
        if next_boundary and page_index == next_boundary.page_index:
            bottom = max(top + 20, next_boundary.y0)
        if bottom <= top + 20:
            continue
        clips.append((page_index, fitz.Rect(margin, top, rect.width - margin, bottom)))
    return clips


def build_sections(
    pdf_dir: Path,
    section_dir: Path,
    min_depth: int,
    scale: float,
    margin: float,
    continuation_top: float,
    footer_margin: float,
    pdf_filter: str | None,
    product_filter: str | None,
    section_filter: str | None,
    title_filter: str | None,
) -> list[dict]:
    records: list[dict] = []
    clean_generated_dir(section_dir)
    for pdf_path in sorted(pdf_dir.glob("*.pdf")):
        if pdf_filter and pdf_filter not in pdf_path.stem:
            continue
        doc = fitz.open(pdf_path)
        fallback_product = re.sub(r"批检验记录\d*$", "", pdf_path.stem).strip(" _")
        stages = extract_stages(doc, fallback_product=fallback_product)
        for stage in stages:
            if product_filter and product_filter not in stage.product:
                continue
            (section_dir / safe_name(f"{stage.product}_{stage.status}")).mkdir(parents=True, exist_ok=True)
        headings = extract_headings(doc, min_depth=min_depth)
        boundary_headings = extract_headings(doc, min_depth=3)
        for index, heading in enumerate(headings):
            stage = stage_for_heading(stages, heading, fallback_product=fallback_product)
            if product_filter and product_filter not in stage.product:
                continue
            if section_filter and not re.search(section_filter, heading.number):
                continue
            if title_filter and title_filter not in heading.title:
                continue
            clips = section_clips(
                doc,
                heading,
                next_boundary_for(heading, boundary_headings, stages),
                margin=margin,
                continuation_top=continuation_top,
                footer_margin=footer_margin,
            )
            image_paths: list[str] = []
            doc_dir = section_dir / safe_name(f"{stage.product}_{stage.status}")
            doc_dir.mkdir(parents=True, exist_ok=True)
            base = safe_name(f"{heading.number}_{heading.title}")
            for part, (page_index, clip) in enumerate(clips, start=1):
                suffix = f"_p{page_index + 1}" if len(clips) == 1 else f"_p{page_index + 1}_part{part}"
                out = doc_dir / f"{base}{suffix}.png"
                render_clip(doc[page_index], clip, out, scale=scale)
                image_paths.append(str(out))
            records.append({
                "source_pdf": str(pdf_path),
                "product": stage.product,
                "stage": stage.status,
                "stage_label": stage.label,
                "section": heading.number,
                "title": heading.title,
                "page": heading.page_index + 1,
                "images": image_paths,
            })
        doc.close()
    return records


def write_index(records: list[dict], section_dir: Path) -> None:
    (section_dir / "index.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# QC PDF Section Screenshot Index", ""]
    current_group = ""
    for record in records:
        group = f"{record['product']}_{record['stage']}"
        if group != current_group:
            current_group = group
            lines += ["", f"## {group}", ""]
        lines.append(f"### {record['section']} {record['title']}")
        lines.append(f"- source_pdf: `{record['source_pdf']}`")
        lines.append(f"- page: {record['page']}")
        for image in record["images"]:
            lines.append(f"- image: `{image}`")
        lines.append("")
    (section_dir / "index.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert QC DOCX records to PDF and crop section screenshots.")
    parser.add_argument("--workspace-dir", type=Path, default=default_workspace_dir())
    parser.add_argument("--section-dir", type=Path, default=None)
    parser.add_argument("--min-depth", type=int, default=4, help="Heading depth to screenshot, e.g. 4 includes 2.2.5.1.")
    parser.add_argument("--scale", type=float, default=DEFAULT_SCALE)
    parser.add_argument("--margin", type=float, default=18)
    parser.add_argument(
        "--continuation-top",
        type=float,
        default=DEFAULT_CONTINUATION_TOP,
        help="Top crop for pages after a section starts. Default keeps the full page top to avoid cutting content.",
    )
    parser.add_argument(
        "--footer-margin",
        type=float,
        default=DEFAULT_FOOTER_MARGIN,
        help="Bottom crop margin. Default keeps the full page bottom to avoid cutting tables.",
    )
    parser.add_argument(
        "--converter",
        choices=("word", "libreoffice"),
        default="word",
        help="DOCX to PDF converter. Default uses Microsoft Word for better layout fidelity.",
    )
    parser.add_argument("--convert-only", action="store_true", help="Only convert DOCX to PDF; do not crop screenshots.")
    parser.add_argument("--skip-convert", action="store_true")
    parser.add_argument("--pdf-filter", default=None, help="Only process PDFs whose filename contains this text.")
    parser.add_argument("--product-filter", default=None, help="Only render stages whose product contains this text.")
    parser.add_argument("--section-filter", default=None, help="Regex for section numbers, e.g. '^2\\.4\\.'")
    parser.add_argument("--title-filter", default=None, help="Only render sections whose title contains this text.")
    args = parser.parse_args()

    raw_dir = args.workspace_dir / "pdf" / "raw"
    pdf_dir = args.workspace_dir / "pdf" / "converted"
    section_dir = args.section_dir or args.workspace_dir / "pdf" / "sections"
    if not args.skip_convert:
        convert_docx_to_pdf(raw_dir, pdf_dir, args.converter)
    if args.convert_only:
        print(f"PDFs: {len(list(pdf_dir.glob('*.pdf')))} -> {pdf_dir}")
        return
    records = build_sections(
        pdf_dir,
        section_dir,
        min_depth=args.min_depth,
        scale=args.scale,
        margin=args.margin,
        continuation_top=args.continuation_top,
        footer_margin=args.footer_margin,
        pdf_filter=args.pdf_filter,
        product_filter=args.product_filter,
        section_filter=args.section_filter,
        title_filter=args.title_filter,
    )
    write_index(records, section_dir)
    print(f"PDFs: {len(list(pdf_dir.glob('*.pdf')))} -> {pdf_dir}")
    print(f"Sections: {len(records)} -> {section_dir}")
    print(f"Index: {section_dir / 'index.md'}")


if __name__ == "__main__":
    main()
