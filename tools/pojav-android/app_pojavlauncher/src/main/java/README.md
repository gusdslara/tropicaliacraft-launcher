# TeamPojavLauncher no Tropicalia

Alvo: https://github.com/TeamPojavLauncher/PojavLauncher, tag `pojav-legacy-v2`,
commit `917a02655d8e9e6a33ea2093f41767d883107711`.

A interface Tauri é a entrada do APK. O motor roda na `GameActivity` do Pojav,
em processo separado, mantendo a UI do Tropicalia viva. Não usa a tela inicial
do Pojav nem envia tokens a aplicativos externos.

`scripts/prepare-pojav.py` aplica o overlay de forma repetível e recusa trechos
upstream incompatíveis. `scripts/build-pojav.ps1` compila interface, Rust e APK.
O checkout precisa dos submódulos: `git submodule update --init --recursive`.
Use JDK 21 para o Gradle e o SDK/NDK exigidos pelo upstream.

Os jars de suporte Android/Tauri vêm do build integrado local existente,
selecionado por `-SupportLibraries`. Precisam corresponder ao runtime Rust;
não são distribuídos por este overlay. O checkout upstream está ignorado no Git;
as alterações reproduzíveis ficam no overlay e no script.

O fluxo `prepare` instala o runtime Android exigido pelo JSON oficial antes
do instalador headless Forge/NeoForge. Depois, o downloader do Pojav aplica
substituições de bibliotecas e natives Android e devolve o classpath real.
Instâncias, mods, saves e options.txt usam `files/instances/<id>`; versões,
bibliotecas e assets usam `files/shared`. A conta Microsoft recebe o token
Minecraft já obtido/renovado pelo Tropicalia. Refresh tokens ficam no fluxo
de autenticação do Tropicalia.

Arquivos internos de comunicação: `tropicalia-java-launch.json`,
`tropicalia-java-ready.json`, `tropicalia-progress.json`,
`tropicalia-game-paths.json`, `tropicalia-game-status.json`,
`tropicalia-game-exit.json`, `tropicalia-game-kill.json`.
Pedidos são publicados por rename e respostas Android por AtomicFile.

Ainda é necessário validar em aparelho: Vanilla/Fabric/Forge/NeoForge por
versão disponível nas APIs, dependências Modrinth, login Microsoft/local,
troca de idioma, RAM, renderers, progresso e encerramento/crash. Suporte do
motor a 26.3 não implica que todo loader/mod tenha versão compatível.
O catálogo CurseForge de mods está integrado à criação de instâncias, ao
gerenciador de mods e à página Explorar. Configure a chave da API em Ajustes.
Dependências obrigatórias e incompatibilidades usam os metadados da API;
arquivos sem autorização de distribuição/download direto não são substituídos
por URLs calculadas. O catálogo CurseForge de modpacks não faz parte deste fluxo.

Verificações: `npm run check`, `node scripts/test-modrinth.mjs`,
`node scripts/test-curseforge.mjs`, `cargo check` para desktop e Android arm64,
compilação Java/Kotlin e compilação dos módulos nativos Pojav.
Sem chave CurseForge fornecida, os testes da API usam respostas simuladas.

O script também copia a biblioteca e os adaptadores Android do Horizon do
build integrado local existente, e incorpora `assets/engine-data.zip` quando
disponível. As duas engines rodam em processos separados no mesmo APK.
