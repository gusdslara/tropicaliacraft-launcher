<!-- Criar instância / modpack: nome, ícone, versão do jogo, modloader, RAM e seleção inline de mods/texturas/shaders. -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import PixelButton from './PixelButton.svelte';
	import TabSelector from './TabSelector.svelte';
	import BlockIcon from './BlockIcon.svelte';
	import ContentPickerInline from './ContentPickerInline.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import { gameVersions, loaderVersions, type GameVersion, type LoaderVersion } from '$lib/services/versions';
	import {
		installProjectsBatch,
		loadersFor,
		type SearchHit
	} from '$lib/services/modrinth';
	import { getHorizonRegistry, installHorizonMod } from '$lib/services/horizon-mods';
	import type { BlockIcon as BlockIconT, ContentKind, Instance, ModLoader } from '$lib/types';
	import { BLOCK_ICONS, errorMessage, LOADER_LABEL } from '$lib/util/format';
	import { Check, Layers, Package, Puzzle, Sparkles } from 'lucide-svelte';

	let { open = $bindable(false), oncreated }: { open: boolean; oncreated?: (i: Instance) => void } = $props();

	let activeModalTab = $state<'general' | 'mods'>('general');
	let contentTabKind = $state<ContentKind>('mod');
	let selectedItems = $state<SearchHit[]>([]);

	let name = $state('');
	let icon = $state<BlockIconT>('creeper');
	let loader = $state<ModLoader>('fabric');
	let gameVersion = $state('');
	let loaderVersion = $state('');
	let memory = $state(app.settings.defaultMemoryMb);
	let snapshots = $state(false);
	let isCreating = $state(false);

	let versions = $state<GameVersion[]>([]);
	let versionsError = $state('');
	let loaders = $state<LoaderVersion[]>([]);
	let loadersState = $state<'idle' | 'loading' | 'error'>('idle');

	const visibleVersions = $derived(versions.filter((v) => v.type === 'release' || (snapshots && v.type === 'snapshot')));
	const maxRam = $derived(Math.max(2048, app.system.totalMemoryMb - 1024));
	const canCreate = $derived(
		name.trim().length > 0 &&
		gameVersion &&
		(loader === 'vanilla' || loader === 'horizon-rust' || loaderVersion) &&
		loadersState !== 'loading'
	);

	$effect(() => {
		if (!open || versions.length) return;
		memory = app.settings.defaultMemoryMb;
		gameVersions()
			.then((v) => {
				versions = v;
				gameVersion ||= v.find((x) => x.type === 'release')?.id ?? '';
			})
			.catch((e) => (versionsError = errorMessage(e)));
	});

	// recarrega as versões do loader quando muda versão/loader
	$effect(() => {
		const l = loader;
		if (l === 'horizon-rust') {
			gameVersion = '26.3';
		}
		const mc = gameVersion;
		loaderVersion = '';
		loaders = [];
		if (l === 'vanilla' || l === 'horizon-rust' || !mc) return;
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

	$effect(() => {
		if (loader === 'vanilla' && contentTabKind === 'mod') {
			contentTabKind = 'resourcepack';
		}
	});

	async function create() {
		if (!canCreate || isCreating) return;
		isCreating = true;
		try {
			const inst = app.newInstance({
				name: name.trim(),
				icon,
				engine: loader === 'horizon-rust' ? 'rust' : (app.system.os === 'android' ? 'java_pojav' : 'java_native'),
				gameVersion: loader === 'horizon-rust' ? '26.3' : gameVersion,
				loader,
				loaderVersion: loader === 'vanilla' || loader === 'horizon-rust' ? undefined : loaderVersion,
				memory: { minMb: 512, maxMb: memory }
			});

			if (selectedItems.length > 0) {
				toasts.info(`Instalando ${selectedItems.length} itens selecionados...`);
				if (loader === 'horizon-rust' && contentTabKind === 'mod') {
					try {
						const reg = await getHorizonRegistry();
						let count = 0;
						for (const item of selectedItems) {
							const mod = reg.projects.find((p) => p.id === item.project_id);
							if (mod) {
								try {
									await installHorizonMod(inst, mod);
									count++;
								} catch (e) {
									console.error(e);
								}
							}
						}
						app.saveInstances();
						toasts.ok(`Instância "${inst.name}" criada com ${count} mods Rust!`);
					} catch (e) {
						toasts.err(e);
					}
				} else {
					const targetLoaders = loadersFor(contentTabKind, loader);
					const res = await installProjectsBatch(
						selectedItems.map((s) => ({
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
					if (res.successCount > 0) {
						toasts.ok(`Instância "${inst.name}" criada com ${res.successCount} mods/itens!`);
					}
				}
			} else {
				toasts.ok(`Instância "${inst.name}" criada`);
			}

			open = false;
			name = '';
			selectedItems = [];
			activeModalTab = 'general';
			oncreated?.(inst);
		} catch (e) {
			toasts.err(e);
		} finally {
			isCreating = false;
		}
	}

	const loaderTabs = [
		{ id: 'vanilla', label: 'Vanilla' },
		{ id: 'fabric', label: 'Fabric' },
		{ id: 'quilt', label: 'Quilt' },
		{ id: 'forge', label: 'Forge' },
		{ id: 'neoforge', label: 'NeoForge' },
		{ id: 'horizon-rust', label: 'Rust (Horizon)' }
	];
</script>

<Modal bind:open title="Nova Instância" width={780}>
	<div class="flex flex-col gap-4">
		<!-- Navegação entre Configuração Básica e Mods -->
		<div class="flex items-center justify-between gap-3 border-b border-[#24322b] pb-2 flex-wrap">
			<TabSelector
				tabs={[
					{ id: 'general', label: '1. Configuração Básica' },
					{
						id: 'mods',
						label: loader === 'vanilla' ? '2. Texturas & Shaders' : '2. Escolher Mods',
						count: selectedItems.length || undefined
					}
				]}
				bind:value={activeModalTab}
				size="sm"
			/>

			{#if selectedItems.length > 0}
				<span class="text-[11px] text-[#bef264] flex items-center gap-1 font-mc">
					<Check size={13} /> {selectedItems.length} mod(s) selecionado(s)
				</span>
			{/if}
		</div>

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
						<label class="tp-label" for="inst-name">Nome da Instância</label>
						<input id="inst-name" class="tp-input" bind:value={name} placeholder="Ex.: Create com a galera" maxlength="40" />
					</div>
				</div>

				<div>
					<span class="tp-label">Ícone do Bloco</span>
					<div class="flex flex-wrap gap-2">
						{#each Object.keys(BLOCK_ICONS) as key (key)}
							<button class="icon-pick" class:on={icon === key} onclick={() => (icon = key as BlockIconT)} aria-label={key}>
								<BlockIcon icon={key as BlockIconT} size={32} />
							</button>
						{/each}
					</div>
				</div>

				<div>
					<span class="tp-label">Modloader</span>
					<div class="overflow-x-auto pb-1">
						<TabSelector tabs={loaderTabs} bind:value={loader as string} size="sm" />
					</div>
					<p class="tp-help">
						{#if loader === 'vanilla'}Minecraft Java oficial direto da Mojang (sem suporte a mods de código).
						{:else if loader === 'fabric'}Leve e rápido de atualizar. Ideal para Sodium, Iris e mods modernos.
						{:else if loader === 'quilt'}Compatível com a maioria dos mods Fabric.
						{:else if loader === 'forge'}O clássico dos grandes modpacks Java (até 1.20.1).
						{:else if loader === 'neoforge'}Sucessor moderno do Forge (1.20.2+): Create, Mekanism, AE2…
						{:else}Motor ultra-rápido compilado nativamente em Rust (Vulkan), com suporte a mods nativos .hmod para PC e Android!{/if}
					</p>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<div class="mb-1.5 flex items-center justify-between">
							<label class="tp-label !mb-0" for="mc-ver">Versão do Minecraft</label>
							<label class="tp-muted flex cursor-pointer items-center gap-1.5 text-[11px]"><input type="checkbox" bind:checked={snapshots} class="accent-emerald-500" /> snapshots</label>
						</div>
						{#if versionsError}
							<input id="mc-ver" class="tp-input" bind:value={gameVersion} placeholder="1.21.4" />
							<p class="tp-help text-[#fbbf24]">Sem conexão com a Mojang: digite a versão.</p>
						{:else}
							<select id="mc-ver" class="tp-select" bind:value={gameVersion} disabled={!versions.length}>
								{#each visibleVersions as v (v.id)}
									<option value={v.id}>{v.id}{v.type === 'snapshot' ? ' (snapshot)' : ''}</option>
								{/each}
							</select>
						{/if}
					</div>
					<div>
						<label class="tp-label" for="loader-ver">Versão do {LOADER_LABEL[loader]}</label>
						{#if loader === 'vanilla'}
							<input id="loader-ver" class="tp-input" value="—" disabled />
						{:else if loader === 'horizon-rust'}
							<input id="loader-ver" class="tp-input" value="Horizon 26.3 (Vulkan Nativo)" disabled />
						{:else if loadersState === 'error'}
							<input id="loader-ver" class="tp-input font-mono" bind:value={loaderVersion} placeholder="versão do loader" />
							<p class="tp-help text-[#fbbf24]">Não deu para listar: digite a versão.</p>
						{:else}
							<select id="loader-ver" class="tp-select" bind:value={loaderVersion} disabled={loadersState === 'loading' || !loaders.length}>
								{#if loadersState === 'loading'}<option>Carregando…</option>{/if}
								{#each loaders as l (l.version)}
									<option value={l.version}>{l.version}{l.stable ? '' : ' (beta)'}</option>
								{/each}
							</select>
							{#if loadersState === 'idle' && !loaders.length && gameVersion}
								<p class="tp-help text-[#fbbf24]">{LOADER_LABEL[loader]} não tem versão para {gameVersion}.</p>
							{/if}
						{/if}
					</div>
				</div>

				<div>
					<div class="flex items-baseline justify-between">
						<label class="tp-label" for="ram">Memória RAM Dedicada</label>
						<span class="font-mc mc-shadow-sm text-[12px] text-[#bef264]">{(memory / 1024).toFixed(1)} GB</span>
					</div>
					<input id="ram" type="range" class="tp-range" min="1024" max={maxRam} step="512" bind:value={memory} />
					<p class="tp-help">Seu computador tem {(app.system.totalMemoryMb / 1024).toFixed(0)} GB. Vanilla roda bem com 2–3 GB; modpacks grandes, 6–8 GB.</p>
				</div>

				<div class="pt-2 flex justify-end">
					<PixelButton variant="gold" icon={Puzzle} onclick={() => (activeModalTab = 'mods')}>
						Avançar para escolha de mods →
					</PixelButton>
				</div>
			</div>
		{:else}
			<!-- Aba de seleção de mods inline -->
			<div class="grid gap-3">
				<p class="tp-help !mt-0">
					Selecione os mods que você deseja incluir diretamente na criação de <b>{name || 'sua instância'}</b> ({LOADER_LABEL[loader]} {gameVersion}). Tudo será baixado e configurado automaticamente!
				</p>

				<ContentPickerInline
					bind:kind={contentTabKind}
					allowedKinds={loader === 'vanilla' ? ['resourcepack', 'shader'] : ['mod', 'shader', 'resourcepack']}
					loaders={loadersFor(contentTabKind, loader)}
					{gameVersion}
					mode="select"
					bind:selected={selectedItems}
					compact
				/>
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
			{#if selectedItems.length > 0}
				Criar instância (+{selectedItems.length} {selectedItems.length === 1 ? 'mod' : 'mods'})
			{:else}
				Criar instância
			{/if}
		</PixelButton>
	{/snippet}
</Modal>

<style>
	.icon-pick {
		padding: 3px;
		border: 0;
		background: transparent;
		cursor: pointer;
		display: grid;
		place-items: center;
		transition: transform 0.1s;
	}
	.icon-pick:hover {
		transform: scale(1.1);
	}
	.icon-pick.on {
		background: #10b981;
		box-shadow: 0 0 12px rgba(16, 185, 129, 0.6);
	}
</style>