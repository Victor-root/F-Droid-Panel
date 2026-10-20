# Test fixtures

Tools that build real F-Droid repositories for tests, using only distribution packages and the real fdroidserver. Nothing generated here is committed: fixtures are rebuilt from these scripts.

Requirements (Debian or Ubuntu): `aapt`, `zipalign`, `apksigner`, `android-sdk-platform-23`, `default-jdk-headless`, `git`, and fdroidserver in a virtual environment.

```bash
python3 tools/fixtures/make_repos.py --out /tmp/fixtures --fdroid /path/to/venv/bin/fdroid
```

| Fixture | Situation covered |
| --- | --- |
| `empty` | freshly created repository, no app |
| `small` | two apps, three versions |
| `archive` | `archive_older: 1`, older versions moved to `archive/` |
| `localized` | texts and graphics in `metadata/<appid>/<locale>/` for `en-US` and `fr-FR` |
| `categories` | custom categories with an icon and a French translation |
| `hand-written` | metadata with comments and non canonical indentation, texts in the YAML file |
| `signer-conflict` | a second version signed by another key, left out by `AllowedAPKSigningKeys` |

After building, the script checks every fixture's published index (versions in `repo/` and `archive/`, plus localized values), so a change of behaviour in fdroidserver fails the build.

`make_apk.py` builds one minimal signed APK and can be used on its own (`--help`).
