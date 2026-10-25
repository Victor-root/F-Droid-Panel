# Sending builds automatically

An upload key lets a build script add new versions of your apps to a repository, without opening the panel. With the Gradle script below, every release build made in Android Studio ends with its APK in the panel.

## What a key can do

* It belongs to **one repository** and can only **add APK files** to it: it cannot delete anything, change settings or read anything else.
* It acts for the account that created it. If that account is disabled, deleted or loses its right to write to the repository, the key stops working.
* It can be allowed to **publish after each upload**. This is a right of the key, independent of the repository's automatic publishing option: versions you add yourself in the panel keep following that option.
* The panel runs the same checks as for a file you drop in the page: same signing key as before, a version number that does not exist yet, and a warning for new permissions. A refused APK is not added.
* Every version it adds appears in the activity log with the key's name.

## Create a key

In the panel, open the repository, then **Settings**, **Automatic upload**, **Add a key**. Give it a name that says where it is used, and choose whether it publishes. The key is shown **once**, with the three lines to paste in the `local.properties` or `keystore.properties` file at the root of your Android project:

```properties
fdroidPanel.url=https://fdroid.example.org
fdroidPanel.repository=1
fdroidPanel.key=fdp_...
```

Both files stay on your computer: Android Studio keeps `local.properties` out of version control, and `keystore.properties`, where many projects keep their signing passwords, is meant to be ignored as well. Never put the key in a file you commit.

## Set up the build

1. Copy [`tools/android/fdroid-panel.gradle.kts`](../tools/android/fdroid-panel.gradle.kts) next to the `build.gradle.kts` of your app module (usually `app/`).
2. Add this line at the end of that `build.gradle.kts`:

   ```kotlin
   apply(from = "fdroid-panel.gradle.kts")
   ```

From then on, `assembleRelease` (Build, Generate Signed App Bundle or APK, APK, release) ends with the `uploadToFdroidPanel` task, which:

* takes the newest signed APK in `build/outputs/apk/**/release/`, or in `release/` where the Generate Signed APK wizard copies it;
* sends it in chunks, made smaller when a reverse proxy refuses large requests;
* prints the panel's warnings, then the result: added, and published when the key may publish;
* fails the build with the reason when the panel refuses the APK, and removes the refused file from the panel.

Without a `fdroidPanel.key` line in either file, the task is skipped and builds go on as before: the same project can be built on a computer without a key.

## Version numbers

The panel refuses a version number it already has, so each build you send needs a new `versionCode`. If you do not raise it by hand, let Gradle do it, for example with the number of minutes since 1970, which always grows:

```kotlin
android {
    defaultConfig {
        versionCode = (System.currentTimeMillis() / 60_000).toInt()
    }
}
```

## Without Gradle

Any tool can do the same with four requests, each with the header `Authorization: Bearer fdp_...` (no cookie or other header is needed):

1. `POST /admin/api/repositories/{id}/uploads` with `{"filename": "app.apk", "size": 1234}` returns the upload and its `id`;
2. `PUT /admin/api/repositories/{id}/uploads/{upload}?offset=0` with the bytes of the file, repeated with the next offset until `status` is no longer `receiving`;
3. when `status` is `ready`, `POST /admin/api/repositories/{id}/uploads/{upload}/add` with `{}` adds the version and returns `publishJobId` when a publication started; when it is `rejected`, `checks.blocking` gives the reasons;
4. `DELETE /admin/api/repositories/{id}/uploads/{upload}` drops an upload you do not add.
