<!-- Criar instância: nome, ícone, motor/modloader, RAM, parâmetros e seleção de mods (.hmod Horizon e .jar Java) -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import PixelButton from './PixelButton.svelte';
	import TabSelector from './TabSelector.svelte';
	import BlockIcon from './BlockIcon.svelte';
	import Badge from './Badge.svelte';
	import Toggle from './Toggle.svelte';
	import ContentPickerInline from './ContentPickerInline.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import { gameVersions, loaderVersions, type GameVersion, type LoaderVersion } from '$lib/services/versions';
	import {
		installProjectsBatch,
		loadersFor,
		type SearchHit
	} from '$lib/services/modrinth';
	import {
		DEFAULT_ENABLED_MOD_IDS,
		HORIZON_CATEGORIES,
		OFFICIAL_HORIZON_MODS,
		setHorizonModsBulk,
		type HorizonModCategory,
		type OfficialHorizonMod,
		seedHorizonInstanceMods
	} from '$lib/services/horizon-mods';
	import { call, isTauri } from '$lib/platform';
	import type { BlockIcon as BlockIconT, ContentKind, Instance, ModLoader } from '$lib/types';
	import { BLOCK_ICONS, errorMessage, formatBytes, LOADER_LABEL } from '$lib/util/format';
	import { Check, Cpu, HardDrive, Package, Puzzle, Sparkles, Terminal } from 'lucide-svelte';

	let { open = $bindable(false), oncreated }: { open: boolean; oncreated?: (i: Instance) => void } = $props();

	let activeModalTab = $state<'general' | 'mods'>('general');
	let contentTabKind = $state<ContentKind>('mod');
	let selectedJavaItems = $state<SearchHit[]>([]);

	// Estado dos mods Horizon selecionados para a nova instância
	let selectedHorizonModIds = $state<string[]>(
		OFFICIAL_HORIZON_MODS.filter((m) => m.defaultEnabled).map((m) => m.id)
	);
	let horizonSearch = $state('');
	let horizonCategory = $state<HorizonModCategory>('all');

	const filteredHorizonMods = $derived(
		OFFICIAL_HORIZON_MODS.filter((m) => {
			if (horizonCategory !== 'all' && m.category !== horizonCategory) return false;
			if (!horizonSearch) return true;
			const q = horizonSearch.toLowerCase().trim();
			return (
				m.name.toLowerCase().includes(q) ||
				m.id.toLowerCase().includes(q) ||
				m.summary.toLowerCase().includes(q) ||
				m.author.toLowerCase().includes(q)
			);
		})
	);

	let name = $state('');
	let icon = $state<BlockIconT>('creeper');
	let loader = $state<ModLoader>('horizon-rust');
	let gameVersion = $state('26.3');
	let loaderVersion = $state('');
	let memory = $state(4096);
	let snapshots = $state(false);
	let isCreating = $state(false);
	let autoJoin = $state('');
	let horizonPreset = $state<'performance' | 'balanced' | 'quality' | 'ultra'>('balanced');
	let extraArgs = $state('');

	let versions = $state<GameVersion[]>([]);
	let versionsError = $state('');
	let loaders = $state<LoaderVersion[]>([]);
	let loadersState = $state<'idle' | 'loading' | 'error'>('idle');

	const visibleVersions = $derived(versions.filter((v) => v.type === 'release' || (snapshots && v.type === 'snapshot')));
	const maxRam = $derived(Math.max(2048, app.system.totalMemoryMb - 1024));

	const canCreate = $derived(
		name.trim().length > 0 &&
		(loader === 'horizon-rust' ? true : gameVersion && (loader === 'vanilla' || loaderVersion)) &&
		loadersState !== 'loading'
	);

	$effect(() => {
		if (!open) return;
		if (loader === 'horizon-rust') {
			gameVersion = '26.3';
			memory = app.settings.defaultMemoryMb || 4096;
		}
		if (versions.length === 0) {
			gameVersions()
				.then((v) => {
					versions = v;
					if (loader !== 'horizon-rust') {
						gameVersion ||= v.find((x) => x.type === 'release')?.id ?? '';
					}
				})
				.catch((e) => (versionsError = errorMessage(e)));
		}
	});

	// Recarrega versões do loader Java quando muda versão/loader
	$effect(() => {
		const l = loader;
		if (l === 'horizon-rust') {
			gameVersion = '26.3';
			return;
		}
		const mc = gameVersion;
		loaderVersion = '';
		loaders = [];
		if (l === 'vanilla' || !mc) return;
		loadersState = 'loading';
		loaderVersions(l, mc)
			.then((list) => {
				if (l !== loader || mc !== gameVersion) return;
				loaders = list;
				loaderVersion = (list.find((x) => x.stable) ?? list[0])?.version ?? '';
				loadersState = 'idle';
			})
			.catch(() => (loadersState = 'error'));
	});

	function toggleHorizonModSelection(modId: string) {
		if (selectedHorizonModIds.includes(modId)) {
			selectedHorizonModIds = selectedHorizonModIds.filter((id) => id !== modId);
		} else {
			selectedHorizonModIds = [...selectedHorizonModIds, modId];
		}
	}

	async function create() {
		if (!canCreate || isCreating) return;
		isCreating = true;
		try {
			const isHz = loader === 'horizon-rust';

			const inst = app.newInstance({
				name: name.trim(),
				icon,
				engine: isHz ? 'rust' : 'java',
				gameVersion: isHz ? '26.3' : gameVersion,
				loader,
				loaderVersion: loader === 'vanilla' || isHz ? undefined : loaderVersion,
				memory: { minMb: 512, maxMb: memory },
				autoJoin: autoJoin.trim() || undefined,
				jvmArgs: extraArgs.trim(),
				horizonOptions: isHz ? {
					preset: horizonPreset,
					renderDistance: horizonPreset === 'ultra' ? 24 : horizonPreset === 'quality' ? 16 : 12,
					lodDistance: horizonPreset === 'ultra' ? 256 : horizonPreset === 'quality' ? 128 : 0,
					farDetail: horizonPreset === 'performance' ? 'simple' : 'full',
					framerateLimit: 120,
					presentMode: 'auto',
					antialiasing: 'fxaa',
					caveCulling: true,
					entityCulling: false,
					animatedTextures: true,
					dynamicLights: selectedHorizonModIds.includes('dynamic_lights'),
					zoom: selectedHorizonModIds.includes('zoom'),
					fps: selectedHorizonModIds.includes('fps_overlay'),
					keystrokes: selectedHorizonModIds.includes('keystrokes'),
					minimap: selectedHorizonModIds.includes('minimap'),
					mouseTweaks: selectedHorizonModIds.includes('mouse_tweaks'),
					sort: selectedHorizonModIds.includes('inventory_sort'),
					fullbright: selectedHorizonModIds.includes('fullbright'),
					discordPresence: selectedHorizonModIds.includes('discord_rpc')
				} : undefined
			});

			if (isHz) {
				// Semeia o ecossistema oficial de mods Horizon Rust com as seleções feitas
				seedHorizonInstanceMods(inst, selectedHorizonModIds);
				app.saveInstances();

				if (isTauri) {
					// Persiste as opções iniciais no disco
					if (inst.horizonOptions) {
						await call('horizon_options_set', {
							instanceId: inst.id,
							options: inst.horizonOptions
						}).catch(() => {});
					}

					// Sincroniza o arquivo horizon-mods.txt no disco em uma única chamada bulk eficiente
					const bulkStates: Record<string, boolean> = {};
					for (const mod of OFFICIAL_HORIZON_MODS) {
						bulkStates[mod.id] = selectedHorizonModIds.includes(mod.id);
					}
					await setHorizonModsBulk(inst.id, bulkStates).catch(() => {});
				}

				toasts.ok(`Instância Horizon Rust "${inst.name}" criada com ${selectedHorizonModIds.length} mods ativados!`);
			} else if (selectedJavaItems.length > 0) {
				toasts.info(`Instalando ${selectedJavaItems.length} mods para ${inst.name}...`);
				const targetLoaders = loadersFor(contentTabKind, loader);
				const res = await installProjectsBatch(
					selectedJavaItems.map((s) => ({
						id: s.project_id,
						title: s.title,
						iconUrl: s.icon_url,
						kind: contentTabKind
					})),
					{
						ownerKind: 'instance',
						owner: inst,
						loaders: targetLoaders,
						gameVersion
					}
				);
				app.saveInstances();
				toasts.ok(`Instância "${inst.name}" criada com ${res.successCount} mods instalados!`);
			} else {
				toasts.ok(`Instância "${inst.name}" criada com sucesso!`);
			}

			open = false;
			name = '';
			autoJoin = '';
			extraArgs = '';
			selectedJavaItems = [];
			activeModalTab = 'general';
			oncreated?.(inst);
		} catch (e) {
			toasts.err(e);
		} finally {
			isCreating = false;
		}
	}

	const loaderTabs = [
		{ id: 'horizon-rust', label: 'Rust (Horizon 26.3 · Vulkan)' },
		{ id: 'fabric', label: 'Fabric (Java)' },
		{ id: 'quilt', label: 'Quilt (Java)' },
		{ id: 'neoforge', label: 'NeoForge (Java)' },
		{ id: 'forge', label: 'Forge (Java)' },
		{ id: 'vanilla', label: 'Vanilla (Mojang)' }
	];
</script>

<Modal bind:open title="Nova Instância de Minecraft" width={820}>
	<div class="flex flex-col gap-4">
		<!-- Navegação entre Configuração Básica e Mods -->
		<div class="flex items-center justify-between gap-3 border-b border-[#24322b] pb-2 flex-wrap">
			<TabSelector
				tabs={[
					{ id: 'general', label: '1. Configuração & Parâmetros' },
					{
						id: 'mods',
						label: loader === 'horizon-rust' ? '2. Mods Horizon (.hmod)' : loader === 'vanilla' ? '2. Texturas & Shaders' : '2. Escolher Mods (.jar)',
						count: loader === 'horizon-rust' ? selectedHorizonModIds.length : selectedJavaItems.length || undefined
					}
				]}
				bind:value={activeModalTab}
				size="sm"
			/>

			<span class="text-[11.5px] text-[#bef264] flex items-center gap-1.5 font-mc">
				<Check size={14} />
				{#if loader === 'horizon-rust'}
					{selectedHorizonModIds.length} mods Rust ativados
				{:else if selectedJavaItems.length > 0}
					{selectedJavaItems.length} mod(s) selecionado(s)
				{:else}
					Pronto para configurar
				{/if}
			</span>
		</div>

		<!-- 1. ABA DE CONFIGURAÇÃO GERAL -->
		{#if activeModalTab === 'general'}
			<div class="grid gap-4">
				<div class="grid grid-cols-1 sm:grid-cols-[auto_1fr] items-end gap-4">
					<div class="flex items-center gap-3">
						<BlockIcon {icon} size={54} />
						<div class="sm:hidden">
							<span class="tp-label">Ícone</span>
						</div>
					</div>
					<div>
						<label class="tp-label" for="inst-new-name">Nome da Instância</label>
						<input id="inst-new-name" class="tp-input" bind:value={name} placeholder="Ex.: Aventura Rust Vulkan" maxlength="40" />
					</div>
				</div>

				<div>
					<span class="tp-label">Ícone do Bloco</span>
					<div class="flex flex-wrap gap-2">
						{#each Object.keys(BLOCK_ICONS) as key (key)}
							<button
								class="p-1.5 rounded border-2 transition-all cursor-pointer"
								class:border-emerald-500={icon === key}
								class:border-transparent={icon !== key}
								class:bg-[#1a2e22]={icon === key}
								onclick={() => (icon = key as BlockIconT)}
								aria-label={key}
							>
								<BlockIcon icon={key as BlockIconT} size={30} />
							</button>
						{/each}
					</div>
				</div>

				<div>
					<span class="tp-label">Motor & Modloader</span>
					<div class="overflow-x-auto pb-1">
						<TabSelector tabs={loaderTabs} bind:value={loader as string} size="sm" />
					</div>
					<div class="mt-2 p-2.5 rounded bg-[#0d1612] border border-[#1b2b22] text-[12px]">
						{#if loader === 'horizon-rust'}
							<div class="flex items-center gap-2 text-[#34d399] font-semibold mb-0.5">
								<Cpu size={16} /> Motor Nativo Horizon Rust 26.3 (Vulkan)
							</div>
							<p class="tp-muted text-[11.5px]">
								Reescrito 100% em Rust sem necessidade de JVM Java. Renderização direta em hardware Vulkan com altíssimo FPS, carregamento instantâneo e suporte a mods nativos <code>.hmod</code>.
							</p>
						{:else if loader === 'fabric'}
							<p class="tp-muted text-[11.5px]">Fabric: Leve, modular e ideal para mods modernos de desempenho (Sodium, Iris) e jogabilidade.</p>
						{:else if loader === 'neoforge'}
							<p class="tp-muted text-[11.5px]">NeoForge: Sucessor oficial do Forge para 1.20.2+, compatível com Create, Mekanism e grandes modpacks.</p>
						{:else if loader === 'forge'}
							<p class="tp-muted text-[11.5px]">Forge clássico: Ideal para modpacks consolidados da versão 1.20.1 e anteriores.</p>
						{:else if loader === 'quilt'}
							<p class="tp-muted text-[11.5px]">Quilt: Ecossistema compatível com Fabric com recursos adicionais de carregamento.</p>
						{:else}
							<p class="tp-muted text-[11.5px]">Minecraft Java Oficial direto dos servidores da Mojang (sem suporte a mods de código).</p>
						{/if}
					</div>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<label class="tp-label" for="mc-ver-sel">Versão do Jogo</label>
						{#if loader === 'horizon-rust'}
							<input id="mc-ver-sel" class="tp-input font-mono" value="26.3 (Horizon Nativo)" disabled />
						{:else if versionsError}
							<input id="mc-ver-sel" class="tp-input font-mono" bind:value={gameVersion} placeholder="1.21.4" />
						{:else}
							<select id="mc-ver-sel" class="tp-select font-mono" bind:value={gameVersion} disabled={!versions.length}>
								{#each visibleVersions as v (v.id)}
									<option value={v.id}>{v.id}{v.type === 'snapshot' ? ' (snapshot)' : ''}</option>
								{/each}
							</select>
						{/if}
					</div>

					<div>
						<label class="tp-label" for="loader-ver-sel">Versão do Modloader</label>
						{#if loader === 'horizon-rust'}
							<input id="loader-ver-sel" class="tp-input font-mono" value="Horizon 26.3 (Vulkan)" disabled />
						{:else if loader === 'vanilla'}
							<input id="loader-ver-sel" class="tp-input" value="—" disabled />
						{:else if loadersState === 'loading'}
							<input id="loader-ver-sel" class="tp-input" value="Carregando versões…" disabled />
						{:else if loaders.length}
							<select id="loader-ver-sel" class="tp-select font-mono" bind:value={loaderVersion}>
								{#each loaders as l (l.version)}
									<option value={l.version}>{l.version}{l.stable ? '' : ' (beta)'}</option>
								{/each}
							</select>
						{:else}
							<input id="loader-ver-sel" class="tp-input font-mono" bind:value={loaderVersion} placeholder="Ex: 0.16.9" />
						{/if}
					</div>
				</div>

				<!-- Memória RAM -->
				<div class="p-3.5 rounded-lg bg-[#0d1612] border border-[#1b2b22] space-y-2">
					<div class="flex items-baseline justify-between">
						<label class="tp-label !mb-0 flex items-center gap-2" for="inst-ram">
							<HardDrive size={16} class="text-[#34d399]" />
							Memória RAM Dedicada
						</label>
						<span class="font-mc mc-shadow-sm text-[13px] text-[#bef264]">{(memory / 1024).toFixed(1)} GB</span>
					</div>
					<input id="inst-ram" type="range" class="tp-range" min="512" max={maxRam} step="512" bind:value={memory} />
					<p class="tp-help">
						{#if loader === 'horizon-rust'}
							O Horizon Rust opera eficientemente em 1.5–2 GB. Limites maiores (4–8 GB) são usados para distant terrain LOD (até 1024 chunks) e altas resoluções.
						{:else}
							Recomendado: 2–3 GB para Vanilla, 4–8 GB para instâncias com modpacks moderados a pesados.
						{/if}
					</p>
				</div>

				<!-- Configurações específicas para Horizon Rust -->
				{#if loader === 'horizon-rust'}
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-lg bg-[#0f241a]/60 border border-[#10b981]/30">
						<div>
							<label class="tp-label" for="hz-init-preset">Preset Gráfico Inicial</label>
							<select id="hz-init-preset" class="tp-select" bind:value={horizonPreset}>
								<option value="performance">Desempenho (PCs básicos)</option>
								<option value="balanced">Equilibrado (Recomendado)</option>
								<option value="quality">Qualidade (Alta fidelidade)</option>
								<option value="ultra">Ultra (Visão máxima & LOD)</option>
							</select>
						</div>
						<div>
							<label class="tp-label" for="hz-init-server">Servidor Rápido (Auto-Join)</label>
							<input id="hz-init-server" class="tp-input font-mono" placeholder="tropicaliacraft.online" bind:value={autoJoin} />
						</div>
					</div>
				{/if}

				<div class="pt-2 flex justify-end">
					<PixelButton variant="gold" icon={Puzzle} onclick={() => (activeModalTab = 'mods')}>
						{#if loader === 'horizon-rust'}
							Avançar para seleção de mods .hmod ({selectedHorizonModIds.length} ativados) →
						{:else}
							Avançar para escolha de mods →
						{/if}
					</PixelButton>
				</div>
			</div>
		{:else}
			<!-- 2. ABA DE ESCOLHA DE MODS -->
			<div class="grid gap-3">
				{#if loader === 'horizon-rust'}
					<!-- CATÁLOGO OFICIAL DE MODS HORIZON RUST -->
					<div class="p-3.5 rounded-lg bg-[#0e1814] border border-[#10b981]/30 flex flex-wrap items-center justify-between gap-3">
						<div class="flex items-center gap-3">
							<Cpu size={22} class="text-[#34d399]" />
							<div>
								<h4 class="font-mc text-[13px] text-white flex items-center gap-2">
									Mods Integrados do Horizon Rust 26.3
									<Badge tone="green" pixel>{selectedHorizonModIds.length} ativados</Badge>
								</h4>
								<p class="tp-muted text-[11.5px]">Selecione os mods nativos que já começarão ativados na sua nova instância (77 disponíveis).</p>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<PixelButton
								size="xs"
								variant="gold"
								icon={Sparkles}
								onclick={() => (selectedHorizonModIds = OFFICIAL_HORIZON_MODS.filter((m) => m.defaultEnabled).map((m) => m.id))}
							>
								Padrões Horizon
							</PixelButton>
							<PixelButton
								size="xs"
								variant="ghost"
								onclick={() => (selectedHorizonModIds = OFFICIAL_HORIZON_MODS.map((m) => m.id))}
							>
								Marcar todos ({OFFICIAL_HORIZON_MODS.length})
							</PixelButton>
							<PixelButton
								size="xs"
								variant="ghost"
								onclick={() => (selectedHorizonModIds = [])}
							>
								Desmarcar todos
							</PixelButton>
						</div>
					</div>

					<!-- Barra de busca e categorias -->
					<div class="flex flex-col gap-2">
						<input
							class="tp-input !h-9 w-full"
							placeholder="Buscar entre os 77 mods do Horizon (nome, ID, autor)..."
							bind:value={horizonSearch}
						/>

						<div class="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
							{#each HORIZON_CATEGORIES as cat (cat.id)}
								{@const countInCat = cat.id === 'all' ? OFFICIAL_HORIZON_MODS.length : OFFICIAL_HORIZON_MODS.filter((m) => m.category === cat.id).length}
								<button
									class="px-2.5 py-1 rounded-full border transition-all cursor-pointer font-medium"
									class:bg-[#153424]={horizonCategory === cat.id}
									class:border-[#10b981]={horizonCategory === cat.id}
									class:text-[#bef264]={horizonCategory === cat.id}
									class:bg-[#0c1612]={horizonCategory !== cat.id}
									class:border-[#1b2b22]={horizonCategory !== cat.id}
									class:text-[#9ca3af]={horizonCategory !== cat.id}
									onclick={() => (horizonCategory = cat.id)}
								>
									{cat.label} ({countInCat})
								</button>
							{/each}
						</div>
					</div>

					<div class="tp-slot divide-y divide-[#1d2a23] max-h-[380px] overflow-y-auto pr-1">
						{#if filteredHorizonMods.length}
							{#each filteredHorizonMods as mod (mod.id)}
								{@const isSelected = selectedHorizonModIds.includes(mod.id)}
								<div
									class="flex items-center gap-3 p-3 transition-colors cursor-pointer hover:bg-[#132219]"
									class:bg-[#0f241a]={isSelected}
									class:opacity-60={!isSelected}
									role="button"
									tabindex="0"
									onclick={() => toggleHorizonModSelection(mod.id)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											toggleHorizonModSelection(mod.id);
										}
									}}
								>
									{#if mod.iconUrl}
										<img src={mod.iconUrl} alt="" class="w-9 h-9 rounded object-contain bg-[#0e1713] p-0.5 border border-[#1b2b22] shrink-0" />
									{:else}
										<div class="w-9 h-9 rounded bg-[#162a20] flex items-center justify-center shrink-0 border border-[#223d2e]" class:text-[#34d399]={isSelected} class:text-[#4b5563]={!isSelected}>
											{#if mod.kind === 'native-mod'}
												<Cpu size={18} />
											{:else}
												<Package size={18} />
											{/if}
										</div>
									{/if}

									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2 flex-wrap">
											<b class="text-[13px] text-white font-mc tracking-wide">{mod.name}</b>
											{#if isSelected}
												<Badge tone="green" pixel>Ativado</Badge>
											{:else}
												<Badge tone="muted">Desativado</Badge>
											{/if}
											{#if mod.defaultEnabled}
												<Badge tone="gold">Padrão</Badge>
											{/if}
											{#if mod.kind === 'native-mod'}
												<Badge tone="blue">Nativo</Badge>
											{/if}
										</div>
										<p class="text-[11.5px] tp-muted truncate mt-0.5">{mod.summary}</p>
										<span class="text-[10.5px] font-mono text-[#6b7280]">id: {mod.id} · {mod.filename} · {formatBytes(mod.size)}</span>
									</div>
									<span
										class="shrink-0"
										role="presentation"
										onclick={(e) => e.stopPropagation()}
										onkeydown={(e) => e.stopPropagation()}
									>
										<Toggle checked={isSelected} onchange={() => toggleHorizonModSelection(mod.id)} />
									</span>
								</div>
							{/each}
						{:else}
							<div class="py-10 text-center tp-muted text-[13px]">
								Nenhum mod encontrado para a busca "{horizonSearch}".
							</div>
						{/if}
					</div>

					<p class="tp-help !mt-1">
						Os mods selecionados serão configurados automaticamente em <code>horizon-mods.txt</code> e estarão prontos para jogar sem precisar de downloads adicionais.
					</p>
				{:else}
					<!-- CATÁLOGO MODRINTH PARA INSTÂNCIAS JAVA -->
					<p class="tp-help !mt-0">
						Selecione os mods do Modrinth que deseja baixar e instalar diretamente na criação de <b>{name || 'sua instância'}</b> ({LOADER_LABEL[loader]} {gameVersion}).
					</p>

					<ContentPickerInline
						bind:kind={contentTabKind}
						allowedKinds={loader === 'vanilla' ? ['resourcepack', 'shader'] : ['mod', 'shader', 'resourcepack']}
						loaders={loadersFor(contentTabKind, loader)}
						{gameVersion}
						mode="select"
						bind:selected={selectedJavaItems}
						compact
					/>
				{/if}
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<PixelButton variant="ghost" onclick={() => (open = false)}>Cancelar</PixelButton>
		<PixelButton
			variant="emerald"
			icon={Sparkles}
			disabled={!canCreate || isCreating}
			loading={isCreating}
			onclick={create}
		>
			{#if loader === 'horizon-rust'}
				Criar Instância Horizon Rust ({selectedHorizonModIds.length} mods)
			{:else if selectedJavaItems.length > 0}
				Criar Instância (+{selectedJavaItems.length} {selectedJavaItems.length === 1 ? 'mod' : 'mods'})
			{:else}
				Criar Instância
			{/if}
		</PixelButton>
	{/snippet}
</Modal>
