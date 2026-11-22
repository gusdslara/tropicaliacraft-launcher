#!/usr/bin/env bash
# Puxa novidades dos repositórios originais para dentro do monorepo (git subtree --squash).
# Uso: scripts/update-upstream.sh [pojav|horizon-android|horizon|glfw|mojoexec|sdl|all]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

declare -A PREFIX=(
  [pojav]=tools/pojav-android
  [horizon-android]=tools/horizon-android
  [horizon]=tools/horizon-desktop
  [glfw]=tools/pojav-android/glfw
  [mojoexec]=tools/pojav-android/mojoexec
  [sdl]=tools/pojav-android/sdl
)
declare -A URL=(
  [pojav]=https://github.com/TeamPojavLauncher/PojavLauncher.git
  [horizon-android]=https://github.com/Vasysik/horizon-android.git
  [horizon]=https://github.com/horizon-rust/horizon.git
  [glfw]=https://github.com/MojoLauncher/glfw
  [mojoexec]=https://github.com/MojoLauncher/mojoexec
  [sdl]=https://github.com/MojoLauncher/MojoSDL
)
declare -A BRANCH=(
  [pojav]=v3_openjdk
  [horizon-android]=android
  [horizon]=main
  [glfw]=HEAD
  [mojoexec]=HEAD
  [sdl]=HEAD
)

pull() {
  local k=$1
  echo ">> $k: ${URL[$k]} (${BRANCH[$k]}) -> ${PREFIX[$k]}"
  git subtree pull --prefix="${PREFIX[$k]}" "${URL[$k]}" "${BRANCH[$k]}" --squash \
    -m "vendor: atualiza $k a partir do upstream (${BRANCH[$k]})"
}

target=${1:-}
if [[ -z "$target" ]]; then
  echo "uso: $0 [${!PREFIX[*]}|all]"; exit 1
elif [[ "$target" == all ]]; then
  for k in pojav glfw mojoexec sdl horizon-android horizon; do pull "$k"; done
else
  pull "$target"
fi
