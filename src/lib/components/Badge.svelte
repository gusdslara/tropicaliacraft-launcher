<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		tone = 'muted',
		pixel = false,
		children
	}: { tone?: 'green' | 'gold' | 'blue' | 'purple' | 'red' | 'muted'; pixel?: boolean; children: Snippet } = $props();
</script>

<span class="badge {tone}" class:pixel>{@render children()}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 20px;
		padding: 0 7px;
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
		background: var(--c-bg);
		color: var(--c-fg);
		box-shadow: inset 0 0 0 1px var(--c-line);
	}
	.pixel {
		font-family: var(--font-minecraft);
		font-weight: 400;
		font-size: 9.5px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-shadow: 1px 1px 0 #000;
	}
	.muted { --c-bg: #1b2520; --c-fg: #b6c6bc; --c-line: #2f4237; }
	.green { --c-bg: #0f2a1b; --c-fg: #86efac; --c-line: #1f6b3e; }
	.gold { --c-bg: #2d220b; --c-fg: #fde68a; --c-line: #7a5a12; }
	.blue { --c-bg: #0f1d2e; --c-fg: #93c5fd; --c-line: #1e4b7a; }
	.purple { --c-bg: #231633; --c-fg: #d8b4fe; --c-line: #5b2f86; }
	.red { --c-bg: #2e1111; --c-fg: #fca5a5; --c-line: #7f1d1d; }
</style>
