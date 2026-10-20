"""Editing fdroidserver YAML files without losing what people wrote by hand.

ruamel.yaml in round-trip mode keeps comments, key order and block scalars; the
indentation is fdroidserver's canonical one (see docs/research/phase-0.md, section 6).
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap

from .files import write_atomic


class _Delete:
    """Marks a key to remove in update()."""


DELETE = _Delete()


def _yaml() -> YAML:
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.indent(mapping=2, sequence=4, offset=2)
    yaml.width = 4096
    return yaml


def load(path: Path) -> CommentedMap:
    if not path.exists():
        return CommentedMap()
    data = _yaml().load(path.read_text(encoding="utf-8"))
    if data is None:
        return CommentedMap()
    if not isinstance(data, CommentedMap):
        raise ValueError(f"{path} does not contain a mapping")
    return data


def dumps(data: CommentedMap, *, explicit_start: bool = False) -> str:
    yaml = _yaml()
    yaml.explicit_start = explicit_start
    stream = io.StringIO()
    yaml.dump(data, stream)
    return stream.getvalue()


def update(path: Path, changes: dict[str, Any], *, mode: int | None = None) -> None:
    """Sets or deletes top level keys, keeping everything else of the file as it was."""
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    data = load(path)
    for key, value in changes.items():
        if value is DELETE:
            data.pop(key, None)
        else:
            data[key] = value
    output = dumps(data, explicit_start=text.lstrip().startswith("---"))
    write_atomic(path, output.encode("utf-8"), mode)


def write(path: Path, data: dict[str, Any]) -> None:
    """Writes a new file, for content the panel owns entirely."""
    write_atomic(path, dumps(CommentedMap(data)).encode("utf-8"))
