<!-- Barra de progresso estilo barra de XP. -->
<script lang="ts">
	let { value = 0, indeterminate = false, label, detail }: { value?: number; indeterminate?: boolean; label?: string; detail?: string } = $props();
	const pct = $derived(Math.max(0, Math.min(1, value)) * 100);
</script>

<div class="wrap">
	{#if label || detail}
		<div class="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
			<span class="font-mc mc-shadow-sm text-[11px] text-[#bef264]">{label}</span>
			{#if detail}<span class="tp-muted truncate font-mono text-[11px]">{detail}</span>{/if}
		</div>
	{/if}
	<div class="bar" class:indeterminate role="progressbar" aria-valuenow={indeterminate ? undefined : Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
		<span style="width: {indeterminate ? 35 : pct}%"></span>
	</div>
</div>

<style>
	.bar {
		position: relative;
		height: 12px;
		overflow: hidden;
		background: #0b100e;
		box-shadow: inset 2px 2px 0 #000, inset -2px -2px 0 #1d2a23, 0 0 0 2px #000;
	}
	.bar span {
		position: absolute;
		inset: 2px auto 2px 2px;
		max-width: calc(100% - 4px);
		background:
			repeating-linear-gradient(90deg, transparent 0 14px, rgba(0, 0, 0, 0.35) 14px 16px),
			linear-gradient(#a3e635, #65a30d);
		box-shadow: inset 0 2px 0 #d9f99d;
		transition: width 0.25s steps(8);
	}
	.indeterminate span {
		animation: slide 1.1s steps(18) infinite;
	}
	@keyframes slide {
		from { left: -35%; }
		to { left: 100%; }
	}
</style>
