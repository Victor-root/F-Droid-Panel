#!/usr/bin/env python3
"""Fail if any tracked text file contains an em dash (project writing rule)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EM_DASH = chr(0x2014)
SKIPPED_SUFFIXES = {".lock", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".apk", ".p12", ".jar"}
SKIPPED_NAMES = {"package-lock.json", "uv.lock"}


def main() -> int:
    files = subprocess.run(["git", "ls-files"], cwd=ROOT, check=True, capture_output=True, text=True)
    found = 0
    for name in files.stdout.splitlines():
        path = ROOT / name
        if path.suffix in SKIPPED_SUFFIXES or path.name in SKIPPED_NAMES or not path.is_file():
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(lines, start=1):
            if EM_DASH in line:
                print(f"{name}:{number}: em dash")
                found += 1
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
