// Conta do TropicaliaCraft (a mesma do site): API do painel em /api/player/*.
// O nick da conta é o username no servidor; a skin enviada aqui é aplicada pelo
// SkinsRestorer em todos os servidores da rede.
import { http, kv, secrets } from '$lib/platform';

const SITE_CONFIG = 'https://tropicaliacraft.online/admin.config.json';
const DEFAULT_PANEL = 'https://tropicaliacraft.gustavolara.pro';
const TOKEN_KEY = 'tropicalia.token';
const PROFILE_KEY = 'tropicalia.profile';

export interface TropicaliaProfile {
	nickname: string;
	email?: string;
	verified?: boolean;
	verifyCode?: string;
}

interface ApiPlayer {
	nickname: string;
	email?: string;
	verified?: boolean;
	verifyCode?: string;
}

let panel: Promise<string> | undefined;
function panelUrl(): Promise<string> {
	panel ??= (async () => {
		try {
			const r = await http(SITE_CONFIG, { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
			if (r.ok) {
				const url = ((await r.json()) as { panelUrl?: string }).panelUrl;
				if (url) return url.replace(/\/+$/, '');
			}
		} catch {
			/* sem internet ou site fora: usa o padrão */
		}
		return DEFAULT_PANEL;
	})();
	return panel;
}

class TropicaliaAccount {
	profile = $state<TropicaliaProfile | null>(null);
	private token: string | null = null;
	private loaded?: Promise<void>;

	/** Restaura a sessão salva (uma vez). */
	load(): Promise<void> {
		this.loaded ??= (async () => {
			this.token = await secrets.get(TOKEN_KEY).catch(() => null);
			this.profile = this.token ? await kv.get<TropicaliaProfile | null>(PROFILE_KEY, null).catch(() => null) : null;
			if (this.token) void this.refresh();
		})();
		return this.loaded;
	}

	get loggedIn() {
		return !!this.profile;
	}

	private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
		const headers: Record<string, string> = { Accept: 'application/json' };
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
		let r: Response;
		try {
			r = await http((await panelUrl()) + path, {
				method,
				headers,
				body: body !== undefined ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(20000)
			});
		} catch {
			throw new Error('Não foi possível falar com o servidor de contas. Verifique a internet.');
		}
		const data = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
		if (!r.ok) {
			if (r.status === 401 && auth) await this.logout();
			throw new Error(data?.error ?? `Erro ${r.status}`);
		}
		return data as T;
	}

	private async save(p: ApiPlayer) {
		this.profile = { nickname: p.nickname, email: p.email, verified: p.verified, verifyCode: p.verifyCode };
		await kv.set(PROFILE_KEY, this.profile).catch(() => {});
	}

	async refresh() {
		if (!this.token) return;
		try {
			await this.save(await this.request<ApiPlayer>('GET', '/api/player/me'));
		} catch {
			/* offline: mantém o cache */
		}
	}

	async login(login: string, password: string): Promise<TropicaliaProfile> {
		const l = login.trim();
		if (!l) throw new Error('Digite seu nick ou e-mail do TropicaliaCraft.');
		if (!password) throw new Error('Digite sua senha.');
		const r = await this.request<{ token: string; player: ApiPlayer }>('POST', '/api/player/login', { login: l, password }, false);
		this.token = r.token;
		await secrets.set(TOKEN_KEY, r.token);
		await this.save(r.player);
		return this.profile!;
	}

	async logout() {
		this.token = null;
		this.profile = null;
		await secrets.set(TOKEN_KEY, '').catch(() => {});
		await kv.set(PROFILE_KEY, null).catch(() => {});
	}

	/** Envia a skin (data URL PNG 64x64) para a conta. Devolve a mensagem para o usuário. */
	async setSkin(dataUrl: string, variant: 'classic' | 'slim'): Promise<string> {
		const p = await this.request<ApiPlayer & { appliedNow?: string[] }>('PUT', '/api/player/skin', { png: dataUrl, variant });
		await this.save(p);
		if (!p.verified && p.verifyCode) {
			return `Skin salva na conta! Falta confirmar o nick: entre no servidor e digite ${p.verifyCode} no chat.`;
		}
		return p.appliedNow?.length
			? `Skin aplicada para ${p.nickname} no servidor! Se estiver online, ela troca na hora (ou relogue).`
			: `Skin salva na conta ${p.nickname}. Ela aparece quando você entrar no TropicaliaCraft.`;
	}
}

export const tropicaliaAccount = new TropicaliaAccount();
/** O cadastro fica no site (aba Conta do Skin Studio). */
export const REGISTER_URL = 'https://tropicaliacraft.online/skin-studio';
