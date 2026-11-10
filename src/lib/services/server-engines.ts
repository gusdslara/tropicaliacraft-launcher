// Catálogo de motores de servidor e resolução da URL do JAR em cada API oficial.
import { getJson } from '$lib/platform';
import type { ServerEngine } from '$lib/types';

export interface EngineInfo {
	id: ServerEngine;
	name: string;
	category: 'hybrid' | 'plugins' | 'mods';
	tagline: string;
	/** pastas que esse motor usa */
	accepts: Array<'mod' | 'plugin'>;
	/** loader dos mods aceitos (para filtrar a Modrinth) */
	modLoader?: 'forge' | 'neoforge' | 'fabric';
	/** quando a API é instável, a UI mostra o campo de URL manual em destaque */
	bestEffort?: boolean;
	site: string;
	flavors?: Array<{ id: string; label: string; modLoader: 'forge' | 'neoforge' | 'fabric' }>;
}

export const ENGINES: EngineInfo[] = [
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
		id: 'paper',
		name: 'Paper',
		category: 'plugins',
		tagline: 'O padrão para plugins, focado em desempenho.',
		accepts: ['plugin'],
		site: 'https://papermc.io'
	},
	{
		id: 'folia',
		name: 'Folia',
		category: 'plugins',
		tagline: 'Fork do Paper com multithreading por regiões (alta capacidade).',
		accepts: ['plugin'],
		site: 'https://papermc.io/software/folia'
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
		id: 'fabric',
		name: 'Fabric Server',
		category: 'mods',
		tagline: 'Servidor leve para mods Fabric.',
		accepts: ['mod'],
		modLoader: 'fabric',
		site: 'https://fabricmc.net'
	}
];

export const engine = (id: ServerEngine) => ENGINES.find((e) => e.id === id)!;

export interface ResolvedJar {
	url: string;
	label: string;
	sha1?: string;
}

// ------------------------------------------------------------------ versões por motor

const MAGMA_VERSIONS = ['1.21.1', '1.20.1', '1.19.3', '1.18.2', '1.16.5', '1.12.2'];
const MOHIST_VERSIONS = ['1.20.1', '1.20.2', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.7.10'];

interface GhRelease {
	tag_name: string;
	prerelease: boolean;
	assets: Array<{ name: string; browser_download_url: string }>;
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

export async function engineVersions(id: ServerEngine, flavor?: string): Promise<string[]> {
	switch (id) {
		case 'paper': {
			try {
				const p = await getJson<{ versions: Record<string, string[]> }>('https://fill.papermc.io/v3/projects/paper');
				return sortVersions(Object.values(p.versions).flat().filter((v) => !/pre|rc/.test(v)));
			} catch {
				return ['1.21.4', '1.21.1', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.18.2', '1.16.5'];
			}
		}
		case 'folia': {
			try {
				const p = await getJson<{ versions: Record<string, string[]> }>('https://fill.papermc.io/v3/projects/folia');
				return sortVersions(Object.values(p.versions).flat().filter((v) => !/pre|rc/.test(v)));
			} catch {
				return ['1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4'];
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
	}
}

export async function resolveJar(id: ServerEngine, mc: string, flavor?: string): Promise<ResolvedJar> {
	switch (id) {
		case 'paper': {
			try {
				const builds = await getJson<
					Array<{ id: number; channel: string; downloads: Record<string, { name: string; url: string }> }>
				>(`https://fill.papermc.io/v3/projects/paper/versions/${mc}/builds`);
				const b = builds.find((x) => x.channel === 'STABLE') ?? builds[0];
				const dl = b?.downloads['server:default'];
				if (dl) return { url: dl.url, label: `Paper ${mc} #${b.id}` };
			} catch {
				/* cai para fallback mcjars */
			}
			try {
				const res = await getJson<{ builds: Array<{ name: string; jarUrl: string }> }>(
					`https://mcjars.app/api/v1/builds/PAPER/${mc}`
				);
				const b = res.builds[0];
				if (b?.jarUrl) return { url: b.jarUrl, label: `Paper ${mc} ${b.name}` };
			} catch {
				/* continua */
			}
			throw new Error(`Não foi possível resolver o JAR do Paper para a versão ${mc}`);
		}
		case 'folia': {
			try {
				const builds = await getJson<
					Array<{ id: number; channel: string; downloads: Record<string, { name: string; url: string }> }>
				>(`https://fill.papermc.io/v3/projects/folia/versions/${mc}/builds`);
				const b = builds.find((x) => x.channel === 'STABLE') ?? builds[0];
				const dl = b?.downloads['server:default'];
				if (dl) return { url: dl.url, label: `Folia ${mc} #${b.id}` };
			} catch {
				/* cai para fallback mcjars */
			}
			try {
				const res = await getJson<{ builds: Array<{ name: string; jarUrl: string }> }>(
					`https://mcjars.app/api/v1/builds/FOLIA/${mc}`
				);
				const b = res.builds[0];
				if (b?.jarUrl) return { url: b.jarUrl, label: `Folia ${mc} ${b.name}` };
			} catch {
				/* continua */
			}
			throw new Error(`Não foi possível resolver o JAR do Folia para a versão ${mc}`);
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
		case 'magma': {
			// Tenta API oficial ou fallback para builds estáveis do GitHub Magma-Forge
			const fallbackUrls: Record<string, string> = {
				'1.20.1': 'https://github.com/magmafoundation/Magma-Forge/releases/download/va549e0d-DEV/Magma-a549e0d-DEV-server.jar',
				'1.18.2': 'https://github.com/magmafoundation/Magma-Forge/releases/download/v5269561-DEV/Magma-5269561-DEV-server.jar',
				'1.12.2': 'https://github.com/magmafoundation/Magma-Forge/releases/download/v537f1d6/Magma-537f1d6-server.jar'
			};
			const url = fallbackUrls[mc] ?? `https://api.magmafoundation.org/api/v2/${mc}/latest/download`;
			return {
				url,
				label: `Magma ${mc} (última build estável)`
			};
		}
	}
}

/** Campos visuais do server.properties. */
export const PROPERTY_FIELDS: Array<
	| { key: string; label: string; type: 'text' | 'number'; help?: string; min?: number; max?: number }
	| { key: string; label: string; type: 'bool'; help?: string }
	| { key: string; label: string; type: 'select'; options: Array<[string, string]>; help?: string }
> = [
	{ key: 'motd', label: 'Mensagem do dia (MOTD)', type: 'text', help: 'Use § para cores: §a verde, §6 dourado, §l negrito' },
	{ key: 'server-port', label: 'Porta', type: 'number', min: 1024, max: 65535 },
	{ key: 'max-players', label: 'Máximo de jogadores', type: 'number', min: 1, max: 1000 },
	{
		key: 'gamemode',
		label: 'Modo de jogo',
		type: 'select',
		options: [
			['survival', 'Sobrevivência'],
			['creative', 'Criativo'],
			['adventure', 'Aventura'],
			['spectator', 'Espectador']
		]
	},
	{
		key: 'difficulty',
		label: 'Dificuldade',
		type: 'select',
		options: [
			['peaceful', 'Pacífico'],
			['easy', 'Fácil'],
			['normal', 'Normal'],
			['hard', 'Difícil']
		]
	},
	{ key: 'online-mode', label: 'Modo online (só contas originais)', type: 'bool', help: 'Desligue para aceitar contas offline/LAN' },
	{ key: 'white-list', label: 'Whitelist', type: 'bool' },
	{ key: 'pvp', label: 'PvP', type: 'bool' },
	{ key: 'allow-flight', label: 'Permitir voo', type: 'bool', help: 'Necessário em muitos modpacks (jetpacks, etc.)' },
	{ key: 'view-distance', label: 'Distância de visão', type: 'number', min: 2, max: 32 },
	{ key: 'simulation-distance', label: 'Distância de simulação', type: 'number', min: 2, max: 32 },
	{ key: 'spawn-protection', label: 'Proteção do spawn (blocos)', type: 'number', min: 0, max: 64 },
	{ key: 'level-seed', label: 'Seed do mundo', type: 'text', help: 'Só vale antes de gerar o mundo' }
];

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
