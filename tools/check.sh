#!/usr/bin/env bash
# Every fast check CI runs, in one command. End to end and fdroidserver tests are separate (see CI).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

python3 "$root/tools/checks/check_no_em_dash.py"
python3 "$root/tools/checks/check_i18n.py"

cd "$root/backend"
uv run ruff check . ../tools
uv run ruff format --check . ../tools
uv run mypy
uv run mypy --strict ../tools
uv run pytest -q

cd "$root/frontend"
npm run -s lint
npm run -s typecheck
npm test --silent
echo "All checks passed."
