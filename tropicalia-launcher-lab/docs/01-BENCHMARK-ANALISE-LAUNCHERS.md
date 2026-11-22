# 🔬 Análise Comparativa e Benchmark de Launchers Modernos

Este documento detalha o estado da arte dos launchers e ferramentas para Minecraft em **PC (Windows, Linux, macOS)** e **Mobile (Android, iOS)**, analisando o que há de mais recente no ecossistema e extraindo as melhores práticas arquiteturais.

---

## 1. DroidDeck & DroidBridge

### O que é?
O **DroidDeck** é um projeto e ecossistema projetado para transformar dispositivos Android e consoles portáteis (como Retroid Pocket, Odin, GPD e smartphones) em interfaces no estilo SteamOS/Steam Deck. Para Minecraft, o ecossistema utiliza o **DroidBridge Launcher**.

### Destaques Técnicos:
* **Foco em Portáteis e Controles:** Integração nativa de gamepads físicos (mapeamento XInput/DirectInput/DualShock) com latência imperceptível.
* **Autenticação Microsoft Integrada:** Permite autenticar contas Microsoft e verificar propriedade legal diretamente no dispositivo.
* **Camada de Compatibilidade Otimizada:** Executa o Minecraft Java Edition nativamente em arquiteturas ARM64 através de compilação cruzada de OpenJDK e bibliotecas gráficas.

### Lições para o nosso Launcher:
* A navegação com gamepad/touch deve ser cidadã de primeira classe no mobile.
* Layouts de controle virtual precisam ser personalizáveis com suporte a múltiplos perfis (ex.: perfil combate, perfil construção, perfil mineração).

---

## 2. Amethyst Launcher (Android, iOS & Bedrock)

O nome **Amethyst** surge em duas frentes de vanguarda no ecossistema Minecraft:

### A) Amethyst Java Mobile (Android & iOS) — *AngelAuraMC*
Fork moderno e refinado do PojavLauncher, voltado para máxima performance e UX limpa.
* **Drivers Turnip Embutidos:** Permite que celulares com chips Snapdragon (GPU Adreno) carreguem versões atualizadas dos drivers de código aberto Mesa Vulkan (Turnip), elevando o FPS em até 300% em relação aos drivers OEM da fabricante.
* **Pipeline Zink (OpenGL $\rightarrow$ Vulkan):** Traduz as chamadas de OpenGL do Minecraft Java para chamadas Vulkan puras, reduzindo o overhead da CPU móvel.
* **UI Moderna:** Substitui menus Android arcaicos por uma interface com design limpo e transições fluidas.

### B) Amethyst Bedrock Mod Launcher — *FrederoxDev*
Launcher e framework de modding voltado para o **Minecraft: Bedrock Edition** no Windows.
* **Injeção de DLLs (AmethystAPI):** Permite criar e injetar mods C++ nativos no Bedrock sem depender exclusivamente dos Add-ons/Behavior Packs convencionais da Mojang.
* **Version Management:** Gerencia versões de runtime e ativa/desativa mods por perfil.

### Lições para o nosso Launcher:
* Unificar os conceitos: ter um único launcher que suporte **Java Edition** (com pipeline Vulkan/Turnip) e **Bedrock Edition** (com gerenciamento de Add-ons e injeção de mods quando aplicável).

---

## 3. PojavLauncher (Android & iOS)

### O que é?
O pioneiro e mais famoso launcher de Minecraft Java Edition para dispositivos móveis (Android e iOS).

### Arquitetura Interna:
1. **JVM Runtime:** Executa um OpenJDK (JRE 8, 17, 21) compilado para ARM64 (`aarch64`) e ARMv7 (`armhf`).
2. **LWJGL / GLFW Shims:** Biblioteca em C que intercepta as chamadas de janela, mouse e teclado do desktop e as traduz para eventos de toque do Android (`SurfaceView`) ou iOS (`MetalKit`).
3. **Mecanismos de Renderização (Renderers):**
   * `Holy GL4ES`: Tradução de OpenGL 2.1 para OpenGL ES 2.0/3.0 (bom para aparelhos muito antigos, mas quebra com Sodium moderno).
   * `Zink (Mesa)`: Traduz chamadas completas de OpenGL 4.6 para Vulkan.
   * `VirGL / ANGLE`: Alternativas para emulação em dispositivos específicos.
4. **Desafio do iOS (JIT):** No iOS, a Apple bloqueia alocação de páginas de memória executáveis em tempo de execução sem direitos de depuração (`get-task-allow`). O Pojav/Amethyst no iOS requer ativação de JIT via AltStore, SideStore, TrollStore ou depuração USB.

### Pontos Fracos do Pojav Original:
* Código legado em Java/Android clássico com alto acoplamento.
* Interface pesada e pouco intuitiva para novatos.
* Instalação de mods manual e confusa para quem só quer clicar e jogar.

---

## 4. Prism Launcher (Desktop: Windows, Linux, macOS)

### O que é?
O launcher de código aberto mais respeitado para desktop, escrito em **C++ e Qt6**.

### Pontos Fortes:
* **Desempenho Extremo:** Consome menos de 60MB de RAM e abre quase instantaneamente.
* **Isolamento Total de Instâncias:** Cada perfil tem sua própria pasta, seus próprios mods, configurações e versões do Java.
* **Download Nativo de Modloaders:** Suporte direto a Modrinth, CurseForge, Fabric, Quilt, Forge e NeoForge.
* **Multiplataforma Desktop:** Suporte completo a Windows, Linux (inclusive Steam Deck/Flatpak) e macOS (ARM64 & x86_64).

### Limitações:
* Não existe versão nativa para mobile (Android/iOS).
* Não suporta Minecraft Bedrock.
* Não possui criador integrado de servidores híbridos (mods + plugins).

---

## 5. Modrinth App (Desktop: Windows, Linux, macOS)

### O que é?
O launcher oficial do Modrinth, desenvolvido com a stack moderna **Tauri (Rust) + Svelte/TypeScript**.

### Pontos Fortes:
* **Uso de Memória Reduzido:** Por utilizar **Tauri** em vez de Electron, a camada nativa em Rust consome apenas cerca de 30MB a 50MB de memória RAM.
* **UI/UX Impecável:** Interface reativa, animações suaves, tipografia refinada e busca instantânea no catálogo do Modrinth.
* **Download Concorrente em Rust:** Sistema de download multi-thread ultra-rápido com verificação de hash SHA1/SHA512.

### Oportunidade para o Tropicalia Launcher:
* O Modrinth App foca apenas no catálogo do Modrinth para desktop. O nosso projeto expandirá essa mesma stack moderna (Tauri v2 + Rust) para **mobile (Android & iOS)**, adicionando suporte a **Bedrock**, **CurseForge**, e o **Gerenciador de Servidores Híbridos**.

---

## 6. Matriz Comparativa de Recursos

| Recurso / Capacidade | Pojav / Amethyst Mobile | Prism Launcher | Modrinth App | Launcher Oficial Mojang | **Tropicalia Universal Launcher** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **PC (Windows, Linux, Mac)** | ❌ (Mobile only) | ✅ Nativo (C++/Qt) | ✅ Nativo (Rust/Tauri) | ⚠️ Pesado (Electron/CEF) | ✅ **Nativo (Rust/Tauri v2)** |
| **Mobile (Android & iOS)** | ✅ Nativo | ❌ | ❌ | ⚠️ Somente Bedrock | ✅ **Nativo (Tauri v2 + OpenJDK ARM)** |
| **Consumo de Memória (RAM)** | Médio (150MB launcher) | Baixo (~50MB) | Baixo (~40MB) | Alto (350MB - 600MB) | ⚡ **Ultra-Baixo (~30MB - 45MB)** |
| **Minecraft Java Edition** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Minecraft Bedrock Edition** | ❌ | ❌ | ❌ | ✅ (Apenas Windows) | ✅ **(Windows, Android & iOS)** |
| **Drivers Vulkan/Turnip (Mobile)**| ✅ (Config manual) | N/A | N/A | ❌ | ⚡ **Detecção e Ativação Automática** |
| **Pesquisa Modrinth & CurseForge**| ❌ (Manual) | ✅ | ⚠️ Apenas Modrinth | ❌ | ✅ **Ambos com 1 Clique** |
| **Fabric, Forge, NeoForge, Quilt**| ⚠️ Instalação manual | ✅ | ✅ | ❌ | ✅ **Automático com dependências** |
| **Criador Servidor Híbrido** | ❌ | ❌ | ❌ | ❌ | ⚡ **Sim (Magma, Mohist, Arclight)** |
| **Túnel Zero-Port-Forwarding** | ❌ | ❌ | ❌ | ❌ | ⚡ **Integrado (Playit.gg / UPnP)** |

---

## 7. Decisão de Stack para o Nosso Launcher

Com base na análise das melhores tecnologias atuais:

1. **Camada de Core & Sistema:** **Rust (Tauri v2)**.
   * Por que? Tauri v2 suporta oficialmente compilar para **Windows, Linux, macOS, Android e iOS** a partir da mesma base de código.
   * Rust garante segurança de memória, paralelismo para download de dezenas de milhares de assets do Minecraft e pegada de RAM mínima.
2. **Camada Gráfica e Interface:** **Svelte 5 / Tailwind v4 + Lucide Icons**.
   * Reatividade moderna por sinais (runes), tempo de carregamento instantâneo e zero dependência de frameworks pesados.
3. **Mecanismo de Execução Java no Mobile:**
   * Empacotamento de OpenJDK 8, 17 e 21 compilados para ARM64.
   * Módulo C/Rust de integração de superfície para LWJGL3/GLFW.
   * Seletor automático de driver: **Turnip (Vulkan) para Adreno**, **Zink nativo para Mali/Vulkan**, com fallback para **GL4ES** em chipsets antigos.
4. **Mecanismo de Servidor:**
   * Motor orquestrador em Rust capaz de inicializar instâncias Java headless, gerenciar `stdin`/`stdout`, ler arquivos de propriedades e gerenciar portas com UPnP e túneis seguros.
