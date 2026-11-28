<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { app } from '$lib/state.svelte';
	import { detectLanguage, i18n } from '$lib/i18n';
	import AccountsModal from '$lib/components/AccountsModal.svelte';
	import UpdateModal from '$lib/components/UpdateModal.svelte';
	import LaunchPresentation from '$lib/components/LaunchPresentation.svelte';
	import Toasts from '$lib/components/Toasts.svelte';
	import { ChevronDown, Gamepad2, House, Settings, Shirt } from 'lucide-svelte';
	import { tr } from '$lib/ui-text';

	let { children } = $props();

	const lang = $derived(detectLanguage());
	const t = $derived(i18n[lang] || i18n.pt);

	$effect(() => {
		app.init();
	});

	const nav = $derived([
		{ href: '/', label: t.home, icon: House },
		{ href: '/skins', label: tr('Skins'), icon: Shirt },
		{ href: '/controles', label: tr('Controles'), icon: Gamepad2 },
		{ href: '/ajustes', label: t.settings, icon: Settings }
	]);

	const isActive = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
	/** Editors that fill the whole area below the header. */
	const isFullBleed = $derived(['/skins', '/controles'].some((p) => page.url.pathname.startsWith(p)));
	const acc = $derived(app.activeAccount);
	const avatar = $derived(
		acc?.type === 'microsoft' ? `https://mc-heads.net/avatar/${acc.uuid.replace(/-/g, '')}/40` : '/images/steve-head.png'
	);
</script>

<div class="shell">
	<header class="top">
		<a href="/" class="logo">
			<img src="/images/tropi_creeper.png" alt="" class="pixel logo-creeper" width="28" height="42" />
			<img src="/images/tropicalia_logo.png" alt="Tropicalia Craft" class="logo-wordmark" />
		</a>

		<nav class="desktop-nav">
			{#each nav as item (item.href)}
				{@const Icon = item.icon}
				<a href={item.href} class:active={isActive(item.href)} aria-current={isActive(item.href) ? 'page' : undefined}>
					<Icon size={15} strokeWidth={2.5} />
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>

		<button class="account" onclick={() => (app.accountsOpen = true)} title="Trocar de conta">
			{#if acc}
				<img src={avatar} alt="" class="pixel shrink-0" onerror={(e) => ((e.currentTarget as HTMLImageElement).src = '/images/steve-head.png')} />
				<span class="account-info min-w-0 text-left">
					<b class="font-mc mc-shadow-sm block truncate">{acc.username}</b>
					<small class="hidden sm:block">{acc.type === 'microsoft' ? 'Microsoft' : 'Offline'}</small>
				</span>
			{:else}
				<img src="/images/steve-head.png" alt="" class="pixel shrink-0 opacity-50" />
				<span class="account-info text-left">
					<b class="font-mc mc-shadow-sm block">Entrar</b>
					<small class="hidden sm:block">Adicionar conta</small>
				</span>
			{/if}
			<ChevronDown size={14} class="shrink-0 text-zinc-400" />
		</button>
	</header>

	<main class:bleed={isFullBleed}>
		{#if app.ready}
			{@render children()}
		{:else}
			<div class="grid h-full place-items-center"><img src="/images/grass-block-side.png" alt="Carregando" class="pixel float h-12 w-12" /></div>
		{/if}
	</main>

	<!-- Barra de Navegação Inferior para Telas Verticais / Mobile (< 768px) -->
	<nav class="mobile-nav" aria-label="Navegação mobile">
		{#each nav as item (item.href)}
			{@const Icon = item.icon}
			<a href={item.href} class="mobile-nav-item" class:active={isActive(item.href)} aria-current={isActive(item.href) ? 'page' : undefined}>
				<div class="relative flex items-center justify-center">
					<Icon size={19} strokeWidth={isActive(item.href) ? 2.5 : 2} />
				</div>
				<span class="font-mc">{item.label}</span>
			</a>
		{/each}
	</nav>
</div>

{#if app.launchPresentation}<LaunchPresentation task={app.tasks[app.launchPresentation]} />{/if}

<AccountsModal />
<UpdateModal />
<Toasts />

<style>
	.shell {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		grid-template-columns: minmax(0, 1fr);
		height: 100vh;
		height: 100dvh;
		max-width: 100vw;
		overflow-x: hidden;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		height: calc(60px + env(safe-area-inset-top, 0px));
		padding: env(safe-area-inset-top, 0px) 16px 0;
		background: linear-gradient(#111915, #0c120f);
		border-bottom: 2px solid #000;
		box-shadow: 0 2px 0 #1d2a23;
		position: relative;
		z-index: 20;
	}
	.logo {
		display: flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		flex: none;
	}
	.logo .logo-creeper {
		height: 40px;
		width: auto;
		image-rendering: pixelated;
		filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.6));
	}
	.logo .logo-wordmark {
		height: 36px;
		width: auto;
		image-rendering: auto;
		filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.6));
	}
	.desktop-nav {
		display: flex;
		gap: 4px;
		margin: 0 auto;
	}
	.desktop-nav a {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 14px;
		color: #a9bbb0;
		text-decoration: none;
		font-family: var(--font-minecraft);
		font-size: 11.5px;
		letter-spacing: 0.04em;
		text-shadow: 1px 1px 0 #000;
	}
	.desktop-nav a:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.04);
	}
	.desktop-nav a.active {
		color: #fff;
		background: var(--tp-panel-2);
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -3px 0 var(--tp-emerald), 0 0 0 2px #000;
	}
	.desktop-nav a.active :global(svg) {
		color: var(--tp-green);
	}
	.account {
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 220px;
		height: 42px;
		padding: 0 8px 0 4px;
		border: 0;
		cursor: pointer;
		background: var(--tp-panel-2);
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #000;
		color: var(--tp-muted);
		flex-shrink: 0;
	}
	.account:hover {
		filter: brightness(1.2);
	}
	.account img {
		width: 32px;
		height: 32px;
		box-shadow: 0 0 0 2px #000;
	}
	.account b {
		font-size: 11px;
		color: #fff;
	}
	.account small {
		font-size: 10px;
	}
	main {
		overflow-y: auto;
		overflow-x: hidden;
		min-height: 0;
		padding: 24px 28px 40px;
	}
	main.bleed {
		overflow: hidden;
		padding: 0;
	}

	/* ------------------------------------------------ barra mobile inferior */
	.mobile-nav {
		display: none;
	}

	@media (max-width: 1024px) {
		.desktop-nav a span {
			display: none;
		}
		.desktop-nav a {
			padding: 0 10px;
		}
	}

	@media (max-width: 767px) {
		.desktop-nav {
			display: none;
		}
		.top {
			height: calc(54px + env(safe-area-inset-top, 0px));
			padding: env(safe-area-inset-top, 0px) 12px 0;
		}
		.account {
			max-width: 130px;
		}
		main {
			padding: 16px 12px calc(68px + env(safe-area-inset-bottom, 0px));
		}
		main.bleed {
			padding: 0 0 calc(54px + env(safe-area-inset-bottom, 0px));
		}
		.mobile-nav {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			height: calc(54px + env(safe-area-inset-bottom, 0px));
			padding-bottom: env(safe-area-inset-bottom, 0px);
			background: linear-gradient(#141c18, #0e1411);
			border-top: 2px solid #000;
			box-shadow: 0 -2px 0 #1d2a23;
			display: flex;
			align-items: center;
			justify-content: space-around;
			z-index: 40;
		}
		/* faixa de grama no topo da bottom bar */
		.mobile-nav::before {
			content: '';
			position: absolute;
			left: 0;
			right: 0;
			top: -6px;
			height: 6px;
			background: url('/images/grass-strip.png') 0 0 / 16px 6px repeat-x;
			image-rendering: pixelated;
			pointer-events: none;
			opacity: 0.85;
		}
		.mobile-nav-item {
			flex: 1;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 3px;
			height: 100%;
			min-height: 48px;
			color: #8fa195;
			text-decoration: none;
			transition: color 0.1s, background 0.1s;
		}
		.mobile-nav-item span {
			font-size: 8.5px;
			letter-spacing: 0.02em;
			line-height: 1;
		}
		.mobile-nav-item.active {
			color: #fff;
			background: rgba(16, 185, 129, 0.12);
			box-shadow: inset 0 -3px 0 var(--tp-emerald);
		}
		.mobile-nav-item.active :global(svg) {
			color: var(--tp-green);
		}
	}
</style>
