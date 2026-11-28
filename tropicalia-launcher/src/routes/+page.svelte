<!-- Início: aba JOGAR (última instância com o JOGAR gigante, lista de Servidores e perfis) e aba CRIAR SERVIDOR. -->
<script lang="ts">
    import { tr } from '$lib/ui-text';
	import TropicaliaCard from '$lib/components/TropicaliaCard.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import BlockIcon from '$lib/components/BlockIcon.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import InstanceTile from '$lib/components/InstanceTile.svelte';
	import NewInstanceModal from '$lib/components/NewInstanceModal.svelte';
	import InstanceConfigModal from '$lib/components/InstanceConfigModal.svelte';
	import InstanceModsModal from '$lib/components/InstanceModsModal.svelte';
	import ServerList from '$lib/components/ServerList.svelte';
	import ServerManager from '$lib/components/ServerManager.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { app, stageLabel, toasts } from '$lib/state.svelte';
	import { DEFAULT_LOADER_ICON, formatPlaytime, LOADER_LABEL, LOADER_TONE, timeAgo } from '$lib/util/format';
	import type { Instance } from '$lib/types';
	import { MemoryStick, Package, Play, Plus, Server, Settings2, Square } from 'lucide-svelte';

	let creating = $state(false);
	let modalInstance = $state<Instance | null>(null);
	let configModalOpen = $state(false);
	let modsModalOpen = $state(false);

	function openConfig(target: Instance) {
		modalInstance = target;
		configModalOpen = true;
	}

	function openMods(target: Instance) {
		modalInstance = target;
		modsModalOpen = true;
	}

	const inst = $derived(app.lastInstance);
	const task = $derived(inst ? app.tasks[inst.id] : undefined);
	const running = $derived(inst ? !!app.running[inst.id] : false);
	const others = $derived(
		app.instances
			.filter((i) => i.id !== inst?.id)
			.sort((a, b) => (b.lastPlayedAt ?? b.createdAt).localeCompare(a.lastPlayedAt ?? a.createdAt))
	);

	async function play(serverAddress?: string) {
		let targetInst = inst;
		if (!targetInst) {
			targetInst = app.newInstance({
				name: 'TropicaliaCraft (Rust)',
				gameVersion: '26.3',
				loader: 'horizon-rust',
				engine: 'rust',
				icon: 'creeper',
				memory: { minMb: 512, maxMb: app.settings.defaultMemoryMb || 4096 }
			});
		}
		try {
			await app.play(targetInst, serverAddress);
		} catch (e) {
			toasts.err(e);
		}
	}

	/** aba ativa fica na URL (?aba=criar) para o voltar do Android funcionar */
	const tab = $derived(page.url.searchParams.get('aba') === 'criar' ? 'criar' : 'jogar');
	function setTab(id: string) {
		const url = new URL(page.url);
		if (id === 'criar') url.searchParams.set('aba', 'criar');
		else url.searchParams.delete('aba');
		goto(url, { replaceState: false, noScroll: true, keepFocus: true });
	}
</script>

<div class="home-tabs mx-auto max-w-[1080px]" role="tablist" aria-label="Início">
	<button role="tab" aria-selected={tab === 'jogar'} class:active={tab === 'jogar'} onclick={() => setTab('jogar')}>
		<Play size={16} strokeWidth={2.5} /> <span>{tr('Jogar')}</span>
	</button>
	<button role="tab" aria-selected={tab === 'criar'} class:active={tab === 'criar'} onclick={() => setTab('criar')}>
		<Server size={16} strokeWidth={2.5} /> <span>{tr('Criar servidor')}</span>
	</button>
</div>

{#if tab === 'criar'}
	<ServerManager initialId={page.url.searchParams.get('id')} />
{:else}
<div class="mx-auto flex max-w-[1080px] flex-col gap-6">
	{#if inst}
		<TropicaliaCard size="lg" class="hero">
			<div class="hero-bg" aria-hidden="true"></div>
			<div class="relative flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6">
				<div class="float shrink-0"><BlockIcon icon={inst.icon || DEFAULT_LOADER_ICON[inst.loader]} size={84} /></div>
				<div class="min-w-0 flex-1">
					<p class="font-mc text-[11px] tracking-[0.2em] text-[#4ade80]">{running ? tr("JOGANDO AGORA") : tr("CONTINUAR JOGANDO")}</p>
					<h1 class="font-mc mc-shadow mt-1.5 truncate text-[22px] sm:text-[28px] leading-tight text-white">{inst.name}</h1>
					<div class="mt-2.5 flex flex-wrap justify-center sm:justify-start gap-1.5">
						<Badge tone={LOADER_TONE[inst.loader] ?? 'green'} pixel>{LOADER_LABEL[inst.loader]}</Badge>
						<Badge tone="blue" pixel>{inst.gameVersion}</Badge>
						{#if inst.loaderVersion}<Badge>{inst.loaderVersion}</Badge>{/if}
						{#if inst.loader !== 'horizon-rust'}
							<Badge><MemoryStick size={11} /> {(inst.memory.maxMb / 1024).toFixed(1)} GB</Badge>
						{/if}
						<Badge>⏱ {formatPlaytime(inst.playTimeMinutes)}</Badge>
					</div>
					<p class="tp-muted mt-2 text-xs">{tr("Última vez:")} {timeAgo(inst.lastPlayedAt)}{inst.modpack ? ` · modpack ${inst.modpack.name}` : ''}</p>
				</div>
			</div>

			<div class="relative mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full">
				<div class="w-full sm:w-auto">
					{#if running}
						<PixelButton size="play" variant="danger" icon={Square} class="w-full sm:w-auto" onclick={() => app.stopGame(inst.id).catch(toasts.err)}>{tr("Fechar jogo")}</PixelButton>
					{:else}
						<PixelButton size="play" variant="emerald" icon={Play} class="w-full sm:w-auto" loading={task?.busy || !!app.contentOperations[inst.id]} onclick={() => play()}>{tr("Jogar")}</PixelButton>
					{/if}
				</div>
				<div class="grid grid-cols-2 sm:flex items-center gap-2.5 w-full sm:w-auto">
					<PixelButton icon={Settings2} class="w-full sm:w-auto justify-center" onclick={() => openConfig(inst)}>{tr("Configurar")}</PixelButton>
					<PixelButton icon={Package} class="w-full sm:w-auto justify-center" onclick={() => openMods(inst)}>MODS</PixelButton>
				</div>
			</div>

			{#if task?.busy}
				<div class="relative mt-5">
					<ProgressBar
						value={task.total ? task.current / task.total : 0}
						indeterminate={!task.total || task.total <= 1}
						label={stageLabel(task.stage)}
						detail={task.total > 1 ? `${task.current}/${task.total} · ${task.message}` : task.message}
					/>
				</div>
			{/if}
			{#if !app.activeAccount}
				<p class="relative mt-4 text-[13px] text-[#fbbf24]">
					Você ainda não tem conta. <button class="underline" onclick={() => (app.accountsOpen = true)}>Entrar com Microsoft ou criar perfil offline</button>
				</p>
			{/if}
		</TropicaliaCard>
	{:else}
		<TropicaliaCard size="lg">
			<div class="flex flex-col sm:flex-row items-center gap-6 py-4 text-center sm:text-left">
				<img src="/images/tropi_creeper.png" alt="" class="pixel float h-28 sm:h-36" />
				<div>
					<h1 class="font-mc mc-shadow text-[20px] sm:text-[22px] text-white">{tr("Bem-vindo ao Tropicalia!")}</h1>
					<p class="mt-2.5 max-w-[520px] text-[13.5px] sm:text-[14px] text-[#c7d5cc]">
						Crie um perfil (Rust, Fabric, Vanilla ou Forge) para começar a jogar.
					</p>
					<div class="mt-4 flex flex-wrap justify-center sm:justify-start gap-3">
						<PixelButton variant="emerald" icon={Plus} onclick={() => (creating = true)}>{tr("Novo perfil")}</PixelButton>
					</div>
				</div>
			</div>
		</TropicaliaCard>
	{/if}

	<ServerList />

	<!-- Lista de todos os outros perfis ordenados por último jogado -->
	<TropicaliaCard title={tr("Seus perfis")}>
		{#snippet actions()}
			<PixelButton size="sm" icon={Plus} onclick={() => (creating = true)}>{tr("Novo")}</PixelButton>
		{/snippet}
		{#if others.length}
			<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
				{#each others as i (i.id)}
					<InstanceTile inst={i} onconfig={openConfig} onmods={openMods} />
				{/each}
			</div>
		{:else}
			<p class="tp-muted text-[13px]">{inst ? tr('Só esse perfil por enquanto. Clique em Novo para criar outro.') : tr('Nenhum perfil ainda.')}</p>
		{/if}
	</TropicaliaCard>

</div>
{/if}

<NewInstanceModal bind:open={creating} />
<InstanceConfigModal bind:open={configModalOpen} instance={modalInstance} onopenmods={openMods} />
<InstanceModsModal bind:open={modsModalOpen} instance={modalInstance} />


<style>
	:global(.hero) {
		overflow: hidden;
	}
	.hero-bg {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, rgba(21, 29, 25, 0.94) 30%, rgba(21, 29, 25, 0.72)),
			url('/images/dirt.png') 0 0 / 48px 48px repeat;
		image-rendering: pixelated;
		opacity: 0.92;
	}
	.home-tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-bottom: 20px;
	}
	.home-tabs button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		min-height: 48px;
		border: 0;
		cursor: pointer;
		color: #a9bbb0;
		font-family: var(--font-minecraft);
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-shadow: 1px 1px 0 #000;
		background: var(--tp-panel-2);
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -3px 0 #0a0e0c, 0 0 0 2px #000;
		transition: color 120ms ease, background 120ms ease;
	}
	.home-tabs button:hover {
		color: #fff;
	}
	.home-tabs button:focus-visible {
		outline: 2px solid var(--tp-emerald);
		outline-offset: 2px;
	}
	.home-tabs button.active {
		color: #fff;
		background: linear-gradient(#166534, #0f3d22);
		box-shadow: inset 0 2px 0 #22c55e55, inset 2px 0 0 #22c55e33, inset -2px 0 0 #0a0e0c, inset 0 -4px 0 var(--tp-emerald), 0 0 0 2px #000;
	}
	.home-tabs button.active :global(svg) {
		color: #bef264;
	}
	@media (max-width: 767px) {
		.home-tabs {
			margin-bottom: 14px;
		}
		.home-tabs button {
			font-size: 11.5px;
		}
	}
</style>
