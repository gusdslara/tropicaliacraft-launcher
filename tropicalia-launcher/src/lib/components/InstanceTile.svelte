<script lang="ts">
    import { tr } from '$lib/ui-text';
	import BlockIcon from './BlockIcon.svelte';
	import Badge from './Badge.svelte';
	import PixelButton from './PixelButton.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import type { Instance } from '$lib/types';
	import { DEFAULT_LOADER_ICON, LOADER_LABEL, LOADER_TONE, timeAgo } from '$lib/util/format';
	import { Play, Settings2 } from 'lucide-svelte';

	let {
		inst,
		onconfig,
		onmods
	}: {
		inst: Instance;
		onconfig?: (inst: Instance) => void;
		onmods?: (inst: Instance) => void;
	} = $props();
	const running = $derived(!!app.running[inst.id]);
	const busy = $derived(!!app.tasks[inst.id]?.busy || !!app.contentOperations[inst.id]);
</script>

<div class="tile">
	<div class="flex min-w-0 flex-1 items-center gap-3">
		<BlockIcon icon={inst.icon || DEFAULT_LOADER_ICON[inst.loader]} size={42} />
		<div class="min-w-0 flex-1">
			<b class="font-mc mc-shadow-sm block truncate text-[12.5px] text-white">{inst.name}</b>
			<div class="mt-1 flex flex-wrap items-center gap-1.5">
				<Badge tone={LOADER_TONE[inst.loader] ?? 'green'} pixel>{LOADER_LABEL[inst.loader] ?? inst.loader}</Badge>
				<Badge tone="blue" pixel>{inst.gameVersion}</Badge>
				<small class="tp-muted truncate text-[11px]">· {timeAgo(inst.lastPlayedAt)}</small>
			</div>
		</div>
	</div>
	<div class="flex shrink-0 items-center gap-2">
		<PixelButton
			size="sm"
			icon={Settings2}
			title="Configurar {inst.name}"
			onclick={() => onconfig?.(inst)}
		/>
		<PixelButton
			size="sm"
			title="Mods de {inst.name}"
			onclick={() => onmods?.(inst)}
		>
			MODS
		</PixelButton>
		<button
			class="quick"
			class:on={running}
			title={running ? 'Jogando' : tr("Jogar")}
			aria-label="Jogar {inst.name}"
			disabled={running || busy}
			onclick={() => app.play(inst).catch(toasts.err)}
		>
			{#if busy}<span class="spin-sq"></span>{:else}<Play size={16} fill="currentColor" />{/if}
		</button>
	</div>
</div>

<style>
	.tile {
		display: flex;
        flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		padding: 10px;
		background: var(--tp-panel-2);
		box-shadow: inset 0 2px 0 #2f3d36, inset 2px 0 0 #2f3d36, inset -2px 0 0 #0a0e0c, inset 0 -2px 0 #0a0e0c, 0 0 0 2px #000;
	}
    .tile > :global(div:first-child) { flex-basis: 160px; }
    .tile > :global(div:last-child) { margin-left: auto; }
    @media (max-width: 480px) {
        .tile { flex-wrap: wrap; }
        .tile > :global(div:last-child) { margin-left: auto; }
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
