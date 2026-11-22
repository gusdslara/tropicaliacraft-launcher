import { getJson, isTauri, call } from '$lib/platform';
import type { LauncherUpdateManifest, PlatformAsset } from '$lib/types';

export const CURRENT_LAUNCHER_VERSION = '0.1.0';

export interface CheckUpdateResult {
	hasUpdate: boolean;
	currentVersion: string;
	latestVersion: string;
	manifest?: LauncherUpdateManifest;
	asset?: PlatformAsset;
	platformKey: string;
}

/**
 * Normaliza e compara versões no formato semver 'x.y.z'
 * Retorna > 0 se v1 > v2, < 0 se v1 < v2, e 0 se iguais.
 */
export function compareSemver(v1: string, v2: string): number {
	const p1 = v1.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
	const p2 = v2.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
	const len = Math.max(p1.length, p2.length);
	for (let i = 0; i < len; i++) {
		const a = p1[i] ?? 0;
		const b = p2[i] ?? 0;
		if (a > b) return 1;
		if (a < b) return -1;
	}
	return 0;
}

export function detectPlatformKey(os: string, arch: string): string {
	const osNorm = os.toLowerCase();
	const archNorm = arch.toLowerCase();
	if (osNorm.includes('win')) {
		return 'windows-x86_64';
	}
	if (osNorm.includes('linux')) {
		return archNorm.includes('arm') || archNorm.includes('aarch64') ? 'linux-aarch64' : 'linux-x86_64';
	}
	if (osNorm.includes('darwin') || osNorm.includes('mac')) {
		return archNorm.includes('arm') || archNorm.includes('aarch64') ? 'darwin-aarch64' : 'darwin-x86_64';
	}
	if (osNorm.includes('android')) {
		return 'android-arm64';
	}
	return 'windows-x86_64';
}

/**
 * Consulta a API do painel ou CDN estático por atualizações do launcher.
 */
export async function checkForLauncherUpdates(currentVersion = CURRENT_LAUNCHER_VERSION): Promise<CheckUpdateResult> {
	let os = 'windows';
	let arch = 'x86_64';

	if (isTauri) {
		try {
			const info = await call<{ os: string; arch: string }>('system_info');
			os = info.os;
			arch = info.arch;
		} catch {
			/* fallback */
		}
	} else if (typeof navigator !== 'undefined') {
		const ua = navigator.userAgent.toLowerCase();
		if (ua.includes('android')) os = 'android';
		else if (ua.includes('linux')) os = 'linux';
		else if (ua.includes('mac')) os = 'darwin';
	}

	const platformKey = detectPlatformKey(os, arch);

	// Tenta primeiro a API do painel e fallback na landing pública
	const endpoints = [
		'https://tropicaliacraft.online/api/public/updates/launcher',
		'https://tropicaliacraft.online/downloads/updates.json'
	];

	let manifest: LauncherUpdateManifest | null = null;
	for (const url of endpoints) {
		try {
			manifest = await getJson<LauncherUpdateManifest>(url);
			if (manifest && manifest.version) break;
		} catch {
			// continua tentativa
		}
	}

	if (!manifest || !manifest.version) {
		return {
			hasUpdate: false,
			currentVersion,
			latestVersion: currentVersion,
			platformKey
		};
	}

	const hasUpdate = compareSemver(manifest.version, currentVersion) > 0;
	const asset = manifest.platforms[platformKey] || manifest.platforms['windows-x86_64'];

	return {
		hasUpdate,
		currentVersion,
		latestVersion: manifest.version,
		manifest,
		asset,
		platformKey
	};
}
