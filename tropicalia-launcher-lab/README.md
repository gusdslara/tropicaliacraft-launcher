# 🚀 Tropicalia Universal Minecraft Launcher & Server Suite

> **Launcher de Próxima Geração para Minecraft (Java & Bedrock)**  
> *Ultra-leve, ultra-rápido e otimizado do low-end ao high-end em Windows, Linux, macOS, Android e iOS.*

---

## 📌 Visão Geral do Projeto

Este diretório (`tropicalia-launcher-lab`) é um ambiente dedicado e isolado para pesquisa, engenharia de software e especificação técnica do novo **Launcher Universal do TropicaliaCraft**.

O objetivo é desenvolver um launcher moderno, sem bibliotecas defasadas, utilizando o estado da arte da engenharia de software (Rust + Tauri v2 / Svelte 5 / Tailwind v4), consumindo apenas ~30MB a 45MB de RAM (contra 400MB+ de launchers baseados em Electron), com tempo de inicialização inferior a 200ms.

---

## 🎯 Pilares e Recursos Centrais

| Recurso | Detalhes Técnicos |
| :--- | :--- |
| **Multiplataforma Real** | **PC** (Windows 10/11 x64 & ARM64, Linux nativo, macOS Apple Silicon & Intel) e **Mobile** (Android low-end a flagship, iOS/iPadOS). |
| **Java & Bedrock** | Suporte a **Minecraft: Java Edition** (com runtime OpenJDK 8/17/21 e drivers Vulkan/Zink/Turnip no Android) e **Minecraft: Bedrock Edition** (injeção de mods via AmethystAPI, pacotes `.mcaddon`, `.mcpack`). |
| **Autenticação Oficial** | Microsoft OAuth2 oficial com **Device Code Flow** (login rápido com código de 8 dígitos ou QR Code), tokens Xbox Live + XSTS, validação de propriedade do jogo e modo offline seguro para LAN. |
| **Instalação Automática Zero-Config** | Baixa o Java correto automaticamente (Temurin/Zulu JRE 8, 17 ou 21) de acordo com a versão do Minecraft selecionada, além de assets, natives e bibliotecas com download paralelo multi-thread. |
| **Otimização Extrema Low-End** | Detecção automática de hardware: no Android Adreno usa drivers **Turnip (Mesa Vulkan) + Zink**, no Mali usa Vulkan/GL4ES otimizado. Configuração automática de GC do Java (Shenandoah / ZGC / G1GC) adaptada à memória RAM do aparelho (de 2GB a 32GB). |
| **Mods & Modpacks em 1 Clique** | Integração nativa com **Modrinth API v2** e **CurseForge API v1**. Suporte automático para **Fabric, NeoForge, Forge e Quilt**. Resolução inteligente de dependências. |
| **Criador de Servidores Híbridos (Mods + Plugins)** | Criação de servidores locais ou dedicados com 1 clique: Paper, Purpur, Fabric, NeoForge e os modernos motores híbridos **Magma**, **Mohist** e **Arclight** (permite rodar Mods Forge/NeoForge junto com Plugins Spigot/Paper simultaneamente). |
| **Zero Port-Forwarding (Túnel Integrado)** | Suporte a UPnP automático e túnel integrado via Playit.gg/Ngrok, permitindo que amigos entrem no servidor sem precisar abrir portas no roteador. |

---

## 📁 Estrutura da Pasta de Pesquisa e Engenharia

```text
tropicalia-launcher-lab/
├── README.md                                    # Visão geral e roadmap executivo
├── docs/
│   ├── 01-BENCHMARK-ANALISE-LAUNCHERS.md       # Análise de DroidDeck, Amethyst, Pojav, Prism, Modrinth
│   ├── 02-ARQUITETURA-MOTOR-CROSS-PLATFORM.md  # Arquitetura Rust + Tauri v2 + Zink/Turnip mobile
│   ├── 03-AUTENTICACAO-E-GERENCIADOR-VERSOES.md# Fluxo Microsoft OAuth, Mojang manifest, JRE auto-download
│   ├── 04-MODS-MODPACKS-ECOSSISTEMA.md         # Modrinth, CurseForge, Fabric, Forge, NeoForge
│   ├── 05-SERVIDOR-HIBRIDO-MODS-PLUGINS.md     # Arclight, Magma, Mohist, Hangar, Paper, Túneis
│   └── 06-GUIA-OTIMIZACAO-LOW-END.md           # Turnip Mesa, Zink, Sodium/Lithium pack, JVM flags
├── architecture/
│   ├── diagrams.md                             # Diagramas de arquitetura, fluxo de autenticação e pipeline gráfico
└── engine-specs/
    ├── microsoft-auth.types.ts                 # Tipos e contratos de autenticação Microsoft/Xbox
    ├── mod-engine.types.ts                     # Modelos para Modrinth, CurseForge e Modloaders
    ├── server-manager.types.ts                 # Modelos para Servidor, Híbridos e Plugins
    └── hardware-profiler.types.ts              # Modelos para detecção de GPU/RAM e perfilamento
```

---

## ⚡ Como Tudo Isso Funciona Junto

1. **No PC (Windows, Linux, Mac):** O launcher compila nativamente com Rust e Tauri v2. Ao escolher a versão do jogo (ex.: Minecraft 1.21.4 com Fabric ou NeoForge), ele consulta as APIs do Modrinth e Mojang, baixa tudo em paralelo em alta velocidade, extrai as natives específicas daquele sistema operacional e inicializa o processo Java com as flags ideais para a CPU/GPU.
2. **No Android e iOS:** A interface Tauri v2 roda nativamente com webview de altíssima performance. Para a execução do jogo Java no celular, o motor utiliza o runtime OpenJDK ARM64 com shims C para LWJGL3/GLFW e pipeline de renderização **Zink + Turnip (Vulkan)**, garantindo taxas de quadros fluidas (60+ FPS) mesmo em celulares intermediários ou de entrada.
3. **No Servidor:** O usuário clica em "Criar Servidor", escolhe "Híbrido (Magma/Arclight)", seleciona a versão (ex: 1.20.1), clica para adicionar mods do Modrinth e plugins do Hangar/Spigot, e ativa o "Túnel Público". O launcher baixa o JAR híbrido, prepara as pastas `mods` e `plugins`, e inicializa o servidor gerando um IP amigável para amigos jogarem juntos instantaneamente.
