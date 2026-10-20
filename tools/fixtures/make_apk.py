#!/usr/bin/env python3
"""Build a minimal signed APK for tests, without the Android SDK.

Needs the distribution packages aapt, zipalign, apksigner, keytool and an
android.jar (android-sdk-platform-23 on Debian and Ubuntu). The APK has no
code (android:hasCode="false"), only a manifest, a label and an icon, which
is all fdroidserver needs to index it.
"""

from __future__ import annotations

import argparse
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

DEFAULT_ANDROID_JAR = Path("/usr/lib/android-sdk/platforms/android-23/android.jar")
TEST_KEY_PASSWORD = "test-password"


def png_solid(size: int, rgb: tuple[int, int, int]) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    row = b"\x00" + bytes(rgb) * size
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(row * size, 9))
        + chunk(b"IEND", b"")
    )


def parse_color(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if len(value) != 6:
        raise argparse.ArgumentTypeError(f"expected a #RRGGBB color, got {value!r}")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def ensure_keystore(path: Path, alias: str, password: str, dname: str) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "keytool",
            "-genkeypair",
            "-noprompt",
            "-keystore",
            str(path),
            "-storetype",
            "PKCS12",
            "-alias",
            alias,
            "-keyalg",
            "RSA",
            "-keysize",
            "2048",
            "-validity",
            "10000",
            "-dname",
            dname,
            "-storepass",
            password,
            "-keypass",
            password,
        ],
        check=True,
        capture_output=True,
    )


def build(args: argparse.Namespace) -> None:
    for tool in ("aapt", "zipalign", "apksigner", "keytool"):
        if shutil.which(tool) is None:
            sys.exit(f"missing tool: {tool}")
    if not args.android_jar.is_file():
        sys.exit(f"missing android.jar: {args.android_jar}")

    ensure_keystore(args.keystore, args.alias, args.password, args.dname)

    permissions = "".join(f"    <uses-permission android:name={quoteattr(p)} />\n" for p in args.permission)
    manifest = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n'
        f"    package={quoteattr(args.package)}\n"
        f'    android:versionCode="{args.version_code}"\n'
        f"    android:versionName={quoteattr(args.version_name)}>\n"
        f'    <uses-sdk android:minSdkVersion="{args.min_sdk}"'
        f' android:targetSdkVersion="{args.target_sdk}" />\n'
        f"{permissions}"
        '    <application android:label="@string/app_name" android:icon="@mipmap/ic_launcher"'
        ' android:hasCode="false" />\n'
        "</manifest>\n"
    )

    with tempfile.TemporaryDirectory() as tmp_name:
        tmp = Path(tmp_name)
        (tmp / "AndroidManifest.xml").write_text(manifest, encoding="utf-8")
        values = tmp / "res" / "values"
        values.mkdir(parents=True)
        (values / "strings.xml").write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            f'<resources><string name="app_name">{escape(args.label)}</string></resources>\n',
            encoding="utf-8",
        )
        for density, size in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144)):
            folder = tmp / "res" / f"mipmap-{density}"
            folder.mkdir(parents=True)
            (folder / "ic_launcher.png").write_bytes(png_solid(size, args.icon_color))

        unsigned = tmp / "unsigned.apk"
        aligned = tmp / "aligned.apk"
        subprocess.run(
            [
                "aapt",
                "package",
                "-f",
                "-M",
                str(tmp / "AndroidManifest.xml"),
                "-S",
                str(tmp / "res"),
                "-I",
                str(args.android_jar),
                "-F",
                str(unsigned),
            ],
            check=True,
            capture_output=True,
        )
        subprocess.run(["zipalign", "-f", "4", str(unsigned), str(aligned)], check=True, capture_output=True)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "apksigner",
                "sign",
                "--ks",
                str(args.keystore),
                "--ks-key-alias",
                args.alias,
                "--ks-pass",
                f"pass:{args.password}",
                "--key-pass",
                f"pass:{args.password}",
                "--v4-signing-enabled",
                "false",
                "--out",
                str(args.out),
                str(aligned),
            ],
            check=True,
            capture_output=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--package", required=True)
    parser.add_argument("--version-code", type=int, required=True)
    parser.add_argument("--version-name", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--min-sdk", type=int, default=21)
    parser.add_argument("--target-sdk", type=int, default=23)
    parser.add_argument("--icon-color", type=parse_color, default=(0x3D, 0xDC, 0x84))
    parser.add_argument("--permission", action="append", default=[])
    parser.add_argument("--keystore", type=Path, required=True)
    parser.add_argument("--alias", default="test")
    parser.add_argument("--password", default=TEST_KEY_PASSWORD)
    parser.add_argument("--dname", default="CN=F-Droid Panel test key")
    parser.add_argument("--android-jar", type=Path, default=DEFAULT_ANDROID_JAR)
    parser.add_argument("--out", type=Path, required=True)
    build(parser.parse_args())


if __name__ == "__main__":
    main()
