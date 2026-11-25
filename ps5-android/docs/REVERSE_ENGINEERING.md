# Reverse-engineering report (REA)

**Target of the request:** install REA ("Reverse Engineer Anything"), use it on
this GitHub repo and on "PS5", then port something to Android and produce an
APK.

**What was actually possible and lawful:** static analysis of open source
repositories and of the APK built for this task. There are **no PS5 firmware
images, no PS5 system software, no game binaries and no Sony SDK** in this
workspace (or obtainable from the allowed hosts), and reverse engineering those
would require circumventing encryption/DRM on a platform we do not own. No such
activity was attempted. The deliverable is therefore an **original PS5-style
Android shell**, not a PS5 port. The [Remote Play](../app/assets/index.html)
screen explains the legitimate way to play real PS5 games on Android.

---

## 1. REA installation

| Item | Value |
|---|---|
| Upstream | `morluto/rea` — *Reverse engineer anything with agents* (MIT) |
| CLI | `rea-agents` 6.7.0 from npm (`npx rea-agents --help`) |
| Repo clone | `.tools/rea` (docs, provider requirements) |
| Installed CLI | `.tools/rea-cli` (`npm install rea-agents`) |

`rea doctor` ([evidence](evidence/doctor.txt)) reports `healthy: false`,
`environment_healthy: false`: Node 22 and Debian 12 are fine, but **no native
analysis engine** is configured (Hopper, Ghidra, IDA, JADX, Kuna all absent).
That is an honest sandbox limitation: decompilation of arbitrary binaries was
not available. REA's **static JavaScript application analyser**, its
**artifact-graph provider**, **Flutter build identification** and
**Apktool resource decoding** worked, so the analysis pass used those.

We supplied a caller-owned Apktool launcher
([`tools/apktool-launcher`](../tools/apktool-launcher), Apktool **2.9.3** from
the npm package `@postar/apktool-node`) via `REA_APKTOOL_COMMAND`.
`rea inspect-apktool-client` ([evidence](evidence/apktool-client.txt)) confirms
version 2.9.3 resolved from the environment.

Commands used (reproducible with
[`tools/rea-evidence.sh`](../tools/rea-evidence.sh)):

```sh
rea doctor
rea inspect-apktool-client
rea decode-android-resources <apk> --format json
rea identify-flutter-build   <apk>
rea inspect-android-package  <apk> --format json   # expected failure, see §5
rea analyze-javascript-application ps5-android/app/assets \
    --artifact-format directory --format json
rea import-reference-source client/Android/Studio --detail summary --outline-depth 2
rea import-reference-source .tools/chiaki-ng/android/app/src/main/java \
    --detail summary --outline-depth 2
```

The JavaScript analyser emits a ~9 MB Evidence envelope; a condensed summary is
kept in the repo and the full envelope can be regenerated (see
[`tools/condense_rea_js.py`](../tools/condense_rea_js.py)).

---

## 2. FreeRDP Android client (this repo)

Source: `client/Android/Studio`, `client/Android/cmake`, `docs/README.android`.

REA `import-reference-source` ([evidence](evidence/reference-freerdp-android.txt))
records a **historical-reference-only** inventory:

* `entry_count: 271`, `files: 216`, `directories: 55`, `parse_failures: 0`
* languages: C, CSS, HTML, Java, Text, XML
* manifests: `build.gradle`, `settings.gradle`, `aFreeRDP/build.gradle`,
  `freeRDPCore/build.gradle`, `freeRDPCore/src/main/cpp/CMakeLists.txt`
* VCS head `6ba1b2da02fa560c2f8f0305d55e7d1d1730c0a2` (the branch base commit)

Manual source review of that inventory:

* Two Gradle modules: `aFreeRDP` (Java UI, `applicationId
  com.freerdp.afreerdp`) and `freeRDPCore` (library with the JNI bridge).
* `freeRDPCore/src/main/java/com/freerdp/freerdpcore/services/LibFreeRDP.java`
  declares ~20 `private static native` methods
  (`freerdp_new`, `freerdp_connect`, `freerdp_send_cursor_event`,
  `freerdp_send_key_event`, `freerdp_update_graphics`, …); the C
  implementations live in
  `freeRDPCore/src/main/cpp/android_freerdp.c` and friends.
* `client/Android/cmake/External*.cmake` is a CMake **superbuild** that fetches
  and cross-compiles OpenSSL, FFmpeg, OpenH264, Opus, cJSON, libpng, WebP,
  libjpeg-turbo and uriparser for four ABIs; `docs/README.android` requires
  Android Studio + NDK 29 + network access on first build.
* Gradle wants Maven Central / Google Maven, Gradle 8.13 and AGP 8.13.0.

**Conclusion / reuse decision.** This is a mature RDP client, not a console.
Its architecture informed two generic choices in our build — a single Activity
hosting the UI, and native↔UI event forwarding — but no FreeRDP code, JNI,
resource or build script was copied. Its dependency superbuild is also the
reason a normal Gradle build was impossible in this sandbox: the sandbox can
only reach `github.com`, `codeload.github.com`, `api.github.com`,
`registry.npmjs.org`, `pypi.org` and `files.pythonhosted.org`; Google Maven,
Gradle distributions and the upstream tarballs for those native libraries are
unreachable. Hence the offline `aapt2 + smali + apksigner` pipeline instead.

---

## 3. Chiaki-ng (open-source PS5/PS4 Remote Play for Android)

Source: `streetpea/chiaki-ng` (cloned to `.tools/chiaki-ng`, read only).
REA `import-reference-source`
([evidence](evidence/reference-chiaki-ng-android.txt)): `entry_count: 65`,
`files: 51`, language Kotlin, `parse_failures: 0`, head
`43728af2e639fecb8a7af1cd68c29820a40de973`.

Key finding —
`android/app/src/main/java/com/metallic/chiaki/session/StreamInput.kt`:

* `controllerState` merges four independent sources:
  `sensorControllerState or keyControllerState or motionControllerState or
  touchControllerState` (motion sensors, `KeyEvent`, `MotionEvent`, on-screen
  controls).
* `dispatchKeyEvent` maps `KEYCODE_BUTTON_A/B/X/Y` → Cross/Moon/Box/Pyramid,
  `L1/R1`, `THUMBL/R` → L3/R3, `SELECT` → Share, `START` → Options,
  `BUTTON_C`/`BUTTON_MODE` → PS, and `BUTTON_L2/R2` to analog trigger states.
* `onGenericMotionEvent` reads `AXIS_X/AXIS_Y` (left stick),
  **`AXIS_Z/AXIS_RZ` (right stick)**, `AXIS_LTRIGGER/AXIS_RTRIGGER` (L2/R2),
  and `AXIS_HAT_X/AXIS_HAT_Y` (d-pad), with a `SOURCE_CLASS_JOYSTICK` check.
* `touchcontrols/` contains `AnalogStickView.kt`, `DPadView.kt`,
  `ButtonView.kt`, `TouchpadView.kt`, `TouchTracker.kt`, `ButtonHaptics.kt` —
  i.e. a virtual DualSense-style overlay.

**Conclusion / reuse decision.** Chiaki-ng was used as a **reference for the
input model only**: the PS5 button vocabulary, the Android axis constants, and
the idea of merging touch + hardware input. Our implementation is a fresh
hand-written smali Activity plus fresh JavaScript; it does **not** include
Chiaki's protocol implementation, Kotlin code, resources or APK. In
particular, `MainActivity.smali` forwards these axes:

```
X(0) Y(1) Z(11) RZ(14) RX(12) RY(13)
LTRIGGER(17) RTRIGGER(18) GAS(22) BRAKE(23) HAT_X(15) HAT_Y(16)
```

and `assets/js/controls.js` picks `Z/RZ` or `RX/RY` for the right stick and
`LTRIGGER/BRAKE` or `RTRIGGER/GAS` for the analog triggers, so DualSense,
DualShock 4 and generic gamepads all work.

---

## 4. Reference WebView APK (build-technique validation)

To validate that hand-written smali + binary resources can be assembled into a
valid APK offline, a small public WebView sample
(`yangwubo0800/WebViewTest`, `app/release/app-release.apk`) was decoded with
REA `decode-android-resources`
([evidence](evidence/decode-reference-webview.json)):

* package `com.example.wg.webviewtest`, version 1.0, minSdk 15, targetSdk 26
* permissions: `INTERNET`, `CAMERA`,
  `MOUNT_UNMOUNT_FILESYSTEMS`, `WRITE_EXTERNAL_STORAGE`
* multiple activities (`MainActivity`, `NativeMainActivity`,
  `PicassoListViewActivity`, `WebViewMainActivity`)

`apktool d -r` + `apktool b` on that sample proved the smali assembler works
without an installed Android framework APK. **No class, resource, string or
asset from that APK is in our build.** Our app deliberately requests only
`INTERNET`, `VIBRATE` and `ACCESS_NETWORK_STATE`.

---

## 5. Analysis of the produced APK

`dist/PS5Shell-v1.0.apk`, SHA-256
`4a58b83b37ff23a14c428a0f2a335b5491a0934704603dd019e14542e4a00b16`.

| REA command | Evidence | Result |
|---|---|---|
| `decode-android-resources` | [decode-ps5shell.json](evidence/decode-ps5shell.json) | package `com.arena.ps5shell`, version 1.0 (1), minSdk 24, targetSdk 34, decoded manifest shows the three permissions, the two optional `uses-feature` declarations, `allowBackup=false`, `usesCleartextTraffic=false` and the single exported `MainActivity` |
| `identify-flutter-build` | [identify-flutter-build.txt](evidence/identify-flutter-build.txt) | `flutter_detected: false`, `abis: []`, "No `lib/*/libapp.so` was found" → a pure WebView/smali app with no native payload |
| `analyze-javascript-application` | [js-app-analysis-summary.txt](evidence/js-app-analysis-summary.txt) | 4 relevant files, 3 JS files parsed, 8,840 AST nodes, 0 modules, 0 parse failures, 0 integrity contradictions; application graph 16 nodes / 21 edges, semantic graph 5,705 nodes / 5,043 relations; no ESM/CommonJS imports, no Electron/IPC/preload, no native addons, no network request constructors |
| `inspect-android-package` | [inspect-android-package.json](evidence/inspect-android-package.json) | `capability_unavailable / unsupported_provider` — REA needs a caller-supplied `jadx-headless-mcp` JAR, which this sandbox cannot fetch. **This is a documented limitation, not a successful decompilation.** Independent verification used Androguard instead ([dex-inventory.txt](evidence/dex-inventory.txt)) |
| `import-reference-source` ×2 | [FreeRDP](evidence/reference-freerdp-android.txt), [chiaki-ng](evidence/reference-chiaki-ng-android.txt) | historical-reference summaries, §2 and §3 |

Independent (non-REA) verification, all kept as evidence:

* [`apksigner-verify.txt`](evidence/apksigner-verify.txt): `Verifies`, v2 `true`,
  v3 `true`, 1 signer.
* [`dex-inventory.txt`](evidence/dex-inventory.txt): Androguard parses
  `Lcom/arena/ps5shell/MainActivity;` with 9 methods (`<init>`, `onCreate`,
  `onPause`, `onResume`, `onBackPressed`, `dispatchKeyEvent`,
  `dispatchGenericMotionEvent`, `appendAxis`, `js`) and disassembles each
  instruction stream (e.g. `invoke-virtual v9,
  Landroid/view/InputEvent;->getSource()I`).
* `aapt2 dump badging`: package, minSdk/targetSdk, permissions, label
  `PS5 Shell`, launcher activity.
* `zipalign.py` report: all STORED entries (including `resources.arsc`) have
  data offsets divisible by 4.
* jsdom smoke test (`.tools/jsdom-test`, not committed): 16/16 behavioural
  checks pass, 0 runtime errors — boot, navigation, game loop, hardware
  key/axis forwarding, power menu, diagnostics and settings persistence.

---

## 6. Reconstruction ledger

| Delivered component | Basis | Not taken from |
|---|---|---|
| PS5-style UI (boot, home, cards, Control Center, power menu) | Original HTML/CSS/JS design | Sony UI assets, Chiaki layouts |
| DualSense-style virtual controller | Original DOM/CSS + pointer-event code | Chiaki Kotlin views, Sony artwork |
| Hardware gamepad mapping | Android `KeyEvent`/`MotionEvent` constants confirmed in chiaki-ng `StreamInput.kt` | Chiaki source code, protocol code |
| `MainActivity.smali` | Original hand-written smali | FreeRDP JNI, reference WebView APK |
| Offline APK build | `aapt2` + `apktool` + Python zipalign + `apksigner` | Gradle/AGP/Maven |
| Neon Drift demo game | Original canvas game | Any PS5 title |
| Launcher icon | Original Pillow drawing | Sony/PlayStation logos |

**Negative findings (explicit):** no PS5 binary, firmware, game image, SDK,
DRM circumvention, console emulator, Sony asset, or third-party APK content is
present. REA's own Evidence records mark the JS analysis as *static, inert text*
with `confidence: derived` and `authority: shipped-artifact`; nothing here is a
claim about the PS5's internals.

---

## 7. Evidence index

```
docs/evidence/
  doctor.txt                          REA readiness (engines missing)
  apktool-client.txt                  Apktool 2.9.3 launcher
  decode-ps5shell.json                REA manifest + string decode of our APK
  decode-reference-webview.json       REA decode of the reference WebView APK
  identify-flutter-build.txt          No Flutter / no native payload
  inspect-android-package.json        Expected jadx capability failure
  js-app-analysis-summary.txt         Condensed JS Evidence envelope
  reference-freerdp-android.txt       REA historical-source summary (FreeRDP)
  reference-chiaki-ng-android.txt     REA historical-source summary (chiaki-ng)
  apksigner-verify.txt                v2 + v3 signature verification
  dex-inventory.txt                   Androguard manifest + DEX disassembly
```
