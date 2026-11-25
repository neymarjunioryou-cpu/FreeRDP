#!/usr/bin/env python3
"""Build PS5Shell.apk completely offline (no Gradle / Android Studio).

Pipeline
--------
  aapt2  compile+link  -> binary AndroidManifest.xml + resources.arsc + res/
  apktool b            -> assembles hand-written smali into classes.dex and
                          packs it together with the binary resources + assets/
  zipalign (Python)    -> 4-byte align every STORED entry (resources.arsc)
  apksigner            -> APK Signature Scheme v2 + v3, debug key
  apksigner verify     -> validate the result

Every external tool is resolved from an environment variable first, then the
sandbox bootstrap directory (../.tools), then PATH / a standard Android SDK.
See README.md ("Reproducing the build") for how the sandbox toolchain is
assembled from PyPI, npm and GitHub only.

Usage:  python3 ps5-android/tools/build.py [--work DIR] [--out FILE]
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
ROOT = PROJECT.parent
TOOLS = ROOT / ".tools"
sys.path.insert(0, str(HERE))
from zipalign import align, report  # noqa: E402

PACKAGE = "com.arena.ps5shell"
APP_NAME = "PS5 Shell"
VERSION_NAME = "1.0"
VERSION_CODE = 1
MIN_SDK = 24
TARGET_SDK = 34


def resolve(env_name: str, candidates: list[Path], shutil_name: str = "") -> str:
    """Resolve an external binary/jar from env, bootstrap dir or PATH."""
    explicit = os.environ.get(env_name)
    if explicit:
        if not Path(explicit).exists():
            raise SystemExit(f"{env_name} points to a missing file: {explicit}")
        return str(explicit)
    for c in candidates:
        if c and Path(c).exists():
            return str(c)
    if shutil_name:
        found = shutil.which(shutil_name)
        if found:
            return found
    raise SystemExit(
        f"Missing {env_name}. Set {env_name}=/path/to/tool or run the bootstrap "
        f"commands in ps5-android/README.md."
    )


def run(cmd: list[str], *, quiet: bool = False) -> str:
    print("  $ " + " ".join(str(x) for x in cmd))
    p = subprocess.run([str(x) for x in cmd], capture_output=True, text=True)
    out = (p.stdout or "") + (p.stderr or "")
    if p.returncode != 0:
        print(out)
        raise SystemExit(f"command failed ({p.returncode}): {cmd[0]}")
    if not quiet:
        # aapt2 is chatty on stderr; keep only meaningful lines
        for line in out.splitlines():
            if line.strip() and "LoadedArsc.cpp" not in line:
                print("    " + line.strip())
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--work", default=str(TOOLS / "ps5-build"))
    ap.add_argument("--out", default=str(PROJECT / "dist" / "PS5Shell-v1.0.apk"))
    ap.add_argument("--keystore", default=str(PROJECT / "keystore" / "debug.jks"))
    args = ap.parse_args()

    work = Path(args.work).resolve()
    out = Path(args.out).resolve()
    keystore = Path(args.keystore).resolve()
    work.mkdir(parents=True, exist_ok=True)
    out.parent.mkdir(parents=True, exist_ok=True)
    keystore.parent.mkdir(parents=True, exist_ok=True)

    bt = TOOLS / "buildtools"
    jdk = TOOLS / "jdk" / "jdk4py" / "java-runtime"
    java = resolve("JAVA", [jdk / "bin" / "java", Path("/usr/bin/java")], "java")
    aapt2 = resolve("AAPT2", [bt / "aapt2_64"], "aapt2")
    apktool = resolve("APKTOOL_JAR", [
        TOOLS / "pkgs" / "x" / "androidjs-builder-2.3.2" / "package" / "build_tools" / "apktool.jar",
        TOOLS / "buildtools" / "apktool.jar",
    ])
    apksigner = resolve("APKSIGNER_JAR", [bt / "apksigner_29_0_2.jar"])
    android_jar = resolve("ANDROID_JAR", [
        bt / "android-34.jar",
        bt / "android.jar",
    ])
    keytool = resolve("KEYTOOL", [jdk / "bin" / "keytool"], "keytool")

    app = PROJECT / "app"
    print(f"\n=== 1/6  aapt2: compile + link resources ===")
    res_zip = work / "res.zip"
    base_apk = work / "base.apk"
    run([aapt2, "compile", "--dir", app / "res", "-o", res_zip])
    run([
        aapt2, "link", "-o", base_apk, "-I", android_jar,
        "--manifest", app / "AndroidManifest.xml", "-R", res_zip,
        "--auto-add-overlay",
        "--min-sdk-version", MIN_SDK, "--target-sdk-version", TARGET_SDK,
        "--version-code", VERSION_CODE, "--version-name", VERSION_NAME,
    ])

    print("=== 2/6  assemble apktool project ===")
    proj = work / "project"
    if proj.exists():
        shutil.rmtree(proj)
    proj.mkdir(parents=True)
    with zipfile.ZipFile(base_apk) as z:
        for name in z.namelist():
            target = proj / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(name))
    if (app / "smali").exists():
        shutil.copytree(app / "smali", proj / "smali")
    if (app / "assets").exists():
        shutil.copytree(app / "assets", proj / "assets")
    (proj / "apktool.yml").write_text(
        "!!brut.androlib.meta.MetaInfo\n"
        "apkFileName: PS5Shell.apk\n"
        "compressionType: false\n"
        "doNotCompress:\n- resources.arsc\n- png\n"
        "isFrameworkApk: false\n"
        "packageInfo: null\n"
        "sdkInfo:\n  minSdkVersion: '24'\n"
        "sharedLibrary: false\n"
        "sparseResources: false\n"
        "unknownFiles: {}\n"
        "usesFramework: null\n"
        "version: 2.6.1\n"
        "versionInfo: null\n"
    )

    print("=== 3/6  apktool b (smali -> classes.dex) ===")
    unsigned = work / "unsigned.apk"
    aligned = work / "aligned.apk"
    run([java, "-jar", apktool, "b", "-f", proj, "-o", unsigned])

    print("=== 4/6  zipalign (pure Python) ===")
    align(unsigned, aligned)
    for name, method, mod in report(aligned):
        if method == 0 and mod != 0:
            raise SystemExit(f"unaligned STORED entry: {name} (offset mod 4 = {mod})")

    print("=== 5/6  apksigner (v2 + v3) ===")
    if not keystore.exists():
        run([
            keytool, "-genkeypair", "-keystore", keystore,
            "-alias", "ps5shell", "-keyalg", "RSA", "-keysize", 2048,
            "-validity", 10000, "-storepass", "android", "-keypass", "android",
            "-dname", "CN=PS5 Shell Debug, OU=Arena, O=Arena, L=Nairobi, ST=Nairobi, C=KE",
            "-storetype", "JKS",
        ], quiet=True)
        print("    created debug keystore:", keystore)
    run([
        java, "-jar", apksigner, "sign",
        "--ks", keystore, "--ks-pass", "pass:android", "--key-pass", "pass:android",
        "--min-sdk-version", MIN_SDK,
        "--v1-signing-enabled", "false",
        "--v2-signing-enabled", "true",
        "--v3-signing-enabled", "true",
        "--out", out, aligned,
    ])

    print("=== 6/6  verify ===")
    verify = run([java, "-jar", apksigner, "verify", "--verbose", out], quiet=True)
    print(verify.strip())
    if "Verifies" not in verify:
        raise SystemExit("apksigner verification failed")
    badging = run([aapt2, "dump", "badging", out], quiet=True)
    for line in badging.splitlines():
        if line.startswith(("package:", "sdkVersion:", "targetSdkVersion:",
                            "application-label:", "launchable-activity:", "uses-permission:")):
            print("    " + line)

    with zipfile.ZipFile(out) as z:
        names = z.namelist()
    for required in ("classes.dex", "resources.arsc", "AndroidManifest.xml",
                     "assets/index.html", "assets/js/controls.js",
                     "assets/js/game.js", "assets/js/app.js", "assets/css/app.css"):
        if required not in names:
            raise SystemExit(f"missing APK entry: {required}")

    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    print(f"\nOK  ->  {out}")
    print(f"       {out.stat().st_size:,} bytes   sha256 {digest}")
    print(f"       {len(names)} entries, package {PACKAGE}, minSdk {MIN_SDK}, targetSdk {TARGET_SDK}")


if __name__ == "__main__":
    main()
