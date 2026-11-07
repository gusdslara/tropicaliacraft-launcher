# 🧩 Ecossistema de Mods, Modpacks e Modloaders

Este documento detalha a engenharia por trás do sistema de gerenciamento de **Mods**, **Modloaders (Fabric, NeoForge, Forge, Quilt)** e integração direta com **Modrinth** e **CurseForge** com 1 clique e resolução automática de dependências.

---

## 1. Modloaders Suportados e Metadados

O launcher automatiza completamente a instalação dos 4 principais carregadores de mods do mercado, sem exigir que o usuário baixe instaladores manuais `.jar`:

```text
                                  ESCOLHA DO USUÁRIO
                       (Versão: 1.21.4 | Modloader: Fabric)
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
         FABRIC / QUILT                                 NEOFORGE / FORGE
  Consulta API de Metadados:                      Execução Headless do Processador:
  meta.fabricmc.net / meta.quiltmc.org            maven.neoforged.net / files.minecraftforge.net
                 │                                               │
  Gera JSON da Instância com:                     Executa o jar installer silenciosamente
  • fabric-loader.jar                             no diretório isolado da instância
  • intermediary mappings                         com os argumentos oficiais
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         ▼
                            INSTÂNCIA PRONTA PARA MODS
```

### Detalhes de Cada Modloader:

1. **Fabric:**
   * O padrão moderno para performance e mods leves no cliente.
   * Instalação via API REST: `https://meta.fabricmc.net/v2/versions/loader/{game_version}`.
   * Não precisa de processamento pesado; apenas adiciona o `fabric-loader` e as bibliotecas necessárias ao classpath do Java.
2. **NeoForge:**
   * O sucessor moderno do Forge para Minecraft 1.20.2 em diante. Muito mais rápido, compatível e estável.
   * O launcher baixa o instalador do maven oficial da NeoForged e o executa em segundo plano com a flag `--installClient`, gerando a versão no diretório do launcher sem caixas de diálogo externas.
3. **Forge (Clássico):**
   * O clássico modloader indispensável para versões antigas consagradas de modpacks (1.7.10, 1.12.2, 1.16.5, 1.18.2, 1.20.1).
   * Suporte a download de instaladores Maven e resolução de bibliotecas legadas.
4. **Quilt:**
   * Fork com compatibilidade expandida para mods Fabric e Quilt nativos.
   * Instalação via API REST: `https://meta.quiltmc.org/v3/versions/loader/{game_version}`.

---

## 2. Integração com Repositórios: Modrinth & CurseForge

O launcher possui um catálogo visual integrado diretamente na interface, permitindo buscar, filtrar e instalar mods sem abrir o navegador.

### A) Modrinth API v2 (Prioridade Padrão)
O Modrinth é a plataforma mais moderna, aberta e veloz da comunidade.
* **Endpoint de Busca:** `GET https://api.modrinth.com/v2/search`
  * Parâmetros dinâmicos: `query`, `facets` (filtrando por versão do jogo, loader e categorias como "Optimization", "Decoration", "Magic").
* **Endpoint de Versões:** `GET https://api.modrinth.com/v2/project/{id}/version`
* **Download dos Arquivos:** Links diretos com validação de hash SHA-1 e SHA-512.
* **Modpacks `.mrpack`:** Suporte nativo a descompactação do formato moderno `.mrpack` (baixa o arquivo `modrinth.index.json`, faz o download concorrente de todos os mods listados e extrai a pasta `overrides/` na instância).

### B) CurseForge API v1
A plataforma clássica com o maior catálogo histórico de modpacks antigos.
* Integração através da Core API do CurseForge (`https://api.curseforge.com/v1/`).
* Suporte nativo a modpacks tradicionais em formato `.zip` com leitura do `manifest.json`.

---

## 3. Resolução Inteligente de Dependências em 1 Clique

Um dos maiores desafios de usuários é instalar um mod (ex: *Sodium* ou *Iris*) e o jogo travar na inicialização porque faltou o *Fabric API* ou a biblioteca *Cloth Config*.

### Como o Motor Resolve:

```text
[Usuário Clica: Instalar "Iris Shaders"]
              │
              ▼
Consulta a lista de dependências no Modrinth API v2:
  • "fabric-api" (type: "required")
  • "sodium"     (type: "required")
              │
              ▼
Launcher verifica a pasta /mods da instância atual:
  • fabric-api já está instalado? [NÃO] ──> Enfileira download da versão compatível.
  • sodium já está instalado?     [NÃO] ──> Enfileira download da versão compatível.
              │
              ▼
Baixa os 3 arquivos (.jar) em paralelo e notifica o usuário:
"Iris Shaders instalado com sucesso juntamente com Sodium e Fabric API!"
```

---

## 4. Isolamento Completo de Perfis (Instâncias)

Para evitar que mods de uma versão interfiram em outra (um dos maiores erros de launchers simplórios):

* Cada perfil criado pelo usuário possui uma pasta totalmente isolada:
  `~/.tropicalia/instances/<id-da-instancia>/`
* Cada instância possui seus próprios subdiretórios:
  * `/mods`: Arquivos `.jar` exclusivos daquele perfil.
  * `/config`: Configurações específicas de cada mod.
  * `/saves`: Mundos locais isolados.
  * `/resourcepacks` & `/shaderpacks`: Pacotes de textura e shaders exclusivos.
  * `/screenshots`: Capturas de tela organizadas por perfil.

### Sistema de Ativar/Desativar Mods:
O launcher permite desativar qualquer mod com uma chave seletora na interface. Ele renomeia o arquivo `.jar` para `.jar.disabled`, impedindo o Java de carregá-lo sem deletar o arquivo do disco.
