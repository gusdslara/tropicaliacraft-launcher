<!-- Alavanca liga/desliga estilo pixel. -->
<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		help,
		disabled = false,
		onchange
	}: { checked: boolean; label?: string; help?: string; disabled?: boolean; onchange?: (v: boolean) => void } = $props();
</script>

<label class="row" class:disabled>
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		{disabled}
		class="sw"
		class:on={checked}
		onclick={() => {
			checked = !checked;
			onchange?.(checked);
		}}
	>
		<span class="knob"></span>
	</button>
	{#if label}
		<span class="min-w-0">
			<span class="block text-[13px] font-semibold">{label}</span>
			{#if help}<span class="tp-help block">{help}</span>{/if}
		</span>
	{/if}
</label>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		cursor: pointer;
	}
	.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.sw {
		position: relative;
		flex: none;
		width: 46px;
		height: 24px;
		border: 0;
		padding: 0;
		cursor: inherit;
		background: #2b1414;
		box-shadow: inset 2px 2px 0 #120707, inset -2px -2px 0 #4a2121, 0 0 0 2px #000;
		transition: background 0.1s;
	}
	.sw.on {
		background: #0f5132;
		box-shadow: inset 2px 2px 0 #052e16, inset -2px -2px 0 #1f8a54, 0 0 0 2px #000;
	}
	.knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		background: #8b8b8b url('/images/stone.jpg') center / 64px;
		box-shadow: inset 0 2px 0 #e3e3e3, inset 2px 0 0 #c6c6c6, inset -2px 0 0 #373737, inset 0 -2px 0 #252525;
		transition: transform 0.1s steps(3);
	}
	.on .knob {
		transform: translateX(22px);
	}
	.sw:focus-visible {
		outline: 2px solid var(--tp-emerald);
		outline-offset: 3px;
	}
</style>
