// Ponte com o Tauri. No navegador (npm run dev sem Tauri) cai para fetch/localStorage
// para dar para mexer na interface sem compilar o Rust.
import type { UnlistenFn } from '@tauri-apps/api/event';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const USER_AGENT = 'TropicaliaLauncher/0.1.0 (+https://tropicaliacraft.online)';

/** fetch sem CORS (via Rust) dentro do app; fetch normal no navegador. */
export async function http(url: string, init: RequestInit = {}): Promise<Response> {
	if (isTauri) {
		const { fetch } = await import('@tauri-apps/plugin-http');
		const headers = new Headers(init.headers);
		if (!headers.has('User-Agent')) headers.set('User-Agent', USER_AGENT);
		return fetch(url, { ...init, headers });
	}
	return window.fetch(url, init);
}

export class HttpError extends Error {
	constructor(
		public status: number,
		public body: string,
		url: string
	) {
		super(`HTTP ${status} em ${new URL(url).host}${body ? `: ${body.slice(0, 200)}` : ''}`);
	}
}

export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
	const res = await http(url, { ...init, headers: { Accept: 'application/json', ...(init.headers ?? {}) } });
	if (!res.ok) throw new HttpError(res.status, await res.text().catch(() => ''), url);
	return res.json() as Promise<T>;
}

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
	if (!isTauri) throw new Error('Essa ação só funciona no app instalado (Tauri).');
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke<T>(cmd, args);
}

export async function on<T>(event: string, cb: (payload: T) => void): Promise<UnlistenFn> {
	if (!isTauri) return () => {};
	const { listen } = await import('@tauri-apps/api/event');
	return listen<T>(event, (e) => cb(e.payload));
}

export async function openUrl(url: string) {
	if (isTauri) {
		const { openUrl } = await import('@tauri-apps/plugin-opener');
		return openUrl(url);
	}
	window.open(url, '_blank', 'noopener');
}

export async function openFolder(what: 'instance' | 'server' | 'root', id?: string) {
	const path = await call<string>('path_of', { what, id });
	const { openPath } = await import('@tauri-apps/plugin-opener');
	return openPath(path);
}

// ------------------------------------------------------------------ armazenamento chave/valor

type Store = { get<T>(k: string): Promise<T | undefined>; set(k: string, v: unknown): Promise<void> };
let storePromise: Promise<Store> | null = null;

function store(): Promise<Store> {
	storePromise ??= (async (): Promise<Store> => {
		if (isTauri) {
			const { load } = await import('@tauri-apps/plugin-store');
			const s = await load('launcher.json', { autoSave: 250, defaults: {} });
			return { get: (k) => s.get(k), set: (k, v) => s.set(k, v) };
		}
		return {
			async get<T>(k: string) {
				try {
					const raw = localStorage.getItem(`tropicalia:${k}`);
					return raw == null ? undefined : (JSON.parse(raw) as T);
				} catch {
					return undefined;
				}
			},
			async set(k, v) {
				try {
					localStorage.setItem(`tropicalia:${k}`, JSON.stringify(v));
				} catch {
					/* modo privado */
				}
			}
		};
	})();
	return storePromise;
}

export const kv = {
	async get<T>(key: string, fallback: T): Promise<T> {
		return ((await (await store()).get<T>(key)) ?? fallback) as T;
	},
	async set(key: string, value: unknown) {
		await (await store()).set(key, plain(value));
	}
};

/** Remove proxies do Svelte antes de serializar. */
function plain<T>(v: T): T {
	return v == null ? v : (JSON.parse(JSON.stringify(v)) as T);
}

// ------------------------------------------------------------------ segredos (cofre do SO)

export const secrets = {
	async set(key: string, value: string) {
		if (!isTauri) return kv.set(`secret:${key}`, value);
		try {
			await call('secret_set', { key, value });
		} catch {
			await kv.set(`secret:${key}`, value); // mobile: sem cofre nativo ainda
		}
	},
	async get(key: string): Promise<string | null> {
		if (!isTauri) return kv.get<string | null>(`secret:${key}`, null);
		try {
			return await call<string | null>('secret_get', { key });
		} catch {
			return kv.get<string | null>(`secret:${key}`, null);
		}
	},
	async delete(key: string) {
		if (isTauri) await call('secret_delete', { key }).catch(() => {});
		await kv.set(`secret:${key}`, null);
	}
};
