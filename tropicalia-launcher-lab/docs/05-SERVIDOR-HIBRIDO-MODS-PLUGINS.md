# 🖥️ Gerenciador de Servidores Híbridos (Mods + Plugins)

Este documento especifica o criador e gerenciador de servidores integrado do **Tropicalia Launcher**, com suporte a motores **Híbridos (Magma, Mohist, Arclight)** que unem mods e plugins simultaneamente, além de túnel público sem necessidade de abrir portas no roteador.

---

## 1. O Desafio e a Solução Híbrida

Historicamente, os servidores de Minecraft se dividem em dois ecossistemas isolados:

1. **Apenas Mods (Forge, Fabric, NeoForge):** Permite rodar mods incríveis de conteúdo (Create, Twilight Forest, Mekanism, Cobblemon), mas **não roda plugins** administrativos de Bukkit/Spigot/Paper.
2. **Apenas Plugins (Paper, Purpur, Spigot):** Altamente otimizado, permite rodar plugins consagrados (EssentialsX, LuckPerms, WorldEdit, GriefPrevention, Vault), mas **não roda nenhum mod** de conteúdo.

### A Solução do Tropicalia Launcher: Motores Híbridos
O launcher traz suporte integrado aos três motores híbridos de vanguarda que combinam os dois mundos em um único servidor:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                      SERVIDOR HÍBRIDO TROPICALIA                       │
├───────────────────────────────────┬────────────────────────────────────┤
│           PASTA /MODS             │          PASTA /PLUGINS            │
│  • Create                         │  • EssentialsX                     │
│  • Applied Energistics 2          │  • LuckPerms (Cargos e Permissões) │
│  • The Twilight Forest            │  • WorldEdit / FastAsyncWorldEdit  │
│  • Biomes O' Plenty               │  • GriefPrevention (Terrenos)      │
│  • Alex's Mobs                    │  • Vault + Economia                │
├───────────────────────────────────┴────────────────────────────────────┤
│                    MOTOR HÍBRIDO DE COMPATIBILIDADE                    │
│                 [ ARCLIGHT ]  ou  [ MAGMA ]  ou  [ MOHIST ]            │
├────────────────────────────────────────────────────────────────────────┤
│                     JAVA RUNTIME (Temurin JRE 17/21)                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Os Motores Híbridos Suportados

### A) Arclight (*IzzelAliz/Arclight*) — O Mais Moderno e Modular
* **Tecnologia:** Utiliza Mixins e transformações de bytecode limpas para acoplar a API do Spigot/Paper diretamente nos carregadores modernos.
* **Compatibilidade:**
  * **NeoForge + Plugins:** Minecraft 1.20.4, 1.20.6 e 1.21.x.
  * **Fabric + Plugins:** Permite rodar mods Fabric de servidor junto com plugins Spigot!
  * **Forge + Plugins:** Minecraft 1.16.5, 1.18.2 e 1.20.1.
* **API de Download:** `https://arclight.izzel.io/` e GitHub Releases.

### B) Magma Foundation (*Magma-Neo* e *Magma-Forge*)
* **Tecnologia:** Servidor híbrido clássico e robusto fundindo Forge/NeoForge com PaperMC.
* **Versões Notáveis:** Suporte estável a **1.12.2**, **1.16.5**, **1.18.2** e **1.20.x**.
* **API de Download:** `https://api.magmafoundation.org/`

### C) MohistMC (*Mohist* e *Youer*)
* **Tecnologia:** Um dos mais antigos e consolidados servidores híbridos, com ampla compatibilidade com mods e plugins da era 1.7.10 até versões modernas.
* **API de Download:** `https://api.mohistmc.com/`

---

## 3. Motores Puros (Para quem quer apenas Mods ou apenas Plugins)

Além dos híbridos, o launcher oferece com 1 clique:

* **Apenas Plugins:**
  * **PaperMC:** O padrão da indústria para performance (`https://api.papermc.io/v2/projects/paper/`).
  * **Purpur:** Fork de altíssimo desempenho com dezenas de opções extras de gameplay (`https://api.purpurmc.org/v2/purpur/`).
  * **Folia:** Servidor multithreaded por regiões para redes massivas.
* **Apenas Mods:**
  * **Fabric Server:** Baixado via instalador headless do Fabric.
  * **NeoForge Server & Forge Server:** Instalado com o argumento `--installServer`.
* **Vanilla:**
  * Servidor oficial da Mojang via manifesto de versões.

---

## 4. Pesquisa e Instalação de Plugins Integrada

Assim como na pesquisa de mods, o usuário pesquisa plugins diretamente na interface do launcher através das principais APIs:

1. **Hangar API (PaperMC):** `https://hangar.papermc.io/api/v1/`
   * Repositório oficial do PaperMC com verificação de segurança de plugins.
2. **Spiget REST API (SpigotMC):** `https://api.spiget.org/v2/`
   * Catálogo imenso do SpigotMC com busca por nome, downloads e compatibilidade.
3. **Modrinth Plugins:** O Modrinth hoje possui milhares de plugins empacotados compatíveis com Paper e Spigot.

---

## 5. Fluxo de Criação do Servidor em 1 Minuto

O assistente (Wizard) de criação guia o usuário em 5 passos visuais:

```text
PASSO 1: Escolha o Tipo de Servidor
[ ⭐ Híbrido (Mods + Plugins) ]  [ Apenas Plugins ]  [ Apenas Mods ]  [ Vanilla ]

PASSO 2: Selecione o Motor e Versão
Motor:   [ Arclight ▼ ]
Versão:  [ 1.20.1 NeoForge / Forge ▼ ]

PASSO 3: Adicione Mods (Opcional)
[ Busca Modrinth: "Create", "Waystones", "Farmer's Delight" ] ──> [+] Adicionar

PASSO 4: Adicione Plugins (Opcional)
[ Busca Hangar: "LuckPerms", "EssentialsX", "Chunky" ] ───────> [+] Adicionar

PASSO 5: Configuração e Inicialização
Alocação de RAM: [ 4 GB ──●────── 16 GB ]
Túnel para Amigos: [x] Ativar Túnel Público Automático
EULA: Aceito Automaticamente
                                                 [ INICIAR SERVIDOR ]
```

---

## 6. Ferramentas Integradas de Gerenciamento do Servidor

* **Console em Tempo Real:** Visualizador do log do servidor com cores ANSI, auto-scroll e linha de comando para executar comandos de administrador (`op <nick>`, `gamemode creative <nick>`, `save-all`, `stop`).
* **Editor Visual do `server.properties`:** Interface amigável para alterar:
  * Porta do servidor (padrão `25565`).
  * Mensagem do Dia (MOTD) com seletor de cores do Minecraft (`§a`, `§6`).
  * Dificuldade (Peaceful, Easy, Normal, Hard).
  * Modo Online (`true` / `false`).
  * Distância de Visão (View Distance) e Simulação.
  * Máximo de Jogadores e Whitelist.
* **Backup de Mundos:** Compactação em `.zip` com 1 clique antes de atualizar mods ou versões.

---

## 7. Túnel Zero-Port-Forwarding (Sem Abrir Portas no Roteador)

Uma das maiores dores de cabeça para quem quer jogar com amigos é abrir portas (port forwarding 25565) no roteador ou lidar com CGNAT (quando a operadora de internet não fornece IP público direto).

O launcher resolve isso de duas formas automáticas:

1. **UPnP Automático (Universal Plug and Play):**
   * O launcher envia uma solicitação UPnP ao roteador local para abrir a porta `25565` temporariamente enquanto o servidor estiver rodando.
2. **Túnel Integrado via Playit.gg:**
   * Se o UPnP falhar ou o usuário estiver atrás de CGNAT/4G/5G, o launcher inicializa um daemon leve do **Playit.gg**.
   * Gera instantaneamente um endereço público acessível de qualquer lugar do mundo (ex.: `tropicalia-amigos.playit.gg`).
   * Qualquer amigo no PC, celular ou console consegue se conectar digitando esse endereço no multiplayer do Minecraft!
