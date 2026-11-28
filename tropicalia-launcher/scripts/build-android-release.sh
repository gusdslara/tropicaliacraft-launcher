#!/usr/bin/env bash
# Builds the public, release-signed Android APK on Linux/macOS (port of build-android-native.ps1 +
# build-pojav.ps1). Output: artifacts/TropicaliaLauncher-<version>-android-arm64.apk
#
#   TROPICALIA_SIGNING_PROPERTIES=~/dev/keystores/tropicaliacraft-launcher/release.properties \
#   TROPICALIA_SUPPORT=<dir with tauri-android.jar, tauri-launcher-support.jar, tauri-plugin-*.jar> \
#   scripts/build-android-release.sh [--skip-pumpkin]
#
# Needs: Android SDK (ANDROID_HOME, default ~/Android/Sdk) with an NDK, JDK 17 (Gradle 8 does not
# run on JDK 25), Rust with the aarch64-linux-android target, Bun and Python 3.
set -euo pipefail

launcher="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$launcher/.." && pwd)"
engine="$repo/tools/pojav-android"
module="$engine/app_pojavlauncher"

: "${TROPICALIA_SIGNING_PROPERTIES:?set it to the release signing properties file}"
: "${TROPICALIA_SUPPORT:?set it to the directory with the Tauri Android support jars}"
export TROPICALIA_SIGNING_PROPERTIES
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
ndk="${NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/* | sort -V | tail -1)}"
host="$(uname -s | tr '[:upper:]' '[:lower:]')-x86_64"
llvm="$ndk/toolchains/llvm/prebuilt/$host/bin"
version="$(python3 -c "import json;print(json.load(open('$launcher/package.json'))['version'])")"

# 16 KB page alignment (Android 15+) and the TLS model the Horizon engine needs.
export RUSTC_BOOTSTRAP=1
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$llvm/clang"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="-Z tls-model=global-dynamic -C link-arg=--target=aarch64-linux-android34 -C link-arg=-Wl,-z,max-page-size=16384"
export CC_aarch64_linux_android="$llvm/clang"
export CFLAGS_aarch64_linux_android="--target=aarch64-linux-android34"
export AR_aarch64_linux_android="$llvm/llvm-ar"

echo "1/5 Frontend"
(cd "$launcher" && bun install --frozen-lockfile && bun run build)

echo "2/5 libtropicalia_launcher_lib.so (Tauri, release)"
(cd "$launcher/src-tauri" && cargo build --release --locked --target aarch64-linux-android)

echo "3/5 libhorizon_android.so (Horizon, release)"
(cd "$repo/tools/horizon-android" && rustup target add aarch64-linux-android && cargo build --release --locked --package horizon-android --target aarch64-linux-android)

echo "4/5 Pojav overlay"
[[ -f "$engine/local.properties" ]] || echo "sdk.dir=$ANDROID_HOME" > "$engine/local.properties"
prepare=(--engine "$engine" --support "$TROPICALIA_SUPPORT")
[[ "${1:-}" == "--skip-pumpkin" ]] && prepare+=(--skip-pumpkin)
python3 "$launcher/scripts/prepare-pojav.py" "${prepare[@]}"
mkdir -p "$module/src/main/jniLibs/arm64-v8a"
cp "$launcher/src-tauri/target/aarch64-linux-android/release/libtropicalia_launcher_lib.so" "$module/src/main/jniLibs/arm64-v8a/"
cp -r "$launcher/build/." "$module/src/main/assets/"

echo "5/5 Gradle (assembleFullTropicalia)"
(cd "$engine" && ./gradlew :app_pojavlauncher:assembleFullTropicalia \
  -Pandroid.injected.build.abi=arm64-v8a --console=plain)

apk="$(ls "$module"/build/outputs/apk/full/tropicalia/*.apk "$module"/build/intermediates/apk/full/tropicalia/*.apk 2>/dev/null | head -1)"
mkdir -p "$launcher/artifacts"
out="$launcher/artifacts/TropicaliaLauncher-$version-android-arm64.apk"
cp "$apk" "$out"
"$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)/apksigner" verify --print-certs "$out" | head -3
echo "APK: $out"
