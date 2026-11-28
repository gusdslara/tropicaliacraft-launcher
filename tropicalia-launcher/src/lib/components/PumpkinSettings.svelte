<!-- Configurações do servidor Pumpkin (Rust): edita o pumpkin.toml preservando o resto do arquivo. -->
<script lang="ts">
	import TropicaliaCard from './TropicaliaCard.svelte';
	import PixelButton from './PixelButton.svelte';
	import Toggle from './Toggle.svelte';
	import { toasts } from '$lib/state.svelte';
	import { call, isTauri, openFolder } from '$lib/platform';
	import { PUMPKIN_ADDRESS_KEY, PUMPKIN_DEFAULTS, PUMPKIN_GROUPS, PUMPKIN_PORT_KEY, pumpkinPort } from '$lib/services/server-engines';
	import type { LocalServer } from '$lib/types';
	import { FolderOpen, RotateCcw, Save, TriangleAlert } from 'lucide-svelte';

	let {
		srv,
		live,
		onrestart,
		onsaved
	}: { srv: LocalServer; live: boolean; onrestart?: () => Promise<void>; onsaved?: () => void } = $props();

	type Value = string | number | boolean;
	const FILE = 'pumpkin.toml';
	const FIELDS = PUMPKIN_GROUPS.flatMap((g) => g.fields);
	const KEYS = [...FIELDS.map((f) => f.key).filter((k) => k !== PUMPKIN_PORT_KEY), PUMPKIN_ADDRESS_KEY];

	let original = $state<Record<string, Value>>({});
	let values = $state<Record<string, Value>>({});
	let loadedFor = $state<string | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let needsRestart = $state(false);

	const changed = $derived(FIELDS.map((f) => f.key).filter((k) => values[k] !== original[k]));
	const offline = $derived(values['networking.java.online_mode'] === false);

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
			const file = await call<Record<string, Value>>('server_toml_read', { serverId: id, file: FILE, keys: KEYS });
			const merged: Record<string, Value> = { ...PUMPKIN_DEFAULTS, ...file };
			const view: Record<string, Value> = {};
			for (const f of FIELDS) view[f.key] = f.key === PUMPKIN_PORT_KEY ? Number(pumpkinPort(merged[PUMPKIN_ADDRESS_KEY])) : merged[f.key];
			view[PUMPKIN_ADDRESS_KEY] = merged[PUMPKIN_ADDRESS_KEY];
			original = { ...view };
			values = { ...view };
		} catch (e) {
			toasts.err(e);
		} finally {
			loading = false;
		}
	}

	async function save() {
		saving = true;
		try {
			const payload: Record<string, Value> = {};
			for (const k of changed) {
				const field = FIELDS.find((f) => f.key === k)!;
				let v = values[k];
				if (field.type === 'number') {
					const n = Math.round(Number(v));
					if (!Number.isFinite(n) || (field.min != null && n < field.min) || (field.max != null && n > field.max)) {
						throw new Error(`${field.label}: use um número entre ${field.min} e ${field.max}.`);
					}
					v = n;
				}
				if (k === PUMPKIN_PORT_KEY) {
					// Mantém o IP de bind que já estava no arquivo e troca só a porta.
					const host = String(values[PUMPKIN_ADDRESS_KEY] ?? '').replace(/:\d+$/, '') || '0.0.0.0';
					payload[PUMPKIN_ADDRESS_KEY] = `${host}:${v}`;
				} else {
					payload[k] = v;
				}
			}
			await call('server_toml_write', { serverId: srv.id, file: FILE, values: payload });
			if (payload[PUMPKIN_ADDRESS_KEY]) values[PUMPKIN_ADDRESS_KEY] = payload[PUMPKIN_ADDRESS_KEY];
			original = { ...values };
			needsRestart = live;
			onsaved?.();
			toasts.ok(live ? 'Salvo. Reinicie o servidor para aplicar.' : 'Configurações salvas');
		} catch (e) {
			toasts.err(e);
		} finally {
			saving = false;
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
		{#each PUMPKIN_GROUPS as g (g.id)}
			<TropicaliaCard title={g.title}>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
					{#each g.fields as f (f.key)}
						<div class="min-w-0">
							{#if f.type === 'bool'}
								<Toggle checked={values[f.key] === true} label={f.label} help={f.help} onchange={(v) => (values[f.key] = v)} />
							{:else}
								<label class="tp-label" for="pk-{f.key}">{f.label}</label>
								{#if f.type === 'select'}
									<select id="pk-{f.key}" class="tp-select" value={String(values[f.key] ?? '')} onchange={(e) => (values[f.key] = e.currentTarget.value)}>
										{#each f.options as [v, l] (v)}<option value={v}>{l}</option>{/each}
										{#if values[f.key] && !f.options.some((o) => o[0] === values[f.key])}<option value={String(values[f.key])}>{values[f.key]}</option>{/if}
									</select>
								{:else}
									<input
										id="pk-{f.key}"
										class="tp-input"
										class:font-mono={f.type === 'number'}
										type={f.type}
										inputmode={f.type === 'number' ? 'numeric' : undefined}
										min={f.min}
										max={f.max}
										value={values[f.key] ?? ''}
										oninput={(e) => (values[f.key] = f.type === 'number' ? Number(e.currentTarget.value) : e.currentTarget.value)}
									/>
								{/if}
								{#if f.help}<p class="tp-help">{f.help}</p>{/if}
							{/if}
							<p class="key">{f.key === PUMPKIN_PORT_KEY ? PUMPKIN_ADDRESS_KEY : f.key}{changed.includes(f.key) ? ' · alterado' : ''}</p>
							{#if f.key === 'networking.java.online_mode' && offline}
								<p class="warn"><TriangleAlert size={12} /> Desligado: qualquer um entra com qualquer nick. Ative a whitelist se o servidor for público.</p>
							{/if}
						</div>
					{/each}
				</div>
			</TropicaliaCard>
		{/each}

		<TropicaliaCard title="Arquivo completo">
			<p class="tp-help !mt-0 mb-3">
				O Pumpkin guarda tudo no <code>pumpkin.toml</code> (criado por completo na primeira vez que o servidor inicia). Whitelist, OPs e banimentos ficam em <code>data/</code> e são geridos pelo console.
			</p>
			<PixelButton size="sm" icon={FolderOpen} onclick={() => openFolder('server', srv.id).catch(toasts.err)}>Abrir pasta do servidor</PixelButton>
		</TropicaliaCard>

		<div class="savebar">
			<PixelButton variant="emerald" icon={Save} loading={saving} disabled={!changed.length} onclick={save}>Salvar</PixelButton>
			<PixelButton variant="ghost" icon={RotateCcw} disabled={!changed.length || saving} onclick={() => (values = { ...original })}>Descartar</PixelButton>
			{#if changed.length}<span class="pending">{changed.length} alteração(ões) não salva(s)</span>{/if}
			{#if needsRestart && onrestart}
				<PixelButton size="sm" variant="gold" icon={RotateCcw} onclick={restartNow}>Reiniciar agora</PixelButton>
			{/if}
		</div>
	</div>
{/if}

<style>
	.key { font-family: ui-monospace, monospace; font-size: 11px; color: #5f7368; margin-top: 4px; }
	.warn { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; color: var(--tp-gold); margin-top: 4px; }
	.savebar {
		position: sticky; bottom: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
		background: linear-gradient(transparent, var(--tp-bg) 18px);
	}
	.pending { font-size: 12px; font-weight: 600; color: var(--tp-gold); }
	code { font-family: ui-monospace, monospace; color: #c7d5cc; }
</style>
