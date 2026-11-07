# Tropicalia Launcher

Launcher de Minecraft: Java do TropicaliaCraft — **Tauri v2 + SvelteKit 5 + Tailwind 4**, com o visual
dos cards `.tp-card` (faixa de grama pixelada) da landing page.

## Rodar

```bash
npm install
npm run tauri dev      # app desktop (precisa de Rust + WebView2 no Windows)
npm run dev            # só a interface no navegador (sem Rust: ações de jogo/servidor ficam desativadas)
npm run tauri build    # instalador .msi/.exe (Windows), .deb/.AppImage (Linux), .dmg (macOS)
```

### Publicar para Windows (downloads da landing page)

```powershell
npm run publish:windows             # compila e copia para public/downloads/windows (e docs/)
npm run publish:windows -- -SkipBuild
```

**Nunca publique só o `tropicalia-launcher.exe`.** Compilado com o Rust `windows-gnu` (MinGW), ele
importa o `WebView2Loader.dll` e não abre sem ele ("WebView2Loader.dll não foi encontrado").
O script resolve isso sozinho:

- usa o target `x86_64-pc-windows-msvc` quando o Visual Studio Build Tools (C++) está instalado — aí
  o loader fica embutido e o `.exe` funciona sozinho (`rustup target add x86_64-pc-windows-msvc`);
- publica o portátil como `TropicaliaLauncher-portable.zip` (`.exe` + `WebView2Loader.dll` + LEIA-ME);
- os instaladores (`-setup.exe` e `.msi`) já incluem o DLL;
- se o `.exe` depender do DLL, `TropicaliaLauncher.exe` vira uma cópia do instalador, para links antigos
  continuarem funcionando.

Copie `.env.example` para `.env` e preencha `VITE_MS_CLIENT_ID`, ou cole o Client ID em **Ajustes**.

## O que tem

| Módulo | Onde | Detalhes |
| --- | --- | --- |
| Design system | `src/app.css`, `src/lib/components/` | TropicaliaCard, PixelButton (pedra/esmeralda/ouro), Badge, TabSelector, Toggle, ProgressBar estilo XP, Modal, ConsoleView |
| Contas | `services/microsoft-auth.ts`, `AccountsModal.svelte` | Device Code (código de 8 dígitos + QR) → Xbox Live → XSTS → Minecraft; refresh token no cofre do SO (`keyring`); perfis offline com UUID v3 igual ao do servidor |
| Instâncias | `routes/instancias`, `state.svelte.ts` | Vanilla, Fabric, Quilt, Forge, NeoForge; clonar; exportar `.mrpack`/`.zip`; toggle de mods (`.disabled`); RAM, JVM args, resolução, entrar direto num servidor |
| Motor do jogo | `src-tauri/src/game.rs`, `java.rs`, `download.rs` | Manifesto da Mojang, merge `inheritsFrom`, bibliotecas/natives/assets com SHA-1 e download paralelo, Java oficial da Mojang por versão, instalador Forge/NeoForge headless (`--installClient`), @argfile para classpaths longos |
| Modrinth | `services/modrinth.ts`, `routes/explorar` | Mods, texturas, shaders, data packs, modpacks e plugins; filtros por loader/versão/categoria; dependências obrigatórias resolvidas e instaladas juntas; modpacks `.mrpack` viram instância |
| Servidores | `src-tauri/src/server.rs`, `routes/servidores` | Magma, Mohist, Arclight (híbridos), Paper, Purpur, Fabric; EULA em 1 toggle; `server.properties` visual; console em tempo real com comandos; plugins/mods do Modrinth |
| Bandeja | `src-tauri/src/tray.rs` | Abrir · status do servidor · parar servidor · fechar tudo; esconde ao jogar e volta quando o jogo fecha; fechar a janela com jogo/servidor ativo só esconde |

Dados ficam em `%APPDATA%/com.tropicaliacraft.launcher/` (`shared/` = layout `.minecraft`, `instances/`, `servers/`, `runtimes/`).

## Pendências conhecidas

- **Login Microsoft** exige Client ID do Azure aprovado pela Mojang (passo a passo em Ajustes).
- **Magma e Mohist**: as APIs de download mudam com frequência; se falhar, cole a URL do JAR no assistente. Arclight (GitHub), Paper (Fill v3 com fallback v2), Purpur e Fabric são resolvidos automaticamente.
- **Túnel**: hoje o launcher mostra o IP da LAN e guia o uso do playit.gg; o agente integrado ainda não.
- **Bedrock / Amethyst** e **Android** (serviço em primeiro plano + notificação) ainda não foram implementados.
- O Rust foi validado com `cargo check`/`cargo test` no Linux; rode `npm run tauri dev` no Windows para o primeiro teste real de jogo.

## Testes

```bash
cd src-tauri && cargo test     # caminhos maven, regras de SO, merge inheritsFrom, server.properties
npx svelte-check               # tipos do frontend
```
