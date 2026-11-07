// Repositório oficial de mods Rust (.hnmod / .hmod) do Horizon (Minecraft 26.3).
import { call, getJson, isTauri } from '$lib/platform';
import type { InstalledContent } from '$lib/types';

export const HORIZON_MODS_INDEX_URL = 'https://horizon-rust.github.io/horizon-mods/index.json';

export interface HorizonModFile {
	name: string;
	url: string;
	size: number;
	sha256?: string;
}

export interface HorizonModVersion {
	version: string;
	published?: string;
	changelog?: string;
	api?: string;
	game?: string;
	file: HorizonModFile;
}

export interface HorizonModProject {
	id: string;
	kind: string; // "native-mod"
	name: string;
	summary: string;
	description?: string;
	authors: string[];
	owners?: string[];
	license?: string;
	source?: string;
	icon?: string;
	downloads: number;
	versions: HorizonModVersion[];
}

export interface HorizonRegistry {
	schema: number;
	generated: string;
	projects: HorizonModProject[];
	revoked?: Array<{ id: string; sha256: string; reason: string; date: string }>;
}

let cachedRegistry: HorizonRegistry | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getHorizonRegistry(force = false): Promise<HorizonRegistry> {
	const now = Date.now();
	if (!force && cachedRegistry && now - lastFetchTime < CACHE_TTL_MS) {
		return cachedRegistry;
	}
	const data = await getJson<HorizonRegistry>(HORIZON_MODS_INDEX_URL);
	cachedRegistry = data;
	lastFetchTime = now;
	return data;
}

export async function searchHorizonMods(
	query = '',
	sort: 'downloads' | 'name' | 'newest' = 'downloads'
): Promise<HorizonModProject[]> {
	const registry = await getHorizonRegistry();
	let list = [...registry.projects];

	const q = query.trim().toLowerCase();
	if (q) {
		list = list.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				p.id.toLowerCase().includes(q) ||
				p.summary.toLowerCase().includes(q) ||
				p.authors.some((a) => a.toLowerCase().includes(q))
		);
	}

	if (sort === 'downloads') {
		list.sort((a, b) => b.downloads - a.downloads);
	} else if (sort === 'name') {
		list.sort((a, b) => a.name.localeCompare(b.name));
	} else if (sort === 'newest') {
		list.sort((a, b) => {
			const dateA = a.versions[0]?.published || '';
			const dateB = b.versions[0]?.published || '';
			return dateB.localeCompare(dateA);
		});
	}

	return list;
}

export async function installHorizonMod(
	instance: { id: string; content: Record<string, InstalledContent> },
	mod: HorizonModProject,
	version?: HorizonModVersion
): Promise<void> {
	const v = version ?? mod.versions[0];
	if (!v || !v.file?.url) {
		throw new Error(`Mod ${mod.name} não possui versão ou arquivo disponível para download.`);
	}

	const filename = v.file.name;
	if (isTauri) {
		await call('content_install', {
			ownerKind: 'instance',
			ownerId: instance.id,
			kind: 'mod',
			files: [
				{
					url: v.file.url,
					filename: v.file.name,
					sha1: null,
					sha256: v.file.sha256 ?? null,
					size: v.file.size
				}
			]
		});
	}

	const installed: InstalledContent = {
		filename,
		kind: 'mod',
		title: mod.name,
		projectId: mod.id,
		versionId: v.version,
		versionNumber: v.version,
		iconUrl: mod.icon,
		url: v.file.url,
		size: v.file.size
	};

	instance.content[filename] = installed;
}
