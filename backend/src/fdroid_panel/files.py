from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path


def write_atomic(path: Path, data: bytes, mode: int | None = None) -> None:
    """Replaces a file in one step, keeping its permissions; readers never see a half written file."""
    if mode is None:
        mode = path.stat().st_mode & 0o7777 if path.exists() else 0o644
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_inside(root: Path, relative: str) -> Path:
    """Resolves a relative path and refuses anything that would leave root."""
    resolved = (root / relative).resolve()
    if resolved != root.resolve() and root.resolve() not in resolved.parents:
        raise ValueError(f"path outside of {root}: {relative}")
    return resolved
