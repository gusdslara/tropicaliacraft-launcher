// Repositório oficial de mods Rust (.hnmod / .hmod) do Horizon (Minecraft 26.3).
import { call, getJson, isTauri } from '$lib/platform';
import type { Instance, InstalledContent } from '$lib/types';
import INDEX_DATA from '$lib/data/horizon-mods-index.json';

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
	kind: string; // "native-mod" | "mod" | "shader" | "resourcepack"
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

export type HorizonModCategory =
	| 'all'
	| 'hud'
	| 'qol'
	| 'gameplay'
	| 'performance'
	| 'visual'
	| 'multiplayer'
	| 'map'
	| 'shader';

export interface OfficialHorizonMod {
	id: string;
	filename: string;
	name: string;
	summary: string;
	description: string;
	author: string;
	version: string;
	defaultEnabled: boolean;
	kind: 'mod' | 'native-mod' | 'shader' | 'resourcepack';
	category: HorizonModCategory;
	size: number;
	iconUrl?: string;
	source?: string;
	downloads: number;
}

export const HORIZON_CATEGORIES: Array<{ id: HorizonModCategory; label: string; icon?: string }> = [
	{ id: 'all', label: 'Todos os Mods' },
	{ id: 'hud', label: 'HUD & Indicadores' },
	{ id: 'qol', label: 'Qualidade de Vida (QoL)' },
	{ id: 'gameplay', label: 'Jogabilidade' },
	{ id: 'performance', label: 'Performance' },
	{ id: 'visual', label: 'Visual & Animações' },
	{ id: 'map', label: 'Mapas & Waypoints' },
	{ id: 'multiplayer', label: 'Multiplayer & Social' },
	{ id: 'shader', label: 'Shaders Vulkan' }
];

export const DEFAULT_ENABLED_MOD_IDS = new Set([
	'coords_hud',
	'fps_overlay',
	'zoom',
	'appleskin',
	'appleskin_horizon',
	'dynamic_lights',
	'mouse_tweaks',
	'mousetricks',
	'recipes',
	'armor_status',
	'armorhud',
	'discord_rpc',
	'fast_items'
]);

function categorizeMod(id: string, kind: string): HorizonModCategory {
	if (kind === 'shader') return 'shader';
	if (['minimap', 'waymap', 'waypoints', 'wayfarer_stones', 'wayfarer_stones_native'].includes(id)) return 'map';
	if (['voicechat', 'serverify', 'rmotd', 'chatheads', 'crossversion', 'killc', 'discord_rpc'].includes(id)) return 'multiplayer';
	if (['visuality_horizon', 'motion_blur', 'smoothie_capes', 'flair', 'invisible_frames', 'menu_panorama', 'dynamic_lights'].includes(id)) return 'visual';
	if (['distant_horizons', 'fast_items'].includes(id)) return 'performance';
	if (['coords_hud', 'fps_overlay', 'armor_status', 'armorhud', 'basic_hud', 'compass_bar', 'customhud', 'crosshair_indicator', 'status_effect_hud', 'smartf3', 'held_item_info', 'light_overlay', 'keystrokes'].includes(id)) return 'hud';
	if (['zoom', 'classic_zoom', 'appleskin', 'appleskin_horizon', 'accurate_block_placement', 'mouse_tweaks', 'mousetricks', 'inventory_profiles', 'inventory_wizard', 'shulker_peek', 'fullbright', 'fullbright_horizon', 'fullbright_nofog', 'stuck', 'hitbox_plus', 'enchantmenthints'].includes(id)) return 'qol';
	return 'gameplay';
}

/**
 * Catálogo completo de mods oficiais do ecossistema Horizon Rust 26.3
 * carregado diretamente do registro oficial index.json (77 mods disponíveis).
 */
export const OFFICIAL_HORIZON_MODS: OfficialHorizonMod[] = (INDEX_DATA.projects as HorizonModProject[]).map((p) => {
	const latestVersion = p.versions?.[0];
	const filename = latestVersion?.file?.name || `${p.id}.hnmod`;
	const isDefault = DEFAULT_ENABLED_MOD_IDS.has(p.id);

	return {
		id: p.id,
		filename,
		name: p.name || p.id,
		summary: p.summary || '',
		description: p.description || p.summary || '',
		author: p.authors?.length ? p.authors.join(', ') : 'Horizon Community',
		version: latestVersion?.version || '1.0.0',
		defaultEnabled: isDefault,
		kind: (p.kind as OfficialHorizonMod['kind']) || 'native-mod',
		category: categorizeMod(p.id, p.kind),
		size: latestVersion?.file?.size || 0,
		iconUrl: p.icon,
		source: p.source,
		downloads: p.downloads || 0
	};
});

let cachedRegistry: HorizonRegistry | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getHorizonRegistry(force = false): Promise<HorizonRegistry> {
	const now = Date.now();
	if (!force && cachedRegistry && now - lastFetchTime < CACHE_TTL_MS) {
		return cachedRegistry;
	}
	try {
		const data = await getJson<HorizonRegistry>(HORIZON_MODS_INDEX_URL);
		cachedRegistry = data;
		lastFetchTime = now;
		return data;
	} catch (e) {
		// Fallback para o index.json local empacotado
		const reg = INDEX_DATA as unknown as HorizonRegistry;
		cachedRegistry = reg;
		return reg;
	}
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

export async function fetchHorizonModsState(instanceId: string): Promise<Record<string, boolean>> {
	if (isTauri) {
		try {
			return await call<Record<string, boolean>>('horizon_mods_state_get', { instanceId });
		} catch (e) {
			console.error('Falha ao ler horizon-mods.txt via Tauri:', e);
		}
	}
	return {};
}

export async function setHorizonModState(instanceId: string, modId: string, enabled: boolean): Promise<void> {
	if (isTauri) {
		await call('horizon_mods_state_set', { instanceId, modId, enabled });
	}
}

export async function setHorizonModsBulk(instanceId: string, states: Record<string, boolean>): Promise<void> {
	if (isTauri) {
		await call('horizon_mods_state_set_bulk', { instanceId, states });
	}
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
		await setHorizonModState(instance.id, mod.id, true);
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

/**
 * Garante que uma instância Horizon Rust inicialize com o ecossistema oficial de mods,
 * sincronizando com horizon-mods.txt e marcando os padrões ativos.
 */
export function seedHorizonInstanceMods(inst: Instance, selectedIds?: string[]) {
	if (inst.loader !== 'horizon-rust') return;

	for (const mod of OFFICIAL_HORIZON_MODS) {
		const isEnabled = selectedIds ? selectedIds.includes(mod.id) : mod.defaultEnabled;

		if (!inst.content[mod.filename] && !inst.content[`${mod.filename}.disabled`]) {
			inst.content[mod.filename] = {
				filename: mod.filename,
				kind: 'mod',
				title: mod.name,
				projectId: mod.id,
				versionId: mod.version,
				versionNumber: mod.version,
				iconUrl: mod.iconUrl,
				size: mod.size
			};
		}
	}
}
