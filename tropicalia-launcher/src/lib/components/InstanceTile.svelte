<script lang="ts">
	import BlockIcon from './BlockIcon.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import type { Instance } from '$lib/types';
	import { LOADER_LABEL, timeAgo } from '$lib/util/format';
	import { Play } from 'lucide-svelte';

	let { inst, href }: { inst: Instance; href?: string } = $props();
	const running = $derived(!!app.running[inst.id]);
	const busy = $derived(!!app.tasks[inst.id]?.busy);
</script>

<div class="tile">
	<a href={href ?? `/instancias?id=${inst.id}`} class="flex min-w-0 flex-1 items-center gap-3 no-underline">
		<BlockIcon icon={inst.icon} size={40} />
		<span class="min-w-0">
			<b class="font-mc mc-shadow-sm block truncate text-[12px] text-white">{inst.name}</b>
			<small class="tp-muted block truncate text-[11.5px]">{LOADER_LABEL[inst.loader]} {inst.gameVersion} · {timeAgo(inst.lastPlayedAt)}</small>
		</span>
	</a>
	<button
		class="quick"
		class:on={running}
		title={running ? 'Jogando' : 'Jogar'}
		aria-label="Jogar {inst.name}"
		disabled={running || busy}
		onclick={() => app.play(inst).catch(toasts.err)}
	>
		{#if busy}<span class="spin-sq"></span>{:else}<Play size={16} fill="currentColor" />{/if}
	</button>
</div>

<style>
	.tile {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px;
		background: var(--tp-panel-2);
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #000;
	}
	.tile:hover {
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #10b981;
	}
	.quick {
		display: grid;
		place-items: center;
		flex: none;
		width: 36px;
		height: 36px;
		border: 0;
		cursor: pointer;
		color: #fff;
		background: linear-gradient(#16a34a, #15803d);
		box-shadow: inset 0 2px 0 #86efac, inset 2px 0 0 #4ade80, inset -2px 0 0 #052e16, inset 0 -3px 0 #052e16, 0 0 0 2px #000;
	}
	.quick:hover:not(:disabled) {
		filter: brightness(1.15);
	}
	.quick:disabled {
		cursor: default;
		filter: grayscale(0.5);
	}
	.quick.on {
		filter: none;
		animation: pulse 1.4s steps(4) infinite;
	}
	@keyframes pulse {
		50% { box-shadow: inset 0 2px 0 #86efac, inset 2px 0 0 #4ade80, inset -2px 0 0 #052e16, inset 0 -3px 0 #052e16, 0 0 0 2px #000, 0 0 14px #10b981; }
	}
	.spin-sq {
		width: 14px;
		height: 14px;
		border: 3px solid rgba(255, 255, 255, 0.35);
		border-top-color: #fff;
		animation: tp-spin 0.8s steps(8) infinite;
	}
</style>
