// Login oficial Microsoft → Xbox Live → XSTS → Minecraft (OAuth 2.0 Device Code Flow, RFC 8628).
// O launcher nunca vê a senha: o usuário digita o código em microsoft.com/link (ou escaneia o QR).
//
// IMPORTANTE: é preciso um Client ID de um app registrado no Azure (Entra ID) como
// "Contas pessoais Microsoft" + "Permitir fluxos de cliente público", e esse app precisa ser
// aprovado pela Mojang para usar api.minecraftservices.com (formulário "Minecraft Java Edition API").
import { HttpError, getJson, http } from '$lib/platform';

const MS = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'XboxLive.signin offline_access';

export interface DeviceCode {
	device_code: string;
	user_code: string;
	verification_uri: string;
	expires_in: number;
	interval: number;
	message?: string;
}

interface MsToken {
	access_token: string;
	refresh_token: string;
	expires_in: number;
}

export interface MinecraftSession {
	accessToken: string;
	expiresAt: number;
	refreshToken: string;
	profile: { id: string; name: string; skinUrl?: string };
}

export class AuthError extends Error {
	constructor(
		message: string,
		public code?: string
	) {
		super(message);
	}
}

function form(data: Record<string, string>) {
	return new URLSearchParams(data).toString();
}

async function postForm<T>(url: string, data: Record<string, string>): Promise<T> {
	const res = await http(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
		body: form(data)
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new AuthError(body.error_description ?? `HTTP ${res.status}`, body.error ?? String(res.status));
	}
	return body as T;
}

async function postJson<T>(url: string, data: unknown, headers: Record<string, string> = {}): Promise<T> {
	const res = await http(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
		body: JSON.stringify(data)
	});
	const text = await res.text();
	let body: Record<string, unknown> = {};
	try {
		body = text ? JSON.parse(text) : {};
	} catch {
		/* corpo vazio */
	}
	if (!res.ok) throw Object.assign(new HttpError(res.status, text, url), { body });
	return body as T;
}

// ------------------------------------------------------------------ passo 1-3: Microsoft

export async function requestDeviceCode(clientId: string): Promise<DeviceCode> {
	if (!clientId) {
		throw new AuthError('Configure o Client ID do Azure em Ajustes → Conta Microsoft antes de entrar.', 'no_client_id');
	}
	return postForm<DeviceCode>(`${MS}/devicecode`, { client_id: clientId, scope: SCOPE });
}

/** Faz polling até o usuário aprovar o código (ou expirar/cancelar). */
export async function pollDeviceCode(clientId: string, code: DeviceCode, signal: AbortSignal): Promise<MsToken> {
	let interval = Math.max(code.interval, 2) * 1000;
	const deadline = Date.now() + code.expires_in * 1000;
	while (Date.now() < deadline) {
		await sleep(interval, signal);
		try {
			return await postForm<MsToken>(`${MS}/token`, {
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
				client_id: clientId,
				device_code: code.device_code
			});
		} catch (e) {
			if (!(e instanceof AuthError)) throw e;
			if (e.code === 'authorization_pending') continue;
			if (e.code === 'slow_down') {
				interval += 5000;
				continue;
			}
			if (e.code === 'authorization_declined') throw new AuthError('Login recusado na página da Microsoft.', e.code);
			if (e.code === 'expired_token') break;
			throw e;
		}
	}
	throw new AuthError('O código expirou. Gere um novo e tente de novo.', 'expired_token');
}

export async function refreshMicrosoft(clientId: string, refreshToken: string): Promise<MsToken> {
	return postForm<MsToken>(`${MS}/token`, {
		grant_type: 'refresh_token',
		client_id: clientId,
		refresh_token: refreshToken,
		scope: SCOPE
	});
}

// ------------------------------------------------------------------ passo 4-5: Xbox → Minecraft

const XSTS_ERRORS: Record<string, string> = {
	'2148916233': 'Essa conta Microsoft não tem perfil Xbox. Entre em xbox.com uma vez para criar e tente de novo.',
	'2148916235': 'O Xbox Live não está disponível no país dessa conta.',
	'2148916236': 'A conta precisa de verificação de idade (Coreia do Sul) em xbox.com.',
	'2148916237': 'A conta precisa de verificação de idade (Coreia do Sul) em xbox.com.',
	'2148916238': 'Conta de menor de idade: um adulto precisa adicioná-la a uma Família Microsoft.'
};

interface XboxToken {
	Token: string;
	DisplayClaims: { xui: Array<{ uhs: string; xid?: string }> };
}

async function xboxChain(msAccessToken: string) {
	const xbl = await postJson<XboxToken>('https://user.auth.xboxlive.com/user/authenticate', {
		Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
		RelyingParty: 'http://auth.xboxlive.com',
		TokenType: 'JWT'
	});
	let xsts: XboxToken;
	try {
		xsts = await postJson<XboxToken>('https://xsts.auth.xboxlive.com/xsts/authorize', {
			Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
			RelyingParty: 'rp://api.minecraftservices.com/',
			TokenType: 'JWT'
		});
	} catch (e) {
		const xerr = String((e as { body?: { XErr?: number } }).body?.XErr ?? '');
		throw new AuthError(XSTS_ERRORS[xerr] ?? `Falha no Xbox Live (${xerr || (e as Error).message})`, xerr);
	}
	return { uhs: xsts.DisplayClaims.xui[0].uhs, xsts: xsts.Token };
}

async function minecraftLogin(uhs: string, xsts: string) {
	try {
		return await postJson<{ access_token: string; expires_in: number }>(
			'https://api.minecraftservices.com/authentication/login_with_xbox',
			{ identityToken: `XBL3.0 x=${uhs};${xsts}` }
		);
	} catch (e) {
		if (e instanceof HttpError && e.status === 403) {
			throw new AuthError(
				'A Mojang recusou esse Client ID. Apps novos precisam ser aprovados para a API do Minecraft (veja Ajustes).',
				'app_not_approved'
			);
		}
		throw e;
	}
}

interface McProfile {
	id: string;
	name: string;
	skins?: Array<{ state: string; url: string }>;
}

async function minecraftProfile(token: string) {
	try {
		return await getJson<McProfile>('https://api.minecraftservices.com/minecraft/profile', {
			headers: { Authorization: `Bearer ${token}` }
		});
	} catch (e) {
		if (e instanceof HttpError && e.status === 404) {
			throw new AuthError(
				'Essa conta não tem Minecraft: Java Edition (ou ainda não criou o nome de jogador em minecraft.net).',
				'no_game'
			);
		}
		throw e;
	}
}

async function toSession(ms: MsToken): Promise<MinecraftSession> {
	const { uhs, xsts } = await xboxChain(ms.access_token);
	const mc = await minecraftLogin(uhs, xsts);
	const p = await minecraftProfile(mc.access_token);
	return {
		accessToken: mc.access_token,
		expiresAt: Date.now() + (mc.expires_in - 60) * 1000,
		refreshToken: ms.refresh_token,
		profile: { id: p.id, name: p.name, skinUrl: p.skins?.find((s) => s.state === 'ACTIVE')?.url }
	};
}

/** Fluxo completo a partir do token Microsoft obtido no device code. */
export const completeLogin = toSession;

/** Renova a sessão usando o refresh token salvo no cofre. */
export async function refreshSession(clientId: string, refreshToken: string): Promise<MinecraftSession> {
	return toSession(await refreshMicrosoft(clientId, refreshToken));
}

export function dashedUuid(id: string) {
	const h = id.replace(/-/g, '');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function sleep(ms: number, signal: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		if (signal.aborted) return reject(new AuthError('Cancelado', 'aborted'));
		const t = setTimeout(resolve, ms);
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(t);
				reject(new AuthError('Cancelado', 'aborted'));
			},
			{ once: true }
		);
	});
}
