# F-Droid Panel

A self-hosted web dashboard to manage one or more [F-Droid](https://f-droid.org) repositories from your browser: add apps by drag and drop, publish new versions, edit texts, icons and screenshots in every language, and publish the signed index, without using the command line.

> **Status: early development.** Everything up to the installer works and is tested, but there is no stable release yet: the installer offers the development build, rebuilt after every change that passes the tests. See the [roadmap](docs/ROADMAP.md).

> [!IMPORTANT]
> F-Droid Panel is an independent community project. It is **not affiliated with, endorsed by or supported by the F-Droid project**. "F-Droid" is used only to describe what this software works with. Please do not ask the F-Droid team for help with this panel.

## Install

On a Debian 12 or 13, or Ubuntu 22.04 or 24.04 server (x86_64 or arm64, a VM or an LXC container is fine), as root:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Victor-root/F-Droid-Panel/main/install.sh)
```

The script installs everything the panel needs (Python, Java, `apksigner`, `git`, a tested copy of fdroidserver, optionally Caddy for automatic HTTPS), asks how the panel is reached (behind your reverse proxy, standalone with HTTPS, or plain HTTP for a local test) and prints a one-time setup code. Open the address it shows, type the code, and create your administrator account: everything else happens in the browser.

Run the same command again for its menu: update (with an automatic return to the previous version if the new one does not start), status, repair, password reset, reverse proxy snippets and uninstall. Updates can also be installed from the browser, in Settings, System.

Details: [installation guide](docs/INSTALL.md).

## What it does

* **Several repositories**, public or private (phones sign in with an access account), each on its own address under the same domain. Import existing repositories without changing their address or signing key, or create new ones.
* **Apps**: drop APK files anywhere on the page; the panel checks the signature, the version and new permissions before adding them. Each app has its store page (texts per language, icon, banners, screenshots in order), its versions and its details (links, license, categories, warnings).
* **Publishing** builds and signs the index with fdroidserver, verifies it, and keeps the previous index to go back to.
* **Accounts** with roles, two-step verification and an activity log.
* **Interface** in English and French, light and dark themes following the system, with an accent color you choose.

## Documentation

* [Installation guide](docs/INSTALL.md)
* [Architecture and decisions](docs/ARCHITECTURE.md)
* [Roadmap](docs/ROADMAP.md)

## Credits

F-Droid Panel relies on [fdroidserver](https://gitlab.com/fdroid/fdroidserver) by the F-Droid project to build and sign repositories, uses [Tabler Icons](https://tabler.io/icons), and many other open source projects: see [CREDITS.md](CREDITS.md).

## License

[MIT](LICENSE)
