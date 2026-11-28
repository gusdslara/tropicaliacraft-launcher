<!-- Página de Listagem e Gerenciamento de Instâncias -->
<script lang="ts">
	import TropicaliaCard from '$lib/components/TropicaliaCard.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import BlockIcon from './../../lib/components/BlockIcon.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import NewInstanceModal from '$lib/components/NewInstanceModal.svelte';
	import InstanceConfigModal from '$lib/components/InstanceConfigModal.svelte';
	import InstanceModsModal from '$lib/components/InstanceModsModal.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { app, stageLabel, toasts } from '$lib/state.svelte';
	import { call, openFolder } from '$lib/platform';
	import type { Instance } from '$lib/types';
	import { formatPlaytime, LOADER_LABEL, timeAgo } from '$lib/util/format';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { flip } from 'svelte/animate';
	import { tick } from 'svelte';
	import {
		Compass,
		Copy,
		Cpu,
		FileArchive,
		FolderOpen,
		HardDrive,
		Package,
		Play,
		Plus,
		Search,
		Settings2,
		Sparkles,
		Square,
		Trash2
	} from 'lucide-svelte';

	let creating = $state(false);
	let configTarget = $state<Instance | null>(null);
	let configOpen = $state(false);
	let modsTarget = $state<Instance | null>(null);
	let modsOpen = $state(false);

	let searchQuery = $state('');
	let filterType = $state<'all' | 'rust' | 'java' | 'running'>('all');

	// Ações de clonagem e exclusão
	let cloneOpen = $state(false);
	let cloneTarget = $state<Instance | null>(null);
	let cloneName = $state('');
	let deleteOpen = $state(false);
	let deleteTarget = $state<Instance | null>(null);
	let exportingId = $state<string | null>(null);

	const sorted = $derived(
		[...app.instances].sort((a, b) => (b.lastPlayedAt ?? b.createdAt).localeCompare(a.lastPlayedAt ?? a.createdAt))
	);

	const filteredInstances = $derived.by(() => {
		let list = sorted;

		// Filtro por tipo/motor
		if (filterType === 'rust') {
			list = list.filter((i) => i.loader === 'horizon-rust');
		} else if (filterType === 'java') {
			list = list.filter((i) => i.loader !== 'horizon-rust');
		} else if (filterType === 'running') {
			list = list.filter((i) => !!app.running[i.id]);
		}

		// Filtro por busca textual
		const q = searchQuery.trim().toLowerCase();
		if (q) {
			list = list.filter(
				(i) =>
					i.name.toLowerCase().includes(q) ||
					LOADER_LABEL[i.loader].toLowerCase().includes(q) ||
					i.gameVersion.toLowerCase().includes(q)
			);
		}

		return list;
	});

	// Ativa automaticamente o modal de configuração se vier da home com ?id=xyz
	$effect(() => {
		const targetId = page.url.searchParams.get('id');
		const wantConfig = page.url.searchParams.get('config') === 'true';
		const wantMods = page.url.searchParams.get('mods') === 'true';

		if (targetId && (wantConfig || wantMods)) {
			const inst = app.instances.find((i) => i.id === targetId);
			if (inst) {
				if (wantConfig) {
					openConfig(inst);
				} else if (wantMods) {
					openMods(inst);
				}
			}
		}
	});

	function openConfig(inst: Instance) {
		configTarget = inst;
		configOpen = true;
	}

	function openMods(inst: Instance) {
		modsTarget = inst;
		modsOpen = true;
	}

	function countMods(inst: Instance): number {
		if (inst.loader === 'horizon-rust') {
			const activeCount = Object.values(inst.content).filter((c) => !c.filename.endsWith('.disabled')).length;
			return activeCount || 6;
		}
		return Object.keys(inst.content).length;
	}

	async function doClone() {
		if (!cloneTarget) return;
		try {
			const copy = await app.cloneInstance(cloneTarget, cloneName.trim() || `${cloneTarget.name} (cópia)`);
			cloneOpen = false;
			toasts.ok(`Instância clonada como "${copy.name}"`);
		} catch (e) {
			toasts.err(e);
		}
	}

	async function doDelete() {
		if (!deleteTarget) return;
		const id = deleteTarget.id;
		deleteOpen = false;
		await app.deleteInstance(id);
		toasts.info('Instância excluída com sucesso.');
	}

	async function doExport(i: Instance, format: 'mrpack' | 'zip') {
		try {
			const { save } = await import('@tauri-apps/plugin-dialog');
			const dest = await save({
				defaultPath: `${i.name}.${format}`,
				filters: [{ name: format === 'mrpack' ? 'Modpack Modrinth' : 'Arquivo ZIP', extensions: [format] }]
			});
			if (!dest) return;
			exportingId = i.id;
			await call('instance_export', { instanceId: i.id, format, indexJson: null, dest });
			toasts.ok(`Exportado com sucesso para: ${dest}`);
		} catch (e) {
			toasts.err(e);
		} finally {
			exportingId = null;
		}
	}

	/** Dá play, sobe o card para o topo (vira o mais recente) e rola até ele para mostrar o progresso. */
	async function playAndReveal(inst: Instance) {
		const run = app.play(inst);
		await tick();
		const card = document.querySelector<HTMLElement>(`[data-instance="${inst.id}"]`);
		let scroller: HTMLElement | null = card?.parentElement ?? null;
		while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) {
			scroller = scroller.parentElement;
		}
		const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
		(scroller ?? document.scrollingElement)?.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
		await run.catch(toasts.err);
	}

	const rustCount = $derived(app.instances.filter((i) => i.loader === 'horizon-rust').length);
	const javaCount = $derived(app.instances.filter((i) => i.loader !== 'horizon-rust').length);
	const runningCount = $derived(Object.keys(app.running).length);
</script>

<div class="mx-auto flex h-full max-w-[1360px] flex-col gap-6">
	<!-- Topo da Página de Instâncias -->
	<TropicaliaCard size="lg">
		<div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
			<div>
				<div class="flex items-center gap-3">
					<h1 class="font-mc mc-shadow text-[22px] sm:text-[24px] text-white">Instâncias de Jogo</h1>
					<Badge tone="green" pixel>{app.instances.length} total</Badge>
				</div>
				<p class="tp-muted mt-1 text-[13px]">
					Gerencie, configure e inicie suas instâncias em <b>Rust (Horizon 26.3 Vulkan)</b> e <b>Java Edition</b>.
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
				<PixelButton variant="emerald" icon={Plus} onclick={() => (creating = true)}>
					Nova Instância
				</PixelButton>
				<PixelButton icon={Compass} onclick={() => goto('/explorar?tipo=modpack')}>
					Explorar Modpacks
				</PixelButton>
			</div>
		</div>

		<!-- Barra de Filtros e Busca -->
		<div class="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#1d2a23]">
			<div class="flex flex-wrap items-center gap-1.5">
				<button
					class="px-3 py-1.5 text-[12px] font-semibold rounded cursor-pointer transition-all border"
					class:bg-[#10b981]={filterType === 'all'}
					class:text-black={filterType === 'all'}
					class:border-[#10b981]={filterType === 'all'}
					class:bg-[#121c17]={filterType !== 'all'}
					class:text-[#9ca3af]={filterType !== 'all'}
					class:border-[#1f3126]={filterType !== 'all'}
					onclick={() => (filterType = 'all')}
				>
					Todas ({app.instances.length})
				</button>
				<button
					class="px-3 py-1.5 text-[12px] font-semibold rounded cursor-pointer transition-all border flex items-center gap-1.5"
					class:bg-[#10b981]={filterType === 'rust'}
					class:text-black={filterType === 'rust'}
					class:border-[#10b981]={filterType === 'rust'}
					class:bg-[#121c17]={filterType !== 'rust'}
					class:text-[#9ca3af]={filterType !== 'rust'}
					class:border-[#1f3126]={filterType !== 'rust'}
					onclick={() => (filterType = 'rust')}
				>
					<Cpu size={14} /> Rust Horizon ({rustCount})
				</button>
				<button
					class="px-3 py-1.5 text-[12px] font-semibold rounded cursor-pointer transition-all border flex items-center gap-1.5"
					class:bg-[#10b981]={filterType === 'java'}
					class:text-black={filterType === 'java'}
					class:border-[#10b981]={filterType === 'java'}
					class:bg-[#121c17]={filterType !== 'java'}
					class:text-[#9ca3af]={filterType !== 'java'}
					class:border-[#1f3126]={filterType !== 'java'}
					onclick={() => (filterType = 'java')}
				>
					Java Edition ({javaCount})
				</button>
				{#if runningCount > 0}
					<button
						class="px-3 py-1.5 text-[12px] font-semibold rounded cursor-pointer transition-all border flex items-center gap-1.5"
						class:bg-[#ef4444]={filterType === 'running'}
						class:text-white={filterType === 'running'}
						class:border-[#ef4444]={filterType === 'running'}
						class:bg-[#201111]={filterType !== 'running'}
						class:text-[#f87171]={filterType !== 'running'}
						class:border-[#3b1717]={filterType !== 'running'}
						onclick={() => (filterType = 'running')}
					>
						<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
						Em Execução ({runningCount})
					</button>
				{/if}
			</div>

			<div class="relative w-full sm:w-64">
				<Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-[#4b5563]" />
				<input
					class="tp-input !pl-9 !h-9 !w-full text-[12.5px]"
					placeholder="Buscar por nome, versão..."
					bind:value={searchQuery}
				/>
			</div>
		</div>
	</TropicaliaCard>

	<!-- Grade de Instâncias -->
	{#if filteredInstances.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
			{#each filteredInstances as i (i.id)}
				{@const isRunning = !!app.running[i.id]}
				{@const task = app.tasks[i.id]}
				{@const isRust = i.loader === 'horizon-rust'}

				<div
					data-instance={i.id}
					animate:flip={{ duration: 380 }}
					class="flex flex-col justify-between p-4.5 rounded-lg bg-[#0d1612] border-2 transition-all shadow-lg hover:border-[#10b981]/70"
					class:border-[#10b981]={isRunning}
					class:border-[#1b2b22]={!isRunning}
				>
					<!-- Topo do Card: Ícone e Nome -->
					<div>
						<div class="flex items-start gap-3.5">
							<div class="shrink-0 p-1 rounded bg-[#132219] border border-[#213529]">
								<BlockIcon icon={i.icon} size={46} />
							</div>

							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-2">
									<h2 class="font-mc mc-shadow truncate text-[16px] text-white" title={i.name}>
										{i.name}
									</h2>
									{#if isRunning}
										<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-mc text-emerald-400 bg-emerald-950/80 border border-emerald-800 animate-pulse">
											<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Jogando
										</span>
									{/if}
								</div>

								<!-- Badges Técnicas -->
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#if isRust}
										<Badge tone="green" pixel>Horizon Rust 26.3 · Vulkan</Badge>
										<Badge tone="green"><Cpu size={11} /> {(i.memory.maxMb / 1024).toFixed(1)} GB Limite</Badge>
										<Badge tone="gold"><Sparkles size={11} /> {countMods(i)} mods .hmod</Badge>
									{:else}
										<Badge tone="blue" pixel>{LOADER_LABEL[i.loader]} {i.gameVersion}</Badge>
										<Badge><HardDrive size={11} /> {(i.memory.maxMb / 1024).toFixed(1)} GB</Badge>
										<Badge>{countMods(i)} itens</Badge>
									{/if}
								</div>
							</div>
						</div>

						<!-- Metadados de Tempo de Jogo -->
						<div class="mt-3.5 pt-3 border-t border-[#18261e] flex items-center justify-between text-[11.5px] tp-muted font-mono">
							<span>⏱ {formatPlaytime(i.playTimeMinutes)} jogados</span>
							<span>Última vez: {timeAgo(i.lastPlayedAt)}</span>
						</div>

						{#if task?.busy}
							<div class="mt-3">
								<ProgressBar
									value={task.total ? task.current / task.total : 0}
									indeterminate={task.total <= 1}
									label={stageLabel(task.stage)}
									detail={task.message}
								/>
							</div>
						{/if}
					</div>

					<!-- Ações do Rodapé -->
					<div class="mt-4 pt-3.5 border-t border-[#18261e] flex flex-col gap-2">
						<div class="grid grid-cols-3 gap-2">
							<!-- Botão Principal: Jogar / Fechar -->
							{#if isRunning}
								<PixelButton
									variant="danger"
									icon={Square}
									class="justify-center w-full"
									onclick={() => app.stopGame(i.id).catch(toasts.err)}
								>
									Fechar
								</PixelButton>
							{:else}
								<PixelButton
									variant="emerald"
									icon={Play}
									class="justify-center w-full"
									loading={task?.busy}
									onclick={() => playAndReveal(i)}
								>
									Jogar
								</PixelButton>
							{/if}

							<!-- Botão de Configurar Instância (Destaque conforme pedido do usuário) -->
							<PixelButton
								variant="stone"
								icon={Settings2}
								class="justify-center w-full"
								title="Configurar opções, RAM e motor desta instância"
								onclick={() => openConfig(i)}
							>
								Configurar
							</PixelButton>

							<!-- Botão de Gerenciamento de Mods -->
							<PixelButton
								variant="ghost"
								icon={Package}
								class="justify-center w-full"
								title="Gerenciar mods (.hmod / .jar)"
								onclick={() => openMods(i)}
							>
								Mods
							</PixelButton>
						</div>

						<!-- Ações Secundárias -->
						<div class="flex items-center justify-between text-[12px] pt-1">
							<div class="flex items-center gap-1 text-[#9ca3af]">
								<button
									class="px-2 py-1 rounded hover:bg-[#1a2d21] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
									title="Abrir pasta no Explorer"
									onclick={() => openFolder('instance', i.id).catch(toasts.err)}
								>
									<FolderOpen size={13} /> Pasta
								</button>
								<button
									class="px-2 py-1 rounded hover:bg-[#1a2d21] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
									title="Clonar esta instância"
									onclick={() => {
										cloneTarget = i;
										cloneName = `${i.name} (cópia)`;
										cloneOpen = true;
									}}
								>
									<Copy size={13} /> Clonar
								</button>
								<button
									class="px-2 py-1 rounded hover:bg-[#1a2d21] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
									title="Exportar como .zip"
									disabled={exportingId === i.id}
									onclick={() => doExport(i, 'zip')}
								>
									<FileArchive size={13} /> Exportar
								</button>
							</div>

							<button
								class="p-1 rounded text-[#ef4444]/70 hover:text-[#ef4444] hover:bg-[#2e1313] transition-colors cursor-pointer"
								title="Excluir instância"
								onclick={() => {
									deleteTarget = i;
									deleteOpen = true;
								}}
							>
								<Trash2 size={14} />
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<!-- Estado Vazio / Sem Resultados -->
		<TropicaliaCard size="lg">
			<div class="py-16 text-center max-w-[500px] mx-auto">
				{#if searchQuery.trim() || filterType !== 'all'}
					<Package size={48} class="mx-auto text-[#4b5563] mb-3" />
					<p class="font-mc mc-shadow text-[16px] text-white">Nenhuma instância encontrada</p>
					<p class="tp-muted mt-2 text-[13px]">Nenhuma instância bate com o filtro "{searchQuery || filterType}".</p>
					<div class="mt-5 flex justify-center gap-3">
						<PixelButton size="sm" onclick={() => { searchQuery = ''; filterType = 'all'; }}>
							Limpar filtros
						</PixelButton>
					</div>
				{:else}
					<img src="/images/tropi_creeper.png" alt="" class="h-28 mx-auto mb-4 float pixel" />
					<p class="font-mc mc-shadow text-[18px] text-white">Você ainda não tem instâncias</p>
					<p class="tp-muted mt-2 text-[13px]">
						Crie uma instância ultra-otimizada em <b>Rust (Horizon 26.3 Vulkan)</b> ou uma instância tradicional <b>Java com mods</b>.
					</p>
					<div class="mt-6 flex justify-center gap-3">
						<PixelButton variant="emerald" icon={Plus} onclick={() => (creating = true)}>
							Criar Primeira Instância
						</PixelButton>
						<PixelButton icon={Compass} onclick={() => goto('/explorar?tipo=modpack')}>
							Ver Modpacks Prontos
						</PixelButton>
					</div>
				{/if}
			</div>
		</TropicaliaCard>
	{/if}
</div>

<!-- Modal de Criação de Instância -->
<NewInstanceModal bind:open={creating} oncreated={(i) => { openConfig(i); }} />

<!-- Modal de Configuração Completa da Instância -->
<InstanceConfigModal bind:open={configOpen} instance={configTarget} onupdated={() => { app.saveInstances(); }} onopenmods={(i) => openMods(i)} />

<!-- Modal de Gerenciamento de Mods da Instância -->
<InstanceModsModal bind:open={modsOpen} instance={modsTarget} onchanged={() => { app.saveInstances(); }} />

<!-- Modal de Clonagem -->
<Modal bind:open={cloneOpen} title="Clonar instância" width={460}>
	<label class="tp-label" for="inst-clone-input">Nome da cópia</label>
	<input id="inst-clone-input" class="tp-input" bind:value={cloneName} />
	<p class="tp-help">Copia todos os mods, configurações e mundos para uma nova instância independente.</p>
	{#snippet footer()}
		<PixelButton variant="ghost" onclick={() => (cloneOpen = false)}>Cancelar</PixelButton>
		<PixelButton variant="emerald" icon={Copy} onclick={doClone}>Clonar Instância</PixelButton>
	{/snippet}
</Modal>

<!-- Modal de Exclusão -->
<Modal bind:open={deleteOpen} title="Excluir instância?" width={460}>
	<p class="text-[13px]">
		Tem certeza que deseja apagar permanentemente a pasta e os mundos de <b>{deleteTarget?.name}</b>? Essa ação não pode ser desfeita.
	</p>
	{#snippet footer()}
		<PixelButton variant="ghost" onclick={() => (deleteOpen = false)}>Cancelar</PixelButton>
		<PixelButton variant="danger" icon={Trash2} onclick={doDelete}>Excluir Definitivamente</PixelButton>
	{/snippet}
</Modal>
