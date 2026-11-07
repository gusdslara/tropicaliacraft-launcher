<!-- Console em tempo real (servidor ou logs do jogo) com cores por nível e linha de comando opcional. -->
<script lang="ts">
	import { tick } from 'svelte';
	import { Send } from 'lucide-svelte';

	let {
		lines,
		height = 360,
		oncommand,
		placeholder = 'Digite um comando (ex.: op Steve, time set day, say Olá!)',
		empty = 'Nada por aqui ainda.'
	}: { lines: string[]; height?: number; oncommand?: (cmd: string) => void; placeholder?: string; empty?: string } = $props();

	let box: HTMLDivElement | undefined = $state();
	let follow = $state(true);
	let cmd = $state('');
	let history: string[] = [];
	let hIndex = -1;

	$effect(() => {
		void lines.length;
		if (follow && box) tick().then(() => box && (box.scrollTop = box.scrollHeight));
	});

	function level(line: string) {
		if (/\b(ERROR|FATAL|SEVERE)\b|Exception|at [\w.$]+\(/.test(line)) return 'err';
		if (/\bWARN(ING)?\b/.test(line)) return 'warn';
		if (/joined the game|Done \(/.test(line)) return 'ok';
		if (/left the game/.test(line)) return 'dim';
		return '';
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const c = cmd.trim();
		if (!c) return;
		oncommand?.(c);
		history.unshift(c);
		hIndex = -1;
		cmd = '';
		follow = true;
	}

	function keys(e: KeyboardEvent) {
		if (e.key === 'ArrowUp' && history.length) {
			hIndex = Math.min(hIndex + 1, history.length - 1);
			cmd = history[hIndex];
			e.preventDefault();
		} else if (e.key === 'ArrowDown') {
			hIndex = Math.max(hIndex - 1, -1);
			cmd = hIndex < 0 ? '' : history[hIndex];
			e.preventDefault();
		}
	}
</script>

<div class="console tp-slot">
	<div
		bind:this={box}
		class="lines selectable"
		style="height:{height}px"
		onscroll={() => box && (follow = box.scrollHeight - box.scrollTop - box.clientHeight < 30)}
	>
		{#each lines as line, i (i)}
			<div class="l {level(line)}">{line.replace(/\u001b\[[0-9;]*m/g, '')}</div>
		{:else}
			<div class="l dim">{empty}</div>
		{/each}
	</div>
	{#if oncommand}
		<form class="cmd" onsubmit={submit}>
			<span class="font-mc text-[#4ade80]">&gt;</span>
			<input bind:value={cmd} {placeholder} onkeydown={keys} spellcheck="false" autocomplete="off" />
			<button type="submit" aria-label="Enviar"><Send size={15} /></button>
		</form>
	{/if}
</div>

<style>
	.console {
		display: flex;
		flex-direction: column;
	}
	.lines {
		overflow: auto;
		padding: 10px 12px;
		font-family: var(--font-mono);
		font-size: 12px;
		line-height: 1.5;
		color: #cfdcd3;
		background: #070a09;
	}
	.l {
		white-space: pre-wrap;
		word-break: break-all;
	}
	.err { color: #fca5a5; }
	.warn { color: #fde68a; }
	.ok { color: #86efac; }
	.dim { color: #6b7f73; }
	.cmd {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		border-top: 2px solid #000;
		background: #0b100e;
	}
	.cmd input {
		flex: 1;
		height: 38px;
		border: 0;
		outline: none;
		background: transparent;
		color: #fff;
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	.cmd button {
		border: 0;
		background: none;
		color: var(--tp-muted);
		cursor: pointer;
	}
	.cmd button:hover { color: #4ade80; }
</style>
