<!-- Janela estilo Minecraft com faixa de bloco de grama no topo (igual ao .tp-card da landing). -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		size = 'md',
		plain = false,
		class: klass = '',
		actions,
		children
	}: {
		title?: string;
		subtitle?: string;
		size?: 'sm' | 'md' | 'lg';
		plain?: boolean;
		class?: string;
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<section class="tp-card {size} {plain ? 'plain' : ''} {klass}">
	{#if title || actions}
		<header class="mb-3 flex items-center justify-between gap-3">
			<div class="min-w-0">
				{#if title}<h2 class="font-mc mc-shadow truncate text-[13px] text-white">{title}</h2>{/if}
				{#if subtitle}<p class="tp-muted mt-1 truncate text-xs">{subtitle}</p>{/if}
			</div>
			{#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
		</header>
	{/if}
	{@render children?.()}
</section>

<style>
	section {
		padding: 16px;
	}
	section.lg {
		padding: 20px;
	}
	section.sm {
		padding: 12px;
	}
</style>
