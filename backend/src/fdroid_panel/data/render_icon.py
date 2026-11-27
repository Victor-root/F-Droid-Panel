"""Renders the adaptive icons inspect_apk.py drew as SVG to PNG, with resvg.

Run with the Python of the panel, in its own process: the drawings come from uploaded APKs.
    python render_icon.py FILE.svg [FILE.svg ...]
Prints one JSON object per line.
"""

from __future__ import annotations

import base64
import json
import sys

import resvg_py

ICON_SIDE = 512


def main() -> None:
    for path in sys.argv[1:]:
        png: str | None
        try:
            rendered = resvg_py.svg_to_bytes(
                svg_path=path, width=ICON_SIDE, height=ICON_SIDE, skip_system_fonts=True
            )
            png = base64.b64encode(rendered).decode()
        except ValueError:
            png = None
        sys.stdout.write(json.dumps({"path": path, "png": png}) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
