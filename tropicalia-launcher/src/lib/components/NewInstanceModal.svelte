<!-- Criar instância: nome, ícone, motor/modloader, RAM, parâmetros e seleção de mods (.hmod Horizon e .jar Java) -->
<script lang="ts">
    import { tr } from '$lib/ui-text';
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
        ensureHorizonModsInstalled,
        supportedHorizonNativeMods,
		type HorizonModCategory,
		type OfficialHorizonMod,
		seedHorizonInstanceMods
	} from '$lib/services/horizon-mods';
	import { call, isTauri } from '$lib/platform';
	import type { BlockIcon as BlockIconT, ContentKind, Instance, ModLoader } from '$lib/types';
	import { BLOCK_ICONS, DEFAULT_LOADER_ICON, errorMessage, formatBytes, LOADER_LABEL } from '$lib/util/format';
	import { Check, Cpu, HardDrive, Package, Puzzle, Sparkles, Terminal } from 'lucide-svelte';

	let { open = $bindable(false), oncreated }: { open: boolean; oncreated?: (i: Instance) => void } = $props();

	let activeModalTab = $state<'general' | 'mods'>('general');
    let createModal: { close(): void } | undefined;
	let contentTabKind = $state<ContentKind>('mod');
	let selectedJavaItems = $state<SearchHit[]>([]);

	// Rust usa o mesmo seletor do Java (ContentPickerInline); a seleção também é uma lista de SearchHit.
	function hitFromMod(m: OfficialHorizonMod): SearchHit {
		return {
			project_id: m.id, slug: m.id, title: m.name, description: m.summary, icon_url: m.iconUrl ?? null,
			author: m.author, downloads: m.downloads, follows: 0, categories: ['Rust', 'Horizon 26.3'],
			display_categories: ['Rust', 'Horizon 26.3'], versions: [m.version], project_type: 'mod',
			client_side: 'required', server_side: 'optional', date_modified: ''
		} as SearchHit;
	}
	let nativeModIds = $state(new Set<string>());
	let nativeCapabilitiesReady = $state(!isTauri);
	function modAvailable(mod: OfficialHorizonMod) { return !mod.filename.endsWith('.hnmod') || nativeModIds.has(mod.id); }
	let selectedHorizon = $state<SearchHit[]>(
		OFFICIAL_HORIZON_MODS.filter((m) => m.defaultEnabled && !m.filename.endsWith('.hnmod')).map(hitFromMod)
	);
	const selectedHorizonModIds = $derived(selectedHorizon.map((h) => h.project_id));
	$effect(() => {
		if (!open || loader !== 'horizon-rust') return;
		nativeCapabilitiesReady = false;
		supportedHorizonNativeMods({ id: app.lastInstance?.id ?? 'new-instance' })
			.then((ids) => {
				nativeModIds = ids;
				// padrões Tropicalia que o motor consegue rodar já vêm marcados
				const have = new Set(selectedHorizon.map((h) => h.project_id));
				const defaults = OFFICIAL_HORIZON_MODS.filter((m) => m.defaultEnabled && modAvailable(m) && !have.has(m.id));
				selectedHorizon = [...selectedHorizon, ...defaults.map(hitFromMod)];
				nativeCapabilitiesReady = true;
			}).catch((e) => { nativeCapabilitiesReady = true; toasts.err(e); });
	});

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

	function getDefaultName(l: ModLoader): string {
		const base = `Tropicalia (${LOADER_LABEL[l]})`;
		if (!app.instances.some((i) => i.name.toLowerCase() === base.toLowerCase())) {
			return base;
		}
		let num = 2;
		while (app.instances.some((i) => i.name.toLowerCase() === `${base} ${num}`.toLowerCase())) {
			num++;
		}
		return `${base} ${num}`;
	}

	const canCreate = $derived(
		(loader === 'horizon-rust' ? true : gameVersion && (loader === 'vanilla' || loaderVersion)) &&
		loadersState !== 'loading' && (loader !== 'horizon-rust' || nativeCapabilitiesReady)
	);

	$effect(() => {
		if (!open) return;
		if (!name || name.trim() === '') {
			name = getDefaultName(loader);
		}
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

	async function create() {
		if (isCreating) return;
        if (!canCreate) throw new Error('Preencha os campos obrigatórios.');
		isCreating = true;
		try {
			const isHz = loader === 'horizon-rust';
			const finalName = name.trim() || getDefaultName(loader);

			const inst = app.newInstance({
				name: finalName,
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
					await ensureHorizonModsInstalled(inst);
                    await app.saveInstances();
				}

				toasts.ok(`Perfil "${inst.name}" criado e salvo com sucesso!`);
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
				await app.saveInstances();
                if (res.errors.length) toasts.err(res.errors.join("\n"));
				toasts.ok(`Perfil "${inst.name}" criado com ${res.successCount} mods instalados!`);
			} else {
				toasts.ok(`Perfil "${inst.name}" criado e salvo com sucesso!`);
			}

			open = false;
			name = '';
			icon = DEFAULT_LOADER_ICON[loader] ?? 'creeper';
			autoJoin = '';
			extraArgs = '';
			selectedJavaItems = [];
			activeModalTab = 'general';
			oncreated?.(inst);
		} catch (e) {
			toasts.err(e);
            throw e;
		} finally {
			isCreating = false;
		}
	}

	const loaderTabs = [
		{ id: 'horizon-rust', label: 'Rust' },
		{ id: 'fabric', label: 'Fabric' },
		{ id: 'vanilla', label: 'Vanilla' },
		{ id: 'forge', label: 'Forge' }
	];

	function handleLoaderChange(val: string) {
		const prevDefault = getDefaultName(loader);
		loader = val as ModLoader;
		icon = DEFAULT_LOADER_ICON[val] ?? 'grass';
		if (!name || name === prevDefault || name.startsWith('Tropicalia (')) {
			name = getDefaultName(loader);
		}
	}
</script>

<Modal bind:this={createModal} bind:open dirty={!!name || selectedJavaItems.length > 0} onsave={create} dismissable={!isCreating} title={tr("Novo Perfil de Minecraft")} width={820}>
	<div class="flex flex-col gap-4">
		<!-- Navegação entre Configuração Básica e Mods -->
		<div class="flex items-center justify-between gap-3 border-b border-[#24322b] pb-2 flex-wrap">
			<TabSelector
				tabs={[
					{ id: 'general', label: '1. Configuração & Parâmetros' },
					{
						id: 'mods',
						label: loader === 'vanilla' ? '2. Texturas & Shaders' : loader === 'horizon-rust' ? '2. Escolher Mods (Rust)' : '2. Escolher Mods (.jar)',
						count: (loader === 'horizon-rust' ? selectedHorizon.length : selectedJavaItems.length) || undefined
					}
				]}
				bind:value={activeModalTab}
				size="sm"
			/>

			<span class="text-[11.5px] text-[#bef264] flex items-center gap-1.5 font-mc">
				<Check size={14} />
				{#if (loader === 'horizon-rust' ? selectedHorizon.length : selectedJavaItems.length) > 0}
					{loader === 'horizon-rust' ? selectedHorizon.length : selectedJavaItems.length} mod(s) selecionado(s)
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
							<span class="tp-label">{tr("Ícone")}</span>
						</div>
					</div>
					<div>
						<label class="tp-label" for="inst-new-name">Nome do Perfil</label>
						<input id="inst-new-name" class="tp-input" bind:value={name} placeholder="Ex.: Tropicalia (Rust)" maxlength="40" />
					</div>
				</div>

				<div>
					<span class="tp-label">{tr("Ícone do Bloco")}</span>
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
					<span class="tp-label">{tr("Tipo de Minecraft")}</span>
					<div class="overflow-x-auto pb-1">
						<TabSelector tabs={loaderTabs} value={loader} onchange={handleLoaderChange} size="sm" />
					</div>
					<div class="mt-2 p-2.5 rounded bg-[#0d1612] border border-[#1b2b22] text-[12px]">
						{#if loader === 'horizon-rust'}
							<div class="flex items-center gap-2 text-[#34d399] font-semibold mb-0.5">
								<Cpu size={16} /> Motor Nativo Rust 26.3 (Vulkan)
							</div>
							<p class="tp-muted text-[11.5px]">
								Reescrito 100% em Rust sem necessidade de JVM Java. Renderização direta em hardware Vulkan com altíssimo FPS, carregamento instantâneo e suporte a mods nativos <code>.hmod</code>.
							</p>
						{:else if loader === 'fabric'}
							<p class="tp-muted text-[11.5px]">Fabric: Leve, modular e ideal para mods modernos de desempenho (Sodium, Iris) e jogabilidade.</p>
						{:else if loader === 'forge'}
							<p class="tp-muted text-[11.5px]">Forge: Ideal para modpacks consolidados e grandes mods clássicos.</p>
						{:else}
							<p class="tp-muted text-[11.5px]">Vanilla: Minecraft Java Oficial direto dos servidores da Mojang.</p>
						{/if}
					</div>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<label class="tp-label" for="mc-ver-sel">{tr("Versão do Jogo")}</label>
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
							<input id="hz-init-server" class="tp-input font-mono" placeholder="tropicaliacraft.gustavolara.pro" bind:value={autoJoin} />
						</div>
					</div>
				{/if}

				<div class="pt-2 flex justify-end">
					<PixelButton variant="gold" icon={Puzzle} onclick={() => (activeModalTab = 'mods')}>
						Avançar para escolha de mods →
					</PixelButton>
				</div>
			</div>
		{:else}
			<!-- 2. ABA DE ESCOLHA DE MODS -->
			<div class="grid gap-3">
					{#if loader === 'horizon-rust'}
						<p class="tp-help !mt-0">
							Escolha os mods Rust (Horizon 26.3) que já virão ativados em <b>{name || 'sua instância'}</b>. Mesmo catálogo e rolagem infinita do Java.
						</p>
						<ContentPickerInline
							bind:kind={contentTabKind}
							allowedKinds={['mod', 'shader', 'resourcepack']}
							loaders={['horizon-rust']}
							horizon
							gameVersion="26.3"
							mode="select"
							bind:selected={selectedHorizon}
							compact
						/>
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
		<PixelButton variant="ghost" onclick={() => createModal?.close()}>{tr("Cancelar")}</PixelButton>
		<PixelButton
			variant="emerald"
			icon={Sparkles}
			disabled={!canCreate || isCreating}
			loading={isCreating}
			onclick={() => create().catch(() => {})}
		>
			{#if loader === 'horizon-rust'}
				Criar Perfil Rust ({selectedHorizonModIds.length} mods)
			{:else if selectedJavaItems.length > 0}
				Criar Perfil (+{selectedJavaItems.length} {selectedJavaItems.length === 1 ? 'mod' : 'mods'})
			{:else}
				Criar Perfil
			{/if}
		</PixelButton>
	{/snippet}
</Modal>
