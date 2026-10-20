#!/usr/bin/env bash
# Runs the real backend with a fresh database and the built interface, for end to end tests.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
frontend="$here/.."
backend="$frontend/../backend"
work="${E2E_WORK_DIR:?}"

rm -rf "$work"
mkdir -p "$work"
(cd "$frontend" && npm run build)
rm -rf "$backend/src/fdroid_panel/static"
cp -r "$frontend/dist" "$backend/src/fdroid_panel/static"

cat > "$work/panel.toml" <<TOML
host = "127.0.0.1"
port = ${E2E_PORT:?}
data_dir = "$work/data"
secrets_dir = "$work/secrets"
maintenance_dir = "$work/maintenance"
fdroid_command = "fdroid-panel-e2e-missing-fdroid"
TOML

cd "$backend"
uv run fdroid-panel --config "$work/panel.toml" setup-code > "$work/setup-code"
exec uv run fdroid-panel --config "$work/panel.toml" serve
