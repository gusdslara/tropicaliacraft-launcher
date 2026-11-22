<!-- Componente reutilizável para buscar, listar e selecionar/instalar Mods, Plugins, Texturas e Shaders na mesma tela, sem trocar de página. -->
<script lang="ts">
    import { tr } from '$lib/ui-text';
	import PixelButton from './PixelButton.svelte';
	import Badge from './Badge.svelte';
	import TabSelector from './TabSelector.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import { call, isTauri } from '$lib/platform';
	import {
		CATEGORIES,
		applyInstallPlan,
		loadersFor,
		pickBest,
		planInstall,
		primaryFile,
		projectVersions,
		search,
		type SearchHit
	} from '$lib/services/modrinth';
	import {
				getHorizonRegistry,
		searchHorizonMods,
		installHorizonMod,
		supportedHorizonNativeMods,
		HORIZON_CATEGORIES,
		OFFICIAL_HORIZON_MODS,
		type HorizonModProject
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
		resourcepack: { label: tr("Texturas"), icon: Image },
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
		compact = false,
		horizon = false
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
		/** Perfil Rust (Horizon): o catálogo vem do registro oficial, com a mesma UI do Modrinth. */
		horizon?: boolean;
	} = $props();

	let source = $state<'modrinth' | 'curseforge'>('modrinth');
	$effect(() => { if (kind !== 'mod') source = 'modrinth'; });
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

		const isHz = $derived(horizon || loaders.includes('horizon-rust'));
	const categories = $derived(
		isHz
			? kind === 'mod'
				? HORIZON_CATEGORIES.filter((c) => c.id !== 'all' && c.id !== 'shader').map((c) => ({ id: c.id, label: tr(c.label) }))
				: []
			: source === 'curseforge'
				? []
				: CATEGORIES[kind] ?? []
	);

	const PAGE = 20;
	let total = $state(0);
	let loadingMore = $state(false);
	let sentinel = $state<HTMLElement | null>(null);
	let hzAll: SearchHit[] = [];
	const hzProjects = new Map<string, HorizonModProject>();
	const hzCategory = new Map(OFFICIAL_HORIZON_MODS.map((m) => [m.id, m.category]));
	let nativeIds = $state(new Set<string>());
	const hasMore = $derived(hits.length < total);

	$effect(() => {
		if (!isHz) return;
		supportedHorizonNativeMods({ id: target?.owner?.id ?? 'new-instance' })
			.then((ids) => (nativeIds = ids))
			.catch(() => {});
	});

	/** .hnmod só roda num motor compilado com o mod (Android embute alguns). */
	function unavailable(hit: SearchHit): boolean {
		if (!isHz) return false;
		const f = hzProjects.get(hit.project_id)?.versions?.[0]?.file?.name ?? '';
		return f.endsWith('.hnmod') && !nativeIds.has(hit.project_id);
	}


	let searchSeq = 0;
	let debounceTimer: ReturnType<typeof setTimeout>;

	async function runSearch() {
		const currentSeq = ++searchSeq;
		loading = true;
		error = '';

		if (isHz) {
			try {
				const wanted = kind === 'shader' ? ['shader'] : kind === 'resourcepack' ? ['resourcepack'] : ['mod', 'native-mod'];
				const list = (await searchHorizonMods(query.trim())).filter(
					(m) => wanted.includes(m.kind) && (!selectedCategory || hzCategory.get(m.id) === selectedCategory)
				);
				if (currentSeq !== searchSeq) return;
				hzProjects.clear();
				for (const m of list) hzProjects.set(m.id, m);
				hzAll = list.map((m) => ({
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
				total = hzAll.length;
				hits = hzAll.slice(0, PAGE);
			} catch (e) {
				if (currentSeq === searchSeq) error = errorMessage(e);
			} finally {
				if (currentSeq === searchSeq) loading = false;
			}
			return;
		}

		try {
			const res = await search({
				source: kind === 'mod' ? source : 'modrinth',
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
			total = res.total_hits ?? res.hits.length;
		} catch (e) {
			if (currentSeq === searchSeq) error = errorMessage(e);
		} finally {
			if (currentSeq === searchSeq) loading = false;
		}
	}

		async function loadMore() {
		if (loading || loadingMore || !hasMore) return;
		if (isHz) {
			hits = hzAll.slice(0, hits.length + PAGE);
			return;
		}
		const seq = searchSeq;
		loadingMore = true;
		try {
			const res = await search({
				source: kind === 'mod' ? source : 'modrinth',
				query: query.trim(),
				kind,
				loaders: effectiveLoaders,
				gameVersion: gameVersion.trim() || undefined,
				categories: selectedCategory ? [selectedCategory] : [],
				index: 'downloads',
				offset: hits.length,
				limit: compact ? 12 : 20
			});
			if (seq !== searchSeq) return;
			const seen = new Set(hits.map((h) => h.project_id));
			const fresh = res.hits.filter((h) => !seen.has(h.project_id));
			hits = [...hits, ...fresh];
			// página sem novidades: fim real da lista (evita laço infinito)
			total = fresh.length ? (res.total_hits ?? total) : hits.length;
		} catch (e) {
			if (seq === searchSeq) error = errorMessage(e);
		} finally {
			loadingMore = false;
		}
	}

	// Rolagem infinita: quando o fim da lista aparece, carrega a próxima página.
	$effect(() => {
		const el = sentinel;
		if (!el || typeof IntersectionObserver === 'undefined') return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void loadMore();
			},
			{ rootMargin: '300px 0px' }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	$effect(() => {
		void kind;
		void source;
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
		if (isHz) {
			const f = hzProjects.get(hit.project_id)?.versions?.[0]?.file?.name;
			return !!f && !!target.owner.content[f];
		}
		return Object.values(target.owner.content).some(
			(c) => !c.filename.endsWith('.disabled') && !!c.url && (c.projectId === hit.project_id || c.title.toLowerCase() === hit.title.toLowerCase())
		);
	}

	async function directInstall(hit: SearchHit) {
        if (!target || installingId) return;
        const owner = target.owner;
        try {
            await app.installContent(owner.id, () => directInstallCore(hit));
            await app.saveInstances();
            await app.saveServers();
        } catch (e) { toasts.err(e); }
    }

    async function directInstallCore(hit: SearchHit) {
		if (!target) return;

				if (isHz) {
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

		if (kind === 'modpack' && target.ownerKind === 'instance') {
			installingId = hit.project_id;
			try {
				let versions = await projectVersions(hit.project_id, effectiveLoaders, gameVersion.trim() || undefined);
				// Keep the selected Minecraft version and loader constraints.
				const v = pickBest(versions);
				if (!v) throw new Error(`Nenhuma versão encontrada para o modpack "${hit.title}".`);
				if (isTauri) {
					await call('mrpack_install', {
						instanceId: target.owner.id,
						source: primaryFile(v).url
					});
				}
				(target.owner as any).modpack = { projectId: hit.project_id, versionId: v.id, name: hit.title };
				toasts.ok(`Modpack ${hit.title} instalado em ${target.owner.name}!`);
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
			const installed = new Set(Object.values(target.owner.content).filter(x => !x.filename.endsWith('.disabled')).map((x) => x.projectId).filter(Boolean) as string[]);
			const { plan } = await planInstall(
				{ id: hit.project_id, title: hit.title, iconUrl: hit.icon_url },
				{ kind, loaders: effectiveLoaders, gameVersion: gameVersion.trim(), installed }
			);

			await applyInstallPlan(plan, kind, { ...target, loaders: effectiveLoaders, gameVersion: gameVersion.trim() });

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
    {#if kind === 'mod' && !isHz}
        <TabSelector tabs={[{ id: 'modrinth', label: 'Modrinth' }, { id: 'curseforge', label: 'CurseForge' }]} bind:value={source} size="sm" />
    {/if}
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
				placeholder={isHz
					? `Buscar ${KIND_LABELS[kind]?.label.toLowerCase()} do Horizon Rust...`
					: `Buscar ${KIND_LABELS[kind]?.label.toLowerCase()} (ex: Sodium, Iris, Create, LuckPerms)...`}
			/>
			{#if query}
				<button class="clear-btn" onclick={() => (query = '')} aria-label={tr("Limpar busca")}>
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
				{tr("Todos")}
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
					{@const installed = isAlreadyInstalled(hit) && !unavailable(hit)}
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
																{#if unavailable(hit)}
									<span title="Este mod é código Rust que precisa ser compilado dentro do motor, e ainda não está incluído no motor do Tropicalia."><Badge tone="gold" pixel>Não incluído no motor</Badge></span>
								{:else if installed}
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
										disabled={unavailable(hit)}
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
									{:else if unavailable(hit)}
										<Badge tone="gold">Indisponível</Badge>
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
				{#if hasMore}
					<div bind:this={sentinel} class="more-row" aria-live="polite">
						<div class="spinner small"></div>
						<span class="tp-muted text-[11.5px]">Carregando mais…</span>
					</div>
				{:else if hits.length > PAGE}
					<p class="more-row tp-muted text-[11.5px]">Fim da lista · {hits.length} itens</p>
				{/if}
			{/if}
		</div>
	</div>


<style>
	.content-picker {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
	}
		.more-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 14px 0 4px;
	}
	.spinner.small {
		width: 14px;
		height: 14px;
	}
	.select-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.content-picker > * {
		min-width: 0;
		max-width: 100%;
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
		min-width: 0;
		overflow-x: hidden;
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
		grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
		gap: 8px;
	}

	.item-card {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) auto;
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
			grid-template-columns: minmax(0, 1fr);
		}
		.item-card {
			min-width: 0;
			grid-template-columns: 36px minmax(0, 1fr) auto;
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