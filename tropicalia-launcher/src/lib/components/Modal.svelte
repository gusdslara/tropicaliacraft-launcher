<script lang="ts">
    import { tr } from '$lib/ui-text';
	import type { Snippet } from 'svelte';
	import { detectLanguage } from '$lib/i18n';
	import { X } from 'lucide-svelte';
	import { beforeNavigate, goto } from '$app/navigation';

	let {
		open = $bindable(false),
		title,
		width = 560,
		dismissable = true,
		onclose,
        oncancel,
        dirty = false,
        onsave,
		children,
		footer
	}: {
		open: boolean;
		title: string;
		width?: number;
		dismissable?: boolean;
		onclose?: () => void;
        oncancel?: () => void;
        dirty?: boolean;
        onsave?: () => Promise<void>;
		children: Snippet;
		footer?: Snippet;
	} = $props();

    let confirming = $state(false);
    let saving = $state(false);
	let backdrop = $state<HTMLDivElement>();
	let pendingUrl: string | null = null;
	function exited() {
		open = false; onclose?.();
		if (pendingUrl) { const url = pendingUrl; pendingUrl = null; void goto(url); }
	}
	beforeNavigate((navigation) => {
		if (!open || (!dirty && !saving)) return;
		navigation.cancel();
		pendingUrl = navigation.to?.url.href ?? null;
		if (!saving) confirming = true;
	});
    $effect(() => { if (!open) confirming = false; });
    const labels = {pt: ['Alterações não salvas', 'Sair sem salvar', 'Salvar e sair', 'Cancelar'], en: ['Unsaved changes', 'Exit without saving', 'Save and exit', 'Cancel'], es: ['Cambios sin guardar', 'Salir sin guardar', 'Guardar y salir', 'Cancelar']}[detectLanguage()];
    async function saveAndExit() {
        saving = true;
        try { await onsave?.(); confirming = false; exited(); }
        catch { /* The form reports the failure; keep the draft open. */ }
        finally { saving = false; }
    }
	export function close() {
		if (!dismissable || saving) return;
		if (dirty) { confirming = true; return; }
		exited();
	}
</script>

<svelte:window onkeydown={(e) => {
    if (!open || document.querySelectorAll('[data-modal]').item(document.querySelectorAll('[data-modal]').length - 1) !== backdrop) return;
    if (e.key === 'Escape') { e.preventDefault(); if (confirming) { confirming = false; pendingUrl = null; oncancel?.(); } else close(); }
}} onbeforeunload={(e) => { if (open && dirty) { e.preventDefault(); e.returnValue = ''; } }} />

{#if open}
	<div class="backdrop" data-modal bind:this={backdrop} role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
		<div class="tp-card lg dialog pop" style="width: min({width}px, 94vw)" role="dialog" aria-modal="true" aria-label={title}>
			<header class="mb-4 flex items-center justify-between gap-3">
				<h2 class="font-mc mc-shadow text-[15px] text-white">{title}</h2>
				{#if dismissable && !confirming}
					<button class="close" onclick={close} aria-label={tr("Fechar")}><X size={18} /></button>
				{/if}
			</header>
			{#if confirming}
                <div role="alertdialog" aria-label={labels[0]} class="confirmation">
                    <p>{labels[0]}</p>
                    <button disabled={saving} onclick={() => { confirming = false; exited(); }}>{labels[1]}</button>
                    {#if onsave}<button disabled={saving} onclick={saveAndExit}>{labels[2]}</button>{/if}
                    <button disabled={saving} onclick={() => { confirming = false; pendingUrl = null; oncancel?.(); }}>{labels[3]}</button>
                </div>
            {:else}
                <div class="body">{@render children()}</div>
            {/if}
			{#if footer && !confirming}
				<footer class="mt-5 flex flex-wrap items-center justify-end gap-3">{@render footer()}</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
 .confirmation { display: flex; flex-wrap: wrap; gap: 12px; }
 .confirmation p { width: 100%; }
 .confirmation button { padding: 12px; border: 1px solid #4ade80; color: white; background: #14231b; }
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: grid;
		place-items: center;
		background: rgba(3, 6, 5, 0.72);
		backdrop-filter: blur(2px);
	}
	.dialog {
		max-height: 90dvh;
        min-width: 0;
        box-sizing: border-box;
		display: flex;
		flex-direction: column;
		padding: 20px 22px 22px;
	}
	@media (max-width: 640px) {
		.dialog {
			padding: 16px 14px 16px;
			max-height: 92dvh;
		}
	}
	.body {
		overflow: auto;
		min-height: 0;
		margin: 0 -4px;
		padding: 0 4px;
	}
	.close {
		display: grid;
		place-items: center;
		width: 44px;
        flex-shrink: 0;
		height: 44px;
		border: 0;
		background: transparent;
		color: var(--tp-muted);
		cursor: pointer;
	}
	.close:hover {
		color: #fff;
		background: var(--tp-panel-2);
	}
</style>
