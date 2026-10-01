# Forge — Android app

A native shell around the published site (https://basdhaweio.github.io/forge/) plus a **home-screen widget** and
**long-press shortcuts**. Same pattern as the Library app: the app loads the live site, so pushes reach it without an
APK update, and CI builds the APK.

## Install / update

Newest build, always at the same URL (open it on the phone, allow installs from that source once):

https://github.com/basdhaweio/forge/releases/download/android-latest/forge.apk

Debug builds are signed with the committed `app/debug.keystore` (the standard well-known debug key, the same file as the
Library app), so a newer APK installs over an older one. Native changes (widget layout, shortcuts) need a new APK;
changes to the site do not.

## Your data

Forge keeps everything in the page's own storage, and the app's WebView is a separate store from Chrome's. Moving over
once: in the browser version, **Settings → Your data → Download backup**; in the app, the welcome screen's **restore a
backup file** (or Settings → Your data → Restore). Or connect sync on both. `allowBackup=false` keeps the sync token out
of Android cloud backups, so sync or a backup file is the way to keep a copy.

## What the shell does

- WebView on the live site; off-site links (the GitHub token page) open in the browser; back walks the page's history.
- `window.ForgeAndroid` (MainActivity.Bridge):
  - `widget(json)`: the page's summary for the widget, sent after every change (js/native.js).
  - `saveFile(name, text)`: "Download backup" opens Android's save dialog.
  - `theme(dark)`: the system bars take the page's background.
- File inputs (Import / Restore) open Android's file picker.
- Opens on an action URL from the widget or a shortcut — `#/do/water`, `#/do/pt`, `#/do/fast`, `#/do/log` — and the
  page does the logging (js/native.js `act`). If the app is already open, only the hash moves.

## The widget (`ForgeWidget`)

Drawn from the last summary the page sent, so it needs no network: streak and freezes, level and the XP bar, today's
quests and the next session, protein (or "fast day"), water, and a running fast as a live clock. A summary from
yesterday shows as a fresh day; the system's 30-minute refresh takes care of midnight. Buttons: water (your usual size),
PT done, fast, log. Nothing is written from the widget itself — every tap opens the app.

## Building locally

```sh
cd android
./gradlew assembleDebug     # needs ANDROID_HOME or android/local.properties
# → app/build/outputs/apk/debug/app-debug.apk
```
