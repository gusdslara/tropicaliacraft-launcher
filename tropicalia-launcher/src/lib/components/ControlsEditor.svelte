<script lang="ts">
    import { tr } from '$lib/ui-text';
	import { onDestroy, onMount } from 'svelte';
	import { Eye, EyeOff, PanelRightClose, PanelRightOpen, RotateCcw, Save, X, Grid3x3 } from 'lucide-svelte';
	import PixelButton from './PixelButton.svelte';
	import Toggle from './Toggle.svelte';
    import Modal from './Modal.svelte';
    import { detectLanguage } from '$lib/i18n';
    import { beforeNavigate, goto } from '$app/navigation';
    import { listLayouts, publishLayout, parseLayout, type OnlineLayout } from '$lib/services/layouts';
    const language = detectLanguage();
    const text = (pt: string, en: string, es: string) => ({pt, en, es})[language];

	import { app, toasts } from '$lib/state.svelte';
	import { call, isTauri } from '$lib/platform';
	import { PIXEL_ICONS } from '$lib/data/pixelarticons';
	import {
		CONTROL_IDS, CONTROL_LABELS, STYLE_PRESETS, clampPos, clampSize, defaultControls, drawControl, fitControl,
		landscapeAspect, normalizeControls, type ControlId, type ControlsConfig, type Shape
	} from '$lib/controls';

	/** `embedded`: rendered as a launcher tab instead of a full-screen dialog. */
	let { onclose, embedded = false }: { onclose?: () => void; embedded?: boolean } = $props();

	let draft = $state<ControlsConfig>(structuredClone(normalizeControls(app.settings.controls)));
	let selected = $state<ControlId | null>('jump');
	let panelOpen = $state(true);
	let snap = $state(true);
	let tab = $state<'botao' | 'aparencia'>('botao');
	let saving = $state(false);
    let baseline = $state(JSON.stringify(normalizeControls(app.settings.controls)));
    const dirty = $derived(JSON.stringify(draft) !== baseline);
    let confirmExit = $state(false);
    let libraryOpen = $state(false);
    let query = $state('');
    let layoutName = $state('');
    let online = $state<OnlineLayout[]>([]);
    let onlineBusy = $state(false);
    let hasMore = $state(false);
    let offset = 0;
    let shareId = $state('');
    let transferBusy = $state(false);
    let fileInput: HTMLInputElement;
    let nextUrl: string | null = null;
    let leaving = false;
    function exitEditor() { leaving = true; onclose?.(); if (nextUrl) void goto(nextUrl); }
    beforeNavigate(navigation => {
        if (!dirty || leaving) return;
        navigation.cancel(); nextUrl = navigation.to?.url.href ?? null; confirmExit = true;
    });
    function requestClose() { if (embedded) { if (dirty) { draft = structuredClone(normalizeControls(app.settings.controls)); toasts.ok(tr('Alterações descartadas.')); } return; } if (dirty) confirmExit = true; else exitEditor(); }
    async function browse(append = false) {
        if (onlineBusy) return;
        onlineBusy = true;
        try {
            const nextOffset = append ? offset + 20 : 0;
            const result = await listLayouts(query, nextOffset);
            online = append ? [...online, ...result.items] : result.items;
            offset = nextOffset; hasMore = result.hasMore;
        } catch (e) { toasts.err(e); }
        finally { onlineBusy = false; }
    }
    async function publish() {
        if (onlineBusy || !layoutName.trim()) return;
        onlineBusy = true;
        try {
            const result = await publishLayout(layoutName, $state.snapshot(draft));
            shareId = `#${result.id}`;
            online = [result, ...online.filter(row => row.id !== result.id)];
        } catch (e) { toasts.err(e); }
        finally { onlineBusy = false; }
    }
    async function exportLayout() {
        const json = JSON.stringify({name: layoutName || 'Tropicalia', layout: $state.snapshot(draft)}, null, 2);
        if (isTauri && app.system.os === 'android') {
            if (transferBusy) return;
            transferBusy = true;
            try { await call('controls_transfer', {mode: 'export', text: json}); }
            catch (e) { toasts.err(e); }
            finally { transferBusy = false; }
            return;
        }
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = 'tropicalia-controls.json';
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async function importFromDevice() {
        if (!(isTauri && app.system.os === 'android')) { fileInput.click(); return; }
        if (transferBusy) return;
        transferBusy = true;
        try {
            const json = await call<string | null>('controls_transfer', {mode: 'import', text: null});
            if (json !== null) { draft = parseLayout(JSON.parse(json)); selected = 'jump'; }
        } catch (e) { toasts.err(e); }
        finally { transferBusy = false; }
    }
    async function importLayout(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        try {
            const file = input.files?.[0]; if (!file) return;
            if (file.size > 32000) throw new Error(text('Arquivo muito grande.', 'File too large.', 'Archivo demasiado grande.'));
            draft = parseLayout(JSON.parse(await file.text())); selected = 'jump';
        } catch (e) { toasts.err(e); }
        finally { input.value = ''; }
    }


	let host = $state<HTMLDivElement>();
	let canvas = $state<HTMLCanvasElement>();
	let viewport = $state({ w: 0, h: 0 });
	const aspect = landscapeAspect();
	const stage = $derived.by(() => {
		const { w, h } = viewport;
		if (!w || !h) return { w: 0, h: 0 };
		return w / h > aspect ? { w: Math.round(h * aspect), h } : { w, h: Math.round(w / aspect) };
	});

	const SHAPES: { id: Shape; name: string }[] = [
		{ id: 'pixel', name: 'Pixel' },
		{ id: 'circle', name: 'Círculo' },
		{ id: 'rounded', name: 'Arredondado' },
		{ id: 'square', name: 'Quadrado' }
	];
	const ICON_NAMES = Object.keys(PIXEL_ICONS);

	function sideOf(id: ControlId) {
		return clampSize(draft.items[id].size * draft.scale) * stage.h;
	}
	function rectOf(id: ControlId) {
		const s = sideOf(id);
		const it = draft.items[id];
		return { x: it.x * stage.w - s / 2, y: it.y * stage.h - s / 2, s };
	}
	const HANDLE = 22;

	function draw() {
		if (!canvas || !stage.w) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(stage.w * dpr);
		canvas.height = Math.round(stage.h * dpr);
		const ctx = canvas.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, stage.w, stage.h);
		// Reference: crosshair and hotbar where the game draws them.
		ctx.strokeStyle = 'rgba(255,255,255,0.35)';
		ctx.lineWidth = 2;
		const cx = stage.w / 2, cy = stage.h / 2;
		ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
		const slot = Math.min(stage.h * 0.1, stage.w * 0.045);
		ctx.strokeStyle = 'rgba(255,255,255,0.18)';
		for (let i = 0; i < 9; i++) ctx.strokeRect(cx - slot * 4.5 + i * slot + 1, stage.h - slot - 4, slot - 2, slot - 2);

		for (const id of CONTROL_IDS) {
			const it = draft.items[id];
			const { x, y, s } = rectOf(id);
			ctx.globalAlpha = it.visible ? Math.max(0.15, it.opacity) : 0.22;
			if (id === 'move') {
				drawControl(ctx, draft, 'move', 'frame', x, y, s);
				const k = s * 0.34;
				drawControl(ctx, draft, 'move', 'knob', x + (s - k) / 2, y + (s - k) / 2, k);
			} else {
				drawControl(ctx, draft, id, 'normal', x, y, s);
			}
			ctx.globalAlpha = 1;
			if (!it.visible) {
				ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
				ctx.strokeRect(x, y, s, s); ctx.setLineDash([]);
			}
			if (id === selected) {
				ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
				ctx.strokeRect(x - 3, y - 3, s + 6, s + 6); ctx.setLineDash([]);
				ctx.fillStyle = '#4ade80';
				ctx.fillRect(x + s + 3 - HANDLE / 2, y + s + 3 - HANDLE / 2, HANDLE, HANDLE);
				ctx.fillStyle = '#0d1210';
				ctx.fillRect(x + s + 3 - 4, y + s + 3 - 4, 8, 8);
			}
		}
	}

	$effect(() => {
		// Track every field the drawing reads.
		JSON.stringify(draft); void selected; void stage.w; void stage.h;
		draw();
	});

	// ------------------------------------------------------------ pointer editing
	let drag: { id: ControlId; mode: 'move' | 'resize'; dx: number; dy: number; pointer: number } | null = null;

	function local(e: PointerEvent) {
		const r = canvas!.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}
	function hit(px: number, py: number): { id: ControlId; mode: 'move' | 'resize' } | null {
		if (selected) {
			const { x, y, s } = rectOf(selected);
			// The body of the button always wins over the handle, so small buttons stay draggable.
			const inBody = px >= x && px <= x + s * 0.75 && py >= y && py <= y + s * 0.75;
			if (!inBody && Math.abs(px - (x + s + 3)) <= HANDLE && Math.abs(py - (y + s + 3)) <= HANDLE) return { id: selected, mode: 'resize' };
		}
		// Smaller controls first so a small button over the joystick stays reachable.
		const order = [...CONTROL_IDS].sort((a, b) => sideOf(a) - sideOf(b));
		for (const id of order) {
			const { x, y, s } = rectOf(id);
			if (px >= x && px <= x + s && py >= y && py <= y + s) return { id, mode: 'move' };
		}
		return null;
	}
	const step = (v: number) => (snap ? Math.round(v * 100) / 100 : v);

	function down(e: PointerEvent) {
		const p = local(e);
		const target = hit(p.x, p.y);
		if (!target) { selected = null; return; }
		selected = target.id;
		tab = 'botao';
		const it = draft.items[target.id];
		drag = { id: target.id, mode: target.mode, dx: p.x - it.x * stage.w, dy: p.y - it.y * stage.h, pointer: e.pointerId };
		canvas!.setPointerCapture(e.pointerId);
		e.preventDefault();
	}
	function move(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointer) return;
		const p = local(e);
		const it = draft.items[drag.id];
		if (drag.mode === 'move') {
			it.x = clampPos(step((p.x - drag.dx) / stage.w));
			it.y = clampPos(step((p.y - drag.dy) / stage.h));
		} else {
			const cx = it.x * stage.w, cy = it.y * stage.h;
			const half = Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy));
			it.size = clampSize(step((half * 2) / stage.h / draft.scale));
		}
		fitControl(it, draft.scale, aspect);
	}
	function up(e: PointerEvent) {
		if (drag && e.pointerId === drag.pointer) drag = null;
	}
	function keydown(e: KeyboardEvent) {
		if (!selected || (e.target as HTMLElement)?.closest('input, select, textarea')) return;
		const it = draft.items[selected];
		const d = e.shiftKey ? 0.05 : 0.01;
		if (e.key === 'ArrowLeft') it.x = clampPos(it.x - d);
		else if (e.key === 'ArrowRight') it.x = clampPos(it.x + d);
		else if (e.key === 'ArrowUp') it.y = clampPos(it.y - d);
		else if (e.key === 'ArrowDown') it.y = clampPos(it.y + d);
		else if (e.key === 'Escape') selected = null;
		else return;
		fitControl(it, draft.scale, aspect);
		e.preventDefault();
	}

	// ------------------------------------------------------------ lifecycle
	let observer: ResizeObserver | undefined;
	onMount(() => {
		if (!embedded && isTauri && app.system.os === 'android') void call('controls_orientation', { landscape: true }).catch(() => {});
		observer = new ResizeObserver(([entry]) => {
			viewport = { w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) };
		});
		if (host) observer.observe(host);
	});
	onDestroy(() => {
		observer?.disconnect();
		if (!embedded && isTauri && app.system.os === 'android') void call('controls_orientation', { landscape: false }).catch(() => {});
	});

	function applyPreset(id: string) {
		const preset = STYLE_PRESETS.find((p) => p.id === id);
		if (preset) draft.style = { ...preset.style };
	}
	function restoreDefaults() {
		draft = defaultControls();
		selected = 'jump';
		toasts.ok(tr('Layout padrão restaurado. Salve para aplicar.'));
	}
	async function save() {
		saving = true;
        const previous = app.settings.controls;
		try {
			app.settings.controls = $state.snapshot(draft) as ControlsConfig;
			await app.saveSettings();
			if (isTauri && app.system.os === 'android') await app.applyControls();
			toasts.ok(tr('Controles salvos para Java e Rust.'));
			baseline = JSON.stringify(normalizeControls(app.settings.controls));
			if (!embedded || nextUrl) exitEditor();
		} catch (e) {
            app.settings.controls = previous;
            await app.saveSettings().catch(() => {});
			toasts.err(e);
		} finally {
			saving = false;
		}
	}

	const current = $derived(selected ? draft.items[selected] : null);
	const usedIcon = (name: string) => current?.icon === name;
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { if (!embedded && !libraryOpen && !confirmExit) requestClose(); else if (embedded) selected = null; } else keydown(e); }} onbeforeunload={(e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }} />
<input class="file-input" type="file" accept=".json,application/json" bind:this={fileInput} onchange={importLayout} />
<Modal bind:open={confirmExit} title={text('Alterações não salvas', 'Unsaved changes', 'Cambios sin guardar')} dismissable={!saving}>
    <p>{text('Salvar o layout antes de sair?', 'Save the layout before exiting?', '¿Guardar el diseño antes de salir?')}</p>
    {#snippet footer()}
        <PixelButton onclick={() => { confirmExit = false; nextUrl = null; }}>{text('Cancelar', 'Cancel', 'Cancelar')}</PixelButton>
        <PixelButton variant="danger" onclick={exitEditor}>{text('Sair sem salvar', 'Exit without saving', 'Salir sin guardar')}</PixelButton>
        <PixelButton variant="emerald" loading={saving} onclick={save}>{text('Salvar e sair', 'Save and exit', 'Guardar y salir')}</PixelButton>
    {/snippet}
</Modal>
<Modal bind:open={libraryOpen} width={740} title={text('Layouts da comunidade', 'Community layouts', 'Diseños de la comunidad')}>
    <div class="library">
        <label for="layout-name">{text('Nome para publicar (público)', 'Name to publish (public)', 'Nombre para publicar (público)')}</label>
        <input id="layout-name" class="tp-input" maxlength="80" bind:value={layoutName} />
        <PixelButton loading={onlineBusy} disabled={!layoutName.trim()} onclick={publish}>{text('Salvar online', 'Save online', 'Guardar en línea')}</PixelButton>
        {#if shareId}<p role="status">{text('ID para compartilhar:', 'Share ID:', 'ID para compartir:')} <strong class="select-text">{shareId}</strong></p>{/if}
        <label for="layout-search">{text('Buscar por #ID ou nome', 'Search by #ID or name', 'Buscar por #ID o nombre')}</label>
        <input id="layout-search" class="tp-input" bind:value={query} onkeydown={(e) => e.key === 'Enter' && browse()} />
        <PixelButton loading={onlineBusy} onclick={() => browse()}>{text('Buscar', 'Search', 'Buscar')}</PixelButton>
        {#each online as row (row.id)}
            <div class="online-row">
                <div><strong>{row.name}</strong><br /><code>#{row.id}</code></div>
                <PixelButton onclick={() => { try { draft = parseLayout(row.layout); selected = 'jump'; libraryOpen = false; } catch (e) { toasts.err(e); } }}>{text('Experimentar', 'Try layout', 'Probar diseño')}</PixelButton>
            </div>
        {:else}<p>{text('Nenhum layout encontrado.', 'No layouts found.', 'No se encontraron diseños.')}</p>{/each}
        {#if hasMore}<PixelButton loading={onlineBusy} onclick={() => browse(true)}>{text('Mais layouts', 'More layouts', 'Más diseños')}</PixelButton>{/if}
    </div>
</Modal>

<div class="editor" class:embedded role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-label={tr("Editor de controles de toque")}>
	<header class="bar">
		<strong class="title">{tr("Controles de toque")}</strong>
		<span class="hint">{tr("Arraste para mover · canto verde para redimensionar")}</span>
		<div class="actions">
            <PixelButton size="xs" disabled={transferBusy} onclick={exportLayout}>{text('Exportar', 'Export', 'Exportar')}</PixelButton>
            <PixelButton size="xs" disabled={transferBusy} onclick={importFromDevice}>{text('Importar', 'Import', 'Importar')}</PixelButton>
            <PixelButton size="xs" onclick={() => { libraryOpen = true; void browse(); }}>{text('Online', 'Online', 'En línea')}</PixelButton>
			<PixelButton size="xs" variant="ghost" icon={Grid3x3} onclick={() => (snap = !snap)}>
				{snap ? tr("Grade: ligada") : tr("Grade: desligada")}
			</PixelButton>
			<PixelButton size="xs" variant="ghost" icon={panelOpen ? PanelRightClose : PanelRightOpen} onclick={() => (panelOpen = !panelOpen)}>
				{panelOpen ? tr("Ocultar painel") : tr("Mostrar painel")}
			</PixelButton>
			<PixelButton size="xs" variant="emerald" icon={Save} loading={saving} onclick={save}>{tr("Salvar")}</PixelButton>
			{#if embedded}
				<PixelButton size="xs" variant="ghost" icon={RotateCcw} disabled={!dirty} onclick={requestClose}>{tr("Descartar")}</PixelButton>
			{:else}
				<PixelButton size="xs" variant="ghost" icon={X} title={tr("Fechar sem salvar")} onclick={requestClose} />
			{/if}
		</div>
	</header>

	<div class="body">
		<div class="viewport" bind:this={host}>
			<canvas
				bind:this={canvas}
				class="stage"
				style:width="{stage.w}px"
				style:height="{stage.h}px"
				onpointerdown={down}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={up}
				aria-label={tr("Prévia da tela do jogo")}
			></canvas>
		</div>

		{#if panelOpen}
			<aside class="panel">
				<div class="tabs" role="tablist">
					<button role="tab" aria-selected={tab === 'botao'} class:on={tab === 'botao'} onclick={() => (tab = 'botao')}>{tr("Botão")}</button>
					<button role="tab" aria-selected={tab === 'aparencia'} class:on={tab === 'aparencia'} onclick={() => (tab = 'aparencia')}>{tr("Aparência")}</button>
				</div>

				{#if tab === 'botao'}
					<label class="tp-label" for="ctl-pick">{tr("Botão")}</label>
					<select id="ctl-pick" class="tp-select" bind:value={selected}>
						{#each CONTROL_IDS as id (id)}
							<option value={id}>{tr(CONTROL_LABELS[id])}{draft.items[id].visible ? '' : ' (oculto)'}</option>
						{/each}
					</select>

					{#if selected && current}
						<div class="row mt">
							<PixelButton size="xs" variant={current.visible ? 'ghost' : 'emerald'} icon={current.visible ? EyeOff : Eye}
								onclick={() => (current.visible = !current.visible)}>
								{current.visible ? tr("Ocultar botão") : tr("Mostrar botão")}
							</PixelButton>
						</div>

						<label class="tp-label mt" for="ctl-size">{tr("Tamanho")} · {Math.round(current.size * 100)}%</label>
						<input id="ctl-size" class="tp-range" type="range" min="0.045" max="0.45" step="0.005" bind:value={current.size} />

						<label class="tp-label mt" for="ctl-op">{tr("Opacidade")} · {Math.round(current.opacity * 100)}%</label>
						<input id="ctl-op" class="tp-range" type="range" min="0.1" max="1" step="0.05" bind:value={current.opacity} />

						{#if selected !== 'move'}
							<span class="tp-label mt">{tr("Ícone")}</span>
							<div class="icons" role="listbox" aria-label={tr("Ícone do botão")}>
								{#each ICON_NAMES as name (name)}
									<button role="option" aria-selected={usedIcon(name)} class:on={usedIcon(name)} title={name}
										aria-label={name} onclick={() => (current.icon = name)}>
										<svg viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">
											{#each PIXEL_ICONS[name] as d}<path {d} />{/each}
										</svg>
									</button>
								{/each}
							</div>
						{/if}

						<Toggle
							checked={!!(current.fill || current.iconColor)}
							label={tr("Cores próprias neste botão")}
							onchange={(on) => {
								current.fill = on ? draft.style.fill : undefined;
								current.iconColor = on ? draft.style.icon : undefined;
							}}
						/>
						{#if current.fill || current.iconColor}
							<div class="colors">
								<label>{tr("Fundo")} <input type="color" bind:value={current.fill} /></label>
								<label>{tr("Ícone")} <input type="color" bind:value={current.iconColor} /></label>
							</div>
						{/if}
					{:else}
						<p class="tp-help">{tr("Toque num botão da prévia para editá-lo.")}</p>
					{/if}
				{:else}
					<span class="tp-label">{tr("Predefinições")}</span>
					<div class="presets">
						{#each STYLE_PRESETS as p (p.id)}
							<button onclick={() => applyPreset(p.id)} style:--fill={p.style.fill} style:--border={p.style.border} style:--icon={p.style.icon}>
								<span class="swatch" aria-hidden="true"></span>{tr(p.name)}
							</button>
						{/each}
					</div>

					<span class="tp-label mt">{tr("Formato")}</span>
					<div class="shapes">
						{#each SHAPES as sh (sh.id)}
							<button class:on={draft.style.shape === sh.id} aria-pressed={draft.style.shape === sh.id} onclick={() => (draft.style.shape = sh.id)}>{tr(sh.name)}</button>
						{/each}
					</div>

					<div class="colors mt">
						<label>{tr("Fundo")} <input type="color" bind:value={draft.style.fill} /></label>
						<label>{tr("Borda")} <input type="color" bind:value={draft.style.border} /></label>
						<label>{tr("Ícone")} <input type="color" bind:value={draft.style.icon} /></label>
						<label>{tr("Pressionado")} <input type="color" bind:value={draft.style.pressed} /></label>
					</div>

					<label class="tp-label mt" for="st-fo">{tr("Opacidade do fundo")} · {Math.round(draft.style.fillOpacity * 100)}%</label>
					<input id="st-fo" class="tp-range" type="range" min="0" max="1" step="0.05" bind:value={draft.style.fillOpacity} />

					<label class="tp-label mt" for="st-bw">{tr("Espessura da borda")} · {draft.style.borderWidth}</label>
					<input id="st-bw" class="tp-range" type="range" min="0" max="5" step="1" bind:value={draft.style.borderWidth} />

					<label class="tp-label mt" for="st-sc">{tr("Escala geral")} · {Math.round(draft.scale * 100)}%</label>
					<input id="st-sc" class="tp-range" type="range" min="0.6" max="1.6" step="0.05" bind:value={draft.scale} />

					<div class="row mt">
						<PixelButton size="xs" variant="danger" icon={RotateCcw} onclick={restoreDefaults}>{tr("Restaurar padrão")}</PixelButton>
					</div>
				{/if}
				<p class="tp-help mt">{tr("Vale para todas as instâncias, Java e Rust. Aplicado ao abrir o jogo.")}</p>
			</aside>
		{/if}
	</div>
</div>

<style>
    .file-input { display: none; }
    .library { display: grid; gap: 12px; }
    .online-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px; background: #14231b; overflow-wrap: anywhere; }

	.editor {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: flex;
		flex-direction: column;
		background: #050806;
		color: var(--tp-text);
		touch-action: auto;
		/* Keep the toolbar and panel clear of the status bar and camera cutout. */
		padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px)
			env(safe-area-inset-left, 0px);
	}
	.bar {
        flex-wrap: wrap;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 12px;
		min-height: 44px;
		background: var(--tp-panel);
		border-bottom: 2px solid var(--tp-border);
	}
	.title { font-family: var(--font-minecraft); font-size: 12px; white-space: nowrap; }
	.hint { color: var(--tp-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.actions { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
	.body { flex: 1; min-height: 0; display: flex; position: relative; }
	.viewport {
		flex: 1;
		min-width: 0;
		display: grid;
		place-items: center;
		background:
			radial-gradient(ellipse at 50% 30%, rgba(74, 222, 128, 0.08), transparent 60%),
			repeating-linear-gradient(0deg, #0b0f0d 0 16px, #0d1210 16px 32px);
	}
	.stage {
		background: linear-gradient(180deg, #1d3a52 0%, #3b6b8a 45%, #3f6d2a 46%, #2d4f1e 100%);
		outline: 1px solid var(--tp-border-strong);
		image-rendering: pixelated;
		cursor: grab;
        touch-action: none;
	}
	.panel > :global(*) { flex-shrink: 0; }
	.panel {
		width: 300px;
		max-width: 42vw;
		flex: none;
		overflow-y: auto;
		padding: 12px;
		background: color-mix(in srgb, var(--tp-panel) 94%, transparent);
		border-left: 2px solid var(--tp-border);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px; }
	.tabs button, .shapes button, .presets button {
		min-height: 36px;
		padding: 4px 8px;
		font-size: 12px;
		background: var(--tp-panel-3);
		border: 2px solid var(--tp-border);
		color: var(--tp-muted);
	}
	.tabs button.on, .shapes button.on { color: var(--tp-text); border-color: var(--tp-emerald); background: var(--tp-panel-2); }
	.tabs button:focus-visible, .shapes button:focus-visible, .presets button:focus-visible, .icons button:focus-visible {
		outline: 2px solid var(--tp-green);
		outline-offset: 1px;
	}
	.shapes { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
	.presets { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
	.presets button { display: flex; align-items: center; gap: 8px; color: var(--tp-text); text-align: left; }
	.presets button:hover { border-color: var(--tp-border-strong); }
	.swatch {
		width: 18px; height: 18px; flex: none;
		background: var(--fill);
		border: 2px solid var(--border);
		box-shadow: inset 0 0 0 4px var(--fill), inset 0 0 0 9px var(--icon);
	}
	.icons {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
		gap: 4px;
		max-height: 180px;
		overflow-y: auto;
		padding: 2px;
	}
	.icons button {
		aspect-ratio: 1;
		min-height: 40px;
		display: grid;
		place-items: center;
		background: var(--tp-panel-3);
		border: 2px solid var(--tp-border);
		color: var(--tp-text);
	}
	.icons button.on { border-color: var(--tp-emerald); background: var(--tp-panel-2); }
	.icons svg { width: 24px; height: 24px; fill: currentColor; }
	.colors { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
	.colors label { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; color: #c7d5cc; }
	.colors input[type='color'] { width: 44px; height: 32px; border: 2px solid var(--tp-border); background: none; padding: 0; }
	.row { display: flex; gap: 6px; flex-wrap: wrap; }
	.mt { margin-top: 8px; }
	.editor.embedded {
		position: relative;
		inset: auto;
		z-index: auto;
		height: 100%;
		padding: 0;
		background: transparent;
	}
	.editor.embedded .bar { box-shadow: 0 0 0 2px #000; }
	.editor.embedded .title { display: none; }
	@media (max-width: 600px) and (orientation: portrait) {
        .body { flex-direction: column; overflow-y: auto; }
        .viewport { flex: none; height: 36dvh; min-height: 160px; }
        .panel { width: 100%; max-width: 100%; flex: 1; border-left: 0; border-top: 2px solid var(--tp-border); }
        .actions { width: 100%; margin-left: 0; }
    }
    @media (max-height: 480px) and (orientation: landscape) {
        .bar { max-height: 28dvh; overflow-y: auto; flex-shrink: 0; }
    }
    @media (max-width: 720px) {
		.hint { display: none; }
	}
</style>
