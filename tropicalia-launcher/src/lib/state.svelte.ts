// Estado global do launcher (Svelte 5 runes). Persistido no plugin-store do Tauri.
import { call, isTauri, kv, on, secrets } from '$lib/platform';
import * as ms from '$lib/services/microsoft-auth';
import { checkForLauncherUpdates, type CheckUpdateResult } from '$lib/services/updates';
import { DEFAULT_PROPERTIES, engine, resolveJar } from '$lib/services/server-engines';
import type {
	Account,
	Instance,
	InstalledContent,
	LanServer,
	PingResult,
	SavedServer,
	LocalServer,
	ProgressEvent,
	ServerStatus,
	Settings
} from '$lib/types';
import { DEFAULT_LOADER_ICON, errorMessage, slugify, uid } from '$lib/util/format';
import { seedHorizonInstanceMods, ensureHorizonModsInstalled } from '$lib/services/horizon-mods';
import { offlineUuid } from '$lib/util/offline-uuid';
import { detectLanguage } from '$lib/i18n';
import { buildControlsBundle, landscapeHeightDp, normalizeControls } from '$lib/controls';

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
	server: 'Servidor',
	'horizon-mc': 'Minecraft 26.3',
	'horizon-engine': 'Motor Horizon Rust',
	'horizon-prepare': 'Preparando Recursos Rust',
	'horizon-launch': 'Iniciando Vulkan',
	'horizon-world': 'Carregando Mundo'
};
export const stageLabel = (s: string) => STAGE_LABEL[s] ?? s;

class App {
	ready = $state(false);
	settings = $state<Settings>({
		msClientId: import.meta.env.VITE_MS_CLIENT_ID || ms.DEFAULT_MS_CLIENT_ID,
		javaPath: '',
		defaultJavaRenderer: 'opengles_mobileglues',
		defaultUseAngle: false,
		defaultMemoryMb: 4096,
		perfProfile: 'equilibrado',
		hideOnLaunch: true,
		showSnapshots: false
	});
	system = $state({ totalMemoryMb: 8192, os: 'windows', arch: 'x86_64', cpus: 4 });
	accounts = $state<Account[]>([]);
	instances = $state<Instance[]>([]);
	servers = $state<LocalServer[]>([]);
	/** lista "Servidores" da tela inicial (o TropicaliaCraft oficial sempre em primeiro) */
	savedServers = $state<SavedServer[]>([]);
	/** último ping por endereço (`'loading'` enquanto mede) */
	pings = $state<Record<string, PingResult | 'loading'>>({});
	lanServers = $state<LanServer[]>([]);
	lanScanning = $state(false);

	tasks = $state<Record<string, LaunchTask>>({});
	contentOperations = $state<Record<string, boolean>>({});
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
		const [settings, accounts, instances, servers, savedServers] = await Promise.all([
			kv.get<Partial<Settings>>('settings', {}),
			kv.get<Account[]>('accounts', []),
			kv.get<Instance[]>('instances', []),
			kv.get<LocalServer[]>('servers', []),
			kv.get<SavedServer[]>('savedServers', [])
		]);
		this.savedServers = withOfficialServer(savedServers);
		Object.assign(this.settings, settings);
		if (!this.settings.msClientId) this.settings.msClientId = import.meta.env.VITE_MS_CLIENT_ID || ms.DEFAULT_MS_CLIENT_ID;
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

		const makeDefaultRust = (): Instance => {
			const inst: Instance = {
				id: 'tropicaliacraft-rust',
				name: 'TropicaliaCraft (Rust)',
				gameVersion: '26.3',
				loader: 'horizon-rust',
				engine: 'rust',
				icon: DEFAULT_LOADER_ICON['horizon-rust'],
				memory: { minMb: 512, maxMb: this.settings.defaultMemoryMb || 4096 },
				jvmArgs: '',
				content: {},
				createdAt: new Date().toISOString(),
				playTimeMinutes: 0
			};
			seedHorizonInstanceMods(inst);
			return inst;
		};

		if (this.instances.length === 0) {
			const defaultRust = makeDefaultRust();
			const defaultJava: Instance = {
				id: 'tropicaliacraft-java',
				name: 'TropicaliaCraft (Java)',
				gameVersion: '1.20.1',
				loader: 'fabric',
				engine: 'java',
				icon: DEFAULT_LOADER_ICON.fabric,
				javaRenderer: this.settings.defaultJavaRenderer || 'opengles_mobileglues',
				useAngle: this.settings.defaultUseAngle || false,
				javaRuntime: '',
				memory: { minMb: 1024, maxMb: this.settings.defaultMemoryMb || 2048 },
				jvmArgs: '',
				content: {},
				createdAt: new Date().toISOString(),
				playTimeMinutes: 0
			};
			this.instances.push(defaultRust, defaultJava);
			this.settings.lastInstanceId = defaultRust.id;
			this.saveInstances();
			this.saveSettings();
		} else {
			let changed = false;
			// Minecraft Rust 26.3 é o padrão de todo mundo: quem não tem ganha de volta, no topo.
			if (!this.instances.some((i) => i.loader === 'horizon-rust')) {
				this.instances.unshift(makeDefaultRust());
				changed = true;
			}
			if (!this.instances.some((i) => i.loader !== 'horizon-rust')) {
				const defaultJava: Instance = {
					id: 'tropicaliacraft-java',
					name: 'TropicaliaCraft (Java)',
					gameVersion: '1.20.1',
					loader: 'fabric',
					engine: 'java',
					icon: DEFAULT_LOADER_ICON.fabric,
					javaRenderer: this.settings.defaultJavaRenderer || 'opengles_mobileglues',
					useAngle: this.settings.defaultUseAngle || false,
					javaRuntime: '',
					memory: { minMb: 1024, maxMb: this.settings.defaultMemoryMb || 2048 },
					jvmArgs: '',
					content: {},
					createdAt: new Date().toISOString(),
					playTimeMinutes: 0
				};
				this.instances.push(defaultJava);
				changed = true;
			}
			for (const inst of this.instances) {
				if (!inst.icon) {
					inst.icon = DEFAULT_LOADER_ICON[inst.loader] ?? 'grass';
					changed = true;
				}
				if (inst.loader === 'horizon-rust') {
					const beforeCount = Object.keys(inst.content).length;
					seedHorizonInstanceMods(inst);
					if (Object.keys(inst.content).length !== beforeCount) changed = true;
				}
			}
			if (changed) this.saveInstances();
		}

		// Sem instância escolhida (primeira vez, ou a escolhida foi apagada): começa no Rust.
		if (!this.instances.some((i) => i.id === this.settings.lastInstanceId)) {
			const rust = this.instances.find((i) => i.id === 'tropicaliacraft-rust') ?? this.instances.find((i) => i.loader === 'horizon-rust');
			if (rust) {
				this.settings.lastInstanceId = rust.id;
				this.saveSettings();
			}
		}
		// O servidor oficial aponta para uma instância que existe (padrão: Rust).
		const official = this.savedServers.find((s) => s.builtin);
		if (official && !this.instances.some((i) => i.id === official.instanceId)) {
			official.instanceId = this.instances.find((i) => i.loader === 'horizon-rust')?.id ?? this.instances[0]?.id;
			this.saveSavedServers();
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
            // Content belongs to the command promise. Late download events must
            // never resurrect a finished install or replace a launch task.
            if (p.stage === 'content' || p.stage === 'content-finished' || this.contentOperations[p.owner] || this.running[p.owner]) return;


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
            delete this.tasks[owner];
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

	saveSettings = () => kv.set('settings', $state.snapshot(this.settings));
	saveAccounts = () => kv.set('accounts', $state.snapshot(this.accounts));
	saveInstances = () => kv.set('instances', $state.snapshot(this.instances));
	saveServers = () => kv.set('servers', $state.snapshot(this.servers));
	saveSavedServers = () => kv.set('savedServers', $state.snapshot(this.savedServers));

	addSavedServer(p: Pick<SavedServer, 'name' | 'address'> & Partial<SavedServer>) {
		const address = p.address.trim();
		if (!address) throw new Error('Informe o endereço do servidor.');
		if (this.savedServers.some((s) => s.address.toLowerCase() === address.toLowerCase())) {
			throw new Error('Esse servidor já está na lista.');
		}
		const srv: SavedServer = { addedAt: new Date().toISOString(), ...p, address, name: p.name.trim() || address, id: `saved-${uid()}` };
		this.savedServers.push(srv);
		this.saveSavedServers();
		void this.pingServer(address);
		return srv;
	}

	updateSavedServer(id: string, patch: Partial<SavedServer>) {
		const s = this.savedServers.find((x) => x.id === id);
		if (!s) return;
		Object.assign(s, s.builtin ? { instanceId: patch.instanceId ?? s.instanceId } : patch);
		this.saveSavedServers();
	}

	removeSavedServer(id: string) {
		this.savedServers = this.savedServers.filter((s) => s.builtin || s.id !== id);
		this.saveSavedServers();
	}

	/** Ping real (Server List Ping) feito pelo próprio aparelho. */
	async pingServer(address: string) {
		const key = address.trim().toLowerCase();
		if (!key || this.pings[key] === 'loading') return;
		this.pings[key] = 'loading';
		try {
			this.pings[key] = isTauri ? await call<PingResult>('server_ping', { address: key }) : await webPing(key);
		} catch (e) {
			this.pings[key] = { online: false, error: errorMessage(e) };
		}
	}

	ping(address: string): PingResult | 'loading' | undefined {
		return this.pings[address.trim().toLowerCase()];
	}

	/** Escuta os mundos "Abrir para LAN" e servidores anunciados na rede local. */
	async scanLan() {
		if (!isTauri || this.lanScanning) return;
		this.lanScanning = true;
		try {
			this.lanServers = await call<LanServer[]>('lan_scan', { durationMs: 3500 });
			for (const s of this.lanServers) void this.pingServer(s.address);
		} catch (e) {
			console.warn('LAN indisponível', e);
		} finally {
			this.lanScanning = false;
		}
	}

	async installContent<T>(ownerId: string, operation: () => Promise<T>): Promise<T> {
		if (this.running[ownerId] || this.tasks[ownerId]?.busy || this.contentOperations[ownerId]) {
			throw new Error('Encerre o jogo ou aguarde a operação atual antes de alterar os mods.');
		}
		this.contentOperations[ownerId] = true;
		try { return await operation(); }
		finally { delete this.contentOperations[ownerId]; }
	}

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
		const clientId = this.settings.msClientId.trim() || ms.DEFAULT_MS_CLIENT_ID;
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
			const s = await ms.refreshSession(this.settings.msClientId.trim() || ms.DEFAULT_MS_CLIENT_ID, refresh);
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
			javaRenderer: this.settings.defaultJavaRenderer || 'opengles_mobileglues',
			useAngle: this.settings.defaultUseAngle || false,
			javaRuntime: '',
			content: {},
			createdAt: new Date().toISOString(),
			playTimeMinutes: 0,
			...p,
			id
		};
		this.instances = [inst, ...this.instances.filter((i) => i.id !== inst.id)];
		if (!this.settings.lastInstanceId) {
			this.settings.lastInstanceId = inst.id;
			this.saveSettings();
		}
		this.saveInstances();
		return inst;
	}

	async updateInstance(id: string, patch: Partial<Instance>) {
		const i = this.instances.find((x) => x.id === id);
		if (!i) return;
		const previous = $state.snapshot(i);
        Object.assign(i, $state.snapshot(patch));
        try { await this.saveInstances(); }
        catch (error) { Object.assign(i, previous); throw error; }
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

	launchPresentation = $state(false);

	async play(inst: Instance, serverAddress?: string) {
		const acc = this.activeAccount;
		if (!acc) {
			this.accountsOpen = true;
			throw new Error('Adicione uma conta (Microsoft ou offline) para jogar.');
		}
		if (this.running[inst.id] || this.tasks[inst.id]?.busy) return;
		if (this.contentOperations[inst.id]) throw new Error('Aguarde a instalação dos mods.');
		if (this.system.os === 'android' && (Object.keys(this.running).length || Object.values(this.tasks).some((t) => t.busy))) {
			throw new Error('Aguarde ou encerre a instância atual antes de abrir outra no Android.');
		}
		this.tasks[inst.id] = { stage: 'versions', current: 0, total: 1, message: 'Preparando…', busy: true };
		// A instância que acabou de receber play vira a mais recente na hora: as listas a
		// levam para o topo e o jogador vê a barra de progresso sem procurar.
		const previousPlayedAt = inst.lastPlayedAt;
		inst.lastPlayedAt = new Date().toISOString();
		try {
			if (inst.loader === 'horizon-rust' && isTauri) {
				await ensureHorizonModsInstalled(inst);
				await this.saveInstances();
			}
			const account = await this.launchAuth(acc);
			const profile = PERF_PROFILES[this.settings.perfProfile];
			const jvmArgs = [...profile.flags.split(/\s+/), ...inst.jvmArgs.split(/\s+/)].filter(Boolean);
			if (this.system.os === 'android') {
				// A broken layout must never block the game: the engines keep their own defaults.
				await this.applyControls().catch((e) => console.warn('Controles de toque não aplicados', e));
			}
			if (this.system.os !== 'android' && inst.loader !== 'horizon-rust' && inst.engine !== 'rust') {
				this.launchPresentation = true;
				await new Promise((resolve) => setTimeout(resolve, 2800));
			}
			await call('game_launch', {
				req: {
					instanceId: inst.id,
					engine: inst.engine ?? (inst.loader === 'horizon-rust' ? 'rust' : 'java'),
					gameVersion: inst.gameVersion,
					language: ({ pt: 'pt_br', en: 'en_us', es: 'es_es' } as const)[detectLanguage()],
					loader: inst.loader,
					loaderVersion: inst.loaderVersion ?? null,
					account,
					memoryMinMb: inst.memory.minMb,
					memoryMaxMb: inst.memory.maxMb,
					jvmArgs,
					javaPath: inst.javaPath || this.settings.javaPath || null,
					javaRenderer: inst.javaRenderer || this.settings.defaultJavaRenderer || 'opengles_mobileglues',
					useAngle: inst.useAngle ?? this.settings.defaultUseAngle ?? false,
					javaRuntime: inst.javaRuntime || null,
					rustBinaryPath: inst.rustBinaryPath ?? null,
					horizonRenderDistance: inst.horizonOptions?.renderDistance ?? null,
					horizonLodDistance: inst.horizonOptions?.lodDistance ?? null,
					horizonCaveCulling: inst.horizonOptions?.caveCulling ?? null,
					horizonEntityCulling: inst.horizonOptions?.entityCulling ?? null,
					horizonAnimatedTextures: inst.horizonOptions?.animatedTextures ?? null,
					horizonFxaa: inst.horizonOptions?.antialiasing === 'fxaa' || !!inst.horizonOptions?.fxaa,
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
					horizonOptions: inst.horizonOptions ?? null,
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
			inst.lastPlayedAt = previousPlayedAt;
			throw e;
		} finally {
			this.launchPresentation = false;
		}
	}

	/** Renders the shared touch layout and hands it to both Android engines. */
	async applyControls() {
		const bundle = await buildControlsBundle(normalizeControls(this.settings.controls), landscapeHeightDp());
		await call('controls_apply', { bundle });
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
			await call('server_install', {
				serverId: srv.id,
				url: jar.url,
				sha1: jar.sha1 ?? null,
				installer: !srv.customJarUrl?.trim() && !!engine(srv.engine).installer,
				minecraftVersion: srv.minecraftVersion
			});
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

export const OFFICIAL_SERVER: SavedServer = {
	id: 'tropicaliacraft',
	name: 'TropicaliaCraft',
	address: 'tropicaliacraft.gustavolara.pro',
	instanceId: 'tropicaliacraft-rust',
	builtin: true,
	addedAt: '2026-01-01T00:00:00.000Z'
};

/** O servidor oficial vem adicionado de fábrica e fica sempre no topo. */
function withOfficialServer(list: SavedServer[]): SavedServer[] {
	const own = list.find((s) => s.builtin);
	const rest = list.filter((s) => !s.builtin && s.address.toLowerCase() !== OFFICIAL_SERVER.address);
	return [{ ...OFFICIAL_SERVER, instanceId: own?.instanceId ?? OFFICIAL_SERVER.instanceId }, ...rest];
}

/** No navegador (npm run dev) não há socket TCP: usa a API pública do mcsrvstat. */
async function webPing(address: string): Promise<PingResult> {
	const r = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`);
	const j = await r.json();
	return {
		online: !!j.online,
		// A latência aqui seria a da API, não a do servidor: só o app mede de verdade.
		latencyMs: null,
		motd: Array.isArray(j.motd?.raw) ? j.motd.raw.join('\n') : undefined,
		favicon: j.icon ?? null,
		playersOnline: j.players?.online ?? null,
		playersMax: j.players?.max ?? null,
		sample: (j.players?.list ?? []).map((p: { name: string }) => p.name),
		version: j.version ?? null
	};
}

export const app = new App();
