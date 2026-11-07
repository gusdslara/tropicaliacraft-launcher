<script lang="ts">
	import { toasts } from '$lib/state.svelte';
	import { CircleCheck, CircleAlert, Info, X } from 'lucide-svelte';
</script>

<div class="stack" aria-live="polite">
	{#each toasts.list as t (t.id)}
		<div class="toast pop {t.kind}">
			{#if t.kind === 'ok'}<CircleCheck size={18} />{:else if t.kind === 'err'}<CircleAlert size={18} />{:else}<Info size={18} />{/if}
			<p class="selectable">{t.text}</p>
			<button onclick={() => toasts.dismiss(t.id)} aria-label="Fechar"><X size={14} /></button>
		</div>
	{/each}
</div>

<style>
	.stack {
		position: fixed;
		right: 18px;
		bottom: 18px;
		z-index: 60;
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: min(420px, calc(100vw - 36px));
	}
	.toast {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 11px 12px;
		background: var(--tp-panel);
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #000, 0 8px 24px rgba(0, 0, 0, 0.5);
		border-left: 4px solid var(--c);
		font-size: 13px;
	}
	.toast :global(svg) {
		flex: none;
		color: var(--c);
		margin-top: 1px;
	}
	p {
		flex: 1;
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
	button {
		border: 0;
		background: none;
		color: var(--tp-muted);
		cursor: pointer;
		padding: 2px;
	}
	.ok { --c: var(--tp-green); }
	.err { --c: var(--tp-red); }
	.info { --c: var(--tp-blue); }
</style>
