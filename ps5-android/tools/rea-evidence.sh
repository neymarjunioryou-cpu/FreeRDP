#!/bin/sh
# Regenerate the REA evidence bundle in ps5-android/docs/evidence/.
#
# Requires:
#   .tools/rea-cli  (npm install rea-agents)
#   .tools/buildtools/apktool-2.9.3.jar + a Java runtime (see apktool-launcher)
#   .tools/webview-ref/app/release/app-release.apk (reference APK, optional)
#
# Usage:  REA=/path/to/rea sh ps5-android/tools/rea-evidence.sh
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT="$ROOT/ps5-android/docs/evidence"
REA=${REA:-"$ROOT/.tools/rea-cli/node_modules/.bin/rea"}
APK="$ROOT/ps5-android/dist/PS5Shell-v1.0.apk"
REF="$ROOT/.tools/webview-ref/app/release/app-release.apk"
ASSETS="$ROOT/ps5-android/app/assets"
export REA_APKTOOL_COMMAND="$ROOT/ps5-android/tools/apktool-launcher"

mkdir -p "$OUT"
"$REA" doctor                          > "$OUT/doctor.txt" 2>&1 || true
"$REA" inspect-apktool-client         > "$OUT/apktool-client.txt" 2>&1 || true
"$REA" decode-android-resources "$APK" --format json > "$OUT/decode-ps5shell.json" 2>&1 || true
"$REA" identify-flutter-build "$APK"  > "$OUT/identify-flutter-build.txt" 2>&1 || true
"$REA" inspect-android-package "$APK" --format json > "$OUT/inspect-android-package.json" 2>&1 || true
if [ -f "$REF" ]; then
  "$REA" decode-android-resources "$REF" --format json > "$OUT/decode-reference-webview.json" 2>&1 || true
fi
"$REA" analyze-javascript-application "$ASSETS" --artifact-format directory --format json \
    > "$OUT/js-app-analysis-full.jsonl" 2>&1 || true
python3 "$ROOT/ps5-android/tools/condense_rea_js.py" \
    "$OUT/js-app-analysis-full.jsonl" "$OUT/js-app-analysis-summary.txt"
"$REA" import-reference-source "$ROOT/client/Android/Studio" --detail summary --outline-depth 2 \
    > "$OUT/reference-freerdp-android.txt" 2>&1 || true
if [ -d "$ROOT/.tools/chiaki-ng/android/app/src/main/java" ]; then
  "$REA" import-reference-source "$ROOT/.tools/chiaki-ng/android/app/src/main/java" \
      --detail summary --outline-depth 2 > "$OUT/reference-chiaki-ng-android.txt" 2>&1 || true
fi
echo "evidence written to $OUT"
