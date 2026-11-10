// Estado global do launcher (Svelte 5 runes). Persistido no plugin-store do Tauri.
import { call, isTauri, kv, on, secrets } from '$lib/platform';
import * as ms from '$lib/services/microsoft-auth';
import { checkForLauncherUpdates, type CheckUpdateResult } from '$lib/services/updates';
import { DEFAULT_PROPERTIES, engine, resolveJar } from '$lib/services/server-engines';
import type {
	Account,
	Instance,
	InstalledContent,
	LocalServer,
	ProgressEvent,
	ServerStatus,
	Settings
} from '$lib/types';
import { errorMessage, slugify, uid } from '$lib/util/format';
import { offlineUuid } from '$lib/util/offline-uuid';

// ------------------------------------------------------------------ toasts

export type ToastKind = 'ok' | 'err' | 'info';
class Toasts {
	list = $state<Array<{ id: number; kind: ToastKind; text: string }>>([]);
	#n = 0;
	push(kind: ToastKind, text: string, ms = kind === 'err' ? 7000 : 3500) {
		const id = ++this.#n;
		this.list.push({ id, kind, text });
		setTimeout(() => this.dismiss(id), ms);
	}
	ok = (t: string) => this.push('ok', t);
	err = (e: unknown) => this.push('err', errorMessage(e));
	info = (t: string) => this.push('info', t);
	dismiss(id: number) {
		this.list = this.list.filter((t) => t.id !== id);
	}
}
export const toasts = new Toasts();

// ------------------------------------------------------------------ desempenho (flags da JVM)

const AIKAR =
	'-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1';

export const PERF_PROFILES: Record<Settings['perfProfile'], { label: string; help: string; flags: string }> = {
	economico: {
		label: 'Econômico',
		help: 'PC fraco ou pouca RAM: GC leve, menos pausas grandes.',
		flags: '-XX:+UseSerialGC -XX:+UseStringDeduplication'
	},
	equilibrado: {
		label: 'Equilibrado',
		help: 'G1GC ajustado para jogar liso na maioria dos PCs.',
		flags: '-XX:+UseG1GC -XX:MaxGCPauseMillis=40 -XX:G1ReservePercent=15 -XX:InitiatingHeapOccupancyPercent=35'
	},
	maximo: {
		label: 'Máximo desempenho',
		help: 'Flags do Aikar: padrão-ouro para modpacks pesados.',
		flags: AIKAR
	}
};

export function suggestedMemory(totalMb: number) {
	if (totalMb <= 4096) return 1536;
	if (totalMb <= 8192) return 3072;
	if (totalMb <= 16384) return 4096;
	return 6144;
}

// ------------------------------------------------------------------ app

export interface LaunchTask {
	stage: string;
	current: number;
	total: number;
	message: string;
	busy: boolean;
}

const STAGE_LABEL: Record<string, string> = {
	versions: 'Versões',
	loader: 'Modloader',
	libraries: 'Bibliotecas',
	assets: 'Sons e texturas',
	java: 'Java',
	launch: 'Abrindo',
	content: 'Conteúdo',
	modpack: 'Modpack',
	server: 'Servidor'
};
export const stageLabel = (s: string) => STAGE_LABEL[s] ?? s;

class App {
	ready = $state(false);
	settings = $state<Settings>({
		msClientId: import.meta.env.VITE_MS_CLIENT_ID ?? '',
		javaPath: '',
		defaultMemoryMb: 4096,
		perfProfile: 'equilibrado',
		hideOnLaunch: true,
		showSnapshots: false
	});
	system = $state({ totalMemoryMb: 8192, os: 'windows', arch: 'x86_64', cpus: 4 });
	accounts = $state<Account[]>([]);
	instances = $state<Instance[]>([]);
	servers = $state<LocalServer[]>([]);

	tasks = $state<Record<string, LaunchTask>>({});
	running = $state<Record<string, number>>({}); // instância → início (ms)
	gameLogs = $state<Record<string, string[]>>({});
	serverStatus = $state<Record<string, ServerStatus>>({});
	serverLogs = $state<Record<string, string[]>>({});
	serverPlayers = $state<Record<string, string[]>>({});

	/** modal de contas aberto (pela topbar ou ao tentar jogar sem conta) */
	accountsOpen = $state(false);

	/** Estado de atualização do launcher */
	updateAvailable = $state<CheckUpdateResult | null>(null);
	updateModalOpen = $state(false);
	#updateDismissedThisSession = false;

	activeAccount = $derived(
		this.accounts.find((a) => a.id === this.settings.activeAccountId) ?? this.accounts[0]
	);
	lastInstance = $derived(
		this.instances.find((i) => i.id === this.settings.lastInstanceId) ??
			[...this.instances].sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))[0]
	);

	async init() {
		if (this.ready) return;
		const [settings, accounts, instances, servers] = await Promise.all([
			kv.get<Partial<Settings>>('settings', {}),
			kv.get<Account[]>('accounts', []),
			kv.get<Instance[]>('instances', []),
			kv.get<LocalServer[]>('servers', [])
		]);
		Object.assign(this.settings, settings);
		if (!this.settings.msClientId) this.settings.msClientId = import.meta.env.VITE_MS_CLIENT_ID ?? '';
		this.accounts = accounts;
		this.instances = instances;
		this.servers = servers;
		for (const s of servers) this.serverStatus[s.id] = 'stopped';

		if (this.accounts.length === 0) {
			const defaultNick = 'Jogador';
			const uuid = offlineUuid(defaultNick);
			const defaultAcc: Account = {
				id: `off-${uuid}`,
				type: 'offline',
				username: defaultNick,
				uuid,
				addedAt: new Date().toISOString()
			};
			this.accounts.push(defaultAcc);
			this.settings.activeAccountId = defaultAcc.id;
			this.saveAccounts();
			this.saveSettings();
		}

		if (this.instances.length === 0) {
			const defaultInst: Instance = {
				id: 'tropicaliacraft-rust',
				name: 'TropicaliaCraft (Rust)',
				gameVersion: '26.3',
				loader: 'horizon-rust',
				engine: 'rust',
				icon: 'creeper',
				memory: { minMb: 512, maxMb: this.settings.defaultMemoryMb || 4096 },
				jvmArgs: '',
				content: {},
				createdAt: new Date().toISOString(),
				playTimeMinutes: 0
			};
			this.instances.push(defaultInst);
			this.settings.lastInstanceId = defaultInst.id;
			this.saveInstances();
			this.saveSettings();
		}

		if (isTauri) {
			try {
				this.system = await call('system_info');
				if (!settings.defaultMemoryMb) this.settings.defaultMemoryMb = suggestedMemory(this.system.totalMemoryMb);
			} catch {
				/* ignora */
			}
			await this.#listen();
			for (const id of await call<string[]>('game_running').catch(() => [])) this.running[id] = Date.now();
			for (const id of await call<string[]>('server_running').catch(() => [])) this.serverStatus[id] = 'running';
		}
		this.ready = true;

		// Checagem automática e transparente de atualização ao inicializar
		this.checkUpdates(false);
	}

	async checkUpdates(forceModal = true) {
		try {
			const res = await checkForLauncherUpdates();
			if (res.hasUpdate) {
				this.updateAvailable = res;
				if (forceModal || !this.#updateDismissedThisSession) {
					this.updateModalOpen = true;
				}
			} else if (forceModal) {
				toasts.ok('Seu launcher já está na versão mais recente!');
			}
		} catch (e) {
			if (forceModal) toasts.err(e);
		}
	}

	dismissUpdateForSession() {
		this.updateModalOpen = false;
		this.#updateDismissedThisSession = true;
	}

	async #listen() {
		await on<ProgressEvent>('launcher://progress', (p) => {
			const t = (this.tasks[p.owner] ??= { stage: p.stage, current: 0, total: 0, message: '', busy: true });
			t.stage = p.stage;
			t.current = p.current;
			t.total = p.total;
			t.message = p.message;
		});
		await on<{ owner: string; line: string }>('game://log', ({ owner, line }) => {
			const list = (this.gameLogs[owner] ??= []);
			list.push(line);
			if (list.length > 1500) list.splice(0, list.length - 1500);
		});
		await on<{ owner: string }>('game://started', ({ owner }) => {
			this.running[owner] = Date.now();
			delete this.tasks[owner];
		});
		await on<{ owner: string; code: number | null }>('game://exit', ({ owner, code }) => {
			const started = this.running[owner];
			delete this.running[owner];
			const inst = this.instances.find((i) => i.id === owner);
			if (inst && started) {
				inst.playTimeMinutes += Math.round((Date.now() - started) / 60000);
				this.saveInstances();
			}
			if (code && code !== 0) toasts.push('err', `O jogo fechou com erro (código ${code}). Veja a aba Logs da instância.`);
		});
		await on<{ id: string; line: string }>('server://log', ({ id, line }) => {
			const list = (this.serverLogs[id] ??= []);
			list.push(line);
			if (list.length > 2000) list.splice(0, list.length - 2000);
			const joined = line.match(/\]: (\w{3,16}) joined the game/);
			const left = line.match(/\]: (\w{3,16}) left the game/);
			const players = (this.serverPlayers[id] ??= []);
			if (joined && !players.includes(joined[1])) players.push(joined[1]);
			if (left) this.serverPlayers[id] = players.filter((p) => p !== left[1]);
		});
		await on<{ id: string; status: ServerStatus; code: number | null }>('server://status', ({ id, status }) => {
			this.serverStatus[id] = status;
			if (status === 'stopped' || status === 'crashed') this.serverPlayers[id] = [];
			if (status === 'running') toasts.ok(`Servidor ${this.servers.find((s) => s.id === id)?.name ?? ''} está no ar!`);
			if (status === 'crashed') toasts.push('err', 'O servidor parou com erro. Veja o console.');
		});
	}

	saveSettings = () => kv.set('settings', this.settings);
	saveAccounts = () => kv.set('accounts', this.accounts);
	saveInstances = () => kv.set('instances', this.instances);
	saveServers = () => kv.set('servers', this.servers);

	// -------------------------------------------------------------- contas

	setActiveAccount(id: string) {
		this.settings.activeAccountId = id;
		this.saveSettings();
	}

	addOffline(nick: string) {
		const uuid = offlineUuid(nick);
		const existing = this.accounts.find((a) => a.type === 'offline' && a.uuid === uuid);
		if (existing) {
			this.setActiveAccount(existing.id);
			return existing;
		}
		const acc: Account = { id: `off-${uuid}`, type: 'offline', username: nick, uuid, addedAt: new Date().toISOString() };
		this.accounts.push(acc);
		this.setActiveAccount(acc.id);
		this.saveAccounts();
		return acc;
	}

	/** Login Microsoft: mostra o código via `onCode` e resolve quando o usuário aprovar. */
	async loginMicrosoft(onCode: (c: ms.DeviceCode) => void, signal: AbortSignal) {
		const clientId = this.settings.msClientId.trim();
		const code = await ms.requestDeviceCode(clientId);
		onCode(code);
		const token = await ms.pollDeviceCode(clientId, code, signal);
		const session = await ms.completeLogin(token);
		const uuid = ms.dashedUuid(session.profile.id);
		const id = `ms-${session.profile.id}`;
		await this.#storeSession(id, session);
		const acc: Account = {
			id,
			type: 'microsoft',
			username: session.profile.name,
			uuid,
			skinUrl: session.profile.skinUrl,
			tokenExpiresAt: session.expiresAt,
			addedAt: new Date().toISOString()
		};
		this.accounts = [...this.accounts.filter((a) => a.id !== id), acc];
		this.setActiveAccount(id);
		this.saveAccounts();
		return acc;
	}

	async #storeSession(id: string, s: ms.MinecraftSession) {
		await secrets.set(`ms-refresh-${id}`, s.refreshToken);
		await secrets.set(`mc-token-${id}`, s.accessToken);
	}

	async removeAccount(id: string) {
		this.accounts = this.accounts.filter((a) => a.id !== id);
		await secrets.delete(`ms-refresh-${id}`);
		await secrets.delete(`mc-token-${id}`);
		if (this.settings.activeAccountId === id) this.settings.activeAccountId = this.accounts[0]?.id;
		this.saveAccounts();
		this.saveSettings();
	}

	/** Credenciais para iniciar o jogo (renova o token da Microsoft se estiver vencendo). */
	async launchAuth(acc: Account) {
		if (acc.type === 'offline') {
			return { username: acc.username, uuid: acc.uuid, accessToken: '0', userType: 'legacy' };
		}
		let token = await secrets.get(`mc-token-${acc.id}`);
		if (!token || !acc.tokenExpiresAt || acc.tokenExpiresAt < Date.now() + 5 * 60_000) {
			const refresh = await secrets.get(`ms-refresh-${acc.id}`);
			if (!refresh) throw new Error('Sessão Microsoft expirada. Remova e adicione a conta de novo.');
			const s = await ms.refreshSession(this.settings.msClientId.trim(), refresh);
			await this.#storeSession(acc.id, s);
			token = s.accessToken;
			acc.tokenExpiresAt = s.expiresAt;
			acc.username = s.profile.name;
			acc.skinUrl = s.profile.skinUrl;
			this.saveAccounts();
		}
		return { username: acc.username, uuid: acc.uuid, accessToken: token, userType: 'msa' };
	}

	// -------------------------------------------------------------- instâncias

	newInstance(p: Pick<Instance, 'name' | 'gameVersion' | 'loader' | 'loaderVersion' | 'icon'> & Partial<Instance>): Instance {
		let id = slugify(p.name);
		while (this.instances.some((i) => i.id === id)) id = `${slugify(p.name)}-${uid().slice(0, 4)}`;
		const inst: Instance = {
			memory: { minMb: 512, maxMb: this.settings.defaultMemoryMb },
			jvmArgs: '',
			content: {},
			createdAt: new Date().toISOString(),
			playTimeMinutes: 0,
			...p,
			id
		};
		this.instances.push(inst);
		this.saveInstances();
		return inst;
	}

	updateInstance(id: string, patch: Partial<Instance>) {
		const i = this.instances.find((x) => x.id === id);
		if (!i) return;
		Object.assign(i, patch);
		this.saveInstances();
	}

	async cloneInstance(src: Instance, name: string) {
		const copy = this.newInstance({
			...structuredClone($state.snapshot(src)),
			name,
			lastPlayedAt: undefined,
			playTimeMinutes: 0,
			createdAt: new Date().toISOString()
		});
		if (isTauri) await call('instance_clone', { fromId: src.id, toId: copy.id });
		return copy;
	}

	async deleteInstance(id: string) {
		if (isTauri) await call('instance_delete', { instanceId: id }).catch(() => {});
		this.instances = this.instances.filter((i) => i.id !== id);
		if (this.settings.lastInstanceId === id) this.settings.lastInstanceId = undefined;
		this.saveInstances();
		this.saveSettings();
	}

	recordContent(owner: { content: Record<string, InstalledContent> }, items: InstalledContent[]) {
		for (const it of items) owner.content[it.filename] = it;
	}

	// -------------------------------------------------------------- jogar

	async play(inst: Instance, serverAddress?: string) {
		const acc = this.activeAccount;
		if (!acc) {
			this.accountsOpen = true;
			throw new Error('Adicione uma conta (Microsoft ou offline) para jogar.');
		}
		if (this.running[inst.id] || this.tasks[inst.id]?.busy) return;
		this.tasks[inst.id] = { stage: 'versions', current: 0, total: 1, message: 'Preparando…', busy: true };
		try {
			const account = await this.launchAuth(acc);
			const profile = PERF_PROFILES[this.settings.perfProfile];
			const jvmArgs = [...profile.flags.split(/\s+/), ...inst.jvmArgs.split(/\s+/)].filter(Boolean);
			await call('game_launch', {
				req: {
					instanceId: inst.id,
					gameVersion: inst.gameVersion,
					loader: inst.loader,
					loaderVersion: inst.loaderVersion ?? null,
					engine: inst.engine ?? (inst.loader === 'horizon-rust' ? 'rust' : 'java'),
					account,
					memoryMinMb: inst.memory.minMb,
					memoryMaxMb: inst.memory.maxMb,
					jvmArgs,
					javaPath: inst.javaPath || this.settings.javaPath || null,
					rustBinaryPath: inst.rustBinaryPath ?? null,
					horizonRenderDistance: inst.horizonOptions?.renderDistance ?? null,
					horizonLodDistance: inst.horizonOptions?.lodDistance ?? null,
					horizonCaveCulling: inst.horizonOptions?.caveCulling ?? null,
					horizonEntityCulling: inst.horizonOptions?.entityCulling ?? null,
					horizonAnimatedTextures: inst.horizonOptions?.animatedTextures ?? null,
					horizonFxaa: inst.horizonOptions?.fxaa ?? null,
					horizonFullbright: inst.horizonOptions?.fullbright ?? null,
					horizonDynamicLights: inst.horizonOptions?.dynamicLights ?? null,
					horizonZoom: inst.horizonOptions?.zoom ?? null,
					horizonFps: inst.horizonOptions?.fps ?? null,
					horizonKeystrokes: inst.horizonOptions?.keystrokes ?? null,
					horizonMinimap: inst.horizonOptions?.minimap ?? null,
					horizonDiscordPresence: inst.horizonOptions?.discordPresence ?? null,
					horizonCreative: inst.horizonOptions?.creative ?? null,
					horizonTestTerrain: inst.horizonOptions?.testTerrain ?? null,
					horizonPregen: inst.horizonOptions?.pregen ?? null,
					resolution: inst.resolution ?? null,
					hideOnLaunch: this.settings.hideOnLaunch,
					serverAddress: serverAddress ?? inst.autoJoin ?? null
				}
			});
			inst.lastPlayedAt = new Date().toISOString();
			this.settings.lastInstanceId = inst.id;
			this.saveInstances();
			this.saveSettings();
		} catch (e) {
			delete this.tasks[inst.id];
			throw e;
		}
	}

	async stopGame(id: string) {
		await call('game_kill', { instanceId: id });
	}

	// -------------------------------------------------------------- servidores

	newServer(p: Pick<LocalServer, 'name' | 'engine' | 'minecraftVersion' | 'memoryMb'> & Partial<LocalServer>) {
		let id = `srv-${slugify(p.name)}`;
		while (this.servers.some((s) => s.id === id)) id = `srv-${slugify(p.name)}-${uid().slice(0, 4)}`;
		const srv: LocalServer = {
			eulaAccepted: false,
			installed: false,
			content: {},
			createdAt: new Date().toISOString(),
			...p,
			id
		};
		this.servers.push(srv);
		this.serverStatus[id] = 'stopped';
		this.saveServers();
		return srv;
	}

	updateServer(id: string, patch: Partial<LocalServer>) {
		const s = this.servers.find((x) => x.id === id);
		if (!s) return;
		Object.assign(s, patch);
		this.saveServers();
	}

	async installServer(srv: LocalServer) {
		this.serverStatus[srv.id] = 'installing';
		try {
			const jar = srv.customJarUrl?.trim()
				? { url: srv.customJarUrl.trim(), label: `${engine(srv.engine).name} (JAR manual)` }
				: await resolveJar(srv.engine, srv.minecraftVersion, srv.flavor);
			await call('server_install', { serverId: srv.id, url: jar.url, sha1: null });
			const current = await call<Record<string, string>>('server_read_properties', { serverId: srv.id });
			if (!Object.keys(current).length) {
				await call('server_write_properties', { serverId: srv.id, values: DEFAULT_PROPERTIES });
			}
			if (srv.eulaAccepted) await call('server_set_eula', { serverId: srv.id, accepted: true });
			this.updateServer(srv.id, { installed: true, engineLabel: jar.label });
			toasts.ok(`${jar.label} instalado`);
		} finally {
			this.serverStatus[srv.id] = 'stopped';
			delete this.tasks[srv.id];
		}
	}

	async startServer(srv: LocalServer) {
		if (!srv.eulaAccepted) throw new Error('Aceite a EULA do Minecraft para iniciar o servidor.');
		if (!srv.installed) await this.installServer(srv);
		await call('server_set_eula', { serverId: srv.id, accepted: true });
		this.serverLogs[srv.id] = [];
		this.serverStatus[srv.id] = 'starting';
		try {
			await call('server_start', {
				req: {
					serverId: srv.id,
					name: srv.name,
					minecraftVersion: srv.minecraftVersion,
					memoryMb: srv.memoryMb,
					javaPath: this.settings.javaPath || null,
					jvmArgs: PERF_PROFILES.maximo.flags.split(/\s+/)
				}
			});
			this.updateServer(srv.id, { lastStartedAt: new Date().toISOString() });
		} catch (e) {
			this.serverStatus[srv.id] = 'stopped';
			throw e;
		} finally {
			delete this.tasks[srv.id];
		}
	}

	async stopServer(id: string) {
		await call('server_stop', { serverId: id });
	}

	async deleteServer(id: string) {
		if (this.serverStatus[id] === 'running') throw new Error('Pare o servidor antes de excluir.');
		if (isTauri) await call('server_delete', { serverId: id }).catch(() => {});
		this.servers = this.servers.filter((s) => s.id !== id);
		this.saveServers();
	}
}

export const app = new App();
