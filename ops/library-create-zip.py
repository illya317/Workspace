#!/usr/bin/env python3
"""Create a ZIP with UTF-8 names from an already validated package directory."""

import argparse
from pathlib import Path
import zipfile


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    source = Path(args.source).resolve(strict=True)
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for item in sorted(source.rglob("*"), key=lambda value: value.as_posix()):
            if item.is_file():
                archive.write(item, item.relative_to(source).as_posix())


if __name__ == "__main__":
    main()
