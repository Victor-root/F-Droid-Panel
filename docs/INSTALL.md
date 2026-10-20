# Installation guide

## Requirements

* Debian 12 or 13, Ubuntu 22.04 or 24.04 (tested on every change, on x86_64 and arm64). Other systemd based distributions are best effort: without `apt`, the script lists the tools to install first (`python3` with `venv`, `git`, `keytool`, `jarsigner`, `apksigner`).
* systemd, root access, Internet access to GitHub and PyPI, 2 GB of free space.
* Works in virtual machines and LXC containers. In an unprivileged container without nesting, systemd cannot isolate the service with mount namespaces: the installer notices it and relaxes only those options, with a warning.

## Install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Victor-root/F-Droid-Panel/main/install.sh)
```

Choose **1) Install F-Droid Panel**, then how the panel is reached:

1. **Behind an existing reverse proxy** (nginx, Caddy, Traefik, Nginx Proxy Manager...). The proxy terminates HTTPS and forwards the whole host name to the panel. If the proxy runs on another machine, give its IP address: only it may pass on the visitors' addresses. Menu option 6 prints ready to paste nginx, Caddy and Nginx Proxy Manager settings.
2. **Standalone with Caddy**: Caddy is installed (from Debian or Ubuntu, or from Caddy's official repository on Ubuntu 22.04) and gets a Let's Encrypt certificate by itself. The domain name must point to the server and ports 80 and 443 must be reachable from the Internet. A Caddyfile you customized is never overwritten: the block to add is printed instead.
3. **Local network test** in plain HTTP. Passwords then cross the network unencrypted.

The script ends with the address of the panel and a **setup code** valid 24 hours. Open the address, type the code and create the first administrator. No password is ever asked in the terminal.

One address serves everything: the administration at `/admin/`, the first repository at `/repo/`, other repositories at `/<name>/repo/`, and a public page with the repositories at `/`.

## What is installed where

| Path | Content |
| --- | --- |
| `/opt/fdroid-panel/releases/<version>/` | the panel and its Python environment; the previous version stays for rollbacks |
| `/opt/fdroid-panel/current` | link to the running version |
| `/opt/fdroid-panel/fdroidserver-venv` | link to the tested fdroidserver, installed from a lock file with hashes |
| `/opt/fdroid-panel/install.sh` | the installer, also the maintenance helper |
| `/etc/fdroid-panel/panel.toml` | startup configuration (address, port, folders, trusted proxies) |
| `/etc/fdroid-panel/secrets/` | keystore passwords moved out of the repositories' `config.yml`, readable by the panel only |
| `/var/lib/fdroid-panel/` | database, repositories created in the panel, backups, logs (another folder can be chosen at install) |
| `/etc/systemd/system/fdroid-panel*` | the service, and the maintenance helper with its path unit |

The panel runs as the `fdroid-panel` system user, in a hardened systemd service. Repositories you import stay where they are.

## Updates

From the browser: **Settings, System, Updates**. From the server: run the install command again and choose **2) Update**. Both do the same:

1. download the new version and check it against `SHA256SUMS`;
2. install it next to the current one, with its locked dependencies;
3. stop the service, back up the database, switch to the new version, upgrade the database;
4. start it and check that it answers. If it does not, the previous version and its database come back by themselves.

Repositories are never touched by an update.

### How the browser triggers an update

The panel itself never runs as root. When an administrator asks for an update (or to reinstall fdroidserver, or to give the panel access to an existing repository folder), the panel writes a small request file in `/var/lib/fdroid-panel/maintenance/requests/`. A systemd path unit starts `install.sh --maintenance` as root, which accepts only those fixed actions, validates them, and writes the result and its log where the panel can read them. Giving access to a folder is refused for system folders, for folders that do not look like an F-Droid repository, and for folders containing hard links.

## Other menu entries

* **3) Show status**: service, version, address, repositories, fdroidserver, disk usage.
* **4) Repair**: reinstalls the system packages, fixes permissions, rebuilds a broken Python environment or fdroidserver, rewrites the services and restarts.
* **5) Reset a password**: gives an account a new random password, optionally turns off its two-step verification, and ends its sessions. Without any account, prints a new setup code.
* **6) Reverse proxy configuration**.
* **7) Uninstall**, at two levels:
  * remove the service and the application, keep the data, the configuration and every repository: running Install again brings everything back;
  * remove everything. The keystore passwords are first written back into each repository's `config.yml`, so the repositories keep working with the `fdroid` command. A repository created in the panel's data folder is only deleted if you type its exact path; kept repositories are given to root.

## Advanced

For servers without access to GitHub, or to try a build, two environment variables change where the installer takes the panel from:

* `FDROID_PANEL_RELEASE=/path/to/fdroid-panel.tar.gz`: a release archive on disk, with its `SHA256SUMS` next to it (build one with `tools/release/build.sh <folder> stable`);
* `FDROID_PANEL_CHANNEL=edge` or `stable`: which published channel to install.

The startup configuration can be edited in `/etc/fdroid-panel/panel.toml`, then `systemctl restart fdroid-panel`.
