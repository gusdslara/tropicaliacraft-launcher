<script lang="ts">
	import { BLOCK_ICONS } from '$lib/util/format';
	import type { BlockIcon } from '$lib/types';
	let { icon = 'creeper', size = 44 }: { icon?: BlockIcon; size?: number } = $props();
	const contain = $derived(icon === 'creeper');
</script>

<span class="block-icon" style="width:{size}px;height:{size}px">
	<img class="pixel" src={BLOCK_ICONS[icon] ?? BLOCK_ICONS.creeper} alt="" style="object-fit:{contain ? 'contain' : 'cover'}" />
</span>

<style>
	.block-icon {
		display: inline-block;
		flex: none;
		background: #0b100e;
		box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08), 0 0 0 2px #000;
		overflow: hidden;
	}
	img {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
