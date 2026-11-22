<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';

	let {
		open = $bindable(false),
		title,
		width = 560,
		dismissable = true,
		onclose,
		children,
		footer
	}: {
		open: boolean;
		title: string;
		width?: number;
		dismissable?: boolean;
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	function close() {
		if (!dismissable) return;
		open = false;
		onclose?.();
	}
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
	<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
		<div class="tp-card lg dialog pop" style="width: min({width}px, 94vw)" role="dialog" aria-modal="true" aria-label={title}>
			<header class="mb-4 flex items-center justify-between gap-3">
				<h2 class="font-mc mc-shadow text-[15px] text-white">{title}</h2>
				{#if dismissable}
					<button class="close" onclick={close} aria-label="Fechar"><X size={18} /></button>
				{/if}
			</header>
			<div class="body">{@render children()}</div>
			{#if footer}
				<footer class="mt-5 flex flex-wrap items-center justify-end gap-3">{@render footer()}</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		background: rgba(3, 6, 5, 0.72);
		backdrop-filter: blur(2px);
	}
	.dialog {
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		padding: 20px 22px 22px;
	}
	@media (max-width: 640px) {
		.dialog {
			padding: 16px 14px 16px;
			max-height: 92vh;
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
		width: 30px;
		height: 30px;
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
