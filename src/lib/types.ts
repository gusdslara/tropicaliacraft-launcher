// Contratos do launcher (adaptados de tropicalia-launcher-lab/engine-specs).

export type ModLoader = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'horizon-rust';
export type EngineType = 'java' | 'rust';
export type ContentKind = 'mod' | 'resourcepack' | 'shader' | 'datapack' | 'modpack' | 'plugin';

export interface Account {
	id: string;
	type: 'microsoft' | 'offline';
	username: string;
	/** UUID com traços */
	uuid: string;
	skinUrl?: string;
	/** Expiração do token do Minecraft (ms). Os tokens em si ficam no cofre do SO. */
	tokenExpiresAt?: number;
	addedAt: string;
}

export interface InstalledContent {
	filename: string;
	kind: ContentKind;
	title: string;
	projectId?: string;
	versionId?: string;
	versionNumber?: string;
	iconUrl?: string;
	url?: string;
	sha1?: string;
	sha512?: string;
	size?: number;
	/** veio como dependência de outro projeto */
	dependencyOf?: string;
}

export type BlockIcon = 'grass' | 'stone' | 'diamond' | 'gold' | 'iron' | 'creeper' | 'steve';

export interface HorizonOptions {
	renderDistance?: number;
	lodDistance?: number;
	farDetail?: 'full' | 'simple' | 'off';
	caveCulling?: boolean;
	entityCulling?: boolean;
	animatedTextures?: boolean;
	fxaa?: boolean;
	sky?: boolean;
	fog?: boolean;
	weather?: boolean;
	fullbright?: boolean;
	dynamicLights?: boolean;
	zoom?: boolean;
	fps?: boolean;
	keystrokes?: boolean;
	minimap?: boolean;
	discordPresence?: boolean;
	creative?: boolean;
	testTerrain?: boolean;
	pregen?: boolean;
}

export interface Instance {
	id: string;
	name: string;
	icon: BlockIcon;
	engine?: EngineType;
	gameVersion: string;
	loader: ModLoader;
	loaderVersion?: string;
	memory: { minMb: number; maxMb: number };
	jvmArgs: string;
	javaPath?: string;
	rustBinaryPath?: string;
	horizonOptions?: HorizonOptions;
	resolution?: { width: number; height: number };
	/** "host:porta" para entrar direto ao abrir */
	autoJoin?: string;
	content: Record<string, InstalledContent>;
	modpack?: { projectId?: string; versionId?: string; name: string };
	createdAt: string;
	lastPlayedAt?: string;
	playTimeMinutes: number;
}

export type ServerEngine = 'magma' | 'mohist' | 'arclight' | 'paper' | 'purpur' | 'fabric';
export type ServerStatus = 'stopped' | 'installing' | 'starting' | 'running' | 'stopping' | 'crashed';

export interface LocalServer {
	id: string;
	name: string;
	engine: ServerEngine;
	/** variante do híbrido Arclight (forge/neoforge/fabric) */
	flavor?: string;
	minecraftVersion: string;
	engineLabel?: string;
	customJarUrl?: string;
	memoryMb: number;
	eulaAccepted: boolean;
	installed: boolean;
	content: Record<string, InstalledContent>;
	createdAt: string;
	lastStartedAt?: string;
}

export interface Settings {
	msClientId: string;
	javaPath: string;
	defaultMemoryMb: number;
	perfProfile: 'economico' | 'equilibrado' | 'maximo';
	hideOnLaunch: boolean;
	showSnapshots: boolean;
	lastInstanceId?: string;
	activeAccountId?: string;
}

export interface ProgressEvent {
	owner: string;
	stage: string;
	current: number;
	total: number;
	bytes: number;
	message: string;
}

export interface PatchNotes {
	novidades: string[];
	correcoes: string[];
}

export interface PlatformAsset {
	url: string;
	type: 'zip' | 'binary' | 'apk';
	binary?: string;
	sha1?: string;
	size?: number;
}

export interface LauncherUpdateManifest {
	version: string;
	name: string;
	releaseDate: string;
	minVersion?: string;
	highlights?: string;
	patchNotes: PatchNotes;
	platforms: Record<string, PlatformAsset>;
}

