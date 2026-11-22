<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import { call, on, openUrl, isTauri } from '$lib/platform';
	import { ArrowDownCircle, Sparkles, Wrench, Clock, AlertCircle } from 'lucide-svelte';

	let updating = $state(false);
	let updateError = $state<string | null>(null);
	let currentBytes = $state(0);
	let totalBytes = $state(0);
	let statusMessage = $state('Preparando download…');

	const info = $derived(app.updateAvailable);
	const manifest = $derived(info?.manifest);

	$effect(() => {
		let unlisten: (() => void) | undefined;
		if (isTauri) {
			on<{ current: number; total: number; message: string }>('launcher://update-progress', (p) => {
				currentBytes = p.current;
				totalBytes = p.total;
				statusMessage = p.message;
			}).then((u) => {
				unlisten = u;
			});
		}
		return () => unlisten?.();
	});

	async function startUpdate() {
		if (!info || !info.asset) return;

		updating = true;
		updateError = null;
		statusMessage = 'Iniciando download da atualização…';

		if (isTauri) {
			try {
				await call('apply_launcher_update', {
					info: {
						currentVersion: info.currentVersion,
						targetVersion: info.latestVersion,
						downloadUrl: info.asset.url,
						sha1: info.asset.sha1 ?? null,
						binaryName: info.asset.binary ?? null
					}
				});
			} catch (err: any) {
				updating = false;
				updateError = err?.message || String(err);
				toasts.err('Falha ao auto-atualizar: ' + updateError);
			}
		} else {
			// No ambiente web/navegador, abre link direto
			openUrl(info.asset.url);
			app.updateModalOpen = false;
			updating = false;
		}
	}

	function remindLater() {
		app.dismissUpdateForSession();
	}
</script>

<Modal
	bind:open={app.updateModalOpen}
	title="Nova Atualização Disponível"
	width={620}
	dismissable={!updating}
	onclose={() => {
		if (!updating) app.dismissUpdateForSession();
	}}
>
	{#if manifest}
		<div class="space-y-4">
			<div class="header-box flex items-center justify-between gap-4 p-3.5 rounded-lg border border-[#3b5344] bg-[#14231b]">
				<div>
					<div class="flex items-center gap-2">
						<span class="font-mc text-[15px] text-[#86efac]">{manifest.name || `Versão ${manifest.version}`}</span>
						<span class="badge text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#22c55e]/20 text-[#4ade80] border border-[#22c55e]/40">Nova</span>
					</div>
					{#if manifest.highlights}
						<p class="text-[12.5px] text-zinc-300 mt-1">{manifest.highlights}</p>
					{/if}
				</div>
				<div class="text-right">
					<small class="text-[11px] text-zinc-400 block font-mono">Sua versão: v{info?.currentVersion}</small>
					<small class="text-[11px] text-[#a3e635] block font-mono">Disponível: v{manifest.version}</small>
				</div>
			</div>

			<!-- Patch Notes: Novidades & Correções -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px]">
				<!-- Novidades -->
				<div class="card-notes rounded-lg border border-[#2e4235] bg-[#0f1a14] p-3">
					<div class="flex items-center gap-1.5 font-bold text-[#bef264] mb-2 font-mc text-[12px]">
						<Sparkles size={14} />
						<span>NOVIDADES</span>
					</div>
					{#if manifest.patchNotes?.novidades?.length}
						<ul class="space-y-1.5 text-zinc-300 pl-4 list-disc marker:text-[#bef264]">
							{#each manifest.patchNotes.novidades as item}
								<li class="leading-relaxed">{item}</li>
							{/each}
						</ul>
					{:else}
						<p class="text-zinc-500 italic">Melhorias gerais no launcher.</p>
					{/if}
				</div>

				<!-- Correções -->
				<div class="card-notes rounded-lg border border-[#2e4235] bg-[#0f1a14] p-3">
					<div class="flex items-center gap-1.5 font-bold text-[#93c5fd] mb-2 font-mc text-[12px]">
						<Wrench size={14} />
						<span>CORREÇÕES</span>
					</div>
					{#if manifest.patchNotes?.correcoes?.length}
						<ul class="space-y-1.5 text-zinc-300 pl-4 list-disc marker:text-[#93c5fd]">
							{#each manifest.patchNotes.correcoes as item}
								<li class="leading-relaxed">{item}</li>
							{/each}
						</ul>
					{:else}
						<p class="text-zinc-500 italic">Correções de estabilidade e performance.</p>
					{/if}
				</div>
			</div>

			{#if updating}
				<div class="p-4 rounded-lg bg-[#0d1611] border border-[#22c55e]/30 space-y-2">
					<div class="flex justify-between text-[12px]">
						<span class="text-zinc-200 font-mono">{statusMessage}</span>
						{#if totalBytes > 0}
							<span class="text-[#86efac] font-mono">{((currentBytes / totalBytes) * 100).toFixed(0)}%</span>
						{/if}
					</div>
					<ProgressBar value={totalBytes > 0 ? currentBytes / totalBytes : 0} />
					<small class="text-[11px] text-zinc-400 block text-center">
						O executável será atualizado automaticamente no mesmo diretório sem necessidade de reinstalar.
					</small>
				</div>
			{/if}

			{#if updateError}
				<div class="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-[12px] flex items-center gap-2">
					<AlertCircle size={16} class="shrink-0 text-red-400" />
					<span>{updateError}</span>
				</div>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		{#if !updating}
			<button
				type="button"
				class="px-4 py-2 text-[13px] rounded font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5"
				onclick={remindLater}
			>
				<Clock size={15} />
				<span>Lembrar depois</span>
			</button>
			<PixelButton variant="emerald" icon={ArrowDownCircle} onclick={startUpdate}>
				Atualizar agora
			</PixelButton>
		{/if}
	{/snippet}
</Modal>

<style>
	.font-mc {
		font-family: 'Minecraft', monospace;
	}
</style>
