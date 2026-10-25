from __future__ import annotations

import re
from pathlib import Path

import pytest

from fdroid_panel import yamlfile
from fdroid_panel.backups import Backups
from fdroid_panel.files import resolve_inside, write_atomic
from fdroid_panel.repositories import discard_changes

HAND_WRITTEN = """\
# Maintained by hand, comments must survive edits.
Categories:
    - Tools  # four spaces of indentation on purpose
License: GPL-3.0-or-later
Name: Hand written
Summary: Metadata written without the panel
Description: |
    First paragraph with "quotes" and: colons.

    Second paragraph.
"""


def test_update_keeps_comments_and_order(tmp_path: Path) -> None:
    path = tmp_path / "app.yml"
    path.write_text(HAND_WRITTEN)
    yamlfile.update(path, {"Summary": "Changed", "AuthorName": "Someone", "Name": yamlfile.DELETE})
    text = path.read_text()
    assert text.startswith("# Maintained by hand, comments must survive edits.\n")
    # The comment stays on its line; only the indentation becomes fdroidserver's canonical one.
    assert re.search(r"^  - Tools +# four spaces of indentation on purpose$", text, re.MULTILINE)
    assert "Summary: Changed\n" in text
    assert "\nName:" not in text
    assert text.index("License:") < text.index("Summary:") < text.index("AuthorName:")
    assert '  First paragraph with "quotes" and: colons.\n\n  Second paragraph.\n' in text


def test_update_keeps_the_document_marker_and_mode(tmp_path: Path) -> None:
    path = tmp_path / "config.yml"
    path.write_text("---\n# comment\nrepo_name: Old\n")
    path.chmod(0o600)
    yamlfile.update(path, {"repo_name": "New: with colon"})
    assert path.read_text() == "---\n# comment\nrepo_name: 'New: with colon'\n"
    assert path.stat().st_mode & 0o777 == 0o600


def test_write_atomic_creates_with_mode(tmp_path: Path) -> None:
    path = tmp_path / "secret"
    write_atomic(path, b"x", mode=0o600)
    assert path.read_bytes() == b"x" and path.stat().st_mode & 0o777 == 0o600
    assert [p.name for p in tmp_path.iterdir()] == ["secret"]


def test_resolve_inside_refuses_escapes(tmp_path: Path) -> None:
    assert resolve_inside(tmp_path, "a/b") == (tmp_path / "a" / "b").resolve()
    with pytest.raises(ValueError):
        resolve_inside(tmp_path, "../outside")


def test_backup_and_restore(tmp_path: Path) -> None:
    repository = tmp_path / "repo"
    (repository / "metadata").mkdir(parents=True)
    (repository / "config.yml").write_text("before")
    backups = Backups(tmp_path / "backups")
    backup = backups.snapshot(1, repository, ["config.yml", "metadata/new.yml"], "settings")

    (repository / "config.yml").write_text("after")
    (repository / "metadata" / "new.yml").write_text("created")
    assert backups.history(1)[0].name == backup.name
    backups.restore(1, backup.name, repository)
    assert (repository / "config.yml").read_text() == "before"
    assert not (repository / "metadata" / "new.yml").exists()


def test_discard_changes_nothing_with_a_damaged_backup(tmp_path: Path) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    (repository / "config.yml").write_text("published")
    backups = Backups(tmp_path / "backups")
    older = backups.snapshot(1, repository, ["config.yml"], "settings")
    (repository / "config.yml").write_text("changed")
    backups.snapshot(1, repository, ["config.yml"], "settings")
    (repository / "config.yml").write_text("changed again")

    (tmp_path / "backups" / "1" / older.name / "files" / "config.yml").write_text("damaged")
    with pytest.raises(ValueError):
        discard_changes(backups, 1, repository, None)
    assert (repository / "config.yml").read_text() == "changed again"
    assert len(backups.history(1)) == 2


def test_moved_files_can_be_restored(tmp_path: Path) -> None:
    repository = tmp_path / "repo"
    (repository / "repo").mkdir(parents=True)
    (repository / "repo" / "app.apk").write_bytes(b"apk")
    backups = Backups(tmp_path / "backups")
    backup = backups.snapshot(1, repository, ["repo/app.apk"], "delete", move=True)
    assert not (repository / "repo" / "app.apk").exists()
    backups.restore(1, backup.name, repository)
    assert (repository / "repo" / "app.apk").read_bytes() == b"apk"
