// Touch controls shared by the Java (Pojav) and Rust (Horizon) engines.
//
// The launcher keeps one layout. Before each launch it renders every button to a PNG
// (shape, colours, pixel-art icon) and hands the same images and positions to both
// engines: Horizon reads `horizon-touch.json` plus its touch theme sprites, Pojav reads a
// zipped control map whose buttons use those images as backgrounds.
import { PIXEL_ICONS } from './data/pixelarticons';

export const CONTROL_IDS = [
	'move', 'sprint', 'jump', 'sneak', 'attack', 'use', 'chat', 'pause', 'settings',
	'inventory', 'debug', 'perspective', 'offhand', 'shield', 'keyboard'
] as const;
export type ControlId = (typeof CONTROL_IDS)[number];

/** Horizon's fixed control order (`touch::layout::Control::ALL`). */
const HORIZON_ORDER: ControlId[] = [
	'move', 'sprint', 'jump', 'sneak', 'attack', 'use', 'chat', 'pause', 'settings',
	'inventory', 'debug', 'perspective', 'offhand', 'shield'
];

export const CONTROL_LABELS: Record<ControlId, string> = {
	move: 'Movimento',
	sprint: 'Correr',
	jump: 'Pular / subir',
	sneak: 'Agachar / descer',
	attack: 'Atacar / quebrar',
	use: 'Usar / colocar',
	chat: 'Chat',
	pause: 'Pausa',
	settings: 'Ajustes de toque',
	inventory: 'Inventário',
	debug: 'Depuração (F3)',
	perspective: 'Câmera (F5)',
	offhand: 'Trocar mãos',
	shield: 'Escudo',
	keyboard: 'Teclado (Java)'
};

export type Shape = 'pixel' | 'circle' | 'rounded' | 'square';

export interface ControlStyle {
	shape: Shape;
	fill: string;
	fillOpacity: number;
	border: string;
	borderWidth: number;
	icon: string;
	pressed: string;
}

export interface ControlItem {
	x: number;
	y: number;
	/** Fraction of the screen height, like Horizon. */
	size: number;
	opacity: number;
	visible: boolean;
	icon: string;
	fill?: string;
	iconColor?: string;
}

export interface ControlsConfig {
	version: 1;
	style: ControlStyle;
	scale: number;
	items: Record<ControlId, ControlItem>;
}

export const STYLE_PRESETS: { id: string; name: string; style: ControlStyle }[] = [
	{ id: 'tropicalia', name: 'Tropicalia', style: { shape: 'pixel', fill: '#151d19', fillOpacity: 0.3, border: '#4ade80', borderWidth: 2, icon: '#e6efe9', pressed: '#15803d' } },
	{ id: 'classico', name: 'Clássico', style: { shape: 'square', fill: '#4b4b4b', fillOpacity: 0.8, border: '#e3e3e3', borderWidth: 2, icon: '#ffffff', pressed: '#252525' } },
	{ id: 'vidro', name: 'Transparente', style: { shape: 'circle', fill: '#000000', fillOpacity: 0.28, border: '#ffffff', borderWidth: 1, icon: '#ffffff', pressed: '#ffffff' } },
	{ id: 'neon', name: 'Neon', style: { shape: 'rounded', fill: '#0b0b1a', fillOpacity: 0.65, border: '#c084fc', borderWidth: 2, icon: '#60a5fa', pressed: '#7c3aed' } },
	{ id: 'sol', name: 'Pôr do sol', style: { shape: 'pixel', fill: '#2a1608', fillOpacity: 0.7, border: '#fbbf24', borderWidth: 2, icon: '#fde68a', pressed: '#b45309' } }
];

const item = (x: number, y: number, size: number, icon: string, visible = true): ControlItem => ({
	x, y, size, opacity: 0.3, visible, icon
});

/** The default template: Horizon's own layout, plus the keyboard key Java needs. */
export function defaultControls(): ControlsConfig {
	return {
		version: 1,
		style: { ...STYLE_PRESETS[0].style },
		scale: 1,
		items: {
			move: item(0.13, 0.76, 0.32, 'move'),
			sprint: item(0.72, 0.78, 0.105, 'speed-fast'),
			jump: item(0.92, 0.78, 0.16, 'arrow-big-up'),
			sneak: item(0.81, 0.86, 0.115, 'arrow-big-down'),
			attack: item(0.8, 0.64, 0.16, 'sword'),
			use: item(0.92, 0.52, 0.16, 'hand'),
			chat: item(0.46, 0.055, 0.075, 'message'),
			pause: item(0.5, 0.055, 0.075, 'pause'),
			settings: item(0.54, 0.055, 0.075, 'sliders'),
			inventory: item(0.73, 0.95, 0.075, 'backpack'),
			debug: item(0.42, 0.055, 0.075, 'bug'),
			perspective: item(0.58, 0.055, 0.075, 'camera'),
			offhand: item(0.8, 0.96, 0.075, 'repeat', false),
			shield: item(0.92, 0.36, 0.12, 'shield'),
			keyboard: item(0.38, 0.055, 0.075, 'keyboard')
		}
	};
}

/** Fills missing fields of a stored layout from the default template. */
export function normalizeControls(stored: Partial<ControlsConfig> | undefined): ControlsConfig {
	const base = defaultControls();
	if (!stored || stored.version !== 1) return base;
	const items = { ...base.items };
	for (const id of CONTROL_IDS) {
		items[id] = { ...base.items[id], ...(stored.items?.[id] ?? {}) };
		fitControl(items[id], stored.scale ?? 1);
	}
	return { version: 1, style: { ...base.style, ...(stored.style ?? {}) }, scale: stored.scale ?? 1, items };
}

export const clampSize = (size: number) => Math.min(0.45, Math.max(0.045, size));
export const clampPos = (v: number) => Math.min(0.975, Math.max(0.025, v));

/** Keep the entire button visible, including when it is enlarged near an edge. */
export function fitControl(item: ControlItem, scale = 1, aspect = landscapeAspect()) {
	const halfHeight = clampSize(item.size * scale) / 2;
	const halfWidth = halfHeight / Math.max(1, aspect);
	item.x = Math.min(1 - halfWidth, Math.max(halfWidth, item.x));
	item.y = Math.min(1 - halfHeight, Math.max(halfHeight, item.y));
}

// ---------------------------------------------------------------- drawing

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number];
}
const rgba = (hex: string, alpha: number) => {
	const [r, g, b] = hexToRgb(hex);
	return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, alpha))})`;
};
/** Android packs colours as signed 32-bit ARGB integers. */
export function argb(hex: string, alpha = 1): number {
	const [r, g, b] = hexToRgb(hex);
	const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
	return ((a << 24) | (r << 16) | (g << 8) | b) | 0;
}

function shapePath(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, s: number) {
	ctx.beginPath();
	if (shape === 'circle') {
		ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
	} else if (shape === 'rounded') {
		ctx.roundRect(x, y, s, s, s * 0.24);
	} else if (shape === 'pixel') {
		// Stepped corners, like a pixel-art button.
		const c = Math.max(2, Math.round(s / 10));
		ctx.moveTo(x + c * 2, y);
		ctx.lineTo(x + s - c * 2, y); ctx.lineTo(x + s - c * 2, y + c); ctx.lineTo(x + s - c, y + c);
		ctx.lineTo(x + s - c, y + c * 2); ctx.lineTo(x + s, y + c * 2);
		ctx.lineTo(x + s, y + s - c * 2); ctx.lineTo(x + s - c, y + s - c * 2); ctx.lineTo(x + s - c, y + s - c);
		ctx.lineTo(x + s - c * 2, y + s - c); ctx.lineTo(x + s - c * 2, y + s);
		ctx.lineTo(x + c * 2, y + s); ctx.lineTo(x + c * 2, y + s - c); ctx.lineTo(x + c, y + s - c);
		ctx.lineTo(x + c, y + s - c * 2); ctx.lineTo(x, y + s - c * 2);
		ctx.lineTo(x, y + c * 2); ctx.lineTo(x + c, y + c * 2); ctx.lineTo(x + c, y + c);
		ctx.lineTo(x + c * 2, y + c); ctx.closePath();
	} else {
		ctx.rect(x, y, s, s);
	}
}

/** Draws a pixel-art icon with whole-pixel scaling so its edges stay crisp. */
export function drawIcon(ctx: CanvasRenderingContext2D, icon: string, color: string, cx: number, cy: number, box: number) {
	const paths = PIXEL_ICONS[icon];
	if (!paths) return;
	const scale = Math.max(1, Math.floor(box / 24));
	const size = 24 * scale;
	ctx.save();
	ctx.translate(Math.round(cx - size / 2), Math.round(cy - size / 2));
	ctx.scale(scale, scale);
	ctx.fillStyle = color;
	for (const d of paths) ctx.fill(new Path2D(d));
	ctx.restore();
}

export type ButtonArt = 'normal' | 'pressed' | 'frame' | 'knob';

/** Draws one control into `ctx` at (x, y) with side `s` pixels. */
export function drawControl(
	ctx: CanvasRenderingContext2D,
	cfg: ControlsConfig,
	id: ControlId,
	art: ButtonArt,
	x: number,
	y: number,
	s: number
) {
	const st = cfg.style;
	const it = cfg.items[id];
	const fill = it.fill || st.fill;
	const iconColor = it.iconColor || st.icon;
	const border = Math.max(0, st.borderWidth) * Math.max(1, s / 64);
	const inset = border / 2;
	if (art === 'frame') {
		// The joystick base: a faint disc with a ring, whatever the button shape.
		ctx.beginPath();
		ctx.arc(x + s / 2, y + s / 2, s / 2 - inset, 0, Math.PI * 2);
		ctx.fillStyle = rgba(fill, st.fillOpacity * 0.55);
		ctx.fill();
		if (border > 0) { ctx.lineWidth = border; ctx.strokeStyle = st.border; ctx.stroke(); }
		return;
	}
	const pressed = art === 'pressed';
	shapePath(ctx, art === 'knob' ? 'circle' : st.shape, x + inset, y + inset, s - border);
	ctx.fillStyle = pressed ? rgba(st.pressed, Math.max(0.6, st.fillOpacity)) : rgba(fill, art === 'knob' ? Math.max(0.6, st.fillOpacity) : st.fillOpacity);
	ctx.fill();
	if (border > 0) { ctx.lineWidth = border; ctx.strokeStyle = st.border; ctx.stroke(); }
	if (art !== 'knob') drawIcon(ctx, it.icon, iconColor, x + s / 2, y + s / 2, s * 0.6);
}

const ART_SIZE = 144;

async function renderPng(cfg: ControlsConfig, id: ControlId, art: ButtonArt): Promise<number[]> {
	const canvas = document.createElement('canvas');
	canvas.width = ART_SIZE;
	canvas.height = ART_SIZE;
	const ctx = canvas.getContext('2d')!;
	ctx.imageSmoothingEnabled = false;
	drawControl(ctx, cfg, id, art, 0, 0, ART_SIZE);
	const blob = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem do botão'))), 'image/png')
	);
	return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

// ---------------------------------------------------------------- engine formats

/** Horizon's theme sprite name for a control (see `touch::theme_button`). */
const HORIZON_THEME: Partial<Record<ControlId, string>> = {
	sprint: 'sprint', jump: 'jump', sneak: 'sneak', attack: 'attack', use: 'use', chat: 'chat',
	pause: 'pause', settings: 'settings', inventory: 'inventory', debug: 'debug',
	perspective: 'perspective', offhand: 'offhand', shield: 'shield'
};

function horizonTouch(cfg: ControlsConfig) {
	const placements = HORIZON_ORDER.map((id) => {
		const it = cfg.items[id];
		return { center: [clampPos(it.x), clampPos(it.y)], size: clampSize(it.size * cfg.scale), opacity: it.opacity };
	});
	return {
		layouts: [placements, placements, placements],
		button_visibility: HORIZON_ORDER.map((id) => (cfg.items[id].visible ? 0 : 2)),
		sprint_button: cfg.items.sprint.visible,
		offhand_button: cfg.items.offhand.visible,
		shield_button: cfg.items.shield.visible
	};
}

// Android key codes and Pojav's special buttons.
const KEY = { space: 62, shift: 59, ctrl: 113, e: 33, t: 48, escape: 111, f3: 133, f5: 135, f: 34 };
const SPECIAL = { keyboard: -1, mousePri: -3, mouseSec: -4, menu: -9 };
const POJAV_BUTTONS: Partial<Record<ControlId, { keys: number[]; toggle?: boolean; menu?: boolean }>> = {
	sprint: { keys: [KEY.ctrl] },
	jump: { keys: [KEY.space] },
	sneak: { keys: [KEY.shift], toggle: true },
	attack: { keys: [SPECIAL.mousePri] },
	use: { keys: [SPECIAL.mouseSec] },
	chat: { keys: [KEY.t], menu: true },
	pause: { keys: [KEY.escape], menu: true },
	settings: { keys: [SPECIAL.menu], menu: true },
	inventory: { keys: [KEY.e], menu: true },
	debug: { keys: [KEY.f3], menu: true },
	perspective: { keys: [KEY.f5] },
	offhand: { keys: [KEY.f] },
	shield: { keys: [SPECIAL.mouseSec] },
	keyboard: { keys: [SPECIAL.keyboard], menu: true }
};

/** Pojav control map (format version 9). `heightDp` is the landscape screen height. */
function pojavLayout(cfg: ControlsConfig, heightDp: number) {
	const base = (id: ControlId) => {
		const it = cfg.items[id];
		const side = Math.round(clampSize(it.size * cfg.scale) * heightDp);
		return {
			name: '',
			dynamicX: `\${screen_width} * ${clampPos(it.x).toFixed(4)} - \${width} / 2`,
			dynamicY: `\${screen_height} * ${clampPos(it.y).toFixed(4)} - \${height} / 2`,
			width: side,
			height: side,
			opacity: it.opacity,
			isToggle: false,
			passThruEnabled: false,
			isSwipeable: false,
			cornerRadius: 0,
			strokeWidth: 0,
			bgColor: 0,
			strokeColor: 0
		};
	};
	const buttons = Object.entries(POJAV_BUTTONS)
		.filter(([id]) => cfg.items[id as ControlId].visible)
		.map(([id, b]) => ({
			...base(id as ControlId),
			keycodes: [...b!.keys, 0, 0, 0].slice(0, 4),
			isToggle: !!b!.toggle,
			displayInGame: true,
			displayInMenu: !!b!.menu,
			bitmapTag: `${id}.png`
		}));
	const st = cfg.style;
	const joysticks = cfg.items.move.visible
		? [{
			...base('move'),
			keycodes: [0, 0, 0, 0],
			bgColor: argb(cfg.items.move.fill || st.fill, st.fillOpacity * 0.55),
			strokeColor: argb(st.border),
			strokeWidth: Math.max(0, st.borderWidth),
			cornerRadius: 100,
			displayInGame: true,
			displayInMenu: false,
			forwardLock: false,
			absolute: false
		}]
		: [];
	return { version: 9, scaledAt: 100, mControlDataList: buttons, mDrawerDataList: [], mJoystickDataList: joysticks };
}

export interface ControlsBundle {
	horizon: ReturnType<typeof horizonTouch>;
	pojav: ReturnType<typeof pojavLayout>;
	images: { horizon: { name: string; png: number[] }[]; pojav: { name: string; png: number[] }[] };
}

/** Everything the engines need, rendered from one layout. */
export async function buildControlsBundle(cfg: ControlsConfig, heightDp: number): Promise<ControlsBundle> {
	const horizonImages: { name: string; png: number[] }[] = [];
	const pojavImages: { name: string; png: number[] }[] = [];
	for (const id of CONTROL_IDS) {
		if (id === 'move') continue;
		const normal = await renderPng(cfg, id, 'normal');
		pojavImages.push({ name: `${id}.png`, png: normal });
		const theme = HORIZON_THEME[id];
		if (theme) {
			horizonImages.push({ name: `${theme}_normal.png`, png: normal });
			horizonImages.push({ name: `${theme}_pressed.png`, png: await renderPng(cfg, id, 'pressed') });
		}
	}
	horizonImages.push({ name: 'joystick_frame_normal.png', png: await renderPng(cfg, 'move', 'frame') });
	horizonImages.push({ name: 'joystick_knob_normal.png', png: await renderPng(cfg, 'move', 'knob') });
	return {
		horizon: horizonTouch(cfg),
		pojav: pojavLayout(cfg, heightDp),
		images: { horizon: horizonImages, pojav: pojavImages }
	};
}

/** Landscape screen height in CSS pixels (= dp on Android). */
export function landscapeHeightDp(): number {
	if (typeof screen === 'undefined') return 400;
	return Math.max(240, Math.min(screen.width, screen.height));
}
export function landscapeAspect(): number {
	if (typeof screen === 'undefined') return 19.5 / 9;
	const a = Math.max(screen.width, screen.height) / Math.max(1, Math.min(screen.width, screen.height));
	return Number.isFinite(a) && a > 1 ? a : 19.5 / 9;
}
