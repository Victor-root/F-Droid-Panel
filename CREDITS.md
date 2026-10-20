# Credits

F-Droid Panel stands on the work of many projects. Thank you to all of them.

F-Droid Panel is an independent project, not affiliated with, endorsed by or supported by the F-Droid project.

## Installed next to the panel

These programs are not part of F-Droid Panel: `install.sh` installs them on the server, under their own licenses.

| Project | What it does here | License |
| --- | --- | --- |
| [fdroidserver](https://gitlab.com/fdroid/fdroidserver) by the F-Droid project | builds and signs the repositories; the panel calls it | AGPL-3.0-or-later |
| [androguard](https://github.com/androguard/androguard) | reads APK files, through fdroidserver | Apache-2.0 |
| [apksigner](https://developer.android.com/tools/apksigner) from the Android SDK build tools | checks APK signatures | Apache-2.0 |
| [Caddy](https://caddyserver.com), when chosen | automatic HTTPS | Apache-2.0 |

## Interface

| Project | License |
| --- | --- |
| [Tabler Icons](https://tabler.io/icons) | MIT |
| [Inter](https://rsms.me/inter/) and [JetBrains Mono](https://www.jetbrains.com/lp/mono/) fonts | OFL-1.1 |
| [React](https://react.dev) | MIT |
| [Radix UI](https://www.radix-ui.com) | MIT |
| [TanStack Query and Router](https://tanstack.com) | MIT |
| [Tailwind CSS](https://tailwindcss.com), [tailwind-merge](https://github.com/dcastil/tailwind-merge), [clsx](https://github.com/lukeed/clsx) | MIT |
| [class-variance-authority](https://cva.style) | Apache-2.0 |
| [i18next](https://www.i18next.com), react-i18next, i18next-browser-languagedetector | MIT |
| [dnd kit](https://dndkit.com) | MIT |
| [Motion](https://motion.dev) | MIT |
| [uqr](https://github.com/unjs/uqr) | MIT |
| [get-nonce](https://github.com/theKashey/get-nonce) | MIT |

## Server

| Project | License |
| --- | --- |
| [FastAPI](https://fastapi.tiangolo.com), [Pydantic](https://docs.pydantic.dev) | MIT |
| [Starlette](https://www.starlette.io), [Uvicorn](https://www.uvicorn.org) | BSD-3-Clause |
| [SQLAlchemy](https://www.sqlalchemy.org), [Alembic](https://alembic.sqlalchemy.org) | MIT |
| [argon2-cffi](https://argon2-cffi.readthedocs.io) | MIT |
| [PyOTP](https://pyauth.github.io/pyotp/) | MIT |
| [ruamel.yaml](https://yaml.dev/doc/ruamel.yaml/) | MIT |
| [segno](https://github.com/heuer/segno) | BSD-3-Clause |

## Installer

The logo is drawn after the [Omnify](https://github.com/Victor-root/Omnify) logo, and the look and structure of `install.sh` come from [Proxmox-Tools](https://github.com/Victor-root/Proxmox-Tools), both by the same author.

The complete list of dependencies, with exact versions, is in `frontend/package-lock.json`, `backend/uv.lock` and `packaging/`.
