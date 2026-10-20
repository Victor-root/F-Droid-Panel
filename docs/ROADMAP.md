# Roadmap

Implementation plan for the design in [ARCHITECTURE.md](ARCHITECTURE.md). Each phase ends with something that runs, is tested and is committed. A phase starts only once the previous one is validated.

## Phase 0: research and foundations

* Confirm the points of [ARCHITECTURE.md section 13.2](ARCHITECTURE.md#132-still-to-verify-in-phase-0) against real fdroidserver versions, in containers of every tier 1 distribution.
* Close the open decisions of [section 14](ARCHITECTURE.md#14-open-decisions).
* Repository skeleton: `backend/`, `frontend/`, `packaging/`, CI (lint, type checks, tests, translation completeness check, no em dash check).
* Test fixtures: a few real repositories (empty, small, with archive, with localized metadata, with custom categories, private) generated with real fdroidserver, used by every later test.

## Phase 1: design system and app shell

* Theme tokens, light, dark and automatic modes with live system follow and no flash on load.
* Accent color engine (one color in, full OKLCH scale and contrast-safe text out), default Android green.
* i18n setup with English and French, browser detection, English fallback.
* Owned UI primitives (buttons, inputs, dialogs, menus, tabs, toasts, tables, drop zone, empty states) and a living style guide page to review them in both themes and both languages.
* App shell: navigation, header, user menu, responsive layout.

Validation: the maintainer reviews the style guide and the shell on desktop and phone before any feature is built on top of them.

## Phase 2: backend core

* FastAPI application, configuration file, SQLite with migrations.
* Authentication: first run setup code, admin creation, login, sessions, CSRF, rate limiting, roles.
* Repository registry and the fdroidserver adapter (version detection, capabilities).
* Job runner with per repository queue, lock, persisted logs and live streaming.
* Audit log.

## Phase 3: repositories

* Import an existing repository (read only scan, health report, permission checks).
* Create a new repository (guided `fdroid init`, settings, key fingerprint).
* Repository settings editor (round-trip `config.yml`, backup before write).
* Publish flow with live logs, verification and rollback of the last publish.
* Share page: repository URL, fingerprint, QR code.

## Phase 4: apps and versions

* App list and app page.
* Upload pipeline: drop zone, inspection, signer and version checks, preview, confirmation.
* Metadata editor with localized texts.
* Graphics: icon, feature graphic, screenshots per locale and device type, reordering.
* Categories and anti-features.
* Versions table: inspect, archive, delete.
* Unpublished changes tracking and auto publish option.

## Phase 5: installer

* `install.sh` with the Proxmox-Tools look and green accent: install, update with automatic rollback, status, repair, reset admin, proxy snippets, uninstall at two levels.
* Optional Caddy setup for standalone HTTPS.
* Tested on every tier 1 distribution in CI, on x86_64 and arm64.

## Phase 6: integrations

* API tokens and documented CI upload (`curl`, GitHub Actions and GitLab CI examples).
* Drop folder per repository.
* Mirrors and `fdroid deploy` settings.
* Optional serving of repository files by the panel, with Basic auth for private repositories.
* Two factor authentication.

## Phase 7: release 1.0

* User guide and administrator guide, with screenshots in both themes.
* Security review (threat model, dependency audit, OWASP review of authentication and uploads).
* Release pipeline: prebuilt frontend, signed archives, changelog.
* README with screenshots, compatibility table and the one line install command.

## After 1.0 (candidates)

* Docker image.
* OIDC and trusted header authentication.
* More UI languages (community translations).
* Building from source with `fdroid build`.
