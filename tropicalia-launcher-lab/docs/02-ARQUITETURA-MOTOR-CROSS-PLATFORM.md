# 🏗️ Arquitetura do Motor Cross-Platform (Rust + Tauri v2)

Este documento especifica a engenharia do **Tropicalia Universal Launcher**, detalhando como uma única arquitetura em **Rust (Tauri v2)** unifica **PC (Windows, Linux, macOS)** e **Mobile (Android, iOS)** com altíssima performance e sem bibliotecas legadas.

---

## 1. Visão Geral da Arquitetura em Camadas

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   INTERFACE DE USUÁRIO (UI / UX)                       │
│    Svelte 5 (Runes) + Tailwind CSS v4 + Lucide Icons + Motion         │
│          Zero-Latency, 120 FPS, Consumo de RAM < 40MB                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC (Tauri v2 Commands & Events)
┌───────────────────────────────────▼────────────────────────────────────┐
│                  NÚCLEO DO LAUNCHER (RUST CORE)                        │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐ │
│ │  Microsoft MSA Auth  │ │ Modrinth / CF Engine │ │  Profile Manager │ │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────┘ │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐ │
│ │ JRE Auto-Provisioner │ │ Server Hybrid Engine │ │ Hardware Detect  │ │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Target Abstraction Layer
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────┐
│        DESKTOP ENGINE           │   │          MOBILE ENGINE           │
│  (Windows, Linux, macOS)        │   │        (Android & iOS)           │
├─────────────────────────────────┤   ├──────────────────────────────────┤
│ • Rust Process Builder          │   │ • JNI / C Shims (LWJGL3 / GLFW)  │
│ • OS-Specific Native Extraction │   │ • OpenJDK ARM64 Embedded Runtime │
│ • Gamemode & High Priority      │   │ • Vulkan / Zink / Turnip Mesa    │
│ • Bedrock MSIX / Amethyst Inject│   │ • Virtual Touch Controller HUD   │
│ • Linux Wayland & SteamOS Deck  │   │ • iOS JIT Handler (AltStore)     │
└─────────────────────────────────┘   └──────────────────────────────────┘
```

---

## 2. Por que Tauri v2 + Rust?

A grande maioria dos launchers populares no mercado (como o oficial da Mojang e o CurseForge) utiliza Electron ou CEF (Chromium Embedded Framework), o que resulta em:
* 400MB a 800MB de consumo de memória antes mesmo do jogo abrir.
* Tempos de inicialização lentos (3 a 8 segundos).
* Impossibilidade de rodar o mesmo código no Android e iOS.

Com **Tauri v2 + Rust**:
1. **Consumo Mínimo de RAM:** Apenas **~30MB a 45MB** em repouso.
2. **Tempo de Inicialização:** < **180ms**.
3. **Multiplataforma Unificada:** O Tauri v2 possui suporte oficial a alvos desktop (`x86_64-pc-windows-msvc`, `x86_64-unknown-linux-gnu`, `aarch64-apple-darwin`) e móveis (`aarch64-linux-android`, `aarch64-apple-ios`).
4. **Paralelismo Seguro:** O Rust permite efetuar dezenas de downloads simultâneos de texturas, bibliotecas e assets do Minecraft sem travar a interface e sem memory leaks.

---

## 3. Adaptação por Plataforma Desktop

O launcher detecta automaticamente o sistema operacional em tempo de compilação/execução e adapta o comportamento:

### A) Windows (10 e 11)
* **Arquiteturas:** Suporte nativo a `x86_64` (Intel/AMD) e `ARM64` (Snapdragon X Elite / Copilot+ PCs).
* **Gerenciamento de Processos:** Utiliza a Windows Job Object API (`CreateJobObjectW`, `AssignProcessToJobObject`) para garantir que processos zumbis do Java ou do servidor não fiquem rodando em segundo plano caso o launcher seja fechado.
* **Bedrock Edition:** Acesso à API do Windows Package Manager (UWP/MSIX). O launcher pode gerenciar perfis isolados do Bedrock e injetar mods compilados com o framework **AmethystAPI** via injeção segura de DLL (`CreateRemoteThread` / `VirtualAllocEx`).

### B) Linux & Steam Deck (SteamOS)
* **Arquiteturas:** `x86_64` e `aarch64`.
* **Gráficos:** Suporte automático tanto a **Wayland** quanto a **X11**, evitando artefatos de cursor ou problemas de foco no GLFW.
* **Steam Deck Mode:** Ao detectar execução no SteamOS ou parâmetro `--gamepad-ui`, a interface ativa automaticamente o modo de controle total por botões, com interface em tela cheia otimizada para a resolução de 1280x800 do Deck.
* **Integração Gamemode:** Se `gamemoded` estiver instalado no sistema, o launcher invoca o Java encapsulado com `gamemoderun`, garantindo prioridade máxima de CPU e GPU no escalonador do kernel Linux.

### C) macOS (Apple Silicon & Intel)
* **Arquiteturas:** `aarch64` (M1/M2/M3/M4) e `x86_64` (Macs Intel legados).
* **Java Nativo:** Garante que binários `aarch64` do OpenJDK sejam provisionados em Apple Silicon, eliminando o overhead de tradução do Rosetta 2 (ganho de até 40% de desempenho e menos calor no MacBook).
* **Renderização:** Compatibilidade com OpenGL via Metal/MoltenVK.

---

## 4. O Motor Mobile (Android e iOS)

Executar o **Minecraft Java Edition** em smartphones requer transpor as diferenças entre a arquitetura desktop (desktop OpenGL, bibliotecas x86, mouse e teclado) e a arquitetura móvel (ARM64, touch, OpenGL ES/Vulkan).

### A) Pipeline Gráfico Mobile (O Segredo do Alto Desempenho)

O Minecraft Java foi construído sobre OpenGL para desktop. No Android, os chips utilizam drivers que priorizam **Vulkan** ou **OpenGL ES**. Para obter 60+ FPS até em aparelhos de baixo custo, o launcher implementa um pipeline gráfico inteligente:

```text
                  MINECRAFT JAVA (OpenGL Desktop 3.2+)
                                    │
                                    ▼
                     ZINK (Mesa OpenGL-on-Vulkan)
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
  Dispositivo Snapdragon                        Dispositivos Mali / Exynos
     (GPU Adreno)                                      / Apple Silicon
            │                                               │
            ▼                                               ▼
   DRIVER TURNIP (Mesa)                            VULKAN OEM / MOLTENVK
(Vulkan livre com suporte a                         (Vulkan nativo da GPU
extensões modernas de shaders)                       ou Metal no iOS)
            │                                               │
            └───────────────────────┬───────────────────────┘
                                    ▼
                           TELA DO DISPOSITIVO
```

#### 1. Qualcomm Snapdragon (GPU Adreno):
* O launcher carrega dinamicamente o driver de código aberto **Turnip** (desenvolvido no projeto Mesa/Freedreno).
* **Por que?** Os drivers de fábrica da Qualcomm em muitos celulares antigos ou intermediários contêm bugs no OpenGL e travam com mods gráficos modernos (Sodium, Iris, Shaders). O Turnip oferece conformidade perfeita com Vulkan 1.3, permitindo taxas de quadros absurdamente altas.

#### 2. MediaTek Dimensity / Exynos (GPU Mali) & Unisoc:
* Para dispositivos com GPUs Mali ou Unisoc, o launcher utiliza o tradutor **Zink** diretamente sobre o driver Vulkan da fabricante.
* Para aparelhos ultra-low-end sem suporte adequado a Vulkan, o launcher possui fallback automático para **Holy GL4ES** (tradutor leve de OpenGL 2.1 para OpenGL ES 2.0/3.0).

### B) Runtime Java e Shims LWJGL no Mobile
1. **OpenJDK ARM64:** O launcher gerencia pacotes binários compactados do OpenJDK (8, 17 e 21) compilados para `aarch64-linux-android`. Eles são extraídos na pasta privada do aplicativo (`/data/data/com.tropicalia.launcher/files/runtime/`).
2. **Shims C/JNI:** Bibliotecas nativas compiladas interceptam as chamadas de janela:
   * `libglfw.so`: Redireciona a criação de janela para a `SurfaceView` do Android.
   * `libopenal.so`: Redireciona o áudio do Minecraft para o OpenSL ES ou AAudio do Android.

### C) Controles Virtuais Touch e Gamepads Físicos
* **HUD Virtual Customizável:** Painel flutuante renderizado com baixa latência com botões de:
  * Joystick analógico para movimentação (com botão de sprint).
  * Botões dedicados: Pular, Agachar, Atacar/Minar, Usar/Colocar bloco, Inventário, Chat, F3 (Debug), Zoom.
  * Mapeamento de gestos: Arrastar para rotacionar câmera, toque duplo para corrida, pinça para zoom.
* **Gamepads Bluetooth/USB:** Suporte nativo a controles de Xbox Series/One, PlayStation DualSense/DualShock 4, Nintendo Switch Pro e controles telescópicos (Razer Kishi, Gamesir, Backbone).

### D) O Desafio do iOS / iPadOS (JIT)
No iOS, a Apple bloqueia execução de memória com JIT (Just-In-Time) compilation para apps comuns da App Store.
* O launcher fornecerá instruções e suporte automatizado para sideloading via **AltStore**, **SideStore** ou **TrollStore** (que permite JIT nativo sem tethering).
* O módulo do launcher se comunica com o daemon de depuração local para solicitar habilitação de JIT ao iniciar a sessão do Java.

---

## 5. Suporte a Minecraft Bedrock Edition

Além do Java, o launcher inclui suporte de primeira classe ao ecossistema Bedrock:

1. **No Windows:**
   * Detecção automática da instalação do Minecraft Bedrock via registro UWP.
   * Seletor de versão (permite baixar e alternar versões do Bedrock a partir de pacotes `.appx`/`.msix` oficiais).
   * Injeção de mods nativos através do framework **AmethystAPI**.
2. **No Android:**
   * Gerenciador de Add-ons: Importação com 1 clique de arquivos `.mcaddon`, `.mcpack` e mundos `.mcworld`.
   * O launcher instala automaticamente os recursos na pasta oficial:
     `/Android/data/com.mojang.minecraftpe/files/games/com.mojang/behavior_packs/` e `resource_packs/`.
   * Inicialização direta do pacote `com.mojang.minecraftpe` via Android Intent com argumentos pré-configurados.
3. **No iOS:**
   * Gerenciamento de pastas de Add-ons através da pasta compartilhada de arquivos do Minecraft no aplicativo "Arquivos" (`com.mojang.minecraftpe`).
