#!/usr/bin/env python3
"""Check that every UI language has exactly the keys of English, and that every key is used."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / "frontend" / "src" / "locales"
SOURCES = ROOT / "frontend" / "src"
REFERENCE = "en"


def flatten(tree: dict[str, object], prefix: str = "") -> set[str]:
    keys: set[str] = set()
    for key, value in tree.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            keys |= flatten(value, f"{path}.")
        else:
            keys.add(path)
    return keys


def load(language: str) -> dict[str, set[str]]:
    return {
        file.stem: flatten(json.loads(file.read_text(encoding="utf-8")))
        for file in sorted((LOCALES / language).glob("*.json"))
    }


def main() -> int:
    errors: list[str] = []
    reference = load(REFERENCE)
    languages = sorted(d.name for d in LOCALES.iterdir() if d.is_dir())

    for language in languages:
        current = load(language)
        for namespace in sorted(reference.keys() | current.keys()):
            expected = reference.get(namespace, set())
            found = current.get(namespace, set())
            errors += [f"{language}/{namespace}: missing key {k}" for k in sorted(expected - found)]
            errors += [f"{language}/{namespace}: extra key {k}" for k in sorted(found - expected)]

    code = "\n".join(
        file.read_text(encoding="utf-8")
        for file in SOURCES.rglob("*")
        if file.suffix in {".ts", ".tsx"} and not file.name.endswith(".test.tsx")
    )
    for namespace, keys in reference.items():
        for key in sorted(keys):
            if not re.search(rf"""["'`]{re.escape(key)}["'`]""", code):
                errors.append(f"{REFERENCE}/{namespace}: unused key {key}")

    for error in errors:
        print(error)
    if not errors:
        print(f"i18n OK: {', '.join(languages)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
