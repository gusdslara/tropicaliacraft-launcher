# Verificação do launcher — 13/11/2026

- Mods Java: instalação pelo app Android testada com Mod Menu 7.2.2 em Fabric 1.20.1; arquivo encontrado na pasta correta e mod confirmado dentro do Minecraft. A home liberou Jogar após a instalação. A parada do Java voltou ao estado Jogar.
- Mods Rust: arquivos de conteúdo são verificados antes de iniciar. Pacotes nativos sem suporte no motor ficam indisponíveis. O APK contém Zoom, Minimap, Recipes e SmartF3; a lista do menu inicial foi corrigida para mostrar esses módulos antes de entrar em um mundo, respeitando os estados salvos. Os testes Android da lista passaram; a última correção ainda precisa de conferência no celular após reconectar o ADB.
- Rede: a preparação dos módulos Rust integrados funciona sem consultar o catálogo. Consultas ao catálogo e APIs possuem prazo para falhar e liberar a interface.
- Configuração, mods e controles: botão Salvar, confirmação de alterações não salvas e preservação do rascunho quando salvar falha.
- Layout: exportação/importação pelo seletor Android testadas. Restaurar padrões retorna controles com opacidade de 30%; o layout personalizado do usuário foi preservado.
- Biblioteca online: publicada em https://tropicaliacraft.gustavolara.pro/api/layouts. Busca por nome, #ID e @ID, listagem paginada e experimentação antes de salvar. Padrão público: #9G5F9S3X. Publicação e buscas foram confirmadas no backend; listagem, busca e experimentação também foram testadas no app instalado.
- Responsividade: home, configuração, mods e editor verificados em 360, 768, 1280 e 1920 pixels de largura sem transbordamento horizontal; os badges testados ficaram dentro das laterais. Os últimos ajustes ampliam o espaço dos toggles em telas pequenas. Textos dos fluxos alterados têm versões PT/EN/ES.
- Checks: build frontend; svelte-check; compilação Android do launcher; 6 testes Bun do launcher; 3 testes da API; regressões nativas de migração e timeout; 4 testes da lista Android e 3 da lista desktop.

Limites: outros .hnmod precisam ser compilados em um motor compatível. O APK de desenvolvimento ainda mostra o aviso Android de alinhamento 16 KB de bibliotecas legadas; o aparelho testado usa páginas de 4 KB. Não foi validado em todos os modelos físicos de celular ou desktop.

O diretório tropicalia-launcher é ignorado pelo Git do projeto pai. Seus arquivos estão atualizados localmente; o backend aparece normalmente no diff do repositório pai. As alterações pré-existentes nos scripts de ícones foram preservadas.

APK final gerado em 13/11/2026, com assinatura APK v2 validada e bibliotecas conferidas contra os builds finais. Versão 10000002 instalada por atualização, preservando dados. A conferência visual final da página Rust aguarda o desbloqueio do celular.
