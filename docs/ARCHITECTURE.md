# Architecture

Status: **design proposal**, nothing is implemented yet. This document describes what the project is, the choices made and why, and the points still open. It is the reference every implementation phase (see [ROADMAP.md](ROADMAP.md)) builds on.

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
* Administration: users, roles, sessions, API tokens for CI uploads.
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

---

## 3. High level view

```text
                 Browser (admin UI, SPA)
                         |
                  HTTPS (reverse proxy, or built-in)
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
     Served to F-Droid clients by: existing web server,
     or by the panel itself (optional, see 7.3)
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
* `ruamel.yaml`: round-trip YAML (keeps comments, order and formatting of hand written files).
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

Python 3.10+ (fdroidserver itself needs 3.9+), a headless JDK (`jar`, `jarsigner`, `keytool`) and `apksigner`, all required by fdroidserver to sign the index. No Android SDK is required for a binary repository (see 13.1).

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
| Create a repository | `fdroid init --no-prompt` in an empty directory, then guided edit of `config.yml` |
| Import a repository | read only scan: `config.yml`, keystore presence and fingerprint, metadata, APK list, index age |
| Publish | `fdroid update` (with `--create-metadata` for new apps, `--use-date-from-apk` when relevant), then index signature check, then optional `fdroid deploy` |
| Validate metadata | `fdroid lint` and `fdroid rewritemeta` in dry run, results shown per app |
| Mirrors | edit the deploy settings in `config.yml`, run `fdroid deploy` as a job |

Every call runs as a job (section 8) with a timeout, an isolated environment, the repository directory as working directory, and the full output captured.

### 6.4 Secrets passed to fdroidserver

Keystore passwords are not written in clear in `config.yml` for repositories the panel creates. They are stored in a root-only file (`/etc/fdroid-panel/secrets/<repo-id>.env`, mode 600, owned by the panel user) and passed to `fdroid` through environment variables, using fdroidserver's `{env: VAR}` syntax in `config.yml` (available since fdroidserver 2.4.0, see 13.1). For an imported repository, its existing `config.yml` is left exactly as it is unless the user chooses to migrate the passwords out of it.

---

## 7. Deployment topologies

The installer asks which one applies. All of them are first class.

### 7.1 Behind an existing reverse proxy (most common for self-hosters)

The panel listens on `127.0.0.1:<port>` or on a LAN address. The existing proxy (nginx, Caddy, Traefik, HAProxy, Nginx Proxy Manager, another LXC) forwards to it. The repository files are served by the existing web server, exactly as today. The installer prints a ready to paste snippet for nginx and Caddy, including the upload size limit (`client_max_body_size`) that large APKs need.

Trusted proxy addresses are configured so the panel reads the real client IP from `X-Forwarded-For` only from those addresses.

### 7.2 Standalone with automatic HTTPS

For a server with a public domain and nothing else: the installer can install **Caddy**, which obtains and renews a Let's Encrypt certificate by itself, and configures it to serve both the panel and the repository files. No certificate handling in the panel itself.

### 7.3 Who serves the repository files

* **Existing web server** (default when one is detected): the panel only writes files.
* **The panel itself**, optional: serves `repo/` and `archive/` read only at a public path, with proper cache headers, and optionally HTTP Basic authentication for private repositories (users managed in the panel). Meant for small setups without a web server; documented as such.

### 7.4 Panel URL vs repository URL

Kept separate on purpose. The admin panel can live on a private network or a different host name (`panel.example.lan`) while the repository is public (`fdroid.example.org`), or both on the same host under different paths. The installer never assumes one domain.

### 7.5 Private repositories

The F-Droid client supports HTTP Basic authentication in the repository URL. A private repository is therefore: repository files protected by Basic authentication at the web server level. The panel:

* marks the repository as private in its registry,
* if it serves the files itself (7.3), manages the access accounts in the UI,
* otherwise, documents the web server configuration and builds the shareable "add repository" link and QR code with the credentials placeholder.

---

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
5. File moved into `repo/` with the conventional name, metadata created if it is a new app.
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
* **Repository**: tabs for Apps, Activity (jobs and audit log), Settings, Mirrors, Share (repository URL, fingerprint, QR code, "add to F-Droid" link).
* **App**: header with icon, name, package, latest version; tabs for Details (localized texts with a language switcher per field), Graphics (icon, feature graphic, screenshots with drag and drop ordering per locale and per device type), Versions (table with signer, SDK, size, date, archive or delete), Links and license, Categories and anti-features.
* **Upload**: global drop zone available on every repository screen; dropping a file anywhere starts the pipeline of 8.3.
* **Publish drawer**: pending changes list, publish button, live log, result with clear success or failure explanation.
* **Administration**: users and roles, API tokens, sessions, appearance (accent color, default theme and language), panel updates (current and latest version).
* **First run wizard**: create the first admin (with the one time setup code printed by the installer), then "import an existing repository" or "create a new one".

### 9.3 Theme

* Three modes: **Light**, **Dark**, **Automatic** (default). Automatic follows the operating system setting and **reacts live** when it changes (`prefers-color-scheme` media query listener), without reload.
* The chosen mode is stored per user (server side) and cached locally so the very first paint uses the right theme (a tiny inline script in the HTML sets the class before the app loads: no white flash in dark mode).
* All colors are semantic CSS variables (`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--accent-contrast`, `--success`, `--warning`, `--danger`...). No component uses a raw color.

### 9.4 Accent color

* Default: Android green `#3DDC84`.
* **Not hard coded**: the accent is a single setting. An administrator sets the default for the whole panel; each user can override it for themselves (to be decided, see 14).
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

* **Process isolation**: dedicated system user `fdroid-panel`, no login shell, no sudo. systemd hardening: `NoNewPrivileges`, `ProtectSystem=strict` with explicit `ReadWritePaths` (data dir and registered repository dirs only), `PrivateTmp`, `ProtectHome` (unless a repository lives in a home directory, then explicitly allowed), restricted address families, `UMask=0027`.
* **File permissions**: keystore and secrets files mode 600 owned by the panel user. Repository `repo/` and `archive/` readable by the web server group; `config.yml`, `metadata/` and the keystore are not. The installer and the import wizard detect wrong permissions and offer to fix them, never silently.
* **Keys never leave through the web layer**: no API endpoint returns key material or keystore passwords. Only the certificate fingerprint is shown.
* **Authentication**: local accounts, Argon2id hashes, sessions in HttpOnly, Secure, SameSite=Strict cookies, CSRF tokens on state changing requests, login rate limiting and temporary lockout, optional TOTP two factor authentication, re-authentication for sensitive actions (key export, user management, deleting a repository).
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
   * listening address and port;
   * topology: behind an existing reverse proxy / standalone with Caddy and automatic HTTPS / local network only, plain HTTP;
   * fdroidserver: use the detected one or install a managed one;
   * data directory.
4. Summary panel, confirmation.
5. Steps: system packages (apt, dnf, zypper, pacman depending on the distribution), system user, directories and permissions, download and verify the release, Python virtual environment, database initialisation, systemd unit, optional Caddy, start, health check.
6. Final panel: panel URL, the **one time setup code** to create the first admin in the browser, what to configure on the reverse proxy if relevant.

No password is ever asked in the terminal or written in a log: the first admin is created in the browser with the setup code.

### 11.3 Update

Download the latest release (or a chosen one), verify it, stop the service, back up the database, replace the application files, run migrations, start, health check, and **roll back automatically** to the previous version if the health check fails. Repositories are never touched by an update.

### 11.4 Uninstall

Two levels, like the Proxmox-Tools scripts:

* remove the service and application, **keep** the data directory and every repository;
* remove everything the panel created, including its data directory, **still never deleting a repository directory**, its keys or its APKs unless the user types the repository path to confirm each one.

### 11.5 Supported systems

* **Tier 1** (tested in CI on every release): Debian 12, Debian 13, Ubuntu 22.04, Ubuntu 24.04.
* **Tier 2** (best effort, community tested): Fedora, Rocky/Alma Linux, openSUSE, Arch.
* x86_64 and arm64 (Raspberry Pi class hardware).
* Containers: works in LXC (privileged or not) and VMs. A Docker image is a candidate for a later phase (see 14).

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
packaging/              systemd unit, Caddy and nginx templates
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

### 13.2 Still to verify in phase 0

* Which fdroidserver version each tier 1 distribution ships (Debian 12/13, Ubuntu 22.04/24.04), and whether their `apksigner` package works with it.
* Exact behaviour of `fdroid update --create-metadata` on a repository with hand written metadata (must never overwrite it).
* What `fdroid update` does when a new APK is signed by a different key than existing versions (the panel blocks it earlier anyway).
* Locking: whether fdroidserver takes any lock of its own, to align the panel's repository lock with it.
* Behaviour of `ruamel.yaml` round trip on real world `config.yml` and metadata files (comments, anchors, multi line strings), compared byte for byte with what fdroidserver's own `rewritemeta` produces.

---

## 14. Open decisions

Decisions to take with the maintainer before phase 1. Each has a recommendation.

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Project name: "F-Droid Panel" uses the F-Droid name. | Keep it but state clearly in the README that the project is not affiliated with or endorsed by F-Droid, and do not use the F-Droid logo. Check the F-Droid project's stance on the name before the first public release. |
| D2 | License. The repository currently has MIT; the Proxmox-Tools repository uses AGPL v3. | AGPL v3 for a network service (anyone offering a modified panel as a service must share changes), or keep MIT for maximum adoption. Maintainer's choice. |
| D3 | Accent color scope: global only, or per user override too. | Global default set by an admin, plus a per user override. |
| D4 | Docker image in addition to `install.sh`. | Yes, but in a later phase, after the native install is solid. |
| D5 | Should the panel serve repository files itself (7.3) in v1, including Basic auth for private repos? | Yes, as an option, because it removes the need for a web server on small setups. |
| D6 | Minimum supported fdroidserver version. | 2.4.0 (see 13.1). Systems with an older distribution package use the managed fdroidserver. |
| D7 | Multi user from v1, or single admin first. | Multi user with roles from v1: retrofitting permissions later is costly. |
| D8 | Building from source (`fdroid build`). | Out of scope for v1. |
