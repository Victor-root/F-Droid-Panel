# Architecture

Status: **design agreed**, implementation not started. This document describes what the project is, the choices made and why. It is the reference every implementation phase (see [ROADMAP.md](ROADMAP.md)) builds on.

---

## 1. Goal and scope

F-Droid Panel is a self-hosted web application to administer one or more [F-Droid](https://f-droid.org) repositories from a browser, without using the `fdroid` command line or editing YAML files by hand.

Target user: someone running a Linux server who wants to distribute Android apps (their own, their company's, a family's) through an F-Droid repository, public or private. They know how to run an install script and point a domain at a server. They do not know fdroidserver.

### 1.1 In scope (v1)

* **Binary repositories**: repositories built from APK files the user already has (the "simple binary repository" mode of fdroidserver). This covers self-hosted repos in the vast majority of cases.
* Several repositories in one panel, each one independent (own keys, own URL, own settings).
* Importing an existing repository without changing its keys, its signing, its metadata or its history.
* Creating a new repository from scratch, guided.
* Apps: add by drag and drop, new versions, edit metadata (localized), icons, screenshots, feature graphic, categories, anti-features, links, author, license.
* Versions: list, inspect (signer, permissions, SDK levels, size, hash), archive, delete.
* Publishing: regenerate and sign the index, then deploy to optional mirrors, as a tracked job with live logs.
* History: every publish and every change is logged, with who did it, and can be inspected.
* Serving the repository files to F-Droid clients, including private repositories with access accounts managed in the panel.
* Administration: users, roles, sessions, API tokens for CI uploads.
* Maintenance from the browser: panel and fdroidserver updates, service health.
* Installer, updater and uninstaller as one interactive `install.sh`.

### 1.2 Out of scope (v1), possibly later

* Building apps from source (`fdroid build`, build server, `checkupdates`). Large, fragile, needs an Android SDK and sandboxing. Can be studied after v1.
* Download statistics (would need web server log parsing).
* Being a public app store front page (the F-Droid client is the store; the panel is the back office). A small public "add this repository" page with a QR code is in scope.

### 1.3 Non-goals

* Replacing fdroidserver. The panel drives the official tool and keeps the repository in the exact on-disk format fdroidserver expects, so a user can stop using the panel at any time and keep working with the command line.
* Owning the data. The repository directory stays the source of truth (see section 4).

---

## 2. Guiding principles

1. **The repository on disk is the truth.** The panel never keeps a second copy of app metadata in a database. It reads and writes the same files fdroidserver uses. A change made with the command line shows up in the panel, and the other way round.
2. **Never destroy what exists.** No existing `config.yml`, keystore, metadata file or APK is overwritten without a backup taken first. Importing a repository is read-only until the user explicitly saves something.
3. **fdroidserver is a dependency, not an implementation detail.** Index generation and signing always go through the real `fdroid` commands, never through a reimplementation. Only parsing and editing of metadata files is done by the panel itself.
4. **Least privilege.** The panel runs as its own unprivileged system user. Signing keys are readable by that user only and never leave the server through the web interface.
5. **Works on someone else's server.** No hard coded path, domain, user name, port or distribution. Everything is detected, asked, or configurable.
6. **Simple first, powerful second.** The default path (drop an APK, click publish) needs no F-Droid knowledge. Advanced settings exist but are folded away.
7. **Honest UI.** The interface never reports success before the operation is verified (index regenerated and signature checked).
8. **Command line once.** The command line is used to install. After that, every normal operation, including updates, happens in the browser. The command line remains for recovery only.

---

## 3. High level view

```text
                 Browser (admin UI, SPA)
                         |
          HTTPS (existing reverse proxy, or Caddy)
                         |
   +---------------------+------------------------------+
   |              F-Droid Panel service                  |
   |                                                     |
   |  HTTP API  ---  Auth & sessions  ---  Audit log     |
   |      |                                              |
   |  Repo manager  ---  Metadata engine (YAML, files)   |
   |      |                                              |
   |  Job runner (one queue per repo, live logs)         |
   |      |                                              |
   |  fdroid CLI adapter (update, signindex, deploy...)  |
   |                                                     |
   |  SQLite: users, sessions, repos registry, jobs,     |
   |          audit log, panel settings                  |
   +---------------------+------------------------------+
                         |
     Repository directories (one per repo, anywhere on disk)
       config.yml  keystore  metadata/  repo/  archive/
                         |
     repo/ and archive/ served to F-Droid clients by the
     panel itself (default), on the same address (see 7)
```

One process, one systemd service, one port. No Redis, no external database, no message broker: the target is a small server or an LXC with a few hundred MB of RAM.

---

## 4. Data model: what lives where

### 4.1 In the repository directory (owned by fdroidserver's format)

| Path | Content | Panel access |
| --- | --- | --- |
| `config.yml` | repository settings, keystore location and passwords | read, edit through a round-trip YAML editor that preserves comments and key order, backup before every write |
| keystore (`keystore.p12` or a path from `config.yml`) | the signing key | never read by the web layer; only passed to `fdroid` |
| `metadata/<appid>.yml` | app metadata | read and write, round-trip |
| `metadata/<appid>/<locale>/` | localized texts and graphics | read and write |
| `config/categories.yml` and friends | custom categories, if the fdroidserver version supports it | read and write |
| `repo/` | published APKs, icons, signed index | APKs added and removed by the panel, everything else produced by `fdroid update` |
| `archive/` | older versions | same as `repo/` |
| `tmp/`, `unsigned/`, `stats/` | fdroidserver internals | ignored |

Exact paths and supported keys depend on the fdroidserver version. The panel detects the version per repository and only shows features that version supports (see 6.2).

### 4.2 In the panel's own data directory (`/var/lib/fdroid-panel` by default)

* `panel.db` (SQLite): users, password hashes, sessions, API tokens (hashed), repository registry (name, path, fdroid binary, options), jobs and their logs, audit log, panel settings (accent color, default language, ...).
* `staging/`: uploads in progress, before they are validated and moved into a repository.
* `repos/`: default location of the repositories created by the panel (imported repositories stay where they are).
* `backups/`: snapshots taken before every write and every publish (see 8.4).

### 4.3 In the panel's configuration (`/etc/fdroid-panel/panel.toml`)

Only what is needed to start: listen address and port, data directory, trusted proxy settings, base URL, log level. Everything else is edited in the UI and stored in the database.

---

## 5. Technology choices

### 5.1 Backend: Python 3 + FastAPI

| Option | For | Against |
| --- | --- | --- |
| **Python + FastAPI** (chosen) | fdroidserver is Python: same runtime already on the server, same YAML library family, same APK parser (`androguard`) available; async, typed, automatic OpenAPI schema; very common, easy for contributors | needs a virtual environment |
| Go | single static binary, easy to ship | duplicates YAML round-trip and APK parsing in another ecosystem, still needs Python for fdroidserver anyway |
| Node.js | same language as the frontend | same duplication, and one more runtime on the server |

Key libraries (indicative, pinned at implementation time):

* `fastapi` + `uvicorn`: HTTP server.
* `pydantic`: validation of every input.
* `ruamel.yaml`: round-trip YAML (keeps comments, order and block scalars of hand written files, written in fdroidserver's canonical indentation; see [research](research/phase-0.md#6-editing-yaml-without-damaging-hand-written-files)).
* `androguard`: APK inspection (package name, version, signer certificate, permissions, SDK levels, icon), same library fdroidserver uses.
* `sqlalchemy` + `alembic`: database access and schema migrations across panel updates.
* `argon2-cffi`: password hashing.
* `pyotp`: optional two factor authentication.

The panel never imports fdroidserver's internal Python modules for write operations: their API is not stable between versions. It calls the `fdroid` command and parses files itself.

### 5.2 Frontend: React + TypeScript + Vite, Tailwind CSS, Radix primitives

| Option | For | Against |
| --- | --- | --- |
| **React + TS** (chosen) | largest ecosystem of accessible UI primitives, drag and drop, charts, i18n; easiest to find contributors | heavier than Svelte |
| Svelte 5 / SvelteKit | lighter, elegant | smaller ecosystem of accessible components |
| Server rendered (HTMX, Jinja) | no build step | a rich, animated, app-like UI is much harder |

Libraries:

* **Tailwind CSS v4** with design tokens as CSS variables (theme and accent color, see 9).
* **Radix UI primitives** (dialogs, menus, tabs, tooltips, popovers, toasts) with our own styling, following the shadcn/ui approach: components are copied into the project and fully owned.
* **TanStack Query** for server state, **TanStack Router** for typed routes.
* **react-i18next** + `i18next-browser-languagedetector` for translations.
* **@tabler/icons-react** for icons ([Tabler Icons](https://tabler.io/icons), MIT).
* **Motion** (Framer Motion) for transitions, always respecting `prefers-reduced-motion`.
* **dnd-kit** for reordering screenshots, `react-dropzone` for file drops.

The frontend is built in CI and shipped **prebuilt** inside the release archive. Servers never need Node.js.

### 5.3 Runtime footprint

Python 3.10+ (fdroidserver itself needs 3.9+), a headless JDK (`jar`, `jarsigner`, `keytool`) and `apksigner`, all required by fdroidserver to sign the index, and `git` (fdroidserver fails to start without it). No Android SDK is required for a binary repository (see 13.1).

---

## 6. fdroidserver integration

### 6.1 Which fdroidserver

Each registered repository has a `fdroid` executable associated with it. Two modes:

* **Managed** (default for new installs): the installer creates a dedicated virtual environment `/opt/fdroid-panel/fdroidserver-venv` with a known good fdroidserver version from PyPI. Updated with the panel, version pinned and tested.
* **System**: use an existing `fdroid` already installed (distribution package, pip, pipx, a custom path). This is what an existing setup like "fdroidserver installed with pip, SDK installed separately" uses. The panel detects it, reads its version and warns if it is older than the minimum supported version.

### 6.2 Version detection and capabilities

On registration and on every start, the panel runs `fdroid --version` for each repository and computes a capability set (for example: custom categories supported, index v2 produced, anti-features file supported). The UI hides or disables what the version cannot do and explains why, instead of failing at publish time.

A supported version range is declared and tested in CI against several fdroidserver releases.

### 6.3 Operations

| Panel action | Underlying operation |
| --- | --- |
| Create a repository | `fdroid init --no-prompt` with explicit key alias and distinguished name in an empty directory, then the keystore passwords are moved out of `config.yml` (6.4) and the guided settings (URL, name, description, icon) are written |
| Import a repository | read only scan: `config.yml`, keystore presence and fingerprint, metadata, APK list, index age |
| Publish | `fdroid update` (`--use-date-from-apk` when relevant), then index signature check, then a comparison of the APK files present with the versions actually indexed, then optional `fdroid deploy` |
| Validate metadata | `fdroid lint` and `fdroid rewritemeta` in dry run, results shown per app |
| Mirrors | edit the deploy settings in `config.yml`, run `fdroid deploy` as a job |

Every call runs as a job (section 8) with a timeout, an isolated environment, the repository directory as working directory, and the full output captured.

### 6.4 Secrets passed to fdroidserver

Keystore passwords are not written in clear in `config.yml` for repositories the panel creates. They are stored in a root-only file (`/etc/fdroid-panel/secrets/<repo-id>.env`, mode 600, owned by the panel user) and passed to `fdroid` through environment variables, using fdroidserver's `{env: VAR}` syntax in `config.yml` (available since fdroidserver 2.4.0, see 13.1). For an imported repository, its existing `config.yml` is left exactly as it is unless the user chooses to migrate the passwords out of it.

---

## 7. Serving and deployment

### 7.1 One service serves everything

Once installed, the panel is the only service a user has to care about. By default it serves, on a single address:

| Path (defaults, configurable) | Content | Access |
| --- | --- | --- |
| `/admin/` | the administration interface and its API | panel accounts (session login) |
| `/repo/`, `/archive/` | files of the first repository, read by F-Droid clients | public, or HTTP Basic authentication for a private repository |
| `/<slug>/repo/`, `/<slug>/archive/` | files of every additional repository | same, per repository |
| `/` | optional public page: repository name, description, QR code and "add to F-Droid" link | public, can be disabled |

Repository files are served read only, with correct content types and cache headers (the signed index files must never be cached for long, APKs and images can be).

**The repository URL of an imported repository never changes.** F-Droid clients identify a repository by its URL and its signing key; the import wizard reads `repo_url` from `config.yml` and maps the paths so that the existing URL keeps working exactly as before.

### 7.2 HTTPS

The panel does not handle certificates itself. Two supported setups, chosen at install time:

* **Behind an existing reverse proxy** (nginx, Caddy, Traefik, HAProxy, Nginx Proxy Manager, another LXC or VM): the proxy terminates HTTPS and forwards the whole host name to the panel. The installer prints a ready to paste snippet for nginx and Caddy, including the upload size limit (`client_max_body_size`) large APKs need. Trusted proxy addresses are configured so the panel reads the real client IP from `X-Forwarded-For` only from them.
* **Standalone**: the installer installs **Caddy**, which obtains and renews a Let's Encrypt certificate by itself and forwards to the panel.

Plain HTTP is accepted only for a local network test setup, with a permanent warning banner in the interface.

### 7.3 Private repositories

The F-Droid client supports HTTP Basic authentication in the repository URL. For a repository marked private, the panel:

* protects its files with Basic authentication,
* manages the access accounts in the interface (create, disable, rotate a password, see last use),
* builds the shareable "add repository" link and QR code including the credentials of a chosen access account.

Repository access accounts are separate from panel accounts: a phone never gets a login to the administration interface.

### 7.4 Existing web server mode

For people who already serve their repository with their own web server and want to keep it that way, a repository can be set to "files served elsewhere": the panel then only writes files and the existing web server keeps serving them. This is a per repository option, not the default.

### 7.5 Maintenance from the browser

The goal is that, after the first install, nothing needs the command line in normal use. Some maintenance actions need root (updating the panel, the managed fdroidserver or the Java tools, granting the panel access to a repository directory outside its data directory). They go through a small **privileged maintenance helper**:

* a root systemd service started on demand by a systemd path unit watching a request directory writable by the panel user,
* it accepts only a fixed list of actions, each with validated parameters (never a command or a free path from the request): update to a verified release, update the managed fdroidserver, apply permissions to a repository directory the admin confirmed,
* each run is logged and its result shown in the interface as a job,
* updating the panel itself uses the same verified, rollback-safe procedure as `install.sh` (11.3).

In the Docker image (after 1.0), the helper does not exist: the interface shows that a new version is available and how the container is updated.

## 8. Jobs, publishing and safety

### 8.1 Job runner

All operations that touch a repository (publish, deploy, import scan, lint, delete version) are jobs:

* one queue per repository, strictly sequential (a file lock in the repository directory also protects against a concurrent command line run),
* jobs across different repositories run in parallel,
* each job records: who started it, when, the exact commands, exit codes, full log, duration, result,
* logs stream live to the browser (Server-Sent Events),
* a job survives a browser refresh; a service restart marks running jobs as interrupted, never as successful.

### 8.2 Draft then publish

Edits (metadata, graphics, new versions) are applied to the repository files immediately but **the index is not regenerated until the user publishes**. The UI shows a clear "unpublished changes" state per repository with the list of pending changes. A per repository option enables **auto publish** after every change (for CI driven repositories).

### 8.3 Upload pipeline

1. Upload to `staging/` (chunked, resumable, size limit configurable).
2. Inspection with `androguard`: package name, version code and name, min/target SDK, ABIs, permissions, signer certificate fingerprint, file hash.
3. Checks, each one explained in plain words:
   * the package already exists in the repository: the signer must match the previous versions, otherwise **blocking** error (F-Droid clients refuse an update signed by another key, and it may be an attack);
   * the version code is higher than the current one, or the user confirms adding an older version;
   * the same file is not already present;
   * the APK is signed and valid.
4. Preview card ("New version 2.3.1 of MyApp, signed by the same key as before, 3 new permissions: ..."), user confirms.
5. File moved into `repo/` with the conventional name. For a new app, the panel writes the metadata file itself (fdroidserver's `--create-metadata` skeleton has unsuitable defaults) including `AllowedAPKSigningKeys`, which makes fdroidserver itself refuse any later APK signed by another key, even when run by hand.
6. Publish now, or keep as an unpublished change.

AAB files are rejected with an explanation (F-Droid distributes APKs). Split APKs are out of scope for v1.

### 8.4 Backups and rollback

* Before any write: the touched files are copied to `backups/<repo>/<timestamp>/` with a manifest and SHA-256 sums (same approach as the Proxmox-Tools scripts).
* Before any publish: the current signed index files are copied too, so the previous published state can be restored in one click if a publish produces something wrong.
* Retention is configurable (count and age). APK files are not duplicated in backups when they are not modified, to save space.
* The keystore is **never** included in automatic backups exposed to the UI. A separate, explicit "export signing key" action exists, protected by password re-entry and producing an encrypted archive, with a strong warning.

### 8.5 Drop folder and CI uploads

To support existing workflows (a folder watched by a script, a CI pipeline building APKs):

* **API tokens** scoped to one repository and to the "upload" permission, usable with a single `curl` command from CI. The upload goes through the same pipeline and checks as a manual upload.
* **Drop folder** (optional, per repository): a directory the panel watches; files appearing there go through the same pipeline. Replaces home made systemd watchers.

---

## 9. User interface

### 9.1 Principles

* Modern, colorful, calm. Generous spacing, clear hierarchy, rounded surfaces, subtle depth, smooth but short transitions.
* Every screen answers "what is the state, and what can I do now" without F-Droid vocabulary. Technical terms (version code, signer fingerprint) are shown, but with a plain explanation one hover away.
* Responsive from phone width to large screens. Keyboard accessible, visible focus, WCAG 2.2 AA contrast in both themes.
* Empty states that teach: an empty repository shows a big drop zone and three steps, not a blank table.

### 9.2 Main screens

* **Overview**: all repositories as cards (name, icon, apps count, last publish status and age, unpublished changes, signing key fingerprint short form, health warnings).
* **Repository**: tabs for Apps, Activity (jobs and audit log), Settings, Access (private repositories: access accounts), Mirrors, Share (repository URL, fingerprint, QR code, "add to F-Droid" link).
* **App**: header with icon, name, package, latest version; tabs for Details (localized texts with a language switcher per field), Graphics (icon, feature graphic, screenshots with drag and drop ordering per locale and per device type), Versions (table with signer, SDK, size, date, archive or delete), Links and license, Categories and anti-features.
* **Upload**: global drop zone available on every repository screen; dropping a file anywhere starts the pipeline of 8.3.
* **Publish drawer**: pending changes list, publish button, live log, result with clear success or failure explanation.
* **Administration**: users and roles, API tokens, sessions, appearance (accent color, default theme and language), maintenance (panel and fdroidserver versions, one click update, service health and logs, see 7.5).
* **About**: version, license, links, and the statement that the project is independent and not affiliated with F-Droid.
* **First run wizard**: create the first admin (with the one time setup code printed by the installer), then "import an existing repository" or "create a new one".

### 9.3 Theme

* Three modes: **Light**, **Dark**, **Automatic** (default). Automatic follows the operating system setting and **reacts live** when it changes (`prefers-color-scheme` media query listener), without reload.
* The chosen mode is stored per user (server side) and cached locally so the very first paint uses the right theme (a tiny inline script in the HTML sets the class before the app loads: no white flash in dark mode).
* All colors are semantic CSS variables (`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--accent-contrast`, `--success`, `--warning`, `--danger`...). No component uses a raw color.

### 9.4 Accent color

* Default: Android green `#3DDC84`.
* **Not hard coded**: the accent is a single setting, changed by an administrator in the panel settings and applied to the whole panel.
* From that one color, a full scale (50 to 950) is generated at runtime in the OKLCH color space, so hover, pressed, subtle backgrounds, focus rings and charts all derive from it in both themes.
* The text color on top of the accent (`--accent-contrast`) is computed automatically to keep sufficient contrast. This matters for the default: white text on Android green fails contrast rules, so dark text is used on it.
* The picker offers presets plus a free color input, with a live preview.

### 9.5 Internationalization

* UI languages at launch: **English** (reference) and **French**.
* Language selection order: user choice saved in their profile, then the browser languages (`navigator.languages`, first supported match, `fr-CA` matches `fr`), then **English** as the fallback. A missing key in a language falls back to English.
* Translation files are JSON, one per language and namespace, under `frontend/src/locales/<lang>/`. Adding a language is adding a folder; a CI check verifies every key exists in every shipped language and that no key is unused.
* Dates, numbers and file sizes use `Intl` formatting for the current language.
* Backend error messages are returned as **codes with parameters**, translated by the frontend, never as English sentences.
* Distinct from the UI language: **app metadata locales** (the languages in which an app's name, summary and description are published to F-Droid clients). The app editor supports any locale F-Droid supports, independently of the UI language.

### 9.6 Icons

Tabler Icons only (outline set), through `@tabler/icons-react`, tree shaken.

---

## 10. Security

### 10.1 Threat model summary

Assets, in order of importance: the **signing keys** (whoever has them can push malicious updates to every user of the repository), the **integrity of published APKs and index**, the **admin accounts**, the availability of the repository.

### 10.2 Measures

* **Process isolation**: dedicated system user `fdroid-panel`, no login shell, no sudo. systemd hardening: `NoNewPrivileges`, `ProtectSystem=strict` with explicit `ReadWritePaths` (data dir and registered repository dirs only, extended only through the maintenance helper after an admin confirmation), `PrivateTmp`, `ProtectHome` (unless a repository lives in a home directory, then explicitly allowed), restricted address families, `UMask=0027`.
* **File permissions**: keystore and secrets files mode 600 owned by the panel user. In existing web server mode (7.4), `repo/` and `archive/` are readable by the web server group; `config.yml`, `metadata/` and the keystore never are. The installer and the import wizard detect wrong permissions and offer to fix them, never silently.
* **Keys never leave through the web layer**: no API endpoint returns key material or keystore passwords. Only the certificate fingerprint is shown.
* **Authentication**: local accounts, Argon2id hashes, sessions in HttpOnly, Secure, SameSite=Strict cookies, CSRF tokens on state changing requests, login rate limiting and temporary lockout, optional TOTP two factor authentication, re-authentication for sensitive actions (key export, user management, deleting a repository).
* **Administration exposed on the public address**: since `/admin/` shares the host name of the repository, it is reachable from the Internet by default. Two factor authentication is proposed at the first login of every account and can be made mandatory; failed logins are rate limited per account and per IP; an optional IP allowlist restricts `/admin/` to chosen networks (for example a local network and a VPN) without affecting the repository paths.
* **Maintenance helper** (7.5): fixed list of actions, validated parameters, no shell, no free paths, every run logged.
* **Roles**: `admin` (everything), `maintainer` (apps and publishing on assigned repositories), `viewer` (read only). API tokens: per repository, per permission, hashed at rest, expirable, revocable.
* **Optional external auth**: trusted header authentication from a proxy (Authelia, Authentik, oauth2-proxy), and OIDC later. Off by default.
* **Input handling**: every upload is size limited and inspected before it reaches a repository; file names are never taken from the client; paths are resolved and confined to the repository directory (no path traversal); images are validated and re-encoded to strip metadata; YAML is parsed with safe loaders only.
* **Subprocesses**: argument lists only, never a shell string; minimal environment; timeouts.
* **HTTP**: strict Content Security Policy (no inline scripts except the hashed theme bootstrap), `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS when served over HTTPS.
* **Supply chain**: pinned and hashed Python dependencies, lockfile for the frontend, release archives with SHA-256 sums and a signature verified by the installer and the updater.
* **Audit log**: every login, failed login, change, publish, key related action, with user, IP and time.

---

## 11. Installer (`install.sh`)

One interactive Bash script, same look, structure and behaviour as the [Proxmox-Tools](https://github.com/Victor-root/Proxmox-Tools) scripts, with **green** as the accent color: ASCII banner, panels, spinner steps, `yes` confirmations for anything that writes, English by default and French when the system locale starts with `fr`, every text in both languages.

Run with:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Victor-root/F-Droid-Panel/main/install.sh)
```

**The script does the whole installation.** The only prerequisites are a supported Linux system with systemd, root access and Internet access. Everything else is installed and configured by the script itself: system packages (Python, headless JDK, `apksigner`, `git`), the managed fdroidserver, the panel, its system user, its directories and permissions, the systemd units, the maintenance helper and, when chosen, Caddy. No step of the documentation asks the user to install or edit anything by hand. After the script, the rest happens in the browser.

### 11.1 Menu

1. Install F-Droid Panel
2. Update F-Droid Panel
3. Show status (service, version, URL, repositories, fdroidserver version, disk usage)
4. Repair (re-check dependencies, permissions, service)
5. Reset an admin password / show a new setup code
6. Show the reverse proxy configuration snippet
7. Uninstall
8. Quit

### 11.2 Install flow

1. Checks: root, systemd present, supported architecture, distribution detection (`/etc/os-release`), free disk space, outbound access to GitHub and PyPI.
2. Environment report panel: distribution, Python version, existing `fdroid` command and version, Java, `apksigner`, detected web servers (nginx, Apache, Caddy) and listening ports, existing F-Droid repositories found in common places (`/srv`, `/var/www`, `/opt`, home directories: detection only, suggestion only).
3. Questions, each with a detected default:
   * public host name (the single address of the panel and the repositories);
   * HTTPS: behind an existing reverse proxy / standalone with Caddy and automatic HTTPS / local network test, plain HTTP;
   * listening address and port (only asked when behind a reverse proxy);
   * fdroidserver: use the detected one or install a managed one;
   * data directory.
4. Summary panel, confirmation.
5. Steps: system packages (apt, dnf, zypper, pacman depending on the distribution), system user, directories and permissions, download and verify the release, Python virtual environment, database initialisation, systemd unit, optional Caddy, start, health check.
6. Final panel: panel URL, the **one time setup code** to create the first admin in the browser, what to configure on the reverse proxy if relevant.

No password is ever asked in the terminal or written in a log: the first admin is created in the browser with the setup code.

### 11.3 Update

Download the latest release (or a chosen one), verify it, stop the service, back up the database, replace the application files, run migrations, start, health check, and **roll back automatically** to the previous version if the health check fails. Repositories are never touched by an update. The same procedure runs when an admin clicks "Update" in the browser (7.5).

### 11.4 Uninstall

Two levels, like the Proxmox-Tools scripts:

* remove the service and application, **keep** the data directory and every repository;
* remove everything the panel created, including its data directory, **still never deleting a repository directory**, its keys or its APKs unless the user types the repository path to confirm each one.

### 11.5 Supported systems

* **Tier 1** (tested in CI on every release): Debian 12, Debian 13, Ubuntu 22.04, Ubuntu 24.04 (managed fdroidserver install verified on all four in phase 0, see [research](research/phase-0.md#1-installation-on-the-tier-1-distributions)).
* **Tier 2** (best effort, community tested): Fedora, Rocky/Alma Linux, openSUSE, Arch.
* x86_64 and arm64 (Raspberry Pi class hardware).
* Containers: works in LXC (privileged or not) and VMs. A Docker image built by GitHub Actions comes after 1.0 (see 14).

---

## 12. Repository layout (planned)

```text
backend/                Python package (FastAPI app, jobs, fdroid adapter, metadata engine)
  fdroid_panel/
  migrations/           alembic
  tests/
frontend/               React app
  src/
    components/ui/      owned UI primitives (Radix based)
    features/           screens grouped by domain (repos, apps, uploads, admin)
    locales/en/ fr/     translations
    theme/              tokens, accent color engine
install.sh              installer, updater, uninstaller
packaging/              systemd units (service, maintenance helper and its path unit), Caddy and nginx templates
docs/                   architecture, roadmap, user guide, admin guide
.github/workflows/      lint, tests (several fdroidserver versions), build, release
```

---

## 13. fdroidserver facts the design relies on

The project rule is: never guess how fdroidserver behaves, read its source and test against real versions.

### 13.1 Verified in the fdroidserver source (master, setup.py version 2.4.2, CHANGELOG up to 2.4.4)

* **Python**: `python_requires >= 3.9`. APK parsing uses `androguard` only (3.x and 4.x), no `aapt`. YAML uses `ruamel.yaml` (YAML 1.2 since 2.3/2.4).
* **Config**: only `config.yml` is read; `config.py` support was removed in 2.4.0. Since 2.4.0 any string value can be `{env: VARNAME}`, resolved lazily (2.4.1). Default keystore is `keystore.p12` (PKCS12, RSA 4096) created by `fdroid init`.
* **Index**: `fdroid update` still writes index v0 (`index.xml`, `index.jar`), v1 (`index-v1.json`, `index-v1.jar`) and v2 (`index-v2.json`, `entry.json`, `entry.jar`, `diff/*.json`).
* **Signing needs JDK tools**: `jar`, `jarsigner` (v0/v1 index), `keytool` (key generation), plus `apksigner` (`entry.jar`, APK verification). `fdroid update` refuses to run without `(jarsigner or apksigner) and keytool`.
* **No Android SDK needed for a binary repository**: `apksigner` is looked up in `config.yml`, then in `PATH` (distribution package), then in the SDK build tools. `fdroid init` does probe the SDK and loops on a prompt unless `--no-prompt` is given, so the panel always uses `--no-prompt`.
* **Icons**: `fdroid update` extracts icons from the APKs itself into `repo/icons-<density>/` (120 to 640) and `repo/icons/`, and fills missing densities. A separate icon extraction script is not needed.
* **Localized metadata for a binary repository**: read from `metadata/<appid>/<locale>/` (`name.txt`, `summary.txt`, `description.txt`, `video.txt`, `changelogs/<versionCode>.txt`, `icon`, `featureGraphic`, `promoGraphic`, `tvBanner`, and `phoneScreenshots/`, `sevenInchScreenshots/`, `tenInchScreenshots/`, `tvScreenshots/`, `wearScreenshots/`). Images are stripped of metadata and copied to `repo/<appid>/<locale>/`. This is where the panel writes texts and graphics.
* **Categories and anti-features**: `config/categories.yml`, `config/antiFeatures.yml`, and localized variants in `config/<locale>/`, supported since 2.2/2.3, carried in index v2 only. A category icon is a bare file name relative to `config/`.
* **Repository settings**: `repo_url` must end with `/repo`, `archive_url` with `/archive`; `repo_icon` is a file name in `repo/icons/`; `archive_older` defaults to `0` (no archive).
* **Deploy targets**: `serverwebroot` (rsync), `servergitmirrors`, `awsbucket` (through rclone, credentials only from `AWS_*` environment variables), `local_copy_dir`, `github_releases`, `androidobservatory`, `virustotal_apikey`, `binary_transparency_remote`.

Consequences for the design:

* The **managed fdroidserver** targets the latest 2.4.x.
* **Minimum supported version: 2.4.0** proposed (config.yml only, `{env: VAR}` secrets, YAML 1.2). Older versions are reported by the import wizard with an offer to switch the repository to the managed fdroidserver.
* Required system packages for every install: a JDK (headless) and `apksigner`.

### 13.2 Verified in phase 0

Installation on every tier 1 distribution, `fdroid init`, `--create-metadata`, signer changes, locking and YAML round trip were tested against real fdroidserver 2.4.5. Results and their consequences are in [research/phase-0.md](research/phase-0.md); the main ones are reflected above (required `git` package, managed fdroidserver as the default, `AllowedAPKSigningKeys` pinning, metadata written by the panel, passwords moved out of `config.yml` after `init`, no lock in fdroidserver).

---

## 14. Decisions

| # | Topic | Decision |
| --- | --- | --- |
| D1 | Project name | "F-Droid Panel" for now. No public trademark policy or trademark record for "F-Droid" was found, so the README, the About screen of the interface and the installer banner state explicitly that the project is independent and not affiliated with, endorsed by or supported by the F-Droid project, and the F-Droid logo is never used. The F-Droid team is asked about the name before the first public release; the product name is a single setting in code and translations, so a rename stays cheap. |
| D2 | License | MIT. |
| D3 | Accent color | Android green by default, changed by an administrator in the panel settings, applied to the whole panel. |
| D4 | Docker | After 1.0. The image is built and published automatically by GitHub Actions on every release; `install.sh` stays the main installation path. |
| D5 | Serving repository files | The panel serves the repository files itself by default, including private repositories with access accounts (7.1, 7.3). Existing web server mode stays available per repository (7.4). |
| D6 | Minimum fdroidserver version | 2.4.0 (see 13.1). Systems with an older distribution package use the managed fdroidserver. |
| D7 | Users | Multiple users with roles from v1. |
| D8 | Building from source | Out of scope for v1, kept as a post 1.0 candidate. |
| D9 | Drop folder and CI uploads | In scope (8.5). |
| D10 | Addresses | One address for everything: administration under `/admin/`, repositories under `/repo/` (and `/<slug>/repo/` for additional ones), optional public page at `/` (7.1). |
| D11 | Daily use | Command line for the install only; everything else, including updates, from the browser (7.5). |
