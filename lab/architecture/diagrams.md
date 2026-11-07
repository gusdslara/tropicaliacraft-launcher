# 📊 Diagramas de Arquitetura e Fluxo do Launcher

Este documento contém os diagramas de engenharia e fluxo operacional do **Tropicalia Universal Launcher**.

---

## 1. Arquitetura Global do Sistema (Core & Multiplataforma)

```mermaid
flowchart TD
    subgraph UI ["Interface de Usuário (Svelte 5 + Tailwind v4)"]
        UI_Home["Tela Principal / Perfis"]
        UI_Mods["Catálogo de Mods & Modpacks"]
        UI_Server["Gerenciador de Servidores & Túnel"]
        UI_Settings["Configurações & Otimizações"]
    end

    subgraph Bridge ["Camada IPC (Tauri v2)"]
        IPC_Events["Tauri Event Channel"]
        IPC_Commands["Rust Commands Invoker"]
    end

    subgraph Core ["Motor Nativo em Rust (Tropicalia Core)"]
        Auth_Mgr["Microsoft MSA & Offline Auth"]
        Version_Mgr["Mojang Manifest & Parallel Downloader"]
        JRE_Mgr["Java Runtime Provisioner (Temurin/Zulu)"]
        Mod_Mgr["Modrinth & CurseForge API Engine"]
        Server_Mgr["Server Orchestrator & Playit.gg Tunnel"]
        HW_Profiler["Hardware Profiler & Driver Selector"]
    end

    subgraph Targets ["Sistemas Operacionais Alvo"]
        OS_Win["Windows 10/11 (x64 / ARM64)"]
        OS_Linux["Linux & SteamOS Deck"]
        OS_Mac["macOS (Apple Silicon & Intel)"]
        OS_Android["Android (OpenJDK + Zink + Turnip Vulkan)"]
        OS_iOS["iOS / iPadOS (OpenJDK + MetalKit + JIT)"]
    end

    UI --> Bridge
    Bridge --> Core
    Core --> Targets
```

---

## 2. Fluxo de Autenticação Microsoft (Device Code Flow)

```mermaid
sequenceDiagram
    autonumber
    actor User as Usuário
    participant Launcher as Launcher (Rust)
    participant MS as Microsoft Identity
    participant XBL as Xbox Live Services
    participant MC as Minecraft Services API

    User->>Launcher: Clica em "Entrar com Microsoft"
    Launcher->>MS: POST /devicecode
    MS-->>Launcher: Retorna user_code ("WXYZ-5678") e verification_uri
    Launcher->>User: Exibe código e abre navegador (ou QR Code no mobile)
    User->>MS: Autoriza acesso na conta Microsoft
    loop Polling a cada 5s
        Launcher->>MS: POST /token (polling)
        MS-->>Launcher: Retorna Microsoft Access Token
    end
    Launcher->>XBL: POST /user/authenticate (com MS Token)
    XBL-->>Launcher: Retorna Token XBL + UserHash (UHS)
    Launcher->>XBL: POST /xsts/authorize (com RelyingParty Minecraft)
    XBL-->>Launcher: Retorna Token XSTS
    Launcher->>MC: POST /authentication/login_with_xbox (com XSTS + UHS)
    MC-->>Launcher: Retorna Minecraft Bearer Token
    Launcher->>MC: GET /entitlements/mcstore (Verifica posse do jogo)
    Launcher->>MC: GET /minecraft/profile (UUID, Nickname e Skin)
    Launcher-->>User: Perfil carregado com sucesso!
```

---

## 3. Pipeline Gráfico Mobile (Android Adreno vs Mali)

```mermaid
flowchart LR
    MC["Minecraft Java (OpenGL 3.2+)"] --> LWJGL["LWJGL3 / GLFW Shims C"]
    LWJGL --> ZINK["Zink (OpenGL-to-Vulkan)"]
    
    ZINK --> Decision{"Tipo de GPU Detectada?"}
    
    Decision -->|"Qualcomm Snapdragon (Adreno)"| TURNIP["Driver Mesa Turnip Vulkan"]
    Decision -->|"MediaTek / Exynos (Mali)"| OEM_VK["Driver Vulkan Nativo OEM"]
    Decision -->|"Dispositivo Antigo sem Vulkan"| GL4ES["Fallback: Holy GL4ES (GLES)"]
    
    TURNIP --> DISPLAY["Tela do Smartphone (60+ FPS)"]
    OEM_VK --> DISPLAY
    GL4ES --> DISPLAY
```

---

## 4. Fluxo de Criação de Servidor Híbrido (Mods + Plugins)

```mermaid
flowchart TD
    Start["Usuário clica em 'Criar Servidor Híbrido'"] --> SelectEngine["Escolhe Motor: Arclight ou Magma"]
    SelectEngine --> SelectVersion["Escolhe Versão do Minecraft (ex.: 1.20.1)"]
    
    SelectVersion --> AddContent["Painel de Conteúdo com 1 Clique"]
    AddContent --> SearchMods["Busca Mods (Modrinth / Forge / NeoForge)"]
    AddContent --> SearchPlugins["Busca Plugins (Hangar / SpigotMC)"]
    
    SearchMods --> Downloader["Motor de Download Concorrente"]
    SearchPlugins --> Downloader
    
    Downloader --> PrepareEnv["Prepara Diretórios e Arquivos"]
    PrepareEnv --> PutMods["Coloca mods selecionados na pasta /mods"]
    PrepareEnv --> PutPlugins["Coloca plugins selecionados na pasta /plugins"]
    PrepareEnv --> AutoEULA["Gera eula.txt (eula=true)"]
    PrepareEnv --> ConfigProps["Ajusta server.properties visualmente"]
    
    ConfigProps --> LaunchServer["Inicia Servidor com Java 17/21 Otimizado"]
    LaunchServer --> TunnelDecision{"Túnel Público Ativado?"}
    TunnelDecision -->|"Sim"| Playit["Inicia Playit.gg Daemon (Gera IP Público)"]
    TunnelDecision -->|"Não"| LocalOnly["Servidor disponível apenas em LAN / IP Local"]
    
    Playit --> Console["Abre Console ao Vivo com Linha de Comando"]
    LocalOnly --> Console
```
