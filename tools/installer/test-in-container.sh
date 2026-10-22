#!/usr/bin/env bash
# End to end test of install.sh in a container running systemd, as on a real server: install,
# self-test of fdroidserver inside the sandboxed service, a broken update that must roll back, a
# working update, a request from the browser to the maintenance helper, and both uninstall levels.
#
# Usage: tools/installer/test-in-container.sh <image> <release directory from tools/release/build.sh>
# Optional: TEST_DOCKER_ARGS (extra docker run arguments), TEST_CA_CERT (a CA to trust inside the
# container, for networks that intercept TLS), and the proxy variables, passed to the container.
set -euo pipefail

image="${1:?image, such as debian:12}"
release="$(cd "${2:?release directory}" && pwd)"
root="$(cd "$(dirname "$0")/../.." && pwd)"
name="fdroid-panel-test-$$"
work="$(mktemp -d)"
read -r -a docker_args <<<"${TEST_DOCKER_ARGS:-}"

cleanup() {
    docker rm -f "$name" >/dev/null 2>&1 || true
    docker rmi -f "$name-image" >/dev/null 2>&1 || true
    rm -rf "$work"
}
trap cleanup EXIT

say() { printf '\n=== %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; docker exec "$name" journalctl -u fdroid-panel --no-pager -n 50 >&2 || true; exit 1; }

environment=()
for variable in https_proxy HTTPS_PROXY no_proxy NO_PROXY; do
    if [[ -n "${!variable:-}" ]]; then
        environment+=(-e "${variable}=${!variable}")
    fi
done
if [[ -n "${TEST_CA_CERT:-}" ]]; then
    environment+=(-e PIP_CERT=/etc/ssl/certs/ca-certificates.crt)
fi

in_container() { docker exec "${environment[@]}" "$name" "$@"; }
installer() {
    # The answers come on stdin, as a person would type them.
    docker exec -i "${environment[@]}" -e "FDROID_PANEL_RELEASE=$1" "$name" \
        bash /opt/fdroid-panel/install.sh
}

say "Preparing a $image container with systemd"
docker run -d --name "$name" "${docker_args[@]}" "${environment[@]}" "$image" sleep infinity >/dev/null
if [[ -n "${TEST_CA_CERT:-}" ]]; then
    docker cp "$TEST_CA_CERT" "$name:/root/test-ca.crt"
fi
in_container bash -c '
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -q >/dev/null
    apt-get install -y -q systemd systemd-sysv ca-certificates curl >/dev/null
    if [[ -f /root/test-ca.crt ]]; then
        cp /root/test-ca.crt /usr/local/share/ca-certificates/test-ca.crt
        update-ca-certificates >/dev/null
    fi'
docker commit "$name" "$name-image" >/dev/null
docker rm -f "$name" >/dev/null
docker run -d --name "$name" --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
    "${docker_args[@]}" "$name-image" /lib/systemd/systemd >/dev/null
for _ in $(seq 1 30); do
    state="$(docker exec "$name" systemctl is-system-running 2>/dev/null || true)"
    [[ "$state" == "running" || "$state" == "degraded" ]] && break
    sleep 1
done

say "Building a broken and a working newer release"
mkdir -p "$work/base" "$work/broken" "$work/newer"
tar -xzf "$release/fdroid-panel.tar.gz" -C "$work/base"
python3 - "$work/base/fdroid-panel" <<'PY'
import glob
import shutil
import sys
import zipfile

directory = sys.argv[1]
wheel = glob.glob(f"{directory}/fdroid_panel-*.whl")[0]
shutil.copy(wheel, f"{directory}/working.whl.keep")
with zipfile.ZipFile(wheel) as source, zipfile.ZipFile(wheel + ".tmp", "w", zipfile.ZIP_DEFLATED) as target:
    for item in source.infolist():
        data = source.read(item.filename)
        if item.filename == "fdroid_panel/app.py":
            data = data.replace(b"def create_app(", b"raise RuntimeError('broken on purpose')\n\n\ndef create_app(", 1)
        target.writestr(item, data)
shutil.move(wheel + ".tmp", wheel)
PY
package() {
    local destination="$1" commit="$2"
    sed -i "s/^commit=.*/commit=${commit}/" "$work/base/fdroid-panel/RELEASE"
    tar -C "$work/base" --exclude '*.keep' -czf "$work/$destination/fdroid-panel.tar.gz" fdroid-panel
    (cd "$work/$destination" && sha256sum fdroid-panel.tar.gz > SHA256SUMS)
}
package broken "$(printf 'b%.0s' $(seq 1 40))"
wheel="$(ls "$work"/base/fdroid-panel/fdroid_panel-*.whl)"
mv "$work/base/fdroid-panel/working.whl.keep" "$wheel"
package newer "$(printf 'c%.0s' $(seq 1 40))"
docker cp "$release" "$name:/root/release"
docker cp "$work/broken" "$name:/root/broken"
docker cp "$work/newer" "$name:/root/newer"
docker cp "$root/install.sh" "$name:/root/install.sh"

say "Install (local network test mode, defaults)"
printf '1\n3\n\n\n\nyes\n\n8\n' | docker exec -i "${environment[@]}" \
    -e FDROID_PANEL_RELEASE=/root/release/fdroid-panel.tar.gz "$name" bash /root/install.sh \
    2>&1 | tee "$work/install.log" | grep -E '✓|✗' || true
grep -q "Setup code" "$work/install.log" || fail "no setup code printed"
port="$(in_container sed -n 's/^port = //p' /etc/fdroid-panel/panel.toml)"
in_container curl -fsS "http://127.0.0.1:${port}/admin/api/health" || fail "the panel does not answer"
echo

say "fdroidserver self-test, run by the sandboxed service at startup"
for _ in $(seq 1 90); do
    status="$(docker exec -i "$name" python3 - <<'PY'
import sqlite3

row = sqlite3.connect("/var/lib/fdroid-panel/panel.db").execute(
    "select status from jobs where kind = 'self_test' order by id desc limit 1"
).fetchone()
print(row[0].lower() if row else "")
PY
)"
    [[ "$status" == "succeeded" || "$status" == "failed" ]] && break
    sleep 2
done
[[ "$status" == "succeeded" ]] || fail "self-test: $status"
echo "self-test: $status"
in_container find /opt/fdroid-panel -perm -o+w ! -type l -print -quit | grep -q . && fail "files writable by others"

say "Broken update must roll back"
before="$(in_container readlink /opt/fdroid-panel/current)"
printf '2\nyes\n\n8\n' | installer /root/broken/fdroid-panel.tar.gz 2>&1 | tee "$work/broken.log" | grep -E '✓|✗|⚠' || true
grep -q "previous version and its database were put back" "$work/broken.log" || fail "no rollback reported"
[[ "$(in_container readlink /opt/fdroid-panel/current)" == "$before" ]] || fail "current release changed"
in_container curl -fsS "http://127.0.0.1:${port}/admin/api/health" >/dev/null || fail "not healthy after rollback"

say "Working update"
printf '2\nyes\n\n8\n' | installer /root/newer/fdroid-panel.tar.gz 2>&1 | grep -E '✓|✗|⚠' || true
[[ "$(in_container readlink /opt/fdroid-panel/current)" == *-cccccccccccc ]] || fail "update not applied"
in_container grep -q '"commit": "cccccccccccc' /var/lib/fdroid-panel/maintenance/latest.json \
    || fail "the latest release seen by the browser is not the installed one"
in_container curl -fsS "http://127.0.0.1:${port}/admin/api/health" >/dev/null || fail "not healthy after update"

say "Request to the maintenance helper, as the browser makes it"
id="0123456789abcdef0123456789abcdef"
in_container runuser -u fdroid-panel -- sh -c \
    "printf '{\"action\": \"check\"}' > /var/lib/fdroid-panel/maintenance/requests/$id.json"
for _ in $(seq 1 60); do
    result="$(in_container cat "/var/lib/fdroid-panel/maintenance/results/$id.json" 2>/dev/null || true)"
    [[ "$result" == *succeeded* || "$result" == *failed* ]] && break
    sleep 1
done
echo "$result"
# Without a published release to compare with, a failed download is the expected answer here.
[[ "$result" == *succeeded* || "$result" == *download_failed* ]] || fail "helper result: $result"

say "Uninstall, keeping the data, then install again with it"
printf '7\n1\nyes\n\n8\n' | installer "" 2>&1 | grep -E '✓|✗' || true
in_container test ! -e /opt/fdroid-panel || fail "application still present"
in_container test -f /var/lib/fdroid-panel/panel.db || fail "data removed"
printf '1\nyes\n\n8\n' | docker exec -i "${environment[@]}" \
    -e FDROID_PANEL_RELEASE=/root/release/fdroid-panel.tar.gz "$name" bash /root/install.sh 2>&1 | grep -E '✓|✗' || true
in_container curl -fsS "http://127.0.0.1:${port}/admin/api/health" >/dev/null || fail "not healthy after reinstall"

say "Uninstall everything"
printf '7\n2\nyes\n\n8\n' | installer "" 2>&1 | grep -E '✓|✗' || true
for path in /opt/fdroid-panel /etc/fdroid-panel /var/lib/fdroid-panel /etc/systemd/system/fdroid-panel.service; do
    in_container test ! -e "$path" || fail "$path still present"
done
in_container id fdroid-panel >/dev/null 2>&1 && fail "system user still present"

say "All installer tests passed on $image"
