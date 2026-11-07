<!-- Central de servidores híbridos: Magma/Mohist/Arclight (mods + plugins), Paper, Purpur e Fabric. -->
<script lang="ts">
	import TropicaliaCard from '$lib/components/TropicaliaCard.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import TabSelector from '$lib/components/TabSelector.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ConsoleView from '$lib/components/ConsoleView.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import ContentPickerInline from '$lib/components/ContentPickerInline.svelte';
	import { app, stageLabel, toasts } from '$lib/state.svelte';
	import { call, isTauri, openFolder, openUrl } from '$lib/platform';
	import { ENGINES, engine, engineVersions, PROPERTY_FIELDS, type EngineInfo } from '$lib/services/server-engines';
	import { installProjectsBatch, loadersFor, type SearchHit } from '$lib/services/modrinth';
	import type { LocalServer, ModLoader, ServerEngine, ServerStatus } from '$lib/types';
	import { errorMessage, formatBytes } from '$lib/util/format';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Check, Copy, Download, FolderOpen, Globe, Package, Play, Plus, Power, Puzzle, Save, Square, Trash2, Users, Wifi, X } from 'lucide-svelte';

	const selectedId = $derived(page.url.searchParams.get('id') ?? app.servers[0]?.id);
	const srv = $derived(app.servers.find((s) => s.id === selectedId));
	const status = $derived<ServerStatus>(srv ? (app.serverStatus[srv.id] ?? 'stopped') : 'stopped');
	const info = $derived(srv ? engine(srv.engine) : undefined);
	const live = $derived(status === 'running' || status === 'starting' || status === 'stopping');
	const task = $derived(srv ? app.tasks[srv.id] : undefined);

	const STATUS_LABEL: Record<ServerStatus, string> = {
		stopped: 'Parado',
		installing: 'Instalando',
		starting: 'Iniciando',
		running: 'No ar',
		stopping: 'Parando',
		crashed: 'Caiu'
	};
	const statusTone = (s: ServerStatus) =>
		s === 'running' ? 'green' : s === 'crashed' ? 'red' : s === 'stopped' ? 'muted' : 'gold';

	let tab = $state('console');

	// ---------------------------------------------------------------- criar (wizard)
	let wizardOpen = $state(false);
	let step = $state(1);
	let category = $state<EngineInfo['category']>('hybrid');
	let wEngine = $state<ServerEngine>('arclight');
	let wFlavor = $state('neoforge');
	let wVersion = $state('');
	let wName = $state('Servidor da galera');
	let wMemory = $state(4096);
	let wEula = $state(false);
	let wJar = $state('');
	let versions = $state<string[]>([]);
	let versionsState = $state<'idle' | 'loading' | 'error'>('idle');
	let creating = $state(false);

	// Abas e listas separadas de mods e plugins no wizard de criação
	let wActiveTab = $state<'config' | 'addons'>('config');
	let wAddonTab = $state<'mods' | 'plugins'>('mods');
	let wSelectedMods = $state<SearchHit[]>([]);
	let wSelectedPlugins = $state<SearchHit[]>([]);

	let addServerInlineOpen = $state(false);

	const wInfo = $derived(engine(wEngine));
	const wServerModLoader = $derived.by(() => {
		const f = wInfo.flavors?.find((x) => x.id === wFlavor);
		return (f?.modLoader ?? wInfo.modLoader ?? 'fabric') as ModLoader;
	});

	$effect(() => {
		const e = wEngine;
		const f = wFlavor;
		if (!wizardOpen) return;
		versionsState = 'loading';
		versions = [];
		engineVersions(e, engine(e).flavors ? f : undefined)
			.then((v) => {
				if (e !== wEngine) return;
				versions = v;
				wVersion = v[0] ?? '';
				versionsState = 'idle';
			})
			.catch(() => (versionsState = 'error'));
	});

	function pickCategory(c: EngineInfo['category']) {
		category = c;
		wEngine = ENGINES.find((e) => e.category === c)!.id;
		wActiveTab = 'config';
		wSelectedMods = [];
		wSelectedPlugins = [];
		step = 2;
	}

	async function createServer() {
		creating = true;
		try {
			const s = app.newServer({
				name: wName.trim() || 'Servidor',
				engine: wEngine,
				flavor: wInfo.flavors ? wFlavor : undefined,
				minecraftVersion: wVersion.trim(),
				memoryMb: wMemory,
				eulaAccepted: wEula,
				customJarUrl: wJar.trim() || undefined
			});

			// Instalação em lote de mods caso o usuário tenha selecionado
			if (wSelectedMods.length > 0) {
				toasts.info(`Instalando ${wSelectedMods.length} mods no servidor...`);
				await installProjectsBatch(
					wSelectedMods.map((m) => ({ id: m.project_id, title: m.title, iconUrl: m.icon_url, kind: 'mod' as const })),
					{
						ownerKind: 'server',
						owner: s,
						loaders: loadersFor('mod', wServerModLoader),
						gameVersion: wVersion.trim()
					}
				);
			}

			// Instalação em lote de plugins caso o usuário tenha selecionado
			if (wSelectedPlugins.length > 0) {
				toasts.info(`Instalando ${wSelectedPlugins.length} plugins no servidor...`);
				await installProjectsBatch(
					wSelectedPlugins.map((p) => ({ id: p.project_id, title: p.title, iconUrl: p.icon_url, kind: 'plugin' as const })),
					{
						ownerKind: 'server',
						owner: s,
						loaders: loadersFor('plugin', 'vanilla'),
						gameVersion: wVersion.trim()
					}
				);
			}

			app.saveServers();
			wizardOpen = false;
			step = 1;
			wSelectedMods = [];
			wSelectedPlugins = [];
			wActiveTab = 'config';
			goto(`/servidores?id=${s.id}`);
			if (isTauri) await app.installServer(s);
			toasts.ok(`Servidor "${s.name}" configurado com sucesso!`);
		} catch (e) {
			toasts.err(e);
		} finally {
			creating = false;
		}
	}

	// ---------------------------------------------------------------- propriedades
	let props = $state<Record<string, string>>({});
	let propsLoaded = $state<string | null>(null);
	$effect(() => {
		const s = srv;
		if (!s || tab !== 'props' || propsLoaded === s.id) return;
		propsLoaded = s.id;
		if (!isTauri) return;
		call<Record<string, string>>('server_read_properties', { serverId: s.id })
			.then((p) => (props = p))
			.catch(toasts.err);
	});
	async function saveProps() {
		try {
			await call('server_write_properties', { serverId: srv!.id, values: $state.snapshot(props) });
			toasts.ok(live ? 'Salvo. Reinicie o servidor para aplicar.' : 'server.properties salvo');
		} catch (e) {
			toasts.err(e);
		}
	}

	// ---------------------------------------------------------------- conteúdo
	type Row = { filename: string; enabled: boolean; size: number };
	let rows = $state<Row[]>([]);
	const contentKind = $derived(tab === 'plugins' ? 'plugin' : 'mod');
	async function loadRows() {
		if (!srv || !isTauri || (tab !== 'plugins' && tab !== 'mods')) return;
		rows = await call<Row[]>('content_list', { ownerKind: 'server', ownerId: srv.id, kind: contentKind }).catch(() => []);
	}
	$effect(() => {
		void srv?.id;
		void tab;
		void Object.keys(srv?.content ?? {}).length;
		loadRows();
	});
	async function toggleRow(r: Row, enabled: boolean) {
		await call('content_toggle', { ownerKind: 'server', ownerId: srv!.id, kind: contentKind, filename: r.filename, enabled }).catch(toasts.err);
		loadRows();
	}
	async function deleteRow(r: Row) {
		await call('content_delete', { ownerKind: 'server', ownerId: srv!.id, kind: contentKind, filename: r.filename }).catch(toasts.err);
		delete srv!.content[r.filename];
		app.saveServers();
		loadRows();
	}

	// ---------------------------------------------------------------- ações
	let ips = $state<string[]>([]);
	$effect(() => {
		if (isTauri) call<string[]>('local_ips').then((v) => (ips = v)).catch(() => {});
	});
	const port = $derived(props['server-port'] || '25565');

	async function start() {
		try {
			await app.startServer(srv!);
			tab = 'console';
		} catch (e) {
			toasts.err(e);
		}
	}

	let deleteOpen = $state(false);
	async function doDelete() {
		deleteOpen = false;
		try {
			await app.deleteServer(srv!.id);
			goto('/servidores');
		} catch (e) {
			toasts.err(e);
		}
	}

	function copy(text: string) {
		navigator.clipboard.writeText(text).then(() => toasts.ok('Copiado!'));
	}

	const detailTabs = $derived([
		{ id: 'console', label: 'Console' },
		{ id: 'props', label: 'Propriedades' },
		...(info?.accepts.includes('plugin') ? [{ id: 'plugins', label: 'Plugins', count: Object.values(srv?.content ?? {}).filter((c) => c.kind === 'plugin').length }] : []),
		...(info?.accepts.includes('mod') ? [{ id: 'mods', label: 'Mods', count: Object.values(srv?.content ?? {}).filter((c) => c.kind === 'mod').length }] : []),
		{ id: 'friends', label: 'Jogar com amigos' }
	]);
</script>

<div class="mx-auto grid h-full max-w-[1320px] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-5 md:gap-6">
	<TropicaliaCard title="Servidores" class="flex min-h-0 flex-col max-h-none md:max-h-full">
		{#snippet actions()}
			<PixelButton size="sm" variant="emerald" icon={Plus} title="Novo servidor" onclick={() => ((wizardOpen = true), (step = 1))}>
				<span class="hidden sm:inline">Novo</span>
			</PixelButton>
		{/snippet}
		<div class="-mx-1 flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto px-1 pb-1 md:pb-0 scrollbar-none">
			{#each app.servers as s (s.id)}
				{@const st = app.serverStatus[s.id] ?? 'stopped'}
				<a href="/servidores?id={s.id}" class="item shrink-0 w-[180px] md:w-auto" class:active={s.id === srv?.id}>
					<span class="lamp {st} shrink-0"></span>
					<span class="min-w-0 flex-1">
						<b class="block truncate text-[13px]">{s.name}</b>
						<small class="tp-muted block truncate text-[11.5px]">{engine(s.engine).name} {s.minecraftVersion}</small>
					</span>
				</a>
			{:else}
				<p class="tp-muted text-[13px]">Nenhum servidor ainda.</p>
			{/each}
		</div>
	</TropicaliaCard>

	{#if srv && info}
		<div class="flex min-w-0 flex-col gap-5 md:gap-6">
			<TropicaliaCard size="lg">
				<div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5">
					<div class="flex items-center gap-3.5 w-full sm:w-auto">
						<div class="engine-badge {info.category} shrink-0">{info.name.slice(0, 2).toUpperCase()}</div>
						<div class="min-w-0 flex-1 sm:hidden">
							<h1 class="font-mc mc-shadow truncate text-[18px] text-white">{srv.name}</h1>
							<div class="mt-1 flex flex-wrap gap-1">
								<Badge tone={statusTone(status)} pixel>{STATUS_LABEL[status]}</Badge>
							</div>
						</div>
					</div>
					<div class="min-w-0 flex-1 hidden sm:block">
						<h1 class="font-mc mc-shadow truncate text-[20px] text-white">{srv.name}</h1>
						<div class="mt-2 flex flex-wrap gap-1.5">
							<Badge tone={statusTone(status)} pixel>{STATUS_LABEL[status]}</Badge>
							<Badge tone={info.category === 'hybrid' ? 'purple' : info.category === 'plugins' ? 'blue' : 'green'}>
								{info.category === 'hybrid' ? 'Híbrido: mods + plugins' : info.category === 'plugins' ? 'Plugins' : 'Mods'}
							</Badge>
							<Badge>{srv.engineLabel ?? `${info.name} ${srv.minecraftVersion}`}</Badge>
							<Badge>{(srv.memoryMb / 1024).toFixed(1)} GB</Badge>
							{#if status === 'running'}<Badge tone="green"><Users size={11} /> {(app.serverPlayers[srv.id] ?? []).length} online</Badge>{/if}
						</div>
					</div>
					<div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
						{#if live}
							<PixelButton variant="danger" icon={Square} class="flex-1 sm:flex-none justify-center" disabled={status === 'stopping'} onclick={() => app.stopServer(srv.id).catch(toasts.err)}>Parar</PixelButton>
						{:else}
							<PixelButton variant="emerald" icon={Play} class="flex-1 sm:flex-none justify-center" loading={status === 'installing'} onclick={start}>Iniciar</PixelButton>
						{/if}
						<PixelButton icon={Download} title="Reinstalar / atualizar motor" disabled={live || status === 'installing'} onclick={() => app.installServer(srv).catch(toasts.err)} />
						<PixelButton icon={FolderOpen} title="Abrir pasta" onclick={() => openFolder('server', srv.id).catch(toasts.err)} />
						<PixelButton variant="ghost" icon={Trash2} title="Excluir" onclick={() => (deleteOpen = true)} />
					</div>
				</div>

				<div class="mt-4 tp-divider"></div>
				<div class="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
					<Toggle
						checked={srv.eulaAccepted}
						label="Aceito a EULA do Minecraft"
						help="Obrigatório para o servidor iniciar"
						onchange={(v) => {
							app.updateServer(srv.id, { eulaAccepted: v });
							if (isTauri) call('server_set_eula', { serverId: srv.id, accepted: v }).catch(toasts.err);
						}}
					/>
					<button class="tp-muted text-[12px] underline" onclick={() => openUrl('https://aka.ms/MinecraftEULA')}>Ler a EULA</button>
					{#if ips[0]}
						<button class="addr ml-auto" onclick={() => copy(`${ips[0]}:${port}`)} title="Copiar endereço da rede local">
							<Wifi size={14} /> <span class="font-mono">{ips[0]}:{port}</span> <Copy size={13} />
						</button>
					{/if}
				</div>
				{#if task && status === 'installing'}
					<div class="mt-4"><ProgressBar indeterminate label={stageLabel(task.stage)} detail={task.message} /></div>
				{/if}
			</TropicaliaCard>

			<div class="overflow-x-auto pb-1 scrollbar-none">
				<TabSelector tabs={detailTabs} bind:value={tab} />
			</div>

			{#if tab === 'console'}
				<ConsoleView
					lines={app.serverLogs[srv.id] ?? []}
					height={430}
					empty={srv.installed ? 'Servidor parado. Clique em Iniciar.' : 'Clique em Iniciar para baixar o motor e subir o servidor.'}
					oncommand={live ? (c) => call('server_command', { serverId: srv.id, command: c }).catch(toasts.err) : undefined}
				/>
				{#if (app.serverPlayers[srv.id] ?? []).length}
					<TropicaliaCard title="Jogadores online" size="sm">
						<div class="flex flex-wrap gap-2">
							{#each app.serverPlayers[srv.id] as p (p)}
								<span class="player tp-slot"><img src="https://mc-heads.net/avatar/{p}/24" alt="" class="pixel" /> {p}</span>
							{/each}
						</div>
					</TropicaliaCard>
				{/if}
			{:else if tab === 'props'}
				<TropicaliaCard>
					{#if !isTauri}
						<p class="tp-muted text-[13px]">Disponível no app instalado.</p>
					{:else}
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
							{#each PROPERTY_FIELDS as f (f.key)}
								<div class:col-span-1={f.key !== 'motd'} class:sm:col-span-2={f.key === 'motd'}>
									{#if f.type === 'bool'}
										<Toggle
											checked={props[f.key] === 'true'}
											label={f.label}
											help={f.help}
											onchange={(v) => (props[f.key] = String(v))}
										/>
									{:else}
										<label class="tp-label" for="p-{f.key}">{f.label}</label>
										{#if f.type === 'select'}
											<select id="p-{f.key}" class="tp-select" bind:value={props[f.key]}>
												{#each f.options as [v, l] (v)}<option value={v}>{l}</option>{/each}
											</select>
										{:else}
											<input id="p-{f.key}" class="tp-input" class:font-mono={f.type === 'number'} type={f.type} min={'min' in f ? f.min : undefined} max={'max' in f ? f.max : undefined} bind:value={props[f.key]} />
										{/if}
										{#if f.help}<p class="tp-help">{f.help}</p>{/if}
									{/if}
								</div>
							{/each}
						</div>
						<div class="mt-6 flex items-center justify-between">
							<p class="tp-help">Edita só essas chaves; o resto do arquivo fica intacto.</p>
							<PixelButton variant="emerald" icon={Save} onclick={saveProps}>Salvar</PixelButton>
						</div>
					{/if}
				</TropicaliaCard>
			{:else if tab === 'plugins' || tab === 'mods'}
				<TropicaliaCard>
					<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
						<p class="tp-muted text-[13px]">
							{tab === 'plugins' ? 'Plugins Bukkit/Spigot/Paper (pasta plugins/).' : `Mods ${info.flavors?.find((f) => f.id === srv.flavor)?.label ?? info.modLoader ?? ''} de servidor (pasta mods/).`}
						</p>
						<PixelButton
							size="sm"
							variant={addServerInlineOpen ? 'ghost' : 'emerald'}
							icon={addServerInlineOpen ? X : Plus}
							onclick={() => (addServerInlineOpen = !addServerInlineOpen)}
						>
							{addServerInlineOpen ? 'Fechar catálogo' : 'Adicionar ' + (tab === 'plugins' ? 'Plugin' : 'Mod')}
						</PixelButton>
					</div>

					{#if addServerInlineOpen}
						<div class="mb-5 p-4 rounded bg-[#101b15] border-2 border-[#10b981] shadow-xl">
							<ContentPickerInline
								kind={tab === 'plugins' ? 'plugin' : 'mod'}
								loaders={tab === 'plugins' ? loadersFor('plugin', 'vanilla') : loadersFor('mod', (info.flavors?.find((f) => f.id === srv.flavor)?.modLoader ?? info.modLoader ?? 'fabric') as ModLoader)}
								gameVersion={srv.minecraftVersion}
								mode="install"
								target={{ ownerKind: 'server', owner: srv }}
								oninstalled={() => loadRows()}
								title="Adicionar {tab === 'plugins' ? 'Plugins' : 'Mods'} diretamente a {srv.name}"
							/>
						</div>
					{/if}

					{#if rows.length}
						<div class="tp-slot divide-y divide-[#1d2a23]">
							{#each rows as r (r.filename)}
								{@const meta = srv.content[r.filename]}
								<div class="flex items-center gap-3 px-3 py-2.5" class:opacity-50={!r.enabled}>
									{#if meta?.iconUrl}<img src={meta.iconUrl} alt="" class="h-8 w-8 rounded-sm" />{:else}{#if tab === 'plugins'}<Package size={28} class="text-[#3b5144]" />{:else}<Puzzle size={28} class="text-[#3b5144]" />{/if}{/if}
									<div class="min-w-0 flex-1">
										<div class="truncate text-[13px] font-semibold">{meta?.title ?? r.filename}</div>
										<div class="tp-muted truncate font-mono text-[11px]">{r.filename} · {formatBytes(r.size)}</div>
									</div>
									<Toggle checked={r.enabled} onchange={(v) => toggleRow(r, v)} />
									<PixelButton size="sm" variant="ghost" icon={Trash2} title="Excluir" onclick={() => deleteRow(r)} />
								</div>
							{/each}
						</div>
					{:else}
						<div class="py-10 text-center">
							<p class="tp-muted text-[13px]">Nenhum {tab === 'plugins' ? 'plugin' : 'mod'} instalado ainda.</p>
							{#if !addServerInlineOpen}
								<div class="mt-3">
									<PixelButton size="sm" variant="emerald" icon={Plus} onclick={() => (addServerInlineOpen = true)}>
										Explorar e adicionar {tab === 'plugins' ? 'plugins' : 'mods'} agora
									</PixelButton>
								</div>
							{/if}
						</div>
					{/if}
				</TropicaliaCard>
			{:else if tab === 'friends'}
				<div class="grid grid-cols-2 gap-6">
					<TropicaliaCard title="Mesma rede (LAN)">
						<p class="text-[13px] text-[#c7d5cc]">Quem está no mesmo Wi-Fi entra pelo multiplayer com:</p>
						<button class="addr mt-3" onclick={() => ips[0] && copy(`${ips[0]}:${port}`)}>
							<Wifi size={14} /> <span class="font-mono">{ips[0] ?? 'IP local'}:{port}</span> <Copy size={13} />
						</button>
						<p class="tp-help mt-3">Desative "Modo online" nas propriedades para aceitar contas offline.</p>
					</TropicaliaCard>
					<TropicaliaCard title="Pela internet (sem abrir portas)">
						<p class="text-[13px] text-[#c7d5cc]">
							Use o <b>playit.gg</b>: ele cria um endereço público (ex.: <code>galera.playit.gg</code>) que funciona até atrás de CGNAT/4G.
						</p>
						<ol class="tp-muted mt-3 list-decimal space-y-1 pl-5 text-[12.5px]">
							<li>Baixe e abra o agente do playit.gg</li>
							<li>Crie um túnel "Minecraft Java" apontando para a porta {port}</li>
							<li>Mande o endereço gerado para os amigos</li>
						</ol>
						<PixelButton size="sm" icon={Globe} class="mt-4" onclick={() => openUrl('https://playit.gg/download')}>Baixar playit.gg</PixelButton>
					</TropicaliaCard>
				</div>
			{/if}
		</div>
	{:else}
		<TropicaliaCard size="lg">
			<div class="py-14 text-center">
				<p class="font-mc mc-shadow text-[16px] text-white">Crie seu servidor</p>
				<p class="tp-muted mx-auto mt-3 max-w-[460px] text-[13px]">
					Híbrido com Magma, Mohist ou Arclight roda mods <b>e</b> plugins juntos. Ou use Paper/Purpur para plugins e Fabric para mods leves.
				</p>
				<PixelButton variant="emerald" icon={Plus} class="mt-6" onclick={() => ((wizardOpen = true), (step = 1))}>Novo servidor</PixelButton>
			</div>
		</TropicaliaCard>
	{/if}
</div>

<Modal bind:open={wizardOpen} title={step === 1 ? 'Que tipo de servidor?' : 'Configurar Servidor'} width={780}>
	{#if step === 1}
		<div class="grid gap-3">
			{#each [
				{ c: 'hybrid', t: '⭐ Híbrido (mods + plugins)', d: 'Magma, Mohist ou Arclight: Create, Mekanism… junto com LuckPerms, EssentialsX.' },
				{ c: 'plugins', t: 'Só plugins', d: 'Paper ou Purpur: o mais leve e estável para minigames e survival com plugins.' },
				{ c: 'mods', t: 'Só mods', d: 'Fabric Server: leve, ideal para mods de performance e conteúdo Fabric.' }
			] as o (o.c)}
				<button class="choice" onclick={() => pickCategory(o.c as EngineInfo['category'])}>
					<b class="font-mc mc-shadow-sm text-[13px] text-white">{o.t}</b>
					<small>{o.d}</small>
				</button>
			{/each}
		</div>
	{:else}
		<div class="flex flex-col gap-4">
			<!-- Seletor entre Configuração do Motor e Seleção de Mods/Plugins -->
			<div class="flex items-center justify-between gap-3 border-b border-[#24322b] pb-2 flex-wrap">
				<TabSelector
					tabs={[
						{ id: 'config', label: '1. Motor & Versão' },
						{
							id: 'addons',
							label: category === 'hybrid' ? '2. Mods & Plugins' : category === 'plugins' ? '2. Escolher Plugins' : '2. Escolher Mods',
							count: (wSelectedMods.length + wSelectedPlugins.length) || undefined
						}
					]}
					bind:value={wActiveTab}
					size="sm"
				/>

				{#if wSelectedMods.length + wSelectedPlugins.length > 0}
					<span class="text-[11px] text-[#bef264] flex items-center gap-1 font-mc">
						<Check size={13} />
						{#if category === 'hybrid'}
							{wSelectedMods.length} mod(s), {wSelectedPlugins.length} plugin(s)
						{:else if category === 'plugins'}
							{wSelectedPlugins.length} plugin(s) selecionado(s)
						{:else}
							{wSelectedMods.length} mod(s) selecionado(s)
						{/if}
					</span>
				{/if}
			</div>

			{#if wActiveTab === 'config'}
				<div class="grid gap-4">
					<div>
						<span class="tp-label">Motor</span>
						<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
							{#each ENGINES.filter((e) => e.category === category) as e (e.id)}
								<button class="choice sm" class:on={wEngine === e.id} onclick={() => (wEngine = e.id)}>
									<b class="font-mc mc-shadow-sm text-[12px] text-white">{e.name}</b>
									<small>{e.tagline}</small>
								</button>
							{/each}
						</div>
					</div>
					{#if wInfo.flavors}
						<div>
							<span class="tp-label">Base de mods</span>
							<TabSelector tabs={wInfo.flavors.map((f) => ({ id: f.id, label: f.label }))} bind:value={wFlavor} size="sm" />
						</div>
					{/if}
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label class="tp-label" for="w-name">Nome do Servidor</label>
							<input id="w-name" class="tp-input" bind:value={wName} />
						</div>
						<div>
							<label class="tp-label" for="w-ver">Versão do Minecraft</label>
							{#if versionsState === 'error' || (versionsState === 'idle' && !versions.length)}
								<input id="w-ver" class="tp-input font-mono" bind:value={wVersion} placeholder="1.21.1" />
							{:else}
								<select id="w-ver" class="tp-select" bind:value={wVersion} disabled={versionsState === 'loading'}>
									{#if versionsState === 'loading'}<option>Carregando…</option>{/if}
									{#each versions as v (v)}<option value={v}>{v}</option>{/each}
								</select>
							{/if}
						</div>
					</div>
					<div>
						<div class="flex items-baseline justify-between">
							<label class="tp-label" for="w-ram">RAM do servidor</label>
							<span class="font-mc mc-shadow-sm text-[12px] text-[#bef264]">{(wMemory / 1024).toFixed(1)} GB</span>
						</div>
						<input id="w-ram" type="range" class="tp-range" min="1024" max={Math.max(2048, app.system.totalMemoryMb - 2048)} step="512" bind:value={wMemory} />
					</div>
					<details class="tp-slot p-3" open={wInfo.bestEffort}>
						<summary class="cursor-pointer text-[12.5px] font-semibold text-[#c7d5cc]">URL manual do JAR (avançado)</summary>
						<input class="tp-input mt-3 font-mono" placeholder="https://…/servidor.jar" bind:value={wJar} />
						<p class="tp-help">
							{wInfo.bestEffort
								? `A API de download do ${wInfo.name} muda com frequência. Se a instalação automática falhar, cole aqui o link do JAR de ${wInfo.site}.`
								: 'Deixe vazio para baixar automaticamente da API oficial.'}
						</p>
					</details>
					<Toggle bind:checked={wEula} label="Aceito a EULA do Minecraft (aka.ms/MinecraftEULA)" />

					<div class="pt-2 flex justify-end">
						<PixelButton variant="gold" icon={Puzzle} onclick={() => (wActiveTab = 'addons')}>
							Avançar para escolha de mods e plugins →
						</PixelButton>
					</div>
				</div>
			{:else}
				<!-- Aba de seleção de Mods e Plugins -->
				<div class="grid gap-3">
					{#if category === 'hybrid'}
						<!-- Servidor híbrido: listas separadas na mesma tela com navegação imediata -->
						<div class="flex items-center justify-between gap-3 bg-[#11241a] p-2.5 rounded border border-[#10b981]">
							<p class="text-[12px] text-[#c7d5cc] !mb-0">
								<b>Servidor Híbrido:</b> você pode selecionar <b>Mods</b> e <b>Plugins</b> separadamente na mesma tela.
							</p>
							<TabSelector
								tabs={[
									{ id: 'mods', label: 'Lista de Mods', count: wSelectedMods.length || undefined },
									{ id: 'plugins', label: 'Lista de Plugins', count: wSelectedPlugins.length || undefined }
								]}
								bind:value={wAddonTab}
								size="sm"
							/>
						</div>

						{#if wAddonTab === 'mods'}
							<ContentPickerInline
								kind="mod"
								loaders={loadersFor('mod', wServerModLoader)}
								gameVersion={wVersion}
								mode="select"
								bind:selected={wSelectedMods}
								title="Mods para o servidor ({wInfo.name} · {wServerModLoader})"
								compact
							/>
						{:else}
							<ContentPickerInline
								kind="plugin"
								loaders={loadersFor('plugin', 'vanilla')}
								gameVersion={wVersion}
								mode="select"
								bind:selected={wSelectedPlugins}
								title="Plugins para o servidor (Paper / Spigot / Bukkit)"
								compact
							/>
						{/if}
					{:else if category === 'plugins'}
						<p class="tp-help !mt-0">
							Selecione os plugins Bukkit/Paper que deseja incluir já na criação do servidor:
						</p>
						<ContentPickerInline
							kind="plugin"
							loaders={loadersFor('plugin', 'vanilla')}
							gameVersion={wVersion}
							mode="select"
							bind:selected={wSelectedPlugins}
							title="Plugins Bukkit/Spigot/Paper"
							compact
						/>
					{:else}
						<p class="tp-help !mt-0">
							Selecione os mods Fabric de servidor que deseja incluir já na criação:
						</p>
						<ContentPickerInline
							kind="mod"
							loaders={loadersFor('mod', wServerModLoader)}
							gameVersion={wVersion}
							mode="select"
							bind:selected={wSelectedMods}
							title="Mods Fabric de Servidor"
							compact
						/>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		{#if step === 2}
			<PixelButton variant="ghost" onclick={() => (step = 1)}>Voltar</PixelButton>
			<PixelButton
				variant="emerald"
				icon={Power}
				loading={creating}
				disabled={!wVersion || !wEula}
				onclick={createServer}
			>
				{#if category === 'hybrid' && (wSelectedMods.length > 0 || wSelectedPlugins.length > 0)}
					Criar e instalar (+{wSelectedMods.length} mods, +{wSelectedPlugins.length} plugins)
				{:else if wSelectedMods.length > 0}
					Criar e instalar (+{wSelectedMods.length} mods)
				{:else if wSelectedPlugins.length > 0}
					Criar e instalar (+{wSelectedPlugins.length} plugins)
				{:else}
					Criar e instalar
				{/if}
			</PixelButton>
		{/if}
	{/snippet}
</Modal>

<Modal bind:open={deleteOpen} title="Excluir servidor?" width={460}>
	<p class="text-[13px]">A pasta de <b>{srv?.name}</b>, incluindo o mundo, vai ser apagada.</p>
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
		padding: 9px 10px;
		color: inherit;
		text-decoration: none;
		border: 2px solid transparent;
	}
	.item:hover { background: var(--tp-panel-2); }
	.item.active { background: var(--tp-panel-2); border-color: #10b981; }
	.lamp {
		width: 10px;
		height: 10px;
		flex: none;
		background: #3b5144;
		box-shadow: 0 0 0 2px #000;
	}
	.lamp.running { background: #4ade80; box-shadow: 0 0 0 2px #000, 0 0 10px #4ade80; }
	.lamp.crashed { background: #f87171; }
	.lamp.starting, .lamp.stopping, .lamp.installing { background: #fbbf24; }
	.engine-badge {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		font-family: var(--font-minecraft);
		font-size: 20px;
		color: #fff;
		text-shadow: 2px 2px 0 #000;
		box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.25), inset 0 -4px 0 rgba(0, 0, 0, 0.35), 0 0 0 2px #000;
	}
	.engine-badge.hybrid { background: linear-gradient(135deg, #7e22ce, #15803d); }
	.engine-badge.plugins { background: linear-gradient(#2563eb, #1e40af); }
	.engine-badge.mods { background: linear-gradient(#16a34a, #15803d); }
	.addr {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 12px;
		border: 0;
		cursor: pointer;
		color: #bef264;
		background: #0b100e;
		box-shadow: inset 2px 2px 0 #000, inset -2px -2px 0 #24322b, 0 0 0 1px #000;
	}
	.addr:hover { color: #fff; }
	.player {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px 4px 4px;
		font-size: 12.5px;
	}
	.choice {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 16px;
		border: 0;
		cursor: pointer;
		text-align: left;
		background: var(--tp-panel-2);
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #000;
	}
	.choice.sm { padding: 12px; }
	.choice small { font-size: 12px; line-height: 1.4; color: var(--tp-muted); }
	.choice:hover, .choice.on {
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #10b981;
	}
	.choice.on { background: #10291c; }
</style>
