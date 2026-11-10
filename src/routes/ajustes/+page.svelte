<script lang="ts">
	import TropicaliaCard from '$lib/components/TropicaliaCard.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import TabSelector from '$lib/components/TabSelector.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import { app, PERF_PROFILES, suggestedMemory, toasts } from '$lib/state.svelte';
	import { i18n, resolveLanguage } from '$lib/i18n';
	import { isTauri, openFolder, openUrl } from '$lib/platform';
	import { ExternalLink, FolderOpen, RefreshCw, Save } from 'lucide-svelte';

	const s = app.settings;
	const t = $derived(i18n[resolveLanguage(app.settings.language)] || i18n.en);
	const maxRam = $derived(Math.max(2048, app.system.totalMemoryMb - 1024));

	function save() {
		app.saveSettings();
		toasts.ok(t.savedToast);
	}
</script>

<div class="mx-auto grid max-w-[1100px] grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
	<TropicaliaCard title={t.languageTitle} subtitle={t.languageLabel} class="col-span-1 md:col-span-2">
		<div class="overflow-x-auto pb-1 scrollbar-none">
			<TabSelector
				tabs={[
					{ id: 'auto', label: t.languageAuto },
					{ id: 'pt', label: 'Português (BR)' },
					{ id: 'en', label: 'English' },
					{ id: 'es', label: 'Español' }
				]}
				value={s.language ?? 'auto'}
				size="sm"
				onchange={(val) => {
					s.language = val as 'auto' | 'pt' | 'en' | 'es';
					save();
				}}
			/>
		</div>
		<p class="tp-help mt-3">{t.languageHelp}</p>
	</TropicaliaCard>

	<TropicaliaCard title={t.msTitle} subtitle={t.msSubtitle} class="col-span-1 md:col-span-2">
		<label class="tp-label" for="cid">{t.msClientIdLabel}</label>
		<input id="cid" class="tp-input font-mono" placeholder="00000000-0000-0000-0000-000000000000" bind:value={s.msClientId} onchange={save} />
		<div class="tp-help mt-3 space-y-1.5 text-[12.5px] leading-relaxed">
			<p>Para o login Microsoft funcionar, o launcher precisa de um app registrado:</p>
			<ol class="list-decimal space-y-1 pl-5">
				<li>Em <b>portal.azure.com → Registros de aplicativo</b>, crie um app para <b>"Somente contas pessoais Microsoft"</b>.</li>
				<li>Em <b>Autenticação</b>, ative <b>"Permitir fluxos de cliente público"</b> (necessário para o código de 8 dígitos).</li>
				<li>Peça à Mojang acesso à API do Minecraft para esse Client ID (apps novos ficam bloqueados até a aprovação).</li>
				<li>Cole o Client ID aqui, ou defina <code>VITE_MS_CLIENT_ID</code> no <code>.env</code> do build.</li>
			</ol>
			<p>Enquanto isso, perfis offline funcionam normalmente para LAN e servidores <code>online-mode=false</code>.</p>
		</div>
		<div class="mt-4 flex flex-wrap gap-2.5">
			<PixelButton size="sm" icon={ExternalLink} onclick={() => openUrl('https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade')}>Azure: registros de app</PixelButton>
			<PixelButton size="sm" icon={ExternalLink} onclick={() => openUrl('https://aka.ms/mce-reviewappid')}>Formulário de aprovação da Mojang</PixelButton>
		</div>
	</TropicaliaCard>

	<TropicaliaCard title={t.perfTitle}>
		<div class="overflow-x-auto pb-1 scrollbar-none">
			<TabSelector
				tabs={Object.entries(PERF_PROFILES).map(([id, p]) => ({ id, label: p.label }))}
				bind:value={s.perfProfile}
				size="sm"
				onchange={save}
			/>
		</div>
		<p class="tp-help mt-3">{PERF_PROFILES[s.perfProfile].help}</p>
		<p class="tp-muted mt-2 break-all font-mono text-[10.5px] leading-relaxed">{PERF_PROFILES[s.perfProfile].flags}</p>

		<div class="mt-5">
			<div class="flex items-baseline justify-between">
				<label class="tp-label" for="ram">{t.ramLabel}</label>
				<span class="font-mc mc-shadow-sm text-[12px] text-[#bef264]">{(s.defaultMemoryMb / 1024).toFixed(1)} GB</span>
			</div>
			<input id="ram" type="range" class="tp-range" min="1024" max={maxRam} step="512" bind:value={s.defaultMemoryMb} onchange={save} />
			<p class="tp-help">
				Sugestão para {(app.system.totalMemoryMb / 1024).toFixed(0)} GB de RAM: {(suggestedMemory(app.system.totalMemoryMb) / 1024).toFixed(1)} GB.
			</p>
		</div>
	</TropicaliaCard>

	<TropicaliaCard title={t.behaviorTitle}>
		<div class="flex flex-col gap-5">
			<Toggle
				bind:checked={s.hideOnLaunch}
				label={t.hideOnLaunch}
				help={t.hideOnLaunchHelp}
				onchange={save}
			/>
			<div>
				<label class="tp-label" for="java">{t.javaManual}</label>
				<input id="java" class="tp-input font-mono" placeholder={t.javaManualPlaceholder} bind:value={s.javaPath} onchange={save} />
				<p class="tp-help">{t.javaManualHelp}</p>
			</div>
			<div class="flex flex-wrap gap-2.5">
				<PixelButton size="sm" icon={FolderOpen} disabled={!isTauri} onclick={() => openFolder('root').catch(toasts.err)}>{t.dataFolder}</PixelButton>
				<PixelButton size="sm" variant="emerald" icon={Save} onclick={save}>{t.save}</PixelButton>
			</div>
		</div>
	</TropicaliaCard>

	<TropicaliaCard title={t.aboutTitle} class="col-span-1 md:col-span-2" size="sm">
		<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
			<div>
				<p class="tp-muted text-[12.5px]">
					Tropicalia Launcher 0.1.0 · {app.system.os} {app.system.arch} · {app.system.cpus} núcleos · {(app.system.totalMemoryMb / 1024).toFixed(1)} GB RAM.
				</p>
				<p class="tp-muted text-[11.5px] mt-0.5">
					{t.aboutDisclaimer}
				</p>
			</div>
			<PixelButton size="sm" icon={RefreshCw} class="shrink-0" onclick={() => app.checkUpdates(true)}>
				{t.checkUpdates}
			</PixelButton>
		</div>
	</TropicaliaCard>
</div>
