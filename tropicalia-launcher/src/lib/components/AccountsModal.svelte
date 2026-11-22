<!-- Gestor de contas: Microsoft (Device Code + QR) e perfis offline/LAN. -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import PixelButton from './PixelButton.svelte';
	import Badge from './Badge.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import { openUrl } from '$lib/platform';
	import { DEFAULT_MS_CLIENT_ID, type DeviceCode } from '$lib/services/microsoft-auth';
	import { isValidNick, offlineUuid } from '$lib/util/offline-uuid';
	import { errorMessage } from '$lib/util/format';
	import { Check, Copy, ExternalLink, Key, RotateCcw, Trash2, UserPlus, WifiOff } from 'lucide-svelte';
	import QRCode from 'qrcode';

	let view = $state<'list' | 'microsoft' | 'offline'>('list');
	let nick = $state('');
	let code = $state<DeviceCode | null>(null);
	let qr = $state('');
	let error = $state('');
	let copied = $state(false);
	let showClientConfig = $state(false);
	let customClientId = $state('');
	let controller: AbortController | null = null;

	const nickOk = $derived(isValidNick(nick));
	const linkWithCode = $derived(code ? `${code.verification_uri}?otc=${encodeURIComponent(code.user_code)}` : '');

	function reset() {
		controller?.abort();
		controller = null;
		code = null;
		qr = '';
		error = '';
		nick = '';
		showClientConfig = false;
		view = 'list';
	}

	function restoreDefaultClientId() {
		app.settings.msClientId = DEFAULT_MS_CLIENT_ID;
		customClientId = DEFAULT_MS_CLIENT_ID;
		app.saveSettings();
		toasts.ok('Client ID padrão restaurado!');
		startMicrosoft();
	}

	async function startMicrosoft() {
		view = 'microsoft';
		error = '';
		code = null;
		customClientId = app.settings.msClientId || DEFAULT_MS_CLIENT_ID;
		controller = new AbortController();
		try {
			const acc = await app.loginMicrosoft(async (c) => {
				code = c;
				qr = await QRCode.toDataURL(`${c.verification_uri}?otc=${encodeURIComponent(c.user_code)}`, {
					margin: 1,
					scale: 5,
					color: { dark: '#0d1210', light: '#e6efe9' }
				});
			}, controller.signal);
			toasts.ok(`Bem-vindo, ${acc.username}!`);
			reset();
		} catch (e) {
			if ((e as { code?: string }).code === 'aborted') return;
			error = errorMessage(e);
		}
	}

	function createOffline() {
		if (!nickOk) return;
		const acc = app.addOffline(nick.trim());
		toasts.ok(`Perfil offline ${acc.username} pronto`);
		reset();
	}

	async function copyCode() {
		if (!code) return;
		await navigator.clipboard.writeText(code.user_code).catch(() => {});
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const avatar = (a: { type: string; uuid: string }) =>
		a.type === 'microsoft' ? `https://mc-heads.net/avatar/${a.uuid.replace(/-/g, '')}/48` : '/images/steve-head.png';
</script>

<Modal bind:open={app.accountsOpen} title="Contas" width={600} onclose={reset}>
	{#if view === 'list'}
		<div class="flex flex-col gap-2.5">
			{#each app.accounts as acc (acc.id)}
				{@const active = app.activeAccount?.id === acc.id}
				<div class="acc tp-slot" class:active>
					<img class="pixel h-10 w-10" src={avatar(acc)} alt="" onerror={(e) => ((e.currentTarget as HTMLImageElement).src = '/images/steve-head.png')} />
					<div class="min-w-0 flex-1">
						<div class="font-mc mc-shadow-sm truncate text-[13px] text-white">{acc.username}</div>
						<div class="mt-1 flex items-center gap-1.5">
							{#if acc.type === 'microsoft'}<Badge tone="green">Microsoft</Badge>{:else}<Badge tone="gold">Offline / LAN</Badge>{/if}
							<span class="tp-muted truncate font-mono text-[10.5px]">{acc.uuid}</span>
						</div>
					</div>
					{#if active}
						<Badge tone="green" pixel><Check size={11} /> em uso</Badge>
					{:else}
						<PixelButton size="sm" onclick={() => app.setActiveAccount(acc.id)}>Usar</PixelButton>
					{/if}
					<PixelButton size="sm" variant="ghost" icon={Trash2} title="Remover conta" onclick={() => app.removeAccount(acc.id)} />
				</div>
			{:else}
				<p class="tp-muted py-3 text-center text-[13px]">Nenhuma conta ainda. Entre com a Microsoft para jogar online, ou crie um perfil offline para LAN.</p>
			{/each}
		</div>

		<div class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
			<button class="add" onclick={startMicrosoft}>
				<img src="/images/grass-block-side.png" alt="" class="pixel h-9 w-9" />
				<span>
					<b class="font-mc mc-shadow-sm text-[12px] text-white">Conta Microsoft</b>
					<small>Login oficial direto (Xbox/Mojang)</small>
				</span>
			</button>
			<button class="add" onclick={() => (view = 'offline')}>
				<WifiOff size={30} class="text-[#fbbf24]" />
				<span>
					<b class="font-mc mc-shadow-sm text-[12px] text-white">Perfil offline</b>
					<small>Nickname para LAN e servidores offline</small>
				</span>
			</button>
		</div>
	{:else if view === 'microsoft'}
		{#if error}
			<div class="err selectable">{error}</div>
			<div class="mt-4 flex flex-wrap items-center justify-between gap-2">
				<div class="flex gap-2">
					<PixelButton size="sm" variant="ghost" onclick={() => (showClientConfig = !showClientConfig)} icon={Key}>
						{showClientConfig ? 'Ocultar ID' : 'Configurar Client ID'}
					</PixelButton>
					<PixelButton size="sm" variant="ghost" onclick={restoreDefaultClientId} icon={RotateCcw}>
						Usar ID padrão
					</PixelButton>
				</div>
				<div class="flex gap-2">
					<PixelButton variant="ghost" onclick={reset}>Voltar</PixelButton>
					<PixelButton variant="emerald" onclick={startMicrosoft}>Tentar de novo</PixelButton>
				</div>
			</div>

			{#if showClientConfig}
				<div class="mt-3 p-3 bg-[#0c1410] border border-[#1b2b22] text-[12px] space-y-2">
					<label class="tp-label" for="acc-cid">Client ID do Azure (Entra ID)</label>
					<div class="flex gap-2">
						<input id="acc-cid" class="tp-input font-mono text-xs" bind:value={customClientId} />
						<PixelButton size="sm" variant="emerald" onclick={() => { app.settings.msClientId = customClientId.trim(); app.saveSettings(); startMicrosoft(); }}>
							Salvar
						</PixelButton>
					</div>
				</div>
			{/if}
		{:else if !code}
			<div class="tp-muted flex items-center gap-3 py-8 text-[13px]"><span class="spinner"></span> Conectando com a Microsoft…</div>
		{:else}
			<div class="flex flex-col sm:grid sm:grid-cols-[1fr_auto] items-center gap-6">
				<div>
					<p class="text-[13px] text-[#c7d5cc]">1. Abra <b class="text-white">microsoft.com/link</b> no PC ou celular</p>
					<p class="mt-1 text-[13px] text-[#c7d5cc]">2. Digite o código abaixo e autorize sua conta</p>
					<button class="code" onclick={copyCode} title="Clique para copiar">
						<span class="font-mc mc-shadow">{code.user_code}</span>
						{#if copied}<Check size={18} />{:else}<Copy size={18} />{/if}
					</button>
					<div class="mt-4 flex flex-wrap gap-2">
						<PixelButton variant="emerald" size="sm" icon={ExternalLink} onclick={() => openUrl(linkWithCode)}>Abrir página</PixelButton>
						<PixelButton variant="ghost" size="sm" onclick={reset}>Cancelar</PixelButton>
					</div>
					<p class="tp-muted mt-4 flex items-center gap-2 text-xs"><span class="spinner sm"></span> Aguardando sua autorização… (o launcher nunca tem acesso à sua senha)</p>

					<div class="mt-4 pt-3 border-t border-[#18261e] flex items-center justify-between">
						<button
							type="button"
							class="text-[11px] text-[#6ee7b7] hover:underline bg-transparent border-0 cursor-pointer p-0"
							onclick={() => (showClientConfig = !showClientConfig)}
						>
							{showClientConfig ? 'Ocultar Client ID' : 'Client ID do Azure: ' + (app.settings.msClientId ? app.settings.msClientId.slice(0, 8) + '…' : 'Padrão')}
						</button>
					</div>

					{#if showClientConfig}
						<div class="mt-2 p-2.5 bg-[#0b100e] border border-[#1b2b22] text-[11.5px] space-y-2">
							<label class="tp-label text-[11px]" for="acc-cid-active">Client ID ativo</label>
							<div class="flex gap-1.5">
								<input id="acc-cid-active" class="tp-input font-mono text-[11px]" bind:value={customClientId} />
								<PixelButton size="xs" variant="emerald" onclick={() => { app.settings.msClientId = customClientId.trim(); app.saveSettings(); startMicrosoft(); }}>
									Trocar
								</PixelButton>
								<PixelButton size="xs" variant="ghost" onclick={restoreDefaultClientId}>
									Padrão
								</PixelButton>
							</div>
						</div>
					{/if}
				</div>
				<div class="qr">
					<img src={qr} alt="QR code para login" width="150" height="150" class="pixel" />
					<small>Escaneie com o celular</small>
				</div>
			</div>
		{/if}
	{:else}
		<form onsubmit={(e) => (e.preventDefault(), createOffline())}>
			<label class="tp-label" for="nick">Nickname / Nome de Jogador</label>
			<input id="nick" class="tp-input font-mono" bind:value={nick} maxlength="16" placeholder="Steve" autocomplete="off" />
			<p class="tp-help">3 a 16 caracteres: letras, números e _. Funciona em LAN e servidores com <code>online-mode=false</code>.</p>
			{#if nickOk}
				<p class="tp-muted mt-3 font-mono text-[11px]">UUID offline gerado: {offlineUuid(nick.trim())}</p>
			{/if}
			<div class="mt-5 flex justify-end gap-2">
				<PixelButton variant="ghost" onclick={reset}>Voltar</PixelButton>
				<PixelButton type="submit" variant="emerald" icon={UserPlus} disabled={!nickOk}>Criar perfil</PixelButton>
			</div>
		</form>
	{/if}
</Modal>

<style>
	.acc {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
	}
	.acc.active {
		box-shadow: inset 2px 2px 0 #050706, inset -2px -2px 0 #24322b, 0 0 0 2px #10b981;
	}
	.add {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px;
		border: 0;
		cursor: pointer;
		text-align: left;
		background: var(--tp-panel-2);
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #000;
	}
	.add:hover {
		filter: brightness(1.2);
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #10b981;
	}
	.add small {
		display: block;
		margin-top: 4px;
		color: var(--tp-muted);
		font-size: 12px;
	}
	.code {
		display: inline-flex;
		align-items: center;
		gap: 14px;
		margin-top: 14px;
		padding: 12px 18px;
		border: 0;
		cursor: pointer;
		color: #bef264;
		background: #0b100e;
		box-shadow: inset 2px 2px 0 #000, inset -2px -2px 0 #24322b, 0 0 0 2px #000;
	}
	.code span {
		font-size: 26px;
		letter-spacing: 0.18em;
		color: #fff;
	}
	.qr {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 10px;
		background: #e6efe9;
		box-shadow: 0 0 0 2px #000;
	}
	.qr small {
		color: #0d1210;
		font-size: 11px;
		font-weight: 600;
	}
	.err {
		padding: 12px 14px;
		font-size: 13px;
		color: #fecaca;
		background: #2e1111;
		box-shadow: inset 0 0 0 1px #7f1d1d;
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 3px solid #1f6b3e;
		border-top-color: #4ade80;
		animation: tp-spin 0.8s steps(8) infinite;
	}
	.spinner.sm {
		width: 12px;
		height: 12px;
		border-width: 2px;
	}
</style>
