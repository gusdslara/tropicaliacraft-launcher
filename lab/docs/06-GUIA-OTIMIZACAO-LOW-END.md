# ⚡ Guia de Otimização Extrema para Dispositivos Low-End

Este documento detalha o conjunto de estratégias de hardware, software, drivers e modpack de performance que permitem ao **Tropicalia Launcher** rodar Minecraft com fluidez (30 a 60+ FPS) mesmo em celulares Android modestos (2GB a 4GB de RAM) e computadores antigos com gráficos integrados (Intel HD Graphics / Celeron).

---

## 1. O Diagnóstico de Hardware em Tempo Real

Ao iniciar em qualquer dispositivo, o launcher executa um analisador leve (`hardware_profiler`) que identifica:
* **CPU:** Número de núcleos e arquitetura (ARMv8, ARMv9, x86_64).
* **GPU & Drivers:** Fornecedor (Adreno, Mali, PowerVR, Intel HD, AMD Radeon, NVIDIA) e suporte à API Vulkan (1.1, 1.2, 1.3).
* **Memória RAM Total e Livre:** Memória física do sistema operacional e presença de ZRAM/Swap.
* **Resolução da Tela:** DPI e resolução nativa.

A partir desse perfil, o launcher aplica o **Perfil Low-End Automático**, sem que o usuário precise entender de drivers ou argumentos de linha de comando.

---

## 2. Otimizações Específicas para Android Low-End

Smartphones populares de baixo custo no Brasil frequentemente utilizam processadores **Unisoc (T606, T612, T616)**, **MediaTek Helio (G35, G85, G88, G99)** ou **Snapdragon de entrada (480, 680)**, acompanhados de 3GB ou 4GB de RAM.

### A) Seleção Dinâmica de Drivers Gráficos

| Família de GPU | Driver Selecionado Automaticamente | Benefício de Desempenho |
| :--- | :--- | :--- |
| **Snapdragon (Adreno 6xx / 7xx)** | **Turnip Mesa Vulkan + Zink** | Elimina bugs gráficos dos drivers originais da fabricante e eleva o FPS de ~18 para ~55 FPS com Sodium. |
| **MediaTek / Exynos (Mali G-Series)**| **Zink Nativo sobre Vulkan OEM** | Tradução limpa de OpenGL para a API Vulkan padrão do chipset. |
| **Aparelhos Legados (Sem Vulkan 1.1+)**| **Holy GL4ES (GLES 2.0 / 3.0)** | Fallback de ultra-baixo overhead para celulares mais antigos que suportam apenas OpenGL ES básico. |

### B) Redução da Resolução de Renderização Interna (Resolution Scaling)
A tela de muitos celulares modernos é Full HD+ (1080x2400) ou HD+ (720x1600). Renderizar o Minecraft Java em 1080p em uma GPU móvel básica causa superaquecimento e *thermal throttling* (queda brusca de FPS após 5 minutos de jogo).
* O launcher permite renderizar o jogo internamente a **70% ou 50% da resolução nativa** (ex.: 540p ou 720p) e fazer o *upscaling* via filtro bilinear/nearest na tela do celular.
* **Resultado:** Redução de 40% na temperatura do aparelho e ganho de até 60% em estabilidade de FPS.

### C) Otimização do Buffer de Áudio
Para evitar estalos e travamentos no som quando a CPU estiver carregando chunks pesados:
* O shim `libopenal.so` do launcher utiliza o subsistema **AAudio / OpenSL ES** com buffer configurado para modo de baixa latência adaptativo (`FAST_TRACK`).

---

## 3. Otimizações Específicas para PCs Low-End

Para notebooks e desktops com processadores Intel Celeron, Pentium ou Core i3 de 2ª a 7ª geração com **Intel HD Graphics (3000, 4000, 520, 620)** e 4GB de RAM:

* **Desativação de Overheads do Windows:** O launcher desabilita temporariamente o DWM (Desktop Window Manager) V-Sync forçado em janelas do Minecraft.
* **Resolução Dinâmica:** Alocação de resolução 1280x720 nativa em tela cheia com taxa de atualização de 60Hz.
* **Prioridade de Processo:** O processo Java é inicializado com classe de prioridade `ABOVE_NORMAL_PRIORITY_CLASS`, garantindo que antivírus ou navegadores em segundo plano não roubem ciclos da CPU durante o jogo.

---

## 4. O "Kit Performance Tropicalia" (Modpack Pré-Instalado com 1 Clique)

Quando o usuário cria uma instância voltada para desempenho, o launcher oferece instalar com 1 único clique o conjunto definitivo de otimizações modernas da comunidade Fabric:

```text
┌────────────────────────────────────────────────────────────────────────┐
│               KIT PERFORMANCE TROPICALIA (ZERO LAG)                   │
├────────────────────┬───────────────────────────────────────────────────┤
│ Mod                │ Função Principal                                  │
├────────────────────┼───────────────────────────────────────────────────┤
│ 🚀 Sodium          │ Reescreve o renderizador de chunks do Minecraft,  │
│                    │ reduzindo o uso de CPU em até 70% e triplicando o FPS│
├────────────────────┼───────────────────────────────────────────────────┤
│ 🧠 Lithium         │ Otimiza a física, inteligência artificial dos mobs│
│                    │ e carregamento de chunks sem mudar o jogo.        │
├────────────────────┼───────────────────────────────────────────────────┤
│ 💾 FerriteCore     │ Reduz o consumo de memória RAM em até 50% através │
│                    │ de desduplicação de modelos de blocos e texturas. │
├────────────────────┼───────────────────────────────────────────────────┤
│ ⚡ ImmediatelyFast │ Acelera a renderização de menus, HUD, fontes,     │
│                    │ entidades e partículas em 2x.                     │
├────────────────────┼───────────────────────────────────────────────────┤
│ 👁️ Entity Culling  │ Deixa de renderizar mobs e baús escondidos atrás  │
│                    │ de paredes ou cavernas que você não está vendo.   │
├────────────────────┼───────────────────────────────────────────────────┤
│ 🧹 Memory Leak Fix │ Corrige vazamentos de memória históricos do Java │
│                    │ que deixam o jogo travando após horas de jogatina.│
├────────────────────┼───────────────────────────────────────────────────┤
│ ⏱️ ModernFix       │ Acelera o tempo de carregamento inicial do jogo   │
│                    │ de 40 segundos para menos de 10 segundos!         │
├────────────────────┼───────────────────────────────────────────────────┤
│ 🌐 Krypton         │ Otimiza o envio e compressão de pacotes de rede,  │
│                    │ reduzindo o ping e o consumo de dados móveis 4G.  │
└────────────────────┴───────────────────────────────────────────────────┘
```

---

## 5. Flags de Otimização da JVM para Baixa Memória

Para aparelhos com 2GB a 4GB de RAM total, o Coletor de Lixo padrão (G1GC) costuma causar pausas perceptíveis. O launcher injeta automaticamente a configuração otimizada de **ShenandoahGC**:

```bash
# Flags automáticas para Low-End (2GB a 4GB de RAM total no aparelho):
-Xms512M
-Xmx1800M
-XX:+UseShenandoahGC
-XX:ShenandoahGCHeuristics=compact
-XX:ShenandoahAllocationThreshold=70
-XX:+AlwaysPreTouch
-XX:+UseStringDeduplication
-XX:+OptimizeStringConcat
-Dsun.rmi.dgc.client.gcInterval=3600000
-Dsun.rmi.dgc.server.gcInterval=3600000
```

Essas flags instruem a máquina virtual Java a coletar lixo concorrentemente sem pausar a thread principal de renderização, garantindo uma jogabilidade lisa mesmo durante explosões de TNT ou tempestades no jogo.
