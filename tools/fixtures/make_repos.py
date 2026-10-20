#!/usr/bin/env python3
"""Build the test fixture repositories with the real fdroidserver.

Each fixture is a complete repository (config, keystore, metadata, APKs,
signed index) covering one situation the panel must handle. After building,
the published index of every fixture is checked against what it should
contain, so a change of behaviour in fdroidserver is caught here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import make_apk

ICON_COLORS = ("#3DDC84", "#4285F4", "#F4B400", "#DB4437")


@dataclass
class Fixture:
    name: str
    description: str
    build: Callable[[Builder, Path], None]
    expected_repo: dict[str, list[int]]
    expected_archive: dict[str, list[int]] = field(default_factory=dict)
    # Extra values expected in repo/index-v2.json, keyed by their path in it.
    expected_values: dict[tuple[str, ...], object] = field(default_factory=dict)


class Builder:
    def __init__(self, fdroid: str, keys: Path) -> None:
        self.fdroid = fdroid
        self.keys = keys

    def run(self, repo: Path, *args: str) -> None:
        result = subprocess.run([self.fdroid, *args], cwd=repo, capture_output=True, text=True)
        if result.returncode != 0:
            sys.exit(f"fdroid {' '.join(args)} failed in {repo}:\n{result.stdout}{result.stderr}")

    def init(self, repo: Path, name: str, **settings: str | int) -> None:
        repo.mkdir(parents=True)
        self.run(
            repo,
            "init",
            "--no-prompt",
            "--repo-keyalias",
            "fixture",
            "--distinguished-name",
            f"CN={name}, OU=F-Droid Panel fixtures",
        )
        values: dict[str, str | int] = {
            "repo_url": f"https://fixtures.example.org/{name}/repo",
            "repo_name": name,
            "repo_description": f"F-Droid Panel test fixture: {name}.",
            "repo_icon": "icon.png",
            **settings,
        }
        # JSON scalars are valid YAML and quote anything that needs it.
        lines = [f"{key}: {json.dumps(value)}" for key, value in values.items()]
        with (repo / "config.yml").open("a", encoding="utf-8") as config:
            config.write("\n" + "\n".join(lines) + "\n")
        # fdroidserver 2.4.x copies repo_icon from the repository folder into repo/icons/.
        (repo / "icon.png").write_bytes(make_apk.png_solid(256, (0x3D, 0xDC, 0x84)))

    def apk(self, repo: Path, package: str, code: int, label: str, key: str = "dev", color: int = 0) -> None:
        make_apk.build(
            argparse.Namespace(
                package=package,
                version_code=code,
                version_name=f"1.{code}",
                label=label,
                min_sdk=21,
                target_sdk=23,
                icon_color=make_apk.parse_color(ICON_COLORS[color % len(ICON_COLORS)]),
                permission=["android.permission.INTERNET"],
                adaptive_icon=False,
                keystore=self.keys / f"{key}.p12",
                alias="test",
                password=make_apk.TEST_KEY_PASSWORD,
                dname=f"CN=Fixture signer {key}",
                android_jar=make_apk.DEFAULT_ANDROID_JAR,
                out=repo / "repo" / f"{package}_{code}.apk",
            )
        )

    def signer_sha256(self, key: str) -> str:
        der = subprocess.run(
            [
                "keytool",
                "-exportcert",
                "-keystore",
                str(self.keys / f"{key}.p12"),
                "-storepass",
                make_apk.TEST_KEY_PASSWORD,
                "-alias",
                "test",
            ],
            check=True,
            capture_output=True,
        ).stdout
        return hashlib.sha256(der).hexdigest()


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def metadata(name: str | None, summary: str = "", extra: str = "") -> str:
    """App metadata; texts in the YAML file override every localized text file, so None leaves them out."""
    texts = (
        f"Name: {name}\nSummary: {summary}\nDescription: |-\n  {name} is a test application.\n"
        if name
        else ""
    )
    return (
        "Categories:\n"
        "  - Tools\n"
        "License: MIT\n"
        "AuthorName: Fixture Author\n"
        "WebSite: https://example.org\n"
        f"{texts}"
        f"{extra}"
    )


def build_empty(b: Builder, repo: Path) -> None:
    b.init(repo, "empty")


def build_small(b: Builder, repo: Path) -> None:
    b.init(repo, "small")
    b.apk(repo, "org.example.alpha", 1, "Alpha", color=0)
    b.apk(repo, "org.example.alpha", 2, "Alpha", color=0)
    b.apk(repo, "org.example.beta", 10, "Beta", color=1)
    write(repo / "metadata" / "org.example.alpha.yml", metadata("Alpha", "First test app"))
    write(repo / "metadata" / "org.example.beta.yml", metadata("Beta", "Second test app"))


def build_archive(b: Builder, repo: Path) -> None:
    b.init(repo, "archive", archive_older=1)
    for code in (1, 2, 3):
        b.apk(repo, "org.example.archived", code, "Archived")
    write(repo / "metadata" / "org.example.archived.yml", metadata("Archived", "Keeps one version"))


def build_localized(b: Builder, repo: Path) -> None:
    b.init(repo, "localized")
    b.apk(repo, "org.example.localized", 1, "Localized", color=2)
    write(repo / "metadata" / "org.example.localized.yml", metadata(None))
    texts = {
        "en-US": ("Localized", "An app with translated texts", "English description."),
        "fr-FR": ("Localisée", "Une appli avec des textes traduits", "Description en français."),
    }
    for locale, (name, summary, description) in texts.items():
        base = repo / "metadata" / "org.example.localized" / locale
        write(base / "name.txt", name + "\n")
        write(base / "summary.txt", summary + "\n")
        write(base / "description.txt", description + "\n")
        write(base / "changelogs" / "1.txt", f"{locale} changelog for version 1.\n")
        (base / "images" / "phoneScreenshots").mkdir(parents=True)
        (base / "images" / "icon.png").write_bytes(make_apk.png_solid(512, (0xF4, 0xB4, 0x00)))
        (base / "images" / "featureGraphic.png").write_bytes(make_apk.png_solid(64, (0x42, 0x85, 0xF4)))
        for index, color in enumerate(((0xDB, 0x44, 0x37), (0x3D, 0xDC, 0x84)), start=1):
            (base / "images" / "phoneScreenshots" / f"{index}.png").write_bytes(make_apk.png_solid(64, color))


def build_categories(b: Builder, repo: Path) -> None:
    b.init(repo, "categories")
    b.apk(repo, "org.example.categorized", 1, "Categorized", color=3)
    write(
        repo / "metadata" / "org.example.categorized.yml",
        metadata("Categorized", "Uses custom categories").replace("  - Tools\n", "  - Family\n  - Tools\n"),
    )
    write(
        repo / "config" / "categories.yml",
        "Family:\n  name: Family\n  description: Apps for the family\n  icon: family.png\n"
        "Tools:\n  name: Tools\n",
    )
    write(repo / "config" / "fr" / "categories.yml", "Family:\n  name: Famille\nTools:\n  name: Outils\n")
    (repo / "config" / "family.png").write_bytes(make_apk.png_solid(96, (0xDB, 0x44, 0x37)))


def build_hand_written(b: Builder, repo: Path) -> None:
    b.init(repo, "hand-written")
    b.apk(repo, "org.example.handwritten", 1, "Hand written")
    write(
        repo / "metadata" / "org.example.handwritten.yml",
        "# Maintained by hand, comments must survive edits.\n"
        "Categories:\n"
        "    - Tools  # four spaces of indentation on purpose\n"
        "License: GPL-3.0-or-later\n"
        "AuthorName: Someone\n"
        "Name: Hand written\n"
        "Summary: Metadata written without the panel\n"
        "Description: |\n"
        '    First paragraph with "quotes" and: colons.\n'
        "\n"
        "    Second paragraph.\n",
    )


def build_signer_conflict(b: Builder, repo: Path) -> None:
    b.init(repo, "signer-conflict")
    b.apk(repo, "org.example.pinned", 1, "Pinned", key="dev")
    b.apk(repo, "org.example.pinned", 2, "Pinned", key="other")
    write(
        repo / "metadata" / "org.example.pinned.yml",
        metadata("Pinned", "Signer pinned", f"AllowedAPKSigningKeys: {b.signer_sha256('dev')}\n"),
    )


FIXTURES = [
    Fixture("empty", "freshly created repository, no app", build_empty, {}),
    Fixture(
        "small",
        "two apps, three versions",
        build_small,
        {"org.example.alpha": [1, 2], "org.example.beta": [10]},
    ),
    Fixture(
        "archive",
        "archive_older: 1, older versions moved to archive/",
        build_archive,
        {"org.example.archived": [3]},
        {"org.example.archived": [1, 2]},
    ),
    Fixture(
        "localized",
        "localized texts and graphics (en-US, fr-FR)",
        build_localized,
        {"org.example.localized": [1]},
        expected_values={
            ("packages", "org.example.localized", "metadata", "name"): {
                "en-US": "Localized",
                "fr-FR": "Localisée",
            },
            # Names and summaries are stripped, descriptions are kept as written.
            ("packages", "org.example.localized", "metadata", "description"): {
                "en-US": "English description.\n",
                "fr-FR": "Description en français.\n",
            },
        },
    ),
    Fixture(
        "categories",
        "custom categories with icon and translation",
        build_categories,
        {"org.example.categorized": [1]},
        expected_values={
            ("repo", "categories", "Family", "name"): {"en-US": "Family", "fr": "Famille"},
        },
    ),
    Fixture(
        "hand-written",
        "metadata with comments and non canonical indentation",
        build_hand_written,
        {"org.example.handwritten": [1]},
    ),
    Fixture(
        "signer-conflict",
        "second version signed by another key, rejected by AllowedAPKSigningKeys",
        build_signer_conflict,
        {"org.example.pinned": [1]},
    ),
]


def lookup(tree: object, path: tuple[str, ...]) -> object:
    for key in path:
        if not isinstance(tree, dict) or key not in tree:
            return None
        tree = tree[key]
    return tree


def indexed_versions(index: Path) -> dict[str, list[int]]:
    if not index.exists():
        return {}
    packages = json.loads(index.read_text(encoding="utf-8"))["packages"]
    return {
        package: sorted(v["manifest"]["versionCode"] for v in data["versions"].values())
        for package, data in packages.items()
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True, help="directory to create, must not exist")
    parser.add_argument("--fdroid", default=shutil.which("fdroid") or "fdroid")
    parser.add_argument("--only", help="comma separated fixture names (default: all)")
    args = parser.parse_args()
    selected = [f for f in FIXTURES if not args.only or f.name in args.only.split(",")]

    if args.out.exists():
        sys.exit(f"{args.out} already exists")
    os.environ.setdefault("GIT_PYTHON_REFRESH", "quiet")
    keys = args.out / "_signing-keys"
    builder = Builder(args.fdroid, keys)

    failures: list[str] = []
    for fixture in selected:
        repo = args.out / fixture.name
        fixture.build(builder, repo)
        builder.run(repo, "update", "--pretty")
        repo_versions = indexed_versions(repo / "repo" / "index-v2.json")
        archive_versions = indexed_versions(repo / "archive" / "index-v2.json")
        problems = []
        if repo_versions != fixture.expected_repo or archive_versions != fixture.expected_archive:
            problems.append(f"versions: repo {repo_versions}, archive {archive_versions}")
        if fixture.expected_values:
            index = json.loads((repo / "repo" / "index-v2.json").read_text(encoding="utf-8"))
            for path, expected in fixture.expected_values.items():
                found = lookup(index, path)
                if found != expected:
                    problems.append(f"{'.'.join(path)}: expected {expected}, found {found}")
        print(f"{'FAIL' if problems else 'ok  '} {fixture.name:16} {fixture.description}")
        failures += [f"{fixture.name}: {problem}" for problem in problems]

    for failure in failures:
        print(failure)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
