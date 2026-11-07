// Versões oficiais da Mojang + versões de cada modloader (direto das APIs de cada projeto).
import { getJson, http } from '$lib/platform';
import type { ModLoader } from '$lib/types';

export interface GameVersion {
	id: string;
	type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
	releaseTime: string;
}

const cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
	if (!cache.has(key)) cache.set(key, fn().catch((e) => (cache.delete(key), Promise.reject(e))));
	return cache.get(key) as Promise<T>;
}

export function gameVersions(): Promise<GameVersion[]> {
	return cached('mojang', async () => {
		const m = await getJson<{ versions: GameVersion[] }>(
			'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
		);
		return m.versions;
	});
}

export interface LoaderVersion {
	version: string;
	stable: boolean;
}

export async function loaderVersions(loader: ModLoader, mc: string): Promise<LoaderVersion[]> {
	switch (loader) {
		case 'vanilla':
			return [];
		case 'fabric':
			return cached(`fabric:${mc}`, async () => {
				const list = await getJson<Array<{ loader: { version: string; stable: boolean } }>>(
					`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`
				);
				return list.map((l) => ({ version: l.loader.version, stable: l.loader.stable }));
			});
		case 'quilt':
			return cached(`quilt:${mc}`, async () => {
				const list = await getJson<Array<{ loader: { version: string } }>>(
					`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}`
				);
				return list.map((l) => ({ version: l.loader.version, stable: !/beta|pre|rc/i.test(l.loader.version) }));
			});
		case 'neoforge':
			return cached(`neoforge:${mc}`, async () => {
				const { versions } = await getJson<{ versions: string[] }>(
					'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'
				);
				return versions
					.filter((v) => neoforgeToMinecraft(v) === mc)
					.reverse()
					.map((v) => ({ version: v, stable: !v.includes('beta') }));
			});
		case 'forge':
			return cached(`forge:${mc}`, async () => {
				const meta = await getJson<Record<string, string[]>>(
					'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json'
				);
				const promos = await getJson<{ promos: Record<string, string> }>(
					'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
				).catch(() => ({ promos: {} as Record<string, string> }));
				const recommended = promos.promos[`${mc}-recommended`];
				return (meta[mc] ?? [])
					.slice()
					.reverse()
					.map((v) => ({ version: v, stable: recommended ? v === `${mc}-${recommended}` : true }));
			});
		default:
			return [];
	}
}

/**
 * NeoForge numera pela versão do jogo: 21.1.77 → 1.21.1, 20.4.237 → 1.20.4, 21.0.x → 1.21.
 * Com a numeração anual da Mojang (26.1, 26.1.1…) o NeoForge passou a usar o mesmo prefixo.
 */
export function neoforgeToMinecraft(v: string): string {
	const [maj, min, patch] = v.split(/[.-]/);
	const major = Number(maj);
	if (major >= 25) return patch && patch !== '0' && v.split('.').length > 3 ? `${maj}.${min}.${patch}` : `${maj}.${min}`;
	return min === '0' ? `1.${maj}` : `1.${maj}.${min}`;
}

/** Quais modloaders existem para uma versão (checagem rápida para desabilitar opções). */
export async function loaderSupports(loader: ModLoader, mc: string) {
	if (loader === 'vanilla') return true;
	try {
		return (await loaderVersions(loader, mc)).length > 0;
	} catch {
		return true; // offline: não bloqueia
	}
}

export async function ping(url: string) {
	try {
		return (await http(url, { method: 'HEAD' })).ok;
	} catch {
		return false;
	}
}
