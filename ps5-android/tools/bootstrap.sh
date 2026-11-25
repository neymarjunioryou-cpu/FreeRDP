#!/bin/sh
# Bootstrap the offline APK toolchain using only github.com / npm / pypi.
# Run from the repository root:  sh ps5-android/tools/bootstrap.sh
#
# Hosts used: registry.npmjs.org, files.pythonhosted.org / pypi.org,
# github.com, codeload.github.com, api.github.com.
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
mkdir -p .tools/buildtools .tools/pkgs .tools/jdk .tools/rea-cli

echo "== 1/6  Java runtime (PyPI, jdk4py 21) =="
python3 -m pip install --quiet --target .tools/jdk jdk4py==21.0.8.2
JH=.tools/jdk/jdk4py/java-runtime/bin/java
"$JH" -version 2>&1 | head -2

echo "== 2/6  REA (npm) + upstream docs =="
(cd .tools/rea-cli && npm init -y >/dev/null 2>&1 || true && npm install rea-agents --silent)
if [ ! -d .tools/rea ]; then git clone --depth 1 https://github.com/morluto/rea.git .tools/rea; fi
.tools/rea-cli/node_modules/.bin/rea --help | head -3

echo "== 3/6  aapt2 + apktool + apksigner (npm packages ship the binaries) =="
cd .tools/pkgs
npm pack --silent androidjs-builder@2.3.2 >/dev/null
npm pack --silent @postar/apktool-node@0.3.4 >/dev/null
mkdir -p x/androidjs-builder-2.3.2 x/postar-apktool-node-0.3.4
tar xzf androidjs-builder-2.3.2.tgz -C x/androidjs-builder-2.3.2
tar xzf postar-apktool-node-0.3.4.tgz -C x/postar-apktool-node-0.3.4
cp x/androidjs-builder-2.3.2/package/build_tools/apktool.jar "$ROOT/.tools/buildtools/apktool-2.6.1.jar"
cp x/postar-apktool-node-0.3.4/package/lib/apktool.jar "$ROOT/.tools/buildtools/apktool-2.9.3.jar"
cp x/androidjs-builder-2.3.2/package/build_tools/uber-apk-signer.jar "$ROOT/.tools/buildtools/uber-apk-signer.jar"
cd "$ROOT/.tools/buildtools"
APKTOOL_PKG="$ROOT/.tools/pkgs/x/androidjs-builder-2.3.2/package/build_tools/apktool.jar"
unzip -o -j "$APKTOOL_PKG" 'prebuilt/linux/aapt2_64' -d . >/dev/null
unzip -o -j "$ROOT/.tools/buildtools/uber-apk-signer.jar" \
  'lib/apksigner_29_0_2.jar' -d . >/dev/null
chmod +x aapt2_64
./aapt2_64 version 2>&1 | head -1

echo "== 4/6  android.jar (GitHub sparse blob, API 34) =="
cd "$ROOT"
if [ ! -f .tools/buildtools/android-34.jar ]; then
  git clone --depth 1 --filter=blob:none --no-checkout \
    https://github.com/Sable/android-platforms.git .tools/android-platforms
  (cd .tools/android-platforms && \
    git cat-file -p HEAD:android-34/android.jar > "$ROOT/.tools/buildtools/android-34.jar")
fi
ls -la .tools/buildtools/android-34.jar

echo "== 5/6  reference PS5 Android project (inspiration only) =="
if [ ! -d .tools/chiaki-ng ]; then
  git clone --depth 1 https://github.com/streetpea/chiaki-ng.git .tools/chiaki-ng
fi
if [ ! -d .tools/webview-ref ]; then
  git clone --depth 1 https://github.com/yangwubo0800/WebViewTest.git .tools/webview-ref
fi

echo "== 6/6  Python helpers =="
python3 -m pip install --quiet --target .tools/pylibs Pillow androguard

echo ""
echo "Bootstrap complete. Now run:"
echo "  PYTHONPATH=$ROOT/.tools/pylibs python3 ps5-android/tools/make_icons.py"
echo "  python3 ps5-android/tools/build.py"
echo "  sh ps5-android/tools/rea-evidence.sh"
