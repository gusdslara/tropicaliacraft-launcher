<!-- Abas pixeladas. A aba ativa ganha brilho esmeralda. -->
<script lang="ts">
	import type { Component } from 'svelte';

	type Tab = { id: string; label: string; icon?: any; count?: number; disabled?: boolean };
	let {
		tabs,
		value = $bindable(),
		size = 'md',
		onchange
	}: { tabs: Tab[]; value: string; size?: 'sm' | 'md'; onchange?: (id: string) => void } = $props();
</script>

<div class="tabs {size}" role="tablist">
	{#each tabs as tab (tab.id)}
		{@const Icon = tab.icon as Component<Record<string, unknown>> | undefined}
		<button
			role="tab"
			aria-selected={value === tab.id}
			class:active={value === tab.id}
			disabled={tab.disabled}
			onclick={() => {
				value = tab.id;
				onchange?.(tab.id);
			}}
		>
			{#if Icon}<Icon size={size === 'sm' ? 13 : 15} strokeWidth={2.5} />{/if}
			<span>{tab.label}</span>
			{#if tab.count != null}<em>{tab.count}</em>{/if}
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 34px;
		padding: 0 12px;
		border: 0;
		cursor: pointer;
		font-family: var(--font-minecraft);
		font-size: 11px;
		letter-spacing: 0.04em;
		color: #c9d6ce;
		text-shadow: 1px 1px 0 #000;
		background: var(--tp-panel-2);
		box-shadow:
			inset 0 2px 0 0 #2f3d36,
			inset 2px 0 0 0 #2f3d36,
			inset -2px 0 0 0 #0a0e0c,
			inset 0 -2px 0 0 #0a0e0c,
			0 0 0 2px #000;
		transition: filter 0.08s, color 0.08s;
	}
	.sm button {
		height: 28px;
		padding: 0 9px;
		font-size: 10px;
	}
	button:hover:not(:disabled) {
		filter: brightness(1.25);
		color: #fff;
	}
	button.active {
		color: #fff;
		background: linear-gradient(#16a34a, #15803d);
		box-shadow:
			inset 0 2px 0 0 #86efac,
			inset 2px 0 0 0 #4ade80,
			inset -2px 0 0 0 #052e16,
			inset 0 -2px 0 0 #052e16,
			0 0 0 2px #000,
			0 0 14px rgba(16, 185, 129, 0.35);
	}
	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	em {
		font-style: normal;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 10px;
		font-weight: 700;
		padding: 1px 5px;
		background: rgba(0, 0, 0, 0.35);
		text-shadow: none;
	}
</style>
