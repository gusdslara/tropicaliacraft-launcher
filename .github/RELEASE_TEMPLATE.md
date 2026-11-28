## TropicaliaCraft Launcher {{TAG}}

A Minecraft launcher for Windows, Linux, macOS and Android with two ways to play: the Rust
engine [Horizon](https://playhorizon.dev) and the original Minecraft: Java Edition (on Android
through a modified [PojavLauncher](https://github.com/PojavLauncherTeam/PojavLauncher) runtime).

### Downloads

| Platform | File |
|---|---|
| Windows 10/11 x64 | `TropicaliaLauncher_*_x64-setup.exe` (recommended) or `TropicaliaLauncher_*_x64_en-US.msi` |
| Linux x64 | `TropicaliaLauncher_*_amd64.AppImage` or `TropicaliaLauncher_*_amd64.deb` |
| macOS Apple Silicon | `TropicaliaLauncher_*_aarch64.dmg` |
| macOS Intel | `TropicaliaLauncher_*_x64.dmg` |
| Android 9+ (arm64) | `TropicaliaLauncher-*-android-arm64.apk` |

Verify downloads with `sha256sum -c SHA256SUMS.txt --ignore-missing`.

- **macOS:** the app is not notarized. Right-click → **Open** the first time, or run
  `xattr -dr com.apple.quarantine /Applications/TropicaliaLauncher.app`.
- **Android:** the APK is signed with the project's release key. If you installed an earlier
  debug build, **uninstall it once** before installing this one (Android refuses to update an app
  signed with a different key). Your worlds in the app's private storage are removed with it, so
  back them up first.
- **iOS:** not available. The Java and Horizon runtimes need native code execution that iOS does
  not allow for sideloaded apps.

### Source code of the LGPL-3.0 runtime

The Android APK contains a modified PojavLauncher runtime (LGPL-3.0). Its complete source for this
release is
[`tools/pojav-android` at {{TAG}}](https://github.com/gusdslara/tropicaliacraft-launcher/tree/{{TAG}}/tools/pojav-android),
with the build scripts in
[`tropicalia-launcher/scripts` at {{TAG}}](https://github.com/gusdslara/tropicaliacraft-launcher/tree/{{TAG}}/tropicalia-launcher/scripts).
The bundled Pumpkin server (GPL-3.0) is the unmodified official binary; its source is the
[upstream tag](https://github.com/Pumpkin-MC/Pumpkin/tree/0.2.2%2B26.3-26.60).

### Credits

PojavLauncher Team (LGPL-3.0) · MojoLauncher: glfw, MojoSDL, mojoexec (zlib/MIT) · Horizon by
Ludovic Marie and the Horizon contributors (MIT) · Vasysik for Horizon Android (MIT) · Pumpkin
(GPL-3.0). Full list in
[THIRD_PARTY_NOTICES.md](https://github.com/gusdslara/tropicaliacraft-launcher/blob/{{TAG}}/THIRD_PARTY_NOTICES.md)
and in the app under **Ajustes → Créditos e licenças**.

### Disclaimer

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
Minecraft is a trademark of Mojang Synergies AB. No game files are included: Minecraft is
downloaded from Mojang's servers with your own Microsoft account, which must own Minecraft: Java
Edition.
