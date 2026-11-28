// Catálogo de motores de servidor e resolução da URL do JAR em cada API oficial.
import { getJson } from '$lib/platform';
import type { ServerEngine } from '$lib/types';

export interface EngineInfo {
	id: ServerEngine;
	name: string;
	category: 'vanilla' | 'plugins' | 'mods' | 'hybrid' | 'rust';
	tagline: string;
	/** pastas que esse motor usa */
	accepts: Array<'mod' | 'plugin'>;
	/** loader dos mods aceitos (para filtrar a Modrinth) */
	modLoader?: 'forge' | 'neoforge' | 'fabric';
	/** quando a API é instável, a UI mostra o campo de URL manual em destaque */
	bestEffort?: boolean;
	site: string;
	flavors?: Array<{ id: string; label: string; modLoader: 'forge' | 'neoforge' | 'fabric' }>;
	/** baixa um instalador e roda `--installServer` (Forge/NeoForge) em vez de um server.jar pronto */
	installer?: boolean;
	/** destaque "recomendado" no card */
	recommended?: boolean;
	/** executável nativo (sem Java, sem EULA, sem server.properties): configurado pelo `pumpkin.toml` */
	native?: boolean;
}

export const ENGINES: EngineInfo[] = [
	{
		id: 'vanilla',
		name: 'Vanilla',
		category: 'vanilla',
		tagline: 'O servidor oficial da Mojang, sem mods nem plugins.',
		accepts: [],
		site: 'https://www.minecraft.net/download/server'
	},
	{
		id: 'paper',
		name: 'Paper',
		category: 'plugins',
		tagline: 'O padrão para plugins, focado em desempenho.',
		accepts: ['plugin'],
		recommended: true,
		site: 'https://papermc.io'
	},
	{
		id: 'purpur',
		name: 'Purpur',
		category: 'plugins',
		tagline: 'Fork do Paper com dezenas de opções extras de gameplay.',
		accepts: ['plugin'],
		site: 'https://purpurmc.org'
	},
	{
		id: 'folia',
		name: 'Folia',
		category: 'plugins',
		tagline: 'Paper multithread por regiões, para muitos jogadores.',
		accepts: ['plugin'],
		site: 'https://papermc.io/software/folia'
	},
	{
		id: 'fabric',
		name: 'Fabric',
		category: 'mods',
		tagline: 'Leve e rápido: mods de performance e conteúdo Fabric.',
		accepts: ['mod'],
		modLoader: 'fabric',
		recommended: true,
		site: 'https://fabricmc.net'
	},
	{
		id: 'forge',
		name: 'Forge',
		category: 'mods',
		tagline: 'O clássico dos modpacks grandes (1.7.10 até hoje).',
		accepts: ['mod'],
		modLoader: 'forge',
		installer: true,
		site: 'https://files.minecraftforge.net'
	},
	{
		id: 'neoforge',
		name: 'NeoForge',
		category: 'mods',
		tagline: 'Sucessor do Forge (1.20.2+): Create, Mekanism, ATM…',
		accepts: ['mod'],
		modLoader: 'neoforge',
		installer: true,
		site: 'https://neoforged.net'
	},
	{
		id: 'magma',
		name: 'Magma',
		category: 'hybrid',
		tagline: 'Forge/NeoForge + plugins Bukkit/Spigot/Paper no mesmo servidor.',
		accepts: ['mod', 'plugin'],
		modLoader: 'neoforge',
		bestEffort: true,
		site: 'https://magmafoundation.org'
	},
	{
		id: 'arclight',
		name: 'Arclight',
		category: 'hybrid',
		tagline: 'Híbrido moderno via Mixins: NeoForge, Forge ou Fabric + plugins.',
		accepts: ['mod', 'plugin'],
		site: 'https://github.com/IzzelAliz/Arclight',
		flavors: [
			{ id: 'neoforge', label: 'NeoForge', modLoader: 'neoforge' },
			{ id: 'forge', label: 'Forge', modLoader: 'forge' },
			{ id: 'fabric', label: 'Fabric', modLoader: 'fabric' }
		]
	},
	{
		id: 'mohist',
		name: 'Mohist',
		category: 'hybrid',
		tagline: 'Forge + plugins, com longa compatibilidade (1.7.10 a 1.20.x).',
		accepts: ['mod', 'plugin'],
		modLoader: 'forge',
		bestEffort: true,
		site: 'https://mohistmc.com'
	},
	{
		id: 'pumpkin',
		name: 'Pumpkin',
		category: 'rust',
		tagline: 'Servidor escrito em Rust: abre em segundos e usa pouca RAM, sem Java.',
		accepts: [],
		native: true,
		site: 'https://pumpkinmc.org'
	}
];

export const engine = (id: ServerEngine) => ENGINES.find((e) => e.id === id)!;

export interface ResolvedJar {
	url: string;
	label: string;
	sha1?: string;
	sha256?: string;
}

/** Sistema onde o servidor vai rodar (o Pumpkin publica um executável por plataforma). */
export interface HostPlatform {
	os: string;
	arch: string;
}

// ------------------------------------------------------------------ versões por motor

const MAGMA_VERSIONS = ['1.21.1', '1.20.1', '1.19.3', '1.18.2', '1.16.5', '1.12.2'];
const MOHIST_VERSIONS = ['1.20.1', '1.20.2', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.7.10'];

interface GhRelease {
	tag_name: string;
	prerelease: boolean;
	assets: Array<{ name: string; browser_download_url: string; digest?: string | null }>;
}

// ------------------------------------------------------------------ Pumpkin (Rust)

const PUMPKIN_REPO = 'Pumpkin-MC/Pumpkin';
/** Usado só se a API do GitHub estiver fora do ar ou no limite de requisições. */
const PUMPKIN_FALLBACK_MC = '26.3';

/** O Pumpkin tem executável para este sistema? (Android só arm64; sem Mac Intel.) */
export const pumpkinSupported = (host: HostPlatform) => pumpkinAsset(host) !== null;

/** Nome do executável publicado para cada sistema; `null` quando o Pumpkin não tem build. */
export function pumpkinAsset(host: HostPlatform): string | null {
	const arm = host.arch === 'aarch64' || host.arch === 'arm64';
	const x64 = host.arch === 'x86_64';
	if (host.os === 'windows') return arm ? 'pumpkin-ARM64-Windows.exe' : x64 ? 'pumpkin-X64-Windows.exe' : null;
	if (host.os === 'linux') return arm ? 'pumpkin-ARM64-Linux' : x64 ? 'pumpkin-X64-Linux' : null;
	if (host.os === 'macos') return arm ? 'pumpkin-ARM64-macOS' : null;
	if (host.os === 'android') return arm ? 'pumpkin-aarch64-android' : null;
	return null;
}

/** "0.2.2+26.3-26.60" → { pumpkin: "0.2.2", mc: "26.3" } (o sufixo é a versão Bedrock). */
export function parsePumpkinTag(tag: string): { pumpkin: string; mc: string } | null {
	const m = tag.match(/^v?(\d+\.\d+\.\d+)\+(\d+(?:\.\d+)+)(?:-|$)/);
	return m ? { pumpkin: m[1], mc: m[2] } : null;
}

async function pumpkinReleases() {
	const releases = await getJson<GhRelease[]>(`https://api.github.com/repos/${PUMPKIN_REPO}/releases?per_page=30`, {
		headers: { Accept: 'application/vnd.github+json' }
	});
	return releases.flatMap((r) => {
		const v = r.prerelease ? null : parsePumpkinTag(r.tag_name);
		return v ? [{ ...v, assets: r.assets }] : [];
	});
}

async function pumpkinJar(mc: string, host?: HostPlatform): Promise<ResolvedJar> {
	if (!host) throw new Error('Sistema desconhecido: não deu para escolher o executável do Pumpkin.');
	const asset = pumpkinAsset(host);
	if (!asset) throw new Error(`O Pumpkin não publica executável para ${host.os} ${host.arch}.`);
	// API do GitHub fora do ar ou no limite de requisições: cai para o link direto abaixo.
	const releases = await pumpkinReleases().catch(() => null);
	if (releases?.length) {
		const release = releases.find((r) => r.mc === mc);
		if (!release) throw new Error(`Nenhuma versão estável do Pumpkin para o Minecraft ${mc}.`);
		const file = release.assets.find((a) => a.name === asset);
		if (!file) throw new Error(`O Pumpkin ${release.pumpkin} não tem executável para ${host.os} ${host.arch}.`);
		return {
			url: file.browser_download_url,
			sha256: file.digest?.startsWith('sha256:') ? file.digest.slice(7) : undefined,
			label: `Pumpkin ${release.pumpkin} · Minecraft ${mc}`
		};
	}
	// Sem a API: o GitHub redireciona `latest/download` para o último release estável.
	return { url: `https://github.com/${PUMPKIN_REPO}/releases/latest/download/${asset}`, label: `Pumpkin · Minecraft ${mc}` };
}

async function arclightAssets() {
	const releases = await getJson<GhRelease[]>('https://api.github.com/repos/IzzelAliz/Arclight/releases?per_page=40', {
		headers: { Accept: 'application/vnd.github+json' }
	});
	const out: Array<{ flavor: string; mc: string; name: string; url: string; tag: string }> = [];
	for (const r of releases) {
		for (const a of r.assets) {
			// arclight-<flavor>-<mc>-<versão>.jar
			const m = a.name.match(/^arclight-(forge|neoforge|fabric)-(\d+\.\d+(?:\.\d+)?)-.+\.jar$/i);
			if (m) out.push({ flavor: m[1].toLowerCase(), mc: m[2], name: a.name, url: a.browser_download_url, tag: r.tag_name });
		}
	}
	return out;
}

function sortVersions(list: string[]) {
	const key = (v: string) => v.split('.').map((n) => n.padStart(3, '0')).join('.');
	return [...new Set(list)].sort((a, b) => key(b).localeCompare(key(a)));
}

interface MojangManifest {
	versions: Array<{ id: string; type: string; url: string }>;
}
const mojangManifest = () => getJson<MojangManifest>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');

/** promoções do Forge: "1.20.1-recommended" → "47.4.0" */
const forgePromos = () =>
	getJson<{ promos: Record<string, string> }>('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json').then(
		(p) => p.promos
	);

/** NeoForge 21.1.77 → Minecraft 1.21.1; 20.4.x → 1.20.4; 21.0.x → 1.21; 26.1.0.x → 26.1 */
export function neoforgeMc(v: string): string {
	const [major, minor, patch] = v.split(/[.-]/);
	if (Number(major) >= 26) return patch && patch !== '0' ? `${major}.${minor}.${patch}` : `${major}.${minor}`;
	return minor === '0' ? `1.${major}` : `1.${major}.${minor}`;
}

const neoforgeVersions = () =>
	getJson<{ versions: string[] }>('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge').then((r) =>
		r.versions.filter((v) => !v.startsWith('0.'))
	);

async function fillVersions(project: 'paper' | 'folia') {
	const p = await getJson<{ versions: Record<string, string[]> }>(`https://fill.papermc.io/v3/projects/${project}`);
	return sortVersions(Object.values(p.versions).flat().filter((v) => !/pre|rc/.test(v)));
}

async function fillJar(project: 'paper' | 'folia', mc: string): Promise<ResolvedJar | undefined> {
	const builds = await getJson<Array<{ id: number; channel: string; downloads: Record<string, { name: string; url: string }> }>>(
		`https://fill.papermc.io/v3/projects/${project}/versions/${mc}/builds`
	);
	const b = builds.find((x) => x.channel === 'STABLE') ?? builds[0];
	const dl = b?.downloads['server:default'];
	return dl ? { url: dl.url, label: `${project === 'paper' ? 'Paper' : 'Folia'} ${mc} #${b.id}` } : undefined;
}

export async function engineVersions(id: ServerEngine, flavor?: string): Promise<string[]> {
	switch (id) {
		case 'vanilla': {
			const m = await mojangManifest();
			return m.versions.filter((v) => v.type === 'release').map((v) => v.id);
		}
		case 'folia':
			return fillVersions('folia');
		case 'forge': {
			const promos = await forgePromos();
			return sortVersions(Object.keys(promos).map((k) => k.replace(/-(latest|recommended)$/, '')));
		}
		case 'neoforge': {
			const list = await neoforgeVersions();
			return sortVersions(list.filter((v) => !/beta|alpha/.test(v)).map(neoforgeMc));
		}
		case 'paper': {
			try {
				return await fillVersions('paper');
			} catch {
				const p = await getJson<{ versions: string[] }>('https://api.papermc.io/v2/projects/paper');
				return sortVersions(p.versions.filter((v) => !/pre|rc/.test(v)));
			}
		}
		case 'purpur': {
			const p = await getJson<{ versions: string[] }>('https://api.purpurmc.org/v2/purpur');
			return sortVersions(p.versions);
		}
		case 'fabric': {
			const list = await getJson<Array<{ version: string; stable: boolean }>>('https://meta.fabricmc.net/v2/versions/game');
			return list.filter((v) => v.stable).map((v) => v.version);
		}
		case 'arclight': {
			const assets = await arclightAssets();
			return sortVersions(assets.filter((a) => !flavor || a.flavor === flavor).map((a) => a.mc));
		}
		case 'magma':
			return MAGMA_VERSIONS;
		case 'mohist':
			return MOHIST_VERSIONS;
		case 'pumpkin': {
			const list = await pumpkinReleases().catch(() => []);
			return list.length ? sortVersions(list.map((r) => r.mc)) : [PUMPKIN_FALLBACK_MC];
		}
	}
}

export async function resolveJar(id: ServerEngine, mc: string, flavor?: string, host?: HostPlatform): Promise<ResolvedJar> {
	switch (id) {
		case 'vanilla': {
			const m = await mojangManifest();
			const v = m.versions.find((x) => x.id === mc);
			if (!v) throw new Error(`Versão ${mc} não encontrada na Mojang`);
			const json = await getJson<{ downloads?: { server?: { url: string; sha1: string } } }>(v.url);
			const server = json.downloads?.server;
			if (!server) throw new Error(`A Mojang não publica servidor para ${mc}`);
			return { url: server.url, sha1: server.sha1, label: `Vanilla ${mc}` };
		}
		case 'folia': {
			const jar = await fillJar('folia', mc);
			if (!jar) throw new Error(`Nenhum build estável do Folia para ${mc}`);
			return jar;
		}
		case 'forge': {
			const promos = await forgePromos();
			const v = promos[`${mc}-recommended`] ?? promos[`${mc}-latest`];
			if (!v) throw new Error(`Nenhum Forge para ${mc}`);
			const full = `${mc}-${v}`;
			return {
				url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`,
				label: `Forge ${mc} · ${v}`
			};
		}
		case 'neoforge': {
			const list = (await neoforgeVersions()).filter((v) => neoforgeMc(v) === mc);
			const stable = list.filter((v) => !/beta|alpha/.test(v));
			const v = (stable.length ? stable : list).at(-1);
			if (!v) throw new Error(`Nenhum NeoForge para ${mc}`);
			return {
				url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${v}/neoforge-${v}-installer.jar`,
				label: `NeoForge ${mc} · ${v}`
			};
		}
		case 'paper': {
			try {
				const jar = await fillJar('paper', mc);
				if (jar) return jar;
			} catch {
				/* cai para a API v2 */
			}
			const v2 = await getJson<{ builds: Array<{ build: number; channel: string; downloads: { application: { name: string } } }> }>(
				`https://api.papermc.io/v2/projects/paper/versions/${mc}/builds`
			);
			const b = [...v2.builds].reverse().find((x) => x.channel === 'default') ?? v2.builds.at(-1)!;
			return {
				url: `https://api.papermc.io/v2/projects/paper/versions/${mc}/builds/${b.build}/downloads/${b.downloads.application.name}`,
				label: `Paper ${mc} #${b.build}`
			};
		}
		case 'purpur':
			return { url: `https://api.purpurmc.org/v2/purpur/${mc}/latest/download`, label: `Purpur ${mc} (última build)` };
		case 'fabric': {
			const [loaders, installers] = await Promise.all([
				getJson<Array<{ version: string; stable: boolean }>>('https://meta.fabricmc.net/v2/versions/loader'),
				getJson<Array<{ version: string; stable: boolean }>>('https://meta.fabricmc.net/v2/versions/installer')
			]);
			const loader = (loaders.find((l) => l.stable) ?? loaders[0]).version;
			const installer = (installers.find((i) => i.stable) ?? installers[0]).version;
			return {
				url: `https://meta.fabricmc.net/v2/versions/loader/${mc}/${loader}/${installer}/server/jar`,
				label: `Fabric ${mc} · loader ${loader}`
			};
		}
		case 'arclight': {
			const assets = await arclightAssets();
			const a = assets.find((x) => x.mc === mc && (!flavor || x.flavor === flavor));
			if (!a) throw new Error(`Nenhum build do Arclight ${flavor ?? ''} para ${mc}`);
			return { url: a.url, label: `Arclight ${a.flavor} ${mc} (${a.tag})` };
		}
		case 'mohist':
			return {
				url: `https://api.mohistmc.com/project/mohist/${mc}/builds/latest/download`,
				label: `Mohist ${mc} (última build)`
			};
		case 'magma':
			return {
				url: `https://api.magmafoundation.org/api/v2/${mc}/latest/download`,
				label: `Magma ${mc} (última build)`
			};
		case 'pumpkin':
			return pumpkinJar(mc, host);
	}
}

// ------------------------------------------------------------------ pumpkin.toml

export type TomlField =
	| { key: string; label: string; type: 'text' | 'number'; help?: string; min?: number; max?: number }
	| { key: string; label: string; type: 'bool'; help?: string }
	| { key: string; label: string; type: 'select'; options: Array<[string, string]>; help?: string };

/** Chave sintética: a porta fica dentro de `networking.java.address` ("0.0.0.0:25565"). */
export const PUMPKIN_PORT_KEY = 'port';
export const PUMPKIN_ADDRESS_KEY = 'networking.java.address';

export const PUMPKIN_GROUPS: Array<{ id: string; title: string; fields: TomlField[] }> = [
	{
		id: 'access',
		title: 'Acesso',
		fields: [
			{ key: 'networking.java.motd', label: 'Descrição (MOTD)', type: 'text' },
			{ key: PUMPKIN_PORT_KEY, label: 'Porta', type: 'number', min: 1024, max: 65535, help: 'Padrão 25565.' },
			{ key: 'networking.java.max_players', label: 'Máximo de jogadores', type: 'number', min: 1, max: 100000 },
			{
				key: 'networking.java.online_mode',
				label: 'Online mode (só contas originais)',
				type: 'bool',
				help: 'Desligue para entrar com conta offline do launcher ou jogar em LAN.'
			},
			{ key: 'white_list', label: 'Whitelist ativa', type: 'bool', help: 'Adicione nomes pelo console: whitelist add Nick.' },
			{
				key: 'networking.bedrock.enabled',
				label: 'Aceitar Minecraft Bedrock',
				type: 'bool',
				help: 'Usa a porta UDP 19132. Desligue se ela já estiver em uso, senão o servidor não inicia.'
			}
		]
	},
	{
		id: 'game',
		title: 'Jogo',
		fields: [
			{ key: 'default_gamemode', label: 'Modo de jogo padrão', type: 'select', options: [['Survival', 'Sobrevivência'], ['Creative', 'Criativo'], ['Adventure', 'Aventura'], ['Spectator', 'Espectador']] },
			{ key: 'force_gamemode', label: 'Forçar modo ao entrar', type: 'bool' },
			{ key: 'default_difficulty', label: 'Dificuldade', type: 'select', options: [['Peaceful', 'Pacífico'], ['Easy', 'Fácil'], ['Normal', 'Normal'], ['Hard', 'Difícil']] },
			{ key: 'hardcore', label: 'Hardcore', type: 'bool' },
			{ key: 'pvp.enabled', label: 'PvP', type: 'bool' },
			{ key: 'allow_nether', label: 'Nether', type: 'bool' }
		]
	},
	{
		id: 'world',
		title: 'Mundo e desempenho',
		fields: [
			{ key: 'default_level_name', label: 'Pasta do mundo', type: 'text' },
			{ key: 'seed', label: 'Seed', type: 'text', help: 'Só vale para mundo novo. Vazio = aleatória.' },
			{ key: 'networking.java.view_distance', label: 'Distância de visão (chunks)', type: 'number', min: 2, max: 64 },
			{ key: 'networking.java.simulation_distance', label: 'Distância de simulação (chunks)', type: 'number', min: 2, max: 32 }
		]
	}
];

/** Padrões do Pumpkin para chaves que ainda não estão no arquivo (ele só é escrito na primeira execução). */
export const PUMPKIN_DEFAULTS: Record<string, string | number | boolean> = {
	'networking.java.motd': 'A blazingly fast Pumpkin server!',
	[PUMPKIN_ADDRESS_KEY]: '0.0.0.0:25565',
	'networking.java.max_players': 1000,
	'networking.java.online_mode': true,
	white_list: false,
	'networking.bedrock.enabled': true,
	default_gamemode: 'Survival',
	force_gamemode: false,
	default_difficulty: 'Normal',
	hardcore: false,
	'pvp.enabled': true,
	allow_nether: true,
	default_level_name: 'world',
	seed: '',
	'networking.java.view_distance': 16,
	'networking.java.simulation_distance': 10
};

/** Valores gravados ao criar o servidor: nome do launcher no MOTD e um limite de jogadores caseiro. */
export const PUMPKIN_INITIAL: Record<string, string | number | boolean> = {
	'networking.java.motd': 'Servidor Tropicalia do launcher (Rust)',
	'networking.java.max_players': 10
};

export const pumpkinPort = (address: unknown) => String(address ?? '').match(/:(\d+)$/)?.[1] ?? '25565';

export type PropertyField =
	| { key: string; label: string; type: 'text' | 'number'; help?: string; min?: number; max?: number; warn?: (v: string) => string | null }
	| { key: string; label: string; type: 'bool'; help?: string; warn?: (v: string) => string | null }
	| { key: string; label: string; type: 'select'; options: Array<[string, string]>; help?: string; warn?: (v: string) => string | null };

/** server.properties completo em grupos (os mesmos campos do painel do TropicaliaCraft oficial). */
export const PROPERTY_GROUPS: Array<{ id: string; title: string; fields: PropertyField[] }> = [
	{
		id: 'access',
		title: 'Acesso e segurança',
		fields: [
			{
				key: 'online-mode',
				label: 'Online mode (só contas originais)',
				type: 'bool',
				help: 'Desligue para jogar em LAN com contas offline, ou atrás de um proxy.',
				warn: (v) => (v === 'false' ? 'Desligado: qualquer um entra com qualquer nick. Ative a whitelist se o servidor for público.' : null)
			},
			{ key: 'white-list', label: 'Whitelist ativa', type: 'bool', help: 'Os nomes ficam na aba Whitelist & OPs.' },
			{ key: 'enforce-whitelist', label: 'Expulsar quem sai da whitelist', type: 'bool', help: 'Quem já está online e não está na lista é expulso ao recarregar.' },
			{ key: 'enforce-secure-profile', label: 'Exigir chat assinado', type: 'bool', help: 'Desligue com Geyser/Floodgate ou contas offline.' },
			{ key: 'prevent-proxy-connections', label: 'Bloquear VPN/proxy', type: 'bool' },
			{ key: 'max-players', label: 'Máximo de jogadores', type: 'number', min: 1, max: 10000 },
			{ key: 'server-port', label: 'Porta', type: 'number', min: 1024, max: 65535, help: 'Padrão 25565.' },
			{ key: 'server-ip', label: 'IP de bind (vazio = todos)', type: 'text' },
			{ key: 'hide-online-players', label: 'Esconder jogadores no ping', type: 'bool' },
			{ key: 'enable-status', label: 'Aparecer na lista de servidores', type: 'bool' },
			{
				key: 'op-permission-level',
				label: 'Poder dos OPs',
				type: 'select',
				options: [
					['1', '1 · ignora proteção do spawn'],
					['2', '2 · comandos de jogo'],
					['3', '3 · kick e ban'],
					['4', '4 · tudo (stop, save)']
				]
			}
		]
	},
	{
		id: 'game',
		title: 'Jogo',
		fields: [
			{ key: 'gamemode', label: 'Modo de jogo padrão', type: 'select', options: [['survival', 'Sobrevivência'], ['creative', 'Criativo'], ['adventure', 'Aventura'], ['spectator', 'Espectador']] },
			{ key: 'force-gamemode', label: 'Forçar modo ao entrar', type: 'bool' },
			{ key: 'difficulty', label: 'Dificuldade', type: 'select', options: [['peaceful', 'Pacífico'], ['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']] },
			{ key: 'hardcore', label: 'Hardcore', type: 'bool', help: 'Morreu, virou espectador.' },
			{ key: 'pvp', label: 'PvP', type: 'bool' },
			{ key: 'allow-flight', label: 'Permitir voo', type: 'bool', help: 'Evita kick por "flying" em modpacks com jetpack.' },
			{ key: 'allow-nether', label: 'Nether', type: 'bool' },
			{ key: 'spawn-monsters', label: 'Monstros', type: 'bool' },
			{ key: 'spawn-protection', label: 'Proteção do spawn (blocos)', type: 'number', min: 0, max: 1000, help: '0 desliga; OPs ignoram.' },
			{ key: 'enable-command-block', label: 'Command blocks', type: 'bool' }
		]
	},
	{
		id: 'world',
		title: 'Mundo e desempenho',
		fields: [
			{ key: 'level-name', label: 'Pasta do mundo', type: 'text' },
			{ key: 'level-seed', label: 'Seed', type: 'text', help: 'Só vale para mundo novo.' },
			{
				key: 'level-type',
				label: 'Tipo de mundo',
				type: 'select',
				options: [['minecraft:normal', 'Normal'], ['minecraft:flat', 'Plano'], ['minecraft:large_biomes', 'Biomas grandes'], ['minecraft:amplified', 'Amplificado']],
				help: 'Só vale para mundo novo.'
			},
			{ key: 'generate-structures', label: 'Gerar estruturas', type: 'bool' },
			{ key: 'view-distance', label: 'Distância de visão (chunks)', type: 'number', min: 2, max: 32, help: '6–10 é o ideal num PC comum.' },
			{ key: 'simulation-distance', label: 'Distância de simulação (chunks)', type: 'number', min: 2, max: 32 },
			{ key: 'max-world-size', label: 'Tamanho máximo do mundo (raio)', type: 'number', min: 1, max: 29999984 },
			{ key: 'player-idle-timeout', label: 'Expulsar AFK após (min, 0 = nunca)', type: 'number', min: 0, max: 10000 },
			{ key: 'pause-when-empty-seconds', label: 'Pausar vazio após (s, -1 = nunca)', type: 'number', min: -1, max: 100000 },
			{ key: 'network-compression-threshold', label: 'Compressão de rede (bytes)', type: 'number', min: -1, max: 65535 },
			{ key: 'require-resource-pack', label: 'Exigir resource pack', type: 'bool' },
			{ key: 'resource-pack', label: 'URL do resource pack', type: 'text' }
		]
	}
];

/** Lista plana (compatibilidade). */
export const PROPERTY_FIELDS: PropertyField[] = PROPERTY_GROUPS.flatMap((g) => g.fields);

/** Padrões do Minecraft para chaves ausentes do arquivo (só exibição). */
export const MINECRAFT_DEFAULTS: Record<string, string> = {
	'online-mode': 'true',
	'white-list': 'false',
	'enforce-whitelist': 'false',
	'enforce-secure-profile': 'true',
	'prevent-proxy-connections': 'false',
	'hide-online-players': 'false',
	'enable-status': 'true',
	'op-permission-level': '4',
	'max-players': '20',
	'server-port': '25565',
	gamemode: 'survival',
	'force-gamemode': 'false',
	difficulty: 'easy',
	hardcore: 'false',
	pvp: 'true',
	'allow-flight': 'false',
	'allow-nether': 'true',
	'spawn-monsters': 'true',
	'spawn-protection': '16',
	'enable-command-block': 'false',
	'level-name': 'world',
	'level-type': 'minecraft:normal',
	'generate-structures': 'true',
	'view-distance': '10',
	'simulation-distance': '10',
	'max-world-size': '29999984',
	'player-idle-timeout': '0',
	'pause-when-empty-seconds': '60',
	'network-compression-threshold': '256',
	'require-resource-pack': 'false'
};

export const DEFAULT_PROPERTIES: Record<string, string> = {
	motd: '§aServidor §6Tropicalia §fdo launcher',
	'server-port': '25565',
	'max-players': '10',
	gamemode: 'survival',
	difficulty: 'normal',
	'online-mode': 'true',
	'white-list': 'false',
	pvp: 'true',
	'allow-flight': 'true',
	'view-distance': '10',
	'simulation-distance': '8',
	'spawn-protection': '0'
};
