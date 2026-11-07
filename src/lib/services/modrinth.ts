// Modrinth API v2: busca, versões compatíveis e resolução de dependências obrigatórias.
import { call, getJson, isTauri } from '$lib/platform';
import type { ContentKind, InstalledContent, ModLoader } from '$lib/types';
import { errorMessage } from '$lib/util/format';

const API = 'https://api.modrinth.com/v2';

export interface SearchHit {
	project_id: string;
	slug: string;
	title: string;
	description: string;
	icon_url?: string | null;
	author: string;
	downloads: number;
	follows: number;
	categories: string[];
	display_categories?: string[];
	versions: string[];
	project_type: string;
	client_side: string;
	server_side: string;
	date_modified: string;
	featured_gallery?: string | null;
	color?: number | null;
}

export interface SearchResult {
	hits: SearchHit[];
	total_hits: number;
	offset: number;
	limit: number;
}

export interface ModrinthFile {
	hashes: { sha1: string; sha512: string };
	url: string;
	filename: string;
	primary: boolean;
	size: number;
}

export interface ModrinthVersion {
	id: string;
	project_id: string;
	name: string;
	version_number: string;
	game_versions: string[];
	loaders: string[];
	version_type: 'release' | 'beta' | 'alpha';
	date_published: string;
	files: ModrinthFile[];
	dependencies: Array<{
		version_id: string | null;
		project_id: string | null;
		file_name: string | null;
		dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
	}>;
}

export interface ModrinthProject {
	id: string;
	slug: string;
	title: string;
	description: string;
	icon_url?: string | null;
	project_type: string;
}

export type SortIndex = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';

/** Categorias úteis por tipo (tags oficiais do Modrinth). */
export const CATEGORIES: Record<string, Array<{ id: string; label: string }>> = {
	mod: [
		{ id: 'optimization', label: 'Performance' },
		{ id: 'adventure', label: 'Aventura' },
		{ id: 'technology', label: 'Tecnologia' },
		{ id: 'decoration', label: 'Decoração' },
		{ id: 'magic', label: 'Magia' },
		{ id: 'worldgen', label: 'Geração de mundo' },
		{ id: 'utility', label: 'Utilidades' },
		{ id: 'storage', label: 'Armazenamento' },
		{ id: 'food', label: 'Comida' },
		{ id: 'mobs', label: 'Mobs' },
		{ id: 'library', label: 'Bibliotecas' }
	],
	resourcepack: [
		{ id: '16x', label: '16x' },
		{ id: '32x', label: '32x' },
		{ id: 'realistic', label: 'Realista' },
		{ id: 'simplistic', label: 'Simples' },
		{ id: 'themed', label: 'Temático' },
		{ id: 'vanilla-like', label: 'Estilo vanilla' },
		{ id: 'gui', label: 'Interface' },
		{ id: 'audio', label: 'Áudio' }
	],
	shader: [
		{ id: 'iris', label: 'Iris' },
		{ id: 'optifine', label: 'OptiFine' },
		{ id: 'potato', label: 'PC fraco' },
		{ id: 'low', label: 'Leve' },
		{ id: 'medium', label: 'Médio' },
		{ id: 'high', label: 'Pesado' },
		{ id: 'realistic', label: 'Realista' },
		{ id: 'cartoon', label: 'Cartoon' }
	],
	datapack: [
		{ id: 'adventure', label: 'Aventura' },
		{ id: 'utility', label: 'Utilidades' },
		{ id: 'worldgen', label: 'Geração de mundo' },
		{ id: 'game-mechanics', label: 'Mecânicas' }
	],
	modpack: [
		{ id: 'optimization', label: 'Performance' },
		{ id: 'adventure', label: 'Aventura' },
		{ id: 'technology', label: 'Tecnologia' },
		{ id: 'quests', label: 'Quests' },
		{ id: 'kitchen-sink', label: 'Tudo junto' },
		{ id: 'lightweight', label: 'Leve' },
		{ id: 'multiplayer', label: 'Multiplayer' }
	],
	plugin: [
		{ id: 'utility', label: 'Utilidades' },
		{ id: 'management', label: 'Administração' },
		{ id: 'economy', label: 'Economia' },
		{ id: 'game-mechanics', label: 'Mecânicas' },
		{ id: 'minigame', label: 'Minigames' },
		{ id: 'social', label: 'Social' },
		{ id: 'worldgen', label: 'Mundo' }
	]
};

/** Loaders que a Modrinth deve aceitar para cada tipo de conteúdo numa instância. */
export function loadersFor(kind: ContentKind, loader: ModLoader | 'server-plugins' | 'server-mods'): string[] {
	if (kind === 'resourcepack') return ['minecraft'];
	if (kind === 'datapack') return ['datapack'];
	if (kind === 'shader') return [];
	if (kind === 'plugin') return ['paper', 'spigot', 'bukkit', 'purpur', 'folia'];
	if (kind === 'modpack') return loader === 'vanilla' ? [] : [String(loader)];
	switch (loader) {
		case 'quilt':
			return ['quilt', 'fabric'];
		case 'vanilla':
			return [];
		default:
			return [String(loader)];
	}
}

export interface SearchParams {
	query: string;
	kind: ContentKind;
	loaders?: string[];
	gameVersion?: string;
	categories?: string[];
	index?: SortIndex;
	offset?: number;
	limit?: number;
	/** Filtra por lado (cliente/servidor) */
	side?: 'client' | 'server';
}

export async function search(p: SearchParams): Promise<SearchResult> {
	const facets: string[][] = [[`project_type:${p.kind}`]];
	if (p.loaders?.length) facets.push(p.loaders.map((l) => `categories:${l}`));
	if (p.gameVersion) facets.push([`versions:${p.gameVersion}`]);
	for (const c of p.categories ?? []) facets.push([`categories:${c}`]);
	if (p.side === 'server') facets.push(['server_side:required', 'server_side:optional']);
	if (p.side === 'client') facets.push(['client_side:required', 'client_side:optional']);
	const qs = new URLSearchParams({
		query: p.query,
		facets: JSON.stringify(facets),
		index: p.index ?? 'relevance',
		offset: String(p.offset ?? 0),
		limit: String(p.limit ?? 20)
	});
	return getJson<SearchResult>(`${API}/search?${qs}`);
}

export async function projectVersions(projectId: string, loaders: string[], gameVersion?: string) {
	const qs = new URLSearchParams();
	if (loaders.length) qs.set('loaders', JSON.stringify(loaders));
	if (gameVersion) qs.set('game_versions', JSON.stringify([gameVersion]));
	return getJson<ModrinthVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version?${qs}`);
}

export function getVersion(versionId: string) {
	return getJson<ModrinthVersion>(`${API}/version/${encodeURIComponent(versionId)}`);
}

export async function getProjects(ids: string[]): Promise<ModrinthProject[]> {
	if (!ids.length) return [];
	return getJson<ModrinthProject[]>(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`);
}

export function getProject(idOrSlug: string) {
	return getJson<ModrinthProject & { body: string; gallery: Array<{ url: string }>; game_versions: string[]; loaders: string[] }>(
		`${API}/project/${encodeURIComponent(idOrSlug)}`
	);
}

/** Melhor versão: prefere release, depois beta, depois alpha (a API já devolve da mais nova para a mais antiga). */
export function pickBest(versions: ModrinthVersion[]): ModrinthVersion | undefined {
	return (
		versions.find((v) => v.version_type === 'release') ??
		versions.find((v) => v.version_type === 'beta') ??
		versions[0]
	);
}

export function primaryFile(v: ModrinthVersion): ModrinthFile {
	return v.files.find((f) => f.primary) ?? v.files[0];
}

export interface PlannedInstall {
	project: { id: string; title: string; iconUrl?: string | null };
	version: ModrinthVersion;
	file: ModrinthFile;
	/** true para o projeto pedido; false para dependências */
	root: boolean;
	dependencyOf?: string;
}

export interface ResolveContext {
	kind: ContentKind;
	loaders: string[];
	gameVersion?: string;
	/** projectIds já instalados (não reinstala) */
	installed: Set<string>;
}

/**
 * Monta o plano de instalação: o projeto + todas as dependências obrigatórias (recursivo),
 * pulando o que já está instalado. Dependências incompatíveis com a instância viram `missing`.
 */
export async function planInstall(
	root: { id: string; title: string; iconUrl?: string | null },
	ctx: ResolveContext,
	chosenVersion?: ModrinthVersion
): Promise<{ plan: PlannedInstall[]; missing: string[] }> {
	const plan: PlannedInstall[] = [];
	const missing: string[] = [];
	const seen = new Set<string>(ctx.installed);

	const rootVersion = chosenVersion ?? pickBest(await projectVersions(root.id, ctx.loaders, ctx.gameVersion));
	if (!rootVersion) {
		throw new Error(`"${root.title}" não tem versão para ${ctx.gameVersion ?? 'essa versão'} ${ctx.loaders.join('/')}`);
	}
	seen.add(root.id);
	plan.push({ project: root, version: rootVersion, file: primaryFile(rootVersion), root: true });

	const queue: Array<{ version: ModrinthVersion; parent: string }> = [{ version: rootVersion, parent: root.title }];
	while (queue.length) {
		const { version, parent } = queue.shift()!;
		const deps = version.dependencies.filter((d) => d.dependency_type === 'required');
		for (const dep of deps) {
			if (dep.project_id && seen.has(dep.project_id)) continue;
			let depVersion: ModrinthVersion | undefined;
			if (dep.version_id) {
				depVersion = await getVersion(dep.version_id).catch(() => undefined);
			}
			if (!depVersion && dep.project_id) {
				depVersion = pickBest(await projectVersions(dep.project_id, ctx.loaders, ctx.gameVersion).catch(() => []));
			}
			const pid = depVersion?.project_id ?? dep.project_id;
			if (!pid || seen.has(pid)) continue;
			seen.add(pid);
			if (!depVersion) {
				missing.push(dep.file_name ?? pid);
				continue;
			}
			plan.push({
				project: { id: pid, title: pid },
				version: depVersion,
				file: primaryFile(depVersion),
				root: false,
				dependencyOf: parent
			});
			queue.push({ version: depVersion, parent: pid });
		}
	}

	// nomes e ícones bonitos para as dependências
	const depIds = plan.filter((p) => !p.root).map((p) => p.project.id);
	if (depIds.length) {
		const projects = await getProjects(depIds).catch(() => []);
		for (const p of plan) {
			const meta = projects.find((x) => x.id === p.project.id);
			if (meta) p.project = { id: meta.id, title: meta.title, iconUrl: meta.icon_url };
		}
	}
	return { plan, missing };
}

export function toInstalled(p: PlannedInstall, kind: ContentKind): InstalledContent {
	return {
		filename: p.file.filename,
		kind,
		title: p.project.title,
		projectId: p.project.id,
		versionId: p.version.id,
		versionNumber: p.version.version_number,
		iconUrl: p.project.iconUrl ?? undefined,
		url: p.file.url,
		sha1: p.file.hashes.sha1,
		sha512: p.file.hashes.sha512,
		size: p.file.size,
		dependencyOf: p.root ? undefined : p.dependencyOf
	};
}

/** Pasta de destino para cada tipo. */
export function folderKind(kind: ContentKind): string {
	return kind === 'shader' ? 'shader' : kind;
}

export interface BatchInstallTarget {
	ownerKind: 'instance' | 'server';
	owner: { id: string; name: string; content: Record<string, InstalledContent> };
	loaders: string[];
	gameVersion: string;
}

export async function installProjectsBatch(
	projects: Array<{ id: string; title: string; iconUrl?: string | null; kind?: ContentKind }>,
	target: BatchInstallTarget
): Promise<{ successCount: number; errors: string[] }> {
	let successCount = 0;
	const errors: string[] = [];

	for (const p of projects) {
		const kind = p.kind ?? (target.loaders.includes('paper') || target.loaders.includes('spigot') ? 'plugin' : 'mod');
		try {
			const installed = new Set(Object.values(target.owner.content).map((x) => x.projectId).filter(Boolean) as string[]);
			const { plan } = await planInstall(
				{ id: p.id, title: p.title, iconUrl: p.iconUrl },
				{ kind, loaders: target.loaders, gameVersion: target.gameVersion, installed }
			);

			if (isTauri) {
				await call('content_install', {
					ownerKind: target.ownerKind,
					ownerId: target.owner.id,
					kind,
					files: plan.map((item) => ({
						url: item.file.url,
						filename: item.file.filename,
						sha1: item.file.hashes.sha1,
						size: item.file.size
					}))
				});
			}

			for (const item of plan) {
				const installedItem = toInstalled(item, kind);
				target.owner.content[installedItem.filename] = installedItem;
			}
			successCount++;
		} catch (e) {
			errors.push(`${p.title}: ${errorMessage(e)}`);
		}
	}

	return { successCount, errors };
}
