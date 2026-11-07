<!-- Início: sempre abre na última instância jogada, com o JOGAR gigante pronto para 1 clique. -->
<script lang="ts">
	import TropicaliaCard from '$lib/components/TropicaliaCard.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import BlockIcon from '$lib/components/BlockIcon.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import InstanceTile from '$lib/components/InstanceTile.svelte';
	import NewInstanceModal from '$lib/components/NewInstanceModal.svelte';
	import { app, stageLabel, toasts } from '$lib/state.svelte';
	import { getJson } from '$lib/platform';
	import { formatPlaytime, LOADER_LABEL, timeAgo } from '$lib/util/format';
	import { goto } from '$app/navigation';
	import { Compass, LogIn, MemoryStick, Play, Plus, Server, Settings2, Square, Users } from 'lucide-svelte';

	let creating = $state(false);

	const inst = $derived(app.lastInstance);
	const task = $derived(inst ? app.tasks[inst.id] : undefined);
	const running = $derived(inst ? !!app.running[inst.id] : false);
	const others = $derived(
		app.instances
			.filter((i) => i.id !== inst?.id)
			.sort((a, b) => (b.lastPlayedAt ?? b.createdAt).localeCompare(a.lastPlayedAt ?? a.createdAt))
			.slice(0, 6)
	);

	const OFFICIAL = [
		{ name: 'Cross-play', address: 'tropicaliacraft.online', desc: 'PC + celular + consoles' },
		{ name: 'Java Mods', address: 'mods.tropicaliacraft.online', desc: 'Servidor Java com mods' }
	];
	type Status = { online: boolean; players?: { online: number; max: number }; version?: string };
	let status = $state<Record<string, Status | null>>({});

	$effect(() => {
		for (const s of OFFICIAL) {
			getJson<Status>(`https://api.mcsrvstat.us/3/${s.address}`)
				.then((r) => (status[s.address] = r))
				.catch(() => (status[s.address] = null));
		}
	});

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

	const localServers = $derived(app.servers.slice(0, 4));
</script>

<div class="mx-auto grid max-w-[1280px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
	<div class="flex min-w-0 flex-col gap-6">
		{#if inst}
			<TropicaliaCard size="lg" class="hero">
				<div class="hero-bg" aria-hidden="true"></div>
				<div class="relative flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6">
					<div class="float shrink-0"><BlockIcon icon={inst.icon} size={84} /></div>
					<div class="min-w-0 flex-1">
						<p class="font-mc text-[11px] tracking-[0.2em] text-[#4ade80]">{running ? 'JOGANDO AGORA' : 'CONTINUAR JOGANDO'}</p>
						<h1 class="font-mc mc-shadow mt-1.5 truncate text-[22px] sm:text-[28px] leading-tight text-white">{inst.name}</h1>
						<div class="mt-2.5 flex flex-wrap justify-center sm:justify-start gap-1.5">
							<Badge tone="green" pixel>{LOADER_LABEL[inst.loader]}</Badge>
							<Badge tone="blue" pixel>{inst.gameVersion}</Badge>
							{#if inst.loaderVersion}<Badge>{inst.loaderVersion}</Badge>{/if}
							{#if inst.loader === 'horizon-rust'}
								<Badge tone="green">Vulkan Nativo</Badge>
							{:else}
								<Badge><MemoryStick size={11} /> {(inst.memory.maxMb / 1024).toFixed(1)} GB</Badge>
							{/if}
							<Badge>{Object.keys(inst.content).length} itens</Badge>
							<Badge>⏱ {formatPlaytime(inst.playTimeMinutes)}</Badge>
						</div>
						<p class="tp-muted mt-2 text-xs">Última vez: {timeAgo(inst.lastPlayedAt)}{inst.modpack ? ` · modpack ${inst.modpack.name}` : ''}</p>
					</div>
				</div>

				<div class="relative mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full">
					<div class="w-full sm:w-auto">
						{#if running}
							<PixelButton size="play" variant="danger" icon={Square} class="w-full sm:w-auto" onclick={() => app.stopGame(inst.id).catch(toasts.err)}>Fechar jogo</PixelButton>
						{:else}
							<PixelButton size="play" variant="emerald" icon={Play} class="w-full sm:w-auto" loading={task?.busy} onclick={() => play()}>Jogar</PixelButton>
						{/if}
					</div>
					<div class="grid grid-cols-2 sm:flex items-center gap-2.5 w-full sm:w-auto">
						<PixelButton icon={Settings2} class="w-full sm:w-auto justify-center" onclick={() => goto(`/instancias?id=${inst.id}`)}>Configurar</PixelButton>
						<PixelButton icon={Compass} class="w-full sm:w-auto justify-center" onclick={() => goto(`/explorar?para=${inst.id}`)}>Mods</PixelButton>
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
						<h1 class="font-mc mc-shadow text-[20px] sm:text-[22px] text-white">Bem-vindo ao Tropicalia!</h1>
						<p class="mt-2.5 max-w-[520px] text-[13.5px] sm:text-[14px] text-[#c7d5cc]">
							Crie uma instância (Vanilla, Fabric, Quilt, Forge ou NeoForge) ou instale um modpack pronto do Modrinth.
							O launcher baixa o Java certo, as bibliotecas e os assets sozinho.
						</p>
						<div class="mt-4 flex flex-wrap justify-center sm:justify-start gap-3">
							<PixelButton variant="emerald" icon={Plus} onclick={() => (creating = true)}>Nova instância</PixelButton>
							<PixelButton icon={Compass} onclick={() => goto('/explorar?tipo=modpack')}>Ver modpacks</PixelButton>
						</div>
					</div>
				</div>
			</TropicaliaCard>
		{/if}

		<TropicaliaCard title="Suas instâncias" subtitle="Clique no ▶ para abrir direto">
			{#snippet actions()}
				<PixelButton size="sm" icon={Plus} onclick={() => (creating = true)}>Nova</PixelButton>
			{/snippet}
			{#if others.length}
				<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
					{#each others as i (i.id)}<InstanceTile inst={i} />{/each}
				</div>
			{:else}
				<p class="tp-muted text-[13px]">{inst ? 'Só essa por enquanto. Que tal criar uma com mods?' : 'Nenhuma instância ainda.'}</p>
			{/if}
		</TropicaliaCard>
	</div>

	<aside class="flex flex-col gap-6">
		<TropicaliaCard title="TropicaliaCraft" subtitle="Servidores oficiais">
			<div class="flex flex-col gap-3">
				{#each OFFICIAL as s (s.address)}
					{@const st = status[s.address]}
					<div class="tp-slot p-3">
						<div class="flex items-center justify-between gap-2">
							<b class="font-mc mc-shadow-sm text-[12px] text-white">{s.name}</b>
							{#if st === undefined}
								<Badge>…</Badge>
							{:else if st?.online}
								<Badge tone="green"><Users size={11} /> {st.players?.online ?? 0}/{st.players?.max ?? '?'}</Badge>
							{:else}
								<Badge tone="red">offline</Badge>
							{/if}
						</div>
						<p class="tp-muted mt-1 font-mono text-[11px] selectable">{s.address}</p>
						<p class="tp-muted text-[11.5px]">{s.desc}{st?.version ? ` · ${st.version}` : ''}</p>
						<PixelButton size="xs" variant="emerald" icon={LogIn} class="mt-2.5" disabled={running} onclick={() => play(s.address)}>
							Entrar no servidor
						</PixelButton>
					</div>
				{/each}
			</div>
		</TropicaliaCard>

		<TropicaliaCard title="Servidores locais">
			{#snippet actions()}
				<PixelButton size="sm" variant="ghost" icon={Server} onclick={() => goto('/servidores')}>Abrir</PixelButton>
			{/snippet}
			{#if localServers.length}
				<div class="flex flex-col gap-2">
					{#each localServers as s (s.id)}
						{@const st = app.serverStatus[s.id] ?? 'stopped'}
						<a href="/servidores?id={s.id}" class="tp-slot flex items-center justify-between gap-2 p-2.5 no-underline">
							<span class="min-w-0">
								<b class="block truncate text-[13px] text-white">{s.name}</b>
								<small class="tp-muted text-[11.5px]">{s.engine} {s.minecraftVersion}</small>
							</span>
							<Badge tone={st === 'running' ? 'green' : st === 'crashed' ? 'red' : st === 'stopped' ? 'muted' : 'gold'}>{st === 'running' ? 'no ar' : st === 'stopped' ? 'parado' : st}</Badge>
						</a>
					{/each}
				</div>
			{:else}
				<p class="tp-muted text-[13px]">Crie um servidor híbrido (mods + plugins) para jogar com os amigos.</p>
			{/if}
		</TropicaliaCard>
	</aside>
</div>

<NewInstanceModal bind:open={creating} />

<style>
	:global(.hero) {
		overflow: hidden;
	}
	.hero-bg {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, rgba(21, 29, 25, 0.97) 35%, rgba(21, 29, 25, 0.75)),
			url('/images/grass.jpg') center / 160px;
		image-rendering: pixelated;
		opacity: 0.9;
	}
</style>
