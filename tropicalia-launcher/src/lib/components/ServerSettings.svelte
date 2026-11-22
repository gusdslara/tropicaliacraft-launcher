<!-- server.properties completo do servidor local: MOTD com cores e prévia, ícone, todos os grupos e chaves extras. -->
<script lang="ts">
	import TropicaliaCard from './TropicaliaCard.svelte';
	import PixelButton from './PixelButton.svelte';
	import Toggle from './Toggle.svelte';
	import McText from './McText.svelte';
	import { toasts } from '$lib/state.svelte';
	import { call, isTauri } from '$lib/platform';
	import { MINECRAFT_DEFAULTS, PROPERTY_GROUPS, type PropertyField } from '$lib/services/server-engines';
	import { MC_COLORS, MC_COLOR_NAMES, MC_STYLES, stripMc } from '$lib/util/mc-text';
	import type { LocalServer } from '$lib/types';
	import { ImagePlus, Plus, RotateCcw, Save, Search, TriangleAlert } from 'lucide-svelte';

	let {
		srv,
		live,
		onrestart
	}: { srv: LocalServer; live: boolean; onrestart?: () => Promise<void> } = $props();

	let original = $state<Record<string, string>>({});
	let values = $state<Record<string, string>>({});
	let loadedFor = $state<string | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let needsRestart = $state(false);
	let iconUrl = $state<string | null>(null);
	let filter = $state('');
	let newKey = $state('');
	let newValue = $state('');
	let motdEl = $state<HTMLTextAreaElement | null>(null);

	const KNOWN = new Set(['motd', ...PROPERTY_GROUPS.flatMap((g) => g.fields.map((f) => f.key))]);
	const changed = $derived(
		new Set([...new Set([...Object.keys(values), ...Object.keys(original)])].filter((k) => (values[k] ?? '') !== (original[k] ?? '')))
	);
	const otherKeys = $derived(Object.keys(values).filter((k) => !KNOWN.has(k)).sort());
	const q = $derived(filter.trim().toLowerCase());
	const matches = (f: PropertyField) => !q || f.label.toLowerCase().includes(q) || f.key.includes(q);
	const motdLines = $derived((values.motd ?? '').split('\n'));

	$effect(() => {
		const id = srv.id;
		if (loadedFor === id) return;
		loadedFor = id;
		load(id);
	});

	async function load(id: string) {
		loading = true;
		needsRestart = false;
		try {
			if (!isTauri) return;
			// O Rust já devolve o \n do MOTD como quebra de linha real (e grava de volta como \n).
			const p = await call<Record<string, string>>('server_read_properties', { serverId: id });
			original = { ...p };
			values = { ...p };
			loadIcon(id);
		} catch (e) {
			toasts.err(e);
		} finally {
			loading = false;
		}
	}

	async function loadIcon(id: string) {
		if (iconUrl) URL.revokeObjectURL(iconUrl);
		iconUrl = null;
		const bytes = await call<number[] | null>('server_read_icon', { serverId: id }).catch(() => null);
		if (bytes?.length) iconUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
	}

	const val = (k: string) => values[k] ?? MINECRAFT_DEFAULTS[k] ?? '';
	const set = (k: string, v: string) => (values[k] = v);

	function insertCode(code: string) {
		const el = motdEl;
		const text = values.motd ?? '';
		const start = el?.selectionStart ?? text.length;
		const end = el?.selectionEnd ?? text.length;
		// Com um trecho selecionado, pinta só ele e volta ao estilo de antes depois (§r).
		const insert = start !== end ? `§${code}${text.slice(start, end)}§r` : `§${code}`;
		values.motd = text.slice(0, start) + insert + text.slice(end);
		requestAnimationFrame(() => {
			el?.focus();
			const pos = start + insert.length;
			el?.setSelectionRange(pos, pos);
		});
	}

	function onMotdInput(e: Event) {
		// No máximo 2 linhas, como a lista de servidores mostra.
		const v = (e.currentTarget as HTMLTextAreaElement).value.split('\n').slice(0, 2).join('\n');
		values.motd = v;
	}

	function addKey() {
		const k = newKey.trim();
		if (!/^[a-zA-Z0-9._-]+$/.test(k)) return toasts.err(new Error('Chave inválida: use letras, números, ponto, hífen ou _.'));
		values[k] = newValue;
		newKey = '';
		newValue = '';
	}

	function discard() {
		values = { ...original };
	}

	async function save() {
		saving = true;
		try {
			const payload: Record<string, string> = {};
			for (const k of changed) payload[k] = values[k] ?? '';
			await call('server_write_properties', { serverId: srv.id, values: payload });
			original = { ...values };
			needsRestart = live;
			toasts.ok(live ? 'Salvo. Reinicie o servidor para aplicar.' : 'Configurações salvas');
		} catch (e) {
			toasts.err(e);
		} finally {
			saving = false;
		}
	}

	async function pickIcon(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const png = await resizeTo64(file);
			await call('server_write_icon', { serverId: srv.id, png: Array.from(new Uint8Array(await png.arrayBuffer())) });
			await loadIcon(srv.id);
			toasts.ok(live ? 'Ícone salvo. Aparece após reiniciar.' : 'Ícone salvo');
		} catch (err) {
			toasts.err(err);
		}
	}

	async function resizeTo64(file: File): Promise<Blob> {
		const url = URL.createObjectURL(file);
		try {
			const img = new Image();
			img.src = url;
			await img.decode();
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 64;
			const ctx = canvas.getContext('2d')!;
			ctx.imageSmoothingEnabled = !(img.width <= 64 && img.height <= 64); // pixel art pequena fica nítida
			const s = Math.max(64 / img.width, 64 / img.height);
			ctx.drawImage(img, (64 - img.width * s) / 2, (64 - img.height * s) / 2, img.width * s, img.height * s);
			return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao gerar PNG'))), 'image/png'));
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	async function restartNow() {
		if (!onrestart) return;
		await onrestart();
		needsRestart = false;
	}
</script>

{#if !isTauri}
	<TropicaliaCard><p class="tp-muted text-[13px]">Disponível no app instalado.</p></TropicaliaCard>
{:else if loading}
	<TropicaliaCard><p class="tp-muted text-[13px]">Carregando configurações…</p></TropicaliaCard>
{:else}
	<div class="flex flex-col gap-5">
		<!-- MOTD + prévia + ícone -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
			<TropicaliaCard title="MOTD">
				<p class="tp-help !mt-0 mb-3">Mensagem na lista de servidores (até 2 linhas). Selecione um trecho e toque numa cor para pintar só ele.</p>
				<div class="palette" role="toolbar" aria-label="Cores e estilos do MOTD">
					{#each Object.entries(MC_COLORS) as [code, hex] (code)}
						<button type="button" class="sw" style:background={hex} title="{MC_COLOR_NAMES[code]} (§{code})" aria-label={MC_COLOR_NAMES[code]} onclick={() => insertCode(code)}></button>
					{/each}
					{#each MC_STYLES as s (s.code)}
						<button type="button" class="st" title="{s.title} (§{s.code})" aria-label={s.title} onclick={() => insertCode(s.code)}>{s.label}</button>
					{/each}
				</div>
				<textarea
					bind:this={motdEl}
					class="tp-input mt-3 font-mono text-[13px]"
					rows="2"
					value={values.motd ?? ''}
					oninput={onMotdInput}
					placeholder="§aServidor §6Tropicalia&#10;§fVenha jogar!"
					aria-label="MOTD"
				></textarea>
				<p class="tp-help">{motdLines.map((l) => stripMc(l).length).join(' + ')} caracteres visíveis{changed.has('motd') ? ' · alterado' : ''}</p>
			</TropicaliaCard>

			<TropicaliaCard title="Prévia">
				<div class="serverlist">
					<div class="entry">
						{#if iconUrl}<img src={iconUrl} alt="Ícone do servidor" class="pixel" />{:else}<div class="ph" aria-hidden="true"></div>{/if}
						<div class="min-w-0 flex-1">
							<div class="name truncate">{srv.name}</div>
							<div class="motd"><McText text={values.motd || 'A Minecraft Server'} /></div>
						</div>
						<div class="count">0/{val('max-players')}</div>
					</div>
				</div>
				<label class="icon-btn mt-3">
					<ImagePlus size={15} /> Trocar ícone
					<input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" onchange={pickIcon} />
				</label>
				<p class="tp-help">Qualquer imagem: o launcher converte para 64×64 PNG.</p>
			</TropicaliaCard>
		</div>

		<div class="relative">
			<Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f7368]" />
			<input class="tp-input !pl-9" placeholder="Buscar configuração (ex.: pvp, whitelist, seed)" bind:value={filter} aria-label="Buscar configuração" />
		</div>

		{#each PROPERTY_GROUPS as g (g.id)}
			{@const fields = g.fields.filter(matches)}
			{#if fields.length}
				<TropicaliaCard title={g.title}>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
						{#each fields as f (f.key)}
							<div class="min-w-0">
								{#if f.type === 'bool'}
									<Toggle checked={val(f.key) === 'true'} label={f.label} help={f.help} onchange={(v) => set(f.key, String(v))} />
								{:else}
									<label class="tp-label" for="p-{f.key}">{f.label}</label>
									{#if f.type === 'select'}
										<select id="p-{f.key}" class="tp-select" value={val(f.key)} onchange={(e) => set(f.key, e.currentTarget.value)}>
											{#each f.options as [v, l] (v)}<option value={v}>{l}</option>{/each}
											{#if values[f.key] && !f.options.some((o) => o[0] === values[f.key])}<option value={values[f.key]}>{values[f.key]}</option>{/if}
										</select>
									{:else}
										<input
											id="p-{f.key}"
											class="tp-input"
											class:font-mono={f.type === 'number'}
											type={f.type}
											inputmode={f.type === 'number' ? 'numeric' : undefined}
											min={f.min}
											max={f.max}
											value={values[f.key] ?? ''}
											placeholder={MINECRAFT_DEFAULTS[f.key] ?? ''}
											oninput={(e) => set(f.key, e.currentTarget.value)}
										/>
									{/if}
									{#if f.help}<p class="tp-help">{f.help}</p>{/if}
								{/if}
								<p class="key">{f.key}{changed.has(f.key) ? ' · alterado' : ''}</p>
								{#if f.warn?.(val(f.key))}<p class="warn"><TriangleAlert size={12} /> {f.warn(val(f.key))}</p>{/if}
							</div>
						{/each}
					</div>
				</TropicaliaCard>
			{/if}
		{/each}

		{#if !q || otherKeys.some((k) => k.includes(q))}
			<TropicaliaCard title="Outras chaves">
				<p class="tp-help !mt-0 mb-3">Tudo que está no server.properties e não tem campo acima ({otherKeys.length}).</p>
				<div class="flex flex-col gap-2">
					{#each otherKeys.filter((k) => !q || k.includes(q)) as k (k)}
						<div class="kv">
							<label class="font-mono text-[12px] text-[#c7d5cc] truncate" for="o-{k}" title={k}>{k}</label>
							<input id="o-{k}" class="tp-input font-mono" value={values[k] ?? ''} oninput={(e) => set(k, e.currentTarget.value)} />
						</div>
					{/each}
					<form class="kv" onsubmit={(e) => { e.preventDefault(); addKey(); }}>
						<input class="tp-input font-mono" placeholder="nova-chave" bind:value={newKey} aria-label="Nova chave" />
						<div class="flex gap-2 min-w-0">
							<input class="tp-input font-mono flex-1" placeholder="valor" bind:value={newValue} aria-label="Valor" />
							<PixelButton size="sm" icon={Plus} type="submit" disabled={!newKey.trim()}>Adicionar</PixelButton>
						</div>
					</form>
				</div>
			</TropicaliaCard>
		{/if}

		<div class="savebar">
			<PixelButton variant="emerald" icon={Save} loading={saving} disabled={!changed.size} onclick={save}>
				Salvar{changed.size ? ` (${changed.size})` : ''}
			</PixelButton>
			<PixelButton variant="ghost" icon={RotateCcw} disabled={!changed.size} onclick={discard}>Descartar</PixelButton>
			{#if needsRestart && onrestart}
				<span class="pending">Reinicie para aplicar</span>
				<PixelButton size="sm" variant="gold" onclick={restartNow}>Reiniciar agora</PixelButton>
			{/if}
		</div>
	</div>
{/if}

<style>
	.palette { display: flex; flex-wrap: wrap; gap: 6px; }
	.sw, .st {
		width: 30px; height: 30px; border: 0; cursor: pointer; flex: none;
		box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 0 rgba(0, 0, 0, 0.35), 0 0 0 2px #000;
	}
	.st { background: var(--tp-panel-2); color: #fff; font-weight: 700; font-size: 13px; }
	.sw:hover, .st:hover, .sw:focus-visible, .st:focus-visible { outline: 2px solid var(--tp-emerald); outline-offset: 2px; }
	@media (pointer: coarse) { .sw, .st { width: 36px; height: 36px; } }
	.serverlist { background: #000 url('/images/dirt.png'); background-size: 64px; padding: 10px; image-rendering: pixelated; }
	.entry { display: flex; gap: 10px; align-items: flex-start; background: rgba(0, 0, 0, 0.55); padding: 6px; font-family: var(--font-minecraft); font-size: 13px; line-height: 1.35; }
	.entry img, .entry .ph { width: 52px; height: 52px; flex: none; }
	.entry .ph { background: #2a2a2a; box-shadow: inset 0 0 0 2px #444; }
	.entry .name { color: #fff; }
	/* Como no jogo: cada linha do MOTD numa linha só, cortada se passar da largura. */
	.entry .motd { overflow: hidden; }
	.entry .motd :global(.line) { white-space: pre; overflow: hidden; text-overflow: clip; }
	.entry .count { color: #aaa; flex: none; }
	.icon-btn {
		display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; cursor: pointer; font-size: 13px; font-weight: 600;
		background: var(--tp-panel-2); box-shadow: inset 0 2px 0 var(--bevel-hi), inset 0 -2px 0 var(--bevel-lo), 0 0 0 2px #000;
	}
	.icon-btn:focus-within { outline: 2px solid var(--tp-emerald); outline-offset: 2px; }
	.key { font-family: ui-monospace, monospace; font-size: 11px; color: #5f7368; margin-top: 4px; }
	.warn { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; color: var(--tp-gold); margin-top: 4px; }
	.kv { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 8px; align-items: center; }
	@media (max-width: 560px) { .kv { grid-template-columns: 1fr; gap: 4px; } }
	.savebar {
		position: sticky; bottom: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
		background: linear-gradient(transparent, var(--tp-bg) 18px);
	}
	.pending { font-size: 12px; font-weight: 600; color: var(--tp-gold); }
</style>
