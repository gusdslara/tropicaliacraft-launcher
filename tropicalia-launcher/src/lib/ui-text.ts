import { detectLanguage } from './i18n';
const messages: Record<string, [string, string]> = {
  "Controles": ["Controls", "Controles"],
  "Skins": ["Skins", "Skins"],
  "Minhas skins": ["My skins", "Mis skins"],
  "Abrir": ["Open", "Abrir"],
  "Abrir PNG": ["Open PNG", "Abrir PNG"],
  "Exportar PNG 64x64": ["Export 64x64 PNG", "Exportar PNG 64x64"],
  "Salvar (Ctrl+S)": ["Save (Ctrl+S)", "Guardar (Ctrl+S)"],
  "Pintar": ["Paint", "Pintar"],
  "Girar": ["Orbit", "Girar"],
  "Base": ["Base", "Base"],
  "Camada 3D": ["3D layer", "Capa 3D"],
  "Todas": ["All", "Todas"],
  "Espelho": ["Mirror", "Espejo"],
  "Lápis": ["Pencil", "Lápiz"],
  "Borracha": ["Eraser", "Borrador"],
  "Balde": ["Bucket", "Cubo"],
  "Pegar cor": ["Pick color", "Tomar color"],
  "Pixel transparente: escolha um pixel com cor.": ["Transparent pixel: pick a pixel that has a color.", "Píxel transparente: elige un píxel con color."],
  "Clarear": ["Lighten", "Aclarar"],
  "Escurecer": ["Darken", "Oscurecer"],
  "Textura": ["Texture", "Textura"],
  "Tudo": ["All", "Todo"],
  "Cabeça": ["Head", "Cabeza"],
  "Tronco": ["Torso", "Torso"],
  "Braço dir.": ["Right arm", "Brazo der."],
  "Braço esq.": ["Left arm", "Brazo izq."],
  "Perna dir.": ["Right leg", "Pierna der."],
  "Perna esq.": ["Left leg", "Pierna izq."],
  "Parado": ["Standing", "Quieto"],
  "Andando": ["Walking", "Caminando"],
  "Correndo": ["Running", "Corriendo"],
  "Herói": ["Hero", "Héroe"],
  "Dança": ["Dance", "Baile"],
  "Gerar skin com IA": ["Generate skin with AI", "Generar skin con IA"],
  "Descrever": ["Describe", "Describir"],
  "Prontas": ["Ready-made", "Listas"],
  "Por nick": ["By username", "Por nick"],
  "Descreva a skin": ["Describe the skin", "Describe la skin"],
  "Gerar": ["Generate", "Generar"],
  "Carregar": ["Load", "Cargar"],
  "Nick do jogador": ["Player username", "Nick del jugador"],
  "A IA do launcher roda no seu aparelho: funciona sem internet e não gasta créditos.": ["The launcher AI runs on your device: it works offline and uses no credits.", "La IA del launcher se ejecuta en tu dispositivo: funciona sin internet y no gasta créditos."],
  "Copia a skin atual de qualquer jogador. Precisa de internet.": ["Copies any player's current skin. Needs internet.", "Copia la skin actual de cualquier jugador. Necesita internet."],
  "Nova skin em branco": ["New blank skin", "Nueva skin en blanco"],
  "Exportar PNG": ["Export PNG", "Exportar PNG"],
  "Nada salvo ainda. Use Salvar para guardar a skin neste aparelho; tudo fica disponível offline.": ["Nothing saved yet. Use Save to keep the skin on this device; everything works offline.", "Aún no hay nada guardado. Usa Guardar para conservar la skin en este dispositivo; todo funciona sin conexión."],
  "Salva em Minhas skins:": ["Saved to My skins:", "Guardada en Mis skins:"],
  "PNG salvo em": ["PNG saved to", "PNG guardado en"],
  "Skin gerada:": ["Skin generated:", "Skin generada:"],
  "Skin carregada:": ["Skin loaded:", "Skin cargada:"],
  "Skin importada.": ["Skin imported.", "Skin importada."],
  "Skin 64x32 convertida para 64x64.": ["64x32 skin converted to 64x64.", "Skin 64x32 convertida a 64x64."],
  "Sem internet: buscar por nick precisa de conexão.": ["Offline: looking up a username needs a connection.", "Sin internet: buscar por nick necesita conexión."],
  "Descartar": ["Discard", "Descartar"],
  "Alterações descartadas.": ["Changes discarded.", "Cambios descartados."],
  "passe o cursor para ver a parte do corpo": ["hover to see the body part", "pasa el cursor para ver la parte del cuerpo"],
  "Salvar foto 3D": ["Save 3D photo", "Guardar foto 3D"],
  "Centralizar câmera": ["Reset camera", "Centrar cámara"],
  "Outros servidores": ["Other servers", "Otros servidores"],
  "Só esse perfil por enquanto. Clique em Novo para criar outro.": ["Only this profile for now. Click New to create another.", "Solo tienes este perfil. Pulsa Nuevo para crear otro."],
  "Nenhum perfil ainda.": ["No profiles yet.", "Todavía no hay perfiles."],
  "Perfil:": ["Profile:", "Perfil:"],
  "no ar": ["online", "en línea"],
  "parado": ["stopped", "detenido"],
  "Nenhum outro servidor adicionado aos seus perfis.": ["No other servers added to your profiles.", "No hay otros servidores añadidos a tus perfiles."],
  "Entrar em": ["Join", "Entrar en"],
  "Versão do": ["Version of", "Versión de"],
  "Upscaling Gráfico": ["Graphics upscaling", "Reescalado gráfico"],
  "Vulkan Nativo": ["Native Vulkan", "Vulkan nativo"],
  "Automático (horizon-client.exe oficial)": ["Automatic (official horizon-client.exe)", "Automático (horizon-client.exe oficial)"],
  "Automático (Java oficial da Mojang)": ["Automatic (official Mojang Java)", "Automático (Java oficial de Mojang)"],
  "Holy GL4ES / MobileGlues (Padrão · Alto desempenho com Shaders)": ["Holy GL4ES / MobileGlues (Default · High performance with shaders)", "Holy GL4ES / MobileGlues (Predeterminado · Alto rendimiento con shaders)"],
  "Excluir arquivo customizado": ["Delete custom file", "Eliminar archivo personalizado"],
  "Salve para aplicar os mods selecionados ao Minecraft Rust. O launcher baixa os arquivos necessários e mantém os módulos integrados selecionados.": ["Save to apply the selected mods to Minecraft Rust. The launcher downloads required files and keeps the selected built-in modules enabled.", "Guarda para aplicar los mods seleccionados a Minecraft Rust. El launcher descarga los archivos necesarios y mantiene activados los módulos integrados seleccionados."],
  "Desativar um mod mantém o arquivo e suas configurações para ativá-lo novamente depois.": ["Disabling a mod keeps its file and settings so you can enable it again later.", "Desactivar un mod conserva su archivo y configuración para activarlo de nuevo después."],

  "Salvar": [
    "Save",
    "Guardar"
  ],
  "Salvar Alterações": [
    "Save changes",
    "Guardar cambios"
  ],
  "Cancelar": [
    "Cancel",
    "Cancelar"
  ],
  "Fechar": [
    "Close",
    "Cerrar"
  ],
  "Configurar": [
    "Configure",
    "Configurar"
  ],
  "Jogar": [
    "Play",
    "Jugar"
  ],
  "Fechar jogo": [
    "Stop game",
    "Cerrar juego"
  ],
  "Novo perfil": [
    "New profile",
    "Nuevo perfil"
  ],
  "Novo": [
    "New",
    "Nuevo"
  ],
  "Seus perfis": [
    "Your profiles",
    "Tus perfiles"
  ],
  "CONTINUAR JOGANDO": [
    "CONTINUE PLAYING",
    "SEGUIR JUGANDO"
  ],
  "JOGANDO AGORA": [
    "PLAYING NOW",
    "JUGANDO AHORA"
  ],
  "Bem-vindo ao Tropicalia!": [
    "Welcome to Tropicalia!",
    "¡Bienvenido a Tropicalia!"
  ],
  "Configuração da Instância": [
    "Instance configuration",
    "Configuración de instancia"
  ],
  "Nome da Instância": [
    "Instance name",
    "Nombre de instancia"
  ],
  "Nome da instância": [
    "Instance name",
    "Nombre de instancia"
  ],
  "Ícone do Bloco": [
    "Block icon",
    "Icono de bloque"
  ],
  "Tipo de Minecraft": [
    "Minecraft edition",
    "Edición de Minecraft"
  ],
  "Versão do Jogo": [
    "Game version",
    "Versión del juego"
  ],
  "Resolução da Janela": [
    "Window resolution",
    "Resolución de ventana"
  ],
  "Alterar a versão pode exigir reconfigurar seus mods.": [
    "Changing version may require different mods.",
    "Cambiar la versión puede requerir otros mods."
  ],
  "Deixe em branco para usar o padrão da sua tela.": [
    "Leave empty to use your screen size.",
    "Dejar vacío para usar el tamaño de pantalla."
  ],
  "Entrar Direto no Servidor (Auto-Join)": [
    "Join server automatically",
    "Entrar al servidor automáticamente"
  ],
  "Ao clicar em Jogar, conecta diretamente no endereço IP fornecido.": [
    "Play connects directly to this server address.",
    "Jugar conecta directamente a esta dirección."
  ],
  "Abrir pasta": [
    "Open folder",
    "Abrir carpeta"
  ],
  "Clonar": [
    "Clone",
    "Clonar"
  ],
  "Excluir": [
    "Delete",
    "Eliminar"
  ],
  "Preset Gráfico": [
    "Graphics preset",
    "Preajuste gráfico"
  ],
  "Distância de Renderização": [
    "Render distance",
    "Distancia de renderizado"
  ],
  "Limite de FPS": [
    "FPS limit",
    "Límite de FPS"
  ],
  "Modo de Apresentação (VSync)": [
    "Presentation mode (VSync)",
    "Modo de presentación (VSync)"
  ],
  "Detalhe Distante": [
    "Distant detail",
    "Detalle distante"
  ],
  "Backend Gráfico": [
    "Graphics backend",
    "Motor gráfico"
  ],
  "Texturas Animadas": [
    "Animated textures",
    "Texturas animadas"
  ],
  "Luz Dinâmica": [
    "Dynamic lighting",
    "Iluminación dinámica"
  ],
  "Brilho Máximo (Fullbright)": [
    "Full brightness (Fullbright)",
    "Brillo máximo (Fullbright)"
  ],
  "Contador de FPS": [
    "FPS counter",
    "Contador de FPS"
  ],
  "Minimapa no HUD": [
    "HUD minimap",
    "Minimapa en HUD"
  ],
  "Cache de Sombras": [
    "Shadow cache",
    "Caché de sombras"
  ],
  "Clima (Chuva/Neve)": [
    "Weather (rain/snow)",
    "Clima (lluvia/nieve)"
  ],
  "Céu & Estrelas": [
    "Sky & stars",
    "Cielo y estrellas"
  ],
  "Neblina (Fog)": [
    "Fog",
    "Niebla"
  ],
  "Volume Geral (Master)": [
    "Master volume",
    "Volumen general"
  ],
  "Música": [
    "Music",
    "Música"
  ],
  "Clima / Chuva": [
    "Weather / rain",
    "Clima / lluvia"
  ],
  "Sons de Blocos": [
    "Block sounds",
    "Sonidos de bloques"
  ],
  "Criaturas Hostis": [
    "Hostile creatures",
    "Criaturas hostiles"
  ],
  "Criaturas Pacíficas": [
    "Friendly creatures",
    "Criaturas pacíficas"
  ],
  "Jogadores": [
    "Players",
    "Jugadores"
  ],
  "Ambiente / Cavernas": [
    "Ambient / caves",
    "Ambiente / cuevas"
  ],
  "Voz / Fala": [
    "Voice / speech",
    "Voz / habla"
  ],
  "Exibir Legendas de Som": [
    "Show sound subtitles",
    "Mostrar subtítulos de sonido"
  ],
  "Campo de Visão (FOV)": [
    "Field of view (FOV)",
    "Campo de visión (FOV)"
  ],
  "Brilho do Jogo (Gamma)": [
    "Game brightness (gamma)",
    "Brillo del juego (gamma)"
  ],
  "Balanço da Visão ao Andar": [
    "View bobbing",
    "Balanceo de cámara"
  ],
  "Escala da Interface (GUI)": [
    "Interface scale (GUI)",
    "Escala de interfaz (GUI)"
  ],
  "Indicador de Ataque": [
    "Attack indicator",
    "Indicador de ataque"
  ],
  "Desfoque nos Menus (Blur)": [
    "Menu blur",
    "Desenfoque de menús"
  ],
  "Alto Contraste": [
    "High contrast",
    "Alto contraste"
  ],
  "Zoom Suave Nativo": [
    "Smooth native zoom",
    "Zoom nativo suave"
  ],
  "Tecla de Zoom": [
    "Zoom key",
    "Tecla de zoom"
  ],
  "Transição Suave": [
    "Smooth transition",
    "Transición suave"
  ],
  "Posição": [
    "Position",
    "Posición"
  ],
  "Tamanho": [
    "Size",
    "Tamaño"
  ],
  "Pulo Automático": [
    "Auto jump",
    "Salto automático"
  ],
  "Alternar Agachamento": [
    "Toggle sneak",
    "Alternar agachado"
  ],
  "Alternar Corrida": [
    "Toggle sprint",
    "Alternar carrera"
  ],
  "Reconectar Automático": [
    "Auto reconnect",
    "Reconexión automática"
  ],
  "Modo Criativo": [
    "Creative mode",
    "Modo creativo"
  ],
  "Terreno de Teste": [
    "Test terrain",
    "Terreno de prueba"
  ],
  "Pré-gerador Chunks": [
    "Chunk pregeneration",
    "Pregeneración de chunks"
  ],
  "Socket Agente": [
    "Agent socket",
    "Socket de agente"
  ],
  "Parâmetros Nativos do Horizon Rust": [
    "Horizon Rust native parameters",
    "Parámetros nativos de Horizon Rust"
  ],
  "Argumentos Extras da JVM": [
    "Extra JVM arguments",
    "Argumentos JVM adicionales"
  ],
  "Caminho Customizado do Java (Opcional)": [
    "Custom Java path (optional)",
    "Ruta Java personalizada (opcional)"
  ],
  "Renderizador Gráfico Java": [
    "Java graphics renderer",
    "Renderizador gráfico Java"
  ],
  "Ambiente Java Runtime (JRE)": [
    "Java runtime (JRE)",
    "Entorno Java (JRE)"
  ],
  "Configurações da JVM e Renderizador Java": [
    "JVM and Java renderer configuration",
    "Configuración JVM y renderizador Java"
  ],
  "Executável Customizado (Opcional)": [
    "Custom executable (optional)",
    "Ejecutable personalizado (opcional)"
  ],
  "Parâmetros Extras da Linha de Comando": [
    "Extra command line arguments",
    "Argumentos adicionales"
  ],
  "Automático (Auto)": [
    "Automatic",
    "Automático"
  ],
  "Desativado": [
    "Disabled",
    "Desactivado"
  ],
  "Desligado (Off)": [
    "Off",
    "Apagado"
  ],
  "Ilimitado": [
    "Unlimited",
    "Ilimitado"
  ],
  "Superior Esquerdo": [
    "Top left",
    "Superior izquierda"
  ],
  "Superior Direito": [
    "Top right",
    "Superior derecha"
  ],
  "Inferior Esquerdo": [
    "Bottom left",
    "Inferior izquierda"
  ],
  "Inferior Direito": [
    "Bottom right",
    "Inferior derecha"
  ],
  "Desempenho": [
    "Performance",
    "Rendimiento"
  ],
  "Equilibrado": [
    "Balanced",
    "Equilibrado"
  ],
  "Qualidade": [
    "Quality",
    "Calidad"
  ],
  "Gerenciador de Mods & Conteúdo": [
    "Mods & content",
    "Mods y contenido"
  ],
  "Abrir pasta de mods": [
    "Open mods folder",
    "Abrir carpeta de mods"
  ],
  "Padrões Tropicalia": [
    "Tropicalia defaults",
    "Predeterminados Tropicalia"
  ],
  "Ativar todos": [
    "Enable all",
    "Activar todos"
  ],
  "Desativar todos": [
    "Disable all",
    "Desactivar todos"
  ],
  "Atualizar": [
    "Refresh",
    "Actualizar"
  ],
  "Atualizar lista": [
    "Refresh list",
    "Actualizar lista"
  ],
  "Recarregar lista": [
    "Reload list",
    "Recargar lista"
  ],
  "Limpar busca": [
    "Clear search",
    "Limpiar búsqueda"
  ],
  "Limpar todos os filtros": [
    "Clear all filters",
    "Limpiar todos los filtros"
  ],
  "Explorar & Adicionar": [
    "Browse & add",
    "Explorar y añadir"
  ],
  "Fechar Catálogo": [
    "Close catalog",
    "Cerrar catálogo"
  ],
  "Padrão": [
    "Default",
    "Predeterminado"
  ],
  "Texturas": [
    "Textures",
    "Texturas"
  ],
  "Carregando mods do ecossistema...": [
    "Loading mods...",
    "Cargando mods..."
  ],
  "Nenhum mod encontrado com o filtro atual.": [
    "No mods match these filters.",
    "Ningún mod coincide con los filtros."
  ],
  "Ativado": [
    "Enabled",
    "Activado"
  ],
  "Selecionado · baixar ao salvar": [
    "Selected · download on save",
    "Seleccionado · descargar al guardar"
  ],
  "Controles de toque": [
    "Touch controls",
    "Controles táctiles"
  ],
  "Arraste para mover · canto verde para redimensionar": [
    "Drag to move · green corner to resize",
    "Arrastra para mover · esquina verde para cambiar tamaño"
  ],
  "Botão": [
    "Button",
    "Botón"
  ],
  "Aparência": [
    "Appearance",
    "Apariencia"
  ],
  "Ícone": [
    "Icon",
    "Icono"
  ],
  "Formato": [
    "Shape",
    "Forma"
  ],
  "Fundo": [
    "Background",
    "Fondo"
  ],
  "Borda": [
    "Border",
    "Borde"
  ],
  "Pressionado": [
    "Pressed",
    "Pulsado"
  ],
  "Predefinições": [
    "Presets",
    "Preajustes"
  ],
  "Restaurar padrão": [
    "Restore defaults",
    "Restaurar predeterminados"
  ],
  "Ocultar botão": [
    "Hide button",
    "Ocultar botón"
  ],
  "Mostrar botão": [
    "Show button",
    "Mostrar botón"
  ],
  "Ocultar painel": [
    "Hide panel",
    "Ocultar panel"
  ],
  "Mostrar painel": [
    "Show panel",
    "Mostrar panel"
  ],
  "Grade: ligada": [
    "Grid: on",
    "Cuadrícula: activada"
  ],
  "Grade: desligada": [
    "Grid: off",
    "Cuadrícula: desactivada"
  ],
  "Prévia da tela do jogo": [
    "Game screen preview",
    "Vista previa del juego"
  ],
  "Editor de controles de toque": [
    "Touch controls editor",
    "Editor de controles táctiles"
  ],
  "Ícone do botão": [
    "Button icon",
    "Icono de botón"
  ],
  "Cores próprias neste botão": [
    "Custom button colors",
    "Colores personalizados del botón"
  ],
  "Toque num botão da prévia para editá-lo.": [
    "Tap a preview button to edit it.",
    "Toca un botón de la vista previa para editarlo."
  ],
  "Vale para todas as instâncias, Java e Rust. Aplicado ao abrir o jogo.": [
    "Applies to all Java and Rust instances on the next launch.",
    "Se aplica a todas las instancias Java y Rust al iniciar."
  ],
  "Layout padrão restaurado. Salve para aplicar.": [
    "Default layout restored. Save to apply.",
    "Diseño predeterminado restaurado. Guarda para aplicar."
  ],
  "Controles salvos para Java e Rust.": [
    "Controls saved for Java and Rust.",
    "Controles guardados para Java y Rust."
  ],
  "Fechar sem salvar": [
    "Close without saving",
    "Cerrar sin guardar"
  ],
  "Movimento": [
    "Movement",
    "Movimiento"
  ],
  "Correr": [
    "Sprint",
    "Correr"
  ],
  "Pular / subir": [
    "Jump / ascend",
    "Saltar / subir"
  ],
  "Agachar / descer": [
    "Sneak / descend",
    "Agacharse / bajar"
  ],
  "Atacar / quebrar": [
    "Attack / break",
    "Atacar / romper"
  ],
  "Usar / colocar": [
    "Use / place",
    "Usar / colocar"
  ],
  "Pausa": [
    "Pause",
    "Pausa"
  ],
  "Inventário": [
    "Inventory",
    "Inventario"
  ],
  "Depuração (F3)": [
    "Debug (F3)",
    "Depuración (F3)"
  ],
  "Câmera (F5)": [
    "Camera (F5)",
    "Cámara (F5)"
  ],
  "Trocar mãos": [
    "Swap hands",
    "Cambiar manos"
  ],
  "Escudo": [
    "Shield",
    "Escudo"
  ],
  "Teclado (Java)": [
    "Keyboard (Java)",
    "Teclado (Java)"
  ],
  "Ajustes de toque": [
    "Touch settings",
    "Ajustes táctiles"
  ],
  "Clássico": [
    "Classic",
    "Clásico"
  ],
  "Transparente": [
    "Transparent",
    "Transparente"
  ],
  "Pôr do sol": [
    "Sunset",
    "Atardecer"
  ],
  "Círculo": [
    "Circle",
    "Círculo"
  ],
  "Arredondado": [
    "Rounded",
    "Redondeado"
  ],
  "Quadrado": [
    "Square",
    "Cuadrado"
  ],
  "1. Geral": [
    "1. General",
    "1. General"
  ],
  "2. Memória & Execução": [
    "2. Memory & launch",
    "2. Memoria y ejecución"
  ],
  "3. Vulkan & Gráficos": [
    "3. Vulkan & graphics",
    "3. Vulkan y gráficos"
  ],
  "4. Áudio & Sons": [
    "4. Audio & sounds",
    "4. Audio y sonidos"
  ],
  "5. Visão & HUD": [
    "5. View & HUD",
    "5. Vista y HUD"
  ],
  "6. Extras & Controles": [
    "6. Extras & controls",
    "6. Extras y controles"
  ],
  "7. Saída HDR": [
    "7. HDR output",
    "7. Salida HDR"
  ],
  "2. Memória & Renderização Java": [
    "2. Memory & Java rendering",
    "2. Memoria y renderizado Java"
  ],
  "Todos os Mods": [
    "All mods",
    "Todos los mods"
  ],
  "HUD & Indicadores": [
    "HUD & indicators",
    "HUD e indicadores"
  ],
  "Qualidade de Vida (QoL)": [
    "Quality of life (QoL)",
    "Calidad de vida (QoL)"
  ],
  "Jogabilidade": [
    "Gameplay",
    "Jugabilidad"
  ],
  "Visual & Animações": [
    "Visuals & animations",
    "Visuales y animaciones"
  ],
  "Mapas & Waypoints": [
    "Maps & waypoints",
    "Mapas y puntos de referencia"
  ],
  "Multiplayer & Social": [
    "Multiplayer & social",
    "Multijugador y social"
  ],
  "Requer compilação nativa": [
    "Requires native build",
    "Requiere compilación nativa"
  ],
  "Alterações não salvas": [
    "Unsaved changes",
    "Cambios sin guardar"
  ],
  "Salvar alterações antes de sair?": [
    "Save changes before exiting?",
    "¿Guardar los cambios antes de salir?"
  ],
  "Sair sem salvar": [
    "Exit without saving",
    "Salir sin guardar"
  ],
  "Salvar e sair": [
    "Save and exit",
    "Guardar y salir"
  ],
  "Ajustes salvos com sucesso!": [
    "Settings saved successfully!",
    "¡Ajustes guardados!"
  ],
  "Configurações salvas com sucesso!": [
    "Configuration saved successfully!",
    "¡Configuración guardada!"
  ],
  "Informe o nome da instância.": [
    "Enter an instance name.",
    "Introduce un nombre de instancia."
  ],
  "Limites de memória inválidos.": [
    "Invalid memory limits.",
    "Límites de memoria inválidos."
  ],
  "Opacidade": [
    "Opacity",
    "Opacidad"
  ],
  "Opacidade do fundo": [
    "Background opacity",
    "Opacidad del fondo"
  ],
  "Espessura da borda": [
    "Border width",
    "Grosor del borde"
  ],
  "Escala geral": [
    "Overall scale",
    "Escala general"
  ],
  "Automático (Vulkan preferencial)": [
    "Automatic (prefer Vulkan)",
    "Automático (preferir Vulkan)"
  ],
  "Automático (Detectado conforme versão do MC)": [
    "Automatic (match Minecraft version)",
    "Automático (según versión de Minecraft)"
  ],
  "Aceleração Google ANGLE (OpenGL ES sobre Vulkan)": [
    "Google ANGLE acceleration (OpenGL ES over Vulkan)",
    "Aceleración Google ANGLE (OpenGL ES sobre Vulkan)"
  ],
  "Ajustes de renderização gráfica acelerada por hardware e máquina virtual.": [
    "Hardware graphics acceleration and virtual machine settings.",
    "Ajustes de aceleración gráfica y máquina virtual."
  ],
  "Branco de Referência (Paper White)": [
    "Reference white (paper white)",
    "Blanco de referencia (paper white)"
  ],
  "Pico de Brilho dos Destaques (Peak)": [
    "Peak highlight brightness",
    "Brillo máximo de luces"
  ],
  "Requer monitor compatível com HDR10 ou scRGB ativado no Windows.": [
    "Requires HDR10 or scRGB enabled on a compatible display.",
    "Requiere HDR10 o scRGB activado en una pantalla compatible."
  ],
  "Áudio Espacial 3D (HRTF Direcional)": [
    "3D spatial audio (directional HRTF)",
    "Audio espacial 3D (HRTF direccional)"
  ],
  "Melhor posicionamento espacial em fones de ouvido.": [
    "Improved spatial positioning with headphones.",
    "Mejor posicionamiento espacial con auriculares."
  ],
  "Mostra indicadores de som no canto da tela.": [
    "Shows sound indicators in the screen corner.",
    "Muestra indicadores de sonido en la esquina de la pantalla."
  ],
  "Bordas destacadas e maior contraste nos menus.": [
    "Highlighted edges and higher menu contrast.",
    "Bordes resaltados y mayor contraste en los menús."
  ],
  "Movimento da câmera ao caminhar (View Bobbing).": [
    "Camera movement while walking (view bobbing).",
    "Movimiento de cámara al caminar."
  ],
  "Visão noturna clara permanente.": [
    "Permanent night vision.",
    "Visión nocturna permanente."
  ],
  "Tochas e itens iluminam ao segurar.": [
    "Torches and held items emit light.",
    "Las antorchas y objetos en la mano emiten luz."
  ],
  "Taxa de quadros e frametime em tempo real.": [
    "Live frame rate and frame time.",
    "FPS y tiempo de fotograma en tiempo real."
  ],
  "Sobreposição de teclas WASD e cliques.": [
    "WASD keys and click overlay.",
    "Superposición de teclas WASD y clics."
  ],
  "Mostra o status de jogo no Discord.": [
    "Shows game status in Discord.",
    "Muestra el estado del juego en Discord."
  ],
  "Arrasto e rolagem ágil em baús e inventário.": [
    "Faster dragging and scrolling in chests and inventory.",
    "Arrastre y desplazamiento más ágil en cofres e inventario."
  ],
  "Aproximação de câmera cinematográfica estilo OptiFine.": [
    "Cinematic camera zoom like OptiFine.",
    "Zoom de cámara cinematográfico estilo OptiFine."
  ],
  "Deixe em branco para usar o binário nativo pré-instalado pelo launcher.": [
    "Leave empty to use the launcher's installed native engine.",
    "Dejar vacío para usar el motor nativo instalado."
  ],
  "Argumentos adicionais passados ao iniciar o horizon-client.": [
    "Extra arguments passed when starting horizon-client.",
    "Argumentos adicionales al iniciar horizon-client."
  ],
  "Flags de depuração da engine nativa aceitas diretamente pelo cliente.": [
    "Native engine debug flags accepted by the client.",
    "Indicadores de depuración del motor nativo aceptados por el cliente."
  ],
  "Desempenho (Performance)": [
    "Performance",
    "Rendimiento"
  ],
  "Equilibrado (Balanced)": [
    "Balanced",
    "Equilibrado"
  ],
  "Qualidade (Quality)": [
    "Quality",
    "Calidad"
  ],
  "Personalizado (Custom)": [
    "Custom",
    "Personalizado"
  ],
  "Completo (Full)": [
    "Full",
    "Completo"
  ],
  "Reduzido (Reduced)": [
    "Reduced",
    "Reducido"
  ],
  "Simples (Simple)": [
    "Simple",
    "Simple"
  ],
  "Ultra Desempenho": [
    "Ultra performance",
    "Rendimiento ultra"
  ],
  "Nativo (100%)": [
    "Native (100%)",
    "Nativo (100%)"
  ],
  "Imediato (Menor latência)": [
    "Immediate (lowest latency)",
    "Inmediato (menor latencia)"
  ],
  "Mailbox (Sem tearing, baixa latência)": [
    "Mailbox (no tearing, low latency)",
    "Mailbox (sin tearing, baja latencia)"
  ],
  "VSync Tradicional (Fifo)": [
    "Traditional VSync (FIFO)",
    "VSync tradicional (FIFO)"
  ],
  "1x (Pequeno)": [
    "1x (small)",
    "1x (pequeño)"
  ],
  "2x (Normal)": [
    "2x (normal)",
    "2x (normal)"
  ],
  "3x (Grande)": [
    "3x (large)",
    "3x (grande)"
  ],
  "4x (Muito Grande)": [
    "4x (extra large)",
    "4x (muy grande)"
  ],
  "512 MB (Mínimo)": [
    "512 MB (minimum)",
    "512 MB (mínimo)"
  ],
  "Pequeno (64px)": [
    "Small (64px)",
    "Pequeño (64px)"
  ],
  "Médio (96px)": [
    "Medium (96px)",
    "Mediano (96px)"
  ],
  "Grande (128px)": [
    "Large (128px)",
    "Grande (128px)"
  ],
  "Na Mira (Crosshair)": [
    "Crosshair",
    "Mira"
  ],
  "Na Barra de Ação (Hotbar)": [
    "Hotbar",
    "Barra de acceso rápido"
  ],
  "Melhora a taxa de quadros e estabilidade em drivers gráficos modernos.": [
    "Improves frame rate and stability with modern graphics drivers.",
    "Mejora FPS y estabilidad con controladores gráficos modernos."
  ],
  "Gerenciador de mods (.jar), modpacks, texturas, shaders e data packs deste perfil.": [
    "Manage this profile's mods, modpacks, resource packs, shaders and data packs.",
    "Gestiona mods, modpacks, texturas, shaders y paquetes de datos del perfil."
  ],
  "Selecione os mods e salve antes de jogar. O motor carrega as seleções na próxima inicialização.": [
    "Select mods and save before playing. Selections apply on the next launch.",
    "Selecciona mods y guarda antes de jugar. Se aplican al próximo inicio."
  ],
  "Salvar alterações": [
    "Save changes",
    "Guardar cambios"
  ],
  "Editar controles": [
    "Edit controls",
    "Editar controles"
  ],
  "Um só layout para Minecraft Java e Rust no celular": [
    "One layout for Minecraft Java and Rust on mobile",
    "Un diseño para Minecraft Java y Rust en móvil"
  ],
  "Comportamento e Arquivos": [
    "Behavior & files",
    "Comportamiento y archivos"
  ],
  "Preferências de execução do launcher": [
    "Launcher preferences",
    "Preferencias del launcher"
  ],
  "Sobre o TropicaliaLauncher": [
    "About TropicaliaLauncher",
    "Acerca de TropicaliaLauncher"
  ],
  "Verificar atualizações": [
    "Check for updates",
    "Buscar actualizaciones"
  ],
  "Usar ANGLE (OpenGL sobre Vulkan)": [
    "Use ANGLE (OpenGL over Vulkan)",
    "Usar ANGLE (OpenGL sobre Vulkan)"
  ],
  "Caminho do Java Manual (Opcional)": [
    "Manual Java path (optional)",
    "Ruta Java manual (opcional)"
  ],
  "Ir para a bandeja ao abrir o jogo": [
    "Minimize to tray when the game opens",
    "Minimizar a la bandeja al abrir el juego"
  ],
  "Pasta de dados (.tropicalia)": [
    "Data folder (.tropicalia)",
    "Carpeta de datos (.tropicalia)"
  ],
  "Entrar no servidor": [
    "Join server",
    "Entrar al servidor"
  ],
  "Sim, entrar": [
    "Yes, join",
    "Sí, entrar"
  ],
  "Mods de": [
    "Mods for",
    "Mods de"
  ],
  "Última vez:": [
    "Last played:",
    "Última vez:"
  ],
  "Todos": [
    "All",
    "Todos"
  ],
  "Ativados": [
    "Enabled",
    "Activados"
  ],
  "Desativados": [
    "Disabled",
    "Desactivados"
  ],
  "Novo Perfil de Minecraft": [
    "New Minecraft profile",
    "Nuevo perfil de Minecraft"
  ],
  "Voltar aos ajustes": ["Back to settings", "Volver a ajustes"],
  "Launcher de código aberto para Minecraft no PC e no celular": ["Open-source Minecraft launcher for PC and mobile", "Launcher de código abierto para Minecraft en PC y móvil"],
  "O TropicaliaLauncher junta dois jeitos de jogar num app só: o motor Horizon, escrito em Rust, e o runtime Java do PojavLauncher para rodar o Minecraft: Java Edition original no Android. Nada disso existiria sem os projetos abaixo.": ["TropicaliaLauncher brings two ways to play into one app: the Horizon engine, written in Rust, and the PojavLauncher Java runtime that runs the original Minecraft: Java Edition on Android. None of it would exist without the projects below.", "TropicaliaLauncher reúne dos formas de jugar en una sola app: el motor Horizon, escrito en Rust, y el runtime Java de PojavLauncher para ejecutar el Minecraft: Java Edition original en Android. Nada de esto existiría sin los proyectos de abajo."],
  "Código-fonte": ["Source code", "Código fuente"],
  "Avisos de terceiros": ["Third-party notices", "Avisos de terceros"],
  "Licença (MIT)": ["License (MIT)", "Licencia (MIT)"],
  "Motores e runtimes": ["Engines and runtimes", "Motores y runtimes"],
  "Inclui modificações nossas. Código-fonte exato em": ["Includes our modifications. Exact source code in", "Incluye modificaciones nuestras. Código fuente exacto en"],
  "Projeto": ["Project", "Proyecto"],
  "Nosso código": ["Our code", "Nuestro código"],
  "Licença": ["License", "Licencia"],
  "Bibliotecas e serviços": ["Libraries and services", "Bibliotecas y servicios"],
  "Outros projetos de código aberto usados pelo launcher": ["Other open-source projects used by the launcher", "Otros proyectos de código abierto usados por el launcher"],
  "Avisos legais": ["Legal notices", "Avisos legales"],
  "Não é um produto oficial do Minecraft. Não é aprovado nem associado à Mojang ou à Microsoft. Minecraft é marca registrada da Mojang Synergies AB.": ["Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB.", "No es un producto oficial de Minecraft. No está aprobado ni asociado con Mojang o Microsoft. Minecraft es una marca registrada de Mojang Synergies AB."],
  "O launcher não inclui arquivos do jogo: o Minecraft: Java Edition é baixado dos servidores da Mojang com a sua conta Microsoft, que precisa ter o jogo comprado.": ["The launcher ships no game files: Minecraft: Java Edition is downloaded from Mojang's servers with your Microsoft account, which must own the game.", "El launcher no incluye archivos del juego: Minecraft: Java Edition se descarga de los servidores de Mojang con tu cuenta Microsoft, que debe tener el juego comprado."],
  "O runtime Java do Android é uma versão modificada do PojavLauncher (LGPL-3.0). Você pode baixar o código-fonte exato de cada versão no repositório e trocar essa parte por uma versão sua.": ["The Android Java runtime is a modified version of PojavLauncher (LGPL-3.0). You can get the exact source code of every release from the repository and replace that part with your own build.", "El runtime Java de Android es una versión modificada de PojavLauncher (LGPL-3.0). Puedes descargar el código fuente exacto de cada versión en el repositorio y reemplazar esa parte por tu propia versión."],
  "Créditos e licenças": ["Credits and licenses", "Créditos y licencias"],
  "Motor em Rust que reimplementa o cliente do Minecraft: Java Edition. É o modo \"Rust (Vulkan)\" no desktop.": ["Rust engine that reimplements the Minecraft: Java Edition client. It powers the \"Rust (Vulkan)\" mode on desktop.", "Motor en Rust que reimplementa el cliente de Minecraft: Java Edition. Es el modo \"Rust (Vulkan)\" en el escritorio."],
  "Port do Horizon para Android (Vulkan, controles de toque). É o modo Rust no celular.": ["Android port of Horizon (Vulkan, touch controls). It powers the Rust mode on phones.", "Port de Horizon para Android (Vulkan, controles táctiles). Es el modo Rust en el móvil."],
  "Runtime Java no Android (JVM, renderizadores, entrada). Roda o Minecraft: Java Edition original no celular.": ["Java runtime for Android (JVM, renderers, input). Runs the original Minecraft: Java Edition on phones.", "Runtime Java para Android (JVM, renderizadores, entrada). Ejecuta el Minecraft: Java Edition original en el móvil."],
  "GLFW, SDL e mojoexec adaptados para Android, usados dentro do runtime Java.": ["GLFW, SDL and mojoexec adapted for Android, used inside the Java runtime.", "GLFW, SDL y mojoexec adaptados para Android, usados dentro del runtime Java."]
};
export function tr(text: string): string {
 const language = detectLanguage();
 return language === 'pt' ? text : messages[text]?.[language === 'en' ? 0 : 1] ?? text;
}
