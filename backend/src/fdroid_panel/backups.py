"""Copies of the files a change is about to modify, taken before every write and every publish."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from .files import resolve_inside, sha256_file
from .models import utcnow

MANIFEST = "manifest.json"
KEEP = 100


@dataclass(frozen=True)
class Backup:
    name: str
    reason: str
    created_at: datetime
    files: list[str]


class Backups:
    def __init__(self, root: Path) -> None:
        self.root = root

    def _directory(self, repository_id: int) -> Path:
        return self.root / str(repository_id)

    def snapshot(
        self, repository_id: int, repository: Path, files: list[str], reason: str, *, move: bool = False
    ) -> Backup:
        """Copies the files, or with move=True takes them out of the repository: deleting keeps a way back."""
        created = utcnow()
        name = f"{created:%Y%m%d-%H%M%S-%f}-{reason}"
        target = self._directory(repository_id) / name
        target.mkdir(parents=True, mode=0o700)
        entries: list[dict[str, Any]] = []
        for relative in sorted(set(files)):
            source = resolve_inside(repository, relative)
            existed = source.is_file()
            digest = sha256_file(source) if existed else None
            if existed:
                destination = target / "files" / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                if move:
                    shutil.move(source, destination)
                else:
                    shutil.copy2(source, destination)
            entries.append({"path": relative, "existed": existed, "sha256": digest})
        (target / MANIFEST).write_text(
            json.dumps({"reason": reason, "createdAt": created.isoformat(), "files": entries}, indent=2),
            encoding="utf-8",
        )
        self._prune(repository_id)
        return Backup(name, reason, created, [entry["path"] for entry in entries])

    def history(self, repository_id: int) -> list[Backup]:
        directory = self._directory(repository_id)
        if not directory.exists():
            return []
        backups = []
        for path in sorted(directory.iterdir(), reverse=True):
            manifest = path / MANIFEST
            if manifest.is_file():
                data = json.loads(manifest.read_text(encoding="utf-8"))
                backups.append(
                    Backup(
                        path.name,
                        data["reason"],
                        datetime.fromisoformat(data["createdAt"]),
                        [entry["path"] for entry in data["files"]],
                    )
                )
        return backups

    def restore(self, repository_id: int, name: str, repository: Path) -> list[str]:
        """Puts every file back as it was; files that did not exist then are removed."""
        backup = resolve_inside(self._directory(repository_id), name)
        data = json.loads((backup / MANIFEST).read_text(encoding="utf-8"))
        restored = []
        for entry in data["files"]:
            target = resolve_inside(repository, entry["path"])
            if entry["existed"]:
                source = backup / "files" / entry["path"]
                if sha256_file(source) != entry["sha256"]:
                    raise ValueError(f"backup file changed: {entry['path']}")
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
            else:
                target.unlink(missing_ok=True)
            restored.append(entry["path"])
        return restored

    def _prune(self, repository_id: int) -> None:
        backups = sorted(self._directory(repository_id).iterdir(), reverse=True)
        for old in backups[KEEP:]:
            shutil.rmtree(old)

    def delete_all(self, repository_id: int) -> None:
        shutil.rmtree(self._directory(repository_id), ignore_errors=True)
