import { call, secrets } from '$lib/platform';
import type { ModrinthProject, ModrinthVersion, SearchParams, SearchResult, SearchHit } from './modrinth';

export const KEY_NAME = 'curseforge-api-key';
const prefix = 'curseforge:';
const loaderTypes: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
interface CFMod {
    id: number; name: string; slug: string; summary: string; logo?: { thumbnailUrl: string };
    authors: { name: string }[]; downloadCount: number; dateModified: string;
    links: { websiteUrl: string }; allowModDistribution?: boolean | null;
}
interface CFFile {
    id: number; modId: number; displayName: string; fileName: string; fileLength: number;
    downloadUrl: string | null; gameVersions: string[]; releaseType: number; fileDate: string;
    hashes: { algo: number; value: string }[];
    dependencies: { modId: number; relationType: number }[];
}
export async function api<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const apiKey = await secrets.get(KEY_NAME);
    if (!apiKey) throw new Error('Configure a chave da API CurseForge em Ajustes para consultar o catálogo.');
    return call<T>('curseforge_get', { apiKey, path, query });
}
const idOf = (id: string) => {
    const value = id.slice(prefix.length);
    if (!id.startsWith(prefix) || !/^\d+$/.test(value)) throw new Error('ID CurseForge inválido.');
    return value;
};
export async function project(id: string): Promise<ModrinthProject> {
    const { data } = await api<{ data: CFMod }>(`/mods/${idOf(id)}`);
    return { id, slug: data.slug, title: data.name, description: data.summary, icon_url: data.logo?.thumbnailUrl, project_type: 'mod' };
}
export function fileVersion(file: CFFile): ModrinthVersion {
    if (!file.downloadUrl) throw new Error('O autor não permite download direto deste arquivo pela API CurseForge. Abra a página do projeto.');
    return {
        id: `${prefix}${file.modId}:${file.id}`, project_id: `${prefix}${file.modId}`,
        name: file.displayName, version_number: file.displayName,
        game_versions: file.gameVersions, loaders: file.gameVersions.map(v => v.toLowerCase()).filter(v => v in loaderTypes),
        version_type: file.releaseType === 1 ? 'release' : file.releaseType === 2 ? 'beta' : 'alpha', date_published: file.fileDate,
        files: [{ url: file.downloadUrl, filename: file.fileName, size: file.fileLength, primary: true,
            hashes: { sha1: file.hashes.find(h => h.algo === 1)?.value ?? '', sha512: '' } }],
        dependencies: file.dependencies.filter(d => [1, 2, 3, 5, 6].includes(d.relationType)).map(d => ({
            project_id: `${prefix}${d.modId}`, version_id: null, file_name: null,
            dependency_type: d.relationType === 3 ? 'required' : d.relationType === 5 ? 'incompatible' : d.relationType === 2 ? 'optional' : 'embedded'
        }))
    };
}
export async function getFile(id: string): Promise<ModrinthVersion> {
    const match = /^curseforge:(\d+):(\d+)$/.exec(id);
    if (!match) throw new Error('Arquivo CurseForge inválido.');
    return fileVersion((await api<{ data: CFFile }>(`/mods/${match[1]}/files/${match[2]}`)).data);
}
export async function versions(id: string, loaders: string[], gameVersion?: string): Promise<ModrinthVersion[]> {
    const modId = idOf(id);
    const { data: mod } = await api<{ data: CFMod }>(`/mods/${modId}`);
    if (mod.allowModDistribution === false) throw new Error('O autor não permite distribuição por launchers externos. Abra a página CurseForge do projeto.');
    const types = loaders.length ? [...new Set(loaders.map(l => loaderTypes[l]).filter(Boolean))] : [0];
    if (!types.length) return [];
    const files = (await Promise.all(types.map(async type => {
        const query: Record<string, string> = { pageSize: '50' };
        if (gameVersion) query.gameVersion = gameVersion;
        if (type) query.modLoaderType = String(type);
        return (await api<{ data: CFFile[] }>(`/mods/${modId}/files`, query)).data;
    }))).flat();
    const matching = [...new Map(files.map(f => [f.id, f])).values()].filter(f =>
        (!gameVersion || f.gameVersions.includes(gameVersion)) &&
        (!loaders.length || f.gameVersions.some(v => loaders.includes(v.toLowerCase()))));
    const available = matching.filter(f => !!f.downloadUrl);
    if (matching.length && !available.length) throw new Error('Downloads diretos indisponíveis pela API. Abra a página CurseForge do projeto.');
    return available.sort((a, b) => b.fileDate.localeCompare(a.fileDate)).map(fileVersion);
}
export async function search(p: SearchParams): Promise<SearchResult> {
    if (p.kind !== 'mod') throw new Error('O catálogo CurseForge integrado está disponível na aba Mods.');
    const query: Record<string, string> = { gameId: '432', classId: '6', searchFilter: p.query,
        pageSize: String(Math.min(p.limit ?? 20, 50)), index: String(p.offset ?? 0),
        sortField: String(({ downloads: 6, updated: 3, newest: 11, follows: 2, relevance: 2 } as const)[p.index ?? 'downloads']), sortOrder: 'desc' };
    if (p.gameVersion) query.gameVersion = p.gameVersion;
    if (p.gameVersion && p.loaders?.length) {
        const types = [...new Set(p.loaders.map(l => loaderTypes[l]).filter(Boolean))];
        if (types.length) query.modLoaderTypes = JSON.stringify(types);
    }
    const result = await api<{ data: CFMod[]; pagination: { totalCount: number; index: number; pageSize: number } }>('/mods/search', query);
    const hits: SearchHit[] = result.data.map(mod => ({
        project_id: `${prefix}${mod.id}`, slug: mod.slug, title: mod.name, description: mod.summary,
        icon_url: mod.logo?.thumbnailUrl, author: mod.authors.map(a => a.name).join(', '), downloads: mod.downloadCount,
        follows: 0, categories: [], versions: [], project_type: 'mod', client_side: 'optional', server_side: 'optional',
        date_modified: mod.dateModified
    }));
    return { hits, total_hits: result.pagination.totalCount, offset: result.pagination.index, limit: result.pagination.pageSize };
}
