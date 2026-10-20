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
# i18next plural forms: languages have different sets ("one"/"other", "one"/"few"/"many"/"other"...).
PLURAL_SUFFIX = re.compile(r"_(zero|one|two|few|many|other)$")


def flatten(tree: dict[str, object], prefix: str = "") -> set[str]:
    keys: set[str] = set()
    for key, value in tree.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            keys |= flatten(value, f"{path}.")
        else:
            keys.add(path)
    return keys


def base_keys(keys: set[str]) -> set[str]:
    return {PLURAL_SUFFIX.sub("", key) for key in keys}


def missing_other_forms(keys: set[str]) -> set[str]:
    plurals = {PLURAL_SUFFIX.sub("", key) for key in keys if PLURAL_SUFFIX.search(key)}
    return {key for key in plurals if f"{key}_other" not in keys}


class DuplicateKeyError(ValueError):
    pass


def _no_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """json.loads keeps the last of two identical keys silently; a duplicate is always a mistake here."""
    keys = [key for key, _ in pairs]
    duplicates = sorted({key for key in keys if keys.count(key) > 1})
    if duplicates:
        raise DuplicateKeyError(", ".join(duplicates))
    return dict(pairs)


def load(language: str) -> dict[str, set[str]]:
    result = {}
    for file in sorted((LOCALES / language).glob("*.json")):
        try:
            result[file.stem] = flatten(
                json.loads(file.read_text(encoding="utf-8"), object_pairs_hook=_no_duplicates)
            )
        except DuplicateKeyError as error:
            sys.exit(f"{language}/{file.name}: duplicate key {error}")
    return result


def main() -> int:
    errors: list[str] = []
    reference = load(REFERENCE)
    languages = sorted(d.name for d in LOCALES.iterdir() if d.is_dir())

    for language in languages:
        current = load(language)
        for namespace in sorted(reference.keys() | current.keys()):
            expected = base_keys(reference.get(namespace, set()))
            found = base_keys(current.get(namespace, set()))
            errors += [
                f"{language}/{namespace}: plural without _other: {k}"
                for k in sorted(missing_other_forms(current.get(namespace, set())))
            ]
            errors += [f"{language}/{namespace}: missing key {k}" for k in sorted(expected - found)]
            errors += [f"{language}/{namespace}: extra key {k}" for k in sorted(found - expected)]

    code = "\n".join(
        file.read_text(encoding="utf-8")
        for file in SOURCES.rglob("*")
        if file.suffix in {".ts", ".tsx"} and not file.name.endswith(".test.tsx")
    )
    for namespace, keys in reference.items():
        for key in sorted(base_keys(keys)):
            if not re.search(rf"""["'`]{re.escape(key)}["'`]""", code):
                errors.append(f"{REFERENCE}/{namespace}: unused key {key}")

    for error in errors:
        print(error)
    if not errors:
        print(f"i18n OK: {', '.join(languages)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
