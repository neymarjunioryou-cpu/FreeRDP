# PS5 Shell — Android APK

An original, community-built Android app that recreates the **feel** of a modern
console: boot splash, home screen with a horizontal card row, Control Center, a
full DualSense-style touch controller, hardware gamepad support, and a bundled
small HTML5 game so every control can be tried immediately.

> **Read this first:** this is **not a PlayStation 5 emulator**, and it **cannot
> run PS5 games**. It contains no Sony firmware, SDK, game binaries, artwork,
> logos or trademarks. PS5 titles are signed/encrypted x86-64 programs tied to
> the console's custom AMD APU and operating system; no PS5 emulator for Android
> exists, and reverse engineering the console or a commercial game would require
> those protected binaries and breaking DRM. To play your **own** PS5 games on an
> Android device, stream them from your console with
> [Chiaki-ng](https://github.com/streetpea/chiaki-ng) or the official
> [PS Remote Play](https://www.playstation.com/remote-play/) app — the in-app
> **Remote Play** screen walks you through it.

---

## The APK

| | |
|---|---|
| File | [`dist/PS5Shell-v1.0.apk`](dist/PS5Shell-v1.0.apk) |
| Size | 91,026 bytes |
| SHA-256 | `4a58b83b37ff23a14c428a0f2a335b5491a0934704603dd019e14542e4a00b16` |
| Package | `com.arena.ps5shell` |
| Version | 1.0 (versionCode 1) |
| minSdk / targetSdk | 24 (Android 7.0) / 34 (Android 14) |
| Signature | APK Signature Scheme **v2 + v3**, self-signed debug key (`keystore/debug.jks`, password `android`) |
| Launcher | `com.arena.ps5shell.MainActivity`, locked to landscape |

**Install**

```sh
adb install -r ps5-android/dist/PS5Shell-v1.0.apk
```

Or copy the APK to the phone, open it and allow "Install unknown apps" for your
file manager. Android will warn that the app is signed with a user/debug
certificate — that is expected for a locally built APK. Because it is signed
with `keystore/debug.jks`, keep that file if you want to publish updates that
can be installed over this build.

**Verify**

```sh
$JAVA_HOME/bin/java -jar apksigner.jar verify --verbose ps5-android/dist/PS5Shell-v1.0.apk
sha256sum ps5-android/dist/PS5Shell-v1.0.apk
```

---

## What's inside

* **Boot splash** → animated home screen, live clock, profile, status icons.
* **Home** → featured game card, six navigable tiles, D-pad/keyboard focus.
* **Neon Drift** → a small, original HTML5 canvas game (90-second score run).
* **Full virtual controller** → left/right analog sticks (drag), L3/R3,
  d-pad, △ ○ × □, L1/R1, **analog** L2/R2 pressure bars, touchpad with swipe
  and tap, Share, Create, Options, PS and Mic/Mute.
* **Hardware gamepad** → `MainActivity.smali` forwards Android `KeyEvent`
  buttons and `MotionEvent` axes into JS (`ARENA.key` / `ARENA.axis`), covering
  DualSense / DualShock 4 / generic controllers. DOM keyboard and the standard
  Gamepad API are additional fallbacks.
* **Control Center** → haptics, sound, overlay pinning, brightness, quick nav.
* **Power menu**, **Settings** (size, opacity, sensitivity, left-handed layout,
  accent colour, persisted in `localStorage`), **Game Library**,
  **Remote Play guide**, **Controller test** (live input diagnostics),
  **About/Legal**.
* Haptics (`navigator.vibrate`), synthesised UI sounds (WebAudio), and
  history-based Back (the UI uses `pushState`, so the system Back key steps
  through screens and finally exits).

### Control map

| Action | Touch overlay | Gamepad | Keyboard |
|---|---|---|---|
| Move | left stick / d-pad | left stick / hat | WASD / arrows |
| Aim | right stick | right stick | IJKL |
| Confirm | ✕ | A / Cross | Enter / K |
| Cancel / back | ○ | B / Circle | Esc / J |
| Dash | ✕ | A / Cross | Space |
| Boost | R2 (drag) | R2 | C |
| Brake / focus | L2 (drag) | L2 | Z |
| Fire | R1 | R1 | E |
| Shield | L1 | L1 | Q |
| Pause | Options | Start | O |
| Restart | △ | Y / Triangle | I |
| Control Center | Share | Select | X |
| Power menu | PS | Mode / PS | P |
| Toggle overlay | Touchpad tap | — | T |

---

## What was *not* done, and why

* No PS5 firmware, system software, SDK, game image, asset or logo was
  obtained, decrypted, disassembled or copied. There is nothing to reverse
  engineer here: none of those binaries were supplied, and they are protected
  by law and by the platform's encryption.
* No console emulator was written. A PS5 emulator would need x86-64 emulation,
  a custom GPU/APU, the PS5 kernel and its APIs; that does not exist for
  Android.
* REA was used for **legitimate static analysis** of open source projects and of
  the APK produced here. See [`docs/REVERSE_ENGINEERING.md`](docs/REVERSE_ENGINEERING.md)
  and the raw output in [`docs/evidence/`](docs/evidence/).

"PlayStation", "PS5" and "DualSense" are trademarks of Sony Interactive
Entertainment. This project is not affiliated with, endorsed by or sponsored by
Sony.

---

## How it was built (and how to rebuild it)

The APK is built **without Gradle, Android Studio, Maven or the Google
toolchain downloads**. REA (`morluto/rea`, npm `rea-agents` 6.7.0) was installed
as requested and used for the analysis pass; see the report.

Pipeline ([`tools/build.py`](tools/build.py)):

1. `aapt2 compile` + `aapt2 link` → binary `AndroidManifest.xml`,
   `resources.arsc`, compiled `res/` (uses a real `android.jar` as `-I`).
2. `apktool b` → assembles the hand-written
   [`app/smali/com/arena/ps5shell/MainActivity.smali`](app/smali/com/arena/ps5shell/MainActivity.smali)
   into `classes.dex` and packs it with the binary resources and
   `app/assets/`.
3. [`tools/zipalign.py`](tools/zipalign.py) → pure-Python 4-byte alignment of
   all STORED entries (`resources.arsc`), because the bundled `zipalign`
   binary needs `libc++.so` which is absent in many minimal images.
4. `apksigner` → v2 + v3 signature, then `apksigner verify`, `aapt2 dump
   badging` and an APK entry check.

### Bootstrap in a restricted sandbox (github.com / npm / pypi only)

Everything below came from allowed hosts. `tools/bootstrap.sh` reproduces it:

```sh
# Java runtime (PyPI)
pip3 install --target .tools/jdk jdk4py==21.0.8.2

# REA (npm) + upstream repo for docs
npm install --prefix .tools/rea-cli rea-agents
git clone --depth 1 https://github.com/morluto/rea.git .tools/rea

# aapt2 / apktool / apksigner / zipalign (npm packages ship the binaries)
npm pack --pack-destination .tools/pkgs androidjs-builder@2.3.2 @postar/apktool-node@0.3.4

# android.jar (GitHub, sparse blob fetch)
git clone --depth 1 --filter=blob:none --no-checkout \
  https://github.com/Sable/android-platforms.git .tools/android-platforms
cd .tools/android-platforms && git cat-file -p HEAD:android-34/android.jar > ../buildtools/android-34.jar

# reference PS5 Android project (inspiration only, nothing copied)
git clone --depth 1 https://github.com/streetpea/chiaki-ng.git .tools/chiaki-ng
```

Then:

```sh
python3 ps5-android/tools/make_icons.py     # original launcher icons (Pillow)
python3 ps5-android/tools/build.py          # -> ps5-android/dist/PS5Shell-v1.0.apk
sh ps5-android/tools/rea-evidence.sh        # refresh docs/evidence
```

`build.py` resolves every tool from an env var first (`JAVA`, `AAPT2`,
`APKTOOL_JAR`, `APKSIGNER_JAR`, `ANDROID_JAR`, `KEYTOOL`), so on a machine with
a normal Android SDK you can point it at `$ANDROID_HOME/build-tools/34.0.0/aapt2`,
`$ANDROID_HOME/platforms/android-34/android.jar`, etc. A ready-to-copy GitHub
Actions example is at
[`ci/ps5-shell-apk.yml.example`](ci/ps5-shell-apk.yml.example); copy it to
`.github/workflows/` on a branch whose push credentials include the
`workflows` permission (this session's GitHub App token does not, which is why
it is shipped as an example rather than an active workflow).

### Adding your own HTML5 game

1. Put your game in `app/assets/games/<name>/` (classic `<script>` tags, no
   network dependencies; WebView loads `file://`).
2. Add a tile in `app/assets/index.html` and a `data-action` handler in
   `app/assets/js/app.js` (or point the tile at an existing screen).
3. Read `window.Input` (see `app/assets/js/controls.js`) for sticks, buttons
   and triggers.
4. Rebuild. You can also replace `PS5Game` in `app/assets/js/game.js`.

---

## Licence

The code and artwork in `ps5-android/` are original and released under the
[MIT licence](LICENSE). The surrounding FreeRDP repository remains under its
own Apache-2.0 licence. REA, Chiaki-ng and FreeRDP were **read as reference
only**; no source from them is included in this app.
