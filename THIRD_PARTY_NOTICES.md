# Third-party notices

TropicaliaCraft Launcher stands on the work of several open-source projects. This file lists
every project whose code is vendored in this repository or shipped inside a release build,
with its authors, license and where the license text lives.

Our own code is MIT-licensed (see [`LICENSE`](LICENSE)). Code under `tools/` keeps the license
of the project it comes from; our modifications to those files are released under that same
license.

> The in-app **Ajustes → Créditos e licenças** screen shows the same list.

## Vendored projects (git subtrees under `tools/`)

Each one is imported with `git subtree --squash`, so the upstream commit is recorded in the
history (`git log --grep "Squashed 'tools/"`). `scripts/update-upstream.sh` pulls new upstream
versions.

| Path | Project | Authors | License | Upstream commit |
|---|---|---|---|---|
| `tools/pojav-android/` | [PojavLauncher](https://github.com/PojavLauncherTeam/PojavLauncher) (`v3_openjdk`) | PojavLauncher Team and contributors | [LGPL-3.0](tools/pojav-android/LICENSE) | `917a026` |
| `tools/pojav-android/glfw/` | [GLFW](https://github.com/MojoLauncher/glfw), MojoLauncher fork | Marcus Geelnard, Camilla Löwy, MojoLauncher | [zlib](tools/pojav-android/glfw/LICENSE.md) | `7900e19` |
| `tools/pojav-android/sdl/` | [SDL](https://github.com/MojoLauncher/MojoSDL), MojoLauncher fork | Sam Lantinga and SDL contributors, MojoLauncher | [zlib](tools/pojav-android/sdl/LICENSE.txt) | `cd7eddd` |
| `tools/pojav-android/mojoexec/` | [mojoexec](https://github.com/MojoLauncher/mojoexec) | Maksim Belov (MojoLauncher) | [MIT](tools/pojav-android/mojoexec/LICENSE) | `5a60f9e` |
| `tools/horizon-desktop/` | [Horizon](https://playhorizon.dev) (originally `github.com/horizon-rust/horizon`, no longer online) | Ludovic Marie and the Horizon contributors | [MIT](tools/horizon-desktop/LICENSE) | `2f0c808` |
| `tools/horizon-android/` | [Horizon Android](https://github.com/starling-client/starling) (originally `Vasysik/horizon-android`) | Vasysik, Ludovic Marie and the Horizon contributors | [MIT](tools/horizon-android/LICENSE) | `6eca278` |

Horizon and Horizon Android carry their own notices for the code they vendor (wgpu-hal, naga,
mimalloc, Pixelify Sans, Pixelarticons and others):
[`tools/horizon-desktop/THIRD_PARTY_NOTICES.md`](tools/horizon-desktop/THIRD_PARTY_NOTICES.md) and
[`tools/horizon-android/THIRD_PARTY_NOTICES.md`](tools/horizon-android/THIRD_PARTY_NOTICES.md).
PojavLauncher lists its dependencies in
[`tools/pojav-android/README.md`](tools/pojav-android/README.md#credits--dependencies).

### LGPL-3.0: the modified PojavLauncher runtime

The Android APK contains a **modified** PojavLauncher (package `com.tropicaliacraft.launcher`,
Tauri bridge, RAM notice, loading text, Horizon and Pumpkin integration, `vulkan_shim` in
mojoexec). As the LGPL-3.0 requires:

- The complete corresponding source of the runtime shipped in each release is
  [`tools/pojav-android/`](tools/pojav-android) at that release's tag, together with the build
  scripts in [`tropicalia-launcher/scripts/`](tropicalia-launcher/scripts) (`prepare-pojav.py`
  applies our patches on top of it). Every GitHub Release links to the exact tree.
- You may modify that source, rebuild it and replace the runtime in the APK with your own build.
- The full license text is in [`tools/pojav-android/LICENSE`](tools/pojav-android/LICENSE)
  (LGPL-3.0, which incorporates the GPL-3.0).

## Components downloaded or bundled at build time

| Component | Authors | License | How it is used |
|---|---|---|---|
| [Pumpkin](https://github.com/Pumpkin-MC/Pumpkin) | Pumpkin-MC contributors | [GPL-3.0](https://github.com/Pumpkin-MC/Pumpkin/blob/master/LICENSE) | Unmodified official binary. Desktop: downloaded when you create a Rust server. Android: bundled in the APK as `libpumpkin.so` (release `0.2.2+26.3-26.60`, SHA-256 checked). Source: the [matching upstream tag](https://github.com/Pumpkin-MC/Pumpkin/tree/0.2.2%2B26.3-26.60). It runs as a separate program. |
| [OpenJDK (MojoLauncher build)](https://github.com/MojoLauncher/android-openjdk-build-multiarch) | Oracle and OpenJDK contributors | [GPL-2.0 with Classpath Exception](https://openjdk.org/legal/gplv2+ce.html) | Java runtime inside the Android APK. |
| PojavLauncher dependencies (GL4ES, Holy GL4ES, MobileGlues, LWJGL, OpenAL Soft, bhook, authlib-injector, …) | see upstream | see [PojavLauncher credits](tools/pojav-android/README.md#credits--dependencies) | Bundled by the PojavLauncher Gradle build. |

## Launcher app (`tropicalia-launcher/`)

The desktop and Android app is built with these libraries (full dependency trees are in
`tropicalia-launcher/bun.lock` and `tropicalia-launcher/src-tauri/Cargo.lock`):

| Library | License |
|---|---|
| [Tauri](https://tauri.app) and its plugins (`opener`, `http`, `store`, `dialog`) | MIT or Apache-2.0 |
| [Svelte](https://svelte.dev) and [SvelteKit](https://kit.svelte.dev) | MIT |
| [Tailwind CSS](https://tailwindcss.com) | MIT |
| [Lucide](https://lucide.dev) icons (`lucide-svelte`) | ISC |
| [Pixelarticons](https://github.com/halfmage/pixelarticons) by Gerrit Halfmann | MIT |
| [three.js](https://threejs.org) | MIT |
| [qrcode](https://github.com/soldair/node-qrcode) | MIT |
| [reqwest](https://github.com/seanmonstar/reqwest), [serde](https://serde.rs), [zip](https://github.com/zip-rs/zip2), [sysinfo](https://github.com/GuillaumeGomez/sysinfo), [keyring](https://github.com/hwchen/keyring-rs), [toml_edit](https://github.com/toml-rs/toml), RustCrypto `sha1`/`sha2` | MIT or Apache-2.0 |
| Minecraft-style fonts in `tropicalia-launcher/static/fonts/` ([Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) is SIL OFL 1.1) | see font files |

## Trademarks

Minecraft is a trademark of Mojang Synergies AB. TropicaliaCraft Launcher is **not an official
Minecraft product** and is not approved by or associated with Mojang or Microsoft. No Minecraft
game files are included in this repository or in any release: the game is downloaded from
Mojang's servers with the player's own Microsoft account, which must own Minecraft: Java Edition.
