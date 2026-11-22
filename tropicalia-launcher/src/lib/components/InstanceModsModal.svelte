<!-- Modal de Gerenciamento de Mods e Conteúdo (Suporta .hnmod/.hmod Horizon Rust e .jar Java) -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import PixelButton from './PixelButton.svelte';
	import TabSelector from './TabSelector.svelte';
	import Badge from './Badge.svelte';
	import Toggle from './Toggle.svelte';
	import ContentPickerInline from './ContentPickerInline.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import { call, isTauri, openFolder } from '$lib/platform';
	import { loadersFor } from '$lib/services/modrinth';
	import {
		DEFAULT_ENABLED_MOD_IDS,
		HORIZON_CATEGORIES,
		OFFICIAL_HORIZON_MODS,
		fetchHorizonModsState,
		seedHorizonInstanceMods,
		setHorizonModState,
		setHorizonModsBulk,
		type HorizonModCategory,
		type OfficialHorizonMod
	} from '$lib/services/horizon-mods';
	import type { ContentKind, Instance, InstalledContent } from '$lib/types';
	import { formatBytes, LOADER_LABEL } from '$lib/util/format';
	import {
		Check,
		CheckCheck,
		Compass,
		Cpu,
		Eye,
		FolderOpen,
		HardDrive,
		Layers,
		Package,
		Plus,
		Puzzle,
		RefreshCw,
		Sliders,
		Sparkles,
		Trash2,
		Users,
		Wrench,
		X,
		XCircle,
		Zap
	} from 'lucide-svelte';

	let {
		open = $bindable(false),
		instance,
		onchanged
	}: {
		open: boolean;
		instance: Instance | null;
		onchanged?: () => void;
	} = $props();

	// Estrutura unificada de linha para exibição de mods
	type ModRow = {
		id: string;
		filename: string;
		name: string;
		summary?: string;
		description?: string;
		author?: string;
		version?: string;
		size: number;
		enabled: boolean;
		kind: 'mod' | 'native-mod' | 'shader' | 'resourcepack';
		category?: HorizonModCategory;
		iconUrl?: string;
		isOfficial: boolean;
		meta?: InstalledContent;
	};

	let rows = $state<ModRow[]>([]);
	let loadingRows = $state(false);
	let filter = $state('');
	let selectedCategory = $state<HorizonModCategory>('all');
	let statusFilter = $state<'all' | 'enabled' | 'disabled'>('all');
	let addInlineOpen = $state(false);
	let kind = $state<ContentKind>('mod');

	const isHorizon = $derived(
		instance?.loader === 'horizon-rust' ||
		(instance as any)?.loader === 'horizon' ||
		(instance as any)?.engine === 'rust' ||
		(instance as any)?.engine === 'horizon'
	);

	const contentTabs = $derived([
		{ id: 'mod', label: isHorizon ? 'Mods Rust (.hnmod)' : 'Mods (.jar)', disabled: instance?.loader === 'vanilla' },
		{ id: 'resourcepack', label: 'Texturas' },
		{ id: 'shader', label: 'Shaders' },
		{ id: 'datapack', label: 'Data packs' }
	]);

	async function loadRows() {
		if (!instance) return;
		loadingRows = true;

		try {
			if (isHorizon) {
				// 1. Instância Horizon Rust: Carrega estado de horizon-mods.txt
				const statesOnDisk = await fetchHorizonModsState(instance.id);
				const hasDiskStates = Object.keys(statesOnDisk).length > 0;

				// 2. Se a instância ainda não tiver conteúdo populado, semeia os mods recomendados
				if (Object.keys(instance.content).length === 0) {
					seedHorizonInstanceMods(instance);
					app.saveInstances();
				}

				// 3. Lê arquivos físicos locais da pasta horizon-mods/ se existirem
				let localFiles: Array<{ filename: string; enabled: boolean; size: number }> = [];
				if (isTauri) {
					try {
						localFiles = await call<Array<{ filename: string; enabled: boolean; size: number }>>('content_list', {
							ownerKind: 'instance',
							ownerId: instance.id,
							kind: 'mod'
						});
					} catch (e) {
						// Ignora erro de pasta vazia
					}
				}

				// 4. Constrói lista completa a partir dos 77 mods oficiais do Horizon
				const mappedRows: ModRow[] = OFFICIAL_HORIZON_MODS.map((mod) => {
					let enabled: boolean;
					if (hasDiskStates && mod.id in statesOnDisk) {
						enabled = statesOnDisk[mod.id];
					} else if (instance!.content[mod.filename]) {
						enabled = true;
					} else if (instance!.content[`${mod.filename}.disabled`]) {
						enabled = false;
					} else {
						enabled = mod.defaultEnabled;
					}

					return {
						id: mod.id,
						filename: mod.filename,
						name: mod.name,
						summary: mod.summary,
						description: mod.description,
						author: mod.author,
						version: mod.version,
						size: mod.size,
						enabled,
						kind: mod.kind,
						category: mod.category,
						iconUrl: mod.iconUrl,
						isOfficial: true,
						meta: instance!.content[mod.filename] ?? instance!.content[`${mod.filename}.disabled`]
					};
				});

				// 5. Adiciona quaisquer mods locais físicos que não estejam no catálogo oficial
				const officialIds = new Set(OFFICIAL_HORIZON_MODS.map((m) => m.id));
				for (const f of localFiles) {
					const cleanName = f.filename.replace(/\.disabled$/, '');
					const stemId = cleanName.replace(/\.hmod|\.hnmod|\.jar$/g, '').split('-')[0];
					if (!officialIds.has(stemId) && !officialIds.has(cleanName)) {
						mappedRows.push({
							id: stemId,
							filename: f.filename,
							name: stemId,
							summary: 'Mod local instalado manualmente na pasta da instância.',
							size: f.size,
							enabled: f.enabled,
							kind: f.filename.includes('.hnmod') ? 'native-mod' : 'mod',
							category: 'gameplay',
							isOfficial: false,
							meta: instance.content[f.filename]
						});
					}
				}

				rows = mappedRows;
			} else {
				// Instância Java Edition
				if (isTauri) {
					const files = await call<Array<{ filename: string; enabled: boolean; size: number }>>('content_list', {
						ownerKind: 'instance',
						ownerId: instance.id,
						kind
					});

					rows = files.map((f) => {
						const meta = instance!.content[f.filename];
						return {
							id: f.filename,
							filename: f.filename,
							name: meta?.title ?? f.filename,
							summary: undefined,
							version: meta?.versionNumber,
							size: f.size,
							enabled: f.enabled,
							kind: 'mod',
							isOfficial: false,
							meta
						};
					});
				} else {
					rows = Object.values(instance.content)
						.filter((c) => c.kind === kind)
						.map((c) => ({
							id: c.filename,
							filename: c.filename,
							name: c.title,
							summary: undefined,
							size: c.size ?? 0,
							enabled: !c.filename.endsWith('.disabled'),
							kind: 'mod',
							isOfficial: false,
							meta: c
						}));
				}
			}
		} catch (e) {
			toasts.err(e);
		} finally {
			loadingRows = false;
		}
	}

	$effect(() => {
		if (!open || !instance) return;
		void kind;
		loadRows();
	});

	// Filtro combinado de busca, categoria e status
	const visibleRows = $derived(
		rows.filter((r) => {
			if (statusFilter === 'enabled' && !r.enabled) return false;
			if (statusFilter === 'disabled' && r.enabled) return false;
			if (isHorizon && selectedCategory !== 'all' && r.category !== selectedCategory) return false;

			if (!filter) return true;
			const q = filter.toLowerCase().trim();
			return (
				r.name.toLowerCase().includes(q) ||
				r.id.toLowerCase().includes(q) ||
				(r.summary ?? '').toLowerCase().includes(q) ||
				(r.author ?? '').toLowerCase().includes(q)
			);
		})
	);

	const enabledCount = $derived(rows.filter((r) => r.enabled).length);
	const disabledCount = $derived(rows.length - enabledCount);

	async function toggleMod(r: ModRow, enabled: boolean) {
		if (!instance) return;
		const prev = r.enabled;
		r.enabled = enabled;

		try {
			if (isHorizon) {
				// Grava em horizon-mods.txt no Horizon Rust
				await setHorizonModState(instance.id, r.id, enabled);

				// Atualiza o estado da instância
				if (enabled) {
					delete instance.content[`${r.filename}.disabled`];
					instance.content[r.filename] = {
						filename: r.filename,
						kind: r.kind === 'shader' ? 'shader' : 'mod',
						title: r.name,
						projectId: r.id,
						versionId: r.version,
						versionNumber: r.version,
						size: r.size,
						iconUrl: r.iconUrl
					};
				} else {
					delete instance.content[r.filename];
					instance.content[`${r.filename}.disabled`] = {
						filename: `${r.filename}.disabled`,
						kind: r.kind === 'shader' ? 'shader' : 'mod',
						title: r.name,
						projectId: r.id,
						versionId: r.version,
						versionNumber: r.version,
						size: r.size,
						iconUrl: r.iconUrl
					};
				}
				app.saveInstances();
			} else {
				// Java .jar toggle via renomeação
				await call('content_toggle', {
					ownerKind: 'instance',
					ownerId: instance.id,
					kind,
					filename: r.filename,
					enabled
				});
			}
			onchanged?.();
		} catch (e) {
			r.enabled = prev;
			toasts.err(e);
		}
	}

	async function applyBulk(targetIds: Set<string> | 'all' | 'none' | 'defaults') {
		if (!instance) return;
		loadingRows = true;

		try {
			if (isHorizon) {
				const bulkStates: Record<string, boolean> = {};

				for (const r of rows) {
					let shouldEnable = false;
					if (targetIds === 'all') shouldEnable = true;
					else if (targetIds === 'none') shouldEnable = false;
					else if (targetIds === 'defaults') shouldEnable = DEFAULT_ENABLED_MOD_IDS.has(r.id);
					else shouldEnable = targetIds.has(r.id);

					r.enabled = shouldEnable;
					bulkStates[r.id] = shouldEnable;

					if (shouldEnable) {
						delete instance.content[`${r.filename}.disabled`];
						instance.content[r.filename] = {
							filename: r.filename,
							kind: r.kind === 'shader' ? 'shader' : 'mod',
							title: r.name,
							projectId: r.id,
							size: r.size,
							iconUrl: r.iconUrl
						};
					} else {
						delete instance.content[r.filename];
						instance.content[`${r.filename}.disabled`] = {
							filename: `${r.filename}.disabled`,
							kind: r.kind === 'shader' ? 'shader' : 'mod',
							title: r.name,
							projectId: r.id,
							size: r.size,
							iconUrl: r.iconUrl
						};
					}
				}

				await setHorizonModsBulk(instance.id, bulkStates);
				app.saveInstances();
				toasts.ok(
					targetIds === 'defaults'
						? 'Mods padrão recomendados do Horizon ativados!'
						: targetIds === 'all'
							? 'Todos os 77 mods do Horizon foram ativados!'
							: 'Todos os mods foram desativados.'
				);
			} else {
				for (const r of rows) {
					const shouldEnable = targetIds === 'all';
					if (r.enabled !== shouldEnable) {
						await toggleMod(r, shouldEnable);
					}
				}
				toasts.ok(targetIds === 'all' ? 'Todos os mods foram ativados!' : 'Todos os mods foram desativados.');
			}
			onchanged?.();
		} catch (e) {
			toasts.err(e);
		} finally {
			loadingRows = false;
		}
	}

	async function openModsFolder() {
		if (!instance) return;
		try {
			const sub = isHorizon ? 'horizon-mods' : 'mods';
			await openFolder('instance', instance.id, sub);
		} catch (e) {
			toasts.err(e);
		}
	}

	async function removeMod(r: ModRow) {
		if (!instance) return;
		try {
			if (isHorizon) {
				await setHorizonModState(instance.id, r.id, false);
				delete instance.content[r.filename];
				delete instance.content[`${r.filename}.disabled`];
				r.enabled = false;
				app.saveInstances();
				toasts.info(`Mod ${r.name} desativado.`);
			} else {
				await call('content_delete', {
					ownerKind: 'instance',
					ownerId: instance.id,
					kind,
					filename: r.filename
				});
				delete instance.content[r.filename];
				app.saveInstances();
				rows = rows.filter((x) => x !== r);
				toasts.info(`Arquivo ${r.filename} excluído.`);
			}
			onchanged?.();
		} catch (e) {
			toasts.err(e);
		}
	}
</script>

<Modal bind:open title="Gerenciador de Mods & Conteúdo" width={960}>
	{#if instance}
		<div class="flex flex-col gap-4">
			<!-- Header Resumo da Instância -->
			<div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-[#0e1814] border border-[#1b2b22]">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-lg bg-[#14281e] flex items-center justify-center text-[#34d399] border border-[#234432]">
						{#if isHorizon}
							<Cpu size={24} />
						{:else}
							<Package size={24} />
						{/if}
					</div>
					<div>
						<h3 class="font-mc text-[14px] text-white flex items-center gap-2">
							Mods de {instance.name}
							{#if isHorizon}
								<Badge tone="green" pixel>Horizon Rust 26.3</Badge>
							{:else}
								<Badge tone="blue">{LOADER_LABEL[instance.loader]} {instance.gameVersion}</Badge>
							{/if}
						</h3>
						<p class="tp-muted text-[11.5px] mt-0.5">
							{#if isHorizon}
								Catálogo oficial do ecossistema Horizon (77 mods disponíveis) com sincronização em <code>horizon-mods.txt</code>.
							{:else}
								Gerenciador de mods Java (.jar), resourcepacks e shaders.
							{/if}
						</p>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<PixelButton size="sm" variant="ghost" icon={FolderOpen} onclick={openModsFolder}>
						Abrir pasta de mods
					</PixelButton>
				</div>
			</div>

			<!-- Painel de Destaque Horizon Rust com Contadores e Ações em Massa -->
			{#if isHorizon}
				<div class="p-3.5 rounded-lg border border-[#10b981]/30 bg-[#0f241a]/70 flex flex-wrap items-center justify-between gap-3">
					<div class="flex items-center gap-3">
						<Sliders size={20} class="text-[#34d399]" />
						<div>
							<div class="text-[12.5px] text-white font-medium flex items-center gap-2">
								Status: <b class="text-[#bef264]">{enabledCount} mods ativados</b> de {rows.length} disponíveis
							</div>
							<div class="text-[11px] text-[#9ca3af]">
								Ative ou desative qualquer mod instantaneamente. O Horizon carrega as seleções automaticamente no boot.
							</div>
						</div>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<PixelButton size="xs" variant="gold" icon={Sparkles} onclick={() => applyBulk('defaults')}>
							Padrões Horizon
						</PixelButton>
						<PixelButton size="xs" variant="ghost" icon={CheckCheck} onclick={() => applyBulk('all')}>
							Ativar todos
						</PixelButton>
						<PixelButton size="xs" variant="ghost" icon={XCircle} onclick={() => applyBulk('none')}>
							Desativar todos
						</PixelButton>
					</div>
				</div>
			{/if}

			<!-- Barra de Controles: Busca, Categorias e Filtros -->
			<div class="flex flex-col gap-2.5">
				<div class="flex flex-wrap items-center gap-2.5">
					{#if !isHorizon}
						<TabSelector tabs={contentTabs} bind:value={kind as string} size="sm" />
					{/if}

					<!-- Busca por texto -->
					<div class="relative flex-1 min-w-[200px]">
						<input
							class="tp-input !h-9 w-full pr-8"
							placeholder={isHorizon ? 'Buscar entre os 77 mods do Horizon (nome, ID, autor)...' : 'Filtrar por nome ou função...'}
							bind:value={filter}
						/>
						{#if filter}
							<button
								class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-white"
								onclick={() => (filter = '')}
								aria-label="Limpar busca"
							>
								<X size={14} />
							</button>
						{/if}
					</div>

					<!-- Filtro de Status (Todos / Ativados / Desativados) -->
					<div class="flex items-center rounded bg-[#101b15] border border-[#1b2b22] p-0.5 text-[11.5px]">
						<button
							class="px-2.5 py-1 rounded transition-colors cursor-pointer"
							class:bg-[#1a3828]={statusFilter === 'all'}
							class:text-[#bef264]={statusFilter === 'all'}
							class:text-[#9ca3af]={statusFilter !== 'all'}
							onclick={() => (statusFilter = 'all')}
						>
							Todos ({rows.length})
						</button>
						<button
							class="px-2.5 py-1 rounded transition-colors cursor-pointer"
							class:bg-[#1a3828]={statusFilter === 'enabled'}
							class:text-[#34d399]={statusFilter === 'enabled'}
							class:text-[#9ca3af]={statusFilter !== 'enabled'}
							onclick={() => (statusFilter = 'enabled')}
						>
							Ativados ({enabledCount})
						</button>
						<button
							class="px-2.5 py-1 rounded transition-colors cursor-pointer"
							class:bg-[#1a3828]={statusFilter === 'disabled'}
							class:text-[#f87171]={statusFilter === 'disabled'}
							class:text-[#9ca3af]={statusFilter !== 'disabled'}
							onclick={() => (statusFilter = 'disabled')}
						>
							Desativados ({disabledCount})
						</button>
					</div>

					<!-- Atualizar lista -->
					<PixelButton size="sm" icon={RefreshCw} title="Recarregar lista" loading={loadingRows} onclick={loadRows}>
						Atualizar
					</PixelButton>

					<!-- Adicionar Mod externo -->
					<PixelButton
						size="sm"
						variant={addInlineOpen ? 'ghost' : 'emerald'}
						icon={addInlineOpen ? X : Plus}
						onclick={() => (addInlineOpen = !addInlineOpen)}
					>
						{addInlineOpen ? 'Fechar Catálogo' : isHorizon ? 'Adicionar Mod Externo' : 'Adicionar Mods (.jar)'}
					</PixelButton>
				</div>

				<!-- Chips de Categorias para Horizon Rust -->
				{#if isHorizon}
					<div class="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
						{#each HORIZON_CATEGORIES as cat (cat.id)}
							{@const countInCat = cat.id === 'all' ? rows.length : rows.filter((r) => r.category === cat.id).length}
							<button
								class="px-2.5 py-1 rounded-full border transition-all cursor-pointer font-medium flex items-center gap-1"
								class:bg-[#153424]={selectedCategory === cat.id}
								class:border-[#10b981]={selectedCategory === cat.id}
								class:text-[#bef264]={selectedCategory === cat.id}
								class:bg-[#0c1612]={selectedCategory !== cat.id}
								class:border-[#1b2b22]={selectedCategory !== cat.id}
								class:text-[#9ca3af]={selectedCategory !== cat.id}
								class:hover:text-white={selectedCategory !== cat.id}
								onclick={() => (selectedCategory = cat.id)}
							>
								{#if cat.id === 'hud'}<Sliders size={12} />
								{:else if cat.id === 'qol'}<Sparkles size={12} />
								{:else if cat.id === 'performance'}<Zap size={12} />
								{:else if cat.id === 'map'}<Compass size={12} />
								{:else if cat.id === 'multiplayer'}<Users size={12} />
								{:else if cat.id === 'visual'}<Eye size={12} />
								{:else if cat.id === 'shader'}<Layers size={12} />
								{:else}<Package size={12} />
								{/if}
								{cat.label} ({countInCat})
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Painel Inline de Catálogo / Adição Externa -->
			{#if addInlineOpen}
				<div class="p-4 rounded-lg bg-[#101b15] border-2 border-[#10b981] shadow-2xl">
					<ContentPickerInline
						bind:kind
						allowedKinds={instance.loader === 'vanilla' ? ['resourcepack', 'shader'] : ['mod', 'shader', 'resourcepack', 'datapack']}
						loaders={loadersFor(kind, instance.loader)}
						gameVersion={instance.gameVersion}
						mode="install"
						target={{ ownerKind: 'instance', owner: instance }}
						oninstalled={() => {
							loadRows();
							onchanged?.();
						}}
						title="Adicionar diretamente a {instance.name}"
					/>
				</div>
			{/if}

			<!-- Lista de Mods (Horizon 77 mods ou Java Mods) -->
			{#if visibleRows.length}
				<div class="tp-slot divide-y divide-[#1d2a23] max-h-[480px] overflow-y-auto pr-1">
					{#each visibleRows as r (r.id + r.filename)}
						<div
							class="flex items-center gap-3.5 p-3 transition-colors hover:bg-[#122219]/60"
							class:opacity-50={!r.enabled}
						>
							<!-- Ícone do Mod -->
							{#if r.iconUrl}
								<img src={r.iconUrl} alt="" class="h-10 w-10 rounded object-contain bg-[#0e1713] p-0.5 border border-[#1b2b22]" />
							{:else}
								<div
									class="w-10 h-10 rounded bg-[#132219] flex items-center justify-center shrink-0 border border-[#1e3428]"
									class:text-[#34d399]={r.enabled}
									class:text-[#4b5563]={!r.enabled}
								>
									{#if r.kind === 'shader'}
										<Layers size={22} />
									{:else if r.kind === 'native-mod'}
										<Cpu size={22} />
									{:else}
										<Package size={22} />
									{/if}
								</div>
							{/if}

							<!-- Detalhes do Mod -->
							<div class="min-w-0 flex-1">
								<div class="truncate text-[13px] font-semibold flex items-center gap-2 flex-wrap">
									<span class="text-white font-mc tracking-wide">{r.name}</span>

									{#if r.enabled}
										<Badge tone="green" pixel>Ativado</Badge>
									{:else}
										<Badge tone="muted">Desativado</Badge>
									{/if}

									{#if r.kind === 'native-mod'}
										<Badge tone="blue">Nativo Vulkan (.hnmod)</Badge>
									{:else if r.kind === 'shader'}
										<Badge tone="gold">Shader Vulkan</Badge>
									{:else if isHorizon}
										<Badge tone="green">Horizon (.hmod)</Badge>
									{/if}

									{#if isHorizon && DEFAULT_ENABLED_MOD_IDS.has(r.id)}
										<Badge tone="gold">Padrão</Badge>
									{/if}
								</div>

								{#if r.summary}
									<p class="text-[11.5px] text-[#cbd5e1] mt-0.5 line-clamp-1">{r.summary}</p>
								{/if}

								<div class="tp-muted truncate font-mono text-[11px] mt-0.5 flex items-center gap-2">
									<span>id: <code>{r.id}</code></span>
									{#if r.version}
										<span>· v{r.version}</span>
									{/if}
									{#if r.author}
										<span>· por {r.author}</span>
									{/if}
									{#if r.size > 0}
										<span>· {formatBytes(r.size)}</span>
									{/if}
								</div>
							</div>

							<!-- Ações: Toggle Switch e Excluir/Desativar -->
							<div class="flex items-center gap-3 shrink-0">
								<Toggle checked={r.enabled} onchange={(v) => toggleMod(r, v)} />
								{#if !r.isOfficial}
									<PixelButton size="sm" variant="ghost" icon={Trash2} title="Excluir arquivo customizado" onclick={() => removeMod(r)} />
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<p class="tp-help !mt-1">
					{#if isHorizon}
						Os mods são ativados e persistidos em tempo real no arquivo <code>horizon-mods.txt</code> da instância e lidos nativamente pelo motor Rust.
					{:else}
						Desativar um mod renomeia o arquivo para <code>.disabled</code>, preservando suas configurações com segurança.
					{/if}
				</p>
			{:else}
				<div class="py-12 text-center">
					<p class="tp-muted text-[13.5px]">
						{loadingRows ? 'Carregando mods do ecossistema...' : 'Nenhum mod encontrado com o filtro atual.'}
					</p>
					{#if filter || selectedCategory !== 'all' || statusFilter !== 'all'}
						<div class="mt-3">
							<PixelButton
								size="sm"
								variant="ghost"
								onclick={() => {
									filter = '';
									selectedCategory = 'all';
									statusFilter = 'all';
								}}
							>
								Limpar todos os filtros
							</PixelButton>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<PixelButton variant="ghost" onclick={() => (open = false)}>Fechar</PixelButton>
	{/snippet}
</Modal>
