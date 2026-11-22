<!-- Mostra um texto com códigos § do Minecraft (cores e estilos), como na lista de servidores. -->
<script lang="ts">
	import { parseMc } from '$lib/util/mc-text';

	let { text = '', defaultColor = '#AAAAAA' }: { text?: string; defaultColor?: string } = $props();
	const lines = $derived(text.split('\n').map((l) => parseMc(l, defaultColor)));
</script>

{#each lines as segs, li (li)}
	<span class="line">
		{#each segs as s, si (si)}<span
				style:color={s.color}
				class:b={s.bold}
				class:i={s.italic}
				class:u={s.underline}
				class:m={s.strike}
				class:k={s.obfuscated}>{s.text}</span
			>{/each}
	</span>
{/each}

<style>
	.line { display: block; white-space: pre-wrap; overflow-wrap: anywhere; }
	.b { font-weight: 700; }
	.i { font-style: italic; }
	.u { text-decoration: underline; }
	.m { text-decoration: line-through; }
	.u.m { text-decoration: underline line-through; }
	.k { filter: blur(2px); }
</style>
