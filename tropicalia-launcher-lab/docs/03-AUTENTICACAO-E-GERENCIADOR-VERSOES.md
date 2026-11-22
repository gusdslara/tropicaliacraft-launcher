# 🔑 Autenticação Oficial Microsoft e Gerenciador de Versões

Este documento especifica a implementação do fluxo de autenticação oficial da **Microsoft / Mojang**, o ciclo de vida dos tokens, o gerenciador de versões e o provisionamento automático de **Java (JRE)** e flags de memória adaptativas.

---

## 1. Fluxo de Autenticação Microsoft (MSA)

O Tropicalia Launcher utiliza o fluxo de autenticação oficial recomendado pela Microsoft para clientes nativos e dispositivos móveis: o **OAuth 2.0 Device Authorization Flow (RFC 8628)**, complementado por WebView interativo.

### O Pipeline de 5 Passos:

```text
1. Dispositivo Solicita Código
   [Launcher] ───> POST https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode
              <─── Retorna: user_code ("ABCD-1234"), verification_uri ("microsoft.com/link")

2. Usuário Autoriza no Navegador / Celular
   Usuário acessa o link ou escaneia QR Code ───> Digita o código e faz login na conta Microsoft.

3. Launcher Faz Polling do Token Microsoft
   [Launcher] ───> POST https://login.microsoftonline.com/consumers/oauth2/v2.0/token
              <─── Retorna: access_token (Microsoft) + refresh_token

4. Troca por Tokens do Xbox Live e XSTS
   A) [Launcher] ───> POST https://user.auth.xboxlive.com/user/authenticate
                     <─── Retorna: Token XBL + UHS (UserHash)
   B) [Launcher] ───> POST https://xsts.auth.xboxlive.com/xsts/authorize
                     (RelyingParty: "rp://api.minecraftservices.com/")
                     <─── Retorna: Token XSTS

5. Obtenção do Bearer Token do Minecraft e Perfil
   A) [Launcher] ───> POST https://api.minecraftservices.com/authentication/login_with_xbox
                     <─── Retorna: minecraft_token (Bearer)
   B) [Launcher] ───> GET https://api.minecraftservices.com/entitlements/mcstore (Checa se tem o jogo)
   C) [Launcher] ───> GET https://api.minecraftservices.com/minecraft/profile (UUID, Nickname, Skin)
```

### Vantagens do Device Code Flow:
* **Segurança Absoluta:** O launcher **nunca** tem acesso à senha do usuário nem intercepta credenciais de 2FA.
* **Perfeito para Mobile e Consoles/Portáteis:** O usuário pode escanear o QR Code gerado pelo launcher no celular ou PC secundário para fazer login sem digitar senhas longas na tela touch.
* **Persistência Segura:** O `refresh_token` é armazenado no cofre nativo do sistema operacional:
  * Windows: **DPAPI (Data Protection API)** via Windows Credential Manager.
  * Linux: **Secret Service API / KWallet**.
  * macOS / iOS: **Apple Keychain**.
  * Android: **EncryptedSharedPreferences** com chave no hardware **Android KeyStore**.

### Modo Offline / Local:
Para testes de desenvolvimento, jogos em rede local (LAN) ou servidores sem autenticação online (`online-mode=false`), o launcher permite criar perfis locais com nickname customizado e geração determinística de UUID offline v3 (`UUID.nameUUIDFromBytes("OfflinePlayer:" + nick)`).

---

## 2. Gerenciador de Versões e Manifesto da Mojang

O launcher baixa as versões diretamente dos servidores oficiais da Mojang através do manifesto mestre:
`https://launchermeta.mojang.com/mc/game/version_manifest_v2.json`

### Estrutura do Manifesto:
* **Lista Completa:** Todas as versões lançadas desde a `rd-132211` clássica até as Snapshots, Betas, Alphas e Releases mais recentes (ex.: 1.21.x).
* **Version JSON Individual:** Cada versão aponta para seu arquivo de metadados correspondente, que especifica:
  1. `downloads.client`: Link direto para o `client.jar` com hash SHA-1 e tamanho exato em bytes.
  2. `assetIndex`: Arquivo JSON contendo todos os sons, texturas, línguas e fontes do jogo.
  3. `libraries`: Todas as dependências Java e bibliotecas nativas C/C++ (LWJGL, Log4j, Netty, etc.), com regras de sistema operacional (`os.name`, `os.arch`).
  4. `arguments`: Argumentos padrão de inicialização de jogo e JVM para a versão.

### Motor de Download Paralelo em Rust:
* Utiliza **Tokio + Reqwest** com conexões HTTP/2 multiplexadas.
* Baixa até 32 assets simultaneamente com verificação em tempo real do hash SHA-1.
* Se a conexão cair no meio de um download de 2.000 arquivos de áudio, o launcher retoma apenas os arquivos faltantes ou corrompidos, economizando banda e tempo.

---

## 3. Provisionamento Automático de Java (JRE)

Minecraft exige versões de Java diferentes dependendo da versão do jogo. Usuários leigos costumam sofrer com erros crípticos como `UnsupportedClassVersionError`. O Tropicalia Launcher resolve isso de forma 100% invisível e automática:

### Tabela de Compatibilidade Automática:

| Versão do Minecraft | Versão do Java Necessária | Distribuição Baixada Pelo Launcher |
| :--- | :---: | :--- |
| **1.16.5 e anteriores** | **Java 8 (JRE 1.8.0)** | Eclipse Adoptium Temurin / Azul Zulu 8 |
| **1.17 a 1.17.1** | **Java 16** | Eclipse Adoptium Temurin 16 |
| **1.18 a 1.20.4** | **Java 17** | Eclipse Adoptium Temurin / Azul Zulu 17 LTS |
| **1.20.5 a 1.21.x+** | **Java 21** | Eclipse Adoptium Temurin / Azul Zulu 21 LTS |

### Como o Launcher instala o Java:
1. O launcher consulta a API do **Adoptium (Temurin API)** ou **Azul Zulu**:
   `https://api.adoptium.net/v3/binary/latest/{feature_version}/ga/{os}/{arch}/jre/hotspot/normal/eclipse`
2. Identifica o sistema operacional e arquitetura exatos do usuário:
   * Windows x64 / ARM64
   * Linux x64 / ARM64
   * macOS ARM64 (Apple Silicon) / x64
   * Android aarch64
3. Descompacta o JRE em uma pasta isolada interna:
   `~/.tropicalia/runtimes/java-21-temurin-x64/`
4. Ajusta permissões de execução (`chmod +x bin/java` em sistemas Unix) e reutiliza a mesma instalação para todas as instâncias que utilizam aquela versão de Java.

---

## 4. Otimizador de Memória e Flags da JVM

Uma das maiores causas de travamentos e "engasgos" (micro-stutters) no Minecraft é a má alocação de memória RAM e a escolha inadequada do Coletor de Lixo (Garbage Collector).

O launcher detecta a memória física total do dispositivo e calcula dinamicamente as flags ideais:

### Estratégia de Alocação de Memória:

| RAM do Aparelho | Alocação Xmx (Máx) | Coletor de Lixo (GC) | Flags Específicas de Otimização |
| :--- | :---: | :---: | :--- |
| **Dispositivo Low-End (2GB a 3GB)** | 1.2GB a 1.6GB | **ShenandoahGC** ou **SerialGC** | `-XX:+UseShenandoahGC -XX:ShenandoahGCHeuristics=compact -XX:AllocatePrefetchStyle=1` (prioriza não estourar a RAM do Android) |
| **Intermediário (4GB a 6GB)** | 2.5GB a 3.5GB | **G1GC Otimizado** | `-XX:+UseG1GC -XX:MaxGCPauseMillis=20 -XX:InitiatingHeapOccupancyPercent=45 -XX:G1ReservePercent=15` |
| **High-End (8GB a 16GB)** | 4GB a 6GB | **Aikar's G1GC Flags** | O conjunto padrão ouro de flags de performance da comunidade para eliminar pausas de GC. |
| **Ultra High-End (32GB+)** | 8GB a 10GB | **Generational ZGC** (Java 21+) | `-XX:+UseZGC -XX:+ZGenerational` (pausas de coleta abaixo de 1 milissegundo, perfeito para modpacks pesados). |

O usuário não precisa entender nada disso: uma chave seletora na interface permite alternar entre **Modo Econômico (Low-End)**, **Modo Equilibrado** e **Modo Máximo Desempenho**, enquanto o motor faz todos os ajustes finos automaticamente.
