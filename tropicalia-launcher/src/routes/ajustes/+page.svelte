<script lang="ts">
	import { onMount } from 'svelte';
    import { beforeNavigate, goto } from '$app/navigation';
    import Modal from '$lib/components/Modal.svelte';
    import { tr } from '$lib/ui-text';
	import { secrets } from '$lib/platform';
	import { KEY_NAME } from '$lib/services/curseforge';
	import TropicaliaCard from '$lib/components/TropicaliaCard.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import TabSelector from '$lib/components/TabSelector.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { app, PERF_PROFILES, suggestedMemory, toasts } from '$lib/state.svelte';
	import { isTauri, openFolder, openUrl } from '$lib/platform';
	import { DEFAULT_MS_CLIENT_ID } from '$lib/services/microsoft-auth';
	import { CheckCircle2, Cpu, ExternalLink, FolderOpen, LogIn, RefreshCw, RotateCcw, Save, ShieldCheck, HeartHandshake } from 'lucide-svelte';


	const s = $state(structuredClone($state.snapshot(app.settings)));
    const fields = (value: typeof s) => { const { controls, ...rest } = value; return rest; };
    let baseline = $state(JSON.stringify(fields(s)));
    const dirty = $derived(JSON.stringify(fields(s)) !== baseline);
    let leaveOpen = $state(false);
    let nextUrl: string | null = null;
    let leaving = false;
    beforeNavigate(navigation => {
        if (!dirty || leaving) return;
        navigation.cancel(); nextUrl = navigation.to?.url.href ?? null; leaveOpen = true;
    });
    function leave() { leaving = true; leaveOpen = false; if (nextUrl) void goto(nextUrl); }

	let curseforgeKey = $state('');
	let curseforgeConfigured = $state(false);
	onMount(() => { void secrets.get(KEY_NAME).then(key => { curseforgeConfigured = !!key; }); });
	async function saveCurseforge() {
		try {
			if (!curseforgeKey.trim()) throw new Error('Informe a chave da API CurseForge.');
			await secrets.set(KEY_NAME, curseforgeKey.trim());
			curseforgeKey = '';
			curseforgeConfigured = true;
			toasts.ok('Chave CurseForge salva neste dispositivo.');
		} catch (e) { toasts.err(e); }
	}
	const maxRam = $derived(Math.max(2048, app.system.totalMemoryMb - 1024));

	const isCustomClientId = $derived(
		s.msClientId && s.msClientId.trim() !== '' && s.msClientId.trim() !== DEFAULT_MS_CLIENT_ID
	);

	async function save() {
        const previous = $state.snapshot(app.settings);
        try {
            Object.assign(app.settings, $state.snapshot(s), {controls: app.settings.controls});
            await app.saveSettings();
            baseline = JSON.stringify(fields(s));
            toasts.ok(tr('Ajustes salvos com sucesso!'));
        } catch (e) { Object.assign(app.settings, previous); toasts.err(e); throw e; }
    }

	function restoreDefaultClient() {
		s.msClientId = DEFAULT_MS_CLIENT_ID;
		void save().catch(() => {});
	}
</script>
<svelte:window onbeforeunload={(e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }} />
<Modal bind:open={leaveOpen} title={tr('Alterações não salvas')}>
    <p>{tr('Salvar alterações antes de sair?')}</p>
    {#snippet footer()}
        <PixelButton onclick={() => { leaveOpen = false; nextUrl = null; }}>{tr('Cancelar')}</PixelButton>
        <PixelButton variant="danger" onclick={leave}>{tr('Sair sem salvar')}</PixelButton>
        <PixelButton variant="emerald" onclick={() => save().then(leave).catch(() => {})}>{tr('Salvar e sair')}</PixelButton>
    {/snippet}
</Modal>


<div class="mx-auto grid max-w-[1100px] grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
	<TropicaliaCard title="Catálogo CurseForge" subtitle="Mods com filtros de versão, modloader e dependências">
		<p class="tp-help mb-3">{curseforgeConfigured ? 'Chave configurada. Você já pode selecionar CurseForge ao buscar mods.' : 'Configure a chave da API do projeto para consultar e baixar mods CurseForge.'}</p>
		<label class="tp-label" for="cf-key">Chave da API CurseForge</label>
		<input id="cf-key" class="tp-input" type="password" autocomplete="off" bind:value={curseforgeKey} placeholder="Cole a chave para salvar ou substituir" />
		<div class="mt-3 flex flex-wrap gap-2">
			<PixelButton size="sm" onclick={saveCurseforge}>Salvar chave</PixelButton>
			<PixelButton size="sm" variant="ghost" onclick={() => openUrl('https://docs.curseforge.com/rest-api/#accessing-the-service')}>Obter acesso à API</PixelButton>
			{#if curseforgeConfigured}<PixelButton size="sm" variant="ghost" onclick={async () => { await secrets.delete(KEY_NAME); curseforgeConfigured = false; }}>Remover chave</PixelButton>{/if}
		</div>
		<p class="tp-help mt-3">Arquivos sem autorização de download direto devem ser obtidos na página do autor.</p>
	</TropicaliaCard>
	<!-- CONTA MICROSOFT -->
	<TropicaliaCard
		title="Conta Microsoft"
		subtitle="Login oficial OAuth 2.0 via Device Code — Seguro e direto no app"
		class="col-span-1 md:col-span-2"
	>
		{#snippet actions()}
			<PixelButton size="sm" variant="emerald" icon={LogIn} onclick={() => (app.accountsOpen = true)}>
				Entrar com Microsoft
			</PixelButton>
		{/snippet}

		<div class="flex flex-wrap items-center justify-between gap-3 mb-3">
			<div class="flex items-center gap-2">
				<ShieldCheck size={18} class="text-[#4ade80]" />
				<span class="text-[13px] font-semibold text-white">Autenticação Microsoft & Xbox Live</span>
				{#if isCustomClientId}
					<Badge tone="gold">ID Personalizado</Badge>
				{:else}
					<Badge tone="green"><CheckCircle2 size={11} /> ID Oficial Ativo</Badge>
				{/if}
			</div>
			{#if isCustomClientId}
				<PixelButton size="xs" variant="ghost" icon={RotateCcw} onclick={restoreDefaultClient}>
					Restaurar ID padrão
				</PixelButton>
			{/if}
		</div>

		<label class="tp-label" for="cid">Client ID do Azure (Entra ID)</label>
		<input
			id="cid"
			class="tp-input font-mono text-xs"
			placeholder="c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb"
			bind:value={s.msClientId}
			
		/>

		<div class="tp-help mt-3 space-y-1.5 text-[12.5px] leading-relaxed">
			<p>
				O launcher já vem configurado com um <b>Client ID público oficial homologado</b> para login direto com a Microsoft
				(Device Code OAuth 2.0).
			</p>
			<p class="text-[#a7b5ad]">
				O login é 100% seguro: você digita o código oficial de 8 dígitos em <code>microsoft.com/link</code> e o launcher
				nunca tem acesso à sua senha.
			</p>
			<p class="text-[#a7b5ad]">
				Se você registrou um aplicativo próprio no portal do Azure com aprovação da Mojang, basta colar seu ID acima.
			</p>
		</div>

		<div class="mt-4 flex flex-wrap gap-2.5">
			<PixelButton size="sm" icon={ExternalLink} onclick={() => openUrl('https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade')}>
				Portal do Azure
			</PixelButton>
			<PixelButton size="sm" icon={ExternalLink} onclick={() => openUrl('https://aka.ms/mce-reviewappid')}>
				Aprovação Mojang API
			</PixelButton>
		</div>
	</TropicaliaCard>

	<!-- DESEMPENHO E JVM -->
	<TropicaliaCard title="Desempenho e JVM" subtitle="Otimizações de Java e alocação de hardware">
		<div class="space-y-4">
			<div>
				<span class="tp-label">Perfil de Otimização JVM (Java)</span>
				<div class="overflow-x-auto pb-1 scrollbar-none">
					<TabSelector
						tabs={Object.entries(PERF_PROFILES).map(([id, p]) => ({ id, label: p.label }))}
						bind:value={s.perfProfile}
						size="sm"
						
					/>
				</div>
				<p class="tp-help mt-2.5 text-[12px]">{PERF_PROFILES[s.perfProfile].help}</p>
				<div class="mt-2 p-2 bg-[#0b100e] border border-[#1a2820] rounded">
					<p class="tp-muted break-all font-mono text-[10px] leading-relaxed">
						{PERF_PROFILES[s.perfProfile].flags}
					</p>
				</div>
			</div>

			<div class="pt-2 border-t border-[#1d2a23]">
				<div class="flex items-baseline justify-between">
					<label class="tp-label" for="ram">Memória RAM Padrão</label>
					<span class="font-mc mc-shadow-sm text-[12px] text-[#bef264]">{(s.defaultMemoryMb / 1024).toFixed(1)} GB</span>
				</div>
				<input
					id="ram"
					type="range"
					class="tp-range"
					min="1024"
					max={maxRam}
					step="512"
					bind:value={s.defaultMemoryMb}
					
				/>
				<p class="tp-help text-[11.5px]">
					Total do seu sistema: {(app.system.totalMemoryMb / 1024).toFixed(0)} GB · Sugestão: {(suggestedMemory(app.system.totalMemoryMb) / 1024).toFixed(1)} GB.
				</p>
			</div>

			<!-- DESTAQUE MOTOR RUST -->
			<div class="p-3 bg-[#0d1712] border border-[#1e3428] rounded">
				<div class="flex items-center gap-2 text-[#4ade80] font-semibold text-xs mb-1">
					<Cpu size={14} /> Motor Rust Vulkan
				</div>
				<p class="text-[11.5px] text-[#c7d5cc] leading-relaxed">
					Instâncias no motor <b>Rust</b> dispensam Java/JVM completamente. Elas rodam código de máquina compilado
					direto na GPU com Vulkan nativo, consumindo menos de 500 MB de RAM e com FPS significativamente superior.
				</p>
			</div>

			<!-- RENDERIZADOR E ANGLE -->
			<div class="space-y-3 pt-3 border-t border-[#1d2a23]">
				<Toggle
					bind:checked={s.defaultUseAngle}
					label={tr("Usar ANGLE (OpenGL sobre Vulkan)")}
					help="Redireciona chamadas OpenGL para o backend Google ANGLE Vulkan. Melhora estabilidade em placas gráficas Intel e AMD."
					
				/>

				<div>
					<label class="tp-label" for="def-rdr">Renderizador Java (Pojav / Mobile)</label>
					<select id="def-rdr" class="tp-select" bind:value={s.defaultJavaRenderer} >
						<option value="opengles_mobileglues">Holy GL4ES / MobileGlues (Recomendado)</option>
						<option value="opengles3_desktopgl_zink_kopper">Vulkan Zink Kopper (Alto Desempenho)</option>
						<option value="vulkan_zink">Vulkan Zink OSMesa (Mesa 23.0.4)</option>
						<option value="opengles2">NG-GL4ES (Krypton Wrapper · Legado)</option>
						<option value="opengles3_ltw">LTW Renderer (GLES3 Otimizado)</option>
					</select>
					<p class="tp-help text-[11px]">Camada gráfica aplicada quando rodando através de wrappers mobile/Pojav.</p>
				</div>
			</div>
		</div>
	</TropicaliaCard>

	<!-- COMPORTAMENTO -->
	<TropicaliaCard title={tr("Comportamento e Arquivos")} subtitle={tr("Preferências de execução do launcher")}>
		<div class="flex flex-col gap-5">
			<Toggle
				bind:checked={s.hideOnLaunch}
				label={tr("Ir para a bandeja ao abrir o jogo")}
				help="O launcher minimiza para a bandeja do sistema enquanto o jogo está aberto e restaura automaticamente ao sair."
				
			/>

			<div>
				<label class="tp-label" for="java">{tr("Caminho do Java Manual (Opcional)")}</label>
				<input
					id="java"
					class="tp-input font-mono"
					placeholder="Automático (Java oficial da Mojang)"
					bind:value={s.javaPath}
					
				/>
				<p class="tp-help">Deixe em branco para download automático do Java 8, 17 ou 21 oficial da Mojang conforme a versão.</p>
			</div>

			<div class="flex flex-wrap gap-2.5 pt-2">
				<PixelButton size="sm" icon={FolderOpen} disabled={!isTauri} onclick={() => openFolder('root').catch(toasts.err)}>
					{tr("Pasta de dados (.tropicalia)")}
				</PixelButton>
				<PixelButton size="sm" variant="emerald" icon={Save} onclick={() => save().catch(() => {})}>
					{tr("Salvar alterações")}
				</PixelButton>
			</div>
		</div>
	</TropicaliaCard>

	<!-- SOBRE -->
	<TropicaliaCard title={tr("Sobre o TropicaliaLauncher")} class="col-span-1 md:col-span-2" size="sm">
		<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
			<div>
				<p class="tp-muted text-[12.5px]">
					TropicaliaLauncher v0.1.0 · Sistema: {app.system.os} {app.system.arch} · {app.system.cpus} núcleos de CPU · {(app.system.totalMemoryMb / 1024).toFixed(1)} GB de RAM.
				</p>
				<p class="tp-muted text-[11.5px] mt-0.5">
					Não é um produto oficial do Minecraft nem associado à Mojang ou à Microsoft. Launcher independente e de código aberto.
				</p>
			</div>
			<div class="flex shrink-0 flex-wrap gap-2">
				<PixelButton size="sm" variant="ghost" icon={HeartHandshake} onclick={() => goto('/sobre')}>
					{tr("Créditos e licenças")}
				</PixelButton>
				<PixelButton size="sm" icon={RefreshCw} onclick={() => app.checkUpdates(true)}>
					{tr("Verificar atualizações")}
				</PixelButton>
			</div>
		</div>
	</TropicaliaCard>
</div>
