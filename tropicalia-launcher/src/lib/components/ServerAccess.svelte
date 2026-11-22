<!--
  Whitelist, OPs e banimentos do servidor local (whitelist.json, ops.json, banned-players.json, banned-ips.json).
  Ligado: usa os comandos do Minecraft (vale na hora). Desligado: edita os arquivos; o UUID vem da Mojang
  (online-mode) ou é o UUID offline (online-mode=false), igual ao que o servidor calcularia.
-->
<script lang="ts">
	import TropicaliaCard from './TropicaliaCard.svelte';
	import PixelButton from './PixelButton.svelte';
	import Badge from './Badge.svelte';
	import { toasts } from '$lib/state.svelte';
	import { call, getJson, isTauri } from '$lib/platform';
	import { offlineUuid } from '$lib/util/offline-uuid';
	import type { LocalServer, ServerStatus } from '$lib/types';
	import { Crown, Gavel, ListChecks, Network, Plus, ShieldCheck, X } from 'lucide-svelte';

	let {
		srv,
		status,
		online = [],
		onopensettings
	}: { srv: LocalServer; status: ServerStatus; online?: string[]; onopensettings?: () => void } = $props();

	type ListId = 'whitelist' | 'ops' | 'bans' | 'ipbans';
	type Entry = { uuid?: string; name?: string; ip?: string; level?: number; reason?: string; [k: string]: unknown };
	interface ListDef {
		id: ListId;
		file: string;
		title: string;
		hint: string;
		icon: typeof Crown;
		placeholder: string;
		addLabel: string;
		key: 'name' | 'ip';
		reason?: boolean;
		add: (v: string, reason: string) => string;
		remove: (v: string) => string;
	}

	const LISTS: ListDef[] = [
		{ id: 'whitelist', file: 'whitelist.json', title: 'Whitelist', hint: 'quem pode entrar com a whitelist ativa', icon: ListChecks,
			placeholder: 'Nick', addLabel: 'Adicionar', key: 'name', add: (v) => `whitelist add ${v}`, remove: (v) => `whitelist remove ${v}` },
		{ id: 'ops', file: 'ops.json', title: 'Operadores (OP)', hint: 'acesso aos comandos', icon: Crown,
			placeholder: 'Nick', addLabel: 'Dar OP', key: 'name', add: (v) => `op ${v}`, remove: (v) => `deop ${v}` },
		{ id: 'bans', file: 'banned-players.json', title: 'Jogadores banidos', hint: 'não entram mais', icon: Gavel,
			placeholder: 'Nick', addLabel: 'Banir', key: 'name', reason: true, add: (v, r) => `ban ${v}${r ? ' ' + r : ''}`, remove: (v) => `pardon ${v}` },
		{ id: 'ipbans', file: 'banned-ips.json', title: 'IPs banidos', hint: 'bloqueio por endereço', icon: Network,
			placeholder: 'IP (ex.: 192.168.0.20)', addLabel: 'Banir IP', key: 'ip', reason: true, add: (v, r) => `ban-ip ${v}${r ? ' ' + r : ''}`, remove: (v) => `pardon-ip ${v}` }
	];

	const NICK = /^[A-Za-z0-9_.]{1,32}$/;
	const IP = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]{2,39}$/;

	let lists = $state<Record<ListId, Entry[]>>({ whitelist: [], ops: [], bans: [], ipbans: [] });
	let serverProps = $state<Record<string, string>>({});
	let draft = $state<Record<ListId, string>>({ whitelist: '', ops: '', bans: '', ipbans: '' });
	let reason = $state<Record<ListId, string>>({ whitelist: '', ops: '', bans: '', ipbans: '' });
	let busy = $state(false);
	let loadedFor = $state<string | null>(null);

	const running = $derived(status === 'running');
	const live = $derived(status === 'running' || status === 'starting' || status === 'stopping');
	const flag = (k: string, def: 'true' | 'false') => (serverProps[k] ?? def) === 'true';
	const onlineMode = $derived(flag('online-mode', 'true'));
	const whitelistOn = $derived(flag('white-list', 'false'));
	const enforce = $derived(flag('enforce-whitelist', 'false'));

	$effect(() => {
		const id = srv.id;
		if (loadedFor === id || !isTauri) return;
		loadedFor = id;
		load();
	});

	async function load() {
		serverProps = await call<Record<string, string>>('server_read_properties', { serverId: srv.id }).catch(() => ({}));
		await loadLists();
	}

	async function loadLists() {
		const next = { ...lists };
		await Promise.all(
			LISTS.map(async (l) => {
				next[l.id] = await call<Entry[]>('server_read_list', { serverId: srv.id, file: l.file }).catch(() => []);
			})
		);
		lists = next;
	}

	async function command(cmd: string) {
		await call('server_command', { serverId: srv.id, command: cmd });
		await new Promise((r) => setTimeout(r, 900)); // o servidor regrava o JSON logo depois
	}

	async function writeList(l: ListDef, entries: Entry[]) {
		await call('server_write_list', { serverId: srv.id, file: l.file, entries });
	}

	/** UUID como o servidor gravaria: da conta Microsoft (online-mode) ou offline. */
	async function resolve(nick: string): Promise<{ uuid: string; name: string }> {
		if (!onlineMode) return { uuid: offlineUuid(nick), name: nick };
		try {
			const p = await getJson<{ id: string; name: string }>(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(nick)}`);
			const h = p.id.replace(/-/g, '');
			return { uuid: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`, name: p.name };
		} catch {
			throw new Error(`Não achei a conta "${nick}" na Mojang. Confira o nick ou desligue o online mode para contas offline.`);
		}
	}

	function stamp() {
		// Formato do Minecraft: "2026-11-15 10:30:00 -0300"
		const d = new Date();
		const p = (n: number) => String(Math.abs(n)).padStart(2, '0');
		const off = -d.getTimezoneOffset();
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${off >= 0 ? '+' : '-'}${p(Math.trunc(off / 60))}${p(off % 60)}`;
	}

	async function run(fn: () => Promise<void>) {
		busy = true;
		try {
			await fn();
		} catch (e) {
			toasts.err(e);
		} finally {
			await loadLists();
			busy = false;
		}
	}

	async function add(l: ListDef) {
		const v = draft[l.id].trim();
		const why = reason[l.id].trim().replace(/[\r\n]+/g, ' ');
		if (!v) return;
		if (l.key === 'ip' ? !(IP.test(v) || (running && NICK.test(v))) : !NICK.test(v)) return toasts.err(new Error(`Valor inválido: ${v}`));
		const current = lists[l.id];
		if (current.some((e) => (l.key === 'ip' ? e.ip : e.name?.toLowerCase()) === (l.key === 'ip' ? v : v.toLowerCase()))) {
			return toasts.info(`${v} já está na lista.`);
		}
		await run(async () => {
			if (running) {
				await command(l.add(v, why));
			} else if (live) {
				throw new Error('Espere o servidor terminar de iniciar ou parar.');
			} else if (l.key === 'ip') {
				await writeList(l, [...current, { ip: v, created: stamp(), source: 'TropicaliaLauncher', expires: 'forever', reason: why || 'Banido pelo launcher' }]);
			} else {
				const who = await resolve(v);
				const entry: Entry =
					l.id === 'whitelist' ? who
					: l.id === 'ops' ? { ...who, level: Number(serverProps['op-permission-level'] ?? 4) || 4, bypassesPlayerLimit: false }
					: { ...who, created: stamp(), source: 'TropicaliaLauncher', expires: 'forever', reason: why || 'Banido pelo launcher' };
				await writeList(l, [...current, entry]);
			}
			draft[l.id] = '';
			reason[l.id] = '';
			toasts.ok(`${v}: ${l.title.toLowerCase()} atualizada`);
		});
	}

	async function remove(l: ListDef, e: Entry) {
		const v = (l.key === 'ip' ? e.ip : e.name) ?? '';
		if (!v) return;
		await run(async () => {
			if (running) await command(l.remove(v));
			else if (live) throw new Error('Espere o servidor terminar de iniciar ou parar.');
			else await writeList(l, lists[l.id].filter((x) => x !== e));
		});
	}

	async function setProp(k: string, v: string, cmd?: string) {
		await run(async () => {
			if (cmd && running) await command(cmd);
			await call('server_write_properties', { serverId: srv.id, values: { [k]: v } });
			serverProps = { ...serverProps, [k]: v };
		});
	}

	function quickAdd(nick: string) {
		draft.whitelist = nick;
		add(LISTS[0]);
	}
	const notListed = $derived(online.filter((p) => !lists.whitelist.some((e) => e.name?.toLowerCase() === p.toLowerCase())));
</script>

{#if !isTauri}
	<TropicaliaCard><p class="tp-muted text-[13px]">Disponível no app instalado.</p></TropicaliaCard>
{:else}
	<div class="flex flex-col gap-5">
		<TropicaliaCard title="Quem pode entrar">
			<div class="flags">
				<div class="flag">
					<div class="min-w-0">
						<b>Online mode</b>
						<p class="tp-help !mt-0.5">{onlineMode ? 'Só contas originais (Microsoft).' : 'Aceita contas offline: qualquer nick entra.'}</p>
					</div>
					<Badge tone={onlineMode ? 'green' : 'gold'}>{onlineMode ? 'Ligado' : 'Desligado'}</Badge>
					<PixelButton size="sm" onclick={() => onopensettings?.()}>Alterar</PixelButton>
				</div>
				<div class="flag">
					<div class="min-w-0">
						<b>Whitelist</b>
						<p class="tp-help !mt-0.5">{whitelistOn ? 'Só quem está na lista entra.' : 'Qualquer jogador pode entrar.'}</p>
					</div>
					<Badge tone={whitelistOn ? 'green' : 'muted'}>{whitelistOn ? 'Ativa' : 'Desativada'}</Badge>
					<PixelButton size="sm" variant={whitelistOn ? 'stone' : 'emerald'} disabled={busy}
						onclick={() => setProp('white-list', whitelistOn ? 'false' : 'true', whitelistOn ? 'whitelist off' : 'whitelist on')}>
						{whitelistOn ? 'Desativar' : 'Ativar'}
					</PixelButton>
				</div>
				<div class="flag">
					<div class="min-w-0">
						<b>Expulsar quem não está na lista</b>
						<p class="tp-help !mt-0.5">Ao ativar/recarregar a whitelist, quem já está online e não está nela sai.</p>
					</div>
					<Badge tone={enforce ? 'green' : 'muted'}>{enforce ? 'Sim' : 'Não'}</Badge>
					<PixelButton size="sm" disabled={busy} onclick={() => setProp('enforce-whitelist', enforce ? 'false' : 'true')}>{enforce ? 'Desligar' : 'Ligar'}</PixelButton>
				</div>
			</div>
			{#if whitelistOn && !lists.whitelist.length}
				<p class="note warn"><ShieldCheck size={14} /> A whitelist está ativa e vazia: ninguém entra. Adicione você mesmo abaixo.</p>
			{/if}
			{#if !running}
				<p class="note">
					<ShieldCheck size={14} />
					{live ? 'Servidor iniciando/parando: espere um instante para editar.' : onlineMode
						? 'Servidor parado: o launcher busca o UUID da conta na Mojang e grava direto nos arquivos.'
						: 'Servidor parado: o launcher grava direto nos arquivos com o UUID offline de cada nick.'}
				</p>
			{/if}
			{#if notListed.length && whitelistOn}
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<span class="tp-help !mt-0">Online e fora da whitelist:</span>
					{#each notListed as p (p)}
						<button class="chip" disabled={busy} onclick={() => quickAdd(p)}><Plus size={12} /> {p}</button>
					{/each}
				</div>
			{/if}
		</TropicaliaCard>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
			{#each LISTS as l (l.id)}
				{@const Icon = l.icon}
				<TropicaliaCard>
					<header class="mb-3 flex items-center gap-2 min-w-0">
						<Icon size={16} class="text-[#bef264] shrink-0" />
						<h3 class="font-mc mc-shadow text-[13px] text-white shrink-0">{l.title}</h3>
						<Badge>{lists[l.id].length}</Badge>
						<span class="tp-muted text-[11.5px] truncate hidden 2xl:inline min-w-0">{l.hint}</span>
					</header>
					<form class="addrow" onsubmit={(e) => { e.preventDefault(); add(l); }}>
						<input class="tp-input font-mono" placeholder={l.placeholder} aria-label="{l.title}: {l.placeholder}" bind:value={draft[l.id]} autocomplete="off" autocapitalize="off" spellcheck="false" />
						{#if l.reason}
							<input class="tp-input" placeholder="Motivo (opcional)" aria-label="Motivo" maxlength="200" bind:value={reason[l.id]} />
						{/if}
						<PixelButton type="submit" size="sm" variant="emerald" icon={Plus} disabled={busy || !draft[l.id].trim() || (live && !running)}>{l.addLabel}</PixelButton>
					</form>
					<ul class="rows tp-slot">
						{#each lists[l.id] as e, idx (idx)}
							<li>
								{#if l.key === 'name'}<img src="https://mc-heads.net/avatar/{e.uuid || e.name}/24" alt="" width="24" height="24" class="pixel shrink-0" loading="lazy" />{/if}
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-1.5 min-w-0">
										<span class="truncate font-mono text-[13px]">{l.key === 'ip' ? e.ip : e.name}</span>
										{#if l.id === 'ops' && e.level}<Badge>nível {e.level}</Badge>{/if}
										{#if online.some((p) => p.toLowerCase() === e.name?.toLowerCase())}<Badge tone="green">online</Badge>{/if}
									</div>
									{#if e.reason && e.reason !== 'Banned by an operator.'}<p class="tp-help !mt-0 truncate">{e.reason}</p>{/if}
								</div>
								<PixelButton size="sm" variant="ghost" icon={X} title="Remover {e.name ?? e.ip}" disabled={busy || (live && !running)} onclick={() => remove(l, e)} />
							</li>
						{:else}
							<li class="tp-muted text-[12.5px] justify-center">Lista vazia</li>
						{/each}
					</ul>
				</TropicaliaCard>
			{/each}
		</div>
	</div>
{/if}

<style>
	.flags { display: grid; gap: 8px; }
	.flag {
		display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 10px 12px;
		background: var(--tp-panel-3); box-shadow: inset 2px 2px 0 #000, inset -2px -2px 0 #24322b;
	}
	.flag b { font-size: 13px; }
	@media (max-width: 520px) {
		.flag { grid-template-columns: auto 1fr; }
		.flag > div { grid-column: 1 / -1; }
		.flag > :global(:last-child) { justify-self: end; }
	}
	.note { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; font-size: 12.5px; color: var(--tp-muted); }
	.note.warn { color: var(--tp-gold); }
	.chip {
		display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 0 10px; border: 0; cursor: pointer; font-size: 12.5px;
		color: #bef264; background: var(--tp-panel-2); box-shadow: 0 0 0 2px #000;
	}
	.chip:disabled { opacity: 0.5; }
	.addrow { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-bottom: 10px; }
	/* Motivo do ban numa linha própria: nick + botão em cima, sempre legível. */
	.addrow > input + input { grid-column: 1 / -1; grid-row: 2; }
	.rows { list-style: none; margin: 0; padding: 0; max-height: 300px; overflow-y: auto; }
	.rows li { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 8px 6px 10px; }
	.rows li + li { border-top: 1px solid #1d2a23; }
</style>
