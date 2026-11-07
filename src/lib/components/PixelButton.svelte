<!-- Botão pixelado estilo Minecraft (pedra, esmeralda, ouro, perigo, fantasma). -->
<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { LoaderCircle } from 'lucide-svelte';

	let {
		variant = 'stone',
		size = 'md',
		icon,
		loading = false,
		disabled = false,
		type = 'button',
		title,
		class: klass = '',
		onclick,
		children
	}: {
		variant?: 'stone' | 'emerald' | 'gold' | 'danger' | 'ghost';
		size?: 'xs' | 'sm' | 'md' | 'play';
		icon?: Component<Record<string, unknown>> | (new (...a: any[]) => any);
		loading?: boolean;
		disabled?: boolean;
		type?: 'button' | 'submit';
		title?: string;
		class?: string;
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
	} = $props();

	const iconSize = $derived(size === 'play' ? 30 : size === 'xs' ? 12 : size === 'sm' ? 14 : 16);
	const Icon = $derived(icon as any);
	const isIconOnly = $derived(!children);
</script>

<button
	{type}
	{title}
	aria-label={title}
	class="px-btn {variant === 'stone' ? '' : variant} {size === 'md' ? '' : size} {isIconOnly ? 'icon' : ''} {klass}"
	disabled={disabled || loading}
	aria-busy={loading}
	{onclick}
>
	{#if loading}
		<LoaderCircle size={iconSize} class="spin" />
	{:else if Icon}
		<Icon size={iconSize} strokeWidth={2.5} />
	{/if}
	{@render children?.()}
</button>
