<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		Box, Brush, Camera, CircleCheck, Download, Eraser, FlipHorizontal2, FolderOpen, Grid3x3, Images, Layers, LogIn, LogOut,
		Moon, PaintBucket, Pencil, Pipette, Redo2, Rotate3d, Save, Scan, Sparkles, Sun, Trash2, Undo2, UserRound, ZoomIn, ZoomOut
	} from 'lucide-svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import { tr } from '$lib/ui-text';
	import { toasts } from '$lib/state.svelte';
	import { call, isTauri, kv, openUrl } from '$lib/platform';
	import { REGISTER_URL, tropicaliaAccount as account } from '$lib/services/tropicalia-account.svelte';
	import { MinecraftSkinModel, type BodyPartName, type ModelType, type PoseName } from '$lib/skin/skin-model';
	import { SkinGeneratorAiService } from '$lib/skin/generator';
	import { SKIN_PRESETS, QUICK_AI_PROMPTS } from '$lib/skin/presets';
	import { loadSkinByNick, loadSkinFromFile, loadSkinFromUrl, type LoadedSkin } from '$lib/skin/skin-image';
	import {
		PART_LABELS, SkinDocument, UV_BOXES, allowedOnLayer, mirroredX, regionAt, slugify, type Layer, type Tool
	} from '$lib/skin/editor';

	// ------------------------------------------------------------------ persisted gallery
	interface SavedSkin { id: string; name: string; dataUrl: string; slim: boolean; updated: number }
	interface Draft { id: string | null; name: string; dataUrl: string; slim: boolean }
	const GALLERY_KEY = 'skins.gallery';
	const DRAFT_KEY = 'skins.draft';
	const MAX_GALLERY = 60;

	// ------------------------------------------------------------------ editor state
	const generator = new SkinGeneratorAiService();
	let doc: SkinDocument | undefined;
	let model: MinecraftSkinModel | undefined;

	let viewport3d = $state<HTMLDivElement>();
	let host2d = $state<HTMLDivElement>();
	let canvas2d = $state<HTMLCanvasElement>();
	let fileInput = $state<HTMLInputElement>();

	let title = $state('Minha skin');
	let currentId = $state<string | null>(null);
	let tool = $state<Tool>('pencil');
	let color = $state('#8a532b');
	let mirror = $state(false);
	let layer = $state<Layer>('base');
	let modelType = $state<ModelType>('classic');
	let pose = $state<PoseName>('stand');
	let overlayOn = $state(true);
	let mode3d = $state<'paint' | 'orbit'>('paint');
	let focus = $state<BodyPartName | 'all'>('all');
	let grid = $state(true);
	let guides = $state(true);
	let view = $state<'3d' | '2d'>('3d');
	let hover = $state<{ x: number; y: number } | null>(null);
	let historyTick = $state(0);
	let recent = $state<string[]>(['#8a532b', '#3e5238', '#f59e0b', '#22c55e', '#06b6d4', '#1e293b', '#ffffff', '#dc2626']);

	let gallery = $state<SavedSkin[]>([]);
	let galleryOpen = $state(false);
	let aiOpen = $state(false);
	let aiTab = $state<'prompt' | 'presets' | 'nick'>('prompt');
	let prompt = $state('');
	let nick = $state('');
	let busy = $state<'' | 'ai' | 'nick' | 'export' | 'photo' | 'use' | 'login'>('');
	let loginOpen = $state(false);
	let loginUser = $state('');
	let loginPass = $state('');
	let loginError = $state('');
	/** Depois de entrar, envia a skin que estava sendo aplicada (USAR sem login). */
	let pendingServerSkin = false;
	let ready = $state(false);

	// 2D view transform (CSS pixels)
	let scale = $state(8);
	let pan = $state({ x: 0, y: 0 });

	const canUndo = $derived.by(() => { void historyTick; return doc?.canUndo ?? false; });
	const canRedo = $derived.by(() => { void historyTick; return doc?.canRedo ?? false; });
	const hoverInfo = $derived(hover ? regionAt(hover.x, hover.y) : null);

	const TOOLS: { id: Tool; label: string; icon: typeof Pencil; key: string }[] = [
		{ id: 'pencil', label: 'Lápis', icon: Pencil, key: 'B' },
		{ id: 'eraser', label: 'Borracha', icon: Eraser, key: 'E' },
		{ id: 'bucket', label: 'Balde', icon: PaintBucket, key: 'G' },
		{ id: 'picker', label: 'Pegar cor', icon: Pipette, key: 'I' },
		{ id: 'lighten', label: 'Clarear', icon: Sun, key: 'L' },
		{ id: 'darken', label: 'Escurecer', icon: Moon, key: 'D' },
		{ id: 'noise', label: 'Textura', icon: Brush, key: 'N' }
	];
	const LAYERS: { id: Layer; label: string }[] = [
		{ id: 'base', label: 'Base' },
		{ id: 'overlay', label: 'Camada 3D' },
		{ id: 'all', label: 'Todas' }
	];
	const PARTS: (BodyPartName | 'all')[] = ['all', 'head', 'torso', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
	const POSES: { id: PoseName; label: string }[] = [
		{ id: 'stand', label: 'Parado' },
		{ id: 'walk', label: 'Andando' },
		{ id: 'run', label: 'Correndo' },
		{ id: 'hero', label: 'Herói' },
		{ id: 'tpose', label: 'T-pose' },
		{ id: 'dance', label: 'Dança' }
	];
	const PALETTE = [
		'#ffd1a4', '#e0a97b', '#b38258', '#7c4a27', '#8a532b', '#a26639', '#553117', '#2a170a',
		'#06b6d4', '#f59e0b', '#cbd5e1', '#334155', '#22c55e', '#ef4444', '#2563eb', '#3e5238',
		'#556f4e', '#20291e', '#09090b', '#ffffff', '#64748b', '#facc15', '#a855f7', '#ec4899'
	];

	// ------------------------------------------------------------------ texture sync
	let draftTimer: ReturnType<typeof setTimeout> | undefined;
	function changed() {
		model?.updateTexture();
		draw2d();
		historyTick++;
		clearTimeout(draftTimer);
		draftTimer = setTimeout(saveDraft, 600);
	}

	function saveDraft() {
		if (!doc) return;
		const draft: Draft = { id: currentId, name: title, dataUrl: doc.toDataUrl(), slim: modelType === 'slim' };
		void kv.set(DRAFT_KEY, draft).catch(() => {});
	}

	/** Tool the current stroke started with; Pegar cor switches to the pencil and the rest of that drag must not paint. */
	let strokeTool: Tool | null = null;
	const oneShot = (t: Tool) => t === 'bucket' || t === 'picker';

	/** Called once when a stroke starts. */
	function beginStroke(x: number, y: number) {
		strokeTool = tool;
		if (tool !== 'picker') doc?.checkpoint();
		applyAt(x, y);
	}

	/** Called for every pixel a drag crosses; one-shot tools ignore it. */
	function continueStroke(x: number, y: number) {
		if (strokeTool !== tool || oneShot(tool)) return;
		applyAt(x, y);
	}

	function applyAt(x: number, y: number) {
		if (!doc) return;
		// Pegar cor reads any visible pixel, whatever layer is being edited.
		if (tool === 'picker') {
			const picked = doc.colorAt(x, y);
			if (picked) { setColor(picked); tool = 'pencil'; }
			else toasts.info(tr('Pixel transparente: escolha um pixel com cor.'));
			return;
		}
		if (!allowedOnLayer(layer, x, y)) return;
		doc.paint(tool, x, y, color);
		if (mirror) {
			const mx = mirroredX(x, y);
			if (mx !== null && mx !== x) doc.paint(tool, mx, y, color);
		}
		changed();
	}

	function setColor(hex: string) {
		color = hex;
		recent = [hex, ...recent.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, 8);
	}

	function undo() { if (doc?.undo()) changed(); }
	function redo() { if (doc?.redo()) changed(); }

	function setModel(next: ModelType) {
		modelType = next;
		model?.setModelType(next);
		saveDraft();
	}

	function loadSkin(skin: LoadedSkin | { canvas: HTMLCanvasElement; slim?: boolean }, name: string, id: string | null = null) {
		if (!doc) return;
		doc.replace(skin.canvas);
		title = name;
		currentId = id;
		if (typeof skin.slim === 'boolean' && skin.slim !== (modelType === 'slim')) setModel(skin.slim ? 'slim' : 'classic');
		changed();
	}

	// ------------------------------------------------------------------ 2D UV editor
	function fit2d() {
		if (!host2d) return;
		const { clientWidth: w, clientHeight: h } = host2d;
		if (!w || !h) return;
		scale = Math.max(3, Math.min(26, Math.floor((Math.min(w, h) - 24) / 64)));
		pan = { x: Math.round((w - 64 * scale) / 2), y: Math.round((h - 64 * scale) / 2) };
		draw2d();
	}

	function draw2d() {
		if (!canvas2d || !host2d || !doc) return;
		const w = host2d.clientWidth, h = host2d.clientHeight;
		if (!w || !h) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		if (canvas2d.width !== Math.round(w * dpr) || canvas2d.height !== Math.round(h * dpr)) {
			canvas2d.width = Math.round(w * dpr);
			canvas2d.height = Math.round(h * dpr);
		}
		const ctx = canvas2d.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		ctx.imageSmoothingEnabled = false;
		const size = 64 * scale;

		// Checkerboard behind transparent pixels.
		ctx.save();
		ctx.beginPath(); ctx.rect(pan.x, pan.y, size, size); ctx.clip();
		ctx.fillStyle = '#1a2420'; ctx.fillRect(pan.x, pan.y, size, size);
		ctx.fillStyle = '#121a16';
		const cell = scale * 2;
		for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if ((x + y) % 2 === 0) ctx.fillRect(pan.x + x * cell, pan.y + y * cell, cell, cell);
		ctx.restore();

		// Dim the pixels of the layer that is not being edited.
		ctx.drawImage(doc.canvas, 0, 0, 64, 64, pan.x, pan.y, size, size);
		if (layer !== 'all') {
			ctx.fillStyle = 'rgba(5, 8, 6, 0.62)';
			for (const box of UV_BOXES) {
				if (box.overlay === (layer === 'overlay')) continue;
				ctx.fillRect(pan.x + box.x * scale, pan.y + box.y * scale, box.w * scale, box.h * scale);
			}
		}

		if (grid && scale >= 5) {
			ctx.strokeStyle = 'rgba(255,255,255,0.07)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			for (let i = 0; i <= 64; i++) {
				const o = Math.round(i * scale) + 0.5;
				ctx.moveTo(pan.x + o, pan.y); ctx.lineTo(pan.x + o, pan.y + size);
				ctx.moveTo(pan.x, pan.y + o); ctx.lineTo(pan.x + size, pan.y + o);
			}
			ctx.stroke();
		}

		if (guides) {
			for (const box of UV_BOXES) {
				const active = box.overlay ? layer !== 'base' : layer !== 'overlay';
				const focused = focus !== 'all' && focus === box.part;
				ctx.globalAlpha = active ? 1 : 0.35;
				ctx.strokeStyle = box.color;
				ctx.lineWidth = focused ? 3 : 1.5;
				ctx.setLineDash(box.overlay ? [5, 3] : []);
				ctx.strokeRect(pan.x + box.x * scale + 0.5, pan.y + box.y * scale + 0.5, box.w * scale - 1, box.h * scale - 1);
				ctx.setLineDash([]);
				if (scale >= 7) {
					ctx.globalAlpha *= 0.4;
					ctx.lineWidth = 1;
					for (const f of box.faces) ctx.strokeRect(pan.x + f.x * scale + 0.5, pan.y + f.y * scale + 0.5, f.w * scale - 1, f.h * scale - 1);
				}
				ctx.globalAlpha = active ? 1 : 0.45;
				if (scale >= 5) {
					ctx.font = '9px Minecraft, monospace';
					const tw = ctx.measureText(box.label).width + 8;
					const px = pan.x + box.x * scale + 2, py = pan.y + box.y * scale + 2;
					ctx.fillStyle = 'rgba(5, 8, 6, 0.88)';
					ctx.fillRect(px, py, tw, 13);
					ctx.fillStyle = focused ? '#fff' : box.color;
					ctx.fillText(box.label, px + 4, py + 10);
				}
				ctx.globalAlpha = 1;
			}
		}

		if (hover) {
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2;
			ctx.strokeRect(pan.x + hover.x * scale, pan.y + hover.y * scale, scale, scale);
			const mx = mirror ? mirroredX(hover.x, hover.y) : null;
			if (mx !== null) {
				ctx.strokeStyle = '#38bdf8';
				ctx.strokeRect(pan.x + mx * scale, pan.y + hover.y * scale, scale, scale);
			}
		}
	}

	function pixelAt(clientX: number, clientY: number) {
		const r = canvas2d!.getBoundingClientRect();
		const x = Math.floor((clientX - r.left - pan.x) / scale);
		const y = Math.floor((clientY - r.top - pan.y) / scale);
		return x >= 0 && x < 64 && y >= 0 && y < 64 ? { x, y } : null;
	}

	const pointers = new Map<number, { x: number; y: number }>();
	let stroke: 'paint' | 'pan' | null = null;
	let last: { x: number; y: number } | null = null;
	let panFrom = { x: 0, y: 0 };
	let pinch = 0;

	function down2d(e: PointerEvent) {
		canvas2d!.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 2) {
			// Second finger: cancel the stroke and start pinch-zoom / pan.
			if (stroke === 'paint') undo();
			stroke = 'pan';
			const [a, b] = [...pointers.values()];
			pinch = Math.hypot(a.x - b.x, a.y - b.y);
			panFrom = { x: (a.x + b.x) / 2 - pan.x, y: (a.y + b.y) / 2 - pan.y };
			return;
		}
		if (e.button === 1 || e.button === 2 || e.altKey || e.shiftKey) {
			stroke = 'pan';
			panFrom = { x: e.clientX - pan.x, y: e.clientY - pan.y };
			return;
		}
		const p = pixelAt(e.clientX, e.clientY);
		if (!p) { stroke = 'pan'; panFrom = { x: e.clientX - pan.x, y: e.clientY - pan.y }; return; }
		stroke = 'paint';
		last = p;
		beginStroke(p.x, p.y);
		e.preventDefault();
	}

	function move2d(e: PointerEvent) {
		if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (stroke === 'pan' && pointers.size >= 2) {
			const [a, b] = [...pointers.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const next = Math.max(3, Math.min(26, scale * (dist / (pinch || dist))));
			pinch = dist;
			scale = next;
			pan = { x: mid.x - panFrom.x, y: mid.y - panFrom.y };
			draw2d();
			return;
		}
		if (stroke === 'pan') {
			pan = { x: e.clientX - panFrom.x, y: e.clientY - panFrom.y };
			draw2d();
			return;
		}
		const p = pixelAt(e.clientX, e.clientY);
		const same = p && hover && p.x === hover.x && p.y === hover.y;
		hover = p;
		if (stroke === 'paint' && p && !same && !oneShot(tool)) {
			// Fill the gap between pointer samples so fast strokes stay continuous.
			for (const q of line(last ?? p, p)) continueStroke(q.x, q.y);
			last = p;
		} else draw2d();
	}

	function line(a: { x: number; y: number }, b: { x: number; y: number }) {
		const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
		const out = [];
		for (let i = steps ? 1 : 0; i <= steps; i++) {
			out.push({ x: Math.round(a.x + ((b.x - a.x) * i) / (steps || 1)), y: Math.round(a.y + ((b.y - a.y) * i) / (steps || 1)) });
		}
		return out;
	}

	function up2d(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size === 0) stroke = null;
		if (e.pointerType !== 'mouse') { hover = null; draw2d(); }
	}

	function wheel2d(e: WheelEvent) {
		e.preventDefault();
		const r = canvas2d!.getBoundingClientRect();
		zoomAround(e.deltaY < 0 ? 1.15 : 0.87, e.clientX - r.left, e.clientY - r.top);
	}

	function zoomAround(factor: number, cx?: number, cy?: number) {
		const w = host2d?.clientWidth ?? 0, h = host2d?.clientHeight ?? 0;
		const x = cx ?? w / 2, y = cy ?? h / 2;
		const next = Math.max(3, Math.min(26, scale * factor));
		pan = { x: x - (x - pan.x) * (next / scale), y: y - (y - pan.y) * (next / scale) };
		scale = next;
		draw2d();
	}

	// ------------------------------------------------------------------ 3D viewer
	function init3d() {
		if (!viewport3d || !doc || model) return;
		model = new MinecraftSkinModel(viewport3d, doc.canvas);
		model.getActiveLayer = () => layer;
		model.on3DPaintStart = (p) => beginStroke(p.x, p.y);
		model.on3DPaintMove = (p) => continueStroke(p.x, p.y);
		model.on3DHover = (hit) => { hover = hit?.pixel ?? null; draw2d(); };
		model.setModelType(modelType);
		model.setInteractionMode(mode3d);
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) model.setAnimationEnabled(false);
	}

	function setMode3d(next: 'paint' | 'orbit') { mode3d = next; model?.setInteractionMode(next); }
	function setFocus(part: BodyPartName | 'all') { focus = part; model?.focusPart(part); draw2d(); }
	function setPose(next: PoseName) { pose = next; model?.setPose(next); }
	function toggleOverlay() { overlayOn = !overlayOn; model?.setOverlayVisibility(overlayOn); }

	// ------------------------------------------------------------------ AI, presets, import
	async function generate(text = prompt, silent = false) {
		const clean = text.trim();
		if (!clean || busy) return;
		busy = 'ai';
		try {
			const result = await generator.generateSkin(clean);
			loadSkin({ canvas: result.canvas }, result.title);
			aiOpen = false;
			if (!silent) toasts.ok(`${tr('Skin gerada:')} ${result.title}`);
			if (window.innerWidth < 1024) view = '3d';
		} catch (e) {
			toasts.err(e);
		} finally {
			busy = '';
		}
	}

	async function fetchNick() {
		const clean = nick.trim();
		if (!clean || busy) return;
		busy = 'nick';
		try {
			const skin = await loadSkinByNick(clean);
			loadSkin(skin, `Skin de ${skin.nick}`);
			aiOpen = false;
			toasts.ok(`${tr('Skin carregada:')} ${skin.nick}`);
		} catch (e) {
			toasts.err(navigator.onLine ? e : new Error(tr('Sem internet: buscar por nick precisa de conexão.')));
		} finally {
			busy = '';
		}
	}

	async function importFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			if (file.size > 2_000_000) throw new Error(tr('Arquivo muito grande para uma skin.'));
			const skin = await loadSkinFromFile(file);
			loadSkin(skin, file.name.replace(/\.png$/i, ''));
			toasts.ok(skin.legacy ? tr('Skin 64x32 convertida para 64x64.') : tr('Skin importada.'));
		} catch (e) {
			toasts.err(e);
		}
	}

	// ------------------------------------------------------------------ gallery and export
	async function saveToGallery() {
		if (!doc) return;
		const name = title.trim() || 'Minha skin';
		const entry: SavedSkin = {
			id: currentId ?? crypto.randomUUID(),
			name,
			dataUrl: doc.toDataUrl(),
			slim: modelType === 'slim',
			updated: Date.now()
		};
		const next = [entry, ...gallery.filter((s) => s.id !== entry.id)].slice(0, MAX_GALLERY);
		try {
			await kv.set(GALLERY_KEY, next);
			gallery = next;
			currentId = entry.id;
			saveDraft();
			toasts.ok(`${tr('Salva em Minhas skins:')} ${name}`);
		} catch (e) {
			toasts.err(e);
		}
	}

	async function openSaved(s: SavedSkin) {
		try {
			loadSkin(await loadSkinFromUrl(s.dataUrl), s.name, s.id);
			if (s.slim !== (modelType === 'slim')) setModel(s.slim ? 'slim' : 'classic');
			galleryOpen = false;
		} catch (e) {
			toasts.err(e);
		}
	}

	async function removeSaved(s: SavedSkin) {
		const next = gallery.filter((g) => g.id !== s.id);
		try {
			await kv.set(GALLERY_KEY, next);
			gallery = next;
			if (currentId === s.id) currentId = null;
		} catch (e) {
			toasts.err(e);
		}
	}

	function newSkin() {
		if (!doc) return;
		doc.checkpoint();
		doc.ctx.clearRect(0, 0, 64, 64);
		title = 'Nova skin';
		currentId = null;
		changed();
		galleryOpen = false;
	}

	const pngBytes = (dataUrl: string) => Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));

	/** Salva no aparelho: `skin` vai para Downloads/TropicaliaCraft, `photo` para Imagens/TropicaliaCraft. */
	async function exportPng(dataUrl: string, file: string, kind: 'skin' | 'photo' = 'skin') {
		if (!isTauri) {
			const link = document.createElement('a');
			link.href = dataUrl;
			link.download = file;
			link.click();
			toasts.ok(kind === 'photo' ? tr('Foto 3D baixada.') : tr('Skin PNG 64x64 baixada.'));
			return;
		}
		busy = kind === 'photo' ? 'photo' : 'export';
		try {
			const path = await call<string>('skin_export', { kind, name: file, png: pngBytes(dataUrl) });
			toasts.ok(`${kind === 'photo' ? tr('Foto salva em') : tr('Skin salva em')} ${path}`);
		} catch (e) {
			toasts.err(e);
		} finally {
			busy = '';
		}
	}

	const exportSkin = () => doc && exportPng(doc.toDataUrl(), `${slugify(title)}.png`, 'skin');
	const exportPhoto = () => model && exportPng(model.getSnapshotDataUrl(), `${slugify(title)}-3d.png`, 'photo');

	// ------------------------------------------------------------------ USAR (jogo + conta)
	/** Põe a skin no cliente do launcher e, com a conta do TropicaliaCraft logada, no servidor. */
	async function useSkin() {
		if (!doc || busy) return;
		const dataUrl = doc.toDataUrl();
		const variant = modelType === 'slim' ? 'slim' : 'classic';
		busy = 'use';
		try {
			if (isTauri) {
				await call<string>('skin_use', { png: pngBytes(dataUrl), slim: variant === 'slim' });
				toasts.ok(tr('Skin ativa no jogo! Ela aparece na próxima vez que você abrir o Minecraft.'));
			}
			await account.load();
			if (account.loggedIn) {
				toasts.ok(await account.setSkin(dataUrl, variant));
			} else {
				pendingServerSkin = true;
				loginError = '';
				loginOpen = true;
			}
		} catch (e) {
			toasts.err(e);
		} finally {
			busy = '';
		}
	}

	async function login() {
		loginError = '';
		busy = 'login';
		try {
			const p = await account.login(loginUser, loginPass);
			loginPass = '';
			loginOpen = false;
			toasts.ok(`${tr('Conectado como')} ${p.nickname}`);
			if (pendingServerSkin && doc) {
				pendingServerSkin = false;
				toasts.ok(await account.setSkin(doc.toDataUrl(), modelType === 'slim' ? 'slim' : 'classic'));
			}
		} catch (e) {
			loginError = (e as Error).message;
		} finally {
			busy = '';
		}
	}

	async function logout() {
		await account.logout();
		toasts.ok(tr('Você saiu da conta do TropicaliaCraft.'));
	}

	// ------------------------------------------------------------------ keyboard
	function keydown(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.closest('input, textarea, select') || aiOpen || galleryOpen) return;
		const k = e.key.toLowerCase();
		if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
		if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
		if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); void saveToGallery(); return; }
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const t = TOOLS.find((x) => x.key.toLowerCase() === k);
		if (t) tool = t.id;
		else if (k === 'm') mirror = !mirror;
		else if (k === 'tab') { e.preventDefault(); layer = layer === 'base' ? 'overlay' : layer === 'overlay' ? 'all' : 'base'; draw2d(); }
	}

	// ------------------------------------------------------------------ lifecycle
	let observer: ResizeObserver | undefined;
	onMount(() => {
		doc = new SkinDocument();
		if (window.innerWidth < 1024) view = '3d';
		observer = new ResizeObserver(() => fit2d());
		if (host2d) observer.observe(host2d);

		void (async () => {
			gallery = await kv.get<SavedSkin[]>(GALLERY_KEY, []).catch(() => []);
			void account.load();
			const draft = await kv.get<Draft | null>(DRAFT_KEY, null).catch(() => null);
			init3d();
			if (draft?.dataUrl) {
				try {
					const skin = await loadSkinFromUrl(draft.dataUrl);
					loadSkin({ ...skin, slim: draft.slim }, draft.name, draft.id);
				} catch {
					await generate(SKIN_PRESETS[0].prompt, true);
				}
			} else {
				await generate(SKIN_PRESETS[0].prompt, true);
			}
			ready = true;
			fit2d();
		})();
	});

	onDestroy(() => {
		observer?.disconnect();
		clearTimeout(draftTimer);
		if (doc) saveDraft();
		model?.dispose();
		model = undefined;
	});

	// Redraw when display options change.
	$effect(() => {
		void grid; void guides; void layer; void focus; void mirror;
		draw2d();
	});

	// The hidden pane has no size on small screens; refit when it becomes visible.
	$effect(() => {
		void view;
		requestAnimationFrame(() => { fit2d(); model?.resize(); });
	});

	const headStyle = (url: string) =>
		`background-image:url(${url}),url(${url});background-size:512px 512px;background-position:-320px -64px,-64px -64px`;
</script>

<svelte:window onkeydown={keydown} />
<input class="hidden" type="file" accept="image/png" bind:this={fileInput} onchange={importFile} />

<div class="studio" class:is-2d={view === '2d'}>
	<!-- ============================================================ top bar -->
	<header class="bar">
		<div class="name">
			<UserRound size={16} class="shrink-0 text-[var(--tp-green)]" />
			<input class="name-input" bind:value={title} maxlength="40" aria-label={tr('Nome da skin')} onchange={saveDraft} />
		</div>

		<div class="seg model-seg" role="radiogroup" aria-label={tr('Modelo')}>
			<button role="radio" aria-checked={modelType === 'classic'} class:on={modelType === 'classic'} onclick={() => setModel('classic')} title={tr('Braços de 4px')}>Steve</button>
			<button role="radio" aria-checked={modelType === 'slim'} class:on={modelType === 'slim'} onclick={() => setModel('slim')} title={tr('Braços de 3px')}>Alex</button>
		</div>

		<div class="group">
			<button class="icon-btn" onclick={undo} disabled={!canUndo} title={tr('Desfazer (Ctrl+Z)')} aria-label={tr('Desfazer')}><Undo2 size={17} /></button>
			<button class="icon-btn" onclick={redo} disabled={!canRedo} title={tr('Refazer (Ctrl+Y)')} aria-label={tr('Refazer')}><Redo2 size={17} /></button>
		</div>

		<div class="seg view-switch" role="tablist" aria-label={tr('Visualização')}>
			<button role="tab" aria-selected={view === '3d'} class:on={view === '3d'} onclick={() => (view = '3d')}><Box size={14} /> 3D</button>
			<button role="tab" aria-selected={view === '2d'} class:on={view === '2d'} onclick={() => (view = '2d')}><Grid3x3 size={14} /> UV</button>
		</div>

		<div class="actions">
			<button class="ai-btn" onclick={() => { aiTab = 'prompt'; aiOpen = true; }} title={tr('Gerar skin com IA (funciona offline)')}>
				<Sparkles size={15} />
				<span>IA</span>
				<span class="vip">VIP</span>
			</button>
			<PixelButton size="sm" icon={Images} title={tr('Minhas skins')} onclick={() => (galleryOpen = true)}><span class="lbl">{tr('Minhas skins')}</span></PixelButton>
			<PixelButton size="sm" icon={FolderOpen} title={tr('Abrir PNG')} onclick={() => fileInput?.click()} />
			<PixelButton size="sm" icon={Download} title={tr('Baixar PNG 64x64 (pasta Downloads)')} loading={busy === 'export'} onclick={exportSkin} />
			<PixelButton size="sm" icon={Save} title={tr('Salvar em Minhas skins (Ctrl+S)')} onclick={saveToGallery}><span class="lbl">{tr('Salvar')}</span></PixelButton>
			{#if account.profile}
				<PixelButton size="sm" variant="ghost" icon={LogOut} title={`${tr('Conta TropicaliaCraft:')} ${account.profile.nickname} · ${tr('Sair')}`} onclick={logout}><span class="lbl">{account.profile.nickname}</span></PixelButton>
			{:else}
				<PixelButton size="sm" variant="ghost" icon={LogIn} title={tr('Entrar na conta do TropicaliaCraft (a mesma do site)')} onclick={() => { pendingServerSkin = false; loginError = ''; loginOpen = true; }} />
			{/if}
			<PixelButton size="sm" variant="emerald" icon={CircleCheck} loading={busy === 'use'} title={tr('Usar esta skin no jogo do launcher e na sua conta do TropicaliaCraft')} onclick={useSkin}>USAR</PixelButton>
		</div>
	</header>

	<!-- ============================================================ panes -->
	<div class="work">
		<section class="pane pane-3d" aria-label={tr('Modelo 3D')}>
			<div class="viewport" bind:this={viewport3d}></div>
			{#if !ready}<div class="loading"><img src="/images/grass-block-side.png" alt="" class="pixel float h-10 w-10" /></div>{/if}

			<div class="float top-left">
				<div class="seg sm" role="radiogroup" aria-label={tr('Interação 3D')}>
					<button role="radio" aria-checked={mode3d === 'paint'} class:on={mode3d === 'paint'} onclick={() => setMode3d('paint')}><Brush size={13} /> {tr('Pintar')}</button>
					<button role="radio" aria-checked={mode3d === 'orbit'} class:on={mode3d === 'orbit'} onclick={() => setMode3d('orbit')}><Rotate3d size={13} /> {tr('Girar')}</button>
				</div>
			</div>
			<div class="float top-right column">
				<button class="icon-btn" onclick={() => model?.resetView()} title={tr('Centralizar câmera')} aria-label={tr('Centralizar câmera')}><Scan size={16} /></button>
				<button class="icon-btn" class:on={overlayOn} onclick={toggleOverlay} title={tr('Mostrar camada 3D (chapéu, jaqueta)')} aria-label={tr('Mostrar camada 3D')} aria-pressed={overlayOn}><Layers size={16} /></button>
				<button class="icon-btn" onclick={exportPhoto} disabled={busy === 'photo'} title={tr('Tirar foto 3D (pasta Imagens)')} aria-label={tr('Tirar foto 3D')}><Camera size={16} /></button>
			</div>

			<div class="pane-foot">
				<div class="chips" role="radiogroup" aria-label={tr('Isolar parte')}>
					{#each PARTS as part (part)}
						<button role="radio" aria-checked={focus === part} class:on={focus === part} onclick={() => setFocus(part)}>{tr(PART_LABELS[part])}</button>
					{/each}
				</div>
				<label class="pose">
					<span class="sr-only">{tr('Pose')}</span>
					<select class="tp-select" value={pose} onchange={(e) => setPose((e.currentTarget as HTMLSelectElement).value as PoseName)}>
						{#each POSES as p (p.id)}<option value={p.id}>{tr(p.label)}</option>{/each}
					</select>
				</label>
			</div>
		</section>

		<section class="pane pane-2d" aria-label={tr('Textura UV')}>
			<div class="canvas-host" bind:this={host2d}>
				<canvas
					bind:this={canvas2d}
					class="uv"
					onpointerdown={down2d}
					onpointermove={move2d}
					onpointerup={up2d}
					onpointercancel={up2d}
					onpointerleave={(e) => { if (e.pointerType === 'mouse' && !stroke) { hover = null; draw2d(); } }}
					onwheel={wheel2d}
					oncontextmenu={(e) => e.preventDefault()}
					aria-label={tr('Textura 64x64: toque para pintar, dois dedos para mover e dar zoom')}
				></canvas>
			</div>

			<div class="float top-left">
				<div class="seg sm" role="radiogroup" aria-label={tr('Camada editável')}>
					{#each LAYERS as l (l.id)}
						<button role="radio" aria-checked={layer === l.id} class:on={layer === l.id} onclick={() => (layer = l.id)}>{tr(l.label)}</button>
					{/each}
				</div>
				<button class="toggle" class:on={mirror} aria-pressed={mirror} onclick={() => (mirror = !mirror)} title={tr('Espelhar rosto e tronco (M)')}>
					<FlipHorizontal2 size={13} /> {tr('Espelho')}
				</button>
			</div>
			<div class="float top-right column">
				<button class="icon-btn" onclick={() => zoomAround(1.25)} title={tr('Aproximar')} aria-label={tr('Aproximar')}><ZoomIn size={16} /></button>
				<button class="icon-btn" onclick={() => zoomAround(0.8)} title={tr('Afastar')} aria-label={tr('Afastar')}><ZoomOut size={16} /></button>
				<button class="icon-btn" onclick={fit2d} title={tr('Encaixar na tela')} aria-label={tr('Encaixar na tela')}><Scan size={16} /></button>
				<button class="icon-btn" class:on={grid} aria-pressed={grid} onclick={() => (grid = !grid)} title={tr('Grade de pixels')} aria-label={tr('Grade de pixels')}><Grid3x3 size={16} /></button>
				<button class="icon-btn" class:on={guides} aria-pressed={guides} onclick={() => (guides = !guides)} title={tr('Guias das partes do corpo')} aria-label={tr('Guias das partes do corpo')}><Box size={16} /></button>
			</div>

			<div class="status" aria-live="polite">
				{#if hoverInfo}
					<span class="dot" style:background={hoverInfo.box.color}></span>
					<b>{hoverInfo.box.label}</b> · {hoverInfo.face?.name} · {hover?.x},{hover?.y}
				{:else}
					64 × 64 · {tr('passe o cursor para ver a parte do corpo')}
				{/if}
			</div>
		</section>
	</div>

	<!-- ============================================================ tool dock -->
	<footer class="dock">
		<div class="tools" role="radiogroup" aria-label={tr('Ferramentas')}>
			{#each TOOLS as t (t.id)}
				{@const Icon = t.icon}
				<button role="radio" aria-checked={tool === t.id} class="tool" class:on={tool === t.id} onclick={() => (tool = t.id)} title="{tr(t.label)} ({t.key})">
					<Icon size={18} />
					<span>{tr(t.label)}</span>
				</button>
			{/each}
		</div>

		<div class="colors">
			<label class="current" title={tr('Escolher cor')}>
				<span class="swatch big" style:background={color}></span>
				<input type="color" value={color} onchange={(e) => setColor((e.currentTarget as HTMLInputElement).value)} aria-label={tr('Escolher cor')} />
				<code>{color.toUpperCase()}</code>
			</label>
			<div class="palette" role="listbox" aria-label={tr('Paleta')}>
				{#each recent as c, i (c + i)}
					<button role="option" aria-selected={c === color} class="swatch" class:on={c === color} style:background={c} title={c} aria-label={c} onclick={() => setColor(c)}></button>
				{/each}
				<span class="sep" aria-hidden="true"></span>
				{#each PALETTE as c (c)}
					<button role="option" aria-selected={c === color} class="swatch" class:on={c === color} style:background={c} title={c} aria-label={c} onclick={() => setColor(c)}></button>
				{/each}
			</div>
		</div>
	</footer>
</div>

<!-- ============================================================ IA -->
<Modal bind:open={aiOpen} width={720} title={tr('Gerar skin com IA')} dismissable={busy !== 'ai'}>
	<div class="ai">
		<div class="seg wide" role="tablist">
			<button role="tab" aria-selected={aiTab === 'prompt'} class:on={aiTab === 'prompt'} onclick={() => (aiTab = 'prompt')}><Sparkles size={14} /> {tr('Descrever')}</button>
			<button role="tab" aria-selected={aiTab === 'presets'} class:on={aiTab === 'presets'} onclick={() => (aiTab = 'presets')}><Images size={14} /> {tr('Prontas')}</button>
			<button role="tab" aria-selected={aiTab === 'nick'} class:on={aiTab === 'nick'} onclick={() => (aiTab = 'nick')}><UserRound size={14} /> {tr('Por nick')}</button>
		</div>

		{#if aiTab === 'prompt'}
			<p class="tp-help">{tr('A IA do launcher roda no seu aparelho: funciona sem internet e não gasta créditos.')}</p>
			<label class="tp-label" for="ai-prompt">{tr('Descreva a skin')}</label>
			<textarea id="ai-prompt" class="tp-input prompt" rows="3" maxlength="240" bind:value={prompt}
				placeholder={tr('ex.: capivara guerreira com armadura de diamante e coroa')}
				onkeydown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void generate(); }}></textarea>
			<div class="quick">
				{#each QUICK_AI_PROMPTS as q (q)}
					<button onclick={() => (prompt = q)}>{q}</button>
				{/each}
			</div>
		{:else if aiTab === 'presets'}
			<div class="presets">
				{#each SKIN_PRESETS as p (p.id)}
					<button class="preset" disabled={!!busy} onclick={() => generate(p.prompt)}>
						<b>{p.name}</b>
						<span>{p.description}</span>
					</button>
				{/each}
			</div>
		{:else}
			<p class="tp-help">{tr('Copia a skin atual de qualquer jogador. Precisa de internet.')}</p>
			<label class="tp-label" for="ai-nick">{tr('Nick do jogador')}</label>
			<input id="ai-nick" class="tp-input" maxlength="16" autocomplete="off" bind:value={nick}
				onkeydown={(e) => e.key === 'Enter' && fetchNick()} placeholder="Notch" />
		{/if}
	</div>
	{#snippet footer()}
		<PixelButton onclick={() => (aiOpen = false)} disabled={busy === 'ai'}>{tr('Fechar')}</PixelButton>
		{#if aiTab === 'prompt'}
			<PixelButton variant="emerald" icon={Sparkles} loading={busy === 'ai'} disabled={!prompt.trim()} onclick={() => generate()}>{tr('Gerar')}</PixelButton>
		{:else if aiTab === 'nick'}
			<PixelButton variant="emerald" icon={Download} loading={busy === 'nick'} disabled={!nick.trim()} onclick={fetchNick}>{tr('Carregar')}</PixelButton>
		{/if}
	{/snippet}
</Modal>

<!-- ============================================================ gallery -->
<Modal bind:open={galleryOpen} width={760} title={tr('Minhas skins')}>
	<div class="gallery">
		<button class="card new" onclick={newSkin}>
			<span class="plus" aria-hidden="true">+</span>
			<b>{tr('Nova skin em branco')}</b>
		</button>
		{#each gallery as s (s.id)}
			<div class="card" class:current={s.id === currentId}>
				<button class="open" onclick={() => openSaved(s)} title={tr('Abrir no editor')}>
					<span class="head" style={headStyle(s.dataUrl)} aria-hidden="true"></span>
					<b>{s.name}</b>
					<small>{s.slim ? 'Alex' : 'Steve'} · {new Date(s.updated).toLocaleDateString()}</small>
				</button>
				<div class="card-actions">
					<button class="icon-btn sm" onclick={() => exportPng(s.dataUrl, `${slugify(s.name)}.png`, 'skin')} title={tr('Baixar PNG')} aria-label={tr('Baixar PNG')}><Download size={14} /></button>
					<button class="icon-btn sm danger" onclick={() => removeSaved(s)} title={tr('Excluir')} aria-label={tr('Excluir')}><Trash2 size={14} /></button>
				</div>
			</div>
		{/each}
	</div>
	{#if !gallery.length}
		<p class="tp-help mt-3">{tr('Nada salvo ainda. Use Salvar para guardar a skin neste aparelho; tudo fica disponível offline.')}</p>
	{/if}
</Modal>

<!-- ============================================================ conta TropicaliaCraft -->
<Modal bind:open={loginOpen} width={440} title={tr('Conta do TropicaliaCraft')} dismissable={busy !== 'login'} onclose={() => (pendingServerSkin = false)}>
	<form class="login" onsubmit={(e) => { e.preventDefault(); void login(); }}>
		<p class="tp-help">
			{pendingServerSkin
				? tr('A skin já está ativa no jogo do launcher. Entre com a mesma conta do site para salvá-la também no servidor (vale em todos os servidores do TropicaliaCraft).')
				: tr('Entre com a mesma conta do site para salvar suas skins no servidor.')}
		</p>
		<label class="tp-label" for="tc-login">{tr('Nick ou e-mail')}</label>
		<input id="tc-login" class="tp-input" autocomplete="username" maxlength="80" bind:value={loginUser} />
		<label class="tp-label" for="tc-pass">{tr('Senha')}</label>
		<input id="tc-pass" class="tp-input" type="password" autocomplete="current-password" bind:value={loginPass} />
		{#if loginError}<p class="login-error" role="alert">{loginError}</p>{/if}
		<button type="button" class="link" onclick={() => openUrl(REGISTER_URL)}>{tr('Não tem conta? Crie no site')}</button>
		<button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
	</form>
	{#snippet footer()}
		<PixelButton onclick={() => (loginOpen = false)} disabled={busy === 'login'}>{pendingServerSkin ? tr('Só no jogo') : tr('Fechar')}</PixelButton>
		<PixelButton variant="emerald" icon={LogIn} loading={busy === 'login'} disabled={!loginUser.trim() || !loginPass} onclick={login}>{tr('Entrar')}</PixelButton>
	{/snippet}
</Modal>

<style>
	.hidden { display: none; }
	.login { display: grid; gap: 8px; }
	.login .tp-label { margin-top: 4px; }
	.login-error { color: var(--tp-red, #f87171); font-size: 13px; }
	.login .link { justify-self: start; background: none; border: 0; padding: 4px 0; color: var(--tp-green); text-decoration: underline; cursor: pointer; font-size: 13px; }
	.studio {
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: 10px;
		padding: 12px 14px;
	}

	/* ---------------------------------------------------------------- shared controls */
	.seg {
		display: inline-flex;
		padding: 2px;
		gap: 2px;
		background: var(--tp-panel-3);
		box-shadow: 0 0 0 2px #000, inset 0 0 0 1px var(--tp-border);
		flex: none;
	}
	.seg button, .toggle, .chips button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 11px;
		border: 0;
		background: transparent;
		color: var(--tp-muted);
		font-family: var(--font-minecraft);
		font-size: 10.5px;
		letter-spacing: 0.03em;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.12s, color 0.12s;
	}
	.seg button:hover, .chips button:hover, .toggle:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }
	.seg button.on, .chips button.on, .toggle.on {
		color: #fff;
		background: var(--tp-emerald);
		box-shadow: inset 0 -2px 0 var(--tp-green-dark), inset 0 2px 0 rgba(255, 255, 255, 0.18);
		text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5);
	}
	.seg.sm button, .toggle { min-height: 30px; padding: 0 9px; font-size: 10px; }
	.seg.wide { display: flex; }
	.seg.wide button { flex: 1; justify-content: center; min-height: 38px; }
	.toggle { background: var(--tp-panel-3); box-shadow: 0 0 0 2px #000, inset 0 0 0 1px var(--tp-border); }

	.icon-btn {
		display: inline-grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: 0;
		cursor: pointer;
		color: #d5e2da;
		background: var(--tp-panel-2);
		box-shadow: inset 0 2px 0 var(--bevel-hi), inset 2px 0 0 var(--bevel-hi), inset -2px 0 0 var(--bevel-lo), inset 0 -2px 0 var(--bevel-lo), 0 0 0 2px #000;
		transition: filter 0.12s, transform 0.06s;
	}
	.icon-btn:hover:not(:disabled) { filter: brightness(1.25); }
	.icon-btn:active:not(:disabled) { transform: translateY(1px); }
	.icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
	.icon-btn.on { color: var(--tp-green); }
	.icon-btn.sm { width: 30px; height: 30px; }
	.icon-btn.danger:hover { color: var(--tp-red); }
	button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--tp-green); outline-offset: 2px; }

	/* ---------------------------------------------------------------- top bar */
	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		min-width: 0;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 36px;
		padding: 0 10px;
		min-width: 0;
		flex: 1 1 160px;
		max-width: 280px;
		background: var(--tp-panel-3);
		box-shadow: 0 0 0 2px #000, inset 0 0 0 1px var(--tp-border);
	}
	.name-input {
		min-width: 0;
		width: 100%;
		border: 0;
		background: transparent;
		color: #fff;
		font-family: var(--font-minecraft);
		font-size: 12px;
		user-select: text;
	}
	.name-input:focus-visible { outline: none; }
	.name:focus-within { box-shadow: 0 0 0 2px var(--tp-green); }
	.group { display: inline-flex; gap: 8px; }
	.view-switch { display: none; }
	.actions { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; }
	.ai-btn {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 36px;
		padding: 0 12px;
		border: 0;
		cursor: pointer;
		color: #fff7d6;
		font-family: var(--font-minecraft);
		font-size: 12px;
		text-shadow: 1px 1px 0 #000;
		background: linear-gradient(#a16207, #854d0e);
		box-shadow: inset 0 2px 0 #ca8a04, inset 0 -2px 0 #422006, 0 0 0 2px #000;
	}
	.ai-btn:hover { filter: brightness(1.15); }
	.ai-btn :global(svg) { color: #fde047; }
	.vip {
		padding: 2px 5px;
		font-size: 8.5px;
		color: #422006;
		background: #fde047;
		text-shadow: none;
		box-shadow: 0 0 0 1px #000;
	}

	/* ---------------------------------------------------------------- panes */
	.work {
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
		gap: 12px;
	}
	.pane {
		position: relative;
		min-height: 0;
		overflow: hidden;
		background:
			radial-gradient(ellipse at 50% 35%, rgba(74, 222, 128, 0.07), transparent 65%),
			var(--tp-panel-3);
		box-shadow: 0 0 0 2px #000, inset 0 0 0 1px var(--tp-border);
	}
	.viewport { position: absolute; inset: 0; }
	.viewport :global(canvas) { display: block; }
	.loading { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
	.float { position: absolute; z-index: 2; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
	.float.top-left { top: 10px; left: 10px; right: 64px; }
	.float.top-right { top: 10px; right: 10px; }
	.float.column { flex-direction: column; }
	.pane-foot {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 2;
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 8px 10px;
		background: linear-gradient(transparent, rgba(5, 8, 6, 0.92) 40%);
	}
	.chips { display: flex; gap: 4px; overflow-x: auto; flex: 1; min-width: 0; scrollbar-width: none; padding: 2px; }
	.chips::-webkit-scrollbar { display: none; }
	.chips button { background: var(--tp-panel-2); box-shadow: 0 0 0 2px #000; min-height: 30px; flex: none; }
	.pose select { min-height: 32px; height: 32px; padding-top: 0; padding-bottom: 0; font-size: 12px; width: auto; }
	.canvas-host { position: absolute; inset: 0; }
	.uv { width: 100%; height: 100%; display: block; touch-action: none; cursor: crosshair; }
	.status {
		position: absolute;
		left: 10px;
		bottom: 10px;
		right: 10px;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 6px;
		width: fit-content;
		max-width: calc(100% - 20px);
		padding: 5px 9px;
		font-size: 11.5px;
		color: #c7d5cc;
		background: rgba(5, 8, 6, 0.88);
		box-shadow: 0 0 0 1px var(--tp-border);
		pointer-events: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.status b { font-family: var(--font-minecraft); font-size: 10px; font-weight: 400; color: #fff; }
	.dot { width: 8px; height: 8px; flex: none; }

	/* ---------------------------------------------------------------- dock */
	.dock {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 8px 10px;
		min-width: 0;
		background: var(--tp-panel);
		box-shadow: 0 0 0 2px #000, inset 0 2px 0 var(--bevel-hi), inset 0 -2px 0 var(--bevel-lo);
	}
	.tools { display: flex; gap: 4px; flex: none; }
	.tool {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		min-width: 58px;
		height: 50px;
		padding: 0 6px;
		border: 0;
		cursor: pointer;
		color: var(--tp-muted);
		background: transparent;
		font-family: var(--font-minecraft);
		font-size: 8.5px;
		letter-spacing: 0.02em;
		transition: background 0.12s, color 0.12s;
	}
	.tool:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }
	.tool.on {
		color: #fff;
		background: var(--tp-panel-2);
		box-shadow: inset 0 -3px 0 var(--tp-emerald), 0 0 0 2px #000;
	}
	.tool.on :global(svg) { color: var(--tp-green); }
	.colors { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
	.current { position: relative; display: flex; align-items: center; gap: 8px; cursor: pointer; flex: none; }
	.current input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 44px; }
	.current code { font-size: 12px; color: #e6efe9; }
	.palette { display: flex; gap: 5px; overflow-x: auto; min-width: 0; padding: 3px; scrollbar-width: thin; }
	.swatch {
		width: 26px;
		height: 26px;
		flex: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		box-shadow: 0 0 0 2px #000, inset 0 0 0 1px rgba(255, 255, 255, 0.15);
		transition: transform 0.08s;
	}
	.swatch:hover { transform: translateY(-2px); }
	.swatch.on { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #000; }
	.swatch.big { width: 40px; height: 40px; }
	.sep { width: 2px; flex: none; background: var(--tp-border); margin: 2px 4px; }

	/* ---------------------------------------------------------------- AI modal */
	.ai { display: grid; gap: 12px; }
	.prompt { resize: vertical; min-height: 80px; user-select: text; }
	.quick { display: flex; flex-wrap: wrap; gap: 6px; }
	.quick button {
		padding: 6px 10px;
		font-size: 12px;
		color: #c7d5cc;
		cursor: pointer;
		border: 1px solid var(--tp-border);
		background: var(--tp-panel-2);
		text-align: left;
	}
	.quick button:hover { border-color: var(--tp-emerald); color: #fff; }
	.presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
	.preset {
		display: grid;
		gap: 4px;
		padding: 12px;
		text-align: left;
		cursor: pointer;
		border: 2px solid var(--tp-border);
		background: var(--tp-panel-2);
		color: var(--tp-text);
	}
	.preset b { font-family: var(--font-minecraft); font-weight: 400; font-size: 11px; color: #fff; }
	.preset span { font-size: 12px; color: var(--tp-muted); line-height: 1.4; }
	.preset:hover:not(:disabled) { border-color: var(--tp-emerald); }
	.preset:disabled { opacity: 0.5; cursor: wait; }

	/* ---------------------------------------------------------------- gallery */
	.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
	.card {
		position: relative;
		display: grid;
		background: var(--tp-panel-2);
		border: 2px solid var(--tp-border);
	}
	.card.current { border-color: var(--tp-emerald); }
	.card .open, .card.new {
		display: grid;
		justify-items: center;
		gap: 6px;
		padding: 14px 8px 12px;
		border: 0;
		background: transparent;
		color: var(--tp-text);
		cursor: pointer;
		text-align: center;
	}
	.card.new { border: 2px dashed var(--tp-border-strong); background: transparent; align-content: center; min-height: 150px; }
	.card.new:hover, .card:hover { border-color: var(--tp-emerald); }
	.plus { font-family: var(--font-minecraft); font-size: 28px; color: var(--tp-green); }
	.card b { font-family: var(--font-minecraft); font-weight: 400; font-size: 10.5px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.card small { font-size: 11px; color: var(--tp-muted); }
	.head {
		width: 64px;
		height: 64px;
		image-rendering: pixelated;
		background-repeat: no-repeat;
		box-shadow: 0 0 0 2px #000, 4px 4px 0 rgba(0, 0, 0, 0.35);
	}
	.card-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 6px; opacity: 0; transition: opacity 0.12s; }
	.card:hover .card-actions, .card:focus-within .card-actions { opacity: 1; }

	/* ---------------------------------------------------------------- responsive */
	@media (max-width: 1280px) {
		.lbl { display: none; }
		.tool { min-width: 46px; }
		.tool span { display: none; }
		.tool { height: 42px; }
	}
	@media (max-width: 1023px) {
		.view-switch { display: inline-flex; }
		.work { grid-template-columns: minmax(0, 1fr); }
		.studio:not(.is-2d) .pane-2d, .studio.is-2d .pane-3d { display: none; }
		.name { max-width: none; }
	}
	@media (max-width: 767px) {
		.studio { padding: 8px; gap: 8px; }
		.bar { gap: 8px; }
		.name { order: 1; flex: 1 1 100%; }
		.model-seg { order: 2; }
		.group { order: 3; }
		.view-switch { order: 4; }
		.actions { order: 5; flex: 1 1 100%; margin-left: 0; display: grid; grid-template-columns: auto repeat(4, 1fr); gap: 8px; }
		.actions :global(.px-btn) { width: 100%; justify-content: center; }
		.dock { flex-direction: column; align-items: stretch; gap: 8px; padding: 8px; }
		.tools { overflow-x: auto; justify-content: space-between; scrollbar-width: none; }
		.tool { flex: 1; min-width: 40px; height: 44px; }
		.card-actions { opacity: 1; }
		.float.top-left { right: 56px; }
	}
	@media (max-height: 560px) and (orientation: landscape) {
		.studio { padding: 6px 10px; gap: 6px; }
		.tool { height: 38px; }
		.swatch.big { width: 32px; height: 32px; }
	}
	@media (prefers-reduced-motion: reduce) {
		.swatch, .icon-btn, .tool { transition: none; }
		.swatch:hover { transform: none; }
	}
</style>
