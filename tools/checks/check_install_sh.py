#!/usr/bin/env python3
"""Check that every message of install.sh exists in French and English, and that none is unused."""

from __future__ import annotations

import re
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "install.sh"
DEFINED = re.compile(r"^\s+(fr|en):([a-z0-9_]+)\)", re.MULTILINE)
USED = re.compile(r"tr_msg ([a-z0-9_]+)")


def main() -> int:
    text = SCRIPT.read_text(encoding="utf-8")
    definitions: dict[str, set[str]] = {}
    for language, key in DEFINED.findall(text):
        definitions.setdefault(language, set()).add(key)
    french, english = definitions.get("fr", set()), definitions.get("en", set())
    used = set(USED.findall(text)) - {"key"}

    problems = [f"missing in French: {key}" for key in sorted(english - french)]
    problems += [f"missing in English: {key}" for key in sorted(french - english)]
    problems += [f"used but not defined: {key}" for key in sorted(used - english)]
    problems += [f"defined but unused: {key}" for key in sorted(english - used)]
    for problem in problems:
        print(f"install.sh: {problem}")
    if problems:
        return 1
    print(f"install.sh messages OK: {len(english)} in French and English")
    return 0


if __name__ == "__main__":
    sys.exit(main())
