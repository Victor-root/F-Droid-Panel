#!/usr/bin/env bash
# Builds the release archive install.sh downloads: the panel wheel with its interface, the locked
# dependencies of the panel, of pip and of the managed fdroidserver, and install.sh itself.
#
# Usage: tools/release/build.sh <output directory>
# Writes fdroid-panel.tar.gz and SHA256SUMS in the output directory.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
out="${1:?output directory}"

mkdir -p "$out"
out="$(cd "$out" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

(cd "$root/frontend" && npm ci --silent && npm run -s build)
rm -rf "$root/backend/src/fdroid_panel/static"
cp -r "$root/frontend/dist" "$root/backend/src/fdroid_panel/static"

stage="$work/fdroid-panel"
mkdir -p "$stage"
(cd "$root/backend" && uv build --wheel --out-dir "$work/wheel" --quiet)
cp "$work"/wheel/fdroid_panel-*.whl "$stage/"
(cd "$root/backend" && uv export --frozen --no-dev --no-emit-project --no-header --format requirements-txt \
    --quiet --output-file "$stage/panel-requirements.txt")
cp "$root/packaging/pip/requirements.txt" "$stage/pip-requirements.txt"
cp "$root/packaging/fdroidserver/requirements.txt" "$stage/fdroidserver-requirements.txt"
cp "$root/install.sh" "$stage/install.sh"

wheel="$(basename "$stage"/fdroid_panel-*.whl)"
version="$(cut -d- -f2 <<<"$wheel")"
commit="$(git -C "$root" rev-parse HEAD)"
cat > "$stage/RELEASE" <<EOF
version=$version
commit=$commit
built=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

tar -C "$work" --owner=0 --group=0 --numeric-owner -czf "$out/fdroid-panel.tar.gz" fdroid-panel
(cd "$out" && sha256sum fdroid-panel.tar.gz > SHA256SUMS)
echo "Built fdroid-panel $version ($commit) in $out"
