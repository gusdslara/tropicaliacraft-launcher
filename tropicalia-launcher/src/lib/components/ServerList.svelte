<!-- Lista "Servidores" da tela inicial, como o multiplayer do jogo: ícone, MOTD, ping real, jogadores e o perfil usado para entrar.
     Junta o TropicaliaCraft oficial (sempre adicionado), os servidores salvos, os servidores dos perfis, os servidores criados
     neste aparelho e os mundos/servidores anunciados na LAN. -->
<script lang="ts">
	import TropicaliaCard from '$lib/components/TropicaliaCard.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import BlockIcon from '$lib/components/BlockIcon.svelte';
	import McText from '$lib/components/McText.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import { call, isTauri } from '$lib/platform';
	import { engine } from '$lib/services/server-engines';
	import { componentToMc } from '$lib/util/mc-text';
	import { DEFAULT_LOADER_ICON, LOADER_LABEL, LOADER_TONE } from '$lib/util/format';
	import type { Instance, LocalServer, PingResult, SavedServer } from '$lib/types';
	import { tr } from '$lib/ui-text';
	import { onDestroy, onMount } from 'svelte';
	import { Check, ChevronDown, LogIn, Pencil, Plus, Radar, RotateCw, Smartphone, Trash2, Wifi, WifiOff } from 'lucide-svelte';

	type Kind = 'saved' | 'profile' | 'local' | 'lan';
	interface Row {
		key: string;
		name: string;
		address: string;
		kind: Kind;
		saved?: SavedServer;
		instance?: Instance;
		local?: LocalServer;
		lanMotd?: string;
	}

	const norm = (a: string) => a.trim().toLowerCase();
	const instById = (id?: string) => (id ? app.instances.find((i) => i.id === id) : undefined);

	/** porta de cada servidor criado aqui (lida do server.properties) */
	let localPorts = $state<Record<string, string>>({});
	$effect(() => {
		if (!isTauri) return;
		for (const s of app.servers) {
			if (localPorts[s.id]) continue;
			call<Record<string, string>>('server_read_properties', { serverId: s.id })
				.then((p) => (localPorts[s.id] = p['server-port'] || '25565'))
				.catch(() => (localPorts[s.id] = '25565'));
		}
	});

	const rows = $derived.by<Row[]>(() => {
		const out: Row[] = [];
		const seen = new Set<string>();
		const push = (r: Row) => {
			const k = norm(r.address);
			if (seen.has(k)) return;
			seen.add(k);
			out.push(r);
		};
		for (const s of app.savedServers) {
			push({ key: s.id, name: s.name, address: s.address, kind: 'saved', saved: s, instance: instById(s.instanceId) });
		}
		for (const i of app.instances) {
			const a = i.autoJoin?.trim();
			if (a) push({ key: `inst-${i.id}`, name: a, address: a, kind: 'profile', instance: i });
		}
		for (const s of app.servers) {
			push({ key: `local-${s.id}`, name: s.name, address: `127.0.0.1:${localPorts[s.id] ?? '25565'}`, kind: 'local', local: s });
		}
		for (const l of app.lanServers) {
			push({ key: `lan-${l.address}`, name: l.motd, address: l.address, kind: 'lan', lanMotd: l.motd });
		}
		return out;
	});

	function refresh(all = true) {
		for (const r of rows) {
			// Servidor do aparelho parado não responde: nem tenta.
			if (r.kind === 'local' && app.serverStatus[r.local!.id] !== 'running') continue;
			if (all || !app.ping(r.address)) void app.pingServer(r.address);
		}
	}

	let timer: ReturnType<typeof setInterval> | undefined;
	onMount(() => {
		refresh(false);
		void app.scanLan();
		timer = setInterval(() => refresh(true), 30_000);
	});
	onDestroy(() => clearInterval(timer));

	// Pinga quem entrou na lista depois (servidor novo, LAN descoberta, servidor local que subiu).
	$effect(() => {
		for (const r of rows) {
			const up = r.kind !== 'local' || app.serverStatus[r.local!.id] === 'running';
			if (up && app.ping(r.address) === undefined) void app.pingServer(r.address);
		}
	});

	const pingOf = (r: Row): PingResult | 'loading' | undefined => app.ping(r.address);
	const motdOf = (p: PingResult | 'loading' | undefined, r: Row) => {
		if (p && p !== 'loading' && p.online && p.motd != null) return componentToMc(p.motd);
		if (r.kind === 'lan') return `§7${r.lanMotd ?? ''}`;
		if (r.kind === 'local') return `§7${engine(r.local!.engine).name} ${r.local!.minecraftVersion} · ${app.serverStatus[r.local!.id] === 'running' ? 'no ar' : 'parado'}`;
		return '';
	};
	const bars = (ms?: number | null) => (ms == null ? 0 : ms < 80 ? 5 : ms < 150 ? 4 : ms < 250 ? 3 : ms < 500 ? 2 : 1);
	const pingTone = (ms?: number | null) => (ms == null ? '' : ms < 100 ? 'good' : ms < 200 ? 'ok' : 'bad');

	// ------------------------------------------------------------ entrar
	/** Escolha de perfil dos servidores que não são salvos (LAN, deste aparelho, de perfil). */
	let picked = $state<Record<string, string>>({});

	const serverVersion = (r: Row) => {
		const p = pingOf(r);
		return p && p !== 'loading' && p.online ? (p.version ?? '') : (r.local?.minecraftVersion ?? '');
	};
	const rustFirst = (list: Instance[]) =>
		[...list].sort((a, b) => Number(b.loader === 'horizon-rust') - Number(a.loader === 'horizon-rust'));

	/** Perfis que entram neste servidor: os da mesma versão do Minecraft (Rust primeiro). Sem versão conhecida, todos. */
	function compatible(r: Row): Instance[] {
		const v = serverVersion(r);
		const same = v ? app.instances.filter((i) => v.includes(i.gameVersion)) : [];
		const list = same.length ? same : app.instances;
		const current = currentInstance(r);
		return rustFirst(current && !list.includes(current) ? [current, ...list] : list);
	}

	/** Perfil usado: o escolhido para o servidor; senão Rust, senão um da mesma versão, senão o último jogado. */
	function currentInstance(r: Row): Instance | undefined {
		const chosen = instById(r.saved ? r.saved.instanceId : (picked[r.key] ?? r.instance?.id));
		if (chosen) return chosen;
		const v = serverVersion(r);
		const rust = app.instances.filter((i) => i.loader === 'horizon-rust');
		return (
			rust.find((i) => !v || v.includes(i.gameVersion)) ??
			app.instances.find((i) => v && v.includes(i.gameVersion)) ??
			rust[0] ??
			app.lastInstance ??
			app.instances[0]
		);
	}

	/** Trocar o perfil no seletor já vira o perfil deste servidor na lista. */
	function choose(r: Row, id: string) {
		if (r.saved) app.updateSavedServer(r.saved.id, { instanceId: id });
		else picked[r.key] = id;
	}

	async function join(r: Row) {
		const inst = currentInstance(r);
		if (!inst) return toasts.err(new Error('Crie uma instância para entrar no servidor.'));
		if (r.saved && r.saved.instanceId !== inst.id) app.updateSavedServer(r.saved.id, { instanceId: inst.id });
		try {
			await app.play(inst, r.address);
		} catch (e) {
			toasts.err(e);
		}
	}

	// ------------------------------------------------------------ adicionar / editar
	let editOpen = $state(false);
	let editing = $state<SavedServer | null>(null);
	let fName = $state('');
	let fAddress = $state('');
	let fInstance = $state('');
	let removeTarget = $state<SavedServer | null>(null);

	function openAdd() {
		editing = null;
		fName = '';
		fAddress = '';
		fInstance = (app.instances.find((i) => i.loader === 'horizon-rust') ?? app.instances[0])?.id ?? '';
		editOpen = true;
	}

	function openEdit(s: SavedServer) {
		editing = s;
		fName = s.name;
		fAddress = s.address;
		fInstance = s.instanceId ?? '';
		editOpen = true;
	}

	function saveForm() {
		try {
			if (editing) {
				const addressChanged = norm(editing.address) !== norm(fAddress);
				app.updateSavedServer(editing.id, { name: fName.trim() || fAddress.trim(), address: fAddress.trim(), instanceId: fInstance || undefined });
				if (addressChanged) void app.pingServer(fAddress);
			} else {
				app.addSavedServer({ name: fName, address: fAddress, instanceId: fInstance || undefined });
				toasts.ok(`${fName.trim() || fAddress.trim()} adicionado`);
			}
			editOpen = false;
		} catch (e) {
			toasts.err(e);
		}
	}

	// prévia ao vivo do endereço digitado
	let previewTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const a = fAddress.trim();
		if (!editOpen || a.length < 3) return;
		clearTimeout(previewTimer);
		previewTimer = setTimeout(() => app.ping(a) === undefined && app.pingServer(a), 700);
	});
	const preview = $derived(editOpen && fAddress.trim().length >= 3 ? app.ping(fAddress) : undefined);
</script>

<TropicaliaCard title={tr('Servidores')}>
	{#snippet actions()}
		<PixelButton size="sm" icon={RotateCw} title={tr('Atualizar ping e procurar na LAN')} loading={app.lanScanning} onclick={() => (refresh(true), app.scanLan())} />
		<PixelButton size="sm" variant="emerald" icon={Plus} onclick={openAdd}>{tr('Adicionar')}</PixelButton>
	{/snippet}

	<ul class="flex flex-col gap-4" aria-label={tr('Servidores')}>
		{#each rows as r (r.key)}
			{@const p = pingOf(r)}
			{@const res = p && p !== 'loading' ? p : undefined}
			{@const inst = currentInstance(r)}
			{@const options = compatible(r)}
			{@const busy = !!(inst && (app.tasks[inst.id]?.busy || app.running[inst.id]))}
			<li class="srv tp-slot" class:off={res && !res.online} class:official={r.saved?.builtin}>
				<div class="head">
					<span class="icon">
						{#if res?.favicon}
							<img src={res.favicon} alt="" class="pixel" />
						{:else if r.kind === 'local'}
							<span class="ph local"><Smartphone size={24} /></span>
						{:else if r.kind === 'lan'}
							<span class="ph lan"><Wifi size={24} /></span>
						{:else}
							<img src="/images/grass-block-side.png" alt="" class="pixel opacity-70" />
						{/if}
					</span>

					<div class="body">
						<div class="title">
							<b class="font-mc mc-shadow-sm truncate">{r.name}</b>
							{#if r.saved?.builtin}<Badge tone="green" pixel><Check size={10} /> {tr('Oficial')}</Badge>{/if}
							{#if r.kind === 'lan'}<Badge tone="blue" pixel><Radar size={10} /> LAN</Badge>{/if}
							{#if r.kind === 'local'}<Badge tone="gold" pixel><Smartphone size={10} /> {tr('Este aparelho')}</Badge>{/if}
						</div>
						<div class="status">
							{#if p === 'loading'}
								<span class="tp-muted">{tr('pingando…')}</span>
							{:else if res?.online}
								<span class="dot" aria-hidden="true"></span>
								<span><b class="text-[#4ade80]">{res.playersOnline ?? 0}</b><span class="tp-muted">/{res.playersMax ?? 0} {tr('jogadores')}</span></span>
								{#if res.latencyMs != null}
									<span class="ping {pingTone(res.latencyMs)}" title="{res.latencyMs} ms">
										<span class="bars" aria-hidden="true">{#each [1, 2, 3, 4, 5] as b (b)}<i class:on={b <= bars(res.latencyMs)}></i>{/each}</span>
										{res.latencyMs}ms
									</span>
								{/if}
							{:else if res}
								<span class="ping bad" title={res.error ?? ''}><WifiOff size={13} /> {tr('offline')}</span>
							{:else}
								<span class="tp-muted font-mono">{r.address}</span>
							{/if}
						</div>
						{#if motdOf(p, r)}<div class="motd"><McText text={motdOf(p, r)} /></div>{/if}
						<div class="play">
							<label class="pick">
								<span class="pick-label">{tr('Entrar neste servidor com')}</span>
								<span class="pick-box">
									{#if inst}<BlockIcon icon={inst.icon || DEFAULT_LOADER_ICON[inst.loader]} size={22} />{/if}
									<span class="pick-text">
										<span class="pick-name">{inst?.name ?? tr('Nenhuma instância')}</span>
										{#if inst}
											<span class="pick-sub">
												<Badge tone={LOADER_TONE[inst.loader] ?? 'green'}>{inst.loader === 'horizon-rust' ? 'Rust' : 'Java'}</Badge>
												<span class="tp-muted truncate">{inst.gameVersion}</span>
											</span>
										{/if}
									</span>
									{#if options.length > 1}<ChevronDown size={18} class="shrink-0 text-[#93a59a]" />{/if}
									<select
										class="pick-select"
										aria-label="{tr('Instância para entrar em')} {r.name}"
										value={inst?.id ?? ''}
										disabled={options.length < 2 || busy}
										onchange={(e) => choose(r, e.currentTarget.value)}
									>
										{#each options as i (i.id)}
											<option value={i.id}>{i.name} · {i.loader === 'horizon-rust' ? 'Rust' : 'Java'} {i.gameVersion}</option>
										{/each}
									</select>
								</span>
							</label>
							<PixelButton variant="emerald" icon={LogIn} loading={busy} disabled={!inst || busy} onclick={() => join(r)}>
								{busy ? tr('Abrindo…') : tr('Entrar')}
							</PixelButton>
						</div>
					</div>

					{#if r.saved && !r.saved.builtin}
						<div class="side">
							<PixelButton size="sm" variant="ghost" icon={Pencil} title={tr('Editar')} onclick={() => openEdit(r.saved!)} />
							<PixelButton size="sm" variant="ghost" icon={Trash2} title={tr('Remover')} onclick={() => (removeTarget = r.saved!)} />
						</div>
					{/if}
				</div>

			</li>
		{/each}
	</ul>

	{#if app.lanScanning}
		<p class="tp-muted mt-3 flex items-center gap-2 text-[12px]"><Radar size={14} class="animate-pulse text-[#4ade80]" /> {tr('Procurando mundos e servidores na rede local…')}</p>
	{/if}
</TropicaliaCard>

<!-- Adicionar / editar -->
<Modal bind:open={editOpen} title={editing ? (editing.builtin ? tr('Perfil do TropicaliaCraft') : tr('Editar servidor')) : tr('Adicionar servidor')} width={500}>
	<div class="grid gap-4">
		{#if !editing?.builtin}
			<div>
				<label class="tp-label" for="srv-name">{tr('Nome do servidor')}</label>
				<input id="srv-name" class="tp-input" bind:value={fName} placeholder="Servidor da galera" maxlength="48" />
			</div>
			<div>
				<label class="tp-label" for="srv-addr">{tr('Endereço')}</label>
				<input
					id="srv-addr"
					class="tp-input font-mono"
					bind:value={fAddress}
					placeholder="play.exemplo.com ou 192.168.0.10:25565"
					autocapitalize="off"
					autocorrect="off"
					spellcheck="false"
					inputmode="url"
				/>
				<p class="tp-help" aria-live="polite">
					{#if preview === 'loading'}
						{tr('Testando conexão…')}
					{:else if preview?.online}
						<span class="text-[#4ade80]">● {tr('Online')}</span> · {preview.latencyMs} ms · {preview.playersOnline}/{preview.playersMax} · {preview.version}
					{:else if preview}
						<span class="text-[#f87171]">● {tr('Sem resposta')}</span> {preview.error ? `· ${preview.error}` : ''}
					{:else}
						{tr('Porta padrão 25565. Registros SRV são resolvidos automaticamente.')}
					{/if}
				</p>
			</div>
		{/if}
		<div>
			<label class="tp-label" for="srv-inst">{tr('Perfil para entrar')}</label>
			<select id="srv-inst" class="tp-select" bind:value={fInstance}>
				<option value="">{tr('Perguntar na hora')}</option>
				{#each app.instances as i (i.id)}
					<option value={i.id}>{i.name} · {LOADER_LABEL[i.loader]} {i.gameVersion}</option>
				{/each}
			</select>
		</div>
	</div>
	{#snippet footer()}
		<PixelButton variant="ghost" onclick={() => (editOpen = false)}>{tr('Cancelar')}</PixelButton>
		<PixelButton variant="emerald" icon={Check} disabled={!editing?.builtin && !fAddress.trim()} onclick={saveForm}>{editing ? tr('Salvar') : tr('Adicionar')}</PixelButton>
	{/snippet}
</Modal>

<Modal open={!!removeTarget} onclose={() => (removeTarget = null)} title={tr('Remover servidor?')} width={420}>
	<p class="text-[13.5px] text-[#c7d5cc]"><b class="text-white">{removeTarget?.name}</b> {tr('sai da sua lista. Dá para adicionar de novo depois.')}</p>
	{#snippet footer()}
		<PixelButton variant="ghost" onclick={() => (removeTarget = null)}>{tr('Cancelar')}</PixelButton>
		<PixelButton
			variant="danger"
			icon={Trash2}
			onclick={() => {
				if (removeTarget) app.removeSavedServer(removeTarget.id);
				removeTarget = null;
			}}>{tr('Remover')}</PixelButton
		>
	{/snippet}
</Modal>

<style>
	.srv {
		display: flex;
		flex-direction: column;
		padding: 0;
		min-width: 0;
		border: 2px solid #24322b;
		background: #121a16;
	}
	.srv.official {
		border-color: #10b981;
		background: linear-gradient(180deg, #11241a 0%, #121a16 70%);
	}
	.srv.off .icon img {
		filter: grayscale(0.8) brightness(0.7);
	}
	.head {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px;
		min-width: 0;
	}
	.icon {
		flex: none;
		width: 52px;
		height: 52px;
		box-shadow: 0 0 0 2px #000;
		background: #0b100e;
	}
	.icon img {
		width: 100%;
		height: 100%;
		image-rendering: pixelated;
		object-fit: cover;
	}
	.ph {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
	}
	.ph.local {
		color: #fbbf24;
		background: linear-gradient(#2a2410, #15120a);
	}
	.ph.lan {
		color: #60a5fa;
		background: linear-gradient(#10203a, #0a1222);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		flex: 1;
	}
	.title {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
		min-width: 0;
	}
	.title b {
		min-width: 0;
		font-size: 14px;
		color: #fff;
	}
	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
		font-size: 12px;
	}
	.dot {
		width: 8px;
		height: 8px;
		background: #4ade80;
		box-shadow: 0 0 0 1px #000, 0 0 6px #4ade80;
	}
	.ping {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--tp-muted);
		font-family: var(--font-minecraft);
		font-size: 11px;
	}
	.ping.good { color: #4ade80; }
	.ping.ok { color: #fbbf24; }
	.ping.bad { color: #f87171; }
	.bars {
		display: inline-flex;
		align-items: flex-end;
		gap: 1px;
		height: 12px;
	}
	.bars i {
		width: 3px;
		background: #2a3a31;
		box-shadow: 0 0 0 1px #000;
	}
	.bars i:nth-child(1) { height: 3px; }
	.bars i:nth-child(2) { height: 5px; }
	.bars i:nth-child(3) { height: 7px; }
	.bars i:nth-child(4) { height: 9px; }
	.bars i:nth-child(5) { height: 12px; }
	.bars i.on { background: currentColor; }
	.motd {
		font-family: var(--font-minecraft);
		font-size: 11.5px;
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.side {
		display: flex;
		gap: 4px;
		flex: none;
	}
	/* Fica dentro da coluna do servidor, alinhado ao nome: é claramente "deste servidor". */
	.play {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		margin-top: 8px;
		min-width: 0;
	}
	.pick {
		display: flex;
		flex-direction: column;
		gap: 5px;
		flex: 1;
		min-width: 0;
	}
	.pick-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #93a59a;
	}
	.pick-box {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 48px;
		padding: 6px 10px;
		background: var(--tp-panel-3);
		box-shadow: inset 2px 2px 0 0 #050706, inset -2px -2px 0 0 #24322b, 0 0 0 1px #000;
	}
	.pick-box:focus-within {
		box-shadow: inset 2px 2px 0 0 #050706, inset -2px -2px 0 0 #24322b, 0 0 0 2px var(--tp-emerald);
	}
	.pick-box:hover {
		background: #1a2620;
	}
	.pick-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.pick-name {
		white-space: normal;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		line-height: 1.25;
		font-size: 13px;
		font-weight: 600;
		color: #fff;
	}
	.pick-sub {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		min-width: 0;
	}
	/* O <select> nativo cobre a caixa: no celular abre a lista do sistema, acessível e por toque. */
	.pick-select {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		font-size: 16px;
	}
	.pick-select:disabled {
		cursor: default;
	}
	.play :global(button) {
		min-height: 48px;
		flex: none;
	}
	@media (max-width: 480px) {
		.icon {
			width: 44px;
			height: 44px;
		}
		.head {
			gap: 10px;
			padding: 10px 10px 8px;
		}
		.play {
			flex-direction: column;
			align-items: stretch;
		}
		.play :global(button) {
			width: 100%;
			justify-content: center;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.srv { transition: none; }
	}
</style>
