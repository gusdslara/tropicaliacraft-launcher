<script lang="ts">
	import TropicaliaCard from '$lib/components/TropicaliaCard.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import BlockIcon from '$lib/components/BlockIcon.svelte';
	import TabSelector from '$lib/components/TabSelector.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import ConsoleView from '$lib/components/ConsoleView.svelte';
	import NewInstanceModal from '$lib/components/NewInstanceModal.svelte';
	import ContentPickerInline from '$lib/components/ContentPickerInline.svelte';
	import { app, stageLabel, toasts } from '$lib/state.svelte';
	import { call, isTauri, openFolder } from '$lib/platform';
	import { loaderVersions, type LoaderVersion } from '$lib/services/versions';
	import { loadersFor } from '$lib/services/modrinth';
	import type { BlockIcon as BlockIconT, ContentKind, Instance, InstalledContent, HorizonOptions } from '$lib/types';
	import { BLOCK_ICONS, errorMessage, formatBytes, formatPlaytime, LOADER_LABEL, timeAgo } from '$lib/util/format';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		Copy,
		Cpu,
		FileArchive,
		FolderOpen,
		Monitor,
		Package,
		Play,
		Plus,
		RefreshCw,
		Save,
		Sliders,
		Sparkles,
		Square,
		Trash2,
		Wrench,
		X
	} from 'lucide-svelte';

	let creating = $state(false);
	let addInlineOpen = $state(false);
	const selectedId = $derived(page.url.searchParams.get('id') ?? app.lastInstance?.id ?? app.instances[0]?.id);
	const inst = $derived(app.instances.find((i) => i.id === selectedId));
	const sorted = $derived([...app.instances].sort((a, b) => (b.lastPlayedAt ?? b.createdAt).localeCompare(a.lastPlayedAt ?? a.createdAt)));

	let tab = $state('content');
	let kind = $state<ContentKind>('mod');

	// ---------------------------------------------------------------- conteúdo
	type Row = { filename: string; enabled: boolean; size: number; meta?: InstalledContent };
	let rows = $state<Row[]>([]);
	let loadingRows = $state(false);
	let filter = $state('');

	async function loadRows() {
		const i = inst;
		if (!i) return;
		loadingRows = true;
		try {
			if (isTauri) {
				const files = await call<Array<{ filename: string; enabled: boolean; size: number }>>('content_list', {
					ownerKind: 'instance',
					ownerId: i.id,
					kind
				});
				rows = files.map((f) => ({ ...f, meta: i.content[f.filename] }));
			} else {
				rows = Object.values(i.content)
					.filter((c) => c.kind === kind)
					.map((c) => ({ filename: c.filename, enabled: true, size: c.size ?? 0, meta: c }));
			}
		} catch (e) {
			toasts.err(e);
		} finally {
			loadingRows = false;
		}
	}

	$effect(() => {
		void inst?.id;
		void kind;
		void Object.keys(inst?.content ?? {}).length;
		loadRows();
	});

	const visibleRows = $derived(
		rows.filter((r) => !filter || (r.meta?.title ?? r.filename).toLowerCase().includes(filter.toLowerCase()))
	);

	async function toggle(r: Row, enabled: boolean) {
		try {
			await call('content_toggle', { ownerKind: 'instance', ownerId: inst!.id, kind, filename: r.filename, enabled });
			r.enabled = enabled;
		} catch (e) {
			toasts.err(e);
			r.enabled = !enabled;
		}
	}

	async function remove(r: Row) {
		try {
			await call('content_delete', { ownerKind: 'instance', ownerId: inst!.id, kind, filename: r.filename });
			delete inst!.content[r.filename];
			app.saveInstances();
			rows = rows.filter((x) => x !== r);
		} catch (e) {
			toasts.err(e);
		}
	}

	// ---------------------------------------------------------------- configurações
	let draft = $state<Instance | null>(null);
	let draftLoaders = $state<LoaderVersion[]>([]);
	let syncingHorizon = $state(false);

	$effect(() => {
		if (!inst) {
			draft = null;
			return;
		}
		const d = structuredClone($state.snapshot(inst));
		if (d.loader === 'horizon-rust') {
			if (!d.horizonOptions) {
				d.horizonOptions = {
					renderDistance: 12,
					lodDistance: 0,
					farDetail: 'full',
					caveCulling: true,
					entityCulling: false,
					animatedTextures: true,
					fxaa: false,
					sky: true,
					fog: true,
					weather: true,
					fullbright: false,
					dynamicLights: false,
					zoom: false,
					fps: false,
					keystrokes: false,
					minimap: false,
					discordPresence: true,
					creative: false,
					testTerrain: false,
					pregen: false
				};
			}
			if (isTauri) {
				call<HorizonOptions>('horizon_options_get', { instanceId: d.id })
					.then((opts) => {
						if (draft && draft.id === d.id) {
							draft.horizonOptions = { ...draft.horizonOptions, ...opts };
						}
					})
					.catch(() => {});
			}
		}
		draft = d;
	});

	$effect(() => {
		const d = draft;
		if (!d || d.loader === 'vanilla' || d.loader === 'horizon-rust') return void (draftLoaders = []);
		loaderVersions(d.loader, d.gameVersion)
			.then((l) => (draftLoaders = l))
			.catch(() => (draftLoaders = []));
	});
	const maxRam = $derived(Math.max(2048, app.system.totalMemoryMb - 1024));

	async function saveDraft() {
		if (!draft || !inst) return;
		const { name, icon, memory, jvmArgs, javaPath, rustBinaryPath, horizonOptions, resolution, autoJoin, loaderVersion, gameVersion } = draft;
		app.updateInstance(inst.id, {
			name,
			icon,
			memory,
			jvmArgs,
			javaPath,
			rustBinaryPath,
			horizonOptions,
			resolution,
			autoJoin,
			loaderVersion,
			gameVersion
		});

		if (inst.loader === 'horizon-rust' && horizonOptions && isTauri) {
			try {
				await call('horizon_options_set', { instanceId: inst.id, options: horizonOptions });
			} catch (e) {
				console.error('Falha ao persistir opções nos arquivos do Horizon:', e);
			}
		}
		toasts.ok('Configurações salvas');
	}

	async function syncHorizonResources() {
		if (!inst) return;
		syncingHorizon = true;
		try {
			await call('horizon_prepare_sync', { instanceId: inst.id });
			toasts.ok('Recursos, texturas e sons do Horizon Rust sincronizados com sucesso!');
		} catch (e) {
			toasts.err(e);
		} finally {
			syncingHorizon = false;
		}
	}

	// ---------------------------------------------------------------- ações
	let cloneOpen = $state(false);
	let cloneName = $state('');
	let deleteOpen = $state(false);
	let exporting = $state(false);

	async function doClone() {
		try {
			const copy = await app.cloneInstance(inst!, cloneName.trim() || `${inst!.name} (cópia)`);
			cloneOpen = false;
			toasts.ok(`Clonada como "${copy.name}"`);
			goto(`/instancias?id=${copy.id}`);
		} catch (e) {
			toasts.err(e);
		}
	}

	async function doDelete() {
		const id = inst!.id;
		deleteOpen = false;
		await app.deleteInstance(id);
		toasts.info('Instância excluída');
		goto('/instancias');
	}

	const FOLDER: Record<string, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks' };

	/** modrinth.index.json com os arquivos que vieram do Modrinth (o resto vai como override). */
	async function buildIndex(i: Instance) {
		const enabled = new Set<string>();
		for (const k of Object.keys(FOLDER)) {
			const list = await call<Array<{ filename: string; enabled: boolean }>>('content_list', { ownerKind: 'instance', ownerId: i.id, kind: k }).catch(() => []);
			for (const f of list) if (f.enabled) enabled.add(`${k}/${f.filename}`);
		}
		const files = Object.values(i.content)
			.filter((c) => c.url && c.sha1 && c.sha512 && FOLDER[c.kind] && enabled.has(`${c.kind}/${c.filename}`))
			.map((c) => ({
				path: `${FOLDER[c.kind]}/${c.filename}`,
				hashes: { sha1: c.sha1, sha512: c.sha512 },
				env: { client: 'required', server: c.kind === 'mod' ? 'optional' : 'unsupported' },
				downloads: [c.url],
				fileSize: c.size ?? 0
			}));
		const deps: Record<string, string> = { minecraft: i.gameVersion };
		if (i.loader === 'fabric' && i.loaderVersion) deps['fabric-loader'] = i.loaderVersion;
		if (i.loader === 'quilt' && i.loaderVersion) deps['quilt-loader'] = i.loaderVersion;
		if (i.loader === 'neoforge' && i.loaderVersion) deps['neoforge'] = i.loaderVersion;
		if (i.loader === 'forge' && i.loaderVersion) deps['forge'] = i.loaderVersion.replace(`${i.gameVersion}-`, '');
		return JSON.stringify({ formatVersion: 1, game: 'minecraft', versionId: '1.0.0', name: i.name, summary: 'Exportado pelo Tropicalia Launcher', files, dependencies: deps }, null, 2);
	}

	async function doExport(format: 'mrpack' | 'zip') {
		const i = inst!;
		try {
			const { save } = await import('@tauri-apps/plugin-dialog');
			const dest = await save({
				defaultPath: `${i.name}.${format}`,
				filters: [{ name: format === 'mrpack' ? 'Modpack Modrinth' : 'Arquivo ZIP', extensions: [format] }]
			});
			if (!dest) return;
			exporting = true;
			await call('instance_export', { instanceId: i.id, format, indexJson: format === 'mrpack' ? await buildIndex(i) : null, dest });
			toasts.ok(`Exportado: ${dest}`);
		} catch (e) {
			toasts.err(e);
		} finally {
			exporting = false;
		}
	}

	const task = $derived(inst ? app.tasks[inst.id] : undefined);
	const running = $derived(inst ? !!app.running[inst.id] : false);
	const contentTabs = $derived([
		{ id: 'mod', label: inst?.loader === 'horizon-rust' ? 'Mods Rust (.hmod)' : 'Mods (.jar)', disabled: inst?.loader === 'vanilla' },
		{ id: 'resourcepack', label: 'Texturas' },
		{ id: 'shader', label: 'Shaders' },
		{ id: 'datapack', label: 'Data packs' }
	]);
	$effect(() => {
		if (inst?.loader === 'vanilla' && kind === 'mod') kind = 'resourcepack';
	});
</script>

<div class="mx-auto grid h-full max-w-[1320px] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-5 md:gap-6">
	<TropicaliaCard title="Instâncias" class="flex min-h-0 flex-col max-h-none md:max-h-full">
		{#snippet actions()}
			<PixelButton size="sm" variant="emerald" icon={Plus} title="Nova instância" onclick={() => (creating = true)}>
				<span class="hidden sm:inline">Nova</span>
			</PixelButton>
		{/snippet}
		<div class="-mx-1 flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto px-1 pb-1 md:pb-0 scrollbar-none">
			{#each sorted as i (i.id)}
				<a href="/instancias?id={i.id}" class="item shrink-0 w-[180px] md:w-auto" class:active={i.id === inst?.id}>
					<BlockIcon icon={i.icon} size={34} />
					<span class="min-w-0 flex-1">
						<b class="block truncate text-[13px]">{i.name}</b>
						<small class="tp-muted block truncate text-[11.5px]">{LOADER_LABEL[i.loader]} {i.gameVersion}</small>
					</span>
					{#if app.running[i.id]}<i class="dot shrink-0" title="Rodando"></i>{/if}
				</a>
			{:else}
				<p class="tp-muted text-[13px]">Nenhuma instância.</p>
			{/each}
		</div>
	</TropicaliaCard>

	{#if inst}
		<div class="flex min-w-0 flex-col gap-5 md:gap-6">
			<TropicaliaCard size="lg">
				<div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5">
					<div class="flex items-center gap-3.5 w-full sm:w-auto">
						<BlockIcon icon={inst.icon} size={56} />
						<div class="min-w-0 flex-1 sm:hidden">
							<h1 class="font-mc mc-shadow truncate text-[18px] text-white">{inst.name}</h1>
							<div class="mt-1 flex flex-wrap gap-1">
								<Badge tone="green" pixel>{LOADER_LABEL[inst.loader]}</Badge>
								<Badge tone="blue" pixel>{inst.gameVersion}</Badge>
							</div>
						</div>
					</div>
					<div class="min-w-0 flex-1 hidden sm:block">
						<h1 class="font-mc mc-shadow truncate text-[20px] text-white">{inst.name}</h1>
						<div class="mt-2 flex flex-wrap gap-1.5">
							<Badge tone="green" pixel>{LOADER_LABEL[inst.loader]}</Badge>
							<Badge tone="blue" pixel>{inst.gameVersion}</Badge>
							{#if inst.loaderVersion}<Badge>{inst.loaderVersion}</Badge>{/if}
							<Badge>⏱ {formatPlaytime(inst.playTimeMinutes)}</Badge>
							<Badge>jogada {timeAgo(inst.lastPlayedAt)}</Badge>
						</div>
					</div>
					<div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
						{#if running}
							<PixelButton variant="danger" icon={Square} class="flex-1 sm:flex-none justify-center" onclick={() => app.stopGame(inst.id).catch(toasts.err)}>Fechar</PixelButton>
						{:else}
							<PixelButton variant="emerald" icon={Play} class="flex-1 sm:flex-none justify-center" loading={task?.busy} onclick={() => app.play(inst).catch(toasts.err)}>Jogar</PixelButton>
						{/if}
						<PixelButton icon={FolderOpen} title="Abrir pasta" onclick={() => openFolder('instance', inst.id).catch(toasts.err)} />
						<PixelButton icon={Copy} title="Clonar" onclick={() => ((cloneName = `${inst.name} (cópia)`), (cloneOpen = true))} />
						<PixelButton icon={Package} title="Exportar .mrpack" loading={exporting} onclick={() => doExport('mrpack')} />
						<PixelButton icon={FileArchive} title="Exportar .zip" disabled={exporting} onclick={() => doExport('zip')} />
						<PixelButton variant="ghost" icon={Trash2} title="Excluir" onclick={() => (deleteOpen = true)} />
					</div>
				</div>
				{#if task?.busy}
					<div class="mt-4">
						<ProgressBar value={task.total ? task.current / task.total : 0} indeterminate={task.total <= 1} label={stageLabel(task.stage)} detail={task.message} />
					</div>
				{/if}
			</TropicaliaCard>

			<div class="overflow-x-auto pb-1 scrollbar-none">
				<TabSelector
					tabs={[
						{ id: 'content', label: 'Conteúdo', count: Object.keys(inst.content).length },
						{ id: 'settings', label: 'Configurações' },
						{ id: 'logs', label: 'Logs', count: app.gameLogs[inst.id]?.length || undefined }
					]}
					bind:value={tab}
				/>
			</div>

			{#if tab === 'content'}
				<TropicaliaCard>
					<div class="mb-4 flex flex-wrap items-center gap-3">
						<TabSelector tabs={contentTabs} bind:value={kind as string} size="sm" />
						<input class="tp-input ml-auto !h-8 !w-48 sm:!w-56" placeholder="Filtrar arquivos…" bind:value={filter} />
						<PixelButton size="sm" icon={RefreshCw} title="Recarregar lista" loading={loadingRows} onclick={loadRows} />
						<PixelButton
							size="sm"
							variant={addInlineOpen ? 'ghost' : 'emerald'}
							icon={addInlineOpen ? X : Plus}
							onclick={() => (addInlineOpen = !addInlineOpen)}
						>
							{addInlineOpen ? 'Fechar catálogo' : 'Adicionar ' + (contentTabs.find((t) => t.id === kind)?.label ?? '')}
						</PixelButton>
					</div>

					{#if addInlineOpen}
						<div class="mb-5 p-4 rounded bg-[#101b15] border-2 border-[#10b981] shadow-xl">
							<ContentPickerInline
								bind:kind
								allowedKinds={inst.loader === 'vanilla' ? ['resourcepack', 'shader'] : ['mod', 'shader', 'resourcepack', 'datapack']}
								loaders={loadersFor(kind, inst.loader)}
								gameVersion={inst.gameVersion}
								mode="install"
								target={{ ownerKind: 'instance', owner: inst }}
								oninstalled={() => loadRows()}
								title="Adicionar diretamente a {inst.name} ({LOADER_LABEL[inst.loader]} {inst.gameVersion})"
							/>
						</div>
					{/if}

					{#if visibleRows.length}
						<div class="tp-slot divide-y divide-[#1d2a23]">
							{#each visibleRows as r (r.filename)}
								<div class="row" class:off={!r.enabled}>
									{#if r.meta?.iconUrl}<img src={r.meta.iconUrl} alt="" class="h-9 w-9 rounded-sm" />{:else}<Package size={32} class="text-[#3b5144]" />{/if}
									<div class="min-w-0 flex-1">
										<div class="truncate text-[13px] font-semibold">
											{r.meta?.title ?? r.filename}
											{#if r.meta?.dependencyOf}<span class="tp-muted text-[11px] font-normal"> · dependência</span>{/if}
										</div>
										<div class="tp-muted truncate font-mono text-[11px]">{r.meta?.versionNumber ? `${r.meta.versionNumber} · ` : ''}{r.filename} · {formatBytes(r.size)}</div>
									</div>
									{#if !r.meta}<Badge>manual</Badge>{/if}
									<Toggle checked={r.enabled} onchange={(v) => toggle(r, v)} />
									<PixelButton size="sm" variant="ghost" icon={Trash2} title="Excluir arquivo" onclick={() => remove(r)} />
								</div>
							{/each}
						</div>
						<p class="tp-help mt-3">Desativar só renomeia para <code>.disabled</code>, nada é apagado.</p>
					{:else}
						<div class="py-10 text-center">
							<p class="tp-muted text-[13px]">{loadingRows ? 'Carregando…' : 'Nada instalado aqui ainda.'}</p>
							{#if !addInlineOpen}
								<div class="mt-3">
									<PixelButton size="sm" variant="emerald" icon={Plus} onclick={() => (addInlineOpen = true)}>
										Explorar e adicionar {kind === 'mod' ? 'mods' : kind} agora
									</PixelButton>
								</div>
							{/if}
						</div>
					{/if}
				</TropicaliaCard>
			{:else if tab === 'settings' && draft}
				<TropicaliaCard>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
						<div>
							<label class="tp-label" for="s-name">Nome</label>
							<input id="s-name" class="tp-input" bind:value={draft.name} />
						</div>
						<div>
							<span class="tp-label">Ícone</span>
							<div class="flex flex-wrap gap-2">
								{#each Object.keys(BLOCK_ICONS) as key (key)}
									<button class="pick" class:on={draft.icon === key} onclick={() => (draft!.icon = key as BlockIconT)} aria-label={key}>
										<BlockIcon icon={key as BlockIconT} size={28} />
									</button>
								{/each}
							</div>
						</div>
						<div>
							<label class="tp-label" for="s-mc">Versão do Minecraft</label>
							<input id="s-mc" class="tp-input font-mono" disabled={draft.loader === 'horizon-rust'} bind:value={draft.gameVersion} />
							{#if draft.loader === 'horizon-rust'}
								<p class="tp-help">O Horizon Rust compila nativamente contra a paridade 26.3.</p>
							{:else}
								<p class="tp-help">Mudar a versão pode quebrar mods instalados.</p>
							{/if}
						</div>
						{#if draft.loader !== 'horizon-rust'}
							<div>
								<label class="tp-label" for="s-lv">Versão do {LOADER_LABEL[draft.loader]}</label>
								{#if draft.loader === 'vanilla'}
									<input id="s-lv" class="tp-input" value="—" disabled />
								{:else if draftLoaders.length}
									<select id="s-lv" class="tp-select" bind:value={draft.loaderVersion}>
										{#each draftLoaders as l (l.version)}<option value={l.version}>{l.version}{l.stable ? '' : ' (beta)'}</option>{/each}
									</select>
								{:else}
									<input id="s-lv" class="tp-input font-mono" bind:value={draft.loaderVersion} />
								{/if}
							</div>
						{:else}
							<div>
								<label class="tp-label" for="s-hz-status">Motor Gráfico</label>
								<div class="tp-input !flex items-center gap-2 bg-[#0d1612]">
									<Cpu size={16} class="text-[#34d399]" />
									<span class="text-[12.5px] text-white">Vulkan Nativo (Horizon Rust)</span>
								</div>
								<p class="tp-help">Executado diretamente sem JVM.</p>
							</div>
						{/if}

						<div>
							<label class="tp-label" for="s-w">Resolução da janela (opcional)</label>
							<div class="flex items-center gap-2">
								<input id="s-w" class="tp-input" type="number" placeholder="largura" value={draft.resolution?.width ?? ''}
									oninput={(e) => {
										const w = Number((e.currentTarget as HTMLInputElement).value);
										draft!.resolution = w ? { width: w, height: draft!.resolution?.height ?? 720 } : undefined;
									}} />
								<span class="tp-muted">×</span>
								<input class="tp-input" type="number" placeholder="altura" aria-label="altura" value={draft.resolution?.height ?? ''}
									oninput={(e) => {
										const h = Number((e.currentTarget as HTMLInputElement).value);
										if (draft!.resolution && h) draft!.resolution.height = h;
									}} />
							</div>
						</div>
						<div>
							<label class="tp-label" for="s-join">Entrar direto no servidor</label>
							<input id="s-join" class="tp-input font-mono" placeholder="mods.tropicaliacraft.online" bind:value={draft.autoJoin} />
						</div>

						{#if draft.loader === 'horizon-rust'}
							<!-- Banner e Manutenção Horizon -->
							<div class="col-span-1 sm:col-span-2 p-3.5 rounded-lg border border-[#10b981]/40 bg-[#0f241a]/60 flex flex-wrap items-center justify-between gap-3">
								<div class="flex items-center gap-3">
									<div class="w-10 h-10 rounded-md bg-[#10b981]/20 flex items-center justify-center text-[#34d399]">
										<Cpu size={22} />
									</div>
									<div>
										<h4 class="font-mc text-[13px] text-white flex items-center gap-2">
											Motor Horizon Rust 26.3
											<Badge tone="green" pixel>Vulkan</Badge>
										</h4>
										<p class="tp-muted text-[11.5px]">Recursos oficiais Mojang + compilação e sons nativos gerenciados no launcher.</p>
									</div>
								</div>
								<PixelButton size="sm" variant="emerald" icon={Wrench} loading={syncingHorizon} onclick={syncHorizonResources}>
									Reparar / Sincronizar Sons e Recursos
								</PixelButton>
							</div>

							<!-- Gráficos e Distância -->
							<div class="col-span-1 sm:col-span-2 pt-2 border-t border-[#1d2a23]">
								<h4 class="font-mc text-[13px] text-[#34d399] flex items-center gap-2 mb-3">
									<Sliders size={15} />
									Gráficos e Distância de Renderização
								</h4>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div>
										<div class="flex justify-between items-baseline mb-1">
											<label class="tp-label" for="hz-rd">Distância de Renderização</label>
											<span class="font-mono text-[12px] text-[#bef264] font-bold">{draft.horizonOptions?.renderDistance ?? 12} chunks</span>
										</div>
										<input id="hz-rd" type="range" class="tp-range" min="2" max="64" step="1" bind:value={draft.horizonOptions!.renderDistance} />
										<p class="tp-help">Alcance da visão do jogador em chunks (2 a 64).</p>
									</div>
									<div>
										<div class="flex justify-between items-baseline mb-1">
											<label class="tp-label" for="hz-lod">Distant Terrain (LOD Chunks)</label>
											<span class="font-mono text-[12px] text-[#bef264] font-bold">
												{draft.horizonOptions?.lodDistance ? `${draft.horizonOptions.lodDistance} chunks` : 'Desligado (0)'}
											</span>
										</div>
										<input id="hz-lod" type="range" class="tp-range" min="0" max="1024" step="64" bind:value={draft.horizonOptions!.lodDistance} />
										<p class="tp-help">Terreno distante ultralongo simplificado (até 1024 chunks).</p>
									</div>
									<div>
										<label class="tp-label" for="hz-fardetail">Detalhe Distante (Far Detail)</label>
										<select id="hz-fardetail" class="tp-select" bind:value={draft.horizonOptions!.farDetail}>
											<option value="full">Completo (Full)</option>
											<option value="simple">Simples (Simple)</option>
											<option value="off">Desligado (Off)</option>
										</select>
									</div>
									<div>
										<label class="tp-label" for="hz-bin">Executável Personalizado (Opcional)</label>
										<input id="hz-bin" class="tp-input font-mono text-[11.5px]" placeholder="Automático (horizon-client.exe baixado)" bind:value={draft.rustBinaryPath} />
										<p class="tp-help">Deixe em branco para usar o horizon-client.exe baixado pelo launcher.</p>
									</div>
								</div>

								<div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0d1612] p-3 rounded border border-[#1b2b22]">
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
										<span>Anti-Aliasing (FXAA)</span>
										<Toggle checked={draft.horizonOptions?.fxaa ?? false} onchange={(v) => (draft!.horizonOptions!.fxaa = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<span>Céu (Sky)</span>
										<Toggle checked={draft.horizonOptions?.sky ?? true} onchange={(v) => (draft!.horizonOptions!.sky = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<span>Neblina (Fog)</span>
										<Toggle checked={draft.horizonOptions?.fog ?? true} onchange={(v) => (draft!.horizonOptions!.fog = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<span>Clima (Weather)</span>
										<Toggle checked={draft.horizonOptions?.weather ?? true} onchange={(v) => (draft!.horizonOptions!.weather = v)} />
									</label>
								</div>
							</div>

							<!-- Extras Integrados do Horizon -->
							<div class="col-span-1 sm:col-span-2 pt-2 border-t border-[#1d2a23]">
								<h4 class="font-mc text-[13px] text-[#34d399] flex items-center gap-2 mb-3">
									<Sparkles size={15} />
									Extras Integrados do Horizon (horizon-extras)
								</h4>
								<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-[#0d1612] p-3 rounded border border-[#1b2b22]">
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<span>Luz Dinâmica</span>
										<Toggle checked={draft.horizonOptions?.dynamicLights ?? false} onchange={(v) => (draft!.horizonOptions!.dynamicLights = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<span>Brilho Máximo</span>
										<Toggle checked={draft.horizonOptions?.fullbright ?? false} onchange={(v) => (draft!.horizonOptions!.fullbright = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<span>Zoom Nativo (Z)</span>
										<Toggle checked={draft.horizonOptions?.zoom ?? false} onchange={(v) => (draft!.horizonOptions!.zoom = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<span>FPS no HUD</span>
										<Toggle checked={draft.horizonOptions?.fps ?? false} onchange={(v) => (draft!.horizonOptions!.fps = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<span>Keystrokes</span>
										<Toggle checked={draft.horizonOptions?.keystrokes ?? false} onchange={(v) => (draft!.horizonOptions!.keystrokes = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<span>Minimapa</span>
										<Toggle checked={draft.horizonOptions?.minimap ?? false} onchange={(v) => (draft!.horizonOptions!.minimap = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<span>Discord RPC</span>
										<Toggle checked={draft.horizonOptions?.discordPresence ?? true} onchange={(v) => (draft!.horizonOptions!.discordPresence = v)} />
									</label>
								</div>
							</div>

							<!-- Flags de Execução -->
							<div class="col-span-1 sm:col-span-2 pt-2 border-t border-[#1d2a23]">
								<h4 class="font-mc text-[13px] text-[#34d399] flex items-center gap-2 mb-3">
									<Monitor size={15} />
									Modo do Cliente e Depuração
								</h4>
								<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#0d1612] p-3 rounded border border-[#1b2b22]">
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<div>
											<span class="block">Modo Criativo</span>
											<small class="tp-muted text-[10.5px]">--creative</small>
										</div>
										<Toggle checked={draft.horizonOptions?.creative ?? false} onchange={(v) => (draft!.horizonOptions!.creative = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<div>
											<span class="block">Test Terrain</span>
											<small class="tp-muted text-[10.5px]">--test-terrain</small>
										</div>
										<Toggle checked={draft.horizonOptions?.testTerrain ?? false} onchange={(v) => (draft!.horizonOptions!.testTerrain = v)} />
									</label>
									<label class="flex items-center justify-between text-[12px] text-[#d1d5db] cursor-pointer">
										<div>
											<span class="block">Gerador de Área</span>
											<small class="tp-muted text-[10.5px]">--pregen</small>
										</div>
										<Toggle checked={draft.horizonOptions?.pregen ?? false} onchange={(v) => (draft!.horizonOptions!.pregen = v)} />
									</label>
								</div>
							</div>
						{:else}
							<!-- Configurações específicas de instâncias Java -->
							<div class="col-span-1 sm:col-span-2">
								<div class="flex items-baseline justify-between">
									<label class="tp-label" for="s-ram">Memória máxima</label>
									<span class="font-mc mc-shadow-sm text-[12px] text-[#bef264]">{(draft.memory.maxMb / 1024).toFixed(1)} GB</span>
								</div>
								<input id="s-ram" type="range" class="tp-range" min="1024" max={maxRam} step="512" bind:value={draft.memory.maxMb} />
							</div>
							<div class="col-span-1 sm:col-span-2">
								<label class="tp-label" for="s-jvm">Argumentos extras da JVM</label>
								<input id="s-jvm" class="tp-input font-mono" placeholder="-Dfml.ignoreInvalidMinecraftCertificates=true" bind:value={draft.jvmArgs} />
								<p class="tp-help">Somados ao perfil de desempenho escolhido em Ajustes ({app.settings.perfProfile}).</p>
							</div>
							<div class="col-span-1 sm:col-span-2">
								<label class="tp-label" for="s-java">Java desta instância (opcional)</label>
								<input id="s-java" class="tp-input font-mono" placeholder="Automático (Java oficial da Mojang)" bind:value={draft.javaPath} />
							</div>
						{/if}
					</div>
					<div class="mt-5 flex justify-end">
						<PixelButton variant="emerald" icon={Save} onclick={saveDraft}>Salvar</PixelButton>
					</div>
				</TropicaliaCard>
			{:else if tab === 'logs'}
				<ConsoleView lines={app.gameLogs[inst.id] ?? []} height={460} empty="Os logs aparecem aqui quando o jogo estiver aberto." />
			{/if}
		</div>
	{:else}
		<TropicaliaCard size="lg">
			<div class="py-16 text-center">
				<p class="font-mc mc-shadow text-[16px] text-white">Nenhuma instância ainda</p>
				<p class="tp-muted mt-3 text-[13px]">Crie a primeira ou instale um modpack pronto.</p>
				<div class="mt-6 flex justify-center gap-3">
					<PixelButton variant="emerald" icon={Plus} onclick={() => (creating = true)}>Nova instância</PixelButton>
					<PixelButton onclick={() => goto('/explorar?tipo=modpack')}>Modpacks</PixelButton>
				</div>
			</div>
		</TropicaliaCard>
	{/if}
</div>

<NewInstanceModal bind:open={creating} oncreated={(i) => goto(`/instancias?id=${i.id}`)} />

<Modal bind:open={cloneOpen} title="Clonar instância" width={460}>
	<label class="tp-label" for="clone-name">Nome da cópia</label>
	<input id="clone-name" class="tp-input" bind:value={cloneName} />
	<p class="tp-help">Copia mods, configs, mundos e texturas para uma instância nova.</p>
	{#snippet footer()}
		<PixelButton variant="ghost" onclick={() => (cloneOpen = false)}>Cancelar</PixelButton>
		<PixelButton variant="emerald" icon={Copy} onclick={doClone}>Clonar</PixelButton>
	{/snippet}
</Modal>

<Modal bind:open={deleteOpen} title="Excluir instância?" width={460}>
	<p class="text-[13px]">A pasta de <b>{inst?.name}</b> (mundos, mods e configs) vai ser apagada. Não dá para desfazer.</p>
	{#snippet footer()}
		<PixelButton variant="ghost" onclick={() => (deleteOpen = false)}>Cancelar</PixelButton>
		<PixelButton variant="danger" icon={Trash2} onclick={doDelete}>Excluir</PixelButton>
	{/snippet}
</Modal>

<style>
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px;
		color: inherit;
		text-decoration: none;
		border: 2px solid transparent;
	}
	.item:hover {
		background: var(--tp-panel-2);
	}
	.item.active {
		background: var(--tp-panel-2);
		border-color: #10b981;
	}
	.dot {
		width: 8px;
		height: 8px;
		background: var(--tp-green);
		box-shadow: 0 0 8px var(--tp-green);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 12px;
	}
	.row.off {
		opacity: 0.55;
	}
	.pick {
		padding: 2px;
		border: 0;
		background: transparent;
		cursor: pointer;
	}
	.pick.on {
		background: #10b981;
	}
</style>
