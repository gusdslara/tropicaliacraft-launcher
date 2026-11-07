<!-- Central de conteúdo Modrinth: mods, texturas, shaders, data packs, modpacks e plugins. -->
<script lang="ts">
	import TropicaliaCard from '$lib/components/TropicaliaCard.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import TabSelector from '$lib/components/TabSelector.svelte';
	import InstallModal from '$lib/components/InstallModal.svelte';
	import { app } from '$lib/state.svelte';
	import { CATEGORIES, loadersFor, search, type SearchHit, type SortIndex } from '$lib/services/modrinth';
	import { searchHorizonMods } from '$lib/services/horizon-mods';
	import { openUrl } from '$lib/platform';
	import type { ContentKind, ModLoader } from '$lib/types';
	import { errorMessage, formatCount, LOADER_LABEL, timeAgo } from '$lib/util/format';
	import { page } from '$app/state';
	import { Box, Download, ExternalLink, Heart, Image, Layers, Package, Puzzle, Search, Sun } from 'lucide-svelte';

	const KINDS = [
		{ id: 'mod', label: 'Mods', icon: Puzzle },
		{ id: 'resourcepack', label: 'Texturas', icon: Image },
		{ id: 'shader', label: 'Shaders', icon: Sun },
		{ id: 'datapack', label: 'Data packs', icon: Box },
		{ id: 'modpack', label: 'Modpacks', icon: Layers },
		{ id: 'plugin', label: 'Plugins', icon: Package }
	];

	let kind = $state<ContentKind>((page.url.searchParams.get('tipo') as ContentKind) || 'mod');
	let query = $state('');
	let sort = $state<SortIndex>('relevance');
	let categories = $state<string[]>([]);
	let targetId = $state(page.url.searchParams.get('para') ?? app.lastInstance?.id ?? '');
	let onlyCompatible = $state(true);
	let manualLoader = $state<ModLoader | ''>('');
	let manualVersion = $state('');

	let hits = $state<SearchHit[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let error = $state('');

	const target = $derived(app.instances.find((i) => i.id === targetId));
	const filterLoaders = $derived.by(() => {
		if (kind === 'plugin') return loadersFor('plugin', 'vanilla');
		if (kind === 'resourcepack' || kind === 'shader' || kind === 'datapack') return [];
		if (onlyCompatible && target) return loadersFor(kind, target.loader);
		return manualLoader ? [manualLoader] : [];
	});
	const filterVersion = $derived(onlyCompatible && target && kind !== 'plugin' ? target.gameVersion : manualVersion.trim());

	let timer: ReturnType<typeof setTimeout>;
	let seq = 0;
	async function run(append = false) {
		const my = ++seq;
		loading = true;
		error = '';

		if (filterLoaders.includes('horizon-rust') && kind === 'mod') {
			try {
				const horizonMods = await searchHorizonMods(query);
				if (my !== seq) return;
				const mapped: SearchHit[] = horizonMods.map((m) => ({
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
				hits = mapped;
				total = mapped.length;
			} catch (e) {
				if (my === seq) error = errorMessage(e);
			} finally {
				if (my === seq) loading = false;
			}
			return;
		}

		try {
			const r = await search({
				query,
				kind,
				loaders: filterLoaders,
				gameVersion: filterVersion || undefined,
				categories,
				index: sort,
				offset: append ? hits.length : 0,
				limit: 24
			});
			if (my !== seq) return;
			hits = append ? [...hits, ...r.hits] : r.hits;
			total = r.total_hits;
		} catch (e) {
			if (my === seq) error = errorMessage(e);
		} finally {
			if (my === seq) loading = false;
		}
	}

	$effect(() => {
		// dependências da busca
		void [query, kind, sort, categories.length, filterLoaders.join(), filterVersion];
		clearTimeout(timer);
		timer = setTimeout(() => run(false), query ? 300 : 0);
	});

	function setKind(k: string) {
		kind = k as ContentKind;
		categories = [];
	}

	function toggleCategory(id: string) {
		categories = categories.includes(id) ? categories.filter((c) => c !== id) : [...categories, id];
	}

	let installOpen = $state(false);
	let installing = $state<SearchHit | null>(null);
	let installTarget = $state('');
	function openInstall(h: SearchHit) {
		installing = h;
		installTarget = target && kind !== 'plugin' ? `i:${target.id}` : '';
		installOpen = true;
	}

	const installedIds = $derived(new Set(Object.values(target?.content ?? {}).map((c) => c.projectId)));
</script>

<div class="mx-auto flex max-w-[1320px] flex-col gap-4 sm:gap-5">
	<div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
		<div class="overflow-x-auto pb-1 scrollbar-none">
			<TabSelector tabs={KINDS} value={kind} onchange={setKind} />
		</div>
		<span class="tp-muted text-xs text-right sm:text-left">Conteúdo de <button class="underline" onclick={() => openUrl('https://modrinth.com')}>modrinth.com</button></span>
	</div>

	<!-- Barra de busca no topo para mobile e desktop -->
	<div class="search tp-slot">
		<Search size={18} class="shrink-0" />
		<input bind:value={query} placeholder="Buscar {KINDS.find((k) => k.id === kind)?.label.toLowerCase()}… (Sodium, Create, Complementary…)" />
		<span class="tp-muted shrink-0 text-xs">{formatCount(total)} resultados</span>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5 lg:gap-6">
		<aside class="flex flex-col gap-4">
			<details class="lg:contents group" open>
				<summary class="lg:hidden flex items-center justify-between p-3 tp-slot cursor-pointer text-white font-mc text-[12px]">
					<span class="flex items-center gap-2">
						Filtros e Categorias
						{#if categories.length}
							<Badge tone="green" pixel>{categories.length}</Badge>
						{/if}
					</span>
					<span class="text-xs tp-muted group-open:rotate-180 transition-transform">▼</span>
				</summary>

				<div class="flex flex-col gap-4 mt-3 lg:mt-0">
					<TropicaliaCard title="Filtros" size="sm">
						<div class="flex flex-col gap-4">
							{#if kind !== 'plugin' && kind !== 'modpack'}
								<div>
									<label class="tp-label" for="tgt">Para a instância</label>
									<select id="tgt" class="tp-select" bind:value={targetId}>
										<option value="">— nenhuma —</option>
										{#each app.instances as i (i.id)}<option value={i.id}>{i.name}</option>{/each}
									</select>
									{#if target}
										<label class="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-[#c7d5cc]">
											<input type="checkbox" bind:checked={onlyCompatible} class="accent-emerald-500" />
											Só compatíveis ({LOADER_LABEL[target.loader]} {target.gameVersion})
										</label>
									{/if}
								</div>
							{/if}
							{#if !(onlyCompatible && target) || kind === 'modpack' || kind === 'plugin'}
								{#if kind === 'mod' || kind === 'modpack'}
									<div>
										<label class="tp-label" for="ml">Modloader</label>
										<select id="ml" class="tp-select" bind:value={manualLoader}>
											<option value="">Todos</option>
											{#each ['fabric', 'quilt', 'forge', 'neoforge'] as l (l)}<option value={l}>{LOADER_LABEL[l]}</option>{/each}
										</select>
									</div>
								{/if}
								<div>
									<label class="tp-label" for="mv">Versão do jogo</label>
									<input id="mv" class="tp-input font-mono" placeholder="ex.: 1.21.4" bind:value={manualVersion} />
								</div>
							{/if}
							<div>
								<label class="tp-label" for="sort">Ordenar por</label>
								<select id="sort" class="tp-select" bind:value={sort}>
									<option value="relevance">Relevância</option>
									<option value="downloads">Downloads</option>
									<option value="follows">Seguidores</option>
									<option value="newest">Mais novos</option>
									<option value="updated">Atualizados</option>
								</select>
							</div>
						</div>
					</TropicaliaCard>

					<TropicaliaCard title="Categorias" size="sm">
						<div class="flex flex-wrap gap-1.5">
							{#each CATEGORIES[kind] ?? [] as c (c.id)}
								<button class="chip" class:on={categories.includes(c.id)} onclick={() => toggleCategory(c.id)}>{c.label}</button>
							{/each}
						</div>
					</TropicaliaCard>
				</div>
			</details>
		</aside>

		<div class="flex min-w-0 flex-col gap-4">
			{#if error}
				<TropicaliaCard plain><p class="text-[13px] text-[#fca5a5] selectable">Não foi possível falar com o Modrinth: {error}</p></TropicaliaCard>
			{/if}

			<div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
				{#each hits as h (h.project_id)}
					<article class="card flex flex-col sm:flex-row gap-3.5">
						<div class="flex items-start gap-3 min-w-0 flex-1">
							{#if h.icon_url}<img src={h.icon_url} alt="" class="icon" loading="lazy" />{:else}<div class="icon grid place-items-center"><Package size={28} class="text-[#3b5144]" /></div>{/if}
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline gap-2">
									<h3 class="truncate text-[14px] font-bold text-white">{h.title}</h3>
									<span class="tp-muted shrink-0 truncate text-[11.5px]">por {h.author}</span>
								</div>
								<p class="desc">{h.description}</p>
								<div class="mt-2 flex flex-wrap items-center gap-1.5">
									<Badge><Download size={11} /> {formatCount(h.downloads)}</Badge>
									<Badge><Heart size={11} /> {formatCount(h.follows)}</Badge>
									{#each (h.display_categories ?? h.categories).slice(0, 3) as c (c)}<Badge tone="muted">{LOADER_LABEL[c] ?? c}</Badge>{/each}
									<span class="tp-muted ml-auto text-[11px]">{timeAgo(h.date_modified)}</span>
								</div>
							</div>
						</div>
						<div class="flex sm:flex-col justify-end sm:justify-start gap-2 shrink-0 pt-2 sm:pt-0 border-t border-[#1d2a23] sm:border-0">
							{#if installedIds.has(h.project_id)}
								<PixelButton size="sm" class="flex-1 sm:flex-none justify-center" onclick={() => openInstall(h)}>Atualizar</PixelButton>
							{:else}
								<PixelButton size="sm" variant="emerald" icon={Download} class="flex-1 sm:flex-none justify-center" onclick={() => openInstall(h)}>Instalar</PixelButton>
							{/if}
							<PixelButton size="sm" variant="ghost" icon={ExternalLink} title="Ver no Modrinth" onclick={() => openUrl(`https://modrinth.com/${h.project_type}/${h.slug}`)} />
						</div>
					</article>
				{:else}
					{#if !loading && !error}<p class="tp-muted col-span-full py-12 text-center text-[13px]">Nada encontrado com esses filtros.</p>{/if}
				{/each}
			</div>

			{#if loading}
				<p class="tp-muted text-center text-[13px]">Carregando…</p>
			{:else if hits.length < total}
				<div class="flex justify-center"><PixelButton onclick={() => run(true)}>Carregar mais</PixelButton></div>
			{/if}
		</div>
	</div>
</div>

<InstallModal bind:open={installOpen} project={installing} {kind} bind:target={installTarget} />

<style>
	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 46px;
		padding: 0 14px;
		color: var(--tp-muted);
	}
	.search input {
		flex: 1;
		height: 100%;
		border: 0;
		outline: none;
		background: transparent;
		color: #fff;
		font-size: 14px;
	}
	.card {
		display: flex;
		gap: 14px;
		padding: 14px;
		background: var(--tp-panel);
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #000;
	}
	.card:hover {
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #10b981;
	}
	.icon {
		width: 64px;
		height: 64px;
		flex: none;
		background: #0b100e;
		box-shadow: 0 0 0 2px #000;
		object-fit: cover;
	}
	.desc {
		margin-top: 4px;
		font-size: 12.5px;
		line-height: 1.4;
		color: #b6c6bc;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.chip {
		height: 26px;
		padding: 0 9px;
		border: 0;
		cursor: pointer;
		font-size: 12px;
		color: #c7d5cc;
		background: var(--tp-panel-2);
		box-shadow: inset 0 0 0 1px #2f4237;
	}
	.chip:hover {
		color: #fff;
	}
	.chip.on {
		color: #052e16;
		font-weight: 700;
		background: #4ade80;
		box-shadow: inset 0 0 0 1px #86efac;
	}
</style>
