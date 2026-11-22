# TropicaliaCraft Launcher (monorepo)

Launcher do TropicaliaCraft para **desktop (Windows/Linux/macOS) e Android**, com todas as bases
que usamos (Rust e Java) dentro de um repositório só.

| Pasta | O que é | Upstream original |
|---|---|---|
| `tropicalia-launcher/` | App Tauri v2 + SvelteKit (UI, Rust). Desktop e casca Android | — (nosso) |
| `tools/pojav-android/` | Runtime Java no Android (PojavLauncher + nossos patches: `com.tropicaliacraft.launcher`, RamNotice, LoadingText, ponte Tauri) | [TeamPojavLauncher/PojavLauncher](https://github.com/TeamPojavLauncher/PojavLauncher) `v3_openjdk` |
| `tools/pojav-android/glfw` | GLFW do Mojo | [MojoLauncher/glfw](https://github.com/MojoLauncher/glfw) |
| `tools/pojav-android/mojoexec` | mojoexec (+ nosso `vulkan_shim`) | [MojoLauncher/mojoexec](https://github.com/MojoLauncher/mojoexec) |
| `tools/pojav-android/sdl` | SDL do Mojo | [MojoLauncher/MojoSDL](https://github.com/MojoLauncher/MojoSDL) |
| `tools/horizon-android/` | Motor Bedrock (Rust) no Android + extração offline | [Vasysik/horizon-android](https://github.com/Vasysik/horizon-android) `android` |
| `tools/horizon-desktop/` | Motor Bedrock (Rust) no desktop + branding | [horizon-rust/horizon](https://github.com/horizon-rust/horizon) `main` |
| `tools/*.py`, `tools/horizon-patches/` | Scripts de patch/ícones usados no build | — (nosso) |
| `tropicalia-launcher-lab/` | Pesquisa e documentação de arquitetura | — (nosso) |

A landing page, o backend e o painel continuam em
[gusdslara/tropicaliacraft-fe-be](https://github.com/gusdslara/tropicaliacraft-fe-be).

## Build

Os scripts usam os mesmos caminhos relativos de antes (`../../tools/pojav-android` a partir de
`tropicalia-launcher/scripts`). Veja `tropicalia-launcher/README.md`.

## Puxar novidades dos originais

Cada base é um `git subtree --squash`: o nosso código fica no nosso Git, e as mudanças do
original entram como merge por cima dos nossos patches.

```bash
scripts/update-upstream.sh pojav          # ou horizon-android, horizon, glfw, mojoexec, sdl
scripts/update-upstream.sh all
```

Conflitos aparecem como num merge normal: resolva, `git add` e `git commit`.

> Edite os arquivos com fim de linha LF (o `.gitattributes` garante isso) para não gerar
> diferenças falsas contra o upstream.
