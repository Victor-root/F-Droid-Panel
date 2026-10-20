"""APK inspection: the manifest through fdroidserver's androguard, the signature through apksigner.

Both run in child processes with resource limits: the files come from uploads.
"""

from __future__ import annotations

import asyncio
import json
import re
import resource
import shutil
from dataclasses import dataclass, field
from importlib import resources
from pathlib import Path
from typing import Any

from .files import sha256_file
from .jobs import minimal_environment

HELPER_TIMEOUT = 60
HELPER_TIMEOUT_PER_APK = 20
APKSIGNER_TIMEOUT = 120
MEMORY_LIMIT = 3 * 1024**3
SIGNER_DIGEST = re.compile(r"^Signer #1 certificate SHA-256 digest: ([0-9a-f]{64})$", re.MULTILINE)


@dataclass
class ApkInfo:
    package: str
    version_code: int
    version_name: str | None
    min_sdk: int | None
    target_sdk: int | None
    max_sdk: int | None
    permissions: list[str]
    label: str | None
    icon: str | None
    native_code: list[str]
    sha256: str
    size: int
    signer: str | None = None
    problems: list[str] = field(default_factory=list)


def python_of(command: str) -> str:
    """The interpreter of an fdroid entry point, which can import fdroidserver and androguard."""
    executable = shutil.which(command)
    if executable is None:
        raise FileNotFoundError(command)
    first = Path(executable).read_bytes()[:256].split(b"\n", 1)[0].decode(errors="replace")
    if not first.startswith("#!"):
        raise ValueError(f"{executable} is not a script")
    parts = first[2:].strip().split()
    if Path(parts[0]).name == "env" and len(parts) > 1:
        found = shutil.which(parts[-1])
        if found is None:
            raise FileNotFoundError(parts[-1])
        return found
    return parts[0]


def _limit_resources() -> None:
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT, MEMORY_LIMIT))


async def _run(args: list[str], home: Path, timeout: float) -> tuple[int, str]:
    process = await asyncio.create_subprocess_exec(
        *args,
        env=minimal_environment(home),
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        preexec_fn=_limit_resources,
    )
    try:
        output, _ = await asyncio.wait_for(process.communicate(), timeout)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        return -1, ""
    return process.returncode or 0, output.decode(errors="replace")


async def signer_of(apk: Path, home: Path) -> str | None:
    """SHA-256 of the signing certificate if apksigner says the signature is valid, else None."""
    apksigner = shutil.which("apksigner")
    if apksigner is None:
        raise FileNotFoundError("apksigner")
    code, output = await _run([apksigner, "verify", "--print-certs", str(apk)], home, APKSIGNER_TIMEOUT)
    match = SIGNER_DIGEST.search(output)
    return match.group(1) if code == 0 and match else None


async def inspect_apks(command: str, home: Path, paths: list[Path]) -> dict[Path, ApkInfo | str]:
    """Reads each APK; the value is the information, or an error code when the file is not a valid APK."""
    if not paths:
        return {}
    helper = resources.files("fdroid_panel") / "data" / "inspect_apk.py"
    code, output = await _run(
        [python_of(command), "-I", str(helper), *map(str, paths)],
        home,
        HELPER_TIMEOUT + HELPER_TIMEOUT_PER_APK * len(paths),
    )
    manifests: dict[str, dict[str, Any]] = {}
    for line in output.splitlines():
        if line.startswith("{"):
            entry = json.loads(line)
            manifests[entry["path"]] = entry

    results: dict[Path, ApkInfo | str] = {}
    for path in paths:
        manifest = manifests.get(str(path))
        if code != 0 or manifest is None or not manifest["ok"] or not manifest.get("package"):
            results[path] = "not_an_apk"
            continue
        if manifest.get("versionCode") is None:
            results[path] = "no_version_code"
            continue
        info = ApkInfo(
            package=manifest["package"],
            version_code=manifest["versionCode"],
            version_name=manifest.get("versionName"),
            min_sdk=manifest.get("minSdk"),
            target_sdk=manifest.get("targetSdk"),
            max_sdk=manifest.get("maxSdk"),
            permissions=manifest.get("permissions") or [],
            label=manifest.get("label"),
            icon=manifest.get("icon"),
            native_code=manifest.get("nativeCode") or [],
            sha256=sha256_file(path),
            size=path.stat().st_size,
        )
        info.signer = await signer_of(path, home)
        if info.signer is None:
            info.problems.append("not_signed")
        results[path] = info
    return results
