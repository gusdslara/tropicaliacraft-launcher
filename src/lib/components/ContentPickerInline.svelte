<!-- Componente reutilizável para buscar, listar e selecionar/instalar Mods, Plugins, Texturas e Shaders na mesma tela, sem trocar de página. -->
<script lang="ts">
	import PixelButton from './PixelButton.svelte';
	import Badge from './Badge.svelte';
	import TabSelector from './TabSelector.svelte';
	import { toasts } from '$lib/state.svelte';
	import { call, isTauri } from '$lib/platform';
	import {
		CATEGORIES,
		loadersFor,
		planInstall,
		search,
		toInstalled,
		type SearchHit
	} from '$lib/services/modrinth';
	import {
		getHorizonRegistry,
		searchHorizonMods,
		installHorizonMod
	} from '$lib/services/horizon-mods';
	import type { ContentKind, InstalledContent, ModLoader } from '$lib/types';
	import { errorMessage, formatCount } from '$lib/util/format';
	import {
		Box,
		Check,
		Download,
		Image,
		Layers,
		Package,
		Plus,
		Puzzle,
		RotateCw,
		Search,
		Sparkles,
		Sun,
		Trash2,
		X
	} from 'lucide-svelte';

	const KIND_LABELS: Record<ContentKind, { label: string; icon: any }> = {
		mod: { label: 'Mods', icon: Puzzle },
		plugin: { label: 'Plugins', icon: Package },
		resourcepack: { label: 'Texturas', icon: Image },
		shader: { label: 'Shaders', icon: Sun },
		datapack: { label: 'Data packs', icon: Box },
		modpack: { label: 'Modpacks', icon: Layers }
	};

	let {
		kind = $bindable<ContentKind>('mod'),
		allowedKinds = undefined,
		loaders = [],
		gameVersion = '',
		mode = 'select',
		selected = $bindable<SearchHit[]>([]),
		target = undefined,
		oninstalled = undefined,
		title = '',
		compact = false
	}: {
		kind?: ContentKind;
		allowedKinds?: ContentKind[];
		loaders?: string[];
		gameVersion?: string;
		mode?: 'select' | 'install';
		selected?: SearchHit[];
		target?: { ownerKind: 'instance' | 'server'; owner: { id: string; name: string; content: Record<string, InstalledContent> } };
		oninstalled?: (hit: SearchHit) => void;
		title?: string;
		compact?: boolean;
	} = $props();

	let query = $state('');
	let selectedCategory = $state<string>('');
	let hits = $state<SearchHit[]>([]);
	let loading = $state(false);
	let error = $state('');
	let installingId = $state<string | null>(null);

	// Filtros do Modrinth
	const effectiveLoaders = $derived.by(() => {
		if (loaders.length > 0) return loaders;
		if (kind === 'plugin') return loadersFor('plugin', 'vanilla');
		if (kind === 'resourcepack' || kind === 'shader' || kind === 'datapack') return [];
		return ['fabric', 'forge', 'neoforge'];
	});

	const categories = $derived(CATEGORIES[kind] ?? []);

	let searchSeq = 0;
	let debounceTimer: ReturnType<typeof setTimeout>;

	async function runSearch() {
		const currentSeq = ++searchSeq;
		loading = true;
		error = '';

		const isHorizonMods = effectiveLoaders.includes('horizon-rust') && kind === 'mod';
		if (isHorizonMods) {
			try {
				const horizonMods = await searchHorizonMods(query.trim());
				if (currentSeq !== searchSeq) return;
				hits = horizonMods.map((m) => ({
					project_id: m.id,
					slug: m.id,
					title: m.name,
					description: m.summary,
					icon_url: m.icon ?? null,
					author: m.authors.join(', '),
					downloads: m.downloads,
					follows: 0,
					categories: ['Rust', 'Horizon 26.3'],
					display_categories: ['Rust', 'Horizon 26.3'],
					versions: m.versions.map((v) => v.version),
					project_type: 'mod',
					client_side: 'required',
					server_side: 'optional',
					date_modified: m.versions[0]?.published ?? ''
				}));
			} catch (e) {
				if (currentSeq === searchSeq) error = errorMessage(e);
			} finally {
				if (currentSeq === searchSeq) loading = false;
			}
			return;
		}

		try {
			const res = await search({
				query: query.trim(),
				kind,
				loaders: effectiveLoaders,
				gameVersion: gameVersion.trim() || undefined,
				categories: selectedCategory ? [selectedCategory] : [],
				index: 'downloads',
				offset: 0,
				limit: compact ? 12 : 20
			});
			if (currentSeq !== searchSeq) return;
			hits = res.hits;
		} catch (e) {
			if (currentSeq === searchSeq) error = errorMessage(e);
		} finally {
			if (currentSeq === searchSeq) loading = false;
		}
	}

	$effect(() => {
		void kind;
		void query;
		void selectedCategory;
		void effectiveLoaders.join(',');
		void gameVersion;

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			runSearch();
		}, query ? 280 : 0);
	});

	function isSelected(hit: SearchHit) {
		return selected.some((s) => s.project_id === hit.project_id);
	}

	function toggleSelect(hit: SearchHit) {
		if (isSelected(hit)) {
			selected = selected.filter((s) => s.project_id !== hit.project_id);
		} else {
			selected = [...selected, hit];
		}
	}

	function isAlreadyInstalled(hit: SearchHit): boolean {
		if (!target?.owner?.content) return false;
		return Object.values(target.owner.content).some(
			(c) => c.projectId === hit.project_id || c.title.toLowerCase() === hit.title.toLowerCase()
		);
	}

	async function directInstall(hit: SearchHit) {
		if (!target) return;

		const isHorizonMods = effectiveLoaders.includes('horizon-rust') && kind === 'mod';
		if (isHorizonMods) {
			installingId = hit.project_id;
			try {
				const registry = await getHorizonRegistry();
				const mod = registry.projects.find((p) => p.id === hit.project_id);
				if (!mod) throw new Error('Mod Horizon não encontrado no registro oficial.');
				await installHorizonMod(target.owner, mod);
				toasts.ok(`${mod.name} instalado com sucesso em ${target.owner.name}!`);
				oninstalled?.(hit);
			} catch (e) {
				toasts.err(e);
			} finally {
				installingId = null;
			}
			return;
		}

		installingId = hit.project_id;
		try {
			const installed = new Set(Object.values(target.owner.content).map((x) => x.projectId).filter(Boolean) as string[]);
			const { plan } = await planInstall(
				{ id: hit.project_id, title: hit.title, iconUrl: hit.icon_url },
				{ kind, loaders: effectiveLoaders, gameVersion: gameVersion.trim(), installed }
			);

			if (isTauri) {
				await call('content_install', {
					ownerKind: target.ownerKind,
					ownerId: target.owner.id,
					kind,
					files: plan.map((item) => ({
						url: item.file.url,
						filename: item.file.filename,
						sha1: item.file.hashes.sha1,
						size: item.file.size
					}))
				});
			}

			for (const item of plan) {
				const installedItem = toInstalled(item, kind);
				target.owner.content[installedItem.filename] = installedItem;
			}

			toasts.ok(`${hit.title} instalado com sucesso em ${target.owner.name}!`);
			oninstalled?.(hit);
		} catch (e) {
			toasts.err(e);
		} finally {
			installingId = null;
		}
	}

	const allowedTabs = $derived(
		allowedKinds ? allowedKinds.map((k) => ({ id: k, label: KIND_LABELS[k]?.label ?? k })) : []
	);
</script>

<div class="content-picker" class:compact>
	{#if title || allowedTabs.length > 1}
		<div class="picker-header">
			{#if title}
				<h3 class="font-mc text-[13px] text-white flex items-center gap-2">
					<Sparkles size={14} class="text-[#4ade80]" />
					{title}
				</h3>
			{/if}
			{#if allowedTabs.length > 1}
				<TabSelector tabs={allowedTabs} bind:value={kind as string} size="sm" />
			{/if}
		</div>
	{/if}

	<!-- Barra de busca e filtros rápidos -->
	<div class="search-bar">
		<div class="search-input-wrap">
			<span class="search-icon-box"><Search size={15} /></span>
			<input
				class="tp-input search-input"
				bind:value={query}
				placeholder={effectiveLoaders.includes('horizon-rust') && kind === 'mod'
					? 'Buscar mods oficiais Horizon Rust (.hnmod / .hmod)...'
					: `Buscar ${KIND_LABELS[kind]?.label.toLowerCase()} (ex: Sodium, Iris, Create, LuckPerms)...`}
			/>
			{#if query}
				<button class="clear-btn" onclick={() => (query = '')} aria-label="Limpar busca">
					<X size={14} />
				</button>
			{/if}
		</div>

		<PixelButton size="sm" icon={RotateCw} loading={loading} onclick={runSearch} title="Atualizar catálogo" />
	</div>

	<!-- Pílulas de categorias -->
	{#if categories.length > 0}
		<div class="categories-strip">
			<button
				class="cat-pill"
				class:active={selectedCategory === ''}
				onclick={() => (selectedCategory = '')}
			>
				Todos
			</button>
			{#each categories as cat (cat.id)}
				<button
					class="cat-pill"
					class:active={selectedCategory === cat.id}
					onclick={() => (selectedCategory = selectedCategory === cat.id ? '' : cat.id)}
				>
					{cat.label}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Resumo de itens selecionados (no modo select) -->
	{#if mode === 'select' && selected.length > 0}
		<div class="selected-summary">
			<div class="flex items-center justify-between gap-2">
				<span class="font-mc text-[12px] text-[#86efac] flex items-center gap-1.5">
					<Check size={14} />
					{selected.length} {selected.length === 1 ? 'item selecionado' : 'itens selecionados'}:
				</span>
				<button class="text-[11px] text-[#f87171] hover:underline cursor-pointer" onclick={() => (selected = [])}>
					Limpar todos
				</button>
			</div>
			<div class="selected-chips">
				{#each selected as s (s.project_id)}
					<span class="chip">
						<span class="chip-text truncate">{s.title}</span>
						<button
							class="chip-remove"
							onclick={() => (selected = selected.filter((x) => x.project_id !== s.project_id))}
							aria-label="Remover {s.title}"
						>
							<X size={12} />
						</button>
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Lista de resultados -->
	<div class="results-container">
		{#if loading && hits.length === 0}
			<div class="state-msg">
				<div class="spinner"></div>
				<p class="tp-muted text-[12.5px]">Carregando {KIND_LABELS[kind]?.label.toLowerCase()} compatíveis...</p>
			</div>
		{:else if error}
			<div class="state-msg error">
				<p class="text-[#f87171] text-[12.5px]">{error}</p>
				<PixelButton size="sm" onclick={runSearch}>Tentar novamente</PixelButton>
			</div>
		{:else if hits.length === 0}
			<div class="state-msg">
				<p class="tp-muted text-[13px]">Nenhum {KIND_LABELS[kind]?.label.slice(0, -1).toLowerCase()} encontrado com esse filtro.</p>
				{#if query || selectedCategory}
					<button class="tp-muted text-[12px] underline mt-1" onclick={() => { query = ''; selectedCategory = ''; }}>
						Limpar filtros de busca
					</button>
				{/if}
			</div>
		{:else}
			<div class="cards-grid">
				{#each hits as hit (hit.project_id)}
					{@const sel = isSelected(hit)}
					{@const installed = isAlreadyInstalled(hit)}
					{@const busy = installingId === hit.project_id}
					<div class="item-card" class:selected={sel} class:installed>
						<div class="card-left">
							{#if hit.icon_url}
								<img src={hit.icon_url} alt="" class="item-icon" loading="lazy" />
							{:else}
								<div class="item-icon fallback">
									<Package size={22} class="text-[#3b5144]" />
								</div>
							{/if}
						</div>

						<div class="card-content">
							<div class="flex items-center gap-1.5 flex-wrap">
								<h4 class="item-title truncate" title={hit.title}>{hit.title}</h4>
								{#if installed}
									<Badge tone="green" pixel>Instalado</Badge>
								{:else if sel}
									<Badge tone="gold" pixel>Selecionado</Badge>
								{/if}
							</div>
							<p class="item-author tp-muted text-[11px] truncate">por {hit.author} · 📥 {formatCount(hit.downloads)}</p>
							<p class="item-desc" title={hit.description}>{hit.description}</p>
						</div>

						<div class="card-action">
							{#if mode === 'select'}
								<button
									class="select-btn"
									class:on={sel}
									onclick={() => toggleSelect(hit)}
									aria-pressed={sel}
								>
									{#if sel}
										<Check size={14} />
										<span>Selecionado</span>
									{:else}
										<Plus size={14} />
										<span>Selecionar</span>
									{/if}
								</button>
							{:else}
								{#if installed}
									<Badge tone="green">Pronto</Badge>
								{:else}
									<PixelButton
										size="sm"
										variant="emerald"
										icon={Download}
										loading={busy}
										onclick={() => directInstall(hit)}
									>
										Instalar
									</PixelButton>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.content-picker {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
	}

	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px;
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.search-input-wrap {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	.search-icon-box {
		position: absolute;
		left: 10px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--tp-muted);
		pointer-events: none;
		display: flex;
		align-items: center;
	}

	.search-input {
		padding-left: 34px !important;
		padding-right: 32px !important;
	}

	.clear-btn {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		border: 0;
		background: transparent;
		color: var(--tp-muted);
		cursor: pointer;
		display: grid;
		place-items: center;
		padding: 4px;
	}
	.clear-btn:hover {
		color: #fff;
	}

	.categories-strip {
		display: flex;
		align-items: center;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 4px;
		scrollbar-width: thin;
	}

	.cat-pill {
		display: inline-flex;
		align-items: center;
		height: 26px;
		padding: 0 10px;
		font-size: 11.5px;
		white-space: nowrap;
		color: #a9bbb0;
		background: var(--tp-panel-2);
		border: 1px solid var(--tp-border);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.cat-pill:hover {
		color: #fff;
		border-color: var(--tp-emerald);
	}
	.cat-pill.active {
		color: #fff;
		background: #143524;
		border-color: #10b981;
		box-shadow: inset 0 0 8px rgba(16, 185, 129, 0.3);
	}

	.selected-summary {
		padding: 10px 12px;
		background: rgba(16, 185, 129, 0.08);
		border: 1px solid rgba(16, 185, 129, 0.3);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.selected-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		max-height: 80px;
		overflow-y: auto;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #0f271a;
		border: 1px solid #10b981;
		color: #bef264;
		padding: 3px 8px;
		font-size: 11px;
	}

	.chip-text {
		max-width: 140px;
	}

	.chip-remove {
		border: 0;
		background: transparent;
		color: #93a59a;
		cursor: pointer;
		padding: 0;
		display: grid;
		place-items: center;
	}
	.chip-remove:hover {
		color: #f87171;
	}

	.results-container {
		min-height: 160px;
		max-height: 380px;
		overflow-y: auto;
		padding-right: 4px;
	}
	.compact .results-container {
		max-height: 280px;
	}

	.cards-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 8px;
	}

	.item-card {
		display: grid;
		grid-template-columns: 44px 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		background: var(--tp-panel-2);
		border: 1px solid var(--tp-border);
		box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.04), 0 1px 2px rgba(0, 0, 0, 0.3);
		transition: all 0.12s ease;
	}

	.item-card:hover {
		border-color: #3b5144;
		background: #202c26;
	}

	.item-card.selected {
		border-color: #10b981;
		background: #10291c;
		box-shadow: inset 0 0 10px rgba(16, 185, 129, 0.2), 0 0 0 1px #10b981;
	}

	.item-card.installed {
		border-color: #244837;
		background: #112018;
	}

	.item-icon {
		width: 44px;
		height: 44px;
		object-fit: cover;
		background: #080c0a;
		border: 1px solid #000;
	}

	.item-icon.fallback {
		display: grid;
		place-items: center;
	}

	.card-content {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.item-title {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: #fff;
	}

	.item-desc {
		margin: 0;
		font-size: 11px;
		color: var(--tp-muted);
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.35;
	}

	.select-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		height: 32px;
		padding: 0 10px;
		font-family: var(--font-minecraft);
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border: 0;
		cursor: pointer;
		color: #e6efe9;
		background: #27362f;
		box-shadow: inset 1px 1px 0 #3e5247, inset -1px -1px 0 #141c18, 0 0 0 1px #000;
		transition: all 0.1s ease;
		white-space: nowrap;
	}

	.select-btn:hover {
		filter: brightness(1.2);
		color: #fff;
	}

	.select-btn.on {
		background: #10b981;
		color: #052e16;
		font-weight: bold;
		box-shadow: inset 1px 1px 0 #86efac, inset -1px -1px 0 #064e3b, 0 0 0 1px #000;
	}

	.state-msg {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 30px 10px;
		text-align: center;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 3px solid rgba(16, 185, 129, 0.2);
		border-top-color: #10b981;
		border-radius: 50%;
		animation: tp-spin 0.8s linear infinite;
	}

	@media (max-width: 640px) {
		.cards-grid {
			grid-template-columns: 1fr;
		}
		.item-card {
			grid-template-columns: 36px 1fr auto;
			gap: 8px;
			padding: 6px 8px;
		}
		.item-icon {
			width: 36px;
			height: 36px;
		}
		.item-desc {
			line-clamp: 1;
			-webkit-line-clamp: 1;
		}
	}
</style>