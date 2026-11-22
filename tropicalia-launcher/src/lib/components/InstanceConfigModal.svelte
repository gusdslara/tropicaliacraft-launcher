<!-- Modal de Configuração Completa da Instância (Horizon Rust e Java Edition) -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import PixelButton from './PixelButton.svelte';
	import TabSelector from './TabSelector.svelte';
	import BlockIcon from './BlockIcon.svelte';
	import Toggle from './Toggle.svelte';
	import Badge from './Badge.svelte';
	import ConsoleView from './ConsoleView.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import { call, isTauri, openFolder } from '$lib/platform';
	import { loaderVersions, type LoaderVersion } from '$lib/services/versions';
	import type { BlockIcon as BlockIconT, HorizonOptions, Instance, ModLoader } from '$lib/types';
	import { BLOCK_ICONS, LOADER_LABEL } from '$lib/util/format';
	import {
		Activity,
		Check,
		Cpu,
		Eye,
		FolderOpen,
		HardDrive,
		Layers,
		Monitor,
		Package,
		RefreshCw,
		Save,
		Sliders,
		Sparkles,
		Sun,
		Terminal,
		Volume2,
		Wrench,
		X
	} from 'lucide-svelte';

	let {
		open = $bindable(false),
		instance,
		onupdated,
		onopenmods
	}: {
		open: boolean;
		instance: Instance | null;
		onupdated?: (updated: Instance) => void;
		onopenmods?: (instance: Instance) => void;
	} = $props();

	let draft = $state<Instance | null>(null);
	let activeTab = $state<'general' | 'memory' | 'vulkan' | 'audio' | 'camera' | 'extras' | 'hdr' | 'logs'>('general');
	let draftLoaders = $state<LoaderVersion[]>([]);
	let syncingHorizon = $state(false);
	let extraArgsText = $state('');

	$effect(() => {
		if (!open || !instance) {
			draft = null;
			return;
		}

		const d = structuredClone($state.snapshot(instance));
		if (d.loader === 'horizon-rust') {
			if (!d.horizonOptions) {
				d.horizonOptions = {
					preset: 'balanced',
					renderDistance: 12,
					lodDistance: 0,
					farDetail: 'full',
					framerateLimit: 120,
					presentMode: 'auto',
					resolutionScale: 1.0,
					antialiasing: 'fxaa',
					upscaling: 'native',
					caveCulling: true,
					entityCulling: false,
					animatedTextures: true,
					ditherCutoutMips: true,
					sky: true,
					fog: true,
					weather: true,
					chunkUpdates: 0,
					uploadBudgetKiB: 0,
					workers: 0,
					shadowCache: false,
					graphicsApi: 'auto',
					hdr: false,
					hdrPaperWhite: 203,
					hdrPeak: 1000,
					hdrBlackLevel: 0,
					hdrUiBrightness: 1.0,
					soundMaster: 100,
					soundMusic: 100,
					soundWeather: 100,
					soundBlocks: 100,
					soundHostile: 100,
					soundNeutral: 100,
					soundPlayers: 100,
					soundAmbient: 100,
					soundVoice: 100,
					directionalAudio: false,
					subtitles: false,
					fov: 70,
					gamma: 50,
					viewBobbing: true,
					attackIndicator: 'crosshair',
					guiScale: 0,
					menuBlur: 5,
					highContrast: false,
					fullbright: false,
					dynamicLights: true,
					zoom: true,
					zoomKey: 'key.keyboard.z',
					zoomLevel: 4,
					zoomSmooth: true,
					zoomSensitivity: true,
					fps: true,
					fpsCorner: 'top_left',
					fpsLows: false,
					keystrokes: false,
					keystrokesCorner: 'top_left',
					keystrokesCps: true,
					minimap: false,
					minimapCorner: 'top_right',
					minimapSize: 96,
					minimapShape: 'square',
					minimapZoom: 1.0,
					minimapRotate: false,
					mouseTweaks: true,
					mouseTweaksWheel: true,
					sort: false,
					sortKey: 'key.keyboard.r',
					discordPresence: true,
					mouseSensitivity: 50,
					invertY: false,
					autoJump: false,
					toggleCrouch: false,
					toggleSprint: false,
					autoReconnect: false,
					ownNameTag: false,
					noAi: false,
					agentControl: false,
					creative: false,
					testTerrain: false,
					pregen: false
				};
			}

			// Carrega opções reais dos arquivos horizon-graphics.txt / options.txt se disponíveis
			if (isTauri) {
				call<HorizonOptions>('horizon_options_get', { instanceId: d.id })
					.then((opts) => {
						if (draft && draft.id === d.id) {
							draft.horizonOptions = { ...draft.horizonOptions, ...opts };
						}
					})
					.catch(() => {});
			}
		} else {
			d.javaRenderer = d.javaRenderer ?? app.settings.defaultJavaRenderer ?? 'opengles_mobileglues';
			d.useAngle = d.useAngle ?? app.settings.defaultUseAngle ?? false;
			d.javaRuntime = d.javaRuntime ?? '';
		}

		extraArgsText = d.jvmArgs || '';
		draft = d;
		activeTab = 'general';
	});

	$effect(() => {
		const d = draft;
		if (!d || d.loader === 'vanilla' || d.loader === 'horizon-rust') {
			draftLoaders = [];
			return;
		}
		loaderVersions(d.loader, d.gameVersion)
			.then((l) => (draftLoaders = l))
			.catch(() => (draftLoaders = []));
	});

	const maxRam = $derived(Math.max(2048, app.system.totalMemoryMb - 1024));

	const modalTabs = $derived.by(() => {
		const isHz = draft?.loader === 'horizon-rust';
		if (isHz) {
			return [
				{ id: 'general', label: '1. Geral' },
				{ id: 'memory', label: '2. Memória & Execução' },
				{ id: 'vulkan', label: '3. Vulkan & Gráficos' },
				{ id: 'audio', label: '4. Áudio & Sons' },
				{ id: 'camera', label: '5. Visão & HUD' },
				{ id: 'extras', label: '6. Extras & Controles' },
				{ id: 'hdr', label: '7. Saída HDR' },
				{ id: 'logs', label: '8. Logs' }
			];
		}
		return [
			{ id: 'general', label: '1. Geral' },
			{ id: 'memory', label: '2. Memória & Renderização Java' },
			{ id: 'logs', label: '3. Logs' }
		];
	});

	async function save() {
		if (!draft || !instance) return;

		draft.jvmArgs = extraArgsText.trim();

		app.updateInstance(instance.id, {
			name: draft.name,
			icon: draft.icon,
			loader: draft.loader,
			engine: draft.engine,
			gameVersion: draft.gameVersion,
			loaderVersion: draft.loaderVersion,
			memory: draft.memory,
			jvmArgs: draft.jvmArgs,
			javaPath: draft.javaPath,
			javaRenderer: draft.javaRenderer,
			useAngle: draft.useAngle,
			javaRuntime: draft.javaRuntime,
			rustBinaryPath: draft.rustBinaryPath,
			horizonOptions: draft.horizonOptions,
			resolution: draft.resolution,
			autoJoin: draft.autoJoin
		});

		if (draft.loader === 'horizon-rust' && draft.horizonOptions && isTauri) {
			try {
				await call('horizon_options_set', {
					instanceId: instance.id,
					options: draft.horizonOptions
				});
			} catch (e) {
				console.error('Falha ao persistir opções nos arquivos do Horizon:', e);
			}
		}

		toasts.ok(`Configurações de "${draft.name}" salvas com sucesso!`);
		onupdated?.(draft);
		open = false;
	}

	async function syncHorizonResources() {
		if (!draft) return;
		syncingHorizon = true;
		try {
			await call('horizon_prepare_sync', { instanceId: draft.id });
			toasts.ok('Recursos, texturas e sons do Horizon Rust sincronizados com sucesso!');
		} catch (e) {
			toasts.err(e);
		} finally {
			syncingHorizon = false;
		}
	}
</script>

<Modal bind:open title="Configuração da Instância" width={940}>
	{#if draft}
		<div class="flex flex-col gap-4">
			<!-- Header Resumo da Instância -->
			<div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-[#0e1814] border border-[#1b2b22]">
				<div class="flex items-center gap-3 min-w-0">
					<BlockIcon icon={draft.icon} size={42} />
					<div class="min-w-0">
						<h3 class="font-mc mc-shadow text-[16px] text-white truncate">{draft.name}</h3>
						<div class="flex flex-wrap items-center gap-1.5 mt-0.5">
							{#if draft.loader === 'horizon-rust'}
								<Badge tone="green" pixel>Horizon Rust 26.3 · Vulkan</Badge>
							{:else}
								<Badge tone="blue" pixel>{LOADER_LABEL[draft.loader]} {draft.gameVersion}</Badge>
							{/if}
							<Badge tone="muted">{(draft.memory.maxMb / 1024).toFixed(1)} GB Limite</Badge>
							<Badge tone="muted">{Object.keys(draft.content).length} itens</Badge>
						</div>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<PixelButton size="sm" variant="ghost" icon={FolderOpen} onclick={() => openFolder('instance', draft!.id).catch(toasts.err)}>
						Abrir pasta
					</PixelButton>
				</div>
			</div>

			<!-- Navegação de Abas -->
			<div class="overflow-x-auto pb-1 scrollbar-none border-b border-[#24322b]">
				<TabSelector tabs={modalTabs} bind:value={activeTab as string} size="sm" />
			</div>

			<!-- CONTEÚDO DAS ABAS -->

			<!-- 1. ABA GERAL -->
			{#if activeTab === 'general'}
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<label class="tp-label" for="cfg-name">Nome da Instância</label>
						<input id="cfg-name" class="tp-input" bind:value={draft.name} />
					</div>
					<div>
						<span class="tp-label">Ícone do Bloco</span>
						<div class="flex flex-wrap gap-2">
							{#each Object.keys(BLOCK_ICONS) as key (key)}
								<button
									class="p-1 rounded border-2 transition-all cursor-pointer"
									class:border-emerald-500={draft.icon === key}
									class:border-transparent={draft.icon !== key}
									class:bg-[#1a2e22]={draft.icon === key}
									onclick={() => (draft!.icon = key as BlockIconT)}
									aria-label={key}
								>
									<BlockIcon icon={key as BlockIconT} size={28} />
								</button>
							{/each}
						</div>
					</div>

					<div>
						<label class="tp-label" for="cfg-loader">Motor da Instância / Loader</label>
						<select
							id="cfg-loader"
							class="tp-select"
							bind:value={draft.loader}
							onchange={(e) => {
								const val = (e.currentTarget as HTMLSelectElement).value as ModLoader;
								if (val === 'horizon-rust') {
									draft!.gameVersion = '26.3';
									draft!.engine = 'rust';
								} else {
									draft!.engine = 'java';
									if (draft!.gameVersion === '26.3') draft!.gameVersion = '1.20.1';
								}
							}}
						>
							<option value="horizon-rust">Horizon Rust (Minecraft 26.3 · Vulkan Nativo sem JVM)</option>
							<option value="fabric">Fabric (Java Edition · Suporte a Mods e Shaders)</option>
							<option value="forge">Forge (Java Edition · Mods clássicos)</option>
							<option value="neoforge">NeoForge (Java Edition · Sucessor do Forge)</option>
							<option value="quilt">Quilt (Java Edition · Compatível com Fabric)</option>
							<option value="vanilla">Vanilla Oficial (Java Edition Mojang)</option>
						</select>
						<p class="tp-help">
							{#if draft.loader === 'horizon-rust'}
								Compilado nativamente em Rust sem sobrecarga de máquina virtual Java.
							{:else}
								Ambiente Java oficial compatível com modpacks e renderizadores avançados.
							{/if}
						</p>
					</div>

					<div>
						<label class="tp-label" for="cfg-mc">Versão do Jogo</label>
						<input id="cfg-mc" class="tp-input font-mono" disabled={draft.loader === 'horizon-rust'} bind:value={draft.gameVersion} />
						{#if draft.loader === 'horizon-rust'}
							<p class="tp-help">O motor Horizon Rust compila contra a paridade 26.3.</p>
						{:else}
							<p class="tp-help">Alterar a versão pode exigir reconfigurar seus mods.</p>
						{/if}
					</div>

					{#if draft.loader !== 'horizon-rust'}
						<div>
							<label class="tp-label" for="cfg-lv">Versão do {LOADER_LABEL[draft.loader]}</label>
							{#if draft.loader === 'vanilla'}
								<input id="cfg-lv" class="tp-input" value="Vanilla Mojang (sem loader)" disabled />
							{:else if draftLoaders.length}
								<select id="cfg-lv" class="tp-select" bind:value={draft.loaderVersion}>
									{#each draftLoaders as l (l.version)}<option value={l.version}>{l.version}{l.stable ? '' : ' (beta)'}</option>{/each}
								</select>
							{:else}
								<input id="cfg-lv" class="tp-input font-mono" bind:value={draft.loaderVersion} />
							{/if}
						</div>
					{/if}

					<div>
						<label class="tp-label" for="cfg-w">Resolução da Janela</label>
						<div class="flex items-center gap-2">
							<input
								id="cfg-w"
								class="tp-input"
								type="number"
								placeholder="1280 (largura)"
								value={draft.resolution?.width ?? ''}
								oninput={(e) => {
									const w = Number((e.currentTarget as HTMLInputElement).value);
									draft!.resolution = w ? { width: w, height: draft!.resolution?.height ?? 720 } : undefined;
								}}
							/>
							<span class="tp-muted">×</span>
							<input
								class="tp-input"
								type="number"
								placeholder="720 (altura)"
								aria-label="altura"
								value={draft.resolution?.height ?? ''}
								oninput={(e) => {
									const h = Number((e.currentTarget as HTMLInputElement).value);
									if (draft!.resolution && h) draft!.resolution.height = h;
								}}
							/>
						</div>
						<p class="tp-help">Deixe em branco para usar o padrão da sua tela.</p>
					</div>

					<div>
						<label class="tp-label" for="cfg-join">Entrar Direto no Servidor (Auto-Join)</label>
						<input id="cfg-join" class="tp-input font-mono" placeholder="Ex.: tropicaliacraft.online" bind:value={draft.autoJoin} />
						<p class="tp-help">Ao clicar em Jogar, conecta diretamente no endereço IP fornecido.</p>
					</div>
				</div>

			<!-- 2. ABA MEMÓRIA & EXECUÇÃO -->
			{:else if activeTab === 'memory'}
				<div class="space-y-5">
					<!-- Slider de RAM / Memória -->
					<div class="p-4 rounded-lg bg-[#0e1814] border border-[#1b2b22] space-y-3">
						<div class="flex items-baseline justify-between">
							<div>
								<span class="font-mc text-[14px] text-white flex items-center gap-2">
									<HardDrive size={18} class="text-[#34d399]" />
									Memória RAM Dedicada (Limite de Execução)
								</span>
								<p class="tp-muted text-[11.5px] mt-0.5">
									{#if draft.loader === 'horizon-rust'}
										Configura a variável <code>HORIZON_MEMORY_LIMIT_MB</code> e o governador de memória nativo em Rust.
									{:else}
										Configura as flags <code>-Xms</code> e <code>-Xmx</code> repassadas para a JVM Java.
									{/if}
								</p>
							</div>
							<span class="font-mc mc-shadow text-[15px] text-[#bef264]">{(draft.memory.maxMb / 1024).toFixed(1)} GB</span>
						</div>
						<input id="cfg-ram" type="range" class="tp-range" min="512" max={maxRam} step="512" bind:value={draft.memory.maxMb} />
						<div class="flex justify-between text-[11px] tp-muted font-mono">
							<span>512 MB (Mínimo)</span>
							<span>Recomendado: {draft.loader === 'horizon-rust' ? '2.0 GB' : '4.0 GB'}</span>
							<span>{maxRam / 1024} GB (Disponível no PC)</span>
						</div>
					</div>

					{#if draft.loader === 'horizon-rust'}
						<!-- Opções específicas de linha de comando do Horizon Rust -->
						<div class="p-4 rounded-lg bg-[#0f241a]/60 border border-[#10b981]/30 space-y-4">
							<div class="flex items-center justify-between gap-3">
								<div class="flex items-center gap-3">
									<Terminal size={20} class="text-[#34d399]" />
									<div>
										<h4 class="font-mc text-[13px] text-white">Parâmetros Nativos do Horizon Rust</h4>
										<p class="tp-muted text-[11.5px]">Flags de depuração da engine nativa aceitas diretamente pelo cliente.</p>
									</div>
								</div>
								<PixelButton size="sm" variant="emerald" icon={Wrench} loading={syncingHorizon} onclick={syncHorizonResources}>
									Sincronizar Recursos e Sons
								</PixelButton>
							</div>

							<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0a1410] p-3 rounded border border-[#1b2b22]">
								<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
									<div>
										<span class="block font-semibold">Modo Criativo</span>
										<small class="tp-muted text-[10px]">--creative</small>
									</div>
									<Toggle checked={draft.horizonOptions?.creative ?? false} onchange={(v) => (draft!.horizonOptions!.creative = v)} />
								</label>
								<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
									<div>
										<span class="block font-semibold">Terreno de Teste</span>
										<small class="tp-muted text-[10px]">--test-terrain</small>
									</div>
									<Toggle checked={draft.horizonOptions?.testTerrain ?? false} onchange={(v) => (draft!.horizonOptions!.testTerrain = v)} />
								</label>
								<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
									<div>
										<span class="block font-semibold">Pré-gerador Chunks</span>
										<small class="tp-muted text-[10px]">--pregen</small>
									</div>
									<Toggle checked={draft.horizonOptions?.pregen ?? false} onchange={(v) => (draft!.horizonOptions!.pregen = v)} />
								</label>
								<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
									<div>
										<span class="block font-semibold">Socket Agente</span>
										<small class="tp-muted text-[10px]">--control</small>
									</div>
									<Toggle checked={draft.horizonOptions?.agentControl ?? false} onchange={(v) => (draft!.horizonOptions!.agentControl = v)} />
								</label>
							</div>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<label class="tp-label" for="hz-custom-bin">Executável Customizado (Opcional)</label>
									<input id="hz-custom-bin" class="tp-input font-mono text-[11px]" placeholder="Automático (horizon-client.exe oficial)" bind:value={draft.rustBinaryPath} />
									<p class="tp-help">Deixe em branco para usar o binário nativo pré-instalado pelo launcher.</p>
								</div>
								<div>
									<label class="tp-label" for="hz-custom-args">Parâmetros Extras da Linha de Comando</label>
									<input id="hz-custom-args" class="tp-input font-mono text-[11px]" placeholder="Ex.: --smoke-report ./report.json" bind:value={extraArgsText} />
									<p class="tp-help">Argumentos adicionais passados ao iniciar o horizon-client.</p>
								</div>
							</div>
						</div>
					{:else}
						<!-- Opções específicas de Java -->
						<div class="p-4 rounded-lg bg-[#0c1a29]/60 border border-[#3b82f6]/30 space-y-4">
							<div class="flex items-center gap-3">
								<Monitor size={20} class="text-[#60a5fa]" />
								<div>
									<h4 class="font-mc text-[13px] text-white">Configurações da JVM e Renderizador Java</h4>
									<p class="tp-muted text-[11.5px]">Ajustes de renderização gráfica acelerada por hardware e máquina virtual.</p>
								</div>
							</div>

							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label class="tp-label" for="j-rdr">Renderizador Gráfico Java</label>
									<select id="j-rdr" class="tp-select" bind:value={draft.javaRenderer}>
										<option value="opengles_mobileglues">Holy GL4ES / MobileGlues (Padrão · Alto desempenho com Shaders)</option>
										<option value="opengles3_desktopgl_zink_kopper">Vulkan Zink Kopper (Desktop OpenGL sobre Vulkan)</option>
										<option value="vulkan_zink">Vulkan Zink OSMesa</option>
										<option value="opengles2">NG-GL4ES Legado</option>
									</select>
								</div>
								<div>
									<label class="tp-label" for="j-jre">Ambiente Java Runtime (JRE)</label>
									<select id="j-jre" class="tp-select" bind:value={draft.javaRuntime}>
										<option value="">Automático (Detectado conforme versão do MC)</option>
										<option value="Internal-25">Java 25 (OpenJDK 25 · 16KB Aligned)</option>
										<option value="Internal-21">Java 21 (OpenJDK 21 LTS · 1.20.5+)</option>
										<option value="Internal-17">Java 17 (OpenJDK 17 LTS · 1.18 - 1.20.4)</option>
										<option value="Internal">Java 8 (OpenJDK 8 · Legado)</option>
									</select>
								</div>
								<div class="col-span-1 md:col-span-2 bg-[#09131f] p-3 rounded border border-[#1b2b3a] flex items-center justify-between">
									<div>
										<span class="block text-[12.5px] font-semibold text-white">Aceleração Google ANGLE (OpenGL ES sobre Vulkan)</span>
										<small class="tp-muted text-[11px]">Melhora a taxa de quadros e estabilidade em drivers gráficos modernos.</small>
									</div>
									<Toggle checked={draft.useAngle ?? false} onchange={(v) => (draft!.useAngle = v)} />
								</div>
								<div class="col-span-1 md:col-span-2">
									<label class="tp-label" for="j-jvm-args">Argumentos Extras da JVM</label>
									<input id="j-jvm-args" class="tp-input font-mono" placeholder="-Dfml.ignoreInvalidMinecraftCertificates=true" bind:value={extraArgsText} />
								</div>
								<div class="col-span-1 md:col-span-2">
									<label class="tp-label" for="j-path">Caminho Customizado do Java (Opcional)</label>
									<input id="j-path" class="tp-input font-mono" placeholder="Automático (Java oficial da Mojang)" bind:value={draft.javaPath} />
								</div>
							</div>
						</div>
					{/if}
				</div>

			<!-- 3. ABA VULKAN & GRÁFICOS (HORIZON RUST) -->
			{:else if activeTab === 'vulkan' && draft.loader === 'horizon-rust'}
				<div class="space-y-4">
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div>
							<label class="tp-label" for="hz-m-preset">Preset Gráfico</label>
							<select id="hz-m-preset" class="tp-select" bind:value={draft.horizonOptions!.preset}>
								<option value="performance">Desempenho (Performance)</option>
								<option value="balanced">Equilibrado (Balanced)</option>
								<option value="quality">Qualidade (Quality)</option>
								<option value="ultra">Ultra</option>
								<option value="custom">Personalizado (Custom)</option>
							</select>
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-rd">Distância de Renderização</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.renderDistance ?? 12} chunks</span>
							</div>
							<input id="hz-m-rd" type="range" class="tp-range" min="2" max="64" step="1" bind:value={draft.horizonOptions!.renderDistance} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-lod">Distant Terrain (LOD)</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">
									{draft.horizonOptions?.lodDistance ? `${draft.horizonOptions.lodDistance} chunks` : 'Desligado (0)'}
								</span>
							</div>
							<input id="hz-m-lod" type="range" class="tp-range" min="0" max="1024" step="64" bind:value={draft.horizonOptions!.lodDistance} />
						</div>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
						<div>
							<label class="tp-label" for="hz-m-fardetail">Detalhe Distante</label>
							<select id="hz-m-fardetail" class="tp-select" bind:value={draft.horizonOptions!.farDetail}>
								<option value="full">Completo (Full)</option>
								<option value="reduced">Reduzido (Reduced)</option>
								<option value="simple">Simples (Simple)</option>
								<option value="off">Desligado (Off)</option>
							</select>
						</div>
						<div>
							<label class="tp-label" for="hz-m-fpslim">Limite de FPS</label>
							<select id="hz-m-fpslim" class="tp-select" bind:value={draft.horizonOptions!.framerateLimit}>
								<option value={30}>30 FPS</option>
								<option value={60}>60 FPS</option>
								<option value={120}>120 FPS</option>
								<option value={144}>144 FPS</option>
								<option value={240}>240 FPS</option>
								<option value={260}>Ilimitado</option>
							</select>
						</div>
						<div>
							<label class="tp-label" for="hz-m-present">Modo de Apresentação (VSync)</label>
							<select id="hz-m-present" class="tp-select" bind:value={draft.horizonOptions!.presentMode}>
								<option value="auto">Automático (Auto)</option>
								<option value="fifo">VSync Tradicional (Fifo)</option>
								<option value="mailbox">Mailbox (Sem tearing, baixa latência)</option>
								<option value="immediate">Imediato (Menor latência)</option>
							</select>
						</div>
						<div>
							<label class="tp-label" for="hz-m-aa">Anti-Aliasing</label>
							<select id="hz-m-aa" class="tp-select" bind:value={draft.horizonOptions!.antialiasing}>
								<option value="off">Desativado</option>
								<option value="fxaa">FXAA</option>
								<option value="taa">TAA (Temporal)</option>
							</select>
						</div>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label class="tp-label" for="hz-m-upscale">Upscaling Gráfico</label>
							<select id="hz-m-upscale" class="tp-select" bind:value={draft.horizonOptions!.upscaling}>
								<option value="native">Nativo (100%)</option>
								<option value="quality">Qualidade</option>
								<option value="balanced">Equilibrado</option>
								<option value="performance">Desempenho</option>
								<option value="ultraPerformance">Ultra Desempenho</option>
							</select>
						</div>
						<div>
							<label class="tp-label" for="hz-m-api">Backend Gráfico</label>
							<select id="hz-m-api" class="tp-select" bind:value={draft.horizonOptions!.graphicsApi}>
								<option value="auto">Automático (Vulkan preferencial)</option>
								<option value="vulkan">Vulkan Nativo</option>
								<option value="dx12">DirectX 12</option>
								<option value="opengl">OpenGL</option>
							</select>
						</div>
					</div>

					<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0d1612] p-3 rounded border border-[#1b2b22]">
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Cave Culling</span>
							<Toggle checked={draft.horizonOptions?.caveCulling ?? true} onchange={(v) => (draft!.horizonOptions!.caveCulling = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Entity Culling</span>
							<Toggle checked={draft.horizonOptions?.entityCulling ?? false} onchange={(v) => (draft!.horizonOptions!.entityCulling = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Texturas Animadas</span>
							<Toggle checked={draft.horizonOptions?.animatedTextures ?? true} onchange={(v) => (draft!.horizonOptions!.animatedTextures = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Dither Folhagens</span>
							<Toggle checked={draft.horizonOptions?.ditherCutoutMips ?? true} onchange={(v) => (draft!.horizonOptions!.ditherCutoutMips = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Céu & Estrelas</span>
							<Toggle checked={draft.horizonOptions?.sky ?? true} onchange={(v) => (draft!.horizonOptions!.sky = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Neblina (Fog)</span>
							<Toggle checked={draft.horizonOptions?.fog ?? true} onchange={(v) => (draft!.horizonOptions!.fog = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Clima (Chuva/Neve)</span>
							<Toggle checked={draft.horizonOptions?.weather ?? true} onchange={(v) => (draft!.horizonOptions!.weather = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Cache de Sombras</span>
							<Toggle checked={draft.horizonOptions?.shadowCache ?? false} onchange={(v) => (draft!.horizonOptions!.shadowCache = v)} />
						</label>
					</div>
				</div>

			<!-- 4. ABA ÁUDIO & SONS (HORIZON RUST) -->
			{:else if activeTab === 'audio' && draft.loader === 'horizon-rust'}
				<div class="space-y-4">
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-vol-master">Volume Geral (Master)</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.soundMaster ?? 100}%</span>
							</div>
							<input id="hz-m-vol-master" type="range" class="tp-range" min="0" max="100" step="1" bind:value={draft.horizonOptions!.soundMaster} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-vol-music">Música</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.soundMusic ?? 100}%</span>
							</div>
							<input id="hz-m-vol-music" type="range" class="tp-range" min="0" max="100" step="1" bind:value={draft.horizonOptions!.soundMusic} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-vol-weather">Clima / Chuva</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.soundWeather ?? 100}%</span>
							</div>
							<input id="hz-m-vol-weather" type="range" class="tp-range" min="0" max="100" step="1" bind:value={draft.horizonOptions!.soundWeather} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-vol-block">Sons de Blocos</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.soundBlocks ?? 100}%</span>
							</div>
							<input id="hz-m-vol-block" type="range" class="tp-range" min="0" max="100" step="1" bind:value={draft.horizonOptions!.soundBlocks} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-vol-hostile">Criaturas Hostis</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.soundHostile ?? 100}%</span>
							</div>
							<input id="hz-m-vol-hostile" type="range" class="tp-range" min="0" max="100" step="1" bind:value={draft.horizonOptions!.soundHostile} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-vol-neutral">Criaturas Pacíficas</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.soundNeutral ?? 100}%</span>
							</div>
							<input id="hz-m-vol-neutral" type="range" class="tp-range" min="0" max="100" step="1" bind:value={draft.horizonOptions!.soundNeutral} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-vol-players">Jogadores</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.soundPlayers ?? 100}%</span>
							</div>
							<input id="hz-m-vol-players" type="range" class="tp-range" min="0" max="100" step="1" bind:value={draft.horizonOptions!.soundPlayers} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-vol-ambient">Ambiente / Cavernas</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.soundAmbient ?? 100}%</span>
							</div>
							<input id="hz-m-vol-ambient" type="range" class="tp-range" min="0" max="100" step="1" bind:value={draft.horizonOptions!.soundAmbient} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-vol-voice">Voz / Fala</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.soundVoice ?? 100}%</span>
							</div>
							<input id="hz-m-vol-voice" type="range" class="tp-range" min="0" max="100" step="1" bind:value={draft.horizonOptions!.soundVoice} />
						</div>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0d1612] p-3 rounded border border-[#1b2b22]">
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<div>
								<span>Áudio Espacial 3D (HRTF Direcional)</span>
								<small class="block tp-muted text-[10.5px]">Melhor posicionamento espacial em fones de ouvido.</small>
							</div>
							<Toggle checked={draft.horizonOptions?.directionalAudio ?? false} onchange={(v) => (draft!.horizonOptions!.directionalAudio = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<div>
								<span>Exibir Legendas de Som</span>
								<small class="block tp-muted text-[10.5px]">Mostra indicadores de som no canto da tela.</small>
							</div>
							<Toggle checked={draft.horizonOptions?.subtitles ?? false} onchange={(v) => (draft!.horizonOptions!.subtitles = v)} />
						</label>
					</div>
				</div>

			<!-- 5. ABA VISÃO & HUD (HORIZON RUST) -->
			{:else if activeTab === 'camera' && draft.loader === 'horizon-rust'}
				<div class="space-y-4">
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-fov">Campo de Visão (FOV)</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">
									{draft.horizonOptions?.fov ?? 70}° {draft.horizonOptions?.fov === 70 ? '(Normal)' : draft.horizonOptions?.fov === 110 ? '(Quake Pro)' : ''}
								</span>
							</div>
							<input id="hz-m-fov" type="range" class="tp-range" min="30" max="110" step="1" bind:value={draft.horizonOptions!.fov} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-gamma">Brilho do Jogo (Gamma)</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.gamma ?? 50}%</span>
							</div>
							<input id="hz-m-gamma" type="range" class="tp-range" min="0" max="100" step="1" bind:value={draft.horizonOptions!.gamma} />
						</div>
						<div>
							<div class="flex justify-between items-baseline mb-1">
								<label class="tp-label" for="hz-m-blur">Desfoque nos Menus (Blur)</label>
								<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.menuBlur ?? 5}/10</span>
							</div>
							<input id="hz-m-blur" type="range" class="tp-range" min="0" max="10" step="1" bind:value={draft.horizonOptions!.menuBlur} />
						</div>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label class="tp-label" for="hz-m-gui-scale">Escala da Interface (GUI)</label>
							<select id="hz-m-gui-scale" class="tp-select" bind:value={draft.horizonOptions!.guiScale}>
								<option value={0}>Automático (Auto)</option>
								<option value={1}>1x (Pequeno)</option>
								<option value={2}>2x (Normal)</option>
								<option value={3}>3x (Grande)</option>
								<option value={4}>4x (Muito Grande)</option>
							</select>
						</div>
						<div>
							<label class="tp-label" for="hz-m-atk-ind">Indicador de Ataque</label>
							<select id="hz-m-atk-ind" class="tp-select" bind:value={draft.horizonOptions!.attackIndicator}>
								<option value="crosshair">Na Mira (Crosshair)</option>
								<option value="hotbar">Na Barra de Ação (Hotbar)</option>
								<option value="off">Desativado</option>
							</select>
						</div>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0d1612] p-3 rounded border border-[#1b2b22]">
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<div>
								<span>Balanço da Visão ao Andar</span>
								<small class="block tp-muted text-[10.5px]">Movimento da câmera ao caminhar (View Bobbing).</small>
							</div>
							<Toggle checked={draft.horizonOptions?.viewBobbing ?? true} onchange={(v) => (draft!.horizonOptions!.viewBobbing = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<div>
								<span>Alto Contraste</span>
								<small class="block tp-muted text-[10.5px]">Bordas destacadas e maior contraste nos menus.</small>
							</div>
							<Toggle checked={draft.horizonOptions?.highContrast ?? false} onchange={(v) => (draft!.horizonOptions!.highContrast = v)} />
						</label>
					</div>
				</div>

			<!-- 6. ABA EXTRAS & CONTROLES (HORIZON RUST) -->
			{:else if activeTab === 'extras' && draft.loader === 'horizon-rust'}
				<div class="space-y-4">
					<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#0d1612] p-3 rounded border border-[#1b2b22]">
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<div>
								<span class="font-semibold text-white">Luz Dinâmica</span>
								<small class="block tp-muted text-[10.5px]">Tochas e itens iluminam ao segurar.</small>
							</div>
							<Toggle checked={draft.horizonOptions?.dynamicLights ?? true} onchange={(v) => (draft!.horizonOptions!.dynamicLights = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<div>
								<span class="font-semibold text-white">Brilho Máximo (Fullbright)</span>
								<small class="block tp-muted text-[10.5px]">Visão noturna clara permanente.</small>
							</div>
							<Toggle checked={draft.horizonOptions?.fullbright ?? false} onchange={(v) => (draft!.horizonOptions!.fullbright = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<div>
								<span class="font-semibold text-white">Discord Rich Presence</span>
								<small class="block tp-muted text-[10.5px]">Mostra o status de jogo no Discord.</small>
							</div>
							<Toggle checked={draft.horizonOptions?.discordPresence ?? true} onchange={(v) => (draft!.horizonOptions!.discordPresence = v)} />
						</label>
					</div>

					<!-- Zoom -->
					<div class="p-3 bg-[#0d1612] rounded border border-[#1b2b22] space-y-3">
						<div class="flex items-center justify-between">
							<div>
								<span class="font-semibold text-white text-[13px]">Zoom Suave Nativo</span>
								<small class="block tp-muted text-[10.5px]">Aproximação de câmera cinematográfica estilo OptiFine.</small>
							</div>
							<Toggle checked={draft.horizonOptions?.zoom ?? true} onchange={(v) => (draft!.horizonOptions!.zoom = v)} />
						</div>
						{#if draft.horizonOptions?.zoom}
							<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#1d2a23]">
								<div>
									<label class="tp-label" for="hz-m-zoom-key">Tecla de Zoom</label>
									<input id="hz-m-zoom-key" class="tp-input font-mono text-[11.5px]" bind:value={draft.horizonOptions!.zoomKey} placeholder="key.keyboard.z" />
								</div>
								<div>
									<label class="tp-label" for="hz-m-zoom-lvl">Nível de Zoom ({draft.horizonOptions?.zoomLevel ?? 4}x)</label>
									<input id="hz-m-zoom-lvl" type="range" class="tp-range" min="1" max="10" step="1" bind:value={draft.horizonOptions!.zoomLevel} />
								</div>
								<div class="flex flex-col justify-end gap-2">
									<label class="flex items-center justify-between text-[11.5px] text-[#d1d5db] cursor-pointer">
										<span>Transição Suave</span>
										<Toggle checked={draft.horizonOptions?.zoomSmooth ?? true} onchange={(v) => (draft!.horizonOptions!.zoomSmooth = v)} />
									</label>
								</div>
							</div>
						{/if}
					</div>

					<!-- Minimapa & HUD -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="p-3 bg-[#0d1612] rounded border border-[#1b2b22] space-y-3">
							<div class="flex items-center justify-between">
								<span class="font-semibold text-white text-[13px]">Minimapa no HUD</span>
								<Toggle checked={draft.horizonOptions?.minimap ?? false} onchange={(v) => (draft!.horizonOptions!.minimap = v)} />
							</div>
							{#if draft.horizonOptions?.minimap}
								<div class="grid grid-cols-2 gap-2 pt-2 border-t border-[#1d2a23]">
									<div>
										<label class="tp-label" for="hz-m-mm-pos">Posição</label>
										<select id="hz-m-mm-pos" class="tp-select !h-8 text-[11.5px]" bind:value={draft.horizonOptions!.minimapCorner}>
											<option value="top_right">Superior Direito</option>
											<option value="top_left">Superior Esquerdo</option>
											<option value="bottom_right">Inferior Direito</option>
											<option value="bottom_left">Inferior Esquerdo</option>
										</select>
									</div>
									<div>
										<label class="tp-label" for="hz-m-mm-sz">Tamanho</label>
										<select id="hz-m-mm-sz" class="tp-select !h-8 text-[11.5px]" bind:value={draft.horizonOptions!.minimapSize}>
											<option value={64}>Pequeno (64px)</option>
											<option value={96}>Médio (96px)</option>
											<option value={128}>Grande (128px)</option>
										</select>
									</div>
								</div>
							{/if}
						</div>

						<div class="p-3 bg-[#0d1612] rounded border border-[#1b2b22] space-y-3">
							<div class="flex items-center justify-between">
								<div>
									<span class="font-semibold text-white text-[13px]">Contador de FPS</span>
									<small class="block tp-muted text-[10.5px]">Taxa de quadros e frametime em tempo real.</small>
								</div>
								<Toggle checked={draft.horizonOptions?.fps ?? true} onchange={(v) => (draft!.horizonOptions!.fps = v)} />
							</div>
							<div class="flex items-center justify-between pt-2 border-t border-[#1d2a23]">
								<div>
									<span class="font-semibold text-white text-[13px]">Keystrokes HUD</span>
									<small class="block tp-muted text-[10.5px]">Sobreposição de teclas WASD e cliques.</small>
								</div>
								<Toggle checked={draft.horizonOptions?.keystrokes ?? false} onchange={(v) => (draft!.horizonOptions!.keystrokes = v)} />
							</div>
							<div class="flex items-center justify-between pt-2 border-t border-[#1d2a23]">
								<div>
									<span class="font-semibold text-white text-[13px]">Mouse Tweaks</span>
									<small class="block tp-muted text-[10.5px]">Arrasto e rolagem ágil em baús e inventário.</small>
								</div>
								<Toggle checked={draft.horizonOptions?.mouseTweaks ?? true} onchange={(v) => (draft!.horizonOptions!.mouseTweaks = v)} />
							</div>
						</div>
					</div>

					<!-- Controles do Jogador -->
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0d1612] p-3 rounded border border-[#1b2b22]">
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Pulo Automático</span>
							<Toggle checked={draft.horizonOptions?.autoJump ?? false} onchange={(v) => (draft!.horizonOptions!.autoJump = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Alternar Agachamento</span>
							<Toggle checked={draft.horizonOptions?.toggleCrouch ?? false} onchange={(v) => (draft!.horizonOptions!.toggleCrouch = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Alternar Corrida</span>
							<Toggle checked={draft.horizonOptions?.toggleSprint ?? false} onchange={(v) => (draft!.horizonOptions!.toggleSprint = v)} />
						</label>
						<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
							<span>Reconectar Automático</span>
							<Toggle checked={draft.horizonOptions?.autoReconnect ?? false} onchange={(v) => (draft!.horizonOptions!.autoReconnect = v)} />
						</label>
					</div>
				</div>

			<!-- 7. ABA HDR (HORIZON RUST) -->
			{:else if activeTab === 'hdr' && draft.loader === 'horizon-rust'}
				<div class="space-y-4">
					<div class="p-3.5 bg-[#0d1612] rounded border border-[#1b2b22] flex items-center justify-between">
						<div>
							<span class="font-semibold text-white text-[13px] flex items-center gap-2">
								<Sun size={18} class="text-[#f59e0b]" />
								Ativar Saída HDR (High Dynamic Range)
							</span>
							<small class="block tp-muted text-[11px] mt-0.5">Requer monitor compatível com HDR10 ou scRGB ativado no Windows.</small>
						</div>
						<Toggle checked={draft.horizonOptions?.hdr ?? false} onchange={(v) => (draft!.horizonOptions!.hdr = v)} />
					</div>

					{#if draft.horizonOptions?.hdr}
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<div class="flex justify-between items-baseline mb-1">
									<label class="tp-label" for="hz-m-hdr-pw">Branco de Referência (Paper White)</label>
									<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.hdrPaperWhite ?? 203} nits</span>
								</div>
								<input id="hz-m-hdr-pw" type="range" class="tp-range" min="80" max="500" step="10" bind:value={draft.horizonOptions!.hdrPaperWhite} />
							</div>
							<div>
								<div class="flex justify-between items-baseline mb-1">
									<label class="tp-label" for="hz-m-hdr-pk">Pico de Brilho dos Destaques (Peak)</label>
									<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.hdrPeak ?? 1000} nits</span>
								</div>
								<input id="hz-m-hdr-pk" type="range" class="tp-range" min="400" max="4000" step="50" bind:value={draft.horizonOptions!.hdrPeak} />
							</div>
						</div>
					{/if}
				</div>

			<!-- 8. ABA LOGS -->
			{:else if activeTab === 'logs'}
				<ConsoleView lines={app.gameLogs[draft.id] ?? []} height={420} empty="Os logs do console do jogo aparecem aqui quando a instância estiver rodando." />
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<div class="flex items-center justify-between w-full">
			<div>
				{#if onopenmods && draft}
					<PixelButton variant="ghost" icon={Package} onclick={() => { open = false; onopenmods?.(draft!); }}>
						Gerenciar Mods ({draft.loader === 'horizon-rust' ? '77 Mods Horizon' : 'Mods'})
					</PixelButton>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<PixelButton variant="ghost" onclick={() => (open = false)}>Cancelar</PixelButton>
				<PixelButton variant="emerald" icon={Save} onclick={save}>Salvar Alterações</PixelButton>
			</div>
		</div>
	{/snippet}
</Modal>
